# Brief for lesson writers

You are rewriting lessons of a Chinese-language course "agent&harness从入门到精通" in this repo (a static site). The
complaint about the current lessons: the body text is thin and too terse, explanations are not detailed enough, and
there are too few animations and diagrams. Your job is a substantial rewrite of the lessons assigned to you: much
fuller, friendlier explanation and 3–5 animated figures per lesson.

## First read, completely and carefully

1. `tools/AGENT-HARNESS-AUTHORING.md`: structure, voice, fact rules, the running example numbers, the
   Markdown / callout / figure syntax, how to check your work.
2. `blog/agent-harness/source/01.md` (lesson 2, already rewritten): the reference for tone, depth and figure use.
3. The lab source that goes with each assigned lesson, so your lead-in to the embedded experiment is accurate:
   `blog/agent-harness/js/lab-*.mjs`, or `js/agent.mjs` + `js/theater.mjs` + `js/fixture.mjs` for the
   react / repair / selection / workers theaters.

## Then, per assigned lesson

Read the existing `source/NN.md` (the factual base: keep every claim and every source link, do not strengthen
claims, do not add unverified numbers or URLs), and rewrite that file in place following the skeleton in the guide:
goal callout; 4–7 `##` sections, each opening with a plain-language framing, then the mechanism, then cost and
failure; 3–5 figures of mixed kinds; an example, a pitfall, a table where useful; `::lab` after the section that
explains it, with a lead-in sentence; a recap. Target 3 500–6 000 Chinese characters of prose per lesson. Write like a
good teacher for a reader who can code a little but has never built an agent: define terms at first use, use the fixed
purchase-task numbers from the guide, say what a mechanism buys AND costs. Figures must teach a mechanism in motion.

Write each lesson to disk as soon as it is reasonably complete, then refine it, so that work is never lost. Finish
lesson by lesson.

## Boundaries

Only edit your own `source/NN.md` files (NN = lesson number − 1). Do not touch js, css, tools, other lessons,
`examples/`, or generated HTML. Do not run git commands. Do not commit.

## Check your work (from the repo root)

```sh
python tools/build_agent_harness.py --check N
node tools/check_figures.mjs N
python tools/check_agent_snippets.py
python tools/build_agent_harness.py --only N [N…]     # rebuild ONLY your lessons; never the bare build (others write concurrently)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/blog/agent-harness/   # the preview server; if it is down, run `python tools/serve_site.py` in the background
```

Then screenshot every figure with `figshots.py` (command in the guide), at a couple of steps each, and LOOK at the
images with the Read tool. Fix every problem: an arrow through a box, colliding labels, clipped text, a caption that
does not match what is lit, a figure that adds nothing. Iterate until clean. Re-read your prose once as the reader:
is any paragraph vague or padded? is every term explained? does the lab lead-in say what to click and what to notice?

## Final report (under 200 words)

Per lesson: character count, figure count, and anything factual you were unsure about or deliberately left out.

## Course map (other writers do the other lessons; link with `[第 N 讲](#lesson-N)`)

1 模型说做了，系统怎样知道真做了？ · 2 ReAct：行动带来新证据 · 3 工具注册与完整契约 · 4 JSON与函数调用的五层正确性 ·
5 约束解码：动态收窄下一步 · 6 为什么think：改进决策而非拉长文字 · 7 Python + OpenAI SDK：最小可运行ReAct ·
8 窗口会满，任务不能归零 · 9 Claude Code compact与恢复 · 10 位置、干扰与注意力 · 11 标称窗口与有效上下文 ·
12 记忆分类的两条轴 · 13 Markdown、检索与知识图谱 · 14 参数记忆与可更新外部事实 · 15 经验记忆与Skill ·
16 验证为何成为中心，以及独立性 · 17 外部证据与自我纠错 · 18 多模态验证：截图、状态与因果 ·
19 Human-in-the-loop：把人放在正确位置 · 20 Human-out-of-the-loop：有边界的自主 · 21 五种agent架构 ·
22 通信：信息如何跨越边界 · 23 核心论文：从+80.8%到−70.0% · 24 能力饱和与协调税 · 25 等预算比较：token、美元与墙钟 ·
26 权限：提议、许可、执行 · 27 沙箱：限制可达能力 · 28 提示注入与不可信数据 · 29 Trace与replay：可见不等于可复现 ·
30 可靠性：把成本、延迟和复现一起验收

Parts: 1–7 EXECUTE, 8–15 PERSIST, 16–20 GOVERN I, 21–25 MULTI AGENT, 26–30 GOVERN II.
