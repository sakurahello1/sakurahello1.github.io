// Geometry lint for the course figures: overlapping nodes, arrows through nodes, labels that do not fit.
// Usage: node tools/check_figures.mjs [lesson numbers...]
import {readFileSync, readdirSync} from 'node:fs';
import {lint} from '../blog/agent-harness/js/diagram-layout.mjs';

const dir = new URL('../blog/agent-harness/source/', import.meta.url);
const only = process.argv.slice(2).map(Number);
let figures = 0, problems = 0;
for (const name of readdirSync(dir).filter(f => /^\d\d\.md$/.test(f)).sort()) {
  if (only.length && !only.includes(Number(name.slice(0, 2)) + 1)) continue;
  const md = readFileSync(new URL(name, dir), 'utf8');
  for (const [, raw] of md.matchAll(/```figure\n([\s\S]*?)```/g)) {
    const spec = JSON.parse(raw);
    figures++;
    for (const e of lint(spec)) { problems++; console.log(`${name} · ${spec.title}: ${e}`); }
  }
}
console.log(`${figures} figures checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
