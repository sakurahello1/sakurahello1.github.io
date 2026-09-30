"""One-time import of reviewed author manuscripts; no runtime dependency on ZIP."""
import html
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "blog/agent-harness"


def import_manuscripts(path):
    with zipfile.ZipFile(path) as archive:
        texts = [archive.read(name).decode("utf-8") for name in
                 ["agent-harness-prose-01.md", "agent-harness-prose-234.md"]]
    chapters = []
    for text in texts:
        # Only numbered lecture headings, never headings inside code fences.
        markers = list(re.finditer(r"(?m)^#{2,3} [0-4]-[1-8] .+$", text))
        for n, marker in enumerate(markers):
            end = markers[n+1].start() if n+1 < len(markers) else len(text)
            body = text[marker.end():end]
            body = re.sub(r"(?m)^#{1,2} (?:[0-4] |第[二三四]部分).*$", "", body)
            body = re.sub(r"(?m)^【.*?】\s*$", "", body)
            chapters.append(body.strip())
    if len(chapters) != 30:
        raise ValueError(f"Expected 30 chapters, got {len(chapters)}")
    # Full, tested reference replaces the earlier short A/B SDK sketch.
    reference = (ARTICLE / "examples/harness.py").read_text(encoding="utf-8")
    chapters[6] = re.sub(r"```python[\s\S]*?```", lambda _: "```python\n" + reference + "\n```", chapters[6], count=1)
    chapters[6] = chapters[6].replace("推荐 B", "推荐符合条件的供应商")
    chapters[6] = re.sub(r"这段程序还缺什么？[^\n]+", "完整程序已经要求最终JSON并校验供应商、含税价、日期与证据ID。它不靠关键词包含判断：‘不要选clay’也包含clay，不能当作正确推荐。当前验证器只覆盖固定fixture；扩展题目时应同时扩展验收合同，而不是让模型迎合一个写死的答案。", chapters[6])
    chapters[6] = re.sub(r"它也没有实现[^\n]+", "这个小程序没有生产级持久会话或副作用恢复；Python采用非流式SDK，让协议容易阅读，浏览器实现流式组装。完整代码同时设置单次60秒与整项120秒deadline，Ctrl+C取消，但本地取消不保证provider停止计费。自动重试关闭，以便调用次数清楚，也避免不确定动作重复。扩展写工具仍需授权、幂等与事后核验。", chapters[6])
    chapters[6] = re.sub(r"练习可以从[^\n]+", "练习可以把clay交期改到截止日之后，再设计结构化‘无可行方案’结果及相应验证器。不能只改fixture还沿用固定正确答案，也不能因为用户说推荐就硬选一家。这个反例把我们带入下一部分：任务进行很久、数据变化时，系统还能记住哪些约束，知道读的是哪个版本吗？", chapters[6])
    chapters[6] += "\n\n### 与实际下载包的对应\n\n上方为配套harness.py完整实现，默认mock无需依赖和密钥。统一可运行fixture使用clay、ink、paper，预算7600、截止2026-10-05；其他讲的A/B报价为单独的教学例子。模型候选必须是JSON，验证器检查字段及source。完整依赖、命令行、取消与目的地确认见[运行说明](../agent-harness/examples/README.md)。浏览器用JS实现流式协议，Python在本机运行，不在浏览器执行。"
    gate = '''required = contract.required_criterion_ids
    ids = [c.criterion for c in checks]
    complete = (
        bool(required)
        and len(set(required)) == len(required)
        and len(set(ids)) == len(ids)
        and set(ids) == set(required)
        and all(c.verdict == "pass" and bool(c.evidence_refs) for c in checks)
    )'''
    chapters[15] = chapters[15].replace('complete = all(c.verdict == "pass" for c in checks)', gate)
    chapters[15] += "\n\n完成门应fail closed：合同为空、必需项重复、报告项重复、遗漏、unknown、没有证据引用，都不完成。Python和浏览器固定题验证器在每条失败路径返回非空失败检查，不能借all([])真值退出。检验空结果是必要回归测试。"
    chapters[17] = chapters[17].replace("image_url\": screenshot_url", 'image_url": os.environ["APPROVED_SCREENSHOT_URL"]')
    chapters[17] = chapters[17].replace("在 OpenAI 官方 Python SDK 中", "以下是可选的其他供应商示例，需另配OPENAI_API_KEY与支持视觉的模型，不沿用本页DeepSeek凭据或baseURL。APPROVED_SCREENSHOT_URL必须指向已明确授权发送的截图；仅为接口示意，开发未在线调用。\n\n在 OpenAI 官方 Python SDK 中")
    multi = '''import asyncio
import os
from openai import AsyncOpenAI

# 独立API示意；仅在读者自己调用时产生费用，不在导入时运行。
async def independent_candidates(task, approved_base):
    if approved_base != "https://api.deepseek.com":
        raise ValueError("示例只授权当前DeepSeek目的地")
    async with AsyncOpenAI(api_key=os.environ["DEEPSEEK_API_KEY"],
                           base_url=approved_base, max_retries=0, timeout=60) as client:
        async def propose(strategy):
            r = await client.chat.completions.create(
                model="deepseek-flash", max_tokens=600,
                messages=[{"role":"user", "content":f"{task}\\n方向：{strategy}"}],
                extra_body={"thinking":{"type":"disabled"}})
            c = r.choices[0] if r.choices else None
            usable = bool(c and c.finish_reason == "stop" and c.message.content)
            return {"status":"candidate" if usable else "incomplete",
                    "answer":c.message.content if usable else None,
                    "finish_reason":c.finish_reason if c else None,
                    "usage":r.usage.model_dump() if r.usage else None}
        # 预留总输出上限1200，两分支各600；仍需整体deadline与最终验收。
        return await asyncio.wait_for(asyncio.gather(
            propose("需求与约束"), propose("失败与反例")), timeout=120)
'''
    chapters[24] = re.sub(r"```python[\s\S]*?```", lambda _: "```python\n"+multi+"```", chapters[24], count=1)
    for i, body in enumerate(chapters):
        # Decode code-only entities from transport-formatted manuscript.
        body = re.sub(r"```([\s\S]*?)```", lambda m: "```"+html.unescape(m.group(1))+"```", body)
        (ARTICLE / "source" / f"{i:02}.md").write_text(body+"\n", encoding="utf-8")
    links = dict(re.findall(r"\[([^\]]+)\]\((https://[^)]+)\)", "\n".join(chapters)))
    sources = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>来源索引 · agent&amp;harness</title><link rel="stylesheet" href="../../assets/css/core.css"><link rel="stylesheet" href="css/page.css"></head><body><main class="course"><p><a href="./">返回课程</a></p><h1>原始论文与官方方案索引</h1><p>滚动文档核查2026-09-30；结论以各讲标注的版本、任务和预算为准。</p><ol>'
    sources += ''.join(f'<li><a href="{html.escape(url)}" rel="noopener noreferrer">{html.escape(title)}</a></li>' for title,url in links.items())
    sources += '</ol></main></body></html>'
    (ARTICLE / "sources.html").write_text(sources, encoding="utf-8")
    print(f"Imported {len(chapters)} lectures, {len(links)} source entries")


if __name__ == "__main__":
    import_manuscripts(sys.argv[1])
