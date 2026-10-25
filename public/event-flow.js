/* Guest navigation for the retained wedding activities. */
(function(root){
 const $=id=>document.getElementById(id);
 const labels={reception:'歡迎入席',cat:'小貓迷因',mahjong:'麻將問答',lotto:'幸福大樂透'};
 let config={},live={activity:{mode:'reception',serial:'initial'}},applied='',paused=false,reading=false,busy=false,ready=false,lastRead=0;
 let gameEntryIntent=new URLSearchParams(location.search).get('play')==='1';
 const guestReady=()=>config.isGuest?.()&&!config.isHost?.()&&!config.display;
 function follow(){
  if(!guestReady())return;
  const activity=live.activity||{mode:'reception',serial:'initial'};
  if(applied===activity.serial)return;
  const first=applied==='';applied=activity.serial;
  if(first&&paused)return;
  paused=false;
  if(activity.mode==='lotto'){config.navigate?.('games');config.lottery?.()}
  else if(activity.mode==='cat'||activity.mode==='mahjong')config.navigate?.('gameEntry');
  else config.navigate?.(gameEntryIntent?'gameEntry':'home');
 }
 function pause(){if(guestReady()){paused=true;render()}}
 function resume(){applied='';paused=false;follow();render()}
 function enter(){gameEntryIntent=true;if(!config.isGuest?.()){config.navigate?.('checkin');return}resume()}
 function gameUrl(){return new URL('/wedding_1212?play=1&openExternalBrowser=1',location.href).href}
 function render(){
  const activity=live.activity||{mode:'reception'};
  const banner=$('guestActivityBar');
  if(banner){banner.hidden=!guestReady()||activity.mode==='reception';$('guestActivityName').textContent=(paused?'暫時離開活動｜':'正在進行｜')+(labels[activity.mode]||'婚禮活動');$('resumeActivity').hidden=!paused}
  if($('gameJoinStatus'))$('gameJoinStatus').textContent=activity.mode==='cat'||activity.mode==='mahjong'?'請看現場投影並依主持人指示參與。':activity.mode==='lotto'?'大樂透已在遊戲頁面。':'請等待主持人開始活動。';
  for(const el of document.querySelectorAll('[data-event-status]'))el.textContent='賓客目前：'+(labels[activity.mode]||'歡迎入席');
  for(const el of document.querySelectorAll('[data-event-mode]')){el.disabled=busy;el.setAttribute('aria-pressed',String(el.dataset.eventMode===activity.mode))}
 }
 async function refresh(){
  if(reading||document.hidden)return;
  reading=true;
  try{const response=await fetch('/api/activity',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error();live=await response.json();follow();render();if($('eventConnection'))$('eventConnection').textContent=''}
  catch{if($('eventConnection'))$('eventConnection').textContent='活動連線中斷，正在重新連線…'}
  finally{reading=false;lastRead=Date.now()}
 }
 async function command(type,fields={}){
  if(busy)return null;busy=true;render();
  try{const response=await fetch('/api/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(config.authHeaders?.()||{})},signal:AbortSignal.timeout(10000),body:JSON.stringify({type,...fields})});const result=await response.json();if(!response.ok)throw Error(result.error||'操作未完成');return result}
  catch(error){config.notice?.(error.message);return null}
  finally{busy=false;render();void refresh()}
 }
 async function change(mode){if(!Object.hasOwn(labels,mode))return;const result=await command('eventActivity',{mode});if(result){live.activity=result.activity;render();config.notice?.('已切換賓客到「'+labels[mode]+'」')}}
 function init(options={}){
  config={...config,...options};if(ready)return;ready=true;
  for(const host of document.querySelectorAll('[data-event-host]')){
   host.innerHTML='<h3>切換賓客活動</h3><p class="small">小貓與麻將請看現場投影；樂透可在手機選號。</p><div class="event-host-actions">'+Object.entries(labels).map(([mode,label])=>'<button type="button" data-event-mode="'+mode+'">'+label+'</button>').join('')+'</div><p data-event-status></p><div class="event-entry-actions"><button type="button" data-show-game-qr>投影遊戲 QR Code</button><button type="button" data-copy-game-url>複製遊戲入口</button></div>';
   for(const button of host.querySelectorAll('[data-event-mode]'))button.onclick=()=>void change(button.dataset.eventMode);
   host.querySelector('[data-show-game-qr]').onclick=()=>void command('projectionMode',{mode:'join'});
   host.querySelector('[data-copy-game-url]').onclick=async()=>{try{await navigator.clipboard.writeText(gameUrl());config.notice?.('遊戲入口已複製')}catch{config.notice?.('遊戲入口：'+gameUrl())}};
  }
  if($('resumeActivity'))$('resumeActivity').onclick=resume;
  for(const button of document.querySelectorAll('[data-enter-game]'))button.onclick=enter;
  for(const button of document.querySelectorAll('#tabs button,[data-guest-shortcut]'))button.addEventListener('click',pause);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});root.addEventListener('focus',()=>void refresh());
  setInterval(()=>{if(!document.hidden&&!reading&&Date.now()-lastRead>=(live.activity.mode==='reception'&&!gameEntryIntent?10000:3000))void refresh()},1000);
  render();void refresh();
 }
 root.WeddingEvent={init,refresh,render,change,pause,resume,enter,gameUrl};
})(window);
