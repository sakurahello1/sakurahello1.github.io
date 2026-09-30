// Lessons 8–9: the window fills up; what survives compaction decides whether the work can resume.
import {el, button, select, setup, wait} from './lab-ui.mjs';

const CAP = 10;
const FACTS = [['budget', '预算 ≤ 7600 元'], ['noorder', '不得实际下单'], ['deadline', '10-05 前交付'], ['quote', 'clay：6800 元、税 10%、10-03 到货']];
const KEEP = {
  truncate: {items: [], text: '只留最近的日志'},
  summary: {items: [['summary', '摘要：挑一台性价比高、交付快的电脑']], text: '一句自然语言摘要'},
  checkpoint: {items: [['budget'], ['noorder'], ['deadline'], ['index', '原始记录索引：quote-clay-v2']], text: '结构化交接：目标 / 约束 / 状态 / 证据索引'},
  retrieve: {items: [['budget'], ['noorder'], ['deadline'], ['quote']], text: '结构化交接，并按索引从磁盘取回原文'}
};

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '窗口满了以后，还剩下什么',
    dek: '先让 agent 继续工作直到上下文装满，再选一种压缩方式。压缩之后，检查它还能不能照原来的约束接着干。',
    note: '场景是固定的，用来对比几种交接方式留住了什么；它没有测量任何模型的压缩准确率。'
  });
  const strategy = select(controls, '压缩方式', Object.entries(KEEP).map(([k, v]) => [k, v.text]));
  const work = button('继续工作', controls, () => fill(), 'btn');
  const squash = button('压缩并恢复', controls, () => compact(), 'btn primary');
  button('重置', controls, () => reset(), 'btn ghost');
  const grid = el('div', null, stage, 'cards3');
  grid.style.gridTemplateColumns = '1.3fr 1fr';
  const win = el('div', null, grid, 'mini');
  el('h5', '上下文窗口', win);
  const slots = el('div', null, win, 'pills');
  slots.style.flexDirection = 'column';
  const cap = el('div', null, win, 'meter-row');
  el('span', '占用', cap);
  const capBar = el('i', null, el('div', null, cap, 'bar'));
  const capText = el('span', '', cap, 'val');
  const disk = el('div', null, grid, 'mini');
  el('h5', '磁盘上的原始记录（不在窗口里）', disk);
  const diskList = el('div', null, disk, 'pills');
  diskList.style.flexDirection = 'column';
  for (const t of ['quote-clay-v2：6800 元 / 10% / 10-03', 'quote-ink-v3：6400 元 / 10% / 10-12', 'quote-paper-v1：7100 元 / 10% / 10-04', '任务说明原文']) el('span', t, diskList, 'pill dim');
  let items = [], logs = 0;
  const label = ([k, t]) => t || FACTS.find(f => f[0] === k)[1];
  function paint(state = {}) {
    slots.replaceChildren();
    for (const it of items) el('span', label(it), slots, 'pill' + (state[it[0]] ? ` ${state[it[0]]}` : ''));
    for (let i = 0; i < logs; i++) el('span', `日志 #${i + 1}：搜索、比价、中间推理……`, slots, 'pill dim');
    const used = items.length + logs;
    capBar.style.width = `${Math.min(100, used / CAP * 100)}%`;
    capBar.className = used >= CAP ? 'clay' : '';
    capText.textContent = `${used}/${CAP}`;
  }
  function reset() {
    items = [['goal', '目标：买一台笔记本'], ...FACTS.map(([k]) => [k])];
    logs = 0; out.textContent = ''; work.disabled = false; squash.disabled = true;
    for (const p of diskList.children) p.className = 'pill dim';
    paint();
  }
  async function fill() {
    work.disabled = true;
    while (items.length + logs < CAP) { logs++; paint(); await wait(160); }
    out.replaceChildren(el('b', '窗口满了。', null, 'bad'), ' 再往下做，就得决定丢掉什么。');
    squash.disabled = false;
  }
  async function compact() {
    squash.disabled = true;
    const plan = KEEP[strategy.value];
    logs = strategy.value === 'truncate' ? 4 : 0;
    items = [['goal', '目标：买一台笔记本'], ...plan.items];
    paint();
    await wait(400);
    if (strategy.value === 'retrieve') {
      diskList.children[0].className = 'pill on';
      await wait(500);
    }
    const kept = new Set(plan.items.map(([k]) => k));
    const state = {};
    for (const [k] of FACTS) state[k] = kept.has(k) ? 'ok' : 'bad';
    paint(state);
    const lost = FACTS.filter(([k]) => !kept.has(k)).map(([, t]) => t);
    out.replaceChildren(lost.length
      ? el('b', `丢了 ${lost.length} 条。`, null, 'bad') : el('b', '约束和证据都在。', null, 'ok'),
      lost.length ? ` 缺少：${lost.join('；')}。${strategy.value === 'checkpoint' ? '约束保住了，但精确报价要按索引回磁盘去取。' : '接着干只能靠猜。'}`
        : ' 交接留下了约束，证据按索引从磁盘取回原文，可以原样继续。');
  }
  reset();
}
