// Pure geometry for the course figures: no DOM, so the browser renderer and the Node linter share it.
// Flow figures place nodes on a loose grid (`at: [col, row]`, fractions allowed) and route every edge as a
// quadratic curve clipped to the node borders. Sequence figures put actors on lifelines and messages on rows.
export const CELL_W = 176, ROW_H = 92, NODE_W = 140, NODE_H = 54, PAD = 24;
export const ACTOR_GAP = 196, MSG_H = 52, ACTOR_H = 44;

// Width of a string in px: CJK characters are one em wide, Latin and digits roughly .58 em.
export const textWidth = (s, px) => [...String(s ?? '')].reduce((n, c) => n + (c.codePointAt(0) > 0x2e80 ? 1 : .58), 0) * px;

const clipToRect = (n, tx, ty, gap) => {
  const dx = tx - n.cx, dy = ty - n.cy, len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dx ? n.w / 2 / Math.abs(dx) : Infinity, dy ? n.h / 2 / Math.abs(dy) : Infinity);
  return [n.cx + dx * t + dx / len * gap, n.cy + dy * t + dy / len * gap];
};
const at = (p0, c, p1, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
const round = n => Math.round(n * 10) / 10;

/** Route an edge between two node boxes. bend > 0 bulges to the right of the direction of travel. */
export function route(a, b, bend = 0) {
  const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
  const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
  const c = [mx - dy / len * bend * 2, my + dx / len * bend * 2];
  const p0 = clipToRect(a, c[0], c[1], 3), p1 = clipToRect(b, c[0], c[1], 3);
  const angle = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
  const mid = at(p0, c, p1, .5);
  const points = Array.from({length: 25}, (_, i) => at(p0, c, p1, i / 24));
  return {d: `M${round(p0[0])} ${round(p0[1])} Q${round(c[0])} ${round(c[1])} ${round(p1[0])} ${round(p1[1])}`,
    end: p1, angle, mid, points, c};
}

export function layoutFlow(spec) {
  const nodes = {};
  for (const [id, n] of Object.entries(spec.nodes)) {
    const text = n.text ?? id, sub = n.sub ?? '', pad = n.icon ? 62 : 32;
    const w = n.w ?? Math.max(NODE_W, Math.ceil(textWidth(text, 16.5) + pad), Math.ceil(textWidth(sub, 12.5) + pad));
    const h = n.h ?? (sub ? NODE_H : 46);
    const cx = PAD + NODE_W / 2 + n.at[0] * CELL_W, cy = PAD + NODE_H / 2 + n.at[1] * ROW_H;
    nodes[id] = {id, cx, cy, w, h, x: cx - w / 2, y: cy - h / 2, text, sub, icon: n.icon, tip: n.tip, tone: n.tone};
  }
  const edges = (spec.edges || []).map(([from, to, label, opt = {}]) => {
    const r = route(nodes[from], nodes[to], opt.bend || 0);
    return {key: `${from}>${to}`, from, to, label: label || '', dashed: !!opt.dashed, ...r};
  });
  const xs = [], ys = [];
  for (const n of Object.values(nodes)) { xs.push(n.x, n.x + n.w); ys.push(n.y, n.y + n.h); }
  for (const e of edges) for (const [x, y] of e.points) { xs.push(x); ys.push(y); }
  const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
  return {kind: 'flow', nodes, edges, viewBox: [round(minX), round(minY), round(Math.max(...xs) + PAD - minX), round(Math.max(...ys) + PAD - minY)]};
}

export function layoutSequence(spec) {
  const actors = spec.actors.map((a, i) => {
    const [name, sub] = Array.isArray(a) ? a : [a, ''];
    const w = Math.max(112, Math.ceil(textWidth(name, 16) + 28));
    return {name, sub, i, w, cx: PAD + ACTOR_GAP / 2 + i * ACTOR_GAP, y: PAD, h: ACTOR_H};
  });
  const byName = Object.fromEntries(actors.map(a => [a.name, a]));
  const top = PAD + ACTOR_H + 26;
  const msgs = spec.msgs.map(([from, to, label, opt = {}], i) => {
    const a = byName[from], b = byName[to], y = top + i * MSG_H;
    const self = from === to;
    const x1 = a.cx + (self ? 0 : Math.sign(b.cx - a.cx) * 4), x2 = self ? a.cx : b.cx - Math.sign(b.cx - a.cx) * 4;
    const d = self ? `M${x1} ${y - 8} h34 v22 h-30` : `M${x1} ${y} L${x2} ${y}`;
    const end = self ? [a.cx + 4, y + 14] : [x2, y];
    const angle = self ? Math.PI : Math.atan2(0, x2 - x1);
    return {key: String(i), i, from, to, label, note: opt.note || '', dashed: !!opt.dashed, bad: !!opt.bad, self, d, end, angle,
      lx: self ? a.cx + 44 : (x1 + x2) / 2, ly: self ? y + 2 : y - 8, x1, x2, y, span: self ? 0 : Math.abs(b.cx - a.cx)};
  });
  const height = top + spec.msgs.length * MSG_H + PAD - 10;
  return {kind: 'sequence', actors, msgs, top, viewBox: [0, 0, PAD * 2 + actors.length * ACTOR_GAP, height]};
}

// Problems an author would want to hear about before publishing a figure. Geometry only; text checks are cheap guesses.
export function lint(spec) {
  const errs = [];
  if (spec.kind === 'flow') {
    const g = layoutFlow(spec), ids = Object.keys(g.nodes);
    for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) {
      const p = g.nodes[a], q = g.nodes[b];
      if (p.x < q.x + q.w + 10 && q.x < p.x + p.w + 10 && p.y < q.y + q.h + 8 && q.y < p.y + p.h + 8) errs.push(`节点 ${a} 与 ${b} 重叠或过近`);
    }
    for (const e of g.edges) {
      for (const [id, n] of Object.entries(g.nodes)) {
        if (id === e.from || id === e.to) continue;
        if (e.points.some(([x, y]) => x > n.x - 3 && x < n.x + n.w + 3 && y > n.y - 3 && y < n.y + n.h + 3)) errs.push(`连线 ${e.key} 穿过节点 ${id}`);
      }
      if (e.label) {
        const w = textWidth(e.label, 13) + 14, [mx, my] = e.mid;
        for (const [id, n] of Object.entries(g.nodes)) {
          if (mx + w / 2 > n.x && mx - w / 2 < n.x + n.w && my + 10 > n.y && my - 10 < n.y + n.h) errs.push(`连线 ${e.key} 的标签压住节点 ${id}`);
        }
        const chord = Math.hypot(e.end[0] - e.points[0][0], e.end[1] - e.points[0][1]);
        if (chord < w + 6) errs.push(`连线 ${e.key} 太短，放不下标签“${e.label}”`);
      }
    }
    const labels = g.edges.filter(e => e.label);
    for (const [i, a] of labels.entries()) for (const b of labels.slice(i + 1)) {
      if (Math.abs(a.mid[0] - b.mid[0]) < (textWidth(a.label, 13) + textWidth(b.label, 13)) / 2 + 20 && Math.abs(a.mid[1] - b.mid[1]) < 20) errs.push(`标签“${a.label}”与“${b.label}”重叠`);
    }
    if (g.viewBox[2] > 1000) errs.push(`图太宽（${Math.round(g.viewBox[2])}px），缩小后字会太小；控制在 5 列内`);
  }
  if (spec.kind === 'sequence') {
    const g = layoutSequence(spec);
    for (const m of g.msgs) if (!m.self && textWidth(m.label, 14) > m.span - 14) errs.push(`消息“${m.label}”比它的跨度还宽`);
    if (g.actors.length > 5) errs.push('参与者超过 5 个');
    if (g.msgs.length > 9) errs.push('消息超过 9 条，拆成两张图');
  }
  return errs;
}
