# Agent & harness course maintenance

The 30 authoritative Markdown chapters are in `blog/agent-harness/source/`.
`shell.html.template` is the light entry template; the builder emits independent
chapter fragments and readable no-JavaScript pages. The importer is a one-time
author-manuscript tool; routine edits do not need the private source ZIP.

```sh
python tools/build_agent_harness.py
python tools/integrate_agent_harness.py
python tools/serve_site.py
```

Open `http://127.0.0.1:8001/blog/agent-harness/`. The preview sets module MIME
types explicitly because Windows may map `.mjs` to `text/plain`.

```sh
node --test tests/agent_harness.test.mjs
python -m unittest discover -s tests -p test_agent_harness.py -v
python tools/check_agent_snippets.py
python tools/check_links.py
python tools/verify_agent_harness.py
python tools/verify_site.py --offline-fonts
```

The SDK transport test uses the installed official OpenAI SDK and an entirely
local `httpx.MockTransport`. It requires the reference requirements; the
downloaded `test_reference.py` runs without the SDK. No real credentials,
provider inference, analytics or public proxy is used by these checks.

Browser screenshots are generated into `output/playwright/` (ignored), and
the compact behavioral report is `tools/agent-harness-results.json`.
Google Fonts is explicitly mocked as empty CSS during offline checks, exercising
the system Chinese font fallback. Local Barlow and JetBrains font files remain
real resources. This does not verify external font delivery.
The browser dispatcher loads only the requested experiment implementation.
Chapter deep links load one chapter, never the entire course.

Do not replace simulated outcomes with invented live scores. Authenticated
DeepSeek inference remains a user-run verification step. Secret-free HTTP CORS
observations are narrower evidence and do not prove streamed inference works.
