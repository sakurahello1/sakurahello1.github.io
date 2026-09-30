import {el,button,select,setup} from './lab-ui.mjs';
import {dispatch} from './fixture.mjs';
export function mount(root,kind,host){
const {controls,view,output}=setup(root);
    const defect=select(controls,'缺陷',[['memory','内存假保存'],['cover','按钮被遮挡'],['wrong','写入错用户'],['slow','保存超时']]);
    const evidence=select(controls,'验证手段',[['claim','只读完成声明'],['image','静态截图'],['interaction','交互 + 刷新'],['state','交互 + 持久状态 + trace']]);
    const display=el('div','',view);display.className='flow';
    let ui='旧内容',db='旧内容',trace='尚未保存';
    function show(){display.replaceChildren();el('span','界面：'+ui,display);el('span','持久层：'+db,display);el('span','trace：'+trace,display);}
    button('保存演示条目',controls,()=>{ui='新内容 / toast成功';db=defect.value==='memory'?'旧内容':defect.value==='wrong'?'写入用户B':defect.value==='slow'?'等待中':'新内容';trace=defect.value==='slow'?'超过deadline':defect.value==='cover'?'按钮被遮挡，脚本强制演示保存':'请求返回';show();});
    button('重新打开',controls,()=>{ui=db==='新内容'?'新内容':'旧内容';show();});show();
    button('验收',controls,()=>{
      const detected={claim:[],image:['cover'],interaction:['cover','memory'],state:['memory','cover','wrong','slow']};
      const bad=detected[evidence.value].includes(defect.value);
      output.textContent=(bad?'FAIL：证据识别到缺陷':'INSUFFICIENT：该证据无法排除此缺陷')+'\n没有证据不能换成PASS；此表为预置故障模型，不代表真实评估器测量。';
    });

}
