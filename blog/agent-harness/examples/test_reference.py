"""Run: python -m unittest test_reference.py. Offline, no SDK required."""
import asyncio
import unittest
from harness import MockModel, dispatch, run, verify


class ReferenceTests(unittest.TestCase):
    def test_mock(self):
        result = asyncio.run(run(MockModel(), emit=lambda _: None))
        self.assertTrue(result["passed"])
        self.assertEqual(result["calls"], 3)
        self.assertEqual(result["tools"], 4)

    def test_empty_rejected(self):
        for text in ["", "{}", "[]", "null"]:
            self.assertFalse(all(verify(text).values()))

    def test_policy(self):
        call = {"type": "function", "function": {"name": "compute_total",
                "arguments": '{"id":"clay","quantity":999}'}}
        with self.assertRaises(ValueError):
            dispatch(call)
