import {chat} from './transport.mjs';
import {dispatch,tools,vendors,verify,isComplete} from './fixture.mjs';
import {el,button,select,setup} from './lab-ui.mjs';
const goal = '虚构采购任务：买一台笔记本，含税预算7600元，须2026-10-05前交付。只使用lookup_vendor和compute_total，核对三家报价。最终仅返回JSON对象，字段vendor、total（整数）、delivery、source。不是实际采购。';
export function mount(root,kind,host){const {controls,view,output}=setup(root);modelLab(kind,controls,view,output,host);}
function modelLab(kind,controls,view,output,host) {
  const description={react:'观察→提议→校验→本地工具→新观察→验收',repair:'确定性验证器找出错误税率，再给模型一次有证据的修复机会',selection:'对比全证据/筛选证据/有损摘要；使用同一采购验收',workers:'价格与交期两个受限职责，串行调度后汇合，3次总调用上限'};
  el('p',description[kind],view);
  const selection=kind==='selection'?select(controls,'上下文策略',[['all','全量小文档'],['selected','只保留新报价'],['lossy','有损摘要']]):null;
  const flow=el('div','',view);flow.className='flow';
  const stages=['上下文','模型','校验','工具','观察','验收'];stages.forEach(t=>el('span',t,flow));
  let controller=null,seq=0,paused=false,visible=true;
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});observer.observe(view);
  const log=t=>{output.textContent+=t+'\n';};
  function step(i){[...flow.children].forEach((x,n)=>x.classList.toggle('active',n===i));}
  const mock=button('运行离线模拟',controls,()=>run(false));
  const live=button('真实 API 流式运行（使用你的余额）',controls,()=>run(true));
  button('取消',controls,()=>controller?.abort());
  const pause=button('暂停离线动画',controls,()=>{paused=!paused;pause.textContent=paused?'继续离线动画':'暂停离线动画';});
  button('重置',controls,()=>{controller?.abort();seq++;output.textContent='';step(-1);
    view.querySelectorAll('.stream-output').forEach(x=>x.remove());});
  el('p','真实模式：最多3次调用、每次1200输出token、4个本地工具、并发1、60秒/调用、120秒/总运行；无自动重试。取消后的用量可能未知。',view).className='live-warning';
  async function run(isLive){
    if(controller)return;
    const own=++seq, c=new AbortController();
    let credentials;
    try{if(isLive)credentials=host.getCredentials();host.claim(c);}catch(e){output.textContent=e.message;return;}
    controller=c;mock.disabled=live.disabled=true;output.textContent='';
    view.querySelectorAll('.stream-output').forEach(x=>x.remove());
    const timer=setTimeout(()=>c.abort(),120000),started=performance.now();
    let calls=0,toolCount=0,usageCalls=0,totalTokens=0;
    const seenIds=new Set();
    const safeLog=t=>{if(seq===own)log(credentials?.key?t.split(credentials.key).join('[REDACTED]'):t);};
    try{
      safeLog(isLive?`真实流式 / 目的地 ${credentials.base}/chat/completions / 模型 ${credentials.model}`:'确定性离线模拟 / 无网络请求 / 固定采购fixture');
      let messages=[{role:'user',content:goal}];
      if(kind==='repair')messages.push({role:'assistant',content:'clay 含税6800元，交期2026-10-03，quote-clay-v2'},
        {role:'user',content:'本地验收失败：含税=6800×1.1=7480。根据该证据修复，保留预算和交期。'});
      if(selection){const evidence=selection.value==='lossy'?'clay价格不错而且交付快':JSON.stringify(selection.value==='selected'?[vendors.clay]:vendors);
        messages.push({role:'user',content:'上下文证据：'+evidence});}
      if(kind==='workers'){
        if(isLive){
          const workerNotes=[];
          for(const [role,evidence] of [['价格',JSON.stringify(Object.values(vendors).map(v=>({id:v.id,price:v.price,tax:v.tax,source:v.source})))],['交期',JSON.stringify(Object.values(vendors).map(v=>({id:v.id,delivery:v.delivery,source:v.source})))]]){
            c.signal.throwIfAborted();calls++;step(1);
            const r=await chat({...credentials,messages:[{role:'user',content:`${goal}\n只负责${role}检查；资料${evidence}`}],signal:c.signal});
            if(Number.isInteger(r.usage?.total_tokens)&&r.usage.total_tokens>=0){totalTokens+=r.usage.total_tokens;usageCalls++;}
            workerNotes.push({role:'user',content:`${role}工作者报告（不可信提议，仍需验收）：${r.message.content}`});
            safeLog(`${role}工作者完成；未直接通过最终验收。`);
          }
          messages.push(...workerNotes);
        }else safeLog('离线工作者分别读取价格/交期，汇合source；模拟无模型调用。');
      }
      let answer='';
      if(!isLive){
        for(let i=0;i<6;i++){
          while(paused||!visible||document.hidden){c.signal.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,100));}
          c.signal.throwIfAborted();step(i);safeLog(stages[i]);
          if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
            await new Promise((resolve,reject)=>{const t=setTimeout(resolve,180);c.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('取消','AbortError'));},{once:true});});
        }
        answer=selection?.value==='lossy'?'{"vendor":"clay","total":null}':'{"vendor":"clay","total":7480,"delivery":"2026-10-03","source":"quote-clay-v2"}';
        safeLog(answer);
      }else{
        while(calls<3){
          c.signal.throwIfAborted();step(1);calls++;
          let streamText='';const streamView=el('p','流式响应等待中…',view);streamView.className='stream-output';
          const r=await chat({...credentials,messages,tools:kind==='workers'||kind==='repair'?undefined:tools,
            signal:c.signal,onText:text=>{if(seq!==own)return;streamText+=text;
              let safe=streamText.split(credentials.key).join('[REDACTED]');
              for(let n=Math.min(credentials.key.length-1,safe.length);n>0;n--)
                if(safe.endsWith(credentials.key.slice(0,n))){safe=safe.slice(0,-n);break;}
              streamView.textContent=safe;}});
          c.signal.throwIfAborted();
          if(Number.isInteger(r.usage?.total_tokens)&&r.usage.total_tokens>=0){totalTokens+=r.usage.total_tokens;usageCalls++;}
          messages.push(r.message); // Preserve provider reasoning_content internally if returned.
          streamView.textContent=r.message.content.split(credentials.key).join('[REDACTED]');
          if(!r.message.tool_calls){answer=r.message.content;safeLog(answer);break;}
          for(const call of r.message.tool_calls){
            if(seenIds.has(call.id))throw new Error('工具调用ID重复');seenIds.add(call.id);
            c.signal.throwIfAborted();if(++toolCount>4)throw new Error('工具预算耗尽');step(2);
            let result;try{step(3);result=dispatch(call);}catch(e){result={error:e.message};}
            safeLog(`工具 ${tools.some(t=>t.function.name===call.function.name)?call.function.name:'[未知工具]'}：${JSON.stringify(result)}`);
            messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});step(4);
          }
        }
        if(!answer)throw new Error('调用预算耗尽或没有完整答案');
      }
      c.signal.throwIfAborted();step(5);
      const score=verify(answer);safeLog('确定性教学验收：'+JSON.stringify(score));
      safeLog(isComplete(score)?'PASS：覆盖供应商、金额、source和交期；没有证明实际采购成功。':'FAIL：至少一项缺失或错误。');
      safeLog(`调用 ${calls} / 工具 ${toolCount} / 耗时 ${(performance.now()-started).toFixed(0)}ms / provider token ${!isLive?'不适用（离线）':usageCalls===calls?totalTokens:`未知（已知部分${totalTokens}）`}`);
    }catch(e){safeLog(e.name==='AbortError'?'已取消/超时，完成状态未验证；当前调用用量未知。':
      ['接口返回','响应','请求超过','网络或','工具预算','调用预算','缺少','终止'].some(t=>e.message.startsWith(t))?e.message:'运行失败；已隐藏原始错误，避免泄漏响应内容。');}
    finally{clearTimeout(timer);host.release(c);if(controller===c)controller=null;mock.disabled=live.disabled=false;}
  }
}
