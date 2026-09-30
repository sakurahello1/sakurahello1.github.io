// Shared pieces for the in-lesson experiments: one card layout, small DOM helpers.
export const el = (tag, text, parent, cls) => {
  const x = document.createElement(tag);
  if (text != null) x.textContent = text;
  if (cls) x.className = cls;
  parent?.append(x);
  return x;
};
export const button = (text, parent, fn, cls = 'btn') => {
  const b = el('button', text, parent, cls);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
};
export function select(parent, label, options, change) {
  const l = el('label', label, parent), s = el('select', null, l);
  for (const [v, t] of options) { const o = el('option', t, s); o.value = v; }
  if (change) s.addEventListener('change', change);
  return s;
}
export function range(parent, label, min, max, value, change) {
  const l = el('label', label, parent), r = el('input', null, l);
  Object.assign(r, {type: 'range', min, max, value});
  const v = el('b', String(value), l, 'val');
  r.addEventListener('input', () => { v.textContent = r.value; change?.(); });
  return r;
}
export const wait = ms => new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
// A lab card: title, one-line purpose, controls, a stage to draw in, a result line and a footnote.
export function setup(root, {title, dek, note}) {
  const card = el('section', null, root, 'lab');
  const head = el('div', null, card, 'lab-head');
  el('span', 'LAB', head, 'lab-tag');
  el('h4', title, head);
  if (dek) el('p', dek, card, 'lab-dek');
  const controls = el('div', null, card, 'lab-controls');
  const stage = el('div', null, card, 'lab-stage');
  const out = el('div', null, card, 'lab-out');
  out.setAttribute('role', 'status');
  if (note) el('p', note, card, 'lab-note');
  return {card, controls, stage, out};
}
