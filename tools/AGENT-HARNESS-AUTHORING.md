# Writing a lesson for the agent & harness course

Read `blog/agent-harness/source/01.md` (lesson 2) first. It is the reference for tone, structure and figures.
Each lesson is one Markdown file, `blog/agent-harness/source/NN.md` (NN = lesson number − 1). Do not edit the
generated HTML. Nothing outside your lesson files needs to change.

## What a lesson is

A patient, concrete explanation in Chinese for a reader who can program a little but has never built an agent.
The reader should be able to follow it without opening any other tab, understand **why** each mechanism exists,
see it move, and know how it fails. A lesson of 1 000 characters and a wall of links is a failed lesson.

Aim for **3 500–6 000 Chinese characters** of prose per lesson (code and figure JSON not counted), **3–5 figures**,
4–7 `##` sections. Do not pad: if a section has nothing to teach, cut it.

### Skeleton

1. `:::goal 读完这一讲，你能回答` with 3–5 bullets written as questions the lesson answers.
2. `##` sections. Open each with the plain-language version (a scenario, an analogy, a failure the reader has
   probably met) **before** the terminology. Then the mechanism, then where it breaks.
3. At least one `:::example`, one `:::pitfall`, and a table wherever three or more things are compared.
4. `::lab` on its own line, placed **after** the section that explains what the experiment shows. The line before
   it is a short paragraph telling the reader what to click and what to look for. Read the lab's source
   (`js/lab-*.mjs`, or `js/agent.mjs` + `js/theater.mjs` for react / repair / selection / workers) so the lead-in
   is accurate. If `::lab` is missing, the lab is appended at the very end.
5. `:::recap 小结` at the end, 3–6 bullets, each a full claim (not a keyword).

### Voice

- Explain like a good teacher, not a paper. Short paragraphs. Define a term where it first appears.
- Say what a mechanism **buys** and what it **costs**. A lesson that only praises is wrong.
- Concrete before abstract. Prefer the running purchase task (below) or a small code/ops scenario.
- No filler ("众所周知", "值得注意的是" every paragraph), no emoji, no exclamation marks, no second-person pep talk.
- Do not write meta text about the course, about who wrote it, or about earlier drafts.

## Facts

- **Keep every existing claim and every existing source link** of the lesson you are rewriting. You may move and
  reword them, but never strengthen a claim: a paper result stays tied to its model, task and budget; a doc-derived
  statement stays dated the way the original dated it.
- **No new numbers presented as findings.** Illustrative numbers must say so (“示意”, “虚构”). No new benchmark
  results, no invented quotes, no invented API behaviour.
- **No new external URLs** unless you opened the page in this session and it says what you cite. When unsure, do
  not add a link.
- Python snippets must be valid Python 3 (`python tools/check_agent_snippets.py`). Do not change the big code
  block of lesson 7 or anything under `examples/`.

### Running example (use these exact numbers wherever you show the purchase task)

Task: buy a laptop; tax-included budget **7 600 元**; must arrive by **2026-10-05**; candidates clay, ink, paper.
Tools: `lookup_vendor(id)` (read-only), `compute_total(id, quantity)`.

| id | price | tax | delivery | source | tax-included total | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| clay | 6 800 | 10% | 2026-10-03 | quote-clay-v2 | 7 480 | within budget, on time: the answer |
| ink | 6 400 | 10% | 2026-10-12 | quote-ink-v3 | 7 040 | cheapest but too late |
| paper | 7 100 | 10% | 2026-10-04 | quote-paper-v1 | 7 810 | over budget |

The verifier checks five things on the final JSON: parseable, vendor is clay, total 7 480, source
`quote-clay-v2`, delivery `2026-10-03`. Code is fictional; nothing is really bought.

## Markdown you may use

- `## 标题` (section), `### 小标题`, paragraphs, `-` and `1.` lists, `> 引文`, tables, fenced code
  (```python, ```json, ```text), `` `code` ``, `**bold**`, `[text](https://…)`.
- Link to another lesson with `[第 5 讲](#lesson-5)`.
- Callouts: a line `:::key 标题` … a line `:::`. Kinds: `goal`, `key` (the one thing to remember), `pitfall`,
  `example`, `try`, `recap`, `note`. The title is optional; there is a default per kind. Body is Markdown
  (paragraphs, lists, inline). Do not nest a callout or a code fence inside a callout.
- No raw HTML, no images.

## Figures

A figure is a fenced block ```` ```figure ```` containing one JSON object. It is drawn by the reader, with a stepper
under it (‹ 1 2 3 › and a play button); captions come from `steps[i].say`, which may use `**bold**` and `` `code` ``.
Without JavaScript the captions are listed as text, so **every step needs a caption that stands on its own**.
Every figure needs `kind` and `title`. `dek` is the caption shown before the first step. Keep JSON valid (no
trailing commas, no comments) and write it compactly, one node or step per line.

**Every figure must teach something the prose only describes.** Show a mechanism in motion (a request travelling,
a check failing, a budget filling up), not a bulleted list in a box. Steps should tell a story of 4–7 beats.

### `flow`: boxes and arrows that light up

```json
{"kind":"flow","title":"…","dek":"…",
 "nodes":{"a":{"at":[0,0],"text":"上下文","sub":"目标 + 观察","icon":"doc","tip":"点击方块时显示的一句解释"},
          "b":{"at":[1.5,0],"text":"模型","icon":"chip"}},
 "edges":[["a","b","读"],["b","a","写回",{"bend":16,"dashed":true}]],
 "steps":[{"on":["a"],"say":"…"},{"on":["a","b"],"edges":["a>b"],"say":"…"},{"on":["b"],"ok":["b"],"say":"…"}]}
```

- `at: [col, row]`: columns are 176 px apart, rows 92 px apart, fractions allowed; nodes are about 140×54 (wider for
  long text). Two nodes in one row need columns **1.5 apart** when the arrow between them has a label (1.2 when
  it has none); nodes in one column need rows **1.5 apart**. Keep the figure within 5 columns (0 … 4) and 4 rows.
- `text` (short, ≤ 8 Chinese characters), `sub` (≤ 12 characters, optional), `icon` (optional), `tip`
  (optional; makes the node clickable), `tone` (`a` blue, `b` gold, `mute` dashed outline; optional), `w` (width).
- Icons: `doc chip shield terminal eye check user db clock lock box flag bolt search chat warn globe branch loop
  key people cut scale layers`.
- `edges`: `[from, to, label?, {bend?, dashed?}]`. Labels ≤ 4 characters. `bend` is in px: positive bulges to the
  right of the direction of travel, negative to the left. Use it to keep an arrow off a node in between, or to
  separate two arrows that would overlap (a loop back is a natural use). An arrow is a straight line between
  border points otherwise, so **avoid arrows that must pass through another node**.
- `steps`: each step lights `on` (nodes), `edges` (as `"from>to"`, and the light sweeps along them), and may mark
  `ok` / `bad` nodes (green / red; the mark stays for later steps). Nodes and arrows from earlier steps stay
  softly lit; the current step glows. `say` is required.

### `sequence`: who says what to whom, top to bottom

```json
{"kind":"sequence","title":"…","actors":[["用户",""],["harness","你的程序"],["模型",""]],
 "msgs":[["用户","harness","预算 7600"],
         ["harness","模型","目标 + 工具列表",{"say":"该步的说明"}],
         ["模型","harness","调用 lookup",{"dashed":true,"bad":true}]]}
```

- 2–5 actors, at most 9 messages. Actors sit 196 px apart, so a label between neighbours must be ≤ 12 Chinese
  characters (less between mixed Latin text). A message from an actor to itself is drawn as a small loop.
- Each message is a step. `say` is its caption (default: “A → B：label”). `dashed` for returns, `bad` for a
  failure (red).

### `stack`: layers a thing passes through, top to bottom

```json
{"kind":"stack","title":"…","layers":[["可解析","JSON.parse 不报错"],["符合结构","字段、类型、枚举都对"],["业务正确","…"]],
 "steps":[{"at":[0],"say":"…"},{"pass":[0],"at":[1],"say":"…"},{"pass":[0],"fail":[1],"say":"…"}]}
```

`pass` and `fail` are layer indexes and persist; `at` is the layer glowing now. Good for “passes here, fails there”.

### `bars`: proportions and budgets

```json
{"kind":"bars","title":"…","unit":"K","max":10,"rows":[{"label":"第 1 圈","segs":[{"t":"提示","v":3,"tone":"a"},{"t":"观察","v":1,"tone":"c"}]}],
 "steps":[{"rows":[0],"say":"…"},{"rows":[1],"hl":[[1,1]],"say":"…"}]}
```

Tones `a`–`g`. Segment text must be short enough to fit inside its bar; a segment narrower than about 8 % of `max`
shows no text (its hover title still works). `hl` is `[row, segment]`. Numbers must be labelled illustrative
unless they come from a source you cite.

### `compare`: two or three columns side by side

```json
{"kind":"compare","title":"…","cols":[{"title":"做法一","tone":"bad","items":["…","…"]},{"title":"做法二","tone":"ok","items":["…","…"]}],
 "steps":[{"hl":[[0,0],[1,0]],"say":"…"}]}
```

`hl` is `[column, item]`; items a later step will reach are dimmed until then.

### Choosing

Mechanism over time → `sequence` or `flow`. Passing layered checks → `stack`. How much of a budget goes where →
`bars`. Two approaches, item by item → `compare`. A steady spread of kinds through a lesson reads better than three
flows in a row.

## Check your work

```sh
python tools/build_agent_harness.py --check N [N…]     # renders in memory: syntax, figure references; prints size/figure counts
node tools/check_figures.mjs N [N…]                      # geometry: overlapping nodes, arrows through nodes, labels that do not fit
python tools/check_agent_snippets.py                     # Python snippets parse
```

Then **look at your figures**. The preview server runs on http://127.0.0.1:8001 (start it with
`python tools/serve_site.py` from the repo root if it is not up). Several writers work at once, so rebuild only your
own lessons with `python tools/build_agent_harness.py --only N [N…]` (never the bare build), then `figshots.py`
screenshots every figure of a lesson at chosen steps:

```sh
SCRATCH=C:/Users/null/AppData/Local/Temp/claude/G--fable-presentation/ab21deb5-80fb-4bc8-9412-08985c994df7/scratchpad
$SCRATCH/venv-ah/Scripts/python.exe $SCRATCH/pw/figshots.py N 1360 3 -1    # steps 3 and last of every figure of lesson N
# writes $SCRATCH/shots/L{N}-f{figure}-s{step}.png ; open them with the Read tool and fix what looks wrong
```

Things to look for: an arrow running through a box, two labels colliding, text clipped in a node, a step caption
that does not match what is lit, a figure that says nothing the text does not.
