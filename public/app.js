
const $ = id => document.getElementById(id);
const htmlFragments=new Map();
function setHTML(id,markup){const target=$(id);if(!target)return;const previous=htmlFragments.get(id);if(previous?.target===target&&previous.markup===markup)return;target.innerHTML=markup;htmlFragments.set(id,{target,markup})}
const TOKEN_KEY = 'wedding_1212_guest_token';
if(!$('kahootJoin')){const warning=document.createElement('p');warning.className='notice';warning.textContent='這份網頁與程式版本不一致。後台登入仍可使用；請完成修復檔上傳後，按 Ctrl＋F5 重新整理。';$('adminLogin')?.prepend(warning)}
let data = { admin:false, me:null, blessings:[], photos:[], lottery:{status:'open',result:[],startedAt:0,winners:[],ticketCount:0}, myTicket:null, guests:[],tickets:[],mahjong:{phase:'guess'}, kahoot:{url:'https://kahoot.it/',pin:''} };
let proxyPicks = [], proxyGuestId = '', proxyBusy = false, proxySignature = '';
let numberSignature='';
let picks = [], game = 'kahoot', projection = '', refreshing = false, lastDanmu = -1;
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
      const r=await fetch('/api/state',{headers:authHeaders(),credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw Error('無法讀取最新資料');
      const fresh=await r.json(),changed=JSON.stringify(fresh)!==JSON.stringify(data);data=fresh;if(changed)render();
      if(!completeGuest()&&!data.admin&&!hostMode)selectPanel('checkin');
      else if(!wasComplete&&completeGuest()&&$('checkin').classList.contains('active'))go('home');
    }catch(e){console.error(e);$('checkStatus').textContent='連線中斷，請稍後重新整理'}
  })();
  refreshPromise=reading.finally(()=>{refreshing=false;refreshPromise=null});
  return refreshPromise;
}

function authHeaders(){ const token=localStorage.getItem(TOKEN_KEY); return token?{'Authorization':'Bearer '+token}:{} }
async function act(type,fields={},options={}){ try{ const r=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json',...authHeaders()},credentials:'same-origin',body:JSON.stringify({type,...fields})}); const result=await r.json(); if(!r.ok)throw Error(result.error||'操作失敗'); if(!options.skipRefresh)await refresh(true); return result; }catch(e){toast(e.message||'操作失敗');return null} }
function go(t){document.body.classList.toggle('host-mode',t==='admin');if(t==='admin')hostMode=true; else if(t==='checkin')hostMode=false; if(!completeGuest()&&t!=='admin')t='checkin'; selectPanel(t);window.scrollTo({top:0,behavior:'smooth'});render() }
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
function spawnDanmu(txt,name,target,kind,value){const d=document.createElement('div');d.className='danmu';d.style.top=(10+Math.random()*75)+'%';d.innerHTML=avatarHTML(kind,value);d.append(document.createTextNode(name+'：'+txt));target.append(d);setTimeout(()=>d.remove(),31000)}
function tickDanmu(){
  const count=data.blessings.length;
  if(count&&!document.hidden){
    lastDanmu=(lastDanmu+1)%count;
    const b=data.blessings[lastDanmu];
    spawnDanmu(b.text,b.name,$('wallPreview'),b.avatarKind,b.avatarValue);
    if(projection==='wall')spawnDanmu(b.text,b.name,$('projWall'),b.avatarKind,b.avatarValue);
  }
  setTimeout(tickDanmu,count===1?34000:count===2?17000:count===3?11000:8500);
}
setTimeout(tickDanmu,2000);
async function uploadPhoto(){ if(!requireGuest())return; const file=$('photoFile').files[0]; if(!file)return toast('請先選照片'); if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)return toast('僅接受 8MB 以下的 JPG、PNG 或 WebP 圖片'); const image=new Image(); const url=URL.createObjectURL(file); image.onload=async()=>{ try{ const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(image.width,image.height)); canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale)); canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); const blob=await fitJpeg(canvas,600*1024); const r=await fetch('/api/photo',{method:'POST',headers:{'content-type':'image/jpeg',...authHeaders()},credentials:'same-origin',body:blob}); const result=await r.json(); if(!r.ok)throw Error(result.error||'上傳失敗'); $('photoFile').value=''; await refresh(); toast('照片已分享至婚禮相簿'); }catch(e){toast(e.message||'照片上傳失敗')}finally{URL.revokeObjectURL(url)} }; image.onerror=()=>{URL.revokeObjectURL(url);toast('無法讀取這張照片')}; image.src=url }
function setGame(v){if(!$('kahootPane')||!$('kahootTab'))return toast('網頁版本未更新完整，請重新整理或完成修復檔上傳。');game=v==='lotto'?'lotto':'kahoot';$('kahootPane').classList.toggle('hidden',game!=='kahoot');$('lottoPane').classList.toggle('hidden',game!=='lotto');$('kahootTab').className=game==='kahoot'?'primary':'outline';$('lottoTab').className=game==='lotto'?'primary':'outline';render()}
function clearPick(){picks=[];renderNumbers()}
function renderNumbers(){const signature=JSON.stringify([picks,data.lottery.status,!!data.myTicket]);if(signature===numberSignature)return;numberSignature=signature;const grid=$('numberGrid');grid.innerHTML='';for(let n=1;n<=49;n++){const b=document.createElement('button');b.className='num'+(picks.includes(n)?' selected':'');b.textContent=String(n).padStart(2,'0');b.disabled=data.lottery.status!=='open'||!!data.myTicket;b.onclick=()=>{if(picks.includes(n))picks=picks.filter(x=>x!==n);else if(picks.length<6)picks.push(n);else return toast('最多選六個號碼');renderNumbers()};grid.append(b)}$('pickedCount').textContent=picks.length}
async function submitTicket(){if(!requireGuest())return;await addTicket(null)}
async function addTicket(guestId){if(picks.length!==6)return toast('請選滿六個不同號碼');const result=await act(guestId?'proxyTicket':'ticket',{guestId,numbers:[...picks]});if(result){picks=[];render();toast('投注成功，祝您好運！')}}
function selectProxyGuest(id){proxyGuestId=id;proxyPicks=[];renderProxyControls()}
function pickProxyNumber(n){if(proxyBusy)return;if(proxyPicks.includes(n))proxyPicks=proxyPicks.filter(x=>x!==n);else if(proxyPicks.length<6)proxyPicks.push(n);else return toast('最多選六個號碼');renderProxyControls()}
function clearProxyPick(){proxyPicks=[];renderProxyControls()}
function renderProxyControls(){
  const signature=JSON.stringify([data.guests,data.tickets,data.lottery.status,proxyGuestId,proxyPicks,proxyBusy]);
  if(signature===proxySignature)return;proxySignature=signature;
  const ticketed=new Set(data.tickets.map(t=>t.guestId));
  $('proxyGuest').innerHTML='<option value="">請選擇已報到賓客</option>'+data.guests.map((g,i)=>'<option value="'+escapeHTML(g.id)+'" '+(g.id===proxyGuestId?'selected':'')+' '+(ticketed.has(g.id)?'disabled':'')+'>'+escapeHTML(g.name)+'（報到順序 '+(i+1)+'）'+(ticketed.has(g.id)?'｜已投注':'')+'</option>').join('');
  const unavailable=data.lottery.status!=='open'||!proxyGuestId||ticketed.has(proxyGuestId)||proxyBusy;
  $('proxyGuest').disabled=proxyBusy;
  $('proxyNumberGrid').innerHTML=Array.from({length:49},(_,i)=>'<button type="button" class="num '+(proxyPicks.includes(i+1)?'selected':'')+'" aria-pressed="'+proxyPicks.includes(i+1)+'" '+(unavailable?'disabled':'')+' onclick="pickProxyNumber('+(i+1)+')">'+String(i+1).padStart(2,'0')+'</button>').join('');
  $('proxyPicked').textContent=proxyPicks.length+' / 6 個｜'+proxyPicks.slice().sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('、');
  $('proxySubmit').disabled=unavailable||proxyPicks.length!==6;
  $('proxyClear').disabled=proxyBusy;
  $('proxyHint').textContent=data.lottery.status!=='open'?'目前已截止投注，請先開放選號。':ticketed.has(proxyGuestId)?'這位賓客已投注，請選擇其他賓客。':'選擇賓客及六碼後，可直接在此代投；每位賓客限一張彩券。';
}
async function proxyTicket(){
  if(proxyBusy)return;
  const target=data.guests.find(g=>g.id===proxyGuestId);
  if(!target)return toast('請先選擇已報到賓客');
  if(proxyPicks.length!==6)return toast('請選滿六個不同號碼');
  if(!confirm('確定替「'+target.name+'」投注：'+proxyPicks.slice().sort((a,b)=>a-b).join('、')+'？'))return;
  proxyBusy=true;renderProxyControls();
  try{if(await act('proxyTicket',{guestId:target.id,numbers:[...proxyPicks]})){proxyPicks=[];proxyGuestId='';toast('已替 '+target.name+' 完成投注')}}finally{proxyBusy=false;renderProxyControls()}
}
async function setLotteryState(status){if(await act('lottoState',{status}))toast(status==='open'?'投注已開放':'投注已截止')}
async function beginDraw(){if(await act('draw')){openProjection('lotto');toast('開始開獎')}}
async function resetLottery(){if(!confirm('確定清空這一輪所有彩券與開獎結果？'))return;await act('lottoReset')}
function drawCount(){if(data.lottery.status!=='drawn')return 0;return Math.min(6,Math.max(0,Math.floor((Date.now()-data.lottery.startedAt)/1600)))}
function lotteryLabel(){if(data.lottery.status==='drawn'&&drawCount()<6)return '幸福開獎中';return ({open:'投注開放中',closed:'已截止投注',drawn:'已開獎'})[data.lottery.status]||'等待開獎'}
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
  if(!confirm('確定刪除「'+photo.name+'」上傳的這張照片？刪除後無法還原。'))return;
  deletingPhotos.add(id);render();
  try{if(await act('photoDelete',{id}))toast('照片已刪除')}finally{deletingPhotos.delete(id);render()}
}
function photoCards(manage=false){return data.photos.map(p=>'<figure class="album-photo"><a href="'+p.url+'" target="_blank" rel="noopener"><img loading="lazy" alt="由 '+escapeHTML(p.name)+' 上傳，點選查看大圖" src="'+p.url+'"></a><figcaption>'+escapeHTML(p.name)+(manage?' <button type="button" class="photo-delete" '+(deletingPhotos.has(p.id)?'disabled':'')+' onclick="removePhoto(\''+p.id+'\')">'+(deletingPhotos.has(p.id)?'刪除中…':'刪除照片')+'</button>':'')+'</figcaption></figure>').join('')}
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
  const phase=mahjongPhase();
  $('mahjongHostStatus').textContent='目前投影畫面：'+mahjongViews[phase].title+(mahjongBusy?'（切換中…）':'');
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
function renderMahjongProjection(){
  const phase=mahjongPhase(),view=mahjongViews[phase],target=$('projMessage');
  $('projector').dataset.mahjongPhase=phase;
  if(target.dataset.mahjongPhase===phase)return;
  target.dataset.mahjongPhase=phase;
  target.innerHTML='<div class="mahjong-display" role="status" aria-live="polite"><div class="mahjong-tag">'+view.tag+'</div><div class="mahjong-tiles" aria-hidden="true"><span class="mahjong-tile mahjong-back"></span><span class="mahjong-tile mahjong-main">'+view.symbol+'</span><span class="mahjong-tile mahjong-back"></span></div><h2>'+view.title+'</h2><p class="mahjong-line">'+view.line+'</p><p class="mahjong-hint">'+view.hint+'</p><div class="mahjong-signature">宇童 ♡ 懷筑 · 2026.12.12</div></div>';
}
function openProjection(type){document.body.classList.add('projecting');projection=type;$('projector').classList.add('show');renderProjection()}
function closeProjection(){document.body.classList.remove('projecting');projection='';$('projector').classList.remove('show');$('projWall').innerHTML=''}
function renderProjection(){if(!projection)return;$('projector').dataset.mode=projection;if(projection==='mahjong'){$('projTitle').textContent='摸麻將挑戰';$('projWall').style.display='none';$('projBalls').innerHTML='';renderMahjongProjection();return}delete $('projMessage').dataset.mahjongPhase;$('projWall').style.display=projection==='wall'?'block':'none';$('projTitle').textContent=({wall:'幸福祝福牆',lotto:'幸福大樂透',kahoot:'Kahoot! 參賽入口'})[projection];setHTML('projBalls',projection==='lotto'?ballHTML():'');if(projection==='lotto')$('projMessage').textContent=drawCount()===6?'恭喜 '+(data.lottery.winners||[]).join('、')+'！':lotteryLabel();else if(projection==='kahoot'){const config=kahootSettings();$('projMessage').innerHTML='<div class="kahoot-projection"><span class="kahoot-mark">K!</span><h2>一起加入 Kahoot! 婚禮挑戰</h2><p>從婚禮網站點「前往 Kahoot!」</p><p class="kahoot-pin">'+(config.pin?'Game PIN：'+config.pin:'請依主持人指示輸入 PIN')+'</p><a class="primary kahoot-link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(config.url)+'">前往 Kahoot! ↗</a><p class="small">題目與排行榜請看接下來的 Kahoot! 主持畫面</p></div>'}else $('projMessage').textContent='讓祝福飛向宇童與懷筑 ♡'}
function renderProfileForm(me){
  const input=$('guestName');
  if(profileNameDraft===null)input.value=me?.name||'';
  input.disabled=false;
  $('checkinButton').textContent=me?'儲存姓名與頭像':'完成報到，進入婚禮網站 →';
  $('profileTitle').textContent=me?'我的婚禮資料 ♡':'先和我們打聲招呼 ♡';
  $('profileDescription').textContent=me?'可以修改姓名、更換可愛頭像，或重新拍照／上傳照片。':'輸入姓名、挑一個代表你的頭像，完成後就能進入婚禮網站。';
  document.querySelector('[data-tab="checkin"]').textContent=me?'我的資料':'賓客報到';
}
function renderLotteryControls(){
  const status=data.lottery.status,count=data.tickets.length;
  const [open,close,draw]=$('ad-lottery').querySelectorAll('.actions button');
  open.disabled=status==='open'||status==='drawn'||status==='drawing';
  close.disabled=status!=='open';
  draw.disabled=status!=='closed'||count===0;
  open.classList.toggle('current-step',status==='open');
  close.classList.toggle('current-step',status==='closed');
  draw.classList.toggle('current-step',status==='drawn'||status==='drawing');
  const message=status==='open'?'現在開放賓客選號。確認大家投完後，按「② 截止選號」。':status==='closed'?(count?'選號已截止，共 '+count+' 張有效彩券。按「③ 開始開獎」。':'選號已截止，目前沒有彩券。請重新開放選號，等至少一位賓客投注。'):'本輪已開獎。要再次進行，請按「重開新一輪」，舊彩券會清空。';
  $('hostLottoStats').innerHTML='<strong>'+lotteryLabel()+'｜'+count+' 張彩券</strong><span>'+message+'</span>';
}
function render(){const me=data.me;document.body.classList.toggle('needs-checkin',!completeGuest()&&!data.admin);$('checkStatus').textContent=completeGuest()?'✔ '+me.name+'，你已完成報到！':me?'已記下你的姓名，請再選好頭像完成報到。':'請先輸入姓名並選擇頭像。';renderProfileForm(me);$('navProfile').classList.toggle('visible',completeGuest());setHTML('navProfile',completeGuest()?avatarHTML(me.avatarKind,me.avatarValue)+escapeHTML(me.name):'');renderAvatarSelection();$('lottoStatus').textContent=lotteryLabel();$('lottoSelection').classList.toggle('hidden',!!data.myTicket||data.lottery.status!=='open');setHTML('myTicket',data.myTicket?'您的幸運號碼：<strong>'+data.myTicket.numbers.map(n=>String(n).padStart(2,'0')).join(' · ')+'</strong>':(!me?'報到後才能參與投注。':''));renderNumbers();setHTML('drawBalls',ballHTML());$('drawStatus').textContent=lotteryLabel();setHTML('winners',drawCount()===6&&data.lottery.winners?.length?'<h3>🎉 六碼全中：'+data.lottery.winners.map(escapeHTML).join('、')+'</h3>':'');setHTML('photoGrid',data.photos.length?photoCards(data.admin):'<p class="muted">還沒有照片，成為第一位分享的人！</p>');setHTML('blessingList',data.blessings.slice().reverse().map(b=>'<div class="qaItem"><span class="blessing-author">'+avatarHTML(b.avatarKind,b.avatarValue)+'<strong>'+escapeHTML(b.name)+'</strong></span>：'+escapeHTML(b.text)+'</div>').join('')||'<p class="muted">還沒有留言，快送上第一份祝福。</p>');renderKahoot();$('adminLogin').classList.toggle('hidden',data.admin);$('adminDashboard').classList.toggle('hidden',!data.admin);if(data.admin){setHTML('stats','<p>🎟 已報到：<b>'+data.guests.length+'</b> 位　｜　📸 照片：<b>'+data.photos.length+'</b> 張　｜　💗 祝福：<b>'+data.blessings.length+'</b> 則　｜　🎱 彩券：<b>'+data.tickets.length+'</b> 張</p>');setHTML('attendees','<h3>報到名單</h3>'+data.guests.map(g=>'<span class="pill" style="margin:3px">'+avatarHTML(g.avatarKind,g.avatarValue)+escapeHTML(g.name)+'</span>').join(''));renderMahjongControls();renderLotteryControls();renderProxyControls();setHTML('ticketList',data.tickets.map(t=>'<div class="qaItem">'+escapeHTML(t.name)+'：'+t.numbers.join('、')+'</div>').join('')||'<p class="muted">尚無投注</p>');setHTML('manageBlessings',data.blessings.map(b=>'<div class="qaItem">'+avatarHTML(b.avatarKind,b.avatarValue)+escapeHTML(b.name)+'：'+escapeHTML(b.text)+' <button class="outline" onclick="removeBlessing(\''+b.id+'\')">刪除</button></div>').join('')||'目前無留言');setHTML('managePhotos',photoCards(true)||'目前無照片')}renderProjection()}
setInterval(()=>{if(data.lottery.status==='drawn'&&drawCount()<6){setHTML('drawBalls',ballHTML());$('drawStatus').textContent=lotteryLabel();$('lottoStatus').textContent=lotteryLabel();if(drawCount()===6)render()}if(projection==='lotto')renderProjection()},250);
async function poll(){await refresh();const interval=document.hidden?120000:(projection||hostMode?3000:$('games').classList.contains('active')?5000:$('wall').classList.contains('active')?10000:60000);setTimeout(poll,interval)}
if(new URLSearchParams(location.search).get('host')==='1')go('admin');
window.addEventListener('focus',refresh);poll();
