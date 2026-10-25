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
    let inspecting=false;
    let wanted=false,running=false,paused=false,autoTimer=null,pumpTimer=null,resizeTimer=null,lastLaunch=-Infinity,restUntil=0;
    const node=(tag,className,text)=>{const e=doc.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e};
    const root=node('section','fireworks-scene fireworks-garden');root.setAttribute('aria-label','海上的祝福煙火');
    const heading=node('div','fireworks-heading'),caption=node('span','fireworks-caption','A SKY FULL OF WISHES'),count=node('span','fireworks-count','等待第一份祝福');heading.append(caption,count);
    const arena=node('div','fireworks-arena'),actions=node('div','fireworks-actions');
    const launchButton=node('button','fireworks-launch'),image=node('img','fireworks-cats');
    image.src='/firework-cats-v1.webp';image.alt='';image.width=160;image.height=80;image.draggable=false;image.onerror=()=>{image.hidden=true};
    const launchLabel=node('span','fireworks-launch-label','點我，讓祝福升空');
    launchButton.append(image);launchButton.type='button';launchButton.setAttribute('aria-label','請兩隻小貓點燃下一朵祝福煙火');
    const pauseButton=node('button','fireworks-pause','暫停自動');pauseButton.type='button';pauseButton.setAttribute('aria-pressed','false');
    const queueStatus=node('span','fireworks-queue',''),guide=node('span','fireworks-guide','每一朵祝福，都有自己的天空');queueStatus.setAttribute('role','status');queueStatus.setAttribute('aria-live','polite');
    const details=node('dialog','fireworks-details'),detailsText=node('blockquote',''),detailsAuthor=node('p','fireworks-details-author'),detailsClose=node('button','','繼續看煙火');
    details.setAttribute('aria-label','完整祝福');detailsClose.type='button';details.append(detailsText,detailsAuthor,detailsClose);
    details.onclose=()=>{if(!inspecting)return;inspecting=false;if(running){readingWindow();pump()}};
    detailsClose.onclick=()=>{if(details.close)details.close();else{details.hidden=true;details.onclose()}};
    actions.append(launchButton,launchLabel,pauseButton,queueStatus,guide);root.append(heading,arena,actions,details);target.replaceChildren(root);
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);fn()},Math.max(0,ms));timers.add(id);return id}
    function clear(id){if(id!==null){cancel(id);timers.delete(id)}}
    function capacity(){return Math.min(6,slots.length,entries.length)}
    function layout(){
      const width=arena.clientWidth||300,height=arena.clientHeight||300;
      const mobile=width<620,cols=mobile?2:3,rows=mobile?3:2;
      root.dataset.compact=String(mobile);
      root.dataset.tight=String(!mobile&&height<525);
      slots=[];
      const h=mobile?height/3:rows===2?height*.42:height*.64;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const w=width/cols,top=row*h;
        slots.push({id:row*cols+col,mobile,center:row===0&&col===Math.floor(cols/2),left:col*w+5,top:top+4,width:w-10,height:h-8,x:(col+.5)*w,y:top+h/2});
      }
      root.dataset.columns=String(cols);root.dataset.rows=String(rows);
    }
    function controls(){
      launchButton.disabled=!running||!entries.length||pending>=MAX_PENDING;pauseButton.disabled=!entries.length;
      root.dataset.pending=String(pending);root.dataset.active=String(active.size);
      const rest=clock()<restUntil;
      queueStatus.textContent=pending?'待發射 '+pending+' 朵'+(rest?' · 稍作停留後繼續':' · 看完這一輪，再接續綻放'):rest?'讓祝福留在眼前，下一輪即將升空':'';
      guide.textContent=!entries.length?'送出第一份祝福，一起點亮這片海':paused?'自動已暫停 · 點小貓仍可排隊發射':'單發在上方中央 · 多點幾下，最多六朵平均綻放';
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
      if(!active.size){const slot=free.find(slot=>slot.center)||free[0];return slot.mobile?{...slot,solo:true,left:5,width:(arena.clientWidth||300)-10,x:(arena.clientWidth||300)/2}:slot}
      for(const record of active)if(record.slot.solo){
        record.slot=slots.find(slot=>slot.id===record.slot.id);
        record.button?.style.setProperty('--end-x',record.slot.x+'px');
        const startX=(arena.clientWidth||300)/2,startY=Math.max(0,(arena.clientHeight||300)-8),angle=Math.atan2(record.slot.y-startY,record.slot.x-startX)*180/Math.PI+90;
        record.button?.style.setProperty('--angle',angle+'deg');record.trail?.style.setProperty('--angle',angle+'deg');
        if(record.trail)record.trail.style.height=Math.hypot(record.slot.x-startX,record.slot.y-startY)+'px';
        record.bloom?.style.setProperty('--burst-x',record.slot.x+'px');
        if(record.message)fitMessage(record);
      }
      // Choose the largest gap to existing reserved reading spaces.
      return free.sort((a,b)=>Math.min(...[...active].map(r=>(b.x-r.slot.x)**2+(b.y-r.slot.y)**2))-Math.min(...[...active].map(r=>(a.x-r.slot.x)**2+(a.y-r.slot.y)**2)))[0];
    }
    function queueAuto(ms=1100){clear(autoTimer);autoTimer=null;if(running&&!paused&&entries.length)autoTimer=later(()=>{autoTimer=null;if(!pending&&!active.size)launchNow();queueAuto()},ms)}
    function pumpAfter(ms){clear(pumpTimer);pumpTimer=null;if(running&&pending)pumpTimer=later(()=>{pumpTimer=null;pump()},ms)}
    function pump(){
      if(!running||inspecting||!pending||!entries.length)return;
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
      clear(record.flightTimer);clear(record.fadeTimer);clear(record.releaseTimer);clear(record.sparkTimer);clear(record.trailTimer);
      record.trail?.remove();record.button?.remove();record.message?.remove();record.bloom?.remove();active.delete(record);
      if(!active.size){wave=0;restUntil=clock()+BREAK;later(controls,BREAK);if(!paused)queueAuto(BREAK+100)}
      controls();pump();
    }
    function burst(record,manual=false){
      if(!running||!active.has(record)||record.message)return;
      clear(record.flightTimer);record.button.remove();record.button=null;
      const entry=entries.find(b=>b.key===record.entry.key);if(!entry){release(record);return}
      const {slot,color}=record,bloom=node('div','fireworks-burst');bloom.setAttribute('aria-hidden','true');
      bloom.style.setProperty('--burst-x',slot.x+'px');bloom.style.setProperty('--burst-y',slot.y+'px');bloom.style.setProperty('--spark',color);bloom.append(node('span','fireworks-glow'));
      const radius=Math.min(210,slot.width*.44,slot.height*.48);
      // Three rings of glowing embers, followed by a gravity-driven fall.
      for(let i=0;i<54;i++){
        const spark=node('i','fireworks-spark'),angle=i*Math.PI*2/18+(Math.floor(i/18)*.12),ring=1-Math.floor(i/18)*.24,length=radius*ring;
        spark.style.setProperty('--dx',Math.cos(angle)*length+'px');spark.style.setProperty('--dy',Math.sin(angle)*length+'px');
        spark.style.setProperty('--fall',Math.sin(angle)*length+55+'px');spark.style.setProperty('--angle',angle*180/Math.PI+90+'deg');
        spark.style.setProperty('--duration',1.5+(i%5)*.12+'s');bloom.append(spark);
      }
      arena.append(bloom);record.bloom=bloom;record.sparkTimer=later(()=>{bloom.remove();record.bloom=null},2300);
      const message=node('div','fireworks-message');message.dataset.blessingId=entry.key;message.dataset.slot=String(slot.id);message.setAttribute('role','status');message.setAttribute('aria-live','polite');
      message.style.left=slot.left+'px';message.style.top=slot.top+'px';message.style.width=slot.width+'px';message.style.height=slot.height+'px';
      message.append(node('div','fireworks-overline','一份心意，一朵煙火'),node('blockquote','',entry.text));
      const author=node('div','fireworks-author');author.append(avatar(entry),node('span','',entry.name));message.append(author);arena.append(message);record.message=message;
      if(slot.mobile||slot.height<220){
        const read=node('button','fireworks-read','閱讀祝福');read.type='button';read.setAttribute('aria-label','閱讀 '+entry.name+' 的完整祝福');
        read.onclick=()=>{
          inspecting=true;detailsText.textContent=entry.text;detailsAuthor.textContent=entry.name;
          for(const item of active){clear(item.fadeTimer);clear(item.releaseTimer);item.message?.classList.remove('leaving')}
          details.hidden=false;if(details.showModal)details.showModal();
        };message.append(read);
      }
      fitMessage(record);readingWindow();
      controls();if(manual)queueAuto(900);
    }
    function fitMessage(record){
      const {slot,message,entry}=record;
      message.style.left=slot.left+'px';message.style.top=slot.top+'px';message.style.width=slot.width+'px';message.style.height=slot.height+'px';
      message.dataset.compact=String(slot.mobile&&!slot.solo);
      let size=slot.mobile?14:slot.width<360?18:slot.width<520?22:28;
      const min=slot.mobile?12:13,units=Array.from(entry.text).reduce((sum,char)=>sum+(char.charCodeAt(0)>127?1:.58),0);
      if(!slot.mobile)while(size>min&&Math.ceil(units/((slot.width-28)/size))*size*1.5>slot.height-90)size--;
      message.style.setProperty('--message-size',size+'px');
      if(!slot.mobile)while(size>min&&message.scrollHeight>message.clientHeight){size--;message.style.setProperty('--message-size',size+'px')}
    }
    function readingWindow(){
      if(inspecting)return;
      const displayed=[...active].filter(r=>r.message);
      const mobile=slots[0]?.mobile;
      const readTime=Math.max(6500,...displayed.map(r=>3200+Array.from(r.entry.text).length*95),mobile?displayed.reduce((sum,r)=>sum+Array.from(r.entry.text).length*85,3200):0)+(displayed.length-1)*700;
      for(const item of displayed){
        clear(item.fadeTimer);clear(item.releaseTimer);item.message.classList.remove('leaving');
        item.fadeTimer=later(()=>item.message.classList.add('leaving'),readTime);
        item.releaseTimer=later(()=>release(item),readTime+550);
      }
    }
    function launchNow(){
      if(!running||inspecting||!entries.length||clock()<restUntil||clock()-lastLaunch<LAUNCH_GAP||wave>=capacity())return false;
      const slot=freeSlot();if(!slot)return false;const entry=next();if(!entry)return false;
      lastLaunch=clock();wave++;
      const colors=['#a6e4ff','#f4dc9c','#b6d1ff','#b8eee0','#edc9ef'];
      const record={entry,slot,color:colors[Math.floor(random()*colors.length)],button:node('button','fireworks-rocket'),message:null,bloom:null,flightTimer:null,fadeTimer:null,releaseTimer:null,sparkTimer:null};
      const button=record.button;button.type='button';button.dataset.blessingId=entry.key;button.dataset.slot=String(slot.id);button.setAttribute('aria-label','讓 '+entry.name+' 的祝福提早綻放');
      const startX=(arena.clientWidth||300)/2,startY=Math.max(0,(arena.clientHeight||300)-8);
      const angle=Math.atan2(slot.y-startY,slot.x-startX)*180/Math.PI+90;
      button.style.setProperty('--start-x',startX+'px');button.style.setProperty('--start-y',startY+'px');
      button.style.setProperty('--end-x',slot.x+'px');button.style.setProperty('--end-y',slot.y+'px');button.style.setProperty('--spark',record.color);button.style.setProperty('--angle',angle+'deg');
      const trail=node('div','fireworks-trail');trail.setAttribute('aria-hidden','true');
      trail.style.left=startX+'px';trail.style.top=startY+'px';trail.style.height=Math.hypot(slot.x-startX,slot.y-startY)+'px';
      trail.style.setProperty('--angle',angle+'deg');trail.style.setProperty('--spark',record.color);arena.append(trail);record.trail=trail;
      record.trailTimer=later(()=>{trail.remove();record.trail=null},2700);
      const shell=node('span','fireworks-shell');shell.append(node('span','fireworks-flame'));button.append(shell);
      button.onclick=()=>burst(record,true);active.add(record);arena.append(button);record.flightTimer=later(()=>burst(record),FLIGHT);
      launchButton.setAttribute('data-igniting','true');later(()=>launchButton.setAttribute('data-igniting','false'),300);controls();return true;
    }
    function requestLaunch(){
      if(!running||!entries.length||pending>=MAX_PENDING)return false;
      pending++;controls();pump();return true;
    }
    function stop(preserve=true){
      running=false;inspecting=false;if(details.open)details.close();else details.hidden=true;if(preserve){resume.push(...[...active].map(r=>r.entry.key));pending+=active.size}
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
