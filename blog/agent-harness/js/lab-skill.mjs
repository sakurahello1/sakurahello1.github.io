import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    let n=0; const stages=['metadata: CSV质检，适用于表格缺失/重复/范围检查（约30个字符）','SKILL.md: 先确认字段→校验schema→统计错误→生成报告→重新打开（约60个字符）','scripts/validate.py: 确定性检查；执行前检查依赖与权限（约40个字符）'];
    button('按需加载下一层',controls,()=>{if(n<3){el('p',stages[n++],view);output.textContent=`已加载 ${n}/3 层；字符数仅用于教学，不冒充模型token。`;}else output.textContent='已全部加载；更多上下文不自动提升能力。';});
    button('重置',controls,()=>{n=0;view.replaceChildren();output.textContent='';});

}
