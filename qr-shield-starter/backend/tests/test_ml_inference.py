import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

import main


async def run_asgi(app_instance, scope):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await app_instance(scope, receive, send)
    return messages


class URLModelInferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.startup()

    def test_health_reports_loaded_feature_model(self):
        model_status = main.health()["model_status"]["url_model"]
        self.assertTrue(model_status["available"])
        self.assertEqual(model_status["feature_count"], 30)
        self.assertFalse(model_status["supports_raw_url"])

    def test_feature_endpoint_returns_phishing_probability(self):
        features = {name: 1.0 for name in main.URL_MODEL_FEATURES}
        prediction = main.predict_features(main.FeatureRequest(features=features))
        self.assertEqual(prediction["prediction_target"], "phishing")
        self.assertEqual(prediction["feature_count"], 30)
        self.assertFalse(prediction["raw_url_inference"])
        self.assertGreaterEqual(prediction["phishing_probability"], 0)
        self.assertLessEqual(prediction["phishing_probability"], 1)

    def test_feature_endpoint_rejects_incomplete_vectors(self):
        features = {name: 1.0 for name in main.URL_MODEL_FEATURES[:-1]}
        with self.assertRaises(HTTPException) as error:
            main.predict_features(main.FeatureRequest(features=features))
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn(main.URL_MODEL_FEATURES[-1], error.exception.detail)

    def test_feature_endpoint_rejects_values_outside_training_domain(self):
        features = {name: 1.0 for name in main.URL_MODEL_FEATURES}
        features[main.URL_MODEL_FEATURES[0]] = 0.5
        with self.assertRaises(HTTPException) as error:
            main.predict_features(main.FeatureRequest(features=features))
        self.assertEqual(error.exception.status_code, 422)

    def test_cors_allows_vite_on_an_alternate_local_port(self):
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "OPTIONS",
            "scheme": "http",
            "path": "/api/health",
            "raw_path": b"/api/health",
            "query_string": b"",
            "root_path": "",
            "server": ("localhost", 80),
            "client": ("localhost", 1234),
            "headers": [
                (b"origin", b"http://localhost:5176"),
                (b"access-control-request-method", b"GET"),
            ],
        }
        messages = asyncio.run(run_asgi(main.app.build_middleware_stack(), scope))
        response = messages[0]
        self.assertEqual(response["status"], 200)
        self.assertEqual(
            dict(response["headers"])[b"access-control-allow-origin"],
            b"http://localhost:5176",
        )


class URLAnalysisTests(unittest.TestCase):
    def test_safe_https_url_has_structured_checks_and_explicit_limits(self):
        result = main.analyze_url("https://example.com/menu")
        self.assertEqual(result["risk_level"], "low")
        self.assertEqual(result["verdict"], "No obvious risk detected")
        self.assertTrue(any(check["title"] == "Transport security" and check["status"] == "clear" for check in result["checks"]))
        unavailable = [check for check in result["checks"] if check["status"] == "unavailable"]
        self.assertGreaterEqual(len(unavailable), 3)
        self.assertIn("no network lookups", result["analysis_scope"].lower())

    def test_identifies_multiple_risky_url_patterns(self):
        result = main.analyze_url("http://user@bit.ly/urgent-login?redirect=%252Faccount")
        titles = {check["title"] for check in result["checks"] if check["status"] == "flagged"}
        self.assertIn("Transport security", titles)
        self.assertIn("Embedded credentials", titles)
        self.assertIn("Link shortener", titles)
        self.assertIn("Sensitive-action wording", titles)
        self.assertIn("Encoded characters", titles)
        self.assertGreater(result["score"], 25)

    def test_malformed_hosts_and_ports_return_reports_not_exceptions(self):
        for url in ("https://[broken", "https://example.com:99999", "javascript:alert(1)"):
            with self.subTest(url=url):
                result = main.analyze_url(url)
                self.assertIn(result["risk_level"], {"low", "elevated", "high"})
                self.assertTrue(result["checks"])
                self.assertIsInstance(result["reasons"], list)

    def test_endpoint_rejects_overlong_and_control_character_urls(self):
        with self.assertRaises(HTTPException) as overlong:
            main.analyze_url_endpoint(main.URLRequest(url="a" * 2049))
        self.assertEqual(overlong.exception.status_code, 400)
        with self.assertRaises(HTTPException) as control_character:
            main.analyze_url_endpoint(main.URLRequest(url="https://example.com/\n"))
        self.assertEqual(control_character.exception.status_code, 422)
        with self.assertRaises(ValidationError):
            main.URLRequest(url="https://exa\ud800mple.com")

    def test_url_endpoint_returns_the_full_analysis_report(self):
        with patch.object(main, "save_scan", return_value={}) as save_scan:
            response = main.analyze_url_endpoint(
                main.URLRequest(url="https://bit.ly/account-login")
            )
        report = response["url_analysis"]
        self.assertIn("checks", report)
        self.assertTrue(any(check["title"] == "Link shortener" for check in report["checks"]))
        save_scan.assert_called_once()


if __name__ == "__main__":
    unittest.main()
