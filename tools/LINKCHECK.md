# 站内链接检查

运行：`python tools/check_links.py`。检查所有 HTML 的站内 `href`、`src`、`srcset`、`poster`、`data`、内联 CSS `url()`，以及 CSS 文件的 `url()`；跳过外部 URL、纯锚点和 data URI。目录链接要求存在 `index.html`。路径大小写按 GitHub Pages 的规则检查。

- HTML 文件：9；CSS 文件：7
- 站内引用：149；跳过：647
- 错误：0；待建项目页引用：0

## 错误

无。

## 待建项目详情页

无。
