(() => {
'use strict';
document.documentElement.classList.add('js');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const DATA = JSON.parse($('#theory-data').textContent);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';
const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const easeIO = (x) => { x = Math.min(Math.max(x, 0), 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

/* ── one clock for every running figure; a figure only runs while it is on screen ── */
const clock = { subs: new Set(), raf: 0, last: 0, t: 0 };
function frame(now) {
  const dt = Math.min(.05, (now - (clock.last || now)) / 1000);
  clock.last = now; clock.t += dt;
  for (const s of clock.subs) if (s.on) s.step(clock.t, dt);
  clock.raf = [...clock.subs].some((s) => s.on) ? requestAnimationFrame(frame) : 0;
  if (!clock.raf) clock.last = 0;
}
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const s = e.target.__anim;
    if (!s) continue;
    s.on = e.isIntersecting && !document.hidden;
    if (s.on && !clock.raf) clock.raf = requestAnimationFrame(frame);
  }
}, { rootMargin: '80px 0px' });
function animate(root, step) {
  if (REDUCE) return;
  const s = { on: false, step, root };
  root.__anim = s;
  clock.subs.add(s);
  seen.observe(root);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { for (const s of clock.subs) s.on = false; return; }
  for (const s of clock.subs) { const r = s.root.getBoundingClientRect(); s.on = r.bottom > -80 && r.top < innerHeight + 80; }
  if (!clock.raf) clock.raf = requestAnimationFrame(frame);
});
/* for testing where requestAnimationFrame is throttled: window.__theory.tick(16, 60) */
window.__theory = { tick(ms = 16, n = 1) { for (let i = 0; i < n; i++) { clock.t += ms / 1000; for (const s of clock.subs) s.step(clock.t, ms / 1000); } } };

/* Shared site.js owns reveal. Legacy standalone output stays visible. */
if (!document.querySelector('script[src$="site.js"]')) {
  for (const r of $$('.reveal')) r.classList.add('in');
}
/* ── running head, rail, reading progress ── */
const runhead = $('.runhead'), rail = $('.rail'), bar = $('.rh-bar');
const rhNum = $('.rh-num'), rhTitle = $('.rh-title');
const cover = $('.cover');
const chapters = $$('.chapter, .back'), parts = $$('.part');
const railLinks = new Map($$('.rail a').map((a) => [a.dataset.sec, a]));
const secById = Object.fromEntries(DATA.sections.map((s) => [s.id, s]));
let lastKey = '';
function onScroll() {
  const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
  const past = y > (cover ? cover.offsetHeight * .8 : 200);
  runhead.classList.add('show');
  rail.classList.toggle('show', past);
  bar.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`;
  const mark = innerHeight * .38;
  let key = '', num = '', title = '';
  for (const c of chapters) if (c.getBoundingClientRect().top < mark) key = c.dataset.sec;
  for (const p of parts) {
    const r = p.getBoundingClientRect();
    if (r.top < mark && r.bottom > mark) { key = 'part-' + p.dataset.part; }
  }
  if (key.startsWith('part-')) { const pt = DATA.parts[key.slice(5)]; num = `第${pt.cn}部分`; title = pt.title; }
  else if (secById[key]) { const s = secById[key]; num = '§' + s.num; title = s.title; }
  else if (key) { num = ''; title = $(`[data-sec="${key}"]`).dataset.title || ''; }
  if (!key) title = 'Agent Theory';
  if (key !== lastKey) {
    lastKey = key;
    rhTitle.style.opacity = 0;
    setTimeout(() => { rhNum.textContent = num; rhTitle.textContent = title; rhTitle.style.opacity = 1; }, 180);
    for (const [id, a] of railLinks) a.classList.toggle('on', id === key);
  }
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
addEventListener('resize', onScroll);
onScroll();

/* table of contents as a sheet */
const sheet = $('.toc-sheet');
const openSheet = () => { sheet.hidden = false; $('.rh-toc').setAttribute('aria-expanded', 'true'); $('.toc-close').focus({ preventScroll: true }); };
const closeSheet = () => { sheet.hidden = true; $('.rh-toc').setAttribute('aria-expanded', 'false'); $('.rh-toc').focus({ preventScroll: true }); };
$('.toc-close').addEventListener('click', closeSheet);
sheet.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const items = $$('a, button', sheet), first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$('.rh-toc').addEventListener('click', openSheet);
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('a')) closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

/* citations: the reference in a card, without leaving the sentence */
const pop = $('.cite-pop');
function showPop(a) {
  const txt = DATA.refs[a.dataset.ref];
  if (!txt) return;
  pop.textContent = `[${a.dataset.ref}] ${txt}`;
  pop.hidden = false;
  const r = a.getBoundingClientRect();
  const w = Math.min(352, innerWidth - 24);
  pop.style.maxWidth = w + 'px';
  const left = Math.max(12, Math.min(scrollX + r.left - 24, scrollX + innerWidth - w - 12));
  pop.style.left = left + 'px';
  pop.style.top = (scrollY + r.bottom + 8) + 'px';
}
for (const a of $$('.cite')) {
  a.addEventListener('mouseenter', () => showPop(a));
  a.addEventListener('focus', () => showPop(a));
  a.addEventListener('mouseleave', () => { pop.hidden = true; });
  a.addEventListener('blur', () => { pop.hidden = true; });
}

/* equation numbers copy their TeX */
const toast = $('.toast');
let toastTimer = 0;
function say(msg) {
  toast.textContent = msg; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 1600);
}
for (const b of $$('.eq-num')) b.addEventListener('click', async () => {
  const tex = b.dataset.tex;
  try { await navigator.clipboard.writeText(tex); }
  catch (_) {
    const ta = Object.assign(document.createElement('textarea'), { value: tex });
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  say(`已复制式 ${b.textContent} 的 TeX`);
});

/* ═══════════════════════════════ figures ═══════════════════════════════ */

/* 2.1 three timescales */
function initScales(root) {
  const svg = $('svg', root);
  const cx = 480, cy = 226;
  const O = { inner: [104, 40], middle: [246, 96], outer: [418, 170] };
  const at = (k, a) => [cx + O[k][0] * Math.cos(a), cy + O[k][1] * Math.sin(a)];
  const tokI = $('.tok-inner', svg), tokM = $('.tok-middle', svg), tokO = $('.tok-outer', svg);
  const deps = $('.deposits', svg), notches = $$('.notch', svg);
  const cnt = (k) => $(`[data-k="${k}"]`, root);
  const STEP = 2.2, PER_TASK = 6, PER_VERSION = 2;
  let steps = 0, t0 = null, outerA = -Math.PI / 2, outerFrom = outerA, outerTo = outerA, outerT = 1, version = 0;
  const pool = [];
  notches[0].classList.add('on');
  animate(root, (t, dt) => {
    if (t0 === null) t0 = t;
    const u = t - t0;
    const aI = -Math.PI / 2 + 2 * Math.PI * (u / STEP);
    const aM = -Math.PI / 2 + 2 * Math.PI * (u / (STEP * PER_TASK));
    let [x, y] = at('inner', aI); tokI.setAttribute('cx', x.toFixed(1)); tokI.setAttribute('cy', y.toFixed(1));
    [x, y] = at('middle', aM); tokM.setAttribute('cx', x.toFixed(1)); tokM.setAttribute('cy', y.toFixed(1));
    const n = Math.floor(u / STEP);
    while (steps < n) {
      steps++;
      const [dx, dy] = at('middle', aM);
      pool.push({ c: el('circle', { cx: dx.toFixed(1), cy: dy.toFixed(1), r: 2.4 }, deps), born: u });
      if (steps % PER_TASK === 0) {
        for (const d of pool) d.fade = u;                      // the task ends: its steps leave the orbit
        if ((steps / PER_TASK) % PER_VERSION === 0) {
          version++;
          outerFrom = outerA; outerTo = -Math.PI / 2 + 2 * Math.PI * (version % 12) / 12;
          if (outerTo < outerFrom) outerTo += 2 * Math.PI;
          outerT = 0;
          notches.forEach((nn, i) => nn.classList.toggle('on', i === version % 12));
        }
      }
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      const d = pool[i];
      const o = d.fade != null ? 1 - (u - d.fade) / .9 : Math.min(1, (u - d.born) / .3);
      if (o <= 0) { d.c.remove(); pool.splice(i, 1); continue; }
      d.c.setAttribute('opacity', o.toFixed(2));
    }
    if (outerT < 1) { outerT = Math.min(1, outerT + dt / 1.4); outerA = outerFrom + (outerTo - outerFrom) * easeIO(outerT); }
    [x, y] = at('outer', outerA); tokO.setAttribute('cx', x.toFixed(1)); tokO.setAttribute('cy', y.toFixed(1));
    cnt('t').textContent = steps;
    cnt('n').textContent = Math.floor(steps / PER_TASK) + 1;
    cnt('j').textContent = version;
  });
}

/* 3.1 the step loop */
function initLoop(root) {
  const svg = $('svg', root);
  const cx = 262, cy = 222, R = 150;
  const st = $$('.station', svg).map((g) => {
    const c = $('.st-node', g);
    let a = Math.atan2(+c.getAttribute('cy') - cy, +c.getAttribute('cx') - cx) * 180 / Math.PI;
    return { g, key: g.dataset.station, a };
  });
  // unwrap so the angles rise in loop order starting from the first station
  for (let i = 1; i < st.length; i++) while (st[i].a < st[i - 1].a) st[i].a += 360;
  const cards = new Map($$('.lp-card', root).map((c) => [c.dataset.station, c]));
  const pulse = $('.pulse', svg), tail = $('.pulse-tail', svg);
  let shown = 'read', pinned = null;
  function show(key) {
    if (key === shown) return;
    cards.get(shown).hidden = true;
    const c = cards.get(key); c.hidden = false;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    shown = key;
  }
  function light(key) { for (const s of st) s.g.classList.toggle('on', s.key === key); }
  light('read');
  for (const s of st) {
    const enter = () => { pinned = s.key; light(s.key); show(s.key); };
    const leave = () => { pinned = null; };
    s.g.addEventListener('mouseenter', enter); s.g.addEventListener('focus', enter);
    s.g.addEventListener('mouseleave', leave); s.g.addEventListener('blur', leave);
    s.g.addEventListener('click', enter);
  }
  const PERIOD = 11;
  const a0 = st[0].a;
  const pt = (deg) => { const r = deg * Math.PI / 180; return [cx + R * Math.cos(r), cy + R * Math.sin(r)]; };
  animate(root, (t) => {
    const a = a0 + 360 * ((t % PERIOD) / PERIOD);
    const [x, y] = pt(a);
    pulse.setAttribute('cx', x.toFixed(1)); pulse.setAttribute('cy', y.toFixed(1));
    const [x1, y1] = pt(a - 34);
    tail.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`);
    if (pinned) return;
    let cur = st[st.length - 1];
    for (const s of st) if (a + 6 >= s.a) cur = s;
    if (a + 6 >= a0 + 360) cur = st[0];
    light(cur.key); show(cur.key);
  });
}

/* 5.1 the skill stack */
function rich(textEl, s) {
  textEl.textContent = '';
  for (const tok of s.split(/(k_\d|[μπβ])/)) {
    if (!tok) continue;
    if ('μπβ'.includes(tok) && tok.length === 1) { el('tspan', { class: 't-mi' }, textEl).textContent = tok; }
    else if (/^k_\d$/.test(tok)) {
      el('tspan', { class: 't-mi' }, textEl).textContent = 'k';
      el('tspan', { class: 'sub', dy: 4 }, textEl).textContent = tok[2];
      el('tspan', { dy: -4 }, textEl).textContent = '​';
    } else textEl.appendChild(document.createTextNode(tok));
  }
}
function initStack(root) {
  const svg = $('svg', root);
  const log = $('.stack-log', svg), framesG = $('.stack-frames', svg), act = $('.stack-act', svg);
  const K1 = 'k_1 · 定位失败的测试', K2 = 'k_2 · 读取测试日志', K3 = 'k_3 · 修改并重跑';
  const script = [
    ['μ 选择 k_1：定位失败的测试', [K1], '当前行动由 π(k_1) 给出'],
    ['π(k_1) 行动一步', [K1], '当前行动由 π(k_1) 给出'],
    ['k_1 调用 k_2：读取测试日志', [K1, K2], '当前行动由 π(k_2) 给出'],
    ['π(k_2) 行动一步', [K1, K2], '当前行动由 π(k_2) 给出'],
    ['β(k_2) = 1：k_2 终止，弹出', [K1], '回到 π(k_1)'],
    ['π(k_1) 行动一步', [K1], '当前行动由 π(k_1) 给出'],
    ['β(k_1) = 1：k_1 终止，弹出', [], '栈空：由 μ 重新选择'],
    ['μ 选择 k_3：修改并重跑', [K3], '当前行动由 π(k_3) 给出'],
    ['π(k_3) 行动一步', [K3], '当前行动由 π(k_3) 给出'],
    ['β(k_3) = 1：k_3 终止，弹出', [], '栈空：由 μ 重新选择'],
  ];
  const lines = $$('.log-line', log);
  let live = [...framesG.children].map((g, i) => ({ g, label: [K1, K2][i] }));
  const pos = (i) => `translate(390px, ${204 - i * 48}px)`;
  let idx = -1, history = [];
  function apply(k) {
    const [msg, stack, what] = script[k];
    history.push(msg); history = history.slice(-3);
    lines.forEach((ln, i) => { const m = history[i - (3 - history.length)]; rich(ln, m || ''); ln.classList.toggle('cur', i === 2); });
    // pop frames that are gone, push new ones
    while (live.length > stack.length || (live.length && live[live.length - 1].label !== stack[live.length - 1])) {
      const f = live.pop();
      f.g.style.opacity = 0; f.g.style.transform = pos(live.length + 1.2);
      setTimeout(() => f.g.remove(), 520);
    }
    while (live.length < stack.length) {
      const i = live.length, label = stack[i];
      const g = el('g', { class: 'frame' }, framesG);
      el('rect', { width: 240, height: 42, rx: 5 }, g);
      rich(el('text', { class: 't-cjk fr-t', x: 16, y: 27 }, g), label);
      g.style.opacity = 0; g.style.transform = pos(i + 1.4);
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = 1; g.style.transform = pos(i); }));
      live.push({ g, label });
    }
    live.forEach((f, i) => f.g.classList.toggle('top', i === live.length - 1));
    act.style.opacity = 0;
    setTimeout(() => { rich(act, what); act.style.opacity = 1; }, 160);
  }
  const DT = 1.25;
  let start = null;
  animate(root, (t) => {
    if (start === null) { start = t; history = []; }
    const k = Math.floor((t - start) / DT) % (script.length + 2);
    if (k === idx || k >= script.length) { idx = k; return; }
    idx = k;
    apply(k);
  });
}

/* 6.1 topology lab */
function initTopology(root) {
  const svg = $('svg', root), edgesG = $('.topo-edges', svg), msgsG = $('.topo-msgs', svg);
  const nodes = Object.fromEntries($$('.node', svg).map((g) => [g.dataset.n, g]));
  const panel = $('.topo-panel', root);
  const T = DATA.topologies;
  const posOf = (g) => { const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform')); return [+m[1], +m[2]]; };
  const cur = Object.fromEntries(Object.entries(nodes).map(([k, g]) => [k, posOf(g)]));
  const vis = Object.fromEntries(Object.entries(nodes).map(([k, g]) => [k, g.style.opacity === '0' ? 0 : 1]));
  let key = 'centralized', moveFrom = null, moveT = 1, msgs = [], spawnAt = 0;
  function drawEdges(conf) {
    edgesG.textContent = '';
    for (const [a, b] of conf.edges) {
      const [x1, y1] = conf.nodes[a], [x2, y2] = conf.nodes[b];
      const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
      const ln = el('line', { class: 'edge', x1: x1 + ux * 30, y1: y1 + uy * 30, x2: x2 - ux * 30, y2: y2 - uy * 30 }, edgesG);
      ln.style.opacity = 0; requestAnimationFrame(() => { ln.style.opacity = 1; });
    }
  }
  function select(k) {
    if (k === key) return;
    key = k;
    const c = T[k];
    moveFrom = JSON.parse(JSON.stringify(cur)); moveT = 0;
    msgs.forEach((m) => m.c.remove()); msgs = [];
    drawEdges(c);
    $$('[data-topo]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.topo === k)));
    svg.setAttribute('aria-label', c.title);
    panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
    $('.topo-title', panel).textContent = c.title;
    $('.topo-desc', panel).textContent = c.desc;
    $('.topo-knobs', panel).textContent = c.knobs;
    $('.topo-watch', panel).textContent = c.watch;
    if (REDUCE) { moveT = 1; place(1); }
  }
  function place(p) {
    const c = T[key];
    for (const [n, g] of Object.entries(nodes)) {
      const to = c.nodes[n] || [280, 170];
      const from = moveFrom ? moveFrom[n] : cur[n];
      const x = from[0] + (to[0] - from[0]) * p, y = from[1] + (to[1] - from[1]) * p;
      cur[n] = [x, y];
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const targetVis = c.nodes[n] ? 1 : 0;
      const o = vis[n] + (targetVis - vis[n]) * p;
      g.style.opacity = o.toFixed(2);
      if (p >= 1) vis[n] = targetVis;
    }
  }
  $$('[data-topo]', root).forEach((b) => b.addEventListener('click', () => select(b.dataset.topo)));
  animate(root, (t, dt) => {
    if (moveT < 1) { moveT = Math.min(1, moveT + dt / .75); place(easeIO(moveT)); }
    const c = T[key];
    if (c.edges.length && t > spawnAt && moveT >= 1) {
      spawnAt = t + .38 + Math.random() * .5;
      let [a, b] = c.edges[Math.floor(Math.random() * c.edges.length)];
      if (c.both && Math.random() < .5) [a, b] = [b, a];
      msgs.push({ a, b, t0: t, c: el('circle', { r: 3.2 }, msgsG) });
    }
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i], p = (t - m.t0) / 1.15;
      if (p >= 1) { m.c.remove(); msgs.splice(i, 1); continue; }
      const [x1, y1] = c.nodes[m.a] || [280, 170], [x2, y2] = c.nodes[m.b] || [280, 170];
      const q = easeIO(p), d = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / d, uy = (y2 - y1) / d;
      const sx = x1 + ux * 30, sy = y1 + uy * 30, ex = x2 - ux * 30, ey = y2 - uy * 30;
      m.c.setAttribute('cx', (sx + (ex - sx) * q).toFixed(1)); m.c.setAttribute('cy', (sy + (ey - sy) * q).toFixed(1));
      m.c.setAttribute('opacity', Math.sin(Math.PI * p).toFixed(2));
    }
  });
}

/* 7.1 commutativity */
function initCommute(root) {
  const cards = new Map($$('.cm-card', root).map((c) => [c.dataset.pair, c]));
  const cells = $$('.cm-cell', root);
  let sel = 'epr-op';
  const mark = () => cells.forEach((c) => c.classList.toggle('sel', c.dataset.pair === sel));
  mark();
  const pick = (k) => { if (k === sel) return; cards.get(sel).hidden = true; cards.get(k).hidden = false; sel = k; mark(); };
  for (const c of cells) {
    c.addEventListener('click', () => pick(c.dataset.pair));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c.dataset.pair); } });
    c.addEventListener('mouseenter', () => pick(c.dataset.pair));
  }
}

/* 7.2 five run states */
function initStates(root) {
  const svg = $('svg', root), tok = $('.st-tok', svg);
  const box = Object.fromEntries($$('.st-box', svg).map((g) => [g.dataset.s, g]));
  const X = { enabled: 82, eligible: 258, invoked: 434, applied: 610 };
  const runs = [['enabled', 'eligible', 'invoked', 'applied'], ['enabled', 'eligible', 'invoked', 'applied'],
                ['enabled', 'eligible', 'invoked', 'fallback'], ['enabled']];
  const SEG = .75;
  animate(root, (t) => {
    const cyc = runs.reduce((s, r) => s + r.length * SEG + 1.1, 0);
    let u = t % cyc, run = runs[0];
    for (const r of runs) { const len = r.length * SEG + 1.1; if (u < len) { run = r; break; } u -= len; }
    const i = Math.min(run.length - 1, Math.floor(u / SEG));
    const f = easeIO(Math.min(1, (u - i * SEG) / (SEG * .6)));
    const at = (s) => (s === 'fallback' ? [434, 138] : [X[s], 92]);
    const [x0, y0] = at(run[Math.max(0, i - 1)]), [x1, y1] = at(run[i]);
    const x = i === 0 ? x1 : x0 + (x1 - x0) * f, y = i === 0 ? y1 : y0 + (y1 - y0) * f;
    tok.setAttribute('cx', x.toFixed(1)); tok.setAttribute('cy', y.toFixed(1));
    const tailFade = u > run.length * SEG + .6;
    tok.setAttribute('opacity', tailFade ? '0' : '1');
    for (const k in box) box[k].classList.toggle('lit', run.slice(0, i + 1).includes(k) && !tailFade && (k === run[i] || run.length === 1));
  });
}

/* 8.1 atlas */
function initAtlas(root) {
  const input = $('input', root), cells = $$('.at-cell', root), cards = new Map($$('.at-card', root).map((c) => [c.dataset.id, c]));
  const count = $('.at-count', root), empty = $('.at-empty', root);
  let layer = 'all', sel = 'M05';
  function filter() {
    const q = input.value.trim().toLowerCase();
    let n = 0;
    for (const c of cells) {
      const ok = (layer === 'all' || c.dataset.layer === layer) && (!q || c.dataset.search.includes(q));
      c.classList.toggle('dim', !ok); c.tabIndex = ok ? 0 : -1;
      if (ok) n++;
    }
    count.textContent = `${n} / ${cells.length}`;
    empty.hidden = n !== 0;
  }
  function pick(id) {
    if (id === sel) return;
    cards.get(sel).hidden = true;
    const c = cards.get(id); c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    sel = id;
    cells.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === id)));
  }
  input.addEventListener('input', filter);
  $$('[data-layer]', $('.at-layers', root)).forEach((b) => b.addEventListener('click', () => {
    layer = b.dataset.layer;
    $$('[data-layer]', $('.at-layers', root)).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    filter();
  }));
  cells.forEach((c) => c.addEventListener('click', () => pick(c.dataset.id)));
}

/* 9.1 Karnaugh map */
function initKmap(root) {
  const cells = $$('.k-cell', root);
  const count = $('.k-count b', root), desc = $('.k-desc', root);
  const ones = (b) => [...b].filter((x) => x === '1').length;
  const D = {
    screen: [(b) => ones(b) <= 1 || ones(b) === 4, '基线、四个单机制与全开：估计主效应，不识别交互。'],
    loo: [(b) => ones(b) >= 3, '全开与四个“留一”：去掉某一个机制损失多少，用来确认组合里每一项都不可少。'],
    pairs: [(b) => ones(b) === 2, '六个两两组合：配合基线与单机制，可以估计每一对机制的交互对比 Δ。'],
    full: [() => true, '十六格全做：估计全部主效应与各阶交互，代价也最高。'],
  };
  function set(k) {
    const [f, text] = D[k];
    let n = 0;
    for (const c of cells) { const on = f(c.dataset.bits); c.classList.toggle('pick', on); if (on) n++; }
    count.textContent = n; desc.textContent = text;
    $$('[data-design]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.design === k)));
  }
  set('screen');
  $$('[data-design]', root).forEach((b) => b.addEventListener('click', () => set(b.dataset.design)));
  const dist = (a, b) => [...a].reduce((s, x, i) => s + (x !== b[i]), 0);
  for (const c of cells) {
    c.addEventListener('mouseenter', () => { for (const o of cells) { o.classList.toggle('nb', dist(o.dataset.bits, c.dataset.bits) === 1); o.classList.toggle('hov', o === c); } });
    c.addEventListener('focus', () => c.dispatchEvent(new Event('mouseenter')));
  }
  $('.k-grid', root).addEventListener('mouseleave', () => cells.forEach((o) => o.classList.remove('nb', 'hov')));
}

/* 9.2 interaction plot */
function initDelta(root) {
  const svg = $('svg', root), input = $('input', root), out = $('output', root);
  const y0 = +root.dataset.y0, ya = +root.dataset.ya, yb = +root.dataset.yb;
  const X1 = 440, Y = (v) => 262 - (v - .40) / .50 * 220;
  const pred = ya + yb - y0;
  const la1 = $('.l-a1', svg), seg = $('.d-seg', svg), pab = $('.pab', svg), lab = $('.d-lab', svg), plab = $('.pl-ab', svg);
  let shown = +input.value, target = shown, raf = 0;
  function draw(v) {
    const yy = Y(v).toFixed(1);
    la1.setAttribute('y2', yy); pab.setAttribute('cy', yy); seg.setAttribute('y2', yy);
    plab.setAttribute('y', (Y(v) - 10).toFixed(1));
    const d = v - pred;
    lab.textContent = `Δ = ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`;
    lab.setAttribute('y', ((Y(pred) + Y(v)) / 2 + 5).toFixed(1));
    root.classList.toggle('neg', d < 0);
  }
  function tween() {
    shown += (target - shown) * .22;
    if (Math.abs(target - shown) < .001) shown = target;
    draw(shown);
    raf = shown !== target ? requestAnimationFrame(tween) : 0;
  }
  input.addEventListener('input', () => {
    target = +input.value; out.textContent = target.toFixed(2);
    if (REDUCE) { shown = target; draw(shown); } else if (!raf) raf = requestAnimationFrame(tween);
  });
  draw(shown);
}

/* 10.1 event commit */
function initCommit(root) {
  const svg = $('svg', root), tok = $('.cs-tok', svg);
  const st = $$('.cs', svg), back = $('.cs-back', svg), store = $('.store', svg), ags = $$('.fan-ag', svg);
  const nEl = $('.cs-count .n', svg), rEl = $('.cs-count .r', svg);
  const X = [97, 293, 489, 685, 881], Y = 58;
  let committed = 0, rejected = 0, lastEvent = -1, stage = -1;
  // one event: 0 receive · 1 propose · 2 validate · (fail: arc back, 1 propose, 2 validate) · 3 commit · 4 schedule
  const plan = (fail) => fail ? [0, 1, 2, 'back', 1, 2, 3, 4] : [0, 1, 2, 3, 4];
  const SEG = .7;
  function arc(p) {         // the dashed return path above, validate → propose
    const q = 1 - p, x0 = 489, y0 = 58, x3 = 269, y3 = 58;
    const x = q * q * q * x0 + 3 * q * q * p * 470 + 3 * q * p * p * 290 + p * p * p * x3;
    const y = q * q * q * y0 + 3 * q * q * p * 18 + 3 * q * p * p * 18 + p * p * p * y3;
    return [x, y];
  }
  animate(root, (t) => {
    const ev = Math.floor(t / 6.6), u = t % 6.6;
    const fail = ev % 3 === 2;
    const P = plan(fail);
    if (ev !== lastEvent) { lastEvent = ev; stage = -1; }
    const i = Math.min(P.length - 1, Math.floor(u / SEG));
    const f = easeIO(Math.min(1, (u - i * SEG) / (SEG * .7)));
    const cur = P[i], prev = P[Math.max(0, i - 1)];
    let x, y;
    if (cur === 'back') { [x, y] = arc(f); tok.classList.add('bad'); }
    else if (prev === 'back') { const [ax, ay] = arc(1); x = ax + (X[1] - ax) * f; y = ay + (Y - ay) * f; }
    else { const a = X[prev === 'back' ? 1 : prev], b = X[cur]; x = i === 0 ? b : a + (b - a) * f; y = Y; }
    if (cur !== 'back' && prev !== 'back') tok.classList.remove('bad');
    tok.setAttribute('cx', x.toFixed(1)); tok.setAttribute('cy', y.toFixed(1));
    const done = u > P.length * SEG + .5;
    tok.setAttribute('opacity', done ? '0' : '1');
    st.forEach((g, k) => g.classList.toggle('lit', !done && cur === k));
    back.classList.toggle('lit', !done && (cur === 'back'));
    if (i !== stage) {
      stage = i;
      if (cur === 'back') { rejected++; rEl.textContent = rejected; }
      if (cur === 3) { committed++; nEl.textContent = committed; store.classList.add('lit'); setTimeout(() => store.classList.remove('lit'), 600); }
      if (cur === 4) ags.forEach((a, k) => setTimeout(() => { a.classList.add('lit'); setTimeout(() => a.classList.remove('lit'), 500); }, 140 * k));
    }
  });
}

/* 12 unified experiment-ready mechanism table */
function initCatalog(root) {
  const rows = $$('.cat-row', root), bodies = $$('tbody[data-group]', root);
  const search = $('.cat-searchline input', root), phase = $('.cat-searchline select', root);
  const count = $('.cat-count', root), empty = $('.cat-empty', root);
  let origin = 'all', group = 'all';
  const normalize = (s) => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  function filter() {
    const q = normalize(search.value);
    let n = 0;
    for (const body of bodies) {
      let visible = 0;
      for (const row of $$('.cat-row', body)) {
        const ok = (origin === 'all' || row.dataset.origin === origin) &&
                   (group === 'all' || body.dataset.group === group) &&
                   (phase.value === 'all' || row.dataset.phase === phase.value) &&
                   (!q || normalize(row.dataset.search).includes(q));
        row.hidden = !ok;
        row.nextElementSibling.classList.toggle('cat-filtered', !ok);
        if (ok) { n++; visible++; }
      }
      body.hidden = visible === 0;
    }
    count.textContent = `显示 ${n} / ${rows.length}`;
    empty.hidden = n > 0;
  }
  for (const key of ['origin', 'group']) {
    for (const button of $$(`button[data-${key}]`, root)) button.addEventListener('click', () => {
      if (key === 'origin') origin = button.dataset.origin;
      else group = button.dataset.group;
      $$(`button[data-${key}]`, root).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      filter();
    });
  }
  search.addEventListener('input', filter);
  phase.addEventListener('change', filter);
  for (const button of $$('.cat-toggle', root)) button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(button.getAttribute('aria-controls')).classList.toggle('open', open);
  });
  // The earlier eighteen-cluster atlas links directly to the corresponding table row.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('.lit-link');
    if (!link) return;
    const target = document.getElementById('cat-lit-' + link.dataset.lit);
    if (!target) return;
    event.preventDefault();
    origin = group = 'all'; search.value = ''; phase.value = 'all';
    $$('button[data-origin], button[data-group]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.origin === 'all' || b.dataset.group === 'all')));
    filter();
    const button = $('.cat-toggle', target);
    button.setAttribute('aria-expanded', 'true');
    target.nextElementSibling.classList.add('open');
    history.replaceState(null, '', '#cat-lit-' + link.dataset.lit);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* 13.1 horizon: per-step cost under caching (Definition 13.1), same rules as figures.py */
function initHorizon(root) {
  const svg = $('svg', root);
  const c0 = +root.dataset.c0, delta = +root.dataset.delta, masked = +root.dataset.masked;
  const inputs = Object.fromEntries($$('input[type=range]', root).map((i) => [i.dataset.k, i]));
  const lines = { nocache: $('.l-nocache', svg), full: $('.l-full', svg), slide: $('.l-slide', svg), block: $('.l-block', svg) };
  const marks = { ts: $('.m-ts', svg), td: $('.m-td', svg) };
  const X0 = 64, X1 = 600, Y0 = 24, Y1 = 300;
  function series(rho, omega, block, T) {
    const run = (kind) => {
      const out = []; let prevInput = null, prevM = 0;
      for (let t = 1; t <= T; t++) {
        const n = t - 1;
        const m = kind === 'nocache' || kind === 'full' ? 0 : kind === 'slide' ? Math.max(0, n - omega)
          : block * Math.floor(Math.max(0, n - omega) / block);
        const inp = c0 + m * masked + (n - m) * delta;
        let unc, hit;
        if (kind === 'nocache' || t === 1) { unc = inp; hit = 0; }
        else if (m === prevM) { unc = inp - prevInput; hit = prevInput; }
        else { hit = c0 + prevM * masked; unc = inp - hit; }
        out.push((unc + hit / rho) / 1000);
        prevInput = inp; prevM = m;
      }
      return out;
    };
    const s = { nocache: run('nocache'), full: run('full'), slide: run('slide'), block: run('block') };
    s.blockavg = s.block.map((_, i) => { const seg = s.block.slice(Math.max(0, i - block + 1), i + 1); return seg.reduce((a, b) => a + b, 0) / seg.length; });
    return s;
  }
  let raf = 0;
  function draw() {
    raf = 0;
    const rho = +inputs.rho.value, omega = +inputs.omega.value, block = +inputs.block.value, T = +inputs.T.value;
    for (const k in inputs) inputs[k].nextElementSibling.textContent = inputs[k].value;
    const s = series(rho, omega, block, T);
    const ymax = Math.max(...s.full, ...s.slide, ...s.blockavg) * 1.12;
    const px = (t) => X0 + (t - 1) / (T - 1) * (X1 - X0);
    const py = (v) => Y1 - Math.min(v, ymax * 1.4) / ymax * (Y1 - Y0);
    const pts = (arr) => arr.map((v, i) => `${px(i + 1).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    lines.nocache.setAttribute('points', pts(s.nocache));
    lines.full.setAttribute('points', pts(s.full));
    lines.slide.setAttribute('points', pts(s.slide));
    lines.block.setAttribute('points', pts(s.blockavg));
    // axes follow the scale
    $$('.grid, .tick-l, .xtick', svg).forEach((n) => n.remove());
    const axis = $('.axis', svg);
    const step = ymax < 40 ? 5 : ymax < 90 ? 10 : 20;
    for (let v = 0; v <= ymax; v += step) {
      axis.before(el('line', { class: 'grid', x1: X0, y1: py(v).toFixed(1), x2: X1, y2: py(v).toFixed(1) }));
      const tl = el('text', { class: 't-cm tick-l', x: X0 - 8, y: (py(v) + 4).toFixed(1), 'text-anchor': 'end' }); tl.textContent = v; axis.before(tl);
    }
    const xstep = T <= 60 ? 10 : T <= 150 ? 25 : 50;
    for (const t of [1, ...Array.from({ length: Math.floor(T / xstep) }, (_, i) => (i + 1) * xstep)]) {
      axis.after(el('line', { class: 'xtick', x1: px(t).toFixed(1), y1: Y1, x2: px(t).toFixed(1), y2: Y1 + 5 }));
      const tl = el('text', { class: 't-cm tick-l', x: px(t).toFixed(1), y: Y1 + 19, 'text-anchor': 'middle' }); tl.textContent = t; axis.after(tl);
    }
    const ts = 2 + rho * (omega - 1), td = 2 + rho * (omega - 1) / block + omega + (block - 1) / 2;
    for (const [k, t] of [['ts', ts], ['td', td]]) {
      const g = marks[k], inside = t >= 1 && t <= T, x = px(Math.min(Math.max(t, 1), T)).toFixed(1);
      g.style.display = inside ? '' : 'none';
      const ln = $('line', g); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
      $('text', g).setAttribute('x', (+x + 5).toFixed(1));
    }
    const sum = (a) => a.reduce((x, y) => x + y, 0), base = sum(s.full);
    $('.r-ts', root).textContent = ts.toFixed(0);
    $('.r-td', root).textContent = td.toFixed(1);
    $('.r-T', root).textContent = T;
    $('.r-slide', root).textContent = (sum(s.slide) / base).toFixed(2);
    $('.r-block', root).textContent = (sum(s.block) / base).toFixed(2);
    $('.r-nocache', root).textContent = (sum(s.nocache) / base).toFixed(2);
  }
  for (const k in inputs) inputs[k].addEventListener('input', () => { if (!raf) raf = requestAnimationFrame(draw); });
}

const INIT = { scales: initScales, loop: initLoop, stack: initStack, topology: initTopology, commute: initCommute,
  states: initStates, atlas: initAtlas, kmap: initKmap, delta: initDelta, commit: initCommit,
  catalog: initCatalog, horizon: initHorizon };
for (const f of $$('[data-fig]')) {
  const init = INIT[f.dataset.fig];
  if (init) { try { init(f); } catch (err) { console.error('figure', f.dataset.fig, err); } }
}
})();
