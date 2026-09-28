(function () {
  'use strict';
  // All training code is independent of the document. Generators yield small work units.
  const Core = (() => {
    const TOKENS = ['1', '2', '3', '4', '5', '嗯', '⏎'];
    const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const variance = a => { const m = mean(a); return mean(a.map(x => (x - m) ** 2)); };
    const sigmoid = x => 1 / (1 + Math.exp(-x));
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    function ticks(min, max, count = 6) {
      const raw = (max - min) / count, power = 10 ** Math.floor(Math.log10(raw));
      const unit = raw / power, step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
      const values = [];
      for (let x = Math.ceil((min - 1e-10) / step) * step; x <= max + 1e-10; x += step) {
        values.push(+x.toFixed(10));
      }
      return values;
    }
    function rng(seed) {
      return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const index = (k, s, t) => ((k - 3) * 17 * 8 + Math.min(s, 16) * 8 + t) * 7;
    function model() {
      const m = { theta: new Float64Array(10 * 17 * 8 * 7), b: new Float64Array(56) };
      for (let t = 0; t < 8; t++) {
        for (let v = 0; v < 5; v++) m.b[t * 7 + v] = -v * 0.08;
        m.b[t * 7 + 5] = -0.5;
        m.b[t * 7 + 6] = -3.2 + 0.95 * t;
      }
      // Weak counting knowledge in the pretrained table; b alone is prompt independent.
      for (let k = 3; k <= 12; k++) for (let s = 0; s <= 16; s++) {
        for (let t = 0; t < 8; t++) m.theta[index(k, s, t) + 6] = s === k ? 2.6 : 0;
      }
      return m;
    }
    const clone = m => ({ theta: m.theta.slice(), b: m.b.slice() });
    function probs(m, k, s, t, temperature = 1) {
      const i = index(k, s, t), z = new Array(7);
      for (let v = 0; v < 7; v++) z[v] = (m.theta[i + v] + m.b[t * 7 + v]) / temperature;
      const max = Math.max(...z), ex = z.map(x => Math.exp(x - max)), sum = ex.reduce((a, b) => a + b);
      return ex.map(x => x / sum);
    }
    function draw(p, random) {
      let u = random();
      for (let v = 0; v < p.length; v++) { u -= p[v]; if (u < 0) return v; }
      return p.length - 1;
    }
    function response(k, tokens, steps = []) {
      const length = tokens.filter(v => v !== 6).length;
      const sum = tokens.reduce((s, v) => s + (v < 5 ? v + 1 : 0), 0);
      const ended = tokens[tokens.length - 1] === 6;
      const reward = +(ended && sum === k), filler = +tokens.includes(5);
      return { k, tokens, steps, length, sum, ended, reward, filler,
        truth: reward - 0.05 * length - 0.2 * filler,
        logp: steps.reduce((s, x) => s + x.logp, 0) };
    }
    function sample(m, k, random, temperature = 1) {
      let s = 0; const tokens = [], steps = [];
      for (let t = 0; t < 8; t++) {
        const p = probs(m, k, s, t, temperature), v = draw(p, random);
        steps.push({ k, s, t, v, p, logp: Math.log(p[v]) }); tokens.push(v);
        if (v === 6) break;
        s = Math.min(16, s + (v < 5 ? v + 1 : 0));
      }
      return response(k, tokens, steps);
    }
    function trace(m, k, tokens) {
      let s = 0;
      const steps = tokens.map((v, t) => {
        const p = probs(m, k, s, t), st = { k, s, t, v, p, logp: Math.log(p[v]) };
        s = Math.min(16, s + (v < 5 ? v + 1 : 0)); return st;
      });
      return response(k, tokens, steps);
    }
    function grad(m, st, weight, p = st.p) {
      const i = index(st.k, st.s, st.t);
      for (let v = 0; v < 7; v++) {
        const g = weight * ((v === st.v ? 1 : 0) - p[v]);
        m.theta[i + v] += g; m.b[st.t * 7 + v] += g;
      }
    }
    function expert(k) {
      const a = []; for (let left = k; left > 0;) { const n = Math.min(5, left); a.push(n - 1); left -= n; }
      a.push(6); return a;
    }
    function* sft(m, epochs = 8, data) {
      const dataset = data || Array.from({ length: 200 }, (_, i) => ({ k: 3 + i % 10, tokens: expert(3 + i % 10) }));
      for (let e = 0; e < epochs; e++) {
        for (const y of dataset) {
          const tr = trace(m, y.k, y.tokens);
          tr.steps.forEach(st => grad(m, st, 0.035 / tr.steps.length));
          yield null;
        }
        yield { epoch: e + 1 };
      }
      return m;
    }
    function* evaluate(m, options = {}) {
      const random = rng(options.seed || 991), n = options.n || 400;
      const ys = []; let kl = 0, entropy = 0;
      for (let i = 0; i < n; i++) {
        const y = sample(m, 3 + i % 10, random); ys.push(y);
        for (const st of y.steps) {
          entropy -= st.p.reduce((s, p) => s + p * Math.log(p), 0);
          if (options.ref) {
            const q = probs(options.ref, st.k, st.s, st.t);
            kl += st.p.reduce((s, p, v) => s + p * Math.log(p / q[v]), 0);
          }
        }
        if (i % 8 === 0) yield null;
      }
      return { accuracy: mean(ys.map(y => y.reward)), truth: mean(ys.map(y => y.truth)),
        filler: mean(ys.map(y => y.filler)), length: mean(ys.map(y => y.length)),
        truncated: mean(ys.map(y => +!y.ended)), wrongLength: mean(ys.filter(y => !y.reward).map(y => y.length)),
        entropy: entropy / ys.reduce((s, y) => s + y.steps.length, 0), kl: kl / n,
        proxy: options.rm ? mean(ys.map(y => score(options.rm, y))) : 0 };
    }
    function finish(it) { let x; do { x = it.next(); } while (!x.done); return x.value; }
    const features = y => {
      const f = new Array(16).fill(0);
      y.tokens.forEach(v => { if (v < 6) f[v]++; });
      f[6] = y.length; f[7] = +y.ended; f[8] = y.filler;
      for (let v = 0; v < 6; v++) f[9 + v] = +(y.tokens[0] === v);
      f[15] = (y.tokens.filter(v => v < 5).slice(-1)[0] + 1 || 0) / 5;
      return f;
    };
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const score = (rm, y) => (dot(rm.w, features(y)) - (rm.center || 0)) / (rm.scale || 1);
    function* preferences(m, seed = 17, count = 300, minGap = 1.05) {
      const random = rng(seed), pairs = []; let attempts = 0;
      // Deliberately select informative, widely separated pairs, then add BT label noise.
      // Selection uses oracle scores only to choose the annotation workload, never RM features.
      while (pairs.length < count) {
        const k = 3 + Math.floor(random() * 10), a = sample(m, k, random), b = sample(m, k, random);
        attempts++;
        if (Math.abs(a.truth - b.truth) >= minGap) {
          const probability = sigmoid(a.truth - b.truth), first = random() < probability;
          pairs.push({ a, b, w: first ? a : b, l: first ? b : a, probability });
        }
        if (attempts % 8 === 0) yield null;
        if (attempts > 200000) throw new Error('偏好筛选没有足够样本');
      }
      return { pairs, attempts, annotations: count };
    }
    function rmMetrics(rm, pairs) {
      let loss = 0, accuracy = 0, clean = 0;
      for (const p of pairs) {
        const d = score(rm, p.w) - score(rm, p.l);
        loss += Math.log1p(Math.exp(-clamp(d, -40, 40)));
        accuracy += d > 0 ? 1 : d === 0 ? 0.5 : 0;
        const da = score(rm, p.a) - score(rm, p.b);
        clean += da * (p.a.truth - p.b.truth) > 0 ? 1 : da === 0 ? 0.5 : 0;
      }
      return { loss: loss / pairs.length, accuracy: accuracy / pairs.length, clean: clean / pairs.length,
        ceiling: mean(pairs.map(p => Math.max(p.probability, 1 - p.probability))) };
    }
    function* fitRM(rm, pairs, epochs = 50) {
      for (let epoch = 0; epoch < epochs; epoch++) {
        const g = new Array(16).fill(0);
        for (let i = 0; i < pairs.length; i++) {
          const p = pairs[i], a = features(p.w), b = features(p.l);
          const diff = a.map((v, j) => v - b[j]);
          const c = sigmoid(-dot(rm.w, diff));
          diff.forEach((v, j) => { g[j] += c * v / pairs.length; });
          if (i % 16 === 0) yield null;
        }
        rm.w.forEach((w, j) => { rm.w[j] += 0.09 * (g[j] - 0.01 * w); });
        yield { epoch: epoch + 1 };
      }
      return rm;
    }
    function* prepare(seed = 17) {
      const base = model(), policy = clone(base);
      yield* sft(policy);
      const pref = yield* preferences(policy, seed);
      const heldout = yield* preferences(policy, seed + 8000, 200);
      const rm = { w: new Array(16).fill(0), center: 0, scale: 1 };
      yield* fitRM(rm, pref.pairs);
      // Centering does not change BT comparisons; no scale manipulation.
      rm.center = mean(pref.pairs.flatMap(p => [dot(rm.w, features(p.a)), dot(rm.w, features(p.b))]));
      return { base, sft: policy, pref, heldout, rm };
    }
    function clip(ratio, advantage, low = 0.2, high = 0.2) {
      return Math.min(ratio * advantage, clamp(ratio, 1 - low, 1 + high) * advantage);
    }
    function clipGrad(ratio, advantage, low = 0.2, high = 0.2) {
      return (advantage >= 0 && ratio > 1 + high) || (advantage < 0 && ratio < 1 - low) ? 0 : ratio * advantage;
    }
    const k3 = (p, q) => q / p - Math.log(q / p) - 1;
    function advantages(rewards, kind = 'GRPO', noStd = false) {
      const m = mean(rewards), sd = Math.sqrt(variance(rewards));
      return rewards.map(r => kind === 'REINFORCE' ? r : kind === 'RLOO'
        ? (r - m) * rewards.length / (rewards.length - 1)
        : (r - m) / (noStd ? 1 : sd + 1e-8));
    }
    function gae(rewards, values, lambda = 0.95) {
      let next = 0; const a = new Array(rewards.length);
      for (let t = rewards.length - 1; t >= 0; t--) {
        const delta = rewards[t] + (values[t + 1] || 0) - values[t];
        next = delta + lambda * next; a[t] = next;
      }
      return { a, returns: a.map((v, i) => v + values[i]) };
    }
    function trainer(kind, initial, options = {}) {
      return { kind, policy: clone(initial), ref: clone(initial), critic: new Float64Array(10 * 17 * 8),
        gradient: { theta: new Float64Array(initial.theta.length), b: new Float64Array(56) },
        random: rng(options.seed || 17), round: 0, generated: 0, tokens: 0, history: [], last: [],
        options: Object.assign({ batch: 80, epochs: kind === 'REINFORCE' || kind === 'RLOO' ? 1 : 3,
          lr: kind === 'REINFORCE' || kind === 'RLOO' ? 2 : 1.4,
          beta: kind === 'GRPO' ? 0.04 : 0, high: 0.2 }, options) };
    }
    function* trainRound(tr) {
      const o = tr.options, batch = []; let groups = 0, zero = 0, tries = 0;
      while (batch.length < o.batch && tries < o.batch * 8) {
        const k = 3 + Math.floor(tr.random() * 10), group = [];
        for (let j = 0; j < 8; j++) {
          const y = sample(tr.policy, k, tr.random);
          y.r = o.rm ? score(o.rm, y) : y.reward;
          if (o.lengthShape) y.r -= Math.max(0, (y.length - 6) / 2);
          group.push(y); tr.generated++; tr.tokens += y.steps.length; tries++;
          yield null;
        }
        groups++; const rewards = group.map(y => y.r);
        const homogeneous = variance(group.map(y => y.reward)) < 1e-12;
        if (homogeneous) zero++;
        if (o.dynamic && homogeneous) continue;
        const a = advantages(rewards, tr.kind, o.noStd);
        group.forEach((y, j) => {
          y.refLog = trace(tr.ref, y.k, y.tokens).steps.map(st => st.logp);
          if (tr.kind === 'PPO') {
            y.values = y.steps.map(st => tr.critic[index(st.k, st.s, st.t) / 7]);
            y.rewards = y.steps.map((st, t) => -o.beta * (st.logp - y.refLog[t]) + (t === y.steps.length - 1 ? y.r : 0));
            const g = gae(y.rewards, y.values); y.a = g.a; y.returns = g.returns;
          } else y.a = y.steps.map(() => a[j]);
        });
        batch.push(...group);
      }
      const totalTokens = batch.reduce((s, y) => s + y.steps.length, 0);
      for (let epoch = 0; epoch < o.epochs; epoch++) {
        // Frozen mini-batch gradient; the shared b is updated with the same exact gradient as theta.
        const g = tr.gradient; g.theta.fill(0); g.b.fill(0);
        const vg = new Map();
        for (const y of batch) {
          const current = trace(tr.policy, y.k, y.tokens);
          const seqRatio = Math.exp((current.logp - y.logp) / y.steps.length);
          for (let t = 0; t < y.steps.length; t++) {
            const st = current.steps[t], ratio = o.sequence ? seqRatio : Math.exp(st.logp - y.steps[t].logp);
            const denom = o.tokenLoss ? totalTokens
              : o.noStd ? batch.length * 8 : batch.length * (tr.kind === 'GRPO' ? y.steps.length : 1);
            const pg = tr.kind === 'REINFORCE' || tr.kind === 'RLOO' ? y.a[t] : clipGrad(ratio, y.a[t], 0.2, o.high);
            // d[-beta*k3]/d log p = beta*(q/p - 1), with sampled old actions held fixed.
            const kg = tr.kind === 'GRPO' ? o.beta * (Math.exp(y.refLog[t] - st.logp) - 1) : 0;
            grad(g, st, (pg + kg) / denom);
            if (tr.kind === 'PPO') {
              const vi = index(st.k, st.s, st.t) / 7;
              const entry = vg.get(vi) || [0, 0]; entry[0] += y.returns[t]; entry[1]++; vg.set(vi, entry);
            }
          }
          yield null;
        }
        for (let i = 0; i < g.theta.length; i++) tr.policy.theta[i] += o.lr * g.theta[i];
        for (let i = 0; i < 56; i++) tr.policy.b[i] += o.lr * g.b[i];
        vg.forEach((a, i) => { tr.critic[i] += 0.25 * (a[0] / a[1] - tr.critic[i]); });
        yield null;
      }
      tr.round++; tr.last = batch; tr.zero = zero / groups;
      return { round: tr.round, generated: tr.generated, zero: tr.zero, effective: batch.length };
    }
    function dpo(initial, pairs, options = {}) {
      return { policy: clone(initial), ref: clone(initial), pairs, round: 0, annotations: pairs.length,
        options: Object.assign({ beta: 0.3, lr: 1.5, iterative: false, refresh: 10, seed: 17 }, options) };
    }
    function* dpoRound(tr) {
      const o = tr.options;
      if (o.iterative && tr.round > 0 && tr.round % o.refresh === 0) {
        // New labels obey the same noisy BT law. Online pairs are not oracle filtered.
        const random = rng(o.seed + tr.round), pairs = [];
        for (let i = 0; i < 300; i++) {
          const k = 3 + i % 10, a = sample(tr.policy, k, random), b = sample(tr.policy, k, random);
          const probability = sigmoid(a.truth - b.truth), first = random() < probability;
          pairs.push({ a, b, w: first ? a : b, l: first ? b : a, probability }); yield null;
        }
        tr.pairs = pairs; tr.annotations += 300;
      }
      const g = { theta: new Float64Array(tr.policy.theta.length), b: new Float64Array(56) };
      let win = 0, lose = 0, margin = 0, loss = 0;
      for (const p of tr.pairs) {
        const w = trace(tr.policy, p.w.k, p.w.tokens), l = trace(tr.policy, p.l.k, p.l.tokens);
        const wr = trace(tr.ref, p.w.k, p.w.tokens), lr = trace(tr.ref, p.l.k, p.l.tokens);
        const z = o.beta * (w.logp - wr.logp - l.logp + lr.logp);
        const weight = o.beta * sigmoid(-z) / tr.pairs.length;
        w.steps.forEach(st => grad(g, st, weight)); l.steps.forEach(st => grad(g, st, -weight));
        win += w.logp; lose += l.logp; margin += z; loss += Math.log1p(Math.exp(-clamp(z, -40, 40)));
        yield null;
      }
      for (let i = 0; i < g.theta.length; i++) tr.policy.theta[i] += o.lr * g.theta[i];
      for (let i = 0; i < 56; i++) tr.policy.b[i] += o.lr * g.b[i];
      tr.round++;
      return { win: win / tr.pairs.length, lose: lose / tr.pairs.length,
        margin: margin / tr.pairs.length, loss: loss / tr.pairs.length };
    }
    function* dpoMetrics(tr, pairs = tr.pairs) {
      let win = 0, lose = 0, margin = 0, loss = 0;
      for (const p of pairs) {
        const w = trace(tr.policy,p.w.k,p.w.tokens).logp, l = trace(tr.policy,p.l.k,p.l.tokens).logp;
        const z = tr.options.beta * (w - trace(tr.ref,p.w.k,p.w.tokens).logp - l + trace(tr.ref,p.l.k,p.l.tokens).logp);
        win += w; lose += l; margin += z; loss += Math.log1p(Math.exp(-clamp(z,-40,40)));
        yield null;
      }
      return { win:win/pairs.length,lose:lose/pairs.length,margin:margin/pairs.length,loss:loss/pairs.length };
    }
    function* rejection(m, seed = 17) {
      const random = rng(seed), data = [];
      for (let i = 0; i < 1000; i++) {
        const y = sample(m, 3 + i % 10, random); if (y.reward) data.push(y);
        if (i % 8 === 0) yield null;
      }
      yield* sft(m, 3, data); return data.length;
    }
    const distributions = { p: [0.25, 0.18, 0.14, 0.12, 0.10, 0.11, 0.10], q: [0.16, 0.2, 0.18, 0.14, 0.12, 0.12, 0.08] };
    function klSamples(seed = 17, n = 2000) {
      const { p, q } = distributions, random = rng(seed), one = [], three = [];
      for (let i = 0; i < n; i++) { const v = draw(p, random); one.push(Math.log(p[v] / q[v])); three.push(k3(p[v], q[v])); }
      return { one, three, exact: dot(p, p.map((x, i) => Math.log(x / q[i]))) };
    }
    // A controlled policy in the SAME table family: one optional filler, then a decisive digit.
    // Both branches have ample room to terminate, making filler causally irrelevant here.
    function creditPolicy() {
      const m = model(); m.b.fill(0); m.theta.fill(-24);
      for (let t = 0; t < 8; t++) for (let s = 0; s <= 16; s++) {
        const i = index(3, s, t);
        if (s > 0) m.theta[i + 6] = 0;
        else { m.theta[i + 1] = 0; m.theta[i + 2] = 0; if (t === 0) m.theta[i + 5] = Math.log(2); }
      }
      return m;
    }
    function* credit(seed = 17, n = 1000) {
      const m = creditPolicy(), random = rng(seed), samples = [], checkpoints = [];
      for (let i = 1; i <= n; i++) {
        samples.push(sample(m, 3, random));
        if ([10, 100, 1000].includes(i) || i % 50 === 0) {
          const avg = mean(samples.map(y => y.reward)), grid = Array.from({ length: 8 }, () => new Array(7).fill(0));
          samples.forEach(y => y.steps.forEach(st => {
            for (let v = 0; v < 7; v++) grid[st.t][v] += (y.reward - avg) * ((v === st.v ? 1 : 0) - st.p[v]);
          }));
          const point = { n: i, filler: grid[0][5] / i,
            key: (grid[0][2] + grid[1][2]) / i, grid, samples: samples.slice(-8) };
          if ([10, 100, 1000].includes(i)) checkpoints.push(point);
          yield point;
        } else yield null;
      }
      return checkpoints;
    }
    return { TOKENS, mean, variance, sigmoid, ticks, rng, index, model, clone, probs, draw, response,
      sample, trace, grad, expert, sft, evaluate, finish, features, score, preferences, rmMetrics,
      fitRM, prepare, clip, clipGrad, k3, advantages, gae, trainer, trainRound, dpo, dpoRound, dpoMetrics,
      rejection, distributions, klSamples, creditPolicy, credit };
  })();

  // DOM implementation is below; requiring the file in Node does not touch browser globals.
  if (typeof document !== 'undefined') {
    // Shared verbatim with task A. Only this queue advances training generators.
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
    const C = Core, controllers = [], prepared = new Map();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const percent = x => (100 * x).toFixed(1) + '%';
    const fmt = x => Number(x).toFixed(3);
    const palette = ['--amber', '--teal', '--muted', '--red'];
    function el(tag, cls, text) {
      const n = document.createElement(tag); if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text; return n;
    }
    function button(parent, text, fn) {
      const b = el('button', 'lab-button', text); b.type = 'button'; b.onclick = fn;
      parent.appendChild(b); return b;
    }
    function renderResponse(tokens, opts = {}) {
      const row = el('div', 'lab-response');
      if (opts.label) row.appendChild(el('span', 'lab-response-label', opts.label));
      tokens.forEach((v, i) => {
        const tok = el('span', 'lab-token' + (v === 5 ? ' lab-token-filler' : v === 6 ? ' lab-token-end' : '') +
          (opts.enter && i === tokens.length - 1 ? ' lab-token-enter' : ''), C.TOKENS[v]);
        if (opts.a && opts.a[i] !== undefined) {
          const a = opts.a[i], color = a >= 0 ? '--teal' : '--red';
          tok.style.borderColor = 'var(' + color + ')';
          tok.style.background = 'color-mix(in srgb, var(' + color + ') ' +
            Math.round(12 + 35 * Math.min(1, Math.abs(a))) + '%, var(--surface))';
          if (!opts.compact) tok.appendChild(el('span', 'lab-token-adv', (a >= 0 ? '+' : '') + a.toFixed(2)));
          tok.title = '位置 ' + i + '；优势 Â = ' + fmt(a);
        }
        row.appendChild(tok);
      });
      if (!opts.partial) {
        const y = C.response(opts.k, tokens);
        row.appendChild(el('span', y.reward ? 'lab-correct' : 'lab-wrong',
          (y.reward ? '✓' : '✗') + ' R=' + y.reward + (y.ended ? '' : ' · 截断')));
      }
      return row;
    }
    function range(ui, name, label, min, max, step, value) {
      const wrap = el('label'), text = el('span', '', label), input = el('input'), out = el('output');
      input.type = 'range'; input.id = ui.id + '-' + name; input.min = min; input.max = max;
      input.step = step; input.value = value; wrap.htmlFor = input.id; out.htmlFor = input.id;
      out.value = value; input.oninput = () => { out.value = input.value; };
      input.onchange = () => { ui.settings[name] = +input.value; ui.reset(); };
      wrap.append(text, input, out); ui.params.appendChild(wrap); ui.settings[name] = value;
      return { input, out };
    }
    function select(ui, name, label, values, value) {
      const wrap = el('label'), input = el('select', 'lab-select'); input.id = ui.id + '-' + name;
      wrap.htmlFor = input.id; wrap.appendChild(el('span', '', label));
      values.forEach(v => { const op = el('option', '', v); op.value = v; input.appendChild(op); });
      input.value = value; ui.settings[name] = value;
      input.onchange = () => { ui.settings[name] = input.value; ui.reset(); };
      wrap.appendChild(input); ui.params.appendChild(wrap); return input;
    }
    function chart(ui, title, series, type = 'lines') {
      const wrap = el('div', 'lab-chart-wrap'), canvas = el('canvas', 'lab-chart');
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', title + '，尚未训练');
      const legend = el('div', 'lab-legend');
      series.forEach((s, i) => {
        const item = el('span', 'lab-legend-item'), key = el('span', 'lab-legend-key');
        key.style.borderColor = 'var(' + (s.color || palette[i % 4]) + ')';
        if (s.dash) key.style.borderTopStyle = 'dashed';
        if (s.width) key.style.borderTopWidth = s.width + 'px';
        item.append(key, document.createTextNode(s.label)); legend.appendChild(item);
      });
      wrap.append(el('div', 'lab-chart-title', title), canvas, legend); ui.charts.appendChild(wrap);
      const plot = { canvas, title, series, type, data: [], points: [], exact: 0, xLabel: '',
        xRange: [0, 100], yRange: [0, 1], height: 208, dirty: true,
        set(data) { this.data = data; this.dirty = true; ui.dirty = true; schedule(); },
        draw() { drawChart(this); } };
      ui.plots.push(plot); return plot;
    }
    function canvasContext(canvas, height) {
      const w = Math.max(180, canvas.clientWidth), dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      const css = getComputedStyle(document.documentElement), color = name => css.getPropertyValue(name).trim();
      ctx.font = '11px ' + css.getPropertyValue('--mono'); return { ctx, w, h: height, color };
    }
    function drawChart(plot) {
      const { ctx: g, w, h, color } = canvasContext(plot.canvas, plot.height);
      const denseLabels = plot.type === 'bars' && plot.data.some(d => g.measureText(d.label).width > (w - 57) / plot.data.length - 4);
      const l = 43, r = w - 14, top = 20, bottom = h - (denseLabels ? 65 : 34);
      let [xmin, xmax] = plot.xRange, [ymin, ymax] = plot.yRange;
      if (plot.type === 'scatter') {
        ymin = Math.min(ymin, ...plot.points.map(p => p.y));
        ymax = Math.max(ymax, ...plot.points.map(p => p.y));
      } else if (plot.type === 'hist') {
        ymax = Math.max(ymax, ...plot.data.map(d => d[plot.histKey]));
      } else if (plot.type === 'bars') {
        const all = plot.data.map(d => d.value);
        ymin = Math.min(ymin, ...all); ymax = Math.max(ymax, ...all);
      } else if (plot.data.length) {
        const all = plot.data.flatMap(d => plot.series.flatMap(s => [d[s.key], d[s.key + 'Lo'], d[s.key + 'Hi']])).filter(Number.isFinite);
        ymin = Math.min(ymin, ...all); ymax = Math.max(ymax, ...all);
      }
      const X = x => l + (x - xmin) / (xmax - xmin) * (r - l);
      const Y = y => bottom - (y - ymin) / (ymax - ymin) * (bottom - top);
      g.lineWidth = 1; g.textAlign = 'right';
      for (const y of C.ticks(ymin, ymax, 4)) {
        g.strokeStyle = color('--rule'); g.beginPath(); g.moveTo(l, Y(y)); g.lineTo(r, Y(y)); g.stroke();
        g.fillStyle = color('--muted'); g.fillText(String(y), l - 6, Y(y) + 4);
      }
      g.textAlign = 'center'; g.fillStyle = color('--muted');
      g.fillText(plot.xLabel, (l + r) / 2, h - 2);
      if (plot.type === 'scatter') {
        plot.points.forEach(p => { g.fillStyle = color(p.correct ? '--teal' : '--red'); g.globalAlpha = 0.65;
          g.beginPath(); g.arc(X(p.x), Y(p.y), 2.7, 0, Math.PI * 2); g.fill(); }); g.globalAlpha = 1;
      } else if (plot.type === 'bars') {
        plot.data.forEach((d, i) => {
          const bw = (r - l) / Math.max(1, plot.data.length);
          const value = d.value * (plot.growth === undefined ? 1 : plot.growth);
          g.fillStyle = color(d.color || (d.value < 0 ? '--red' : '--teal'));
          if (plot.flash === i) g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.cos((plot.flashTime || 0) / 65));
          g.fillRect(l + i * bw + 3, Math.min(Y(value), Y(0)), Math.max(1, bw - 6), Math.max(1, Math.abs(Y(value) - Y(0))));
          g.globalAlpha = 1;
          if (plot.probabilities) { g.fillStyle = color('--ink-2'); g.fillText(percent(d.value), l + (i + .5) * bw, Y(value) - 5 - (w < 400 ? (i % 2) * 12 : 0)); }
          g.fillStyle = color('--ink-2');
          if (denseLabels) { g.save(); g.translate(l + (i + .5) * bw, bottom + 12); g.rotate(-Math.PI / 4); g.textAlign = 'right'; g.fillText(d.label, 0, 0); g.restore(); }
          else g.fillText(d.label, l + (i + .5) * bw, bottom + 15);
        });
      } else if (plot.type === 'hist') {
        plot.data.forEach(d => { const bw = (r - l) / plot.data.length;
          g.fillStyle = color(plot.series[0].color); g.globalAlpha = 0.65;
          g.fillRect(X(d.x) + 1, Y(d[plot.histKey]), bw - 2, bottom - Y(d[plot.histKey])); });
        g.globalAlpha = 1; g.strokeStyle = color(plot.series[0].color); g.lineWidth = 2;
        g.beginPath(); g.moveTo(X(plot.sampleMean || 0), top); g.lineTo(X(plot.sampleMean || 0), bottom); g.stroke();
        // Draw the true value last so its dashes stay visible when both estimates nearly coincide.
        g.strokeStyle = color('--ink'); g.lineWidth = 1; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(X(plot.exact), top); g.lineTo(X(plot.exact), bottom); g.stroke(); g.setLineDash([]);
      } else {
        plot.series.forEach((s, i) => {
          const data = plot.data.filter(d => Number.isFinite(d[s.key]));
          const tint = color(s.color || palette[i % 4]); g.strokeStyle = tint; g.lineWidth = s.width || 2;
          if (data.length && Number.isFinite(data[0][s.key + 'Lo'])) {
            g.globalAlpha = 0.12; g.fillStyle = tint; g.beginPath();
            data.forEach((d, j) => { if (j === 0) g.moveTo(X(d.x), Y(d[s.key + 'Lo'])); else g.lineTo(X(d.x), Y(d[s.key + 'Lo'])); });
            data.slice().reverse().forEach(d => g.lineTo(X(d.x), Y(d[s.key + 'Hi']))); g.closePath(); g.fill(); g.globalAlpha = 1;
          }
          g.setLineDash(s.dash ? [5, 3] : []); g.beginPath();
          data.forEach((d, j) => { if (j === 0) g.moveTo(X(d.x), Y(d[s.key])); else g.lineTo(X(d.x), Y(d[s.key])); }); g.stroke();
          if (data.length === 1) { g.beginPath(); g.arc(X(data[0].x), Y(data[0][s.key]), 3, 0, Math.PI * 2); g.fillStyle = tint; g.fill(); }
        }); g.setLineDash([]);
      }
      if (plot.type !== 'bars') for (const x of C.ticks(xmin, xmax)) {
        g.fillStyle = color('--muted'); g.fillText(String(x), X(x), bottom + 15);
      }
      const last = plot.data[plot.data.length - 1];
      let description=last?'。当前数据：'+plot.series.map(s=>s.label+' '+fmt(last[s.key]||0)).join('；'):'。等待计算';
      if(plot.type==='scatter'&&plot.points.length)description='。横轴真实评分，纵轴奖励模型分数；'+plot.points.length+
        ' 条回答，其中 '+plot.points.filter(p=>p.correct).length+' 条正确。散点来自未经筛选的留出样本。';
      if(plot.type==='hist'&&plot.data.length)description='。共 '+plot.data.reduce((s,d)=>s+d.a,0)+' 个样本；真实 KL='+fmt(plot.exact)+'；k1 与 k3 的频数直方图。';
      if(plot.type==='bars'&&plot.data.length)description='。'+plot.data.map(d=>d.label+' '+fmt(d.value)).join('；');
      plot.canvas.setAttribute('aria-label',plot.title+description);
      plot.canvas.dataset.xLabel = plot.xLabel;
      plot.canvas.dataset.xRange = plot.xRange.join(',');
      plot.canvas.dataset.xTicks = C.ticks(xmin, xmax).join(',');
      plot.canvas.dataset.points = String(plot.type === 'scatter' ? plot.points.length : plot.data.length);
      plot.canvas.dataset.lastX = last && last.x !== undefined ? String(last.x) : '';
      plot.dirty = false;
    }
    function* getPrepared(ui) {
      if (prepared.has(ui.seed)) return prepared.get(ui.seed);
      ui.read.textContent = '正在从 200 条专家示范训练 SFT，再采样并标注 300 对回答。计算分片进行。';
      const p = yield* C.prepare(ui.seed); prepared.set(ui.seed, p); return p;
    }
    function samples(ui, models, labels, ks = [3, 7, 12], repeats = 2) {
      ui.samples.replaceChildren(); const cols = el('div', 'lab-columns');
      models.forEach((m, i) => {
        const col = el('div', 'lab-column'); col.appendChild(el('div', 'lab-column-title', labels[i]));
        const random = C.rng(ui.seed + 300);
        ks.forEach(k => { for (let j = 0; j < repeats; j++) {
          const y = C.sample(m, k, random); col.appendChild(renderResponse(y.tokens, { k, label: j === 0 ? '目标 k = ' + k : '' }));
        } }); cols.appendChild(col);
      }); ui.samples.appendChild(cols);
    }
    function advantageSamples(ui, tr, group = false) {
      const random = C.rng(ui.seed + tr.round), ys = group
        ? Array.from({ length: 8 }, () => C.sample(tr.policy, 7, random))
        : [3, 7, 12].map(k => C.sample(tr.policy, k, random));
      const aa = C.advantages(ys.map(y => y.reward), tr.kind, tr.options.noStd);
      ui.samples.replaceChildren(el('div', 'lab-column-title', group ? '当前策略的回答（从基座出发） · k=7' : '当前策略的回答'));
      const grid = el('div', group ? 'lab-response-grid' : ''); ui.samples.appendChild(grid);
      ys.forEach((y, i) => {
        let a = y.steps.map(() => aa[i]);
        if (tr.kind === 'PPO') {
          const ref = C.trace(tr.ref, y.k, y.tokens), values = y.steps.map(st => tr.critic[C.index(st.k, st.s, st.t) / 7]);
          const r = y.steps.map((st, t) => -tr.options.beta * (st.logp - ref.steps[t].logp));
          r[r.length - 1] += tr.options.rm ? C.score(tr.options.rm, y) : y.reward;
          a = C.gae(r, values).a;
        }
        const row = renderResponse(y.tokens, { k: y.k, a: tr.kind === 'PPO' || !group ? a : null,
          compact: group, label: group ? '' : 'k=' + y.k + ' · true=' + fmt(y.truth) });
        if (group) {
          row.classList.add('lab-response-compact');
          const v = a[0], tint = v >= 0 ? '--teal' : '--red';
          if (tr.kind !== 'PPO') {
            row.style.background = 'color-mix(in srgb, var(' + tint + ') ' +
              Math.round(8 + 22 * Math.min(1, Math.abs(v))) + '%, var(--surface))';
            row.classList.add('lab-response-shared');
          }
          const number = el('span', 'lab-adv-number', (tr.kind === 'PPO' ? 'Â₀=' : 'Â=') + (v >= 0 ? '+' : '') + v.toFixed(2));
          number.style.color = 'var(' + tint + ')'; row.appendChild(number);
          row.setAttribute('aria-label', y.tokens.map(t=>C.TOKENS[t]).join(' ') + '，奖励 '+y.reward+'，优势 '+a.map(fmt).join(' / '));
        }
        grid.appendChild(row);
      });
    }
    const titles = {
      gen: '一个会“凑数”的小语言模型', sft: '基座 → SFT → 拒绝采样微调',
      rm: '从 300 次比较里学一个奖励模型', 'flow-rlhf': '图 6 · RLHF-PPO 的一轮训练',
      rlhf: 'RLHF-PPO，以及奖励投机', dpo: 'DPO 在同一批偏好数据上',
      grpo: '可验证奖励上，四种估优势的方法', kl: 'k1 与 k3 两种 KL 估计',
      dapo: '把修补一个个打开', credit: '“嗯”到底有没有功劳'
    };
    const totals = { gen: 8, sft: 11, rm: 50, 'flow-rlhf': 1, rlhf: 120,
      dpo: 180, grpo: 100, kl: 20, dapo: 100, credit: 20 };
    function state(ui, value, round = ui.round) {
      ui.root.dataset.state = value; ui.root.dataset.round = round; ui.root.dataset.total = ui.total;
      const text = value === 'done' ? '已完成 · 共 ' + ui.total + ' 轮' :
        value === 'running' ? '训练中 · 第 ' + round + ' / ' + ui.total + ' 轮' :
        value === 'paused' ? '已暂停 · 第 ' + round + ' / ' + ui.total + ' 轮' : '尚未训练 · 共 ' + ui.total + ' 轮';
      ui.status.textContent = text; ui.status.title = '种子 ' + ui.seed;
      if (ui.key === 'gen') ui.status.textContent = value === 'done' ? '已完成 · 共 ' + ui.total + ' 个 token' :
        (value === 'paused' ? '已暂停' : value === 'idle' ? '等待生成' : '生成中') + ' · 第 ' + round + ' 个 token';
    }
    function createUI(key, root) {
      root.classList.add('widget', 'lab-shell');
      const head = el('div', 'w-head'); head.append(el('span', 'w-tag', '实例'), el('span', 'w-title', titles[key]));
      const params = el('div', 'w-ctrl'), controls = el('div', 'w-ctrl lab-toolbar');
      const status = el('div', 'lab-status', '种子 17 · 尚未训练'); status.setAttribute('role', 'status');
      const progress = el('div', 'lab-progress'), bar = el('div', 'lab-progress-bar'); progress.appendChild(bar);
      const charts = el('div'), smp = el('div', 'lab-samples'), read = el('p', 'w-read');
      const stats = el('div', 'stats');
      root.append(head, params, controls, status, progress, smp, charts, stats, read,
        el('div', 'lab-note', '玩具实验，仅用于建立直觉，数字不代表真实大模型上的结果。'));
      const ui = { key, id: root.id, root, params, controls, status, bar, charts, samples: smp, read, stats,
        plots: [], settings: {}, seed: 17, visible: false, running: false, started: false, done: false,
        dirty: true, iteration: 0, forceStep: false, delay: 0, nextAt: 0,
        total: totals[key], round: 0, progress: 0, fast: false, queued: false, paintPending: false };
      ui.reset = () => {
        window.__labQueue.cancel(ui.id); ui.queued = false;
        ui.running = false; ui.started = false; ui.done = false; ui.iteration = 0; ui.delay = 0; ui.nextAt = 0;
        ui.total = totals[key]; ui.round = 0; ui.progress = 0; ui.fast = false; ui.paintPending = false;
        ui.calculated = false; ui.animation = null; ui.startedAt = null;
        ui.root.dataset.seed = ui.seed; ui.root.dataset.progress = 0; state(ui, 'idle');
        ui.bar.style.width = '0%'; ui.read.textContent = '初始回答来自尚未更新的策略。进入视口后开始实验，也可以手动单步。';
        ui.stats.textContent = ''; ui.charts.replaceChildren(); ui.plots = [];
        ui.charts.classList.toggle('lab-chart-grid', key === 'sft' || key === 'dapo');
        if (key === 'rlhf' || key === 'dpo') {
          ui.samples.replaceChildren(el('div', 'lab-column-title', '当前策略的回答'),
            el('p', 'lab-summary', '正在准备 SFT 初始策略；完成后显示它的真实采样回答。'));
          ui.samples.dataset.policy = 'pending-sft';
        } else samples(ui, [C.model()], [key === 'grpo' ? '当前策略的回答（从基座出发）' : '基座样本'], [3, 7, 12], 1);
        configure(ui); ui.iterator = jobs[key](ui); ui.dirty = true;
        ui.play.textContent = key === 'gen' ? '再生成一次' : key === 'flow-rlhf' ? '播放' : '开始训练';
        if (ui.visible) ui.running = true; schedule();
      };
      ui.play = button(controls, '开始训练', () => {
        if (key === 'gen') { ui.seed++; ui.reset(); } else if (ui.done) ui.reset();
        ui.running = true; ui.nextAt = 0; schedule();
      });
      button(controls, '暂停', () => { ui.running = false; ui.forceStep = false; ui.started = true;
        window.__labQueue.cancel(ui.id); ui.queued = false; state(ui, 'paused'); });
      button(controls, key === 'gen' ? '逐 token' : '单步', () => {
        if (ui.done) ui.reset(); ui.running = false; ui.forceStep = true; ui.nextAt = 0; schedule();
      });
      if (key !== 'gen') {
        button(controls, '跳到结果', () => { if (ui.done) return; ui.fast = true; ui.running = true;
          ui.forceStep = false; ui.nextAt = 0; ui.animation = null; schedule(); });
        button(controls, '重置', () => { ui.reset(); ui.running = false; ui.started = true; });
        button(controls, '换个种子', () => { ui.seed++; ui.reset(); });
      }
      setupControls(ui); ui.reset(); controllers.push(ui);
      new ResizeObserver(() => { ui.dirty = true; ui.plots.forEach(p=>{p.dirty=true;}); schedule(); }).observe(root);
      return ui;
    }
    function setupControls(ui) {
      if (ui.key === 'gen') { select(ui, 'k', '目标 k', [3,4,5,6,7,8,9,10,11,12], 7); range(ui, 'temperature', '温度', 0.3, 2, 0.1, 1); }
      if (ui.key === 'rlhf') {
        const r = range(ui, 'beta', 'KL 系数 β', 0, 0.5, 0.01, 0);
        const seg = el('div', 'seg'); ui.params.appendChild(seg);
        [0, 0.1, 0.3].forEach(value => {
          const b = button(seg, 'β=' + value + (value === 0 ? '（不拴绳）' : ''), () => {
            ui.settings.beta = value; r.input.value = value; r.out.value = value;
            Array.from(seg.children).forEach(x => x.setAttribute('aria-pressed', String(x === b))); ui.reset();
          }); b.dataset.beta=String(value);b.setAttribute('aria-pressed', String(value === 0));
        });
        r.input.addEventListener('input',()=>Array.from(seg.children).forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.beta===+r.input.value))));
      }
      if (ui.key === 'dpo') { range(ui, 'beta', 'DPO β', 0.05, 1, 0.05, 0.3);
        select(ui, 'mode', '查看曲线', ['离线 DPO', '迭代 DPO'], '离线 DPO'); }
      if (ui.key === 'grpo') {
        const input = select(ui, 'method', '查看优势', ['GRPO', 'PPO', 'REINFORCE', 'RLOO'], 'GRPO');
        input.onchange = () => { ui.settings.method = input.value; if (ui.trainers) advantageSamples(ui, ui.trainers[input.value][0], true); };
      }
      if (ui.key === 'dapo') {
        const checks = el('div', 'lab-chip-list'); ui.params.appendChild(checks); const chips = {};
        [['higher', 'Clip-Higher', '把正优势的裁剪上界从 1.2 放宽到 1.28。'],
          ['dynamic', '动态采样', '过滤全对或全错组，再补足有效回答。'],
          ['tokenLoss', 'token 级损失', '用全批 token 总数归一，使每个 token 权重相同。'],
          ['lengthShape', '超长奖励整形', '在 6–8 token 缓冲区线性增加长度惩罚。'],
          ['noStd', 'Dr. GRPO', '去标准差并使用常数长度归一；与 token 级组合时以 token 归一为准。'],
          ['sequence', 'GSPO', '按整条回答的几何平均概率比计算与裁剪。']].forEach(([key, label, help]) => {
          ui.settings[key] = key === 'dynamic';
          const b = button(checks, label, () => { ui.settings[key] = !ui.settings[key]; b.setAttribute('aria-pressed', String(ui.settings[key])); ui.reset(); });
          b.classList.add('lab-chip'); b.title = help; b.setAttribute('aria-pressed', String(ui.settings[key])); chips[key] = b;
        });
        button(ui.params, 'DAPO 四件套', () => { Object.keys(chips).forEach(key => {
          ui.settings[key] = ['higher','dynamic','tokenLoss','lengthShape'].includes(key);
          chips[key].setAttribute('aria-pressed', String(ui.settings[key])); }); ui.reset(); });
      }
    }
    function configure(ui) {
      const mk = (title, specs, type) => chart(ui, title, specs.map((s, i) => ({ key: s[0], label: s[1], color: s[2] || palette[i % 4], dash: s[3], width: s[4] })), type);
      const axes = (plot, label, x, y) => { plot.xLabel = label; plot.xRange = x; plot.yRange = y; };
      const k = ui.key;
      if (k === 'gen') { ui.plot = mk('下一 token 的概率', [['value', '抽中 token','--amber'],['other','其余 token','--muted']], 'bars');
        axes(ui.plot, '下一个 token', [0,7], [0,1]); ui.plot.probabilities = true; }
      if (k === 'sft') { ui.plot = mk('训练轨迹 · 比例', [['accuracy','正确率','--teal'],['filler','含“嗯”比例','--muted']]); ui.lengthPlot = mk('平均回答长度 · 不含结束符', [['length','token 数']]);
        axes(ui.plot, 'SFT 训练轮数', [0,8], [0,1]); axes(ui.lengthPlot, 'SFT 训练轮数', [0,8], [0,8]); }
      if (k === 'rm') { ui.plot = mk('Bradley–Terry 训练', [['loss','训练损失'],['accuracy','留出集成对准确率','--teal']]);
        ui.scatter = mk('每条回答的真实评分与代理评分', [['a','正确','--teal'],['b','错误','--red']], 'scatter');
        axes(ui.plot, 'RM 训练轮数', [0,50], [0,1]); axes(ui.scatter, '真实评分 true(y)', [-.8,1], [-4,2]); }
      if (k === 'rlhf') { ui.plot = mk('同一轮训练中的三项指标', [['proxy','代理奖励 rψ'],['truth','真实评分','--teal'],['kl','序列 KL','--muted']]);
        axes(ui.plot, 'PPO 训练轮数', [0,120], [-.5,3]); }
      if (k === 'dpo') {
        ui.plot = mk('固定初始 300 对上的 log π', [['win','被选中回答'],['lose','被拒绝回答','--muted']]);
        ui.quality = mk('策略表现与隐式奖励差', [['offline','离线 true','--teal'],['iterative','迭代 true','--amber'],['accuracy','所选策略正确率','--muted'],['margin','隐式奖励差','--red']]);
        axes(ui.plot, 'DPO 训练轮数', [0,60], [-12,0]); axes(ui.quality, 'DPO 训练轮数', [0,60], [0,1]);
      }
      if (k === 'grpo') { ui.plot = mk('正确率 · 3 个种子的均值与 ±1 标准差', [
        ['REINFORCE','REINFORCE','--muted'],['RLOO','RLOO','--ink',true],
        ['GRPO','GRPO','--amber',false,3.5],['PPO','PPO','--teal']]);
        axes(ui.plot, '每个种子生成的回答数', [0,8000], [0,1]); }
      if (k === 'kl') {
        ui.histograms = ['a','b'].map((key,i) => {
          const plot = mk((i ? 'k3' : 'k1')+' · 样本频数', [[key,i?'k3':'k1',i?'--teal':'--amber']], 'hist');
          axes(plot, '单样本估计值（共享横轴）', [-.4,.6], [0,1200]); plot.histKey = key;
          plot.reference = el('div','lab-chart-reference','虚线：真实 KL；实线：样本均值');
          plot.canvas.parentElement.insertBefore(plot.reference,plot.canvas); return plot;
        });
      }
      if (k === 'dapo') { ui.metricPlots = {};
        [['accuracy','正确率'],['entropy','平均 token 熵'],['zero','全对 / 全错组占比'],['wrongLength','错误回答平均长度'],['truncated','截断比例']].forEach(([key,label]) => {
          ui.metricPlots[key] = mk(label, [['base','原版 GRPO','--muted',true],['chosen','当前组合','--amber']]);
          axes(ui.metricPlots[key], '训练轮数', [0,100],
            [0,key==='entropy'?2:key==='wrongLength'?8:key==='zero'?.5:key==='truncated'?.05:1]);
          ui.metricPlots[key].height = 140; ui.metricPlots[key].canvas.style.height = '140px';
        }); }
      if (k === 'credit') { ui.plot = mk('平均净推动 · 累计梯度 / 样本数', [['value','正信号','--teal'],['negative','负信号','--red']], 'bars');
        ui.gridPlot = mk('逐位置的净推动', [['value','正信号','--teal'],['negative','负信号','--red']], 'bars');
        axes(ui.plot, 'token', [0,2], [-.1,.3]); axes(ui.gridPlot, '位置 : token', [0,12], [-.2,.2]); }
      if (k === 'flow-rlhf') initFlow(ui);
    }
    function* measured(m, opts) { return yield* C.evaluate(m, opts); }
    const jobs = {
      *gen(ui) {
        const base = C.model(), e = yield* measured(base), random = C.rng(ui.seed);
        ui.stats.textContent = '基座全 k 正确率 ' + percent(e.accuracy) + ' · 固定 400 条评测 · 温度 1';
        const k = +ui.settings.k;
          const y = C.sample(base, k, random, ui.settings.temperature);
          ui.total = y.steps.length;
          for (let t = 0; t < y.steps.length; t++) {
            ui.plot.set(y.steps[t].p.map((p, v) => ({ label: C.TOKENS[v], value: p, color: '--muted' })));
            ui.read.textContent = '目标 k=' + k + '。位置 ' + t + '：先计算 7 个 token 的概率，再抽取一个。';
            ui.samples.replaceChildren(renderResponse(y.tokens.slice(0,t), { k, partial: true }));
            ui.plot.flash = -1;
            yield { progress: t / y.steps.length, round: t, animation: 'grow', delay: 500 };
            ui.plot.data[y.steps[t].v].color = '--amber';
            ui.plot.flash = y.steps[t].v;
            yield { progress: (t+.3) / y.steps.length, round: t, animation: 'flash', delay: 350 };
            ui.plot.flash = -1;
            ui.samples.replaceChildren(renderResponse(y.tokens.slice(0,t+1), { k, partial: t < y.steps.length-1, enter: true }));
            ui.read.textContent = 'k=' + k + '；log π(y|x) = ' + y.steps.slice(0,t+1).map(st=>st.logp.toFixed(2)).join(' + ') +
              ' = ' + fmt(y.steps.slice(0,t+1).reduce((s,st)=>s+st.logp,0));
            yield { progress: (t + 1) / y.steps.length, round: t+1, tokenComplete: true, delay: 900 };
          }
          ui.read.textContent += '。数字和=' + y.sum + '，' + (y.reward ? '正确结束。' : y.ended ? '和目标不符。' : '达到 8 token，截断判错。');
      },
      *sft(ui) {
        const base = C.model(), m = C.clone(base), history = [{ x:0, ...yield* measured(base) }];
        ui.plot.set(history); ui.lengthPlot.set(history);
        yield { progress: 0, round: 0 };
        for(let epoch=0;epoch<8;epoch++) {
          const it = C.sft(m,1); let result, seen=0;
          while (!(result = it.next()).done) {
            if(!result.value) {
              seen++;
              if(seen===100||seen===200){
                const round=epoch+seen/200;
                history.push({x:round,...yield* measured(m)}); ui.plot.set(history);ui.lengthPlot.set(history);
                samples(ui,[base,m,m],['基座','SFT 第 '+round+' 轮','等待拒绝采样']);
                ui.read.textContent='200 条专家示范，每个目标 20 条；SFT 正确率 '+percent(history[history.length-1].accuracy)+'。';
                yield {progress:round/11,round:Math.floor(round)};
              } else yield null;
            }
          }
        }
        const after=C.clone(m), random=C.rng(ui.seed), data=[];
        for(let i=0;i<1000;i++){const y=C.sample(m,3+i%10,random);if(y.reward)data.push(y);if(i%8===0)yield null;}
        for(let epoch=0;epoch<3;epoch++){
          const it=C.sft(after,1,data);let result,seen=0;
          while(!(result=it.next()).done){if(!result.value){seen++;if(seen===Math.ceil(data.length/2)||seen===data.length){
            const round=8+epoch+seen/data.length;
            samples(ui,[base,m,after],['基座','SFT 后','拒绝采样微调中']);
            yield {progress:round/11,round:Math.floor(round)};
          }else yield null;}}
        }
        const accepted=data.length,e=yield* measured(after),sftResult=history[history.length-1];
        samples(ui,[base,m,after],['基座','SFT 后','拒绝采样后']);
        ui.read.textContent = 'SFT 正确率 ' + percent(sftResult.accuracy) + '，含“嗯”比例 ' + percent(sftResult.filler) +
          '。从模型自己的 1000 条回答中保留 '+accepted+' 条正确样本，再微调 3 轮，正确率达到 '+percent(e.accuracy)+'。';
        ui.stats.textContent = '正确率 '+percent(history[0].accuracy)+' → '+percent(sftResult.accuracy)+' → '+percent(e.accuracy);
        yield { progress:1 };
      },
      *rm(ui) {
        const m = C.model(); yield* C.sft(m);
        const pref = yield* C.preferences(m,ui.seed), hold = yield* C.preferences(m,ui.seed+8000,200);
        for (let i=0;i<4;i++) {
          const p=pref.pairs[i], pair=el('div','lab-pair');
          [p.a,p.b].forEach((y,j)=>{const side=el('div','lab-pair-side'+(y===p.w?' lab-pair-chosen':''));
            side.append(el('div','lab-summary',(j?'右':'左')+(y===p.w?' · 标注员选中':'')),renderResponse(y.tokens,{k:y.k,label:'k='+y.k}));pair.appendChild(side);});
          ui.samples.replaceChildren(pair); ui.read.textContent='标签由 σ(true左 − true右) 随机抽取，选择概率为 '+percent(p.probability)+'，标注可能出错。';
          yield {progress:0,round:0,delay:400};
        }
        const raw=yield* C.preferences(m,ui.seed+9000,200,0);
        const rm={w:new Array(16).fill(0),center:0,scale:1}, history=[];
        for(let e=0;e<=50;e++) {
          if(e) yield* C.fitRM(rm,pref.pairs,1);
          const train=C.rmMetrics(rm,pref.pairs), test=C.rmMetrics(rm,hold.pairs);
          history.push({x:e,loss:train.loss,accuracy:test.accuracy});ui.plot.set(history);
          ui.scatter.points=raw.pairs.slice(0,100).flatMap(p=>[p.a,p.b]).map(y=>({x:y.truth,y:C.score(rm,y),correct:y.reward}));
          ui.read.textContent='留出 200 对的带噪标签准确率 '+percent(test.accuracy)+'；该留出集的 BT 理论上限 '+percent(test.ceiling)+
            '。未经筛选的另一组留出对准确率 '+percent(C.rmMetrics(rm,raw.pairs).accuracy)+
            '。300 对训练数据经过 |true差|≥1.05 筛选（'+pref.attempts+' 次候选比较）；这会强化“短就是好”的偏差。RM 特征不含 k、数字和或正确标志。';
          ui.stats.textContent='训练损失 '+fmt(train.loss)+' · 留出损失 '+fmt(test.loss); yield {progress:e/50,round:e};
        }
        const wrong=raw.pairs.flatMap(p=>[p.a,p.b]).filter(y=>!y.reward).sort((a,b)=>C.score(rm,b)-C.score(rm,a))[0];
        ui.samples.appendChild(renderResponse(wrong.tokens,{k:wrong.k,label:'错误却获高分的样本 · k='+wrong.k+' · rψ='+fmt(C.score(rm,wrong))}));
      },
      *rlhf(ui) {
        const p=yield* getPrepared(ui), tr=C.trainer('PPO',p.sft,{seed:ui.seed,rm:p.rm,beta:ui.settings.beta});
        ui.samples.dataset.policy='sft';
        const history=[];let peak=null,firstDrop=null;
        for(let i=0;i<=120;i++) {
          if(i) yield* C.trainRound(tr);
          const e=yield* measured(tr.policy,{ref:tr.ref,rm:p.rm});history.push({x:i,...e});ui.plot.set(history);
          if(!peak||e.truth>peak.truth){peak={round:i,truth:e.truth};firstDrop=null;}
          else if(firstDrop===null&&e.truth<peak.truth-0.015)firstDrop=i;
          advantageSamples(ui,tr);
          ui.read.textContent='β='+ui.settings.beta+'；真实评分峰值 '+fmt(peak.truth)+'（第 '+peak.round+' 轮），当前 '+fmt(e.truth)+
            (firstDrop===null?'，尚未观察到明显下降。':'；峰值后第 '+firstDrop+' 轮首次下降超过 0.015。')+
            ' 当前平均长度 '+e.length.toFixed(2)+'。短回答能讨好这个 RM，却可能没凑够目标数。';
          ui.stats.textContent='代理 '+fmt(e.proxy)+' · true '+fmt(e.truth)+' · KL '+fmt(e.kl)+' · 生成 '+tr.generated+' 条';
          yield {progress:i/120,round:i};
        }
        ui.read.textContent+=' 当前样本：'+[3,7,12].map(k=>'k='+k+' → '+C.sample(tr.policy,k,C.rng(77)).tokens.map(v=>C.TOKENS[v]).join(' ')).join('；')+'。';
      },
      *dpo(ui) {
        const p=yield* getPrepared(ui), a=C.dpo(p.sft,p.pref.pairs,{beta:ui.settings.beta,seed:ui.seed}),
          b=C.dpo(p.sft,p.pref.pairs,{beta:ui.settings.beta,seed:ui.seed,iterative:true});
        ui.samples.dataset.policy='sft';
        const logs=[],quality=[];let down=false,prev=null;
        for(let i=0;i<=60;i++) {
          if(i){yield* C.dpoRound(a);yield* C.dpoRound(b);}
          const ea=yield* measured(a.policy),eb=yield* measured(b.policy),selected=ui.settings.mode==='离线 DPO'?a:b;
          const numbers=yield* C.dpoMetrics(selected,p.pref.pairs);
          if(prev&&numbers.win<prev.win&&numbers.lose<prev.lose)down=true;prev=numbers;
          logs.push({x:i,...numbers});quality.push({x:i,offline:ea.truth,iterative:eb.truth,accuracy:selected===a?ea.accuracy:eb.accuracy,margin:numbers.margin});
          ui.plot.set(logs);ui.quality.set(quality);samples(ui,[a.policy,b.policy],['当前策略的回答 · 离线 DPO','当前策略的回答 · 迭代 DPO'],[3,7,12],1);
          ui.read.textContent='固定初始 300 对上的 log 概率'+(down?'出现了同一轮双双下降。':'尚未出现同一轮双双下降。')+
            '离线 true='+fmt(ea.truth)+'；迭代 true='+fmt(eb.truth)+'。每 10 轮刷新 300 对，迭代累计标注 '+b.annotations+' 对，额外标注预算不与离线混为一谈。';
          yield {progress:i/80,round:i};
        }
        const ppo=C.trainer('PPO',p.sft,{seed:ui.seed,rm:p.rm,beta:0.1});
        for(let i=0;i<120;i++){yield* C.trainRound(ppo);if(i%10===0)yield {progress:.75+.25*i/120,round:60+i};}
        const e=yield* measured(ppo.policy),last=quality[quality.length-1];
        ui.stats.textContent='同为 300 对标注：DPO true='+fmt(last.offline)+' ｜ RLHF β=0.1 true='+fmt(e.truth)+'；训练计算预算不同。';
        yield {progress:1};
      },
      *grpo(ui) {
        const names=['REINFORCE','RLOO','GRPO','PPO'], base=C.model(), trs={};
        names.forEach(name=>{trs[name]=[0,1,2].map(i=>C.trainer(name,base,{seed:ui.seed+i}));});ui.trainers=trs;
        const history=[];
        for(let round=0;round<=100;round++) {
          if(round)for(const name of names)for(const tr of trs[name])yield* C.trainRound(tr);
          if(round%5===0) {
            const row={x:round*80};
            for(const name of names){const values=[];for(const tr of trs[name])values.push((yield* measured(tr.policy)).accuracy);
              row[name]=C.mean(values);const sd=Math.sqrt(C.variance(values));row[name+'Lo']=Math.max(0,row[name]-sd);row[name+'Hi']=Math.min(1,row[name]+sd);}
            history.push(row);ui.plot.set(history);advantageSamples(ui,trs[ui.settings.method][0],true);
            const fastest=names.slice().sort((a,b)=>row[b]-row[a])[0],stable=names.slice().sort((a,b)=>(row[a+'Hi']-row[a+'Lo'])-(row[b+'Hi']-row[b+'Lo']))[0];
            const reaches=names.map(name=>({name,point:history.find(x=>x[name]>=.4)})).filter(x=>x.point).sort((a,b)=>a.point.x-b.point.x);
            ui.read.textContent=(reaches.length?'最先达到 40%：'+reaches[0].name+'，用了 '+reaches[0].point.x+' 条回答。':'尚无方法达到 40%。')+
              '当前同预算正确率最高：'+fastest+'（'+percent(row[fastest])+'）；种子间标准差最小：'+stable+
              '。每种算法每个种子 '+round*80+' 条回答。带表示 3 种子的 ±1 标准差，不是置信区间。'+
              ' PPO 在这里最快，是因为表格 Critic 在这个小任务上很容易学准；真实大模型的 Critic 与策略同规模、很难训准，这正是正文 12.1 节说的问题。';
            ui.stats.textContent='模型：REINFORCE/RLOO 1 个策略；GRPO 策略＋参考；PPO 策略＋Critic。PPO/GRPO 每批更新 3 轮。';
            yield {progress:round/100,round};
          } else yield null;
        }
        const details=el('details','lab-workload'),wrap=el('div','lab-table-wrap'),table=el('table','lab-table');
        details.appendChild(el('summary','','查看 token 工作量'));details.appendChild(wrap);
        table.innerHTML='<thead><tr><th>方法</th><th>采样 token（3 种子合计）</th><th>策略训练 token</th><th>Critic 前向 / 回归 token</th></tr></thead>';
        const body=el('tbody');names.forEach(name=>{const total=trs[name].reduce((s,t)=>s+t.tokens,0),epochs=trs[name][0].options.epochs;
          const row=el('tr');[name,total,total*epochs,name==='PPO'?total+' / '+total*epochs:'0'].forEach(x=>row.appendChild(el('td','',String(x))));body.appendChild(row);});table.appendChild(body);wrap.appendChild(table);ui.stats.appendChild(details);
      },
      *kl(ui) {
        const all=C.klSamples(ui.seed),n=all.one.length;ui.samples.replaceChildren();
        ui.summary=el('p','lab-summary','πθ = '+C.distributions.p.join(' / ')+'；πref = '+C.distributions.q.join(' / '));ui.samples.appendChild(ui.summary);
        for(let size=100;size<=n;size+=100){
          const one=all.one.slice(0,size),three=all.three.slice(0,size),bins=Array.from({length:28},(_,i)=>({x:-.4+i/28,a:0,b:0}));
          [one,three].forEach((values,i)=>values.forEach(v=>{const bin=Math.max(0,Math.min(27,Math.floor((v+.4)*28)));bins[bin][i?'b':'a']++;}));
          ui.histograms.forEach((plot,i)=>{plot.exact=all.exact;plot.sampleMean=C.mean(i?three:one);plot.set(bins);
            plot.reference.textContent='虚线 · 真实 KL '+all.exact.toFixed(6)+'　实线 · 样本均值 '+plot.sampleMean.toFixed(6);});
          ui.read.textContent=size+' 次采样；真实 KL='+fmt(all.exact)+'。k1 均值 '+fmt(C.mean(one))+'、方差 '+fmt(C.variance(one))+
            '；k3 均值 '+fmt(C.mean(three))+'、方差 '+fmt(C.variance(three))+'。本组分布的 k1 有 '+one.filter(x=>x<0).length+' 个负样本，k3 最小值 '+fmt(Math.min(...three))+'。较低方差是本例实测，非所有分布的保证。';
          yield {progress:size/n,round:size/100};
        }
      },
      *dapo(ui) {
        const base=C.model(),a=C.trainer('GRPO',base,{seed:ui.seed}),opts=Object.assign({seed:ui.seed},ui.settings);
        opts.high=opts.higher?0.28:0.2;const b=C.trainer('GRPO',base,opts),hist={};
        Object.keys(ui.metricPlots).forEach(key=>{hist[key]=[];});
        for(let i=0;i<=100;i++) {
          if(i){yield* C.trainRound(a);yield* C.trainRound(b);}
          if(i%5===0){const ea=yield* measured(a.policy),eb=yield* measured(b.policy);ea.zero=a.zero||0;eb.zero=b.zero||0;
            Object.keys(hist).forEach(key=>{hist[key].push({x:i,base:ea[key],chosen:eb[key]});ui.metricPlots[key].set(hist[key]);});
            samples(ui,[a.policy,b.policy],['原版 GRPO','当前组合'],[7,12],1);
            const diff=eb.accuracy-ea.accuracy;
            ui.read.textContent='正确率 '+percent(ea.accuracy)+' → '+percent(eb.accuracy)+'。'+(Math.abs(diff)<.04?'在这个玩具任务里差别不明显。':diff>0?'当前组合更高。':'当前组合更低，修补并不保证在这个任务上更好。')+
              ' 动态采样实际生成预算也计入：原版 '+a.generated+' 条，组合 '+b.generated+' 条。长度整形采用 6–8 token 缓冲区；保留 β=0.04 以单独观察开关。';
            yield {progress:i/100,round:i};
          } else yield null;
        }
      },
      *credit(ui) {
        ui.samples.replaceChildren();const rows=[];
        ui.read.textContent='固定 k=3：先可选地写一个“嗯”，再在 2 和 3 中选择，随后结束。两条分支都远离截断上限，因此这个受控策略中的“嗯”不改变成功机会。';
        const it=C.credit(ui.seed);let x;
        while(!(x=it.next()).done){if(!x.value){yield null;continue;}
          const p=x.value;if([10,100,1000].includes(p.n))rows.push(p);
          ui.plot.set([{label:'嗯',value:p.filler},{label:'关键数字 3',value:p.key}]);
          ui.gridPlot.set(p.grid.slice(0,3).flatMap((a,t)=>[1,2,5,6].map(v=>({label:t+':'+C.TOKENS[v],value:a[v]/p.n}))));
          ui.samples.replaceChildren(...p.samples.slice(-3).map(y=>renderResponse(y.tokens,{k:3})));
          ui.stats.textContent=rows.map(r=>'N='+r.n+'：嗯 '+fmt(r.filler)+' / 数字3 '+fmt(r.key)).join('；');
          ui.read.textContent='当前 N='+p.n+'。柱高是组内减均值后 (R−R̄)·(1[token=v]−π(v|s)) 的累计量除以 N，保留正负号。'+
            '“嗯”在此受控策略中的期望为 0，有限样本会波动；关键数字的均值为 '+fmt(p.key)+'。一般策略中“嗯”会占用长度并改变后续位置，不能直接假设其梯度为 0。';
          yield {progress:p.n/1000,round:Math.floor(p.n/50)};
        }
      },
      *'flow-rlhf'(ui) {
        const p=yield* getPrepared(ui),tr=C.trainer('PPO',p.sft,{seed:ui.seed,rm:p.rm,beta:0.1});yield* C.trainRound(tr);
        const y=tr.last[0];ui.samples.replaceChildren(renderResponse(y.tokens,{k:y.k,label:'这轮实际采样 · k='+y.k}));
        const texts=['k='+y.k+' → '+y.tokens.map(v=>C.TOKENS[v]).join(' '),
          'r='+fmt(y.r)+'；log πref='+fmt(y.refLog.reduce((s,x)=>s+x,0))+'；log πold='+fmt(y.logp)+'；V₀='+fmt(y.values[0]),
          'Â='+y.a.map(fmt).join(' / '), 'K=3；首 token ρ='+fmt(Math.exp(C.trace(tr.policy,y.k,y.tokens).steps[0].logp-y.steps[0].logp))];
        ui.flowTexts=texts;
        [['91','199',y.tokens.map(v=>C.TOKENS[v]).join(' ')],['220','78','r = '+fmt(y.r)],
          ['220','150','log πref = '+fmt(y.refLog.reduce((s,x)=>s+x,0))],
          ['220','222','log πold = '+fmt(y.logp)],['220','294','V₀ = '+fmt(y.values[0])],
          ['511','208','Â₀ = '+fmt(y.a[0])]].forEach(([x,y,text])=>{
            const node=ui.flowSVG.querySelector('text[x="'+x+'"][y="'+y+'"]');if(node)node.textContent=text;
          });
        for(let stage=0;stage<4;stage++)for(let frame=0;frame<=16;frame++){
          ui.flowStage=stage;ui.flowFraction=frame/16;
          ui.read.textContent=['① 生成','② 打分','③ 算优势','④ 更新'][stage]+'：'+texts[stage];
          yield {progress:(stage+frame/16)/4,round:1,delay:160};
        }
        ui.flowStage=-1;drawFlow(ui);ui.read.textContent='橙色是训练策略，青色是 Critic，虚线框是冻结模型。上面四步来自相同种子下 RLHF-PPO 的真实第一轮。';
      }
    };
    const flowMarkup = /* FLOW_START */"<svg id=\"fig-rlhf\" viewBox=\"0 0 760 340\" role=\"img\" aria-label=\"RLHF-PPO 的四个模型与数据流：生成、打分、算优势、更新\">\r\n        <defs>\r\n          <marker id=\"a4\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6.5\" markerHeight=\"6.5\" orient=\"auto\"><path d=\"M0,0 L10,5 L0,10 z\" class=\"s-mut\"/></marker>\r\n          <marker id=\"a4a\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6.5\" markerHeight=\"6.5\" orient=\"auto\"><path d=\"M0,0 L10,5 L0,10 z\" class=\"s-amb\"/></marker>\r\n        </defs>\r\n        <text x=\"91\" y=\"22\" text-anchor=\"middle\" class=\"t-m\">① 生成</text>\r\n        <text x=\"301\" y=\"22\" text-anchor=\"middle\" class=\"t-m\">② 打分</text>\r\n        <text x=\"511\" y=\"22\" text-anchor=\"middle\" class=\"t-m\">③ 算优势</text>\r\n        <text x=\"686\" y=\"22\" text-anchor=\"middle\" class=\"t-m\">④ 更新</text>\r\n        <rect x=\"16\" y=\"130\" width=\"150\" height=\"84\" rx=\"9\" class=\"box tr\"/>\r\n        <text x=\"91\" y=\"160\" text-anchor=\"middle\" class=\"t-b\">Actor π_θ</text>\r\n        <text x=\"91\" y=\"182\" text-anchor=\"middle\" class=\"t-s\">对一批提示 x</text>\r\n        <text x=\"91\" y=\"199\" text-anchor=\"middle\" class=\"t-s\">采样回答 y</text>\r\n        <path d=\"M166,172 L190,172\" class=\"ln\"/>\r\n        <path d=\"M190,62 L190,282\" class=\"ln\"/>\r\n        <path d=\"M190,62 L204,62\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <path d=\"M190,134 L204,134\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <path d=\"M190,206 L204,206\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <path d=\"M190,278 L204,278\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <rect x=\"206\" y=\"38\" width=\"190\" height=\"50\" rx=\"8\" class=\"box fz\"/>\r\n        <text x=\"220\" y=\"59\" class=\"t-b\" style=\"font-size:13px\">奖励模型 r_ψ · 冻结</text>\r\n        <text x=\"220\" y=\"78\" class=\"t-s\">给整段回答打分 r(x, y)</text>\r\n        <rect x=\"206\" y=\"110\" width=\"190\" height=\"50\" rx=\"8\" class=\"box fz\"/>\r\n        <text x=\"220\" y=\"131\" class=\"t-b\" style=\"font-size:13px\">参考模型 π_ref · 冻结</text>\r\n        <text x=\"220\" y=\"150\" class=\"t-s\">每个 token 的 log π_ref</text>\r\n        <rect x=\"206\" y=\"182\" width=\"190\" height=\"50\" rx=\"8\" class=\"box fz\"/>\r\n        <text x=\"220\" y=\"203\" class=\"t-b\" style=\"font-size:13px\">Actor 快照 π_old</text>\r\n        <text x=\"220\" y=\"222\" class=\"t-s\">每个 token 的 log π_old</text>\r\n        <rect x=\"206\" y=\"254\" width=\"190\" height=\"50\" rx=\"8\" class=\"box tl\"/>\r\n        <text x=\"220\" y=\"275\" class=\"t-b\" style=\"font-size:13px\">Critic V_φ · 训练</text>\r\n        <text x=\"220\" y=\"294\" class=\"t-s\">每个 token 的价值 V(s_t)</text>\r\n        <path d=\"M396,63 L416,63 M396,135 L416,135 M396,207 L416,207 M396,279 L416,279 M416,63 L416,279\" class=\"ln\"/>\r\n        <path d=\"M416,172 L434,172\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <rect x=\"436\" y=\"118\" width=\"150\" height=\"108\" rx=\"9\" class=\"box\"/>\r\n        <text x=\"511\" y=\"146\" text-anchor=\"middle\" class=\"t-b\" style=\"font-size:13px\">逐 token 奖励</text>\r\n        <text x=\"511\" y=\"166\" text-anchor=\"middle\" class=\"t-s\">KL 惩罚 + 结尾 r(x,y)</text>\r\n        <text x=\"511\" y=\"188\" text-anchor=\"middle\" class=\"t-b\" style=\"font-size:13px\">GAE</text>\r\n        <text x=\"511\" y=\"208\" text-anchor=\"middle\" class=\"t-s\">→ 优势 Â_t、回报目标</text>\r\n        <path d=\"M586,172 L606,172 M606,108 L606,236\" class=\"ln\"/>\r\n        <path d=\"M606,108 L624,108\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <path d=\"M606,236 L624,236\" class=\"ln\" marker-end=\"url(#a4)\"/>\r\n        <rect x=\"626\" y=\"80\" width=\"120\" height=\"56\" rx=\"8\" class=\"box tr\"/>\r\n        <text x=\"686\" y=\"104\" text-anchor=\"middle\" class=\"t-b\" style=\"font-size:13px\">Actor</text>\r\n        <text x=\"686\" y=\"123\" text-anchor=\"middle\" class=\"t-s\">PPO-clip 损失</text>\r\n        <rect x=\"626\" y=\"208\" width=\"120\" height=\"56\" rx=\"8\" class=\"box tl\"/>\r\n        <text x=\"686\" y=\"232\" text-anchor=\"middle\" class=\"t-b\" style=\"font-size:13px\">Critic</text>\r\n        <text x=\"686\" y=\"251\" text-anchor=\"middle\" class=\"t-s\">价值回归损失</text>\r\n        <path d=\"M686,136 L686,150 L700,150 L700,322 L91,322 L91,216\" class=\"ln-amb\" style=\"stroke-width:1.6;stroke-dasharray:5 4\" marker-end=\"url(#a4a)\"/>\r\n        <text x=\"395\" y=\"316\" text-anchor=\"middle\" class=\"t-s\">更新后的 Actor 进入下一轮</text>\r\n      </svg>"/* FLOW_END */;
    function initFlow(ui) {
      const wrap=el('div','lab-flow'),holder=el('div');holder.innerHTML=flowMarkup;
      const svg=holder.querySelector('svg');if(!svg)return;
      svg.id='lab-rlhf-structure';svg.classList.add('lab-flow-svg');
      const feedback=svg.querySelector('path.ln-amb');
      feedback.setAttribute('d','M686,136 L686,150 L754,150 L754,328 L91,328 L91,216');
      const canvas=el('canvas','lab-flow-canvas');canvas.setAttribute('aria-hidden','true');
      const scroll=el('div','lab-flow-scroll');wrap.append(svg,canvas);scroll.appendChild(wrap);ui.charts.appendChild(scroll);ui.flowCanvas=canvas;ui.flowSVG=svg;
      ui.flowStage=-1;ui.flowFraction=0;
      ui.flowTexts=['策略生成回答','RM / πref / πold / Critic 给出分数','KL 奖励 + GAE','PPO-clip + 价值回归'];
      const details=el('div','lab-flow-details');ui.flowDetails=[];
      ['① 生成','② 打分','③ 算优势','④ 更新'].forEach((name,i)=>{
        const item=el('div','lab-flow-detail');item.append(el('strong','',name),el('div','',ui.flowTexts[i]));details.appendChild(item);ui.flowDetails.push(item);
      });ui.charts.appendChild(details);
      ui.read.textContent='静态结构已完整显示。播放后，沿生成、打分、优势和更新四个阶段查看同一轮真实数据。';
    }
    function drawFlow(ui) {
      if(!ui.flowCanvas)return;
      const c=ui.flowCanvas,{ctx:g,w,color}=canvasContext(c,c.clientHeight||180),scale=w/760;
      const stage=ui.flowStage;ui.flowDetails.forEach((item,i)=>{
        item.classList.toggle('lab-flow-detail-active',stage===i);item.lastChild.textContent=ui.flowTexts[i];
      });
      const rectangles=Array.from(ui.flowSVG.querySelectorAll('rect'));
      rectangles.forEach((r,i)=>r.classList.toggle('lab-flow-active',stage===0?i===0:stage===1?i>=1&&i<=4:stage===2?i===5:stage===3?i>=6:false));
      if(stage<0||motion.matches)return;
      const paths=[[[166,172],[190,172],[190,62],[206,62]],[[396,62],[416,62],[416,172],[436,172]],
        [[586,172],[606,172],[606,108],[626,108]],[[686,136],[686,150],[754,150],[754,328],[91,328],[91,216]]];
      const p=pathPoint(paths[stage],ui.flowFraction);g.fillStyle=color('--amber');g.beginPath();g.arc(p[0]*scale,p[1]*scale,4,0,Math.PI*2);g.fill();
    }
    function pathPoint(points,fraction){
      const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
      let left=lengths.reduce((a,b)=>a+b,0)*fraction;
      for(let i=0;i<lengths.length;i++){if(left<=lengths[i]){const f=left/lengths[i];return [points[i][0]+(points[i+1][0]-points[i][0])*f,points[i][1]+(points[i+1][1]-points[i][1])*f];}left-=lengths[i];}
      return points[points.length-1];
    }
    function enhanceFigure() {
      const svg=document.getElementById('fig-ppo-grpo');if(!svg)return;
      const parent=svg.parentElement;parent.classList.add('lab-flow-enhanced');
      const controls=el('div','lab-flow-enhancement'),status=el('p','lab-summary','PPO 逐 token 计算 GAE；GRPO 让同题 8 条回答汇入组内标准化。');
      const canvas=el('canvas','lab-flow-canvas');canvas.setAttribute('aria-hidden','true');parent.appendChild(canvas);
      const host=svg.closest('figure');host.append(controls,status);let active=false,visible=true,frame=0,handle=0;
      function draw(){const {ctx:g,w,color}=canvasContext(canvas,svg.clientHeight),scale=w/760;g.save();g.scale(scale,scale);
        if(active&&!motion.matches){const f=(frame%80)/80;g.fillStyle=color('--amber');
          g.beginPath();g.arc(70+f*640,74,4,0,Math.PI*2);g.fill();
          for(let i=0;i<8;i++){const start=[205,215+i*10],end=[318,272],p=pathPoint([start,[280,215+i*10],end,[514,272],[698,272]],f);
            g.fillStyle=color(i%2?'--teal':'--amber');g.fillRect(p[0]-7,p[1]-3,14,6);}
        }g.restore();}
      function animate(){if(!active||!visible)return;draw();frame++;if(frame>=160){active=false;status.textContent='播放完毕：PPO 的 Critic 给出逐 token 优势；GRPO 的 8 条回答经过组内标准化，每条回答共享一个优势。';draw();return;}handle=requestAnimationFrame(animate);}
      button(controls,'播放',()=>{frame=0;active=!motion.matches;status.textContent='PPO：采样 → 四个模型 → GAE → 更新。GRPO：8 个回答 → 奖励 → 组内标准化 → 更新。';cancelAnimationFrame(handle);animate();});
      button(controls,'暂停',()=>{active=false;cancelAnimationFrame(handle);draw();});
      new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&active)animate();else cancelAnimationFrame(handle);},{rootMargin:'200px'}).observe(svg);
      new ResizeObserver(draw).observe(svg);
    }
    let scheduled=false;
    function schedule() { if(!scheduled){scheduled=true;requestAnimationFrame(tick);} }
    function checkpoint(ui, item) {
      const now=performance.now(),previous=ui.progress;
      ui.progress=Math.max(previous,item.progress);ui.round=item.round===undefined?Math.round(ui.progress*ui.total):item.round;
      ui.root.dataset.phase=item.animation||(item.tokenComplete?'token':'checkpoint');
      ui.root.dataset.progress=ui.progress;ui.bar.style.width=100*ui.progress+'%';state(ui,'running');
      const animate=!motion.matches&&!ui.fast;
      const delay=animate?(item.delay===undefined?12000*Math.max(0,ui.progress-previous):item.delay):0;
      ui.nextAt=now+delay;
      ui.animation=animate&&item.animation?{kind:item.animation,start:now,duration:delay}:null;
      if(ui.key==='gen')ui.plot.growth=ui.animation&&item.animation==='grow'?0:1;
      ui.plots.forEach(p=>{p.dirty=true;});ui.dirty=true;ui.paintPending=true;
      if(ui.forceStep&&(ui.key!=='gen'||item.tokenComplete)){
        ui.forceStep=false;ui.running=false;ui.animation=null;if(ui.key==='gen')ui.plot.growth=1;
        state(ui,'paused');
      }
    }
    // Called only by the shared queue. Yield to painting at every published checkpoint,
    // including reduced motion / skip, so a fresh curve never waits for the final round.
    function computeStep(ui,budget) {
      if(!ui.visible||document.hidden||(!ui.running&&!ui.forceStep)||ui.calculated){ui.queued=false;return true;}
      if(ui.startedAt===null)ui.startedAt=performance.now();
      ui.started=true;state(ui,'running');const end=performance.now()+budget;
      try {
        do {
          const next=ui.iterator.next();
          if(next.done){ui.calculated=true;ui.running=false;ui.queued=false;ui.animation=null;
            ui.paintPending=true;ui.dirty=true;ui.plots.forEach(p=>{p.dirty=true;});schedule();return true;}
          if(next.value&&Number.isFinite(next.value.progress)){
            checkpoint(ui,next.value);ui.queued=false;schedule();return true;
          }
        }while(performance.now()<end);
      }catch(error){ui.running=false;ui.queued=false;ui.done=true;ui.root.dataset.state='error';
        ui.read.textContent='计算失败：'+error.message+'。可重置重试。';console.error(error);return true;}
      schedule();return false;
    }
    function requestWork(ui,now) {
      if(ui.queued||ui.done||ui.calculated||ui.paintPending||document.hidden||!ui.visible)return;
      if((ui.running||ui.forceStep)&&now>=ui.nextAt){ui.queued=true;window.__labQueue.request(ui.id,budget=>computeStep(ui,budget));}
    }
    function tick(now) {
      scheduled=false;const deadline=performance.now()+6;
      for(const ui of controllers){
        if(!ui.visible||document.hidden)continue;
        if(ui.animation){
          const f=Math.min(1,(now-ui.animation.start)/ui.animation.duration);
          if(ui.animation.kind==='grow')ui.plot.growth=1-(1-f)**3;
          if(ui.animation.kind==='flash')ui.plot.flashTime=now-ui.animation.start;
          ui.plot.dirty=true;ui.dirty=true;
          if(f===1)ui.animation=null;
        }
        if(ui.dirty){
          const plot=ui.plots.find(p=>p.dirty);if(plot)plot.draw();
          if(!ui.plots.some(p=>p.dirty)){
            if(ui.flowCanvas)drawFlow(ui);ui.dirty=false;ui.paintPending=false;
            if(ui.calculated&&!ui.done){ui.done=true;ui.round=ui.total;state(ui,'done');ui.bar.style.width='100%';
              ui.root.dataset.elapsedMs=String(performance.now()-ui.startedAt);
              ui.play.textContent=ui.key==='gen'?'再生成一次':ui.key==='flow-rlhf'?'播放':'重新训练';}
          }
        }
        requestWork(ui,now);
        if(performance.now()>=deadline)break;
      }
      if(!document.hidden&&controllers.some(ui=>ui.visible&&(ui.running&&!ui.done||ui.forceStep||ui.dirty||ui.animation)))schedule();
    }
    function boot() {
      const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{
        const ui=controllers.find(x=>x.root===entry.target);if(!ui)return;ui.visible=entry.isIntersecting;
        if(ui.visible&&!ui.started&&!ui.done)ui.running=true;
        if(ui.visible){ui.dirty=true;ui.plots.forEach(p=>{p.dirty=true;});}
        else {window.__labQueue.cancel(ui.id);ui.queued=false;}
      });schedule();},{rootMargin:'200px'});
      const pendingKeys=Object.keys(titles).filter(key=>document.getElementById('lab-'+key));(function mountNext(){if(!pendingKeys.length)return;const dist = id => { const r = document.getElementById(id).getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - innerHeight / 2); };pendingKeys.sort((a,b)=>dist('lab-'+a)-dist('lab-'+b));const key=pendingKeys.shift(),root=document.getElementById('lab-'+key);try{const ui=createUI(key,root);observer.observe(root);ui.plots.forEach(p=>p.draw());}catch(e){console.error(e);}(window.requestIdleCallback || (f => setTimeout(f, 30)))(mountNext,{timeout:300});})();
      enhanceFigure();
      const redraw=()=>{controllers.forEach(ui=>{ui.dirty=true;ui.plots.forEach(p=>{p.dirty=true;});});schedule();};
      new MutationObserver(redraw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redraw);
      motion.addEventListener('change',redraw);
      document.addEventListener('click',schedule);document.addEventListener('change',schedule);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)controllers.forEach(ui=>{window.__labQueue.cancel(ui.id);ui.queued=false;});
        else schedule();});
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  }
  if (typeof module !== 'undefined') module.exports = Core;
})();
