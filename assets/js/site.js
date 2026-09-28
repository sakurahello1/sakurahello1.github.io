/* 吕灏 · 个人主页脚本
   - 大标题：色差残影、字号标注、CAP HEIGHT / BASELINE 参考线、实测宽度尺寸线
   - HUD：章节序号、时间码、进度刻度
   - 几何场：陶土橙底上的形状网格，鼠标附近由菱形依次变成方块、圆、十字
   - 粒子球（论文）与各张封面的生成动画 */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var INK = '#141413', CLAY = '#D97757', CREAM = '#EDE8DE', PAPER = '#F5F2EB', WHITE = '#FAF8F3';

  /* ---------- 导航 ---------- */
  var tog = $('#navtoggle'), links = $('#navlinks');
  if (tog && links) {
    tog.addEventListener('click', function () { var o = links.classList.toggle('open'); tog.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) { links.classList.remove('open'); tog.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- 大标题：残影结构 ---------- */
  $$('.bigtype[data-type]').forEach(function (el) {
    var sr = el.querySelector('.sr-only');
    var label = Array.prototype.filter.call(el.childNodes, function (n) { return !(n.nodeType === 1 && n.classList.contains('sr-only')); })
      .map(function (n) { return n.textContent; }).join('').trim();
    var html = '<span class="word">' +
      '<span class="ghost c2" style="--g:-1" aria-hidden="true">' + label + '</span>' +
      '<span class="ghost" style="--g:2" aria-hidden="true">' + label + '</span>' +
      '<span class="ghost" style="--g:1" aria-hidden="true">' + label + '</span>' +
      '<span class="fill">' + label + '</span></span>';
    el.innerHTML = (sr ? sr.outerHTML : '') + html;
  });

  /* ---------- 显现 ---------- */
  var revealables = $$('.reveal, .bigtype[data-type], .measure');
  if (document.documentElement.classList.contains('js-motion')) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in'); ro.unobserve(e.target);
        if (e.target.classList.contains('measure')) countUp(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    revealables.forEach(function (el) { ro.observe(el); });
    addEventListener('beforeprint', function () { revealables.forEach(function (el) { el.classList.add('in'); }); });
  } else {
    revealables.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- 字号、尺寸线、参考线（字体加载后测量） ---------- */
  var measureCanvas = document.createElement('canvas').getContext('2d');
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function measureAll() {
    $$('[data-spec]').forEach(function (s) {
      var t = document.getElementById(s.getAttribute('data-spec')), px = s.querySelector('[data-px]');
      if (t && px) px.textContent = Math.round(parseFloat(getComputedStyle(t).fontSize));
    });
    $$('[data-measure]').forEach(function (m) {
      var t = document.getElementById(m.getAttribute('data-measure')); if (!t) return;
      var f = t.querySelector('.fill') || t, w = f.getBoundingClientRect().width;
      m.style.width = w + 'px'; m.dataset.w = w;
      if (!m.dataset.counting) m.querySelector('span').textContent = fmt(w) + ' PX';
    });
    $$('[data-guides]').forEach(guides);
  }
  function countUp(m) {
    var w = +m.dataset.w || 0, span = m.querySelector('span'), t0 = performance.now();
    if (!w || reduced) return;
    m.dataset.counting = '1';
    (function tick(now) {
      var k = Math.min(1, (now - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
      span.textContent = fmt(w * e) + ' PX';
      if (k < 1) requestAnimationFrame(tick); else delete m.dataset.counting;
    })(t0);
  }
  function guides(t) {
    var host = t.parentElement, cs = getComputedStyle(t), S = parseFloat(cs.fontSize);
    var L = parseFloat(cs.lineHeight); if (!L) L = S * 0.8;
    measureCanvas.font = '700 ' + S + 'px "Barlow Condensed"';
    var m = measureCanvas.measureText('H');
    var fa = m.fontBoundingBoxAscent || S * 0.9, fd = m.fontBoundingBoxDescent || S * 0.25, cap = m.actualBoundingBoxAscent || S * 0.7;
    var base = (L - (fa + fd)) / 2 + fa, capY = base - cap;
    var g = host.querySelector(':scope > .guides[data-for="' + t.id + '"]');
    if (!g) {
      g = document.createElement('div'); g.className = 'guides'; g.setAttribute('aria-hidden', 'true'); g.dataset.for = t.id || '';
      g.innerHTML = '<span class="g"></span><span class="gl mono">Cap height</span><span class="g"></span><span class="gl mono">Baseline</span>';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.insertBefore(g, t);
    }
    var top = t.offsetTop, k = g.children;
    g.style.top = top + 'px';
    k[0].style.top = capY + 'px';
    k[1].style.cssText = 'top:' + (capY - 16) + 'px;right:0';
    k[2].style.top = base + 'px';
    k[3].style.cssText = 'top:' + (base + 5) + 'px;left:0';
  }
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () { measureAll(); });
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(measureAll, 120); });
  measureAll();

  /* ---------- HUD ---------- */
  var secs = $$('main [data-sec]'), total = secs.length;
  var hud = $('#hud'), hIdx = $('#hud-idx'), hCount = $('#hud-count'), hName = $('#hud-name'), hTc = $('#hud-tc'), ruler = $('#hud-ruler');
  var navA = $$('.navlinks a');
  var TC = +(document.body.getAttribute('data-tc') || 540);   // 时间码满格秒数：首页 9 分钟，博客按阅读时长
  if (ruler) for (var i = 0; i <= 8; i++) { var tick = document.createElement('i'); tick.style.left = (i / 8 * 100) + '%'; ruler.appendChild(tick); }
  var bar = ruler && ruler.querySelector('.bar');
  function two(n) { return (n < 10 ? '0' : '') + n; }
  var ticking = false;
  function hudUpdate() {
    ticking = false;
    var mid = innerHeight * 0.45, cur = 0;
    secs.forEach(function (s, i) { if (s.getBoundingClientRect().top <= mid) cur = i; });
    var s = secs[cur];
    var foot = $('.foot'), onFoot = foot && foot.getBoundingClientRect().top < innerHeight * 0.55;
    if (hIdx) hIdx.textContent = two(cur + 1);
    if (hCount) hCount.textContent = two(cur + 1) + '/' + two(total);
    if (hName) hName.textContent = onFoot ? 'End' : s.getAttribute('data-sec');
    var dark = onFoot || s.hasAttribute('data-dark');
    if (hud) hud.classList.toggle('on-dark', dark && s.getBoundingClientRect().bottom > innerHeight * 0.9 || onFoot);
    var h = document.documentElement.scrollHeight - innerHeight, p = h > 0 ? Math.min(1, scrollY / h) : 0;
    if (bar) bar.style.width = (p * 100) + '%';
    if (hTc) { var sec = Math.round(p * TC); hTc.textContent = two(Math.floor(sec / 60)) + ':' + two(sec % 60); }
    navA.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + s.id ? 'true' : 'false'); });
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(hudUpdate); } }, { passive: true });
  addEventListener('resize', hudUpdate); hudUpdate();

  /* ---------- 复制 BibTeX ---------- */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = document.getElementById(btn.getAttribute('data-copy')); if (!src) return;
      var label = btn.textContent;
      function done(ok) { btn.textContent = ok ? 'Copied' : 'Select manually'; setTimeout(function () { btn.textContent = label; }, 1600); }
      if (navigator.clipboard) navigator.clipboard.writeText(src.textContent).then(function () { done(true); }, function () { done(false); }); else done(false);
    });
  });

  /* ---------- 画布舞台：尺寸、DPR、可见时才动 ---------- */
  function stage(canvas, draw, setup) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1, raf = 0, visible = false, t = 0, last = 0, state = {};
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (setup) setup(state, W, H);
      if (!raf) draw(ctx, W, H, t, 0, state);
    }
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
      draw(ctx, W, H, t, dt, state);
      raf = visible && !reduced ? requestAnimationFrame(loop) : 0;
    }
    new ResizeObserver(size).observe(canvas); size();
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }, { rootMargin: '80px' }).observe(canvas);
    if (reduced) { t = 6; draw(ctx, W, H, t, 0, state); }
    return state;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- 形状：菱形(0) → 方块(1) → 圆(2) → 十字(3) ---------- */
  function shapePath(ctx, s, m) {
    ctx.beginPath();
    if (m <= 1) {
      var side = s * (0.74 + 0.2 * m);
      ctx.save(); ctx.rotate((1 - m) * Math.PI / 4); rr(ctx, -side / 2, -side / 2, side, side, s * 0.14); ctx.restore();
    } else if (m <= 2) {
      var k = m - 1, side2 = s * 0.94;
      rr(ctx, -side2 / 2, -side2 / 2, side2, side2, s * (0.14 + k * 0.33));
    } else {
      var k2 = m - 2, th = s * (0.94 - 0.56 * k2), rad = th / 2 - k2 * th * 0.28, len = s * 0.94;
      rr(ctx, -len / 2, -th / 2, len, th, rad); rr(ctx, -th / 2, -len / 2, th, len, rad);
    }
  }
  function drawShape(ctx, x, y, s, m, rot, color, fringe) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (fringe) {   // 轻微色差
      ctx.save(); ctx.translate(-1.6, 0); shapePath(ctx, s, m); ctx.fillStyle = 'rgba(60,140,185,.32)'; ctx.fill('nonzero'); ctx.restore();
      ctx.save(); ctx.translate(1.6, 0); shapePath(ctx, s, m); ctx.fillStyle = 'rgba(255,70,30,.3)'; ctx.fill('nonzero'); ctx.restore();
    }
    shapePath(ctx, s, m); ctx.fillStyle = color; ctx.fill('nonzero');
    ctx.restore();
  }

  /* ---------- 几何场 ---------- */
  (function field() {
    var canvas = $('#field-canvas'); if (!canvas) return;
    var host = canvas.parentElement, P = { x: 0, y: 0, active: false, lastMove: 0 };
    host.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect(); P.x = e.clientX - r.left; P.y = e.clientY - r.top; P.active = true; P.lastMove = performance.now();
    });
    host.addEventListener('pointerleave', function () { P.active = false; });
    stage(canvas, function (ctx, W, H, t, dt, st) {
      if (!st.cells) return;
      ctx.clearRect(0, 0, W, H);
      var idle = !P.active || performance.now() - P.lastMove > 3500;
      var ax = idle ? W * (0.5 + 0.32 * Math.sin(t * 0.21)) : P.x, ay = idle ? H * (0.5 + 0.26 * Math.sin(t * 0.33 + 1.2)) : P.y;
      st.fx += (ax - st.fx) * Math.min(1, dt * (idle ? 1.5 : 7)); st.fy += (ay - st.fy) * Math.min(1, dt * (idle ? 1.5 : 7));
      var sp = st.sp, ring = sp * 1.35, lensR = sp * 3.2;
      if (t - st.lastSwap > 3.2) { st.lastSwap = t; st.whites = st.cells.map(function () { return Math.random() < 0.025; }); }
      for (var i = 0; i < st.cells.length; i++) {
        var c = st.cells[i], dx = c.x - st.fx, dy = c.y - st.fy, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        var target = 3 - Math.max(0, Math.min(3, (d - ring * 0.35) / ring));
        var speed = 7 / (1 + d / 380);
        c.m += (target - c.m) * Math.min(1, dt * speed);
        var lens = Math.exp(-(d * d) / (lensR * lensR)) * sp * 0.34;
        var x = c.x + dx / d * lens, y = c.y + dy / d * lens;
        var wob = 0.2 * Math.sin(d / 55 - t * 2.6) * Math.exp(-d / 420);
        var wantWhite = st.whites[i] || d < sp * 0.55 ? 1 : 0;
        c.w += (wantWhite - c.w) * Math.min(1, dt * 4);
        var col = c.w > 0.5 ? WHITE : INK;
        drawShape(ctx, x, y, sp * 0.6, c.m, wob, col, true);
      }
    }, function (st, W, H) {
      var sp = Math.max(66, Math.min(104, W / 14)), cols = Math.ceil(W / sp) + 1, rows = Math.ceil(H / sp) + 1;
      var ox = (W - (cols - 1) * sp) / 2, oy = (H - (rows - 1) * sp) / 2;
      st.sp = sp; st.cells = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) st.cells.push({ x: ox + c * sp, y: oy + r * sp, m: 0, w: 0 });
      st.whites = st.cells.map(function () { return Math.random() < 0.025; }); st.lastSwap = 0;
      st.fx = W / 2; st.fy = H / 2;
      var lab = $('#field-grid'); if (lab) lab.textContent = 'Grid ' + cols + ' × ' + rows;
    });
  })();

  /* ---------- 粒子球（论文） ---------- */
  (function orb() {
    var canvas = $('#orb-canvas'); if (!canvas) return;
    var N = 1500, pts = [], golden = Math.PI * (3 - Math.sqrt(5)), mx = 0, my = 0;
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random() < 0.06]);
    }
    canvas.parentElement.addEventListener('pointermove', function (e) {
      var b = canvas.getBoundingClientRect(); mx = ((e.clientX - b.left) / b.width - 0.5) * 2; my = ((e.clientY - b.top) / b.height - 0.5) * 2;
    });
    stage(canvas, function (ctx, W, H, t, dt, st) {
      ctx.clearRect(0, 0, W, H);
      st.ry = (st.ry || 0) + dt * 0.22 + mx * dt * 0.6;
      st.rx = (st.rx || 0.35) + ((0.35 + my * 0.35) - (st.rx || 0.35)) * Math.min(1, dt * 3);
      var R = Math.min(W, H) * 0.34, cx = W / 2, cy = H / 2, cy1 = Math.cos(st.ry), sy1 = Math.sin(st.ry), cx1 = Math.cos(st.rx), sx1 = Math.sin(st.rx);
      var band = Math.sin(t * 0.7);
      // 轨道（后半部分）
      function orbitPt(a) {
        var ox = Math.cos(a) * 1.55, oz = Math.sin(a) * 1.55, oy = 0;
        var y2 = oy * Math.cos(0.42) - oz * Math.sin(0.42), z2 = oy * Math.sin(0.42) + oz * Math.cos(0.42);
        return [cx + ox * R, cy + y2 * R * 0.9, z2];
      }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(237,232,222,.22)';
      ctx.beginPath(); for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) { var o = orbitPt(a); a ? ctx.lineTo(o[0], o[1]) : ctx.moveTo(o[0], o[1]); } ctx.stroke();
      var sat = orbitPt(t * 0.55), behind = sat[2] < 0 && Math.hypot(sat[0] - cx, sat[1] - cy) < R;
      if (behind) { ctx.fillStyle = 'rgba(217,119,87,.35)'; ctx.beginPath(); ctx.arc(sat[0], sat[1], 4, 0, 7); ctx.fill(); }
      for (var i = 0; i < N; i++) {
        var p = pts[i], x = p[0] * cy1 + p[2] * sy1, z = -p[0] * sy1 + p[2] * cy1, y = p[1];
        var y2 = y * cx1 - z * sx1, z2 = y * sx1 + z * cx1;
        var depth = (z2 + 1) / 2;                      // 0 后 → 1 前
        var glow = Math.exp(-Math.pow((p[1] - band) / 0.07, 2));
        var a2 = 0.12 + depth * 0.78 + glow * 0.4, s = 0.7 + depth * 1.5 + glow;
        ctx.fillStyle = p[3] ? 'rgba(217,119,87,' + Math.min(1, a2) + ')' : 'rgba(237,232,222,' + Math.min(1, a2) + ')';
        ctx.fillRect(cx + x * R - s / 2, cy + y2 * R - s / 2, s, s);
      }
      if (!behind) { ctx.fillStyle = CLAY; ctx.beginPath(); ctx.arc(sat[0], sat[1], 5, 0, 7); ctx.fill(); }
    });
  })();

  /* ---------- 封面 ---------- */
  var covers = {
    ppt: function (ctx, W, H, t) {         // 一页页“画”出来的幻灯片
      ctx.clearRect(0, 0, W, H);
      var cols = 4, rows = 3, pad = W * 0.07, gap = W * 0.024;
      var sw = (W - pad * 2 - gap * (cols - 1)) / cols, sh = sw * 9 / 16;
      var oy = (H - (sh * rows + gap * (rows - 1))) / 2 - H * 0.03;
      var n = cols * rows, cyc = 8, prog = (t % cyc) / cyc * (n + 3);
      for (var i = 0; i < n; i++) {
        var c = i % cols, r = Math.floor(i / cols), x = pad + c * (sw + gap), y = oy + r * (sh + gap);
        var k = Math.max(0, Math.min(1, prog - i));
        ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
        ctx.beginPath(); rr(ctx, x, y, sw, sh, 6); ctx.stroke();
        if (k > 0) {
          ctx.save(); ctx.beginPath(); rr(ctx, x, y, sw * k, sh, 6); ctx.clip();
          ctx.fillStyle = i % 5 === 2 ? INK : CLAY; ctx.fillRect(x, y, sw, sh);
          var fg = i % 5 === 2 ? CLAY : INK; ctx.fillStyle = fg; ctx.strokeStyle = fg;
          var mx = x + sw / 2, my = y + sh / 2, u = sh * 0.26;
          ctx.beginPath();
          switch (i % 4) {
            case 0: ctx.arc(mx, my, u, 0, 7); ctx.fill(); break;
            case 1: ctx.moveTo(mx, my - u); ctx.lineTo(mx + u * 1.1, my + u * .8); ctx.lineTo(mx - u * 1.1, my + u * .8); ctx.fill(); break;
            case 2: for (var b = 0; b < 3; b++) { ctx.fillRect(mx - u * 1.2 + b * u * .9, my - u * (0.4 + b * .35), u * .6, u * (0.8 + b * .7)); } break;
            default: ctx.arc(mx, my + u * .4, u * 1.1, Math.PI, 0); ctx.fill();
          }
          ctx.restore();
        }
      }
      // 提示条：一句话
      var bx = pad, by = H - H * 0.13, bw = W * 0.4, bh = H * 0.075;
      ctx.fillStyle = INK; ctx.beginPath(); rr(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
      for (var d = 0; d < 3; d++) { ctx.fillStyle = 'rgba(245,242,235,' + (0.35 + 0.65 * ((Math.sin(t * 5 - d) + 1) / 2)) + ')'; ctx.beginPath(); ctx.arc(bx + bh * 0.8 + d * bh * 0.45, by + bh / 2, bh * 0.12, 0, 7); ctx.fill(); }
      ctx.fillStyle = CLAY; ctx.beginPath(); ctx.arc(bx + bw - bh / 2, by + bh / 2, bh * 0.3, 0, 7); ctx.fill();
    },
    hr: function (ctx, W, H, t, dt, st) {  // 四路汇入同一个 hub，旁边是首轮完成率
      ctx.clearRect(0, 0, W, H);
      var hx = W * 0.44, hy = H * 0.5, hr = Math.min(W, H) * 0.12;
      var lanes = [0.18, 0.39, 0.61, 0.82];
      ctx.lineWidth = Math.max(10, H * 0.045); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(20,20,19,.12)';
      lanes.forEach(function (ly) { ctx.beginPath(); ctx.moveTo(-10, H * ly); ctx.bezierCurveTo(W * 0.2, H * ly, W * 0.25, hy, hx - hr, hy); ctx.stroke(); });
      lanes.forEach(function (ly, li) {
        for (var k = 0; k < 3; k++) {
          var u = ((t * (0.16 + li * 0.02) + k / 3 + li * 0.13) % 1);
          var x0 = -10, y0 = H * ly, x1 = W * 0.2, y1 = H * ly, x2 = W * 0.25, y2 = hy, x3 = hx - hr, y3 = hy, v = 1 - u;
          var px = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, py = v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3;
          ctx.fillStyle = li % 2 ? INK : WHITE; ctx.beginPath(); ctx.arc(px, py, H * 0.02, 0, 7); ctx.fill();
        }
      });
      ctx.lineWidth = Math.max(3, H * 0.018); ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(t * 0.8); ctx.fillStyle = INK; ctx.beginPath(); rr(ctx, -hr * 0.35, -hr * 0.35, hr * 0.7, hr * 0.7, hr * 0.12); ctx.fill(); ctx.restore();
      var data = [['pi', 85], ['opencode', 81], ['dsh', 78], ['cline', 77]];
      var bx0 = W * 0.6, bw = W * 0.055, gap = W * 0.04, base = H * 0.76, maxh = H * 0.5;
      st.grow = Math.min(1, (st.grow || 0) + dt * 0.8);
      var g = 1 - Math.pow(1 - st.grow, 3);
      ctx.font = '500 ' + Math.max(8, Math.min(H * 0.036, W * 0.02)) + 'px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      data.forEach(function (dd, i) {
        var x = bx0 + i * (bw + gap), h = maxh * (dd[1] / 100) * g;
        ctx.fillStyle = i === 0 ? INK : 'rgba(20,20,19,.78)'; ctx.fillRect(x, base - h, bw, h);
        ctx.fillStyle = INK; ctx.fillText(Math.round(dd[1] * g) + '%', x + bw / 2, base - h - H * 0.025);
        ctx.fillText(dd[0], x + bw / 2, base + H * 0.07);
      });
      ctx.fillStyle = INK; ctx.fillRect(bx0 - gap, base, (bw + gap) * 4 + gap, 1.5);
    },
    ink: function (ctx, W, H, t) {         // 胶片：逐帧的几何动画
      ctx.clearRect(0, 0, W, H);
      var fh = H * 0.46, fw = fh * 1.25, gap = fh * 0.12, y = H * 0.24, off = (t * 40) % (fw + gap);
      ctx.fillStyle = 'rgba(237,232,222,.08)'; ctx.fillRect(0, y - fh * 0.2, W, fh * 1.4);
      for (var x = -fw - off, n = 0; x < W + fw; x += fw + gap, n++) {
        var idx = Math.floor((x + off + t * 40) / (fw + gap));
        ctx.fillStyle = CREAM; ctx.beginPath(); rr(ctx, x, y, fw, fh, 5); ctx.fill();
        ctx.fillStyle = 'rgba(237,232,222,.55)';
        for (var s = 0; s < 4; s++) { ctx.beginPath(); rr(ctx, x + fw * (0.1 + s * 0.24), y - fh * 0.14, fw * 0.1, fh * 0.07, 2); ctx.fill(); ctx.beginPath(); rr(ctx, x + fw * (0.1 + s * 0.24), y + fh * 1.07, fw * 0.1, fh * 0.07, 2); ctx.fill(); }
        var ph = ((idx % 6) + 6) % 6 / 5, bx = x + fw * (0.2 + 0.6 * ph), by = y + fh * (0.75 - 0.5 * Math.sin(ph * Math.PI));
        ctx.fillStyle = INK; ctx.fillRect(x + fw * 0.08, y + fh * 0.84, fw * 0.84, 2);
        ctx.fillStyle = idx % 3 === 0 ? CLAY : INK; ctx.beginPath(); ctx.arc(bx, by, fh * 0.1, 0, 7); ctx.fill();
      }
      var px = W * 0.84, py = H * 0.82, s2 = H * 0.09;
      ctx.fillStyle = CLAY; ctx.beginPath(); ctx.moveTo(px - s2 * 0.7, py - s2); ctx.lineTo(px + s2, py); ctx.lineTo(px - s2 * 0.7, py + s2); ctx.closePath(); ctx.fill();
    },
    rl: function (ctx, W, H, t) {          // 台阶与向上跳的点
      ctx.clearRect(0, 0, W, H);
      var n = 7, sw = W * 0.08, sh = H * 0.085, x0 = W * 0.38, y0 = H * 0.82;
      for (var i = 0; i < n; i++) { ctx.fillStyle = INK; ctx.beginPath(); rr(ctx, x0 + i * sw, y0 - (i + 1) * sh, sw - 6, sh * (i + 1), 6); ctx.fill(); }
      var cyc = 5.2, k = (t % cyc) / cyc * n, step = Math.floor(k), f = k - step;
      var bx = x0 + step * sw + sw / 2 + f * sw, hop = Math.sin(f * Math.PI) * sh * 1.4;
      var by = y0 - (step + 1) * sh - H * 0.05 - hop - f * sh;
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(bx, by, H * 0.04, 0, 7); ctx.fill();
      var fx = x0 + (n - 1) * sw + sw * 0.5, fy = y0 - n * sh;
      ctx.fillStyle = INK; ctx.fillRect(fx, fy - H * 0.22, 3, H * 0.22);
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.moveTo(fx + 3, fy - H * 0.22); ctx.lineTo(fx + W * 0.07, fy - H * 0.18); ctx.lineTo(fx + 3, fy - H * 0.14); ctx.fill();
    },
    agent: function (ctx, W, H, t) {       // 中心节点与几种形状的卫星，信号沿连线往返
      ctx.clearRect(0, 0, W, H);
      var cx = W * 0.62, cy = H * 0.46, R = Math.min(W, H) * 0.34, n = 7;
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2 + t * 0.12, x = cx + Math.cos(a) * R * 1.25, y = cy + Math.sin(a) * R * 0.95;
        ctx.strokeStyle = 'rgba(20,20,19,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        var u = (Math.sin(t * 1.3 + i) + 1) / 2;
        ctx.fillStyle = CLAY; ctx.beginPath(); ctx.arc(cx + (x - cx) * u, cy + (y - cy) * u, 4, 0, 7); ctx.fill();
        drawShape(ctx, x, y, R * 0.28, i % 4, t * 0.3 + i, i % 3 === 0 ? CLAY : INK, false);
      }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, 7); ctx.fill();
      ctx.strokeStyle = CLAY; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.28 + 8 + Math.sin(t * 2) * 3, 0, 7); ctx.stroke();
    }
  };
  /* 专利示意：扫描线扫过支护墙面，识别裂缝、剥落、渗漏并换算尺寸（自绘，数值仅为演示） */
  covers.defect = function (ctx, W, H, t, dt, st) {
    ctx.clearRect(0, 0, W, H);
    var x0 = W * 0.08, x1 = W * 0.92, y0 = H * 0.12, y1 = H * 0.74, ww = x1 - x0, wh = y1 - y0;
    function X(u) { return x0 + u * ww; } function Y(v) { return y0 + v * wh; }
    var mono = function (px) { return '500 ' + px + 'px "JetBrains Mono", ui-monospace, monospace'; };
    var fs = Math.max(9, Math.min(12, W * 0.024)), mmPerPx = 6000 / wh;
    if (!st.defs || st.W !== W) {
      st.W = W;
      var spall = []; for (var k = 0; k < 11; k++) { var a = k / 11 * Math.PI * 2, r = 0.05 + 0.018 * Math.sin(k * 2.7) + 0.01 * Math.cos(k * 5.1); spall.push([0.46 + Math.cos(a) * r * 0.8, 0.86 + Math.sin(a) * r * 0.62]); }
      st.defs = [
        { kind: 'CRACK', rank: 'P1', place: 'above', pts: [[0.12, 0.37], [0.15, 0.41], [0.14, 0.45], [0.19, 0.5], [0.18, 0.55], [0.24, 0.6], [0.29, 0.62]], br: [[0.19, 0.5], [0.24, 0.49], [0.27, 0.45]] },
        { kind: 'LEAK', rank: 'P2', place: 'left', leak: [0.77, 0.03, 0.25] },
        { kind: 'CRACK', rank: 'P3', place: 'below', pts: [[0.55, 0.4], [0.58, 0.45], [0.57, 0.49], [0.62, 0.53], [0.64, 0.58]] },
        { kind: 'SPALL', rank: 'P2', place: 'below', poly: spall }
      ];
      st.defs.forEach(function (d) {
        var ps = d.pts ? d.pts.concat(d.br || []) : d.poly ? d.poly : [[d.leak[0] - 0.02, d.leak[1]], [d.leak[0] + 0.02, d.leak[2] + 0.03]];
        d.u0 = Math.min.apply(null, ps.map(function (p) { return p[0]; })); d.u1 = Math.max.apply(null, ps.map(function (p) { return p[0]; }));
        d.v0 = Math.min.apply(null, ps.map(function (p) { return p[1]; })); d.v1 = Math.max.apply(null, ps.map(function (p) { return p[1]; }));
        if (d.pts) { var L = 0; for (var i = 1; i < d.pts.length; i++) L += Math.hypot((d.pts[i][0] - d.pts[i - 1][0]) * ww, (d.pts[i][1] - d.pts[i - 1][1]) * wh); d.label = 'L ' + (L * mmPerPx / 1000).toFixed(2) + ' m · W95 ' + (d.rank === 'P1' ? '1.8' : '0.6') + ' mm'; }
        else if (d.poly) { var A = 0; for (var j = 0; j < d.poly.length; j++) { var p = d.poly[j], q = d.poly[(j + 1) % d.poly.length]; A += (p[0] * q[1] - q[0] * p[1]) * ww * wh; } d.label = 'A ' + (Math.abs(A / 2) * mmPerPx * mmPerPx / 1e6).toFixed(2) + ' m²'; }
        else d.label = 'L ' + ((d.leak[2] - d.leak[1]) * wh * mmPerPx / 1000).toFixed(2) + ' m';
      });
    }
    // 墙板（钢板桩式分格）
    var n = 6, pw = ww / n;
    for (var i = 0; i < n; i++) {
      ctx.beginPath(); rr(ctx, x0 + i * pw + 2, y0, pw - 4, wh, 4);
      ctx.fillStyle = 'rgba(237,232,222,.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(237,232,222,.2)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 参照物（已知尺寸，用于求单应性）
    var rs = ww * 0.075, rx = X(0.9) - rs, ry = Y(0.93) - rs;
    ctx.fillStyle = CREAM; ctx.fillRect(rx, ry, rs, rs); ctx.fillStyle = INK;
    [[1, 1], [2, 1], [1, 2], [3, 2], [2, 3]].forEach(function (c) { ctx.fillRect(rx + c[0] * rs / 5, ry + c[1] * rs / 5, rs / 5, rs / 5); });
    ctx.font = mono(fs * 0.85); ctx.fillStyle = 'rgba(237,232,222,.6)'; ctx.textAlign = 'right'; ctx.fillText('REF 200 mm', rx + rs, ry - 6);
    // 扫描进度
    var P = 7, phase = (t % P) / P, su = phase * 1.35 - 0.12, sx = X(su);
    // 缺陷（原始外观）
    st.defs.forEach(function (d) {
      var k = Math.max(0, Math.min(1, (su - d.u1) / 0.07)), hit = k > 0;
      ctx.strokeStyle = hit ? CLAY : 'rgba(237,232,222,.7)'; ctx.fillStyle = hit ? 'rgba(217,119,87,.55)' : 'rgba(237,232,222,.25)';
      if (d.pts) {
        [d.pts, d.br].forEach(function (line, li) {
          if (!line) return; ctx.lineWidth = (hit ? 2.6 : 1.6) * (li ? 0.7 : 1); ctx.lineJoin = 'round';
          ctx.beginPath(); line.forEach(function (p, j) { j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.stroke();
        });
      } else if (d.poly) {
        ctx.beginPath(); d.poly.forEach(function (p, j) { j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
      } else {
        var lx = X(d.leak[0]), ya = Y(d.leak[1]), yb = Y(d.leak[2]);
        var g = ctx.createLinearGradient(0, ya, 0, yb); g.addColorStop(0, hit ? 'rgba(217,119,87,.7)' : 'rgba(237,232,222,.5)'); g.addColorStop(1, 'rgba(237,232,222,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx - ww * 0.012, ya); ctx.quadraticCurveTo(lx - ww * 0.02, (ya + yb) / 2, lx, yb); ctx.quadraticCurveTo(lx + ww * 0.02, (ya + yb) / 2, lx + ww * 0.012, ya); ctx.fill();
        ctx.beginPath(); ctx.arc(lx, yb + wh * 0.02 + ((t * 40) % (wh * 0.05)), 2.2, 0, 7); ctx.fillStyle = hit ? CLAY : 'rgba(237,232,222,.55)'; ctx.fill();
      }
    });
    // 支撑（钢围檩与横撑）
    [0.3, 0.68].forEach(function (v) {
      ctx.fillStyle = 'rgba(237,232,222,.2)'; ctx.fillRect(x0 - 8, Y(v) - 5, ww + 16, 10);
      for (var b = 0; b <= n; b++) { ctx.beginPath(); ctx.arc(x0 + b * pw, Y(v), 2.6, 0, 7); ctx.fillStyle = 'rgba(237,232,222,.55)'; ctx.fill(); }
    });
    // 扫描光带
    if (su > -0.05 && su < 1.05) {
      var gb = ctx.createLinearGradient(sx - ww * 0.12, 0, sx, 0); gb.addColorStop(0, 'rgba(217,119,87,0)'); gb.addColorStop(1, 'rgba(217,119,87,.22)');
      ctx.fillStyle = gb; ctx.fillRect(sx - ww * 0.12, y0 - 8, ww * 0.12, wh + 16);
      ctx.fillStyle = CLAY; ctx.fillRect(sx - 1, y0 - 14, 2, wh + 28);
    }
    // 识别框与标注
    var found = 0, p1 = false;
    st.defs.forEach(function (d) {
      var k = Math.max(0, Math.min(1, (su - d.u1) / 0.07)); if (k <= 0) return; found++; if (d.rank === 'P1') p1 = true;
      var bx = X(d.u0) - 8, by = Y(d.v0) - 8, bw = X(d.u1) - X(d.u0) + 16, bh = Y(d.v1) - Y(d.v0) + 16, c = 9;
      ctx.globalAlpha = k; ctx.strokeStyle = CLAY; ctx.lineWidth = 1.5; ctx.beginPath();
      [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(function (q) { ctx.moveTo(q[0] + q[2] * c, q[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + q[3] * c); });
      ctx.stroke();
      ctx.font = mono(fs); var l1 = d.kind + ' · ' + d.rank, l2 = d.label;
      var tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16, lh = fs * 1.35, th = lh * 2 + 8, tx, ty;
      if (d.place === 'below') { tx = bx; ty = by + bh + 6; }
      else if (d.place === 'left') { tx = bx - tw - 6; ty = by; }
      else { tx = bx; ty = by - th - 6; }
      tx = Math.min(W - tw - 8, Math.max(8, tx)); ty = Math.max(8, ty);
      ctx.fillStyle = CLAY; ctx.beginPath(); rr(ctx, tx, ty, tw, th, 5); ctx.fill();
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + fs + 'px "JetBrains Mono", ui-monospace, monospace'; ctx.fillText(l1, tx + 8, ty + 4 + lh / 2);
      ctx.font = mono(fs); ctx.fillText(l2, tx + 8, ty + 4 + lh * 1.5);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    });
    // 底部读数
    var by2 = H * 0.86;
    ctx.fillStyle = 'rgba(237,232,222,.14)'; ctx.fillRect(x0, by2 - 12, ww, 1);
    ctx.font = mono(fs); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(237,232,222,.75)';
    ctx.fillText('DETECTED ' + found + '/' + st.defs.length + (su > 1 ? ' · SCAN DONE' : ' · SCANNING'), x0, by2 + 8);
    ctx.fillStyle = p1 ? CLAY : 'rgba(237,232,222,.45)';
    ctx.fillText(p1 ? 'P1 ≥ τ → VLM + 知识库 → REPORT.json' : 'RISK < τ · 直接汇总', x0, by2 + 8 + fs * 1.9);
    ctx.textAlign = 'left';
  };

  function mountCovers(name) {
    $$(name ? 'canvas[data-cover="' + name + '"]' : 'canvas[data-cover]').forEach(function (cv) {
      var f = covers[cv.getAttribute('data-cover')];
      if (f && !cv.dataset.mounted) { cv.dataset.mounted = '1'; stage(cv, f); }
    });
  }
  mountCovers();

  /* 供博客等页面复用：Reel.cover('名字', 绘制函数) 注册并挂载新的封面动画 */
  window.Reel = {
    INK: INK, CLAY: CLAY, CREAM: CREAM, PAPER: PAPER, WHITE: WHITE, reduced: reduced,
    stage: stage, rr: rr, shapePath: shapePath, drawShape: drawShape,
    cover: function (name, fn) { covers[name] = fn; mountCovers(name); }
  };
  document.dispatchEvent(new CustomEvent('reel:ready'));

  /* 流程条（专利）：逐步点亮 */
  $$('#patent .flow').forEach(function (ol) {
    var items = $$('li', ol), i = 0;
    if (reduced || !('IntersectionObserver' in window)) { items.forEach(function (li) { li.classList.add('on'); }); return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      setInterval(function () {
        if (i > items.length) { items.forEach(function (li) { li.classList.remove('on'); }); i = 0; return; }
        if (items[i]) items[i].classList.add('on'); i++;
      }, 900);
    }, { threshold: 0.3 });
    io.observe(ol);
  });
})();
