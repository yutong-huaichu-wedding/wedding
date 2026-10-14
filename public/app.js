
const $ = id => document.getElementById(id);
const TOKEN_KEY = 'wedding_1212_guest_token';
let data = { admin:false, me:null, blessings:[], photos:[], lottery:{status:'open',result:[],startedAt:0,winners:[],ticketCount:0}, myTicket:null, quiz:{index:-1,open:false,question:null,total:0,myAnswer:null,myScore:0}, guests:[],tickets:[],questions:[],scores:[] };
let picks = [], game = 'quiz', projection = '', refreshing = false, lastDanmu = -1;
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
async function refresh(){ if(refreshing)return; refreshing=true; try{ const wasComplete=completeGuest(); const r=await fetch('/api/state',{headers:authHeaders(),credentials:'same-origin',cache:'no-store'}); if(!r.ok)throw Error('無法讀取最新資料'); data=await r.json(); render(); if(!completeGuest()&&!data.admin&&!hostMode)selectPanel('checkin'); else if(!wasComplete&&completeGuest()&&$('checkin').classList.contains('active'))go('home'); }catch(e){ console.error(e); $('checkStatus').textContent='連線中斷，請稍後重新整理'; }finally{refreshing=false} }
function authHeaders(){ const token=localStorage.getItem(TOKEN_KEY); return token?{'Authorization':'Bearer '+token}:{} }
async function act(type,fields={}){ try{ const r=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json',...authHeaders()},credentials:'same-origin',body:JSON.stringify({type,...fields})}); const result=await r.json(); if(!r.ok)throw Error(result.error||'操作失敗'); await refresh(); return result; }catch(e){toast(e.message||'操作失敗');return null} }
function go(t){ if(t==='admin')hostMode=true; else if(t==='checkin')hostMode=false; if(!completeGuest()&&t!=='admin')t='checkin'; selectPanel(t);window.scrollTo({top:0,behavior:'smooth'});render() }
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
function setGame(v){ game=v; $('quizPane').classList.toggle('hidden',v!=='quiz'); $('lottoPane').classList.toggle('hidden',v!=='lotto'); $('quizTab').className=v==='quiz'?'primary':'outline'; $('lottoTab').className=v==='lotto'?'primary':'outline'; render() }
function clearPick(){picks=[];renderNumbers()}
function renderNumbers(){const grid=$('numberGrid');grid.innerHTML='';for(let n=1;n<=49;n++){const b=document.createElement('button');b.className='num'+(picks.includes(n)?' selected':'');b.textContent=String(n).padStart(2,'0');b.disabled=data.lottery.status!=='open'||!!data.myTicket;b.onclick=()=>{if(picks.includes(n))picks=picks.filter(x=>x!==n);else if(picks.length<6)picks.push(n);else return toast('最多選六個號碼');renderNumbers()};grid.append(b)}$('pickedCount').textContent=picks.length}
async function submitTicket(){if(!requireGuest())return;await addTicket(null)}
async function addTicket(guestId){if(picks.length!==6)return toast('請選滿六個不同號碼');const result=await act(guestId?'proxyTicket':'ticket',{guestId,numbers:[...picks]});if(result){picks=[];render();toast('投注成功，祝您好運！')}}
async function proxyTicket(){const name=$('proxyName').value.trim(),matches=(data.guests||[]).filter(x=>x.name===name);if(matches.length!==1)return toast(matches.length?'同名賓客不只一位，無法代投':'找不到這位已報到的賓客');await addTicket(matches[0].id)}
async function setLotteryState(status){if(await act('lottoState',{status}))toast(status==='open'?'投注已開放':'投注已截止')}
async function beginDraw(){if(await act('draw')){openProjection('lotto');toast('開始開獎')}}
async function resetLottery(){if(!confirm('確定清空這一輪所有彩券與開獎結果？'))return;await act('lottoReset')}
function drawCount(){if(data.lottery.status!=='drawn')return 0;return Math.min(6,Math.max(0,Math.floor((Date.now()-data.lottery.startedAt)/1600)))}
function lotteryLabel(){if(data.lottery.status==='drawn'&&drawCount()<6)return '幸福開獎中';return ({open:'投注開放中',closed:'已截止投注',drawn:'已開獎'})[data.lottery.status]||'等待開獎'}
function ballHTML(){const arr=(data.lottery.result||[]).slice(0,drawCount());return [...Array(6)].map((_,i)=>'<div class="ball '+(i>=arr.length?'placeholder':'')+'">'+(i<arr.length?String(arr[i]).padStart(2,'0'):'?')+'</div>').join('')}
function renderQuiz(){const q=data.quiz.question,answered=data.quiz.myAnswer!==null&&data.quiz.myAnswer!==undefined;$('quizStatus').textContent=data.quiz.index<0?'等待主持人出題':data.quiz.open?'第 '+(data.quiz.index+1)+' 題｜開放作答':'第 '+(data.quiz.index+1)+' 題｜作答已結束';if(!q){$('quizContent').innerHTML='<p class="muted">遊戲尚未開始，請留意主持人宣布。</p>';return}let out='<h3>'+escapeHTML(q.text)+'</h3>';q.options.forEach((option,i)=>out+='<button class="quizopt '+(data.quiz.myAnswer===i?'chosen':'')+'" '+(!data.quiz.open||answered?'disabled':'')+' onclick="answerQuiz('+i+')">'+String.fromCharCode(65+i)+'．'+escapeHTML(option)+'</button>');if(answered)out+='<p class="pill">您已作答</p>';if(!data.quiz.open&&q.correct!==undefined)out+='<p class="status">正確答案：'+String.fromCharCode(65+q.correct)+'．'+escapeHTML(q.options[q.correct])+'</p>';if(data.me)out+='<p class="status">目前累計得分：'+data.quiz.myScore+'</p>';$('quizContent').innerHTML=out}
async function answerQuiz(choice){if(!requireGuest())return;if(await act('answer',{choice}))toast('作答已送出')}
async function nextQuestion(){await act('quizNext')}
async function closeQuestion(){await act('quizClose')}
async function resetQuiz(){if(confirm('重新開始將清空所有答題與分數，確定嗎？'))await act('quizReset')}
async function addQuestion(){const text=$('newQuestion').value.trim(),options=[0,1,2,3].map(i=>$('qa'+i).value.trim());if(!text||options.some(x=>!x))return toast('請輸入問題和四個選項');if(await act('questionAdd',{text,options,correct:Number($('qaCorrect').value)})){$('newQuestion').value='';[0,1,2,3].forEach(i=>$('qa'+i).value='');toast('已新增題目')}}
async function deleteQuestion(i){const q=data.questions[i];if(q&&confirm('確定刪除這道題目？'))await act('questionDelete',{id:q.id})}
let questionSignature='', draggedQuestionId='';
function renderQuestionEditor(){
  const manager=$('questionManager');
  const signature=JSON.stringify([data.quiz.index,data.questions]);
  if(signature===questionSignature)return;
  questionSignature=signature;
  const locked=data.quiz.index>=0;
  manager.innerHTML='<p class="small muted">'+(locked?'測驗已開始。要修改或排序題目，請先按「重新開始測驗」。':'點題目可展開編輯；用上下按鈕或拖曳調整出題順序。')+'</p>'+(data.questions.length?data.questions.map((q,i)=>'<details class="question-card" data-question-id="'+escapeHTML(q.id)+'"><summary><span class="drag-handle" title="拖曳排序" draggable="'+(!locked)+'">⋮⋮</span><span class="question-order">'+(i+1)+'</span><strong>'+escapeHTML(q.text)+'</strong><span class="question-summary-action">編輯 ▾</span></summary><div class="question-form"><label>題目<input class="edit-question-text" maxlength="160" value="'+escapeHTML(q.text)+'" '+(locked?'disabled':'')+'></label><div class="question-options">'+q.options.map((option,j)=>'<label>選項 '+String.fromCharCode(65+j)+'<input class="edit-question-option" maxlength="80" value="'+escapeHTML(option)+'" '+(locked?'disabled':'')+'></label>').join('')+'</div><label>正確答案<select class="edit-question-correct" '+(locked?'disabled':'')+'>'+q.options.map((_,j)=>'<option value="'+j+'" '+(j===q.correct?'selected':'')+'>'+String.fromCharCode(65+j)+'</option>').join('')+'</select></label><div class="question-actions"><button class="primary" type="button" onclick="saveQuestion('+i+')" '+(locked?'disabled':'')+'>儲存題目</button><button class="outline" type="button" onclick="moveQuestion('+i+',-1)" '+(locked||i===0?'disabled':'')+'>↑ 上移</button><button class="outline" type="button" onclick="moveQuestion('+i+',1)" '+(locked||i===data.questions.length-1?'disabled':'')+'>↓ 下移</button><button class="outline" type="button" onclick="deleteQuestion('+i+')" '+(locked?'disabled':'')+'>刪除</button></div></div></details>').join(''):'<p class="muted">目前沒有題目，請在下方新增。</p>');
  manager.querySelectorAll('.question-card').forEach(card=>{
    card.addEventListener('dragstart',event=>{if(locked){event.preventDefault();return}draggedQuestionId=card.dataset.questionId;event.dataTransfer.effectAllowed='move'});
    card.addEventListener('dragover',event=>{if(!locked){event.preventDefault();card.classList.add('drag-over')}});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',event=>{event.preventDefault();card.classList.remove('drag-over');if(!draggedQuestionId||draggedQuestionId===card.dataset.questionId)return;const ids=data.questions.map(q=>q.id),from=ids.indexOf(draggedQuestionId),to=ids.indexOf(card.dataset.questionId);if(from<0||to<0)return;ids.splice(to,0,ids.splice(from,1)[0]);draggedQuestionId='';reorderQuestions(ids)});
    card.addEventListener('dragend',()=>{draggedQuestionId='';manager.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'))});
  });
}
async function saveQuestion(i){const q=data.questions[i],card=[...$('questionManager').querySelectorAll('.question-card')].find(x=>x.dataset.questionId===q?.id);if(!card)return;const text=card.querySelector('.edit-question-text').value.trim(),options=[...card.querySelectorAll('.edit-question-option')].map(x=>x.value.trim()),correct=Number(card.querySelector('.edit-question-correct').value);if(!text||options.some(x=>!x))return toast('請填好題目和四個選項');if(await act('questionEdit',{id:q.id,text,options,correct}))toast('題目已儲存')}
async function reorderQuestions(ids){if(await act('questionReorder',{ids}))toast('題目順序已更新')}
async function moveQuestion(i,offset){const ids=data.questions.map(q=>q.id),target=i+offset;if(target<0||target>=ids.length)return;[ids[i],ids[target]]=[ids[target],ids[i]];await reorderQuestions(ids)}
async function loginAdmin(){const password=$('adminPassword').value;if(await act('login',{password})){$('adminPassword').value='';toast('已進入主持人控制台')}}
async function logoutAdmin(){await act('logout')}
function adminTab(t,btn){document.querySelectorAll('.adpane').forEach(e=>e.classList.toggle('hidden',e.id!=='ad-'+t));document.querySelectorAll('.adminnav button').forEach(e=>e.classList.remove('active'));btn.classList.add('active');render()}
async function removeBlessing(id){if(confirm('確定刪除這則祝福？'))await act('blessingDelete',{id})}
async function removePhoto(id){if(confirm('確定刪除這張照片？'))await act('photoDelete',{id})}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wedding-data-20261212.json';a.click();URL.revokeObjectURL(a.href)}
async function resetDemo(){if(!confirm('確定清空所有報到、照片、留言、遊戲資料？此操作不可還原。'))return;if(!confirm('請再次確認：真的要刪除所有婚禮資料？'))return;await act('resetAll')}
function openProjection(type){projection=type;$('projector').classList.add('show');renderProjection()}
function closeProjection(){projection='';$('projector').classList.remove('show');$('projWall').innerHTML=''}
function renderProjection(){if(!projection)return;$('projWall').style.display=projection==='wall'?'block':'none';$('projTitle').textContent=({wall:'幸福祝福牆',lotto:'幸福大樂透',quiz:'快問快答'})[projection];$('projBalls').innerHTML=projection==='lotto'?ballHTML():'';if(projection==='lotto')$('projMessage').textContent=drawCount()===6?'恭喜 '+(data.lottery.winners||[]).join('、')+'！':lotteryLabel();else if(projection==='quiz'){const q=data.quiz.question;$('projMessage').innerHTML=q?escapeHTML(q.text)+'<div style="font-size:.65em;line-height:2;margin-top:20px">'+q.options.map((x,i)=>String.fromCharCode(65+i)+'．'+escapeHTML(x)).join('<br>')+'</div>':'等待主持人出題'}else $('projMessage').textContent='讓祝福飛向宇童與懷筑 ♡'}
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
function render(){const me=data.me;document.body.classList.toggle('needs-checkin',!completeGuest()&&!data.admin);$('checkStatus').textContent=completeGuest()?'✔ '+me.name+'，你已完成報到！':me?'已記下你的姓名，請再選好頭像完成報到。':'請先輸入姓名並選擇頭像。';renderProfileForm(me);$('navProfile').classList.toggle('visible',completeGuest());$('navProfile').innerHTML=completeGuest()?avatarHTML(me.avatarKind,me.avatarValue)+escapeHTML(me.name):'';renderAvatarSelection();$('lottoStatus').textContent=lotteryLabel();$('lottoSelection').classList.toggle('hidden',!!data.myTicket||data.lottery.status!=='open');$('myTicket').innerHTML=data.myTicket?'您的幸運號碼：<strong>'+data.myTicket.numbers.map(n=>String(n).padStart(2,'0')).join(' · ')+'</strong>':(!me?'報到後才能參與投注。':'');renderNumbers();$('drawBalls').innerHTML=ballHTML();$('drawStatus').textContent=lotteryLabel();$('winners').innerHTML=drawCount()===6&&data.lottery.winners?.length?'<h3>🎉 六碼全中：'+data.lottery.winners.map(escapeHTML).join('、')+'</h3>':'';$('photoGrid').innerHTML=data.photos.length?data.photos.map(p=>'<img loading="lazy" alt="由 '+escapeHTML(p.name)+' 上傳" src="'+p.url+'">').join(''):'<p class="muted">還沒有照片，成為第一位分享的人！</p>';$('blessingList').innerHTML=data.blessings.slice().reverse().map(b=>'<div class="qaItem"><span class="blessing-author">'+avatarHTML(b.avatarKind,b.avatarValue)+'<strong>'+escapeHTML(b.name)+'</strong></span>：'+escapeHTML(b.text)+'</div>').join('')||'<p class="muted">還沒有留言，快送上第一份祝福。</p>';renderQuiz();$('adminLogin').classList.toggle('hidden',data.admin);$('adminDashboard').classList.toggle('hidden',!data.admin);if(data.admin){$('stats').innerHTML='<p>🎟 已報到：<b>'+data.guests.length+'</b> 位　｜　📸 照片：<b>'+data.photos.length+'</b> 張　｜　💗 祝福：<b>'+data.blessings.length+'</b> 則　｜　🎱 彩券：<b>'+data.tickets.length+'</b> 張</p>';$('attendees').innerHTML='<h3>報到名單</h3>'+data.guests.map(g=>'<span class="pill" style="margin:3px">'+avatarHTML(g.avatarKind,g.avatarValue)+escapeHTML(g.name)+'</span>').join('');renderLotteryControls();$('ticketList').innerHTML=data.tickets.map(t=>'<div class="qaItem">'+escapeHTML(t.name)+'：'+t.numbers.join('、')+'</div>').join('')||'<p class="muted">尚無投注</p>';renderQuestionEditor();$('hostQuizStats').textContent='目前第 '+Math.max(0,data.quiz.index+1)+' / '+data.quiz.total+' 題｜'+(data.quiz.open?'開放作答':'作答未開放');$('quizRanking').innerHTML='<h3>得分排行榜</h3>'+data.scores.map((row,i)=>'<p>'+(i+1)+'. '+avatarHTML(row.avatarKind,row.avatarValue)+escapeHTML(row.name)+' — '+row.score+' 分</p>').join('');$('manageBlessings').innerHTML=data.blessings.map(b=>'<div class="qaItem">'+avatarHTML(b.avatarKind,b.avatarValue)+escapeHTML(b.name)+'：'+escapeHTML(b.text)+' <button class="outline" onclick="removeBlessing(\''+b.id+'\')">刪除</button></div>').join('')||'目前無留言';$('managePhotos').innerHTML=data.photos.map(p=>'<div class="qaItem">'+escapeHTML(p.name)+' <img src="'+p.url+'" style="width:65px;height:65px;object-fit:cover;vertical-align:middle"> <button class="outline" onclick="removePhoto(\''+p.id+'\')">刪除</button></div>').join('')||'目前無照片'}renderProjection()}
setInterval(()=>{if(data.lottery.status==='drawn'&&drawCount()<6){$('drawBalls').innerHTML=ballHTML();$('drawStatus').textContent=lotteryLabel();$('lottoStatus').textContent=lotteryLabel();if(drawCount()===6)render()}if(projection==='lotto')renderProjection()},250);
async function poll(){await refresh();const interval=document.hidden?120000:(projection||hostMode?3000:$('games').classList.contains('active')?8000:$('wall').classList.contains('active')?10000:60000);setTimeout(poll,interval)}
window.addEventListener('focus',refresh);poll();
