/* 矩阵微分 · 实例与目录
   三个实例：方向导数（梯度与差商）、负梯度与牛顿方向（二次函数）、梯度检验（有限差分）。
   所有显示的数字都由页面当场算出：公式值用公式，差商用真的去算 f。 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function fmt(x, d) { d = d == null ? 3 : d; return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−'); }
  // 很小的误差用科学计数法：3.2e−10
  function sci(x) { return x === 0 ? '0' : x.toExponential(1).replace('e-', 'e−'); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function S(parent, tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  function width(svg) { return Math.max(260, Math.round(svg.getBoundingClientRect().width)); }
  function frame(svg, h) {
    var w = width(svg);
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
  function setText(el, str) { if (el.textContent !== str) el.textContent = str; }

  /* ---------------- 二维图的公共部分：板面、网格、刻度、可拖动的点、箭头 ---------------- */
  var YR = 2.4;     // 纵轴范围 ±2.4；横轴范围随宽度变化，至少 ±2.6
  function plot(svg, clipId, foot) {
    var w = width(svg), ml = 28, mr = 24, mt = 18, mb = 24 + (foot || 0);
    var pw = w - ml - mr, s = Math.min(76, pw / 5.2), ph = 2 * YR * s, h = Math.round(ph + mt + mb);
    frame(svg, h);
    var P = { w: w, h: h, ml: ml, mt: mt, pw: pw, ph: ph, s: s, xr: pw / (2 * s), cx: ml + pw / 2, cy: mt + ph / 2 };
    P.X = function (x) { return P.cx + x * s; };
    P.Y = function (y) { return P.cy - y * s; };
    P.ux = function (px) { return (px - P.cx) / s; };
    P.uy = function (py) { return (P.cy - py) / s; };
    P.clampX = function (x) { return clamp(x, -P.xr + 0.06, P.xr - 0.06); };
    P.clampY = function (y) { return clamp(y, -YR + 0.06, YR - 0.06); };
    S(S(S(svg, 'defs', {}), 'clipPath', { id: clipId }), 'rect', { x: ml, y: mt, width: pw, height: ph });
    S(svg, 'rect', { class: 'plate', x: ml, y: mt, width: pw, height: ph });
    var i;
    for (i = Math.ceil(-P.xr); i <= P.xr; i++) {
      if (i) S(svg, 'line', { class: 'grid', x1: P.X(i), x2: P.X(i), y1: mt, y2: mt + ph });
      S(svg, 'text', { class: 'tick', x: P.X(i), y: mt + ph + 16, 'text-anchor': 'middle' }, fmt(i, 0));
    }
    for (i = -2; i <= 2; i++) {
      if (i) S(svg, 'line', { class: 'grid', x1: ml, x2: ml + pw, y1: P.Y(i), y2: P.Y(i) });
      S(svg, 'text', { class: 'tick', x: ml - 6, y: P.Y(i) + 4, 'text-anchor': 'end' }, fmt(i, 0));
    }
    S(svg, 'line', { class: 'axis', x1: ml, x2: ml + pw, y1: P.Y(0), y2: P.Y(0) });
    S(svg, 'line', { class: 'axis', x1: P.X(0), x2: P.X(0), y1: mt, y2: mt + ph });
    axisName(svg, ml + pw + 6, P.Y(0) + 4, 'start', '1');
    axisName(svg, P.X(0), mt - 6, 'middle', '2');
    return P;
  }
  function axisName(svg, x, y, anchor, n) {
    var t = S(svg, 'text', { class: 'lab', x: x, y: y, 'text-anchor': anchor });
    S(t, 'tspan', { class: 'mi-t' }, 'x');
    S(t, 'tspan', { class: 'mn-t', dy: 4, style: 'font-size:10px' }, n);
  }
  // 椭圆 {x : ½(x−c)ᵀA(x−c) = level}：沿 (cosθ, sinθ) 的半轴 ra，沿 (−sinθ, cosθ) 的半轴 rb
  function ellipseD(P, c, th, ra, rb) {
    var d = '', ct = Math.cos(th), st = Math.sin(th), n = 96;
    for (var j = 0; j <= n; j++) {
      var a = 2 * Math.PI * j / n, u = ra * Math.cos(a), v = rb * Math.sin(a);
      d += (j ? 'L' : 'M') + P.X(c[0] + u * ct - v * st).toFixed(1) + ' ' + P.Y(c[1] + u * st + v * ct).toFixed(1);
    }
    return d + 'Z';
  }
  // 箭头的多边形（一块整体，带箭头头）：从 (x1,y1) 指向 (x2,y2)，单位像素
  function arrowPts(x1, y1, x2, y2, shaft, headW, headL) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (L < 3) return '';
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hl = Math.min(headL, L * 0.7), bx = x2 - ux * hl, by = y2 - uy * hl;
    var p = [[x1 + nx * shaft, y1 + ny * shaft], [bx + nx * shaft, by + ny * shaft], [bx + nx * headW, by + ny * headW], [x2, y2],
      [bx - nx * headW, by - ny * headW], [bx - nx * shaft, by - ny * shaft], [x1 - nx * shaft, y1 - ny * shaft]];
    return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ');
  }
  function place(el, x, y, anchor) {
    el.setAttribute('x', x.toFixed(1)); el.setAttribute('y', y.toFixed(1)); el.setAttribute('text-anchor', anchor);
  }
  // 箭头尖端外侧的标签：先沿箭头方向 d 再出去 10px，横向偏 11px（side = ±1）；锚点朝外，靠近图框边缘时翻到另一侧
  function hang(P, tip, d, side) {
    var x = tip[0] + d[0] * 10 - d[1] * side * 11, y = tip[1] + d[1] * 10 + d[0] * side * 11, dx = x - tip[0];
    var a = dx > 4 ? 'start' : dx < -4 ? 'end' : 'middle';
    if (a === 'start' && x > P.ml + P.pw - 58) a = 'end'; else if (a === 'end' && x < P.ml + 58) a = 'start';
    return [x, y + 4, a];
  }

  // 可拖动的点：指针（鼠标、触屏）与方向键都能移动；get() 返回当前位置，set(x, y) 写回并重画
  function handle(svg, P, name, get, set) {
    var vis = S(svg, 'circle', { class: 'pt-h', r: 7.5 });
    var hit = S(svg, 'circle', {
      class: 'hit', r: 19, tabindex: 0, role: 'slider', 'aria-label': name,
      'aria-valuemin': (-P.xr).toFixed(1), 'aria-valuemax': P.xr.toFixed(1)
    });
    function drag(e) {
      var r = svg.getBoundingClientRect();
      set(P.ux((e.clientX - r.left) * (P.w / r.width)), P.uy((e.clientY - r.top) * (P.h / r.height)));
    }
    hit.addEventListener('pointerdown', function (e) { e.preventDefault(); hit.setPointerCapture(e.pointerId); hit.focus({ preventScroll: true }); hit.classList.add('drag'); drag(e); });
    hit.addEventListener('pointermove', function (e) { if (hit.hasPointerCapture(e.pointerId)) drag(e); });
    hit.addEventListener('pointerup', function () { hit.classList.remove('drag'); });
    hit.addEventListener('pointercancel', function () { hit.classList.remove('drag'); });
    hit.addEventListener('focus', function () { vis.classList.add('foc'); });
    hit.addEventListener('blur', function () { vis.classList.remove('foc'); });
    hit.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.5 : 0.1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (d) { e.preventDefault(); var p = get(); set(p[0] + d[0], p[1] + d[1]); }
    });
    return function () {
      var p = get(), x = P.X(p[0]), y = P.Y(p[1]);
      vis.setAttribute('cx', x); vis.setAttribute('cy', y); hit.setAttribute('cx', x); hit.setAttribute('cy', y);
      hit.setAttribute('aria-valuenow', fmt(p[0], 2));
      hit.setAttribute('aria-valuetext', '(' + fmt(p[0], 2) + ', ' + fmt(p[1], 2) + ')');
    };
  }
  function cross(parent, x, y, r) {
    S(parent, 'path', { class: 'xmark', d: 'M' + (x - r) + ' ' + y + 'h' + 2 * r + 'M' + x + ' ' + (y - r) + 'v' + 2 * r });
  }

  /* ---------------- 第 2 章：梯度与方向导数 ---------------- */
  (function () {
    var svg = $('grad-svg'); if (!svg) return;
    var A = [[2.0, 0.8], [0.8, 1.0]], b = [1.0, 0.5], HSTEP = 1e-5;
    var det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    var xs = [(A[1][1] * b[0] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - A[1][0] * b[0]) / det];   // 最小点 x* = A⁻¹b
    var half = (A[0][0] + A[1][1]) / 2, rad = Math.sqrt(Math.pow((A[0][0] - A[1][1]) / 2, 2) + A[0][1] * A[0][1]);
    var lam1 = half + rad, lam2 = half - rad, th = 0.5 * Math.atan2(2 * A[0][1], A[0][0] - A[1][1]);   // lam1 对应的特征向量方向
    function f(x) { return 0.5 * (x[0] * (A[0][0] * x[0] + A[0][1] * x[1]) + x[1] * (A[1][0] * x[0] + A[1][1] * x[1])) - b[0] * x[0] - b[1] * x[1]; }
    function grad(x) { return [A[0][0] * x[0] + A[0][1] * x[1] - b[0], A[1][0] * x[0] + A[1][1] * x[1] - b[1]]; }
    var fmin = f(xs), LEVELS = [0.04, 0.12, 0.25, 0.45, 0.7, 1.0, 1.4, 1.9, 2.5, 3.2];
    function levelD(P, c) { return ellipseD(P, xs, th, Math.sqrt(2 * c / lam1), Math.sqrt(2 * c / lam2)); }

    var st = { x: [-1.0, 1.4] }, P, el, move;
    var slider = $('grad-phi');

    function build() {
      P = plot(svg, 'gclip', 16);
      el = {};
      var g = S(svg, 'g', { 'clip-path': 'url(#gclip)' });
      LEVELS.forEach(function (c) { S(g, 'path', { class: 'ct', d: levelD(P, c) }); });
      el.through = S(g, 'path', { class: 'ct on' });
      cross(svg, P.X(xs[0]), P.Y(xs[1]), 6);
      el.min = S(svg, 'text', { class: 'lab' });
      S(el.min, 'tspan', { class: 'mi-t' }, 'x'); S(el.min, 'tspan', { class: 'mn-t', dy: -5, style: 'font-size:11px' }, '⋆');
      place(el.min, P.X(xs[0]) + 9, P.Y(xs[1]) + 17, 'start');
      el.wedge = S(svg, 'path', { class: 'wedge' });
      el.g = S(svg, 'polygon', { class: 'ag' });
      el.u = S(svg, 'polygon', { class: 'au' });
      el.gl = mtext(svg, { class: 'lab g' }, '∇f');
      el.ul = mtext(svg, { class: 'lab u' }, 'u');
      el.al = S(svg, 'text', { class: 'lab a' });
      el.xy = S(svg, 'text', { class: 'tick', x: P.ml, y: P.h - 4 });
      move = handle(svg, P, '点 x 的位置，方向键移动', function () { return st.x; }, function (x, y) { st.x = [P.clampX(x), P.clampY(y)]; update(); });
      update();
    }

    function update() {
      var x = st.x, phi = +slider.value * Math.PI / 180, u = [Math.cos(phi), Math.sin(phi)], g = grad(x), n = Math.hypot(g[0], g[1]);
      var dd = g[0] * u[0] + g[1] * u[1];
      var fd = (f([x[0] + HSTEP * u[0], x[1] + HSTEP * u[1]]) - f(x)) / HSTEP;       // 真的去算 f(x + h·u)
      setText($('grad-phi-out'), Math.round(+slider.value) + '°');
      setText($('grad-g'), '(' + fmt(g[0]) + ', ' + fmt(g[1]) + ')');
      setText($('grad-n'), fmt(n));
      setText($('grad-dd'), fmt(dd, 4));
      setText($('grad-fd'), fmt(fd, 4));

      el.through.setAttribute('d', levelD(P, Math.max(1e-4, f(x) - fmin)));
      move();
      var px = P.X(x[0]), py = P.Y(x[1]), s = P.s;
      // 梯度箭头：长度 ∝ ‖∇f‖，太长的截到 2 个单位
      var gl = Math.min(n * 0.5, 2.0) * s, gdx = n > 1e-9 ? g[0] / n : 0, gdy = n > 1e-9 ? g[1] / n : 0;
      el.g.setAttribute('points', n > 1e-9 ? arrowPts(px, py, px + gdx * gl, py - gdy * gl, 1.6, 6.5, 11) : '');
      // 方向 u：固定长度 0.9 个单位，白底墨边
      var ul = 0.9 * s;
      el.u.setAttribute('points', arrowPts(px, py, px + u[0] * ul, py - u[1] * ul, 2.6, 7, 12));
      // 两个标签分挂在两个箭头的两侧，夹角再小也不会叠在一起（屏幕坐标：y 向下）
      var gs = [gdx, -gdy], us = [u[0], -u[1]], cr = gs[0] * us[1] - gs[1] * us[0], sg = cr >= 0 ? -1 : 1;
      var lg = hang(P, [px + gs[0] * gl, py + gs[1] * gl], gs, sg), lu = hang(P, [px + us[0] * ul, py + us[1] * ul], us, -sg);
      el.gl.style.display = n > 1e-9 && gl > 8 ? '' : 'none';
      place(el.gl, lg[0], lg[1], lg[2]);
      place(el.ul, lu[0], lu[1], lu[2]);
      // 夹角：扇形 + 度数
      if (n > 1e-9 && gl > 8) {
        var a1 = Math.atan2(-u[1], u[0]), a2 = Math.atan2(-gdy, gdx), da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
        var ra = Math.min(30, gl * 0.55, ul * 0.6), p1 = [px + ra * Math.cos(a1), py + ra * Math.sin(a1)], p2 = [px + ra * Math.cos(a2), py + ra * Math.sin(a2)];
        el.wedge.setAttribute('d', 'M' + px + ' ' + py + 'L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'A' + ra.toFixed(1) + ' ' + ra.toFixed(1) + ' 0 0 ' + (da > 0 ? 1 : 0) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + 'Z');
        var am = a1 + da / 2, small = Math.abs(da) < 0.61, lr = small ? 26 : ra + 15;   // 夹角小于 35° 时扇形太窄，标签挪到点的另一侧
        if (small) am += Math.PI;
        setText(el.al, Math.round(Math.abs(da) * 180 / Math.PI) + '°');
        place(el.al, px + lr * Math.cos(am), py + lr * Math.sin(am) + 4, 'middle');
        el.wedge.style.display = ''; el.al.style.display = '';
      } else { el.wedge.style.display = 'none'; el.al.style.display = 'none'; }
      setText(el.xy, 'x = (' + fmt(x[0], 2) + ', ' + fmt(x[1], 2) + ')');
    }

    slider.addEventListener('input', update);
    build();
    var lastW = innerWidth;
    window.addEventListener('resize', function () { if (innerWidth !== lastW) { lastW = innerWidth; build(); } });
    if (document.fonts) document.fonts.ready.then(build);
  })();

  /* ---------------- 第 3 章：用有限差分检验公式 ---------------- */
  (function () {
    var tb = document.querySelector('#chk-table tbody'); if (!tb) return;
    var N = 3, HSTEP = 1e-5, TOL = 1e-6;
    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function mulv(M, v) { return M.map(function (row) { return row.reduce(function (s, m, j) { return s + m * v[j]; }, 0); }); }
    function mulTv(M, v) { return v.map(function (_, j) { return M.reduce(function (s, row, i) { return s + row[j] * v[i]; }, 0); }); }
    function dot(p, q) { return p.reduce(function (s, v, i) { return s + v * q[i]; }, 0); }
    function vec(rnd, lo, hi) { var v = []; for (var i = 0; i < N; i++) v.push(lo + (hi - lo) * rnd()); return v; }

    // 一个种子给出一个点 x 与这一组常量 a, A, b；A 刻意不对称
    function gen(seed) {
      var rnd = mulberry32(seed), A, asym, x, i, j;
      do {
        A = []; asym = 0;
        for (i = 0; i < N; i++) A.push(vec(rnd, -1, 1));
        for (i = 0; i < N; i++) for (j = 0; j < i; j++) asym = Math.max(asym, Math.abs(A[i][j] - A[j][i]));
      } while (asym < 0.4);
      do { x = vec(rnd, -1.5, 1.5); } while (Math.max.apply(null, mulTv(A, x).map(Math.abs)) < 0.2);
      return { x: x, a: vec(rnd, -1, 1), A: A, b: vec(rnd, -1, 1) };
    }
    function softmax(z) {
      var m = Math.max.apply(null, z), e = z.map(function (v) { return Math.exp(v - m); }), s = e.reduce(function (p, q) { return p + q; }, 0);
      return e.map(function (v) { return v / s; });
    }
    function quad(D, x) { return dot(x, mulv(D.A, x)); }
    var FORMS = {
      lin: { f: function (D, x) { return dot(D.a, x); }, g: function (D) { return D.a.slice(); } },
      quad: { f: quad, g: function (D, x) { var p = mulv(D.A, x), q = mulTv(D.A, x); return p.map(function (v, i) { return v + q[i]; }); } },
      bad: { f: quad, g: function (D, x) { return mulv(D.A, x); } },
      ls: {
        f: function (D, x) { var r = mulv(D.A, x).map(function (v, i) { return v - D.b[i]; }); return dot(r, r); },
        g: function (D, x) { var r = mulv(D.A, x).map(function (v, i) { return v - D.b[i]; }); return mulTv(D.A, r).map(function (v) { return 2 * v; }); }
      },
      lse: {
        f: function (D, x) { var m = Math.max.apply(null, x); return x[0] - (m + Math.log(x.reduce(function (s, v) { return s + Math.exp(v - m); }, 0))); },
        g: function (D, x) { return softmax(x).map(function (p, i) { return (i === 0 ? 1 : 0) - p; }); }
      }
    };
    var seed = 20261001, form = 'lin', D = gen(seed);

    function render() {
      var F = FORMS[form], g = F.g(D, D.x), rows = [], maxErr = 0;
      for (var i = 0; i < N; i++) {
        var xp = D.x.slice(), xm = D.x.slice();
        xp[i] += HSTEP; xm[i] -= HSTEP;
        var fd = (F.f(D, xp) - F.f(D, xm)) / (2 * HSTEP), err = Math.abs(g[i] - fd);   // 真的去算 f(x ± h·eᵢ)
        maxErr = Math.max(maxErr, err);
        rows.push([g[i], fd, err]);
      }
      while (tb.firstChild) tb.removeChild(tb.firstChild);
      rows.forEach(function (r, i) {
        var tr = document.createElement('tr'), c0 = document.createElement('td');
        c0.innerHTML = '<span class="mi">∂f</span>/<span class="mi">∂x</span><sub class="mn">' + (i + 1) + '</sub>';
        tr.appendChild(c0);
        [[fmt(r[0], 6), 'num'], [fmt(r[1], 6), 'num'], [r[2] < 1e-3 ? sci(r[2]) : fmt(r[2], 4), 'num' + (r[2] > TOL ? ' bad' : '')]].forEach(function (c) {
          var td = document.createElement('td'); td.className = c[1]; td.textContent = c[0]; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      var errTxt = maxErr < 1e-3 ? sci(maxErr) : fmt(maxErr, 4), box = $('chk-read');
      box.className = 'w-read' + (maxErr > TOL ? ' no' : '');
      box.innerHTML = maxErr <= TOL
        ? '三个分量都对上了，最大误差 <b>' + errTxt + '</b>。'
        : '对不上：最大误差 <b>' + errTxt + '</b>。<span class="mi">x</span><sup class="mn">⊤</sup><span class="mi">Ax</span> 的梯度是 (<span class="mi">A</span>+<span class="mi">A</span><sup class="mn">⊤</sup>)<span class="mi">x</span>，<span class="mi">A</span> 不对称时 <span class="mi">Ax</span> 只对了一半。';
    }

    $$('#chk-forms button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        form = btn.getAttribute('data-f');
        $$('#chk-forms button').forEach(function (o) { o.setAttribute('aria-pressed', o === btn ? 'true' : 'false'); });
        render();
      });
    });
    $('chk-new').addEventListener('click', function () { D = gen(++seed); render(); });
    render();
  })();

  /* ---------------- 第 6 章：负梯度走十步，牛顿方向走一步 ---------------- */
  (function () {
    var svg = $('quad-svg'); if (!svg) return;
    var XS = [0, 0], X0 = [-1.4, 1.4], ETA = 1.6, MAXN = 100, MS = 150;   // 步长 η = 1.6/λmax；每步 150 ms
    var st = { x0: X0.slice(), n: 0, target: 0, pos: 0, raf: 0, last: 0, pts: [] };
    var kS = $('quad-k'), aS = $('quad-a'), P, el, move, M;

    function model() {
      var k = +kS.value, al = +aS.value * Math.PI / 180, c = Math.cos(al), s = Math.sin(al);
      var a11 = k * c * c + s * s, a12 = (k - 1) * c * s, a22 = k * s * s + c * c, det = a11 * a22 - a12 * a12;
      var half = (a11 + a22) / 2, rad = Math.sqrt(Math.pow((a11 - a22) / 2, 2) + a12 * a12);
      M = {
        a11: a11, a12: a12, a22: a22, al: al, lmax: half + rad, lmin: half - rad,
        inv: [[a22 / det, -a12 / det], [-a12 / det, a11 / det]]
      };
      M.eta = ETA / M.lmax;
      M.grad = function (x) { var d = [x[0] - XS[0], x[1] - XS[1]]; return [a11 * d[0] + a12 * d[1], a12 * d[0] + a22 * d[1]]; };
    }
    function dist(x) { return Math.hypot(x[0] - XS[0], x[1] - XS[1]); }
    function ensure(n) {   // 迭代 x ← x − η∇f(x)，按需延长
      if (!st.pts.length) st.pts.push(st.x0.slice());
      while (st.pts.length <= n) {
        var x = st.pts[st.pts.length - 1], g = M.grad(x);
        st.pts.push([x[0] - M.eta * g[0], x[1] - M.eta * g[1]]);
      }
    }
    function newtonStep(x) { var g = M.grad(x), d = M.inv; return [x[0] - (d[0][0] * g[0] + d[0][1] * g[1]), x[1] - (d[1][0] * g[0] + d[1][1] * g[1])]; }

    function build() {
      P = plot(svg, 'qclip', 16);
      el = { rings: [] };
      var g = S(svg, 'g', { 'clip-path': 'url(#qclip)' });
      for (var i = 1; i <= 9; i++) el.rings.push(S(g, 'path', { class: 'ct' }));
      el.through = S(g, 'path', { class: 'ct on' });
      el.nline = S(g, 'line', { class: 'nline' });
      el.path = S(svg, 'polyline', { class: 'gdp' });
      el.dots = S(svg, 'g', {});
      cross(svg, P.X(XS[0]), P.Y(XS[1]), 6);
      el.ag = S(svg, 'polygon', { class: 'agd' });
      el.an = S(svg, 'polygon', { class: 'an' });
      el.gl = mtext(svg, { class: 'lab g' }, '−∇f');
      el.nl = S(svg, 'text', { class: 'lab u' });
      S(el.nl, 'tspan', { class: 'mn-t' }, '−'); S(el.nl, 'tspan', { class: 'mi-t' }, 'H');
      S(el.nl, 'tspan', { class: 'mn-t', dy: -6, style: 'font-size:10px' }, '−1');
      S(el.nl, 'tspan', { class: 'mn-t', dy: 6 }, '∇'); S(el.nl, 'tspan', { class: 'mi-t' }, 'f');
      el.xy = S(svg, 'text', { class: 'tick', x: P.ml, y: P.h - 4 });
      move = handle(svg, P, '起点 x₀ 的位置，方向键移动', function () { return st.x0; }, function (x, y) { st.x0 = [P.clampX(x), P.clampY(y)]; reset(); });
      draw();
    }

    function draw() {
      var s = P.s, x0 = st.x0;
      for (var i = 1; i <= 9; i++) {   // 水平集：沿 e₁ 的半轴 r/√κ，沿 e₂ 的半轴 r（κ、1 是特征值）
        var r = 0.45 * i; el.rings[i - 1].setAttribute('d', ellipseD(P, XS, M.al, r / Math.sqrt(M.lmax), r / Math.sqrt(M.lmin)));
      }
      var d0 = M.grad(x0), q = 0.5 * ((x0[0] - XS[0]) * d0[0] + (x0[1] - XS[1]) * d0[1]), rr = Math.sqrt(2 * q);
      el.through.setAttribute('d', rr > 1e-3 ? ellipseD(P, XS, M.al, rr / Math.sqrt(M.lmax), rr / Math.sqrt(M.lmin)) : '');
      move();
      var px = P.X(x0[0]), py = P.Y(x0[1]), qx = P.X(XS[0]), qy = P.Y(XS[1]), D = Math.hypot(qx - px, qy - py);
      el.nline.setAttribute('x1', px); el.nline.setAttribute('y1', py); el.nline.setAttribute('x2', qx); el.nline.setAttribute('y2', qy);
      // 两个箭头等长（取 1.15 个单位，最长到最小点为止）：橙色 −∇f，墨色 −H⁻¹∇f
      var L = Math.min(1.15 * s, D - 4), gn = Math.hypot(d0[0], d0[1]);
      var nd = D > 1e-6 ? [(qx - px) / D, (qy - py) / D] : [0, 0], gd = gn > 1e-9 ? [-d0[0] / gn, d0[1] / gn] : [0, 0];   // 屏幕坐标：y 向下
      var ok = L > 8 && gn > 1e-9;
      el.ag.setAttribute('points', ok ? arrowPts(px, py, px + gd[0] * L, py + gd[1] * L, 2.4, 7.5, 12) : '');
      el.an.setAttribute('points', ok ? arrowPts(px, py, px + nd[0] * L, py + nd[1] * L, 1.1, 5, 9) : '');
      el.gl.style.display = el.nl.style.display = ok ? '' : 'none';
      if (ok) {   // 两个标签放在箭头的两侧；κ = 1 时箭头重合，也不会叠在一起
        var cr = gd[0] * nd[1] - gd[1] * nd[0], sg = cr >= 0 ? -1 : 1;
        var lg = hang(P, [px + gd[0] * L, py + gd[1] * L], gd, sg), ln = hang(P, [px + nd[0] * L, py + nd[1] * L], nd, -sg);
        place(el.gl, lg[0], lg[1], lg[2]); place(el.nl, ln[0], ln[1], ln[2]);
      }
      // 梯度下降的路径：已走完的步数加上正在走的这一步
      var k = Math.floor(st.pos), fr = st.pos - k, pts = [];
      ensure(k + 1);
      for (i = 0; i <= k; i++) pts.push(st.pts[i]);
      if (fr > 0) pts.push([st.pts[k][0] + (st.pts[k + 1][0] - st.pts[k][0]) * fr, st.pts[k][1] + (st.pts[k + 1][1] - st.pts[k][1]) * fr]);
      el.path.setAttribute('points', pts.length > 1 ? pts.map(function (p) { return P.X(p[0]).toFixed(1) + ',' + P.Y(p[1]).toFixed(1); }).join(' ') : '');
      while (el.dots.firstChild) el.dots.removeChild(el.dots.firstChild);
      for (i = 1; i <= k; i++) S(el.dots, 'circle', { class: 'gdd', cx: P.X(st.pts[i][0]), cy: P.Y(st.pts[i][1]), r: 2.8 });
      if (pts.length > 1) { var e = pts[pts.length - 1]; S(el.dots, 'circle', { class: 'gdn', cx: P.X(e[0]), cy: P.Y(e[1]), r: 5 }); }
      setText(el.xy, 'x₀ = (' + fmt(x0[0], 2) + ', ' + fmt(x0[1], 2) + ')');

      setText($('quad-k-out'), fmt(+kS.value, 1));
      setText($('quad-a-out'), Math.round(+aS.value) + '°');
      setText($('quad-eig'), fmt(M.lmax, 1) + ', ' + fmt(M.lmin, 1));
      setText($('quad-gd'), fmt(dist(st.pts[k]), 2) + '（' + k + ' 步）');
      setText($('quad-nt'), fmt(dist(newtonStep(x0)), 3));
    }

    function stop() { cancelAnimationFrame(st.raf); st.raf = 0; }
    function reset() { stop(); st.pts = []; st.target = 0; st.pos = 0; draw(); }
    function loop(now) {
      st.pos = Math.min(st.target, st.pos + Math.max(0, Math.min(50, now - st.last)) / MS); st.last = now;   // rAF 的时间戳可能早于 go() 里记下的 now，夹到 0 以上
      draw();
      st.raf = st.pos < st.target ? requestAnimationFrame(loop) : 0;
    }
    function go() {
      st.target = Math.min(MAXN, st.target + 10);
      if (reduced) { st.pos = st.target; draw(); return; }
      if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(loop); }
    }

    function params() { model(); reset(); }
    kS.addEventListener('input', params); aS.addEventListener('input', params);
    $('quad-go').addEventListener('click', go);
    $('quad-reset').addEventListener('click', reset);
    model();
    build();
    var lastW = innerWidth;
    window.addEventListener('resize', function () { if (innerWidth !== lastW) { lastW = innerWidth; build(); } });
    if (document.fonts) document.fonts.ready.then(build);
  })();

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
