// Lesson 15: skills load in layers. The catalog is always there; the manual and scripts only when a task needs them.
import {el, button, setup, wait} from './lab-ui.mjs';

const SKILLS = ['csv-qa：表格质检（缺失、重复、越界）', 'pdf-extract：从 PDF 抽表格', 'sql-migrate：生成数据库迁移', 'img-caption：给图片写说明', 'mail-draft：按模板起草邮件'];
const STEPS = [
  {label: '启动', tokens: 150, add: 'catalog', say: '上下文里只有技能目录：每个技能一行名字和用途，大约 150 token。'},
  {label: '任务到来：给 orders.csv 做质检', tokens: 600, add: 'manual',
    say: '任务和 csv-qa 的描述对上了，这时才把它的 SKILL.md 读进来：先确认字段，再校验 schema、统计错误、生成报告。'},
  {label: '执行 scripts/validate.py', tokens: 120, add: 'result',
    say: '脚本在沙箱里运行，代码本身不进上下文，进来的只有输出：缺失 3 行、重复 2 行、金额越界 1 行。'}
];
const ALL_IN = 5 * (600 + 1500);

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '技能按需加载',
    dek: '把所有技能的说明和脚本一开始就塞进上下文，既贵又容易干扰。分三层：目录常驻，说明书按需读，脚本只看输出。',
    note: 'token 数是为了对比量级估的，实际大小取决于技能内容和模型的分词方式。'
  });
  const next = button('下一步', controls, () => step(), 'btn primary');
  button('重置', controls, () => reset(), 'btn ghost');
  const grid = el('div', null, stage, 'cards3');
  const catalog = el('div', null, grid, 'mini');
  el('h5', '第 1 层 · 技能目录', catalog);
  const catList = el('div', null, catalog);
  const manual = el('div', null, grid, 'mini');
  el('h5', '第 2 层 · SKILL.md', manual);
  const manText = el('div', '（未加载）', manual);
  const result = el('div', null, grid, 'mini');
  el('h5', '第 3 层 · 脚本输出', result);
  const resText = el('div', '（未运行）', result);
  const bars = el('div', null, stage);
  bars.style.marginTop = '16px';
  const row = (label, cls) => {
    const r = el('div', null, bars, 'meter-row');
    el('span', label, r);
    const i = el('i', null, el('div', null, r, 'bar'), cls);
    return [i, el('span', '', r, 'val')];
  };
  const [lazyBar, lazyText] = row('按需加载', 'clay');
  const [allBar, allText] = row('全部塞进去');
  let n = 0, used = 0;
  function paint() {
    lazyBar.style.width = `${used / ALL_IN * 100}%`; lazyText.textContent = `${used} tok`;
    allBar.style.width = '100%'; allText.textContent = `${ALL_IN.toLocaleString()} tok`;
  }
  async function step() {
    if (n >= STEPS.length) return;
    const s = STEPS[n++];
    next.disabled = true;
    if (s.add === 'catalog') { catalog.classList.add('on'); for (const t of SKILLS) { el('div', t, catList, 'val').style.fontSize = '12px'; await wait(120); } }
    if (s.add === 'manual') { catList.children[0].style.color = 'var(--clay-deep)'; manual.classList.add('on'); manText.replaceChildren(el('div', '# CSV 数据质检\n1. 确认输入文件、编码与预期列\n2. 读取领域规则，缺关键规则先提问\n3. 在受控环境运行 scripts/validate.py\n4. 汇总错误，生成报告', null, 'mono-box')); }
    if (s.add === 'result') { result.classList.add('ok'); resText.replaceChildren(el('div', 'missing: 3 rows\nduplicate: 2 rows\nout_of_range(amount): 1 row', null, 'mono-box')); }
    used += s.tokens; paint();
    out.replaceChildren(el('b', `${s.label}。`, null, 'ok'), ' ' + s.say);
    next.disabled = n >= STEPS.length;
    if (n === STEPS.length) out.append(` 一共约 ${used} token，是全部塞进去的 ${Math.round(used / ALL_IN * 100)}%。`);
  }
  function reset() {
    n = 0; used = 0; catList.replaceChildren(); manText.textContent = '（未加载）'; resText.textContent = '（未运行）';
    for (const c of [catalog, manual, result]) c.className = 'mini';
    out.textContent = ''; next.disabled = false; paint();
  }
  reset();
}
