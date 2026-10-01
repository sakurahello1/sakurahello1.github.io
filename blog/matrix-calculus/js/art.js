/* 矩阵微分 · 代码绘制的图版
   依赖 ../../assets/js/site.js 暴露的 window.Reel。图版是正文讲的那件事本身，数字由绘制函数当场算出。
   约定同示范页：陶土橙底，墨色为主形，白色只给此刻正在走的那个点，淡墨画等高线，等宽小字做读数。 */
(function () {
  'use strict';
  var R = window.Reel;
  if (!R) return;
  var INK = R.INK, WHITE = R.WHITE;
  var mono = function (px) { return '500 ' + px + 'px "JetBrains Mono", ui-monospace, monospace'; };
  var sans = function (px) { return '500 ' + px + 'px "Noto Sans SC", sans-serif'; };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  // 小标签：以 (x,y) 为锚点，偏移 (ox,oy)，垫一块陶土橙底；不越出画布左右边缘
  function tag(ctx, txt, x, y, ox, oy, W) {
    var w = ctx.measureText(txt).width, lx = x + ox, ly = y + oy;
    var left = clamp(ox > 3 ? lx : ox < -3 ? lx - w : lx - w / 2, 8, W - 8 - w);
    ctx.fillStyle = R.CLAY; ctx.fillRect(left - 3, ly - 8, w + 6, 16);
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, left, ly + 1); ctx.textBaseline = 'alphabetic';
  }

  /* ---------- Fig. 00 首屏：负梯度走锯齿，牛顿方向一步到位 ----------
     f(x) = ½(x−x*)ᵀA(x−x*)，A = R(α)·diag(κ,1)·R(α)ᵀ，最小点 x* 在画面中心，主轴缓缓转动。
     每 6 秒一轮：白点从起点出发做梯度下降（步长 1.6/κ，路径留成墨色折线），空心圆沿 −A⁻¹∇f 一步跳到最小点（虚线）。
     折线是“当前这个 A 下”的真实迭代序列，由闭式解当场算出，所以拖动指针改 κ，路径会立刻跟着变。
     指针的横坐标就是 κ（2 到 16，取对数），指针停 4 秒后改为在 3 与 14 之间缓慢来回。 */
  var CYCLE = 6, PHASE0 = 4.8;              // t = 6 s 的静帧落在“全部走完”的保持段（u = 4.8）
  // 每轮的起点：极坐标（距离，与主轴 e₁ 的夹角），以这一轮开始时的主轴方向为基准；夹角挑在让折线有明显锯齿的范围
  var STARTS = [[3.2, 74], [3.2, 254], [3.2, 134], [3.2, 314]];
  var ROT = 0.08, STEP = 1.6, RATE = 7;                 // 步长 = 1.6/κ；白点每秒走 7 步
  var T0 = 0.5, T_END = 5.4;                // 起跑时刻、淡出开始的时刻（秒）

  R.cover('mc-field', function (ctx, W, H, t, dt, st) {
    var host = ctx.canvas.parentElement;
    if (!st.bound) {
      st.bound = true;
      host.addEventListener('pointermove', function (e) { var b = host.getBoundingClientRect(); st.px = e.clientX - b.left; st.lastMove = performance.now(); });
      host.addEventListener('pointerleave', function () { st.lastMove = 0; });
      st.read = host.querySelector('[data-read]');
    }
    var narrow = W < 700;

    // 条件数：指针控制，闲置时慢慢摆动；在对数坐标里缓动
    var user = st.lastMove && performance.now() - st.lastMove < 4000;
    var target = user ? Math.log(2) + Math.log(8) * clamp(st.px / W, 0, 1) : 1.87 + 0.77 * Math.sin(t * 0.25);
    st.lk = st.lk == null || dt === 0 ? target : st.lk + (target - st.lk) * Math.min(1, dt * 4);   // dt = 0 是缩放重画或静帧：直接取目标值
    var kappa = Math.exp(st.lk);

    var alpha = 0.4 + ROT * t, cs = Math.cos(alpha), sn = Math.sin(alpha);
    var a11 = kappa * cs * cs + sn * sn, a12 = (kappa - 1) * cs * sn, a22 = kappa * sn * sn + cs * cs;

    // 版心：上面让给图注（窄屏图注折成两行），下面让给提示语
    var topM = narrow ? 100 : 66, botM = narrow ? 58 : 90;
    var cx = W / 2, cy = topM + (H - topM - botM) / 2, s = Math.min(W, H) * (narrow ? 0.095 : 0.115);
    var SX = function (x) { return cx + x * s; }, SY = function (y) { return cy + y * s; };

    // 时间轴
    var phase = t + PHASE0, cycle = Math.floor(phase / CYCLE), u = phase - cycle * CYCLE;
    var ac = 0.4 + ROT * (cycle * CYCLE - PHASE0), pol = STARTS[cycle % STARTS.length], ang = ac + pol[1] * Math.PI / 180;
    var S0 = [pol[0] * Math.cos(ang) * (narrow ? 1 : clamp(W / H * 0.7, 1, 1.5)), pol[0] * Math.sin(ang)];   // 宽屏把起点往两侧推
    var fade = Math.min(1, u / 0.3) * (u > T_END ? 1 - (u - T_END) / (CYCLE - T_END) : 1);

    // 梯度下降的闭式迭代：本征基 e1 = (cosα, sinα)（特征值 κ）、e2 = (−sinα, cosα)（特征值 1）
    var c1 = S0[0] * cs + S0[1] * sn, c2 = -S0[0] * sn + S0[1] * cs;
    var m1 = 1 - STEP, m2 = 1 - STEP / kappa;
    var pts = [], d0 = Math.hypot(S0[0], S0[1]), N = 0, k;
    for (k = 0; k <= 60; k++) {
      var q1 = c1 * Math.pow(m1, k), q2 = c2 * Math.pow(m2, k);
      pts.push([q1 * cs - q2 * sn, q1 * sn + q2 * cs]);
      if (Math.hypot(q1, q2) <= 0.05 * d0) { N = k; break; }
      N = k;
    }
    var dur = Math.min(T_END - T0 - 0.8, N / RATE);
    var pos = clamp((u - T0) / dur, 0, 1) * N, k0 = Math.floor(pos), fr = pos - k0;
    var gd = pts[k0], nx = pts[Math.min(k0 + 1, N)];
    var gx = gd[0] + (nx[0] - gd[0]) * fr, gy = gd[1] + (nx[1] - gd[1]) * fr;
    var nu = ease(clamp((u - T0) / 0.45, 0, 1));
    var nxp = S0[0] * (1 - nu), nyp = S0[1] * (1 - nu);

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';

    // 等高线：同心椭圆，长半轴等距，短半轴 = 长半轴/√κ
    var diag = Math.hypot(W, H) * 0.55 / s, dr = narrow ? 0.7 : 0.55, M = Math.ceil(diag / dr);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,20,19,.26)';
    for (var i = 1; i <= M; i++) {
      ctx.beginPath(); ctx.ellipse(cx, cy, i * dr * s / Math.sqrt(kappa), i * dr * s, alpha, 0, 7); ctx.stroke();
    }
    // 两条主轴
    ctx.save(); ctx.setLineDash([2, 6]); ctx.strokeStyle = 'rgba(20,20,19,.3)';
    var far = Math.hypot(W, H);
    ctx.beginPath(); ctx.moveTo(cx - cs * far, cy - sn * far); ctx.lineTo(cx + cs * far, cy + sn * far);
    ctx.moveTo(cx + sn * far, cy - cs * far); ctx.lineTo(cx - sn * far, cy + cs * far); ctx.stroke(); ctx.restore();

    ctx.save(); ctx.globalAlpha = fade;
    // 白点此刻所在的那条等高线
    var qv = 0.5 * (gx * (a11 * gx + a12 * gy) + gy * (a12 * gx + a22 * gy)), rr = Math.sqrt(2 * qv);
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(20,20,19,.6)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rr * s / Math.sqrt(kappa), rr * s, alpha, 0, 7); ctx.stroke();
    // 牛顿：起点到最小点的虚线
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(SX(S0[0]), SY(S0[1])); ctx.lineTo(SX(nxp), SY(nyp)); ctx.stroke(); ctx.restore();
    // 梯度下降：已走过的折线与每一步的落点
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(SX(pts[0][0]), SY(pts[0][1]));
    for (k = 1; k <= k0; k++) ctx.lineTo(SX(pts[k][0]), SY(pts[k][1]));
    ctx.lineTo(SX(gx), SY(gy)); ctx.stroke();
    ctx.fillStyle = INK;
    for (k = 1; k <= k0; k++) { ctx.beginPath(); ctx.arc(SX(pts[k][0]), SY(pts[k][1]), 2.2, 0, 7); ctx.fill(); }
    ctx.restore();

    // 最小点：十字
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
    // 起点：墨色菱形
    var sx0 = SX(S0[0]), sy0 = SY(S0[1]);
    ctx.save(); ctx.globalAlpha = fade;
    R.drawShape(ctx, sx0, sy0, 12, 0, 0, INK, false);
    // 牛顿的空心圆与梯度下降的白点
    var rx = SX(nxp), ry = SY(nyp), wx = SX(gx), wy = SY(gy);
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(rx, ry, 8.5, 0, 7); ctx.stroke();
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(wx, wy, 5.5, 0, 7); ctx.fill();
    // 标签垫一块陶土橙底，盖住身后的线。起点的标签朝外，牛顿的朝最小点的另一侧，GD 的在侧面
    var d = Math.hypot(S0[0], S0[1]), ox = S0[0] / d, oy = S0[1] / d;
    ctx.font = mono(10.5); tag(ctx, 'x₀', sx0, sy0, ox * 17, oy * 17, W);
    tag(ctx, 'GD', wx, wy, -oy * 19, ox * 19, W);
    ctx.font = sans(11.5); tag(ctx, '牛顿', rx, ry, -ox * 22, -oy * 22, W);
    ctx.restore();

    if (st.read) {
      var txt = 'κ ' + kappa.toFixed(1) + ' · GD ' + Math.min(k0, N) + ' 步 · 牛顿 ' + (nu >= 1 ? 1 : 0) + ' 步';
      if (txt !== st.txt) { st.txt = txt; st.read.textContent = txt; }
    }
  });
})();
