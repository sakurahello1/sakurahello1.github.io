// Lessons 29–30: a trace lines up what each layer saw at the same moment; a replay reads it without redoing it.
import {el, button, setup, wait} from './lab-ui.mjs';

const TIMES = ['0 ms', '100 ms', '300 ms', '520 ms'];
const TRACKS = [
  ['agent', ['click(save)', '等待', '报告“已保存”', '任务标记完成']],
  ['界面', ['按钮变灰', '转圈', 'toast：保存成功', '刷新后是旧内容']],
  ['网络', ['—', 'POST /notes', 'HTTP 500', '—']],
  ['数据库', ['旧值', '旧值', '旧值（没写入）', '旧值']]
];
const SAY = [
  '点击保存。到这里各层都还一致。',
  '请求已发出，界面在转圈，数据库还没变，这是正常的中间状态。',
  '矛盾出现了：界面弹出“保存成功”，网络层却是 HTTP 500，数据库也没变。错误被前端吞掉了，agent 只看界面，于是报告成功。',
  '刷新以后旧内容回来了。只有把四条轨道放在同一条时间线上，才看得出失败发生在 300 ms，而不是“保存功能坏了”这么笼统。'
];

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '把一次失败摊开在时间线上',
    dek: '同一次“保存”，agent、界面、网络、数据库各自记下了什么。拖动时间，看四条轨道在哪一刻对不上。',
    note: '回看 trace 只读取记录，不会再点一次保存；真正的重新执行会再次产生副作用，那是另一回事。'
  });
  const lab = el('label', '时间', controls), slider = el('input', null, lab);
  Object.assign(slider, {type: 'range', min: 0, max: 3, value: 0});
  const now = el('b', TIMES[0], lab, 'val');
  const play = button('▶ 自动播放', controls, async () => {
    play.disabled = true;
    for (let i = 0; i < 4; i++) { slider.value = i; draw(); await wait(1600); }
    play.disabled = false;
  }, 'btn primary');
  const table = el('div', null, stage);
  table.style.cssText = 'display:grid;grid-template-columns:70px repeat(4,minmax(0,1fr));gap:6px;align-items:stretch';
  el('span', '', table);
  const heads = TIMES.map(t => el('span', t, table, 'val'));
  const cells = TRACKS.map(([name, row]) => {
    el('b', name, table).style.cssText = 'font-size:13px;align-self:center';
    return row.map(t => el('span', t, table, 'pill'));
  });
  function draw() {
    const k = Number(slider.value);
    now.textContent = TIMES[k];
    heads.forEach((h, i) => { h.style.color = i === k ? 'var(--clay-deep)' : 'var(--mute)'; });
    cells.forEach(row => row.forEach((c, i) => {
      const bad = i === 2 && (row[i].textContent.includes('500') || row[i].textContent.includes('没写入') || row[i].textContent.includes('成功') || row[i].textContent.includes('已保存'));
      c.className = 'pill' + (i > k ? ' dim' : i === k ? (bad ? ' bad' : ' on') : '');
      if (bad && i === k) c.style.textDecoration = 'none';
    }));
    out.replaceChildren(el('b', `${TIMES[k]}：`, null, k === 2 ? 'bad' : 'ok'), SAY[k]);
  }
  slider.addEventListener('input', draw);
  draw();
}
