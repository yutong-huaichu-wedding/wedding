/* Reserved reading spaces, bounded effects, and a persistent manual launch queue. */
(function(global){
  const mounted=new WeakMap();
  function mount(target,options={}){
    if(mounted.has(target))return mounted.get(target);
    const doc=options.document||document,random=options.random||Math.random,clock=options.clock||Date.now;
    const schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
    const timers=new Set(),active=new Set();
    const MAX_PENDING=120,FLIGHT=2100,LAUNCH_GAP=420,BREAK=1400;
    let entries=[],priority=[],resume=[],known=new Set(),cursor=0,slots=[],pending=0,wave=0;
    let wanted=false,running=false,paused=false,autoTimer=null,pumpTimer=null,resizeTimer=null,lastLaunch=-Infinity,restUntil=0;
    const node=(tag,className,text)=>{const e=doc.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e};
    const root=node('section','fireworks-scene fireworks-garden');root.setAttribute('aria-label','海上的祝福煙火');
    const heading=node('div','fireworks-heading'),caption=node('span','fireworks-caption','A SKY FULL OF WISHES'),count=node('span','fireworks-count','等待第一份祝福');heading.append(caption,count);
    const arena=node('div','fireworks-arena'),actions=node('div','fireworks-actions');
    const launchButton=node('button','fireworks-launch'),image=node('img','fireworks-cats');
    image.src='/firework-cats-v1.webp';image.alt='';image.width=160;image.height=80;image.draggable=false;image.onerror=()=>{image.hidden=true};
    const launchLabel=node('span','fireworks-launch-label','點我，讓祝福升空');
    launchButton.append(image,launchLabel);launchButton.type='button';launchButton.setAttribute('aria-label','請兩隻小貓點燃下一朵祝福煙火');
    const pauseButton=node('button','fireworks-pause','暫停自動');pauseButton.type='button';pauseButton.setAttribute('aria-pressed','false');
    const queueStatus=node('span','fireworks-queue',''),guide=node('span','fireworks-guide','每一朵祝福，都有自己的天空');queueStatus.setAttribute('role','status');queueStatus.setAttribute('aria-live','polite');
    actions.append(launchButton,pauseButton,queueStatus,guide);root.append(heading,arena,actions);target.replaceChildren(root);
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);fn()},Math.max(0,ms));timers.add(id);return id}
    function clear(id){if(id!==null){cancel(id);timers.delete(id)}}
    function capacity(){return Math.min(slots.length,entries.length)}
    function layout(){
      const width=arena.clientWidth||300,height=arena.clientHeight||300;
      const cols=width>=1080?3:width>=620?2:1,rows=height>=580?2:1;
      slots=[];
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const w=width/cols,h=height/rows;
        slots.push({id:row*cols+col,left:col*w+8,top:row*h+6,width:w-16,height:h-12,x:(col+.5)*w,y:(row+.5)*h});
      }
      root.dataset.columns=String(cols);root.dataset.rows=String(rows);
    }
    function controls(){
      launchButton.disabled=!running||!entries.length||pending>=MAX_PENDING;pauseButton.disabled=!entries.length;
      root.dataset.pending=String(pending);root.dataset.active=String(active.size);
      const rest=clock()<restUntil;
      queueStatus.textContent=pending?'待發射 '+pending+' 朵'+(rest?' · 稍作停留後繼續':' · 看完這一輪，再接續綻放'):rest?'讓祝福留在眼前，下一輪即將升空':'';
      guide.textContent=!entries.length?'送出第一份祝福，一起點亮這片海':paused?'自動已暫停 · 點小貓仍可排隊發射':'自動綻放中 · 連點會排隊，每一則都能讀完';
      launchLabel.textContent=pending?'再點一朵，加入隊伍':'點我，讓祝福升空';
    }
    function empty(){if(!entries.length){arena.replaceChildren();const e=node('div','fireworks-empty','第一朵煙火，等你點亮。');e.append(node('span','','送出祝福後，就會在這片海上綻放。'));arena.append(e)}}
    function next(){
      const busy=new Set([...active].map(r=>r.entry.key));
      for(const queue of [resume,priority])for(let i=0;i<queue.length;){const key=queue[i],entry=entries.find(b=>b.key===key);if(!entry){queue.splice(i,1);continue}if(busy.has(key)){i++;continue}queue.splice(i,1);return entry}
      for(let i=0;i<entries.length;i++){const entry=entries[cursor++%entries.length];if(!busy.has(entry.key))return entry}return null;
    }
    function freeSlot(){
      const used=new Set([...active].map(r=>r.slot.id));
      const free=slots.filter(slot=>!used.has(slot.id));if(!free.length)return null;
      if(!active.size)return free[Math.floor(random()*free.length)];
      // Choose the largest gap to existing reserved reading spaces.
      return free.sort((a,b)=>Math.min(...[...active].map(r=>(b.x-r.slot.x)**2+(b.y-r.slot.y)**2))-Math.min(...[...active].map(r=>(a.x-r.slot.x)**2+(a.y-r.slot.y)**2)))[0];
    }
    function queueAuto(ms=1100){clear(autoTimer);autoTimer=null;if(running&&!paused&&entries.length)autoTimer=later(()=>{autoTimer=null;if(!pending)launchNow();queueAuto()},ms)}
    function pumpAfter(ms){clear(pumpTimer);pumpTimer=null;if(running&&pending)pumpTimer=later(()=>{pumpTimer=null;pump()},ms)}
    function pump(){
      if(!running||!pending||!entries.length)return;
      const wait=Math.max(restUntil-clock(),lastLaunch+LAUNCH_GAP-clock());if(wait>0){pumpAfter(wait);return}
      if(launchNow()){pending--;controls();if(pending)pumpAfter(LAUNCH_GAP)}
      // Full waves wait for release(); a full sky never discards a click.
    }
    function avatar(entry){const wrap=node('span','avatar-mini');
      if(entry.avatarKind==='photo'&&/^[\w-]+$/.test(entry.avatarValue||'')){const img=node('img','');img.alt='';img.src='/api/avatar/'+encodeURIComponent(entry.avatarValue);wrap.append(img)}
      else wrap.textContent=global.weddingAvatarEmoji?.[entry.avatarValue]||'♡';return wrap;
    }
    function release(record){
      if(!active.has(record))return;
      clear(record.flightTimer);clear(record.fadeTimer);clear(record.releaseTimer);clear(record.sparkTimer);
      record.button?.remove();record.message?.remove();record.bloom?.remove();active.delete(record);
      if(!active.size&&wave>=capacity()){wave=0;restUntil=clock()+BREAK;later(controls,BREAK);if(!paused)queueAuto(BREAK+100)}
      controls();pump();
    }
    function burst(record,manual=false){
      if(!running||!active.has(record)||record.message)return;
      clear(record.flightTimer);record.button.remove();record.button=null;
      const entry=entries.find(b=>b.key===record.entry.key);if(!entry){release(record);return}
      const {slot,color}=record,bloom=node('div','fireworks-burst');bloom.setAttribute('aria-hidden','true');
      bloom.style.setProperty('--burst-x',slot.x+'px');bloom.style.setProperty('--burst-y',slot.y+'px');bloom.style.setProperty('--spark',color);bloom.append(node('span','fireworks-glow'));
      const radius=Math.min(180,slot.width*.42,slot.height*.43);
      for(let i=0;i<20;i++){const spark=node('i','fireworks-spark'),angle=i*Math.PI/10,length=radius*(i%2?.7:1);spark.style.setProperty('--dx',Math.cos(angle)*length+'px');spark.style.setProperty('--dy',Math.sin(angle)*length+'px');bloom.append(spark)}
      arena.append(bloom);record.bloom=bloom;record.sparkTimer=later(()=>{bloom.remove();record.bloom=null},1800);
      const message=node('div','fireworks-message');message.dataset.blessingId=entry.key;message.dataset.slot=String(slot.id);message.setAttribute('role','status');message.setAttribute('aria-live','polite');
      message.style.left=slot.left+'px';message.style.top=slot.top+'px';message.style.width=slot.width+'px';message.style.height=slot.height+'px';
      message.append(node('div','fireworks-overline','一份心意，一朵煙火'),node('blockquote','',entry.text));
      const author=node('div','fireworks-author');author.append(avatar(entry),node('span','',entry.name));message.append(author);arena.append(message);record.message=message;
      // Fit the complete message inside its reserved space; no clipping or ellipsis.
      let size=slot.width<360?18:slot.width<520?22:28;
      const units=Array.from(entry.text).reduce((sum,char)=>sum+(char.charCodeAt(0)>127?1:.58),0),usableWidth=slot.width-28,usableHeight=slot.height-90;
      while(size>13&&Math.ceil(units/(usableWidth/size))*size*1.5>usableHeight)size--;
      message.style.setProperty('--message-size',size+'px');
      while(size>13&&message.scrollHeight>message.clientHeight){size--;message.style.setProperty('--message-size',size+'px')}
      // Start a shared reading window after the latest bloom: early messages
      // cannot disappear while the rest of their wave is still arriving.
      const displayed=[...active].filter(r=>r.message);
      const readTime=Math.max(6500,...displayed.map(r=>3200+Array.from(r.entry.text).length*95))+(displayed.length-1)*700;
      for(const item of displayed){
        clear(item.fadeTimer);clear(item.releaseTimer);
        item.fadeTimer=later(()=>item.message.classList.add('leaving'),readTime);
        item.releaseTimer=later(()=>release(item),readTime+550);
      }
      controls();if(manual)queueAuto(900);
    }
    function launchNow(){
      if(!running||!entries.length||clock()<restUntil||clock()-lastLaunch<LAUNCH_GAP||wave>=capacity())return false;
      const slot=freeSlot();if(!slot)return false;const entry=next();if(!entry)return false;
      lastLaunch=clock();wave++;
      const colors=['#a6e4ff','#f4dc9c','#b6d1ff','#b8eee0','#edc9ef'];
      const record={entry,slot,color:colors[Math.floor(random()*colors.length)],button:node('button','fireworks-rocket'),message:null,bloom:null,flightTimer:null,fadeTimer:null,releaseTimer:null,sparkTimer:null};
      const button=record.button;button.type='button';button.dataset.blessingId=entry.key;button.dataset.slot=String(slot.id);button.setAttribute('aria-label','讓 '+entry.name+' 的祝福提早綻放');
      button.style.setProperty('--start-x',(arena.clientWidth||300)*(.4+random()*.2)+'px');button.style.setProperty('--start-y',Math.max(0,(arena.clientHeight||300)-20)+'px');
      button.style.setProperty('--end-x',slot.x+'px');button.style.setProperty('--end-y',slot.y+'px');button.style.setProperty('--spark',record.color);
      button.append(node('span','fireworks-flame'),node('span','fireworks-rocket-label',entry.name+' 的祝福'),node('small','','點我綻放'));
      button.onclick=()=>burst(record,true);active.add(record);arena.append(button);record.flightTimer=later(()=>burst(record),FLIGHT);
      launchButton.setAttribute('data-igniting','true');later(()=>launchButton.setAttribute('data-igniting','false'),300);controls();return true;
    }
    function requestLaunch(){
      if(!running||!entries.length||pending>=MAX_PENDING)return false;
      pending++;controls();pump();return true;
    }
    function stop(preserve=true){
      running=false;if(preserve){resume.push(...[...active].map(r=>r.entry.key));pending+=active.size}
      for(const id of timers)cancel(id);timers.clear();autoTimer=pumpTimer=resizeTimer=null;active.clear();wave=0;restUntil=0;arena.replaceChildren();empty();controls();
    }
    function reconcile(){
      const visible=wanted&&!doc.hidden;if(visible===running)return;if(!visible){stop();return}
      running=true;lastLaunch=-Infinity;layout();empty();controls();if(pending)pump();queueAuto(700);
    }
    function update(raw){
      const previous=known;entries=(raw||[]).filter(b=>typeof b.text==='string'&&b.text.trim()).map(b=>({...b,name:String(b.name||'一位賓客'),text:b.text.slice(0,100),key:String(b.id||[b.name,b.text,b.time].join('|'))}));
      known=new Set(entries.map(b=>b.key));priority=priority.filter(key=>known.has(key));resume=resume.filter(key=>known.has(key));
      if(previous.size){const fresh=entries.filter(b=>!previous.has(b.key)).map(b=>b.key);priority.push(...fresh);if(fresh.length)queueAuto(800)}
      for(const record of [...active])if(!known.has(record.entry.key))release(record);
      count.textContent=entries.length?entries.length+' 則祝福，持續綻放':'等待第一份祝福';
      if(!entries.length){pending=0;wave=0;clear(autoTimer);clear(pumpTimer);autoTimer=pumpTimer=null;empty()}
      else {arena.querySelector('.fireworks-empty')?.remove();if(running&&!paused&&autoTimer===null)queueAuto(700);if(pending&&pumpTimer===null)pump()}
      controls();
    }
    launchButton.onclick=requestLaunch;
    pauseButton.onclick=()=>{paused=!paused;pauseButton.textContent=paused?'繼續自動':'暫停自動';pauseButton.setAttribute('aria-pressed',String(paused));queueAuto();controls()};
    const visibility=()=>reconcile();doc.addEventListener('visibilitychange',visibility);
    const resize=()=>{if(!running)return;clear(resizeTimer);resizeTimer=later(()=>{resizeTimer=null;stop();reconcile()},180)};global.addEventListener?.('resize',resize);
    const api={update,setActive(value){wanted=!!value;reconcile()},launch:requestLaunch,destroy(){wanted=false;stop(false);doc.removeEventListener('visibilitychange',visibility);global.removeEventListener?.('resize',resize);root.remove();mounted.delete(target)}};
    mounted.set(target,api);controls();empty();return api;
  }
  global.WeddingFireworks={mount};
})(window);
