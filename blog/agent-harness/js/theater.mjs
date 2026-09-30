// The agent theater: a loop diagram with a packet travelling along it, the live transcript beside it,
// and meters underneath. It draws events from agent.mjs, either a recorded real run (traces.json) or a
// run against the reader's own model.
import {run, VARIANTS, SELECTIONS, LIMITS} from './agent.mjs';

const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOOP = {
  nodes: {goal: [60, 200, 80, '目标'], ctx: [185, 200, 112, '上下文'], model: [330, 78, 124, '模型'],
    check: [480, 200, 112, '调用校验'], tool: [330, 322, 124, '工具执行'], verify: [330, 200, 112, '验收器']},
  edges: [['goal', 'ctx'], ['ctx', 'model', 200, 88], ['model', 'check', 462, 88], ['check', 'tool', 462, 312],
    ['tool', 'ctx', 200, 312, '观察'], ['check', 'ctx', 330, 262, '拒绝', true], ['model', 'verify', null, null, '最终回答'],
    ['verify', 'ctx', 250, 150, '证据反馈', true]]
};
const TEAM = {
  nodes: {goal: [60, 200, 80, '目标'], orch: [185, 200, 112, '调度者'], w1: [330, 92, 128, '价格工作者'],
    w2: [330, 308, 128, '交期工作者'], merge: [470, 200, 112, '汇合作答'], verify: [470, 322, 112, '验收器']},
  edges: [['goal', 'orch'], ['orch', 'w1', 200, 96], ['orch', 'w2', 200, 304], ['w1', 'merge', 460, 96, '报告'],
    ['w2', 'merge', 400, 250, '报告'], ['merge', 'verify']]
};
const CHECKS = {parse: 'JSON 可解析', vendor: '供应商是 clay', price: '含税 7480 元', evidence: '证据 quote-clay-v2', deadline: '交期 10-03'};
let traces = null;
const loadTraces = () => traces ||= fetch(new URL('traces.json', import.meta.url)).then(r => r.json());

const h = (tag, cls, text, parent) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  parent?.append(x);
  return x;
};
const s = (tag, attrs, parent) => {
  const x = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v);
  parent?.append(x);
  return x;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function jsonHtml(value, parent) {
  const box = h('div', 'th-json', null, parent);
  const text = JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');
  for (const part of text.split(/("(?:[^"\\]|\\.)*"(?=:))/)) {
    if (!part) continue;
    h('span', /^".*"$/.test(part) ? 'k' : '', part, box);
  }
  return box;
}

export class Theater {
  constructor(root, {variant = 'react', host, hero = false}) {
    this.variant = variant; this.host = host; this.hero = hero;
    this.layout = variant === 'workers' ? TEAM : LOOP;
    this.queue = []; this.busy = false; this.runId = 0; this.paused = false; this.speed = 1; this.mode = null;
    this.build(root);
    if (hero && !reduced) {
      const io = new IntersectionObserver(es => {
        if (es[0].isIntersecting) { io.disconnect(); this.replay(); }
      }, {threshold: 0.35});
      io.observe(this.el);
    }
  }

  build(root) {
    const v = VARIANTS[this.variant];
    const el = this.el = h('div', 'th', null, root);
    const top = h('div', 'th-top', null, el);
    const title = h('span', 'th-title', 'AGENT THEATER', top);
    h('b', '', v.title, title);
    this.chip = h('span', 'th-chip', '待机', top);
    if (this.variant === 'selection') {
      this.select = h('select', 'th-select', null, top);
      this.select.setAttribute('aria-label', '上下文策略');
      for (const [value, label] of SELECTIONS) { const o = h('option', '', label, this.select); o.value = value; }
      this.select.addEventListener('change', () => this.reset());
    }
    this.playBtn = h('button', 'th-btn', '▶ 播放录像', top);
    this.liveBtn = h('button', 'th-btn primary', '⚡ 用我的模型运行', top);
    this.pauseBtn = h('button', 'th-btn', '⏸ 暂停', top);
    this.resetBtn = h('button', 'th-btn', '↺', top);
    this.resetBtn.setAttribute('aria-label', '重置');
    this.speedSel = h('select', 'th-select', null, top);
    this.speedSel.setAttribute('aria-label', '回放速度');
    for (const x of ['1', '2', '4']) { const o = h('option', '', `${x}×`, this.speedSel); o.value = x; }
    for (const b of [this.playBtn, this.liveBtn, this.pauseBtn, this.resetBtn]) b.type = 'button';
    this.pauseBtn.disabled = true;
    this.playBtn.addEventListener('click', () => this.replay());
    this.liveBtn.addEventListener('click', () => this.live());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.resetBtn.addEventListener('click', () => this.reset());
    this.speedSel.addEventListener('change', () => { this.speed = Number(this.speedSel.value); });

    this.goal = h('div', 'th-goal', v.dek, el);
    const stage = h('div', 'th-stage', null, el);
    const graph = h('div', 'th-graph', null, stage);
    this.svg = s('svg', {viewBox: '0 0 560 400', role: 'img', 'aria-label': 'agent 闭环示意图'}, graph);
    this.drawGraph();
    this.log = h('div', 'th-log', null, stage);
    this.empty();
    const meters = h('div', 'th-meters', null, el);
    this.m = {};
    for (const [k, label] of [['calls', '模型调用'], ['tools', '工具调用'], ['prompt', '输入 TOKEN'], ['completion', '输出 TOKEN'], ['ctx', '当前上下文']]) {
      const box = h('div', 'th-meter', null, meters);
      h('span', '', label, box);
      this.m[k] = h('b', '', '—', box);
      if (k === 'ctx') this.ctxBar = h('i', '', null, h('div', 'th-ctx', null, box));
    }
    this.foot = h('div', 'th-foot', '“播放录像”重放一次真实运行；“用我的模型运行”会用你在右上角连接的模型现场跑一遍。', el);
  }

  drawGraph() {
    const {nodes, edges} = this.layout;
    this.edges = {}; this.nodes = {}; this.edgeLabels = [];
    const g = s('g', {}, this.svg), labels = s('g', {}, this.svg), ng = s('g', {}, this.svg);
    for (const [from, to, cx, cy, label, dash] of edges) {
      const [x1, y1] = nodes[from], [x2, y2] = nodes[to];
      const d = cx == null ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
      const path = s('path', {d, class: 'th-edge' + (dash ? ' dash' : '')}, g);
      this.edges[`${from}>${to}`] = path;
      if (label) {
        const t = s('text', {class: 'th-edge-label', 'text-anchor': 'middle'}, labels);
        t.textContent = label;
        this.edgeLabels.push([path, t]);
      }
    }
    for (const [id, [x, y, w, label]] of Object.entries(nodes)) {
      const node = s('g', {class: 'th-node', transform: `translate(${x} ${y})`}, ng);
      s('rect', {x: -w / 2 - 6, y: -30, width: w + 12, height: 60, rx: 15}, node);
      const t = s('text', {'text-anchor': 'middle', y: -4}, node); t.textContent = label;
      const sub = s('text', {'text-anchor': 'middle', y: 18, class: 'sub'}, node); sub.textContent = '';
      this.nodes[id] = {g: node, sub};
    }
    // Experiments without tools never visit the check and tool nodes; keep them visible but quiet.
    if (this.variant === 'selection' || this.variant === 'repair') {
      for (const id of ['check', 'tool']) this.nodes[id].g.style.opacity = '.28';
      for (const [key, path] of Object.entries(this.edges)) if (/check|tool/.test(key)) path.style.opacity = '.28';
      for (const [path, t] of this.edgeLabels) if (path.style.opacity) t.style.opacity = '.28';
    }
    this.packet = s('circle', {r: 6, class: 'th-packet', opacity: 0}, this.svg);
    requestAnimationFrame(() => {
      for (const [path, t] of this.edgeLabels) {
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        t.setAttribute('x', p.x); t.setAttribute('y', p.y - 7);
      }
    });
  }

  empty() {
    this.log.replaceChildren();
    h('p', 'th-empty', '点“播放录像”看一次真实运行，\n或者用你自己的模型现场跑。', this.log);
  }

  setChip(text, live) { this.chip.textContent = text; this.chip.classList.toggle('live', !!live); }

  reset() {
    this.runId++;
    this.controller?.abort();
    this.queue.length = 0;
    this.paused = false; this.pauseBtn.textContent = '⏸ 暂停';
    this.pauseBtn.disabled = true; this.playBtn.disabled = false; this.liveBtn.disabled = false;
    for (const n of Object.values(this.nodes)) { n.g.classList.remove('on', 'ok', 'bad'); n.sub.textContent = ''; }
    for (const e of Object.values(this.edges)) e.classList.remove('hot');
    this.packet.setAttribute('opacity', 0);
    for (const b of Object.values(this.m)) b.textContent = '—';
    this.ctxBar.style.width = '0';
    this.msgs = {};
    this.empty();
    this.setChip('待机');
  }

  togglePause() {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶ 继续' : '⏸ 暂停';
  }

  push(ev, id = this.runId) {
    return new Promise(resolve => { this.queue.push([ev, id, resolve]); this.pump(); });
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const [ev, id, resolve] = this.queue.shift();
      while (this.paused && id === this.runId) await sleep(120);
      if (id === this.runId) await this.handle(ev, id);
      resolve();
    }
    this.busy = false;
  }

  begin(mode) {
    this.reset();
    this.mode = mode;
    this.playBtn.disabled = this.liveBtn.disabled = true;
    this.pauseBtn.disabled = false;
    this.log.replaceChildren();
    this.setChip(mode === 'live' ? '实时' : '录像', mode === 'live');
    return this.runId;
  }

  async replay() {
    const id = this.begin('replay');
    const all = await loadTraces();
    const name = this.variant === 'selection' ? `selection-${this.select.value}` : this.variant;
    const events = all[name];
    const meta = all.meta;
    this.foot.textContent = `录像：${meta.recorded} 在 ${meta.endpoint} 上用 ${meta.model} 的一次真实运行。模型每次的输出都可能不同，你可以用自己的模型再跑一次。`;
    let prev = 0;
    for (const ev of events) {
      if (id !== this.runId) return;
      const gap = Math.min(ev.t - prev, 900);
      prev = ev.t;
      if (gap > 0 && !reduced) await this.push({type: 'wait', ms: gap}, id);
      this.push(ev, id);
    }
    await this.push({type: 'idle'}, id);
  }

  async live() {
    const credentials = this.host.credentials();
    if (!credentials) { this.host.requestConnect(this); return; }
    const id = this.begin('live');
    const c = this.controller = new AbortController();
    this.foot.textContent = `实时：正在用 ${credentials.model}（${new URL(credentials.base).host}）运行。最多 ${LIMITS.calls} 次模型调用、${LIMITS.tools} 次工具调用，费用计入你的账户。`;
    try {
      this.host.claim(c);
      await run({variant: this.variant, selection: this.select?.value, credentials, signal: c.signal,
        emit: ev => this.push(ev, id)});
    } catch (e) {
      if (id === this.runId) {
        await this.push({type: 'error', message: e.name === 'AbortError' ? '已取消。这次调用的用量可能仍会计费。' : e.message}, id);
      }
    } finally {
      this.host.release(c);
      if (id === this.runId) await this.push({type: 'idle'}, id);
    }
  }

  async travel(from, to) {
    const path = this.edges[`${from}>${to}`];
    if (!path) return;
    path.classList.add('hot');
    if (!reduced) {
      const len = path.getTotalLength(), dur = (this.mode === 'live' ? 420 : 620) / this.speed;
      this.packet.setAttribute('opacity', 1);
      const t0 = performance.now();
      await new Promise(resolve => {
        const step = now => {
          const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          const p = path.getPointAtLength(len * e);
          this.packet.setAttribute('cx', p.x); this.packet.setAttribute('cy', p.y);
          k < 1 ? requestAnimationFrame(step) : resolve();
        };
        requestAnimationFrame(step);
      });
      this.packet.setAttribute('opacity', 0);
    }
    setTimeout(() => path.classList.remove('hot'), 500);
  }

  focus(id, note, state) {
    for (const [k, n] of Object.entries(this.nodes)) n.g.classList.toggle('on', k === id);
    const n = this.nodes[id];
    if (!n) return;
    if (note != null) n.sub.textContent = note;
    n.g.classList.remove('ok', 'bad');
    if (state) n.g.classList.add(state);
  }

  card(role, label) {
    const box = h('div', `th-msg ${role}`, null, this.log);
    const head = h('div', 'th-role', null, box);
    h('span', '', label || {user: '用户', assistant: '模型', tool: '工具', verify: '验收器', system: '系统'}[role], head);
    this.log.scrollTop = this.log.scrollHeight;
    return {box, head};
  }

  async handle(ev) {
    switch (ev.type) {
      case 'wait': await sleep(ev.ms / this.speed); break;
      case 'start': break;
      case 'meter': {
        this.m.calls.textContent = `${ev.calls} / ${LIMITS.calls}`;
        this.m.tools.textContent = `${ev.tools} / ${LIMITS.tools}`;
        this.m.prompt.textContent = ev.usageKnown ? ev.prompt.toLocaleString() : '未知';
        this.m.completion.textContent = ev.usageKnown ? ev.completion.toLocaleString() : '未知';
        this.m.ctx.textContent = ev.ctx ? `${ev.ctx.toLocaleString()} tok` : '—';
        this.ctxBar.style.width = `${Math.min(100, ev.ctx / 30)}%`;
        break;
      }
      case 'node': this.focus(ev.id, ev.note, ev.state); break;
      case 'edge': await this.travel(ev.from, ev.to); break;
      case 'msg': {
        const {box} = this.card(ev.role, ev.label);
        const text = h('div', 'th-text', ev.text, box);
        if (ev.role === 'assistant' && !ev.text) text.classList.add('caret');
        this.msgs[ev.id] = {box, text};
        break;
      }
      case 'delta': {
        const m = this.msgs[ev.id];
        if (m) { m.text.textContent += ev.text; this.log.scrollTop = this.log.scrollHeight; }
        break;
      }
      case 'done-msg': {
        const m = this.msgs[ev.id];
        if (m) { m.text.classList.remove('caret'); if (!m.text.textContent) m.text.remove(); }
        break;
      }
      case 'calls': {
        const m = this.msgs[ev.id];
        if (!m) break;
        const list = h('div', 'th-calls', null, m.box);
        for (const c of ev.calls) {
          const row = h('div', 'th-call', null, list);
          h('b', '', c.name, row);
          row.append(' ' + c.args);
        }
        this.log.scrollTop = this.log.scrollHeight;
        break;
      }
      case 'tool': {
        const {box, head} = this.card('tool', `工具 · ${ev.name}`);
        h('span', 'th-badge' + (ev.ok ? '' : ' bad'), ev.ok ? '契约通过' : '已拒绝', head);
        jsonHtml(ev.result, box);
        break;
      }
      case 'verify': {
        this.focus('verify', ev.pass ? '通过' : '未通过', ev.pass ? 'ok' : 'bad');
        const {box} = this.card('verify');
        const ul = h('ul', 'th-checks', null, box);
        for (const [k, label] of Object.entries(CHECKS)) {
          if (!(k in ev.checks) && k !== 'parse') continue;
          h('li', ev.checks[k] ? '' : 'no', label, ul);
        }
        h('div', `th-verdict ${ev.pass ? 'pass' : 'fail'}`, ev.pass ? 'PASS · 五项证据都对得上' :
          ev.checks.parse ? 'FAIL · 有字段和证据对不上' : 'FAIL · 回答不是可解析的 JSON', box);
        break;
      }
      case 'end': this.setChip(ev.status === 'completed' ? '完成' : '未通过', this.mode === 'live'); break;
      case 'error': {
        const {box} = this.card('system', '运行中止');
        h('div', 'th-text', ev.message, box);
        this.setChip('中止');
        break;
      }
      case 'idle':
        this.playBtn.disabled = this.liveBtn.disabled = false;
        this.pauseBtn.disabled = true;
        for (const n of Object.values(this.nodes)) n.g.classList.remove('on');
        break;
    }
  }
}
