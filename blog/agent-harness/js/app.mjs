import {Credentials, normalizeBase} from './transport.mjs';
const $ = s => document.querySelector(s);
let session, local;
try { session = sessionStorage; local = localStorage; } catch {}
const vault = new Credentials(session, local);
let approved = null, controller = null;
const status = text => { $('#credential-status').textContent = text; };
function forget() {
  controller?.abort(); vault.clear(); approved = null; $('#key').value = '';
  $('#consent').checked = false; status('凭据已清除；此操作不能撤销已发请求或吊销密钥。');
}
$('#forget').addEventListener('click', forget);
$('#base').addEventListener('input', forget);
$('#save').addEventListener('click', () => {
  try {
    const base = normalizeBase($('#base').value);
    if (!$('#consent').checked) throw new Error('请确认显示的目的地');
    const ok = vault.save($('#key').value.trim(), base, $('#retention').value, Number($('#ttl').value));
    approved = base; $('#key').value = '';
    status(ok ? '凭据已绑定该目的地；仅点击真实运行时发送。' : '存储被浏览器阻止，已退回内存模式。');
  } catch (e) { status(e.message); }
});
try {
  const metadata = vault.metadata();
  if (metadata) $('#base').value = metadata.base;
  const restored = vault.read($('#base').value);
  if (restored) status('发现该目的地的保留凭据；请重新勾选目的地确认，再点击确认使用。');
} catch {}
$('#restore').addEventListener('click', () => {
  try {
    const base = normalizeBase($('#base').value);
    if (!$('#consent').checked || !vault.read(base)) throw new Error('无有效凭据或未确认目的地');
    approved = base; status('已确认保留凭据的目的地。');
  } catch(e) { status(e.message); }
});
setInterval(() => {
  const v = vault.read($('#base').value);
  $('#expiry').textContent = v?.mode === 'device' ? `剩余 ${Math.max(0, Math.ceil((v.expiresAt-Date.now())/60000))} 分钟（惰性清理）` : '';
}, 15000);
const pending = new Map();
async function loadChapter(button) {
  const id = button.dataset.chapter;
  const article = document.getElementById(`body-${id}`);
  if (article.dataset.loaded) { article.hidden = !article.hidden; button.setAttribute('aria-expanded', String(!article.hidden)); return; }
  if (pending.has(id)) return;
  button.disabled = true; button.textContent = '加载正文…';
  const job = (async () => {
    try {
      const r = await fetch(`chapters/${id}.html`); if (!r.ok) throw new Error('加载失败');
      // Only same-origin, versioned author HTML; never model/user/tool text.
      article.innerHTML = await r.text(); article.dataset.loaded = 'true'; article.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      for (const open of article.querySelectorAll('[data-lab]')) open.addEventListener('click', async () => {
        if (open.dataset.ready) return;
        open.disabled = true;
        try {
          const module = await import('./labs.mjs');
          await module.mount(open.parentElement, open.dataset.lab, {
            getCredentials() {
              const base = normalizeBase($('#base').value);
              const v = vault.read(base);
              if (!v || approved !== base || !$('#consent').checked) throw new Error('先在设置中绑定凭据并确认目的地');
              return {base, key: v.key, model: $('#model').value};
            },
            claim(c) { if (controller) throw new Error('另一个实验正在运行'); controller = c; },
            release(c) { if (controller === c) controller = null; }
          }); open.dataset.ready = 'true'; open.remove();
        } catch(e) { open.disabled = false; open.textContent = e.message; }
      });
    } catch { article.hidden = false; article.textContent = '正文加载失败，请重试或打开独立章节链接。'; }
    finally { button.disabled = false; button.textContent = '展开 / 收起正文'; pending.delete(id); }
  })(); pending.set(id, job); await job;
}
for (const b of document.querySelectorAll('[data-chapter]')) b.addEventListener('click', () => loadChapter(b));
async function followHash() {
  const match = location.hash.match(/^#lesson-(\d+)$/);
  if (!match || Number(match[1]) > 29) return;
  const button = document.querySelector(`[data-chapter="${match[1].padStart(2, '0')}"]`);
  if (!button) return;
  const article = document.getElementById(button.getAttribute('aria-controls'));
  if (article.hidden) await loadChapter(button);
  button.scrollIntoView({block: 'start'});
}
window.addEventListener('hashchange', followHash); followHash();
document.addEventListener('visibilitychange', () => {
  // Live calls continue only while visible; cancellation cannot guarantee no provider billing.
  if (document.hidden) controller?.abort();
});
window.addEventListener('pagehide', () => controller?.abort());
