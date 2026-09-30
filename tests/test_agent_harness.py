"""Offline semantic tests: no credentials or provider calls."""
import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("harness", ROOT / "blog/agent-harness/examples/harness.py")
h = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = h
SPEC.loader.exec_module(h)


class HarnessTests(unittest.TestCase):
    def test_mock_completion_and_budget(self):
        result = asyncio.run(h.run(h.MockModel(), emit=lambda _: None))
        self.assertEqual(result, {"passed": True, "calls": 3, "tools": 4, "tokens": None})

    def test_contract_rejections(self):
        for name, raw in [("constructor", "{}"), ("lookup_vendor", '{"id":"clay","extra":1}'),
                          ("compute_total", '{"id":"clay","quantity":true}'),
                          ("compute_total", '{"id":"clay","quantity":999}'),
                          ("lookup_vendor", '{"id":"nope"}'), ("lookup_vendor", "{")]:
            with self.subTest(name=name, raw=raw), self.assertRaises(ValueError):
                h.dispatch({"type": "function", "function": {"name": name, "arguments": raw}})

    def test_verifier_fail_closed(self):
        self.assertFalse(h.is_complete({}))
        for answer in ["", "{}", '"clay 7480 quote-clay-v2 2026-10-03"',
                       '{"vendor":"clay","total":6800,"delivery":"2026-10-03","source":"quote-clay-v2"}']:
            self.assertFalse(all(h.verify(answer).values()))

    def test_partial_usage_remains_unknown(self):
        class Partial(h.MockModel):
            async def call(self, messages, tools):
                message, _ = await super().call(messages, tools)
                return message, 42 if self.step == 1 else None
        self.assertIsNone(asyncio.run(h.run(Partial(), emit=lambda _: None))["tokens"])

    def test_real_sdk_with_mock_http_transport(self):
        import httpx
        from openai import AsyncOpenAI
        async def exercise():
            captured = []
            async def handler(request):
                import json
                captured.append(json.loads(request.content))
                return httpx.Response(200, json={"id":"mock", "object":"chat.completion", "created":1,
                    "model":"deepseek-flash", "choices":[{"index":0,"finish_reason":"stop",
                    "message":{"role":"assistant","content":"{}","reasoning_content":"provider replay fixture"}}],
                    "usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}})
            model = h.SDKModel("synthetic-test-sentinel", "https://api.deepseek.com", "deepseek-flash", True)
            await model.close()
            model.client = AsyncOpenAI(api_key="synthetic-test-sentinel", base_url="https://api.deepseek.com",
                max_retries=0,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
            message, tokens = await model.call([{"role":"user","content":"fixture"}], h.TOOLS)
            self.assertEqual(tokens,3)
            self.assertEqual(message["reasoning_content"],"provider replay fixture")
            await model.call([{"role":"user","content":"fixture"},message],h.TOOLS)
            self.assertEqual(captured[1]["messages"][1]["reasoning_content"],"provider replay fixture")
            self.assertEqual(captured[0]["max_tokens"],1200)
            self.assertEqual(captured[0]["thinking"],{"type":"enabled"})
            await model.close()
        asyncio.run(exercise())

    def test_destination_validation(self):
        for value in ["http://example.com", "https://user:pass@example.com", "https://example.com?q=x",
                      "https://example.com#key"]:
            with self.assertRaises(ValueError):
                h.base_url(value)

    def test_infinite_tool_loop_stops(self):
        class Loop:
            async def call(self, messages, tools):
                return {"role": "assistant", "tool_calls": [{"id": "same", "type": "function",
                        "function": {"name": "lookup_vendor", "arguments": '{"id":"clay"}'}}]}, None
        with self.assertRaisesRegex(ValueError, "duplicate"):
            asyncio.run(h.run(Loop(), emit=lambda _: None))


if __name__ == "__main__":
    unittest.main()
