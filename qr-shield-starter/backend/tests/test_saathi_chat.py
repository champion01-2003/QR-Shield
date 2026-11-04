import json
import unittest
from urllib.error import URLError
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from main import ChatMessage, chat_configuration_status, health, request_saathi_reply


class SaathiChatTests(unittest.TestCase):
    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "https://chat.example.test/v1/chat/completions",
            "QRSHIELD_CHAT_MODEL": "test-model",
            "QRSHIELD_CHAT_API_KEY": "test-key",
        },
        clear=False,
    )
    @patch("main.urlopen")
    def test_uses_configured_openai_compatible_provider(self, mock_urlopen):
        provider_response = MagicMock()
        provider_response.__enter__.return_value = provider_response
        provider_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Photosynthesis lets plants turn light into stored chemical energy."}}]}
        ).encode()
        mock_urlopen.return_value = provider_response
        messages = [ChatMessage(role="user", content="Explain photosynthesis in one sentence.")]

        reply = request_saathi_reply(messages)

        self.assertEqual(reply, "Photosynthesis lets plants turn light into stored chemical energy.")
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://chat.example.test/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-key")
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "test-model")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["messages"][-1]["content"], messages[0].content)
        self.assertIn("general-purpose AI assistant", payload["messages"][0]["content"])
        self.assertIn("outside QR security", payload["messages"][0]["content"])
        self.assertEqual(payload["max_tokens"], 1200)

    @patch.dict("os.environ", {}, clear=True)
    def test_health_reports_chat_setup_as_unavailable_without_credentials(self):
        self.assertEqual(
            chat_configuration_status(),
            {
                "available": False,
                "reason": "Run .\\setup-saathi.ps1 from the QR-Shield folder, create a Gemini API key at https://aistudio.google.com/apikey, and restart with npm run dev:full.",
            },
        )
        self.assertFalse(health()["chat_status"]["available"])

    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "http://127.0.0.1:11434/v1/chat/completions",
            "QRSHIELD_CHAT_MODEL": "qwen2.5:0.5b",
        },
        clear=True,
    )
    @patch("main.urlopen", side_effect=URLError("Ollama is not running"))
    def test_local_health_reports_ollama_server_unavailable(self, mock_urlopen):
        status = chat_configuration_status()
        self.assertFalse(status["available"])
        self.assertIn("Start Ollama", status["reason"])
        mock_urlopen.assert_called_once_with("http://127.0.0.1:11434/api/tags", timeout=0.75)

    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "http://127.0.0.1:11434/v1/chat/completions",
            "QRSHIELD_CHAT_MODEL": "qwen2.5:0.5b",
        },
        clear=True,
    )
    @patch("main.urlopen")
    def test_local_health_reports_missing_model(self, mock_urlopen):
        provider_response = MagicMock()
        provider_response.__enter__.return_value = provider_response
        provider_response.read.return_value = json.dumps({"models": []}).encode()
        mock_urlopen.return_value = provider_response

        status = chat_configuration_status()

        self.assertFalse(status["available"])
        self.assertIn("ollama pull qwen2.5:0.5b", status["reason"])

    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "http://127.0.0.1:11434/v1/chat/completions",
            "QRSHIELD_CHAT_MODEL": "qwen2.5:0.5b",
        },
        clear=True,
    )
    @patch("main.urlopen")
    def test_local_health_reports_ready_model(self, mock_urlopen):
        provider_response = MagicMock()
        provider_response.__enter__.return_value = provider_response
        provider_response.read.return_value = json.dumps(
            {"models": [{"name": "qwen2.5:0.5b"}]}
        ).encode()
        mock_urlopen.return_value = provider_response

        self.assertEqual(chat_configuration_status(), {"available": True, "reason": None})

    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "https://chat.example.test/v1/chat/completions",
            "QRSHIELD_CHAT_MODEL": "test-model",
        },
        clear=True,
    )
    def test_health_reports_chat_setup_as_available_without_exposing_configuration(self):
        chat_status = health()["chat_status"]
        self.assertTrue(chat_status["available"])
        self.assertIsNone(chat_status["reason"])
        self.assertNotIn("endpoint", chat_status)
        self.assertNotIn("api_key", chat_status)

    @patch.dict("os.environ", {}, clear=True)
    def test_requires_provider_endpoint_and_model(self):
        with self.assertRaises(HTTPException) as error:
            request_saathi_reply([ChatMessage(role="user", content="Hello")])

        self.assertEqual(error.exception.status_code, 503)

    @patch.dict(
        "os.environ",
        {
            "QRSHIELD_CHAT_API_URL": "http://provider.example.test/chat/completions",
            "QRSHIELD_CHAT_MODEL": "test-model",
        },
        clear=True,
    )
    def test_rejects_non_local_http_provider(self):
        with self.assertRaises(HTTPException) as error:
            request_saathi_reply([ChatMessage(role="user", content="Hello")])

        self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
