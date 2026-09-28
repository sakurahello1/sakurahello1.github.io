(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function $(id) { return document.getElementById(id); }
  function fmt(x, d) { return (Math.abs(x) < 1e-9 ? 0 : x).toFixed(d == null ? 2 : d); }
  function sub(b, s) { return b + '<tspan dy="4" font-size="10">' + s + '</tspan><tspan dy="-4">​</tspan>'; }
  function pressSeg(group, btn) {
    group.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
  }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function marker(svg, id, cls) {
    var defs = S('defs', {}, svg);
    var m = S('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    S('path', { d: 'M0,0 L10,5 L0,10 z', 'class': cls }, m);
  }
  function smoothPath(pts) {
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function fnPath(f, x0, x1, X, Y, n) {
    var d = '';
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * i / n;
      d += (i ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(f(x)).toFixed(1);
    }
    return d;
  }

  /* ---------------- trail map ---------------- */
  (function trail() {
    var svg = $('trail-svg'); if (!svg) return;
    for (var k = 0; k < 7; k++) {
      var d = '';
      for (var x = 0; x <= 1200; x += 20) {
        var y = 48 + k * 36 + 9 * Math.sin(x / 95 + k * 1.3) + 5 * Math.sin(x / 41 + k);
        d += (x ? 'L' : 'M') + x + ',' + y.toFixed(1);
      }
      S('path', { d: d, 'class': 'grid', style: 'opacity:.55' }, svg);
    }
    var p1 = [
      { id: 'ch2', t: 'REINFORCE', y: '1992', x: 70, h: 236 },
      { id: 'ch3', t: '基线 · GAE', y: '2015', x: 180, h: 208, fix: '减基线' },
      { id: 'ch4', t: '自然梯度', y: '2001', x: 290, h: 176, fix: '引入 KL' },
      { id: 'ch5', t: 'TRPO', y: '2015', x: 400, h: 142, fix: '线搜索 + 检查' },
      { id: 'ch6', t: 'PPO', y: '2017', x: 510, h: 112, fix: 'clip' }
    ];
    var p2 = [
      { id: 'ch8', t: 'SFT', y: '', x: 670, h: 168 },
      { id: 'ch10', t: 'RLHF', y: '2022', x: 780, h: 138, fix: '奖励模型' },
      { id: 'ch12', t: 'GRPO', y: '2024', x: 900, h: 110, fix: '组内基线' },
      { id: 'ch13', t: 'R1 · RLVR', y: '2025', x: 1015, h: 84, fix: '规则奖励' },
      { id: 'ch14', t: 'DAPO · GSPO', y: '2025', x: 1125, h: 60, fix: '逐项修补' }
    ];
    function area(pts) {
      var ptsA = pts.map(function (p) { return [p.x, p.h]; });
      var d = smoothPath(ptsA) + ' L' + pts[pts.length - 1].x + ',300 L' + pts[0].x + ',300 Z';
      S('path', { d: d, style: 'fill:var(--surface-2);opacity:.7' }, svg);
    }
    area(p1); area(p2);
    S('text', { x: 70, y: 32, 'class': 't-m', text: '第一部分 · 经典策略优化' }, svg);
    S('text', { x: 670, y: 32, 'class': 't-m', text: '第二部分 · 大模型后训练' }, svg);
    S('path', { d: smoothPath(p1.map(function (p) { return [p.x, p.h]; })), 'class': 'ln-amb', style: 'stroke-width:2.6' }, svg);
    S('path', { d: smoothPath(p2.map(function (p) { return [p.x, p.h]; })), 'class': 'ln-amb', style: 'stroke-width:2.6' }, svg);
    S('path', { d: 'M510,112 C560,120 600,176 670,168', 'class': 'ln', style: 'stroke-dasharray:5 5' }, svg);
    S('path', { d: 'M583,190 l11,-18 l11,18 z', style: 'fill:var(--amber-soft);stroke:var(--amber);stroke-width:1.5' }, svg);
    S('text', { x: 594, y: 210, 'text-anchor': 'middle', 'class': 't-s', text: '搬到大模型上' }, svg);
    // DPO side branch
    S('path', { d: 'M780,138 C800,190 830,214 858,222', 'class': 'ln-amb', style: 'stroke-width:1.8;stroke-dasharray:6 5' }, svg);
    var all = p1.concat(p2);
    function seg(a, b) {
      if (!b.fix) return;
      var mx = (a.x + b.x) / 2, my = (a.h + b.h) / 2;
      S('text', { x: mx + 6, y: my + 26, 'text-anchor': 'middle', 'class': 't-m', text: b.fix }, svg);
    }
    for (var i = 1; i < p1.length; i++) seg(p1[i - 1], p1[i]);
    for (i = 1; i < p2.length; i++) seg(p2[i - 1], p2[i]);
    function node(p, dashed) {
      var a = S('a', { href: '#' + p.id }, svg);
      S('title', { text: p.t }, a);
      S('circle', { cx: p.x, cy: p.h, r: 16, style: 'fill:transparent' }, a);
      S('circle', { cx: p.x, cy: p.h, r: 8.5, 'class': 'node', style: 'fill:var(--surface);stroke:var(--amber);stroke-width:2.6' + (dashed ? ';stroke-dasharray:3 2' : '') }, a);
      S('text', { x: p.x, y: p.h - 17, 'text-anchor': 'middle', 'class': 't-b', text: p.t }, a);
      if (p.y) S('text', { x: p.x, y: dashed ? p.h + 25 : p.h - 35, 'text-anchor': 'middle', 'class': 't-m', text: p.y }, a);
    }
    all.forEach(function (p) { node(p); });
    node({ id: 'ch11', t: 'DPO', y: '2023 · 离线支线', x: 870, h: 224 }, true);
  })();

  /* ---------------- TOC tracking + mobile bar ---------------- */
  (function toc() {
    var chapters = Array.prototype.slice.call(document.querySelectorAll('.chapter[data-title]'));
    var tocLinks = {};
    document.querySelectorAll('#toc a').forEach(function (a) { tocLinks[a.getAttribute('href').slice(1)] = a.parentElement; });
    var panel = $('mbar-panel'), btn = $('mbar-btn'), cur = $('mbar-cur'), prog = $('mbar-prog');
    if (panel && $('toc')) {
      panel.innerHTML = $('toc').innerHTML;
      panel.addEventListener('click', function (e) { if (e.target.closest('a')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
      btn.addEventListener('click', function () { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true'); });
    }
    var ticking = false;
    function update() {
      ticking = false;
      var line = window.innerHeight * 0.3, active = 0;
      for (var i = 0; i < chapters.length; i++) { if (chapters[i].getBoundingClientRect().top < line) active = i; }
      chapters.forEach(function (c, i) {
        var li = tocLinks[c.id]; if (!li) return;
        li.classList.toggle('active', i === active);
        li.classList.toggle('done', i < active);
      });
      if (cur) cur.textContent = chapters[active].getAttribute('data-title');
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (prog) prog.style.width = (h > 0 ? Math.min(100, window.scrollY / h * 100) : 0) + '%';
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ---------------- ch1 loop toggle ---------------- */
  (function loop() {
    var views = {
      rl: { a1: '智能体', a2: '策略 ' + sub('π', 'θ') + '(a | s)', e1: '环境', e2: '状态转移 P(s′ | s, a)', act: '动作 ' + sub('a', 't'),
            back: '新状态 ' + sub('s', 't+1') + '，奖励 ' + sub('r', 't'), note: '反复进行，直到一局结束；整局记录就是轨迹 τ' },
      llm: { a1: '语言模型', a2: sub('π', 'θ') + '(' + sub('y', 't') + ' | x, ' + sub('y', '&lt;t') + ')', e1: '上下文 + 打分器', e2: '拼接 token；回答结束时打分',
            act: '下一个 token ' + sub('y', 't'), back: '新前缀 (x, ' + sub('y', '≤t') + ')；结尾奖励 r(x, y)', note: '生成到 EOS 为止；一次完整的回答就是一条轨迹' }
    };
    function set(v) { var o = views[v]; for (var k in o) { var el = $('lp-' + k); if (el) el.innerHTML = o[k]; } }
    var seg = document.querySelector('[data-view]'); if (!seg) return;
    var group = seg.parentElement;
    group.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; pressSeg(group, b); set(b.getAttribute('data-view')); });
    set('rl');
  })();

  /* ---------------- W1 step size ---------------- */
  (function stepW() {
    var svg = $('step-svg'); if (!svg) return;
    var W = 640, H = 250, L = 46, R = 18, T = 18, B = 40;
    var X = lin(-0.5, 5.5, L, W - R), Y = lin(0, 1.1, H - B, T);
    var C = 2.5, w = 1.6;
    function f(t) { return 0.1 + (Math.abs(t - C) < w ? 0.45 * (1 + Math.cos(Math.PI * (t - C) / w)) : 0); }
    function df(t) { return Math.abs(t - C) < w ? -0.45 * Math.PI / w * Math.sin(Math.PI * (t - C) / w) : 0; }
    var slider = $('step-alpha'), out = $('step-alpha-out'), read = $('step-read');
    var group = slider.closest('.widget').querySelector('.seg');
    function draw() {
      var a = parseFloat(slider.value); out.textContent = fmt(a);
      clear(svg); marker(svg, 'stp-ah', 's-mut');
      S('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
      for (var tk = 0; tk <= 5; tk++) {
        S('line', { x1: X(tk), y1: H - B, x2: X(tk), y2: H - B + 4, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
        S('text', { x: X(tk), y: H - B + 17, 'text-anchor': 'middle', 'class': 't-m', text: tk }, svg);
      }
      S('text', { x: W - R, y: H - 4, 'text-anchor': 'end', 'class': 't-s', text: '策略参数 θ' }, svg);
      S('text', { x: L, y: T - 4, 'class': 't-s', text: '期望回报 J(θ)' }, svg);
      var dArea = fnPath(f, -0.5, 5.5, X, Y, 240) + ' L' + X(5.5) + ',' + (H - B) + ' L' + X(-0.5) + ',' + (H - B) + ' Z';
      S('path', { d: dArea, style: 'fill:var(--teal-soft)' }, svg);
      S('path', { d: fnPath(f, -0.5, 5.5, X, Y, 240), 'class': 'ln-teal' }, svg);
      S('text', { x: X(C), y: Y(1.0) - 8, 'text-anchor': 'middle', 'class': 't-s', text: '峰值' }, svg);
      S('text', { x: X(4.8), y: Y(0.1) - 8, 'text-anchor': 'middle', 'class': 't-s', text: '平地：梯度为 0' }, svg);
      S('text', { x: X(0.2), y: Y(0.1) - 8, 'text-anchor': 'middle', 'class': 't-s', text: '平地' }, svg);
      var th = [1.2];
      for (var i = 0; i < 15; i++) { var n = th[i] + a * df(th[i]); th.push(Math.max(-0.5, Math.min(5.5, n))); }
      for (i = 0; i < th.length - 1; i++) {
        if (Math.abs(th[i + 1] - th[i]) < 0.004) continue;
        S('path', { d: 'M' + X(th[i]) + ',' + Y(f(th[i])) + ' L' + X(th[i + 1]) + ',' + Y(f(th[i + 1])), 'class': 'ln', style: 'stroke-dasharray:3 3;stroke-width:1.2;opacity:.8', 'marker-end': 'url(#stp-ah)' }, svg);
      }
      for (i = 0; i < th.length; i++) {
        var last = i === th.length - 1;
        S('circle', { cx: X(th[i]), cy: Y(f(th[i])), r: last ? 6.5 : 3.6, style: last ? 'fill:var(--amber-fill);stroke:var(--surface);stroke-width:2' : 'fill:var(--ink);opacity:' + (0.35 + 0.65 * i / th.length) }, svg);
      }
      S('text', { x: X(th[0]), y: Y(f(th[0])) + 18, 'text-anchor': 'middle', 'class': 't-s', text: '起点' }, svg);
      var tEnd = th[th.length - 1], gap = Math.abs(tEnd - C), lastStep = Math.abs(th[15] - th[14]);
      var alt = (th[15] - th[14]) * (th[14] - th[13]) < 0 && (th[14] - th[13]) * (th[13] - th[12]) < 0;
      var msg;
      if (gap >= w) msg = '<b>步长太大</b>：参数被甩出了山峰，落在平地上。那里梯度为 0，之后每一步都原地不动，最终回报只有 ' + fmt(f(tEnd)) + '。在强化学习里，这对应一个几乎拿不到奖励、因此也采不到有用数据的策略。';
      else if (lastStep < 0.01 && gap < 0.05) msg = '<b>步长合适</b>：几步之内就收敛到峰顶附近，最终回报 ' + fmt(f(tEnd)) + '。';
      else if (alt) msg = '<b>步长偏大</b>：每一步都越过峰顶，在两侧来回震荡，回报停在 ' + fmt(f(tEnd)) + ' 左右上不去。再大一点就会被甩出山峰。';
      else msg = '<b>步长太小</b>：15 步之后还在半山腰（θ = ' + fmt(tEnd) + '，回报 ' + fmt(f(tEnd)) + '），收敛慢得难以接受。';
      read.innerHTML = msg;
    }
    slider.addEventListener('input', function () {
      group.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', Math.abs(parseFloat(b.getAttribute('data-a')) - parseFloat(slider.value)) < 1e-6 ? 'true' : 'false'); });
      draw();
    });
    group.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; slider.value = b.getAttribute('data-a'); pressSeg(group, b); draw(); });
    draw();
  })();

  /* ---------------- W2 gaussians ---------------- */
  (function gaussW() {
    var svg = $('gauss-svg'); if (!svg) return;
    var W = 640, H = 230, L = 20, R = 20, T = 34, B = 36;
    var slider = $('gauss-s'), out = $('gauss-s-out'), klEl = $('gauss-kl');
    var group = slider.closest('.widget').querySelector('.seg');
    function pdf(x, m, s) { return Math.exp(-(x - m) * (x - m) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)); }
    function draw() {
      var s = parseFloat(slider.value); out.textContent = fmt(s); klEl.textContent = fmt(1 / (2 * s * s));
      clear(svg); marker(svg, 'g-ah', 's-ink');
      var half = Math.max(4 * s, 2.5), x0 = 0.5 - half, x1 = 0.5 + half, ymax = pdf(0, 0, s) * 1.08;
      var X = lin(x0, x1, L, W - R), Y = lin(0, ymax, H - B, T);
      S('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
      var step = half <= 3 ? 1 : half <= 7 ? 2 : 4;
      for (var tk = Math.ceil(x0 / step) * step; tk <= x1; tk += step) {
        S('line', { x1: X(tk), y1: H - B, x2: X(tk), y2: H - B + 4, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
        S('text', { x: X(tk), y: H - B + 17, 'text-anchor': 'middle', 'class': 't-m', text: tk }, svg);
      }
      [[0, 'var(--teal)', 'var(--teal-soft)', '旧策略 N(0, σ²)'], [1, 'var(--amber)', 'var(--amber-soft)', '新策略 N(1, σ²)']].forEach(function (g, i) {
        var f = function (x) { return pdf(x, g[0], s); };
        var d = fnPath(f, x0, x1, X, Y, 240);
        S('path', { d: d + ' L' + X(x1) + ',' + (H - B) + ' L' + X(x0) + ',' + (H - B) + ' Z', style: 'fill:' + g[2] + ';opacity:.75' }, svg);
        S('path', { d: d, style: 'fill:none;stroke:' + g[1] + ';stroke-width:2.2' }, svg);
        S('rect', { x: W - R - 150, y: T - 22 + i * 18, width: 10, height: 10, rx: 2, style: 'fill:' + g[1] }, svg);
        S('text', { x: W - R - 134, y: T - 13 + i * 18, 'class': 't-s', text: g[3] }, svg);
      });
      var ya = T - 12;
      S('line', { x1: X(0), y1: ya, x2: X(0), y2: H - B, 'class': 'ln', style: 'stroke-dasharray:3 3;stroke-width:1' }, svg);
      S('line', { x1: X(1), y1: ya, x2: X(1), y2: H - B, 'class': 'ln', style: 'stroke-dasharray:3 3;stroke-width:1' }, svg);
      S('path', { d: 'M' + X(0) + ',' + ya + ' L' + X(1) + ',' + ya, 'class': 'ln-ink', 'marker-end': 'url(#g-ah)' }, svg);
      S('text', { x: X(1) + 8, y: ya + 4, 'class': 't-s', text: 'Δμ = 1' }, svg);
      S('text', { x: L, y: H - 4, 'class': 't-m', text: '纵轴按峰高自动缩放' }, svg);
    }
    slider.addEventListener('input', function () {
      group.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', Math.abs(parseFloat(b.getAttribute('data-s')) - parseFloat(slider.value)) < 1e-6 ? 'true' : 'false'); });
      draw();
    });
    group.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; slider.value = b.getAttribute('data-s'); pressSeg(group, b); draw(); });
    draw();
  })();

  /* ---------------- D3 natural gradient geometry ---------------- */
  (function npg() {
    var svg = $('npg-svg'); if (!svg) return;
    marker(svg, 'n-ah-ink', 's-ink'); marker(svg, 'n-ah-amb', 's-amb');
    var cx = 210, cy = 150, phi = Math.PI / 6;
    var u1 = [Math.cos(phi), Math.sin(phi)], u2 = [-Math.sin(phi), Math.cos(phi)];
    var sc = 55, a = sc / 2, b = sc * 2; // semi-axes along u1 (sensitive), u2 (insensitive)
    function P(v) { return [cx + v[0], cy - v[1]]; }
    S('line', { x1: 20, y1: cy, x2: 400, y2: cy, 'class': 'grid' }, svg);
    S('line', { x1: cx, y1: 16, x2: cx, y2: 284, 'class': 'grid' }, svg);
    S('text', { x: 396, y: cy - 6, 'text-anchor': 'end', 'class': 't-m', text: 'θ₁' }, svg);
    S('text', { x: cx + 6, y: 26, 'class': 't-m', text: 'θ₂' }, svg);
    var d = '';
    for (var i = 0; i <= 120; i++) {
      var t = 2 * Math.PI * i / 120, v = [u1[0] * a * Math.cos(t) + u2[0] * b * Math.sin(t), u1[1] * a * Math.cos(t) + u2[1] * b * Math.sin(t)], p = P(v);
      d += (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }
    S('path', { d: d + 'Z', style: 'fill:var(--amber-soft);stroke:var(--amber);stroke-width:1.6' }, svg);
    S('circle', { cx: cx, cy: cy, r: 62, style: 'fill:none;stroke:var(--muted);stroke-width:1.4;stroke-dasharray:5 4' }, svg);
    var e1 = P([u1[0] * 70, u1[1] * 70]), e2 = P([-u1[0] * 70, -u1[1] * 70]);
    S('line', { x1: e2[0], y1: e2[1], x2: e1[0], y2: e1[1], 'class': 'ln', style: 'stroke-width:1;stroke-dasharray:2 3' }, svg);
    var f1 = P([u2[0] * 128, u2[1] * 128]), f2 = P([-u2[0] * 128, -u2[1] * 128]);
    S('line', { x1: f2[0], y1: f2[1], x2: f1[0], y2: f1[1], 'class': 'ln', style: 'stroke-width:1;stroke-dasharray:2 3' }, svg);
    var g = [1, 0.15], gn = Math.hypot(g[0], g[1]);
    var gs = P([g[0] / gn * 62, g[1] / gn * 62]);
    S('path', { d: 'M' + cx + ',' + cy + ' L' + gs[0] + ',' + gs[1], 'class': 'ln-ink', style: 'stroke-width:2.2', 'marker-end': 'url(#n-ah-ink)' }, svg);
    var g1 = g[0] * u1[0] + g[1] * u1[1], g2 = g[0] * u2[0] + g[1] * u2[1];
    var nat = [u1[0] * g1 / 4 + u2[0] * g2 * 4, u1[1] * g1 / 4 + u2[1] * g2 * 4];
    // F = 4·u1u1ᵀ + 0.25·u2u2ᵀ；椭圆 vᵀFv = c0 的半轴为 a（沿 u1）和 b（沿 u2）
    var c0 = 4 * a * a, q = g1 * g1 / 4 + g2 * g2 * 4, k = Math.sqrt(c0 / q);
    var nv = [nat[0] * k, nat[1] * k];
    var ns = P(nv);
    S('path', { d: 'M' + cx + ',' + cy + ' L' + ns[0].toFixed(1) + ',' + ns[1].toFixed(1), 'class': 'ln-amb', style: 'stroke-width:2.6', 'marker-end': 'url(#n-ah-amb)' }, svg);
    S('circle', { cx: cx, cy: cy, r: 4.5, 'class': 's-ink' }, svg);
    S('text', { x: gs[0] + 8, y: gs[1] + 4, 'class': 't', style: 'font-weight:700', text: 'g' }, svg);
    S('text', { x: ns[0] + 8, y: ns[1] + 12, 'class': 't', style: 'fill:var(--amber);font-weight:700', text: 'F⁻¹g' }, svg);
    var lx = 430;
    S('circle', { cx: lx + 6, cy: 60, r: 6, style: 'fill:none;stroke:var(--muted);stroke-dasharray:3 2;stroke-width:1.4' }, svg);
    S('text', { x: lx + 20, y: 64, 'class': 't', text: '欧氏距离相同的点（圆）' }, svg);
    S('ellipse', { cx: lx + 6, cy: 92, rx: 9, ry: 4, style: 'fill:var(--amber-soft);stroke:var(--amber);stroke-width:1.4' }, svg);
    S('text', { x: lx + 20, y: 96, 'class': 't', text: 'KL 距离相同的点（椭圆）' }, svg);
    S('line', { x1: lx, y1: 124, x2: lx + 12, y2: 124, 'class': 'ln-ink', style: 'stroke-width:2.2' }, svg);
    S('text', { x: lx + 20, y: 128, 'class': 't', text: '普通梯度 g' }, svg);
    S('line', { x1: lx, y1: 156, x2: lx + 12, y2: 156, 'class': 'ln-amb', style: 'stroke-width:2.6' }, svg);
    S('text', { x: lx + 20, y: 160, 'class': 't', text: '自然梯度 F⁻¹g' }, svg);
    S('text', { x: lx, y: 200, 'class': 't-s', text: '短轴：策略敏感，参数只能动一点' }, svg);
    S('text', { x: lx, y: 220, 'class': 't-s', text: '长轴：策略不敏感，可以多动' }, svg);
    S('text', { x: lx, y: 240, 'class': 't-s', text: '自然梯度更多沿长轴前进' }, svg);
  })();

  /* ---------------- D4 minorize-maximize ---------------- */
  (function mm() {
    var svg = $('mm-svg'); if (!svg) return;
    var W = 640, H = 260, L = 40, R = 150, T = 18, B = 36;
    var X = lin(0, 6, L, W - R), Y = lin(0, 1.5, H - B, T);
    function J(t) { return 0.25 + 1.1 * Math.exp(-(t - 3.4) * (t - 3.4) / 2.2); }
    var t0 = 2.2, J0 = J(t0), dJ = 1.1 * Math.exp(-(t0 - 3.4) * (t0 - 3.4) / 2.2) * (-2 * (t0 - 3.4) / 2.2), c = 0.55;
    function M(t) { return J0 + dJ * (t - t0) - c * (t - t0) * (t - t0); }
    var t1 = t0 + dJ / (2 * c), M1 = M(t1), J1 = J(t1);
    S('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
    S('text', { x: W - R, y: H - 6, 'text-anchor': 'end', 'class': 't-s', text: 'θ' }, svg);
    S('path', { d: fnPath(J, 0, 6, X, Y, 200), 'class': 'ln-teal', style: 'stroke-width:2.4' }, svg);
    S('path', { d: fnPath(M, 1.35, 4.15, X, Y, 160), 'class': 'ln', style: 'stroke-width:2' }, svg);
    S('text', { x: X(5.9), y: Y(J(5.9)) - 10, 'text-anchor': 'end', 'class': 't', style: 'fill:var(--teal);font-weight:700', text: 'J(θ) 真实目标' }, svg);
    S('text', { x: X(4.05) + 8, y: Y(M(4.05)) + 4, 'class': 't-s', text: 'M(θ) 下界' }, svg);
    [[t0, 'θ_old'], [t1, 'θ_new']].forEach(function (p) {
      S('line', { x1: X(p[0]), y1: H - B, x2: X(p[0]), y2: Y(J(p[0])), 'class': 'ln', style: 'stroke-dasharray:3 3;stroke-width:1' }, svg);
      S('text', { x: X(p[0]), y: H - B + 17, 'text-anchor': 'middle', 'class': 't-m', html: sub('θ', p[1].slice(2)) }, svg);
    });
    S('line', { x1: X(t0), y1: Y(J0), x2: W - R + 6, y2: Y(J0), 'class': 'ln', style: 'stroke-dasharray:2 3;stroke-width:1' }, svg);
    S('circle', { cx: X(t0), cy: Y(J0), r: 4.5, 'class': 's-ink' }, svg);
    S('circle', { cx: X(t1), cy: Y(M1), r: 4.5, style: 'fill:var(--muted)' }, svg);
    S('circle', { cx: X(t1), cy: Y(J1), r: 5.5, style: 'fill:var(--amber-fill);stroke:var(--surface);stroke-width:2' }, svg);
    var bx = W - R + 12;
    S('path', { d: 'M' + bx + ',' + Y(J0) + ' L' + bx + ',' + Y(M1), 'class': 'ln-amb', style: 'stroke-width:3' }, svg);
    S('line', { x1: X(t1), y1: Y(M1), x2: bx, y2: Y(M1), 'class': 'ln', style: 'stroke-dasharray:2 3;stroke-width:1' }, svg);
    S('line', { x1: X(t1), y1: Y(J1), x2: bx, y2: Y(J1), 'class': 'ln', style: 'stroke-dasharray:2 3;stroke-width:1' }, svg);
    S('path', { d: 'M' + bx + ',' + Y(M1) + ' L' + bx + ',' + Y(J1), 'class': 'ln-teal', style: 'stroke-width:3' }, svg);
    S('text', { x: bx + 8, y: (Y(J0) + Y(M1)) / 2 + 4, 'class': 't-s', style: 'fill:var(--amber)', text: '保证的提升' }, svg);
    S('text', { x: bx + 8, y: (Y(M1) + Y(J1)) / 2 + 4, 'class': 't-s', style: 'fill:var(--teal)', text: '实际多出的' }, svg);
  })();

  /* ---------------- W3 PPO clip ---------------- */
  (function clipW() {
    var svg = $('clip-svg'); if (!svg) return;
    var W = 640, H = 290, L = 52, R = 20, T = 20, B = 40;
    var eps = $('clip-eps'), epsOut = $('clip-eps-out'), rs = $('clip-r'), rOut = $('clip-r-out'), read = $('clip-read');
    var group = svg.closest('.widget').querySelector('.seg'), A = 1;
    function clip(r, e) { return Math.max(1 - e, Math.min(1 + e, r)); }
    function draw() {
      var e = parseFloat(eps.value), r = parseFloat(rs.value);
      epsOut.textContent = fmt(e); rOut.textContent = fmt(r);
      clear(svg);
      var y0 = A > 0 ? -0.2 : -2.2, y1 = A > 0 ? 2.2 : 0.2;
      var X = lin(0, 2, L, W - R), Y = lin(y0, y1, H - B, T);
      S('rect', { x: X(1 - e), y: T, width: X(1 + e) - X(1 - e), height: H - B - T, style: 'fill:var(--amber-soft);opacity:.8' }, svg);
      S('text', { x: (X(1 - e) + X(1 + e)) / 2, y: T + 14, 'text-anchor': 'middle', 'class': 't-m', style: 'fill:var(--amber)', text: '[1−ε, 1+ε]' }, svg);
      S('line', { x1: L, y1: Y(0), x2: W - R, y2: Y(0), 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
      S('line', { x1: L, y1: T, x2: L, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
      for (var tk = 0; tk <= 2; tk += 0.5) {
        S('line', { x1: X(tk), y1: H - B, x2: X(tk), y2: H - B + 4, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
        S('text', { x: X(tk), y: H - B + 17, 'text-anchor': 'middle', 'class': 't-m', text: tk }, svg);
      }
      S('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, 'class': 'grid' }, svg);
      for (var yv = Math.ceil(y0); yv <= y1; yv += 1) {
        S('text', { x: L - 8, y: Y(yv) + 4, 'text-anchor': 'end', 'class': 't-m', text: yv }, svg);
      }
      S('text', { x: W - R, y: H - 6, 'text-anchor': 'end', 'class': 't-s', text: '概率比 r = π_θ / π_old' }, svg);
      S('text', { x: L + 6, y: A > 0 ? T + 14 : H - B - 8, 'class': 't-s', text: '目标 L（Â = ' + (A > 0 ? '+1' : '−1') + '）' }, svg);
      S('path', { d: 'M' + X(0) + ',' + Y(0) + ' L' + X(2) + ',' + Y(2 * A), 'class': 'ln', style: 'stroke-dasharray:5 4;stroke-width:1.4' }, svg);
      S('text', { x: X(1.95), y: Y(1.95 * A) + (A > 0 ? -8 : 16), 'text-anchor': 'end', 'class': 't-s', text: '未裁剪 r·Â' }, svg);
      function Lc(x) { return Math.min(x * A, clip(x, e) * A); }
      // pieces: gradient-zero segments muted, others amber
      var pieces = A > 0 ? [[0, 1 + e, true], [1 + e, 2, false]] : [[0, 1 - e, false], [1 - e, 2, true]];
      pieces.forEach(function (p) {
        S('path', { d: fnPath(Lc, p[0], p[1], X, Y, 60), style: 'fill:none;stroke-linecap:round;stroke-width:' + (p[2] ? 3.4 : 3.4) + ';stroke:' + (p[2] ? 'var(--amber)' : 'var(--muted)') }, svg);
        if (!p[2]) {
          var mx = (p[0] + p[1]) / 2;
          S('text', { x: X(mx), y: Y(Lc(mx)) + (A > 0 ? -10 : 18), 'text-anchor': 'middle', 'class': 't-s', text: '平的：梯度为 0' }, svg);
        }
      });
      var val = Lc(r);
      S('line', { x1: X(r), y1: T, x2: X(r), y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1;stroke-dasharray:2 3' }, svg);
      S('circle', { cx: X(r), cy: Y(val), r: 6.5, style: 'fill:var(--ink);stroke:var(--surface);stroke-width:2' }, svg);
      var inBand = r >= 1 - e && r <= 1 + e, msg;
      if (A > 0) {
        if (inBand) msg = '<b>r 在区间内</b>：目标就是 r·Â，梯度正常，继续提高这个好动作的概率。';
        else if (r > 1 + e) msg = '<b>好动作已经提得够多</b>：r 超过 1+ε，min 取到截断项 (1+ε)·Â，是个常数，梯度为 0，不再继续推。';
        else msg = '<b>好动作的概率反而被降低了</b>：r 低于 1−ε，min 取未截断的 r·Â（更悲观的那个），梯度照常，把它拉回来。';
      } else {
        if (inBand) msg = '<b>r 在区间内</b>：目标就是 r·Â，梯度正常，继续降低这个坏动作的概率。';
        else if (r < 1 - e) msg = '<b>坏动作已经压得够低</b>：r 低于 1−ε，min 取到截断项 (1−ε)·Â，梯度为 0，不再继续压。';
        else msg = '<b>坏动作的概率反而被提高了</b>：r 超过 1+ε，min 取未截断的 r·Â，梯度照常，把它压回去。';
      }
      read.innerHTML = msg + ' 当前 L = ' + fmt(val) + '。';
    }
    group.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; A = parseInt(b.getAttribute('data-adv'), 10); pressSeg(group, b); draw(); });
    eps.addEventListener('input', draw); rs.addEventListener('input', draw);
    draw();
  })();

  /* ---------------- overoptimization schematic ---------------- */
  (function ovr() {
    var svg = $('ovr-svg'); if (!svg) return;
    var W = 640, H = 270, L = 40, R = 24, T = 22, B = 40;
    var X = lin(0, 10, L, W - R), Y = lin(0, 3.3, H - B, T);
    function px(d) { return 0.3 * d; }
    function gd(d) { return 0.3 * d - 0.028 * d * d; }
    var dPeak = 0.3 / (2 * 0.028);
    S('rect', { x: X(dPeak), y: T, width: X(10) - X(dPeak), height: H - B - T, style: 'fill:var(--red-soft);opacity:.7' }, svg);
    S('text', { x: (X(dPeak) + X(10)) / 2, y: H - B - 10, 'text-anchor': 'middle', 'class': 't-s', style: 'fill:var(--red)', text: '过度优化：分数涨，质量跌' }, svg);
    S('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
    S('line', { x1: L, y1: T, x2: L, y2: H - B, 'class': 'ln-ink', style: 'stroke-width:1' }, svg);
    S('text', { x: W - R, y: H - 12, 'text-anchor': 'end', 'class': 't-s', text: '策略离初始模型的距离（√KL）→' }, svg);
    S('text', { x: L + 6, y: T + 4, 'class': 't-s', text: '奖励（示意）' }, svg);
    S('path', { d: fnPath(px, 0, 10, X, Y, 100), 'class': 'ln-amb', style: 'stroke-width:2.6' }, svg);
    S('path', { d: fnPath(gd, 0, 10, X, Y, 100), 'class': 'ln-teal', style: 'stroke-width:2.6' }, svg);
    S('line', { x1: X(dPeak), y1: Y(gd(dPeak)), x2: X(dPeak), y2: H - B, 'class': 'ln', style: 'stroke-dasharray:3 3;stroke-width:1' }, svg);
    S('circle', { cx: X(dPeak), cy: Y(gd(dPeak)), r: 5, style: 'fill:var(--teal)' }, svg);
    S('text', { x: X(9.6), y: Y(px(9.6)) - 10, 'text-anchor': 'end', 'class': 't', style: 'fill:var(--amber);font-weight:700', text: '奖励模型的打分（代理奖励）' }, svg);
    S('text', { x: X(9.7), y: Y(gd(9.7)) - 10, 'text-anchor': 'end', 'class': 't', style: 'fill:var(--teal);font-weight:700', text: '真实质量' }, svg);
    S('text', { x: X(dPeak) - 8, y: Y(gd(dPeak)) + 24, 'text-anchor': 'end', 'class': 't-s', text: '真实质量的最高点' }, svg);
  })();

  /* ---------------- W5 beta reweighting ---------------- */
  (function betaW() {
    var svg = $('beta-svg'); if (!svg) return;
    var C = [
      { k: 'A', n: '简短但正确', ref: 0.30, r: 0.6 },
      { k: 'B', n: '详细且正确', ref: 0.25, r: 1.0 },
      { k: 'C', n: '有小错误', ref: 0.30, r: 0.1 },
      { k: 'D', n: '答非所问', ref: 0.13, r: -0.8 },
      { k: 'E', n: '堆砌讨好话术', ref: 0.02, r: 1.6, note: 'RM 高估' }
    ];
    var W = 640, H = 270, L = 40, R = 30, T = 30, B = 62;
    var slider = $('beta-r'), out = $('beta-out'), read = $('beta-read');
    var group = slider.closest('.widget').querySelector('.seg');
    function draw() {
      var beta = Math.pow(10, parseFloat(slider.value)); out.textContent = beta < 1 ? fmt(beta) : fmt(beta, 1);
      var w = C.map(function (c) { return c.ref * Math.exp(c.r / beta); }), Z = w.reduce(function (a, b) { return a + b; }, 0);
      var p = w.map(function (x) { return x / Z; });
      clear(svg);
      var Y = lin(0, 1, H - B, T), slot = (W - L - R) / C.length;
      for (var g = 0; g <= 1.0001; g += 0.25) {
        S('line', { x1: L, y1: Y(g), x2: W - R, y2: Y(g), 'class': 'grid' }, svg);
        S('text', { x: L - 6, y: Y(g) + 4, 'text-anchor': 'end', 'class': 't-m', text: Math.round(g * 100) + '%' }, svg);
      }
      S('rect', { x: W - R - 210, y: 6, width: 10, height: 10, rx: 2, style: 'fill:none;stroke:var(--muted);stroke-width:1.5' }, svg);
      S('text', { x: W - R - 195, y: 15, 'class': 't-s', text: '参考模型 π_ref' }, svg);
      S('rect', { x: W - R - 100, y: 6, width: 10, height: 10, rx: 2, style: 'fill:var(--amber-fill)' }, svg);
      S('text', { x: W - R - 85, y: 15, 'class': 't-s', text: '最优策略 π*' }, svg);
      C.forEach(function (c, i) {
        var x = L + slot * i + slot / 2, bw = Math.min(26, slot * 0.26);
        S('rect', { x: x - bw - 3, y: Y(c.ref), width: bw, height: Y(0) - Y(c.ref), rx: 2, style: 'fill:var(--surface-2);stroke:var(--muted);stroke-width:1.2' }, svg);
        S('rect', { x: x + 3, y: Y(p[i]), width: bw, height: Math.max(0.5, Y(0) - Y(p[i])), rx: 2, style: 'fill:' + (c.note ? 'var(--red)' : 'var(--amber-fill)') }, svg);
        S('text', { x: x + 3 + bw / 2, y: Y(p[i]) - 5, 'text-anchor': 'middle', 'class': 't-m', style: 'fill:var(--ink)', text: Math.round(p[i] * 100) + '%' }, svg);
        S('text', { x: x, y: H - B + 18, 'text-anchor': 'middle', 'class': 't', style: 'font-weight:700', text: c.k + ' ' + c.n }, svg);
        S('text', { x: x, y: H - B + 35, 'text-anchor': 'middle', 'class': 't-s', text: (c.note ? c.note + ' · ' : '') + 'r = ' + c.r }, svg);
      });
      var imax = p.indexOf(Math.max.apply(null, p)), diff = Math.max.apply(null, p.map(function (x, i) { return Math.abs(x - C[i].ref); }));
      var head = 'β = ' + out.textContent + '：π* 给 ' + C[imax].k + '（' + C[imax].n + '）' + Math.round(p[imax] * 100) + '% 的概率，E 占 ' + Math.round(p[4] * 100) + '%。';
      var tail;
      if (imax === 4) tail = '<b>β 太小</b>：概率集中到了奖励模型最看好、但在参考模型里极罕见的回答上。这就是奖励投机，也是 KL 约束要防止的情况。';
      else if (diff < 0.06) tail = '<b>β 很大</b>：π* 几乎就是参考模型，奖励的作用很弱，模型学不到多少东西。';
      else tail = '<b>折中</b>：概率向高奖励的正常回答集中；参考模型给 E 的概率很低，把它压住了。';
      read.innerHTML = head + ' ' + tail;
    }
    slider.addEventListener('input', function () {
      var b = Math.pow(10, parseFloat(slider.value));
      group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', Math.abs(parseFloat(x.getAttribute('data-b')) - b) / b < 0.02 ? 'true' : 'false'); });
      draw();
    });
    group.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; slider.value = Math.log10(parseFloat(b.getAttribute('data-b'))); pressSeg(group, b); draw(); });
    draw();
  })();

  /* ---------------- W4 GRPO group advantage ---------------- */
  (function grpoW() {
    var svg = $('grpo-svg'); if (!svg) return;
    var box = $('grpo-chips'), rw = [1, 0, 0, 1, 0, 0, 1, 0], mode = 'grpo';
    var group = svg.closest('.widget').querySelector('.seg');
    var chips = rw.map(function (v, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.addEventListener('click', function () { rw[i] = 1 - rw[i]; draw(); });
      box.appendChild(b); return b;
    });
    function draw() {
      var G = rw.length, mean = rw.reduce(function (a, b) { return a + b; }, 0) / G;
      var sd = Math.sqrt(rw.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / G);
      var A = rw.map(function (r) {
        if (mode === 'grpo') return sd < 1e-9 ? 0 : (r - mean) / sd;
        if (mode === 'dr') return r - mean;
        return r - (mean * G - r) / (G - 1);
      });
      chips.forEach(function (b, i) {
        b.setAttribute('aria-pressed', rw[i] ? 'true' : 'false');
        b.setAttribute('aria-label', '回答 ' + (i + 1) + '：' + (rw[i] ? '正确' : '错误') + '，点击切换');
        b.innerHTML = '#' + (i + 1) + '<small>' + (rw[i] ? '✓ 正确 r=1' : '✗ 错误 r=0') + '</small>';
      });
      $('grpo-mean').textContent = fmt(mean, 3); $('grpo-std').textContent = fmt(sd, 3);
      clear(svg);
      var W = 640, H = 230, L = 44, R = 12, T = 34, B = 26;
      var m = Math.max(1, Math.max.apply(null, A.map(Math.abs))) * 1.2;
      var Y = lin(-m, m, H - B, T), slot = (W - L - R) / 8;
      var step = m > 2 ? 1 : 0.5;
      for (var g = -Math.floor(m / step) * step; g <= m; g += step) {
        S('line', { x1: L, y1: Y(g), x2: W - R, y2: Y(g), 'class': 'grid', style: Math.abs(g) < 1e-9 ? 'stroke:var(--ink);stroke-width:1.2' : '' }, svg);
        S('text', { x: L - 6, y: Y(g) + 4, 'text-anchor': 'end', 'class': 't-m', text: (g > 0 ? '+' : '') + fmt(g, 1) }, svg);
      }
      A.forEach(function (a, i) {
        var x = L + slot * i + slot * 0.22, bw = slot * 0.56;
        var y = a >= 0 ? Y(a) : Y(0), h = Math.max(1, Math.abs(Y(a) - Y(0)));
        S('rect', { x: x, y: y, width: bw, height: h, rx: 3, style: 'fill:' + (Math.abs(a) < 1e-9 ? 'var(--muted)' : a > 0 ? 'var(--teal-fill)' : 'var(--red)') }, svg);
        S('text', { x: x + bw / 2, y: a >= 0 ? Y(a) - 6 : Y(a) + 14, 'text-anchor': 'middle', 'class': 't-m', style: 'fill:var(--ink)', text: (a > 0 ? '+' : '') + fmt(a, 2) }, svg);
        S('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'class': 't-m', text: '#' + (i + 1) }, svg);
      });
      S('text', { x: L, y: 14, 'class': 't-s', text: '优势 Â（同一回答的所有 token 共享）' }, svg);
      var n1 = rw.reduce(function (a, b) { return a + b; }, 0), msg;
      if (n1 === 0 || n1 === G) {
        msg = '<b>全部' + (n1 ? '正确' : '错误') + '</b>：组内没有差别，所有优势都是 0，这道题不产生任何梯度。DAPO 的动态采样会把这样的题过滤掉。';
      } else {
        var ap = A[rw.indexOf(1)], an = A[rw.indexOf(0)];
        msg = '8 个回答里答对 ' + n1 + ' 个：答对的优势 ' + (ap > 0 ? '+' : '') + fmt(ap) + '，答错的 ' + fmt(an) + '。答对的越少，答对者的优势越大，难题上的一次成功会被重点强化。';
        if (mode === 'grpo') msg += ' <b>除以标准差</b>让优势尺度固定；几乎全对或全错时标准差很小，优势会被放大，这就是第 14 章 Dr. GRPO 指出的难度偏差。';
        else if (mode === 'dr') msg += ' <b>只减均值</b>：优势的尺度随题目难度自然变化，几乎全对或全错的题不会被人为放大。';
        else msg += ' <b>留一均值</b>：每个回答的基线里不含它自己，严格无偏；结果等于“只减均值”再乘以 G/(G−1)。';
      }
      $('grpo-read').innerHTML = msg;
    }
    group.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; mode = b.getAttribute('data-mode'); pressSeg(group, b); draw(); });
    draw();
  })();
})();
