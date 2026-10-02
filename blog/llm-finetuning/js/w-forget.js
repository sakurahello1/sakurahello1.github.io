/* 遗忘的几何：闭式读数、真实迭代路径与 EWC 权衡。 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function $(id) { return document.getElementById(id); }
  var root = $('w-forget'); if (!root) return;
  var svg = $('fg-svg'), motion = matchMedia('(prefers-reduced-motion: reduce)');
  var ids = ['fg-k', 'fg-a', 'fg-n', 'fg-l'], M, P, dot, raf = 0, visible = false;
  function fmt(x, d) { d = d == null ? 6 : d; return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−'); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function S(parent, tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e); return e;
  }
  function width(s) { return Math.round(s.getBoundingClientRect().width); }
  function frame(s, h) {
    var w = width(s); s.setAttribute('viewBox', '0 0 ' + w + ' ' + h); s.setAttribute('height', h);
    while (s.firstChild) s.removeChild(s.firstChild);
    return w;
  }
  function inputs() { return { kappa: +$('fg-k').value, alpha: +$('fg-a').value, phi: +$('fg-n').value, lambda: Math.pow(10, +$('fg-l').value) }; }
  function model(p) {
    var a = p.alpha * Math.PI / 180, f = p.phi * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), k = p.kappa;
    var n = [Math.cos(f), Math.sin(f)], A = k * ca * ca + sa * sa, B = (k - 1) * ca * sa, C = k * sa * sa + ca * ca;
    var v = [(C * n[0] - B * n[1]) / k, (A * n[1] - B * n[0]) / k], q = n[0] * v[0] + n[1] * v[1];
    function old(x) { return (A * x[0] * x[0] + 2 * B * x[0] * x[1] + C * x[1] * x[1]) / 2; }
    function ewc(l) { return [v[0] / (q + l), v[1] / (q + l)]; }
    var E = n.slice(), K = ewc(0), W = ewc(p.lambda), dE = old(E), dK = 0.5 / q;
    return { params: p, a: a, A: A, B: B, C: C, n: n, v: v, q: q, E: E, K: K, W: W, dE: dE, dK: dK, ratio: dE / dK, dW: old(W), bW: 0.5 * Math.pow(p.lambda / (q + p.lambda), 2), old: old, ewc: ewc };
  }
  // 从零点出发；自然梯度是固定方向，欧拉折线自然共线。
  function integrate(m, natural, steps) {
    var x = [0, 0], out = [x.slice()], v = natural ? m.v : m.n, eta = natural ? 0.5 : 0.2;
    for (var j = 0; j < steps; j++) {
      var r = m.n[0] * x[0] + m.n[1] * x[1] - 1;
      x[0] -= eta * r * v[0]; x[1] -= eta * r * v[1];
      if (j % 10 === 0 || j === steps - 1) out.push(x.slice());
    }
    return out;
  }
  function debug(p) {
    p = p || inputs();
    [['kappa', 1, 40], ['alpha', 0, 180], ['phi', 0, 180], ['lambda', 0.001, 100]].forEach(function (b) {
      if (typeof p[b[0]] !== 'number' || !isFinite(p[b[0]]) || p[b[0]] < b[1] || p[b[0]] > b[2]) throw new RangeError('参数越界：' + b[0]);
    });
    var m = model(p), gd = integrate(m, false, 5000), ng = integrate(m, true, 5000), l = p.lambda;
    var a = l * m.A + m.n[0] * m.n[0], b = l * m.B + m.n[0] * m.n[1], c = l * m.C + m.n[1] * m.n[1], det = a * c - b * b;
    var solved = [(c * m.n[0] - b * m.n[1]) / det, (a * m.n[1] - b * m.n[0]) / det];
    var g = gd[gd.length - 1], n = ng[ng.length - 1], err = 0;
    for (var j = 0; j < 2; j++) err = Math.max(err, Math.abs(g[j] - m.E[j]), Math.abs(n[j] - m.K[j]), Math.abs(solved[j] - m.W[j]));
    return { params: p, E: m.E, K: m.K, W: m.W, dE: m.dE, dK: m.dK, ratio: m.ratio, dW: m.dW, bW: m.bW, gd: g, natural: n, directEwc: solved, maxError: err };
  }
  window.__forgetDebug = debug;
  function plot() {
    var w = width(svg), ml = 29, mr = 21, mt = 46, pw = w - ml - mr;
    // 保持等比例；高曲率时给真正的 KL 落点留出空间。
    var range = Math.max(2.6, Math.abs(M.K[0]) + 0.7, Math.abs(M.K[1]) + 0.7), s = Math.min(72, pw / (2 * range));
    var yr = Math.max(2.4, Math.abs(M.K[1]) + 0.7), ph = 2 * yr * s, h = Math.ceil(mt + ph + 29);
    frame(svg, h);
    var p = { w: w, h: h, ml: ml, mt: mt, pw: pw, ph: ph, s: s, xr: pw / (2 * s), yr: yr };
    p.X = function (x) { return ml + pw / 2 + x * s; }; p.Y = function (y) { return mt + ph / 2 - y * s; };
    S(S(S(svg, 'defs', {}), 'clipPath', { id: 'fg-clip' }), 'rect', { x: ml, y: mt, width: pw, height: ph });
    S(svg, 'rect', { class: 'plate', x: ml, y: mt, width: pw, height: ph });
    for (var i = Math.ceil(-p.xr); i <= p.xr; i++) {
      S(svg, 'line', { class: i ? 'grid' : 'axis', x1: p.X(i), x2: p.X(i), y1: mt, y2: mt + ph });
      S(svg, 'text', { class: 'tick', x: p.X(i), y: mt + ph + 17, 'text-anchor': 'middle' }, fmt(i, 0));
    }
    for (i = Math.ceil(-yr); i <= yr; i++) {
      S(svg, 'line', { class: i ? 'grid' : 'axis', x1: ml, x2: ml + pw, y1: p.Y(i), y2: p.Y(i) });
      S(svg, 'text', { class: 'tick', x: ml - 6, y: p.Y(i) + 4, 'text-anchor': 'end' }, fmt(i, 0));
    }
    S(svg, 'text', { class: 'tick', x: w - 1, y: p.Y(0) - 6, 'text-anchor': 'end' }, 'θ₁');
    S(svg, 'text', { class: 'tick', x: p.X(0) + 5, y: mt - 5 }, 'θ₂');
    S(svg, 'line', { class: 'fg-solution', x1: ml, y1: 16, x2: ml + 24, y2: 16 });
    S(svg, 'text', { x: ml + 31, y: 20 }, '新任务的解 L_B = ' + fmt(0, 0));
    return p;
  }
  function ellipseD(level) {
    var d = '', ca = Math.cos(M.a), sa = Math.sin(M.a), ra = Math.sqrt(2 * level / M.params.kappa), rb = Math.sqrt(2 * level);
    for (var j = 0; j <= 128; j++) {
      var t = 2 * Math.PI * j / 128, u = ra * Math.cos(t), v = rb * Math.sin(t);
      d += (j ? 'L' : 'M') + P.X(u * ca - v * sa).toFixed(2) + ' ' + P.Y(u * sa + v * ca).toFixed(2);
    }
    return d + 'Z';
  }
  function path(points) { return points.map(function (x, j) { return (j ? 'L' : 'M') + P.X(x[0]).toFixed(2) + ' ' + P.Y(x[1]).toFixed(2); }).join(''); }
  // 参数直线与矩形求交，避免角度接近坐标轴时除零。
  function segment(base, dir) {
    var lo = -Infinity, hi = Infinity, ranges = [P.xr, P.yr];
    for (var j = 0; j < 2; j++) {
      if (Math.abs(dir[j]) < 1e-12) continue;
      var u = (-ranges[j] - base[j]) / dir[j], v = (ranges[j] - base[j]) / dir[j];
      lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v));
    }
    return [[base[0] + lo * dir[0], base[1] + lo * dir[1]], [base[0] + hi * dir[0], base[1] + hi * dir[1]]];
  }
  function diamond(parent, x, y) { return S(parent, 'path', { class: 'fg-diamond', d: 'M' + x + ' ' + (y - 5) + 'l5 5 -5 5 -5 -5Z' }); }
  function cross(parent, x, y) { S(parent, 'path', { class: 'xmark', d: 'M' + (x - 5) + ' ' + y + 'h10M' + x + ' ' + (y - 5) + 'v10' }); }
  // 标签逐个避让点与已放标签，边界附近向内排。
  function labels(points) {
    var boxes = points.map(function (q) { return { x: P.X(q.p[0]) - 8, y: P.Y(q.p[1]) - 8, w: 16, h: 16 }; });
    points.forEach(function (q) {
      var el = S(svg, 'text', { class: 'lab fg-label' + (q.name === 'GD' ? ' fg-orange' : '') }, q.name);
      var bb = el.getBBox(), w = bb.width + 6, h = 19, px = P.X(q.p[0]), py = P.Y(q.p[1]), found;
      for (var r = 17; r <= 129 && !found; r += 14) {
        for (var j = 0; j < 16 && !found; j++) {
          var a = (j / 8 - 0.25) * Math.PI, x = clamp(px + r * Math.cos(a) - w / 2, P.ml + 3, P.ml + P.pw - w - 3), y = clamp(py + r * Math.sin(a) - h / 2, P.mt + 3, P.mt + P.ph - h - 3);
          var hit = boxes.some(function (b) { return x < b.x + b.w + 3 && x + w + 3 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y; });
          if (!hit) found = { x: x, y: y, w: w, h: h };
        }
      }
      boxes.push(found); el.setAttribute('x', found.x + 3); el.setAttribute('y', found.y + 14);
      if (Math.hypot(found.x + w / 2 - px, found.y + h / 2 - py) > 29) {
        var line = S(svg, 'line', { class: 'fg-leader', x1: px, y1: py, x2: found.x + w / 2, y2: found.y + h / 2 });
        svg.insertBefore(line, el);
      }
    });
  }
  var trade = document.createElementNS(NS, 'svg'); trade.id = 'fg-trade'; trade.setAttribute('class', 'kc'); trade.setAttribute('role', 'img'); trade.setAttribute('aria-label', 'EWC 的损失权衡：横轴是新任务剩余损失，纵轴是旧任务损失增量；菱形为当前强度');
  svg.parentNode.insertBefore(trade, svg.nextSibling);
  var note = document.createElement('p'); note.id = 'fg-note'; note.className = 'fg-note';
  note.textContent = '自然梯度沿实算折线到达 KL 点；细实线与菱形表示 EWC。λ 趋于零时趋向 KL 点，λ 越大则越接近预训练点。';
  trade.parentNode.insertBefore(note, trade.nextSibling);
  function tradeoff() {
    var w = frame(trade, 168), left = 54, right = w - 16, top = 29, bottom = 123;
    function X(b) { return left + (right - left) * b / 0.5; }
    function Y(a) { return bottom - (bottom - top) * a / M.dK; }
    S(trade, 'text', { x: left, y: 15 }, 'EWC 权衡：ΔL_A');
    S(trade, 'path', { class: 'axis fg-unfilled', d: 'M' + left + ' ' + top + 'V' + bottom + 'H' + right });
    [0, 0.5, 1].forEach(function (t) {
      S(trade, 'text', { class: 'tick', x: left - 6, y: Y(M.dK * t) + 4, 'text-anchor': 'end' }, fmt(M.dK * t, 2));
      S(trade, 'text', { class: 'tick', x: X(0.5 * t), y: bottom + 17, 'text-anchor': t === 1 ? 'end' : 'middle' }, fmt(0.5 * t, 2));
    });
    var d = '';
    // 完整极限曲线用 t = q/(q+λ) 参数化，端点也按公式计算。
    for (var i = 0; i <= 100; i++) {
      var t = i / 100; d += (i ? 'L' : 'M') + X(0.5 * (1 - t) * (1 - t)) + ' ' + Y(M.dK * t * t);
    }
    S(trade, 'path', { class: 'fg-trade-line', d: d });
    diamond(trade, X(M.bW), Y(M.dW));
    S(trade, 'text', { class: 'tick', x: right, y: 162, 'text-anchor': 'end' }, '剩余 L_B →');
  }
  function position(t) { dot.setAttribute('cx', P.X(t * M.E[0])); dot.setAttribute('cy', P.Y(t * M.E[1])); }
  function finish() { cancelAnimationFrame(raf); raf = 0; if (dot) { position(1); dot.setAttribute('class', 'fg-gd'); } }
  function replay() {
    finish(); if (motion.matches || !visible) return;
    var start = null; position(0); dot.setAttribute('class', 'fg-gd fg-moving');
    function tick(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / 1250); position((1 - Math.exp(-6 * t)) / (1 - Math.exp(-6)));
      if (t < 1) raf = requestAnimationFrame(tick); else finish();
    }
    raf = requestAnimationFrame(tick);
  }
  function render() {
    finish(); M = model(inputs()); P = plot();
    var g = S(svg, 'g', { 'clip-path': 'url(#fg-clip)' });
    for (var i = 1; i <= 8; i++) S(g, 'path', { class: 'ct', d: ellipseD(0.5 * Math.pow(i * P.yr / 4, 2)) });
    [M.dE, M.dK].forEach(function (v) { S(g, 'path', { class: 'ct on', d: ellipseD(v) }); });
    [[Math.cos(M.a), Math.sin(M.a)], [-Math.sin(M.a), Math.cos(M.a)]].forEach(function (v) { S(g, 'path', { class: 'fg-principal', d: path(segment([0, 0], v)) }); });
    S(g, 'path', { class: 'fg-solution', d: path(segment(M.E, [-M.n[1], M.n[0]])) });
    S(g, 'path', { class: 'fg-natural', d: path(integrate(M, true, 5000)) });
    var ewc = [];
    for (i = 0; i <= 100; i++) ewc.push(M.ewc(Math.pow(10, -3 + 5 * i / 100)));
    S(g, 'path', { class: 'fg-ewc-path', d: path(ewc) });
    S(g, 'path', { class: 'gdp', d: path([[0, 0], M.E]) });
    cross(svg, P.X(0), P.Y(0));
    S(svg, 'circle', { class: 'fg-kl', cx: P.X(M.K[0]), cy: P.Y(M.K[1]), r: 7 });
    diamond(svg, P.X(M.W[0]), P.Y(M.W[1]));
    dot = S(svg, 'circle', { class: 'fg-gd', r: 4.5 }); position(1);
    labels([{ name: 'θ₀', p: [0, 0] }, { name: 'GD', p: M.E }, { name: 'KL', p: M.K }, { name: 'EWC', p: M.W }]);
    $('fg-k-out').textContent = fmt(M.params.kappa, 1);
    $('fg-a-out').textContent = fmt(M.params.alpha, 0) + '°'; $('fg-n-out').textContent = fmt(M.params.phi, 0) + '°';
    $('fg-l-out').textContent = fmt(M.params.lambda, 4);
    $('fg-dE').textContent = fmt(M.dE); $('fg-dK').textContent = fmt(M.dK); $('fg-ratio').textContent = fmt(M.ratio);
    $('fg-ewc').textContent = fmt(M.dW) + ' ／ ' + fmt(M.bW);
    $('fg-read').textContent = '梯度下降落在（' + fmt(M.E[0], 3) + '，' + fmt(M.E[1], 3) + '），旧任务损失增加 ' + fmt(M.dE, 3) + '；KL 最近点为（' + fmt(M.K[0], 3) + '，' + fmt(M.K[1], 3) + '），只增加 ' + fmt(M.dK, 3) + '，是前者的 ' + fmt(M.dK / M.dE, 3) + ' 倍。κ = ' + fmt(1, 0) + ' 或 n 沿椭圆主轴时，两点重合。这是“RL 的剃刀”与 EWC 背后的几何玩具模型；真实网络的损失并非全局二次函数。';
    tradeoff();
  }
  ids.forEach(function (id) { $(id).addEventListener('input', render); });
  $('fg-go').addEventListener('click', function () {
    var r = svg.getBoundingClientRect();
    if (!motion.matches && (r.top < 0 || r.bottom > innerHeight)) svg.scrollIntoView({ block: 'center', behavior: 'instant' });
    replay();
  });
  motion.addEventListener('change', finish);
  var lastWidth = 0;
  new ResizeObserver(function () { var w = width(svg); if (w !== lastWidth) { lastWidth = w; render(); } }).observe(svg);
  new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) replay(); else finish(); }, { threshold: 0.1 }).observe(svg);
  render();
  console.assert(debug().maxError < 1e-9, '遗忘几何的数值自检失败');
})();
