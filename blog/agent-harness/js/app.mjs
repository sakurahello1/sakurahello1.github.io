// The course reader: routing between the overview and one lesson, the sidebar, reading progress,
// the connect dialog, code-block controls and the experiments that mount inside each lesson.
import {Credentials, normalizeBase} from './transport.mjs';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DEEPSEEK = 'https://api.deepseek.com';
const PREFS = 'agent-harness:prefs:v1', READ = 'agent-harness:read:v1';
const store = (() => { try { return {session: sessionStorage, local: localStorage}; } catch { return {}; } })();
const vault = new Credentials(store.session, store.local);
const prefs = (() => { try { return JSON.parse(store.local.getItem(PREFS)) || {}; } catch { return {}; } })();
prefs.base ||= DEEPSEEK; prefs.model ||= 'deepseek-flash';
const savePrefs = () => { try { store.local.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
const read = new Set((() => { try { return JSON.parse(store.local.getItem(READ)) || []; } catch { return []; } })());

/* ---------- connection ---------- */
let running = null, pendingLive = null;
const host = {
  credentials() {
    const v = vault.read(prefs.base);
    return v ? {base: prefs.base, key: v.key, model: prefs.model} : null;
  },
  requestConnect(theater) { pendingLive = theater || null; openConnect(); },
  claim(c) { if (running) throw new Error('另一个实验正在运行，先等它结束或重置'); running = c; },
  release(c) { if (running === c) running = null; }
};
function paintConnection() {
  const on = !!host.credentials();
  $('#conn-dot').classList.toggle('on', on);
  $('#conn-label').textContent = on ? `${prefs.base === DEEPSEEK ? 'DeepSeek' : new URL(prefs.base).host} · ${prefs.model}` : '连接模型';
}
const dialog = $('#connect');
const status = (text, kind = '') => { const el = $('#connect-status'); el.textContent = text; el.className = `connect-status ${kind}`; };
function provider() { return dialog.querySelector('input[name=provider]:checked').value; }
function syncProvider() {
  const custom = provider() === 'custom';
  $('#base-field').hidden = !custom;
  if (!custom) $('#base').value = DEEPSEEK;
  try { $('#dest').textContent = new URL($('#base').value).host; } catch { $('#dest').textContent = '（地址无效）'; }
}
function openConnect() {
  const custom = prefs.base !== DEEPSEEK;
  dialog.querySelector(`input[name=provider][value=${custom ? 'custom' : 'deepseek'}]`).checked = true;
  $('#base').value = prefs.base; $('#model').value = prefs.model;
  const saved = vault.read(prefs.base);
  $('#key').value = ''; $('#key').type = 'password'; $('#key-eye').textContent = '显示';
  $('#key').placeholder = saved ? `已保存 …${saved.key.slice(-4)}（留空则沿用）` : 'sk-…';
  $('#remember').checked = saved?.mode === 'tab';
  syncProvider();
  status(saved ? '已连接。可以直接关闭，或换一个密钥。' : '');
  dialog.showModal();
}
function formValues() {
  const base = normalizeBase($('#base').value.trim());
  const key = $('#key').value.trim() || vault.read(base)?.key;
  if (!key) throw new Error('请填入 API key');
  const model = $('#model').value.trim();
  if (!model) throw new Error('请填入模型名');
  return {base, key, model};
}
dialog.querySelectorAll('input[name=provider]').forEach(r => r.addEventListener('change', syncProvider));
$('#base').addEventListener('input', syncProvider);
$('#key-eye').addEventListener('click', () => {
  const show = $('#key').type === 'password';
  $('#key').type = show ? 'text' : 'password';
  $('#key-eye').textContent = show ? '隐藏' : '显示';
});
$('#test').addEventListener('click', async () => {
  let v;
  try { v = formValues(); } catch (e) { status(e.message, 'err'); return; }
  status('正在测试…');
  try {
    const r = await fetch(v.base + '/models', {headers: {Authorization: `Bearer ${v.key}`}, credentials: 'omit',
      redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer'});
    if (r.status === 401 || r.status === 403) { status(`密钥被拒绝（HTTP ${r.status}）。`, 'err'); return; }
    if (!r.ok) { status(`接口返回 HTTP ${r.status}，模型列表拿不到，但运行时也许可以。`, 'err'); return; }
    const ids = ((await r.json()).data || []).map(m => m.id).filter(x => typeof x === 'string').slice(0, 12);
    $('#model-list').replaceChildren(...ids.map(id => Object.assign(document.createElement('option'), {value: id})));
    status(`连接成功。可用模型：${ids.join('、') || '（未列出）'}`, 'ok');
  } catch {
    status('浏览器没能直接访问这个地址，常见原因是它不允许跨域调用。DeepSeek 官方接口可以。', 'err');
  }
});
$('#save').addEventListener('click', () => {
  let v;
  try { v = formValues(); } catch (e) { status(e.message, 'err'); return; }
  vault.save(v.key, v.base, $('#remember').checked ? 'tab' : 'memory');
  prefs.base = v.base; prefs.model = v.model; savePrefs();
  paintConnection();
  dialog.close();
  if (pendingLive) { const t = pendingLive; pendingLive = null; t.live(); }
});
$('#forget').addEventListener('click', () => {
  running?.abort(); vault.clear(); paintConnection();
  $('#key').value = ''; $('#key').placeholder = 'sk-…';
  status('密钥已从这个页面清除。它不会因此在服务商那边失效。');
});
dialog.addEventListener('close', () => { pendingLive = null; });
$('#connect-open').addEventListener('click', () => openConnect());
document.addEventListener('click', e => { if (e.target.closest('[data-open-connect]')) openConnect(); });
paintConnection();

/* ---------- sidebar ---------- */
const links = $$('.toc a[data-lesson]');
const TITLES = links.map(a => a.querySelector('.toc-t').textContent);
function paintProgress() {
  for (const a of links) a.classList.toggle('read', read.has(Number(a.dataset.lesson)));
  $('#progress-bar').style.width = `${read.size / 30 * 100}%`;
  $('#progress-text').textContent = `已读 ${read.size} / 30`;
}
function toggleToc(open) {
  $('#toc').classList.toggle('open', open);
  $('#toc-scrim').hidden = !open;
  $('#toc-toggle').setAttribute('aria-expanded', String(open));
}
$('#toc-toggle').addEventListener('click', () => toggleToc(!$('#toc').classList.contains('open')));
$('#toc-scrim').addEventListener('click', () => toggleToc(false));
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-lesson]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  location.hash = `#lesson-${a.dataset.lesson}`;
});
paintProgress();

/* ---------- code blocks ---------- */
function wireCode(root) {
  for (const fig of root.querySelectorAll('figure.code')) {
    const pre = fig.querySelector('pre');
    fig.querySelector('.code-copy').addEventListener('click', async e => {
      const text = [...pre.querySelectorAll('.ln')].map(l => l.textContent).join('\n');
      try { await navigator.clipboard.writeText(text); e.target.textContent = '已复制'; }
      catch { e.target.textContent = '复制失败'; }
      setTimeout(() => { e.target.textContent = '复制'; }, 1600);
    });
    fig.querySelector('.code-more')?.addEventListener('click', () => fig.classList.remove('folded'));
    for (const b of fig.querySelectorAll('.code-outline button')) b.addEventListener('click', () => {
      fig.classList.remove('folded');
      const line = pre.querySelectorAll('.ln')[Number(b.dataset.line) - 1];
      fig.querySelectorAll('.code-outline button').forEach(x => x.classList.toggle('on', x === b));
      pre.querySelectorAll('.flash').forEach(x => x.classList.remove('flash'));
      line.classList.add('flash');
      line.scrollIntoView({block: 'center', behavior: 'smooth'});
    });
  }
}

/* ---------- section outline: chips on narrow screens, a sticky rail on wide ones ---------- */
let spy = null;
function outline(body, n) {
  spy?.disconnect();
  const heads = [...body.querySelectorAll('h2')];
  const chips = $('#chips'), rail = $('#rail'), list = $('#rail-list');
  chips.replaceChildren(); list.replaceChildren();
  chips.hidden = rail.hidden = heads.length < 2;
  const buttons = heads.map((h, i) => {
    h.id = `sec-${n}-${i + 1}`;
    const go = () => h.scrollIntoView({behavior: 'smooth', block: 'start'});
    const chip = Object.assign(document.createElement('button'), {type: 'button', textContent: h.textContent});
    chip.addEventListener('click', go);
    chips.append(chip);
    const li = document.createElement('li');
    const b = Object.assign(document.createElement('button'), {type: 'button', textContent: h.textContent});
    b.addEventListener('click', go);
    li.append(b); list.append(li);
    return b;
  });
  spy = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) buttons.forEach((b, i) => b.classList.toggle('on', heads[i] === e.target));
  }, {rootMargin: '-72px 0px -70% 0px'});
  heads.forEach(h => spy.observe(h));
}

/* ---------- experiments ---------- */
async function mountLabs(root) {
  for (const slot of root.querySelectorAll('.lab-slot[data-lab]')) {
    const {mount} = await import('./labs.mjs');
    await mount(slot, slot.dataset.lab, host);
  }
}
const hero = $('[data-theater]');
if (hero) import('./theater.mjs').then(({Theater}) => new Theater(hero, {variant: hero.dataset.theater, host, hero: true}));

/* ---------- routing ---------- */
const cache = new Map();
const fragment = n => {
  if (!cache.has(n)) cache.set(n, fetch(`chapters/${String(n - 1).padStart(2, '0')}.html`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }));
  return cache.get(n);
};
let shown = 0, readTimer = 0;
async function showLesson(n) {
  running?.abort();
  const a = links[n - 1];
  const part = a.closest('.toc-part');
  $('#overview').hidden = true;
  const lesson = $('#lesson');
  lesson.hidden = false;
  $('#lesson-kicker').textContent = `${part.dataset.part} · 第 ${n} 讲 · 约 ${a.dataset.min} 分钟`;
  $('#lesson-title').textContent = TITLES[n - 1];
  document.title = `${n} · ${TITLES[n - 1]} · agent&harness`;
  $('#crumb-lesson').textContent = ` / 第 ${n} 讲`;
  for (const l of links) l.classList.toggle('active', l === a);
  a.scrollIntoView({block: 'nearest'});
  toggleToc(false);
  const body = $('#lesson-body');
  body.replaceChildren();
  shown = n;
  window.scrollTo({top: 0});
  let html;
  try { html = await fragment(n); } catch { body.textContent = '这一讲没加载出来，请刷新重试。'; return; }
  if (shown !== n) return;
  body.innerHTML = html;  // same-origin author HTML built by tools/build_agent_harness.py
  wireCode(body);
  outline(body, n);
  import('./diagram.mjs').then(m => { if (shown === n) m.mountFigures(body); });
  mountLabs(body);
  const pager = $('#pager');
  pager.replaceChildren();
  const make = (k, cls, label) => {
    const link = Object.assign(document.createElement('a'), {className: cls, href: `#lesson-${k}`});
    link.append(Object.assign(document.createElement('span'), {className: 'mono', textContent: label}), TITLES[k - 1]);
    pager.append(link);
  };
  if (n > 1) make(n - 1, 'prev', `← 第 ${n - 1} 讲`);
  if (n < 30) make(n + 1, 'next', `第 ${n + 1} 讲 →`);
  if (n < 30) fragment(n + 1);
  clearTimeout(readTimer);
  const io = new IntersectionObserver(es => {
    if (!es[0].isIntersecting || shown !== n) return;
    io.disconnect();
    read.add(n);
    try { store.local.setItem(READ, JSON.stringify([...read])); } catch {}
    paintProgress();
  });
  io.observe(pager);
}
function showOverview() {
  running?.abort();
  $('#lesson').hidden = true;
  $('#overview').hidden = false;
  $('#crumb-lesson').textContent = '';
  document.title = 'agent&harness从入门到精通';
  for (const l of links) l.classList.remove('active');
  shown = 0;
}
function route() {
  const m = location.hash.match(/^#lesson-(\d+)$/);
  const n = m && Number(m[1]);
  n >= 1 && n <= 30 ? showLesson(n) : showOverview();
}
window.addEventListener('hashchange', route);
route();
document.addEventListener('visibilitychange', () => { if (document.hidden) running?.abort(); });
