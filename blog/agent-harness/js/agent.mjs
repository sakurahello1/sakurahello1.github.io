// The bounded agent loop behind every theater. It runs against a real OpenAI-compatible endpoint and
// reports what happens as events; the theater draws them, and tools/record_agent_trace.mjs records them
// for the replay. No DOM here, so the same loop runs in the browser and in Node.
import {chat} from './transport.mjs';
import {dispatch, tools, vendors, verify, isComplete} from './fixture.mjs';

export const TASK = '虚构采购任务：买一台笔记本，含税预算 7600 元，须在 2026-10-05 前交付，候选供应商是 clay、ink、paper。这不是实际采购。';
const ANSWER = '最终只返回一个 JSON 对象，字段 vendor、total（含税整数）、delivery、source。';
export const GOAL = `${TASK}用 lookup_vendor 和 compute_total 核对三家报价。${ANSWER}`;
const SYSTEM = {
  tools: '你是一个谨慎的采购助理，全程用中文。先用工具核实报价和交期，不要凭记忆作答；每次调用工具前，用一句话说明要查什么。拿到足够证据后，最终回复只能是那个 JSON 对象本身：不要解释，不要代码块。',
  answer: '你是一个谨慎的采购助理，全程用中文。这一轮没有工具，只根据对话里给出的资料作答；资料不够就把拿不准的字段设为 null，不要编数字。最终回复只能是那个 JSON 对象本身：不要解释，不要代码块。',
  worker: '你是采购团队里的一个工作者，只负责交给你的那一项检查，没有工具。只根据给你的资料，用两三句中文报告结论和依据的 source；资料里没有的信息就说不知道，不要猜，也不要输出 JSON。'
};
export const LIMITS = {calls: 5, tools: 8};

// Each variant is one lesson's experiment on the same fixed task.
export const VARIANTS = {
  react: {title: 'ReAct 闭环', dek: '模型提议工具调用，harness 校验并执行，结果作为新观察回到上下文，直到交出答案、由验收器判断。'},
  repair: {title: '验证与修复', dek: '上一轮交出的答案漏算了税。验收器给出具体证据，模型拿着证据再做一次。'},
  selection: {title: '上下文选择', dek: '不给工具，只给一段上下文。上下文里保留了什么，决定了模型还能不能算对。'},
  workers: {title: '两个工作者', dek: '价格和交期交给两个只看一半资料的工作者，调度者汇合两份报告后作答，最后同样要过验收。'}
};
export const SELECTIONS = [['all', '三家完整报价'], ['selected', '只保留相关报价'], ['lossy', '一句话摘要']];

function evidenceFor(selection) {
  if (selection === 'lossy') return 'clay 的价格不错，而且交付快。';
  return JSON.stringify(selection === 'selected' ? [vendors.clay] : Object.values(vendors));
}

// run({variant, selection, credentials, signal, emit}); emit(event) may be async (the theater animates).
export async function run({variant = 'react', selection = 'all', credentials, signal, emit}) {
  const usage = {prompt: 0, completion: 0, known: true};
  let calls = 0, toolCount = 0, ctxTokens = 0;
  const meter = () => emit({type: 'meter', calls, tools: toolCount, prompt: usage.prompt, completion: usage.completion,
    usageKnown: usage.known, ctx: ctxTokens});
  const call = async (messages, withTools, id, node) => {
    if (calls >= LIMITS.calls) throw new Error('调用预算用完了，任务停在 incomplete');
    calls++;
    await emit({type: 'node', id: node, note: `第 ${calls} 次调用`});
    await emit({type: 'msg', id, role: 'assistant', text: ''});
    const r = await chat({...credentials, messages, tools: withTools ? tools : undefined, signal,
      onText: text => emit({type: 'delta', id, text})});
    if (Number.isInteger(r.usage?.prompt_tokens)) { usage.prompt += r.usage.prompt_tokens; ctxTokens = r.usage.prompt_tokens; }
    else usage.known = false;
    if (Number.isInteger(r.usage?.completion_tokens)) usage.completion += r.usage.completion_tokens;
    await emit({type: 'done-msg', id});
    meter();
    return r.message;
  };
  const finish = async answer => {
    await emit({type: 'edge', from: variant === 'workers' ? 'merge' : 'model', to: 'verify', label: '最终回答'});
    const checks = verify(answer);
    const pass = isComplete(checks);
    await emit({type: 'verify', checks, pass});
    await emit({type: 'end', status: pass ? 'completed' : 'failed'});
    return pass;
  };

  const goal = variant === 'react' ? GOAL : TASK + ANSWER;
  await emit({type: 'start', variant, goal});
  meter();

  if (variant === 'workers') {
    await emit({type: 'edge', from: 'goal', to: 'orch'});
    await emit({type: 'node', id: 'orch', note: '拆成两份'});
    const notes = [];
    for (const [id, role, fields] of [['w1', '价格', ['id', 'price', 'tax', 'source']], ['w2', '交期', ['id', 'delivery', 'source']]]) {
      const slice = Object.values(vendors).map(v => Object.fromEntries(fields.map(f => [f, v[f]])));
      await emit({type: 'edge', from: 'orch', to: id, label: role});
      await emit({type: 'msg', id: `${id}-in`, role: 'user', label: `给${role}工作者`, text: `只检查${role}。资料：${JSON.stringify(slice)}`});
      const focus = role === '价格' ? '（含税 = 价格 × (1 + 税率)，看是否在预算内）' : '（看能否在截止日前交付）';
      const m = await call([{role: 'system', content: SYSTEM.worker}, {role: 'user', content: `${TASK}\n你只负责${role}检查${focus}。资料：${JSON.stringify(slice)}`}],
        false, `${id}-out`, id);
      notes.push({role: 'user', content: `${role}工作者的报告（仍需验收）：${m.content}`});
      await emit({type: 'edge', from: id, to: 'merge', label: '报告'});
    }
    const m = await call([{role: 'system', content: SYSTEM.answer}, {role: 'user', content: goal}, ...notes,
      {role: 'user', content: '根据两份报告作答，只输出 JSON。'}], false, 'merge-out', 'merge');
    return finish(m.content);
  }

  const messages = [{role: 'system', content: variant === 'react' ? SYSTEM.tools : SYSTEM.answer}, {role: 'user', content: goal}];
  await emit({type: 'msg', id: 'goal', role: 'user', text: goal});
  await emit({type: 'edge', from: 'goal', to: 'ctx'});

  if (variant === 'repair') {
    const wrong = '{"vendor":"clay","total":6800,"delivery":"2026-10-03","source":"quote-clay-v2"}';
    messages.push({role: 'assistant', content: wrong});
    await emit({type: 'msg', id: 'prior', role: 'assistant', label: '上一轮的答案', text: wrong});
    await emit({type: 'edge', from: 'model', to: 'verify', label: '最终回答'});
    const checks = verify(wrong);
    await emit({type: 'verify', checks, pass: false});
    const feedback = '验收失败：total 不对。quote-clay-v2 的价格 6800、税率 10%，含税应为 6800 × 1.1 = 7480。请根据这条证据修正，预算和交期要求不变，只输出 JSON。';
    messages.push({role: 'user', content: feedback});
    await emit({type: 'edge', from: 'verify', to: 'ctx', label: '证据反馈'});
    await emit({type: 'msg', id: 'feedback', role: 'user', label: '验收器反馈', text: feedback});
  }
  if (variant === 'selection') {
    const text = `可用资料（没有工具可调用）：${evidenceFor(selection)}`;
    messages.push({role: 'user', content: text});
    await emit({type: 'msg', id: 'evidence', role: 'user', label: '上下文里的资料', text});
  }
  const useTools = variant === 'react';

  for (;;) {
    signal?.throwIfAborted();
    await emit({type: 'node', id: 'ctx', note: `${messages.length} 条消息`});
    await emit({type: 'edge', from: 'ctx', to: 'model'});
    const id = `a${calls + 1}`;
    const m = await call(messages, useTools, id, 'model');
    messages.push(m);
    if (!m.tool_calls) return finish(m.content);
    await emit({type: 'calls', id, calls: m.tool_calls.map(c => ({name: c.function.name, args: c.function.arguments}))});
    await emit({type: 'edge', from: 'model', to: 'check', label: 'tool_calls'});
    let anyOk = false;
    for (const c of m.tool_calls) {
      if (++toolCount > LIMITS.tools) throw new Error('工具预算用完了，任务停在 incomplete');
      let result, ok = true;
      try { result = dispatch(c); } catch (e) { result = {error: e.message}; ok = false; }
      await emit({type: 'node', id: 'check', note: ok ? '契约通过' : '拒绝', state: ok ? 'ok' : 'bad'});
      if (ok) {
        anyOk = true;
        await emit({type: 'edge', from: 'check', to: 'tool'});
        await emit({type: 'node', id: 'tool', note: `${c.function.name}`});
      }
      await emit({type: 'tool', id: `t${toolCount}`, name: c.function.name, args: c.function.arguments, ok, result});
      messages.push({role: 'tool', tool_call_id: c.id, content: JSON.stringify(result)});
      meter();
    }
    await emit({type: 'edge', from: anyOk ? 'tool' : 'check', to: 'ctx', label: anyOk ? '观察' : '错误作为观察'});
  }
}

// Lessons 10–11: bury one fact at a chosen depth in a long document full of look-alikes, then ask for it.
export const POSITIONS = [0, 25, 50, 75, 100];
export const LENGTHS = [['short', '约 2 千 token', 90], ['medium', '约 1 万 token', 450], ['long', '约 3 万 token', 1350]];
const NEEDLE = 'clay 当前有效的报价编号是 quote-clay-v7，其余 clay 报价均已作废。';
const DECOYS = ['clay 的旧报价编号是 quote-clay-v5（已作废）。', 'ink 当前有效的报价编号是 quote-ink-v7。', 'clay 的草稿报价编号是 quote-clay-v6（未生效）。'];
export function haystack(lines, depth) {
  const rows = [];
  for (let i = 0; i < lines; i++) rows.push(`备忘 ${i + 1}：供应商 ${['paper', 'ink', 'clay'][i % 3]} 的发票 INV-${(i * 7919) % 100000} 已归档，对账人 ${['周', '林', '陈', '王'][i % 4]}。`);
  DECOYS.forEach((d, k) => rows.splice(Math.floor(lines * (k + 1) / 4), 0, d));
  rows.splice(Math.round(rows.length * depth / 100), 0, NEEDLE);
  return rows.join('\n');
}
export async function positionProbe({credentials, lines, signal, onResult}) {
  for (const depth of POSITIONS) {
    signal?.throwIfAborted();
    const t0 = Date.now();
    const r = await chat({...credentials, signal, maxBytes: 262144, messages: [
      {role: 'system', content: '根据用户给的文档回答，只输出答案本身。'},
      {role: 'user', content: `${haystack(lines, depth)}\n\n问题：clay 当前有效的报价编号是什么？只回答编号。`}]});
    const answer = r.message.content.trim();
    await onResult({depth, answer, ok: answer.includes('quote-clay-v7'), ms: Date.now() - t0,
      prompt: r.usage?.prompt_tokens, completion: r.usage?.completion_tokens});
  }
}
