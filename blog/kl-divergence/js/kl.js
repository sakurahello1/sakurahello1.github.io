/* KL 散度从哪里来 · 实例与目录
   全篇共用一对分布 p（真实）与 q（你以为的）。第 1 章的实验台和每个实例顶上的小柱状图都能拖，
   改动经 changed() 同步到所有表格和曲线；art.js 的码带图版也读 window.KL.state。 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var LN2 = Math.LN2;
  var log2 = Math.log2;
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // 熵、交叉熵与 KL（比特）；p(x) = 0 的项不计。
  function H(p) { return p.reduce(function (s, x) { return x > 0 ? s - x * log2(x) : s; }, 0); }
  function CE(p, q) { return p.reduce(function (s, x, i) { return x > 0 ? s - x * log2(q[i]) : s; }, 0); }
  function KL(p, q) { return p.reduce(function (s, x, i) { return x > 0 ? s + x * log2(x / q[i]) : s; }, 0); }
  function fmt(x, d) { d = d == null ? 3 : d; return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−'); }

  function S(parent, tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  function frame(svg, h) {
    var w = Math.max(260, Math.round(svg.getBoundingClientRect().width));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('height', h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return w;
  }
  // 标签里的拉丁字母用 KaTeX 的斜体，和公式一致。
  function mtext(parent, attrs, str) {
    var t = S(parent, 'text', attrs);
    str.replace(/([A-Za-z])|([^A-Za-z]+)/g, function (m, letter) { S(t, 'tspan', { class: letter ? 'mi-t' : 'mn-t' }, m); return m; });
    return t;
  }
  function niceTicks(lo, hi, n) {
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
    var step = (e < 1.5 ? 1 : e < 3 ? 2 : e < 7 ? 5 : 10) * mag;
    var dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)), out = [];
    for (var v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push([v, fmt(v, dec)]);
    return out;
  }

  var PIPS = [
    [[.5, .5]], [[.28, .28], [.72, .72]], [[.28, .28], [.5, .5], [.72, .72]],
    [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]]
  ];
  function die(parent, cx, cy, s, face) {
    var g = S(parent, 'g', { class: 'die', transform: 'translate(' + (cx - s / 2) + ',' + (cy - s / 2) + ')' });
    S(g, 'rect', { width: s, height: s, rx: s * .2 });
    PIPS[face].forEach(function (p) { S(g, 'circle', { cx: p[0] * s, cy: p[1] * s, r: s * .095 }); });
  }
  function dieIcon(face, s) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', s); svg.setAttribute('height', s);
    svg.setAttribute('viewBox', '0 0 ' + s + ' ' + s);
    svg.setAttribute('class', 'die-icon');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (face + 1) + ' 点');
    die(svg, s / 2, s / 2, s - 2, face);
    return svg;
  }

  /* ---------------- 共享状态 ---------------- */
  var UNIFORM = [1, 1, 1, 1, 1, 1].map(function () { return 1 / 6; });
  var LOADED = [.1, .1, .1, .1, .1, .5];
  var state = { p: LOADED.slice(), q: UNIFORM.slice(), focus: null };
  window.KL = { state: state };
  var PRESETS = [
    ['loaded', '灌铅骰子', function () { return [LOADED.slice(), UNIFORM.slice()]; }],
    ['swap', '对调 <span class="mi">p</span> 与 <span class="mi">q</span>', function () { return [state.q.slice(), state.p.slice()]; }],
    ['same', '两者相同', function () { return [state.p.slice(), state.p.slice()]; }],
    ['blind', '<span class="mi">q</span> 几乎忽略 6 点', function () { return [LOADED.slice(), [.198, .198, .198, .198, .198, .01]]; }]
  ];
  var PMIN = 0.01, PMAX = 0.8;
  function setProb(k, i, v) {
    var d = state[k];
    v = Math.min(PMAX, Math.max(PMIN, v));
    var f = (1 - v) / (1 - d[i]);
    for (var j = 0; j < 6; j++) d[j] = j === i ? v : d[j] * f;
    changed();
  }

  /* ---------------- 可拖动的柱状图（实验台与每个实例顶上的小图） ---------------- */
  var benches = [];
  function buildBench(svg) {
    var mini = svg.getAttribute('data-bench') === 'mini';
    var h = mini ? 96 : 222, ml = mini ? 6 : 32, mr = 4, mt = 6, mb = mini ? 24 : 32;
    var w = frame(svg, h);
    var ph = h - mt - mb, gw = (w - ml - mr) / 6;
    var Y = function (v) { return mt + ph * (1 - v / PMAX); };
    (mini ? [0] : [0, .2, .4, .6, .8]).forEach(function (t) {
      S(svg, 'line', { class: t ? 'grid' : 'base', x1: ml, x2: w - mr, y1: Y(t), y2: Y(t) });
      if (!mini) S(svg, 'text', { class: 'tick', x: ml - 6, y: Y(t) + 4, 'text-anchor': 'end' }, t ? t.toFixed(1) : '0');
    });
    var bw = Math.min(mini ? 12 : 17, gw * .3), b = { svg: svg, p: [], q: [], hits: [], Y: Y };
    for (var i = 0; i < 6; i++) {
      var cx = ml + gw * (i + .5);
      [['p', -bw / 2 - 1.5], ['q', bw / 2 + 1.5]].forEach(function (kd) {
        var k = kd[0], x = cx + kd[1] - bw / 2, face = i;
        b[k][face] = S(svg, 'rect', { class: 'bar ' + k, x: x, width: bw });
        var hit = S(svg, 'rect', {
          class: 'hit', x: x - 3, y: mt, width: bw + 6, height: ph + 4, tabindex: 0, role: 'slider',
          'aria-label': (face + 1) + ' 点的 ' + k + '(x)', 'aria-valuemin': PMIN, 'aria-valuemax': PMAX
        });
        b.hits.push([hit, k, face]);
        function drag(e) {
          var r = svg.getBoundingClientRect(), y = (e.clientY - r.top) * (h / r.height);
          state.focus = { k: k, i: face };
          setProb(k, face, (1 - (y - mt) / ph) * PMAX);
        }
        hit.addEventListener('pointerdown', function (e) { e.preventDefault(); hit.setPointerCapture(e.pointerId); hit.focus({ preventScroll: true }); drag(e); });
        hit.addEventListener('pointermove', function (e) { if (hit.hasPointerCapture(e.pointerId)) drag(e); });
        hit.addEventListener('focus', function () { state.focus = { k: k, i: face }; updateBenches(); });
        hit.addEventListener('blur', function () { state.focus = null; updateBenches(); });
        hit.addEventListener('keydown', function (e) {
          var d = { ArrowUp: .01, ArrowRight: .01, ArrowDown: -.01, ArrowLeft: -.01, PageUp: .05, PageDown: -.05 }[e.key];
          if (d) { e.preventDefault(); state.focus = { k: k, i: face }; setProb(k, face, state[k][face] + d); }
        });
      });
      die(svg, cx, h - mb + (mini ? 12 : 16), mini ? 11 : 14, i);
    }
    return b;
  }
  function updateBenches() {
    var f = state.focus;
    benches.forEach(function (b) {
      ['p', 'q'].forEach(function (k) {
        state[k].forEach(function (v, i) {
          var r = b[k][i];
          r.setAttribute('y', b.Y(v));
          r.setAttribute('height', b.Y(0) - b.Y(v));
          r.classList.toggle('on', !!f && f.k === k && f.i === i);
        });
      });
      b.hits.forEach(function (h) { h[0].setAttribute('aria-valuenow', state[h[1]][h[2]].toFixed(3)); });
    });
    var hint = document.querySelector('[data-hint]');
    if (hint) hint.innerHTML = f
      ? '正在调整 <b><span class="mi">' + f.k + '</span>(' + (f.i + 1) + ') = ' + state[f.k][f.i].toFixed(3) + '</b>，其余柱子按比例缩放，总和保持为 1。'
      : '上下拖动任意一根柱子，其余柱子按比例缩放，总和保持为 1。也可以用 Tab 选中柱子后按方向键。';
  }

  function drawStack() {
    var svg = $('stack'); if (!svg) return;
    var h = 74, w = frame(svg, h);
    var hp = H(state.p), ce = CE(state.p, state.q), max = Math.max(3, Math.ceil(ce));
    var X = function (v) { return 1 + (w - 3) * v / max; }, y0 = 24, bh = 20;
    var pat = S(S(svg, 'defs', {}), 'pattern', { id: 'hatch', patternUnits: 'userSpaceOnUse', width: 5, height: 5, patternTransform: 'rotate(45)' });
    S(pat, 'rect', { class: 'hatch-bg', width: 5, height: 5 });
    S(pat, 'line', { class: 'hatch-ln', x1: 0, y1: 0, x2: 0, y2: 5 });
    S(svg, 'rect', { class: 'seg-h', x: X(0), y: y0, width: X(hp) - X(0), height: bh });
    S(svg, 'rect', { class: 'seg-d', x: X(hp), y: y0, width: Math.max(0, X(ce) - X(hp)), height: bh, fill: 'url(#hatch)' });
    mtext(svg, { x: (X(0) + X(hp)) / 2, y: y0 - 8, 'text-anchor': 'middle' }, 'H(p)');
    if (X(ce) - X(hp) > 44) mtext(svg, { class: 'lab-d', x: (X(hp) + X(ce)) / 2, y: y0 - 8, 'text-anchor': 'middle' }, 'D(p∥q)');
    for (var t = 0; t <= max; t++) {
      S(svg, 'line', { class: 'grid', x1: X(t), x2: X(t), y1: y0 + bh, y2: y0 + bh + 4 });
      S(svg, 'text', { class: 'tick', x: X(t), y: y0 + bh + 17, 'text-anchor': t === max ? 'end' : t ? 'middle' : 'start' }, t === max ? t + ' BIT' : t);
    }
  }
  function drawBenchNumbers() {
    if (!$('ro-h')) return;
    $('ro-h').textContent = fmt(H(state.p));
    $('ro-ce').textContent = fmt(CE(state.p, state.q));
    $('ro-d').textContent = fmt(KL(state.p, state.q));
    $('ro-r').textContent = fmt(KL(state.q, state.p));
  }

  /* ---------------- 第 2 章：码长表 ---------------- */
  function huffmanLengths(w) {
    var nodes = w.map(function (x, i) { return { w: x, syms: [i] }; }), len = w.map(function () { return 0; });
    while (nodes.length > 1) {
      nodes.sort(function (a, b) { return a.w - b.w || a.syms[0] - b.syms[0]; });
      var a = nodes.shift(), b = nodes.shift(), syms = a.syms.concat(b.syms);
      syms.forEach(function (s) { len[s]++; });
      nodes.push({ w: a.w + b.w, syms: syms });
    }
    return len;
  }
  function canonicalCodes(len) {
    var order = len.map(function (l, i) { return [l, i]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [], code = 0, prev = order[0][0];
    order.forEach(function (li, k) {
      if (k > 0) code = (code + 1) << (li[0] - prev);
      prev = li[0];
      var s = code.toString(2);
      while (s.length < li[0]) s = '0' + s;
      out[li[1]] = s;
    });
    return out;
  }
  window.KL.codes = function (w) { return canonicalCodes(huffmanLengths(w)); };
  function drawCodeTable() {
    var tb = document.querySelector('#code-table tbody'); if (!tb) return;
    var p = state.p, q = state.q, lp = huffmanLengths(p), lq = huffmanLengths(q), cp = canonicalCodes(lp), cq = canonicalCodes(lq);
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    for (var i = 0; i < 6; i++) {
      var tr = document.createElement('tr'), td0 = document.createElement('td');
      td0.appendChild(dieIcon(i, 16));
      tr.appendChild(td0);
      [[p[i].toFixed(3), 'num c-p'], [q[i].toFixed(3), 'num c-q'], [fmt(-log2(p[i]), 2), 'num'], [fmt(-log2(q[i]), 2), 'num'], [cp[i], 'code c-p'], [cq[i], 'code c-q']].forEach(function (c) {
        var td = document.createElement('td'); td.className = c[1]; td.textContent = c[0]; tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    var Lp = p.reduce(function (s, x, i) { return s + x * lp[i]; }, 0), Lq = p.reduce(function (s, x, i) { return s + x * lq[i]; }, 0);
    $('ft-hp').textContent = fmt(H(p)); $('ft-ce').textContent = fmt(CE(p, q));
    $('ft-lp').textContent = fmt(Lp); $('ft-lq').textContent = fmt(Lq);
    $('code-read').innerHTML = '平均码长按 <span class="mi">p</span> 取平均。理想码长允许小数，两列平均值恰好是熵与交叉熵，差 <b>' + fmt(CE(p, q) - H(p)) + ' bit</b>，就是 KL 散度；哈夫曼码只能取整数码长，两列差 <b>' + fmt(Lq - Lp) + ' bit</b>。';
  }

  /* ---------------- 第 3 章：似然比 ---------------- */
  var MAXR = 2000, ev = { faces: [], vals: [], avg: [], S: 0, timer: 0 };
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function drawFace(p, u) { var c = 0; for (var i = 0; i < 5; i++) { c += p[i]; if (u < c) return i; } return 5; }
  function roll(k, rnd) {
    rnd = rnd || Math.random;
    for (var j = 0; j < k && ev.faces.length < MAXR; j++) {
      var f = drawFace(state.p, rnd()), v = log2(state.p[f] / state.q[f]);
      ev.faces.push(f); ev.vals.push(v); ev.S += v; ev.avg.push(ev.S / ev.faces.length);
    }
  }
  function clearEv() { ev.faces = []; ev.vals = []; ev.avg = []; ev.S = 0; }
  function stopAuto() {
    clearInterval(ev.timer); ev.timer = 0;
    if ($('ev-auto')) { $('ev-auto').setAttribute('aria-pressed', 'false'); $('ev-auto').textContent = '连续掷'; }
  }
  function resetEv() { stopAuto(); clearEv(); roll(60, mulberry32(20260929)); }
  function drawEv() {
    var svg = $('ev-chart'); if (!svg) return;
    var h = 240, w = frame(svg, h), ml = 36, mr = 6, mt = 14, mb = 28, n = ev.faces.length;
    var XM = [50, 100, 200, 500, 1000, 2000].filter(function (v) { return v >= n; })[0];
    var lr = state.p.map(function (x, i) { return log2(x / state.q[i]); });
    var lo = Math.min.apply(null, [0].concat(lr)), hi = Math.max.apply(null, [0].concat(lr)), pad = (hi - lo) * .06 || .1;
    lo -= pad; hi += pad;
    var X = function (i) { return ml + (w - ml - mr) * i / XM; }, Y = function (v) { return mt + (h - mt - mb) * (hi - v) / (hi - lo); };
    niceTicks(lo, hi, 5).forEach(function (t) {
      S(svg, 'line', { class: Math.abs(t[0]) < 1e-9 ? 'base' : 'grid', x1: ml, x2: w - mr, y1: Y(t[0]), y2: Y(t[0]) });
      S(svg, 'text', { class: 'tick', x: ml - 6, y: Y(t[0]) + 4, 'text-anchor': 'end' }, t[1]);
    });
    S(svg, 'text', { class: 'tick', x: X(0), y: h - 8, 'text-anchor': 'start' }, '0');
    S(svg, 'text', { class: 'tick', x: X(XM / 2), y: h - 8, 'text-anchor': 'middle' }, XM / 2);
    mtext(svg, { class: 'tick', x: X(XM), y: h - 8, 'text-anchor': 'end' }, 'n = ' + XM);
    var pos = '', neg = '';
    ev.vals.forEach(function (v, i) { var s = 'M' + X(i + 1).toFixed(1) + ' ' + Y(v).toFixed(1) + 'h0'; if (v >= 0) pos += s; else neg += s; });
    if (pos) S(svg, 'path', { class: 'dots-pos', d: pos });
    if (neg) S(svg, 'path', { class: 'dots-neg', d: neg });
    var D = KL(state.p, state.q);
    S(svg, 'line', { class: 'dline', x1: ml, x2: w - mr, y1: Y(D), y2: Y(D) });
    mtext(svg, { class: 'lab-d', x: w - mr, y: Y(D) - 8, 'text-anchor': 'end' }, 'D(p∥q) = ' + fmt(D));
    if (n) S(svg, 'polyline', { class: 'avg', points: ev.avg.map(function (a, i) { return X(i + 1).toFixed(1) + ',' + Y(a).toFixed(1); }).join(' ') });

    var box = $('ev-rolls');
    while (box.firstChild) box.removeChild(box.firstChild);
    for (var i = Math.max(0, n - 12); i < n; i++) {
      var v = ev.vals[i], chip = document.createElement('span');
      chip.className = 'roll ' + (Math.abs(v) < 1e-9 ? 'zero' : v > 0 ? 'pos' : 'neg');
      chip.appendChild(dieIcon(ev.faces[i], 14));
      chip.appendChild(document.createTextNode((v > 0 ? '+' : '') + fmt(v, 2)));
      box.appendChild(chip);
    }
    $('ev-n').textContent = n;
    $('ev-s').textContent = fmt(ev.S, 2);
    $('ev-a').textContent = n ? fmt(ev.S / n) : '—';
    var post = 1 / (1 + Math.pow(2, -ev.S));
    $('ev-post').textContent = post > .9999 ? '> 99.99%' : post < .0001 ? '< 0.01%' : (100 * post).toFixed(2) + '%';
    $('ev-1').disabled = $('ev-10').disabled = n >= MAXR;
  }

  /* ---------------- 第 4 章：计数 ---------------- */
  var NMAX = 600, LF = new Float64Array(NMAX + 1);
  for (var li = 1; li <= NMAX; li++) LF[li] = LF[li - 1] + Math.log(li);
  // 总和为 n、最接近 n·p 的整数计数（最大余数法）
  function typeCounts(p, n) {
    var raw = p.map(function (x) { return x * n; }), k = raw.map(Math.floor);
    var left = n - k.reduce(function (s, x) { return s + x; }, 0);
    raw.map(function (x, i) { return [x - k[i], i]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })
      .slice(0, left).forEach(function (r) { k[r[1]]++; });
    return k;
  }
  function sanov(n) {
    var k = typeCounts(state.p, n), lc = LF[n], le = 0;
    k.forEach(function (c, i) { lc -= LF[c]; le += c * Math.log(state.q[i]); });
    return { k: k, ph: k.map(function (c) { return c / n; }), c: lc / LN2, e: le / LN2, P: (lc + le) / LN2 };
  }
  function drawSanov() {
    var svg = $('sv-chart'); if (!svg) return;
    var n = +$('sv-n').value, s = sanov(n), D = KL(state.p, state.q);
    $('sv-n-out').textContent = n;
    $('sv-k').textContent = '(' + s.k.join(', ') + ')';
    $('sv-c').textContent = fmt(s.c, 2); $('sv-nh').textContent = fmt(n * H(s.ph), 2);
    $('sv-e').textContent = fmt(s.e, 2); $('sv-nce').textContent = fmt(-n * CE(s.ph, state.q), 2);
    $('sv-p').textContent = fmt(s.P, 2); $('sv-nd').textContent = fmt(-n * KL(s.ph, state.q), 2);
    $('sv-r').textContent = fmt(-s.P / n); $('sv-d').textContent = fmt(D);

    var h = 230, w = frame(svg, h), ml = 36, mr = 6, mt = 16, mb = 28, vals = [];
    for (var m = 6; m <= NMAX; m++) vals.push([m, -sanov(m).P / m]);
    var hi = Math.max.apply(null, [D * 1.3 + .02].concat(vals.map(function (v) { return v[1]; }))) * 1.06;
    var X = function (m) { return ml + (w - ml - mr) * m / NMAX; }, Y = function (v) { return mt + (h - mt - mb) * (1 - v / hi); };
    niceTicks(0, hi, 4).forEach(function (t) {
      S(svg, 'line', { class: t[0] ? 'grid' : 'base', x1: ml, x2: w - mr, y1: Y(t[0]), y2: Y(t[0]) });
      S(svg, 'text', { class: 'tick', x: ml - 6, y: Y(t[0]) + 4, 'text-anchor': 'end' }, t[1]);
    });
    for (m = 0; m < NMAX; m += 100) S(svg, 'text', { class: 'tick', x: X(m), y: h - 8, 'text-anchor': m ? 'middle' : 'start' }, m);
    mtext(svg, { class: 'tick', x: X(NMAX), y: h - 8, 'text-anchor': 'end' }, 'n = ' + NMAX);
    S(svg, 'line', { class: 'dline', x1: ml, x2: w - mr, y1: Y(D), y2: Y(D) });
    mtext(svg, { class: 'lab-d', x: w - mr, y: Y(D) + 18, 'text-anchor': 'end' }, 'D(p∥q) = ' + fmt(D));
    S(svg, 'polyline', { class: 'curve', points: vals.map(function (v) { return X(v[0]).toFixed(1) + ',' + Y(v[1]).toFixed(1); }).join(' ') });
    var cur = -s.P / n, right = X(n) > w * .58;
    S(svg, 'line', { class: 'guide', x1: X(n), x2: X(n), y1: mt, y2: h - mb });
    S(svg, 'circle', { class: 'mark', cx: X(n), cy: Y(cur), r: 4 });
    var t = S(svg, 'text', { x: X(n) + (right ? -9 : 9), y: Y(cur) - 10, 'text-anchor': right ? 'end' : 'start' });
    S(t, 'tspan', { class: 'mi-t' }, 'P');
    S(t, 'tspan', { class: 'mi-t', dy: 4, style: 'font-size:10px' }, 'n');
    S(t, 'tspan', { class: 'mn-t', dy: -4 }, ' ≈ 10');
    S(t, 'tspan', { class: 'mn-t', dy: -6, style: 'font-size:10px' }, fmt(s.P * Math.log10(2), 1));
  }

  /* ---------------- 第 5 章：Jensen ---------------- */
  function drawJensen() {
    var svg = $('jensen-chart'); if (!svg) return;
    var h = 290, w = frame(svg, h), ml = 34, mr = 8, mt = 14, mb = 40;
    var p = state.p, q = state.q, r = p.map(function (x, i) { return q[i] / x; }), ly = r.map(log2), D = KL(p, q);
    var xM = Math.max(2.2, Math.max.apply(null, r) * 1.12);
    var yLo = Math.min(-1.2, Math.min.apply(null, ly) - .5), yHi = Math.max(1, log2(xM)) + .5;
    var X = function (x) { return ml + (w - ml - mr) * x / xM; }, Y = function (y) { return mt + (h - mt - mb) * (yHi - y) / (yHi - yLo); };
    var clip = S(S(svg, 'defs', {}), 'clipPath', { id: 'jclip' });
    S(clip, 'rect', { x: ml, y: mt, width: w - ml - mr, height: h - mt - mb });
    niceTicks(yLo, yHi, 5).forEach(function (t) {
      S(svg, 'line', { class: Math.abs(t[0]) < 1e-9 ? 'base' : 'grid', x1: ml, x2: w - mr, y1: Y(t[0]), y2: Y(t[0]) });
      S(svg, 'text', { class: 'tick', x: ml - 6, y: Y(t[0]) + 4, 'text-anchor': 'end' }, t[1]);
    });
    niceTicks(0, xM, 5).forEach(function (t) {
      S(svg, 'line', { class: 'grid', x1: X(t[0]), x2: X(t[0]), y1: h - mb, y2: h - mb + 4 });
      S(svg, 'text', { class: 'tick', x: X(t[0]), y: h - mb + 17, 'text-anchor': 'middle' }, t[1]);
    });
    mtext(svg, { class: 'tick', x: w - mr, y: h - 3, 'text-anchor': 'end' }, 'x = q(x)/p(x)');
    var g = S(svg, 'g', { 'clip-path': 'url(#jclip)' });
    var x0 = Math.max(xM / 2000, Math.pow(2, yLo - .2)), d = '';
    for (var j = 0; j <= 240; j++) { var x = x0 * Math.pow(xM / x0, j / 240); d += (j ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(log2(x)).toFixed(1); }
    S(g, 'path', { class: 'curve', d: d });
    S(g, 'line', { class: 'tangent', x1: X(0), y1: Y(-1 / LN2), x2: X(xM), y2: Y((xM - 1) / LN2) });
    // 比值相同的点数落在同一处：只画一个圆，标签写成“1–5”。
    var groups = {};
    p.forEach(function (x, i) { var key = r[i].toFixed(5); (groups[key] = groups[key] || []).push(i); });
    Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return p[b[0]] - p[a[0]]; }).forEach(function (faces) {
      var i = faces[0], rad = 3 + 13 * Math.sqrt(p[i]), last = faces[faces.length - 1];
      var label = faces.length === 1 ? String(i + 1) : last - i === faces.length - 1 ? (i + 1) + '–' + (last + 1) : faces.map(function (f) { return f + 1; }).join(',');
      S(g, 'circle', { class: 'pt', cx: X(r[i]), cy: Y(ly[i]), r: rad });
      S(g, 'text', { class: 'ptl', x: X(r[i]) + rad + 4, y: Y(ly[i]) + 16 }, label);
    });
    S(svg, 'line', { class: 'gap', x1: X(1), x2: X(1), y1: Y(0), y2: Y(-D) });
    S(svg, 'circle', { class: 'oncurve', cx: X(1), cy: Y(0), r: 3.2 });
    S(svg, 'circle', { class: 'centroid', cx: X(1), cy: Y(-D), r: 5.5 });
    if (D > 1e-4) mtext(svg, { class: 'lab-d', x: X(1) + 12, y: Y(-D / 2) + 5, 'text-anchor': 'start' }, 'D(p∥q) = ' + fmt(D));
    var t = S(svg, 'text', { x: X(xM) - 4, y: Y(log2(xM)) - 10, 'text-anchor': 'end' });
    S(t, 'tspan', { class: 'mi-t' }, 'y');
    S(t, 'tspan', { class: 'mn-t' }, ' = log');
    S(t, 'tspan', { class: 'mn-t', dy: 4, style: 'font-size:10px' }, '2');
    S(t, 'tspan', { class: 'mi-t', dy: -4 }, ' x');
  }

  /* ---------------- 第 6 章：前向与反向 ---------------- */
  var GX = [], GDX = .04;
  for (var gj = 0; gj <= 600; gj++) GX.push(-12 + gj * GDX);
  function logN(x, m, s) { var z = (x - m) / s; return -.5 * z * z - Math.log(s) - .9189385332046727; }
  function lse(a, b) { var m = Math.max(a, b); return m + Math.log(Math.exp(a - m) + Math.exp(b - m)); }
  function drawGauss() {
    var svg = $('g-chart'); if (!svg) return;
    var d = +$('g-d').value, wR = +$('g-w').value;
    $('g-d-out').textContent = d.toFixed(1); $('g-w-out').textContent = wR.toFixed(2);
    var lp = GX.map(function (x) { return lse(Math.log(1 - wR) + logN(x, -d / 2, 1), Math.log(wR) + logN(x, d / 2, 1)); });
    var mf = (1 - wR) * (-d / 2) + wR * (d / 2), sf = Math.sqrt(1 + (1 - wR) * Math.pow(-d / 2 - mf, 2) + wR * Math.pow(d / 2 - mf, 2));
    function rev(m, s) {
      var t = 0, a = Math.max(0, Math.floor((m - 8 * s + 12) / GDX)), b = Math.min(600, Math.ceil((m + 8 * s + 12) / GDX));
      for (var j = a; j <= b; j++) { var lq = logN(GX[j], m, s); t += Math.exp(lq) * (lq - lp[j]); }
      return t * GDX;
    }
    function fwd(m, s) { var t = 0; for (var j = 0; j <= 600; j++) t += Math.exp(lp[j]) * (lp[j] - logN(GX[j], m, s)); return t * GDX; }
    var best = [Infinity, 0, 1], SG = [];
    for (var i = 0; i < 28; i++) SG.push(.3 * Math.pow(4 / .3, i / 27));
    for (var m = -8; m <= 8.001; m += .2) SG.forEach(function (s) { var v = rev(m, s); if (v < best[0]) best = [v, m, s]; });
    var m0 = best[1], s0 = best[2];
    for (i = -10; i <= 10; i++) for (var j = -10; j <= 10; j++) { var mm = m0 + i * .02, ss = s0 * Math.pow(1.1, j / 10), v = rev(mm, ss); if (v < best[0]) best = [v, mm, ss]; }
    var mr = best[1], sr = best[2];
    $('gf-m').textContent = fmt(mf, 2); $('gf-s').textContent = fmt(sf, 2);
    $('gr-m').textContent = fmt(mr, 2); $('gr-s').textContent = fmt(sr, 2);
    $('gf-f').textContent = fmt(fwd(mf, sf) / LN2); $('gf-r').textContent = fmt(rev(mf, sf) / LN2);
    $('gr-f').textContent = fmt(fwd(mr, sr) / LN2); $('gr-r').textContent = fmt(rev(mr, sr) / LN2);

    var h = 240, w = frame(svg, h), ml = 6, mr2 = 6, mt = 10, mb = 26, XL = -9, XR = 9;
    var pdfP = lp.map(Math.exp), top = Math.max(Math.max.apply(null, pdfP), 1 / (sf * 2.5066), 1 / (sr * 2.5066)) * 1.08;
    var X = function (x) { return ml + (w - ml - mr2) * (x - XL) / (XR - XL); }, Y = function (v) { return mt + (h - mt - mb) * (1 - v / top); };
    S(svg, 'line', { class: 'base', x1: ml, x2: w - mr2, y1: Y(0), y2: Y(0) });
    for (var x = -8; x <= 8; x += 2) S(svg, 'text', { class: 'tick', x: X(x), y: h - 7, 'text-anchor': 'middle' }, fmt(x, 0));
    var idx = [];
    GX.forEach(function (x, k) { if (x >= XL - 1e-9 && x <= XR + 1e-9) idx.push(k); });
    function path(f) { return idx.map(function (k, n) { return (n ? 'L' : 'M') + X(GX[k]).toFixed(1) + ' ' + Y(f(k)).toFixed(1); }).join(''); }
    S(svg, 'path', { class: 'parea', d: path(function (k) { return pdfP[k]; }) + 'L' + X(XR) + ' ' + Y(0) + 'L' + X(XL) + ' ' + Y(0) + 'Z' });
    S(svg, 'path', { class: 'qf', d: path(function (k) { return Math.exp(logN(GX[k], mf, sf)); }) });
    S(svg, 'path', { class: 'qr', d: path(function (k) { return Math.exp(logN(GX[k], mr, sr)); }) });
  }

  /* ---------------- 连线 ---------------- */
  function changed() {
    updateBenches(); drawStack(); drawBenchNumbers(); drawCodeTable();
    resetEv(); drawEv(); drawSanov(); drawJensen();
  }
  $$('[data-presets]').forEach(function (box) {
    PRESETS.forEach(function (pr) {
      var b = document.createElement('button');
      b.type = 'button'; b.innerHTML = pr[1];
      b.addEventListener('click', function () { var pq = pr[2](); state.p = pq[0]; state.q = pq[1]; state.focus = null; changed(); });
      box.appendChild(b);
    });
  });
  if ($('ev-1')) {
    $('ev-1').addEventListener('click', function () { roll(1); drawEv(); });
    $('ev-10').addEventListener('click', function () { roll(10); drawEv(); });
    $('ev-reset').addEventListener('click', function () { stopAuto(); clearEv(); drawEv(); });
    $('ev-auto').addEventListener('click', function () {
      if (ev.timer) { stopAuto(); return; }
      if (ev.faces.length >= MAXR) clearEv();
      $('ev-auto').setAttribute('aria-pressed', 'true'); $('ev-auto').textContent = '暂停';
      ev.timer = setInterval(function () {
        roll(Math.max(1, Math.floor(ev.faces.length / 25))); drawEv();
        if (ev.faces.length >= MAXR) stopAuto();
      }, 45);
    });
  }
  if ($('sv-n')) $('sv-n').addEventListener('input', drawSanov);
  if ($('g-d')) { $('g-d').addEventListener('input', drawGauss); $('g-w').addEventListener('input', drawGauss); }

  function drawAll() {
    benches = $$('svg[data-bench]').map(buildBench);
    updateBenches(); drawStack(); drawBenchNumbers(); drawCodeTable(); drawEv(); drawSanov(); drawJensen(); drawGauss();
  }
  resetEv();
  drawAll();
  var lastW = innerWidth, raf = 0;
  window.addEventListener('resize', function () {
    if (innerWidth === lastW) return;
    lastW = innerWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(drawAll);
  });
  if (document.fonts) document.fonts.ready.then(drawAll);

  /* ---------------- 目录跟踪与窄屏目录胶囊（同示范页） ---------------- */
  (function toc() {
    var chapters = $$('.chapter[data-title]'), tocLinks = {};
    $$('#toc a').forEach(function (a) { tocLinks[a.getAttribute('href').slice(1)] = a.parentElement; });
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
})();
