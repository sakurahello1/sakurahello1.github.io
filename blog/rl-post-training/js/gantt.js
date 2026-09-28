(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) { if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); } if (p) p.appendChild(e); return e; }

  /* ---------- ch16: sync vs async rollout timeline ---------- */
  (function gantt() {
    var svg = document.getElementById('gantt-svg'); if (!svg) return;
    var read = document.getElementById('gantt-read'), seg = svg.closest('.widget').querySelector('.seg');
    var T = 44, L = 78, R = 16, top = 30, rowH = 34, W = 700;
    var X = function (t) { return L + t / T * (W - L - R); };
    var rows = ['生成 1', '生成 2', '生成 3', '生成 4', '训练'];

    function syncPlan() {
      var gen = [], train = [], idle = [];
      var it = [{ s: 0, len: [6, 9, 15, 7], v: 1 }, { s: 23, len: [8, 5, 7, 14], v: 2 }];
      it.forEach(function (b) {
        var end = b.s + Math.max.apply(null, b.len);
        b.len.forEach(function (l, w) { gen.push({ w: w, s: b.s, e: b.s + l, v: b.v }); idle.push({ w: w, s: b.s + l, e: end + 8 }); });
        idle.push({ w: 4, s: b.s, e: end });
        train.push({ s: end, e: end + 6, kind: 'train', v: b.v }, { s: end + 6, e: end + 8, kind: 'sync', v: b.v });
      });
      return { gen: gen, train: train, idle: idle };
    }
    function asyncPlan() {
      var lens = [[6, 9, 5, 8, 7, 6, 9], [9, 4, 10, 6, 8, 7], [15, 7, 6, 9, 8], [7, 8, 12, 6, 5, 9]];
      var gen = [], train = [], idle = [], version = 1, queue = [], trainerFree = 0, t = 0, pending = [];
      var cur = lens.map(function (l, w) { return { w: w, i: 0, s: 0, v: 1 }; });
      for (t = 0; t <= T; t += 0.5) {
        cur.forEach(function (c) {
          var l = lens[c.w][c.i]; if (l == null) return;
          if (t >= c.s + l) { var g = { w: c.w, s: c.s, e: c.s + l, v: c.v }; gen.push(g); queue.push(g); c.i++; c.s = t; c.v = version; }
        });
        if (t >= trainerFree && queue.length >= 4) {
          var batch = queue.splice(0, 4), tv = version;
          batch.forEach(function (g) { g.stale = tv - g.v; });
          if (train.length) { var last = train[train.length - 1]; if (t > last.e) idle.push({ w: 4, s: last.e, e: t }); }
          else idle.push({ w: 4, s: 0, e: t });
          train.push({ s: t, e: t + 5, kind: 'train', v: tv }, { s: t + 5, e: t + 6, kind: 'sync', v: tv });
          trainerFree = t + 6;
          pending.push([t + 6, tv + 1]);
        }
        while (pending.length && pending[0][0] <= t) { version = pending.shift()[1]; }
      }
      cur.forEach(function (c) { var l = lens[c.w][c.i]; if (l != null && c.s < T) gen.push({ w: c.w, s: c.s, e: Math.min(T, c.s + l), v: c.v, partial: true }); });
      return { gen: gen, train: train, idle: idle };
    }
    var plans = { sync: syncPlan(), async: asyncPlan() };

    function util(p) {
      var g = 0, tr = 0;
      p.gen.forEach(function (x) { g += Math.min(x.e, T) - Math.min(x.s, T); });
      p.train.forEach(function (x) { tr += Math.max(0, Math.min(x.e, T) - x.s); });
      return { gen: g / (4 * T), train: tr / T };
    }
    var head = null, raf = 0, t0 = 0, visible = false, mode = 'sync';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var p = plans[mode];
      var defs = S('defs', {}, svg), pat = S('pattern', { id: 'g-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('rect', { width: 6, height: 6, style: 'fill:var(--surface)' }, pat);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 6, style: 'stroke:var(--rule);stroke-width:3' }, pat);
      rows.forEach(function (r, i) {
        var y = top + i * rowH + (i === 4 ? 8 : 0);
        S('text', { x: L - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'class': i === 4 ? 't-b' : 't', style: i === 4 ? 'font-size:13px' : '', text: r }, svg);
        S('rect', { x: L, y: y + 4, width: W - L - R, height: rowH - 8, rx: 4, style: 'fill:var(--bg)' }, svg);
      });
      function rowY(w) { return top + w * rowH + (w === 4 ? 8 : 0) + 4; }
      p.idle.forEach(function (x) {
        var e = Math.min(x.e, T); if (e <= x.s) return;
        S('rect', { x: X(x.s), y: rowY(x.w), width: X(e) - X(x.s), height: rowH - 8, rx: 3, style: 'fill:url(#g-hatch)' }, svg);
      });
      p.gen.forEach(function (x) {
        var e = Math.min(x.e, T), shade = x.v % 2 ? 'var(--teal-fill)' : 'var(--teal)';
        S('rect', { x: X(x.s) + 1, y: rowY(x.w), width: Math.max(2, X(e) - X(x.s) - 2), height: rowH - 8, rx: 3, style: 'fill:' + shade + ';opacity:' + (x.partial ? .45 : .9) }, svg);
        if (X(e) - X(x.s) > 26) S('text', { x: X(x.s) + 6, y: rowY(x.w) + (rowH - 8) / 2 + 4, 'class': 't-m', style: 'fill:#fff', text: 'v' + x.v }, svg);
        if (x.stale > 0) S('circle', { cx: X(e) - 6, cy: rowY(x.w) + 6, r: 3.5, style: 'fill:var(--amber-fill);stroke:var(--surface);stroke-width:1' }, svg);
      });
      p.train.forEach(function (x) {
        var e = Math.min(x.e, T); if (e <= x.s) return;
        var tr = x.kind === 'train';
        S('rect', { x: X(x.s) + 1, y: rowY(4), width: Math.max(2, X(e) - X(x.s) - 2), height: rowH - 8, rx: 3, style: 'fill:' + (tr ? 'var(--amber-fill)' : 'var(--muted)') }, svg);
        if (tr && X(e) - X(x.s) > 40) S('text', { x: X(x.s) + 6, y: rowY(4) + (rowH - 8) / 2 + 4, 'class': 't-m', style: 'fill:#fff', text: '更新→v' + (x.v + 1) }, svg);
      });
      var ly = top + 5 * rowH + 26;
      [['var(--teal-fill)', '生成回答（vN = 用第 N 版权重）'], ['var(--amber-fill)', '训练更新'], ['var(--muted)', '同步权重'], ['url(#g-hatch)', 'GPU 空等']].forEach(function (lg, i) {
        var x = L + [0, 215, 305, 395][i];
        S('rect', { x: x, y: ly - 9, width: 12, height: 12, rx: 2, style: 'fill:' + lg[0] + ';stroke:var(--rule)' }, svg);
        S('text', { x: x + 18, y: ly + 1, 'class': 't-s', text: lg[1] }, svg);
      });
      if (mode === 'async') {
        S('circle', { cx: L + 491, cy: ly - 3, r: 4, style: 'fill:var(--amber-fill)' }, svg);
        S('text', { x: L + 503, y: ly + 1, 'class': 't-s', text: '旧版本样本' }, svg);
      }
      S('text', { x: W - R, y: 16, 'text-anchor': 'end', 'class': 't-m', text: '时间 →' }, svg);
      head = S('line', { x1: X(0), y1: top, x2: X(0), y2: top + 5 * rowH + 8, style: 'stroke:var(--ink);stroke-width:1.2;opacity:0' }, svg);
      var u = util(p), msg;
      if (mode === 'sync') {
        msg = '<b>同步</b>：每一批都要等最长的那条回答写完才能开始训练，训练时生成 GPU 又在空等。这段时间里生成 GPU 的利用率约 ' + Math.round(u.gen * 100) + '%，训练 GPU 约 ' + Math.round(u.train * 100) + '%。所有样本都来自当前权重，严格 on-policy。';
      } else {
        var st = 0, n = 0; p.gen.forEach(function (g) { if (g.stale != null) { n++; if (g.stale > 0) st++; } });
        msg = '<b>异步</b>：生成不停，攒够一批就训练，生成 GPU 利用率约 ' + Math.round(u.gen * 100) + '%，训练 GPU 约 ' + Math.round(u.train * 100) + '%。代价是被训练的样本里有 ' + st + '/' + n + ' 条（橙点）是用旧一版权重生成的，训练变成了轻度 off-policy，需要靠 PPO 的重要性采样和 clip 兜住。';
      }
      read.innerHTML = msg + '（示意数据）';
    }
    function tick(ts) {
      if (!visible || reduce || !head) { raf = 0; return; }
      if (!t0) t0 = ts;
      var t = ((ts - t0) / 9000 % 1) * T;
      head.setAttribute('x1', X(t)); head.setAttribute('x2', X(t)); head.style.opacity = .55;
      raf = requestAnimationFrame(tick);
    }
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      mode = b.getAttribute('data-g'); draw();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !raf) { t0 = 0; raf = requestAnimationFrame(tick); }
      }).observe(svg);
    }
    draw();
  })();
})();
