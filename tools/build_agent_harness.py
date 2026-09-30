"""Build separately addressable chapter fragments from checked-in author Markdown.

Usage: python tools/build_agent_harness.py
No third-party runtime dependencies. The deliberately small renderer supports
headings, paragraphs, fenced code, lists and links used by this article only.
Author content is trusted; all raw HTML is escaped.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "blog" / "agent-harness"
TITLES = [
    "模型说做了，系统怎样知道真做了？", "ReAct：行动带来新证据", "工具注册与完整契约",
    "JSON与函数调用的五层正确性", "约束解码：动态收窄下一步", "为什么think：改进决策而非拉长文字",
    "Python + OpenAI SDK：最小可运行ReAct", "窗口会满，任务不能归零", "Claude Code compact与恢复",
    "位置、干扰与注意力", "标称窗口与有效上下文", "记忆分类的两条轴", "Markdown、检索与知识图谱",
    "参数记忆与可更新外部事实", "经验记忆与Skill", "验证为何成为中心，以及独立性", "外部证据与自我纠错",
    "多模态验证：截图、状态与因果", "Human-in-the-loop：把人放在正确位置", "Human-out-of-the-loop：有边界的自主",
    "五种agent架构", "通信：信息如何跨越边界", "核心论文：从+80.8%到−70.0%", "能力饱和与协调税",
    "等预算比较：token、美元与墙钟", "权限：提议、许可、执行", "沙箱：限制可达能力", "提示注入与不可信数据",
    "Trace与replay：可见不等于可复现", "可靠性：把成本、延迟和复现一起验收",
]
LABS = ["react", "react", "schema", "schema", "grammar", "budget", "react", "compact", "compact",
        "position", "position", "memory", "memory", "selection", "skill", "verify", "repair", "verify",
        "hitl", "hitl", "workers", "workers", "budget", "budget", "workers", "security", "security",
        "security", "trace", "trace"]
PARTS = [(0, 7, "EXECUTE", "让动作真实发生"), (7, 15, "PERSIST", "让工作能够恢复"),
         (15, 20, "GOVERN I", "以证据判断完成"), (20, 25, "MULTI AGENT", "改变计算分配与信息流"),
         (25, 30, "GOVERN II", "把可靠性与安全做成边界")]


def inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    def link(m):
        url = html.unescape(m.group(2))
        if not (url.startswith("https://") or url.startswith("../") or url.startswith("#")):
            return m.group(1)
        return f'<a href="{html.escape(url, quote=True)}" rel="noopener noreferrer">{m.group(1)}</a>'
    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, escaped)


def render(md: str) -> str:
    result, paragraph, code, listing = [], [], None, False
    def flush():
        if paragraph:
            result.append("<p>" + inline(" ".join(paragraph)) + "</p>")
            paragraph.clear()
    for line in md.splitlines():
        if line.startswith("```"):
            flush()
            if code is None:
                code = []
            else:
                result.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
                code = None
            continue
        if code is not None:
            code.append(line)
            continue
        is_list = bool(re.match(r"^(?:[-*] |\d+[.)] )", line))
        if listing and not is_list:
            result.append("</ul>")
            listing = False
        if is_list:
            flush()
            if not listing:
                result.append("<ul>")
                listing = True
            result.append("<li>" + inline(re.sub(r"^(?:[-*] |\d+[.)] )", "", line)) + "</li>")
        elif line.startswith("#"):
            flush()
            result.append("<h4>" + inline(line.lstrip("# ")) + "</h4>")
        elif not line.strip():
            flush()
        else:
            paragraph.append(line)
    flush()
    if listing:
        result.append("</ul>")
    if code is not None:
        raise ValueError("unclosed code fence")
    return "\n".join(result)


def build():
    chapters = ARTICLE / "chapters"
    chapters.mkdir(exist_ok=True)
    cards = []
    total = 0
    for start, end, name, subtitle in PARTS:
        cards.append(f'<div class="part-head" id="part-{start}"><p class="spec-label mono">{name}</p><h2>{subtitle}</h2></div>')
        for i in range(start, end):
            source = ARTICLE / "source" / f"{i:02}.md"
            if not source.exists():
                raise FileNotFoundError(f"Required author source missing: {source}")
            md = source.read_text(encoding="utf-8")
            total += len(re.findall(r"[\u4e00-\u9fff]", md))
            body = render(md)
            body = body.replace('../agent-harness/examples/README.md', '/blog/agent-harness/examples/README.md')
            lab = f'<div><button type="button" data-lab="{LABS[i]}">加载本讲交互实验</button></div>'
            fragment = body + lab
            (chapters / f"{i:02}.html").write_text(fragment, encoding="utf-8")
            standalone = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(TITLES[i])}</title>
<link rel="stylesheet" href="../../../assets/css/core.css"><link rel="stylesheet" href="../css/page.css"></head>
<body><main class="course"><p><a href="../#lesson-{i}">返回完整课程与交互实验</a></p>
<h1>{html.escape(TITLES[i])}</h1><article class="chapter">{body.replace('href="examples/', 'href="../examples/')}</article></main></body></html>'''
            (chapters / f"{i:02}-read.html").write_text(standalone, encoding="utf-8")
            cards.append(f'''<section class="lesson" id="lesson-{i}" data-sec="{name}">
<div class="lesson-head"><span class="number">{i+1:02}</span><div><h3>{html.escape(TITLES[i])}</h3>
<button type="button" data-chapter="{i:02}" aria-controls="body-{i:02}" aria-expanded="false">展开本讲正文</button>
<a class="action" href="chapters/{i:02}-read.html">独立阅读 / 无JS</a></div></div>
<article class="chapter" id="body-{i:02}" hidden></article></section>''')
    template = (ARTICLE / "source" / "shell.html.template").read_text(encoding="utf-8")
    (ARTICLE / "index.html").write_text(template.replace("<!-- CHAPTERS -->", "\n".join(cards))
                                        .replace("{{CHINESE_COUNT}}", str(total)), encoding="utf-8")
    print(f"Built 30 chapters: {total} Chinese characters; entry {(ARTICLE/'index.html').stat().st_size} bytes")


if __name__ == "__main__":
    build()
