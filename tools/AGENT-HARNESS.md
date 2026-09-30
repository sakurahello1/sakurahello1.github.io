# Agent & harness course maintenance

The 30 lessons are Markdown in `blog/agent-harness/source/00.md`–`29.md`; the page shell is
`source/shell.html.template`. `python tools/build_agent_harness.py` generates everything else:
`index.html` (sidebar table of contents + overview), `chapters/NN.html` (one lesson and the slot its
experiment mounts into), `chapters/NN-read.html` (the same lesson without JavaScript) and `sources.html`
(every lesson's links). Do not edit generated files.

```sh
python tools/build_agent_harness.py
python tools/serve_site.py          # http://127.0.0.1:8001/blog/agent-harness/ (module MIME types on Windows)
```

## How the page works

- `js/app.mjs`: hash routing (`#lesson-N`), sidebar state and reading progress (localStorage), the connect
  dialog, code-block copy / unfold / outline jumps, and mounting each lesson's experiment.
- `js/agent.mjs`: the bounded agent loop (5 model calls, 8 tool calls) behind the four theater experiments
  (`react`, `repair`, `selection`, `workers`) and the needle-in-a-haystack probe. It has no DOM, so the same
  code runs in the browser and in Node.
- `js/theater.mjs`: draws the loop diagram, transcript and meters from the loop's events, either a recorded
  run (`js/traces.json`) or a live run against the reader's own model.
- `js/lab-*.mjs`: the other experiments, built on `js/lab-ui.mjs`. `js/fixture.mjs` is the tool contract and
  verifier; `js/transport.mjs` the streaming client and in-browser credential store.
- Code blocks are highlighted at build time; Python files over 60 lines get an outline of their top-level
  definitions, blocks over 28 lines start folded.

## Replays

`js/traces.json` holds one real run of each theater and of the position probe. Re-record after changing a
prompt, the loop or the fixture:

```sh
DEEPSEEK_KEY=... node tools/record_agent_trace.mjs            # everything
DEEPSEEK_KEY=... node tools/record_agent_trace.mjs agent      # theaters only
DEEPSEEK_KEY=... node tools/record_agent_trace.mjs position   # position probe only
```

The recorder reads the key from the environment, refuses to write a file that contains it, and costs well
under a yuan on deepseek-flash. Replays show the recording date and model; a failed run is kept as it is.

## Checks

```sh
node --test tests/agent_harness.test.mjs
python -m unittest discover -s tests -p test_agent_harness.py -v
python tools/check_agent_snippets.py
python tools/check_links.py
python tools/verify_agent_harness.py   # CHROME_PATH=... to use an installed Chromium
```

The browser check exercises every lesson and experiment kind at five widths, answers the live run from a
mocked endpoint with a synthetic key, and checks that the key never reaches the page text, the URL or
storage beyond what the reader chose. Screenshots go to `output/playwright/` (ignored); the summary is
`tools/agent-harness-results.json`.
