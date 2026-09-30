import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    el('p','确定性查找器能在任意位置找回needle；这不是LLM注意力实验。改变位置、长度，查看实际输入与检索结果。',view);
    const label=el('label','目标位置 %',controls), range=el('input','',label);range.type='range';range.min='0';range.max='100';range.value='50';
    const length=select(controls,'文档行数',[['100','100'],['1000','1000'],['5000','5000']]);
    button('生成并检索',controls,()=>{
      const count=Number(length.value),idx=Math.min(count-1,Math.floor(count*Number(range.value)/100));
      const rows=Array.from({length:count},(_,i)=>`k${i}=distractor`);rows[idx]='needle=project_clay';
      const t=performance.now(),found=rows.findIndex(s=>s.startsWith('needle='));
      output.textContent=`输入 ${count} 行，位置 ${idx}；精确检索命中 ${found}，耗时 ${(performance.now()-t).toFixed(2)}ms。\nLLM有效窗口需另做重复调用、任务分层和置信区间；这里没有U形实测曲线。`;
    });

}
