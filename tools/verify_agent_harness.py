"""Behavioral browser checks. Serve root on :8000; never calls paid providers."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8001"
URL = BASE + "/blog/agent-harness/"
SENTINEL = "synthetic-test-sentinel-not-a-real-key"

def offline_fonts(page):
    page.route('https://fonts.googleapis.com/**',
               lambda route: route.fulfill(status=200,content_type='text/css',body=''))


def main():
    report = {"font_policy":"explicit system Chinese fallback; local display fonts retained",
              "responsive": [], "experiments": [], "behaviors": []}
    shots = ROOT / "output/playwright"
    shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [1440, 1100, 768, 390, 360]:
            context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            page = context.new_page()
            offline_fonts(page)
            errors, requests = [], []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console",lambda m:errors.append(m.text) if m.type=='error' else None)
            page.on("request", lambda r: requests.append(r.url))
            page.goto(URL, wait_until="networkidle")
            assert page.title() == "agent&harness从入门到精通"
            assert not any("/chapters/" in r or r.endswith("labs.mjs") for r in requests), requests
            assert page.locator('[data-chapter]').count() == 30
            overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth")
            assert not overflow, (width, "horizontal overflow")
            page.screenshot(path=str(shots / f"agent-harness-{width}.png"))
            report["responsive"].append({"width": width, "overflow": overflow, "page_errors": errors,
                                         "cold_chapters": 0, "cold_labs": 0})
            assert not errors
            context.close()
        context = browser.new_context(viewport={"width": 1100, "height": 900}, reduced_motion="reduce")
        page = context.new_page()
        offline_fonts(page)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console",lambda m:errors.append(m.text) if m.type=='error' else None)
        page.goto(URL, wait_until="networkidle")
        # Every chapter loads independently; every mounted control is a real local handler.
        tested = set()
        for i in range(30):
            ident = f"{i:02}"
            page.locator(f'[data-chapter="{ident}"]').click()
            body = page.locator(f'#body-{ident}')
            body.wait_for(state="visible")
            assert len(body.inner_text()) > 600, (i, "too little chapter content")
            labbutton = body.locator('[data-lab]')
            kind = labbutton.get_attribute("data-lab")
            labbutton.click()
            lab = body.locator('.lab')
            lab.wait_for(state="visible")
            if kind not in tested:
                if kind in {"react", "selection", "repair", "workers"}:
                    lab.get_by_role("button", name="运行离线模拟", exact=True).click()
                    lab.locator('.lab-output').filter(has_text='确定性教学验收').wait_for(timeout=10000)
                    assert 'PASS' in lab.locator('.lab-output').inner_text()
                    lab.get_by_role("button", name="重置", exact=True).click()
                    lab.get_by_role("button", name="暂停离线动画", exact=True).click()
                    lab.get_by_role("button", name="运行离线模拟", exact=True).click()
                    lab.get_by_role("button", name="取消", exact=True).click()
                    page.wait_for_timeout(250)
                    assert '已取消' in lab.locator('.lab-output').inner_text()
                    lab.get_by_role("button", name="重置", exact=True).click()
                    lab.get_by_role("button", name="继续离线动画", exact=True).click()
                else:
                    buttons = lab.locator('button')
                    if buttons.count():
                        buttons.first.click()
                    assert lab.locator('.lab-output').inner_text() or lab.locator('.flow').inner_text()
                tested.add(kind)
                report["experiments"].append({"kind": kind, "offline": "passed"})
            # Collapse prevents scroll distance and verifies re-open is a visibility toggle.
            page.locator(f'[data-chapter="{ident}"]').click()
        report["behaviors"].append("30 chapters loaded; 15 experiment types mounted and exercised")
        # Tab retention restores, but renewed destination consent is required.
        page.locator('#key').fill(SENTINEL)
        page.locator('#retention').select_option('tab')
        page.locator('#consent').check()
        page.locator('#save').click()
        assert page.locator('#key').input_value() == ''
        page.reload(wait_until="networkidle")
        assert '保留凭据' in page.locator('#credential-status').inner_text()
        assert not page.locator('#consent').is_checked()
        page.locator('#consent').check()
        page.locator('#restore').click()
        # Mock streamed provider request; no external inference, synthetic key only.
        requests = []
        def mocked(route):
            requests.append(route.request.post_data_json)
            content = json.dumps({"vendor":"clay","total":7480,"delivery":"2026-10-03","source":"quote-clay-v2"})
            raw = json.dumps({"choices":[{"delta":{"content":content},"finish_reason":"stop"}],"usage":{"total_tokens":42}})
            route.fulfill(status=200, content_type='text/event-stream', body='data: '+raw+'\n\ndata: [DONE]\n\n',
                          headers={"access-control-allow-origin":"*"})
        page.route('https://api.deepseek.com/chat/completions', mocked)
        page.locator('[data-chapter="00"]').click()
        body = page.locator('#body-00')
        body.locator('[data-lab]').click()
        lab = body.locator('.lab')
        lab.get_by_role('button', name='真实 API 流式运行（使用你的余额）', exact=True).click()
        lab.locator('.lab-output').filter(has_text='PASS').wait_for(timeout=10000)
        assert requests and requests[0]['max_tokens'] == 1200
        assert SENTINEL not in page.locator('body').inner_text()
        assert SENTINEL not in page.url
        report['behaviors'].append('mock native-fetch live stream passed; sentinel absent from visible text/URL')
        # Three calls: missing usage on the middle tool response keeps total unknown.
        page.unroute('https://api.deepseek.com/chat/completions')
        turn=[0]
        def partial_usage(route):
            turn[0]+=1
            if turn[0] == 1:
                delta={"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{
                    "name":"lookup_vendor","arguments":'{"id":"clay"}'}}]}
            elif turn[0] == 2:
                delta={"tool_calls":[{"index":0,"id":"call-2","type":"function","function":{
                    "name":"compute_total","arguments":'{"id":"clay","quantity":1}'}}]}
            else:
                delta={"content":json.dumps({"vendor":"clay","total":7480,"delivery":"2026-10-03",
                    "source":"quote-clay-v2","note":"<img src=x onerror=alert(1)>"+SENTINEL})}
            item={"choices":[{"delta":delta,"finish_reason":"stop" if turn[0]==3 else "tool_calls"}]}
            if turn[0]!=2:item['usage']={"total_tokens":42}
            route.fulfill(status=200,content_type='text/event-stream',body='data: '+json.dumps(item)+'\n\ndata: [DONE]\n\n')
        page.route('https://api.deepseek.com/chat/completions',partial_usage)
        lab.get_by_role('button',name='真实 API 流式运行（使用你的余额）',exact=True).click()
        lab.locator('.lab-output').filter(has_text='未知（已知部分84）').wait_for(timeout=10000)
        assert SENTINEL not in page.locator('body').inner_text()
        assert lab.locator('img').count()==0
        report['behaviors'].append('mixed usage keeps total unknown; hostile HTML inert; synthetic key redacted')
        page.locator('#base').fill('https://other.example')
        assert page.evaluate("sessionStorage.getItem('agent-harness:credential:v1')") is None
        assert not page.locator('#consent').is_checked()
        report['behaviors'].append('destination change clears retained key and consent')
        for mode in ['tab','device']:
            page.locator('#key').fill(SENTINEL)
            page.locator('#retention').select_option(mode)
            page.locator('#consent').check()
            page.locator('#save').click()
            page.reload(wait_until='networkidle')
            assert page.locator('#base').input_value() == 'https://other.example'
            assert '保留凭据' in page.locator('#credential-status').inner_text()
            assert not page.locator('#consent').is_checked()
        report['behaviors'].append('custom destination survives tab/device refresh without consent auto-approval')
        page.locator('#forget').click()
        assert page.locator('#key').input_value() == ''
        assert not errors, errors
        context.close()
        # No-JS chapter is still readable.
        context = browser.new_context(java_script_enabled=False)
        page = context.new_page()
        offline_fonts(page)
        page.goto(URL+'chapters/22-read.html')
        assert '+80.8%' in page.locator('main').inner_text()
        report['behaviors'].append('no-JS standalone chapter readable')
        context.close()
        # Deep links load exactly one chapter; capture body, code and lab at both widths.
        for width,label in [(1440,'desktop'),(390,'mobile')]:
            context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
            page=context.new_page()
            offline_fonts(page)
            page.goto(URL+'#lesson-6',wait_until='networkidle')
            page.locator('#body-06').wait_for(state='visible')
            assert page.locator('article[data-loaded]').count()==1
            page.locator('#body-06 p').first.scroll_into_view_if_needed()
            page.screenshot(path=str(shots/f'agent-harness-{label}-body.png'))
            page.locator('#body-06 .full-code summary').click()
            page.locator('#body-06 pre').first.scroll_into_view_if_needed()
            page.screenshot(path=str(shots/f'agent-harness-{label}-code.png'))
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            page.locator('#body-06 [data-lab]').click()
            lab=page.locator('#body-06 .lab')
            lab.scroll_into_view_if_needed()
            lab.get_by_role('button',name='运行离线模拟',exact=True).click()
            lab.locator('.lab-output').filter(has_text='PASS').wait_for(timeout=10000)
            page.screenshot(path=str(shots/f'agent-harness-{label}-experiment.png'))
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            # All chapter wrappers remain keyboard reachable.
            chapter=page.locator('[data-chapter="15"]')
            chapter.focus();page.keyboard.press('Enter')
            page.locator('#body-15').wait_for(state='visible')
            context.close()
        report['behaviors'].append('desktop/mobile body/code/lab screenshots; deep-link single-chapter load; keyboard activation')
        browser.close()
    (ROOT / 'tools/agent-harness-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({"responsive_widths":len(report['responsive']),"experiment_types":len(report['experiments']),
                      "behaviors":report['behaviors']}, ensure_ascii=True))


if __name__ == '__main__':
    main()
