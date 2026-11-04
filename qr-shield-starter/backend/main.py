from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from urllib.parse import urlparse
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import logging, sqlite3, json, re, math, io, ipaddress, hashlib, os
from datetime import datetime, timezone
import cv2
import numpy as np
import joblib
import xgboost as xgb
from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env")
DB_PATH = APP_DIR / "qrshield.db"
MODEL_DIR = Path(os.getenv("QRSHIELD_MODEL_DIR", APP_DIR.parents[1] / "models"))
MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/bmp"}
app = FastAPI(title="QR-Shield API", version="1.0.0", description="QR code decoding and explainable baseline risk analysis")
logger = logging.getLogger("qrshield")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "QRSHIELD_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

URL_MODEL: xgb.Booster | None = None
URL_MODEL_FEATURES: list[str] = []
URL_MODEL_ERROR: str | None = None


def load_url_model():
    global URL_MODEL, URL_MODEL_FEATURES, URL_MODEL_ERROR
    model_path = MODEL_DIR / "xgboost_url_model.json"
    features_path = MODEL_DIR / "url_feature_names.joblib"
    if not model_path.is_file() or not features_path.is_file():
        URL_MODEL_ERROR = "URL model artifacts are not installed."
        logger.warning("URL model artifacts are missing from %s.", MODEL_DIR)
        return
    try:
        features = joblib.load(features_path)
        if not isinstance(features, list) or not features or not all(
            isinstance(name, str) and name for name in features
        ):
            raise ValueError("The URL model feature artifact must contain a non-empty list of feature names.")
        if len(features) != len(set(features)):
            raise ValueError("The URL model feature artifact contains duplicate feature names.")
        metrics_path = MODEL_DIR.parent / "reports" / "url_model_metrics.json"
        if not metrics_path.is_file():
            raise ValueError("The URL model evaluation metadata is missing.")
        with metrics_path.open(encoding="utf-8") as metrics_file:
            metrics = json.load(metrics_file)
        if metrics.get("target_mapping") != {"0": "legitimate", "1": "phishing"}:
            raise ValueError("The URL model metadata does not verify that class 1 is phishing.")
        if metrics.get("feature_names") != features:
            raise ValueError("The URL model feature list does not match the training metadata.")
        model = xgb.Booster()
        model.load_model(str(model_path))
        if model.num_features() != len(features):
            raise ValueError(
                f"Model expects {model.num_features()} features but the feature artifact lists {len(features)}."
            )
        if model.feature_names and model.feature_names != features:
            raise ValueError("The model's feature order does not match the saved feature artifact.")
        URL_MODEL = model
        URL_MODEL_FEATURES = features
        URL_MODEL_ERROR = None
        logger.info("Loaded URL XGBoost model with %d features from %s.", len(features), model_path)
    except Exception as error:
        URL_MODEL = None
        URL_MODEL_FEATURES = []
        URL_MODEL_ERROR = "The URL XGBoost model could not be loaded. Check backend logs."
        logger.exception("Could not load URL model artifacts from %s: %s", MODEL_DIR, error)


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

@app.on_event("startup")
def startup():
    load_url_model()
    with db() as con:
        con.execute('''CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, filename TEXT,
            payload TEXT, verdict TEXT NOT NULL, risk_score INTEGER NOT NULL,
            url_score INTEGER, image_note TEXT, reasons TEXT NOT NULL, image_hash TEXT
        )''')

class URLRequest(BaseModel):
    url: str = Field(min_length=1)


class FeatureRequest(BaseModel):
    features: dict[str, float] = Field(
        description="Complete set of the trained model's precomputed website features."
    )


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


def chat_configuration_status():
    load_dotenv(APP_DIR / ".env")
    endpoint = os.getenv("QRSHIELD_CHAT_API_URL", "").strip()
    model = os.getenv("QRSHIELD_CHAT_MODEL", "").strip()
    configured = bool(endpoint and model)
    if not configured:
        return {
            "available": False,
            "reason": "Run .\\setup-saathi.ps1 from the QR-Shield folder, create a Gemini API key at https://aistudio.google.com/apikey, and restart with npm run dev:full.",
        }

    parsed = urlparse(endpoint)
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        tags_url = f"http://{parsed.netloc}/api/tags"
        try:
            with urlopen(tags_url, timeout=0.75) as response:
                tags = json.loads(response.read(256 * 1024))
            installed_models = {
                installed.get("name")
                for installed in tags.get("models", [])
                if isinstance(installed, dict)
            }
            if model not in installed_models and f"{model}:latest" not in installed_models:
                return {
                    "available": False,
                    "reason": f"The local model {model} is not installed. Run ollama pull {model}.",
                }
        except (URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError):
            return {
                "available": False,
                "reason": "The local AI service is not responding. Start Ollama, then retry.",
            }

    return {
        "available": True,
        "reason": None,
    }


def entropy(s: str) -> float:
    if not s: return 0.0
    return -sum((s.count(c)/len(s))*math.log2(s.count(c)/len(s)) for c in set(s))


def analyze_url(raw: str):
    reasons, checks, score = [], [], 0
    value = raw.strip()
    controls_present = any(ord(character) < 32 or ord(character) == 127 for character in value)
    if controls_present:
        value = re.sub(r"[\x00-\x20\x7f]+", "", value)

    has_explicit_scheme = bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value))
    has_non_web_scheme = bool(
        re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value)
        and not re.match(r"^[^/:]+:\d+(?:/|$)", value)
        and not value.startswith("//")
    )
    candidate = value if has_explicit_scheme or has_non_web_scheme else (
        "https:" + value if value.startswith("//") else "https://" + value
    )
    try:
        parsed = urlparse(candidate)
        host = (parsed.hostname or "").lower()
        try:
            port = parsed.port
            invalid_port = False
        except ValueError:
            port = None
            invalid_port = True
    except ValueError:
        parsed, host, port, invalid_port = None, "", None, True

    def add_check(category, title, status, detail, points=0):
        nonlocal score
        score += points
        checks.append({
            "category": category,
            "title": title,
            "status": status,
            "detail": detail,
        })
        if status == "flagged":
            reasons.append(detail)

    if controls_present:
        add_check("URL format", "Control characters", "flagged",
                  "The URL contains control characters that can be used to obscure how a link is displayed.", 15)

    if parsed is None:
        add_check("URL format", "URL structure", "flagged",
                  "The URL could not be parsed safely; check its brackets, authority, and port.", 65)
        scheme = ""
    else:
        scheme = parsed.scheme.lower()
        if scheme not in ("http", "https"):
            add_check("Connection", "Web protocol", "flagged",
                      "The link does not use the standard HTTP or HTTPS web protocol.", 35)
        elif scheme == "http":
            add_check("Connection", "Transport security", "flagged",
                      "The URL uses HTTP rather than encrypted HTTPS.", 8)
        elif not has_explicit_scheme:
            add_check("Connection", "Transport security", "info",
                      "No protocol was supplied; HTTPS was assumed for URL analysis.")
        else:
            add_check("Connection", "Transport security", "clear",
                      "The URL uses HTTPS. Encryption does not establish that a site is trustworthy.")

    valid_host = False
    is_ip = False
    ascii_host = ""
    if host:
        try:
            ipaddress.ip_address(host)
            is_ip = True
            valid_host = True
        except ValueError:
            try:
                ascii_host = host.encode("idna").decode("ascii").rstrip(".")
                labels = ascii_host.split(".")
                valid_host = (
                    len(ascii_host) <= 253
                    and all(
                        0 < len(label) <= 63
                        and re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", label)
                        for label in labels
                    )
                )
            except UnicodeError:
                valid_host = False

    if not valid_host:
        add_check("Destination", "Hostname format", "flagged",
                  "The destination does not contain a valid, parseable hostname.", 65)
    elif is_ip:
        add_check("Destination", "IP-address destination", "flagged",
                  "The destination uses a raw IP address instead of a recognizable domain name.", 25)
    else:
        add_check("Destination", "Hostname format", "clear",
                  "The hostname has a valid domain-style format; this does not verify ownership or reputation.")

    if parsed is not None and "@" in parsed.netloc:
        add_check("URL structure", "Embedded credentials", "flagged",
                  "An @ symbol appears in the URL authority and can disguise which hostname the browser will open.", 25)

    unicode_host = any(ord(character) > 127 for character in host)
    punycode_host = bool(re.search(r"(?:^|\.)xn--", ascii_host or host))
    if punycode_host or unicode_host:
        add_check("Destination", "Internationalized hostname", "flagged",
                  "The hostname uses internationalized or punycode characters; check carefully for look-alike letters.", 12)

    if invalid_port:
        add_check("URL structure", "Port number", "flagged",
                  "The URL contains an invalid or out-of-range port number.", 25)
    elif port is not None and port not in (80, 443, 8080, 8443):
        add_check("URL structure", "Non-standard port", "flagged",
                  f"The URL specifies the non-standard port {port}; verify that this is expected.", 8)
    elif port in (8080, 8443):
        add_check("URL structure", "Alternate web port", "info",
                  f"The URL uses alternate web port {port}; confirm this is expected for the service.")
    else:
        add_check("URL structure", "Port number", "clear",
                  "No unusual destination port was identified.")

    host_for_counts = ascii_host or host
    subdomain_count = max(0, host_for_counts.count(".") - 1)
    if valid_host and not is_ip and len(host_for_counts) > 45:
        add_check("Destination", "Hostname length", "flagged",
                  "The hostname is unusually long and may be difficult to inspect.", 8)
    elif valid_host and not is_ip:
        add_check("Destination", "Hostname length", "clear",
                  "The hostname is within the usual length range.")
    if valid_host and not is_ip and subdomain_count >= 4:
        add_check("Destination", "Subdomain depth", "flagged",
                  "The hostname has several subdomain levels, so inspect the registered domain carefully.", 8)
    elif valid_host and not is_ip:
        add_check("Destination", "Subdomain depth", "clear",
                  "The hostname does not use an unusually deep subdomain chain.")

    if len(value) > 200:
        add_check("URL structure", "URL length", "flagged",
                  "The URL is unusually long and may make its true destination harder to review.", 8)
    elif len(value) > 100:
        add_check("URL structure", "URL length", "info",
                  "The URL is longer than 100 characters; check the full address before opening it.", 3)
    else:
        add_check("URL structure", "URL length", "clear",
                  "The URL is within the usual length range.")

    if valid_host and not is_ip and host_for_counts.count("-") >= 4:
        add_check("Destination", "Hostname punctuation", "flagged",
                  "The hostname contains many hyphens, which can make deceptive names harder to spot.", 8)

    shorteners = {
        "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
        "buff.ly", "rebrand.ly", "shorturl.at", "cutt.ly", "lnkd.in",
    }
    is_shortener = any(host == domain or host.endswith("." + domain) for domain in shorteners)
    if is_shortener:
        add_check("Destination", "Link shortener", "flagged",
                  "This hostname belongs to a known link-shortening service, which obscures the eventual destination.", 8)

    keywords = ["login", "verify", "secure", "update", "password", "wallet", "claim", "gift", "banking", "confirm", "urgent"]
    found = [keyword for keyword in keywords if keyword in value.lower()]
    if found:
        add_check("Content clues", "Sensitive-action wording", "flagged",
                  "Potentially deceptive wording appears in the URL: " + ", ".join(found) + ".", min(15, len(found) * 4))
    else:
        add_check("Content clues", "Sensitive-action wording", "clear",
                  "No common credential, payment, or urgency terms were found in the URL.")

    if parsed is not None and re.search(r"%(?:25|2e|2f|5c|40|00|0[ad])", parsed.path + parsed.query, re.I):
        add_check("URL structure", "Encoded characters", "flagged",
                  "The URL contains encoded separators or control characters that can obscure its structure.", 8)
    else:
        add_check("URL structure", "Encoded characters", "clear",
                  "No commonly obfuscated URL separators were identified.")

    if valid_host and entropy(host_for_counts) > 3.7 and len(host_for_counts) > 18:
        add_check("Destination", "Hostname character pattern", "flagged",
                  "The hostname has high character diversity; this is a weak signal and can occur on legitimate sites.", 8)

    if parsed is not None:
        redirect_keys = {"next", "url", "redirect", "redirect_url", "return", "returnto", "continue"}
        query_keys = {
            key.lower()
            for item in parsed.query.split("&") if item
            for key in [item.split("=", 1)[0]]
        }
        if query_keys & redirect_keys:
            add_check("URL structure", "Redirect-style parameter", "info",
                      "A redirect-style query parameter is present; this alone does not confirm an unsafe redirect.")

    add_check("Threat intelligence", "Malware and phishing reputation", "unavailable",
              "No live threat-intelligence or blocklist service is configured.")
    add_check("Destination behavior", "Redirect chain and page content", "unavailable",
              "The destination was not opened; redirects, page contents, and HTTP status were not checked.")
    add_check("Domain intelligence", "DNS, ownership, and domain age", "unavailable",
              "DNS, registration age, hosting location, and domain ownership were not looked up.")
    add_check("Domain intelligence", "Hosting and mail configuration", "unavailable",
              "IP address and geolocation, hosting provider, web server, page size, parked/free-hosting status, and SPF/DMARC records were not checked.")

    score = min(score, 100)
    if not reasons: reasons.append("No obvious lexical red flags were found by the baseline checks. This does not prove the destination is safe.")
    has_warnings = any(check["status"] == "flagged" for check in checks)
    verdict = "High heuristic risk" if score >= 60 else "Some risk indicators" if score >= 25 or has_warnings else "No obvious risk detected"
    return {
        "score": score,
        "risk_level": "high" if score >= 60 else "elevated" if score >= 25 else "low",
        "has_warnings": has_warnings,
        "verdict": verdict,
        "reasons": reasons,
        "checks": checks,
        "analysis_scope": "Local URL structure and lexical signals only; no network lookups were performed.",
        "features": {
            "hostname_length": len(host),
            "url_length": len(value),
            "subdomain_count": subdomain_count,
            "uses_https": scheme == "https",
            "raw_ip_host": is_ip,
            "hostname_valid": valid_host,
            "punycode_or_unicode_host": punycode_host or unicode_host,
            "explicit_port": port,
            "link_shortener": is_shortener,
            "keyword_matches": found,
            "hostname_entropy": round(entropy(host_for_counts), 2),
        },
    }


def save_scan(filename, payload, verdict, risk, url_score, image_note, reasons, image_hash=None):
    created = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with db() as con:
        cur = con.execute("INSERT INTO scans(created_at,filename,payload,verdict,risk_score,url_score,image_note,reasons,image_hash) VALUES(?,?,?,?,?,?,?,?,?)", (created, filename, payload, verdict, risk, url_score, image_note, json.dumps(reasons), image_hash))
        sid = cur.lastrowid
    return {"id": sid, "created_at": created, "filename": filename, "payload": payload, "verdict": verdict, "risk_score": risk, "url_score": url_score, "image_note": image_note, "reasons": reasons}


def scan_result(image_bytes: bytes, filename: str):
    try:
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "This file is not a valid supported image.")
    if pil.width * pil.height > 25_000_000:
        raise HTTPException(413, "Image dimensions are too large. Please use an image under 25 megapixels.")
    arr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    detector = cv2.QRCodeDetector()
    payload, points, _ = detector.detectAndDecode(arr)
    if not payload:
        # Decode failure is not itself proof of tampering; save a useful report.
        note = "No decodable QR code was found. Try a sharper, well-lit image with the full code visible."
        return save_scan(filename, None, "Unable to decode", 50, None, note, [note], hashlib.sha256(image_bytes).hexdigest())
    url_info = analyze_url(payload) if payload.lower().startswith(("http://", "https://")) or "." in payload else {"score": 15, "risk_level": "low", "verdict": "Some risk indicators", "reasons": ["The QR payload is not a standard HTTP(S) URL; inspect it before use."], "checks": [], "analysis_scope": "The QR payload is not a standard web URL.", "features": {"url_payload": False}}
    # This is deliberately a transparent baseline, not a trained image classifier.
    gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    image_reasons = []
    if points is None:
        image_note = "QR decoded, but the detector did not return geometry for structural checks. No trained tampering model is configured."
    else:
        image_note = "QR geometry detected. Basic image quality checks ran; sticker/overlay detection requires a trained tampering model."
    if blur < 20:
        image_reasons.append("The image appears blurry; visual integrity checks may be unreliable.")
    if min(pil.size) < 120:
        image_reasons.append("The image is small; inspect the original QR code before trusting it.")
    reasons = url_info["reasons"] + image_reasons
    # Conservative combined score; image quality is a warning, not a tampering verdict.
    risk = min(100, round(url_info["score"] + (8 if image_reasons else 0)))
    has_url_warnings = any(check["status"] == "flagged" for check in url_info.get("checks", []))
    verdict = "High heuristic risk" if risk >= 60 else "Some risk indicators" if risk >= 25 or has_url_warnings or image_reasons else "No obvious risk detected"
    if "No obvious risk detected" == verdict:
        reasons.append("Baseline checks found no obvious red flags. This is not a guarantee of safety.")
    result = save_scan(filename, payload, verdict, risk, url_info["score"], image_note, reasons, hashlib.sha256(image_bytes).hexdigest())
    result["url_analysis"] = url_info
    result["image_analysis"] = {"status": "basic_checks_only", "note": image_note, "blur_score": round(blur, 2), "width": pil.width, "height": pil.height, "trained_model_loaded": False}
    result["safety_note"] = "Do not open the decoded link just because the result appears low risk. This prototype does not query live reputation services and is not a guarantee of safety."
    return result

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "QR-Shield API",
        "chat_status": chat_configuration_status(),
        "model_status": {
            "url_model": {
                "available": URL_MODEL is not None,
                "type": "XGBoost phishing classifier for precomputed website features",
                "feature_count": len(URL_MODEL_FEATURES),
                "feature_names": URL_MODEL_FEATURES,
                "supports_raw_url": False,
                "error": URL_MODEL_ERROR,
            },
            "url_baseline": "available",
            "qr_image_classifier": {
                "available": False,
                "reason": "No trained QR image classifier artifact is configured.",
            },
        },
    }

@app.post("/api/scan")
async def scan(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Unsupported file type. Upload PNG, JPG, WEBP, or BMP.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES: raise HTTPException(413, "Image is larger than 8 MB.")
    return scan_result(data, Path(file.filename or "qr-image").name)

@app.post("/api/analyze-url")
def analyze_url_endpoint(body: URLRequest):
    if len(body.url) > 2048: raise HTTPException(400, "URL must be 2048 characters or fewer.")
    if not body.url.strip(): raise HTTPException(422, "URL cannot be empty.")
    if any(ord(character) < 32 or ord(character) == 127 for character in body.url):
        raise HTTPException(422, "URL cannot contain control characters.")
    try:
        body.url.encode("utf-8")
    except UnicodeEncodeError as error:
        raise HTTPException(422, "URL must contain valid Unicode text.") from error
    result = analyze_url(body.url)
    saved = save_scan("Manual URL entry", body.url, result["verdict"], result["score"], result["score"], "URL-only analysis; no QR image was supplied.", result["reasons"])
    saved["url_analysis"] = result
    return saved


def request_saathi_reply(messages: list[ChatMessage]) -> str:
    load_dotenv(APP_DIR / ".env")
    endpoint = os.getenv("QRSHIELD_CHAT_API_URL", "").strip()
    model = os.getenv("QRSHIELD_CHAT_MODEL", "").strip()
    api_key = os.getenv("QRSHIELD_CHAT_API_KEY", "").strip()
    if not endpoint or not model:
        raise HTTPException(
            503,
            "Saathi is not configured. Set QRSHIELD_CHAT_API_URL and QRSHIELD_CHAT_MODEL in the backend environment, then restart the backend.",
        )

    parsed = urlparse(endpoint)
    local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if not parsed.hostname or (parsed.scheme != "https" and not local_http):
        raise HTTPException(503, "Saathi requires an HTTPS API endpoint (HTTP is allowed for localhost development).")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Saathi, QR-Shield's helpful general-purpose AI assistant. Answer questions across everyday "
                    "topics, education, writing, technology, and QR safety; do not refuse simply because a question is "
                    "outside QR security. Be accurate, friendly, and direct, and provide enough detail to be useful. "
                    "Ask a brief clarifying question only when necessary. Be transparent about uncertainty and about not "
                    "having live web browsing: never claim to have researched current information, opened a link, checked "
                    "a source, or verified a fact in real time. Never invent citations; when asked for sources, provide "
                    "reliable source names and URLs only when you can do so confidently, and say when a current source "
                    "needs verification. For QR-safety questions, explain that this prototype's URL checks are heuristic "
                    "and do not prove safety; do not claim a URL was visited or checked against live reputation services."
                ),
            },
            *[message.model_dump() for message in messages[-12:]],
        ],
        "temperature": 0.4,
        "max_tokens": 1200,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urlopen(request, timeout=45) as response:
            result = json.loads(response.read(1024 * 1024))
    except HTTPError as error:
        logger.warning("Saathi provider returned HTTP %s.", error.code)
        raise HTTPException(502, "Saathi's AI provider rejected the request. Check the backend model/API configuration.") from error
    except (URLError, TimeoutError) as error:
        logger.warning("Saathi provider could not be reached: %s", error)
        raise HTTPException(502, "Saathi could not reach its AI provider. Check the backend endpoint and network connection.") from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        logger.exception("Saathi provider returned invalid JSON.")
        raise HTTPException(502, "Saathi's AI provider returned an invalid response.") from error

    try:
        reply = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        logger.exception("Saathi provider response did not match the OpenAI chat-completions format.")
        raise HTTPException(502, "Saathi's AI provider returned an unsupported response format.") from error
    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(502, "Saathi's AI provider returned an empty response.")
    return reply.strip()[:4000]


@app.post("/api/chat")
def saathi_chat(body: ChatRequest):
    if not any(message.role == "user" for message in body.messages):
        raise HTTPException(422, "Include at least one user message.")
    return {"reply": request_saathi_reply(body.messages)}


@app.post("/api/predict-features")
def predict_features(body: FeatureRequest):
    if URL_MODEL is None:
        raise HTTPException(503, URL_MODEL_ERROR or "The URL model is unavailable.")
    supplied = set(body.features)
    expected = set(URL_MODEL_FEATURES)
    missing = sorted(expected - supplied)
    unexpected = sorted(supplied - expected)
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"Missing model features: {', '.join(missing)}.")
        if unexpected:
            details.append(f"Unexpected features: {', '.join(unexpected)}.")
        raise HTTPException(422, " ".join(details))

    values = []
    for name in URL_MODEL_FEATURES:
        value = body.features[name]
        if not math.isfinite(value) or value not in (-1, 0, 1):
            raise HTTPException(422, f"Feature {name!r} must be one of -1, 0, or 1.")
        values.append(value)

    prediction = float(
        URL_MODEL.predict(
            xgb.DMatrix(
                np.asarray([values], dtype=np.float32),
                feature_names=URL_MODEL_FEATURES,
            )
        )[0]
    )
    if not math.isfinite(prediction) or not 0 <= prediction <= 1:
        raise HTTPException(500, "The URL model returned an invalid phishing probability.")

    risk_score = round(prediction * 100)
    verdict = "Malicious" if risk_score >= 60 else "Suspicious" if risk_score >= 25 else "No obvious risk detected"
    return {
        "model": "xgboost_url_model",
        "prediction_target": "phishing",
        "phishing_probability": round(prediction, 6),
        "risk_score": risk_score,
        "verdict": verdict,
        "feature_count": len(values),
        "raw_url_inference": False,
        "note": "Prediction uses the complete precomputed website-feature vector. The model does not accept a raw URL.",
    }

@app.get("/api/history")
def history(q: str = "", verdict: str = "", limit: int = 100):
    limit = max(1, min(limit, 200))
    sql = "SELECT * FROM scans WHERE (payload LIKE ? OR filename LIKE ?) AND verdict LIKE ? ORDER BY id DESC LIMIT ?"
    with db() as con: rows = con.execute(sql, (f"%{q}%", f"%{q}%", f"%{verdict}%", limit)).fetchall()
    return [{**dict(r), "reasons": json.loads(r["reasons"])} for r in rows]

@app.get("/api/history/{scan_id}")
def get_scan(scan_id: int):
    with db() as con: row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    if not row: raise HTTPException(404, "Scan not found")
    return {**dict(row), "reasons": json.loads(row["reasons"])}

@app.delete("/api/history/{scan_id}")
def delete_scan(scan_id: int):
    with db() as con: cur = con.execute("DELETE FROM scans WHERE id=?", (scan_id,))
    if cur.rowcount == 0: raise HTTPException(404, "Scan not found")
    return {"deleted": True, "id": scan_id}

@app.get("/api/stats")
def stats():
    with db() as con:
        total = con.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
        suspicious = con.execute("SELECT COUNT(*) FROM scans WHERE verdict IN ('Suspicious','Malicious','Some risk indicators','High heuristic risk')").fetchone()[0]
        malicious = con.execute("SELECT COUNT(*) FROM scans WHERE verdict='Malicious'").fetchone()[0]
        recent = con.execute("SELECT * FROM scans ORDER BY id DESC LIMIT 5").fetchall()
    return {"total_scans": total, "flagged_scans": suspicious, "malicious_scans": malicious, "recent": [{**dict(r), "reasons": json.loads(r["reasons"])} for r in recent]}
