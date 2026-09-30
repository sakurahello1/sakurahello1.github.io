// Lessons 6, 23, 24: the same budget spread over more agents buys less work per agent and more coordination.
import {el, range, select, setup} from './lab-ui.mjs';

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '同一份预算，分给几个 agent',
    dek: '总预算固定 100 格。每多一个 agent，就多一份交接和对齐的开销；任务能不能拆开，决定了墙钟时间能不能跟着变短。',
    note: '这是一个示意模型：协调开销按人数线性增长、验证固定 10 格。它说明“等预算比较”为什么必要，不代表任何论文的实测数字。'
  });
  const n = range(controls, 'agent 数', 1, 8, 3, draw);
  const dep = select(controls, '任务', [['split', '可以拆开并行'], ['chain', '必须一步接一步']], draw);
  const strip = el('div', null, stage, 'dock');
  const legend = el('div', null, stage, 'pills');
  legend.style.margin = '6px 0 16px';
  for (const [c, t] of [['#141413', '解题'], ['#D97757', '协调'], ['#6FA57A', '验证']]) {
    const p = el('span', t, legend, 'pill');
    p.style.borderColor = c;
  }
  const gantt = el('div', null, stage);
  function draw() {
    const k = Number(n.value), coord = Math.min(60, (k - 1) * 8), verify = 10, work = 100 - coord - verify;
    strip.replaceChildren();
    for (let i = 0; i < 96; i++) {
      const cell = el('i', null, strip);
      const u = i / 96 * 100;
      cell.style.background = u < work ? '#141413' : u < work + coord ? '#D97757' : '#6FA57A';
    }
    gantt.replaceChildren();
    const chain = dep.value === 'chain';
    const each = work / k, wall = chain ? work + coord / 2 : each + coord / k;
    for (let i = 0; i < k; i++) {
      const row = el('div', null, gantt, 'meter-row');
      el('span', `agent ${i + 1}`, row, 'val');
      const bar = el('div', null, row, 'bar');
      bar.style.position = 'relative';
      const start = chain ? each * i + (coord / 2) * (i / Math.max(1, k - 1)) : 0;
      const fill = el('i', null, bar);
      Object.assign(fill.style, {position: 'absolute', left: `${start}%`, width: `${Math.max(1.5, each)}%`});
      el('span', `${each.toFixed(1)} 格`, row, 'val');
    }
    out.replaceChildren(
      el('b', `每个 agent 只分到 ${each.toFixed(1)} 格解题预算`, null, k > 4 ? 'bad' : 'ok'),
      `，协调吃掉 ${coord} 格。${chain ? `任务必须串行，墙钟约 ${wall.toFixed(0)} 格，加人几乎不省时间。` : `任务能并行，墙钟约 ${wall.toFixed(1)} 格。`}` +
      (k > 1 ? '比较多 agent 和单 agent 时，要让两边花同样的预算，不然多出来的只是更多的算力。' : '单个 agent 没有协调开销，这是比较的基线。'));
  }
  draw();
}
