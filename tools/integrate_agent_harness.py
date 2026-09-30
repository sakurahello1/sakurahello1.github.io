"""Idempotent site integration, preserving existing generated article outputs."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
for filename, href in [("index.html", "blog/agent-harness/"), ("blog/index.html", "agent-harness/")]:
    path = ROOT / filename
    text = path.read_text(encoding="utf-8")
    if f'href="{href}"' not in text:
        start = text.index('id="writing"')
        position = text.index('<div class="posts">', start) + len('<div class="posts">')
        card = f'''
      <a class="post reveal" href="{href}">
        <div class="cover clay"><canvas data-cover="harness" aria-hidden="true"></canvas><span class="word">Harness</span></div>
        <div class="body"><p class="kicker mono">2026-09-30 · 30 讲 · 约 70 分钟 · 每讲带实验</p>
          <h3>agent&amp;harness从入门到精通</h3>
          <p>一个 agent 怎样真的把事做完：闭环与工具契约、窗口满了以后的交接、用证据验收、多 agent 的代价、权限与沙箱。每讲带实验，能用你自己的 API key 现场跑。</p>
          <span class="go mono">Read</span></div>
      </a>'''
        text = text[:position] + card + text[position:]
        path.write_text(text, encoding="utf-8")
sitemap = ROOT / "sitemap.xml"
text = sitemap.read_text(encoding="utf-8")
if '/blog/agent-harness/' not in text:
    text = text.replace('</urlset>', '  <url><loc>https://sakurahello1.github.io/blog/agent-harness/</loc></url>\n</urlset>')
    sitemap.write_text(text, encoding="utf-8")
example = ROOT / "blog/agent-harness/examples"
with zipfile.ZipFile(example / "reference.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for name in ["harness.py", "requirements.txt", "README.md", "test_reference.py"]:
        archive.write(example / name, name)
print("Integrated Writing, blog index, sitemap and key-free Python ZIP")
