import test from 'node:test';
import assert from 'node:assert/strict';
import {Credentials, SLOT, normalizeBase, readChatStream, chat} from '../blog/agent-harness/js/transport.mjs';
import {dispatch, verify, isComplete} from '../blog/agent-harness/js/fixture.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const sentinel='synthetic-test-sentinel-not-a-real-key';
function response(text, chunk=1, status=200){
  const bytes=new TextEncoder().encode(text);let i=0;
  return new Response(new ReadableStream({pull(c){if(i>=bytes.length)c.close();else {c.enqueue(bytes.slice(i,i+chunk));i+=chunk;}}}),{status});
}
const event=x=>'data: '+JSON.stringify(x)+'\r\n\r\n';
const stream=event({choices:[{delta:{content:'陶土中文'},finish_reason:null}]})+
  ': keep-alive\r\n\r\n'+event({choices:[{delta:{},finish_reason:'stop'}],usage:{total_tokens:8}})+'data: [DONE]\r\n\r\n';
test('all byte chunk sizes handle UTF8, CRLF, comments, usage',async()=>{
  for(let size=1;size<=new TextEncoder().encode(stream).length;size++){
    const r=await readChatStream(response(stream,size),new AbortController().signal);
    assert.equal(r.message.content,'陶土中文');assert.equal(r.usage.total_tokens,8);
  }
});
test('interleaved function fragments assembled by index',async()=>{
  const s=event({choices:[{delta:{tool_calls:[{index:1,id:'b',function:{name:'compute_',arguments:'{"id":"clay",'}},
    {index:0,id:'a',function:{name:'lookup_vendor',arguments:'{"id":'}}]}}]})+
    event({choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"clay"}'}},
      {index:1,function:{name:'total',arguments:'"quantity":1}'}}]},finish_reason:'tool_calls'}]})+'data: [DONE]\n\n';
  const r=await readChatStream(response(s),new AbortController().signal);
  assert.equal(r.message.tool_calls[0].id,'a');assert.equal(dispatch(r.message.tool_calls[1]).total,7480);
});
test('fail closed on EOF, malformed, truncation, missing tools, failed statuses',async()=>{
  for(const s of [stream.replace('data: [DONE]',''),stream.replace('"stop"','"length"'),
    'data: {bad}\n\n',stream.replace('"stop"','"tool_calls"')])
    await assert.rejects(readChatStream(response(s),new AbortController().signal));
  for(const status of [400,401,402,429,500])
    await assert.rejects(readChatStream(response('sensitive body',1,status),new AbortController().signal),new RegExp(`HTTP ${status}`));
});
test('multiline data, LF, trailing terminal without newline, empty choices',async()=>{
  const s='data: {"choices":\ndata: [{"delta":{"content":"x"},"finish_reason":"stop"}]}\n\n'+
    'data: {"choices":[],"usage":{"total_tokens":9}}\n\ndata: [DONE]';
  assert.equal((await readChatStream(response(s),new AbortController().signal)).usage.total_tokens,9);
});
test('credential tab refresh, memory default, destination binding, TTL expires',()=>{
  const session=storage(),local=storage();let now=100;const v=new Credentials(session,local,()=>now);
  v.save(sentinel,'https://api.deepseek.com','memory');assert.equal(new Credentials(session,local).read('https://api.deepseek.com'),null);
  v.save(sentinel,'https://api.deepseek.com','tab');assert.equal(new Credentials(session,local).read('https://api.deepseek.com').key,sentinel);
  assert.equal(v.read('https://other.example'),null);assert.ok(session.getItem(SLOT));
  v.save(sentinel,'https://api.deepseek.com','device',15);now+=900001;assert.equal(v.read('https://api.deepseek.com'),null);assert.equal(local.getItem(SLOT),undefined);
});
test('blocked storage falls back to memory; malformed expiry rejects',()=>{
  const bad={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
  const v=new Credentials(bad,bad);assert.equal(v.save(sentinel,'https://api.deepseek.com','tab'),false);
  assert.equal(v.read('https://api.deepseek.com').mode,'memory');
});
test('destinations and schema reject spoofing, unknown tool, extra fields, bad ranges',()=>{
  assert.equal(isComplete({}),false);assert.equal(isComplete({parse:true}),false);
  for(const url of ['http://localhost','https://user@host','https://host?key=x','https://host#x'])assert.throws(()=>normalizeBase(url));
  for(const [name,args] of [['constructor','{}'],['lookup_vendor','{"id":"__proto__"}'],
    ['lookup_vendor','{"id":"clay","extra":1}'],['lookup_vendor','{"id":["clay"]}'],
    ['lookup_vendor','{"id":null}'],['lookup_vendor','{"id":{}}'],['compute_total','{"id":"clay","quantity":999}']])
    assert.throws(()=>dispatch({type:'function',function:{name,arguments:args}}));
  assert.equal(verify('{}').vendor,false);assert.equal(verify('clay 7480 quote-clay-v2').parse,false);
});
test('custom endpoint tab/device records preserve binding across refresh',()=>{
  for(const mode of ['tab','device']){
    const session=storage(),local=storage(),v=new Credentials(session,local);
    v.save(sentinel,'https://personal.example/beta',mode,15);
    const refreshed=new Credentials(session,local);
    assert.equal(refreshed.metadata().base,'https://personal.example/beta');
    assert.equal(refreshed.read('https://api.deepseek.com'),null);
    assert.equal(refreshed.read(refreshed.metadata().base).key,sentinel);
    refreshed.clear();assert.equal(refreshed.metadata(),null);
  }
});
test('native fetch uses bound endpoint, abort signal, no redirects, no retries',async()=>{
  const c=new AbortController();let calls=0;
  const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');
    assert.equal(JSON.parse(init.body).max_tokens,1200);
    assert.equal(JSON.parse(init.body).stream_options.include_usage,true);return response(stream);};
  await chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher});
  assert.equal(calls,1);c.abort();await assert.rejects(chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher}));
});
test('abort propagates after headers, CORS safe error',async()=>{
  const c=new AbortController();const pending=new ReadableStream({start(controller){c.signal.addEventListener('abort',()=>controller.error(new DOMException('Abort','AbortError')));}});
  const p=chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher:async()=>new Response(pending)});
  setTimeout(()=>c.abort(),10);await assert.rejects(p);
  await assert.rejects(chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:new AbortController().signal,fetcher:async()=>{throw new TypeError(sentinel);}}),/网络或 CORS/);
});

// The theaters' agent loop, driven by a scripted provider: three lookups, the totals, then the answer.
import {run, haystack, GOAL} from '../blog/agent-harness/js/agent.mjs';
function scripted(turns) {
  let n = 0;
  return async (url, init) => {
    const body = JSON.parse(init.body);
    assert.ok(body.messages.length >= 2);
    const turn = turns[n++];
    const chunks = turn.tools
      ? [event({choices: [{delta: {tool_calls: turn.tools.map(([name, args], index) => ({index, id: `c${n}${index}`, type: 'function', function: {name, arguments: args}}))}, finish_reason: 'tool_calls'}], usage: {prompt_tokens: 100 * n, completion_tokens: 10}})]
      : [event({choices: [{delta: {content: turn.text}, finish_reason: 'stop'}], usage: {prompt_tokens: 100 * n, completion_tokens: 20}})];
    return response(chunks.join('') + 'data: [DONE]\n\n');
  };
}
test('agent loop: tool calls pass the contract, results return as observations, verifier passes', async () => {
  const fetcher = scripted([
    {tools: [['lookup_vendor', '{"id":"clay"}'], ['lookup_vendor', '{"id":"ink"}'], ['lookup_vendor', '{"id":"paper"}']]},
    {tools: [['compute_total', '{"id":"clay","quantity":1}']]},
    {text: '{"vendor":"clay","total":7480,"delivery":"2026-10-03","source":"quote-clay-v2"}'}]);
  const events = [];
  const pass = await run({variant: 'react', credentials: {base: 'https://api.deepseek.com', key: sentinel, model: 'm', fetcher},
    signal: new AbortController().signal, emit: e => { events.push(e); }});
  assert.equal(pass, true);
  assert.equal(events.filter(e => e.type === 'tool' && e.ok).length, 4);
  assert.equal(events.find(e => e.type === 'msg' && e.id === 'goal').text, GOAL);
  const meter = events.filter(e => e.type === 'meter').at(-1);
  assert.deepEqual([meter.calls, meter.tools, meter.prompt, meter.completion], [3, 4, 600, 40]);
  assert.equal(events.at(-1).status, 'completed');
});
test('agent loop: a call outside the contract is refused and fed back, the budget stops a runaway loop', async () => {
  const loop = Array.from({length: 6}, () => ({tools: [['delete_order', '{"id":"clay"}']]}));
  const events = [];
  await assert.rejects(run({variant: 'react', credentials: {base: 'https://api.deepseek.com', key: sentinel, model: 'm', fetcher: scripted(loop)},
    signal: new AbortController().signal, emit: e => { events.push(e); }}), /调用预算用完了/);
  assert.ok(events.filter(e => e.type === 'tool').every(e => !e.ok));
  assert.equal(events.filter(e => e.type === 'meter').at(-1).calls, 5);
});
test('haystack: the fact sits at the requested depth among the decoys', () => {
  for (const depth of [0, 50, 100]) {
    const rows = haystack(90, depth).split('\n');
    const at = rows.findIndex(r => r.includes('quote-clay-v7'));
    assert.ok(Math.abs(at / (rows.length - 1) - depth / 100) < 0.02, `${depth}: ${at}/${rows.length}`);
  }
  assert.equal(haystack(90, 50).split('quote-clay-v').length - 1, 3);
});

// Figure geometry: arrows stop at node borders, and the linter names what an author got wrong.
import {layoutFlow, layoutSequence, lint, route} from '../blog/agent-harness/js/diagram-layout.mjs';
const two = {kind: 'flow', nodes: {a: {at: [0, 0], text: '甲'}, b: {at: [1.5, 0], text: '乙'}}, edges: [['a', 'b', '读']]};
test('flow edges start and end on the node borders, pointing at the target', () => {
  const g = layoutFlow(two), [a, b] = [g.nodes.a, g.nodes.b], e = g.edges[0];
  assert.ok(Math.abs(e.points[0][0] - (a.x + a.w)) < 5 && Math.abs(e.end[0] - b.x) < 5);
  assert.ok(Math.abs(e.angle) < 1e-6);
  assert.equal(e.key, 'a>b');
  const bent = route(a, b, 30);
  assert.ok(bent.mid[1] > a.cy, 'positive bend bulges to the right of travel (down when going right)');
});
test('figure lint: clean figure passes; overlaps, arrows through nodes and long labels are reported', () => {
  assert.deepEqual(lint(two), []);
  const three = {kind: 'flow', nodes: {a: {at: [0, 0], text: 'A'}, m: {at: [1.2, 0], text: 'M'}, b: {at: [2.4, 0], text: 'B'}}, edges: [['a', 'b']]};
  assert.ok(lint(three).some(x => x.includes('穿过节点 m')));
  assert.ok(lint({...two, nodes: {...two.nodes, b: {at: [0.3, 0], text: '乙'}}}).some(x => x.includes('重叠')));
  assert.ok(lint({...two, edges: [['a', 'b', '一个非常非常长的标签']]}).some(x => x.includes('标签')));
  const seq = {kind: 'sequence', actors: ['甲', '乙'], msgs: [['甲', '乙', '这是一条特别特别特别长的消息标签']]};
  assert.ok(lint(seq).some(x => x.includes('跨度')));
});
test('sequence layout puts every message on its own row between the right lifelines', () => {
  const g = layoutSequence({actors: ['甲', '乙', '丙'], msgs: [['甲', '丙', 'x'], ['丙', '乙', 'y'], ['乙', '乙', 'z']]});
  assert.equal(g.msgs.length, 3);
  assert.ok(g.msgs[0].x2 > g.msgs[0].x1 && g.msgs[1].x2 < g.msgs[1].x1);
  assert.ok(g.msgs[1].y > g.msgs[0].y && g.msgs[2].self);
});
