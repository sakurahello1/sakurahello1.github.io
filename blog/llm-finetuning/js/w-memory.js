/* 显存粗算：单卡、无分片；公式和来源随图列出。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var root = $('w-memory');
  if (!root) return;
  var svg = $('mem-svg'), GB = Math.pow(10, 9);
  var BF = 16 / 8, FP = 32 / 8, MOM8 = 8 / 8;
  var OVER = 32 / 64, DOUBLE = 8 / 64 + 32 / (64 * 256);
  var CAPS = [16, 24, 40, 48, 80];
  // 架构：L、h、查询头、KV 头、FFN、词表、是否共享 embedding。
  var MODELS = [
    { name: 'Llama-2 7B', L: 32, h: 4096, a: 32, kv: 32, f: 11008, V: 32000, tied: false, context: 4096, repo: 'Llama-2-7b-hf' },
    { name: 'Llama-2 13B', L: 40, h: 5120, a: 40, kv: 40, f: 13824, V: 32000, tied: false, context: 4096, repo: 'Llama-2-13b-hf' },
    { name: 'Llama-2 70B', L: 80, h: 8192, a: 64, kv: 8, f: 28672, V: 32000, tied: false, context: 4096, repo: 'Llama-2-70b-hf' },
    { name: 'Llama-3 8B', L: 32, h: 4096, a: 32, kv: 8, f: 14336, V: 128256, tied: false, context: 8192, repo: 'Meta-Llama-3-8B' },
    { name: 'Llama-3 70B', L: 80, h: 8192, a: 64, kv: 8, f: 28672, V: 128256, tied: false, context: 8192, repo: 'Meta-Llama-3-70B' }
  ];
  var METHODS = ['全量（bf16 + Adam）', '全量（8 位 Adam）', 'LoRA（bf16 底座）', 'QLoRA（4 位底座）'];
  var SHORT = ['全量 · Adam', '全量 · 8 位 Adam', 'LoRA', 'QLoRA'];
  var st = { model: 0, method: 3, r: 16, s: 2048, b: 2, checkpoint: true, flash: true, all: true, double: true };
  function S(parent, tag, attrs, text) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    parent.appendChild(el); return el;
  }
  function E(parent, tag, attrs, text) {
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    parent.appendChild(el); return el;
  }
  function gb(n) { return (n / GB).toFixed(1) + ' GB'; }
  function out(id, value, text) { $(id).textContent = text; $(id).setAttribute('data-value', value); }
  function link(url, name) { return '<a href="' + url + '">' + name + '</a>'; }
  function paper(id, name) { return link('https://arxiv.org/abs/' + id, name); }
  function architecture(m) {
    var k = m.h * m.kv / m.a;
    var linear = m.L * (2 * m.h * m.h + 2 * m.h * k + 3 * m.h * m.f);
    var norm = (2 * m.L + 1) * m.h, embed = (m.tied ? 1 : 2) * m.V * m.h;
    return { k: k, linear: linear, norm: norm, embed: embed, N: linear + norm + embed };
  }
  function account(m, method) {
    var arch = architecture(m), adapter = method >= 2;
    var T = m.L * st.r * (st.all ? 9 * m.h + 2 * arch.k + 3 * m.f : 3 * m.h + arch.k);
    var train = adapter ? T : arch.N;
    var base = method === 3 ? arch.linear * (4 + (st.double ? DOUBLE : OVER)) / 8 + BF * (arch.embed + arch.norm) : BF * arch.N;
    var weights = base + (adapter ? BF * T : 0);
    var grad = BF * train, master = FP * train, moments = 2 * (method === 1 ? MOM8 : FP) * train;
    var layer = st.s * st.b * m.h * (34 + (st.flash ? 0 : 5 * m.a * st.s / m.h));
    var activation = st.checkpoint ? BF * st.s * st.b * m.h * m.L + layer : layer * m.L;
    var logits = (BF + FP) * st.s * st.b * m.V;
    return { N: arch.N, T: train, weights: weights, grad: grad, master: master, moments: moments,
      activation: activation, logits: logits, total: weights + grad + master + moments + activation + logits };
  }
  function button(parent, label, key, value) {
    var btn = E(parent, 'button', { type: 'button', 'data-key': key, 'data-choice': String(value), 'aria-pressed': 'false' }, label);
    btn.addEventListener('click', function () { st[key] = value === 'toggle' ? !st[key] : value; update(); });
    return btn;
  }
  MODELS.forEach(function (m, i) { button($('mem-model'), m.name, 'model', i); });
  METHODS.forEach(function (m, i) { button($('mem-method'), m, 'method', i); });
  button($('mem-opt'), '梯度检查点', 'checkpoint', 'toggle');
  button($('mem-opt'), 'FlashAttention', 'flash', 'toggle');
  var targets = E($('mem-opt'), 'div', { id: 'mem-targets', class: 'seg', role: 'group', 'aria-label': '适配范围' });
  button(targets, '只适配 q、v', 'all', false); button(targets, '适配全部线性层', 'all', true);
  var dq = button($('mem-opt'), '双重量化', 'double', 'toggle'); dq.id = 'mem-double';
  var intro = document.createElement('p'); intro.id = 'mem-intro'; intro.className = 'mem-note';
  intro.textContent = '单卡粗算，无分片。GB = 10^9 字节；虚线是容量参照，箭头表示超出图轴。';
  root.insertBefore(intro, svg);
  var compare = document.createElement('p'); compare.id = 'mem-compare'; compare.className = 'mem-note';
  root.insertBefore(compare, $('mem-model').parentNode);
  svg.setAttribute('aria-describedby', 'mem-intro mem-compare');
  $('mem-read').setAttribute('aria-live', 'polite');
  E(root, 'p', { class: 'mem-note', id: 'mem-caveat' }, '不含 CUDA 上下文与碎片，通常再多 1 到 3 GB；未计分页优化器、临时反量化工作区与算子缓冲，容量判断不是运行保证。');
  var details = E(root, 'details', { id: 'mem-details' });
  E(details, 'summary', {}, '查看逐项账本、公式与来源');
  E(details, 'p', { id: 'mem-arch', class: 'mem-note' });
  var ledger = E(details, 'dl', { id: 'mem-ledger' });
  [['mem-n', '底座参数 N'], ['mem-t', '可训练参数'], ['mem-weights', '权重（含适配器）'], ['mem-grad', '梯度'],
    ['mem-master', 'fp32 主副本'], ['mem-moments', 'Adam 双矩状态'], ['mem-activation', '激活'], ['mem-logits', '损失 logits']].forEach(function (row) {
    E(ledger, 'dt', {}, row[1]); E(ledger, 'dd', { id: row[0] });
  });
  E(details, 'div', { id: 'mem-formulas' });
  function draw(rows) {
    var w = Math.round(svg.getBoundingClientRect().width), left = 8, right = w - 12, pw = right - left;
    var top = 65, step = 68, height = top + step * rows.length + 12, limit = CAPS[CAPS.length - 1];
    svg.textContent = ''; svg.setAttribute('viewBox', '0 0 ' + w + ' ' + height); svg.setAttribute('height', height);
    var defs = S(svg, 'defs', {}), clip = S(defs, 'clipPath', { id: 'mem-clip' });
    S(clip, 'rect', { x: left, y: top, width: pw, height: height - top });
    S(svg, 'text', { x: left, y: 16, class: 'mem-axis' }, '显存／GB');
    CAPS.forEach(function (cap, i) {
      var x = left + pw * cap / limit, y = i % 2 ? 51 : 35;
      S(svg, 'line', { class: 'mem-ref', x1: x, x2: x, y1: y + 5, y2: height - 12 });
      S(svg, 'text', { class: 'mem-axis', x: x, y: y, 'text-anchor': cap === limit ? 'end' : 'middle' }, String(cap));
    });
    S(svg, 'text', { class: 'mem-axis', x: left, y: 51 }, String(0));
    rows.forEach(function (v, i) {
      var y = top + i * step, selected = i === st.method;
      var group = S(svg, 'g', { class: selected ? 'mem-row mem-selected' : 'mem-row' });
      S(group, 'title', {}, METHODS[i] + '：权重 ' + gb(v.weights) + '，梯度与优化器 ' + gb(v.grad + v.master + v.moments) + '，激活与 logits ' + gb(v.activation + v.logits));
      S(group, 'text', { class: 'mem-label', x: left, y: y + 13 }, SHORT[i] + (selected ? ' · 当前' : ''));
      S(group, 'text', { class: 'mem-value', x: right, y: y + 13, 'text-anchor': 'end' }, gb(v.total));
      var bar = S(group, 'g', { 'clip-path': 'url(#mem-clip)' }), offset = 0;
      [v.weights, v.grad + v.master + v.moments, v.activation + v.logits].forEach(function (value, part) {
        var shown = Math.max(0, Math.min(value / GB, limit - offset));
        S(bar, 'rect', { class: 'mem-part mem-part-' + part, x: left + pw * Math.min(offset, limit) / limit, y: y + 24, width: pw * shown / limit, height: 23 });
        offset += value / GB;
      });
      if (selected) S(group, 'line', { class: 'mem-selection', x1: left, x2: right, y1: y + 53, y2: y + 53 });
      if (v.total / GB > limit) S(group, 'path', { class: 'mem-arrow', d: 'M' + (right - 7) + ' ' + (y + 28) + 'l7 7.5 -7 7.5' });
    });
    svg.setAttribute('aria-label', '四种微调方法的显存粗算；容量参照 ' + CAPS.join('、') + ' GB；' + rows.map(function (v, i) { return SHORT[i] + ' ' + gb(v.total); }).join('，'));
  }
  function explain(m, v) {
    var arch = architecture(m), fullBytes = BF + BF + FP + FP + FP, eightBytes = BF + BF + FP + MOM8 + MOM8;
    $('mem-arch').innerHTML = m.name + '：L＝' + m.L + '，h＝' + m.h + '，查询头 a＝' + m.a + '，KV 头＝' + m.kv + '，KV 宽度 k＝' + arch.k + '，FFN 宽度 f＝' + m.f + '，V＝' + m.V + '；embedding 与 LM head ' + (m.tied ? '共享' : '不共享') + '。' + link('https://huggingface.co/meta-llama/' + m.repo + '/blob/main/config.json', '官方配置（需访问权限）') + '；' + link('https://huggingface.co/api/models/meta-llama/' + m.repo, '公开参数量元数据') + '。';
    out('mem-n', v.N, String(v.N)); out('mem-t', v.T, String(v.T));
    ['weights', 'grad', 'master', 'moments', 'activation', 'logits'].forEach(function (key) { out('mem-' + key, v[key], gb(v[key])); });
    $('mem-formulas').innerHTML =
      '<p>参数：k＝h × KV头／a；Q＝L（2h²＋2hk＋3hf）为层内线性权重，R＝（2L＋1）h 为 RMSNorm，E＝' + (m.tied ? 'Vh' : '2Vh') + ' 为 embedding 与输出头；N＝Q＋R＋E。均无偏置。架构见 ' + paper('2307.09288', 'Llama 2 §2') + '、' + paper('2407.21783', 'Llama 3 表 3') + '；小模型沿用 ' + paper('2302.13971', 'LLaMA 表 2') + '，FFN 取整与独立输出头见 ' + link('https://github.com/meta-llama/llama/blob/main/llama/model.py', 'Meta 实现') + '。</p>' +
      '<p>全量 Adam：bf16 权重 ' + BF + '＋梯度 ' + BF + '＋fp32 主副本 ' + FP + '＋双矩 ' + (FP + FP) + '＝' + fullBytes + ' 字节／参数；优化器部分 K＝' + (FP * 3) + '，见 ' + paper('1910.02054', 'ZeRO §3.1') + '。' + paper('2110.02861', '8 位 Adam §2') + ' 将双矩降为 ' + (MOM8 * 2) + ' 字节，本账保留主副本，合计 ' + eightBytes + ' 字节／参数；忽略量化块元数据与小张量的高精度例外。</p>' +
      '<p>LoRA：T＝Σ r（d_in＋d_out）；q、v 为 Lr（3h＋k），全部层内线性层为 Lr（9h＋2k＋3f），包含 q、k、v、o、gate、up、down，不含 LM head。冻结底座 ' + BF + 'N 字节，适配器仍按 ' + fullBytes + 'T 字节；冻结权重不存梯度，但仍保留激活。</p>' +
      '<p>' + paper('2305.14314', 'QLoRA §3') + '：NF4 常数开销，无双重量化为 32／64＝' + OVER + ' bit／参数；有双重量化为 8／64＋32／（64×256）＝' + DOUBLE + '，节省 ' + (OVER - DOUBLE) + ' bit／参数。当前采用' + (st.double ? '双重量化' : '单重量化') + '，底座＝Q ×（4＋' + (st.double ? DOUBLE : OVER) + '）／8＋' + BF + '（E＋R）字节；明确选择 embedding、LM head、RMSNorm 均保留 bf16，只有层内线性权重量化。适配器另计 ' + fullBytes + 'T 字节；未建模分页优化器。</p>' +
      '<p>激活近似：' + paper('2205.05198', 'Korthikanti 等 §4／表 2') + ' 给出每层 A₁＝sbh（34＋5as／h）字节；' + paper('2205.14135', 'FlashAttention') + ' 不保存平方级注意力矩阵，本账将该项去掉，取 A₁＝34sbh。无检查点为 LA₁；逐层检查点为 ' + BF + 'L sbh＋A₁，额外计入一层重算工作集。Llama 的 SwiGLU 与 GQA 会改变常数 34，此处沿用近似，未另计适配器中间激活。</p>' +
      '<p>损失 logits：本账假设同时保留 bf16 logits 和损失计算时的 fp32 上转副本，共（' + BF + '＋' + FP + '）sbV＝' + (BF + FP) + 'sbV 字节；未假设分块或融合交叉熵。各项直接相加，不模拟实际张量存活期。</p>' +
      '<p>Llama 3 词表含保留的特殊词元，按 ' + link('https://github.com/meta-llama/llama3/blob/main/llama/tokenizer.py', 'Meta tokenizer') + ' 计入完整词表；Llama 2 序列化文件中的 RoPE 频率缓冲不属于可训练参数。序列长度只用于显存外推；当前预设原生上下文为 ' + m.context + '，超过它需另行处理位置编码与训练方案。容量参照按十进制 GB 统一比较，未将硬件标称容量解释为 GiB。</p>';
  }
  function update() {
    var m = MODELS[st.model], rows = METHODS.map(function (_, i) { return account(m, i); }), v = rows[st.method];
    Array.prototype.forEach.call(root.querySelectorAll('button[data-key]'), function (btn) {
      var key = btn.getAttribute('data-key'), choice = btn.getAttribute('data-choice');
      btn.setAttribute('aria-pressed', String(choice === 'toggle' ? st[key] : String(st[key]) === choice));
    });
    targets.hidden = st.method < 2; dq.hidden = st.method !== 3; $('mem-r').disabled = st.method < 2;
    $('mem-r-out').textContent = st.r; $('mem-s-out').textContent = st.s; $('mem-b-out').textContent = st.b;
    $('mem-s').setAttribute('aria-valuetext', st.s + ' 个词元'); $('mem-b').setAttribute('aria-valuetext', st.b + ' 个序列');
    out('mem-train', v.T, (v.T / Math.pow(10, 6)).toFixed(3) + ' 百万');
    out('mem-w', v.weights, gb(v.weights)); out('mem-o', v.grad + v.master + v.moments, gb(v.grad + v.master + v.moments));
    out('mem-a', v.activation + v.logits, gb(v.activation + v.logits)); out('mem-total', v.total, gb(v.total));
    $('mem-compare').textContent = '四行共用 s＝' + st.s + '、b＝' + st.b + '；适配器 r＝' + st.r + '，' + (st.all ? '全部线性层' : '只适配 q、v') + '；QLoRA ' + (st.double ? '开启' : '关闭') + '双重量化。';
    var fit = CAPS.filter(function (cap) { return cap * GB >= v.total; });
    var parts = [['权重', v.weights], ['梯度与优化器状态', v.grad + v.master + v.moments], ['激活与 logits', v.activation + v.logits]];
    parts.sort(function (a, b) { return b[1] - a[1]; });
    var read = m.name + ' 的' + METHODS[st.method] + '估计合计 ' + gb(v.total) + '，' + (fit.length ? '在所列容量中最小可容纳为 ' + fit[0] + ' GB' : '超过 80 GB') + '（仅按已计项目）' + (st.s > m.context ? '，当前序列长度超出原生上下文' : '') + '。';
    read += '最大项是' + parts[0][0] + '，占 ' + gb(parts[0][1]) + '（' + (parts[0][1] / v.total * 100).toFixed(1) + '％）';
    if (st.model === 2 && st.method === 3 && st.checkpoint) read += '；' + paper('2305.14314', 'QLoRA 论文') + '报告 65B 模型可以在一张 48 GB 的卡上微调，原模型为 Llama-1 65B，此处用最近的 Llama-2 70B 预设粗算为 ' + gb(v.total) + '，' + (v.total <= 48 * GB ? '低于' : '高于') + ' 48 GB，模型与记账假设不同，并非复现实测';
    $('mem-read').innerHTML = read + '。'; explain(m, v); draw(rows);
  }
  // 原生滑块在输入边界归一化；其余计算只接收有效状态。
  [['mem-r', 'r', false], ['mem-s', 's', true], ['mem-b', 'b', true]].forEach(function (item) {
    var input = $(item[0]);
    input.addEventListener('input', function () {
      var value = Math.max(+input.min, Math.min(+input.max, Math.round(+input.value)));
      st[item[1]] = item[2] ? Math.pow(2, value) : value; update();
    });
  });
  update();
  var lastWidth = svg.getBoundingClientRect().width;
  function resize() {
    var w = svg.getBoundingClientRect().width;
    if (w !== lastWidth) { lastWidth = w; draw(METHODS.map(function (_, i) { return account(MODELS[st.model], i); })); }
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(svg);
})();
