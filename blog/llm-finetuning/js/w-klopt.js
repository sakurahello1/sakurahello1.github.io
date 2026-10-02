/* KL 正则的闭式解；十个回答的奖励来自固定表。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var root = $('w-klopt'); if (!root) return;
  function S(parent, tag, attrs, value) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (value != null) el.textContent = value;
    parent.appendChild(el); return el;
  }
  function fmt(x, d) { return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−'); }
  function frame(svg) {
    var w = Math.round(svg.getBoundingClientRect().width);
    svg.setAttribute('viewBox', '0 0 ' + w + ' 320'); svg.setAttribute('height', 320);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return w;
  }
  function lse(a) {
    var m = Math.max.apply(null, a);
    return m + Math.log(a.reduce(function (sum, x) { return sum + Math.exp(x - m); }, 0));
  }
  var u = [1.2, 1, 0.8, 0.5, 0.3, 0, -0.4, -0.8, -2.5, -3.2];
  var gold = [0.9, 0.7, 0.5, 0.3, 0, -0.2, -0.5, -0.8, -1, -0.9];
  var error = [0, 0.1, -0.1, 0.2, -0.2, 0.1, 0, 0.2, 3.2, 3.8];
  var logRefZ = lse(u), logRef = u.map(function (v) { return v - logRefZ; });
  var ref = logRef.map(Math.exp);
  var baseline = ref.reduce(function (sum, v, i) { return sum + v * gold[i]; }, 0);
  var slider = $('ko-b'), lo = +slider.min, hi = +slider.max, step = +slider.step;
  var mode = 1, proxy, sweep, best, current;
  var bars = $('ko-bars'), curve = $('ko-curve');
  var buttons = Array.prototype.slice.call($('ko-noise').querySelectorAll('button'));
  function solve(logBeta) {
    var beta = Math.pow(10, logBeta), logits = u.map(function (v, i) { return v + proxy[i] / beta; });
    var norm = lse(logits), kl = 0, prx = 0, g = 0;
    var pi = logits.map(function (v, i) {
      var lp = v - norm, q = Math.exp(lp);
      kl += q * (lp - logRef[i]); prx += q * proxy[i]; g += q * gold[i]; return q;
    });
    return { logBeta: logBeta, beta: beta, pi: pi, kl: kl, prx: prx, gold: g,
      obj: prx - beta * kl, dual: beta * (norm - logRefZ) };
  }
  function frontier() {
    proxy = gold.map(function (v, i) { return v + mode * error[i]; });
    // 峰值取滑块可选值，按钮与读数完全一致。
    best = solve(lo);
    var count = Math.round((hi - lo) / step), i;
    for (i = 1; i <= count; i++) {
      var q = solve(lo + i * step); if (q.gold > best.gold) best = q;
    }
    sweep = [];
    for (i = 0; i < 120; i++) sweep.push(solve(hi - i * (hi - lo) / 119));
    sweep.push(best); sweep.sort(function (a, b) { return b.logBeta - a.logBeta; });
  }
  function text(svg, x, y, value, cls, anchor) {
    return S(svg, 'text', { x: x, y: y, class: cls || '', 'text-anchor': anchor || 'start' }, value);
  }
  function line(svg, x1, y1, x2, y2, cls) { S(svg, 'line', { x1: x1, y1: y1, x2: x2, y2: y2, class: cls }); }
  function drawBars() {
    var w = frame(bars), left = 32, right = w - 10, top = 60, bottom = 238;
    var pitch = (right - left) / u.length, bw = pitch * 0.32;
    text(bars, 0, 16, '回答概率');
    S(bars, 'rect', { x: 0, y: 30, width: 9, height: 9, class: 'ko-ref' }); text(bars, 15, 39, '参考策略');
    S(bars, 'rect', { x: 96, y: 30, width: 9, height: 9, class: 'ko-trained' }); text(bars, 111, 39, '最优策略');
    S(bars, 'rect', { class: 'plate', x: left, y: top, width: right - left, height: bottom - top });
    for (var t = 0; t <= 4; t++) {
      var v = t / 4, y = bottom - v * (bottom - top);
      line(bars, left, y, right, y, 'grid'); text(bars, left - 5, y + 4, fmt(v, v % 1 ? 2 : 0), 'tick', 'end');
    }
    ref.forEach(function (v, i) {
      var x = left + (i + 0.5) * pitch;
      [v, current.pi[i]].forEach(function (p, j) {
        var el = S(bars, 'rect', { x: x + (j ? 1 : -bw - 1), y: bottom - p * (bottom - top),
          width: bw, height: p * (bottom - top), class: j ? 'ko-trained' : 'ko-ref', 'data-i': i + 1, 'data-probability': p });
        S(el, 'title', {}, '回答 ' + (i + 1) + '，' + (j ? '最优策略' : '参考策略') + '：' + fmt(p, 8));
      });
      text(bars, x, bottom + 17, String(i + 1), 'tick', 'middle');
      if (i >= u.length - 2) {
        var cy = bottom + 29;
        S(bars, 'path', { class: 'ko-bad', d: 'M' + (x - 3) + ' ' + (cy - 3) + 'l6 6M' + (x + 3) + ' ' + (cy - 3) + 'l-6 6' });
        // 窄屏错开负奖励，保留字号与完整数值。
        text(bars, x, bottom + 47 + (w < 350 && i === u.length - 1 ? 14 : 0), fmt(gold[i], 1), 'ko-gold-label', 'middle');
      }
    });
    text(bars, left, 314, '回答编号；× 下方为真实奖励', 'ko-note');
  }
  function drawCurve() {
    var w = frame(curve), left = 34, right = w - 14, top = 60, bottom = 238;
    var xmax = Math.ceil(Math.max.apply(null, sweep.map(function (q) { return q.kl; })));
    var ymin = Math.floor(Math.min(baseline, Math.min.apply(null, sweep.map(function (q) { return q.gold; }))));
    var ymax = Math.ceil(Math.max.apply(null, sweep.map(function (q) { return q.prx; })));
    function X(x) { return left + x / xmax * (right - left); }
    function Y(y) { return bottom - (y - ymin) / (ymax - ymin) * (bottom - top); }
    text(curve, 0, 16, '期望奖励'); text(curve, 0, 39, mode ? '减小 β，沿曲线向右' : '没有误差：两条曲线重合', 'ko-note');
    S(curve, 'rect', { class: 'plate', x: left, y: top, width: right - left, height: bottom - top });
    for (var i = 0; i <= 4; i++) {
      var v = ymin + (ymax - ymin) * i / 4;
      line(curve, left, Y(v), right, Y(v), 'grid'); text(curve, left - 6, Y(v) + 4, fmt(v, v % 1 ? 2 : 0), 'tick', 'end');
      v = xmax * i / 4; text(curve, X(v), bottom + 18, fmt(v, v % 1 ? 2 : 0), 'tick', 'middle');
    }
    line(curve, left, Y(baseline), right, Y(baseline), 'ko-baseline');
    ['prx', 'gold'].forEach(function (key) {
      if (!mode && key === 'gold') return;
      S(curve, 'polyline', { class: 'ko-line ko-' + key, points: sweep.map(function (q) {
        return X(q.kl).toFixed(3) + ',' + Y(q[key]).toFixed(3);
      }).join(' ') });
    });
    S(curve, 'circle', { cx: X(best.kl), cy: Y(best.gold), r: 8, class: 'ko-peak' });
    ['prx', 'gold'].forEach(function (key) {
      if (!mode && key === 'gold') return;
      S(curve, 'circle', { cx: X(current.kl), cy: Y(current[key]), r: 4.5, class: 'ko-current ko-' + key });
    });
    text(curve, right, 278, '相对参考策略的 KL（nat）', '', 'end');
    line(curve, 0, 306, 20, 306, 'ko-baseline'); text(curve, 26, 310, '参考策略真实奖励：' + fmt(baseline, 4), 'ko-note');
  }
  function draw() { drawBars(); drawCurve(); }
  function update() {
    current = solve(+slider.value);
    $('ko-b-out').textContent = fmt(current.beta, 5); slider.setAttribute('aria-valuetext', 'β＝' + fmt(current.beta, 5));
    ['kl', 'prx', 'gold'].forEach(function (key) { $('ko-' + key).textContent = fmt(current[key], 8); });
    $('ko-obj').textContent = fmt(current.obj, 10) + ' ／ ' + fmt(current.dual, 10) + (Math.abs(current.obj - current.dual) < 1e-9 ? ' ✓' : '（不一致）');
    $('ko-obj').setAttribute('aria-label', '目标值 ' + fmt(current.obj, 10) + '，β log Z ' + fmt(current.dual, 10));
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-e') === mode)); });
    $('ko-read').textContent = '在滑块网格上，真实奖励最高为 ' + fmt(best.gold, 5) + '（β*＝' + fmt(best.beta, 5) +
      '，KL*＝' + fmt(best.kl, 5) + '；log₁₀β 步长为 ' + fmt(step, 2) + (mode ? '）' : '，位于扫描边界）') +
      '；当前为 ' + fmt(current.gold, 5) + '，参考策略为 ' + fmt(baseline, 5) + '。回答 ' + (u.length - 1) + '、' + u.length +
      ' 的合计概率为 ' + fmt((current.pi[u.length - 2] + current.pi[u.length - 1]) * 100, 3) + '％' +
      (mode ? '，它们的代理高分来自误差' : '，此时代理奖励等于真实奖励，奖励随 KL 单调增加') +
      '。这是' + u.length + '个回答的闭式解玩具；有误差时的“代理上升、真实先升后降”，对应 Gao 等人在实际训练的奖励模型上测量的过度优化现象，其金标准也是奖励模型。';
    draw();
  }
  slider.addEventListener('input', update);
  buttons.forEach(function (b) { b.addEventListener('click', function () { mode = +b.getAttribute('data-e'); frontier(); update(); }); });
  $('ko-best').addEventListener('click', function () { slider.value = best.logBeta.toFixed(2); update(); });
  var lastW = 0;
  function resize() {
    var w = root.getBoundingClientRect().width;
    if (w !== lastW) { lastW = w; draw(); }
  }
  frontier(); update();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
  else window.addEventListener('resize', resize);
}());
