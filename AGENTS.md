# Static site maintenance

Keep changes scoped and preserve existing content and shared visual patterns.
Source for the new course lives in `blog/agent-harness/source/00.md`–`29.md`.
Rebuild its entry and chapter output with `python tools/build_agent_harness.py`.
Do not manually edit generated course HTML. Agent Theory and KL output retain
their separate source locations documented in README; do not edit those outputs.

Preview ES modules on Windows with `python tools/serve_site.py` (port 8001).
Verify course behavior with `python tools/verify_agent_harness.py`, unit behavior
with `node --test tests/agent_harness.test.mjs` and
`python -m unittest discover -s tests -p test_agent_harness.py -v`.
Run `python tools/check_links.py` after site integration. Screenshots go under
`output/playwright/`; the small behavior report is `tools/agent-harness-results.json`.

The Python reference ZIP is rebuilt by `python tools/integrate_agent_harness.py`.
Never use real API keys or paid calls for development verification. The reference
and browser experiments default to offline/mock; real calls require explicit user
action, destination binding, bounded budgets and cancellation. Keep credential
storage and model text out of telemetry, raw errors, URLs and exports.
