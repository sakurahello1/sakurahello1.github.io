// Lessons 3–4: a tool call is only a proposal. Five checks stand between it and execution.
import {el, button, select, setup, wait} from './lab-ui.mjs';
import {dispatch, tools} from './fixture.mjs';

const SAMPLES = {
  valid: ['合法调用', 'compute_total', '{"id":"clay","quantity":1}'],
  json: ['JSON 被截断', 'compute_total', '{"id":"clay","quan'],
  unknown: ['不存在的工具', 'delete_order', '{"id":"clay"}'],
  extra: ['多了一个字段', 'compute_total', '{"id":"clay","quantity":1,"endpoint":"https://evil.example"}'],
  type: ['类型不对', 'compute_total', '{"id":"clay","quantity":"1"}'],
  policy: ['形状对，但违反业务规则', 'compute_total', '{"id":"clay","quantity":999}']
};
const LAYERS = [
  ['parse', '① JSON 可解析'], ['allow', '② 工具在注册表里'], ['fields', '③ 字段不多不少'],
  ['types', '④ 类型与枚举'], ['policy', '⑤ 业务规则']
];

function layers(name, raw) {
  const fail = (k, why) => ({failed: k, why});
  let a;
  try { a = JSON.parse(raw); } catch { return fail('parse', '参数不是完整的 JSON，没法知道模型想要什么。'); }
  const tool = tools.find(t => t.function.name === name);
  if (!tool) return fail('allow', `注册表里没有 ${name}。模型可以“想”调用任何名字，harness 只执行登记过的。`);
  const want = Object.keys(tool.function.parameters.properties);
  const keys = Object.keys(a);
  if (keys.length !== want.length || keys.some(k => !want.includes(k)))
    return fail('fields', `期望字段 ${want.join('、')}，实际是 ${keys.join('、')}。多出来的字段可能把请求引到别处。`);
  if (typeof a.id !== 'string' || !tool.function.parameters.properties.id.enum.includes(a.id) ||
      (name === 'compute_total' && !Number.isInteger(a.quantity)))
    return fail('types', '"1" 是字符串不是整数。看起来差不多，交给程序就是另一回事。');
  if (name === 'compute_total' && (a.quantity < 1 || a.quantity > 3))
    return fail('policy', 'JSON Schema 管不到“一次最多买 3 台”这种业务规则，得在执行前单独检查。');
  return {failed: null};
}

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '工具调用的五道关',
    dek: '模型给出的只是一个“提议”。选一个提议送进 harness，看它在哪一道关被拦下，还是一路通过、真的执行。',
    note: '各关的规则与页面里 agent 实际用的 dispatch() 一致，这里把它们拆成一关一关，方便演示；执行的只是本地的虚构报价表。'
  });
  const pick = select(controls, '提议', Object.entries(SAMPLES).map(([k, [label]]) => [k, label]));
  const go = button('送进 harness', controls, () => runIt(), 'btn primary');
  const code = el('div', null, stage, 'mono-box');
  const pipe = el('div', null, stage, 'pipe');
  pipe.style.marginTop = '14px';
  const pills = LAYERS.map(([, label], i) => {
    if (i) el('span', '→', pipe, 'arrow');
    return el('span', label, pipe, 'pill');
  });
  el('span', '→', pipe, 'arrow');
  const exec = el('span', '执行', pipe, 'pill');
  const show = () => {
    const [, name, raw] = SAMPLES[pick.value];
    code.textContent = `{"type":"function","function":{"name":"${name}","arguments":'${raw}'}}`;
    for (const p of [...pills, exec]) p.className = 'pill';
    out.textContent = '';
  };
  pick.addEventListener('change', show);
  show();
  async function runIt() {
    go.disabled = true; pick.disabled = true;
    show();
    const [, name, raw] = SAMPLES[pick.value];
    const verdict = layers(name, raw);
    for (const [i, [k]] of LAYERS.entries()) {
      pills[i].classList.add('on');
      await wait(380);
      pills[i].classList.remove('on');
      if (verdict.failed === k) {
        pills[i].classList.add('bad');
        out.replaceChildren(el('b', '拦下。', null, 'bad'), ' ' + verdict.why + ' 这条错误会作为观察交回模型，而不是被执行。');
        go.disabled = pick.disabled = false;
        return;
      }
      pills[i].classList.add('ok');
    }
    exec.classList.add('ok');
    const result = dispatch({type: 'function', function: {name, arguments: raw}});
    out.replaceChildren(el('b', '通过并执行。', null, 'ok'), ` 结果 ${JSON.stringify(result)} 作为新观察回到上下文。`);
    go.disabled = pick.disabled = false;
  }
}
