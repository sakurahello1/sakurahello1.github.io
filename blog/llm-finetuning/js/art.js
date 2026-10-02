/* 微调理论：欧氏投影与 Fisher 投影。坐标沿屏幕向右、向下。 */
(function () {
  'use strict';
  var R = window.Reel;
  if (!R) return;
  var C = 1.6, BETA = -0.35, PHASE0 = 4.8;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ease(x) { return x * x * (3 - 2 * x); }
  function line(ctx, x, y, xx, yy) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke(); }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  // 在端点周围找空位，连线标明标签归属。
  function tag(ctx, txt, x, y, W, top, bottom, occupied, side) {
    var w = ctx.measureText(txt).width + 10, box, r, j;
    for (r = 24; r <= 144; r += 20) {
      for (j = 0; j < 16; j++) {
        var a = side + j * Math.PI / 8;
        box = { x: clamp(x + r * Math.cos(a) - w / 2, 8, W - w - 8), y: clamp(y + r * Math.sin(a) - 10, top, bottom - 20), w: w, h: 20 };
        if (!occupied.some(function (b) { return overlap(box, b); })) {
          ctx.strokeStyle = R.INK; ctx.lineWidth = 0.7;
          line(ctx, x, y, box.x + w / 2, box.y + 10);
          ctx.fillStyle = R.CLAY; ctx.fillRect(box.x, box.y, w, 20);
          ctx.fillStyle = R.INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, box.x + w / 2, box.y + 10);
          occupied.push({ x: box.x - 4, y: box.y - 4, w: w + 8, h: 28 });
          return;
        }
      }
    }
  }
  function draw(ctx, W, H, t, dt, st) {
    var host = ctx.canvas.parentElement;
    if (!st.bound) {
      st.bound = true; st.read = host.querySelector('[data-read]');
      ctx.canvas.setAttribute('tabindex', '0');
      ctx.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
      function update(q) {
        st.q = clamp(q, 0, 1); st.lastMove = performance.now();
        if (R.reduced) draw(ctx, ctx.canvas.clientWidth, ctx.canvas.clientHeight, 6, 0, st);
      }
      function pointer(e) { var b = host.getBoundingClientRect(); update((e.clientX - b.left) / b.width); }
      host.addEventListener('pointermove', pointer);
      host.addEventListener('pointerdown', pointer);
      ctx.canvas.addEventListener('keydown', function (e) {
        var q = (Math.log(st.kappa) - Math.log(2)) / Math.log(12);
        if (e.key === 'ArrowLeft') q -= 0.04;
        else if (e.key === 'ArrowRight') q += 0.04;
        else if (e.key === 'Home') q = 0;
        else if (e.key === 'End') q = 1;
        else return;
        e.preventDefault(); update(q);
      });
    }
    var user = st.lastMove != null && performance.now() - st.lastMove < 4000;
    // 指针直接映射对数 κ；静态模式不运行闲置漂移。
    var lk = user || (R.reduced && st.q != null) ? Math.log(2) + Math.log(12) * st.q : Math.log(8) + Math.log(2) * Math.sin(t * 0.25);
    var kappa = Math.exp(lk); st.kappa = kappa;
    var alpha = 0.4 + 0.08 * t, cs = Math.cos(alpha), sn = Math.sin(alpha);
    var nx = Math.cos(BETA), ny = Math.sin(BETA), v1 = nx * cs + ny * sn, v2 = -nx * sn + ny * cs;
    var den = v1 * v1 / kappa + v2 * v2;
    var ex = C * nx, ey = C * ny;
    var kx = C * (cs * v1 / kappa - sn * v2) / den, ky = C * (sn * v1 / kappa + cs * v2) / den;
    var le = C * C / 2 * (kappa * v1 * v1 + v2 * v2), kl = C * C / (2 * den);
    var narrow = W < 700, top = narrow ? 100 : 66, bot = narrow ? 58 : 90;
    var cx = W / 2, cy = top + (H - top - bot) / 2;
    // 同比缩放，给最远端点和标签留出空间。
    var s = Math.min((H - top - bot) / 4.8, (W / 2 - 48) / Math.max(2.4, Math.abs(kx)), (H - top - bot - 64) / (2 * Math.max(2.4, Math.abs(ky))));
    var EX = cx + s * ex, EY = cy + s * ey, KX = cx + s * kx, KY = cy + s * ky;
    var u = (t + PHASE0) % 6, p = ease(clamp((u - 0.5) / 2.5, 0, 1));
    var fade = Math.min(1, u / 0.3) * (u > 5.4 ? (6 - u) / 0.6 : 1);
    var gx = cx + s * ex * p, gy = cy + s * ey * p, rx = cx + s * kx * p, ry = cy + s * ky * p;
    ctx.clearRect(0, 0, W, H); ctx.save(); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,20,19,.26)'; ctx.lineWidth = 1;
    var far = Math.hypot(W, H), dr = 0.65, count = Math.ceil(far / s / dr);
    function contour(loss) { var r = Math.sqrt(2 * loss) * s; ctx.beginPath(); ctx.ellipse(cx, cy, r / Math.sqrt(kappa), r, alpha, 0, Math.PI * 2); ctx.stroke(); }
    for (var i = 1; i <= count; i++) contour(i * dr * i * dr / 2);
    ctx.setLineDash([2, 6]);
    line(ctx, cx - cs * far, cy - sn * far, cx + cs * far, cy + sn * far);
    line(ctx, cx + sn * far, cy - cs * far, cx - sn * far, cy + cs * far);
    ctx.strokeStyle = R.INK; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
    line(ctx, EX + ny * far, EY - nx * far, EX - ny * far, EY + nx * far);
    ctx.setLineDash([]);
    ctx.save(); ctx.globalAlpha = fade;
    if (p === 1) { ctx.lineWidth = 1.2; contour(le); contour(kl); }
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); line(ctx, cx, cy, rx, ry); ctx.setLineDash([]);
    line(ctx, cx, cy, gx, gy);
    ctx.fillStyle = R.INK;
    // 对新损失 ½(nᵀθ−c)²，η_j = 1/(12−j) 给出 θ_j = jθ_E/12。
    for (i = 1; i < 12 * p; i++) { ctx.beginPath(); ctx.arc(cx + s * ex * i / 12, cy + s * ey * i / 12, 2, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(rx, ry, 8, 0, 7); ctx.stroke();
    ctx.fillStyle = R.WHITE; ctx.beginPath(); ctx.arc(gx, gy, 5.5, 0, 7); ctx.fill();
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    var occupied = [{ x: cx - 15, y: cy - 15, w: 30, h: 30 }, { x: EX - 12, y: EY - 12, w: 24, h: 24 }, { x: KX - 12, y: KY - 12, w: 24, h: 24 }, { x: gx - 10, y: gy - 10, w: 20, h: 20 }, { x: rx - 12, y: ry - 12, w: 24, h: 24 }];
    tag(ctx, 'GD', EX, EY, W, top, H - bot, occupied, 0);
    tag(ctx, 'KL', KX, KY, W, top, H - bot, occupied, Math.PI);
    ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = R.INK;
    line(ctx, cx - 8, cy, cx + 8, cy); line(ctx, cx, cy - 8, cx, cy + 8);
    ctx.restore();
    if (st.read) {
      var txt = 'ΔLA ' + le.toFixed(2) + ' / ' + kl.toFixed(2);
      if (txt !== st.txt) { st.txt = txt; st.read.textContent = txt; }
    }
  }
  R.cover('ft-field', draw);
})();
