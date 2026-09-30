# Python reference harness

官方 `openai` 是 pip 第三方包，并非 Python 内置标准库。无大型 agent 框架。
浏览器实验用原生 JavaScript；本程序在读者的本机 Python 进程运行，同样采用
model → tool proposal → local validator → executor → observation → verification。

```sh
python harness.py                        # default mock, no dependencies/network/key
python -m venv .venv
# Activate your environment, then:
python -m pip install -r requirements.txt
python harness.py --live --approve-destination https://api.deepseek.com
```

真实模式先在你自己的终端通过环境变量设置 `DEEPSEEK_API_KEY`，不要写进源码、
命令行参数、聊天、截图或版本库。PowerShell 可以用 `Read-Host -AsSecureString`
再在本机转换为进程环境变量；shell 的隐藏输入方式依平台而异。
运行结束清除该变量。SDK必须将凭据转为可用字符串，因此隐藏输入不是进程内加密保证。

可选 `--model deepseek-v4-pro`、`--thinking`；thinking默认关闭以便低预算演示。
工具模式完整保留返回的 `reasoning_content` 到当前运行历史，既不打印也不导出。
每次最多1200输出token，thinking可能用完上限而没有答案：此时判不完整。
最多3次模型调用、4次固定本地工具、60秒单次SDK超时、120秒整体超时，无自动重试。
Ctrl+C取消。取消/网络超时不保证供应商停止计费。

自定义 `--base-url https://your-controlled-endpoint.example` 须再次用
`--approve-destination`明确输入相同目的地；你将把凭据交给该服务，HTTPS不证明可信。
无公共代理、无自动回退。SDK的HTTP客户端关闭redirect。
如果浏览器CORS失败，可直接运行此本地程序；它不是给公网部署的代理服务器。

本示例返回JSON后做独立金额/交期/source校验。匹配这些条件只证明虚构题的覆盖条件，
不是实际采购完成、通用可靠性或论文复现。默认Mock固定轨迹，无随机模型行为。
真实DeepSeek推理没有在开发验收中执行，需读者自愿用低预算自行验证。
2026-09-30模型名/协议参考官方文档；滚动文档和价格可能变化。
