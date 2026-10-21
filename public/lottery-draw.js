/* Shared timestamp drives every screen; the machine never chooses a result. */
(function(global){
  const INTRO=1200,STEP=2400,REVEAL=.8,instances=new WeakMap();let serial=0;
  function frame(lottery,now=Date.now()){
    const numbers=lottery.result||[];
    if(lottery.status!=='drawn'||numbers.length!==6)return {phase:'idle',count:0,index:0,progress:0,elapsed:0};
    const elapsed=Math.max(0,now-Number(lottery.startedAt||0)),after=elapsed-INTRO;
    const count=Math.min(6,Math.max(0,Math.floor((after+STEP*(1-REVEAL))/STEP)));
    const index=Math.min(5,Math.max(0,Math.floor(after/STEP))),progress=after<0?0:(after%STEP)/STEP;
    return {phase:count===6?'complete':after<0||progress<.34?'mixing':progress<REVEAL?'suction':'reveal',count,index,progress,elapsed};
  }
  // Lightweight 3D cylinder simulation. Result selection always remains on the server.
  function createPhysics(){
    const radius=9,bodies=Array.from({length:49},(_,i)=>({n:i+1,x:(i%7-3)*24,z:(Math.floor(i/7)%3-1)*24,y:246-Math.floor(i/21)*24,vx:Math.sin(i*4.7)*60,vy:-60-i%5*17,vz:Math.cos(i*2.3)*45,spin:i*.7}));
    let time=0;
    function step(dt,removed=new Set(),air=true){
      dt=Math.max(0,Math.min(dt,1/30));time+=dt;
      const live=bodies.filter(b=>!removed.has(b.n));
      for(const b of live){
        b.vx+=Math.sin(time*3.7+b.n*1.9)*125*dt;b.vz+=Math.cos(time*4.1+b.n*2.3)*100*dt;
        const jet=air?Math.max(0,1-Math.abs(b.x)/85)*(260+180*Math.sin(time*4+b.n*.4)):0;
        b.vy+=(180-jet)*dt;b.vx*=.997;b.vz*=.997;b.vy*=.999;
        b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.spin+=(b.vx*.02+b.vz*.025+1)*dt;
      }
      // Equal-mass collisions separate the solids and exchange normal velocity.
      for(let pass=0;pass<2;pass++){
        for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
          const a=live[i],b=live[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d2=dx*dx+dy*dy+dz*dz;
          if(d2>=radius*radius*4)continue;
          const d=Math.sqrt(d2)||.001,nx=d2?dx/d:1,ny=d2?dy/d:0,nz=d2?dz/d:0,shift=(radius*2-d)/2+.01;
          a.x-=nx*shift;a.y-=ny*shift;a.z-=nz*shift;b.x+=nx*shift;b.y+=ny*shift;b.z+=nz*shift;
          const impact=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz;
          if(impact<0){const impulse=-impact*.88;a.vx-=impulse*nx;a.vy-=impulse*ny;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vy+=impulse*ny;b.vz+=impulse*nz}
        }
        for(const b of live){
          const boundary=Math.hypot(b.x/88,b.z/51);
          if(boundary>1){b.x/=boundary;b.z/=boundary;const nx=b.x/(88*88),nz=b.z/(51*51),len=Math.hypot(nx,nz),ux=nx/len,uz=nz/len,normal=b.vx*ux+b.vz*uz;if(normal>0){b.vx-=normal*1.78*ux;b.vz-=normal*1.78*uz}}
          if(b.y>274){b.y=274;b.vy=air?-Math.max(100,Math.abs(b.vy)*.8):Math.abs(b.vy)>14?-Math.abs(b.vy)*.35:0;if(!air){b.vx*=.85;b.vz*=.85}}
          if(b.y<14){b.y=14;b.vy=Math.abs(b.vy)*.8}
          for(const key of ['vx','vy','vz'])b[key]=Math.max(-260,Math.min(260,b[key]));
        }
      }
    }
    return {bodies,step};
  }
  function mount(target,options={}){
    if(instances.has(target))return instances.get(target);
    const doc=options.document||document,clock=options.clock||Date.now,raf=options.requestAnimationFrame||global.requestAnimationFrame?.bind(global),caf=options.cancelAnimationFrame||global.cancelAnimationFrame?.bind(global);
    const html=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e};
    const root=html('section','lottery-machine lottery-studio'),heading=html('div','lottery-machine-heading','幸福大樂透・現場開獎'),canvas=html('canvas','lottery-machine-canvas'),status=html('p','lottery-machine-status','等候主持人開獎');
    root.setAttribute('aria-label','紅球氣流式樂透開獎機');const renderScale=(target.clientWidth||1000)<620?.72:1;canvas.width=Math.round(1000*renderScale);canvas.height=Math.round(600*renderScale);canvas.setAttribute('aria-hidden','true');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    let ctx=canvas.getContext?.('2d')||null;const reduced=global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    ctx?.setTransform(renderScale,0,0,renderScale,0,0);
    const results=html('ol','lottery-results'),resultNodes=Array.from({length:6},(_,i)=>{const li=html('li','lottery-result'),label=html('small','','第 '+(i+1)+' 顆'),number=html('strong','','—');li.append(label,number);results.append(li);return {li,number}});
    root.append(heading,canvas,status,results);target.replaceChildren(root);target.classList.add('lottery-machine-host');
    let lottery={status:'open',result:[]},timer=null,destroyed=false,lastStatus='',lastPaint=0,physics=createPhysics(),identity='',intakeIndex=-1,intakeOrigin=[206,400];
    const circle=(x,y,r,fill)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill()};
    const ellipse=(x,y,rx,ry,fill)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill()};
    const rect=(x,y,w,h,r,fill,stroke)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}};
    function linear(x1,y1,x2,y2,stops){const g=ctx.createLinearGradient(x1,y1,x2,y2);for(const [p,c]of stops)g.addColorStop(p,c);return g}
    function label(text,x,y,size=12,color='#b6c6d1',align='left',weight=600){ctx.font=weight+' '+size+'px Arial, sans-serif';ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y)}
    function ball(x,y,r,n,spin=0,alpha=1,paint=ctx){
      const brush=paint;
      brush.save();brush.translate(x,y);brush.globalAlpha=alpha;
      brush.beginPath();brush.arc(0,0,r,0,Math.PI*2);brush.clip();
      const red=brush.createRadialGradient(-r*.36,-r*.42,r*.02,r*.28,r*.32,r*1.4);
      for(const [p,c]of [[0,'#ffb5b8'],[.12,'#ff4e59'],[.43,'#eb1223'],[.72,'#b40010'],[1,'#360007']])red.addColorStop(p,c);
      brush.fillStyle=red;brush.fillRect(-r,-r,r*2,r*2);
      // Repeated white markings rotate around a sphere rather than a flat disc.
      const value=String(n).padStart(2,'0');
      for(const latitude of [-.85,0,.85])for(let k=0;k<4;k++){
        const longitude=spin+k*Math.PI/2+(latitude?Math.PI/4:0),depth=Math.cos(longitude)*Math.cos(latitude);if(depth<.13)continue;
        const px=Math.sin(longitude)*Math.cos(latitude)*r*.87,py=Math.sin(latitude)*r*.82;
        brush.save();brush.translate(px,py);brush.rotate(latitude*.35+Math.sin(spin*.4)*.1);brush.scale(Math.max(.23,depth),Math.cos(latitude)*.9);
        brush.font='800 '+(r*.58)+'px Arial, sans-serif';brush.fillStyle='#fff8f5';brush.textAlign='center';brush.textBaseline='middle';brush.fillText(value,0,0);brush.restore();
      }
      const shine=brush.createRadialGradient(-r*.4,-r*.5,0,-r*.4,-r*.5,r*.62);shine.addColorStop(0,'#ffffff8f');shine.addColorStop(.5,'#ffffff20');shine.addColorStop(1,'#ffffff00');brush.beginPath();brush.arc(-r*.4,-r*.5,r*.62,0,Math.PI*2);brush.fillStyle=shine;brush.fill();
      brush.beginPath();brush.ellipse(-r*.2,-r*.76,r*.32,r*.065,0,0,Math.PI*2);brush.fillStyle='#ffffffc9';brush.fill();brush.restore();
      brush.save();brush.strokeStyle='#ffaaa540';brush.lineWidth=Math.max(.6,r*.012);brush.beginPath();brush.arc(x,y,r,0,Math.PI*2);brush.stroke();brush.restore();
    }
    let textures=null;
    function poolBall(x,y,r,n,spin,alpha){
      if(!textures)textures=Array.from({length:49},(_,i)=>{
        const texture=doc.createElement('canvas');texture.width=48;texture.height=48;
        ball(24,24,21,i+1,0,1,texture.getContext('2d'));return texture;
      });
      ctx.save();ctx.translate(x,y);ctx.rotate(spin);ctx.globalAlpha=alpha;
      const diameter=r*48/21;ctx.drawImage(textures[n-1],-diameter/2,-diameter/2,diameter,diameter);ctx.restore();
    }
    function pipePath(){ctx.beginPath();ctx.moveTo(206,424);ctx.lineTo(206,99);ctx.quadraticCurveTo(206,82,224,82);ctx.lineTo(435,82);ctx.quadraticCurveTo(460,82,460,107);ctx.lineTo(460,320)}
    function pipe(){
      ctx.lineCap='round';pipePath();ctx.lineWidth=29;ctx.strokeStyle='#111820';ctx.stroke();pipePath();ctx.lineWidth=25;ctx.strokeStyle='#93a6af60';ctx.stroke();pipePath();ctx.lineWidth=18;ctx.strokeStyle='#101b2a65';ctx.stroke();
      ctx.beginPath();ctx.moveTo(201,419);ctx.lineTo(201,99);ctx.quadraticCurveTo(201,76,224,76);ctx.lineTo(435,76);ctx.strokeStyle='#ffffff75';ctx.lineWidth=2;ctx.stroke();
    }
    function selectionPoint(progress){
      const points=[intakeOrigin,[206,intakeOrigin[1]],[206,99],[224,82],[435,82],[460,107],[460,320]],weights=[.13,.36,.04,.25,.06,.16];let t=Math.max(0,Math.min(1,(progress-.34)/.46));
      for(let i=0;i<weights.length;i++){if(t<=weights[i]||i===weights.length-1){const f=Math.min(1,t/weights[i]);return [points[i][0]+(points[i+1][0]-points[i][0])*f,points[i][1]+(points[i+1][1]-points[i][1])*f]}t-=weights[i]}
    }
    let backLayer=null,frontLayer=null,layerState='';
    function layer(draw,bounds={x:0,y:0,width:1000,height:600}){
      const surface=doc.createElement('canvas');surface.width=bounds.width;surface.height=bounds.height;
      const previous=ctx;ctx=surface.getContext('2d');ctx.translate(-bounds.x,-bounds.y);try{draw()}finally{ctx=previous}return surface;
    }
    function studio(state){
      if(!ctx)return;
      const key=state.phase==='idle'?'idle':state.phase==='complete'?'complete':'running';
      if(!backLayer||layerState!==key){backLayer=layer(()=>{
      const backdrop=ctx.createRadialGradient(440,130,10,500,320,680);backdrop.addColorStop(0,'#1b3850');backdrop.addColorStop(.6,'#0b1828');backdrop.addColorStop(1,'#040912');ctx.fillStyle=backdrop;ctx.fillRect(0,0,1000,600);
      for(let i=0;i<12;i++){ctx.fillStyle=i%2?'#c6e7f603':'#c6e7f608';ctx.fillRect(i*90,0,1,600)}
      label('AIR MIX LOTTERY',44,32,14,'#e8f0f6');label('TUNG  /  CHU     12.12',954,32,12,'#9cafbf','right');
      const steel=linear(70,0,470,0,[[0,'#171c23'],[.08,'#66727b'],[.13,'#232a32'],[.7,'#111820'],[.85,'#4b5965'],[1,'#0a1018']]);
      ellipse(264,534,220,21,'#00000080');rect(64,490,410,25,8,steel,'#7b8b9560');rect(80,512,30,12,3,'#05090d');rect(428,512,30,12,3,'#05090d');
      // Satin-black electronics cabinet, lit edges, bolts and indicator lamps.
      rect(327,77,139,407,11,linear(327,0,466,0,[[0,'#090d13'],[.12,'#37404a'],[.2,'#151a22'],[.8,'#070a10'],[1,'#39434c']]),'#b7c8d040');
      rect(342,127,105,78,4,'#020806','#454f57');label('AIR PRESSURE',393,140,9,'#82928f','center');label(state.phase==='idle'||state.phase==='complete'?'0.00':'0.82',394,170,23,'#99e8c0','center');label('BAR',394,191,9,'#657f73','center');
      for(let i=0;i<6;i++){circle(350+i*17,109,3,state.phase==='idle'?'#47131a':'#f12c3b');circle(349+i*17,108,1,'#ffabb0')}
      for(let i=0;i<12;i++)rect(347,353+i*8,92,3,1,'#020509','#29333d');
      for(const x of [338,454])for(const y of [88,472]){circle(x,y,2.5,'#737d85');ctx.strokeStyle='#171c22';ctx.beginPath();ctx.moveTo(x-1.5,y);ctx.lineTo(x+1.5,y);ctx.stroke()}
      label('AUTOMATIC DRAW SYSTEM',396,330,7,'#6b7e8d','center');pipe();
      // Acrylic cylinder: back wall, chrome caps, then depth-sorted solids.
      const glass=linear(94,0,320,0,[[0,'#b5e6f030'],[.06,'#e8faff13'],[.3,'#6c9fad06'],[.65,'#bccfd909'],[.94,'#ebffff2e'],[1,'#c8eaf04a']]);
      ctx.fillStyle=glass;ctx.fillRect(94,135,224,308);ellipse(206,135,112,24,'#8ca9b52b');ellipse(206,442,112,24,'#0b131ce0');
      // Broadcast close-up: black receiving channel, glossy red ball and repeated white numbers.
      rect(505,71,453,339,12,linear(505,71,958,410,[[0,'#7b8b98'],[.015,'#151e28'],[.985,'#0b1118'],[1,'#7f919e']]),'#acc4d93d');
      rect(514,80,435,321,7,linear(514,80,949,400,[[0,'#182029'],[.4,'#020407'],[1,'#10151c']]));
      ctx.save();ctx.beginPath();ctx.rect(515,80,433,320);ctx.clip();
      rect(520,299,420,56,7,linear(0,299,0,355,[[0,'#050608'],[.3,'#2b3035'],[.5,'#080b0e'],[1,'#010203']]));
      ctx.restore();
      // A physical six-ball receiving rack, separate from the readable number strip.
      label('DRAWN BALLS',516,443,11,'#adbfcc');rect(507,460,451,96,9,linear(0,460,0,556,[[0,'#34424e'],[.08,'#070b10'],[.85,'#121b23'],[1,'#53636e']]),'#a2b6c13d');
      rect(518,477,429,54,15,'#020609');
      rect(443,309,37,24,4,'#03060a','#8a9ca55e');
      label('HAPPINESS   /   2026.12.12',46,570,10,'#627f92');
      });layerState=key;}
      if(!frontLayer)frontLayer=layer(()=>{
      const glass=linear(94,0,320,0,[[0,'#b5e6f030'],[.06,'#e8faff13'],[.3,'#6c9fad06'],[.65,'#bccfd909'],[.94,'#ebffff2e'],[1,'#c8eaf04a']]);
      // Front reflections and refracted vertical highlights.
      ctx.fillStyle=glass;ctx.fillRect(94,135,224,308);rect(102,147,4,280,2,'#ffffff4a');rect(113,147,12,277,5,'#efffff0d');rect(306,149,3,282,1,'#ffffff5f');
      const chrome=linear(76,0,335,0,[[0,'#27333e'],[.05,'#b6c8d0'],[.12,'#657d8b'],[.3,'#e5eff3'],[.4,'#5e737f'],[.8,'#a6b8c1'],[1,'#142432']]);
      ellipse(206,135,119,24,chrome);ellipse(206,133,107,15,'#13212c');ellipse(206,132,102,11,'#73899250');rect(79,112,254,13,3,chrome);rect(85,441,242,18,4,chrome);ellipse(206,441,121,16,'#7b919c7a');
      for(const x of [86,323])rect(x,133,5,307,1,linear(x,0,x+5,0,[[0,'#293b47'],[.5,'#cfdee2'],[1,'#344958']]));
      },{x:75,y:105,width:264,height:365});
      ctx.clearRect(0,0,1000,600);ctx.drawImage(backLayer,0,0);
      ctx.save();ctx.beginPath();ctx.rect(98,135,216,307);ctx.clip();
      const removed=new Set(lottery.result.slice(0,state.count));if(state.phase==='suction')removed.add(lottery.result[state.index]);
      const bodies=physics.bodies.filter(b=>!removed.has(b.n)).sort((a,b)=>a.z-b.z);
      for(const b of bodies){const scale=1+b.z/400;poolBall(206+b.x*scale,140+b.y+b.z*.12,10.5*scale,b.n,reduced?0:b.spin,(b.z+51)/400+.72)}
      if(state.phase==='suction'&&!reduced){const p=selectionPoint(state.progress);if(p[1]>135&&p[0]<316)ball(p[0],p[1],10.5,lottery.result[state.index],state.elapsed*.012)}
      ctx.restore();
      ctx.drawImage(frontLayer,75,105);
      if(state.phase==='suction'&&!reduced){const p=selectionPoint(state.progress);if(p[1]<=135||p[0]>=316)ball(p[0],p[1],10.5,lottery.result[state.index],state.elapsed*.012)}
      ctx.save();ctx.beginPath();ctx.rect(515,80,433,320);ctx.clip();
      if(state.count){
        const lastIndex=state.count-1,since=state.elapsed-INTRO-lastIndex*STEP-STEP*REVEAL,t=reduced?1:Math.max(0,Math.min(1,since/650)),ease=1-(1-t)**3;
        const x=734+(1-ease)*225,r=91;ellipse(x+10,324,108,15,'#000000d9');
        ball(x,237-Math.sin(t*Math.PI)*12,r,lottery.result[lastIndex],(1-ease)*5.6);
        label('BALL '+String(state.count).padStart(2,'0')+' / 06',536,373,12,'#9aabb8');
      }else{label('WAITING FOR DRAW',732,235,16,'#4e606e','center')}
      circle(536,105,4,'#ff334d');label('BALL CAMERA   /   LIVE',549,106,11,'#d8e3eb');ctx.restore();
      ctx.save();ctx.beginPath();ctx.rect(518,467,430,78);ctx.clip();
      for(let i=0;i<6;i++){
        const x=551+i*72;ellipse(x,532,30,5,'#000000b0');
        if(i<state.count){
          const since=state.elapsed-INTRO-i*STEP-STEP*REVEAL,t=reduced?1:Math.max(0,Math.min(1,since/800)),ease=1-(1-t)**3;
          const rollingX=i===state.count-1?x+(936-x)*(1-ease):x,bounce=i===state.count-1?Math.abs(Math.sin(t*Math.PI*3))*7*(1-t):0;
          poolBall(rollingX,505-bounce,28,lottery.result[i],i===state.count-1?(1-ease)*7:0,1);
        }else{ctx.strokeStyle='#344650';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,507,25,19,0,0,Math.PI*2);ctx.stroke()}
      }
      ctx.restore();
    }
    function paint(){
      const now=clock(),state=frame(lottery,now),moving=['mixing','suction','reveal'].includes(state.phase),settling=state.phase==='complete'&&state.elapsed<INTRO+5*STEP+STEP*REVEAL+2200;root.dataset.phase=state.phase;
      const removed=new Set(lottery.result.slice(0,state.count));if(state.phase==='suction')removed.add(lottery.result[state.index]);
      if(state.phase==='suction'&&intakeIndex!==state.index){intakeIndex=state.index;const b=physics.bodies[lottery.result[state.index]-1];if(b)intakeOrigin=[206+b.x*(1+b.z/400),140+b.y+b.z*.12]}
      if((moving||settling)&&!reduced){let delta=lastPaint?Math.max(0,Math.min(.05,(now-lastPaint)/1000)):1/60;while(delta>0){const dt=Math.min(delta,1/60);physics.step(moving?dt*2:dt,removed,moving);delta-=dt}}lastPaint=now;
      studio(state);
      for(let i=0;i<6;i++){const shown=i<state.count;resultNodes[i].number.textContent=shown?String(lottery.result[i]).padStart(2,'0'):'—';resultNodes[i].li.dataset.shown=String(shown)}
      const text=state.phase==='idle'?(lottery.status==='open'?'投注開放中，等候主持人開獎':'投注已截止，等候開獎'):state.phase==='complete'?'六顆號碼已開出':state.phase==='mixing'?'氣流攪拌中，準備第 '+(state.index+1)+' 顆':state.phase==='suction'?'第 '+(state.index+1)+' 顆球正在吸入管道…':'第 '+(state.index+1)+' 顆號碼：'+String(lottery.result[state.index]).padStart(2,'0');
      if(text!==lastStatus){status.textContent=text;lastStatus=text}return moving||settling;
    }
    let lastFrameAt=-Infinity;
    const frameInterval=1000/((target.clientWidth||1000)<620?30:60);
    function tick(){
      timer=null;if(destroyed)return;const now=clock(),elapsed=now-lastFrameAt;
      // Preserve the cadence when Date.now rounds a 16.67ms / 33.33ms interval.
      if(elapsed>=frameInterval-1){lastFrameAt=Number.isFinite(lastFrameAt)&&elapsed<frameInterval*2?lastFrameAt+frameInterval:now;if(!paint())return}
      if(raf&&!doc.hidden)timer=raf(tick);
    }
    function update(value){
      const next=value||{status:'open',result:[]},key=String(next.startedAt)+'|'+JSON.stringify(next.result||[]),changed=key!==identity||next.status!==lottery.status||next.prizeName!==lottery.prizeName;
      if(key!==identity){identity=key;physics=createPhysics();intakeIndex=-1;lastPaint=0}
      lottery={...next,result:next.result||[]};heading.textContent='幸福大樂透・'+(lottery.prizeName||'現場開獎');
      if(!changed)return;
      if(timer!==null){caf?.(timer);timer=null}lastFrameAt=-Infinity;tick();
    }
    const visibility=()=>{if(timer!==null){caf?.(timer);timer=null}lastPaint=0;if(!doc.hidden){lastFrameAt=-Infinity;tick()}};doc.addEventListener('visibilitychange',visibility);
    const api={update,destroy(){destroyed=true;if(timer!==null)caf?.(timer);doc.removeEventListener('visibilitychange',visibility);root.remove();target.classList.remove('lottery-machine-host');instances.delete(target)}};instances.set(target,api);paint();return api;
  }
  global.WeddingLottery={mount,frame,count:(lottery,now)=>frame(lottery,now).count,unmount(target){instances.get(target)?.destroy()},duration:INTRO+6*STEP,createPhysics};
})(window);
