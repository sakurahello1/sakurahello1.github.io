"""Check local HTML links and resources for this static GitHub Pages site.

Run from any directory with ``python tools/check_links.py``. The report is written
to tools/LINKCHECK.md. External URLs and data URIs are outside this check.
"""

from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import posixpath
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "tools" / "LINKCHECK.md"
PENDING = {f"projects/{slug}" for slug in ("ppt-studio", "harnessrouter", "inkreel")}
URL_ATTRS = {"href", "src", "poster", "data", "xlink:href"}
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
SRCSET_ITEM = re.compile(r"(?:^|,)\s*([^\s,]+)")


def css_urls(css: str):
    for match in CSS_URL.finditer(css):
        yield match.group(2).strip(), css.count("\n", 0, match.start())


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, int]] = []
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        line, _ = self.getpos()
        self.in_style = tag == "style"
        for name, value in attrs:
            if not value:
                continue
            if name in URL_ATTRS:
                # <object data> and SVG <use xlink:href> are resources too.
                self.links.append((value, line))
            elif name == "srcset":
                self.links.extend((m.group(1), line) for m in SRCSET_ITEM.finditer(value))
            elif name == "style":
                self.links.extend((url, line + offset) for url, offset in css_urls(value))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "style":
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            line, _ = self.getpos()
            self.links.extend((url, line + offset) for url, offset in css_urls(data))


def local_target(source: Path, raw: str) -> tuple[str, Path | None]:
    raw = raw.strip()
    if not raw or raw.startswith(("#", "//")):
        return "skip", None
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc:
        return "skip", None
    path = unquote(parsed.path).replace("\\", "/")
    if not path:
        return "skip", None
    base = "" if path.startswith("/") else source.parent.relative_to(ROOT).as_posix()
    relative = posixpath.normpath(posixpath.join(base, path.lstrip("/")))
    if relative == ".." or relative.startswith("../"):
        return "error", None
    if relative == ".":
        relative = ""
    target = ROOT / relative
    if raw.split("?", 1)[0].split("#", 1)[0].endswith("/") or not relative:
        target /= "index.html"
    elif target.is_dir():
        target /= "index.html"
    return "local", target


def is_pending(target: Path) -> bool:
    relative = target.relative_to(ROOT).as_posix()
    return relative.endswith("/index.html") and relative.removesuffix("/index.html") in PENDING


def exact_exists(target: Path) -> bool:
    """GitHub Pages is case sensitive even when the local filesystem is not."""
    current = ROOT
    try:
        parts = target.relative_to(ROOT).parts
    except ValueError:
        return False
    for part in parts:
        if not current.is_dir() or part not in {p.name for p in current.iterdir()}:
            return False
        current /= part
    return current.is_file()


def main() -> int:
    html_files = sorted(ROOT.rglob("*.html"))
    css_files = sorted(ROOT.rglob("*.css"))
    checked = 0
    skipped = 0
    missing: list[tuple[str, int, str]] = []
    pending: list[tuple[str, int, str]] = []

    def check(source: Path, raw: str, line: int):
        nonlocal checked, skipped
        status, target = local_target(source, raw)
        if status == "skip":
            skipped += 1
            return
        checked += 1
        label = source.relative_to(ROOT).as_posix()
        if status == "error" or target is None:
            missing.append((label, line, raw))
        elif exact_exists(target):
            return
        elif is_pending(target):
            pending.append((label, line, target.relative_to(ROOT).as_posix()))
        else:
            missing.append((label, line, raw))

    for source in html_files:
        parser = LinkParser()
        parser.feed(source.read_text(encoding="utf-8"))
        parser.close()
        for raw, line in parser.links:
            check(source, raw, line)
    for source in css_files:
        content = source.read_text(encoding="utf-8")
        for raw, offset in css_urls(content):
            check(source, raw, offset + 1)

    lines = [
        "# 站内链接检查",
        "",
        "运行：`python tools/check_links.py`。检查所有 HTML 的站内 `href`、`src`、`srcset`、`poster`、`data`、内联 CSS `url()`，以及 CSS 文件的 `url()`；跳过外部 URL、纯锚点和 data URI。目录链接要求存在 `index.html`。路径大小写按 GitHub Pages 的规则检查。",
        "",
        f"- HTML 文件：{len(html_files)}；CSS 文件：{len(css_files)}",
        f"- 站内引用：{checked}；跳过：{skipped}",
        f"- 错误：{len(missing)}；待建项目页引用：{len(pending)}",
        "",
        "## 错误",
        "",
    ]
    lines.extend(f"- `{source}:{line}` → `{raw}`" for source, line, raw in missing)
    if not missing:
        lines.append("无。")
    lines += ["", "## 待建项目详情页", ""]
    counts = Counter(target for _, _, target in pending)
    lines.extend(f"- `{target}`（{count} 处引用）" for target, count in sorted(counts.items()))
    if not pending:
        lines.append("无。")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"HTML={len(html_files)} CSS={len(css_files)} local={checked} errors={len(missing)} pending={len(pending)}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
