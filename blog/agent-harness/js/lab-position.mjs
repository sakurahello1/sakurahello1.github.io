// Lessons 10–11: does the model find one fact wherever it sits in a long document full of look-alikes?
import {el, button, select, setup, wait} from './lab-ui.mjs';
import {positionProbe, POSITIONS, LENGTHS} from './agent.mjs';

export function mount(root, kind, host) {
  const {controls, stage, out} = setup(root, {
    title: '把一句话藏在长文档的不同位置',
    dek: '一份备忘录里混着作废的旧报价和别家的报价，真正有效的那一句依次放在开头、1/4、中间、3/4 和结尾，每个位置问模型一次。',
    note: '录像是 deepseek-flash 的一次真实结果：每个位置只问了一次，这道纯检索题在约 3 万 token 的长度下没有答错。它不能说明位置效应不存在，也不能说明它只出现在更长的文档里。'
  });
  const len = select(controls, '文档长度', LENGTHS.map(([k, label]) => [k, label]), () => reset());
  const replayBtn = button('▶ 播放录像', controls, () => replay(), 'btn');
  const liveBtn = button('⚡ 用我的模型测 5 次', controls, () => live(), 'btn primary');
  const doc = el('div', null, stage, 'dock');
  doc.style.gridTemplateColumns = 'repeat(40, 1fr)';
  const cells = Array.from({length: 40}, () => el('i', null, doc));
  const legend = el('p', null, stage, 'legend');
  for (const [color, text] of [['var(--clay)', '有效的那一句'], ['var(--ink)', '干扰项：作废、草稿和别家的报价'], ['var(--line-2)', '普通备忘']]) {
    const item = el('span', null, legend);
    el('i', null, item).style.background = color;
    item.append(text);
  }
  const cards = el('div', null, stage, 'cards3');
  cards.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
  cards.style.marginTop = '14px';
  const slots = POSITIONS.map(d => {
    const c = el('div', null, cards, 'mini');
    el('h5', d === 0 ? '开头' : d === 100 ? '结尾' : `${d}%`, c);
    return {c, body: el('div', '—', c)};
  });
  let busy = false;
  function reset() {
    for (const s of slots) { s.c.className = 'mini'; s.body.textContent = '—'; }
    for (const c of cells) c.className = '';
    out.textContent = '';
  }
  function mark(depth) {
    for (const c of cells) c.className = '';
    for (let i = 0; i < 40; i++) if (i % 9 === 4) cells[i].className = 'seen';
    cells[Math.min(39, Math.round(depth / 100 * 39))].className = 'needle';
  }
  async function show(r) {
    const s = slots[POSITIONS.indexOf(r.depth)];
    s.c.className = `mini ${r.ok ? 'ok' : 'bad'}`;
    s.body.replaceChildren(el('b', r.ok ? '✓ 找到' : '✗ 答错', null), el('br'), el('span', r.answer.slice(0, 24), null, 'val'),
      el('br'), el('span', `${(r.ms / 1000).toFixed(1)} s · ${r.prompt?.toLocaleString() ?? '?'} tok`, null, 'val'));
  }
  function summary(results, source) {
    const hit = results.filter(r => r.ok).length;
    out.replaceChildren(el('b', `${hit} / ${results.length} 个位置答对。`, null, hit === results.length ? 'ok' : 'bad'),
      ` ${source}。每次输入约 ${results[0].prompt?.toLocaleString() ?? '?'} token。`);
  }
  async function replay() {
    if (busy) return;
    busy = true; reset();
    const traces = await fetch(new URL('traces.json', import.meta.url)).then(r => r.json());
    const results = traces[`position-${len.value}`];
    for (const r of results) { mark(r.depth); await wait(Math.min(r.ms, 1400)); await show(r); }
    summary(results, `录像：${traces.meta.recorded}，${traces.meta.model}`);
    busy = false;
  }
  async function live() {
    if (busy) return;
    const credentials = host.credentials();
    if (!credentials) { host.requestConnect(); return; }
    const c = new AbortController();
    try { host.claim(c); } catch (e) { out.textContent = e.message; return; }
    busy = true; reset(); replayBtn.disabled = liveBtn.disabled = true;
    const results = [];
    const lines = LENGTHS.find(([k]) => k === len.value)[2];
    try {
      mark(POSITIONS[0]);
      await positionProbe({credentials, lines, signal: c.signal, onResult: async r => {
        results.push(r); await show(r);
        const next = POSITIONS[results.length];
        if (next != null) mark(next);
      }});
      summary(results, `实时：${credentials.model}`);
    } catch (e) {
      out.textContent = e.name === 'AbortError' ? '已取消。' : e.message;
    } finally {
      host.release(c); busy = false; replayBtn.disabled = liveBtn.disabled = false;
    }
  }
  reset();
}
