export const el = (tag, text, parent) => { const x = document.createElement(tag); if (text) x.textContent = text; parent?.append(x); return x; };
export const button = (text, parent, fn) => { const b = el('button', text, parent); b.type = 'button'; b.addEventListener('click', fn); return b; };
export function select(parent, label, options, change) {
  const l = el('label', label, parent), s = el('select', '', l);
  options.forEach(([v,t]) => {const o=el('option',t,s);o.value=v;});
  if (change) s.addEventListener('change', change); return s;
}
export function setup(root) {
  root.classList.add('lab');
  el('p','LAB / 离线教学模拟 · 不代表论文复现或实测模型能力',root).className='caption';
  const controls=el('div','',root); controls.className='controls';
  const view=el('div','',root), output=el('div','',root);output.className='lab-output';
  output.setAttribute('role','status');output.setAttribute('aria-live','polite');
  return {controls,view,output};
}
