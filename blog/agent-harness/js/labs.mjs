// Mount the experiment a lesson names. The four agent experiments are theaters; the rest are local labs.
const THEATERS = new Set(['react', 'repair', 'selection', 'workers']);
const LOCAL = {schema: 'schema', grammar: 'grammar', compact: 'compact', position: 'position', memory: 'memory',
  skill: 'skill', verify: 'verify', hitl: 'hitl', security: 'hitl', budget: 'budget', trace: 'trace'};
export async function mount(root, kind, host) {
  if (THEATERS.has(kind)) {
    const {Theater} = await import('./theater.mjs');
    return new Theater(root, {variant: kind, host});
  }
  const module = await import(`./lab-${LOCAL[kind]}.mjs`);
  module.mount(root, kind, host);
}
