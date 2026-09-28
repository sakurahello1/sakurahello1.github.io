/* 从策略梯度到 GRPO · 代码绘制的图版
   依赖 ../../assets/js/site.js 暴露的 window.Reel（stage / shapePath / drawShape / cover）。
   每张图都是一个小的真实过程，不是装饰：数字由绘制函数当场算出。
   约定：陶土橙或墨色底；墨色为主形，白色只给“此刻被采样/被选中”的东西；等宽小字做读数。 */
(function () {
  'use strict';
  var R = window.Reel;
  if (!R) return;
  var INK = R.INK, CLAY = R.CLAY, WHITE = R.WHITE;
  var mono = function (px) { return '500 ' + px + 'px "JetBrains Mono", ui-monospace, monospace'; };
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pad(n, k) { n = String(n); while (n.length < k) n = '0' + n; return n; }
  function softmax(z) { var m = Math.max.apply(null, z), e = z.map(function (v) { return Math.exp(v - m); }), s = e.reduce(function (a, b) { return a + b; }, 0); return e.map(function (v) { return v / s; }); }
  function pick(p) { var u = Math.random(), c = 0; for (var i = 0; i < p.length; i++) { c += p[i]; if (u <= c) return i; } return p.length - 1; }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  /* ---------- Fig. 00 首屏：二维动作网格上的策略 ----------
     每格是一个动作，形状大小 = π_θ(a)。每 0.5 s 采样 8 个动作（白色十字 = 优势为正，墨色圈 = 为负），
     按组内标准化的优势把均值往好的方向推，但一步不超过虚线圈（信赖域半径 δ）。指针所在处就是奖励峰。 */
  R.cover('rl-policy', function (ctx, W, H, t, dt, st) {
    var host = ctx.canvas.parentElement;
    if (!st.bound) {
      st.bound = true;
      host.addEventListener('pointermove', function (e) { var b = host.getBoundingClientRect(); st.px = e.clientX - b.left; st.py = e.clientY - b.top; st.lastMove = performance.now(); });
      host.addEventListener('pointerleave', function () { st.lastMove = 0; });
      st.read = host.querySelector('[data-read]');
    }
    var cs = Math.max(22, Math.min(36, W / 40)), cols = Math.ceil(W / cs) + 1, rows = Math.ceil(H / cs) + 1;
    if (st.cols !== cols || st.rows !== rows) {
      st.cols = cols; st.rows = rows;
      st.mu = [cols * 0.18, rows * 0.72]; st.show = st.mu.slice(); st.prev = st.mu.slice();
      st.sig = 4.2; st.sigShow = 4.2; st.samples = []; st.clock = 0; st.step = 0; st.rbar = 0;
    }
    // 奖励：主峰 P（跟指针或自动漂移）+ 一个较低的局部峰 Q
    var user = st.lastMove && performance.now() - st.lastMove < 4000;
    var P = user ? [st.px / cs, st.py / cs] : [cols * (0.62 + 0.26 * Math.sin(t * 0.07)), rows * (0.46 + 0.26 * Math.sin(t * 0.11 + 1.3))];
    var Q = [cols - P[0] * 0.8, rows * 0.3 + (rows - P[1]) * 0.4];
    var wp = 3.4, wq = 4.2;
    function reward(x, y) {
      var dp = (x - P[0]) * (x - P[0]) + (y - P[1]) * (y - P[1]), dq = (x - Q[0]) * (x - Q[0]) + (y - Q[1]) * (y - Q[1]);
      return Math.exp(-dp / (2 * wp * wp)) + 0.5 * Math.exp(-dq / (2 * wq * wq));
    }
    // 一次更新（组内比较 + 信赖域截断）
    var DELTA = 1.9, G = 8;
    st.clock += dt;
    if (st.clock > 0.5 || !st.samples.length) {
      st.clock = 0; st.step++;
      var batch = [];
      for (var i = 0; i < G; i++) {
        var x = Math.max(0, Math.min(cols - 1, st.mu[0] + gauss() * st.sig)), y = Math.max(0, Math.min(rows - 1, st.mu[1] + gauss() * st.sig));
        batch.push({ x: Math.round(x), y: Math.round(y), r: reward(Math.round(x), Math.round(y)), born: t });
      }
      var mean = batch.reduce(function (a, b) { return a + b.r; }, 0) / G;
      var sd = Math.sqrt(batch.reduce(function (a, b) { return a + (b.r - mean) * (b.r - mean); }, 0) / G) + 1e-6;
      var g = [0, 0];
      batch.forEach(function (b) { b.adv = (b.r - mean) / sd; g[0] += b.adv * (b.x - st.mu[0]) / G; g[1] += b.adv * (b.y - st.mu[1]) / G; });
      var len = Math.hypot(g[0], g[1]), k = len > DELTA ? DELTA / len : 1;
      st.prev = st.mu.slice(); st.clipped = len > DELTA;
      st.mu = [st.mu[0] + g[0] * k, st.mu[1] + g[1] * k];
      st.rbar = st.rbar * 0.7 + mean * 0.3;
      st.sig += ((1.5 + 3.2 * (1 - Math.min(1, st.rbar))) - st.sig) * 0.35;
      st.samples = batch;
      if (st.read) st.read.textContent = 'STEP ' + pad(st.step % 1000, 3) + ' · R̄ ' + st.rbar.toFixed(2) + ' · σ ' + st.sig.toFixed(1) + (st.clipped ? ' · CLIPPED AT δ' : ' · INSIDE δ');
    }
    var f = Math.min(1, dt * 5);
    st.show[0] += (st.mu[0] - st.show[0]) * f; st.show[1] += (st.mu[1] - st.show[1]) * f; st.sigShow += (st.sig - st.sigShow) * f;

    ctx.clearRect(0, 0, W, H);
    // 奖励等高线
    ctx.save(); ctx.setLineDash([2, 6]); ctx.lineWidth = 1.2;
    [[P, wp, 0.3], [Q, wq, 0.16]].forEach(function (pk) {
      [0.8, 0.5, 0.2].forEach(function (lv) {
        var r = pk[1] * Math.sqrt(-2 * Math.log(lv)) * cs;
        ctx.strokeStyle = 'rgba(20,20,19,' + pk[2] + ')'; ctx.beginPath(); ctx.arc(pk[0][0] * cs, pk[0][1] * cs, r, 0, 7); ctx.stroke();
      });
    });
    ctx.restore();
    // 概率质量：每格一个形状
    var s2 = 2 * st.sigShow * st.sigShow;
    for (var r0 = 0; r0 < rows; r0++) for (var c0 = 0; c0 < cols; c0++) {
      var dx = c0 - st.show[0], dy = r0 - st.show[1], p = Math.exp(-(dx * dx + dy * dy) / s2);
      var m = Math.min(2, p * 2.6), size = cs * (0.16 + 0.78 * p);
      R.drawShape(ctx, c0 * cs, r0 * cs, size, m, 0, INK, p > 0.55);
    }
    // 信赖域：本步均值最多移动 δ
    var mx = st.show[0] * cs, my = st.show[1] * cs;
    ctx.save(); ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 18; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(st.prev[0] * cs, st.prev[1] * cs, DELTA * cs, 0, 7); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(st.prev[0] * cs, st.prev[1] * cs); ctx.lineTo(mx, my); ctx.stroke();
    // 本组样本
    st.samples.forEach(function (b) {
      var age = (t - b.born) / 0.5; if (age > 1) return;
      var a = 1 - age * 0.6;
      if (b.adv > 0) R.drawShape(ctx, b.x * cs, b.y * cs, cs * 0.92 * a, 3, 0, WHITE, false);
      else { ctx.strokeStyle = 'rgba(20,20,19,' + (0.8 * a) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x * cs, b.y * cs, cs * 0.36, 0, 7); ctx.stroke(); }
    });
    // 奖励峰标记
    ctx.save(); ctx.translate(P[0] * cs, P[1] * cs); ctx.rotate(Math.PI / 4); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
    var flip = P[0] * cs > W - 120;
    ctx.fillStyle = INK; ctx.font = mono(10); ctx.textAlign = flip ? 'right' : 'left'; ctx.fillText('REWARD PEAK', P[0] * cs + (flip ? -14 : 14), P[1] * cs - 10); ctx.textAlign = 'left';
  });

  /* ---------- Fig. I 第一部分扉页：岔路上的概率（REINFORCE） ----------
     两层岔路、九个终点。线宽 = 该分支被选中的概率。每一局沿当前策略走到一个终点，拿到回报 G，
     与滑动平均基线 b 比较：G > b 就把走过的每个分支调粗，反之调细。几十局之后，粗线会汇到回报最高的终点。 */
  R.cover('rl-fork', function (ctx, W, H, t, dt, st) {
    if (!st.init || st.W !== W || st.H !== H) {
      st.init = true; st.W = W; st.H = H;
      st.reset = function () {
        st.th0 = [0, 0, 0]; st.th1 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        var base = [0.1, 0.35, 0.05, 0.25, 1.0, 0.45, 0.0, 0.6, 0.2], rot = Math.floor(Math.random() * 3) * 3;
        st.rew = base.map(function (_, i) { return base[(i + rot) % 9]; });
        st.b = 0.3; st.ep = 0; st.path = null; st.hold = 0;
        st.w0 = [1 / 3, 1 / 3, 1 / 3]; st.w1 = [[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]];
      };
      st.reset();
    }
    var top = Math.max(64, H * 0.2), bandH = H * (W < 400 ? 0.43 : 0.5);            // 上方留给标题与读数，下方留给大字 PART I
    var root = [W * 0.08, top + bandH * 0.5];
    var L1 = [0, 1, 2].map(function (i) { return [W * 0.4, top + bandH * (0.1 + i * 0.4)]; });
    var L2 = []; for (var i = 0; i < 9; i++) L2.push([W * (W < 400 ? 0.69 : 0.74), top + bandH * i / 8]);
    var p0 = softmax(st.th0), p1 = st.th1.map(softmax);

    // 新的一局
    if (!st.path) {
      var a = pick(p0), b2 = pick(p1[a]);
      st.path = { a: a, b: b2, leaf: a * 3 + b2, k: 0 };
    }
    var P0 = st.path;
    P0.k += dt / 1.25;
    if (P0.k >= 1 && !P0.done) {
      P0.done = true; st.ep++;
      var G = st.rew[P0.leaf], A = G - st.b, lr = 2.2;
      for (var j = 0; j < 3; j++) { st.th0[j] += lr * A * ((j === P0.a ? 1 : 0) - p0[j]); st.th1[P0.a][j] += lr * A * ((j === P0.b ? 1 : 0) - p1[P0.a][j]); }
      st.b = st.b * 0.85 + G * 0.15;
      st.last = { G: G, A: A };
      if (softmax(st.th0)[Math.floor(st.rew.indexOf(1) / 3)] > 0.93) st.hold += 1;
    }
    if (P0.k >= 1.35) { st.path = null; if (st.hold > 6) st.reset(); }

    // 显示用的概率缓动
    var f = Math.min(1, dt * 4);
    for (var j2 = 0; j2 < 3; j2++) { st.w0[j2] += (p0[j2] - st.w0[j2]) * f; for (var q = 0; q < 3; q++) st.w1[j2][q] += (p1[j2][q] - st.w1[j2][q]) * f; }

    ctx.clearRect(0, 0, W, H);
    var unit = Math.max(1, W / 720);
    function edge(A0, B0, w, hot) {
      ctx.strokeStyle = hot ? WHITE : 'rgba(20,20,19,' + (0.25 + 0.75 * w) + ')';
      ctx.lineWidth = (1 + 13 * w) * unit; ctx.lineCap = 'round';
      var mx = (A0[0] + B0[0]) / 2;
      ctx.beginPath(); ctx.moveTo(A0[0], A0[1]); ctx.bezierCurveTo(mx, A0[1], mx, B0[1], B0[0], B0[1]); ctx.stroke();
    }
    function bez(A0, B0, u) {
      var mx = (A0[0] + B0[0]) / 2, v = 1 - u;
      return [v * v * v * A0[0] + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * B0[0], v * v * v * A0[1] + 3 * v * v * u * A0[1] + 3 * v * u * u * B0[1] + u * u * u * B0[1]];
    }
    for (var a1 = 0; a1 < 3; a1++) {
      edge(root, L1[a1], st.w0[a1], false);
      for (var b1 = 0; b1 < 3; b1++) edge(L1[a1], L2[a1 * 3 + b1], st.w1[a1][b1], false);
    }
    // 本局走过的路
    var k = Math.min(1, P0.k), u1 = ease(Math.min(1, k * 2)), u2 = ease(Math.max(0, k * 2 - 1));
    ctx.save(); ctx.globalAlpha = P0.k > 1 ? Math.max(0, 1 - (P0.k - 1) / 0.35) : 1;
    edge(root, L1[P0.a], 0.08, true); if (k > 0.5) edge(L1[P0.a], L2[P0.leaf], 0.08, true);
    var dot = k < 0.5 ? bez(root, L1[P0.a], u1) : bez(L1[P0.a], L2[P0.leaf], u2);
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(dot[0], dot[1], 6 * unit, 0, 7); ctx.fill();
    ctx.restore();
    // 节点
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(root[0], root[1], 9 * unit, 0, 7); ctx.fill();
    L1.forEach(function (n) { R.drawShape(ctx, n[0], n[1], 16 * unit, 1, 0, INK, false); });
    // 终点：形状大小 = 回报
    var leafGap = bandH / 8;
    L2.forEach(function (n, i) {
      var r = st.rew[i], hit = P0.done && P0.leaf === i && P0.k < 1.35;
      var leafSize = Math.min((7 + 18 * r) * unit, leafGap * 0.72);
      R.drawShape(ctx, n[0] + 22 * unit, n[1], leafSize, 2 * r, 0, hit ? WHITE : INK, false);
      ctx.fillStyle = INK; ctx.font = mono(Math.max(9, 10 * unit)); ctx.textAlign = 'right';
      ctx.fillText('G ' + r.toFixed(2), W - 8, n[1] + 3);
    });
    // 读数
    ctx.textAlign = 'left'; ctx.font = mono(Math.max(9, 10.5 * unit)); ctx.fillStyle = INK;
    var last = st.last || { G: 0, A: 0 };
    ctx.fillText('EPISODE ' + pad(st.ep, 3) + '   G ' + last.G.toFixed(2) + '   b ' + st.b.toFixed(2) + '   G−b ' + (last.A >= 0 ? '+' : '−') + Math.abs(last.A).toFixed(2), 14, 44);
  });

  /* Shared plotting primitives. Geometry is in CSS pixels, including on phones.
     Each cover is a pure function of local time: t=6 is a complete reduced-motion frame. */
  var css = getComputedStyle(document.documentElement);
  var CREAM = css.getPropertyValue('--card').trim(), BLUE = css.getPropertyValue('--teal').trim();
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function stroke(c, pts, color, dash, width) {
    c.save(); c.strokeStyle = color; c.lineWidth = width || 1.5; c.setLineDash(dash || []);
    c.beginPath(); pts.forEach(function (p,i) { if (i) c.lineTo(p[0],p[1]); else c.moveTo(p[0],p[1]); }); c.stroke(); c.restore();
  }
  function txt(c, s, x, y, color, align, size) {
    c.fillStyle = color || INK; c.font = mono(size || 10); c.textAlign = align || 'left'; c.fillText(s,x,y); c.textAlign = 'left';
  }
  function dot(c,x,y,r,color,hollow) {
    c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.lineWidth=1.5;
    if(hollow){c.strokeStyle=color;c.stroke();}else{c.fillStyle=color;c.fill();}
  }
  function read(c,W,s,dark) { txt(c,s,14,46,dark?CREAM:INK,'left',W<400?10:10.5); }
  function curve(c,f,X,Y,a,b,color,dash) {
    var pts=[];for(var i=0;i<=100;i++){var x=a+(b-a)*i/100;pts.push([X(x),Y(f(x))]);}stroke(c,pts,color,dash,2);
  }
  function arrow(c,x,y,dx,dy,color) {
    stroke(c,[[x,y],[x+dx,y+dy]],color);
    var a=Math.atan2(dy,dx);stroke(c,[[x+dx-5*Math.cos(a-.5),y+dy-5*Math.sin(a-.5)],[x+dx,y+dy],[x+dx-5*Math.cos(a+.5),y+dy-5*Math.sin(a+.5)]],color);
  }

  /* Fig. II: categorical sampling, terminal reward, backward credit. */
  R.cover('rl-tokens',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);
    var mobile=W<400,n=mobile?9:15,cycle=t%9,done=cycle>=5;
    var index=Math.min(n-1,Math.floor(cycle*n/5));
    var phase=(cycle*n/5)%1,left=22,right=W-22,step=(right-left)/n,y=H*.55;
    function probs(i){return softmax([1.2+Math.sin(i),.6,Math.cos(i*.7),-.4,.2,-.6]);}
    // A fixed sample stream keeps the categorical draw legible in every still frame.
    function chosen(i){return [0,1,2,3,4,5,2,1,3,0,5,4,1,2,3][i%15];}
    var p=probs(index), chosenIndex=chosen(index);
    var bw=mobile?16:22,span=mobile?28:34,group=span*6;
    var currentX=left+(index+.5)*step,center=clamp(currentX,left+group/2,right-group/2);
    var base=H*.39,barMax=mobile?45:64;
    for(var j=0;j<6;j++){
      var x=center+(j-2.5)*span,h=p[j]/.65*barMax;
      c.fillStyle=!done&&j===chosenIndex?WHITE:INK;c.fillRect(x-bw/2,base-h,bw,h);
      R.drawShape(c,x,base+11,9,j%4,0,!done&&j===chosenIndex?WHITE:INK,false);
      txt(c,p[j].toFixed(2),x,base-h-6,INK,'center',9);
    }
    for(var i=0;i<n;i++){
      var x=left+(i+.5)*step,size=Math.min(mobile?24:34,step*.8);
      var pulse=done&&Math.round((1-clamp((cycle-5)/3,0,1))*(n-1))===i;
      if(i<index||done)R.drawShape(c,x,y,size,chosen(i)%4,0,pulse?WHITE:INK,false);
      if(i===index&&!done){
        var fromX=center+(chosenIndex-2.5)*span,fromY=base+11,k=ease(phase);
        R.drawShape(c,fromX+(x-fromX)*k,fromY+(y-fromY)*k,size,chosenIndex%4,0,WHITE,false);
      }
    }
    if(done){
      var rewardX=right-64,rewardY=y+27;
      c.fillStyle=WHITE;c.fillRect(rewardX,rewardY,64,25);txt(c,'r +1',rewardX+32,rewardY+17,INK,'center',11);
      var progress=clamp((cycle-5)/3,0,1),pulseX=left+(n-.5-progress*(n-1))*step;
      stroke(c,[[right,y+62],[pulseX,y+62]],WHITE,[],2);dot(c,pulseX,y+62,4,WHITE);
    }else txt(c,'SAMPLE → APPEND',left,y+44,INK);
    read(c,W,'t '+(done?n:index+1)+' · p '+p[chosenIndex].toFixed(2)+' · r '+(done?'+1':'—'));
  });

  /* Fig. 02: quadratic KL proposal checked against a non-quadratic actual KL.
     The linear objective improves along every proposal; real KL rejects 1 and 1/2. */
  R.cover('rl-trust',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);
    var cycle=t%16, k=Math.floor(cycle/4), ph=cycle%4;
    var anchors=[[.36,.68],[.42,.62],[.48,.56],[.54,.50],[.60,.44]];
    var L=26,T=74,PW=W-52,PH=H-110;
    function point(p){return [L+PW*p[0],T+PH*p[1]];}
    var at=point(anchors[k]),next=point(anchors[k+1]),dx=(next[0]-at[0])*4,dy=(next[1]-at[1])*4;
    var move=clamp(ph-2.8,0,1), origin=[at[0]+(next[0]-at[0])*move,at[1]+(next[1]-at[1])*move];
    c.save();c.strokeStyle=CREAM;c.globalAlpha=.18;c.lineWidth=1.2;
    for(var j=1;j<7;j++){c.beginPath();c.ellipse(L+PW*.87,T+PH*.15,PW*j*.105,PH*j*.13,-.2,0,7);c.stroke();}c.restore();
    var radiusX=Math.hypot(dx,dy)*1.05,radiusY=PH*.13;
    c.save();c.strokeStyle=CLAY;c.setLineDash([5,5]);c.lineWidth=1.5;c.beginPath();c.ellipse(origin[0],origin[1],radiusX,radiusY,Math.atan2(dy,dx),0,7);c.stroke();c.restore();
    stroke(c,anchors.slice(0,k+1).map(point),CREAM,[],2);
    var attempt=Math.min(2,Math.floor(ph/.9)), a=Math.pow(.5,attempt);
    for(var i=0;i<=attempt;i++){
      var scale=Math.pow(.5,i),end=[at[0]+dx*scale,at[1]+dy*scale];
      stroke(c,[at,end],i===2?WHITE:CLAY,[3,4]);dot(c,end[0],end[1],5,i===2?WHITE:CLAY,i!==2);
      txt(c,['1×','½×','¼×'][i],end[0]+7,end[1]-9,CREAM,'left',10);
    }
    dot(c,origin[0],origin[1],6,WHITE);var kl=.01*a*a+.14*a*a*a,delta=.12*a;
    read(c,W,'KL '+kl.toFixed(4)+(kl<=.01?' ≤':' >')+' .01 · BT '+attempt,true);
    txt(c,'ΔJ +'+delta.toFixed(3)+' · '+(attempt===2?'ACCEPT':'BACKTRACK'),14,H-18,CREAM);
  });

  /* Fig. 03: min(r A, clip(r) A), with both signs of A. */
  R.cover('rl-clip',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);var epoch=(t%8)/2,eps=.2,clipped=0,total=0;
    var X=function(r){return 44+(W-70)*(r-.5);},start=78,panel=(H-112)/2;
    [1,-1].forEach(function(A,j){
      var top=start+j*(panel+18),Y=function(v){return top+panel*(A>0?1.7-v:-v-.35)/1.4;};
      var f=function(r){return Math.min(r*A,clamp(r,1-eps,1+eps)*A);};
      [.8,1.2].forEach(function(r){stroke(c,[[X(r),top],[X(r),top+panel]],WHITE,[4,4]);});
      curve(c,function(r){return r*A;},X,Y,.5,1.5,'rgba(20,20,19,.28)');
      curve(c,f,X,Y,.5,1.5,INK);txt(c,A>0?'A > 0':'A < 0',14,top+10,INK,'left',10);
      var samples=[];
      for(var i=0;i<14;i++){
        var initial=.82+((i*9)%14)*.36/13;
        var direction=i<11?A:-A,speed=.025+((i*5)%11)*.009;
        var raw=initial+direction*speed*epoch;
        var hit=A>0?raw>=1.2:raw<=.8;
        samples.push({r:hit?(A>0?1.2:.8):clamp(raw,.52,1.48),hit:hit,dir:direction,i:i});
        if(hit)clipped++;total++;
      }
      var stopped=samples.filter(function(s){return s.hit;}).length,rank=0;
      samples.forEach(function(s){
        var offset=s.hit?(rank++-(stopped-1)/2)*5:(s.i%5-2)*5;
        var x=X(s.r),y=Y(f(s.r))+offset;
        dot(c,x,y,3.2,INK,s.hit);
        if(!s.hit)arrow(c,x+s.dir*4,y,s.dir*6,0,INK);
      });
    });
    read(c,W,'EPOCH '+(Math.floor(epoch)+1)+'/4 · CLIPPED '+Math.round(clipped/total*100)+'% · ε .2');
    txt(c,'0.5',X(.5),H-8,INK);txt(c,'r = π / π_old',X(1),H-8,INK,'center');txt(c,'1.5',X(1.5),H-8,INK,'right');
  });

  /* Fig. 04: gradient descent on pairwise Bradley–Terry cross entropy. */
  R.cover('rl-pref',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);var steps=Math.floor((t%18)*4),scores=[.4,-.3,.2,-.4,.3,-.2],a=5,b=0;
    for(var i=0;i<steps;i++){
      a=1+(i*3%5);b=i%a;var prob=1/(1+Math.exp(-(scores[a]-scores[b]))),g=.22*(1-prob);scores[a]+=g;scores[b]-=g;
    }
    a=1+(steps*3%5);b=steps%a;
    var d=scores[a]-scores[b],p=1/(1+Math.exp(-d)),delta=.22*(1-p),blend=ease((t*4)%1);
    scores[a]+=delta*blend;scores[b]-=delta*blend;
    d=scores[a]-scores[b];p=1/(1+Math.exp(-d));
    var domain=Math.max(3,Math.ceil(Math.max.apply(null,scores.map(Math.abs)))),X=function(x){return 30+(W-60)*(x+domain)/(2*domain);},sy=H*.29;
    stroke(c,[[30,sy],[W-30,sy]],INK);
    scores.forEach(function(s,i){
      var x=X(s),rise=i%2?-10:10;
      stroke(c,[[x,sy],[x,sy+rise]],'rgba(20,20,19,.28)',[],1);
      R.drawShape(c,x,sy+rise,10,i*.57,0,i===a?CLAY:INK,false);
    });
    var cardW=Math.min(220,W*.39),cardH=H*.19,cardY=H*.43;
    [a,b].forEach(function(id,j){
      var x=W*(j?.74:.26),selected=j===0,left=x-cardW/2;
      c.fillStyle=selected?INK:CREAM;c.strokeStyle=INK;c.lineWidth=1.3;
      c.fillRect(left,cardY,cardW,cardH);c.strokeRect(left,cardY,cardW,cardH);
      txt(c,'ANSWER '+String.fromCharCode(65+id),left+10,cardY+15,selected?CREAM:INK,'left',9);
      for(var row=0;row<4;row++){
        c.fillStyle=selected?INK:'rgba(20,20,19,.22)';
        if(selected){c.strokeStyle=CREAM;c.lineWidth=2;c.strokeRect(left+10,cardY+25+row*10,cardW*(.74-row*.08),5);}
        else c.fillRect(left+10,cardY+25+row*10,cardW*(.74-row*.08),5);
      }
      if(selected){
        var markX=left+cardW-16,markY=cardY+13;
        c.save();c.translate(markX,markY);c.rotate(Math.PI/4);c.fillStyle=WHITE;c.fillRect(-6,-6,12,12);c.restore();
        txt(c,'✓',markX,markY+3,INK,'center',10);
      }
    });
    var top=H*.72,bottom=H-30,Y=function(v){return bottom-v*(bottom-top);};
    stroke(c,[[30,bottom],[W-30,bottom]],INK);curve(c,function(x){return 1/(1+Math.exp(-x));},X,Y,-3,3,INK);
    var xx=X(clamp(d,-3,3)),yy=Y(p);stroke(c,[[xx,bottom],[xx,yy]],CLAY,[3,3]);dot(c,xx,yy,5,CLAY);dot(c,xx,yy,2,WHITE);
    txt(c,'σ(rA − rB)',30,top-8,INK);txt(c,'−3',30,H-12,INK);txt(c,'+3',W-30,H-12,INK,'right');
    read(c,W,'PAIR '+pad(steps+1,3)+' · σ '+p.toFixed(2)+' · LOSS '+(-Math.log(p)).toFixed(2));
  });

  /* Fig. 05: a toy proxy, true quality and a KL-penalized stopping point. */
  R.cover('rl-goodhart',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);var k=(t%12)/12*9,beta=.4,stop=Math.pow(.7/(2*beta),2);
    function proxy(x){return .7*Math.sqrt(x);}
    function truth(x){return .7*Math.sqrt(x)-.045*x*x;}
    var X=function(x){return 38+(W-64)*x/9;},Y=function(y){return H-40-(y+1.7)*(H-128)/4;};
    stroke(c,[[X(0),Y(0)],[X(9),Y(0)]],CREAM);stroke(c,[[X(0),Y(-1.7)],[X(0),Y(2.3)]],CREAM);
    curve(c,proxy,X,Y,0,9,CREAM);curve(c,truth,X,Y,0,9,CLAY);
    stroke(c,[[X(stop),74],[X(stop),H-40]],CLAY,[4,4]);
    txt(c,'KL PENALTY',X(stop)+6,86,CLAY);txt(c,'β '+beta.toFixed(1),X(stop)+6,101,CLAY);
    stroke(c,[[X(k),Y(proxy(k))],[X(k),Y(truth(k))]],WHITE,[2,3]);
    dot(c,X(k),Y(proxy(k)),4,WHITE);dot(c,X(k),Y(truth(k)),4,CLAY);
    txt(c,'PROXY',W-20,Y(proxy(9))-8,CREAM,'right');txt(c,'TRUE',W-20,Y(truth(9))-8,CLAY,'right');
    txt(c,'KL(π || π_ref) →',W-20,H-12,CREAM,'right');
    read(c,W,'KL '+k.toFixed(1)+' · PROXY +'+proxy(k).toFixed(2)+' · TRUE '+truth(k).toFixed(2),true);
  });

  /* Fig. 06: group statistics and exponentiated-advantage probability update. */
  R.cover('rl-group',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);var cycle=t%10,round=Math.floor(t/10),rw=[];
    for(var i=0;i<8;i++)rw.push(((i*3+round)%8)<(3+round%3)?1:0);
    var mean=rw.reduce(function(a,b){return a+b;},0)/8,sd=Math.sqrt(mean*(1-mean));
    var adv=rw.map(function(r){return (r-mean)/sd;}),updated=softmax(adv.map(function(a){return a*.6;})),mix=clamp((cycle-5)/3,0,1);
    var slot=(W-44)/8,base=H*.42,tokenH=Math.max(4,H*.014),zero=H*.73;
    for(var j=0;j<8;j++){
      var x=22+slot*(j+.5),len=2+(j*3+round)%5,bw=Math.min(26,slot*.64);
      for(var n=0;n<len;n++){c.fillStyle=INK;c.fillRect(x-bw/2,base-n*(tokenH+3),bw,tokenH);}
      var ry=H*.59-rw[j]*H*.11;dot(c,x,ry,3.5,INK,rw[j]===0);txt(c,String(rw[j]),x,ry-7,INK,'center',9);
      var h=adv[j]*H*.07;c.lineWidth=1.5;
      if(adv[j]>0){c.fillStyle=WHITE;c.fillRect(x-bw/2,zero-h,bw,h);}else{c.strokeStyle=INK;c.strokeRect(x-bw/2,zero,bw,-h);}
      var p=(1-mix)/8+mix*updated[j],radius=3+Math.sqrt(p)*12;
      dot(c,x,H*.89,radius,adv[j]>0&&mix>0?WHITE:INK);
      txt(c,Math.round(p*100)+'%',x,H-10,INK,'center',9);
    }
    // Reward mean is in its own [0,1] reward scale, above the advantage panel.
    var my=H*.59-mean*H*.11;stroke(c,[[20,my],[W-20,my]],INK,[4,4]);txt(c,'r̄ '+mean.toFixed(2),W-20,my-5,INK,'right',9);
    stroke(c,[[20,zero],[W-20,zero]],INK);txt(c,'A',10,zero+3,INK,'left',9);
    read(c,W,'G 8 · MEAN '+mean.toFixed(2)+' · STD '+sd.toFixed(2));
    txt(c,'A+ '+rw.reduce(function(a,b){return a+b;},0)+' / A− '+(8-rw.reduce(function(a,b){return a+b;},0))+' · '+(cycle<5?'SCORE':'UPDATE π'),14,63,INK,'left',9);
  });

  /* Fig. 07: a conceptual map, not a claim of chronological inheritance. */
  R.cover('rl-map',function(c,W,H,t){
    t = Math.max(0, t); c.clearRect(0,0,W,H);
    var methods=[['REINFORCE','整局回报',0],['BASELINE','降低方差',0],['GAE','偏差 / 方差',0],['NPG','KL 度量',1],['TRPO','验收步长',1],['PPO','降低代价',1],['RLHF','偏好奖励',2],['DPO','离线偏好',2],['GRPO','去掉 Critic',0],['RLVR','可验证奖励',2],['DAPO / GSPO','采样 / 裁剪',1]];
    var mobile=W<500,cols=mobile?3:6,rows=mobile?5:Math.ceil(methods.length/cols),left=mobile?53:61,cell=(W-2*left)/(cols-1),top=mobile?154:168,usable=H-top-30,rowH=usable/rows;
    var active=Math.floor(t/1.1)%methods.length,colors=[INK,CLAY,BLUE],pts=[];
    txt(c,'11 METHODS · 3 QUESTIONS · '+pad(active+1,2),14,46,INK,'left',W<400?10:10.5);
    ['往哪走','走多远','奖励从哪来'].forEach(function(s,i){var x=14+i*(W-28)/3;stroke(c,[[x,70],[x+16,70]],colors[i],[],3);txt(c,s,x+21,74,colors[i],'left',mobile?9:10);});
    var slots=mobile?[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[3,1],[2,2],[4,0],[4,2]]:null;
    methods.forEach(function(m,i){var row=mobile?slots[i][0]:Math.floor(i/cols),col=mobile?slots[i][1]:i%cols;var x=left+col*cell,y=top+row*rowH-col*(mobile?9:12)+(i===7&&!mobile?32:0);pts.push([x,y]);});
    var edges=mobile?[[0,1],[1,2],[3,4],[4,5],[6,8],[9,10]]:null;
    for(var track=0;track<3;track++){
      for(var i=mobile?0:1;i<(mobile?edges.length:pts.length);i++){
        var from=mobile?edges[i][0]:i-1,to=mobile?edges[i][1]:i;
        if(!mobile&&(i===7||i===8||i%cols===0))continue; // DPO branches from RLHF.
        var a=pts[from],b=pts[to],off=track*4;
        var mx=(a[0]+b[0])/2;stroke(c,[[a[0],a[1]+off],[mx,a[1]+off],[mx,b[1]+off],[b[0],b[1]+off]],colors[track],[],1);
      }
    }
    if(mobile){
      [[2,3],[5,6],[8,9]].forEach(function(pair){var a=pts[pair[0]],b=pts[pair[1]],gutter=W-13;stroke(c,[[a[0]+8,a[1]],[gutter,a[1]],[gutter,a[1]+16]],'rgba(20,20,19,.22)',[3,4]);arrow(c,gutter,a[1]+9,0,7,INK);stroke(c,[[13,b[1]-14],[13,b[1]],[b[0]-8,b[1]]],'rgba(20,20,19,.22)',[3,4]);});
    }else{
      for(var row=1;row<rows;row++){var previous=pts[row*cols-1],next=pts[row*cols],yy=top+(row-1)*rowH+40;stroke(c,[[previous[0]+8,previous[1]],[W-12,previous[1]],[W-12,yy]],'rgba(20,20,19,.22)',[3,4]);arrow(c,W-12,yy-8,0,8,INK);stroke(c,[[12,next[1]-16],[12,next[1]],[next[0]-8,next[1]]],'rgba(20,20,19,.22)',[3,4]);}
    }
    stroke(c,[pts[6],pts[7]],BLUE,[3,4]);stroke(c,[pts[6],pts[8]],INK);
    methods.forEach(function(m,i){var p=pts[i];dot(c,p[0],p[1]+4,6,colors[m[2]]);if(i===active)dot(c,p[0],p[1]+4,3,WHITE);txt(c,m[0],p[0],p[1]-17,INK,'center',mobile?9:10);txt(c,m[1],p[0],p[1]+27,colors[m[2]],'center',9);});
  });

})();
