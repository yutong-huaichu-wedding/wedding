/* Shared timestamp drives every screen; the machine never chooses a result. */
(function(global){
  const INTRO=2400,STEP=4200,REVEAL=.8,instances=new WeakMap();let serial=0;
  function frame(lottery,now=Date.now()){
    const numbers=lottery.result||[];
    if(lottery.status!=='drawn'||numbers.length!==6)return {phase:'idle',count:0,index:0,progress:0,elapsed:0};
    const elapsed=Math.max(0,now-Number(lottery.startedAt||0)),after=elapsed-INTRO;
    const count=Math.min(6,Math.max(0,Math.floor((after+STEP*(1-REVEAL))/STEP)));
    const index=Math.min(5,Math.max(0,Math.floor(after/STEP))),progress=after<0?0:(after%STEP)/STEP;
    return {phase:count===6?'complete':after<0||progress<.34?'mixing':progress<REVEAL?'suction':'reveal',count,index,progress,elapsed};
  }
  function mount(target,options={}){
    if(instances.has(target))return instances.get(target);
    const doc=options.document||document,clock=options.clock||Date.now,raf=options.requestAnimationFrame||global.requestAnimationFrame?.bind(global),caf=options.cancelAnimationFrame||global.cancelAnimationFrame?.bind(global);
    const html=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e};
    const svg=(tag,attrs={},children=[])=>{const e=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));e.append(...children);return e};
    const reduced=global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    const prefix='wedding-draw-'+(++serial),root=html('section','lottery-machine'),heading=html('div','lottery-machine-heading','幸福開獎實況'),status=html('p','lottery-machine-status','等候主持人開獎');
    root.setAttribute('aria-label','幸福大樂透吸球開獎機');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const picture=svg('svg',{viewBox:'0 0 640 455','font-family':'Arial, sans-serif',class:'lottery-machine-svg','aria-hidden':'true'}),defs=svg('defs');
    const gradient=(id,stops)=>svg('radialGradient',{id:prefix+id,cx:'.3',cy:'.25',r:'.8'},stops.map(([offset,color,opacity=1])=>svg('stop',{offset,'stop-color':color,'stop-opacity':opacity})));
    defs.append(gradient('-glass',[['0%','#d4f6ff',.18],['70%','#62bad0',.06],['100%','#bbf6ff',.42]]),gradient('-ball',[['0%','#fff'],['45%','#fff5c9'],['100%','#d9a64c']]),svg('clipPath',{id:prefix+'-clip'},[svg('circle',{cx:320,cy:275,r:139})]));
    picture.append(defs,svg('ellipse',{cx:320,cy:432,rx:185,ry:12,fill:'#001d364d'}));
    const pipe='M320 220 V66 Q320 50 336 50 H496 Q512 50 512 66 V172';
    picture.append(svg('path',{d:pipe,fill:'none',stroke:'#071f34','stroke-width':36,'stroke-linecap':'round','stroke-linejoin':'round'}),svg('path',{d:pipe,fill:'none',stroke:'#b8edff','stroke-opacity':'.45','stroke-width':29,'stroke-linecap':'round'}),svg('path',{d:pipe,fill:'none',stroke:'#e2fbff','stroke-opacity':'.6','stroke-width':2}));
    picture.append(svg('rect',{x:464,y:160,width:96,height:110,rx:24,fill:'#082d48',stroke:'#99dcf0','stroke-width':2}),svg('text',{x:512,y:252,'text-anchor':'middle',fill:'#bddfec','font-size':12},[]));
    picture.lastChild.textContent='DRAWN BALL';
    picture.append(svg('circle',{cx:320,cy:275,r:146,fill:'url(#'+prefix+'-glass)',stroke:'#a6dfef','stroke-width':5}),svg('circle',{cx:320,cy:275,r:137,fill:'#061f3538',stroke:'#ffffff20','stroke-width':2}));
    const mixer=svg('g',{'clip-path':'url(#'+prefix+'-clip)'}),colors=['#e6bd6d','#adddf4','#eed0d1','#b8dfcd','#cad2ef'];
    const balls=Array.from({length:49},(_,i)=>{
      const g=svg('g'),c=svg('circle',{r:12,fill:colors[Math.floor(i/10)],stroke:'#ffffffaa','stroke-width':1.5}),shine=svg('ellipse',{cx:-3,cy:-4,rx:5,ry:3,fill:'#ffffff99'}),text=svg('text',{'text-anchor':'middle','dominant-baseline':'central',fill:'#123951','font-size':10,'font-weight':800});text.textContent=String(i+1);g.append(c,shine,text);mixer.append(g);return g;
    });picture.append(mixer);
    picture.append(svg('path',{d:'M245 170 Q202 198 199 245',fill:'none',stroke:'#e4fbff','stroke-opacity':'.6','stroke-width':8,'stroke-linecap':'round'}),svg('ellipse',{cx:320,cy:404,rx:86,ry:13,fill:'#b4e5ee33'}));
    const fan=svg('g'),fanCenter=svg('circle',{cx:320,cy:408,r:17,fill:'#79b7ca'});for(let i=0;i<4;i++)fan.append(svg('ellipse',{cx:320,cy:398,rx:5,ry:13,fill:'#ecfaff99',transform:'rotate('+i*90+' 320 408)'}));fan.append(fanCenter);picture.append(fan);
    const shell=svg('g'),shellBall=svg('circle',{r:25,fill:'url(#'+prefix+'-ball)',stroke:'#fff7dd','stroke-width':3}),shellText=svg('text',{'text-anchor':'middle','dominant-baseline':'central',fill:'#5a421b','font-size':25,'font-weight':800});shell.append(shellBall,shellText);picture.append(shell);
    picture.append(svg('rect',{x:214,y:420,width:212,height:25,rx:9,fill:'#225d78',stroke:'#92c9db'}));
    const results=html('ol','lottery-results'),resultNodes=Array.from({length:6},(_,i)=>{const li=html('li','lottery-result'),label=html('small','','第 '+(i+1)+' 顆'),number=html('strong','','—');li.append(label,number);results.append(li);return {li,number}});
    root.append(heading,picture,status,results);target.replaceChildren(root);target.classList.add('lottery-machine-host');
    let lottery={status:'open',result:[]},timer=null,destroyed=false,lastStatus='';
    const points=[[320,345],[320,205],[320,66],[336,50],[496,50],[512,66],[512,201]];
    function position(progress){
      const segments=[.18,.28,.04,.30,.04,.16];let t=Math.max(0,Math.min(1,(progress-.34)/.46));
      for(let i=0;i<segments.length;i++){if(t<=segments[i]||i===segments.length-1){const f=Math.min(1,t/segments[i]);return [points[i][0]+(points[i+1][0]-points[i][0])*f,points[i][1]+(points[i+1][1]-points[i][1])*f]}t-=segments[i]}
    }
    function paint(){
      const state=frame(lottery,clock()),moving=state.phase==='mixing'||state.phase==='suction'||state.phase==='reveal';root.dataset.phase=state.phase;
      const removed=new Set((lottery.result||[]).slice(0,state.count));if(state.phase==='suction')removed.add(lottery.result[state.index]);
      for(let i=0;i<balls.length;i++){
        const angle=i*2.399963+(moving&&!reduced?state.elapsed*(.0014+(i%7)*.00013)*(i%2?1:-1):0),radius=25+Math.sqrt((i+.5)/49)*(moving&&!reduced?88+12*Math.sin(state.elapsed*.002+i*1.7):100);
        const x=320+Math.cos(angle)*radius,y=275+Math.sin(angle)*radius*.93;
        balls[i].setAttribute('transform','translate('+x.toFixed(1)+' '+y.toFixed(1)+')');balls[i].setAttribute('opacity',removed.has(i+1)?'0':'1');
      }
      fan.setAttribute('transform',moving&&!reduced?'rotate('+(state.elapsed*.45%360)+' 320 408)':'');
      shell.setAttribute('opacity',state.phase==='idle'||state.phase==='mixing'||reduced&&state.phase==='suction'?'0':'1');
      const point=state.phase==='reveal'||state.phase==='complete'?[512,201]:position(state.progress);shell.setAttribute('transform','translate('+point.join(' ')+')');
      const revealed=state.phase==='reveal'||state.phase==='complete';shellBall.setAttribute('r',revealed?'25':'12');shellBall.setAttribute('stroke-width',revealed?'3':'1.5');shellText.setAttribute('font-size',revealed?'25':'13');
      shellText.textContent=state.phase==='reveal'||state.phase==='complete'?String(lottery.result[state.index]).padStart(2,'0'):'?';
      for(let i=0;i<6;i++){const shown=i<state.count;resultNodes[i].number.textContent=shown?String(lottery.result[i]).padStart(2,'0'):'—';resultNodes[i].li.dataset.shown=String(shown)}
      const text=state.phase==='idle'?(lottery.status==='open'?'投注開放中，等候主持人開獎':'投注已截止，等候開獎'):state.phase==='complete'?'六顆號碼已開出':state.phase==='mixing'?'氣流攪拌中，準備第 '+(state.index+1)+' 顆':state.phase==='suction'?'第 '+(state.index+1)+' 顆球正在吸入管道…':'第 '+(state.index+1)+' 顆號碼：'+String(lottery.result[state.index]).padStart(2,'0');
      if(text!==lastStatus){status.textContent=text;lastStatus=text}
      return moving;
    }
    function tick(){timer=null;if(!destroyed&&paint()&&raf&&!doc.hidden)timer=raf(tick)}
    function update(value){lottery=value||{status:'open',result:[]};if(timer!==null){caf?.(timer);timer=null}tick()}
    const visibility=()=>{if(timer!==null){caf?.(timer);timer=null}if(!doc.hidden)tick()};doc.addEventListener('visibilitychange',visibility);
    const api={update,destroy(){destroyed=true;if(timer!==null)caf?.(timer);doc.removeEventListener('visibilitychange',visibility);root.remove();target.classList.remove('lottery-machine-host');instances.delete(target)}};instances.set(target,api);paint();return api;
  }
  global.WeddingLottery={mount,frame,count:(lottery,now)=>frame(lottery,now).count,unmount(target){instances.get(target)?.destroy()},duration:INTRO+6*STEP};
})(window);
