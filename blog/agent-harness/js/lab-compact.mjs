import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const mode=select(controls,'交接策略',[['truncate','只留最近日志'],['summary','自然语言摘要'],['checkpoint','结构化交接'],['retrieve','交接 + 原记录检索']]);
    const flow=el('div','',view);flow.className='flow';
    button('压缩并恢复',controls,()=>{
      flow.replaceChildren();
      const retained={truncate:['冗余日志×80'],summary:['性价比高 / 交付快'],
        checkpoint:['预算7600','禁止实际下单','交期10月5日','原文索引'],
        retrieve:['预算7600','禁止实际下单','交期10月5日','quote-clay-v2 → 7480元 / 10月3日']};
      retained[mode.value].forEach(t=>el('span',t,flow).className='active');
      el('span','磁盘原记录：独立于当前窗口',flow);
      const x={truncate:'窗口：冗余日志。丢失预算/授权/交期，不能可靠继续。',summary:'窗口：挑选性价比高、交付快的电脑。原始约束已损失；具体预算未知。',
        checkpoint:'窗口：Goal/Constraints/State/Evidence。预算7600、禁止下单、截止10月5日保留。精确报价仍需原文。',
        retrieve:'窗口：结构化交接 + quote-clay-v2。取回价格6800、税10%、交期10月3日，总价7480。'};
      output.textContent=x[mode.value]+'\n模拟结果由固定场景决定；未测任何模型压缩准确率。';
    });

}
