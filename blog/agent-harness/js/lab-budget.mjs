import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const l=el('label','并行人数',controls),n=el('input','',l);n.type='range';n.min='1';n.max='8';n.value='2';
    const dep=select(controls,'任务依赖',[['0','可分解'],['1','强顺序']]);
    const bars=el('div','',view);bars.className='bars';
    function draw(){const count=Number(n.value),tax=Math.min(85,(count-1)*9),work=100-tax-10;
      bars.replaceChildren();for(const [label,value] of [['解题',work],['通信',tax],['验证',10]]){const b=el('div','',bars);b.style.height=value+'%';el('span',`${label} ${value}`,b);}
      output.textContent=`固定100格教学预算：${work}解题 + ${tax}通信 + 10验证。\n示意墙钟 ${(dep.value==='1'?100:100/count+tax/3).toFixed(1)} 单位；没有输出成功率，不能复制论文数值。`;}
    n.addEventListener('input',draw);dep.addEventListener('change',draw);draw();

}
