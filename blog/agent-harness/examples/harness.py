"""Bounded Python reference harness. Mock by default; live needs explicit --live.

No eval, shell, network tools, automatic retries or credential logging.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

VENDORS = {
    "clay": {"price": 6800, "tax": 0.1, "delivery": "2026-10-03", "source": "quote-clay-v2"},
    "ink": {"price": 6400, "tax": 0.1, "delivery": "2026-10-12", "source": "quote-ink-v3"},
    "paper": {"price": 7100, "tax": 0.1, "delivery": "2026-10-04", "source": "quote-paper-v1"},
}
GOAL = (
    "虚构采购：买一台笔记本，含税预算7600元，2026-10-05前交付。"
    "核查三家本地报价，最终用JSON返回vendor,total,delivery,source。不是实际采购。"
)
TOOLS = [
    {"type": "function", "function": {
        "name": "lookup_vendor", "description": "读取虚构供应商报价与交期；无副作用",
        "parameters": {"type": "object", "properties": {
            "id": {"type": "string", "enum": list(VENDORS)}},
            "required": ["id"], "additionalProperties": False}}},
    {"type": "function", "function": {
        "name": "compute_total", "description": "本地计算含税总价",
        "parameters": {"type": "object", "properties": {
            "id": {"type": "string", "enum": list(VENDORS)},
            "quantity": {"type": "integer"}},
            "required": ["id", "quantity"], "additionalProperties": False}}},
]


def dispatch(call: dict) -> dict:
    if call.get("type") != "function":
        raise ValueError("unknown tool type")
    fn = call.get("function", {})
    name = fn.get("name")
    if name not in {"lookup_vendor", "compute_total"}:
        raise ValueError("tool not permitted")
    raw = fn.get("arguments")
    if not isinstance(raw, str) or len(raw.encode()) > 4096:
        raise ValueError("arguments too large or invalid")
    args = json.loads(raw)
    expected = {"id", "quantity"} if name == "compute_total" else {"id"}
    if not isinstance(args, dict) or set(args) != expected:
        raise ValueError("unexpected fields")
    if not isinstance(args["id"], str) or args["id"] not in VENDORS:
        raise ValueError("unknown vendor")
    vendor = VENDORS[args["id"]]
    if name == "lookup_vendor":
        return {"id": args["id"], **vendor}
    qty = args["quantity"]
    if type(qty) is not int or not 1 <= qty <= 3:
        raise ValueError("quantity policy: integer 1..3")
    return {"total": round(vendor["price"] * (1 + vendor["tax"]) * qty),
            "source": vendor["source"]}


def verify(content: str) -> dict:
    try:
        result = json.loads(content)
    except (ValueError, TypeError):
        return {"parse": False}
    if not isinstance(result, dict):
        return {"parse": False}
    return {
        "parse": True, "vendor": result.get("vendor") == "clay",
        "total": type(result.get("total")) is int and result.get("total") == 7480,
        "delivery": result.get("delivery") == "2026-10-03",
        "source": result.get("source") == "quote-clay-v2",
    }


def base_url(value: str) -> str:
    p = urlsplit(value)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError("base URL must be HTTPS without credentials/query/fragment")
    return value.rstrip("/")


class MockModel:
    def __init__(self):
        self.step = 0

    async def call(self, messages: list, tools: list) -> tuple[dict, int | None]:
        self.step += 1
        if self.step == 1:
            calls = [{"id": f"mock-{name}", "type": "function", "function": {
                "name": "lookup_vendor", "arguments": json.dumps({"id": name})}}
                for name in VENDORS]
        elif self.step == 2:
            calls = [{"id": "mock-total", "type": "function", "function": {
                "name": "compute_total", "arguments": '{"id":"clay","quantity":1}'}}]
        else:
            return {"role": "assistant", "content": json.dumps({
                "vendor": "clay", "total": 7480, "delivery": "2026-10-03",
                "source": "quote-clay-v2"})}, None
        return {"role": "assistant", "content": None, "tool_calls": calls}, None


class SDKModel:
    def __init__(self, key: str, base: str, model: str, thinking: bool):
        from openai import AsyncOpenAI
        import httpx

        self.client = AsyncOpenAI(api_key=key, base_url=base, max_retries=0, timeout=60,
                                  http_client=httpx.AsyncClient(follow_redirects=False))
        self.model, self.thinking = model, thinking

    async def call(self, messages: list, tools: list) -> tuple[dict, int | None]:
        if len(json.dumps(messages, ensure_ascii=False).encode()) > 32768:
            raise ValueError("context exceeds 32 KiB")
        response = await self.client.chat.completions.create(
            model=self.model, messages=messages, tools=tools, max_tokens=1200,
            extra_body={"thinking": {"type": "enabled" if self.thinking else "disabled"}},
        )
        if not response.choices or response.choices[0].finish_reason not in {"stop", "tool_calls"}:
            raise ValueError("incomplete model response")
        # Includes provider extra reasoning_content. Keep it in live history, never print it.
        message = response.choices[0].message.model_dump(exclude_none=True)
        # SDK response-only fields are not request history fields.
        message = {k: v for k, v in message.items()
                   if k in {"role", "content", "tool_calls", "reasoning_content"}}
        return message, response.usage.total_tokens if response.usage else None

    async def close(self):
        await self.client.close()


@dataclass
class Budget:
    calls: int = 0
    tools: int = 0
    tokens: int = 0
    usage_known: bool = False


async def run(model, emit=print) -> dict:
    messages = [{"role": "user", "content": GOAL}]
    budget = Budget()
    seen_ids = set()
    for _ in range(3):
        budget.calls += 1  # Reserve before dispatch, not after response.
        message, tokens = await model.call(messages, TOOLS)
        if tokens is not None:
            budget.tokens += tokens
            budget.usage_known = True
        messages.append(message)
        calls = message.get("tool_calls", [])
        if not calls:
            checks = verify(message.get("content", ""))
            emit(json.dumps({"event": "verification", "checks": checks}, ensure_ascii=False))
            return {"passed": all(checks.values()), "calls": budget.calls,
                    "tools": budget.tools, "tokens": budget.tokens if budget.usage_known else None}
        for call in calls:
            if budget.tools >= 4:
                raise ValueError("tool budget exhausted")
            if not call.get("id") or call["id"] in seen_ids:
                raise ValueError("duplicate/missing call ID")
            seen_ids.add(call["id"])
            budget.tools += 1
            try:
                result = dispatch(call)
            except (ValueError, TypeError):
                result = {"error": "tool contract or policy rejected"}
            # Whitelisted summaries only: no raw model text, arguments, headers or keys.
            emit(json.dumps({"event": "tool", "sequence": budget.tools,
                             "status": "rejected" if "error" in result else "ok"}))
            messages.append({"role": "tool", "tool_call_id": call["id"],
                             "content": json.dumps(result)})
    raise ValueError("model call budget exhausted")


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--thinking", action="store_true")
    parser.add_argument("--base-url", default="https://api.deepseek.com")
    parser.add_argument("--model", default="deepseek-flash",
                        choices=["deepseek-flash", "deepseek-v4-pro"])
    parser.add_argument("--approve-destination", help="Must exactly equal normalized base URL")
    args = parser.parse_args()
    model = MockModel()
    if args.live:
        base = base_url(args.base_url)
        if args.approve_destination != base:
            parser.error("explicit --approve-destination required for this exact base URL")
        key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not key or "\n" in key or "\r" in key:
            parser.error("set DEEPSEEK_API_KEY locally; never paste it in chat or commit it")
        print(f"LIVE destination={base}/chat/completions model={args.model}; "
              "3 calls / 1200 output tokens each / 4 local tools / 120s total; no retries")
        model = SDKModel(key, base, args.model, args.thinking)
    try:
        result = await asyncio.wait_for(run(model), timeout=120)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["passed"] else 1
    except (Exception, asyncio.CancelledError):
        # Avoid SDK exception bodies containing sensitive echoed data.
        print("Run failed/cancelled/incomplete; raw provider error omitted. Usage may be unknown.")
        return 2
    finally:
        if isinstance(model, SDKModel):
            await model.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
