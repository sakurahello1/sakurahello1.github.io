export const vendors = Object.freeze({
  clay: {id: 'clay', price: 6800, tax: 0.1, delivery: '2026-10-03', source: 'quote-clay-v2'},
  ink: {id: 'ink', price: 6400, tax: 0.1, delivery: '2026-10-12', source: 'quote-ink-v3'},
  paper: {id: 'paper', price: 7100, tax: 0.1, delivery: '2026-10-04', source: 'quote-paper-v1'}
});
export const tools = [{type: 'function', function: {name: 'lookup_vendor',
  description: '读取虚构供应商报价、税率、交期和证据 ID；无采购副作用',
  parameters: {type: 'object', properties: {id: {type: 'string', enum: Object.keys(vendors)}},
    required: ['id'], additionalProperties: false}}},
{type: 'function', function: {name: 'compute_total', description: '本地计算含税总价',
  parameters: {type: 'object', properties: {id: {type: 'string', enum: Object.keys(vendors)},
    quantity: {type: 'integer'}}, required: ['id', 'quantity'], additionalProperties: false}}}];
export function dispatch(call) {
  if (call.type !== 'function' || !['lookup_vendor', 'compute_total'].includes(call.function?.name))
    throw new Error('工具不在白名单');
  if (typeof call.function.arguments !== 'string' || new TextEncoder().encode(call.function.arguments).length > 4096)
    throw new Error('参数长度无效');
  let a; try { a = JSON.parse(call.function.arguments); } catch { throw new Error('参数不是 JSON'); }
  const compute = call.function.name === 'compute_total';
  const expected = compute ? ['id', 'quantity'] : ['id'];
  if (!a || typeof a !== 'object' || Array.isArray(a) ||
      Object.keys(a).length !== expected.length || Object.keys(a).some(k => !expected.includes(k)))
    throw new Error('参数字段不符合契约');
  if (typeof a.id !== 'string' || a.id.length > 32 || !Object.hasOwn(vendors, a.id))
    throw new Error('供应商枚举无效');
  if (compute && (!Number.isInteger(a.quantity) || a.quantity < 1 || a.quantity > 3))
    throw new Error('业务策略：quantity 仅允许 1–3');
  const v = vendors[a.id];
  return compute ? {total: Math.round(v.price * (1 + v.tax) * a.quantity), source: v.source} : {...v};
}
export function verify(text) {
  let x; try { x = JSON.parse(text); } catch { return {parse: false}; }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {parse: false};
  return {parse: true, vendor: x.vendor === 'clay', price: x.total === 7480,
    evidence: x.source === 'quote-clay-v2', deadline: x.delivery === '2026-10-03'};
}
export function isComplete(checks) {
  const required = ['parse', 'vendor', 'price', 'evidence', 'deadline'];
  return !!checks && Object.keys(checks).length === required.length &&
    required.every(id => Object.hasOwn(checks, id) && checks[id] === true);
}
