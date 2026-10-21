
const $ = id => document.getElementById(id);
const htmlFragments=new Map();
function setHTML(id,markup){const target=$(id);if(!target)return;const previous=htmlFragments.get(id);if(previous?.target===target&&previous.markup===markup)return;target.innerHTML=markup;htmlFragments.set(id,{target,markup})}
const displayMode=new URLSearchParams(location.search).get('display')==='1';
let pollTimer=null,pollRunning=false,pollWake=false,pollStarted=false;
const TOKEN_KEY = 'wedding_1212_guest_token';
if(!$('kahootJoin')){const warning=document.createElement('p');warning.className='notice';warning.textContent='這份網頁與程式版本不一致。後台登入仍可使用；請完成修復檔上傳後，按 Ctrl＋F5 重新整理。';$('adminLogin')?.prepend(warning)}
let data = { admin:false, me:null, blessings:[], photos:[], lottery:{status:'open',result:[],startedAt:0,winners:[],ticketCount:0}, myTicket:null, guests:[],tickets:[],mahjong:{phase:'guess'}, kahoot:{url:'https://kahoot.it/',pin:''} };
let proxyPicks = [], proxyGuestId = 'offline', proxyBusy = false, proxySignature = '';
let numberSignature='';
let ticketBusy=false,ticketNameEdited=false;
let picks = [], game = 'kahoot', projection = '', refreshing = false;
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const avatarEmoji = {cat:'🐱',rabbit:'🐰',bear:'🐻',panda:'🐼',fox:'🦊',chick:'🐥',frog:'🐸',penguin:'🐧',dog:'🐶',koala:'🐨',hamster:'🐹',tiger:'🐯',lion:'🦁',pig:'🐷',monkey:'🐵',owl:'🦉',unicorn:'🦄',butterfly:'🦋',sunflower:'🌻',cherry:'🍒',heart:'💗',star:'⭐',cake:'🎂'};
const extraAvatarNames={dog:'小狗',koala:'無尾熊',hamster:'倉鼠',tiger:'老虎',lion:'獅子',pig:'小豬',monkey:'猴子',owl:'貓頭鷹',unicorn:'獨角獸',butterfly:'蝴蝶',sunflower:'向日葵',cherry:'櫻桃',heart:'愛心',star:'星星',cake:'蛋糕'};
for(const [key,label] of Object.entries(extraAvatarNames)){const button=document.createElement('button');button.className='avatar-choice';button.type='button';button.dataset.avatar=key;button.setAttribute('aria-label',label);button.textContent=avatarEmoji[key];button.onclick=()=>selectPreset(key);document.querySelector('.avatar-choice-grid').append(button)}
let selectedAvatar = null, avatarBlob = null, avatarPreviewUrl = '', hostMode = false;
let profileNameDraft = null;
$('guestName').addEventListener('input',()=>{profileNameDraft=$('guestName').value});
async function fitJpeg(canvas,maxBytes){
  for(let scale=0;scale<4;scale++){
    for(const quality of [.82,.7,.58,.46]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=maxBytes)return blob;
    }
    const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*.8));smaller.height=Math.max(1,Math.round(canvas.height*.8));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;
  }
  throw Error('照片無法壓縮至可上傳大小，請換一張');
}
const completeGuest = () => !!data.me && (data.me.avatarKind === 'preset' && !!avatarEmoji[data.me.avatarValue] || data.me.avatarKind === 'photo' && !!data.me.avatarValue);
function avatarHTML(kind,value){ if(kind==='photo' && value)return '<span class="avatar-mini"><img alt="" src="/api/avatar/'+encodeURIComponent(value)+'"></span>'; return '<span class="avatar-mini">'+(avatarEmoji[value]||'♡')+'</span>' }
function renderAvatarSelection(){
  document.querySelectorAll('[data-avatar]').forEach(button=>{const active=selectedAvatar?.kind==='preset' && selectedAvatar.value===button.dataset.avatar;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active))});
  const preview=$('avatarPreview'), kind=selectedAvatar?.kind||data.me?.avatarKind, value=selectedAvatar?.value||data.me?.avatarValue;
  preview.textContent='';
  if(kind==='photo' && (selectedAvatar?avatarPreviewUrl:value)){const image=document.createElement('img');image.alt='你選擇的頭像';image.src=selectedAvatar?avatarPreviewUrl:'/api/avatar/'+encodeURIComponent(value);preview.append(image)}
  else preview.textContent=avatarEmoji[value]||'♡';
  $('avatarPreviewTitle').textContent=selectedAvatar?'頭像已選好':completeGuest()?'你的婚禮頭像':'你的婚禮頭像';
  $('avatarHint').textContent=selectedAvatar?.kind==='photo'?'照片會裁成方形頭像，上傳後大家都看得見。':selectedAvatar?.kind==='preset'?(completeGuest()?'按下儲存即可更換頭像。':'很可愛！完成報到後就能進入婚禮網站。'):'選可愛圖案，也可以拍照或上傳照片。';
}
function selectPreset(value){if(!avatarEmoji[value])return;selectedAvatar={kind:'preset',value};avatarBlob=null;if(avatarPreviewUrl){URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl=''}renderAvatarSelection()}
async function chooseAvatarFile(file){
  if(!file)return;
  if(!file.type.startsWith('image/') || file.size>15*1024*1024)return toast('請選擇 15MB 以下的照片');
  const source=URL.createObjectURL(file),image=new Image();
  image.onload=async()=>{try{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const side=Math.min(image.width,image.height),sx=(image.width-side)/2,sy=(image.height-side)/2;canvas.getContext('2d').drawImage(image,sx,sy,side,side,0,0,512,512);const blob=await fitJpeg(canvas,120*1024);if(avatarPreviewUrl)URL.revokeObjectURL(avatarPreviewUrl);avatarBlob=blob;avatarPreviewUrl=URL.createObjectURL(blob);selectedAvatar={kind:'photo'};renderAvatarSelection()}catch(e){toast(e.message||'照片處理失敗')}finally{URL.revokeObjectURL(source)}};
  image.onerror=()=>{URL.revokeObjectURL(source);toast('無法讀取這張照片，請換一張')};
  image.src=source;
}
async function uploadAvatar(){
  if(!avatarBlob)return toast('請先選擇照片');
  try{const response=await fetch('/api/avatar',{method:'POST',headers:{'content-type':'image/jpeg',...authHeaders()},credentials:'same-origin',body:avatarBlob});const result=await response.json();if(!response.ok)throw Error(result.error||'頭像上傳失敗');await refresh();return result}catch(error){toast(error.message||'頭像上傳失敗');return null}
}
function selectPanel(t){document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('active',e.id===t));document.querySelectorAll('#tabs button').forEach(e=>e.classList.toggle('active',e.dataset.tab===t))}

function toast(t){ $('toast').textContent=t; $('toast').style.display='block'; clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>$('toast').style.display='none',3200) }
let refreshPromise=null;
function refresh(afterAction=false){
  if(refreshPromise)return afterAction===true?refreshPromise.then(()=>refresh(true)):refreshPromise;
  refreshing=true;
  const reading=(async()=>{
    try{
      const wasComplete=completeGuest();
      const r=await fetch(displayMode?'/api/projection':'/api/state',{headers:authHeaders(),credentials:'same-origin',cache:'no-store',...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(10000)}:{})});
      if(!r.ok)throw Error('無法讀取最新資料');
      const fresh=await r.json(),changed=JSON.stringify(fresh)!==JSON.stringify(data);data=fresh;if(changed)render();
      if(displayMode){setProjectionConnection('✓ 已連線，跟隨手機主持人');return}
      if(!completeGuest()&&!data.admin&&!hostMode)selectPanel('checkin');
      else if(!wasComplete&&completeGuest()&&$('checkin').classList.contains('active'))go('home');
    }catch(e){console.error(e);if(displayMode)setProjectionConnection('連線中斷，正在重新連線…');else $('checkStatus').textContent='連線中斷，請稍後重新整理'}
  })();
  refreshPromise=reading.finally(()=>{refreshing=false;refreshPromise=null});
  return refreshPromise;
}

function authHeaders(){ const token=localStorage.getItem(TOKEN_KEY); return token?{'Authorization':'Bearer '+token}:{} }
async function act(type,fields={},options={}){ try{ const r=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json',...authHeaders()},credentials:'same-origin',body:JSON.stringify({type,...fields})}); const result=await r.json(); if(!r.ok)throw Error(result.error||'操作失敗'); if(!options.skipRefresh)await refresh(true); return result; }catch(e){toast(e.message||'操作失敗');return null} }
function go(t){wakePoll();document.body.classList.toggle('host-mode',t==='admin');if(t==='admin')hostMode=true; else if(t==='checkin')hostMode=false; if(!completeGuest()&&!data.admin&&t!=='admin')t='checkin'; selectPanel(t);window.scrollTo({top:0,behavior:'smooth'});render() }
document.querySelectorAll('#tabs button').forEach(e=>e.addEventListener('click',()=>go(e.dataset.tab)));
function requireGuest(){ if(completeGuest())return true;toast('請先完成姓名與頭像報到');go('checkin');return false }
async function checkin(){
  const button=$('checkinButton'),name=$('guestName').value.trim();
  if(name.length<2)return toast('請輸入至少兩個字的姓名');
  if(!data.me&&!selectedAvatar)return toast('請先選擇一個頭像');
  if(data.me&&name===data.me.name&&!selectedAvatar)return toast('姓名或頭像沒有變更');
  button.disabled=true;
  try{
    const isNew=!data.me;
    if(isNew){const result=await act('checkin',{name,avatarKind:selectedAvatar.kind,avatarValue:selectedAvatar.value||''});if(!result)return;localStorage.setItem(TOKEN_KEY,result.token);await refresh()}
    else if(name!==data.me.name){if(!await act('profileUpdate',{name}))return}
    let result={ok:true};
    if(selectedAvatar?.kind==='photo')result=await uploadAvatar();
    else if(selectedAvatar?.kind==='preset'&&(data.me?.avatarKind!=='preset'||data.me?.avatarValue!==selectedAvatar.value))result=await act('avatarUpdate',{avatarValue:selectedAvatar.value});
    if(result){profileNameDraft=null;selectedAvatar=null;avatarBlob=null;if(avatarPreviewUrl){URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl=''}render();toast(isNew?name+'，歡迎蒞臨！':'個人資料已儲存')}
  }finally{button.disabled=false}
}
async function sendBlessing(){ if(!requireGuest())return; const text=$('blessing').value.trim(); if(!text)return toast('請先寫下祝福'); if(await act('blessing',{text})){ $('blessing').value=''; toast('祝福送出成功 ♡') } }
const fireworkWalls=new Map();
function updateFireworkWalls(){
  if(!window.WeddingFireworks)return;
  window.weddingAvatarEmoji=avatarEmoji;
  for(const [id,active] of [['wallPreview',!displayMode&&!projection&&$('wall').classList.contains('active')],['projWall',projection==='wall']]){
    const target=$(id);if(!target)continue;
    if(active&&!fireworkWalls.has(id))fireworkWalls.set(id,window.WeddingFireworks.mount(target));
    const wall=fireworkWalls.get(id);if(wall){wall.update(data.blessings||[]);wall.setActive(active)}
  }
}
async function uploadPhoto(){ if(!requireGuest())return; const file=$('photoFile').files[0]; if(!file)return toast('請先選照片'); if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)return toast('僅接受 8MB 以下的 JPG、PNG 或 WebP 圖片'); const image=new Image(); const url=URL.createObjectURL(file); image.onload=async()=>{ try{ const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(image.width,image.height)); canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale)); canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); const blob=await fitJpeg(canvas,600*1024); const r=await fetch('/api/photo',{method:'POST',headers:{'content-type':'image/jpeg',...authHeaders()},credentials:'same-origin',body:blob}); const result=await r.json(); if(!r.ok)throw Error(result.error||'上傳失敗'); $('photoFile').value=''; await refresh(); toast('照片已分享至婚禮相簿'); }catch(e){toast(e.message||'照片上傳失敗')}finally{URL.revokeObjectURL(url)} }; image.onerror=()=>{URL.revokeObjectURL(url);toast('無法讀取這張照片')}; image.src=url }
function setGame(v){if(!$('kahootPane')||!$('kahootTab'))return toast('網頁版本未更新完整，請重新整理或完成修復檔上傳。');game=v==='lotto'?'lotto':'kahoot';$('kahootPane').classList.toggle('hidden',game!=='kahoot');$('lottoPane').classList.toggle('hidden',game!=='lotto');$('kahootTab').className=game==='kahoot'?'primary':'outline';$('lottoTab').className=game==='lotto'?'primary':'outline';render()}
function clearPick(){if(ticketBusy)return;picks=[];renderNumbers()}
function renderNumbers(){const signature=JSON.stringify([picks,data.lottery.status,!!data.myTicket,ticketBusy]);if(signature===numberSignature)return;numberSignature=signature;const grid=$('numberGrid');grid.innerHTML='';for(let n=1;n<=49;n++){const b=document.createElement('button');b.className='num'+(picks.includes(n)?' selected':'');b.textContent=String(n).padStart(2,'0');b.disabled=ticketBusy||data.lottery.status!=='open'||!!data.myTicket;b.onclick=()=>{if(ticketBusy)return;if(picks.includes(n))picks=picks.filter(x=>x!==n);else if(picks.length<6)picks.push(n);else return toast('最多選六個號碼');renderNumbers()};grid.append(b)}$('pickedCount').textContent=picks.length}
async function submitTicket(){if(!requireGuest())return;await addTicket(null)}
function renderTicketControls(){
  const button=$('ticketSubmit'),field=$('ticketBlessing'),name=$('ticketRealName');
  if(name){if(!ticketNameEdited&&!name.value)name.value=data.me?.name||'';name.disabled=ticketBusy}
  if(button){button.disabled=ticketBusy||data.lottery.status!=='open'||!!data.myTicket;button.textContent=ticketBusy?'正在送出…':'確認投注與送出祝福'}
  if(field)field.disabled=ticketBusy;
}
async function addTicket(guestId){
  if(ticketBusy)return;
  if(picks.length!==6)return toast('請選滿六個不同號碼');
  const name=$('ticketRealName'),realName=(name?.value||'').normalize('NFKC').trim().replace(/\s+/gu,' ');
  if(realName.length<2||realName.length>25)return toast('請填寫兌獎本名，勿填暱稱');
  const field=$('ticketBlessing'),blessing=field?.value.trim()||'';
  if(blessing.length>100)return toast('祝福請在 100 字以內');
  ticketBusy=true;renderTicketControls();renderNumbers();
  try{
    const result=await act(guestId?'proxyTicket':'ticket',{guestId,numbers:[...picks],blessing,realName});
    if(result){picks=[];if(field)field.value='';render();toast(blessing?'投注成功，祝福也已送上祝福牆 ♡':'投注成功，祝您好運！')}
  }finally{ticketBusy=false;renderTicketControls();renderNumbers()}
}
function selectProxyGuest(id){proxyGuestId=id;proxyPicks=[];if($('proxyBlessing'))$('proxyBlessing').value='';const field=$('proxyRealName');if(field)field.value=data.guests.find(g=>g.id===id)?.name||'';renderProxyControls()}
function pickProxyNumber(n){if(proxyBusy)return;if(proxyPicks.includes(n))proxyPicks=proxyPicks.filter(x=>x!==n);else if(proxyPicks.length<6)proxyPicks.push(n);else return toast('最多選六個號碼');renderProxyControls()}
function clearProxyPick(){proxyPicks=[];renderProxyControls()}
function renderProxyControls(){
  const signature=JSON.stringify([data.guests,data.tickets,data.lottery.status,proxyGuestId,proxyPicks,proxyBusy]);
  if(signature===proxySignature)return;proxySignature=signature;
  const ticketed=new Set(data.tickets.map(t=>t.guestId));
  $('proxyGuest').innerHTML='<option value="offline" '+(proxyGuestId==='offline'?'selected':'')+'>沒有手機／尚未報到：直接填本名代投</option><option value="">選擇已報到賓客</option>'+data.guests.map((g,i)=>'<option value="'+escapeHTML(g.id)+'" '+(g.id===proxyGuestId?'selected':'')+' '+(ticketed.has(g.id)?'disabled':'')+'>'+escapeHTML(g.name)+'（報到順序 '+(i+1)+'）'+(ticketed.has(g.id)?'｜已投注':'')+'</option>').join('');
  const unavailable=data.lottery.status!=='open'||!proxyGuestId||ticketed.has(proxyGuestId)||proxyBusy;
  $('proxyGuest').disabled=proxyBusy;if($('proxyBlessing'))$('proxyBlessing').disabled=proxyBusy;if($('proxyRandom'))$('proxyRandom').disabled=unavailable;if($('proxyRealName'))$('proxyRealName').disabled=proxyBusy;
  $('proxyNumberGrid').innerHTML=Array.from({length:49},(_,i)=>'<button type="button" class="num '+(proxyPicks.includes(i+1)?'selected':'')+'" aria-pressed="'+proxyPicks.includes(i+1)+'" '+(unavailable?'disabled':'')+' onclick="pickProxyNumber('+(i+1)+')">'+String(i+1).padStart(2,'0')+'</button>').join('');
  $('proxyPicked').textContent=proxyPicks.length+' / 6 個｜'+proxyPicks.slice().sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('、');
  $('proxySubmit').disabled=unavailable||proxyPicks.length!==6;
  $('proxyClear').disabled=proxyBusy;
  $('proxyHint').textContent=data.lottery.status!=='open'?'目前已截止投注，請先開放選號。':ticketed.has(proxyGuestId)?'這位賓客已投注，請選擇其他賓客。':proxyGuestId==='offline'?'不需賓客手機或先報到。填本名、選六碼送出，即完成登錄與投注；每人限一注。':'選擇賓客及六碼後，可直接在此代投；每位賓客限一張彩券。';
}
function randomProxyPick(){
  if(proxyBusy||data.lottery.status!=='open')return;
  const values=new Uint32Array(64),chosen=new Set();
  while(chosen.size<6){crypto.getRandomValues(values);for(const value of values){if(value>=Math.floor(4294967296/49)*49)continue;chosen.add(value%49+1);if(chosen.size===6)break}}
  proxyPicks=[...chosen];renderProxyControls();
}
async function proxyTicket(){
  if(proxyBusy)return;
  const target=data.guests.find(g=>g.id===proxyGuestId);
  const offline=proxyGuestId==='offline';
  if(!offline&&!target)return toast('請先選擇已報到賓客');
  if(proxyPicks.length!==6)return toast('請選滿六個不同號碼');
  const realName=($('proxyRealName')?.value||'').normalize('NFKC').trim().replace(/\s+/gu,' ');
  if(realName.length<2||realName.length>25)return toast('請填寫賓客的兌獎本名');
  const blessing=$('proxyBlessing')?.value.trim()||'';if(blessing.length>100)return toast('祝福請在 100 字以內');
  if(!confirm('確定替「'+realName+'」投注：'+proxyPicks.slice().sort((a,b)=>a-b).join('、')+'？'))return;
  proxyBusy=true;renderProxyControls();
  const numbers=[...proxyPicks].sort((a,b)=>a-b);
  try{if(await act('proxyTicket',{...(offline?{offline:true}:{guestId:target.id}),numbers,realName,blessing})){
    if($('proxyReceipt')){$('proxyReceipt').textContent='✔ 已登錄：'+realName+'｜'+numbers.map(n=>String(n).padStart(2,'0')).join('、')+'。請與賓客核對，勿重複登錄。';}
    proxyPicks=[];proxyGuestId='offline';if($('proxyRealName'))$('proxyRealName').value='';if($('proxyBlessing'))$('proxyBlessing').value='';toast('已替 '+realName+' 完成投注');
  }}finally{proxyBusy=false;renderProxyControls()}
}
async function editTicketName(id){const ticket=data.tickets.find(t=>t.id===id);if(!ticket)return;const realName=prompt('核對賓客身分後，輸入兌獎本名（不會改動號碼）',ticket.name);if(realName===null)return;if(await act('ticketName',{id,realName}))toast('兌獎本名已更正，投注號碼不變')}
async function setLotteryState(status){if(await act('lottoState',{status}))toast(status==='open'?'投注已開放':'投注已截止')}
let drawBusy=false;
async function beginDraw(){
  if(drawBusy)return;drawBusy=true;renderLotteryControls();
  try{if(await act('draw',{prizeName:$('drawPrizeName')?.value.trim()||''})){
    if($('drawPrizeName'))$('drawPrizeName').value='';renderDraw('hostDrawBalls');$('hostDrawBalls')?.scrollIntoView?.({behavior:'smooth',block:'center'});toast('開始開獎，手機與投影會同步顯示');
  }}finally{drawBusy=false;renderLotteryControls()}
}
async function resetLottery(){if(!confirm('確定開始新一輪？這會清空本輪全部彩券與所有得獎紀錄。若只是開下一個獎，請按「開下一個獎」。'))return;await act('lottoReset')}
function drawCount(){if(window.WeddingLottery)return window.WeddingLottery.count(data.lottery);if(data.lottery.status!=='drawn')return 0;return Math.min(6,Math.max(0,Math.floor((Date.now()-data.lottery.startedAt)/1600)))}
function lotteryLabel(){if(data.lottery.status==='drawn'&&drawCount()<6)return '幸福開獎中';return ({open:'投注開放中',closed:'已截止投注',drawn:'已開獎'})[data.lottery.status]||'等待開獎'}
function renderDraw(id){
  const target=$(id);if(!target)return;
  const hidden=id==='drawBalls'?displayMode||projection||!$('games').classList.contains('active')||game!=='lotto':id==='hostDrawBalls'?displayMode||projection||!data.admin||!$('admin').classList.contains('active')||$('ad-lottery').classList.contains('hidden'):false;
  if(hidden){window.WeddingLottery?.unmount(target);return}
  if(window.WeddingLottery){window.WeddingLottery.mount(target).update(data.lottery);return}setHTML(id,ballHTML())
}
function renderHostDraw(){
  renderDraw('hostDrawBalls');
  if($('hostDrawStatus'))$('hostDrawStatus').textContent=lotteryLabel()+(drawCount()===6&&data.lottery.winners?.length?'｜恭喜 '+data.lottery.winners.join('、')+'！':'');
}
function ballHTML(){const arr=(data.lottery.result||[]).slice(0,drawCount());return [...Array(6)].map((_,i)=>'<div class="ball '+(i>=arr.length?'placeholder':'')+'">'+(i<arr.length?String(arr[i]).padStart(2,'0'):'?')+'</div>').join('')}
let kahootDirty=false,kahootSaving=false,kahootSignature='';
function kahootSettings(){
  let url='https://kahoot.it/';
  try{const candidate=new URL(data.kahoot?.url);if(candidate.protocol==='https:'&&['kahoot.it','www.kahoot.it'].includes(candidate.hostname)&&!candidate.username&&!candidate.password&&(!candidate.port||candidate.port==='443'))url=candidate.href}catch{}
  const pin=/^\d{4,10}$/.test(data.kahoot?.pin||'')?data.kahoot.pin:'';
  return {url,pin};
}
function renderKahoot(){
  if(!$('kahootJoin')||!$('kahootHostJoin')||!$('kahootGuestPin'))return;
  const config=kahootSettings();
  for(const id of ['kahootJoin','kahootHostJoin'])$(id).href=config.url;
  $('kahootGuestPin').textContent=config.pin?'本場 Game PIN：'+config.pin:'請輸入主持人公布的 Game PIN。';
  const signature=JSON.stringify(config);
  if(data.admin&&!kahootDirty&&!kahootSaving&&signature!==kahootSignature){$('kahootUrl').value=config.url;$('kahootPin').value=config.pin;kahootSignature=signature}
  $('saveKahoot').disabled=kahootSaving;$('kahootUrl').disabled=kahootSaving;$('kahootPin').disabled=kahootSaving;
}
async function saveKahoot(){
  if(kahootSaving)return;
  const url=$('kahootUrl').value.trim()||'https://kahoot.it/',pin=$('kahootPin').value.trim();
  kahootSaving=true;renderKahoot();$('kahootSaveStatus').textContent='正在更新參賽入口…';
  try{if(await act('kahootUpdate',{url,pin})){kahootDirty=false;kahootSignature='';$('kahootSaveStatus').textContent='✓ 已更新，賓客頁會自動同步。'}else $('kahootSaveStatus').textContent='未能儲存，請確認連結及 PIN 後重試。'}
  finally{kahootSaving=false;renderKahoot()}
}
async function loginAdmin(){const password=$('adminPassword').value;if(await act('login',{password})){$('adminPassword').value='';toast('已進入主持人控制台')}}
async function logoutAdmin(){await act('logout')}
function adminTab(t,btn){document.querySelectorAll('.adpane').forEach(e=>e.classList.toggle('hidden',e.id!=='ad-'+t));document.querySelectorAll('.adminnav button').forEach(e=>e.classList.remove('active'));btn.classList.add('active');render()}
async function removeBlessing(id){if(confirm('確定刪除這則祝福？'))await act('blessingDelete',{id})}
const deletingPhotos=new Set();
async function removePhoto(id){
  if(deletingPhotos.has(id))return;
  const photo=data.photos.find(p=>p.id===id);if(!photo)return;
  if(!data.admin&&!photo.canDelete)return toast('只能刪除自己上傳的照片');
  if(!confirm('確定刪除「'+photo.name+'」上傳的這張照片？刪除後無法還原。'))return;
  deletingPhotos.add(id);render();
  try{if(await act('photoDelete',{id}))toast('照片已刪除')}finally{deletingPhotos.delete(id);render()}
}
function photoCards(manage=false){return data.photos.map(p=>'<figure class="album-photo"><a href="'+p.url+'" target="_blank" rel="noopener"><img loading="lazy" alt="由 '+escapeHTML(p.name)+' 上傳，點選查看大圖" src="'+p.url+'"></a><figcaption>'+escapeHTML(p.name)+((data.admin||p.canDelete)?' <button type="button" class="photo-delete" '+(deletingPhotos.has(p.id)?'disabled':'')+' onclick="removePhoto(\''+p.id+'\')">'+(deletingPhotos.has(p.id)?'刪除中…':data.admin?'刪除照片':'刪除我的照片')+'</button>':'')+'</figcaption></figure>').join('')}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wedding-data-20261212.json';a.click();URL.revokeObjectURL(a.href)}
async function resetDemo(){if(!confirm('確定清空所有報到、照片、留言、遊戲資料？此操作不可還原。'))return;if(!confirm('請再次確認：真的要刪除所有婚禮資料？'))return;await act('resetAll')}
const mahjongViews={
  guess:{title:'猜猜是什麼牌？',symbol:'？',line:'摸一摸，憑手感猜出這張牌！',tag:'摸麻將挑戰',hint:'先別偷看，說出你的答案吧'},
  correct:{title:'答對了！',symbol:'✓',line:'太厲害了，這雙手有練過！',tag:'掌聲送給你',hint:'恭喜挑戰成功'},
  wrong:{title:'答錯了！',symbol:'✕',line:'差一點點！再接再厲～',tag:'手感還在暖身中',hint:'給勇敢挑戰的你一個掌聲'}
};
let mahjongBusy=false;
function mahjongPhase(){return Object.hasOwn(mahjongViews,data.mahjong?.phase)?data.mahjong.phase:'guess'}
function renderMahjongControls(){
  if(!$('mahjongHostStatus'))return;
  renderMahjongQuizControls();
  const phase=mahjongPhase();
  $('mahjongHostStatus').textContent='目前投影畫面：'+(data.mahjong?.kind==='quiz'?'聽牌第 '+(data.mahjong.index+1)+' 題・'+(data.mahjong.phase==='answer'?'解答':'猜題'):mahjongViews[phase].title)+(mahjongBusy?'（切換中…）':'');
  for(const [name,key] of [['Guess','guess'],['Correct','correct'],['Wrong','wrong']]){
    const button=$('mahjong'+name);button.disabled=mahjongBusy;button.setAttribute('aria-pressed',String(phase===key));
  }
}
async function setMahjongPhase(phase){
  if(mahjongBusy||!Object.hasOwn(mahjongViews,phase))return;
  mahjongBusy=true;renderMahjongControls();
  try{if(await act('mahjongPhase',{phase})){toast('已切換為「'+mahjongViews[phase].title+'」')}}
  finally{mahjongBusy=false;renderMahjongControls()}
}
function renderMahjongQuizControls(){
  if(!window.MahjongQuiz||!$('mahjongQuizPreview'))return;
  const active=data.mahjong?.kind==='quiz',index=active?data.mahjong.index:0;
  $('mahjongQuizIndex').value=String(index);
  for(const id of ['mahjongQuizIndex','mahjongQuizShow','mahjongQuizAnswer','mahjongQuizPrev','mahjongQuizNext'])$(id).disabled=mahjongBusy;
  $('mahjongQuizPrev').disabled=mahjongBusy||index===0;$('mahjongQuizNext').disabled=mahjongBusy||index===4;
  $('mahjongQuizAnswer').disabled=mahjongBusy||!active||data.mahjong.phase==='answer';
  setHTML('mahjongQuizPreview',window.MahjongQuiz.markup(index,active&&data.mahjong.phase==='answer'));
}
async function setMahjongQuiz(index,phase='question'){
  if(mahjongBusy||!Number.isInteger(index)||index<0||index>4||!['question','answer'].includes(phase))return;
  mahjongBusy=true;renderMahjongControls();
  try{if(await act('mahjongQuiz',{index,phase}))toast('已同步聽牌第 '+(index+1)+' 題'+(phase==='answer'?'解答':''))}
  finally{mahjongBusy=false;renderMahjongControls()}
}
function changeMahjongQuiz(offset){setMahjongQuiz((data.mahjong?.kind==='quiz'?data.mahjong.index:0)+offset)}
function renderMahjongProjection(){
  if(data.mahjong?.kind==='quiz'&&window.MahjongQuiz){$('projector').dataset.mahjongPhase='quiz';$('projTitle').textContent='麻將聽牌挑戰';const key='quiz:'+data.mahjong.index+':'+data.mahjong.phase;if($('projMessage').dataset.mahjongPhase!==key){$('projMessage').dataset.mahjongPhase=key;$('projMessage').innerHTML=window.MahjongQuiz.markup(data.mahjong.index,data.mahjong.phase==='answer')}return}
  const phase=mahjongPhase(),view=mahjongViews[phase],target=$('projMessage');
  $('projector').dataset.mahjongPhase=phase;
  if(target.dataset.mahjongPhase===phase)return;
  target.dataset.mahjongPhase=phase;
  target.innerHTML='<div class="mahjong-display" role="status" aria-live="polite"><div class="mahjong-tag">'+view.tag+'</div><div class="mahjong-tiles" aria-hidden="true"><span class="mahjong-tile mahjong-back"></span><span class="mahjong-tile mahjong-main">'+view.symbol+'</span><span class="mahjong-tile mahjong-back"></span></div><h2>'+view.title+'</h2><p class="mahjong-line">'+view.line+'</p><p class="mahjong-hint">'+view.hint+'</p><div class="mahjong-signature">宇童 ♡ 懷筑 · 2026.12.12</div></div>';
}
function openProjection(type){wakePoll();document.body.classList.add('projecting');projection=type;$('projector').classList.add('show');renderProjection()}
function closeProjection(){window.WeddingLottery?.unmount($('projBalls'));document.body.classList.remove('projecting');projection='';$('projector').classList.remove('show');updateFireworkWalls();renderDraw('drawBalls');renderHostDraw()}
function renderProjection(){if(projection){window.WeddingLottery?.unmount($('drawBalls'));window.WeddingLottery?.unmount($('hostDrawBalls'));}if(!projection){updateFireworkWalls();return}$('projector').dataset.mode=projection;$('projWall').style.display=projection==='wall'?'block':'none';updateFireworkWalls();if(projection!=='lotto')window.WeddingLottery?.unmount($('projBalls'));if(projection==='mahjong'){$('projTitle').textContent='摸麻將挑戰';$('projWall').style.display='none';setHTML('projBalls','');renderMahjongProjection();return}delete $('projMessage').dataset.mahjongPhase;$('projWall').style.display=projection==='wall'?'block':'none';$('projTitle').textContent=({wall:'海上的祝福煙火',lotto:'幸福大樂透'+(data.lottery.prizeName?'｜'+data.lottery.prizeName:''),kahoot:'Kahoot! 參賽入口'})[projection];if(projection==='lotto')renderDraw('projBalls');else{window.WeddingLottery?.unmount($('projBalls'));setHTML('projBalls','')}if(projection==='lotto')$('projMessage').textContent=drawCount()===6?'恭喜 '+(data.lottery.winners||[]).join('、')+'！':lotteryLabel();else if(projection==='kahoot'){const config=kahootSettings();$('projMessage').innerHTML='<div class="kahoot-projection"><span class="kahoot-mark">K!</span><h2>一起加入 Kahoot! 婚禮挑戰</h2><p>從婚禮網站點「前往 Kahoot!」</p><p class="kahoot-pin">'+(config.pin?'Game PIN：'+config.pin:'請依主持人指示輸入 PIN')+'</p><a class="primary kahoot-link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(config.url)+'">前往 Kahoot! ↗</a><p class="small">題目與排行榜請看接下來的 Kahoot! 主持畫面</p></div>'}else $('projMessage').textContent='讓祝福在海上綻放 ♡'}
let catProjectionFrame=null,catFrameActive=false;
function sharedProjectionUrl(){return new URL('/wedding_1212?display=1',location.href).href}
function openSharedProjection(){window.open(sharedProjectionUrl(),'wedding-shared-projection')}
async function copySharedProjection(){try{await navigator.clipboard.writeText(sharedProjectionUrl());toast('已複製，請在投影電腦開啟。')}catch{prompt('複製這個網址，在投影電腦開啟：',sharedProjectionUrl())}}
async function showOnScreen(mode){if(await act('projectionMode',{mode}))toast('已切換現場投影')}
function setProjectionConnection(message){
  let status=$('projectionConnection');
  if(!status){status=document.createElement('div');status.id='projectionConnection';status.setAttribute('role','status');document.body.append(status)}
  status.textContent=message;
}
function renderSharedProjection(){
  const mode=['mahjong','cat','lotto','wall','kahoot'].includes(data.projection?.mode)?data.projection.mode:'waiting';
  document.body.classList.add('projecting');$('projector').classList.add('show');
  if(mode==='cat'&&!catProjectionFrame){
    catProjectionFrame=document.createElement('iframe');catProjectionFrame.id='catProjectionFrame';catProjectionFrame.title='小貓迷因現場投影';
    catProjectionFrame.allow='autoplay; fullscreen';catProjectionFrame.src='/cat-memes.html?screen=1&cloud=1&follow=1&embedded=1&v=20261020-media3';
    catProjectionFrame.onload=()=>catProjectionFrame.contentWindow?.postMessage({type:'wedding-projection-visible',active:catFrameActive},location.origin);
    $('projector').append(catProjectionFrame);
  }
  const active=mode==='cat';
  if(catProjectionFrame){catProjectionFrame.style.display=active?'block':'none';if(active!==catFrameActive)catProjectionFrame.contentWindow?.postMessage({type:'wedding-projection-visible',active},location.origin)}
  catFrameActive=active;
  if(mode!=='lotto')window.WeddingLottery?.unmount($('projBalls'));
  projection=mode;if(mode!=='wall')updateFireworkWalls();
  if(active){projection='cat';$('projector').dataset.mode='cat';return}
  projection=mode;
  if(mode==='waiting'){$('projector').dataset.mode='waiting';$('projTitle').textContent='幸福婚禮互動';$('projWall').style.display='none';setHTML('projBalls','');delete $('projMessage').dataset.mahjongPhase;$('projMessage').innerHTML='<h2>等待主持人開始活動</h2><p>手機開啟主持人後台，即可切換現場畫面。</p>';return}
  renderProjection();
}
function renderProfileForm(me){
  const input=$('guestName');
  if(profileNameDraft===null)input.value=me?.name||'';
  input.disabled=false;
  $('checkinButton').textContent=me?'儲存姓名與頭像':'完成報到，進入婚禮網站 →';
  $('profileTitle').textContent=me?'我的婚禮資料 ♡':'先和我們打聲招呼 ♡';
  $('profileDescription').textContent=me?'可以修改姓名、更換可愛頭像，或重新拍照／上傳照片。':'輸入姓名、挑一個代表你的頭像，完成後就能進入婚禮網站。';
  document.querySelector('[data-tab="checkin"]').textContent=me?'我的資料':'賓客報到';
}
function renderLotteryHistory(){
  const draws=(data.lottery.draws||[]).filter(draw=>draw.startedAt!==data.lottery.startedAt||drawCount()===6);
  const markup=draws.map(draw=>'<div class="qaItem"><strong>'+escapeHTML(draw.prizeName||'第 '+draw.index+' 個獎')+'</strong>｜'+(draw.result||[]).map(n=>String(n).padStart(2,'0')).join('、')+'<br>🎉 '+(draw.winners||[]).map(escapeHTML).join('、')+'</div>').join('');
  if($('hostDrawHistory'))setHTML('hostDrawHistory',markup||'<p class="muted">尚無完成開獎的獎項。</p>');
  if($('drawHistory'))setHTML('drawHistory',markup?'<h3>本輪得獎紀錄</h3>'+markup:'');
}
function renderLotteryControls(){
  const status=data.lottery.status,count=data.tickets.length,busy=drawBusy||status==='drawing'||status==='drawn'&&Date.now()-data.lottery.startedAt<(data.lottery.durationMs||27600);
  const [open,close,draw,reset]=$('ad-lottery').querySelectorAll('.actions button');
  open.disabled=drawBusy||status==='open'||status==='drawn'||status==='drawing';
  close.disabled=drawBusy||status!=='open';
  draw.disabled=busy||!['closed','drawn'].includes(status)||count===0||data.lottery.remainingCount===0;
  draw.textContent=drawBusy?'準備開獎…':status==='drawn'?'④ 開下一個獎（保留彩券）':'③ 開始開獎';
  if(reset)reset.disabled=busy;if($('drawPrizeName'))$('drawPrizeName').disabled=busy;
  open.classList.toggle('current-step',status==='open');close.classList.toggle('current-step',status==='closed');draw.classList.toggle('current-step',status==='drawn'||status==='drawing');
  const message=status==='open'?'現在開放賓客選號。確認大家投完後，按「② 截止選號」。':status==='closed'?(count?'選號已截止，共 '+count+' 張有效彩券。按「③ 開始開獎」。':'選號已截止，目前沒有彩券。請重新開放選號。'):busy?'開獎進行中，請等這個獎的動畫結束。':data.lottery.remainingCount===0?'本輪賓客都已中獎，得獎紀錄與原彩券已保留。':'本獎已開出。輸入下一個獎項名稱，再按「④ 開下一個獎」；保留原彩券，已中獎者不重複抽中。';
  $('hostLottoStats').innerHTML='<strong>'+lotteryLabel()+'｜'+count+' 張彩券</strong><span>'+message+'</span>';renderLotteryHistory();
}
function render(){if(displayMode){renderSharedProjection();return}const me=data.me;document.body.classList.toggle('needs-checkin',!completeGuest()&&!data.admin);$('checkStatus').textContent=completeGuest()?'✔ '+me.name+'，你已完成報到！':me?'已記下你的姓名，請再選好頭像完成報到。':'請先輸入姓名並選擇頭像。';renderProfileForm(me);$('navProfile').classList.toggle('visible',completeGuest());setHTML('navProfile',completeGuest()?avatarHTML(me.avatarKind,me.avatarValue)+escapeHTML(me.name):'');renderAvatarSelection();$('lottoStatus').textContent=lotteryLabel();$('lottoSelection').classList.toggle('hidden',!!data.myTicket||data.lottery.status!=='open');setHTML('myTicket',data.myTicket?'兌獎本名：<strong>'+escapeHTML(data.myTicket.name)+'</strong><br>您的幸運號碼：<strong>'+data.myTicket.numbers.map(n=>String(n).padStart(2,'0')).join(' · ')+'</strong>'+(data.myTicket.blessing?'<br>您的祝福：'+escapeHTML(data.myTicket.blessing):''):(!me?'報到後才能參與投注。':''));renderNumbers();renderTicketControls();renderLotteryHistory();renderDraw('drawBalls');renderHostDraw();$('drawStatus').textContent=lotteryLabel();setHTML('winners',drawCount()===6&&data.lottery.winners?.length?'<h3>🎉 六碼全中：'+data.lottery.winners.map(escapeHTML).join('、')+'</h3>':'');setHTML('photoGrid',data.photos.length?photoCards(data.admin):'<p class="muted">還沒有照片，成為第一位分享的人！</p>');setHTML('blessingList',data.blessings.slice().reverse().map(b=>'<div class="qaItem"><span class="blessing-author">'+avatarHTML(b.avatarKind,b.avatarValue)+'<strong>'+escapeHTML(b.name)+'</strong></span>：'+escapeHTML(b.text)+'</div>').join('')||'<p class="muted">還沒有留言，快送上第一份祝福。</p>');renderKahoot();$('adminLogin').classList.toggle('hidden',data.admin);$('adminDashboard').classList.toggle('hidden',!data.admin);if(data.admin){setHTML('stats','<p>🎟 已報到：<b>'+data.guests.length+'</b> 位　｜　📸 照片：<b>'+data.photos.length+'</b> 張　｜　💗 祝福：<b>'+data.blessings.length+'</b> 則　｜　🎱 彩券：<b>'+data.tickets.length+'</b> 張</p>');setHTML('attendees','<h3>報到名單</h3>'+data.guests.map(g=>'<span class="pill" style="margin:3px">'+avatarHTML(g.avatarKind,g.avatarValue)+escapeHTML(g.name)+'</span>').join(''));renderMahjongControls();renderLotteryControls();renderProxyControls();setHTML('ticketList',data.tickets.map(t=>'<div class="qaItem">'+escapeHTML(t.name)+'：'+t.numbers.join('、')+' <button class="outline" onclick="editTicketName(\''+escapeHTML(t.id)+'\')">更正本名</button>'+(t.blessing?'<br>💗 '+escapeHTML(t.blessing):'')+'</div>').join('')||'<p class="muted">尚無投注</p>');setHTML('manageBlessings',data.blessings.map(b=>'<div class="qaItem">'+avatarHTML(b.avatarKind,b.avatarValue)+escapeHTML(b.name)+'：'+escapeHTML(b.text)+' <button class="outline" onclick="removeBlessing(\''+b.id+'\')">刪除</button></div>').join('')||'目前無留言');setHTML('managePhotos',photoCards(true)||'目前無照片')}renderProjection()}
let lastDrawCount=-1,lastDrawStartedAt=0;
setInterval(()=>{if(data.lottery.startedAt!==lastDrawStartedAt){lastDrawStartedAt=data.lottery.startedAt;lastDrawCount=-1}if(data.lottery.status==='drawn'){const count=drawCount();renderDraw('drawBalls');renderHostDraw();$('drawStatus').textContent=lotteryLabel();$('lottoStatus').textContent=lotteryLabel();if(count===6&&lastDrawCount!==6){lastDrawCount=count;render()}else lastDrawCount=count}else lastDrawCount=-1;if(projection==='lotto')renderProjection();if(data.admin&&data.lottery.status==='drawn')renderLotteryControls()},250);
function pollDelay(){if(document.hidden)return displayMode?10000:120000;return displayMode||projection||hostMode?1000:$('games').classList.contains('active')?3000:$('wall').classList.contains('active')?8000:60000}
async function poll(){
  if(pollRunning)return;
  pollRunning=true;
  try{await refresh()}finally{pollRunning=false;clearTimeout(pollTimer);const delay=pollWake?0:pollDelay();pollWake=false;pollTimer=setTimeout(poll,delay)}
}
function wakePoll(){if(!pollStarted)return;clearTimeout(pollTimer);if(pollRunning){pollWake=true;return}void poll()}
function startPage(){
  if(displayMode){document.body.classList.add('display-mode');renderSharedProjection()}
  else if(new URLSearchParams(location.search).get('host')==='1')go('admin');
  window.addEventListener('focus',wakePoll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)wakePoll()});
  pollStarted=true;void poll();
}
startPage();
