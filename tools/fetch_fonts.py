"""Download the site's licensed latin font subsets from Google Fonts."""

from pathlib import Path
import re

import requests


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts"
CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Barlow+Condensed:wght@500;600;700&"
    "family=JetBrains+Mono:wght@400;500&display=swap"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    response = session.get(CSS_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    blocks = re.findall(r"/\* latin \*/\s*@font-face\s*\{(.*?)\}", response.text, re.S)
    if len(blocks) != 5:
        raise RuntimeError(f"Expected five latin font faces; got {len(blocks)}")
    for block in blocks:
        family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        url = re.search(r"url\(([^)]+)\)", block).group(1)
        result = session.get(url, timeout=30)
        result.raise_for_status()
        if not result.content.startswith(b"wOF2"):
            raise RuntimeError(f"Not WOFF2: {url}")
        path = OUT / f"{family.lower().replace(' ', '-')}-{weight}-latin.woff2"
        path.write_bytes(result.content)
        print(f"{path.relative_to(ROOT)}: {len(result.content)} bytes")
    for family in ("barlowcondensed", "jetbrainsmono"):
        url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{family}/OFL.txt"
        result = session.get(url, timeout=30)
        result.raise_for_status()
        path = OUT / f"{family}-OFL.txt"
        path.write_text(result.text, encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: OFL")


if __name__ == "__main__":
    main()
