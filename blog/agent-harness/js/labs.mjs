// Import only the requested exercise implementation, not all labs.
const groups = new Set(['react','repair','selection','workers']);
const local = new Set(['schema','grammar','compact','position','memory','skill','verify','hitl','security','budget','trace']);
export async function mount(root,kind,host) {
  if (!groups.has(kind) && !local.has(kind)) throw new Error('未知实验');
  const name=groups.has(kind)?'model':kind==='security'?'hitl':kind;
  const module=await import(`./lab-${name}.mjs`);
  module.mount(root,kind,host);
}
