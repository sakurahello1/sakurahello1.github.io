import test from 'node:test';
import assert from 'node:assert/strict';
import {Credentials, SLOT, normalizeBase, readChatStream, chat} from '../blog/agent-harness/js/transport.mjs';
import {dispatch, verify} from '../blog/agent-harness/js/fixture.mjs';
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
  assert.equal(v.read('https://other.example'),null);assert.equal(session.getItem(SLOT),undefined);
  v.save(sentinel,'https://api.deepseek.com','device',15);now+=900001;assert.equal(v.read('https://api.deepseek.com'),null);assert.equal(local.getItem(SLOT),undefined);
});
test('blocked storage falls back to memory; malformed expiry rejects',()=>{
  const bad={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
  const v=new Credentials(bad,bad);assert.equal(v.save(sentinel,'https://api.deepseek.com','tab'),false);
  assert.equal(v.read('https://api.deepseek.com').mode,'memory');
});
test('destinations and schema reject spoofing, unknown tool, extra fields, bad ranges',()=>{
  for(const url of ['http://localhost','https://user@host','https://host?key=x','https://host#x'])assert.throws(()=>normalizeBase(url));
  for(const [name,args] of [['constructor','{}'],['lookup_vendor','{"id":"__proto__"}'],
    ['lookup_vendor','{"id":"clay","extra":1}'],['compute_total','{"id":"clay","quantity":999}']])
    assert.throws(()=>dispatch({type:'function',function:{name,arguments:args}}));
  assert.equal(verify('{}').vendor,false);assert.equal(verify('clay 7480 quote-clay-v2').parse,false);
});
test('native fetch uses bound endpoint, abort signal, no redirects, no retries',async()=>{
  const c=new AbortController();let calls=0;
  const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');
    assert.equal(JSON.parse(init.body).max_tokens,1200);return response(stream);};
  await chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher});
  assert.equal(calls,1);c.abort();await assert.rejects(chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher}));
});
test('abort propagates after headers, CORS safe error',async()=>{
  const c=new AbortController();const pending=new ReadableStream({start(controller){c.signal.addEventListener('abort',()=>controller.error(new DOMException('Abort','AbortError')));}});
  const p=chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:c.signal,fetcher:async()=>new Response(pending)});
  setTimeout(()=>c.abort(),10);await assert.rejects(p);
  await assert.rejects(chat({base:'https://api.deepseek.com',key:sentinel,model:'deepseek-flash',messages:[],signal:new AbortController().signal,fetcher:async()=>{throw new TypeError(sentinel);}}),/网络或 CORS/);
});
