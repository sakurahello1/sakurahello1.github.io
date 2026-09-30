"""Build the agent & harness course from the checked-in author Markdown.

Usage: python tools/build_agent_harness.py
No third-party dependencies. Author content is trusted; all raw HTML is escaped.

Output, all under blog/agent-harness/:
  index.html            the reader: sidebar table of contents, overview, lesson view
  chapters/NN.html      one lesson fragment (body + the slot its lab mounts into)
  chapters/NN-read.html the same lesson as a standalone page, readable without JavaScript
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
PARTS = [(0, 7, "EXECUTE", "让动作真实发生", "闭环、工具契约、结构化输出与一个能跑的最小 harness。"),
         (7, 15, "PERSIST", "让工作能够恢复", "窗口会满：压缩、交接、位置效应，以及几种记忆的取舍。"),
         (15, 20, "GOVERN I", "以证据判断完成", "验证为什么是中心：独立证据、自我纠错、人在环中的位置。"),
         (20, 25, "MULTI AGENT", "改变计算分配与信息流", "五种架构、通信边界、协调税，以及等预算下的公平比较。"),
         (25, 30, "GOVERN II", "把可靠性与安全做成边界", "权限、沙箱、提示注入、trace 与 replay，最后一起验收。")]

PY_KEYWORDS = set("""False None True and as assert async await break class continue def del elif else except
finally for from global if import in is lambda nonlocal not or pass raise return try while with yield""".split())
PY_BUILTINS = set("""print len dict list set tuple str int float bool isinstance range enumerate sorted open
super object type any all min max sum zip map filter repr ValueError KeyError TypeError RuntimeError
Exception""".split())
PY_TOKEN = re.compile(r"""
    (?P<c>\#[^\n]*)
  | (?P<s>[rRbBfFuU]{0,2}(?:\"\"\"[\s\S]*?\"\"\"|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))
  | (?P<d>@[A-Za-z_][\w.]*)
  | (?P<n>\b\d[\d_]*(?:\.\d+)?\b)
  | (?P<w>[A-Za-z_]\w*)
""", re.X)
JSON_TOKEN = re.compile(r'(?P<k>"(?:\\.|[^"\\])*"(?=\s*:))|(?P<s>"(?:\\.|[^"\\])*")|(?P<n>-?\b\d+(?:\.\d+)?\b)|(?P<b>\b(?:true|false|null)\b)')


def segments(code: str, lang: str) -> list[tuple[str, str]]:
    """(class, text) pieces for Python and JSON; class "" is plain text."""
    if lang == "json":
        out, pos = [], 0
        for m in JSON_TOKEN.finditer(code):
            out += [("", code[pos:m.start()]), (m.lastgroup, m.group())]
            pos = m.end()
        return out + [("", code[pos:])]
    if lang != "python":
        return [("", code)]
    out, pos, after_def = [], 0, False
    for m in PY_TOKEN.finditer(code):
        out.append(("", code[pos:m.start()]))
        kind, text = m.lastgroup, m.group()
        if kind == "w":
            if after_def:
                kind, after_def = "f", False
            elif text in PY_KEYWORDS:
                kind, after_def = "k", text in ("def", "class")
            elif text in PY_BUILTINS:
                kind = "b"
            elif text.isupper() and len(text) > 1:
                kind = "u"
            else:
                kind = ""
        out.append((kind, text))
        pos = m.end()
    return out + [("", code[pos:])]


def highlighted_lines(code: str, lang: str) -> list[str]:
    """One HTML string per source line; a token that spans lines is closed and reopened on each."""
    lines = [""]
    for kind, text in segments(code, lang):
        for k, piece in enumerate(text.split("\n")):
            if k:
                lines.append("")
            if piece:
                lines[-1] += f'<span class="t-{kind}">{html.escape(piece)}</span>' if kind else html.escape(piece)
    return lines


def outline(lines: list[str]) -> list[tuple[int, str]]:
    """Top-level definitions of a long Python file, as (line number, label)."""
    marks = []
    for n, line in enumerate(lines, 1):
        m = re.match(r"(?:async\s+)?(def|class)\s+(\w+)|([A-Z][A-Z_]+)\s*=", line)
        if m:
            marks.append((n, f"{m.group(2)}()" if m.group(1) == "def" else m.group(2) or m.group(3)))
    return marks


def code_block(code: list[str], lang: str) -> str:
    lang = lang or "text"
    lines = "".join(f'<span class="ln">{line}</span>' for line in highlighted_lines("\n".join(code), lang))
    long = len(code) > 28
    marks = outline(code) if lang == "python" and len(code) > 60 else []
    nav = ""
    if marks:
        nav = '<nav class="code-outline" aria-label="代码大纲">' + "".join(
            f'<button type="button" data-line="{n}">{html.escape(label)}</button>' for n, label in marks) + "</nav>"
    fold = f'<button type="button" class="code-more">展开全部 {len(code)} 行</button>' if long else ""
    return (f'<figure class="code{" folded" if long else ""}" data-lang="{lang}">'
            f'<figcaption><span class="code-lang">{lang}</span><span class="code-count">{len(code)} 行</span>'
            f'<button type="button" class="code-copy">复制</button></figcaption>{nav}'
            f'<pre tabindex="0"><code>{lines}</code></pre>{fold}</figure>')


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
    result, paragraph, code, lang, listing = [], [], None, "", None

    def flush():
        if paragraph:
            result.append("<p>" + inline(" ".join(paragraph)) + "</p>")
            paragraph.clear()

    def close_list():
        nonlocal listing
        if listing:
            result.append(f"</{listing}>")
            listing = None

    for line in md.splitlines():
        if line.startswith("```"):
            flush(); close_list()
            if code is None:
                code, lang = [], line[3:].strip()
            else:
                result.append(code_block(code, lang))
                code = None
            continue
        if code is not None:
            code.append(line)
            continue
        item = re.match(r"^([-*]|\d+[.)]) (.*)", line)
        if item:
            flush()
            kind = "ol" if item.group(1)[0].isdigit() else "ul"
            if listing != kind:
                close_list(); result.append(f"<{kind}>"); listing = kind
            result.append("<li>" + inline(item.group(2)) + "</li>")
            continue
        close_list()
        if line.startswith("#"):
            flush()
            result.append("<h3>" + inline(line.lstrip("# ")) + "</h3>")
        elif not line.strip():
            flush()
        else:
            paragraph.append(line)
    flush(); close_list()
    if code is not None:
        raise ValueError("unclosed code fence")
    return "\n".join(result)


def part_of(i: int) -> tuple[int, int, str, str, str]:
    return next(p for p in PARTS if p[0] <= i < p[1])


def build():
    chapters = ARTICLE / "chapters"
    chapters.mkdir(exist_ok=True)
    toc, total = [], 0
    for start, end, name, subtitle, _ in PARTS:
        items = []
        for i in range(start, end):
            md = (ARTICLE / "source" / f"{i:02}.md").read_text(encoding="utf-8")
            chars = len(re.findall(r"[\u4e00-\u9fff]", md))
            total += chars
            code_lines = sum(block.count("\n") - 1 for block in re.findall(r"```[\s\S]*?```", md))
            minutes = max(2, round(chars / 400 + code_lines / 40))
            body = render(md).replace('../agent-harness/examples/README.md', '/blog/agent-harness/examples/README.md')
            (chapters / f"{i:02}.html").write_text(body + f'\n<div class="lab-slot" data-lab="{LABS[i]}"></div>\n',
                                                   encoding="utf-8")
            prev_link = f'<a href="{i - 1:02}-read.html">← {html.escape(TITLES[i - 1])}</a>' if i else '<span></span>'
            next_link = f'<a href="{i + 1:02}-read.html">{html.escape(TITLES[i + 1])} →</a>' if i < 29 else '<span></span>'
            (chapters / f"{i:02}-read.html").write_text(f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{i + 1:02} · {html.escape(TITLES[i])}</title>
<link rel="stylesheet" href="../../../assets/css/core.css"><link rel="stylesheet" href="../css/page.css"></head>
<body class="read-page"><main class="lesson-page"><p class="lesson-kicker mono"><a href="../#lesson-{i + 1}">agent&amp;harness · 完整课程与交互实验</a> / {name} / 第 {i + 1} 讲</p>
<h1>{html.escape(TITLES[i])}</h1><article class="prose-lesson">{body.replace('href="examples/', 'href="../examples/')}</article>
<nav class="pager">{prev_link}{next_link}</nav></main></body></html>''', encoding="utf-8")
            items.append(f'<li><a href="chapters/{i:02}-read.html" data-lesson="{i + 1}" data-min="{minutes}">'
                         f'<span class="toc-n">{i + 1:02}</span><span class="toc-t">{html.escape(TITLES[i])}</span></a></li>')
        toc.append(f'<li class="toc-part" data-part="{name}"><p class="toc-part-name"><span class="mono">{name}</span>{subtitle}</p>'
                   f'<ol>{"".join(items)}</ol></li>')
    parts = "".join(
        f'<a class="part-card" href="chapters/{start:02}-read.html" data-lesson="{start + 1}">'
        f'<span class="part-no mono">PART {k + 1} · {name}</span><b>{subtitle}</b><span class="part-dek">{dek}</span>'
        f'<span class="part-range mono">第 {start + 1}–{end} 讲</span></a>'
        for k, (start, end, name, subtitle, dek) in enumerate(PARTS))
    groups = []
    for i in range(30):
        md = (ARTICLE / "source" / f"{i:02}.md").read_text(encoding="utf-8")
        seen, refs = set(), []
        for text, url in re.findall(r"\[([^\]]+)\]\((https://[^)]+)\)", md):
            if url not in seen:
                seen.add(url)
                refs.append(f'<li><a href="{html.escape(url, quote=True)}" rel="noopener noreferrer">{html.escape(re.sub(r"^(来源|分类参考|参考)：", "", text))}</a></li>')
        if refs:
            groups.append(f'<h3><a href="./#lesson-{i + 1}">第 {i + 1} 讲 · {html.escape(TITLES[i])}</a></h3><ul>{"".join(refs)}</ul>')
    (ARTICLE / "sources.html").write_text(f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>来源索引 · agent&amp;harness</title>
<link rel="stylesheet" href="../../assets/css/core.css"><link rel="stylesheet" href="css/page.css"></head>
<body class="read-page"><main class="lesson-page"><p class="lesson-kicker mono"><a href="./">agent&amp;harness · 返回课程</a></p>
<h1>来源索引</h1><article class="prose-lesson"><p>每一讲引用的论文、官方文档和工程文章，按讲次排列。论文结论和它的版本、模型、任务与预算是一体的，引用时请回到原文核对。链接核查于 2026-09-30。</p>
{"".join(groups)}</article></main></body></html>''', encoding="utf-8")
    template = (ARTICLE / "source" / "shell.html.template").read_text(encoding="utf-8")
    page = (template.replace("<!-- TOC -->", "".join(toc)).replace("<!-- PARTS -->", parts)
            .replace("{{CHINESE_COUNT}}", f"{total:,}").replace("{{MINUTES}}", str(round(total / 400))))
    (ARTICLE / "index.html").write_text(page, encoding="utf-8")
    print(f"Built 30 lessons: {total} Chinese characters; entry {(ARTICLE / 'index.html').stat().st_size} bytes")


if __name__ == "__main__":
    build()
