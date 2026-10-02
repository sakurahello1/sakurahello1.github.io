/* 矩阵微分 · 实例与目录
   六个实例：方向导数（梯度与差商）、负梯度与牛顿方向（二次函数）、一元牛顿法（二次模型与它的顶点）、梯度检验（有限差分），
   以及第 8 章的 roofline（算力 / 访存）与激活重计算（显存 / 时间）。
   所有显示的数字都由页面当场算出：公式值用公式，差商用真的去算 f，roofline 与显存峰值按各自的模型逐项计算。 */
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

  /* ---------------- 第 6 章：一元牛顿法，二次模型与它的顶点 ---------------- */
  (function () {
    var svg = $('nt-svg'); if (!svg) return;
    var FN = {
      exp: {
        f: function (x) { return Math.exp(x) - 2 * x; }, d1: function (x) { return Math.exp(x) - 2; }, d2: function (x) { return Math.exp(x); },
        xl: -1, xh: 2.2, yl: 0, yh: 5, x0: 0, mins: [Math.LN2]
      },
      sqrt: {
        f: function (x) { return Math.sqrt(1 + x * x); }, d1: function (x) { return x / Math.sqrt(1 + x * x); }, d2: function (x) { return Math.pow(1 + x * x, -1.5); },
        xl: -3, xh: 3, yl: 0.5, yh: 3.5, x0: 1.1, mins: [0]
      },
      quartic: {
        f: function (x) { return x * x * x * x / 4 - x * x / 2; }, d1: function (x) { return x * x * x - x; }, d2: function (x) { return 3 * x * x - 1; },
        xl: -1.8, xh: 1.8, yl: -0.6, yh: 1.1, x0: 0.3, mins: [-1, 1]
      }
    };
    var BIG = 1e4, MAXK = 60;
    var F = FN.exp, x0 = F.x0, k = 0, N = [x0], G = [x0], el = {}, geo = {};
    var eS = $('nt-eta'), readEl = $('nt-read');

    function last(a) { return a[a.length - 1]; }
    function alive(v) { return isFinite(v) && Math.abs(v) < BIG; }
    function num(v, d) { return !isFinite(v) ? '∞' : Math.abs(v) >= BIG || (v !== 0 && Math.abs(v) < 1e-3) ? sci(v).replace(/^-/, '−') : fmt(v, d); }
    function stepN(x) { var h = F.d2(x); return alive(x) && Math.abs(h) > 1e-12 ? x - F.d1(x) / h : x; }
    function stepG(x) { return alive(x) ? x - +eS.value * F.d1(x) : x; }
    function compute() {   // 从 x0 起各走 k 步；发散之后停在原地
      N = [x0]; G = [x0];
      for (var i = 0; i < k; i++) { N.push(stepN(last(N))); G.push(stepG(last(G))); }
    }

    function build() {
      var w = width(svg), ml = 30, mr = 14, mt = 14, mb = 64, pw = w - ml - mr, ph = Math.round(clamp(pw * 0.46, 170, 250)), bottom = mt + ph, i, j;   // 图框下面留一条放两支箭头的带子
      frame(svg, bottom + mb);
      geo = {
        w: w, ml: ml, mt: mt, pw: pw, ph: ph, bottom: bottom,
        X: function (x) { return ml + (x - F.xl) / (F.xh - F.xl) * pw; },
        Y: function (y) { return bottom - (y - F.yl) / (F.yh - F.yl) * ph; },
        ux: function (px) { return F.xl + (px - ml) / pw * (F.xh - F.xl); }
      };
      S(S(S(svg, 'defs', {}), 'clipPath', { id: 'ntclip' }), 'rect', { x: ml, y: mt, width: pw, height: ph });
      S(svg, 'rect', { class: 'plate', x: ml, y: mt, width: pw, height: ph });
      for (i = Math.ceil(F.xl); i <= F.xh; i++) {
        if (i) S(svg, 'line', { class: 'grid', x1: geo.X(i), x2: geo.X(i), y1: mt, y2: bottom });
        S(svg, 'text', { class: 'tick', x: geo.X(i), y: bottom + 16, 'text-anchor': 'middle' }, fmt(i, 0));
      }
      if (F.yl < 0 && F.yh > 0) S(svg, 'line', { class: 'axis', x1: ml, x2: ml + pw, y1: geo.Y(0), y2: geo.Y(0) });
      S(svg, 'line', { class: 'axis', x1: geo.X(0), x2: geo.X(0), y1: mt, y2: bottom });
      mtext(svg, { class: 'lab', x: ml + pw - 4, y: bottom - 6, 'text-anchor': 'end' }, 'x');
      mtext(svg, { class: 'lab', x: ml + 8, y: mt + 16 }, 'f(x)');
      var d = '';
      for (j = 0; j <= 200; j++) { var xx = F.xl + (F.xh - F.xl) * j / 200; d += (j ? 'L' : 'M') + geo.X(xx).toFixed(1) + ' ' + geo.Y(F.f(xx)).toFixed(1); }
      S(svg, 'path', { class: 'fc', d: d, 'clip-path': 'url(#ntclip)' });
      F.mins.forEach(function (m) { cross(svg, geo.X(m), geo.Y(F.f(m)), 5); });
      el.dyn = S(svg, 'g', {});
      var vis = S(svg, 'circle', { class: 'pt-h', r: 7.5 });
      var hit = S(svg, 'circle', { class: 'hit', r: 19, tabindex: 0, role: 'slider', 'aria-label': '起点 x₀ 的位置，方向键移动', 'aria-valuemin': F.xl, 'aria-valuemax': F.xh });
      el.vis = vis; el.hit = hit;
      function drag(e) { var r = svg.getBoundingClientRect(); setStart(geo.ux((e.clientX - r.left) * (geo.w / r.width))); }
      hit.addEventListener('pointerdown', function (e) { e.preventDefault(); hit.setPointerCapture(e.pointerId); hit.focus({ preventScroll: true }); hit.classList.add('drag'); drag(e); });
      hit.addEventListener('pointermove', function (e) { if (hit.hasPointerCapture(e.pointerId)) drag(e); });
      hit.addEventListener('pointerup', function () { hit.classList.remove('drag'); });
      hit.addEventListener('pointercancel', function () { hit.classList.remove('drag'); });
      hit.addEventListener('focus', function () { vis.classList.add('foc'); });
      hit.addEventListener('blur', function () { vis.classList.remove('foc'); });
      hit.addEventListener('keydown', function (e) {
        var st = (F.xh - F.xl) / 80 * (e.shiftKey ? 5 : 1), dx = { ArrowLeft: -st, ArrowRight: st, ArrowDown: -st, ArrowUp: st }[e.key];
        if (dx) { e.preventDefault(); setStart(x0 + dx); }
      });
      draw();
    }

    function setStart(x) { x0 = clamp(x, F.xl + 0.02, F.xh - 0.02); k = 0; compute(); draw(); }

    function draw() {
      var X = geo.X, Y = geo.Y, xc = last(N), xg = last(G), n = N.length - 1, i;
      var f0 = F.f(xc), g0 = F.d1(xc), h0 = F.d2(xc), inView = xc >= F.xl && xc <= F.xh, flat = Math.abs(h0) < 1e-12;
      while (el.dyn.firstChild) el.dyn.removeChild(el.dyn.firstChild);
      var dyn = el.dyn, py = Y(clamp(F.f(x0), F.yl, F.yh));
      el.vis.setAttribute('cx', X(x0)); el.vis.setAttribute('cy', py); el.hit.setAttribute('cx', X(x0)); el.hit.setAttribute('cy', py);
      el.hit.setAttribute('aria-valuenow', fmt(x0, 2)); el.hit.setAttribute('aria-valuetext', 'x₀ = ' + fmt(x0, 2));

      var xv = flat ? xc : xc - g0 / h0;   // 二次模型的顶点（h = 0 时模型是直线，没有顶点）
      if (inView) {
        var d = '', m;
        for (i = 0; i <= 160; i++) { var xx = F.xl + (F.xh - F.xl) * i / 160, dx = xx - xc; m = f0 + g0 * dx + 0.5 * h0 * dx * dx; d += (i ? 'L' : 'M') + X(xx).toFixed(1) + ' ' + Y(m).toFixed(1); }
        S(dyn, 'path', { class: 'fm', d: d, 'clip-path': 'url(#ntclip)' });
        if (!flat && xv >= F.xl && xv <= F.xh) {
          var yv = clamp(f0 - g0 * g0 / (2 * h0), F.yl, F.yh);
          S(dyn, 'line', { class: 'vl', x1: X(xv), x2: X(xv), y1: Y(yv), y2: geo.bottom });
          var qx = X(xv), qy = Y(yv);
          S(dyn, 'path', { class: 'vx', d: 'M' + pt(qx, qy - 6.5) + 'L' + pt(qx + 6.5, qy) + 'L' + pt(qx, qy + 6.5) + 'L' + pt(qx - 6.5, qy) + 'Z' });
        }
        // 图框下面的两支箭头：牛顿这一步（墨色，从当前点到顶点），梯度下降这一步（橙色）
        var xe = clamp(xv, F.xl, F.xh);
        S(dyn, 'polygon', { class: 'an', points: arrowPts(X(xc), geo.bottom + 36, X(xe), geo.bottom + 36, 1.1, 5, 9) });
      }
      if (xg >= F.xl && xg <= F.xh) {
        var xge = clamp(xg - +eS.value * F.d1(xg), F.xl, F.xh);
        S(dyn, 'polygon', { class: 'agd', points: arrowPts(X(xg), geo.bottom + 52, X(xge), geo.bottom + 52, 1.6, 6, 10) });
      }
      S(dyn, 'text', { class: 'tick', x: geo.ml + geo.pw - 8, y: geo.mt + 16, 'text-anchor': 'end' }, '第 ' + n + ' 步');
      function dot(x, cls, r) {
        if (x < F.xl || x > F.xh) return;
        var y = F.f(x); if (y < F.yl || y > F.yh) return;
        S(dyn, 'circle', { class: cls, cx: X(x), cy: Y(y), r: r });
      }
      for (i = 1; i <= n; i++) { dot(G[i], 'gdd', 3.2); dot(N[i], 'nd', 3.2); }
      if (n > 0) { dot(xg, 'gdc', 5.6); dot(xc, 'gdn', 5.6); }

      // 读数
      var eta = +eS.value;
      setText($('nt-eta-out'), fmt(eta, 2));
      setText($('nt-nx'), alive(xc) ? num(xc, 6) : '已发散');
      setText($('nt-ng'), alive(xc) ? num(g0, 3) : '—');
      setText($('nt-ns'), flat || !alive(xc) ? '—' : num(1 / h0, 2));
      setText($('nt-gx'), alive(xg) ? num(xg, 6) : '已发散');
      setText($('nt-gg'), alive(xg) ? num(F.d1(xg), 3) : '—');
      setText($('nt-gs'), fmt(eta, 2));

      // 一句话说明现在发生了什么
      var msg, bad = false, jump = flat ? 0 : Math.abs(g0 / h0);
      if (!alive(xc)) { msg = '牛顿法跳出了画面：f″ 太小，步长 1/f″ 大得离谱，二次模型在这里完全不可信。'; bad = true; }
      else if (n > 0 && Math.abs(g0) < 1e-6 && h0 < 0) { msg = '牛顿法在 f″ = ' + num(h0, 2) + ' < 0 的地方停住了：f′ ≈ 0，但这是 f 的局部最大点。牛顿法找的是 f′ = 0，不分最小和最大。'; bad = true; }
      else if (n > 0 && Math.abs(g0) < 1e-9) { msg = '牛顿法已经收敛：f′ ≈ ' + num(g0, 1) + '。梯度下降此时 f′ = ' + num(F.d1(xg), 2) + '。'; }
      else if (h0 < 0) { msg = '这里 f″ = ' + num(h0, 2) + ' < 0：二次模型开口向下，菱形是它的最大点。牛顿法下一步会往 f 的最大点走，而不是最小点。'; bad = true; }
      else if (jump > F.xh - F.xl) { msg = '下一步要走 ' + num(jump, 2) + '，比整张图还宽：f″ = ' + num(h0, 3) + ' 太小，二次模型太平，顶点在很远的地方。'; bad = true; }
      else if (n === 0) { msg = '拖动白点选起点，再点“走 1 步”。青色抛物线是白点处的二次模型，菱形是它的顶点，牛顿法下一步就跳到那里；橙色箭头是梯度下降要走的一步。'; }
      else { msg = '第 ' + n + ' 步：牛顿法走了 ' + fmt(N[n] - N[n - 1], 4) + '（模型的顶点），梯度下降走了 ' + fmt(G[n] - G[n - 1], 4) + '（η·f′）。'; }
      setText(readEl, msg);
      readEl.classList.toggle('no', bad);
    }

    function stepBy(m) {
      k = Math.min(MAXK, k + m); compute(); draw();
    }
    function pick(f) {
      F = FN[f]; x0 = F.x0; k = 0; compute();
      $$('#nt-fn button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === f ? 'true' : 'false'); });
      build();
    }
    $$('#nt-fn button').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-f')); }); });
    eS.addEventListener('input', function () { compute(); draw(); });
    $('nt-step').addEventListener('click', function () { stepBy(1); });
    $('nt-step5').addEventListener('click', function () { stepBy(5); });
    $('nt-reset').addEventListener('click', function () { x0 = F.x0; k = 0; compute(); draw(); });
    compute();
    build();
    var lastW = innerWidth;
    window.addEventListener('resize', function () { if (innerWidth !== lastW) { lastW = innerWidth; build(); } });
    if (document.fonts) document.fonts.ready.then(build);
  })();

  /* ---------------- 第 8 章两张图的公共小工具 ---------------- */
  function pt(x, y) { return x.toFixed(1) + ' ' + y.toFixed(1); }
  // 标签里 {k} 这样的单个字母用 KaTeX 斜体（和公式一致），其余照常，汉字留在页面字体里
  function ltext(parent, attrs, str) {
    var t = S(parent, 'text', attrs);
    str.split(/\{([A-Za-z])\}/).forEach(function (s, i) { if (s) S(t, 'tspan', i % 2 ? { class: 'mi-t' } : {}, s); });
    return t;
  }
  // 标签宽度的估计：汉字一个字号宽，其余 0.6 个字号
  function tw(str, size) {
    var s = str.replace(/\{([A-Za-z])\}/g, '$1'), n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) > 0x2e80 ? size : size * 0.6;
    return n;
  }
  // 刻度步长：1、2、5 × 10ⁿ 里，刻度数不超过 maxTicks 的最小一个
  function niceStep(range, maxTicks) {
    for (var p = 1; ; p *= 10) for (var i = 0, m = [1, 2, 5]; i < 3; i++) if (range / (m[i] * p) <= maxTicks) return m[i] * p;
  }

  /* ---------------- 第 8 章：roofline ---------------- */
  (function () {
    var svg = $('roof-svg'); if (!svg) return;
    // A100 80GB SXM 的标称值：FP16/BF16 稠密张量算力、HBM 带宽；每个元素 2 字节
    var PEAK = 312e12, BW = 2.039e12, EB = 2, RIDGE = PEAK / BW;
    var XL = -1, XH = 4, YL = -1, YH = 3;   // 坐标范围取 log10：算术强度 0.1…10⁴ FLOP/B，算力 0.1…1000 TFLOP/s
    var mS = $('roof-m'), kS = $('roof-k'), eS = $('roof-e');
    var fused = false, R, shown = null, raf = 0, timer = 0;

    function model() {
      var M = Math.round(Math.pow(2, +mS.value)), K = Math.round(Math.pow(2, +kS.value)), e = +eS.value;
      var flops = 2 * M * M * K, bytes = (M * K + K * M + M * M) * EB;   // (M×K)(K×N)，N = M；每个矩阵只碰一次
      var ai = flops / bytes, att = Math.min(PEAK, BW * ai), t = flops / att;
      // 逐元素链作用在 M×N 的输出上：每个算子读、写各一遍（共 2·EB 字节 / 元素），约 1 FLOP / 元素
      var E = M * M, cf = e * E, cb = (fused ? 1 : e) * 2 * EB * E, ct = Math.max(cb / BW, cf / PEAK);
      R = { M: M, K: K, e: e, ai: ai, att: att, t: t, cai: cf / cb, catt: cf / ct, ct: ct, ratio: ct / t };
    }
    function tstr(s) {   // 秒 → ns / µs / ms，三位有效数字
      var v = s * 1e3, u = ' ms';
      if (s < 1e-6) { v = s * 1e9; u = ' ns'; } else if (s < 1e-3) { v = s * 1e6; u = ' µs'; }
      return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + u;
    }
    function pstr(r) { var p = r * 100; return (p >= 10 ? p.toFixed(0) : p >= 0.05 ? p.toFixed(1) : '<0.1') + '%'; }

    function draw() {
      var w = width(svg), ml = 46, mr = 14, mt = 12, mb = 50, pw = w - ml - mr, ph = Math.round(clamp(pw * 0.62, 190, 300));
      var bottom = mt + ph, right = ml + pw;
      frame(svg, bottom + mb);
      function X(v) { return ml + (Math.log10(clamp(v, 0.1, 1e4)) - XL) / (XH - XL) * pw; }
      function Y(v) { return bottom - (Math.log10(clamp(v, 0.1, 1e3)) - YL) / (YH - YL) * ph; }
      var i;
      S(svg, 'rect', { class: 'plate', x: ml, y: mt, width: pw, height: ph });
      var XT = ['0.1', '1', '10', '100', '1k', '10k'], YT = ['0.1', '1', '10', '100', '1000'];
      for (i = 0; i < XT.length; i++) {
        var gx = ml + i / (XT.length - 1) * pw;
        if (i && i < XT.length - 1) S(svg, 'line', { class: 'grid', x1: gx, x2: gx, y1: mt, y2: bottom });
        S(svg, 'text', { class: 'tick', x: gx, y: bottom + 17, 'text-anchor': 'middle' }, XT[i]);
      }
      for (i = 0; i < YT.length; i++) {
        var gy = bottom - i / (YT.length - 1) * ph;
        if (i && i < YT.length - 1) S(svg, 'line', { class: 'grid', x1: ml, x2: right, y1: gy, y2: gy });
        S(svg, 'text', { class: 'tick', x: ml - 6, y: gy + 4, 'text-anchor': 'end' }, YT[i]);
      }
      S(svg, 'text', { x: right, y: bottom + 34, 'text-anchor': 'end' }, '算术强度（FLOP/字节）');
      S(svg, 'text', { x: 14, y: mt + ph / 2, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (mt + ph / 2) + ')' }, '可达算力（TFLOP/s）');

      // 屋顶线：斜线 y = BW·x，到拐点后水平
      var tf0 = BW / 1e12, xr = X(RIDGE), yr = Y(PEAK / 1e12), y0 = Y(tf0 * 0.1);
      S(svg, 'path', { class: 'r-fill', d: 'M' + pt(ml, bottom) + 'V' + y0.toFixed(1) + 'L' + pt(xr, yr) + 'H' + right + 'V' + bottom + 'Z' });
      S(svg, 'line', { class: 'r-ridge', x1: xr, x2: xr, y1: yr, y2: bottom });
      S(svg, 'path', { class: 'r-line', d: 'M' + pt(ml, y0) + 'L' + pt(xr, yr) + 'H' + right });
      S(svg, 'circle', { class: 'r-knee', cx: xr, cy: yr, r: 3.6 });

      // 两个点
      var gx0 = X(R.ai), gy0 = Y(R.att / 1e12), cx0 = X(shown.x), cy0 = Y(shown.y);
      S(svg, 'line', { class: 'r-drop', x1: cx0, x2: cx0, y1: cy0, y2: bottom });
      S(svg, 'line', { class: 'r-drop', x1: gx0, x2: gx0, y1: gy0, y2: bottom });
      S(svg, 'path', { class: 'r-pe', d: 'M' + pt(cx0, cy0 - 7.5) + 'L' + pt(cx0 + 7.5, cy0) + 'L' + pt(cx0, cy0 + 7.5) + 'L' + pt(cx0 - 7.5, cy0) + 'Z' });
      S(svg, 'circle', { class: 'r-pg', cx: gx0, cy: gy0, r: 6 });

      // 标签：每个标签给几个候选位置，挑和其他东西（点、竖线、已放的标签、屋顶线、图框）撞得最少的
      // 障碍 = [x0, y0, x1, y1, 撞上的代价]：点和拐点 10，虚线竖线 2
      var obs = [[gx0 - 9, gy0 - 9, gx0 + 9, gy0 + 9, 10], [cx0 - 9, cy0 - 9, cx0 + 9, cy0 + 9, 10], [xr - 6, yr - 6, xr + 6, yr + 6, 10], [gx0 - 2, gy0, gx0 + 2, bottom, 2], [cx0 - 2, cy0, cx0 + 2, bottom, 2]];
      var roofPts = [], j;
      for (j = 0; j <= 60; j++) { var a = Math.pow(10, XL + (Math.log10(RIDGE) - XL) * j / 60); roofPts.push([X(a), Y(tf0 * a)]); }
      for (j = 1; j <= 30; j++) roofPts.push([xr + (right - xr) * j / 30, yr]);
      function rects(c, wd) {
        var x0 = c.a === 'start' ? c.x : c.a === 'end' ? c.x - wd : c.x - wd / 2, out = [];
        if (c.rot == null) return [[x0 - 2, c.y - 12, x0 + wd + 2, c.y + 4]];
        var ca = Math.cos(c.rot), sa = Math.sin(c.rot);   // 斜着的标签：沿基线每 5px、离基线 0.5 / 4.5 / 8.5px 取一小块
        for (var u = -wd / 2; u <= wd / 2; u += 5) for (var v = 0.5; v < 10; v += 4) { var px = c.x + u * ca - v * sa, py = c.y - u * sa - v * ca; out.push([px - 3.5, py - 3.5, px + 3.5, py + 3.5]); }
        return out;
      }
      function cost(rs, onRoof) {
        var c = 0;
        rs.forEach(function (r) {
          if (r[0] < ml + 2 || r[2] > right - 2 || r[1] < mt + 2 || r[3] > bottom - 2) c += 100;
          obs.forEach(function (o) { if (r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]) c += o[4]; });
          if (!onRoof) for (var q = 0; q < roofPts.length; q++) if (roofPts[q][0] > r[0] && roofPts[q][0] < r[2] && roofPts[q][1] > r[1] && roofPts[q][1] < r[3]) { c += 4; break; }
        });
        return c;
      }
      function put(str, cls, cands) {
        var wd = tw(str, 12), best = null, bc = 1e9;
        cands.forEach(function (c) { var rs = rects(c, wd), k = cost(rs, c.rot != null); if (k < bc) { bc = k; best = { c: c, rs: rs }; } });
        var c = best.c, t = S(svg, 'text', { class: cls, x: c.x.toFixed(1), y: c.y.toFixed(1), 'text-anchor': c.a }, str);
        if (c.rot != null) t.setAttribute('transform', 'rotate(' + (-c.rot * 180 / Math.PI).toFixed(1) + ' ' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ')');
        best.rs.forEach(function (r) { obs.push([r[0], r[1], r[2], r[3], 10]); });
      }
      function around(px, py, order) {
        var D = { ur: ['start', 11, -6], ul: ['end', -11, -6], lr: ['start', 11, 16], ll: ['end', -11, 16], up: ['middle', 0, -14], dn: ['middle', 0, 24], r: ['start', 12, 4], l: ['end', -12, 4] };
        return order.map(function (o) { return { a: D[o][0], x: px + D[o][1], y: py + D[o][2] }; });
      }
      // 顺序：先放两个点的标签（给屋顶线上惯常的位置留一点余地），再放峰值 / 拐点 / 斜率的标签
      var TC = fmt(PEAK / 1e12, 0) + ' TFLOPS', TR = fmt(RIDGE, 0) + ' FLOP/B', xm = (xr + right) / 2;
      var cc = [{ a: 'end', x: right - 6, y: yr - 9 }, { a: 'start', x: xr + 10, y: yr - 9 }, { a: 'end', x: right - 6, y: yr + 18 }, { a: 'start', x: xr + 10, y: yr + 18 }, { a: 'middle', x: xm, y: yr - 9 }, { a: 'middle', x: xm, y: yr + 18 }];
      var rc = [{ a: 'end', x: xr - 9, y: yr - 9 }, { a: 'start', x: xr + 9, y: yr + 18 }, { a: 'start', x: xr + 8, y: bottom - 8 }, { a: 'end', x: xr - 9, y: bottom - 8 }];
      var nb = obs.length;
      rects(cc[0], tw(TC, 12)).concat(rects(rc[0], tw(TR, 12))).forEach(function (r) { obs.push([r[0], r[1], r[2], r[3], 3]); });
      put('GEMM', 'lab g pt', around(gx0, gy0, ['ul', 'ur', 'll', 'lr', 'up', 'l', 'r', 'dn']));
      put('逐元素链', 'lab pt', around(cx0, cy0, ['lr', 'll', 'ur', 'ul', 'dn', 'r', 'l', 'up']));
      obs.splice(nb, 2);
      put(TC, 'lab m', cc);
      put(TR, 'lab m', rc);
      // 斜线上的标签：贴着斜线，先试上方再试下方；强度从 3 附近开始往两边找
      var sa = Math.atan2(ph / (YH - YL), pw / (XH - XL)), sl = [], as = [];
      for (j = -9; j <= 20; j++) as.push(j / 10);
      as.sort(function (p, q) { return Math.abs(p - 0.5) - Math.abs(q - 0.5); });
      [8, -17].forEach(function (off) {
        as.forEach(function (la) { var a = Math.pow(10, la); sl.push({ a: 'middle', x: X(a) - Math.sin(sa) * off, y: Y(tf0 * a) - Math.cos(sa) * off, rot: sa }); });
      });
      put('带宽 ' + fmt(tf0, 1) + ' TB/s', 'lab m', sl);
    }

    function cancel() { cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0; }
    function tween(to) {
      var from = shown, t0 = performance.now(), D = 340;
      function lerp(a, b, s) { return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * s); }
      function step(now) {
        var u = clamp((now - t0) / D, 0, 1), s = u * u * (3 - 2 * u);
        shown = { x: lerp(from.x, to.x, s), y: lerp(from.y, to.y, s) };
        draw();
        if (u < 1) raf = requestAnimationFrame(step); else cancel();
      }
      raf = requestAnimationFrame(step);
      timer = setTimeout(function () { cancel(); shown = to; draw(); }, D + 150);   // 页面在后台、rAF 停了也能落到终点
    }
    function update(animate) {
      model();
      var to = { x: R.cai, y: R.catt / 1e12 };
      setText($('roof-m-out'), String(R.M));
      setText($('roof-k-out'), String(R.K));
      setText($('roof-e-out'), String(R.e));
      setText($('roof-ai'), fmt(R.ai, 1) + ' FLOP/B');
      setText($('roof-t'), tstr(R.t));
      setText($('roof-et'), tstr(R.ct));
      setText($('roof-ratio'), pstr(R.ratio));
      cancel();
      if (animate && !reduced && shown && (shown.x !== to.x || shown.y !== to.y)) { tween(to); return; }
      shown = to;
      draw();
    }

    [mS, kS, eS].forEach(function (s) { s.addEventListener('input', function () { update(false); }); });
    $$('#roof-fuse button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        fused = btn.getAttribute('data-f') === '1';
        $$('#roof-fuse button').forEach(function (o) { o.setAttribute('aria-pressed', o === btn ? 'true' : 'false'); });
        update(true);
      });
    });
    update(false);
    var lastW = innerWidth;
    window.addEventListener('resize', function () { if (innerWidth !== lastW) { lastW = innerWidth; draw(); } });
    if (document.fonts) document.fonts.ready.then(draw);
  })();

  /* ---------------- 第 8 章：激活重计算的显存与时间 ---------------- */
  (function () {
    var svg = $('ckpt-svg'); if (!svg) return;
    var GB = 2.87;   // GPT-3 175B 一层、一个序列的激活：sbh·114 字节 ≈ 2.87 GB
    var lS = $('ckpt-l'), kS = $('ckpt-k'), unit = 1;

    // 模型：前向一层 1 个时间单位，反向一层 2，重算一层 1；每层激活 1 个显存单位。k = 1 是每层都存、不重算。
    function lens(L, k) { var a = [], n = Math.ceil(L / k); for (var j = 0; j < n; j++) a.push(Math.min(k, L - j * k)); return a; }
    function peakOf(L, k) {   // 第 j 段（从 0 数）重算完时，显存是 j+1 个检查点加这一段的 len 层激活
      if (k === 1) return L;
      var p = 0;
      lens(L, k).forEach(function (len, j) { p = Math.max(p, j + 1 + len); });
      return p;
    }
    function bestK(L) {   // 峰值最低的 k；并列时取最靠近 √L 的
      var mv = 1e9, b = 1, k, p;
      for (k = 1; k <= L; k++) { p = peakOf(L, k); if (p < mv) { mv = p; b = k; } else if (p === mv && Math.abs(k - Math.sqrt(L)) < Math.abs(b - Math.sqrt(L))) b = k; }
      return b;
    }

    function draw() {
      var L = +lS.value, k = +kS.value, ls = lens(L, k), n = ls.length, peak = peakOf(L, k), T = (k === 1 ? 3 : 4) * L, i, j;
      var w = width(svg), wide = w >= 640, ml = 46, mr = 18, pw = w - ml - mr, mt = 34, ph = Math.round(clamp(pw * 0.5, 180, 250)), b1 = mt + ph;
      var ymax = Math.max(L, peak) * Math.max(1.08, 1 / (1 - 20 / ph));   // 顶上留出写“峰值”的位置
      var ph2 = wide ? 104 : 92, iy = b1 + 66, ib = iy + ph2;
      frame(svg, ib + 28);
      function tx(t) { return ml + t / (4 * L) * pw; }   // 横轴固定到 4L，切换 k 时坐标不跳
      function my(m) { return b1 - m / ymax * ph; }

      // 主图：板面、网格、刻度
      S(svg, 'rect', { class: 'plate', x: ml, y: mt, width: pw, height: ph });
      var ys = niceStep(ymax, 5.5);
      for (i = 0; i * ys <= ymax; i++) {
        if (i) S(svg, 'line', { class: 'grid', x1: ml, x2: ml + pw, y1: my(i * ys), y2: my(i * ys) });
        S(svg, 'text', { class: 'tick', x: ml - 6, y: my(i * ys) + 4, 'text-anchor': 'end' }, String(i * ys));
      }
      for (i = 0; i <= 4; i++) {
        if (i && i < 4) S(svg, 'line', { class: 'grid', x1: tx(i * L), x2: tx(i * L), y1: mt, y2: b1 });
        ltext(svg, { class: 'tick', x: tx(i * L), y: b1 + 16, 'text-anchor': 'middle' }, i === 0 ? '0' : i === 1 ? '{L}' : i + '{L}');
      }
      S(svg, 'text', { x: ml + pw, y: b1 + 34, 'text-anchor': 'end' }, '时间');
      S(svg, 'text', { x: 14, y: mt + ph / 2, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (mt + ph / 2) + ')' }, '显存（层激活）');

      // 三个阶段：前向（每段开头存一个检查点，显存一格一格涨）、每段先重算、再反向（显存按层释放）
      var F = 'M' + pt(tx(0), my(0)) + 'L' + pt(tx(0), my(1)), top = 'M' + pt(tx(0), my(1)), Rc = '', Bw = '', t = L;
      for (i = 1; i < n; i++) {
        var step = 'H' + tx(i * k).toFixed(1) + 'V' + my(i + 1).toFixed(1);
        F += step; top += step;
      }
      F += 'H' + tx(L).toFixed(1) + 'V' + my(0).toFixed(1) + 'Z'; top += 'H' + tx(L).toFixed(1);
      if (k === 1) {
        Bw = 'M' + pt(tx(L), my(0)) + 'L' + pt(tx(L), my(L)) + 'L' + pt(tx(3 * L), my(0)) + 'Z';
        top += 'L' + pt(tx(3 * L), my(0));
      } else {
        for (j = n - 1; j >= 0; j--) {
          var len = ls[j], base = j + 1, t1 = t + len, t2 = t + 3 * len;
          Rc += 'M' + pt(tx(t), my(0)) + 'L' + pt(tx(t), my(base)) + 'L' + pt(tx(t1), my(base + len)) + 'L' + pt(tx(t1), my(0)) + 'Z';
          Bw += 'M' + pt(tx(t1), my(0)) + 'L' + pt(tx(t1), my(base + len)) + 'L' + pt(tx(t2), my(j)) + 'L' + pt(tx(t2), my(0)) + 'Z';
          top += 'L' + pt(tx(t1), my(base + len)) + 'L' + pt(tx(t2), my(j));
          t = t2;
        }
      }
      S(svg, 'path', { class: 'k-fwd', d: F });
      if (Rc) S(svg, 'path', { class: 'k-rec', d: Rc });
      S(svg, 'path', { class: 'k-bwd', d: Bw });
      S(svg, 'path', { class: 'k-line', d: top });

      // 峰值线与“全存”线；单位选 GB 时在数字后面带上 GB
      function gb(u) { return unit === 1 ? '' : '（' + (u * unit).toFixed(u * unit >= 100 ? 0 : 1) + ' GB）'; }
      S(svg, 'line', { class: 'k-peak', x1: ml, x2: ml + pw, y1: my(peak), y2: my(peak) });
      S(svg, 'text', { class: 'lab', x: ml + pw - 6, y: my(peak) - 5, 'text-anchor': 'end' }, '峰值 ' + peak + gb(peak));
      if (peak !== L) {
        S(svg, 'line', { class: 'k-full', x1: ml, x2: ml + pw, y1: my(L), y2: my(L) });
        S(svg, 'text', { class: 'lab m', x: ml + 6, y: my(L) + (L > peak ? -5 : 14), 'text-anchor': 'start' }, '全存 ' + L + gb(L));
      }

      // 阶段标注：板面上方一条色带加文字
      function bracket(a, b, label, cls) {
        S(svg, 'line', { class: 'k-br ' + cls, x1: tx(a) + 1, x2: tx(b) - 1, y1: mt - 8, y2: mt - 8 });
        S(svg, 'text', { x: (tx(a) + tx(b)) / 2, y: mt - 14, 'text-anchor': 'middle' }, label);
      }
      bracket(0, L, '前向', 'f');
      bracket(L, T, k === 1 ? '反向' : '重算 + 反向', 'b');

      // 小图：峰值随 k 的变化（k = 1…L，每个 k 都按上面的模型算）
      var ipw = wide ? Math.round(pw * 0.56) : pw, ix0 = ml + pw - ipw, pad = 8, curve = [], pmax = 0, kk;
      for (kk = 1; kk <= L; kk++) { curve.push(peakOf(L, kk)); pmax = Math.max(pmax, curve[kk - 1]); }
      var ymax2 = pmax * 1.1, kmin = bestK(L), ys2 = niceStep(ymax2, 3), xs2 = niceStep(L, 5);
      function ix(q) { return ix0 + pad + (q - 1) / (L - 1) * (ipw - 2 * pad); }
      function iv(p) { return ib - p / ymax2 * ph2; }
      ltext(svg, { x: ix0, y: iy - 9 }, '显存峰值随 {k} 的变化');
      S(svg, 'rect', { class: 'plate', x: ix0, y: iy, width: ipw, height: ph2 });
      for (i = 0; i * ys2 <= ymax2; i++) {
        if (i) S(svg, 'line', { class: 'grid', x1: ix0, x2: ix0 + ipw, y1: iv(i * ys2), y2: iv(i * ys2) });
        S(svg, 'text', { class: 'tick', x: ix0 - 6, y: iv(i * ys2) + 4, 'text-anchor': 'end' }, String(i * ys2));
      }
      S(svg, 'text', { class: 'tick', x: ix(1), y: ib + 16, 'text-anchor': 'middle' }, '1');
      for (i = xs2; i <= L; i += xs2) {
        S(svg, 'line', { class: 'grid', x1: ix(i), x2: ix(i), y1: iy, y2: ib });
        S(svg, 'text', { class: 'tick', x: ix(i), y: ib + 16, 'text-anchor': 'middle' }, String(i));
      }
      ltext(svg, { x: ix0 + ipw + 6, y: ib + 4 }, '{k}');
      S(svg, 'path', { class: 'k-curve', d: curve.map(function (p, q) { return (q ? 'L' : 'M') + pt(ix(q + 1), iv(p)); }).join('') });
      S(svg, 'line', { class: 'k-min', x1: ix(kmin), x2: ix(kmin), y1: iy, y2: iv(curve[kmin - 1]) });
      S(svg, 'circle', { class: 'k-minc', cx: ix(kmin), cy: iv(curve[kmin - 1]), r: 4 });
      ltext(svg, { class: 'lab', x: ix(kmin) + 6, y: iy + 14, 'text-anchor': 'start' }, '最低点 {k}≈√{L}');
      S(svg, 'circle', { class: 'k-cur', cx: ix(k), cy: iv(peak), r: 5 });

      // 宽屏时小图左边写一下当前的分法
      if (wide) {
        var last = ls[n - 1], lines = k === 1 ? ['每层的激活都存着，', '不重算，反向直接用'] : [
          '每 ' + k + ' 层存一个检查点，共 ' + n + ' 段',
          last === k ? n + ' 段，每段 ' + k + ' 层' : (n - 1) + ' 段 × ' + k + ' 层 + 末段 ' + last + ' 层',
          '重算 = 把前向再做一遍'
        ];
        S(svg, 'text', { x: ml, y: iy - 9 }, '当前的分法');
        var nt = S(svg, 'text', { class: 'k-note', x: ml, y: iy + 14 });
        lines.forEach(function (s, q) { S(nt, 'tspan', { x: ml, dy: q ? 18 : 0 }, s); });
      }
    }

    function update() {
      var L = +lS.value, k = +kS.value, peak = peakOf(L, k), total = (k === 1 ? 3 : 4) * L;
      setText($('ckpt-l-out'), String(L));
      setText($('ckpt-k-out'), String(k));
      setText($('ckpt-peak'), unit === 1 ? peak + ' 单位' : (peak * unit).toFixed(1) + ' GB');
      setText($('ckpt-rel'), Math.round(peak / L * 100) + '%');
      var tm = $('ckpt-time'), html = (k === 1 ? 3 : 4) + '<span class="mi">L</span> = ' + total + ' 个时间单位';
      if (tm.innerHTML !== html) tm.innerHTML = html;
      setText($('ckpt-extra'), k === 1 ? '0%' : '+' + Math.round((total / (3 * L) - 1) * 100) + '%');
      draw();
    }
    function setL() {
      var L = +lS.value;
      kS.max = String(L);
      if (+kS.value > L) kS.value = String(L);
      update();
    }

    lS.addEventListener('input', setL);
    kS.addEventListener('input', update);
    $$('#ckpt-unit button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        unit = +btn.getAttribute('data-u');
        $$('#ckpt-unit button').forEach(function (o) { o.setAttribute('aria-pressed', o === btn ? 'true' : 'false'); });
        update();
      });
    });
    $('ckpt-best').addEventListener('click', function () { kS.value = String(bestK(+lS.value)); update(); });
    setL();
    var lastW = innerWidth;
    window.addEventListener('resize', function () { if (innerWidth !== lastW) { lastW = innerWidth; draw(); } });
    if (document.fonts) document.fonts.ready.then(draw);
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
