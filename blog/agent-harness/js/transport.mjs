// No telemetry, automatic retries, remote scripts or arbitrary tool execution.
export const SLOT = 'agent-harness:credential:v1';
export function normalizeBase(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
    throw new Error('目的地须为 HTTPS，且不能含用户名、密码、查询或片段');
  return u.href.replace(/\/+$/, '');
}
export class Credentials {
  constructor(session, local, now = Date.now) {
    this.session = session; this.local = local; this.now = now; this.value = null;
  }
  clear() {
    this.value = null;
    for (const s of [this.session, this.local]) try { s.removeItem(SLOT); } catch {}
  }
  save(key, base, mode, minutes = 60) {
    this.clear();
    if (!key || /[\r\n]/.test(key)) throw new Error('请输入有效凭据');
    this.value = {key, base: normalizeBase(base), mode,
      expiresAt: mode === 'device' ? this.now() + minutes * 60000 : null};
    try {
      if (mode === 'tab') this.session.setItem(SLOT, JSON.stringify(this.value));
      if (mode === 'device') this.local.setItem(SLOT, JSON.stringify(this.value));
    } catch { this.value.mode = 'memory'; return false; }
    return true;
  }
  record() {
    let v = this.value;
    if (!v) for (const s of [this.session, this.local]) {
      try { v = JSON.parse(s.getItem(SLOT) || 'null'); } catch { v = null; }
      if (v) break;
    }
    if (!v) return null;
    if (!['memory', 'tab', 'device'].includes(v.mode) || typeof v.key !== 'string' || !v.key || /[\r\n]/.test(v.key) ||
        (v.mode === 'device' && (!Number.isFinite(v.expiresAt) || this.now() >= v.expiresAt))) {
      this.clear(); return null;
    }
    this.value = v; return {...v};
  }
  metadata() {
    const v = this.record();
    if (!v) return null;
    try { return {base: normalizeBase(v.base), mode: v.mode, expiresAt: v.expiresAt}; }
    catch { this.clear(); return null; }
  }
  read(base) {
    const v = this.record();
    return v?.base === normalizeBase(base) ? v : null;
  }
}
export async function readChatStream(response, signal, onText = () => {}) {
  if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`);
  if (!response.body) throw new Error('没有响应流');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', bytes = 0, doneMarker = false, finish = null, usage = null;
  const message = {role: 'assistant', content: '', reasoning_content: ''}, calls = new Map();
  function event(raw) {
    const data = raw.split('\n').filter(s => s.startsWith('data:'))
      .map(s => s.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { doneMarker = true; return; }
    if (doneMarker) throw new Error('终止标记后出现数据');
    let x; try { x = JSON.parse(data); } catch { throw new Error('响应流 JSON 格式错误'); }
    if (x.usage) usage = x.usage;
    const c = x.choices?.[0]; if (!c) return;
    if (c.finish_reason) finish = c.finish_reason;
    const d = c.delta || {};
    if (d.content) { message.content += d.content; onText(d.content); }
    if (d.reasoning_content) message.reasoning_content += d.reasoning_content;
    for (const t of d.tool_calls || []) {
      if (!Number.isInteger(t.index) || t.index < 0 || t.index > 3) throw new Error('工具数量超限');
      const old = calls.get(t.index) || {id: '', type: 'function', function: {name: '', arguments: ''}};
      if (t.id) old.id += t.id;
      if (t.type && t.type !== 'function') throw new Error('未知工具类型');
      old.function.name += t.function?.name || '';
      old.function.arguments += t.function?.arguments || '';
      calls.set(t.index, old);
    }
  }
  try {
    while (true) {
      signal?.throwIfAborted();
      const part = await reader.read();
      if (part.done) { buffer += decoder.decode(); break; }
      bytes += part.value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('响应超过 1 MiB 上限');
      buffer += decoder.decode(part.value, {stream: true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        event(buffer.slice(0, cut)); buffer = buffer.slice(cut + 2);
      }
    }
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.trim()) event(buffer);
    if (!doneMarker || !['stop', 'tool_calls'].includes(finish))
      throw new Error('响应未完整结束（截断、提前断流或无终态）');
    if (calls.size) {
      message.tool_calls = [...calls.entries()].sort((a,b) => a[0]-b[0]).map(x => x[1]);
      if (finish !== 'tool_calls' || message.tool_calls.some(t => !t.id || !t.function.name))
        throw new Error('工具调用不完整');
    } else if (finish === 'tool_calls') throw new Error('缺少工具调用');
    return {message, usage, finish};
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function chat({base, key, model, messages, tools, signal, onText, fetcher = fetch}) {
  const body = JSON.stringify({model, messages, stream: true, max_tokens: 1200,
    stream_options: {include_usage: true},
    thinking: {type: 'disabled'}, ...(tools ? {tools, tool_choice: 'auto'} : {})});
  if (new TextEncoder().encode(body).length > 32768) throw new Error('请求超过 32 KiB');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.throwIfAborted(); signal.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetcher(normalizeBase(base) + '/chat/completions', {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
      cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body});
    return await readChatStream(response, controller.signal, onText);
  } catch (error) {
    if (controller.signal.aborted) throw new DOMException('请求取消或超时', 'AbortError');
    if (error instanceof TypeError) throw new Error('网络或 CORS 失败；不会改用代理');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
