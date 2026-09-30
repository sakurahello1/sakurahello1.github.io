/* 项目详情页图示：矩阵加一维、流程高亮、首轮结果、Pi Lab 开关、SWE-bench Pro 花费与通过 */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var INK = '#141413', CLAY = '#D97757', PAPER = '#F5F2EB', MUTE = '#7A776F';
  var MONO = '"JetBrains Mono", ui-monospace, monospace', COND = '"Barlow Condensed", "Bahnschrift", sans-serif';

  // 首轮实测（HarnessRouter PR #231 · docs/benchmark.md）
  var RUNS = [
    { h: 'pi', pass: 40, n: 47, med: 48, total: 3605 },
    { h: 'opencode', pass: 39, n: 48, med: 75, total: 5515 },
    { h: 'dsh', pass: 36, n: 46, med: 100, total: 6506 },
    { h: 'cline', pass: 36, n: 47, med: 108, total: 6882 }
  ];

  // SWE-bench Pro 22 题，deepseek-v4.1-flash，隔离后的第三轮；cost 为每次运行的平均花费（元，闲时价）
  var PRO = [
    { h: 'Claude Code', pass: 13, cost: 0.24 },
    { h: 'Codex', pass: 14, cost: 0.32 },
    { h: 'pi', pass: 13, cost: 0.36 },
    { h: 'Pi Lab', pass: 12, cost: 0.37 },
    { h: 'dsh', pass: 15, cost: 0.45 }
  ];

  function onVisible(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.25 });
    io.observe(el);
  }
  function sizeCanvas(cv, ratio) {
    var dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = Math.round(W * ratio);
    cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: W, H: H };
  }
  function ease(k) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3); }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function animate(cv, ratio, draw, dur) {
    var t0 = 0, raf = 0;
    function frame(now) {
      if (!t0) t0 = now; var s = sizeCanvas(cv, ratio), k = reduced ? 99 : (now - t0) / 1000;
      draw(s.ctx, s.W, s.H, k); if (k < dur) raf = requestAnimationFrame(frame);
    }
    function play() { cancelAnimationFrame(raf); t0 = 0; raf = requestAnimationFrame(frame); }
    var s = sizeCanvas(cv, ratio); draw(s.ctx, s.W, s.H, 0);
    onVisible(cv, play);
    cv.addEventListener('click', play);
    var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var s2 = sizeCanvas(cv, ratio); draw(s2.ctx, s2.W, s2.H, 99); }, 150); });
  }

  /* 1. 矩阵旁边加一维 */
  $$('canvas[data-fig="matrix"]').forEach(function (cv) {
    animate(cv, 0.46, function (ctx, W, H, k) {
      ctx.clearRect(0, 0, W, H);
      var pad = W * 0.05, top = H * 0.22, rows = RUNS.length, rh = (H - top - H * 0.14) / rows;
      var mx = pad + W * 0.1, cols = 6, cw = W * 0.052;
      ctx.font = '500 ' + Math.max(10, W * 0.013) + 'px ' + MONO; ctx.textBaseline = 'middle';
      ctx.fillStyle = MUTE; ctx.textAlign = 'left';
      ctx.fillText('SUPPORT MATRIX · 能不能跑', mx, top - H * 0.09);
      RUNS.forEach(function (r, i) {
        var y = top + i * rh + rh / 2;
        ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.fillText(r.h, mx - 12, y);
        for (var c = 0; c < cols; c++) {
          var a = ease((k - (i * cols + c) * 0.03) / 0.3), x = mx + c * cw;
          ctx.globalAlpha = a; rr(ctx, x + 3, y - rh * 0.32, cw - 6, rh * 0.64, 5); ctx.fillStyle = INK; ctx.fill();
          ctx.strokeStyle = PAPER; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(x + cw * 0.3, y); ctx.lineTo(x + cw * 0.45, y + rh * 0.12); ctx.lineTo(x + cw * 0.7, y - rh * 0.14); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
      // 新增的一维
      var sx = mx + cols * cw + W * 0.05, slide = ease((k - 1.1) / 0.8), bw = (W - pad - sx) * slide;
      if (slide > 0) {
        ctx.fillStyle = CLAY; rr(ctx, sx - 10, top - H * 0.04, bw + 10, rows * rh + H * 0.08, 12); ctx.fill();
        ctx.fillStyle = MUTE; ctx.textAlign = 'left'; ctx.fillText('+ BENCHMARK · 同样的工作做得怎样', sx, top - H * 0.09);
        RUNS.forEach(function (r, i) {
          var y = top + i * rh + rh / 2, g = ease((k - 1.7 - i * 0.12) / 0.9), pct = r.pass / r.n;
          var inner = bw - 20, barW = inner * 0.62 * pct * g;
          ctx.fillStyle = 'rgba(20,20,19,.16)'; rr(ctx, sx + 6, y - rh * 0.2, inner * 0.62, rh * 0.4, 5); ctx.fill();
          ctx.fillStyle = INK; rr(ctx, sx + 6, y - rh * 0.2, barW, rh * 0.4, 5); ctx.fill();
          if (g > 0.05 && inner > 120) {
            ctx.fillStyle = INK; ctx.textAlign = 'left';
            ctx.fillText(Math.round(pct * 100 * g) + '% · ' + r.pass + '/' + r.n, sx + 14 + inner * 0.62, y);
          }
        });
      }
      ctx.fillStyle = MUTE; ctx.textAlign = 'left';
      ctx.fillText('harness × model × task pack', pad, H - H * 0.06);
    }, 4);
  });

  /* 2. 流程高亮 */
  $$('.pipeline').forEach(function (ol) {
    var items = $$('li', ol), i = -1, timer = 0;
    function step() { items.forEach(function (li, j) { li.classList.toggle('on', j === i); }); i = (i + 1) % (items.length + 1); }
    if (reduced) return;
    onVisible(ol, function () { step(); timer = setInterval(step, 1100); });
  });

  /* 3. 首轮结果：完成率条 + 中位耗时点 */
  $$('canvas[data-fig="results"]').forEach(function (cv) {
    animate(cv, 0.5, function (ctx, W, H, k) {
      ctx.clearRect(0, 0, W, H);
      var left = W * 0.14, right = W * 0.94, mid = W * 0.56, top = H * 0.2, rh = (H - top - H * 0.14) / RUNS.length;
      ctx.font = '500 ' + Math.max(10, W * 0.014) + 'px ' + MONO; ctx.textBaseline = 'middle';
      ctx.fillStyle = MUTE; ctx.textAlign = 'left';
      ctx.fillText('完成率（计分题）', left, top - H * 0.08); ctx.fillText('中位耗时 · 秒', mid + W * 0.04, top - H * 0.08);
      var maxMed = 120;
      RUNS.forEach(function (r, i) {
        var y = top + i * rh + rh / 2, g = ease((k - i * 0.15) / 1.1), pct = r.pass / r.n;
        ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.fillText(r.h, left - 12, y);
        var len = (mid - left) * 0.9;
        ctx.fillStyle = 'rgba(20,20,19,.1)'; rr(ctx, left, y - rh * 0.22, len, rh * 0.44, 6); ctx.fill();
        ctx.fillStyle = i === 0 ? CLAY : INK; rr(ctx, left, y - rh * 0.22, len * pct * g, rh * 0.44, 6); ctx.fill();
        ctx.fillStyle = i === 0 ? INK : PAPER; ctx.textAlign = 'left';
        if (g > 0.3) ctx.fillText(Math.round(pct * 100) + '%', left + 10, y);
        var x0 = mid + W * 0.04, span = right - x0, px = x0 + span * (r.med / maxMed) * g;
        ctx.strokeStyle = 'rgba(20,20,19,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, y, Math.max(4, rh * 0.12), 0, 7); ctx.fill();
        if (g > 0.5) { ctx.textAlign = 'left'; ctx.fillText(r.med + 's', px + 10, y - rh * 0.26); }
      });
      var x0b = mid + W * 0.04;
      ctx.fillStyle = MUTE; ctx.textAlign = 'center';
      [0, 60, 120].forEach(function (v) { ctx.fillText(String(v), x0b + (right - x0b) * v / maxMed, H - H * 0.06); });
    }, 3);
  });

  /* 4. SWE-bench Pro：每次花费 × 通过题数 */
  $$('canvas[data-fig="cost"]').forEach(function (cv) {
    animate(cv, 0.5, function (ctx, W, H, k) {
      ctx.clearRect(0, 0, W, H);
      var fs = Math.max(10, W * 0.014), left = W * 0.12, right = W * 0.92, top = H * 0.14, bottom = H * 0.8;
      var c0 = 0.2, c1 = 0.5, p0 = 11, p1 = 16;
      var X = function (c) { return left + (right - left) * (c - c0) / (c1 - c0); };
      var Y = function (p) { return bottom - (bottom - top) * (p - p0) / (p1 - p0); };
      ctx.font = '500 ' + fs + 'px ' + MONO; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(20,20,19,.12)'; ctx.lineWidth = 1; ctx.fillStyle = MUTE;
      for (var p = 12; p <= 15; p++) {
        ctx.beginPath(); ctx.moveTo(left, Y(p)); ctx.lineTo(right, Y(p)); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(p + '/22', left - 10, Y(p));
      }
      ctx.textAlign = 'center';
      [0.2, 0.3, 0.4, 0.5].forEach(function (c) { ctx.fillText(c.toFixed(1), X(c), bottom + H * 0.07); });
      ctx.textAlign = 'left'; ctx.fillText('通过题数', left - W * 0.07, top - H * 0.07);
      ctx.textAlign = 'right'; ctx.fillText('每次运行花费 · 元', right, H - H * 0.04);
      // 最省与最贵之间的跨度
      var span = ease((k - 1.6) / 0.8);
      if (span > 0) {
        var yb = bottom - H * 0.05, xa = X(0.24), xb = X(0.24) + (X(0.45) - X(0.24)) * span;
        ctx.strokeStyle = CLAY; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xa, yb); ctx.lineTo(xb, yb); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xa, yb - 5); ctx.lineTo(xa, yb + 5); ctx.moveTo(xb, yb - 5); ctx.lineTo(xb, yb + 5); ctx.stroke();
        if (span > 0.9) { ctx.fillStyle = CLAY; ctx.textAlign = 'center'; ctx.fillText('× 1.9', (xa + xb) / 2, yb - H * 0.04); }
      }
      PRO.forEach(function (r, i) {
        var g = ease((k - i * 0.18) / 0.7), x = X(r.cost), y = Y(r.pass), rad = Math.max(5, W * 0.009) * g;
        if (g <= 0) return;
        ctx.globalAlpha = g;
        ctx.fillStyle = r.h === 'Pi Lab' ? CLAY : INK; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
        // Claude Code 与 pi 同在 13/22，标签分放点的下方和上方
        var below = r.h === 'Claude Code', above = r.h === 'pi', lx = x + rad + 8, ly = y;
        if (below || above) { lx = x; ly = y + (below ? 1 : -1) * (rad + fs); }
        ctx.fillStyle = INK; ctx.textAlign = below || above ? 'center' : 'left';
        ctx.fillText(r.h + ' · ' + r.cost.toFixed(2), lx, ly);
        ctx.globalAlpha = 1;
      });
    }, 3);
  });

  /* 5. Pi Lab：一次只打开一个机制 */
  $$('.lab').forEach(function (lab) {
    var sw = $$('.switch', lab), chips = $('.chips', lab), verdict = $('.verdict', lab);
    function render() {
      var on = sw.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; });
      chips.innerHTML = '<span class="chip">pi</span>' + on.map(function (b) { return '<span class="chip on">+ ' + b.dataset.key + '</span>'; }).join('');
      verdict.textContent = on.length
        ? '实验组只比对照组多了“' + on[0].querySelector('b').textContent + '”。其余条件（模型、任务、预算、连接）保持不变，差异就可以归到这一个机制上。开关已在 PR #318 里实现，逐个机制的实验还没做。'
        : '先选一个机制。对照组始终是原版 pi，实验组只多打开这一个开关。';
    }
    sw.forEach(function (b) {
      b.addEventListener('click', function () {
        var was = b.getAttribute('aria-pressed') === 'true';
        sw.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', was ? 'false' : 'true');
        render();
      });
    });
    render();
  });
})();
