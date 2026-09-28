# 博客风格规范（motion reel · 长文版）

两篇博客要和首页是同一套视觉。**示范页**：`blog/rl-post-training/`，首屏、路线、目录、第一部分扉页、第 1 章已经按本规范完成，其余内容以它为准。动手前先在浏览器里看一遍示范页（`python -m http.server 8765` 后打开 `/blog/rl-post-training/`），尤其是首屏图版和第一部分扉页的动画。

## 1. 文件分工

| 文件 | 作用 | 能不能改 |
|---|---|---|
| `assets/css/core.css` | 共享：字体、色板变量、纸面格线与颗粒、HUD、字体样张式大标题（`.bigtype` / `.spec-label` / `.measure` / 参考线）、`.night`、页脚 `.foot`、`.reveal`、打印 | 不改。确实缺共享能力时写进报告，由我决定 |
| `assets/js/site.js` | 共享：大标题残影、显现、HUD（章节计数 / 时间码 / 刻度）、`window.Reel` 绘图工具 | 不改 |
| 各博客自己的 css / js | 长文组件与图版 | 随意改 |

博客页面的 `<head>` 顺序固定：Google Fonts（只要 Noto Sans SC 400/500/700/900）→ `core.css` → 自己的 css → 设置 `js-motion` 的内联脚本 → `site.js`（defer）→ 自己的 `art.js`（defer，排在 site.js 后面）。不再用 Noto Serif SC、楷体、宋体；Barlow Condensed 和 JetBrains Mono 由 core.css 从本站加载。

## 2. 色板

只用这几种颜色，其他颜色一律删掉（包括深色模式，整站只有浅色）：

| 变量（core.css） | 值 | 用途 |
|---|---|---|
| `--paper` | #EDE8DE | 页面底色（带 76px 横格线，core.css 已画） |
| `--paper-hi` / `--card` | #F5F2EB / #F8F6F1 | 卡片、图框、代码块 |
| `--ink` / `--night` | #141413 | 正文、主形状、深色块（`.night`、警示框、扉页下半） |
| `--ink-2` / `--mute` | #3D3D3A / #7A776F | 次要文字、刻度、说明 |
| `--line` / `--line-2` | 墨色 8.5% / 16% | 细线、卡片底边阴影 `0 1px 0 var(--line-2)` |
| `--clay` | #D97757 | 唯一的强调色：图版底色、方块标记、进度、当前项 |
| `--clay-deep` | #B04F31 | 奶油底上的橙色文字 |
| `--clay-soft` | #F1D6C8 | 浅橙底（要点框、训练中的块） |
| `--ghost-2` | #6A9FB5 | 冷色，只在图表需要第二种区分色时用，深一档用 #36657C |

深砖红 #8E2F1D 只给“坏结果 / 警示曲线”。图表里需要三种区分时：陶土橙、墨色、冷灰蓝，靠明度也能分开。

## 3. 字体与标注

- 正文 Noto Sans SC，17px / 1.85；标题 Noto Sans SC 900。
- 拉丁大字 Barlow Condensed 700 全大写（`.bigtype`，由 site.js 自动加残影）。注意它只有拉丁子集：大字里不要放 → ★ 等符号（↑ ↓ 可以）。
- 等宽标注 `.mono`（JetBrains Mono，全大写，字距 .14–.16em）用于：编号、读数、图注标签、导航。希腊字母和数学记号放进 `text-transform: none` 的 span，否则 σ 会变 Σ。
- 标注前面放一个 8px 陶土橙小方块（`.spec-label` / `.ch-no` / `.part-no` 的 `::before`），列表项和“当前”状态用旋转 45° 的菱形。
- 章节头右上角是空心的大号章节编号（Barlow 700，1.2px 陶土橙描边，CSS counter 生成）。

## 4. 组件（示范页 `css/page.css` 都有，照抄）

- **HUD**：左上角墨色胶囊 badge（链接回首页，显示当前节序号）；右侧 navlinks；底部四角框、时间码（`<body data-tc="秒数">` 把滚动进度映射成阅读时长）、刻度、`NN/NN 节名`。每个大节加 `data-sec="英文短名"`，深色块加 `data-dark`。窄于 1100px 时目录收进右上角的墨色胶囊（`.mbar`）。
- **首屏**：`spec-label` → 两行 `.bigtype`（英文短标题）→ `.measure` 尺寸线 → 中文大标题（900，关键词陶土橙）+ 导语 + 菱形 meta + 两个胶囊按钮 → 全宽陶土橙“舞台”画布，左上图号、右上实时读数、底部一句交互提示。
- **部分扉页** `.part`：圆角 20px 的墨色卡片；上半是 16:8 的陶土橙画布（左上 `Fig. X · 标题`，右下 Barlow 大字 `PART II`），下半是等宽编号 + 中文标题 + 一段导语。
- **正文图版** `.art`：16:9 画布，底色三选一：陶土橙（默认）/ `.night` 墨色 / `.cream` 卡片。图注 `figcaption` 左边是等宽的 `.fn` 标签。
- **提示框**：`.call.key` 浅橙底；`.call.intu` 卡片底 + 冷灰蓝圆点；`.call.warn` 墨色底、白字、橙色菱形标签。
- **推导折叠**：卡片 + 墨色圆形 +/−，展开后变陶土橙。
- **表格**：三线表：表头等宽小字、顶线 1.5px 墨色、行间 `--line-2`。
- **按钮 / 分段选择**：胶囊，1.5px 墨色边，选中为墨色底奶油字；滑块 `accent-color: var(--clay)`。
- **页脚**：`.foot.night` + “下一篇”两栏大字 + 描边大字 `Hao Lyu`。

## 5. 图版（代替所有 AI 插图）

原来的 AI 插图、雕版图一律删掉，换成代码绘制的动画。每张图都要**是它所在章节讲的那件事本身**，而不是比喻：

- 用 `Reel.cover('名字', function (ctx, W, H, t, dt, st) {...})` 注册，HTML 里放 `<canvas data-cover="名字" role="img" aria-label="自绘示意动画：……">`。`Reel.stage` 已经处理了 DPR、尺寸变化、只在可见时运行、减弱动态效果时停在第 6 秒的静帧。
- 形状语汇来自首页：菱形 → 方块 → 圆 → 十字（`Reel.drawShape(ctx, x, y, size, morph 0..3, rot, color, fringe)`），线条 1.5px 墨色，虚线表示约束 / 边界。
- 配色：陶土橙或墨色底；墨色画主体；**白色只给此刻被采样 / 被选中 / 正在移动的东西**；最多再用 `rgba(20,20,19,.2–.35)` 的淡墨画等高线和辅助线。
- 画面里要有一个实时读数（等宽 10–11px，左上或右上，不要压住主体），数字由动画当场算出。
- 在 360px 宽度下标签不能相互遮挡，也不能越出画布；标签靠近右边缘时改成向左排。
- 图注写清楚画的是什么过程，末尾不需要再写“示意”；全文末尾的尾注统一说明“图版为代码绘制的示意动画，数字由动画当场算出”。

示范：`blog/rl-post-training/js/art.js` 里的 `rl-policy`（组内比较 + 信赖域截断，把分布推向奖励峰）和 `rl-fork`（REINFORCE：线宽 = 概率，高于基线的路被调粗）。

## 6. 验收

- 1440 / 1100 / 768 / 390 / 360 五个宽度：`document.documentElement.scrollWidth === innerWidth`，控制台无报错。
- 每个图版、每个实例都要截图看过；动画在屏幕外时不运行。
- `prefers-reduced-motion: reduce` 下所有画布显示完整静帧。
- 不引入新的外部依赖；公式、实例的功能不能坏。
