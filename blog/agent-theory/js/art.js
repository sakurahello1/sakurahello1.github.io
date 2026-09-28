/* Agent handbook plates. Shared Reel owns DPR, visibility and reduced-motion frames.
   Every frame is a pure function of time: scrubbing/resizing does not alter the process.
   Numbers are illustrative process counters, never empirical measurements. */
(() => {
  'use strict';
  const R = window.Reel;
  if (!R) return;
  const D = JSON.parse(document.getElementById('theory-data').textContent);
  const INK = '#141413', CLAY = '#D97757', CREAM = '#EDE8DE', WHITE = '#FAF8F3';
  const TAU = Math.PI * 2, pad = (v, n=3) => String(v).padStart(n, '0');
  const mix = (a,b,u) => a+(b-a)*u, smooth = u => u*u*(3-2*u);
  function text(c, s, x, y, color, size=11, align='left') {
    const runs=String(s).split(/([βμρωπ])/u), mono=`500 ${size}px "JetBrains Mono", Consolas, monospace`;
    const greek=`500 ${size}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    const widths=runs.map(v=>{c.font=/^[βμρωπ]$/u.test(v)?greek:mono;return c.measureText(v).width;});
    const total=widths.reduce((a,b)=>a+b,0);
    let px=x-(align==='center'?total/2:align==='right'?total:0);
    c.fillStyle=color;c.textAlign='left';c.textBaseline='middle';
    runs.forEach((v,i)=>{c.font=/^[βμρωπ]$/u.test(v)?greek:mono;c.fillText(v,px,y);px+=widths[i];});
  }
  function big(c,s,x,y,size,color,align='left',alpha=1){
    c.save();c.globalAlpha=alpha;c.fillStyle=color;c.font=`700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y);c.restore();
  }
  function line(c,a,b,color,dash=false,width=2) {
    c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash?[5,6]:[]);
    c.moveTo(...a);c.lineTo(...b);c.stroke();c.setLineDash([]);
  }
  function shape(c,x,y,size,m,color){R.drawShape(c,x,y,size,m,0,color,false);}
  function ring(c,x,y,rx,ry,color,dash=false,width=2){
    c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash?[5,6]:[]);
    c.ellipse(x,y,rx,ry,0,0,TAU);c.stroke();c.setLineDash([]);
  }
  function box(c,x,y,w,h,color,width=2,dash=false){
    c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash?[5,6]:[]);c.strokeRect(x,y,w,h);c.setLineDash([]);
  }
  function place(c,a,b,u,size,m,color){shape(c,mix(a[0],b[0],u),mix(a[1],b[1],u),size,m,color);}
  function orbit(cx,cy,rx,ry,a){return [cx+rx*Math.cos(a),cy+ry*Math.sin(a)];}
  function arcTrail(c,cx,cy,rx,ry,a,n,color){
    for(let j=n;j>=1;j--){const q=orbit(cx,cy,rx,ry,a-j*.10);c.save();c.globalAlpha=(n-j+1)/(n+1)*.7;shape(c,q[0],q[1],4+(n-j)*1.4,2,color);c.restore();}
  }
  function register(name, dark, label, fn) {
    R.cover('at-'+name,(c,W,H,t) => {
      c.clearRect(0,0,W,H); c.save();
      const mobile=W<550, fg=dark?CREAM:INK, muted=dark?'rgba(237,232,222,.38)':'rgba(20,20,19,.32)';
      const p={W,H,t,mobile,dark,fg,muted,pad:mobile?16:26,top:mobile?78:64,bottom:H-24};
      p.w=W-2*p.pad; p.h=p.bottom-p.top;
      if (name!=='tail') text(c,label,p.pad,22,fg,10);
      const read=fn(c,p);
      if(read) {
        const rows=mobile?read.split(' · '):[read];
        rows.forEach((s,i)=>text(c,s,mobile?p.pad:W-p.pad,mobile?42+i*14:22,fg,10,mobile?'left':'right'));
      }
      c.restore();
    });
  }
  register('frontis',true,'FIG. 00 / THREE CLOCKS',(c,p)=>{
    const {W,H,t,fg,muted}=p,delta=Math.floor(t*3),step=412+delta,task=17+Math.floor(delta/12),ver=3+Math.floor(delta/48);
    const cx=W*.5,cy=H*.54,rx=W*.465,ry=Math.min(H*.415,W*.39),mobile=p.mobile;
    const pulse=(delta%48===0?Math.max(0,1-(t*3%48))*.28:0);
    const grid=mobile?29:35;
    for(let y=grid*.5;y<H;y+=grid)for(let x=grid*.5;x<W;x+=grid){
      const d=Math.hypot((x-cx)/rx,(y-cy)/ry),a=.07+.08*(1+Math.sin(t*2+x*.035+y*.045))/2+pulse;
      if(d<1.25){c.save();c.globalAlpha=a;shape(c,x,y,mobile?3:4,delta%48<2?1:0,CREAM);c.restore();}
    }
    const tracks=[[1,1],[.70,.74],[.39,.47]];
    tracks.forEach(([kx,ky],i)=>ring(c,cx,cy,rx*kx,ry*ky,muted,i===0,mobile?2:3));
    for(let i=0;i<24;i++){
      const a=-Math.PI/2+i/24*TAU,q=orbit(cx,cy,rx*.70,ry*.74,a);
      shape(c,q[0],q[1],i<task%24?(mobile?7:11):(mobile?3:5),1,i<task%24?CLAY:CREAM);
    }
    const aStep=-Math.PI/2+(t*3/12)*TAU,aTask=-Math.PI/2+(task%24+(delta%12)/12)/24*TAU;
    const aVer=-Math.PI/2+(ver%12)/12*TAU;
    arcTrail(c,cx,cy,rx*.39,ry*.47,aStep,mobile?7:12,CREAM);
    [[aVer,1,1,0],[aTask,.70,.74,1],[aStep,.39,.47,2]].forEach(([a,kx,ky,m])=>{
      const q=orbit(cx,cy,rx*kx,ry*ky,a);shape(c,q[0],q[1],mobile?17:27,m,WHITE);
    });
    shape(c,cx,cy,mobile?28:44,3,CLAY);
    text(c,'STEP',cx,cy+ry*.47+18,fg,10,'center');
    text(c,'TASK',cx,cy+ry*.74+18,fg,10,'center');
    text(c,'VERSION',cx,Math.min(H-15,cy+ry+18),fg,10,'center');
    return `STEP ${pad(step,4)} · TASK ${pad(task)} · VERSION ${ver}`;
  });
  register('governor',false,'PLATE I / STEP LOOP',(c,p)=>{
    const {W,t,fg,muted}=p,x=W*(p.mobile?.34:.38),y=p.top+p.h*.52,rx=W*(p.mobile?.265:.28),ry=p.h*.43;
    const names=['s','π','a','ENV','o','u','s′'];
    const pts=names.map((_,i)=>[x+rx*Math.cos(-Math.PI/2+i/7*TAU),y+ry*Math.sin(-Math.PI/2+i/7*TAU)]);
    pts.forEach((a,i)=>{
      line(c,a,pts[(i+1)%7],muted,false,p.mobile?1.8:2.5);
      shape(c,...a,p.mobile?22:35,i%4,fg);
      const dx=a[0]-x,dy=a[1]-y,len=Math.hypot(dx,dy)||1;
      text(c,names[i],a[0]+dx/len*(p.mobile?22:31),a[1]+dy/len*(p.mobile?22:31),fg,p.mobile?10:12,'center');
    });
    const u=t*1.2%7,k=Math.floor(u),q=u-k;
    place(c,pts[k],pts[(k+1)%7],q,p.mobile?15:20,2,WHITE);
    const sz=Math.min(p.mobile?22:31,(p.h-10)/9),gap=sz+3,sx=W*(p.mobile?.73:.76),sy=p.top+(p.h-8*gap)/2;
    for(let i=0;i<24;i++){
      const tx=sx+(i%3)*gap,ty=sy+Math.floor(i/3)*gap;
      c.save();c.globalAlpha=.5+.5*((i+Math.floor(t))%5/4);
      shape(c,tx+sz/2,ty+sz/2,sz*.76,1,fg);c.restore();
      if(k===5&&i===Math.floor(t*2)%24)shape(c,tx+sz/2,ty+sz/2,sz*.78,1,WHITE);
    }
    box(c,sx-5,sy+2*gap-5,3*gap+3,3*gap+3,fg,1.5,true);
    text(c,'CONTEXT 9/24',sx,sy-18,fg,p.mobile?8:10);
    return `STEP ${pad(Math.floor(t*1.2/7),4)} · CONTEXT 9/24`;
  });
  register('memory',true,'PLATE II / MEMORY BANK',(c,p)=>{
    const {t,fg,muted}=p,cols=p.mobile?8:12,rows=4,left=p.pad+(p.mobile?39:68),top=p.top+12;
    const cw=(p.W-left-p.pad-5)/cols,ch=(p.h-29)/rows,tick=Math.floor(t*1.25),phase=t*1.25-tick;
    const selected=Array.from({length:4},(_,j)=>(tick*7+j*11)%(cols*rows));
    ['RUN','TASK','TEAM','GLOBAL'].forEach((v,r)=>text(c,v,left-9,top+(r+.5)*ch,fg,p.mobile?8:10,'right'));
    for(let i=0;i<cols*rows;i++){
      const col=i%cols,row=Math.floor(i/cols),age=(tick*3-i+144)%29;
      const strength=Math.max(0,1-age/34),centerX=left+(col+.5)*cw,centerY=top+(row+.5)*ch;
      const size=Math.min(cw,ch)*(p.mobile?.72:.70)*strength;
      if(size<5)continue;
      shape(c,centerX,centerY,size,i%4,fg);
      if(selected.includes(i))ring(c,centerX,centerY,size*.69,size*.69,CLAY,false,2);
      if(i===tick%(cols*rows))shape(c,centerX,centerY,size,1,WHITE);
      if(tick%4===3&&i===(tick+1)%(cols*rows)){
        const u=smooth(phase),to=left+(((i+1)%cols)+.5)*cw;
        shape(c,mix(centerX,to,u),centerY,size*.48,1,CLAY);
      }
    }
    const scanX=left+phase*cols*cw;
    line(c,[scanX,top-7],[scanX,top+rows*ch+5],muted,false,2.5);
    text(c,'WRITE  /  MERGE  /  DECAY  /  RECALL',left,top+rows*ch+17,fg,p.mobile?7:10);
    return `WRITE ${tick-Math.floor(tick/4)} · MERGE ${Math.floor(tick/4)} · RECALL k=4`;
  });
  register('skills',false,'PLATE III / OPTION STACK',(c,p)=>{
    const {t,fg,muted}=p,phase=Math.floor((t+5)%8),depths=[1,2,3,3,4,3,2,1],depth=depths[phase];
    const beta=phase>=5?.92:.12,libraryY=p.top+10,libraryH=p.mobile?38:65;
    const cardW=(p.w-6*7)/7;
    for(let i=0;i<7;i++){
      const x=p.pad+i*(cardW+7),selected=i===(phase+2)%7;
      box(c,x,libraryY,cardW,libraryH,muted,1.5);
      if(selected){c.fillStyle=WHITE;c.fillRect(x+2,libraryY+2,cardW-4,libraryH-4);}
      shape(c,x+cardW/2,libraryY+libraryH/2,Math.min(cardW,libraryH)*(p.mobile?.56:.53),i%4,fg);
    }
    const gap=p.mobile?4:9,stackTop=libraryY+libraryH+(p.mobile?22:40);
    const bh=Math.min(p.mobile?40:62,(p.bottom-stackTop-8-3*gap)/4),x=p.pad+p.w*.21,bw=p.w*.73;
    big(c,'μ',p.pad,stackTop+bh*.4,p.mobile?26:42,fg);
    for(let i=0;i<4;i++){
      const y=stackTop+i*(bh+gap),active=i<depth,top=i===depth-1;
      box(c,x,y,bw,bh,muted,1.5,true);
      if(!active)continue;
      c.fillStyle=top?CLAY:INK;c.fillRect(x,y,bw,bh);
      text(c,p.mobile?['I','π','β','CHILD'][i]:['INITIATION  I','POLICY  π','TERMINATION  β','CHILD OPTION'][i],x+10,y+bh*.42,CREAM,p.mobile?9:12);
      const progress=top?beta:i*.18+.22;
      c.fillStyle=CREAM;c.fillRect(x+bw*.69,y+bh*.72,bw*.27*progress,p.mobile?2:4);
      line(c,[x+bw*.69,y+bh*.72],[x+bw*.97,y+bh*.72],CREAM,false,1);
    }
    if(phase===3){const sx=p.pad+((phase+2)%7)*(cardW+7)+cardW/2;shape(c,sx,stackTop-9,p.mobile?20:30,2,WHITE);}
    if(phase===5)shape(c,x+bw*.5,stackTop-bh*.18,Math.min(bh,38),1,CLAY);
    return `DEPTH ${depth} · β ${beta.toFixed(2)}`;
  });
  register('teams',false,'PLATE IV / LOCAL VIEWS',(c,p)=>{
    const {t,fg,muted}=p, phase=Math.floor(t/4)%4,u=smooth(Math.min(1,t%4)),names=['STAR','CHAIN','TREE','MESH'];
    const layouts=[[[.5,.5],[.15,.22],[.85,.22],[.15,.8],[.85,.8],[.5,.08]],[[.1,.65],[.26,.35],[.42,.65],[.58,.35],[.74,.65],[.9,.35]],[[.5,.1],[.25,.45],[.75,.45],[.12,.82],[.4,.82],[.83,.82]],[[.2,.22],[.5,.12],[.8,.22],[.2,.78],[.5,.88],[.8,.78]]];
    const edges=[[[0,1],[0,2],[0,3],[0,4],[0,5]],[[0,1],[1,2],[2,3],[3,4],[4,5]],[[0,1],[0,2],[1,3],[1,4],[2,5]],[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[0,4],[1,4],[2,4]]][phase];
    const top=p.top+(p.mobile?22:38),height=p.h-(p.mobile?48:76);
    const pts=layouts[phase].map((b,i)=>{const a=layouts[(phase+3)%4][i];return[p.pad+mix(a[0],b[0],u)*p.w,top+mix(a[1],b[1],u)*height];});
    edges.forEach(([i,j],k)=>{line(c,pts[i],pts[j],muted,false,p.mobile?1.8:2.3);const v=(t*.72+k*.21)%1;shape(c,mix(pts[i][0],pts[j][0],v),mix(pts[i][1],pts[j][1],v),p.mobile?8:12,2,WHITE);});
    pts.forEach((a,i)=>{ring(c,...a,p.mobile?24:44,p.mobile?24:44,muted,true);shape(c,...a,p.mobile?22:38,i%4,i===0?WHITE:fg);text(c,'A'+i,a[0],a[1]+(p.mobile?23:38),fg,p.mobile?8:10,'center');});
    big(c,names[phase],p.pad+8,p.bottom-(p.mobile?2:4),p.mobile?24:46,fg);
    return `TOPOLOGY ${names[phase]} · ${pts.length} AGENTS · ${Math.floor(t*.6)*edges.length} MSGS`;
  });
  const pairs=D.plate_pairs;
  function conflict(a,b) {return a.r.some(v=>b.w.includes(v))||a.w.some(v=>b.r.includes(v)||b.w.includes(v));}
  register('mechanisms',true,'PLATE V / COMMUTATIVITY',(c,p)=>{
    const {t,fg,muted}=p,cell=Math.min((p.w*.65)/6,(p.h-16)/6),x=p.pad+4,y=p.top+4, tick=Math.floor(t*5)%36;
    for(let i=0;i<6;i++)for(let j=0;j<6;j++){
      const n=i*6+j,bad=conflict(pairs[i],pairs[j]),xx=x+j*cell+2,yy=y+i*cell+2,s=cell-4;
      if(n<=tick){c.fillStyle=n===tick?WHITE:bad?CLAY:WHITE;c.fillRect(xx,yy,s,s);}
      else shape(c,xx+s/2,yy+s/2,Math.max(5,s*.18),0,CREAM);
      if(n<tick&&bad)line(c,[xx+s*.26,yy+s*.26],[xx+s*.74,yy+s*.74],INK,false,p.mobile?1.5:2);
    }
    const i=Math.floor(tick/6),j=tick%6;
    box(c,x-1,y+i*cell,cell*6+3,cell,CREAM,1.5);
    box(c,x+j*cell,y-1,cell,cell*6+3,CREAM,1.5);
    const sx=x+6*cell+(p.mobile?9:25),sz=Math.min((p.W-sx-p.pad)/3,cell*.9);
    for(let k=0;k<18;k++)shape(c,sx+(k%3)*sz+sz/2,y+Math.floor(k/3)*sz+sz/2,Math.max(9,sz*.57),k%4,k<Math.floor(tick/2)?WHITE:fg);
    text(c,'18 CLUSTERS',sx,y+6*sz+12,fg,p.mobile?7:10);
    return `PAIR (${i+1},${j+1}) · ${conflict(pairs[i],pairs[j])?'CONFLICT / ORDER':'R∩W = ∅ / COMMUTE'}`;
  });
  register('experiments',false,'PLATE VI / FACTORIAL DESIGN',(c,p)=>{
    const {t,fg,muted}=p,design=Math.floor(t/5)%4,names=['SCREEN','LEAVE ONE','PAIRWISE','FULL'];
    const gray=['00','01','11','10'],all=gray.flatMap(r=>gray.map(c=>r+c));
    const picks=all.filter(b=>{const n=[...b].filter(v=>v==='1').length;return design===0?n<=1||n===4:design===1?n>=3:design===2?n<=2:true;});
    const cell=Math.min(p.w*.71/4,(p.h-40)/4),x=p.pad+3,y=p.top+7;
    all.forEach((b,i)=>{const xx=x+i%4*cell,yy=y+Math.floor(i/4)*cell,on=picks.includes(b),running=i===Math.floor(t*5)%16;
      box(c,xx+2,yy+2,cell-4,cell-4,fg,1.5);
      if(on){c.fillStyle=WHITE;c.fillRect(xx+4,yy+4,cell-8,cell-8);}
      text(c,b,xx+cell/2,yy+cell/2,INK,p.mobile?8:12,'center');
      if(running){line(c,[xx+cell*.24,yy+cell*.24],[xx+cell*.76,yy+cell*.76],INK,false,2);line(c,[xx+cell*.76,yy+cell*.24],[xx+cell*.24,yy+cell*.76],INK,false,2);}
    });
    const bx=x+cell*4+(p.mobile?8:24),bh=cell*4,bw=p.mobile?12:28;
    box(c,bx,y,bw,bh,fg,2);c.fillStyle=fg;c.fillRect(bx,y+bh*(1-picks.length/16),bw,bh*picks.length/16);
    for(let i=0;i<=4;i++)line(c,[bx+bw+2,y+i*bh/4],[bx+bw+7,y+i*bh/4],fg,false,1.5);
    big(c,names[design],x,y+cell*4+20,p.mobile?18:29,fg);
    return `DESIGN ${names[design]} · RUNS ${picks.length}`;
  });
  register('implementation',true,'PLATE VII / EVENT COMMIT',(c,p)=>{
    const {t,fg,muted}=p, names=['RECEIVE','PROPOSE','VALIDATE','COMMIT','SCHEDULE'],step=t%6,round=Math.floor(t/6),reject=round%4===3;
    const xs=names.map((_,i)=>p.pad+22+(p.w-44)*i/4),y=p.top+p.h*.40;
    xs.forEach((x,i)=>{if(i<4)line(c,[x,y],[xs[i+1],y],muted,false,p.mobile?2:3);shape(c,x,y,p.mobile?23:43,i%4,fg);text(c,p.mobile?['RX','PLAN','CHECK','SAVE','NEXT'][i]:names[i],x,y+(p.mobile?23:36),fg,p.mobile?8:12,'center');});
    const rejectY=y+p.h*.34;
    line(c,[xs[2],y],[xs[2],rejectY],CLAY,true,2);line(c,[xs[2],rejectY],[xs[1],rejectY],CLAY,true,2);text(c,'REJECT',xs[1],rejectY+15,CLAY,p.mobile?8:10);
    if(reject&&step>=2){const u=Math.min(1,(step-2)/2);shape(c,mix(xs[2],xs[1],u),mix(y,rejectY,Math.min(1,u*2)),p.mobile?13:21,2,CLAY);}
    else {for(let i=0;i<7;i++){const q=(step*.8+i*.53)%4,k=Math.min(3,Math.floor(q)),u=q-k;shape(c,mix(xs[k],xs[k+1],u),y-(i%2)*8,p.mobile?8:13,2,WHITE);}}
    const diamondGap=p.mobile?19:29,markerX=p.pad+8;
    for(let i=0;i<7;i++)shape(c,markerX+i*diamondGap,p.bottom-9,p.mobile?11:17,0,i<Math.floor(step)+1?WHITE:fg);
    const rejected=Math.floor(round/4),committed=round-rejected;
    return `COMMITTED ${committed} · REJECTED ${rejected} · INVARIANTS 7/7`;
  });
  register('telescope',false,'PLATE VIII / EVIDENCE MAP',(c,p)=>{
    const {t,fg,muted}=p,groups=[...new Set(D.plate_catalog.map(m=>m.group))],active=Math.floor(t/2)%groups.length;
    const cx=p.W*.5,cy=p.H*.51,r=Math.min(p.w*.47,p.h*.53);
    groups.forEach((g,k)=>{
      const a=k/groups.length*TAU-Math.PI/2;
      line(c,[cx,cy],[cx+Math.cos(a)*r,cy+Math.sin(a)*r],muted,true,1.5);
      const items=D.plate_catalog.filter(m=>m.group===g);
      items.forEach((m,j)=>{const angle=a-.22+(j%5)*.11,rr=r*(.84+Math.floor(j/5)*.045);shape(c,cx+Math.cos(angle)*rr,cy+Math.sin(angle)*rr,p.mobile?8:14,{existing:0,paper:1,industry:2}[m.origin],k===active?WHITE:fg);});
      const la=a;text(c,String(k+1).padStart(2,'0'),cx+Math.cos(la)*(r+13),cy+Math.sin(la)*(r+13),fg,p.mobile?8:10,'center');
    });
    const a=t/2/groups.length*TAU-Math.PI/2;line(c,[cx,cy],[cx+Math.cos(a)*r,cy+Math.sin(a)*r],fg,false,p.mobile?2:3);
    line(c,[cx,cy],[cx+Math.cos(a+.38)*r,cy+Math.sin(a+.38)*r],muted,false,1.5);
    ring(c,cx,cy,r*.28,r*.28,fg,false,2);
    text(c,groups[active].toUpperCase(),p.pad,p.bottom-2,fg,10);
    return `${D.plate_catalog.length} MECHANISMS · ${groups.length} CATEGORIES`;
  });
  // Cached-prefix price model: same append-only/cache-break rules as the chapter.
  function costs(T,omega,discount){
    const run=masked=>{let prev=0,prevM=0,sum=0;return Array.from({length:T},(_,i)=>{const m=masked?Math.max(0,i-omega):0,input=2+m*.08+(i-m)*1;const hit=i===0?0:m===prevM?prev:2+prevM*.08;sum+=input-hit+hit*discount;prev=input;prevM=m;return sum;});};
    return [run(false),run(true)];
  }
  register('lens',false,'PLATE IX / CACHE & MASK',(c,p)=>{
    const {t,fg,muted}=p,T=220,omega=8,rho=10,[full,masked]=costs(T,omega,1/rho);
    const cross=full.findIndex((v,i)=>i>omega&&masked[i]<v)+1,progress=20+Math.floor(t*6)%201;
    const x=p.pad+5,w=p.w-10,historyY=p.top+5;
    const win=(t*.8%16);
    for(let i=0;i<24;i++){c.fillStyle=i<win?muted:fg;c.fillRect(x+i*w/24,historyY,w/24-3,12);}
    c.strokeStyle=fg;c.setLineDash([3,3]);c.strokeRect(x+win*w/24-2,historyY-4,8*w/24,20);c.setLineDash([]);
    const top=historyY+39,bot=p.bottom-18,h=bot-top,max=Math.max(full[T-1],masked[T-1]);
    line(c,[x,top],[x,bot],muted);line(c,[x,bot],[x+w,bot],muted);
    [full,masked].forEach((series,k)=>{c.beginPath();c.strokeStyle=k?CLAY:fg;c.lineWidth=p.mobile?2:2.5;for(let i=0;i<T;i++){const xx=x+i/(T-1)*w,yy=bot-series[i]/max*h;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();shape(c,x+(progress-1)/(T-1)*w,bot-series[progress-1]/max*h,p.mobile?9:13,2,k?CLAY:fg);});
    const xx=x+(cross-1)/(T-1)*w,cy=bot-full[cross-1]/max*h;
    line(c,[xx,cy],[xx,bot],fg,true,2);
    const ds=p.mobile?13:20;shape(c,xx,cy,ds,0,WHITE);
    c.beginPath();c.moveTo(xx,cy-ds/2);c.lineTo(xx+ds/2,cy);c.lineTo(xx,cy+ds/2);c.lineTo(xx-ds/2,cy);c.closePath();c.strokeStyle=INK;c.lineWidth=1.5;c.stroke();
    text(c,'T = '+cross,Math.min(xx+6,p.W-60),bot-11,fg,10);
    text(c,'FULL',x+5,bot-15,fg,9);text(c,'MASK',x+55,bot-15,CLAY,9);
    return `ρ ${rho} · ω ${omega} · CROSS @ T ${cross}`;
  });
  register('tail',false,'',(c,p)=>{
    const u=p.t%9,cy=p.H*.55,gap=p.w/5;
    for(let i=0;i<4;i++){const k=Math.min(1,Math.max(0,(u-i*.45)/1.2)),e=1-Math.pow(1-k,3);shape(c,p.pad+gap*(i+1),cy-(1-e)*p.H*.6,Math.min(34,gap*.55),i,p.fg);}
  });
})();
