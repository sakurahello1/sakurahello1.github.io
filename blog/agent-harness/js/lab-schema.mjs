import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const samples = [
      ['valid','合法形状和业务'], ['extra','额外字段'], ['type','错误类型'],
      ['quantity','合法形状但违反数量策略'], ['unknown','未知工具'], ['json','破损JSON']];
    const s=select(controls,'选择工具提议',samples);
    button('经过主机校验',controls,()=>{
      let call={type:'function',function:{name:'compute_total',arguments:'{"id":"clay","quantity":1}'}};
      if(s.value==='extra')call.function.arguments='{"id":"clay","quantity":1,"endpoint":"evil"}';
      if(s.value==='type')call.function.arguments='{"id":"clay","quantity":"1"}';
      if(s.value==='quantity')call.function.arguments='{"id":"clay","quantity":999}';
      if(s.value==='unknown')call.function.name='constructor';
      if(s.value==='json')call.function.arguments='{';
      output.textContent='提议：'+JSON.stringify(call)+'\n';
      try{output.textContent+='允许：'+JSON.stringify(dispatch(call));}catch(e){output.textContent+='阻止：'+e.message;}
    });

}
