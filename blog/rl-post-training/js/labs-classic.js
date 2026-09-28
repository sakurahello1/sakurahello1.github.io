(function () {
  'use strict';
  // Everything above mount() is deterministic, DOM-free and available to Node tests.
  const Core = {};
  const GAMMA = 0.98;
  const zeros = n => Array(n).fill(0);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function softmax(z) {
    const m = Math.max(...z), e = z.map(x => Math.exp(x - m)), sum = e.reduce((a, b) => a + b);
    return e.map(x => x / sum);
  }
  const policy = theta => Array.from({ length: 9 }, (_, s) => softmax(theta.slice(3 * s, 3 * s + 3)));
  function transition(s, a, wind) {
    const ns = s + (a - 1) * (wind < 0.1 ? -1 : 1);
    return { ns, r: -0.01 + (ns === 0 ? -1 : ns === 8 ? 1 : 0), done: ns === 0 || ns === 8 };
  }
  function episode(p, random) {
    const steps = [];
    let s = 2;
    for (let t = 0; t < 30; t++) {
      const u = random(), a = u < p[s][0] ? 0 : u < p[s][0] + p[s][1] ? 1 : 2;
      const tr = transition(s, a, random());
      steps.push({ s, a, t, ...tr, done: tr.done || t === 29 });
      s = tr.ns;
      if (tr.done) break;
    }
    const total = steps.reduce((v, x) => v + x.r, 0);
    return { steps, total, discounted: returns(steps)[0], end: s,
      outcome: s === 8 ? '登顶' : s === 0 ? '坠崖' : '超时' };
  }
  function returns(steps) {
    let g = 0;
    const out = zeros(steps.length);
    for (let t = steps.length - 1; t >= 0; t--) out[t] = g = steps[t].r + GAMMA * g;
    return out;
  }
  function gae(steps, v, lambda) {
    let a = 0;
    const out = zeros(steps.length);
    for (let t = steps.length - 1; t >= 0; t--) {
      const x = steps[t], cont = x.done ? 0 : 1;
      const d = x.r + GAMMA * cont * v[x.ns] - v[x.s];
      out[t] = a = d + GAMMA * lambda * cont * a;
    }
    return out;
  }
  function scoreAdd(g, p, s, a, w) {
    for (let b = 0; b < 3; b++) g[3 * s + b] += w * ((a === b ? 1 : 0) - p[s][b]);
  }
  function estimate(batch, p, v, method, lambda = 0.95) {
    const g = zeros(27);
    batch.forEach(ep => {
      const gs = returns(ep.steps), as = gae(ep.steps, v, lambda);
      ep.steps.forEach((x, t) => {
        const w = method === 'reinforce' ? gs[0] :
          Math.pow(GAMMA, t) * (method === 'baseline' ? gs[t] - v[x.s] : as[t]);
        scoreAdd(g, p, x.s, x.a, w / batch.length);
      });
    });
    return g;
  }
  function kl(p, q) {
    return Math.max(0, p.reduce((s, x, i) => s + (x ? x * Math.log(x / Math.max(1e-300, q[i])) : 0), 0));
  }
  function stateWeights(batch) {
    const w = zeros(9);
    let n = 0;
    batch.forEach(e => e.steps.forEach(x => { w[x.s]++; n++; }));
    return w.map(x => x / n);
  }
  const avgKL = (p, q, w) => w.reduce((s, x, i) => s + x * kl(p[i], q[i]), 0);
  // Sample states; sum all three actions analytically. This is the KL Hessian.
  function fisherVector(p, weights, vec, damping = 0.001) {
    const out = vec.map(x => damping * x);
    for (let s = 0; s < 9; s++) {
      const m = dot(p[s], vec.slice(3 * s, 3 * s + 3));
      for (let a = 0; a < 3; a++) out[3 * s + a] += weights[s] * p[s][a] * (vec[3 * s + a] - m);
    }
    return out;
  }
  function solve(matrix, b) {
    const n = b.length, a = matrix.map((r, i) => r.concat(b[i]));
    for (let k = 0; k < n; k++) {
      let pivot = k;
      for (let j = k + 1; j < n; j++) if (Math.abs(a[j][k]) > Math.abs(a[pivot][k])) pivot = j;
      [a[k], a[pivot]] = [a[pivot], a[k]];
      if (Math.abs(a[k][k]) < 1e-16) throw new Error('Singular linear system');
      const div = a[k][k];
      for (let j = k; j <= n; j++) a[k][j] /= div;
      for (let i = 0; i < n; i++) if (i !== k) {
        const c = a[i][k];
        for (let j = k; j <= n; j++) a[i][j] -= c * a[k][j];
      }
    }
    return a.map(row => row[n]);
  }
  function cg(fvp, b, max = 27, tol = 1e-12) {
    let x = zeros(b.length), r = b.slice(), d = r.slice(), rr = dot(r, r), it = 0;
    while (it < max && rr > tol) {
      const fd = fvp(d), den = dot(d, fd);
      if (den <= 1e-20) break;
      const alpha = rr / den;
      x = add(x, d, alpha); r = add(r, fd, -alpha);
      const next = dot(r, r);
      d = add(r, d, next / rr); rr = next; it++;
    }
    return { x, iterations: it, residual: Math.sqrt(rr) };
  }
  const clipObjective = (r, a, eps) => Math.min(r * a, clamp(r, 1 - eps, 1 + eps) * a);
  const clipSlope = (r, a, eps) => (a > 0 && r > 1 + eps) || (a < 0 && r < 1 - eps) ? 0 : a;
  const adaptBeta = (beta, d, target) => d > 1.5 * target ? beta * 2 : d < target / 1.5 ? beta / 2 : beta;
  function normalize(a) {
    const m = mean(a), sd = Math.sqrt(mean(a.map(x => (x - m) ** 2)));
    return a.map(x => (x - m) / (sd + 1e-8));
  }
  function evaluate(p) {
    let val = zeros(9), success = zeros(9), raw = zeros(9), visits = zeros(9);
    for (let h = 1; h <= 30; h++) {
      const nv = zeros(9), ns = zeros(9), nr = zeros(9);
      for (let s = 1; s < 8; s++) for (let a = 0; a < 3; a++) {
        [[0.5, 0.9], [0.05, 0.1]].forEach(([wind, prob]) => {
          const tr = transition(s, a, wind), w = prob * p[s][a];
          nv[s] += w * (tr.r + (tr.done ? 0 : GAMMA * val[tr.ns]));
          nr[s] += w * (tr.r + (tr.done ? 0 : raw[tr.ns]));
          ns[s] += w * (tr.ns === 8 ? 1 : tr.done ? 0 : success[tr.ns]);
        });
      }
      val = nv; raw = nr; success = ns;
    }
    let dist = zeros(9); dist[2] = 1;
    for (let t = 0; t < 30; t++) {
      const next = zeros(9);
      for (let s = 1; s < 8; s++) {
        visits[s] += dist[s];
        for (let a = 0; a < 3; a++) for (const [wind, prob] of [[0.5, 0.9], [0.05, 0.1]]) {
          const tr = transition(s, a, wind);
          if (!tr.done) next[tr.ns] += dist[s] * p[s][a] * prob;
        }
      }
      dist = next;
    }
    const stuck = p.map((row, s) => ({ s, a: row.indexOf(Math.max(...row)), p: Math.max(...row), visits: visits[s] }))
      .filter(x => x.a === 1 && x.p > 0.99 && x.visits > 5).sort((a, b) => b.visits - a.visits)[0];
    return { success: success[2], discounted: val[2], reward: raw[2], stuck: stuck || null };
  }
  const defaults = { lr: 0.35, batch: 16, lambda: 0.95, delta: 0.01,
    damping: 0.001, epochs: 6, minibatch: 32, ppoLR: 0.35, eps: 0.2, rounds: 180 };
  function trainer(method = 'reinforce', seed = 7, options = {}) {
    return { method, seed, random: rng(seed), theta: zeros(27), v: zeros(9), beta: 1,
      options: Object.assign({}, defaults, options), round: 0, history: [], episodes: [], reached: null };
  }
  function surrogate(rows, old, p) {
    return mean(rows.map(x => (p[x.s][x.a] / old[x.s][x.a] - 1) * x.adv));
  }
  // Generators expose small work units to the browser's shared 4 ms scheduler.
  function* update(model) {
    const o = model.options, old = policy(model.theta), batch = [];
    for (let i = 0; i < o.batch; i++) { batch.push(episode(old, model.random)); yield; }
    const weights = stateWeights(batch), rows = [], sums = zeros(9), counts = zeros(9);
    batch.forEach(ep => {
      const gs = returns(ep.steps), as = gae(ep.steps, model.v, o.lambda);
      ep.steps.forEach((x, t) => {
        rows.push({ ...x, adv: as[t], target: as[t] + model.v[x.s] });
        sums[x.s] += model.method === 'baseline' ? gs[t] : as[t] + model.v[x.s]; counts[x.s]++;
      });
    });
    yield;
    let attempts = [], iterations = 0;
    if (['reinforce', 'baseline', 'gae'].includes(model.method)) {
      const g = estimate(batch, old, model.v, model.method, o.lambda);
      model.theta = add(model.theta, g, o.lr);
    } else if (model.method === 'npg' || model.method === 'trpo') {
      const g = zeros(27), av = normalize(rows.map(x => x.adv));
      rows.forEach((x, i) => { x.adv = av[i]; scoreAdd(g, old, x.s, x.a, x.adv / rows.length); });
      const fvp = v => fisherVector(old, weights, v, o.damping);
      let direction;
      if (model.method === 'npg') {
        const matrix = Array.from({ length: 27 }, () => zeros(27));
        for (let j = 0; j < 27; j++) {
          const e = zeros(27); e[j] = 1;
          fvp(e).forEach((x, i) => { matrix[i][j] = x; });
          yield;
        }
        direction = solve(matrix, g);
      } else {
        const result = cg(fvp, g); direction = result.x; iterations = result.iterations;
      }
      const alpha = Math.sqrt(2 * o.delta / Math.max(1e-20, dot(g, direction)));
      const origin = model.theta.slice();
      for (let j = 0; j < (model.method === 'npg' ? 1 : 12); j++) {
        const candidate = add(origin, direction, alpha * Math.pow(0.5, j));
        const p = policy(candidate), d = avgKL(old, p, weights), gain = surrogate(rows, old, p);
        const accepted = model.method === 'npg' || (d <= o.delta && gain > 0);
        attempts.push({ j, kl: d, gain, accepted });
        if (accepted) { model.theta = candidate; break; }
        yield;
      }
    } else {
      for (let epoch = 0; epoch < o.epochs; epoch++) {
        const order = rows.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(model.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
        }
        for (let k = 0; k < order.length; k += o.minibatch) {
          const mini = order.slice(k, k + o.minibatch), adv = normalize(mini.map(x => x.adv));
          const p = policy(model.theta), g = zeros(27);
          mini.forEach((x, i) => {
            const r = p[x.s][x.a] / old[x.s][x.a];
            const a = model.method === 'clip' ? clipSlope(r, adv[i], o.eps) : adv[i];
            scoreAdd(g, p, x.s, x.a, r * a / mini.length);
            if (model.method === 'penalty') for (let b = 0; b < 3; b++) {
              g[3 * x.s + b] -= model.beta * (p[x.s][b] - old[x.s][b]) / mini.length;
            }
          });
          model.theta = add(model.theta, g, o.ppoLR);
          yield;
        }
      }
    }
    for (let s = 1; s < 8; s++) if (counts[s]) model.v[s] += 0.3 * (sums[s] / counts[s] - model.v[s]);
    const p = policy(model.theta), d = avgKL(old, p, weights);
    if (model.method === 'penalty') model.beta = adaptBeta(model.beta, d, o.delta);
    model.round++;
    const metrics = evaluate(p);
    if (metrics.success >= 0.9 && model.reached === null) model.reached = model.round;
    model.episodes = batch.slice(-3);
    model.history.push({ round: model.round, reward: mean(batch.map(x => x.total)),
      kl: d, beta: model.beta, ...metrics, sampleReward: mean(batch.map(x => x.total)), attempts, iterations });
    return model.history[model.history.length - 1];
  }
  function exhaust(iterator) { let x; do { x = iterator.next(); } while (!x.done); return x.value; }
  const train = (model, n) => { for (let i = 0; i < n; i++) exhaust(update(model)); return model; };

  function* variance(seed = 7) {
    const random = rng(seed), theta = zeros(27);
    for (let s = 1; s < 8; s++) theta[3 * s + 2] = 0.6;
    const p = policy(theta), v = zeros(9), sums = zeros(9), counts = zeros(9);
    // An independent Monte Carlo fit keeps the control variate independent of plotted batches.
    for (let n = 0; n < 4096; n++) {
      const ep = episode(p, random), gs = returns(ep.steps);
      ep.steps.forEach((x, t) => { sums[x.s] += gs[t]; counts[x.s]++; });
      if (n % 8 === 0) yield { stage: 'fit', progress: n / 4096 };
    }
    v.forEach((_, s) => { v[s] = counts[s] ? sums[s] / counts[s] : 0; });
    let truth = zeros(27);
    for (let n = 0; n < 16384; n++) {
      truth = add(truth, estimate([episode(p, random)], p, v, 'reinforce'), 1 / 16384);
      if (n % 8 === 0) yield { stage: 'reference', progress: n / 16384 };
    }
    const norm = Math.sqrt(dot(truth, truth)), unit = truth.map(x => x / norm);
    const groups = [[], [], []], methods = ['reinforce', 'baseline', 'gae'];
    for (let n = 0; n < 60; n++) {
      const batch = Array.from({ length: 8 }, () => episode(p, random));
      methods.forEach((method, j) => {
        const g = estimate(batch, p, v, method), x = dot(g, unit), length = Math.sqrt(dot(g, g));
        groups[j].push({ g, x, y: Math.sqrt(Math.max(0, length * length - x * x)), cosine: x / Math.max(1e-12, length) });
      });
      yield { stage: 'points', groups, truth, norm, count: n + 1 };
    }
    const stats = groups.map(group => {
      const center = zeros(27);
      group.forEach(x => x.g.forEach((z, i) => { center[i] += z / group.length; }));
      return { cosine: mean(group.map(x => x.cosine)), variance: mean(group.map(x => dot(add(x.g, center, -1), add(x.g, center, -1)))), bias: Math.sqrt(dot(add(center, truth, -1), add(center, truth, -1))) };
    });
    return { groups, truth, norm, stats, v, p };
  }
  const fixedPath = [2, 3, 4, 3, 4, 5, 6, 7, 8];
  const fixedSteps = () => fixedPath.slice(0, -1).map((s, t) => ({ s, ns: fixedPath[t + 1],
    a: fixedPath[t + 1] > s ? 2 : 0, t, r: t === fixedPath.length - 2 ? 0.99 : -0.01, done: t === fixedPath.length - 2 }));
  function bandit(theta) {
    const p = softmax([10 * theta[0], 0.1 * theta[1], 0]), rewards = [0.2, 1, 0];
    const j = dot(p, rewards), g = [10 * p[0] * (rewards[0] - j), 0.1 * p[1] * (rewards[1] - j)];
    const f = [[100 * p[0] * (1 - p[0]), -p[0] * p[1]], [-p[0] * p[1], 0.01 * p[1] * (1 - p[1])]];
    return { p, j, g, f };
  }
  function banditStep(theta, mode, lr = 0.03, delta = 0.01) {
    const b = bandit(theta);
    if (mode === 'ordinary') return { theta: add(theta, b.g, lr), attempts: [] };
    const fvp = v => b.f.map((row, i) => dot(row, v) + 1e-10 * v[i]);
    const solved = cg(fvp, b.g, 8, 1e-22), d = solved.x;
    const alpha = Math.sqrt(2 * delta / Math.max(1e-24, dot(d, b.f.map(row => dot(row, d)))));
    const attempts = [];
    for (let j = 0; j < 14; j++) {
      const next = add(theta, d, alpha * Math.pow(0.5, j)), bn = bandit(next);
      const actual = kl(b.p, bn.p), gain = bn.j - b.j;
      const accepted = mode === 'natural' || (actual <= delta && gain > 0);
      attempts.push({ j, theta: next, kl: actual, gain, accepted });
      if (accepted) return { theta: next, attempts, iterations: solved.iterations, origin: theta, f: b.f };
    }
    return { theta: theta.slice(), attempts, iterations: solved.iterations, origin: theta, f: b.f };
  }
  const mmJ = t => 0.25 + 1.1 * Math.exp(-((t - 3.4) ** 2) / 2.2);
  const mmD = t => (mmJ(t) - 0.25) * (-2 * (t - 3.4) / 2.2);
  const mmM = (t, origin) => mmJ(origin) + mmD(origin) * (t - origin) - 0.55 * (t - origin) ** 2;
  const mmStep = t => t + mmD(t) / 1.1;
  function niceTicks(lo, hi, count = 5) {
    const raw = (hi - lo) / count, scale = 10 ** Math.floor(Math.log10(raw));
    const multiple = [1, 2, 5, 10].find(x => x * scale >= raw);
    const step = multiple * scale, ticks = [];
    for (let x = Math.ceil(lo / step) * step; x <= hi + step * 1e-8; x += step) {
      ticks.push(Number(x.toPrecision(10)));
    }
    return ticks;
  }
  function covariance2D(points) {
    const n = points.length;
    if (!n) return null;
    const x = mean(points.map(p => p.x)), y = mean(points.map(p => p.y));
    const xx = mean(points.map(p => (p.x - x) ** 2));
    const yy = mean(points.map(p => (p.y - y) ** 2));
    const xy = mean(points.map(p => (p.x - x) * (p.y - y)));
    const gap = Math.hypot(xx - yy, 2 * xy);
    return { x, y, xx, yy, xy, angle: 0.5 * Math.atan2(2 * xy, xx - yy),
      major: Math.sqrt(Math.max(0, (xx + yy + gap) / 2)),
      minor: Math.sqrt(Math.max(0, (xx + yy - gap) / 2)) };
  }
  // Solve J(theta)=level exactly for theta2 in this three-arm parameterization.
  function contourY(theta1, level) {
    const expY = ((level - 0.2) * Math.exp(10 * theta1) + level) / (1 - level);
    return expY > 0 ? 10 * Math.log(expY) : NaN;
  }
  Object.assign(Core, { GAMMA, rng, softmax, policy, transition, episode, returns, gae,
    estimate, kl, avgKL, stateWeights, fisherVector, solve, cg, clipObjective, clipSlope,
    adaptBeta, normalize, evaluate, defaults, trainer, update, exhaust, train, variance,
    fixedPath, fixedSteps, bandit, banditStep, mmJ, mmD, mmM, mmStep, dot, mean,
    niceTicks, covariance2D, contourY });

  function mount() {
(function () {
  if (window.__labQueue) return;
  var jobs = [];
  function dist(id) {
    var el = document.getElementById(id); if (!el) return 1e9;
    var r = el.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - innerHeight / 2);
  }
  function loop() {
    if (!jobs.length) { running = false; return; }
    jobs.sort(function (a, b) { return dist(a.id) - dist(b.id); });
    var j = jobs[0], done = false;
    try { done = j.step(6); } catch (e) { done = true; console.error(e); }
    if (done) jobs.shift();
    requestAnimationFrame(loop);
  }
  var running = false;
  window.__labQueue = {
    request: function (id, step) {
      jobs = jobs.filter(function (j) { return j.id !== id; });
      jobs.push({ id: id, step: step });
      if (!running) { running = true; requestAnimationFrame(loop); }
    },
    cancel: function (id) { jobs = jobs.filter(function (j) { return j.id !== id; }); }
  };
})();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const widgets = [], colors = ['muted', 'red', 'teal', 'ink', 'amber'];
    const names = ['REINFORCE 小步', 'REINFORCE 大步', 'TRPO', 'PPO-Penalty', 'PPO-Clip'];
    const actionNames = ['左', '休息', '右'];
    const fmt = (x, n = 3) => Number(x).toFixed(n);
    const pct = x => `${fmt(100 * x, 1)}%`;
    const el = (tag, cls, text, parent) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    };
    function button(parent, text, fn) {
      const b = el('button', 'lab-button', text, parent); b.type = 'button';
      b.addEventListener('click', fn); return b;
    }
    function slider(w, label, min, max, step, value, change) {
      const id = `${w.id}-range-${w.controls.querySelectorAll('input').length}`;
      const wrap = el('label', '', undefined, w.controls); wrap.htmlFor = id;
      el('span', '', label, wrap);
      const input = el('input', '', undefined, wrap);
      Object.assign(input, { type: 'range', id, min, max, step, value });
      const out = el('output', '', value, wrap); out.htmlFor = id;
      input.addEventListener('input', () => {
        out.textContent = input.value; change(+input.value); w.dirty = true; w.settle = performance.now() + 700;
      });
      return { input, out, set(v) { input.value = v; out.textContent = v; } };
    }
    function shell(id, title) {
      const root = document.getElementById(id);
      if (!root || root.dataset.labMounted) return null;
      root.dataset.labMounted = 'true'; root.classList.add('widget', 'lab-shell');
      const head = el('div', 'w-head', undefined, root);
      el('span', 'w-tag', '实例', head); el('span', 'w-title', title, head);
      const controls = el('div', 'w-ctrl lab-control', undefined, root);
      const status = el('div', 'lab-status', '', root); status.setAttribute('role', 'status');
      const body = el('div', 'lab-body', undefined, root);
      const stats = el('div', 'stats lab-summary', '', root);
      const read = el('p', 'w-read lab-summary', '', root); read.setAttribute('aria-live', 'polite');
      el('p', 'lab-note', '玩具实验，仅用于建立直觉，数字不代表真实大模型上的结果。', root);
      const totals = { 'lab-trail-reinforce': 180, 'lab-variance': 60, 'lab-gae': 100,
        'lab-npg': 12, 'lab-mm': 9, 'lab-trpo': 12, 'lab-race': 180 };
      const w = { id, root, controls, status, body, stats, read, canvases: [], visible: false,
        running: false, started: false, done: false, fast: false, queued: false, round: 0,
        total: totals[id], seed: 7, draw() {}, tick() {}, next: 0 };
      stateLine(w);
      widgets.push(w); return w;
    }
    function canvas(w, height, label, parent = w.body) {
      const node = el('canvas', 'lab-canvas', undefined, parent);
      node.setAttribute('role', 'img'); node.setAttribute('aria-label', label);
      const item = { node, height, label, ctx: node.getContext('2d') }; w.canvases.push(item);
      new ResizeObserver(() => w.draw()).observe(node);
      return item;
    }
    function paint(item) {
      const width = Math.max(150, item.node.getBoundingClientRect().width), dpr = devicePixelRatio || 1;
      const height = item.height;
      if (item.node.width !== Math.round(width * dpr) || item.node.height !== Math.round(height * dpr)) {
        item.node.width = Math.round(width * dpr); item.node.height = Math.round(height * dpr);
      }
      item.node.style.height = `${height}px`;
      const c = item.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height);
      const styles = getComputedStyle(document.documentElement), palette = {};
      ['ink', 'ink-2', 'muted', 'rule', 'surface', 'surface-2', 'bg', 'amber', 'teal', 'red', 'amber-soft', 'teal-soft'].forEach(k => { palette[k] = styles.getPropertyValue(`--${k}`).trim(); });
      c.font = `11px ${styles.getPropertyValue('--sans')}`; c.lineWidth = 1.5;
      return { c, width, height, palette };
    }
    function text(p, s, x, y, color = 'muted', align = 'left') {
      p.c.fillStyle = p.palette[color]; p.c.textAlign = align; p.c.fillText(s, x, y);
    }
    function line(p, pts, color = 'amber', alpha = 1, dash = [], width = 1.5) {
      const c = p.c; c.save(); c.globalAlpha = alpha; c.strokeStyle = p.palette[color]; c.setLineDash(dash);
      c.lineWidth = width;
      c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.restore();
    }
    function circle(p, x, y, r, color) {
      p.c.fillStyle = p.palette[color]; p.c.beginPath(); p.c.arc(x, y, r, 0, 2 * Math.PI); p.c.fill();
    }
    function legend(w, labels, cs, race = false) {
      const box = el('div', 'lab-legend', undefined, w.body);
      labels.forEach((label, i) => {
        const s = el('span', '', undefined, box), sw = el('i', 'lab-swatch', '', s);
        sw.style.borderColor = `var(--${cs[i]})`;
        if (race && i === 3) sw.classList.add('lab-swatch-dashed');
        if (race && i === 4) sw.classList.add('lab-swatch-bold');
        el('span', '', label, s);
      });
    }
    function axes(p, lo, hi, xmax, label) {
      const X = x => 39 + (p.width - 51) * x / Math.max(1, xmax);
      const Y = y => p.height - 28 - (p.height - 54) * (y - lo) / (hi - lo);
      for (const y of niceTicks(lo, hi, 5)) {
        line(p, [[39, Y(y)], [p.width - 12, Y(y)]], 'rule');
        text(p, String(y), 33, Y(y) + 4, 'muted', 'right');
      }
      text(p, label, 39, 13);
      for (const x of niceTicks(0, xmax, p.width < 400 ? 3 : 5)) {
        text(p, x, X(x), p.height - 8, 'muted', x === 0 ? 'left' : 'center');
      }
      text(p, `${xmax} 轮`, p.width - 12, p.height - 8, 'muted', 'right');
      return { X, Y };
    }
    function curves(item, series, key, cs, log = false, band = false) {
      const p = paint(item), xMax = defaults.rounds;
      item.node.dataset.xMax = xMax;
      const a = axes(p, log ? -8 : -1.5, log ? 3 : 1, xMax, log ? '平均 KL · log₁₀（零值显示在底部）' : '每轮平均总奖励 · 未折扣');
      series.forEach((s, j) => {
        const value = x => log ? Math.log10(Math.max(1e-7, x)) : x;
        if (band && s.length) {
          p.c.save(); p.c.globalAlpha = 0.12; p.c.fillStyle = p.palette[cs[j]];
          p.c.beginPath(); s.forEach((x, i) => p.c.lineTo(a.X(i + 1), a.Y(value(x.min))));
          s.slice().reverse().forEach((x, i) => p.c.lineTo(a.X(s.length - i), a.Y(value(x.max))));
          p.c.closePath(); p.c.fill(); p.c.restore();
        }
        line(p, s.map((x, i) => [a.X(i + 1), a.Y(value(x[key]))]), cs[j], 1,
          j === 3 ? [6, 3] : [], j === 4 ? 2.8 : 1.5);
      });
      if (log) {
        line(p, [[a.X(0), a.Y(-2)], [a.X(xMax), a.Y(-2)]], 'teal', 0.6, [4, 4]);
        text(p, 'δ = 0.01', a.X(xMax), a.Y(-2) - 5, 'teal', 'right');
      }
    }
    function trail(item, p0, position, heat = true) {
      const p = paint(item), c = p.c, dx = (p.width - 66) / 8, bottom = heat ? 178 : 61;
      const elevations = [0, 0.10, 0.17, 0.31, 0.45, 0.53, 0.69, 0.79, 1];
      const x = s => 32 + dx * s;
      const y = s => {
        const i = Math.min(7, Math.floor(s)), f = s - i;
        return (heat ? 141 : 38) - (heat ? 99 : 20) * (elevations[i] * (1 - f) + elevations[i + 1] * f);
      };
      const ledge = heat ? 8 : 4, ridge = [];
      for (let s = 0; s < 9; s++) ridge.push([x(s) - ledge, y(s)], [x(s) + ledge, y(s)]);
      // A vertical cut at the left edge makes cell zero a cliff rather than another hill.
      c.fillStyle = p.palette['surface-2']; c.strokeStyle = p.palette.rule;
      c.beginPath(); ridge.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
      c.lineTo(p.width - 12, bottom); c.lineTo(x(0) - ledge, bottom); c.closePath(); c.fill(); c.stroke();
      c.save(); c.globalAlpha = 0.16; c.fillStyle = p.palette.ink;
      c.fillRect(5, y(0) + 5, x(0) - ledge - 6, bottom - y(0) - 5); c.restore();
      line(p, [[x(0) - ledge, y(0)], [x(0) - ledge, bottom]], 'muted', 0.8);
      // Sparse strata describe the slope without competing with the policy marks.
      line(p, [[x(2), bottom - 3], [x(4), y(4) + (heat ? 28 : 15)], [x(6), y(6) + 11]], 'rule');
      for (let s = 0; s < 9; s++) {
        line(p, [[x(s) - ledge, y(s)], [x(s) + ledge, y(s)]], s === 0 ? 'red' : s === 8 ? 'teal' : 'muted', 1, [], heat ? 3 : 2);
        text(p, s, x(s), y(s) + (heat ? 16 : 12), 'ink-2', 'center');
      }
      const flagX = x(8) + 11, flagY = y(8) - (heat ? 24 : 14);
      line(p, [[flagX, y(8)], [flagX, flagY]], 'teal');
      c.save();
      c.globalAlpha = position.end === 8 ? 0.55 + 0.45 * Math.cos((position.finish || 0) * 12) ** 2 : 1;
      c.fillStyle = p.palette.teal; c.beginPath(); c.moveTo(flagX, flagY);
      c.lineTo(flagX + (heat ? 14 : 8), flagY + 3); c.lineTo(flagX, flagY + (heat ? 10 : 6)); c.fill(); c.restore();
      const state = position.s, falling = position.end === 0 ? (position.finish || 0) : 0;
      const hop = position.hop || 0, breathing = position.rest ? 1 + 0.065 * Math.sin((position.phase || 0) * Math.PI * 2) : 1;
      const radius = (heat ? 10 : 5) * breathing;
      const px = x(state) - falling * 17, py = y(state) - radius - 3 - hop * (heat ? 13 : 5) + falling * falling * (heat ? 43 : 21);
      c.save(); c.globalAlpha = Math.max(0, 1 - falling);
      circle(p, px, py, radius, position.end === 8 ? 'teal' : position.end === 0 ? 'red' : 'amber');
      c.shadowColor = p.palette['teal-soft']; c.shadowBlur = heat ? 7 : 4;
      circle(p, px + radius * 0.35, py - radius * 0.18, radius * 0.25, 'surface'); c.restore();
      if (heat) {
        text(p, '悬崖 −1', 6, 15, 'red'); text(p, '山顶 +1', p.width - 8, 15, 'teal', 'right');
        if (position.outcome) text(p, position.outcome, clamp(px, 32, p.width - 62), 193,
          position.end === 8 ? 'teal' : position.end === 0 ? 'red' : 'amber', 'center');
        text(p, '每格动作概率：左 / 休息 / 右', 6, 214);
        for (let s = 0; s < 9; s++) {
          let yy = 286;
          for (let a = 0; a < 3; a++) {
            const h = p0[s][a] * 58; yy -= h; c.fillStyle = p.palette[['red', 'amber', 'teal'][a]];
            c.fillRect(x(s) - dx * 0.3, yy, dx * 0.6, h);
          }
          text(p, s === 0 || s === 8 ? '终点' : `${s}`, x(s), 304, 'muted', 'center');
        }
      }
    }
    function player(seed) { return { random: rng(seed + 100003), ep: null, t: 0, age: 0, endAge: 0, clock: 0, pos: { s: 2 } }; }
    function animatePlayer(pl, p, ms) {
      if (!pl.ep) { pl.ep = episode(p, pl.random); pl.t = 0; pl.age = 0; pl.endAge = 0; }
      pl.clock += ms;
      pl.age += ms;
      if (pl.age >= 125) { pl.t++; pl.age = 0; }
      const steps = pl.ep.steps;
      if (pl.t >= steps.length) {
        pl.endAge += ms;
        pl.pos = { s: pl.ep.end, end: pl.ep.end, outcome: pl.ep.outcome, finish: Math.min(1, pl.endAge / 550) };
        if (pl.endAge > 800) pl.ep = null;
      } else {
        const st = steps[pl.t], t = pl.age / 125;
        pl.pos = { s: st.s + (st.ns - st.s) * t, hop: st.s === st.ns ? 0 : Math.sin(Math.PI * t),
          rest: st.s === st.ns, phase: pl.clock / 850 };
      }
    }
    function common(w, reset, label = '开始训练', stochastic = true) {
      w.play = button(w.controls, label, () => {
        if (w.done) reset();
        w.running = !w.running; w.started = true; w.manual = false;
        w.play.textContent = w.running ? '暂停' : label; syncJob(w);
      });
      button(w.controls, '单步', () => {
        if (w.done) reset();
        w.running = false; w.started = true; w.manual = true; w.play.textContent = label; syncJob(w);
      });
      button(w.controls, '重置', () => { w.running = false; w.started = true; reset(); w.play.textContent = label; w.draw(); syncJob(w); });
      if (stochastic) button(w.controls, '换个种子', () => { w.seed++; w.running = false; w.started = true; reset(); w.play.textContent = label; w.draw(); syncJob(w); });
      w.skip = button(w.controls, '跳到结果', () => {
        if (w.done) return;
        w.fast = true; w.running = true; w.manual = false; w.started = true; syncJob(w);
      });
    }
    function stateLine(w) {
      const active = !w.done && (w.running || w.manual);
      const state = w.done ? 'done' : active && w.visible ? 'running' : w.started ? 'paused' : 'idle';
      if (w.root.dataset.state !== state) w.root.dataset.state = state;
      const value = w.done ? `已完成 · 共 ${w.total} 轮` :
        `${active && w.visible ? '训练中' : w.started ? '已暂停' : '待开始'} · 第 ${w.round} / ${w.total} 轮`;
      if (w.status.textContent !== value) w.status.textContent = value;
      if (w.skip) w.skip.disabled = w.done;
    }
    function resetState(w) {
      window.__labQueue.cancel(w.id); w.queued = false; w.done = false; w.manual = false;
      w.round = 0; w.fast = false; w.next = 0; w.dirty = true; w.settle = 0;
      stateLine(w);
    }
    function syncJob(w) {
      stateLine(w);
      if (!w.visible || w.done || (!w.running && !w.manual)) {
        if (w.queued) window.__labQueue.cancel(w.id);
        w.queued = false; return;
      }
      if (w.queued) return;
      w.queued = true;
      window.__labQueue.request(w.id, budgetMs => {
        if (!w.visible || w.done || (!w.running && !w.manual)) { w.queued = false; return true; }
        const deadline = performance.now() + budgetMs;
        do {
          if (!reduced.matches && !w.fast && !w.manual && performance.now() < w.next) break;
          w.tick(); w.dirty = true;
          if (w.done || (!w.running && !w.manual)) break;
        } while (performance.now() < deadline);
        stateLine(w);
        const done = w.done || (!w.running && !w.manual);
        if (done) w.queued = false;
        return done;
      });
    }
    function finish(w) {
      w.done = true; w.running = false; w.manual = false; w.round = w.total;
      if (w.play) w.play.textContent = '重新训练'; stateLine(w);
    }
    function conclusion(model) {
      const e = evaluate(policy(model.theta));
      let s = `登顶率 ${pct(e.success)}；`;
      s += model.reached ? `第 ${model.reached} 轮首次达到 90%（${model.reached * model.options.batch} 回合）。` : '尚未达到 90%。';
      if (e.stuck) s += `格子 ${e.stuck.s} 塌缩到${actionNames[e.stuck.a]}（${pct(e.stuck.p)}），当前期望总奖励 ${fmt(e.reward)}。`;
      else s += '当前未检测到休息塌缩。';
      return s;
    }
    function mountTrail() {
      const w = shell('lab-trail-reinforce', '用 REINFORCE 教小机器人登山'); if (!w) return;
      let lr = defaults.lr, method = 'reinforce', lambda = 0.95, model, iterator, pl, display;
      const lrInput = slider(w, '学习率 α（对数刻度）', -1.3, 2.7, 0.01, Math.log10(lr), value => {
        lr = Math.pow(10, value); lrInput.out.textContent = fmt(lr, 2); reset(); w.draw();
      });
      lrInput.out.textContent = lr;
      const presets = el('div', 'seg', undefined, w.controls); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', '学习率预设');
      const setPreset = value => {
        lr = value; lrInput.input.value = Math.log10(value); lrInput.out.textContent = value; reset();
        Array.from(presets.children).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.lr === lr))); w.draw();
      };
      [['合适', 0.35], ['太大', 500]].forEach(([s, a]) => {
        const b = button(presets, s, () => setPreset(a)); b.dataset.lr = a; b.setAttribute('aria-pressed', String(a === lr));
      });
      const label = el('label', '', undefined, w.controls); label.htmlFor = `${w.id}-method`;
      el('span', '', '估计方式', label);
      const select = el('select', 'lab-select', undefined, label); select.id = label.htmlFor;
      [['reinforce', '整局回报'], ['baseline', '剩余回报 + 基线'], ['gae', 'Actor-Critic + GAE'], ['npg', '自然策略梯度']].forEach(([value, title]) => {
        const option = el('option', '', title, select); option.value = value;
      });
      select.addEventListener('change', () => { method = select.value; reset(); w.draw(); });
      slider(w, 'GAE λ', 0, 1, 0.01, lambda, value => { lambda = value; reset(); w.draw(); });
      common(w, reset);
      el('p', 'lab-note', 'α 的尺度：每回合梯度求和，再对回合平均，与按步平均不同。α=500 用来观察一次更新把某些格子的策略推到几乎确定。', w.body);
      const mountain = canvas(w, 315, '山体剖面、悬崖、山顶与九格策略概率'), curve = canvas(w, 170, '每轮采样回报');
      legend(w, ['向左', '休息', '向右'], ['red', 'amber', 'teal']);
      const traces = el('div', 'lab-trajectories', undefined, w.body);
      function reset() {
        resetState(w);
        model = trainer(method, w.seed, { lr, lambda }); iterator = null; pl = player(w.seed);
        display = policy(model.theta); w.done = false; w.progress = 0;
        if (w.play) w.play.textContent = '开始训练';
        model.episodes = Array.from({ length: 3 }, () => episode(display, pl.random));
      }
      w.tick = () => {
        if (!iterator) iterator = update(model);
        const result = iterator.next();
        if (result.done) {
          iterator = null; w.manual = false; w.round = model.round; w.next = performance.now() + 85;
          if (model.round >= 180) {
            if (reduced.matches || w.fast) {
              const ep = episode(policy(model.theta), pl.random);
              pl.pos = { s: ep.end, end: ep.end, outcome: ep.outcome };
            }
            finish(w);
          }
        }
      };
      w.motion = ms => {
        animatePlayer(pl, policy(model.theta), ms);
        const target = policy(model.theta);
        display = display.map((row, s) => row.map((v, a) => v + (target[s][a] - v) * 0.2));
      };
      w.draw = () => {
        if (!model) return;
        if (reduced.matches || w.fast) display = policy(model.theta);
        trail(mountain, display, pl.pos); curves(curve, [model.history], 'sampleReward', ['amber']);
        traces.replaceChildren(); model.episodes.forEach(e => el('p', '', `${[2].concat(e.steps.map(x => x.ns)).join('→')}  ${e.outcome} ${fmt(e.total, 2)}`, traces));
        w.stats.textContent = `种子 ${w.seed} · ${model.round} / 180 轮 · 每轮 16 回合 · γ = 0.98`;
        w.read.textContent = conclusion(model) + (method === 'npg' ? '自然梯度使用 δ=0.01，学习率滑块不参与此算法。' : '');
        mountain.node.setAttribute('aria-label', `当前策略的山路样本。${w.read.textContent}`);
        curve.node.setAttribute('aria-label', `${model.round} 轮学习曲线。${w.read.textContent}`);
      };
      reset(); w.draw();
    }
    function mountVariance() {
      const w = shell('lab-variance', '同一个策略，三种梯度估计的散布'); if (!w) return;
      let iterator, result, progress, groups, norm, fall = 1;
      common(w, reset, '开始估计');
      const panels = el('div', 'lab-variance-panels', undefined, w.body);
      const plotNames = ['整局回报', '剩余回报 + 基线', 'GAE（λ=0.95）'];
      const plots = plotNames.map(name => {
        const panel = el('div', 'lab-variance-panel', undefined, panels);
        el('div', 'lab-chart-title', name, panel);
        return canvas(w, 256, `${name}：梯度投影、均值和协方差`, panel);
      });
      el('p', 'lab-note', '菱形：样本均值；椭圆：投影后的 1σ 协方差轮廓；十字：g*。椭圆不是置信区间。', w.body);
      const table = el('div', 'lab-table-wrap', undefined, w.body);
      function reset() { resetState(w); iterator = variance(w.seed); result = null; groups = [[], [], []]; norm = 0; progress = '固定策略：每格右行 logit = 0.6，左与休息为 0。'; }
      w.tick = () => {
        const r = iterator.next();
        if (r.done) { result = r.value; groups = result.groups; norm = result.norm; finish(w); }
        else if (r.value.stage === 'points') {
          groups = r.value.groups; norm = r.value.norm; progress = `散点 ${r.value.count} / 60`;
          fall = reduced.matches || w.fast ? 1 : 0; w.round = r.value.count;
          w.manual = false; w.next = performance.now() + 185;
        }
        else progress = `${r.value.stage === 'fit' ? '独立拟合基线' : '估计参考梯度'} ${pct(r.value.progress)}`;
      };
      w.motion = ms => { fall = Math.min(1, fall + ms / 90); };
      w.draw = () => {
        const all = groups.flat(), xmax = Math.max(1.5, Math.ceil(Math.max(0, ...all.map(x => x.x)) * 2) / 2);
        const xmin = Math.min(-0.5, Math.floor(Math.min(0, ...all.map(x => x.x)) * 2) / 2);
        const ymax = Math.max(1.5, Math.ceil(Math.max(0, ...all.map(x => x.y)) * 2) / 2);
        plots.forEach((plot, j) => {
          const p = paint(plot), color = ['amber', 'muted', 'teal'][j];
          const X = x => 30 + (p.width - 43) * (x - xmin) / (xmax - xmin);
          const Y = y => 220 - (y + 0.16) * 185 / (ymax + 0.16);
          plot.node.dataset.range = [xmin, xmax, -0.16, ymax].join(',');
          for (const y of niceTicks(0, ymax, 3)) {
            line(p, [[30, Y(y)], [p.width - 13, Y(y)]], 'rule');
            text(p, y, 25, Y(y) + 4, 'muted', 'right');
          }
          for (const x of niceTicks(xmin, xmax, 3)) text(p, x, X(x), 236, 'muted', 'center');
          text(p, '正交分量范数', 30, 15); text(p, '沿 g* 的分量', p.width - 13, 253, 'muted', 'right');
          groups[j].forEach((point, i) => circle(p, X(point.x), Y(point.y) -
            (i === groups[j].length - 1 ? 12 * (1 - fall) ** 3 : 0), 2.4, color));
          const cov = covariance2D(groups[j]);
          if (cov) {
            const pts = Array.from({ length: 81 }, (_, k) => {
              const a = k / 80 * 2 * Math.PI, u = cov.major * Math.cos(a), v = cov.minor * Math.sin(a);
              return [X(cov.x + u * Math.cos(cov.angle) - v * Math.sin(cov.angle)),
                Y(cov.y + u * Math.sin(cov.angle) + v * Math.cos(cov.angle))];
            });
            line(p, pts, color, 0.95, [4, 2]);
            const cx = X(cov.x), cy = Y(cov.y);
            p.c.save(); p.c.fillStyle = p.palette.surface; p.c.beginPath();
            p.c.moveTo(cx, cy - 6); p.c.lineTo(cx + 6, cy); p.c.lineTo(cx, cy + 6); p.c.lineTo(cx - 6, cy); p.c.closePath(); p.c.fill(); p.c.restore();
            line(p, [[cx, cy - 6], [cx + 6, cy], [cx, cy + 6], [cx - 6, cy], [cx, cy - 6]], color, 1, [], 2);
          }
          if (norm) {
            line(p, [[X(norm) - 4, Y(0)], [X(norm) + 4, Y(0)]], 'red');
            line(p, [[X(norm), Y(0) - 4], [X(norm), Y(0) + 4]], 'red');
            text(p, 'g*', X(norm) + 5, Y(0) - 5, 'red');
          }
          plot.node.setAttribute('aria-label', `${plotNames[j]}，${groups[j].length}个投影样本；${cov ? `均值 (${fmt(cov.x)},${fmt(cov.y)})，1σ长短轴 ${fmt(cov.major)}、${fmt(cov.minor)}` : '等待采样'}。共享坐标范围 ${plot.node.dataset.range}。`);
        });
        w.stats.textContent = `种子 ${w.seed} · 每种 60 次估计 · 每次 8 回合 · 参考 16,384 回合`;
        table.replaceChildren();
        if (result) {
          const t = el('table', 'lab-table', undefined, table);
          const h = el('tr', '', undefined, el('thead', '', undefined, t));
          ['估计器', '平均余弦', '总方差', '均值偏差范数'].forEach(x => el('th', '', x, h));
          const body = el('tbody', '', undefined, t);
          result.stats.forEach((s, i) => { const row = el('tr', '', undefined, body); [ ['整局', '基线', 'GAE'][i], fmt(s.cosine), fmt(s.variance), fmt(s.bias)].forEach(x => el('td', '', x, row)); });
          const best = result.stats.indexOf(result.stats.reduce((a, b) => a.variance < b.variance ? a : b));
          w.read.textContent = `本次${['整局回报', '剩余回报 + 基线', 'GAE'][best]}的散布最小。方差是 27 维协方差的迹；g* 是独立大样本近似，并非解析真值。GAE 的近似 V 与 λ<1 可能引入偏差。`;
        } else w.read.textContent = `${progress} 横轴方向尚在估计时保留坐标轴；计算完成后逐批加入真实散点。`;
      };
      reset(); w.draw();
    }
    function mountGae() {
      const w = shell('lab-gae', 'λ 怎样分配一局里的功劳'); if (!w) return;
      let lambda = 0.95, model, iterator, advantage = zeros(8), target = zeros(8), autoSteps = 0;
      slider(w, 'GAE λ', 0, 1, 0.01, lambda, value => { lambda = value; updateAdv(); w.draw(); });
      common(w, reset, '训练价值表');
      const plot = canvas(w, 310, '固定登顶轨迹上的奖励、价值与优势'), decay = canvas(w, 135, 'GAE 权重衰减');
      function updateAdv() { target = gae(fixedSteps(), model.v, lambda); if (reduced.matches || w.fast) advantage = target.slice(); }
      function reset() { resetState(w); model = trainer('gae', w.seed); iterator = null; autoSteps = 0; updateAdv(); }
      w.tick = () => {
        if (!iterator) iterator = update(model);
        if (iterator.next().done) {
          iterator = null; updateAdv(); w.manual = false; autoSteps++; w.round = autoSteps;
          w.next = performance.now() + 110;
          if (autoSteps >= 100) finish(w);
        }
      };
      w.motion = () => { advantage = advantage.map((x, i) => x + (target[i] - x) * 0.2); };
      w.draw = () => {
        if (!model) return;
        const p = paint(plot), dx = (p.width - 25) / 8, zero = 230;
        text(p, `价值表由 ${model.round} 轮 Actor-Critic 训练得到`, 6, 15);
        text(p, '状态 → 下一格', 6, 40); text(p, '奖励 r', 6, 80); text(p, 'V(s)', 6, 121);
        text(p, '优势 Â_t', 6, 163, 'teal');
        line(p, [[8, zero], [p.width - 5, zero]], 'rule');
        const max = Math.max(0.1, ...target.map(Math.abs));
        fixedSteps().forEach((st, i) => {
          const x = 15 + dx * (i + 0.5), a = advantage[i];
          text(p, `${st.s}→${st.ns}`, x, 59, 'ink-2', 'center');
          text(p, fmt(st.r, 2), x, 99, st.r > 0 ? 'teal' : 'red', 'center');
          text(p, fmt(model.v[st.s], 2), x, 141, 'muted', 'center');
          const h = a / max * 57; p.c.fillStyle = p.palette[a >= 0 ? 'teal' : 'red'];
          p.c.fillRect(x - dx * 0.27, Math.min(zero, zero - h), dx * 0.54, Math.abs(h));
          text(p, fmt(a, 2), x, h >= 0 ? zero - h - 5 : zero - h + 13, a >= 0 ? 'teal' : 'red', 'center');
          text(p, `t=${i}`, x, 303, 'muted', 'center');
        });
        const q = paint(decay); text(q, '(γλ)ˡ：未来 TD 误差的权重', 6, 15);
        for (let i = 0; i < 8; i++) {
          const x = 16 + (q.width - 32) * i / 7, h = Math.pow(GAMMA * lambda, i) * 70;
          line(q, [[x, 103], [x, 103 - h]], 'amber'); circle(q, x, 103 - h, 3, 'amber'); text(q, i, x, 124, 'muted', 'center');
        }
        w.stats.textContent = `种子 ${w.seed} · λ=${fmt(lambda, 2)} · 起点优势 Â₀=${fmt(target[0])}`;
        w.read.textContent = lambda === 0 ? 'λ=0，只看一步 TD 误差 δ。' : lambda === 1 ? 'λ=1，整段折扣回报减去当前 V(s)，终点不再 bootstrap。' : `λ=${fmt(lambda, 2)}，远处误差逐步衰减；第 7 步的权重为 ${fmt(Math.pow(GAMMA * lambda, 7))}。`;
        plot.node.setAttribute('aria-label', `${w.read.textContent} 每步优势 ${target.map(x => fmt(x)).join('、')}`);
        decay.node.setAttribute('aria-label', `λ=${lambda}，权重从1衰减至${fmt(Math.pow(GAMMA * lambda, 7))}`);
      };
      reset(); w.draw();
    }
    function landscape(item, paths, cs, ellipseInfo, attempt) {
      const p = paint(item), flat = paths.flat().concat(attempt ? [attempt.theta] : []);
      const xmin = Math.floor(Math.min(-0.4, ...flat.map(t => t[0])) * 5) / 5;
      const xmax = Math.ceil(Math.max(0.2, ...flat.map(t => t[0])) * 5) / 5;
      const ymin = -30, ymax = Math.ceil(Math.max(60, ...flat.map(t => t[1] + 5)) / 20) * 20;
      const X = x => 44 + (p.width - 61) * (x - xmin) / (xmax - xmin);
      const Y = y => p.height - 35 - (p.height - 60) * (y - ymin) / (ymax - ymin);
      // Quantized filled contours, evaluated from the exact three-arm objective.
      const size = 7;
      for (let x = 44; x < p.width - 17; x += size) for (let y = 25; y < p.height - 35; y += size) {
        const theta = [xmin + (x - 44) * (xmax - xmin) / (p.width - 61),
          ymin + (p.height - 35 - y) * (ymax - ymin) / (p.height - 60)];
        const j = bandit(theta).j;
        p.c.fillStyle = p.palette.teal; p.c.globalAlpha = 0.06 + Math.floor(j * 12) / 12 * 0.48;
        p.c.fillRect(x, y, size, size);
      }
      p.c.globalAlpha = 1;
      for (const y of niceTicks(ymin, ymax, 5)) {
        line(p, [[44, Y(y)], [p.width - 17, Y(y)]], 'rule', 0.6);
        text(p, y, 37, Y(y) + 4, 'muted', 'right');
      }
      for (const x of niceTicks(xmin, xmax, 4)) text(p, x, X(x), p.height - 16, 'muted', 'center');
      p.c.save(); p.c.beginPath(); p.c.rect(44, 25, p.width - 61, p.height - 60); p.c.clip();
      const levels = Array.from({ length: 9 }, (_, i) => (i + 1) / 10);
      levels.forEach(level => {
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const theta1 = xmin + (xmax - xmin) * i / 160, theta2 = contourY(theta1, level);
          if (Number.isFinite(theta2)) pts.push([X(theta1), Y(theta2)]);
        }
        line(p, pts, 'ink-2', 0.72, [], 1);
      });
      p.c.restore();
      [0.5, 0.7, 0.9].forEach((level, i) => {
        const tx = xmin + (xmax - xmin) * (0.23 + i * 0.10), ty = contourY(tx, level);
        const px = X(tx), py = Y(ty);
        p.c.fillStyle = p.palette.surface; p.c.fillRect(px - 3, py - 12, 39, 15);
        text(p, `J=${level}`, px, py - 1, 'ink');
      });
      item.node.dataset.contourLevels = levels.join(',');
      text(p, 'θ₂ · J 等值线', 44, 14); text(p, 'θ₁', p.width - 14, p.height - 2, 'muted', 'right');
      if (ellipseInfo) {
        const { origin, f, delta } = ellipseInfo, pts = [];
        for (let i = 0; i <= 100; i++) {
          const angle = i * Math.PI / 50;
          // Parameter-space ellipse: ΔᵀFΔ/2 = δ, scaled directions for numerical stability.
          const d = [Math.cos(angle) / 10, Math.sin(angle) * 10];
          const scale = Math.sqrt(2 * delta / Math.max(1e-20, dot(d, f.map(r => dot(r, d)))));
          pts.push([X(origin[0] + d[0] * scale), Y(origin[1] + d[1] * scale)]);
        }
        p.c.save(); p.c.beginPath(); p.c.rect(44, 25, p.width - 61, p.height - 60); p.c.clip();
        line(p, pts, 'amber', 0.85, [4, 3]); p.c.restore();
      }
      paths.forEach((path, i) => {
        line(p, path.map(t => [X(t[0]), Y(t[1])]), cs[i]);
        path.forEach(t => circle(p, X(t[0]), Y(t[1]), 2, cs[i]));
        const last = path[path.length - 1]; if (last) circle(p, X(last[0]), Y(last[1]), 5, cs[i]);
      });
      if (attempt && ellipseInfo) {
        const start = ellipseInfo.origin, end = attempt.theta;
        const sx = X(start[0]), sy = Y(start[1]), ex = X(end[0]), ey = Y(end[1]);
        const angle = Math.atan2(ey - sy, ex - sx), color = attempt.accepted ? 'teal' : 'red';
        line(p, [[sx, sy], [ex, ey]], color);
        line(p, [[ex - 7 * Math.cos(angle - 0.4), ey - 7 * Math.sin(angle - 0.4)], [ex, ey],
          [ex - 7 * Math.cos(angle + 0.4), ey - 7 * Math.sin(angle + 0.4)]], color);
        text(p, `j=${attempt.j} ${attempt.accepted ? '✓' : '✗'}`, ex + 7, ey + 2, color);
      }
    }
    function mountNpg() {
      const w = shell('lab-npg', '同样的步长预算，普通梯度和自然梯度走出的路'); if (!w) return;
      let lr = 0.03, delta = 0.01, paths, hits, info, count;
      slider(w, '普通梯度 α', 0.005, 0.15, 0.005, lr, v => { lr = v; reset(); w.draw(); });
      slider(w, 'KL 预算 δ', 0.001, 0.05, 0.001, delta, v => { delta = v; reset(); w.draw(); });
      common(w, reset, '播放', false); const plot = canvas(w, 325, '普通梯度与自然梯度轨迹');
      legend(w, ['普通梯度', '自然梯度', '局部 KL 椭圆'], ['muted', 'teal', 'amber']);
      function reset() { resetState(w); paths = [[[0, 0]], [[0, 0]]]; hits = [null, null]; info = null; count = 0; }
      w.tick = () => {
        count++;
        ['ordinary', 'natural'].forEach((mode, i) => {
          const origin = paths[i][paths[i].length - 1], r = banditStep(origin, mode, lr, delta);
          paths[i].push(r.theta);
          if (i === 1) info = { origin, f: bandit(origin).f, delta, kl: r.attempts[0].kl };
          if (hits[i] === null && bandit(r.theta).j >= 0.9) hits[i] = count;
        });
        w.round = count; w.manual = false; w.next = performance.now() + 1050;
        if (count >= 12) finish(w);
      };
      w.draw = () => {
        if (!paths) return;
        landscape(plot, paths, ['muted', 'teal'], info);
        const js = paths.map(path => bandit(path[path.length - 1]).j);
        w.stats.textContent = `第 ${count} / 12 步 · 普通 J=${fmt(js[0])} · 自然 J=${fmt(js[1])}`;
        w.read.textContent = `达到 J≥0.9：普通梯度${hits[0] ? `用 ${hits[0]} 步` : '尚未达到'}，自然梯度${hits[1] ? `用 ${hits[1]} 步` : '尚未达到'}。logits=[10θ₁, 0.1θ₂, 0]，臂奖励=[0.2, 1, 0]。虚线椭圆对应局部近似 ½ΔᵀFΔ=δ${info ? `；本步真实 KL=${fmt(info.kl, 5)}` : ''}，实际 KL 不保证恰好等于 δ。`;
        plot.node.setAttribute('aria-label', w.read.textContent);
      };
      reset(); w.draw();
    }
    function mountMm() {
      const w = shell('lab-mm', '一步一步抬高下界'); if (!w) return;
      let points, shown, from, age, last;
      common(w, reset, '播放', false); button(w.controls, '下一步', () => { if (w.done) reset(); w.running = false; w.manual = true; w.started = true; syncJob(w); });
      const plot = canvas(w, 290, 'MM 目标和二次下界');
      function reset() { resetState(w); points = [2.2]; shown = 2.2; from = shown; age = 1; last = null; }
      w.tick = () => {
        from = points[points.length - 1]; const next = mmStep(from); points.push(next); age = 0;
        w.settle = performance.now() + 750;
        last = { guaranteed: mmM(next, from) - mmJ(from), extra: mmJ(next) - mmM(next, from) };
        if (reduced.matches || w.fast) shown = next;
        w.round = points.length - 1; w.manual = false; w.next = performance.now() + 1300;
        if (points.length >= 10 || Math.abs(next - from) < 1e-7) finish(w);
      };
      w.motion = ms => { age = Math.min(1, age + ms / 650); shown = from + (points[points.length - 1] - from) * (1 - (1 - age) ** 3); };
      w.draw = () => {
        const p = paint(plot), X = t => 25 + t / 6 * (p.width - 42), Y = j => 253 - j / 1.5 * 216;
        [0, 0.5, 1, 1.5].forEach(j => { line(p, [[25, Y(j)], [p.width - 17, Y(j)]], 'rule'); text(p, j, 22, Y(j) + 4, 'muted', 'right'); });
        const curve = fn => Array.from({ length: 121 }, (_, i) => [X(i / 20), Y(fn(i / 20))]);
        p.c.save(); p.c.beginPath(); p.c.rect(25, 25, p.width - 42, 229); p.c.clip();
        points.slice(-4, -1).forEach((t, i, arr) => line(p, curve(x => mmM(x, t)),
          'muted', i === arr.length - 1 ? 0.2 + 0.5 * (1 - age) : 0.12 + i * 0.05));
        line(p, curve(mmJ), 'teal');
        line(p, curve(t => mmM(t, points[points.length - 1])), 'amber'); p.c.restore();
        points.forEach(t => circle(p, X(t), Y(mmJ(t)), 3, 'muted'));
        circle(p, X(shown), Y(mmJ(shown)), 6, 'amber');
        text(p, 'J(θ) 真实目标', 25, 16, 'teal'); text(p, 'M(θ) 当前下界', p.width - 10, 16, 'amber', 'right');
        [0, 2, 4, 6].forEach(t => text(p, t, X(t), 275, 'muted', 'center'));
        text(p, 'θ', p.width - 10, 287);
        const t = points[points.length - 1];
        w.stats.textContent = `第 ${points.length - 1} 次更新 · θ=${fmt(t, 5)} · J=${fmt(mmJ(t), 6)}`;
        w.read.textContent = last ? `保证的提升 ${fmt(last.guaranteed, 6)}；实际多出的 ${fmt(last.extra, 6)}。${Math.abs(t - 3.4) < 0.0001 ? '已收敛到峰顶 θ≈3.4。' : '下一步在当前点构造相切下界，再走到下界最高点。'}` : '从 θ=2.2 出发。灰色保留旧下界；最大化二次下界，真实目标至少提高同样多。';
        plot.node.setAttribute('aria-label', `${w.stats.textContent}。${w.read.textContent}`);
      };
      reset(); w.draw();
    }
    function mountTrpo() {
      const w = shell('lab-trpo', 'TRPO 的一步：共轭梯度、线搜索、改进检查'); if (!w) return;
      let path, proposal, index, log, count;
      common(w, reset, '播放', false); const plot = canvas(w, 325, 'TRPO 共轭梯度与回溯线搜索');
      const table = el('div', 'lab-table-wrap', undefined, w.body);
      function reset() { resetState(w); path = [[0, 0]]; proposal = null; index = -1; log = []; count = 0; }
      w.tick = () => {
        if (!proposal || index === proposal.attempts.length - 1) {
          if (proposal) { path.push(proposal.theta); count++; w.round = count; }
          if (count >= 12) { finish(w); return; }
          proposal = banditStep(path[path.length - 1], 'trpo'); index = -1; log = [];
        }
        index++; log.push(proposal.attempts[index]); w.manual = false; w.next = performance.now() + 800;
      };
      w.draw = () => {
        if (!path) return;
        const attempt = proposal ? proposal.attempts[index] : null;
        landscape(plot, [path], ['teal'], proposal ? { origin: proposal.origin, f: proposal.f, delta: 0.01 } : null, attempt);
        table.replaceChildren();
        const t = el('table', 'lab-table', undefined, table), head = el('tr', '', undefined, el('thead', '', undefined, t));
        ['尝试 j', '真实 KL', '替代优势 ΔL', '检查'].forEach(s => el('th', '', s, head));
        const body = el('tbody', '', undefined, t);
        log.forEach(a => {
          const row = el('tr', '', undefined, body);
          [a.j, fmt(a.kl, 6), fmt(a.gain, 6), a.accepted ? '✓ 接受' : '✗ 减半'].forEach(s => el('td', a.accepted ? 'lab-teal' : 'lab-red', s, row));
        });
        w.stats.textContent = `第 ${Math.min(12, count + 1)} 轮 · CG ${proposal ? proposal.iterations : 0} 次 · δ=0.01 · J=${fmt(bandit(path[path.length - 1]).j)}`;
        w.read.textContent = attempt ? `本轮${attempt.accepted ? `接受 j=${attempt.j}` : `j=${attempt.j} 未通过，下一次将步长减半`}。仅当 KL≤δ 且 ΔL>0 才更新。这里对三个动作精确求期望，ΔL 与 J 的实际提升相同；山路比赛使用采样估计。虚线是局部 KL 椭圆，验收用真实 KL。` : '从同一个三臂老虎机出发。共轭梯度只调用 Fisher-向量积，先试完整步长，再实际计算 KL 与替代优势。';
        plot.node.setAttribute('aria-label', `${w.stats.textContent}。${w.read.textContent}`);
      };
      reset(); w.draw();
    }
    function mountRace() {
      const w = shell('lab-race', '同一座山，五种算法比一比'); if (!w) return;
      let models, players, iterator, slot, rounds, histories, epsilon = 0.2;
      slider(w, 'PPO-Clip ε', 0.05, 0.4, 0.01, epsilon, v => { epsilon = v; reset(); w.draw(); });
      common(w, reset);
      const laneRates = [];
      const lanes = names.map(name => {
        const head = el('div', 'lab-lane-head', undefined, w.body);
        el('span', '', name, head); laneRates.push(el('span', 'lab-lane-rate', '', head));
        return canvas(w, 64, `${name} 的山体剖面与机器人`);
      });
      legend(w, names, colors, true);
      const reward = canvas(w, 205, '五种算法三个种子的回报均值与范围'), kls = canvas(w, 180, '更新前后平均 KL 对数曲线');
      const table = el('div', 'lab-table-wrap', undefined, w.body);
      function reset() {
        resetState(w);
        models = ['reinforce', 'reinforce', 'trpo', 'penalty', 'clip'].map((m, i) =>
          [0, 1, 2].map(offset => trainer(m, w.seed + offset, { lr: i === 1 ? 500 : 0.35, eps: epsilon })));
        players = models.map(() => player(w.seed)); iterator = null; slot = 0; rounds = 0;
        histories = models.map(() => []); w.done = false;
      }
      w.tick = () => {
        const model = models[Math.floor(slot / 3)][slot % 3];
        if (!iterator) iterator = update(model);
        if (iterator.next().done) {
          iterator = null; slot++;
          if (slot === 15) {
            slot = 0; rounds++;
            models.forEach((group, i) => {
              const hs = group.map(m => m.history[rounds - 1]), rs = hs.map(h => h.sampleReward);
              histories[i].push({ reward: mean(rs), min: Math.min(...rs), max: Math.max(...rs), kl: mean(hs.map(h => h.kl)) });
            });
            w.round = rounds; w.manual = false; w.next = performance.now() + 65;
            if (rounds >= 180) {
              if (reduced.matches || w.fast) players.forEach((pl, i) => {
                const ep = episode(policy(models[i][0].theta), pl.random);
                pl.pos = { s: ep.end, end: ep.end, outcome: ep.outcome };
              });
              finish(w);
            }
          }
        }
      };
      w.motion = ms => players.forEach((pl, i) => animatePlayer(pl, policy(models[i][0].theta), ms));
      w.draw = () => {
        if (!models) return;
        models.forEach((group, i) => {
          trail(lanes[i], policy(group[0].theta), players[i].pos, false);
          laneRates[i].textContent = `登顶 ${pct(evaluate(policy(group[0].theta)).success)}`;
          lanes[i].node.setAttribute('aria-label', `${names[i]}，种子${w.seed}的独立演示轨迹。${conclusion(group[0])}`);
        });
        curves(reward, histories, 'reward', colors, false, true); curves(kls, histories, 'kl', colors, true);
        table.replaceChildren();
        const t = el('table', 'lab-table', undefined, table);
        el('caption', '', '90% 列按种子顺序列出首次达标回合数；— 表示尚未达到。', t);
        const head = el('tr', '', undefined, el('thead', '', undefined, t));
        ['算法', '登顶均值', '90% 回合数', '当前塌缩'].forEach(s => el('th', '', s, head));
        const body = el('tbody', '', undefined, t);
        models.forEach((group, i) => {
          const metrics = group.map(m => evaluate(policy(m.theta))), row = el('tr', '', undefined, body);
          [names[i], pct(mean(metrics.map(e => e.success))), group.map(m => m.reached ? m.reached * 16 : '—').join(' / '), `${metrics.filter(e => e.stuck).length} / 3`].forEach(s => el('td', '', s, row));
        });
        const collapsed = models[1].filter(m => evaluate(policy(m.theta)).stuck).length;
        w.stats.textContent = `种子 ${w.seed}、${w.seed + 1}、${w.seed + 2} · ${rounds} / 180 轮 · 每算法每种子 ${rounds * 16} 回合`;
        w.read.textContent = `大步长 α=500 当前有 ${collapsed}/3 个种子出现休息塌缩。曲线为 3 个种子的均值，浅带为最小到最大。TRPO 检查 δ=0.01；PPO 的 ε=${fmt(epsilon, 2)} 是概率比阈值，不能当成 KL 上界。PPO-Penalty 根据实际 KL 自适应调整 β。泳道展示首个种子的独立采样，不计入训练预算。`;
        reward.node.setAttribute('aria-label', `${w.stats.textContent}。${w.read.textContent}`);
        kls.node.setAttribute('aria-label', `对数 KL，最新均值：${histories.map((h, i) => `${names[i]} ${h.length ? fmt(h[h.length - 1].kl, 6) : 0}`).join('；')}`);
      };
      reset(); w.draw();
    }
    function enhanceLinesearch() {
      const svg = document.getElementById('fig-linesearch'); if (!svg) return;
      const root = svg.closest('figure') || svg.parentElement;
      if (root.querySelector('.lab-line-controls')) return;
      const paths = Array.from(svg.children).filter(n => n.tagName.toLowerCase() === 'path');
      const labels = Array.from(svg.querySelectorAll('text')).filter(n => /^j\s*=/.test(n.textContent));
      const groups = labels.map((label, i) => [paths[i], label].filter(Boolean));
      groups.flat().forEach(n => n.classList.add('lab-line-attempt'));
      const controls = el('div', 'w-ctrl lab-line-controls', undefined, root);
      const state = el('span', 'lab-inline-state', '完整步、半步、四分之一步的静态示意。', controls);
      let running = false, index = 2, visible = false, started = false, time = 0;
      const draw = () => groups.forEach((g, i) => g.forEach(n => {
        n.classList.toggle('lab-line-pending', i > index); n.classList.toggle('lab-line-active', i <= index);
      }));
      button(controls, '播放', () => { index = -1; time = 0; running = !reduced.matches; if (reduced.matches) index = 2; draw(); });
      button(controls, '单步', () => { running = false; index = (index + 1) % 3; draw(); state.textContent = `j=${index} ${index < 2 ? '✗ KL 超标' : '✓ 接受'}`; });
      const observe = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible && !started) { started = true; if (!reduced.matches) { index = -1; running = true; draw(); } }
      }, { rootMargin: '200px' }); observe.observe(svg);
      return now => {
        if (!visible || !running || now < time) return;
        index++; draw(); state.textContent = `j=${index} ${index < 2 ? '✗ KL 超标，步长减半' : '✓ 接受'}`;
        time = now + 700; if (index >= 2) running = false;
      };
    }
    const lineTick = enhanceLinesearch();
    const mounts = [['lab-trail-reinforce', mountTrail], ['lab-variance', mountVariance], ['lab-gae', mountGae], ['lab-npg', mountNpg],
      ['lab-mm', mountMm], ['lab-trpo', mountTrpo], ['lab-race', mountRace]].filter(m => document.getElementById(m[0]));
    if (!mounts.length && !lineTick) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      const w = widgets.find(x => x.root === entry.target); if (!w) return;
      w.visible = entry.isIntersecting;
      if (w.visible && !w.started) { w.started = true; w.running = !w.done; }
      syncJob(w);
    }), { rootMargin: '200px' });
    (function mountNext() {
      if (!mounts.length) return;
      const dist = id => { const r = document.getElementById(id).getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - innerHeight / 2); };
      mounts.sort((a, b) => dist(a[0]) - dist(b[0]));
      const before = widgets.length; try { mounts.shift()[1](); } catch (e) { console.error(e); }
      widgets.slice(before).forEach(w => observer.observe(w.root));
      (window.requestIdleCallback || (f => setTimeout(f, 30)))(mountNext, { timeout: 300 });
    })();
    function redraw() { widgets.forEach(w => { w.dirty = true; }); }
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
    reduced.addEventListener('change', () => {
      widgets.forEach(w => { if (w.visible && !w.done) w.running = true; syncJob(w); }); redraw();
    });
    let previous = performance.now();
    function frame(now) {
      const ms = Math.min(50, now - previous); previous = now;
      // Drawing only. The shared queue owns every training step, including fast-forward.
      const paintFrame = widgets.some(w => w.visible && w.dirty && now - (w.lastPaint || 0) > 32);
      let painted = false;
      widgets.forEach(w => {
        syncJob(w);
        if (!w.visible) return;
        if (!reduced.matches && !w.fast && w.motion && (w.running || w.dirty || now < (w.settle || 0))) {
          w.motion(ms); w.dirty = true;
        }
        if (!painted && paintFrame && w.dirty && (now - (w.lastPaint || 0) > 32 || w.done)) {
          painted = true;
          w.draw(); w.lastPaint = now;
          if (!w.running && !w.settle) w.settle = now + 700;
          w.dirty = false;
        }
        if (w.play) w.play.textContent = w.running ? '暂停' : w.done ? '重新训练' : '开始训练';
      });
      if (lineTick) lineTick(now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
  if (typeof module !== 'undefined') module.exports = Core;
})();
