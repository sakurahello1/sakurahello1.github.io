# 工程收尾报告

## 1. 字体本地化

- `assets/fonts/` 已加入 Barlow Condensed latin WOFF2（500、600、700）和 JetBrains Mono latin WOFF2（400、500），以及各自的 OFL 许可证。下载来源为 Google Fonts；文件头已验证为 WOFF2。
- `assets/css/site.css` 只在顶部新增五条 `@font-face`，每条均使用 `font-display: swap`；原有规则未改。
- 首页、博客目录、404 和三个项目详情页的 Google Fonts 链接仅保留 Noto Sans SC（400、500、700、900）。这些页面的 Barlow Condensed 和 JetBrains Mono 使用本地文件。RL 文章依任务要求恢复其原有 Google Fonts 引用。

## 2. 博客接入

- 两篇文章及其附属资源完整复制到 `blog/rl-post-training/` 和 `blog/agent-theory/`。Agent 文章与给定源文件字节一致；RL 文章只恢复了与原文件一致的三条 Google Fonts `<head>` 引用，MathJax 仍走 `vendor/mathjax/`。
- 新建 `blog/index.html`，复用首页的 HUD、`Writing` 标题标注、卡片和 `data-cover` 动画。RL 日期为 2026-09-28；Agent 文章标注“二〇二六年九月”，目录页据此使用 2026-09。按正文汉字数约 17,907 / 27,178、每分钟 400 字估算，阅读时长为“约 45 分钟”与“约 68 分钟”。

## 3. 辅助页面与文件

- 已添加 `404.html`，资源使用 `/assets/...` 等根路径，并提供首页、博客入口。
- 已添加中文 `README.md`、项目详情模板 `tools/templates/project-detail.html`、`robots.txt` 和包含首页、三个项目页、博客目录及两篇文章的 `sitemap.xml`。
- 根目录 `.nojekyll` 已保留。没有创建 git 仓库、推送或删除现有文件。

## 4. 检查结果

- `python tools/check_links.py`：扫描 9 个 HTML、2 个 CSS、114 处站内引用；**0 个错误、0 个待建项目页**。详情见 `tools/LINKCHECK.md`。
- 使用 `python -m http.server 8000 --bind 127.0.0.1` 和 Python Playwright 检查首页、博客目录、两篇文章、404，分别在 1280px 和 360px 打开。10 次页面请求均为 HTTP 200；控制台错误、页面脚本异常和本地请求失败均为 0。首页、博客目录、404 的 Barlow Condensed 计算样式生效，浏览器从 `/assets/fonts/` 成功加载本地 WOFF2。结果见 `tools/browser-results.json`，10 张截图在 `tools/shots/`。
- 360px 下博客目录与 404 无横向滚动。首页有 **11px** 横向滚动，来自 `site.js` 生成的大标题 `.ghost` 残影；RL 文章有 **16px**，Agent 文章有 **304px**（公式区域）。首页视觉规则、`site.js` 和两篇文章正文按任务要求保持原样，因此这些溢出列为遗留问题。

## 遗留问题

360px 横向滚动仍见于首页和两篇文章。若后续允许调整首页标题残影的裁切边界、文章内 SVG/公式的移动端容器，可再处理；目前未越过任务对设计和文章内容的修改限制。
