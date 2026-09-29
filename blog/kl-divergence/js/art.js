/* KL 散度从哪里来 · 代码绘制的图版
   依赖 ../../assets/js/site.js 暴露的 window.Reel。每张图都是正文讲的那件事本身，数字由绘制函数当场算出。
   约定同示范页：陶土橙底，墨色为主形，白色只给此刻刚掷出的点数和刚写下的码字，等宽小字做读数。 */
(function () {
  'use strict';
  var R = window.Reel;
  if (!R) return;
  var INK = R.INK, WHITE = R.WHITE;
  var mono = function (px) { return '500 ' + px + 'px "JetBrains Mono", ui-monospace, monospace'; };
  var sans = function (px) { return '500 ' + px + 'px "Noto Sans SC", sans-serif'; };
  var LOADED = [.1, .1, .1, .1, .1, .5], UNIFORM = [1, 1, 1, 1, 1, 1].map(function () { return 1 / 6; });
  function pad(n, k) { n = String(n); while (n.length < k) n = '0' + n; return n; }
  function pick(p, u) { var c = 0; for (var i = 0; i < 5; i++) { c += p[i]; if (u < c) return i; } return 5; }
  function KL(p, q) { return p.reduce(function (s, x, i) { return x > 0 ? s + x * Math.log2(x / q[i]) : s; }, 0); }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function seeded(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var PIPS = [
    [[.5, .5]], [[.28, .28], [.72, .72]], [[.28, .28], [.5, .5], [.72, .72]],
    [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]]
  ];
  function drawDie(ctx, cx, cy, s, face, body, pip) {
    ctx.beginPath(); R.rr(ctx, cx - s / 2, cy - s / 2, s, s, s * .2); ctx.fillStyle = body; ctx.fill();
    ctx.fillStyle = pip;
    PIPS[face].forEach(function (p) { ctx.beginPath(); ctx.arc(cx - s / 2 + p[0] * s, cy - s / 2 + p[1] * s, s * .09, 0, 7); ctx.fill(); });
  }

  /* ---------- Fig. 00 首屏：平均证据收敛到 D(p‖q) ----------
     灌铅骰子 p 每 0.22 s 掷一次，白色菱形把这次的证据 log₂ p(x)/q(x) 送到曲线头上；黑线是累计平均 S_n/n，
     虚线是 D(p‖q)。下方是六个点数的 p（实心）与 q（空心）。指针的横坐标就是 q(6)，其余五面平分剩下的概率。 */
  R.cover('kl-roll', function (ctx, W, H, t, dt, st) {
    var host = ctx.canvas.parentElement;
    if (!st.bound) {
      st.bound = true;
      host.addEventListener('pointermove', function (e) { var b = host.getBoundingClientRect(); st.px = e.clientX - b.left; st.lastMove = performance.now(); });
      host.addEventListener('pointerleave', function () { st.lastMove = 0; });
      st.read = host.querySelector('[data-read]');
      var rnd = seeded(7);
      st.faces = [];
      for (var k = 0; k < 70; k++) st.faces.push(pick(LOADED, rnd()));
      st.clock = 0; st.born = -1;
    }
    var user = st.lastMove && performance.now() - st.lastMove < 4000;
    var target = user ? .04 + .66 * Math.max(0, Math.min(1, st.px / W)) : .17 + .12 * Math.sin(t * .2);
    st.q6 = st.q6 == null ? target : st.q6 + (target - st.q6) * Math.min(1, dt * 4);
    var P = LOADED, q6 = st.q6, Q = [0, 1, 2, 3, 4].map(function () { return (1 - q6) / 5; }).concat([q6]);
    st.clock += dt;
    if (st.clock > .22) {
      st.clock = 0; st.faces.push(pick(P, Math.random())); st.born = t;
      if (st.faces.length > 420) st.faces = st.faces.slice(-220);
    }
    var n = st.faces.length, vals = st.faces.map(function (f) { return Math.log2(P[f] / Q[f]); });
    var avg = [], sum = 0;
    vals.forEach(function (v, i) { sum += v; avg.push(sum / (i + 1)); });
    var D = KL(P, Q);

    ctx.clearRect(0, 0, W, H);
    var g = Math.max(18, Math.min(64, W * .045)), narrow = W < 700;
    var cy0 = W < 520 ? 116 : narrow ? 76 : 84, cy1 = H * (narrow ? .5 : .54);   // 窄屏的图注读数折成两行
    // 纵轴跟着六个点数的证据取值走（含 0 与 D），平滑过渡，免得指针一动整张图跳
    var lr = P.map(function (x, i) { return Math.log2(x / Q[i]); });
    var lo = Math.min.apply(null, lr.concat([0])), hi = Math.max.apply(null, lr.concat([D])), padY = (hi - lo) * .12 + .05;
    if (st.lo == null) { st.lo = lo - padY; st.hi = hi + padY; }
    var f = Math.min(1, dt * 3);
    st.lo += (lo - padY - st.lo) * f; st.hi += (hi + padY - st.hi) * f;
    var LO = st.lo, HI = st.hi, N = Math.max(160, n);
    var X = function (i) { return g + (W - 2 * g) * i / N; }, Y = function (v) { return cy1 - (cy1 - cy0) * (v - LO) / (HI - LO); };
    // 零线与 D 线
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,20,19,.25)';
    ctx.beginPath(); ctx.moveTo(g, Y(0)); ctx.lineTo(W - g, Y(0)); ctx.stroke();
    ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(g, Y(D)); ctx.lineTo(W - g, Y(D)); ctx.stroke(); ctx.restore();
    ctx.font = mono(11); ctx.fillStyle = INK; ctx.textAlign = 'right';
    ctx.fillText('D(p‖q) = ' + D.toFixed(2) + ' bit', W - g, Y(D) - 8);
    ctx.fillStyle = 'rgba(20,20,19,.55)';
    ctx.fillText('0', W - g, Y(0) + 15);
    ctx.textAlign = 'left';
    // 每次投掷的证据
    ctx.fillStyle = 'rgba(20,20,19,.3)';
    vals.forEach(function (v, i) { ctx.fillRect(X(i + 1) - 1.5, Y(v) - 1.5, 3, 3); });
    // 累计平均
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.beginPath();
    avg.forEach(function (a, i) { if (i) ctx.lineTo(X(i + 1), Y(a)); else ctx.moveTo(X(1), Y(a)); });
    ctx.stroke();

    // 骰子带
    var bw = Math.min(W - 2 * g, 760), bx = (W - bw) / 2, col = bw / 6;
    var ds = Math.max(18, Math.min(30, col * .34)), dieY = H - (narrow ? 66 : 108) - ds / 2;
    var barBase = dieY - ds / 2 - 8, barTop = cy1 + (narrow ? 40 : 56), scale = (barBase - barTop) / .8;
    var barW = Math.max(6, Math.min(18, col * .18));
    ctx.font = mono(10.5); ctx.fillStyle = INK; ctx.textAlign = 'left';
    ctx.fillRect(bx, barTop - 20, 8, 8); ctx.fillText('p 真实', bx + 13, barTop - 12);
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.strokeRect(bx + 78.75, barTop - 19.25, 6.5, 6.5); ctx.fillText('q 以为', bx + 91, barTop - 12);
    var age = t - st.born, last = st.faces[n - 1];
    for (var i = 0; i < 6; i++) {
      var cx = bx + col * (i + .5);
      ctx.fillStyle = INK; ctx.fillRect(cx - barW - 2, barBase - P[i] * scale, barW, P[i] * scale);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 2.75, barBase - Q[i] * scale + .75, barW - 1.5, Q[i] * scale - .75);
      var hot = i === last && age < .35;
      drawDie(ctx, cx, dieY, ds, i, hot ? WHITE : INK, hot ? INK : 'rgba(217,119,87,1)');
    }
    // 刚掷出的这一次：白色菱形从骰子飞到曲线头
    if (age >= 0 && age < .35) {
      var k = ease(age / .35), fx = bx + col * (last + .5), fy = dieY - ds;
      R.drawShape(ctx, fx + (X(n) - fx) * k, fy + (Y(avg[n - 1]) - fy) * k, 11, 0, 0, WHITE, false);
    }
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(X(n), Y(avg[n - 1]), 4, 0, 7); ctx.fill();
    if (st.read) st.read.textContent = 'n ' + pad(n % 1000, 3) + ' · Sn/n ' + avg[n - 1].toFixed(2) + ' · q(6) ' + q6.toFixed(2);
  });

  /* ---------- Fig. 01 两条码带 ----------
     按 p 出点，每次的点数同时用两套哈夫曼码写下：上带按 p 设计，下带按 q 设计。1 是实心方块，0 是空心方块；
     刚写下的码字是白色。p、q 取实验台的当前值（window.KL.state，由 kl.js 提供）。 */
  function huffman(w) {
    var nodes = w.map(function (x, i) { return { w: x, s: [i] }; }), len = w.map(function () { return 0; });
    while (nodes.length > 1) {
      nodes.sort(function (a, b) { return a.w - b.w || a.s[0] - b.s[0]; });
      var a = nodes.shift(), b = nodes.shift(), s = a.s.concat(b.s);
      s.forEach(function (j) { len[j]++; });
      nodes.push({ w: a.w + b.w, s: s });
    }
    var order = len.map(function (l, i) { return [l, i]; }).sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    var out = [], code = 0, prev = order[0][0];
    order.forEach(function (li, k) {
      if (k > 0) code = (code + 1) << (li[0] - prev);
      prev = li[0];
      var c = code.toString(2); while (c.length < li[0]) c = '0' + c;
      out[li[1]] = c;
    });
    return out;
  }
  R.cover('kl-tapes', function (ctx, W, H, t, dt, st) {
    var S = window.KL && window.KL.state, P = S ? S.p : LOADED, Q = S ? S.q : UNIFORM;
    var key = P.map(function (x) { return x.toFixed(4); }).join() + '|' + Q.map(function (x) { return x.toFixed(4); }).join();
    if (st.key !== key) {
      st.key = key; st.cp = huffman(P); st.cq = huffman(Q);
      st.rolls = []; st.a = 0; st.b = 0; st.n = 0; st.clock = 0;
      var rnd = seeded(11);
      for (var k = 0; k < 16; k++) addRoll(pick(P, rnd()), -10);
    }
    function addRoll(f, born) {
      st.rolls.push({ f: f, born: born }); st.a += st.cp[f].length; st.b += st.cq[f].length; st.n++;
      if (st.rolls.length > 48) st.rolls.shift();
    }
    st.clock += dt;
    if (st.clock > .6) { st.clock = 0; addRoll(pick(P, Math.random()), t); }

    ctx.clearRect(0, 0, W, H);
    var g = Math.max(14, Math.min(28, W * .03)), narrow = W < 560;
    var s = Math.max(7, Math.min(13, W / 64)), step = s + 2, gap = s;
    var rowA = H * (narrow ? .42 : .43), rowB = rowA + Math.max(52, H * .2);
    // 读数
    ctx.font = mono(narrow ? 10 : 11); ctx.fillStyle = INK;
    var ra = st.a / st.n, rb = st.b / st.n, line1 = '按 p 码 ' + ra.toFixed(2) + ' · 按 q 码 ' + rb.toFixed(2) + ' bit/次';
    if (narrow) { ctx.textAlign = 'left'; ctx.fillText(line1, g, 44); } else { ctx.textAlign = 'right'; ctx.fillText(line1, W - g, 22); }
    ctx.textAlign = 'left';
    ctx.fillText('n ' + pad(st.n % 1000, 3) + ' · 多花 ' + (rb - ra >= 0 ? '+' : '') + (rb - ra).toFixed(2) + ' bit/次 · D(p‖q) ' + KL(P, Q).toFixed(2), g, H - 18);
    // 带名
    ctx.font = sans(narrow ? 12 : 13);
    ctx.fillText('按 p 设计的码', g, rowA - s / 2 - 22);
    ctx.fillText('按 q 设计的码', g, rowB - s / 2 - 22);
    // 码带：最新的一列在右端，从右往左排；新列滑入
    var newest = st.rolls[st.rolls.length - 1], age = t - newest.born;
    var slide = age < .3 ? (1 - ease(age / .3)) : 0;
    var widthOf = function (r) { return Math.max(st.cp[r.f].length, st.cq[r.f].length) * step + gap; };
    var x = W - g + slide * widthOf(newest);
    ctx.lineWidth = 1.5;
    for (var i = st.rolls.length - 1; i >= 0 && x > g; i--) {
      var r = st.rolls[i], w = widthOf(r), x0 = x - w + gap / 2, hot = i === st.rolls.length - 1 && age < .5;
      var color = hot ? WHITE : INK;
      [[st.cp[r.f], rowA], [st.cq[r.f], rowB]].forEach(function (cr) {
        for (var j = 0; j < cr[0].length; j++) {
          var bx = x0 + j * step;
          if (bx < g) continue;
          if (cr[0][j] === '1') { ctx.fillStyle = color; ctx.fillRect(bx, cr[1] - s / 2, s, s); }
          else { ctx.strokeStyle = color; ctx.strokeRect(bx + .75, cr[1] - s / 2 + .75, s - 1.5, s - 1.5); }
        }
      });
      if (x0 >= g) {
        ctx.font = mono(10); ctx.fillStyle = hot ? WHITE : 'rgba(20,20,19,.6)';
        ctx.fillText(String(r.f + 1), x0, rowA - s / 2 - 6);
      }
      x -= w;
    }
  });
})();
