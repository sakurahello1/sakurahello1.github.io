import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const stages=[['','{'],['{','"quantity"'],['{"quantity"',':'],['{"quantity":','1'],['{"quantity":1','}']];
    let n=0; const prefix=el('p','',view), flow=el('div','',view);flow.className='flow';
    const render=()=>{prefix.textContent='输出前缀：'+stages[n][0]+'  | 解析状态：'+n;
      flow.replaceChildren(); for(const candidate of ['{','"quantity"',':','1','}','DROP']){
        const b=button(candidate,flow,()=>{if(candidate!==stages[n][1]){output.textContent='非法候选被屏蔽；没有发送给模型。';return;}
          if(n<4)n++;else{output.textContent='完成 {"quantity":1}。这只是有限玩具语法；真正递归语法需要栈/解析状态。';n=0;}render();});
        b.classList.toggle('active',candidate===stages[n][1]);}
      output.textContent='高亮为此玩具语法唯一可接受的下一段。候选是字符串片段，不是真实词表token。';};render();
    button('重置',controls,()=>{n=0;render();});

}
