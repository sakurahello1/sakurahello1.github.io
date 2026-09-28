# 项目详情页完成记录

统计日期：2026-09-28。页面中的仓库数字是该日资料包的快照。

## PPT Studio

- 页面：`projects/ppt-studio/index.html`。沿用 HarnessRouter 详情页的 HUD、标题样张、封面、流程、卡片、时间线、下一项目导航与页脚。
- 功能、工作流、架构与部署边界：资料包的 `projects/ppt-studio.md`，并核对 [仓库 README](https://github.com/sakurahello1/ppt-studio#readme)、`pyproject.toml`、`frontend/package.json` 和仓库文件树。
- 2026-08-28 创建、2026-09-20 成本记录、2026-09-22 合并历史及部署入口：资料包的 GitHub 仓库元数据与 `raw/gh/ppt-studio.commits.txt`。211 次提交、10 stars、1 fork、无 GitHub Release 来自该日仓库 API 与提交分页；提交数包含合并历史。
- 三张截图来自该仓库 `frontend/public/help/img05.jpg`、`img06.jpg`、`img07.jpg`。资料包的 `assets/ppt-studio/SOURCES.md` 记录固定 commit、原图 URL、许可和 hash。本站将其转换成 1600px 宽的 WebP，保留原截图中的教程标注。
- 在线版链接来自 README。资料包只取得 `zuoppt.top` 的应用外壳，故页面没有声称已验证登录后的功能。

## Inkreel

- 页面：`projects/inkreel/index.html`。使用相同的详情页结构与 `data-cover="ink"` 画布。
- 短剧流程、版本血缘、说书模式、技术结构及供应商说明：资料包的 `projects/inkreel.md`，并核对 [仓库 README](https://github.com/sakurahello1/inkreel#readme)、`package.json` 与文件树。
- 2026-09-17 首次公开、2026-09-19 改名和说书功能、2026-09-22 交接说明：`raw/gh/inkreel.commits.txt`。10 次提交、1 star、1 fork、无 GitHub Release 来自该日仓库 API 与提交分页。
- 三张截图来自仓库 `docs/screenshots/01-storyboard.jpg`、`02-previz.jpg`、`08-export.jpg`。资料包的 `assets/inkreel/SOURCES.md` 记录固定 commit、原图 URL、许可和 hash。本站转换为长边 1600px 的 WebP；图注明示截图属于沿用旧名“场记”的早期界面。
- [展示页](https://sakurahello1.github.io/inkreel/) 仅作为产品介绍入口，没有写成在线制作服务。

## 省略与边界

- 两页都没有写用户数、下载量、成片数量、评价或性能数据；公开资料不足以核实。
- PPT Studio 没有把配置版本 `1.0.0` 写成 GitHub Release，也没有把仓库提交数解释为作者手写提交数；可编辑重建没有像素级还原承诺。
- Inkreel 没有把截图中的费用写成当前价格，也没有从单进程与 SQLite 推断分布式并发能力；预演截帧是减轻视觉漂移的设计，页面没有保证镜头外观完全一致。

## 本地检查

从站点根目录运行 `python -m http.server`，用 Python Playwright 的 Chromium 打开两页，检查 1280px 与 360px 视口。四种组合均返回 HTTP 200，均无控制台或页面脚本错误；360px 下 `document.documentElement.scrollWidth` 均为 360px。两页的封面 canvas 都绘出非透明像素，六张截图滚动加载后均解码为 1600px 宽。整页截图保存在 `tools/shots/detail/`。
