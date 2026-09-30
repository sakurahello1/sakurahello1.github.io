// Lessons 16, 18: "saved successfully" is a claim. Which evidence can tell a real save from a fake one?
import {el, button, select, setup, wait} from './lab-ui.mjs';

const DEFECTS = [['none', '没有缺陷'], ['memory', '只存在内存里，刷新就没'], ['cover', '保存按钮被弹窗挡住'], ['wrong', '写进了另一个用户的记录（界面读的是本地缓存）'], ['slow', '请求超时，服务端没写入']];
const METHODS = [['claim', '只看 agent 说“已保存”'], ['image', '看一张截图'], ['interaction', '点击后刷新页面再看'], ['state', '刷新 + 查数据库 + 查 trace']];
const SEES = {claim: [], image: ['cover'], interaction: ['cover', 'memory', 'slow'], state: ['cover', 'memory', 'slow', 'wrong']};

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '“已保存”要用什么证明',
    dek: '让 agent 在一个笔记应用里保存一条修改。暗中埋一个缺陷，再选一种验证手段，看它能不能识破。',
    note: '缺陷和“哪种证据能看到哪种缺陷”是预设的故障模型，用来说明证据强弱；它不是某个评估器的实测结果。'
  });
  const defect = select(controls, '埋下的缺陷', DEFECTS);
  const method = select(controls, '验证手段', METHODS);
  const go = button('运行并验收', controls, () => runIt(), 'btn primary');
  const grid = el('div', null, stage, 'cards3');
  const app = el('div', null, grid, 'mini');
  el('h5', '界面', app);
  const note = el('div', '笔记：周五交报价单', app, 'mono-box');
  const toast = el('div', '', app);
  toast.style.cssText = 'min-height:1.8em;margin-top:8px;font-size:13px';
  const db = el('div', null, grid, 'mini');
  el('h5', '数据库', db);
  const dbText = el('div', 'user_a: 周五交报价单', db, 'mono-box');
  const tr = el('div', null, grid, 'mini');
  el('h5', 'trace', tr);
  const trText = el('div', '（空）', tr, 'mono-box');
  const log = (t) => { trText.textContent = trText.textContent === '（空）' ? t : `${trText.textContent}\n${t}`; };
  async function runIt() {
    go.disabled = true;
    const d = defect.value, m = method.value;
    for (const c of [app, db, tr]) c.className = 'mini';
    trText.textContent = '（空）'; out.textContent = '';
    note.textContent = '笔记：周四交报价单（已修改）'; dbText.textContent = 'user_a: 周五交报价单';
    await wait(400);
    log(d === 'cover' ? 'click(save) → 目标被遮挡，脚本强行触发' : 'click(save)');
    toast.textContent = '✓ 保存成功';
    await wait(500);
    if (d === 'none' || d === 'cover') dbText.textContent = 'user_a: 周四交报价单';
    if (d === 'wrong') dbText.textContent = 'user_a: 周五交报价单\nuser_b: 周四交报价单';
    log(d === 'slow' ? 'POST /notes → 超时 (30s)' : 'POST /notes → 200');
    await wait(500);
    if (m === 'claim') { app.classList.add('on'); }
    if (m === 'image') { app.classList.add('on'); log('screenshot()'); }
    if (m === 'interaction' || m === 'state') {
      log('reload()'); app.classList.add('on');
      await wait(400);
      const kept = d === 'none' || d === 'cover' || d === 'wrong';
      note.textContent = kept ? '笔记：周四交报价单（已修改）' : '笔记：周五交报价单';
      toast.textContent = '';
    }
    if (m === 'state') { db.classList.add('on'); tr.classList.add('on'); log('SELECT note WHERE user = a'); }
    await wait(500);
    const caught = d !== 'none' && SEES[m].includes(d);
    const blind = d !== 'none' && !caught;
    const strong = m === 'state' || m === 'interaction';
    if (caught) out.replaceChildren(el('b', 'FAIL，识破了。', null, 'bad'), ` 这种验证能看到“${DEFECTS.find(x => x[0] === d)[1]}”。`);
    else if (blind) out.replaceChildren(el('b', '证据不足。', null, 'bad'), ' 界面上写着保存成功，但这种证据看不到埋下的缺陷。不能因为没看到问题就判 PASS。');
    else if (strong) out.replaceChildren(el('b', 'PASS。', null, 'ok'), m === 'state' ? ' 刷新后内容还在，数据库里写对了用户，trace 里请求正常返回，三方证据一致。' : ' 刷新后内容还在。不过没查数据库，写错用户这类问题它看不到。');
    else out.replaceChildren(el('b', '证据不足。', null, 'bad'), ' 这次确实没有缺陷，但光凭声明或截图，无法和有缺陷的情况区分开。');
    go.disabled = false;
  }
}
