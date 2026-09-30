import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const query=select(controls,'查询',[['keyword','Clay报价'],['relation','谁拥有供应商所属项目？'],['fresh','最新交期']]);
    const index=select(controls,'检索方式',[['grep','关键词'],['graph','关系遍历'],['sql','时间/字段过滤']]);
    button('检索证据',controls,()=>{
      const results={keyword:{grep:'quote-clay-v1、quote-clay-v2；必须再按版本核验',graph:'vendor:clay → quotes；同样必须选有效版本',sql:'SELECT * WHERE vendor=clay ORDER BY updated DESC'},
        relation:{grep:'未直接命中；需要别名/多次查询',graph:'clay → project_ink → owner_hao；两个边均须来源',sql:'JOIN vendor_project、project_owner；结构化关系也可SQL表达'},
        fresh:{grep:'旧新版本都返回，不能盲信第一条',graph:'关系可携带有效区间，图本身不保证时效',sql:'quote-clay-v2：2026-10-03，按updated和valid_until选择'}};
      output.textContent=results[query.value][index.value]+'\n这些是固定教学检索路径；没有证明某数据库普遍更优。';
    });

}
