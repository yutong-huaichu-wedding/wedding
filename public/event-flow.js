/* Guest navigation follows one host-controlled activity; drafts stay in their original DOM. */
(function(root){
 const $=id=>document.getElementById(id),labels={reception:'歡迎入席',quiz:'快問快答',cat:'小貓搶答',mahjong:'麻將搶答',lotto:'大樂透開獎'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let joinedId='',joining=false,lastJoinAttempt=0;
 let gameEntryIntent=new URLSearchParams(location.search).get('play')==='1';
 let config={},live={activity:{mode:'reception',serial:'initial'},quiz:null},applied='',paused=false,reading=false,busy=false,offset=0,ready=false,lastRead=0,readVersion=0,editing='',questionSignature='';
 const timerNow=()=>Date.now()+offset;
 const guestReady=()=>config.isGuest?.()&&!config.isHost?.()&&!config.display;
 function savedKey(){return 'wedding-live-answer:'+config.guestId?.()+':'+live.quiz?.round}
 function ownChoice(){try{const value=localStorage.getItem(savedKey());return value===null?null:Number(value)}catch{return null}}
 async function joinGame(){
  const id=config.guestId?.();if(!guestReady()||!id||joinedId===id||joining||Date.now()-lastJoinAttempt<5000||!gameEntryIntent&&live.activity.mode==='reception')return;
  joining=true;lastJoinAttempt=Date.now();
  try{const response=await fetch('/api/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(config.authHeaders?.()||{})},signal:AbortSignal.timeout(6000),body:JSON.stringify({type:'gameJoin'})});if(response.ok)joinedId=id;}
  catch{}finally{joining=false;render()}
 }
 function follow(){
  if(!guestReady())return;void joinGame();
  const a=live.activity;if(applied===a.serial)return;applied=a.serial;paused=false;
  if(a.mode==='reception')config.navigate?.(gameEntryIntent?'gameEntry':'home');
  else if(a.mode==='quiz')config.navigate?.('liveQuiz');
  else if(a.mode==='lotto'){config.navigate?.('games');config.lottery?.()}
  else{config.navigate?.('buzzer');root.WeddingBuzzer?.refresh()}
 }
 function pause(){if(guestReady()){paused=true;render()}}
 function resume(){applied='';paused=false;follow();render()}
 function enter(){gameEntryIntent=true;if(!config.isGuest?.()){config.navigate?.('checkin');return}resume()}
 function gameUrl(){return new URL('/wedding_1212?play=1&openExternalBrowser=1',location.href).href}
 function playersMarkup(){
  const players=live.players||{count:0,names:[]},names=players.names||[],pages=Math.max(1,Math.ceil(names.length/36)),page=Math.floor(timerNow()/6000)%pages;
  return '<div class="game-roster"><p class="game-player-count">已加入 <strong>'+players.count+'</strong> 人</p>'+(names.length?'<p class="game-newcomers">最近加入：'+names.slice(0,3).map(esc).join('、')+'</p><div class="game-player-names">'+names.slice(page*36,(page+1)*36).map(name=>'<span>'+esc(name)+'</span>').join('')+'</div>'+(pages>1?'<p class="small">參加者名單 '+(page+1)+' / '+pages+'（自動輪播）</p>':''):'<p>掃碼或從婚禮首頁進入遊戲，姓名就會出現在這裡。</p>')+'</div>';
 }
 function quizMarkup(projection=false){
  const q=live.quiz;if(!q?.question)return '<h2>快問快答</h2><p>請等待主持人出題</p>'+(projection?playersMarkup():'<p>已加入 '+(live.players?.count||0)+' 人</p>');
  const question=q.question,remaining=Math.max(0,Math.ceil((q.endsAt-timerNow())/1000)),open=q.open&&(!q.endsAt||remaining>0),own=ownChoice();
  const options=question.options.map((option,i)=>'<'+(projection?'div':'button')+(projection?'':' type="button" data-live-choice="'+i+'" '+(!open||own!==null||busy?'disabled':''))+' class="live-choice '+(!open&&question.correct===i?'right ':'')+(own===i?'selected':'')+'"><b>'+['A','B','C','D'][i]+'</b><span>'+esc(option)+'</span></'+(projection?'div':'button')+'>').join('');
  return '<p class="live-meta">第 '+(q.index+1)+' / '+q.total+' 題　'+(open?(q.endsAt?remaining+' 秒':'作答中'):'已截止')+'　'+q.answered+' 人已答／'+(live.players?.count||0)+' 人已加入</p><h2>'+esc(question.text)+'</h2><p class="live-score-rule">'+(q.scoring==='speed'?'答對最高 1000 分，越快答對越高分；答錯 0 分。':'請在時間內選出正確答案。')+'</p><div class="live-options">'+options+'</div><p class="live-answer-status">'+(open?(own!==null?'✔ 已送出，請等公布答案':'選一個答案，送出後不能修改'):Number.isInteger(question.correct)?'正確答案：'+['A','B','C','D'][question.correct]+(own!==null?(own===question.correct?'　🎉 你答對了！':'　下題再加油！'):''):'正在公布答案…')+'</p>'+(!open&&q.leaders?.length?'<h3>目前排行榜</h3><ol class="live-leaders">'+q.leaders.map(g=>'<li>'+esc(g.name)+' <strong>'+g.score+' 分</strong></li>').join('')+'</ol>':'');
 }
 function setMarkup(target,markup){if(target&&target._liveMarkup!==markup){target.innerHTML=markup;target._liveMarkup=markup}}
 function render(){
  const banner=$('guestActivityBar');if(banner){banner.hidden=!guestReady()||live.activity.mode==='reception';$('guestActivityName').textContent=(paused?'暫時離開活動｜':'正在進行｜')+(labels[live.activity.mode]||'婚禮活動');$('resumeActivity').hidden=!paused}
  for(const el of document.querySelectorAll('[data-event-count]'))el.textContent='已加入 '+(live.players?.count||0)+' 人';
  for(const el of document.querySelectorAll('[data-event-players]'))setMarkup(el,playersMarkup());
  if($('gameJoinStatus'))$('gameJoinStatus').textContent=(joinedId===config.guestId?.()?'✔ 已加入遊戲':'正在加入遊戲…')+'｜目前 '+(live.players?.count||0)+' 人已加入';
  if(config.display&&config.projectionMode?.()==='join')setMarkup($('gameLobbyProjection'),playersMarkup());
  for(const el of document.querySelectorAll('[data-event-status]'))el.textContent='賓客目前：'+labels[live.activity.mode];
  for(const el of document.querySelectorAll('[data-event-mode]')){el.disabled=busy;el.setAttribute('aria-pressed',String(el.dataset.eventMode===live.activity.mode))}
  setMarkup($('liveQuizContent'),quizMarkup());
  if($('liveQuizNext')){$('liveQuizNext').disabled=busy||!!live.quiz?.open&&(!live.quiz.endsAt||timerNow()<live.quiz.endsAt);$('liveQuizClose').disabled=busy||!live.quiz?.open;$('liveQuizReset').disabled=busy;}
  if(config.display&&config.projectionMode?.()==='quiz'){
   const target=$('projMessage');if(target){setMarkup(target,quizMarkup(true));$('projector').dataset.mode='quiz';$('projTitle').textContent='新人知多少・快問快答'}
  }
  const questions=config.questions?.()||[],signature=JSON.stringify(questions);if($('liveQuestionList')&&signature!==questionSignature){questionSignature=signature;setMarkup($('liveQuestionList'),questions.map((q,i)=>'<article class="qaItem"><strong>'+(i+1)+'．'+esc(q.text)+'</strong><p>'+q.options.map((o,n)=>['A','B','C','D'][n]+' '+esc(o)+(n===q.correct?' ✓':'')).join('／')+'</p><button type="button" data-question-edit="'+esc(q.id)+'">編輯</button> <button type="button" data-question-delete="'+esc(q.id)+'">刪除</button></article>').join('')||'<p>尚無題目，請先新增。</p>')}
 }
 async function refresh(){
  if(reading||document.hidden)return;reading=true;const version=readVersion;
  try{const response=await fetch('/api/activity',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error();const result=await response.json();if(version!==readVersion)return;live=result;offset=result.serverNow-Date.now();follow();render();if($('eventConnection'))$('eventConnection').textContent='';}
  catch{if($('eventConnection'))$('eventConnection').textContent='活動連線中斷，正在重新連線…'}finally{reading=false;lastRead=Date.now()}
 }
 async function command(type,fields={}){
  if(busy)return;busy=true;readVersion++;render();
  try{const response=await fetch('/api/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(config.authHeaders?.()||{})},signal:AbortSignal.timeout(10000),body:JSON.stringify({type,...fields})});const result=await response.json();if(!response.ok)throw Error(result.error||'操作未完成');if(type==='answer'){try{localStorage.setItem(savedKey(),String(fields.choice))}catch{}}return result;}
  catch(error){config.notice?.(error.message);return null}
  finally{busy=false;readVersion++;render();void refresh()}
 }
 function choose(choice){if(!guestReady()||!live.quiz?.open||ownChoice()!==null||!Number.isInteger(choice)||choice<0||choice>3||live.quiz.endsAt&&timerNow()>=live.quiz.endsAt)return;return command('answer',{choice,questionId:live.quiz.question.id,round:live.quiz.round})}
 async function change(mode){if(!Object.hasOwn(labels,mode))return;const result=await command('eventActivity',{mode});if(result){live.activity=result.activity;render();config.notice?.('已切換賓客到「'+labels[mode]+'」')}}
 async function saveQuestion(event){event.preventDefault();const fields={text:$('liveQuestionText').value.trim(),options:[0,1,2,3].map(i=>$('liveOption'+i).value.trim()),correct:Number($('liveCorrect').value),...(editing?{id:editing}:{})};if(!fields.text||fields.options.some(x=>!x))return config.notice?.('請填寫題目及四個選項');const result=await config.hostAct?.(editing?'questionEdit':'questionAdd',fields);if(result){editing='';$('liveQuestionForm').reset();render();config.notice?.('題目已儲存')}}
 function init(options={}){
  config={...config,...options};if(ready)return;ready=true;
  for(const host of document.querySelectorAll('[data-event-host]')){
   host.innerHTML='<h3>切換賓客活動</h3><p class="small">賓客完成報到並保持網頁開啟，手機會自動跟隨。小貓題目仍在小貓頁操作。</p><div class="event-host-actions">'+Object.entries(labels).map(([mode,label])=>'<button type="button" data-event-mode="'+mode+'">'+label+'</button>').join('')+'</div><p data-event-status></p><p data-event-count class="game-host-count"></p><details><summary>查看已加入名單</summary><div data-event-players></div></details><div class="event-entry-actions"><button type="button" data-show-game-qr>投影遊戲 QR Code</button><button type="button" data-copy-game-url>複製遊戲入口</button></div>';
   for(const button of host.querySelectorAll('[data-event-mode]'))button.onclick=()=>void change(button.dataset.eventMode);
   host.querySelector('[data-show-game-qr]').onclick=()=>void command('projectionMode',{mode:'join'});host.querySelector('[data-copy-game-url]').onclick=async()=>{try{await navigator.clipboard.writeText(gameUrl());config.notice?.('遊戲入口已複製')}catch{config.notice?.('遊戲入口：'+gameUrl())}};
  }
  if($('resumeActivity'))$('resumeActivity').onclick=resume;
  for(const button of document.querySelectorAll('[data-enter-game]'))button.onclick=enter;
  if($('liveQuizContent'))$('liveQuizContent').onclick=event=>{const button=event.target.closest('[data-live-choice]');if(button)void choose(Number(button.dataset.liveChoice))};
  if($('liveQuizNext')){$('liveQuizNext').onclick=()=>void command('liveQuizNext',{seconds:Number($('liveSeconds').value)||20});$('liveQuizClose').onclick=()=>void command('liveQuizClose',{round:live.quiz?.round});$('liveQuizReset').onclick=async()=>{if(confirm('重新開始快問快答會清空作答與分數，其他婚禮資料保留。確定？')){if(await config.hostAct?.('quizReset'))void refresh()}};$('liveQuestionForm').onsubmit=saveQuestion;$('liveQuestionCancel').onclick=()=>{editing='';$('liveQuestionForm').reset()};$('liveQuestionList').onclick=async event=>{const edit=event.target.closest('[data-question-edit]'),remove=event.target.closest('[data-question-delete]');if(edit){const q=config.questions?.().find(q=>q.id===edit.dataset.questionEdit);if(!q)return;editing=q.id;$('liveQuestionText').value=q.text;q.options.forEach((o,i)=>$('liveOption'+i).value=o);$('liveCorrect').value=String(q.correct);$('liveQuestionForm').scrollIntoView({behavior:'smooth',block:'center'})}else if(remove&&confirm('刪除這道題目？'))await config.hostAct?.('questionDelete',{id:remove.dataset.questionDelete})};}
  for(const button of document.querySelectorAll('#tabs button,[data-guest-shortcut]'))button.addEventListener('click',pause);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});root.addEventListener('focus',()=>void refresh());
  setInterval(()=>{if(!document.hidden){render();if(!reading&&Date.now()-lastRead>=(live.activity.mode==='reception'&&!gameEntryIntent&&config.projectionMode?.()!=='join'?3000:1000))void refresh()}},250);
  render();void refresh();
 }
 root.WeddingEvent={init,refresh,render,change,choose,pause,resume,enter,gameUrl};
})(window);
