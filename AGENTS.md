# Static site maintenance

Keep changes scoped and preserve existing content and shared visual patterns.
Source for the new course lives in `blog/agent-harness/source/00.md`–`29.md`.
Rebuild its entry, chapters and sources page with `python tools/build_agent_harness.py`;
the page scripts live in `blog/agent-harness/js/` (see tools/AGENT-HARNESS.md).
Do not manually edit generated course HTML. Agent Theory and KL output retain
their separate source locations documented in README; do not edit those outputs.

Preview ES modules on Windows with `python tools/serve_site.py` (port 8001).
Verify course behavior with `python tools/verify_agent_harness.py`, unit behavior
with `node --test tests/agent_harness.test.mjs` and
`python -m unittest discover -s tests -p test_agent_harness.py -v`.
Run `python tools/check_links.py` after site integration. Screenshots go under
`output/playwright/`; the small behavior report is `tools/agent-harness-results.json`.

The Python reference ZIP is rebuilt by `python tools/integrate_agent_harness.py`.
Never use real API keys or paid calls for development verification. The one exception is
re-recording the replays in `js/traces.json` with `tools/record_agent_trace.mjs`, which the
site owner runs with their own key. The reference and browser experiments default to replays
or mocks; real calls require the reader's own key, a bounded budget and cancellation. Keep credential
storage and model text out of telemetry, raw errors, URLs and exports.
