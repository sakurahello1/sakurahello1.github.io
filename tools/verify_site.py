"""Browser smoke check for the requested pages and screenshot set.

Start ``python -m http.server 8000`` in the repository root, then run this
script. It uses the installed Python Playwright package and Chromium.
"""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "tools" / "shots"
BASE = "http://127.0.0.1:8000"
PAGES = {
    "home": "/",
    "blog": "/blog/",
    "rl-post-training": "/blog/rl-post-training/",
    "agent-theory": "/blog/agent-theory/",
    "404": "/404.html",
}
LOCAL_FONT_PAGES = {"home", "blog", "404"}


def main() -> int:
    SHOTS.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for name, path in PAGES.items():
            for width, label in ((1280, "desktop"), (360, "mobile")):
                context = browser.new_context(
                    viewport={"width": width, "height": 800},
                    device_scale_factor=1,
                    reduced_motion="reduce",
                )
                page = context.new_page()
                console_errors = []
                page_errors = []
                failed_local = []
                font_responses = []
                page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on(
                    "requestfailed",
                    lambda request: failed_local.append(f"{request.url}: {request.failure}")
                    if request.url.startswith(BASE) else None,
                )
                page.on(
                    "response",
                    lambda response: font_responses.append((response.url, response.status))
                    if "/assets/fonts/" in response.url else None,
                )
                response = page.goto(BASE + path, wait_until="domcontentloaded", timeout=30000)
                page.evaluate("document.fonts.ready")
                page.wait_for_timeout(700)
                dimensions = page.evaluate(
                    """() => { window.scrollTo(1000, 0);
                      const actualScrollX = window.scrollX;
                      window.scrollTo(0, 0);
                      return { viewport: innerWidth,
                      html: document.documentElement.scrollWidth,
                      body: document.body.scrollWidth,
                      actualScrollX,
                      horizontalScroll: actualScrollX > 0,
                      overflowNodes: innerWidth === 360 ? [...document.querySelectorAll('body *')]
                        .filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 2 && r.width > 0; })
                        .slice(0, 12).map(el => ({tag:el.tagName, id:el.id, className:typeof el.className === 'string' ? el.className.slice(0,80) : '', right:Math.round(el.getBoundingClientRect().right)})) : [],
                      barlow: document.fonts.check('700 32px "Barlow Condensed"', 'Writing'),
                      barlowFaces: [...document.fonts].filter(f => f.family === 'Barlow Condensed').map(f => ({weight:f.weight,status:f.status})),
                      headingFamily: getComputedStyle(document.querySelector('.bigtype') || document.body).fontFamily
                    }; }"""
                )
                shot = SHOTS / f"{name}-{label}.png"
                page.screenshot(path=str(shot), full_page=False, animations="disabled")
                result = {
                    "page": name,
                    "viewport": width,
                    "http": response.status if response else None,
                    "dimensions": dimensions,
                    "font_responses": font_responses,
                    "console_errors": console_errors,
                    "page_errors": page_errors,
                    "failed_local": failed_local,
                    "screenshot": shot.relative_to(ROOT).as_posix(),
                }
                results.append(result)
                print(json.dumps(result, ensure_ascii=False))
                context.close()
        browser.close()
    (ROOT / "tools" / "browser-results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    bad = []
    for result in results:
        name = result["page"]
        if result["http"] != 200 or result["console_errors"] or result["page_errors"] or result["failed_local"]:
            bad.append(f"{name}/{result['viewport']}: browser error")
        if result["viewport"] == 360 and result["dimensions"]["horizontalScroll"]:
            bad.append(f"{name}/360: horizontal scroll")
        if name in LOCAL_FONT_PAGES:
            if not result["dimensions"]["barlow"]:
                bad.append(f"{name}/{result['viewport']}: Barlow not loaded")
            if not any(url.startswith(BASE + "/assets/fonts/barlow-condensed-") and status == 200 for url, status in result["font_responses"]):
                bad.append(f"{name}/{result['viewport']}: no local Barlow response")
    print("PASS" if not bad else "FAIL: " + "; ".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
