/* Small DOM/CSS show: no animation loop, audio, network writes or external assets. */
(function(global){
  const mounted=new WeakMap();
  function mount(target,options={}){
    if(mounted.has(target))return mounted.get(target);
    const doc=options.document||document,random=options.random||Math.random,clock=options.clock||Date.now;
    const schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
    const timers=new Set(),rockets=new Set(),bursts=new Set();
    let entries=[],priority=[],known=new Set(),cursor=0,wanted=false,running=false,paused=false,autoTimer=null,lastLaunch=-Infinity,featured=null;
    const node=(tag,className,text)=>{const e=doc.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e};
    const root=node('section','fireworks-scene');root.setAttribute('aria-label','海上的祝福煙火');
    const heading=node('div','fireworks-heading'),caption=node('span','fireworks-caption','A SKY FULL OF WISHES'),count=node('span','fireworks-count','等待第一份祝福');
    heading.append(caption,count);
    const arena=node('div','fireworks-arena'),actions=node('div','fireworks-actions');
    const launchButton=node('button','fireworks-launch','✧ 再發射一朵'),pauseButton=node('button','fireworks-pause','暫停自動');
    launchButton.type=pauseButton.type='button';pauseButton.setAttribute('aria-pressed','false');
    const guide=node('span','fireworks-guide','自動升空中 · 點煙火，讓祝福提早綻放');
    actions.append(launchButton,pauseButton,guide);root.append(heading,arena,actions);target.replaceChildren(root);
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);fn()},ms);timers.add(id);return id}
    function clear(id){if(id!==null){cancel(id);timers.delete(id)}}
    function controls(){launchButton.disabled=!running||!entries.length||rockets.size>=2;pauseButton.disabled=!entries.length;guide.textContent=paused?'自動已暫停 · 仍可手動發射':entries.length?'自動升空中 · 點煙火，讓祝福提早綻放':'每一朵煙火，都是送給新人的祝福'}
    function empty(){if(!entries.length){arena.replaceChildren();featured=null;const e=node('div','fireworks-empty','第一朵煙火，等你點亮。');e.append(node('span','','送出祝福後，就會在這片海上綻放。'));arena.append(e)}}
    function next(){while(priority.length){const key=priority.shift(),entry=entries.find(b=>b.key===key);if(entry)return entry}return entries.length?entries[cursor++%entries.length]:null}
    function queueAuto(ms=8000){clear(autoTimer);autoTimer=null;if(running&&!paused&&entries.length)autoTimer=later(()=>{autoTimer=null;launch();queueAuto()},ms)}
    function avatar(entry){const wrap=node('span','avatar-mini');
      if(entry.avatarKind==='photo'&&/^[\w-]+$/.test(entry.avatarValue||'')){const image=node('img','');image.alt='';image.src='/api/avatar/'+encodeURIComponent(entry.avatarValue);wrap.append(image)}
      else wrap.textContent=global.weddingAvatarEmoji?.[entry.avatarValue]||'♡';return wrap;
    }
    function burst(record,manual=false){
      if(!running||!rockets.has(record))return;
      clear(record.timer);rockets.delete(record);record.button.remove();
      const entry=entries.find(b=>b.key===record.entry.key);if(!entry){controls();return}
      while(bursts.size>=2){const old=bursts.values().next().value;old.remove();bursts.delete(old)}
      const bloom=node('div','fireworks-burst');bloom.setAttribute('aria-hidden','true');
      bloom.style.setProperty('--burst-x',record.x+'%');bloom.style.setProperty('--burst-y','32%');bloom.style.setProperty('--spark',record.color);
      bloom.append(node('span','fireworks-glow'));
      const radius=Math.min(230,Math.max(85,(arena.clientWidth||300)*.28));
      for(let i=0;i<24;i++){const spark=node('i','fireworks-spark'),angle=i*Math.PI/12,length=radius*(i%2?.72:1);spark.style.setProperty('--dx',Math.cos(angle)*length+'px');spark.style.setProperty('--dy',Math.sin(angle)*length+18+'px');bloom.append(spark)}
      arena.append(bloom);bursts.add(bloom);later(()=>{bloom.remove();bursts.delete(bloom)},1800);
      if(featured)featured.remove();
      const message=node('div','fireworks-message');message.dataset.blessingId=entry.key;message.setAttribute('role','status');message.setAttribute('aria-live','polite');
      message.append(node('div','fireworks-overline','獻給 宇童 ♡ 懷筑'),node('blockquote','',entry.text));
      const author=node('div','fireworks-author');author.append(avatar(entry),node('span','',entry.name));message.append(author);arena.append(message);featured=message;
      later(()=>message.classList.add('leaving'),6000);later(()=>{message.remove();if(featured===message)featured=null},6600);
      controls();if(manual)queueAuto(1200);
    }
    function launch(){
      if(!running||!entries.length||rockets.size>=2||clock()-lastLaunch<350)return false;
      const entry=next();if(!entry)return false;lastLaunch=clock();
      const colors=['#a6e4ff','#f4dc9c','#b6d1ff','#b8eee0'];
      const record={entry,x:30+random()*40,color:colors[Math.floor(random()*colors.length)],button:node('button','fireworks-rocket'),timer:null};
      const button=record.button;button.type='button';button.setAttribute('aria-label','讓 '+entry.name+' 的祝福提早綻放');
      button.style.setProperty('--launch-x',record.x+'%');button.style.setProperty('--spark',record.color);button.style.setProperty('--flight-height',Math.max(80,(arena.clientHeight||240)*.6)+'px');
      button.append(node('span','fireworks-flame'),node('span','fireworks-rocket-label',entry.name+' 的祝福'),node('small','','點我綻放'));
      button.onclick=()=>burst(record,true);rockets.add(record);arena.append(button);record.timer=later(()=>burst(record),2600);controls();return true;
    }
    function stop(){running=false;for(const id of timers)cancel(id);timers.clear();autoTimer=null;rockets.clear();bursts.clear();featured=null;arena.replaceChildren();empty();controls()}
    function reconcile(){const active=wanted&&!doc.hidden;if(active===running)return;if(!active){stop();return}running=true;lastLaunch=-Infinity;empty();controls();queueAuto(700)}
    function update(raw){
      const previous=known;entries=(raw||[]).filter(b=>typeof b.text==='string'&&b.text.trim()).map(b=>({...b,name:String(b.name||'一位賓客'),text:b.text.slice(0,100),key:String(b.id||[b.name,b.text,b.time].join('|'))}));
      known=new Set(entries.map(b=>b.key));priority=priority.filter(key=>known.has(key));
      if(previous.size){const fresh=entries.filter(b=>!previous.has(b.key)).map(b=>b.key);priority.push(...fresh);if(fresh.length)queueAuto(800)}
      for(const record of rockets)if(!known.has(record.entry.key)){clear(record.timer);record.button.remove();rockets.delete(record)}
      if(featured&&!known.has(featured.dataset.blessingId)){featured.remove();featured=null}
      count.textContent=entries.length?entries.length+' 則祝福，持續綻放':'等待第一份祝福';
      if(!entries.length){clear(autoTimer);autoTimer=null;empty()}else if(running&&!paused&&autoTimer===null)queueAuto(700);
      const placeholder=arena.querySelector('.fireworks-empty');if(entries.length&&placeholder)placeholder.remove();controls();
    }
    launchButton.onclick=()=>{if(launch())queueAuto()};
    pauseButton.onclick=()=>{paused=!paused;pauseButton.textContent=paused?'繼續自動':'暫停自動';pauseButton.setAttribute('aria-pressed',String(paused));queueAuto();controls()};
    const visibility=()=>reconcile();doc.addEventListener('visibilitychange',visibility);
    const api={update,setActive(active){wanted=!!active;reconcile()},launch,destroy(){wanted=false;stop();doc.removeEventListener('visibilitychange',visibility);root.remove();mounted.delete(target)}};
    mounted.set(target,api);controls();empty();return api;
  }
  global.WeddingFireworks={mount};
})(window);
