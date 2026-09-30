// Lesson 5: constrained decoding narrows the next token instead of checking the whole answer afterwards.
import {el, button, setup, wait} from './lab-ui.mjs';

// Illustrative next-token distributions for the target {"quantity": 1|2|3}. Not measured from a model.
const STEPS = [
  [['{', .40], ['好的，', .35], ['"quantity"', .15], ['DROP', .10]],
  [['"quantity"', .55], ['"qty"', .30], ['}', .10], ['"id"', .05]],
  [[':', .80], ['=', .15], [',', .05]],
  [['999', .45], ['1', .30], ['"1"', .20], ['2', .05]],
  [['}', .70], [',', .25], [' ', .05]]
];
const ALLOWED = [['{'], ['"quantity"'], [':'], ['1', '2', '3'], ['}']];

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '一步一步收窄的解码',
    dek: '目标格式只有一种：{"quantity": 1、2 或 3}。每一步，模型给所有候选打分；语法把不合法的候选直接屏蔽，再在剩下的里面挑。关掉约束对比一下。',
    note: '候选和概率是为了演示编的，不是某个模型的实测；真实词表有几万个 token，递归语法还需要解析栈。'
  });
  const toggle = el('label', null, controls);
  const box = el('input', null, toggle);
  box.type = 'checkbox'; box.checked = true;
  toggle.append('语法约束');
  button('下一步', controls, () => step(), 'btn primary');
  button('自动解码', controls, async () => { reset(); while (i < STEPS.length) { step(); await wait(900); } });
  button('重置', controls, () => reset(), 'btn ghost');
  const prefix = el('div', null, stage, 'mono-box');
  const list = el('div', null, stage);
  list.style.marginTop = '14px';
  let i = 0, text = '';
  box.addEventListener('change', reset);
  function paint(chosen) {
    prefix.replaceChildren(el('span', text || ' ', null), el('span', i < STEPS.length ? '▍' : '', null, 'hl'));
    list.replaceChildren();
    if (i >= STEPS.length) return;
    const cands = STEPS[i], allowed = ALLOWED[i];
    const keep = box.checked ? cands.filter(([t]) => allowed.includes(t)) : cands;
    const mass = keep.reduce((a, [, p]) => a + p, 0);
    for (const [t, p] of cands) {
      const ok = keep.some(([k]) => k === t);
      const row = el('div', null, list, 'meter-row');
      const label = el('span', t, row, 'val');
      const bar = el('div', null, row, 'bar');
      const fill = el('i', null, bar, t === chosen ? 'clay' : ok ? 'sage' : '');
      fill.style.width = `${(ok ? p / mass : p) * 100}%`;
      el('span', ok ? `${Math.round(p / mass * 100)}%` : '屏蔽', row, 'val');
      if (!ok) { row.style.opacity = '.4'; label.style.textDecoration = 'line-through'; }
    }
  }
  function step() {
    if (i >= STEPS.length) return;
    const keep = box.checked ? STEPS[i].filter(([t]) => ALLOWED[i].includes(t)) : STEPS[i];
    const [pick] = keep.reduce((a, b) => (b[1] > a[1] ? b : a));
    paint(pick);
    text += pick; i++;
    setTimeout(() => {
      paint();
      if (i === STEPS.length) finish();
    }, 500);
  }
  function finish() {
    let q;
    try { q = JSON.parse(text).quantity; } catch { q = undefined; }
    const ok = [1, 2, 3].includes(q);
    out.replaceChildren(el('b', ok ? '合法输出。' : '输出不合法。', null, ok ? 'ok' : 'bad'),
      ok ? ` ${text}：每一步都只能从合法候选里挑，结果一定符合格式。` :
        ` ${text}：没有约束时，每一步都挑了模型最想要的，最后得到一个格式对、业务上不允许的 999。`);
  }
  function reset() { i = 0; text = ''; out.textContent = ''; paint(); }
  reset();
}
