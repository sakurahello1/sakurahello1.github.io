/* 从策略梯度到 GRPO · 代码绘制的图版
   依赖 ../../assets/js/site.js 暴露的 window.Reel（stage / shapePath / drawShape / cover）。
   每张图都是一个小的真实过程，不是装饰：数字由绘制函数当场算出。
   约定：陶土橙或墨色底；墨色为主形，白色只给“此刻被采样/被选中”的东西；等宽小字做读数。 */
(function () {
  'use strict';
  var R = window.Reel;
  if (!R) return;
  var INK = R.INK, CLAY = R.CLAY, WHITE = R.WHITE;
  var mono = function (px) { return '500 ' + px + 'px "JetBrains Mono", ui-monospace, monospace'; };
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pad(n, k) { n = String(n); while (n.length < k) n = '0' + n; return n; }
  function softmax(z) { var m = Math.max.apply(null, z), e = z.map(function (v) { return Math.exp(v - m); }), s = e.reduce(function (a, b) { return a + b; }, 0); return e.map(function (v) { return v / s; }); }
  function pick(p) { var u = Math.random(), c = 0; for (var i = 0; i < p.length; i++) { c += p[i]; if (u <= c) return i; } return p.length - 1; }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  /* ---------- Fig. 00 首屏：二维动作网格上的策略 ----------
     每格是一个动作，形状大小 = π_θ(a)。每 0.5 s 采样 8 个动作（白色十字 = 优势为正，墨色圈 = 为负），
     按组内标准化的优势把均值往好的方向推，但一步不超过虚线圈（信赖域半径 δ）。指针所在处就是奖励峰。 */
  R.cover('rl-policy', function (ctx, W, H, t, dt, st) {
    var host = ctx.canvas.parentElement;
    if (!st.bound) {
      st.bound = true;
      host.addEventListener('pointermove', function (e) { var b = host.getBoundingClientRect(); st.px = e.clientX - b.left; st.py = e.clientY - b.top; st.lastMove = performance.now(); });
      host.addEventListener('pointerleave', function () { st.lastMove = 0; });
      st.read = host.querySelector('[data-read]');
    }
    var cs = Math.max(22, Math.min(36, W / 40)), cols = Math.ceil(W / cs) + 1, rows = Math.ceil(H / cs) + 1;
    if (st.cols !== cols || st.rows !== rows) {
      st.cols = cols; st.rows = rows;
      st.mu = [cols * 0.18, rows * 0.72]; st.show = st.mu.slice(); st.prev = st.mu.slice();
      st.sig = 4.2; st.sigShow = 4.2; st.samples = []; st.clock = 0; st.step = 0; st.rbar = 0;
    }
    // 奖励：主峰 P（跟指针或自动漂移）+ 一个较低的局部峰 Q
    var user = st.lastMove && performance.now() - st.lastMove < 4000;
    var P = user ? [st.px / cs, st.py / cs] : [cols * (0.62 + 0.26 * Math.sin(t * 0.07)), rows * (0.46 + 0.26 * Math.sin(t * 0.11 + 1.3))];
    var Q = [cols - P[0] * 0.8, rows * 0.3 + (rows - P[1]) * 0.4];
    var wp = 3.4, wq = 4.2;
    function reward(x, y) {
      var dp = (x - P[0]) * (x - P[0]) + (y - P[1]) * (y - P[1]), dq = (x - Q[0]) * (x - Q[0]) + (y - Q[1]) * (y - Q[1]);
      return Math.exp(-dp / (2 * wp * wp)) + 0.5 * Math.exp(-dq / (2 * wq * wq));
    }
    // 一次更新（组内比较 + 信赖域截断）
    var DELTA = 1.9, G = 8;
    st.clock += dt;
    if (st.clock > 0.5 || !st.samples.length) {
      st.clock = 0; st.step++;
      var batch = [];
      for (var i = 0; i < G; i++) {
        var x = Math.max(0, Math.min(cols - 1, st.mu[0] + gauss() * st.sig)), y = Math.max(0, Math.min(rows - 1, st.mu[1] + gauss() * st.sig));
        batch.push({ x: Math.round(x), y: Math.round(y), r: reward(Math.round(x), Math.round(y)), born: t });
      }
      var mean = batch.reduce(function (a, b) { return a + b.r; }, 0) / G;
      var sd = Math.sqrt(batch.reduce(function (a, b) { return a + (b.r - mean) * (b.r - mean); }, 0) / G) + 1e-6;
      var g = [0, 0];
      batch.forEach(function (b) { b.adv = (b.r - mean) / sd; g[0] += b.adv * (b.x - st.mu[0]) / G; g[1] += b.adv * (b.y - st.mu[1]) / G; });
      var len = Math.hypot(g[0], g[1]), k = len > DELTA ? DELTA / len : 1;
      st.prev = st.mu.slice(); st.clipped = len > DELTA;
      st.mu = [st.mu[0] + g[0] * k, st.mu[1] + g[1] * k];
      st.rbar = st.rbar * 0.7 + mean * 0.3;
      st.sig += ((1.5 + 3.2 * (1 - Math.min(1, st.rbar))) - st.sig) * 0.35;
      st.samples = batch;
      if (st.read) st.read.textContent = 'STEP ' + pad(st.step % 1000, 3) + ' · R̄ ' + st.rbar.toFixed(2) + ' · σ ' + st.sig.toFixed(1) + (st.clipped ? ' · CLIPPED AT δ' : ' · INSIDE δ');
    }
    var f = Math.min(1, dt * 5);
    st.show[0] += (st.mu[0] - st.show[0]) * f; st.show[1] += (st.mu[1] - st.show[1]) * f; st.sigShow += (st.sig - st.sigShow) * f;

    ctx.clearRect(0, 0, W, H);
    // 奖励等高线
    ctx.save(); ctx.setLineDash([2, 6]); ctx.lineWidth = 1.2;
    [[P, wp, 0.3], [Q, wq, 0.16]].forEach(function (pk) {
      [0.8, 0.5, 0.2].forEach(function (lv) {
        var r = pk[1] * Math.sqrt(-2 * Math.log(lv)) * cs;
        ctx.strokeStyle = 'rgba(20,20,19,' + pk[2] + ')'; ctx.beginPath(); ctx.arc(pk[0][0] * cs, pk[0][1] * cs, r, 0, 7); ctx.stroke();
      });
    });
    ctx.restore();
    // 概率质量：每格一个形状
    var s2 = 2 * st.sigShow * st.sigShow;
    for (var r0 = 0; r0 < rows; r0++) for (var c0 = 0; c0 < cols; c0++) {
      var dx = c0 - st.show[0], dy = r0 - st.show[1], p = Math.exp(-(dx * dx + dy * dy) / s2);
      var m = Math.min(2, p * 2.6), size = cs * (0.16 + 0.78 * p);
      R.drawShape(ctx, c0 * cs, r0 * cs, size, m, 0, INK, p > 0.55);
    }
    // 信赖域：本步均值最多移动 δ
    var mx = st.show[0] * cs, my = st.show[1] * cs;
    ctx.save(); ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 18; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(st.prev[0] * cs, st.prev[1] * cs, DELTA * cs, 0, 7); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(st.prev[0] * cs, st.prev[1] * cs); ctx.lineTo(mx, my); ctx.stroke();
    // 本组样本
    st.samples.forEach(function (b) {
      var age = (t - b.born) / 0.5; if (age > 1) return;
      var a = 1 - age * 0.6;
      if (b.adv > 0) R.drawShape(ctx, b.x * cs, b.y * cs, cs * 0.92 * a, 3, 0, WHITE, false);
      else { ctx.strokeStyle = 'rgba(20,20,19,' + (0.8 * a) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x * cs, b.y * cs, cs * 0.36, 0, 7); ctx.stroke(); }
    });
    // 奖励峰标记
    ctx.save(); ctx.translate(P[0] * cs, P[1] * cs); ctx.rotate(Math.PI / 4); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
    var flip = P[0] * cs > W - 120;
    ctx.fillStyle = INK; ctx.font = mono(10); ctx.textAlign = flip ? 'right' : 'left'; ctx.fillText('REWARD PEAK', P[0] * cs + (flip ? -14 : 14), P[1] * cs - 10); ctx.textAlign = 'left';
  });

  /* ---------- Fig. I 第一部分扉页：岔路上的概率（REINFORCE） ----------
     两层岔路、九个终点。线宽 = 该分支被选中的概率。每一局沿当前策略走到一个终点，拿到回报 G，
     与滑动平均基线 b 比较：G > b 就把走过的每个分支调粗，反之调细。几十局之后，粗线会汇到回报最高的终点。 */
  R.cover('rl-fork', function (ctx, W, H, t, dt, st) {
    if (!st.init || st.W !== W || st.H !== H) {
      st.init = true; st.W = W; st.H = H;
      st.reset = function () {
        st.th0 = [0, 0, 0]; st.th1 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        var base = [0.1, 0.35, 0.05, 0.25, 1.0, 0.45, 0.0, 0.6, 0.2], rot = Math.floor(Math.random() * 3) * 3;
        st.rew = base.map(function (_, i) { return base[(i + rot) % 9]; });
        st.b = 0.3; st.ep = 0; st.path = null; st.hold = 0;
        st.w0 = [1 / 3, 1 / 3, 1 / 3]; st.w1 = [[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]];
      };
      st.reset();
    }
    var top = H * 0.2, bandH = H * 0.5;            // 上方留给标题与读数，下方留给大字 PART I
    var root = [W * 0.08, top + bandH * 0.5];
    var L1 = [0, 1, 2].map(function (i) { return [W * 0.4, top + bandH * (0.1 + i * 0.4)]; });
    var L2 = []; for (var i = 0; i < 9; i++) L2.push([W * 0.74, top + bandH * i / 8]);
    var p0 = softmax(st.th0), p1 = st.th1.map(softmax);

    // 新的一局
    if (!st.path) {
      var a = pick(p0), b2 = pick(p1[a]);
      st.path = { a: a, b: b2, leaf: a * 3 + b2, k: 0 };
    }
    var P0 = st.path;
    P0.k += dt / 1.25;
    if (P0.k >= 1 && !P0.done) {
      P0.done = true; st.ep++;
      var G = st.rew[P0.leaf], A = G - st.b, lr = 2.2;
      for (var j = 0; j < 3; j++) { st.th0[j] += lr * A * ((j === P0.a ? 1 : 0) - p0[j]); st.th1[P0.a][j] += lr * A * ((j === P0.b ? 1 : 0) - p1[P0.a][j]); }
      st.b = st.b * 0.85 + G * 0.15;
      st.last = { G: G, A: A };
      if (softmax(st.th0)[Math.floor(st.rew.indexOf(1) / 3)] > 0.93) st.hold += 1;
    }
    if (P0.k >= 1.35) { st.path = null; if (st.hold > 6) st.reset(); }

    // 显示用的概率缓动
    var f = Math.min(1, dt * 4);
    for (var j2 = 0; j2 < 3; j2++) { st.w0[j2] += (p0[j2] - st.w0[j2]) * f; for (var q = 0; q < 3; q++) st.w1[j2][q] += (p1[j2][q] - st.w1[j2][q]) * f; }

    ctx.clearRect(0, 0, W, H);
    var unit = Math.max(1, W / 720);
    function edge(A0, B0, w, hot) {
      ctx.strokeStyle = hot ? WHITE : 'rgba(20,20,19,' + (0.25 + 0.75 * w) + ')';
      ctx.lineWidth = (1 + 13 * w) * unit; ctx.lineCap = 'round';
      var mx = (A0[0] + B0[0]) / 2;
      ctx.beginPath(); ctx.moveTo(A0[0], A0[1]); ctx.bezierCurveTo(mx, A0[1], mx, B0[1], B0[0], B0[1]); ctx.stroke();
    }
    function bez(A0, B0, u) {
      var mx = (A0[0] + B0[0]) / 2, v = 1 - u;
      return [v * v * v * A0[0] + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * B0[0], v * v * v * A0[1] + 3 * v * v * u * A0[1] + 3 * v * u * u * B0[1] + u * u * u * B0[1]];
    }
    for (var a1 = 0; a1 < 3; a1++) {
      edge(root, L1[a1], st.w0[a1], false);
      for (var b1 = 0; b1 < 3; b1++) edge(L1[a1], L2[a1 * 3 + b1], st.w1[a1][b1], false);
    }
    // 本局走过的路
    var k = Math.min(1, P0.k), u1 = ease(Math.min(1, k * 2)), u2 = ease(Math.max(0, k * 2 - 1));
    ctx.save(); ctx.globalAlpha = P0.k > 1 ? Math.max(0, 1 - (P0.k - 1) / 0.35) : 1;
    edge(root, L1[P0.a], 0.08, true); if (k > 0.5) edge(L1[P0.a], L2[P0.leaf], 0.08, true);
    var dot = k < 0.5 ? bez(root, L1[P0.a], u1) : bez(L1[P0.a], L2[P0.leaf], u2);
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(dot[0], dot[1], 6 * unit, 0, 7); ctx.fill();
    ctx.restore();
    // 节点
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(root[0], root[1], 9 * unit, 0, 7); ctx.fill();
    L1.forEach(function (n) { R.drawShape(ctx, n[0], n[1], 16 * unit, 1, 0, INK, false); });
    // 终点：形状大小 = 回报
    L2.forEach(function (n, i) {
      var r = st.rew[i], hit = P0.done && P0.leaf === i && P0.k < 1.35;
      R.drawShape(ctx, n[0] + 22 * unit, n[1], (7 + 18 * r) * unit, 2 * r, 0, hit ? WHITE : INK, false);
      ctx.fillStyle = INK; ctx.font = mono(Math.max(9, 10 * unit)); ctx.textAlign = 'left';
      ctx.fillText('G ' + r.toFixed(2), n[0] + 44 * unit, n[1] + 4);
    });
    // 读数
    ctx.textAlign = 'left'; ctx.font = mono(Math.max(9, 10.5 * unit)); ctx.fillStyle = INK;
    var last = st.last || { G: 0, A: 0 };
    ctx.fillText('EPISODE ' + pad(st.ep, 3) + '   G ' + last.G.toFixed(2) + '   b ' + st.b.toFixed(2) + '   G−b ' + (last.A >= 0 ? '+' : '−') + Math.abs(last.A).toFixed(2), 14, 44);
  });
})();
