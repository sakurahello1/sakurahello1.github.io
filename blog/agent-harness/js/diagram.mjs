// Renders the course figures. A figure is a JSON spec in the lesson Markdown; this module turns it into an
// SVG (flow, sequence) or HTML (stack, bars, compare) stage and a small stepper that lights it up step by step.
// The same FlowGraph draws the agent theater, so every lit arrow in the course looks the same.
import {layoutFlow, layoutSequence, textWidth} from './diagram-layout.mjs';

const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HEAD = 'M0 0 L-12 -6.5 L-8.5 0 L-12 6.5 Z';
export const ICONS = {
  doc: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7',
  chip: 'M8 8h8v8H8z M10 2v3 M14 2v3 M10 19v3 M14 19v3 M2 10h3 M2 14h3 M19 10h3 M19 14h3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  terminal: 'M3 5h18v14H3z M7 10l3 2-3 2 M12 15h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  check: 'M4 12l5 5L20 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.5-6 8-6s8 2 8 6',
  db: 'M4 6c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3z M4 6v6c0 2 3.6 3 8 3s8-1 8-3V6 M4 12v6c0 2 3.6 3 8 3s8-1 8-3v-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l5 5',
  chat: 'M4 5h16v11H10l-4 4v-4H4z',
  warn: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  branch: 'M6 3v12 M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M18 9c0 6-12 3-12 6',
  loop: 'M4 12a8 8 0 0 1 14-5.3 M20 4v4h-4 M20 12a8 8 0 0 1-14 5.3 M4 20v-4h4',
  key: 'M7 15a4 4 0 1 0 0-.1z M11 12h10 M18 12v3',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.5 2.7-5 6-5s6 1.5 6 5 M17 11a3 3 0 1 0 0-6 M17 15c2.5.3 4 1.7 4 5',
  cut: 'M6 3l12 18 M18 3L6 21',
  scale: 'M12 3v18 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5'
};

const svg = (tag, attrs = {}, parent) => {
  const x = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v);
  parent?.append(x);
  return x;
};
const h = (tag, cls, text, parent) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  parent?.append(x);
  return x;
};
// Captions may use **bold** and `code`; everything else is plain text.
function rich(parent, text) {
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!part) continue;
    if (part.startsWith('**')) h('b', '', part.slice(2, -2), parent);
    else if (part.startsWith('`')) h('code', '', part.slice(1, -1), parent);
    else parent.append(part);
  }
}
const STATES = ['lit', 'done', 'ok', 'bad'];
const setState = (g, states) => { for (const s of STATES) g.classList.toggle(s, states.includes(s)); };

function edgeGroup(parent, e, label) {
  const g = svg('g', {class: 'fg-edge' + (e.dashed ? ' dashed' : '') + (e.bad ? ' badline' : ''), 'data-key': e.key}, parent);
  svg('path', {class: 'fg-line', d: e.d}, g);
  svg('path', {class: 'fg-flow', d: e.d, pathLength: 1}, g);
  svg('path', {class: 'fg-shine', d: e.d, pathLength: 1}, g);
  svg('path', {class: 'fg-head', d: HEAD, transform: `translate(${e.end[0]} ${e.end[1]}) rotate(${e.angle * 180 / Math.PI})`}, g);
  if (label) {
    const [x, y] = label;
    const w = textWidth(e.label, 13) + 14;
    const box = svg('g', {class: 'fg-label'}, g);
    svg('rect', {x: x - w / 2, y: y - 10, width: w, height: 20, rx: 10}, box);
    svg('text', {x, y: y + 4, 'text-anchor': 'middle'}, box).textContent = e.label;
  }
  return g;
}

// A graph of nodes and arrows. `node()` and `edge()` set states; `sweep()` lights an arrow with a travelling fill.
export class FlowGraph {
  constructor(host, spec, label = '示意图') {
    this.spec = spec;
    this.layout = layoutFlow(spec);
    const {viewBox, nodes, edges} = this.layout;
    this.svg = svg('svg', {viewBox: viewBox.join(' '), class: 'fg-svg', role: 'img', 'aria-label': label}, host);
    this.svg.style.setProperty('--aspect', `${viewBox[2]} / ${viewBox[3]}`);
    this.svg.style.maxWidth = `${Math.round(viewBox[2] * 1.15)}px`;
    this.svg.style.setProperty('--minw', `${Math.min(viewBox[2], 720)}px`);
    this.edges = {}; this.nodes = {};
    const eg = svg('g', {}, this.svg), ng = svg('g', {}, this.svg);
    for (const e of edges) this.edges[e.key] = edgeGroup(eg, e, e.label ? e.mid : null);
    for (const n of Object.values(nodes)) {
      const g = svg('g', {class: `fg-node${n.tone ? ' tone-' + n.tone : ''}${n.tip ? ' has-tip' : ''}`, transform: `translate(${n.x} ${n.y})`, 'data-id': n.id}, ng);
      svg('rect', {class: 'fg-halo', width: n.w, height: n.h, rx: 14}, g);
      svg('rect', {class: 'fg-card', width: n.w, height: n.h, rx: 14}, g);
      if (n.icon) {
        const ic = svg('g', {class: 'fg-icon', transform: `translate(15 ${n.h / 2 - 11}) scale(.92)`}, g);
        svg('path', {d: ICONS[n.icon] || ICONS.doc}, ic);
      }
      const x = n.icon ? 46 : n.w / 2, anchor = n.icon ? 'start' : 'middle';
      svg('text', {class: 't', x, y: n.sub ? n.h / 2 - 3 : n.h / 2 + 5.5, 'text-anchor': anchor}, g).textContent = n.text;
      const sub = svg('text', {class: 's', x, y: n.h / 2 + 15, 'text-anchor': anchor}, g);
      sub.textContent = n.sub;
      this.nodes[n.id] = {g, sub, base: n.sub};
      if (n.tip) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', `${n.text}：${n.tip}`); }
    }
  }

  clear() {
    for (const n of Object.values(this.nodes)) { setState(n.g, []); n.sub.textContent = n.base; }
    for (const g of Object.values(this.edges)) { g.style.setProperty('--ms', '0s'); setState(g, []); }
  }

  node(id, states = [], note) {
    const n = this.nodes[id];
    if (!n) return;
    setState(n.g, [].concat(states));
    if (note != null) n.sub.textContent = note;
  }

  dim(ids, on) { for (const id of ids) this.nodes[id]?.g.classList.toggle('quiet', on); }

  edge(key, state = '', ms = 0) {
    const g = this.edges[key];
    if (!g) return;
    g.style.setProperty('--ms', `${reduced ? 0 : ms}ms`);
    if (state === 'lit') { setState(g, []); g.getBoundingClientRect(); }
    setState(g, state ? [state] : []);
  }

  async sweep(key, ms = 620) {
    const g = this.edges[key];
    if (!g) return;
    this.edge(key, 'lit', ms);
    if (!reduced) await new Promise(r => setTimeout(r, ms + 60));
  }
}

const hasTip = (spec, id) => spec.nodes?.[id]?.tip;

/* ---------- figure kinds: build(host, spec) -> {count, apply(i, animate), tipTarget} ---------- */
const KINDS = {
  flow(host, spec, say) {
    const g = new FlowGraph(host, spec, spec.title);
    const steps = spec.steps || [];
    for (const [id, n] of Object.entries(g.nodes)) if (hasTip(spec, id)) {
      const show = () => say(`${spec.nodes[id].text}：${spec.nodes[id].tip}`, true);
      n.g.addEventListener('click', show);
      n.g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    }
    return {
      count: steps.length,
      async apply(i, animate) {
        g.clear();
        const done = new Set(), ok = new Set(), bad = new Set(), lit = new Set(), sweeps = [];
        for (let j = 0; j <= i; j++) {
          const st = steps[j], now = j === i;
          for (const id of st.on || []) (now ? lit : done).add(id);
          for (const id of st.ok || []) ok.add(id);
          for (const id of st.bad || []) bad.add(id);
          for (const key of st.edges || []) {
            if (now) sweeps.push(key); else g.edge(key, 'done');
          }
        }
        for (const id of Object.keys(g.nodes)) {
          const s = [];
          if (lit.has(id)) s.push('lit'); else if (done.has(id) || ok.has(id) || bad.has(id)) s.push('done');
          if (ok.has(id)) s.push('ok');
          if (bad.has(id)) s.push('bad');
          g.node(id, s);
        }
        const ms = 620;
        await Promise.all(sweeps.map(k => animate ? g.sweep(k, ms) : g.edge(k, 'lit', 0)));
      }
    };
  },

  sequence(host, spec) {
    const L = layoutSequence(spec);
    const root = svg('svg', {viewBox: L.viewBox.join(' '), class: 'fg-svg', role: 'img', 'aria-label': spec.title}, host);
    root.style.maxWidth = `${Math.round(L.viewBox[2] * 1.15)}px`;
    root.style.setProperty('--minw', `${Math.min(L.viewBox[2], 720)}px`);
    const height = L.viewBox[3];
    const actors = L.actors.map(a => {
      svg('line', {class: 'fg-life', x1: a.cx, x2: a.cx, y1: a.y + a.h, y2: height - 12}, root);
      const g = svg('g', {class: 'fg-node fg-actor'}, root);
      svg('rect', {class: 'fg-halo', x: a.cx - a.w / 2, y: a.y, width: a.w, height: a.h, rx: 12}, g);
      svg('rect', {class: 'fg-card', x: a.cx - a.w / 2, y: a.y, width: a.w, height: a.h, rx: 12}, g);
      svg('text', {class: 't', x: a.cx, y: a.y + (a.sub ? 19 : 27), 'text-anchor': 'middle'}, g).textContent = a.name;
      if (a.sub) svg('text', {class: 's', x: a.cx, y: a.y + 34, 'text-anchor': 'middle'}, g).textContent = a.sub;
      return g;
    });
    const msgs = L.msgs.map(m => edgeGroup(root, m, null));
    const labels = L.msgs.map((m, i) => {
      const t = svg('text', {class: 'fg-msg', x: m.lx, y: m.ly, 'text-anchor': m.self ? 'start' : 'middle'}, msgs[i]);
      t.textContent = m.label;
      return t;
    });
    void labels;
    return {
      count: L.msgs.length,
      async apply(i, animate) {
        actors.forEach(a => setState(a, []));
        for (const [j, g] of msgs.entries()) {
          g.classList.toggle('ghost', j > i);
          g.style.setProperty('--ms', '0s');
          setState(g, j < i ? ['done'] : []);
          if (i < 0) g.classList.remove('ghost');
          if (j === i) { animate && !reduced ? (g.style.setProperty('--ms', '520ms'), g.getBoundingClientRect(), setState(g, ['lit'])) : setState(g, ['lit']); }
        }
        const m = L.msgs[i];
        if (!m) return;
        for (const name of [m.from, m.to]) setState(actors[L.actors.findIndex(a => a.name === name)], ['lit']);
        if (animate && !reduced) await new Promise(r => setTimeout(r, 560));
      }
    };
  },

  stack(host, spec) {
    const box = h('div', 'fg-stack', null, host);
    const rows = spec.layers.map((l, i) => {
      const [t, d] = Array.isArray(l) ? l : [l.t, l.d];
      if (i) h('div', 'fg-conn', '↓', box);
      const row = h('div', 'fg-layer', null, box);
      h('span', 'fg-layer-n', String(i + 1), row);
      const body = h('div', 'fg-layer-body', null, row);
      h('b', '', t, body);
      if (d) h('span', '', d, body);
      h('span', 'fg-layer-mark', '', row);
      return row;
    });
    const conns = [...box.querySelectorAll('.fg-conn')];
    const steps = spec.steps || [];
    return {
      count: steps.length,
      async apply(i) {
        const pass = new Set(), fail = new Set();
        for (let j = 0; j <= i; j++) { for (const k of steps[j].pass || []) pass.add(k); for (const k of steps[j].fail || []) fail.add(k); }
        const at = new Set(steps[i]?.at || []);
        rows.forEach((r, k) => {
          r.classList.toggle('ok', pass.has(k)); r.classList.toggle('bad', fail.has(k)); r.classList.toggle('lit', at.has(k));
          r.querySelector('.fg-layer-mark').textContent = pass.has(k) ? '✓' : fail.has(k) ? '✗' : '';
        });
        conns.forEach((c, k) => c.classList.toggle('lit', pass.has(k)));
      }
    };
  },

  bars(host, spec) {
    const box = h('div', 'fg-bars', null, host);
    const max = spec.max ?? Math.max(...spec.rows.map(r => r.segs.reduce((n, s) => n + s.v, 0)));
    const rows = spec.rows.map(r => {
      const row = h('div', 'fg-bar-row', null, box);
      h('span', 'fg-bar-label', r.label, row);
      const track = h('div', 'fg-bar-track', null, row);
      const segs = r.segs.map(s => {
        const seg = h('span', `fg-seg tone-${s.tone || 'a'}`, s.t, track);
        seg.style.flexBasis = `${s.v / max * 100}%`;
        seg.title = `${s.t}：${s.v}${spec.unit || ''}`;
        return seg;
      });
      h('span', 'fg-bar-total', `${r.segs.reduce((n, s) => n + s.v, 0)}${spec.unit || ''}`, row);
      return {row, segs};
    });
    const steps = spec.steps || [];
    return {
      count: steps.length,
      async apply(i) {
        const shown = new Set(), hl = new Set((steps[i]?.hl || []).map(x => x.join(':')));
        for (let j = 0; j <= i; j++) for (const r of steps[j].rows ?? [j]) shown.add(r);
        rows.forEach(({row, segs}, k) => {
          row.classList.toggle('hidden', i >= 0 && !shown.has(k));
          row.classList.toggle('lit', (steps[i]?.rows ?? [i]).includes(k));
          segs.forEach((s, m) => s.classList.toggle('hl', hl.has(`${k}:${m}`)));
        });
      }
    };
  },

  compare(host, spec) {
    const box = h('div', 'fg-compare', null, host);
    box.style.setProperty('--cols', String(spec.cols.length));
    const items = spec.cols.map((c, ci) => {
      const col = h('div', `fg-col tone-${c.tone || ''}`, null, box);
      h('b', 'fg-col-title', c.title, col);
      return c.items.map(t => h('p', 'fg-item', t, col));
    });
    const steps = spec.steps || [];
    return {
      count: steps.length,
      async apply(i) {
        const done = new Set(), lit = new Set(), later = new Set();
        steps.forEach((st, j) => { for (const [c, k] of st.hl || []) if (j > i) later.add(`${c}:${k}`); });
        for (let j = 0; j <= i; j++) for (const [c, k] of steps[j].hl || []) (j === i ? lit : done).add(`${c}:${k}`);
        items.forEach((col, c) => col.forEach((p, k) => {
          const key = `${c}:${k}`;
          p.classList.toggle('lit', lit.has(key));
          p.classList.toggle('done', done.has(key));
          p.classList.toggle('pending', i >= 0 && later.has(key) && !lit.has(key) && !done.has(key));
        }));
      }
    };
  }
};

/* ---------- the stepper ---------- */
const dwell = text => Math.min(6500, Math.max(2200, text.length * 95));

export function mountFigure(fig) {
  const spec = JSON.parse(fig.dataset.spec);
  fig.classList.add('live');
  fig.querySelector('.fig-alt')?.remove();
  const stage = h('div', 'fg-stage', null, fig);
  const bar = h('div', 'fg-bar', null, fig);
  const prev = h('button', 'fg-nav', '‹', bar), dots = h('ol', 'fg-dots', null, bar), next = h('button', 'fg-nav', '›', bar);
  const play = h('button', 'fg-play', '▶ 演示', bar);
  for (const b of [prev, next, play]) b.type = 'button';
  prev.setAttribute('aria-label', '上一步'); next.setAttribute('aria-label', '下一步');
  const caption = h('p', 'fg-say', null, fig);
  caption.setAttribute('aria-live', 'polite');
  let index = -1, timer = 0, playing = false, token = 0;
  const io = new IntersectionObserver(es => {
    if (es[0].isIntersecting) { io.disconnect(); if (!reduced) run(); else go(0, false); }
  }, {threshold: .7});
  const say = (text, tip) => {
    caption.replaceChildren();
    if (tip) h('span', 'fg-tag', '说明', caption); else if (index >= 0) h('span', 'fg-tag', `${index + 1}/${impl.count}`, caption);
    rich(caption, text);
    caption.classList.remove('swap'); void caption.offsetWidth; caption.classList.add('swap');
  };
  const impl = KINDS[spec.kind](stage, spec, say);
  const chips = Array.from({length: impl.count}, (_, i) => {
    const li = h('li', null, null, dots), b = h('button', '', String(i + 1), li);
    b.type = 'button'; b.setAttribute('aria-label', `第 ${i + 1} 步`);
    b.addEventListener('click', () => { touch(); go(i, true); });
    return b;
  });
  // On narrow screens a wide figure scrolls sideways: keep whatever is lit in view.
  function follow() {
    if (stage.scrollWidth <= stage.clientWidth + 2) return;
    requestAnimationFrame(() => {
      const lit = [...stage.querySelectorAll('.fg-node.lit, .fg-edge.lit, .fg-layer.lit')].map(e => e.getBoundingClientRect());
      if (!lit.length) return;
      const s = stage.getBoundingClientRect();
      const mid = (Math.min(...lit.map(r => r.left)) + Math.max(...lit.map(r => r.right))) / 2;
      stage.scrollTo({left: stage.scrollLeft + mid - (s.left + s.width / 2), behavior: reduced ? 'auto' : 'smooth'});
    });
  }
  async function go(i, animate) {
    index = Math.max(0, Math.min(impl.count - 1, i));
    chips.forEach((c, k) => { c.classList.toggle('on', k === index); c.classList.toggle('past', k < index); });
    prev.disabled = index === 0; next.disabled = index === impl.count - 1;
    say(spec.steps[index].say || '');
    const applied = impl.apply(index, animate);
    follow();
    await applied;
  }
  // Any manual interaction cancels the pending autoplay as well as a running one.
  const touch = () => { io.disconnect(); stop(); };
  function stop() { playing = false; token++; clearTimeout(timer); play.textContent = '▶ 演示'; }
  async function run() {
    stop();
    playing = true; const mine = ++token;
    play.textContent = '⏸ 暂停';
    for (let i = index >= impl.count - 1 ? 0 : Math.max(index, 0); i < impl.count; i++) {
      if (mine !== token) return;
      await go(i, true);
      await new Promise(r => { timer = setTimeout(r, reduced ? 800 : dwell(spec.steps[i].say || '')); });
    }
    if (mine === token) stop();
  }
  prev.addEventListener('click', () => { touch(); go(index - 1, true); });
  next.addEventListener('click', () => { touch(); go(index + 1, true); });
  play.addEventListener('click', () => { io.disconnect(); playing ? stop() : run(); });
  if (!impl.count) { bar.remove(); caption.remove(); impl.apply(-1, false); return; }
  caption.textContent = spec.dek || '点 ▶ 演示，或者直接点数字，一步一步看。';
  impl.apply(-1, false);
  io.observe(fig);
}

export function mountFigures(root) {
  for (const fig of root.querySelectorAll('figure.fig[data-spec]')) mountFigure(fig);
}
