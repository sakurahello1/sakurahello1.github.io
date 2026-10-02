/* 零阶微调：真实的两次损失评估；跨维数共享随机前缀。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var root = $('w-zo'); if (!root) return;
  var svg = $('zo-svg'), dS = $('zo-d'), rS = $('zo-r');
  var NS = 'http://www.w3.org/2000/svg', RUNS = 20, EPS = 1e-3, TAIL = 1e-6;
  var TARGET = .01, FLOOR = .001, seed = 42, ticket = 0, timer, result = null;
  var status = document.createElement('output');
  status.id = 'zo-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.querySelector('.w-ctrl').insertAdjacentElement('afterend', status);
  var detail = document.createElement('details'); detail.className = 'zo-details';
  detail.innerHTML = '<summary>查看实验设定与公式</summary><p id="zo-formula"></p>' +
    '<p class="zo-equation">L(θ)＝½Σλᵢθᵢ²，g＝Hθ。<br>ĝ＝［L(θ＋εz)−L(θ−εz)］z／（2ε），θ′＝θ−ηĝ。<br>E［ĝ］＝g（二次损失的中心差分无截断误差）。<br>E［L(θ′)］＝L−η‖g‖²＋½η²［‖g‖²tr(H)＋2gᵀHg］。</p>' +
    '<p>由 gᵀHg ≤ λ_max‖g‖²，取 η_ZO＝1／［tr(H)＋2λ_max］，期望下降至少为 ½η_ZO‖g‖²；一阶取 η_GD＝1／λ_max，下降至少为 ½η_GD‖g‖²。两个保证的比是 r_eff＋2，比较的是同一点处的单步进展，不是两条随机轨迹的首次达标时间。每步额外评估一次未扰动损失仅用于绘图；估计器只用两次扰动损失。</p>';
  root.appendChild(detail);
  function fmt(x, n) { return x.toFixed(n == null ? 3 : n); }
  function S(parent, tag, attrs, text) {
    var el = document.createElementNS(NS, tag);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    if (text != null) el.textContent = text;
    parent.appendChild(el); return el;
  }
  function frame(h) {
    var w = Math.max(260, Math.round(svg.getBoundingClientRect().width));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('height', h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return w;
  }
  // Mulberry32 与 Box–Muller；缓冲区仅在实验开始时分配。
  var rng = 0;
  function uniform() {
    rng = rng + 0x6D2B79F5 | 0;
    var t = Math.imul(rng ^ rng >>> 15, 1 | rng);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function normal(out, s) {
    rng = s;
    for (var i = 0; i < out.length; i += 2) {
      var a = Math.sqrt(-2 * Math.log(1 - uniform())), b = 2 * Math.PI * uniform();
      out[i] = a * Math.cos(b);
      if (i + 1 < out.length) out[i + 1] = a * Math.sin(b);
    }
  }
  function loss(theta, lambda, z, e) {
    var sum = 0;
    for (var i = 0; i < theta.length; i++) {
      var x = theta[i] + e * z[i]; sum += lambda[i] * x * x;
    }
    return sum / 2;
  }
  function quantile(sorted, p) {
    var x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
    if (lo === hi || sorted[lo] === sorted[hi]) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
  }
  function steps(x, n) { return isFinite(x) ? String(x) : '> ' + n; }
  function boundary() {
    var d = Math.max(20, Math.min(400, Math.round(Number(dS.value) / 20) * 20));
    var r = Math.max(1, Math.min(100, d, Math.round(Number(rS.value))));
    dS.value = d; rS.max = Math.min(100, d); rS.value = r;
    $('zo-d-out').textContent = d; $('zo-r-out').textContent = r;
    rS.setAttribute('aria-valuetext', r + ' 个活跃方向，上限 ' + rS.max);
    return { d: d, r: r };
  }
  function request(delay) {
    clearTimeout(timer); ticket++;
    var config = boundary(), mine = ticket;
    root.setAttribute('aria-busy', 'true'); root.removeAttribute('data-result');
    result = null; draw();
    ['zo-reff', 'zo-gd', 'zo-zo', 'zo-ratio'].forEach(function (id) { $(id).textContent = '计算中'; });
    $('zo-read').textContent = '正在计算同一起点的一阶轨迹与独立零阶轨迹。调整参数会立即取消旧实验。';
    $('zo-formula').textContent = '正在生成当前参数的实验设定。';
    $('zo-status').textContent = '准备计算……';
    timer = setTimeout(function () { compute(config, mine); }, delay);
  }
  function compute(c, mine) {
    var d = c.d, r = c.r, lambda = new Float64Array(d), initial = new Float64Array(d);
    var theta = new Float64Array(d), z = new Float64Array(d), tr = 0, largest = 0, i;
    for (i = 0; i < d; i++) {
      lambda[i] = i >= r ? TAIL : r === 1 ? 1 : Math.pow(10, -i / (r - 1));
      tr += lambda[i]; largest = Math.max(largest, lambda[i]);
    }
    var reff = tr / largest, factor = reff + 2, eta = 1 / (tr + 2 * largest);
    var n = Math.min(6000, Math.max(200, Math.ceil(40 * factor))), gd = new Float64Array(n + 1);
    var curves = [], hits = [], run = -1, k = 0, hit = Infinity, started = performance.now();
    normal(initial, seed); theta.set(initial);
    var l0 = loss(initial, lambda, z, 0), gdHit = Infinity;
    gd[0] = 1;
    for (i = 0; i < RUNS; i++) { curves.push(new Float64Array(n + 1)); curves[i][0] = 1; }
    // 每批约十二毫秒，参数变化立即取消旧批次。
    function chunk() {
      if (mine !== ticket) return;
      var until = performance.now() + 12;
      do {
        k++;
        if (run < 0) {
          for (i = 0; i < d; i++) theta[i] *= 1 - lambda[i] / largest;
        } else {
          normal(z, seed + Math.imul(run + 1, 0x9e3779b9) + Math.imul(k, 0x85ebca6b) | 0);
          var slope = (loss(theta, lambda, z, EPS) - loss(theta, lambda, z, -EPS)) / (2 * EPS);
          for (i = 0; i < d; i++) theta[i] -= eta * slope * z[i];
        }
        var relative = loss(theta, lambda, z, 0) / l0;
        if (hit === Infinity && relative <= TARGET) hit = k;
        if (run < 0) gd[k] = relative; else curves[run][k] = relative;
        if (k === n) {
          if (run < 0) gdHit = hit; else hits.push(hit);
          run++; k = 0; hit = Infinity; theta.set(initial);
        }
      } while (run < RUNS && performance.now() < until);
      $('zo-status').textContent = '计算进度 ' + Math.floor(((run + 1) * n + k) / ((RUNS + 1) * n) * 100) + '%';
      if (run < RUNS) { setTimeout(chunk, 0); return; }
      var bands = [new Float64Array(n + 1), new Float64Array(n + 1), new Float64Array(n + 1)];
      var sorted = new Array(RUNS), step = 0;
      function aggregate() {
        if (mine !== ticket) return;
        var end = performance.now() + 12;
        do {
          for (var j = 0; j < RUNS; j++) sorted[j] = curves[j][step];
          sorted.sort(function (a, b) { return a - b; });
          bands[0][step] = quantile(sorted, .1); bands[1][step] = quantile(sorted, .5); bands[2][step] = quantile(sorted, .9);
          step++;
        } while (step <= n && performance.now() < end);
        if (step <= n) { setTimeout(aggregate, 0); return; }
        hits.sort(function (a, b) { return a - b; });
        result = { d: d, r: r, reff: reff, tr: tr, largest: largest, factor: factor, eta: eta, n: n,
          l0: l0, gd: gd, bands: bands, gdHit: gdHit, zoHit: quantile(hits, .5),
          missed: hits.filter(function (v) { return !isFinite(v); }).length, ms: performance.now() - started };
        finish();
      }
      setTimeout(aggregate, 0);
    }
    chunk();
  }
  function finish() {
    var a = result, ratio = a.zoHit / a.gdHit;
    $('zo-reff').textContent = fmt(a.reff, 6);
    $('zo-gd').textContent = steps(a.gdHit, a.n);
    $('zo-zo').textContent = steps(a.zoHit, a.n);
    $('zo-ratio').textContent = (isFinite(ratio) ? fmt(ratio) : '未达标') + ' / ' + fmt(a.factor);
    $('zo-read').textContent = 'd＝' + a.d + '、r＝' + a.r + ' 时，零阶首次降到 ' + TARGET * 100 + '% 的步数中位数为 ' + steps(a.zoHit, a.n) + '，一阶为 ' + steps(a.gdHit, a.n) + '，实测减速' + (isFinite(ratio) ? '为 ' + fmt(ratio) + ' 倍，即公式因子 ' + fmt(a.factor) + ' 的 ' + fmt(ratio / a.factor, 2) + ' 倍' : '尚不可确定') + '。r_eff＋2 比较单步期望下降的保证，不是首次达标步数比的上界；固定 r 再改变 d，可观察微小尾谱的影响。这里是 MeZO 分析背后的二次玩具，真实大模型损失并非二次函数，论文依赖微调轨迹附近 Hessian 的低有效秩假设。';
    $('zo-status').textContent = '已完成 ' + RUNS + ' 条零阶轨迹 · 每条 ' + a.n + ' 步 · 未达标 ' + a.missed + ' 条';
    $('zo-formula').textContent = '活跃特征值：' + (a.r === 1 ? 'λ₁＝' + a.largest : 'λᵢ＝10^(−（i−1）/（r−1）)，i＝1…r') + '；尾部特征值＝' + TAIL.toExponential(0) + '。θ₀、z 均为标准高斯；种子＝' + seed + '，跨维数共享随机前缀；' + RUNS + ' 条零阶轨迹共用同一个 θ₀，扰动流彼此独立。L₀＝' + fmt(a.l0, 6) + '，tr(H)＝' + fmt(a.tr, 6) + '，λ_max＝' + fmt(a.largest) + '，ε＝' + EPS + '，η_GD＝' + fmt(1 / a.largest, 6) + '，η_ZO＝' + fmt(a.eta, 6) + '。N_max＝min（6000，max（200，⌈40（r_eff＋2）⌉））＝' + a.n + '；未达标轨迹按右删失处理，中间两个次序统计量若有删失则显示大于窗口。阴影是每一步的分位数；步数统计先求每条轨迹的首次达标时间，再取中位数，两者不必在同一步穿线。图外损失被裁去，显示范围为 ' + FLOOR + '…' + a.gd[0] + '。';
    root.setAttribute('data-result', JSON.stringify({ d: a.d, r: a.r, seed: seed, reff: a.reff, gd: a.gdHit, zo: a.zoHit, n: a.n, ms: a.ms, missed: a.missed }));
    draw(); root.setAttribute('aria-busy', 'false');
  }
  function draw() {
    var w = frame(310), left = 44, right = w - 12, top = 36, bottom = 258, n = result ? result.n : 200;
    function X(v) { return left + Math.log(1 + v) / Math.log(1 + n) * (right - left); }
    function Y(v) { return bottom - (Math.log(Math.max(v, 1e-300)) - Math.log(FLOOR)) / -Math.log(FLOOR) * (bottom - top); }
    S(svg, 'text', { x: left, y: 18, class: 'zo-axis-label' }, '相对损失 L / L₀');
    S(svg, 'rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'plate' });
    for (var p = 0; p >= -3; p--) {
      var v = Math.pow(10, p), y = Y(v);
      S(svg, 'line', { x1: left, x2: right, y1: y, y2: y, class: v === TARGET ? 'zo-target' : 'grid' });
      S(svg, 'text', { x: left - 7, y: y + 4, 'text-anchor': 'end', class: 'tick' }, String(v));
    }
    S(svg, 'text', { x: right - 6, y: Y(TARGET) - 7, 'text-anchor': 'end', class: 'zo-target-label' }, TARGET * 100 + '% 阈值');
    var ticks = [0, 1, 10, 100, 1000], last = -Infinity;
    ticks.forEach(function (t) {
      var x = X(t);
      if (t > n || x - last < 25 || right - x < 34) return;
      S(svg, 'text', { x: x, y: bottom + 19, 'text-anchor': 'middle', class: 'tick' }, String(t)); last = x;
    });
    S(svg, 'text', { x: right, y: bottom + 19, 'text-anchor': 'end', class: 'tick' }, String(n));
    S(svg, 'text', { x: right, y: bottom + 42, 'text-anchor': 'end', class: 'zo-axis-label' }, '步数（log（1＋步数））');
    if (!result) return;
    S(S(S(svg, 'defs', {}), 'clipPath', { id: 'zo-clip' }), 'rect', { x: left, y: top, width: right - left, height: bottom - top });
    var g = S(svg, 'g', { 'clip-path': 'url(#zo-clip)' });
    // 保留逐步数据，不平滑曲线。
    function line(data, reverse) {
      var out = '';
      for (var j = 0; j <= n; j++) {
        var k = reverse ? n - j : j;
        out += (j ? 'L' : 'M') + X(k).toFixed(2) + ' ' + Y(data[k]).toFixed(2);
      }
      return out;
    }
    S(g, 'path', { class: 'zo-band', d: line(result.bands[2], false) + line(result.bands[0], true).replace(/^M/, 'L') + 'Z' });
    S(g, 'path', { class: 'zo-gd-line', d: line(result.gd, false) });
    S(g, 'path', { class: 'zo-line', d: line(result.bands[1], false) });
    var samples = [0, 1, 10, 100, n], unique = {};
    samples.forEach(function (k) {
      if (unique[k] || k > n) return; unique[k] = true;
      S(svg, 'metadata', { 'data-step': k }, JSON.stringify([result.gd[k], result.bands[0][k], result.bands[1][k], result.bands[2][k]]));
    });
  }
  dS.addEventListener('input', function () { request(140); });
  rS.addEventListener('input', function () { request(140); });
  $('zo-run').addEventListener('click', function () { request(0); });
  $('zo-seed').addEventListener('click', function () { seed++; request(0); });
  var lastW = 0;
  function resize() { var w = svg.getBoundingClientRect().width; if (w !== lastW) { lastW = w; draw(); } }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(svg);
  if (document.fonts) document.fonts.ready.then(resize);
  request(0);
})();
