/* 随机子空间：全批量交叉熵、反向传播与 Adam，全部现场计算。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var root = $('w-intrinsic'); if (!root) return;
  var H = 16, D = (2 * H + H) + (H * H + H) + H + 1;
  var dims = [1, 2, 4, 8, 16, 32, 64, 128, D];
  var cfg = { steps: 320, sourceSteps: 600, lr: 0.03, beta1: 0.9, beta2: 0.999, eps: 1e-8, angle: 30, sourceAngle: 15, noise: 0.01, modelSeed: 17 };
  var task = 'easy', seed = 1, cache = {}, bases = null, directions = {}, token = 0, result = null, busy = false;
  var svg = $('int-svg'), slider = $('int-d'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gaussian(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
  function data(n, s, hard, angle, noise) {
    var r = rng(s), x = [], y = [], c = Math.cos(angle * Math.PI / 180), t = Math.sin(angle * Math.PI / 180);
    for (var i = 0; i < n; i++) {
      var a = 2 * r() - 1, b = 2 * r() - 1, u = c * a - t * b, v = t * a + c * b;
      var label = hard ? ((Math.floor((u + 1) * 1.5) + Math.floor((v + 1) * 1.5)) % 2 + 2) % 2 : +(u * v > 0);
      if (r() < noise) label = 1 - label;
      x.push([a, b]); y.push(label);
    }
    return { x: x, y: y };
  }
  var sets = {};
  ['easy', 'hard'].forEach(function (t) { sets[t] = { train: data(200, 811, t === 'hard', cfg.angle, cfg.noise), test: data(400, 1911, t === 'hard', cfg.angle, cfg.noise) }; });
  var source = data(400, 411, false, cfg.sourceAngle, 0);
  function initial() {
    var r = rng(cfg.modelSeed), w = new Float64Array(D), i;
    for (i = 0; i < 32; i++) w[i] = gaussian(r) / Math.sqrt(2);
    for (i = 48; i < 304; i++) w[i] = gaussian(r) / Math.sqrt(H);
    for (i = 320; i < 336; i++) w[i] = gaussian(r) / Math.sqrt(H);
    return w;
  }
  // 权重按输出神经元排列：W₁、b₁、W₂、b₂、W₃、b₃。
  function network(w, set, g) {
    var a = new Float64Array(H), b = new Float64Array(H), e = new Float64Array(H), f = new Float64Array(H);
    var correct = 0, n = set.y.length, k, i, j, v, q;
    if (g) g.fill(0);
    for (k = 0; k < n; k++) {
      var x = set.x[k];
      for (i = 0; i < H; i++) a[i] = Math.tanh(w[2 * i] * x[0] + w[2 * i + 1] * x[1] + w[32 + i]);
      for (i = 0; i < H; i++) { v = w[304 + i]; for (j = 0; j < H; j++) v += w[48 + i * H + j] * a[j]; b[i] = Math.tanh(v); }
      v = w[336]; for (i = 0; i < H; i++) v += w[320 + i] * b[i];
      correct += +(+(v >= 0) === set.y[k]);
      if (!g) continue;
      q = (1 / (1 + Math.exp(-v)) - set.y[k]) / n;
      g[336] += q;
      for (i = 0; i < H; i++) { g[320 + i] += q * b[i]; e[i] = q * w[320 + i] * (1 - b[i] * b[i]); g[304 + i] += e[i]; }
      for (j = 0; j < H; j++) {
        v = 0;
        for (i = 0; i < H; i++) { g[48 + i * H + j] += e[i] * a[j]; v += w[48 + i * H + j] * e[i]; }
        f[j] = v * (1 - a[j] * a[j]); g[32 + j] += f[j]; g[2 * j] += f[j] * x[0]; g[2 * j + 1] += f[j] * x[1];
      }
    }
    return correct / n;
  }
  function trainer(base, p, set, steps) {
    var d = p ? p.length : D, z = new Float64Array(d), m = new Float64Array(d), v = new Float64Array(d);
    var w = new Float64Array(base), g = new Float64Array(D), t = 0;
    return { weights: w, done: function () { return t === steps; }, step: function () {
      network(w, set, g); t++;
      var i, j, q, c1 = 1 - Math.pow(cfg.beta1, t), c2 = 1 - Math.pow(cfg.beta2, t);
      for (j = 0; j < d; j++) {
        q = 0; if (p) { for (i = 0; i < D; i++) q += p[j][i] * g[i]; } else q = g[j];
        m[j] = cfg.beta1 * m[j] + (1 - cfg.beta1) * q;
        v[j] = cfg.beta2 * v[j] + (1 - cfg.beta2) * q * q;
        z[j] -= cfg.lr * (m[j] / c1) / (Math.sqrt(v[j] / c2) + cfg.eps);
      }
      w.set(base);
      if (p) { for (j = 0; j < d; j++) for (i = 0; i < D; i++) w[i] += p[j][i] * z[j]; }
      else { for (i = 0; i < D; i++) w[i] += z[i]; }
    } };
  }
  // 两遍改进 Gram–Schmidt；前 d 列构成嵌套随机子空间。
  function column(cols, r) {
    var a = new Float64Array(D), i, j, pass, dot, norm = 0;
    for (i = 0; i < D; i++) a[i] = gaussian(r);
    for (pass = 0; pass < 2; pass++) for (j = 0; j < cols.length; j++) {
      dot = 0; for (i = 0; i < D; i++) dot += cols[j][i] * a[i];
      for (i = 0; i < D; i++) a[i] -= dot * cols[j][i];
    }
    for (i = 0; i < D; i++) norm += a[i] * a[i];
    norm = Math.sqrt(norm); for (i = 0; i < D; i++) a[i] /= norm;
    cols.push(a);
  }
  function pct(v) { return (100 * v).toFixed(2) + '%'; }
  function d90(curve) { for (var i = 0; i < dims.length; i++) if (curve[i] >= 0.9 * curve[8]) return dims[i]; }
  function S(parent, tag, attrs, text) { var el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) el.setAttribute(k, attrs[k]); if (text != null) el.textContent = text; parent.appendChild(el); return el; }
  function draw() {
    var w = Math.round(svg.getBoundingClientRect().width), h = 320, l = 39, r = w - 18, top = 30, bottom = 239;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('height', h); svg.textContent = '';
    function X(d) { return l + Math.log(d) / Math.log(D) * (r - l); }
    var low = result ? Math.min(0.5, Math.floor(Math.min.apply(null, result.pre.concat(result.random)) * 10) / 10) : 0.5;
    function Y(a) { return bottom - (a - low) * (bottom - top) / (1 - low); }
    S(svg, 'text', { x: l, y: 16, class: 'int-note' }, '测试准确率');
    for (var j = 0; j <= Math.round((1 - low) * 10); j++) {
      var a = low + j / 10;
      S(svg, 'line', { x1: l, x2: r, y1: Y(a), y2: Y(a), class: Math.abs(a - 0.5) < 1e-8 ? 'int-chance' : 'grid' });
      S(svg, 'text', { x: l - 7, y: Y(a) + 4, 'text-anchor': 'end', class: 'tick' }, Math.round(a * 100) + '%');
    }
    dims.forEach(function (d, i) {
      S(svg, 'line', { x1: X(d), x2: X(d), y1: bottom, y2: bottom + 5, class: 'axis' });
      S(svg, 'text', { x: X(d), y: bottom + 18 + (w < 400 && i % 2 ? 12 : 0), 'text-anchor': 'middle', class: 'tick' }, d);
    });
    S(svg, 'text', { x: r, y: h - 4, 'text-anchor': 'end', class: 'int-note' }, '子空间维度 d（对数坐标）');
    if (!result) return;
    var idx = +slider.value;
    S(svg, 'line', { x1: X(dims[idx]), x2: X(dims[idx]), y1: top, y2: bottom, class: 'int-selection' });
    [result.pre, result.random].forEach(function (curve, s) {
      var cls = s ? 'int-random' : 'int-pre', cutoff = 0.9 * curve[8], d = d90(curve), points = [];
      S(svg, 'line', { x1: l, x2: r, y1: Y(cutoff), y2: Y(cutoff), class: 'int-threshold ' + cls });
      curve.forEach(function (a, i) { points.push(X(dims[i]) + ',' + Y(a)); });
      S(svg, 'polyline', { points: points.join(' '), class: 'int-curve ' + cls });
      curve.forEach(function (a, i) { var el = S(svg, 'circle', { cx: X(dims[i]), cy: Y(a), r: i === idx ? 6 : 3, class: 'int-dot ' + cls + (i === idx ? ' int-picked' : '') }); S(el, 'title', {}, 'd＝' + dims[i] + '，' + pct(a)); });
      var y = bottom + 45 + s * 14;
      S(svg, 'line', { x1: X(d), x2: X(d), y1: y - 9, y2: y + 2, class: 'int-mark ' + cls });
      S(svg, 'text', { x: X(d) + (d === D ? -5 : 5), y: y, 'text-anchor': d === D ? 'end' : 'start', class: 'int-dlabel ' + cls }, 'd₉₀');
    });
  }
  function update() {
    $('int-D').textContent = D; $('int-d-out').textContent = dims[+slider.value];
    slider.setAttribute('aria-valuetext', '子空间维度 ' + dims[+slider.value]);
    if (result) {
      method.textContent = methodText + '当前任务训练前，两个起点的测试准确率为 ' + pct(network(bases.pre, sets[task].test)) + '／' + pct(network(bases.random, sets[task].test)) + '；因此 d₉₀ 也取决于起点已有的知识。';
      $('int-full').textContent = pct(result.pre[8]) + ' / ' + pct(result.random[8]);
      $('int-cur').textContent = pct(result.pre[+slider.value]) + ' / ' + pct(result.random[+slider.value]);
      $('int-d90').textContent = d90(result.pre) + ' / ' + d90(result.random);
      $('int-read').textContent = (task === 'easy' ? '较简单' : '较难') + '的任务上，预训练点／随机起点的 d₉₀ 分别为 ' + d90(result.pre) + '／' + d90(result.random) + '，当前 d＝' + dims[+slider.value] + ' 的准确率为 ' + pct(result.pre[+slider.value]) + '／' + pct(result.random[+slider.value]) + '（' + (d90(result.pre) < d90(result.random) ? '本次预训练起点更早达标' : d90(result.pre) > d90(result.random) ? '本次预训练起点更晚达标' : '本次两个起点同时达标') + '）。每条曲线以自身全参数准确率的 90% 为门槛（同色虚线），取不含 d＝0 的扫描列表中首次达标的 d，有限步训练的曲线可能回落，低于机会水平的结果也照实显示。这是玩具网络，不是语言模型；方向种子为 ' + seed + '，所有成对读数均按预训练／随机顺序排列。';
    }
    draw();
  }
  var status = document.createElement('p'); status.id = 'int-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.insertBefore(status, svg);
  var details = document.createElement('details'); details.id = 'int-method';
  var summary = document.createElement('summary'); summary.textContent = '实验设置与训练公式'; details.appendChild(summary);
  var method = document.createElement('p');
  method.textContent = '网络为 2 → ' + H + ' → ' + H + ' → 1，隐藏层 tanh，输出 sigmoid。θ＝θ₀＋Pz，z₀＝0；L＝−mean［y log σ＋（1−y）log（1−σ）］，∇z L＝Pᵀ∇θ L。Adam：m＝β₁m＋（1−β₁）g，v＝β₂v＋（1−β₂）g²，z←z−η m̂／（√v̂＋ε），m̂、v̂ 按步数校正偏差。η＝' + cfg.lr + '，β₁＝' + cfg.beta1 + '，β₂＝' + cfg.beta2 + '，ε＝' + cfg.eps + '；下游均训练 ' + cfg.steps + ' 步，源任务训练 ' + cfg.sourceSteps + ' 步。源任务为旋转 ' + cfg.sourceAngle + '° 的同号为正类的棋盘；下游旋转 ' + cfg.angle + '°，简单任务仍为符号棋盘，困难任务按 floor［1.5（u＋1）］＋floor［1.5（v＋1）］的奇偶分格（旋转后延拓边缘格）。源／训练／测试样本数为 ' + source.y.length + '／' + sets.easy.train.y.length + '／' + sets.easy.test.y.length + '，下游标签以 ' + pct(cfg.noise) + ' 概率翻转。数据、模型初始种子固定；换方向只改变高斯矩阵 P，两遍 Gram–Schmidt 正交化，两个起点共用其前 d 列；d＝D 时 P＝I。';
  var methodText = method.textContent;
  details.appendChild(method); root.appendChild(details);
  function scan(force) {
    var id = ++token, key = task + ':' + seed, activeTask = task, activeSeed = seed, cols = directions[seed], r = rng(seed), train = null, job = 0, curves = [[], []];
    busy = true; result = null; root.setAttribute('aria-busy', 'true');
    ['int-full', 'int-cur', 'int-d90'].forEach(function (id) { $(id).textContent = '计算中'; });
    $('int-read').textContent = '正在现场训练网络。可以切换任务或随机方向；旧计算会取消，完成的曲线会缓存。'; update();
    if (!force && cache[key]) { finish(cache[key]); return; }
    function finish(value) { result = value; cache[key] = value; busy = false; root.setAttribute('aria-busy', 'false'); status.textContent = '扫描完成：' + dims.length * 2 + '／' + dims.length * 2 + '，方向种子 ' + seed + '。'; update(); }
    function work() {
      if (id !== token) return;
      var until = performance.now() + 12;
      if (!bases) {
        if (!train) train = trainer(initial(), null, source, cfg.sourceSteps);
        while (!train.done() && performance.now() < until) train.step();
        status.textContent = '计算起点：正在训练源任务。';
        if (train.done()) { bases = { pre: new Float64Array(train.weights), random: initial() }; train = null; }
      } else if (!cols || cols.length < 128) {
        if (!cols) cols = [];
        while (cols.length < 128 && performance.now() < until) column(cols, r);
        status.textContent = '正在生成正交随机方向：' + cols.length + '／' + dims[7] + '。';
        if (cols.length === 128) directions[activeSeed] = cols;
      } else {
        var s = Math.floor(job / dims.length), i = job % dims.length;
        if (!train) train = trainer(s ? bases.random : bases.pre, i === 8 ? null : cols.slice(0, dims[i]), sets[activeTask].train, cfg.steps);
        while (!train.done() && performance.now() < until) train.step();
        status.textContent = '计算中：' + job + '／' + dims.length * 2 + '，' + (s ? '随机起点' : '预训练点') + '，d＝' + dims[i] + '。';
        if (train.done()) { curves[s].push(network(train.weights, sets[activeTask].test)); train = null; job++; }
        if (job === dims.length * 2) { finish({ pre: curves[0], random: curves[1] }); return; }
      }
      setTimeout(work, 0);
    }
    setTimeout(work, 0);
  }
  slider.addEventListener('input', update);
  $('int-run').addEventListener('click', function () { scan(true); });
  $('int-seed').addEventListener('click', function () { seed++; scan(false); });
  Array.prototype.forEach.call($('int-task').querySelectorAll('button'), function (button) { button.addEventListener('click', function () {
    task = button.getAttribute('data-t');
    Array.prototype.forEach.call($('int-task').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b === button ? 'true' : 'false'); }); scan(false);
  }); });
  // 调试仅导出副本，不允许测试修改训练状态。
  window.__intrinsicDebug = function (d) {
    d = d == null ? dims[+slider.value] : Number(d);
    if (dims.indexOf(d) < 0) throw new RangeError('不支持的子空间维度');
    function arr(a) { return Array.prototype.slice.call(a); }
    return { busy: busy, task: task, seed: seed, D: D, dims: dims.slice(), config: JSON.parse(JSON.stringify(cfg)), dataset: JSON.parse(JSON.stringify(sets[task])), source: JSON.parse(JSON.stringify(source)), theta0: bases ? { pre: arr(bases.pre), random: arr(bases.random) } : null, P: directions[seed] ? (d === D ? null : directions[seed].slice(0, d).map(arr)) : null, result: result ? JSON.parse(JSON.stringify(result)) : null };
  };
  update(); status.textContent = '进入视野后开始现场训练。';
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(svg);
  else window.addEventListener('resize', draw);
  // 无曲线过渡动画；减少动态效果时也直接显示完整计算结果。
  reduced.addEventListener('change', draw);
  if ('IntersectionObserver' in window) { var observer = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) { observer.disconnect(); scan(false); } }); observer.observe(root); }
  else scan(false);
})();
