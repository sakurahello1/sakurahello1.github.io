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
        for answer in ["", "{}", '"clay 7480 quote-clay-v2 2026-10-03"',
                       '{"vendor":"clay","total":6800,"delivery":"2026-10-03","source":"quote-clay-v2"}']:
            self.assertFalse(all(h.verify(answer).values()))

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
