// Record real runs of the course's agent loop for the theaters' replay.
// Usage: DEEPSEEK_KEY=... node tools/record_agent_trace.mjs [agent|position]  (default: both)
// Writes blog/agent-harness/js/traces.json: for each experiment, the events of one live run and when
// they happened. The key is read from the environment and never written anywhere.
import {readFileSync, writeFileSync} from 'node:fs';
import {run, positionProbe, LENGTHS} from '../blog/agent-harness/js/agent.mjs';

const key = (process.env.DEEPSEEK_KEY || '').trim();
if (!key) throw new Error('set DEEPSEEK_KEY');
const model = 'deepseek-flash';
const only = process.argv[2];
const file = new URL('../blog/agent-harness/js/traces.json', import.meta.url);
const credentials = {base: 'https://api.deepseek.com', key, model};
const jobs = [['react', 'react', 'all'], ['repair', 'repair', 'all'], ['selection-all', 'selection', 'all'],
  ['selection-selected', 'selection', 'selected'], ['selection-lossy', 'selection', 'lossy'], ['workers', 'workers', 'all']];
const traces = only ? JSON.parse(readFileSync(file, 'utf8')) : {};
traces.meta = {model, recorded: new Date().toISOString().slice(0, 10), endpoint: 'api.deepseek.com'};
for (const [name, variant, selection] of only === 'position' ? [] : jobs) {
  const events = [], t0 = Date.now();
  const pass = await run({variant, selection, credentials, signal: new AbortController().signal,
    emit: e => { events.push({t: Date.now() - t0, ...e}); }});
  traces[name] = events;
  const last = events.filter(e => e.type === 'meter').at(-1);
  console.log(name, pass ? 'PASS' : 'FAIL', `${events.length} events, ${Date.now() - t0} ms, calls ${last.calls}, tokens ${last.prompt}/${last.completion}`);
}
for (const [name, label, lines] of only === 'agent' ? [] : LENGTHS) {
  const results = [];
  await positionProbe({credentials, lines, signal: new AbortController().signal, onResult: r => { results.push(r); }});
  traces[`position-${name}`] = results;
  console.log(`position ${name} (${label})`, results.map(r => `${r.depth}%:${r.ok ? 'ok' : 'miss'}:${r.prompt}`).join(' '));
}
const text = JSON.stringify(traces);
if (text.includes(key)) throw new Error('key found in trace');
writeFileSync(file, text);
