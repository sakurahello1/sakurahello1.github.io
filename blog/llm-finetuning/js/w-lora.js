/* 截断 SVD：从最终矩阵求解，不读取生成时的谱。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var root = $('w-lora'); if (!root) return;
  var N = 48, kind = 'decay', rank = 4, power = 1.2, current, baseline, serial = 0, cache = {};
  var rs = $('lora-r'), ps = $('lora-p'), svg = $('lora-spec'), sizes;
  function S(parent, tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e); return e;
  }
  function fmt(x, d) { return x.toFixed(d); }
  function grouped(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'); }
  function note(id, before) {
    var e = document.createElement('p'); e.id = id; e.className = 'lora-note';
    root.insertBefore(e, before); return e;
  }
  var scaleNote = note('lora-scale', root.querySelector('.w-ctrl'));
  var status = note('lora-status', root.querySelector('.stats'));
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  var method = note('lora-method', $('lora-read'));
  method.textContent = 'LoRA：ΔW = (α/r)BA，B ∈ ℝᵈˣʳ，A ∈ ℝʳˣᵏ。α ≠ 0 时缩放可吸收入因子；截断 SVD 给出秩约束下的最佳近似，不保证训练能找到它。参数账只计 A、B，冻结的原权重仍需存储。';
  function random(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rng = random(73129);
  function gaussian() { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); }
  function empty() { return new Float64Array(N * N); }
  // 两遍修正 Gram–Schmidt，列向量正交化。
  function orthogonal() {
    var q = empty(), i, j, k, pass, dot, norm;
    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) q[i * N + j] = gaussian();
      for (pass = 0; pass < 2; pass++) for (k = 0; k < j; k++) {
        dot = 0;
        for (i = 0; i < N; i++) dot += q[i * N + j] * q[i * N + k];
        for (i = 0; i < N; i++) q[i * N + j] -= dot * q[i * N + k];
      }
      norm = 0;
      for (i = 0; i < N; i++) norm += q[i * N + j] * q[i * N + j];
      norm = Math.sqrt(norm);
      for (i = 0; i < N; i++) q[i * N + j] /= norm;
    }
    return q;
  }
  var genU, genV, noise, flat;
  function generate(which, p) {
    if (which === 'flat') return flat.slice();
    var m = empty(), i, j, k, s;
    for (k = 0; k < N; k++) {
      s = which === 'decay' ? Math.pow(k + 1, -p) : noise[k];
      for (i = 0; i < N; i++) for (j = 0; j < N; j++) m[i * N + j] += genU[i * N + k] * s * genV[j * N + k];
    }
    return m;
  }
  // Hestenes：同步旋转矩阵列与右奇异向量，每片约 12 ms。
  function svd(m, token, done) {
    var a = m.slice(), v = empty(), sweep = 0, col = 0, changed = false;
    for (var i = 0; i < N; i++) v[i * N + i] = 1;
    function chunk() {
      if (token !== serial) return;
      var start = performance.now(), p, q, i, aa, bb, ab, z, t, c, s, x, y;
      while (performance.now() - start < 12) {
        p = col;
        for (q = p + 1; q < N; q++) {
          aa = 0; bb = 0; ab = 0;
          for (i = 0; i < N; i++) { x = a[i * N + p]; y = a[i * N + q]; aa += x * x; bb += y * y; ab += x * y; }
          if (Math.abs(ab) <= 2e-15 * Math.sqrt(aa * bb)) continue;
          changed = true; z = (bb - aa) / (2 * ab);
          t = (z >= 0 ? 1 : -1) / (Math.abs(z) + Math.sqrt(1 + z * z));
          c = 1 / Math.sqrt(1 + t * t); s = c * t;
          for (i = 0; i < N; i++) {
            x = a[i * N + p]; y = a[i * N + q]; a[i * N + p] = c * x - s * y; a[i * N + q] = s * x + c * y;
            x = v[i * N + p]; y = v[i * N + q]; v[i * N + p] = c * x - s * y; v[i * N + q] = s * x + c * y;
          }
        }
        col++;
        if (col === N - 1) {
          sweep++; col = 0;
          if (!changed) { setTimeout(finish, 0); return; }
          if (sweep === 80) { status.textContent = 'SVD 未收敛，请重新选择矩阵。'; root.setAttribute('aria-busy', 'false'); return; }
          changed = false;
        }
      }
      status.textContent = '正在计算 SVD：已完成 ' + sweep + ' 轮，当前列 ' + (col + 1) + '／' + N + '。';
      setTimeout(chunk, 0);
    }
    function finish() {
      if (token !== serial) return;
      var sig = [], order = [], j, i, sum;
      for (j = 0; j < N; j++) {
        sum = 0; for (i = 0; i < N; i++) sum += a[i * N + j] * a[i * N + j];
        sig.push(Math.sqrt(sum)); order.push(j);
      }
      order.sort(function (a, b) { return sig[b] - sig[a]; });
      var d = { m: m, a: a, v: v, order: order, sig: order.map(function (j) { return sig[j]; }), sweeps: sweep };
      d.total = d.sig.reduce(function (s, x) { return s + x * x; }, 0);
      d.norm2 = m.reduce(function (s, x) { return s + x * x; }, 0);
      d.max = m.reduce(function (s, x) { return Math.max(s, Math.abs(x)); }, 0);
      var full = reconstruct(d, N), err = 0;
      for (i = 0; i < m.length; i++) err = Math.max(err, Math.abs(m[i] - full[i]));
      d.reconstruction = err;
      if (err >= 1e-10) { status.textContent = 'SVD 重建检验未通过，未显示结果。'; root.setAttribute('aria-busy', 'false'); return; }
      done(d);
    }
    setTimeout(chunk, 0);
  }
  function reconstruct(d, r) {
    var out = empty(), h, k, i, j;
    for (h = 0; h < r; h++) {
      k = d.order[h];
      for (i = 0; i < N; i++) for (j = 0; j < N; j++) out[i * N + j] += d.a[i * N + k] * d.v[j * N + k];
    }
    return out;
  }
  function energy(d, r) {
    var kept = 0; for (var i = 0; i < r; i++) kept += d.sig[i] * d.sig[i];
    return kept / d.total;
  }
  // 共用原矩阵色标，像素边界对齐设备像素。
  function heat(canvas, m, max, cssWidth) {
    var size = Math.round(cssWidth * window.devicePixelRatio);
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d'), i, j, x, t, rgb, base = [245, 242, 235];
    ctx.imageSmoothingEnabled = false;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      x = m[i * N + j]; t = Math.min(1, Math.abs(x) / max); rgb = x < 0 ? [54, 101, 124] : [217, 119, 87];
      ctx.fillStyle = 'rgb(' + rgb.map(function (c, k) { return Math.round(base[k] + (c - base[k]) * t); }).join(',') + ')';
      ctx.fillRect(Math.round(j * size / N), Math.round(i * size / N), Math.round((j + 1) * size / N) - Math.round(j * size / N), Math.round((i + 1) * size / N) - Math.round(i * size / N));
    }
  }
  function chart() {
    var w = Math.round(sizes[2]), h = 232, left = 37, right = w - 12, top = 29, bottom = 192;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('height', h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    S(svg, 'title', {}, '奇异值谱，保留前 ' + rank + ' 项');
    S(svg, 'text', { x: left, y: 15, class: 'lora-axis-label' }, 'σᵢ');
    var step = (right - left) / N;
    for (var tick = 0; tick <= 2; tick++) {
      var val = current.sig[0] * tick / 2, y = bottom - (bottom - top) * tick / 2;
      S(svg, 'line', { x1: left, x2: right, y1: y, y2: y, class: 'lora-gridline' });
      S(svg, 'text', { x: left - 5, y: y + 4, 'text-anchor': 'end', class: 'tick' }, fmt(val, 2));
    }
    current.sig.forEach(function (s, i) {
      var bh = (bottom - top) * s / current.sig[0];
      var bar = S(svg, 'rect', { x: left + i * step + step * .12, y: bottom - bh, width: step * .76, height: bh, class: i < rank ? 'lora-kept' : 'lora-dropped' });
      S(bar, 'title', {}, 'σ' + (i + 1) + ' = ' + s.toPrecision(12));
    });
    S(svg, 'line', { x1: left + rank * step, x2: left + rank * step, y1: top - 6, y2: bottom, class: 'lora-cut' });
    [1, 8, 16, 24, 32, 40, N].forEach(function (i) {
      S(svg, 'text', { x: left + (i - .5) * step, y: bottom + 17, 'text-anchor': 'middle', class: 'tick' }, String(i));
    });
    S(svg, 'text', { x: right, y: h - 4, 'text-anchor': 'end', class: 'lora-axis-label' }, '序号 i');
  }
  function account(id, d, k) {
    var el = $(id), lora = rank * (d + k), full = d * k;
    el.textContent = grouped(lora) + ' / ' + grouped(full);
    var line = document.createElement('small'); line.textContent = 'LoRA / 全量：' + fmt(100 * lora / full, 4) + '％'; el.appendChild(line);
  }
  function render() {
    if (!current || !sizes) return;
    var approx = reconstruct(current, rank), residual = 0, tail = 0, i;
    for (i = 0; i < approx.length; i++) residual += Math.pow(current.m[i] - approx[i], 2);
    for (i = rank; i < N; i++) tail += current.sig[i] * current.sig[i];
    var e = energy(current, rank), err = Math.sqrt(residual / current.norm2), formula = Math.sqrt(tail / current.total);
    $('lora-energy').textContent = fmt(100 * e, 10) + '％';
    $('lora-err').textContent = fmt(err, 12); $('lora-err').title = '未舍入值：' + err.toPrecision(16);
    $('lora-formula').textContent = fmt(formula, 12) + (Math.abs(err - formula) < 1e-10 ? ' ✓' : '（未通过）');
    account('lora-params', N, N); account('lora-big', 4096, 4096);
    $('lora-approx-cap').innerHTML = 'ΔW<sub>' + rank + '</sub>，秩 ≤ ' + rank;
    $('lora-r-out').textContent = String(rank); $('lora-p-out').textContent = fmt(power, 2);
    heat($('lora-full'), current.m, current.max, sizes[0]); heat($('lora-approx'), approx, current.max, sizes[1]); chart();
    scaleNote.textContent = '共用色标：蓝灰 −' + fmt(current.max, 4) + ' ｜ 纸色 ' + fmt(0, 0) + ' ｜ 陶土 +' + fmt(current.max, 4) + '。';
    status.textContent = 'SVD 已收敛（' + current.sweeps + ' 轮）；全秩重建最大绝对误差 ' + current.reconstruction.toExponential(2) + '。';
    var label = kind === 'decay' ? 'p = ' + fmt(power, 2) + ' 时' : kind === 'lowrank' ? '秩 ' + noise.slice(0, 4).length + ' 信号加尾谱噪声时' : '随机高斯满秩矩阵中';
    var comparison = kind === 'flat' ? '高斯谱并非等高，较小的秩仍会舍弃分散在尾部的能量。' : '同秩下，随机高斯矩阵保留 ' + fmt(100 * energy(baseline, rank), 2) + '％；谱越集中，低秩近似越准确。';
    $('lora-read').textContent = label + '，前 ' + rank + ' 个奇异值保留 ' + fmt(100 * e, 2) + '％ 的能量，近似误差为 ' + fmt(100 * err, 2) + '％。' + comparison + '这里是微调更新的合成替身；真实更新的实测谱可快速衰减，但未必如此，也不是完美幂律，需按任务检验。';
    root.setAttribute('aria-busy', 'false');
  }
  function select() {
    var token = ++serial, key = kind === 'decay' ? kind + power : kind;
    current = null; root.setAttribute('aria-busy', 'true');
    ps.disabled = kind !== 'decay'; ps.setAttribute('aria-disabled', String(ps.disabled));
    $('lora-p-label').setAttribute('aria-disabled', String(ps.disabled)); $('lora-p-out').textContent = fmt(power, 2);
    status.textContent = '正在计算 SVD……';
    if (cache[key]) { ready(cache[key]); return; }
    setTimeout(function () {
      if (token !== serial) return;
      svd(generate(kind, power), token, function (d) { cache[key] = d; ready(d); });
    }, 0);
    function ready(d) { current = d; render(); }
  }
  rs.addEventListener('input', function () { rank = Math.max(1, Math.min(N, Math.round(+rs.value))); $('lora-r-out').textContent = String(rank); render(); });
  ps.addEventListener('input', function () { power = Math.max(0, Math.min(3, +ps.value)); select(); });
  Array.prototype.forEach.call($('lora-kind').querySelectorAll('button'), function (btn) {
    btn.addEventListener('click', function () {
      kind = btn.getAttribute('data-k');
      Array.prototype.forEach.call($('lora-kind').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      select();
    });
  });
  // 仅导出副本与实际 DOM 读数，供独立核验。
  window.__loraDebug = function () {
    if (!current || !sizes) return { ready: false };
    var m = [], displayed = {};
    for (var i = 0; i < N; i++) m.push(Array.prototype.slice.call(current.m, i * N, (i + 1) * N));
    ['energy', 'err', 'formula', 'params', 'big'].forEach(function (id) { displayed[id] = $('lora-' + id).textContent; });
    return { ready: true, kind: kind, p: power, r: rank, M: m, singularValues: current.sig.slice(), reconstruction: current.reconstruction, displayed: displayed };
  };
  var lastWidth = 0;
  function resize() {
    var w = root.getBoundingClientRect().width;
    if (w !== lastWidth) {
      lastWidth = w;
      sizes = [$('lora-full'), $('lora-approx'), svg].map(function (e) { return e.getBoundingClientRect().width; });
      render();
    }
  }
  // 布局完成后集中读尺寸，绘制时只写 DOM，避免强制重排。
  if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
  else { window.addEventListener('resize', resize); resize(); }
  // 无动画；减少动态效果时同样直接显示最终状态。
  root.setAttribute('aria-busy', 'true'); rs.disabled = true; ps.disabled = true;
  Array.prototype.forEach.call($('lora-kind').querySelectorAll('button'), function (b) { b.disabled = true; });
  status.textContent = '正在生成固定种子的矩阵……';
  setTimeout(function () {
    genU = orthogonal(); genV = orthogonal(); noise = [1, .8, .6, .5]; flat = empty();
    for (var i = 4; i < N; i++) noise.push(.02 + .02 * rng());
    for (i = 0; i < flat.length; i++) flat[i] = gaussian() / Math.sqrt(N);
    svd(flat, serial, function (d) {
      baseline = d; cache.flat = d; rs.disabled = false;
      Array.prototype.forEach.call($('lora-kind').querySelectorAll('button'), function (b) { b.disabled = false; });
      select();
    });
  }, 0);
})();
