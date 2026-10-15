import {ready,validateMedia,validateDeck,projectionState,packDeck,unpackDeck,moveCatQuestion} from './cat-meme-model.js';
import {createCatMemeDeck,mergeCatMemeDeck,catMemeQuestions,upgradeCatMemeSounds} from './cat-meme-questions.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),screenMode=params.get('screen')==='1';
const session=params.get('session')||crypto.randomUUID();
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('wedding-cat-memes:'+session):null;
let orderSaving=false,pendingOrder=null;
let deck=[],index=0,revealed=false,editingId=null,dirty=false,busy=false,dbPromise=null,noticeTimer,lastScreenAt=0,lastHostAt=Date.now(),playSerial=0,lastPlayed=-1,lastStageKey='',liveState=null;
const urls=new Set(),blobUrls=new WeakMap();
const src=blob=>{if(!blobUrls.has(blob)){const url=URL.createObjectURL(blob);blobUrls.set(blob,url);urls.add(url)}return blobUrls.get(blob)};
function notice(text){$('notice').textContent=text;$('notice').style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').style.display='none',5000)}
function current(){return deck[index]||null}
function connected(){return Date.now()-lastScreenAt<6500}
function stopSound(){const player=$('soundPlayer');player.pause();player.removeAttribute('src');player.load();player.hidden=true}
async function playSound(state=liveState){
  if(!state?.revealed||!state.sound)return;
  const player=$('soundPlayer');player.pause();player.src=state.sound;player.volume=state.volume??.8;player.currentTime=0;player.controls=state.soundType?.startsWith('video/');player.hidden=!player.controls;
  $('playbackStatus').textContent='正在播放原音…';
  try{await player.play()}catch{$('playbackStatus').textContent='尚未播放：請按「再播一次」，並確認檔案可播放與喇叭已開。'}
}
function renderStage(state,autoplay=false){
  liveState=state;
  const key=state.key+'|'+state.revealed;
  if(key!==lastStageKey){stopSound();$('playbackStatus').textContent='';lastStageKey=key}
  $('stageQuestion').textContent=state.prompt||'這隻貓，怎麼叫？';
  $('roundLabel').textContent=state.total?'第 '+(state.index+1)+' 題 ／ '+state.total+' 題':'暖場準備中';
  const picture=$('picture');
  if(picture.dataset.src!==(state.image||'')){
    picture.dataset.src=state.image||'';
    picture.innerHTML=state.image?'<img alt="請看這隻貓，舉手模仿牠的聲音">':'<div class="placeholder"><span>🐱</span><p>先在題庫放上貓咪照片</p></div>';
    if(state.image)picture.querySelector('img').src=state.image;
  }else if(!picture.innerHTML)picture.innerHTML='<div class="placeholder"><span>🐱</span><p>準備好你的小貓照片</p></div>';
  $('answerBox').hidden=!state.revealed;
  $('stagePrompt').textContent=state.revealed?'原來是這個聲音！全場一起再來一次？':'舉起你的手，模仿牠的聲音！';
  $('answerText').textContent=state.revealed?state.answer||'':'';
  $('answerNote').textContent=state.revealed?state.note||'':'';
  $('replay').disabled=!state.revealed||!state.sound;
  if(autoplay&&state.revealed&&state.serial!==lastPlayed){lastPlayed=state.serial;void playSound(state)}
  $('soundPlayer').volume=state.volume??.8;
}
function publish(autoplay=false){
  const q=current();
  const state={...projectionState(q,index,deck.length,revealed,src),key:q?.id||'empty',serial:playSerial,volume:Number($('volume').value)};
  renderStage(state,autoplay&&!connected());
  channel?.postMessage({type:'state',state,autoplay});
}
function renderDeck(){
  $('deck').innerHTML=deck.length?deck.map((q,i)=>'<article class="deck-row '+(i===index?'active':'')+'">'+(q.image?'<img alt="" src="'+src(q.image)+'">':'<span class="deck-thumb">🐱</span>')+'<div class="deck-info"><strong>'+String(i+1).padStart(2,'0')+' · '+escape(q.name)+'</strong><small>'+(ready(q)?'✓ 照片與原音都準備好了':'待補：'+[!q.image?'照片':'',!q.sound?'原音':''].filter(Boolean).join('、'))+'</small></div><div class="deck-actions"><div class="deck-move"><button type="button" data-move="'+escape(q.id)+'" data-direction="-1" aria-label="上移 '+escape(q.name)+'" '+(i===0||busy?'disabled':'')+'>↑ 上移</button><button type="button" data-move="'+escape(q.id)+'" data-direction="1" aria-label="下移 '+escape(q.name)+'" '+(i===deck.length-1||busy?'disabled':'')+'>↓ 下移</button></div><div><button type="button" data-edit="'+escape(q.id)+'">編輯</button><button type="button" data-show="'+i+'">出題</button></div></div></article>').join(''):'<p class="small">還沒有題目，從右邊新增第一隻貓吧。</p>';
  for(const id of ['saveMeme','exportDeck','addNew','loadStarter','importDeck'])$(id).disabled=busy||orderSaving;
  $('deleteMeme').disabled=busy||orderSaving||!editingId;
  const q=current();
  $('hostQuestionName').textContent=q?.name||'請先準備題目';
  $('hostReadiness').textContent=q?(ready(q)?'照片與聲音就緒，可以出題。':'請先補齊照片與原音。'):'新增題目後就能開始。';
  $('reveal').disabled=!ready(q)||revealed||busy;
  $('hideAnswer').disabled=!q||busy;
  $('previous').disabled=index<=0||busy;
  $('next').disabled=index>=deck.length-1||busy;
  $('soundCheck').disabled=!q?.sound||busy;
  $('storageStatus').textContent=deck.length+' 道題目，'+deck.filter(ready).length+' 道已準備完成。題庫僅保存在目前瀏覽器，請記得匯出備份。';
}
function fillEditor(q=null){
  editingId=q?.id||null;dirty=false;$('editor').reset();
  $('editorTitle').textContent=q?'編輯這隻貓':'新增一隻貓';
  $('memeName').value=q?.name||'';$('memePrompt').value=q?.prompt||'這隻貓，怎麼叫？';$('memeAnswer').value=q?.answer||'';$('memeNote').value=q?.note||'';
  $('imageHint').textContent=q?.image?'✓ 已有照片；不選新檔案即可保留。':'JPG、PNG、WebP、GIF，8MB 以下';
  $('soundHint').textContent=q?.sound?'✓ 已有原音；不選新檔案即可保留。':'MP3、M4A、WAV、OGG、MP4、WebM，12MB 以下';
  $('deleteMeme').disabled=busy||orderSaving||!q;$('editStatus').textContent='儲存後保留在這台電腦；記得匯出題庫備份。';
}
async function moveMemeQuestion(id,direction){
  if(busy)return;
  const next=moveCatQuestion(deck,id,direction);if(next===deck)return;
  const activeId=current()?.id;let savedOrder=deck;
  deck=next;index=Math.max(0,deck.findIndex(q=>q.id===activeId));pendingOrder=next;
  const alreadySaving=orderSaving;orderSaving=true;
  renderDeck();publish(false);$('orderStatus').textContent='順序已移動，正在儲存…';
  if(alreadySaving)return;
  try{
    while(pendingOrder){const order=pendingOrder;pendingOrder=null;await storeDeck(order,false);savedOrder=order;}
    $('orderStatus').textContent='✓ 題目順序已儲存，匯出備份會保留此順序';
  }catch{
    const currentId=current()?.id;pendingOrder=null;deck=savedOrder;index=Math.max(0,deck.findIndex(q=>q.id===currentId));
    $('orderStatus').textContent='順序未能儲存，已還原到最近成功儲存的順序。請重試。';publish(false);
  }finally{orderSaving=false;renderDeck()}
}
function canLeaveEditor(){return !dirty||confirm('這道題目有尚未儲存的修改，要先放棄修改嗎？')}
function selectQuestion(i){if(busy||!deck[i])return;index=i;revealed=false;renderDeck();publish()}
async function starterDeck(){return createCatMemeDeck(async(id,extension)=>{try{const r=await fetch(new URL('./cat-meme-assets/'+id+'.'+extension,import.meta.url));if(!r.ok)return null;const blob=await r.blob();validateMedia(blob,extension==='mp3'?'sound':'image');return blob}catch{return null}})}
async function addStarterDeck(){
  if(busy||orderSaving||!canLeaveEditor())return;
  if(!confirm('加入尚未存在的 '+catMemeQuestions.length+' 題迷因題庫，並補上相同題目缺少的素材；已修改的答案及現有素材會保留。確定加入？'))return;
  setBusy(true);try{const next=mergeCatMemeDeck(deck,await starterDeck());await storeDeck(next);fillEditor(current());renderDeck();publish();notice('迷因題庫已加入，請先逐題試播原音。')}catch(e){notice('加入未完成：'+e.message)}finally{setBusy(false)}
}
function database(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(Error('此瀏覽器無法保存題庫，請改用一般瀏覽模式。'));return}
    const r=indexedDB.open('wedding-cat-memes',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });return dbPromise;
}
async function loadDeck(){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('state','readonly').objectStore('state').get('deck');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function storeDeck(next,apply=true){validateDeck(next);const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(next,'deck');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('儲存被中止'))});if(apply)deck=next}
function setBusy(value){busy=value;for(const id of ['saveMeme','exportDeck','addNew','loadStarter','memePrompt','memeName','memeAnswer','memeNote','memeImage','memeSound','importDeck'])$(id).disabled=value;renderDeck();$('deleteMeme').disabled=value||!editingId}
async function saveEditor(event){
  event.preventDefault();if(busy||orderSaving)return;
  const old=deck.find(q=>q.id===editingId);
  const q={id:old?.id||crypto.randomUUID(),name:$('memeName').value.trim(),prompt:$('memePrompt').value.trim()||'這隻貓，怎麼叫？',answer:$('memeAnswer').value.trim(),note:$('memeNote').value.trim(),image:$('memeImage').files[0]||old?.image||null,sound:$('memeSound').files[0]||old?.sound||null};
  try{validateMedia(q.image,'image');validateMedia(q.sound,'sound');validateDeck(old?deck.map(item=>item.id===old.id?q:item):[...deck,q]);}catch(e){return notice(e.message)}
  setBusy(true);$('editStatus').textContent='正在儲存照片與聲音…';
  try{await storeDeck(old?deck.map(item=>item.id===old.id?q:item):[...deck,q]);if(!old)index=deck.length-1;if(current()?.id===q.id)revealed=false;fillEditor(q);renderDeck();publish();notice(ready(q)?'這道題目已準備好！':'題目已儲存，稍後補上照片與原音即可。')}
  catch{$('editStatus').textContent='未能儲存，欄位仍保留。請確認瀏覽器可用空間後重試。';notice('儲存失敗，請保留目前頁面並重試。')}finally{setBusy(false)}
}
async function deleteQuestion(){
  if(busy||orderSaving||!editingId||!confirm('確定只刪除小貓題庫中的這道題目？婚禮賓客與相簿不會受影響。'))return;
  setBusy(true);
  try{const activeId=current()?.id;await storeDeck(deck.filter(q=>q.id!==editingId));const keep=deck.findIndex(q=>q.id===activeId);index=keep>=0?keep:Math.max(0,Math.min(index,deck.length-1));revealed=false;fillEditor(current());renderDeck();publish();notice('已刪除這道小貓題目。')}catch{notice('未能刪除，原題目仍保留。')}finally{setBusy(false)}
}
function encode(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function decode(base64,type){const text=atob(base64);return new Blob([Uint8Array.from(text,c=>c.charCodeAt(0))],{type})}
async function exportBackup(){if(busy||orderSaving)return;setBusy(true);try{const backup=await packDeck(deck,encode);const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='小貓迷因問答_含照片音效_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notice('題庫備份已下載，包含照片及原音。尚未儲存的欄位不包含在內。')}catch(e){notice('匯出失敗：'+e.message)}finally{setBusy(false)}}
async function importBackup(event){
  const file=event.target.files[0];if(!file||busy||orderSaving)return;
  try{if(file.size>60*1024*1024)throw Error('備份檔案太大，請確認選對檔案。');const next=unpackDeck(JSON.parse(await file.text()),decode);
    if(!confirm('匯入將取代這台電腦目前的小貓題庫，婚禮資料不受影響。若有舊題庫，請先匯出備份。確定匯入？'))return;
    setBusy(true);await storeDeck(next);index=0;revealed=false;fillEditor(current());renderDeck();publish();notice('題庫與照片、聲音都已匯入。');
  }catch(e){notice('匯入未完成：'+e.message)}finally{event.target.value='';setBusy(false)}
}
$('soundPlayer').addEventListener('ended',()=>{$('playbackStatus').textContent='播放完畢，可以再播一次。'});
$('soundPlayer').addEventListener('error',()=>{if($('soundPlayer').getAttribute('src'))$('playbackStatus').textContent='這個檔案無法播放，請改用 MP3 或 MP4 檔案。'});
$('replay').addEventListener('click',()=>{if(screenMode)void playSound();else{playSerial++;publish(true)}});
if(channel)channel.onmessage=event=>{
  const m=event.data;if(!m||typeof m!=='object')return;
  if(screenMode&&m.type==='state'&&m.state){lastHostAt=Date.now();renderStage(m.state,m.autoplay);}
  else if(screenMode&&m.type==='alive')lastHostAt=Date.now();
  else if(!screenMode&&(m.type==='ready'||m.type==='heartbeat')){lastScreenAt=Date.now();$('screenStatus').textContent='✓ 投影已連接。請在投影畫面先按「啟用投影音效」。';channel.postMessage({type:'alive'});if(m.type==='ready'){stopSound();publish(false)}}
};
if(screenMode){
  document.body.classList.add('screen-mode');
  $('unlockSound').onclick=async()=>{
    const player=$('soundPlayer'),previous=player.src;player.src='data:audio/wav;base64,UklGRogAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
    try{await player.play();player.pause();$('unlockStatus').textContent='音效已啟用；若未自動播放，可按答案下方「再播一次」。'}catch{$('unlockStatus').textContent='公布答案後，請按「再播一次」播放音效。'}
    if(previous)player.src=previous;else player.removeAttribute('src');
    if(document.fullscreenEnabled&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});
  };
  renderStage({key:'empty',index:0,total:0,revealed:false,image:''});
  channel?.postMessage({type:'ready'});
  setInterval(()=>{channel?.postMessage({type:'heartbeat'});if(Date.now()-lastHostAt>7000)$('unlockStatus').textContent='主持人頁面尚未連接，請保持主持人頁面開啟。'},2500);
}else{
  $('loadStarter').textContent='加入 '+catMemeQuestions.length+' 題迷因題庫';$('loadStarter').onclick=addStarterDeck;
  $('editor').addEventListener('input',()=>{dirty=true});$('editor').addEventListener('change',()=>{dirty=true});$('editor').addEventListener('submit',saveEditor);
  $('deleteMeme').onclick=deleteQuestion;$('exportDeck').onclick=exportBackup;$('importDeck').onchange=importBackup;
  $('addNew').onclick=()=>{if(!busy&&!orderSaving&&canLeaveEditor()){fillEditor();$('memeName').focus();$('editor').scrollIntoView({behavior:'smooth',block:'center'})}};
  $('deck').onclick=event=>{if(busy)return;const move=event.target.closest('[data-move]'),edit=event.target.closest('[data-edit]'),show=event.target.closest('[data-show]');if(move){void moveMemeQuestion(move.dataset.move,Number(move.dataset.direction));return}if(edit&&canLeaveEditor())fillEditor(deck.find(q=>q.id===edit.dataset.edit));else if(show)selectQuestion(Number(show.dataset.show))};
  $('reveal').onclick=()=>{if(!ready(current())||revealed)return;revealed=true;playSerial++;renderDeck();publish(true)};
  $('hideAnswer').onclick=()=>{stopSound();revealed=false;renderDeck();publish()};$('previous').onclick=()=>selectQuestion(index-1);$('next').onclick=()=>selectQuestion(index+1);
  $('volume').oninput=()=>publish(false);
  $('soundCheck').onclick=()=>{const q=current();if(!q?.sound)return;void playSound({...projectionState(q,index,deck.length,true,src),volume:Number($('volume').value)});notice('正在主持人這台電腦試音，投影畫面不會公布答案。')};
  $('openScreen').onclick=()=>{
    if(!channel)return notice('此瀏覽器不支援獨立投影，請改用新版 Chrome、Edge 或 Safari。');
    const screenUrl=new URL(location.href);screenUrl.search='?screen=1&session='+encodeURIComponent(session);const target=window.open(screenUrl.href,'cat-memes-'+session);
    if(!target)notice('投影視窗未開啟，請允許這個網站開啟新視窗。');else notice('將新視窗移到現場螢幕，再按「啟用投影音效」。');
  };
  setInterval(()=>{if(!connected())$('screenStatus').textContent='投影尚未連接。可先在左側試玩。'},3000);
  (async()=>{setBusy(true);try{const saved=await loadDeck();if(saved===undefined)await storeDeck(await starterDeck());else {deck=validateDeck(saved);const updated=await upgradeCatMemeSounds(deck,await starterDeck());if(updated!==deck){await storeDeck(updated);notice('已換成較完整的內建音檔，自訂素材與題目順序均已保留。')}}fillEditor(current());renderDeck();publish();}catch{deck=[];fillEditor();renderDeck();publish();$('storageStatus').textContent='無法讀取保存的題庫，請勿清除瀏覽器資料；可先重新整理，或匯入先前備份。';notice('題庫未能讀取，請重新整理或匯入備份。')}finally{setBusy(false)}})();
}
window.addEventListener('beforeunload',event=>{if(!screenMode&&(dirty||busy||orderSaving)){event.preventDefault();event.returnValue=''}});
window.addEventListener('pagehide',()=>{stopSound();channel?.close();for(const url of urls)URL.revokeObjectURL(url)});
