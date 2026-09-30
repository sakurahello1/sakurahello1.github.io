"""Browser checks for the agent & harness course. Serve the site with tools/serve_site.py (:8001) first.

Never calls a paid provider: the live run is answered by a mocked endpoint with a synthetic key.
Set CHROME_PATH to use an existing Chromium instead of Playwright's bundled one.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8001/blog/agent-harness/"
SENTINEL = "synthetic-test-sentinel-not-a-real-key"
THEATERS = {"react", "repair", "selection", "workers"}


def offline_fonts(page):
    page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))


def watch(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return errors


def main():
    report = {"responsive": [], "lessons": [], "behaviors": []}
    shots = ROOT / "output/playwright"
    shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(**({"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}))
        for width in [1440, 1100, 768, 390, 360]:
            page = browser.new_page(viewport={"width": width, "height": 900})
            offline_fonts(page)
            errors = watch(page)
            requests = []
            page.on("request", lambda r: requests.append(r.url))
            page.goto(URL, wait_until="networkidle")
            assert page.title() == "agent&harness从入门到精通"
            assert page.locator(".toc a[data-lesson]").count() == 30
            assert not any("/chapters/" in r for r in requests), "overview must not load lessons"
            for suffix in ["", "#lesson-7"]:
                page.goto(URL + suffix, wait_until="networkidle")
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), (width, suffix)
            page.screenshot(path=str(shots / f"agent-harness-{width}.png"))
            assert not errors, errors
            report["responsive"].append({"width": width, "overflow": False})
            page.close()

        # Every lesson loads on its own and mounts its experiment inline; each experiment kind is exercised once.
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        offline_fonts(page)
        errors = watch(page)
        page.goto(URL, wait_until="networkidle")
        tried = set()
        for n in range(1, 31):
            page.locator(f'.toc a[data-lesson="{n}"]').click()
            page.wait_for_function(f"location.hash === '#lesson-{n}'")
            body = page.locator("#lesson-body")
            body.locator(".lab, .th").first.wait_for(state="visible")
            assert len(body.inner_text()) > 600, n
            kind = body.locator(".lab-slot").get_attribute("data-lab")
            if kind in tried:
                continue
            tried.add(kind)
            if kind in THEATERS:
                th = body.locator(".th")
                th.get_by_role("button", name="▶ 播放录像").click()
                th.locator(".th-verdict").wait_for(timeout=60000)
                report["lessons"].append({"lesson": n, "kind": kind, "verdict": th.locator(".th-verdict").inner_text()})
            else:
                lab = body.locator(".lab")
                first = lab.locator(".lab-controls button").first
                if first.count():
                    first.click()
                page.wait_for_timeout(2500)
                report["lessons"].append({"lesson": n, "kind": kind, "out": lab.locator(".lab-out").inner_text()[:60]})
        assert not errors, errors
        report["behaviors"].append(f"30 lessons loaded inline; {len(tried)} experiment kinds exercised")

        # Code blocks: outline jumps unfold the code; copy puts plain source on the clipboard.
        page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://127.0.0.1:8001")
        page.goto(URL + "#lesson-7", wait_until="networkidle")
        fig = page.locator("figure.code").first
        assert "folded" in fig.get_attribute("class")
        fig.locator(".code-outline button", has_text="dispatch()").click()
        assert "folded" not in fig.get_attribute("class")
        fig.locator(".code-copy").click()
        copied = page.evaluate("navigator.clipboard.readText()")
        assert copied.startswith('"""Bounded Python reference harness') and "\n\n\n" not in copied[:200]
        report["behaviors"].append("outline jump unfolds; copy yields the plain source")

        # Connect with a synthetic key; a mocked endpoint answers the live run, including hostile text.
        turn = [0]

        def provider(route):
            turn[0] += 1
            if turn[0] == 1:
                delta = {"tool_calls": [{"index": 0, "id": "c1", "type": "function",
                                         "function": {"name": "lookup_vendor", "arguments": '{"id":"clay"}'}}]}
            elif turn[0] == 2:
                delta = {"tool_calls": [{"index": 0, "id": "c2", "type": "function",
                                         "function": {"name": "compute_total", "arguments": '{"id":"clay","quantity":1}'}}]}
            else:
                delta = {"content": json.dumps({"vendor": "clay", "total": 7480, "delivery": "2026-10-03",
                                                "source": "quote-clay-v2", "note": "<img src=x onerror=alert(1)>"})}
            item = {"choices": [{"delta": delta, "finish_reason": "stop" if turn[0] == 3 else "tool_calls"}],
                    "usage": {"prompt_tokens": 50 * turn[0], "completion_tokens": 9}}
            assert json.loads(route.request.post_data)["max_tokens"] == 1200
            route.fulfill(status=200, content_type="text/event-stream", headers={"access-control-allow-origin": "*"},
                          body="data: " + json.dumps(item) + "\n\ndata: [DONE]\n\n")
        page.route("https://api.deepseek.com/chat/completions", provider)
        page.goto(URL + "#lesson-1", wait_until="networkidle")
        th = page.locator("#lesson .th")
        th.get_by_role("button", name="⚡ 用我的模型运行").click()
        page.locator("#connect").wait_for(state="visible")
        page.locator("#key").fill(SENTINEL)
        page.locator("#save").click()
        th.locator(".th-verdict").wait_for(timeout=20000)
        assert "PASS" in th.locator(".th-verdict").inner_text()
        assert SENTINEL not in page.locator("body").inner_text() and SENTINEL not in page.url
        assert th.locator("img").count() == 0
        assert page.evaluate("sessionStorage.getItem('agent-harness:credential:v1')") is None
        assert "DeepSeek" in page.locator("#conn-label").inner_text()
        report["behaviors"].append("connect dialog + mocked live run; key kept in memory only, never shown; hostile HTML inert")

        # Remembering in the tab survives a reload; clearing forgets it.
        page.locator("#connect-open").click()
        page.locator("#key").fill(SENTINEL)
        page.locator("#remember").check()
        page.locator("#save").click()
        page.reload(wait_until="networkidle")
        assert "DeepSeek" in page.locator("#conn-label").inner_text()
        page.locator("#connect-open").click()
        page.locator("#forget").click()
        page.keyboard.press("Escape")
        assert page.locator("#conn-label").inner_text() == "连接模型"
        assert page.evaluate("sessionStorage.getItem('agent-harness:credential:v1')") is None
        report["behaviors"].append("tab retention survives reload; clearing forgets the key")
        assert not errors, errors
        page.close()

        # Standalone lessons read without JavaScript, code unfolded.
        context = browser.new_context(java_script_enabled=False)
        page = context.new_page()
        offline_fonts(page)
        page.goto(URL + "chapters/22-read.html")
        assert "+80.8%" in page.locator("main").inner_text()
        page.goto(URL + "chapters/06-read.html")
        assert page.locator("pre").first.evaluate("e => getComputedStyle(e).maxHeight") == "none"
        report["behaviors"].append("no-JS standalone lessons readable with code unfolded")
        context.close()
        browser.close()
    (ROOT / "tools/agent-harness-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"widths": len(report["responsive"]), "lessons": len(report["lessons"]), "behaviors": report["behaviors"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
