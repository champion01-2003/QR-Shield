# QR-Shield — local working starter

A responsive QR safety website with a FastAPI backend for QR decoding, baseline URL risk indicators, local SQLite scan history, and JSON report export.

## Important scope note
This starter performs real QR image decoding with OpenCV and transparent local URL-structure checks. It loads the trained XGBoost artifact for its original **30 precomputed website features** through a separate model endpoint, but does not derive those features from a raw URL. Raw URL and QR scans therefore use local heuristics, not that ML model. The report checks URL format, protocol, hostname, credentials, ports, link shorteners, suspicious wording, and encoded separators. It explicitly marks live malware/phishing reputation, redirects/page content, DNS, registration age, and hosting checks as unavailable. Submitted URLs are never fetched by the scanner. No ResNet-18 image model, live WHOIS/DNS/HTTP reputation lookups, or SHAP explanations are configured. Image checks are basic quality checks only; they are not sticker/overlay classification. Do not describe the baseline as an ML result or claim the thesis's reported accuracy.

## Requirements
- Python 3.10–3.12 recommended
- Node.js 20 LTS or newer and npm
- VS Code (optional)

## 1. Start the backend (Windows PowerShell)
Open PowerShell in the project folder:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation, use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate again. Or use `.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.venv\Scripts\python.exe -m uvicorn main:app --reload` without activation.

Backend health check: http://127.0.0.1:8000/api/health
Interactive API docs: http://127.0.0.1:8000/docs

From the repository root, `npm run dev:full` starts the backend and frontend in separate PowerShell windows and selects an available backend port.

## 2. Start the frontend
Open a **second** terminal and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally http://localhost:5173. Keep both terminals running.

The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`. If the backend uses another port, set `QRSHIELD_API_TARGET` before starting Vite. For a separately hosted frontend, set `VITE_API_URL` in `frontend/.env.local` and set `QRSHIELD_CORS_ORIGINS` on the backend to the frontend's exact origin(s), comma-separated.

## Features
- Long-form responsive landing page with QR inspection, tampering guidance, FAQ, pricing, and footer sections
- Responsive grouped navigation and QR-safety article guides
- First-visit cookie notice that explains essential browser storage; no analytics or advertising cookies are configured
- QR image upload, drag-and-drop, clipboard paste, and mobile photo capture with type and size validation
- OpenCV QR decoding without opening the destination
- Explainable, multi-category local URL checks with an itemized risk score and unavailable-service notices
- Optional comparison of a decoded hostname against an expected organization domain
- Basic image quality notes, clearly distinguished from trained tampering detection
- Expandable scan evidence with categorized URL checks, heuristic inputs, unavailable external checks, and basic image dimensions/blur score
- URL-only analysis
- Local scan activity totals sourced from the backend
- Latest five SQLite scan-history entries, with recorded verdicts, scores, destinations, and reasons
- Loaded XGBoost feature model with validated feature order and phishing class mapping
- Saathi general-purpose AI chat (including QR safety) through an operator-configured OpenAI-compatible backend API
- Browser-generated PDF inspection reports
- Original local SVG illustrations and an educational parking-sticker scenario
- Research links to the FBI/IC3 and CISA public safety guidance; no fabricated thesis results
- A thesis-alignment page separating documented research goals from capabilities verified in this starter
- FastAPI `/docs` endpoint

## API endpoints
- `GET /api/health`
- `GET /api/stats`
- `POST /api/scan` (multipart form field `file`)
- `POST /api/analyze-url` (JSON `{ "url": "https://example.com" }`)
- `POST /api/predict-features` (JSON object containing the complete 30-feature vector; this is not a raw URL endpoint)
- `POST /api/chat` (JSON `{"messages":[{"role":"user","content":"..."}]}`; proxies chat to the configured AI provider)
- `GET /api/history`
- `GET /api/history/{scan_id}`
- `DELETE /api/history/{scan_id}`

Run backend tests from `backend` with `.venv\Scripts\python.exe -m unittest discover -s tests -v`.

## Saathi chat configuration
Saathi can answer general questions as well as QR-safety questions. It uses an OpenAI-compatible chat-completions API and does not have live web browsing. **Recommended setup: Google Gemini.** From the repository root, run `npm run setup:saathi`. Create an API key from Google AI Studio when prompted; the script asks for it securely, verifies it with a real chat request, then writes it to the backend's ignored `.env` file. The key is never added to frontend code or shown in the terminal.

After configuration, the running backend reads the saved settings automatically; reopen Saathi or wait up to 20 seconds for its status to refresh. If the backend is not already running, start the project with `npm run dev:full`. To configure another OpenAI-compatible provider instead, set these variables **in the backend terminal only**:

```powershell
$env:QRSHIELD_CHAT_API_URL = "https://your-provider.example/v1/chat/completions"
$env:QRSHIELD_CHAT_MODEL = "your-chat-model"
$env:QRSHIELD_CHAT_API_KEY = "your-secret-key"
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

For local development without a cloud API key, you can instead install [Ollama](https://ollama.com/), download a model, and set:

```powershell
ollama pull qwen2.5:0.5b
$env:QRSHIELD_CHAT_API_URL = "http://127.0.0.1:11434/v1/chat/completions"
$env:QRSHIELD_CHAT_MODEL = "qwen2.5:0.5b"
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`QRSHIELD_CHAT_API_KEY` is optional for local/self-hosted providers that do not require bearer authentication. The backend health check verifies that a local Ollama server responds and that the selected model is installed; the UI shows a specific setup message when either is unavailable. Saathi sends only the chat messages the user submits, does not automatically include scan results, and does not persist chat history. Requests are made server-side; production deployments should use HTTPS, provider-side privacy controls, authentication, and rate limiting. A configured endpoint and installed model are required before chat can respond.

The parking vignette is an educational illustration, not a report of a verified incident at the displayed location. The reference page links to the original FBI/IC3 QR-code advisory and CISA phishing guidance. Do not represent these citations as QR Shield research, certification, or a thesis.

The recent-scans panel reads the newest five entries from the backend's local SQLite database. It is not a global feed. The thesis-alignment page documents a 27-feature URL model described in the thesis versus the bundled model endpoint's 30-precomputed-feature contract, and clarifies that the current app does not run the thesis-described ResNet-18 image classifier, SHAP explanations, or decision-level fusion.

## Suggested manual tests
1. Start both services and verify the landing page reports backend and model status.
2. Upload a clear QR code containing `https://example.com` and verify the payload is decoded.
3. Upload a non-QR image and verify the app gives an “Unable to decode” report instead of crashing.
4. Try a manual URL containing credentials, a link shortener, suspicious wording, or encoded separators and review the categorized checks and unavailable live-service notices.
5. Compare a decoded URL against an expected domain and verify matching and mismatching hostnames are reported.
6. Try a file above 8 MB and a non-image file; both should be rejected.
7. Submit all 30 categorical dataset features to `/api/predict-features`; the response should contain a phishing probability. Verify missing, extra, or non-`-1`/`0`/`1` values return HTTP 422.
8. Configure Saathi and ask a QR safety question; verify an unconfigured provider produces a clear error instead of a pretend answer.

## Before public deployment
This is a local development starter, not a production security service. The bundled XGBoost model expects all 30 website features (many require page or network observations), so it is intentionally not applied to raw URLs. Do not synthesize those missing features or let a low heuristic score imply safety. The QR image dataset and a trained image-classifier artifact are also not configured. Add a validated raw-URL feature pipeline and/or image model, plus authentication, rate limiting, deployment security, privacy/retention controls, HTTPS, and monitoring before public use. Do not fetch user-provided URLs server-side without strict SSRF protections.
