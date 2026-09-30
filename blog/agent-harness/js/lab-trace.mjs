import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const timeline=[['0ms','点击保存','DOM显示处理中','DB旧值'],['100ms','请求发送','HTTP等待','DB旧值'],['300ms','错误被吞','toast: 保存成功','HTTP500 / DB旧值'],['500ms','刷新页面','旧内容重新出现','DB旧值']];
    const l=el('label','审计时间点',controls),r=el('input','',l);r.type='range';r.min='0';r.max='3';r.value='0';
    const tracks=el('div','',view);tracks.className='flow';
    const render=()=>{tracks.replaceChildren();timeline[Number(r.value)].forEach((text,i)=>el('span',text,tracks).classList.toggle('active',i===Number(r.value)%4));
      output.textContent=timeline[Number(r.value)].join('\n')+'\n只查看记录，不重新执行任何动作。';};r.addEventListener('input',render);render();

}
