# 吕灏 · Hao Lyu 个人站

纯静态个人主页，使用 GitHub Pages 发布到 <https://sakurahello1.github.io/>。

## 目录

| 路径 | 用途 |
| --- | --- |
| `index.html` | 首页：About、Work、Paper、Patent、Honors、Open Source、Writing |
| `projects/<slug>/index.html` | PPT Studio、HarnessRouter、Inkreel、LoopX 四个项目详情页 |
| `blog/index.html` | 博客目录 |
| `blog/rl-post-training/`、`blog/agent-theory/` | 两篇长文。RL 长文直接在这里编辑（`css/`、`js/art.js` 是代码绘制的图版）；Agent 手册由源码 `G:\homepage-blog-src\agent-theory` 的 `python build.py --site <本目录>` 生成，不要手改输出 |
| `blog/kl-divergence/` | 《KL 散度从哪里来》，RL 长文 4.3 节的 “KL 散度” 链到这里，暂未列入博客目录。`index.html` 由 `G:\homepage-blog-src\kl-divergence` 的 `node build.cjs --site <本目录>` 生成（预渲染 KaTeX，并复制 `css/katex.css` 与 `fonts/`），不要手改；`css/page.css`、`css/kl.css`、`js/` 直接在这里编辑 |
| `404.html` | GitHub Pages 的未找到页面 |
| `assets/css/core.css` | 所有页面共享：字体、色板、纸面、HUD、字体样张式大标题、深色块、页脚 |
| `assets/css/site.css`、`assets/js/site.js` | 首页与项目页的版块样式；site.js 负责标题效果、HUD、画布动画，并以 `window.Reel` 向博客提供绘图工具 |
| `assets/img/`、`assets/fonts/` | 图片及本地字体；字体许可证同目录保存 |
| `tools/` | 项目详情模板、链接检查脚本及验收记录 |

## 本地预览

在仓库根目录运行：

```sh
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。请通过服务器预览；直接以 `file://` 打开时，绝对路径资源和部分浏览器功能无法正常工作。运行 `python tools/check_links.py` 可重生成 `tools/LINKCHECK.md`。

## 新增项目详情页

1. 复制 `tools/templates/project-detail.html` 到 `projects/<slug>/index.html`，其中 `<slug>` 与首页卡片的链接一致。模板和目标页距离根目录都是两级，所以 `../../assets/...` 资源路径可以直接沿用。
2. 修改 `<title>`、description、面包屑、英文大标题、中文介绍、事实栏和三个正文段落。`data-sec="Work"` 供 HUD 读取；大标题的 `data-type`、`data-guides` 和 `data-spec` 供 `site.js` 生成效果。
3. 选择封面画布的 `data-cover` 值：`ppt`、`hr`、`ink` 或 `loop`。图片另放在 `assets/img/`，在页面中以 `../../assets/img/文件名` 引用。
4. 检查 `index.html` 的 Work 卡片 `href`、标题、摘要和数据；若新加卡片，再调整相应内容。把新页面加入 `sitemap.xml`，运行链接检查和本地预览。

## 新增博客文章

长文的视觉规范见 `tools/BLOG-STYLE.md`：页面先引 `core.css`，再引自己的样式；插图用 `Reel.cover()` 在画布上绘制，不用图片。在 `blog/<slug>/` 放入 `index.html` 和文章所需脚本等资源。更新 `blog/index.html` 的 `.posts` 列表，填写标题、日期、摘要和按正文汉字数除以 400 估算的“约 N 分钟”；同时更新首页 `index.html` 的 Writing 卡片，并将文章地址加入 `sitemap.xml`。博客目录的封面用 `data-cover="rl"` 或 `data-cover="agent"`，新增动画时需要在 `assets/js/site.js` 的 `covers` 中定义对应名称。

## 更新首页

首页各栏目在 `index.html` 中按 `id` 排列：`about`、`work`、`paper`、`patent`、`honors`、`oss`、`writing`。修改对应 section 的文字、卡片和外链；如果新增或删去栏目，同步调整顶部 `.navlinks` 和章节标注。全站共用的视觉样式放在 `assets/css/site.css`，交互和封面画布在 `assets/js/site.js`。图片放 `assets/img/`，字体文件及 OFL 许可证放 `assets/fonts/`。

## 发布

GitHub Pages 配置为从 `main` 分支根目录发布。推送到 `main` 后由 GitHub Pages 发布；保留根目录的 `.nojekyll`，以便静态文件直接送达。发布前运行链接检查，并用本地服务器检查首页、博客和 404 页面。
