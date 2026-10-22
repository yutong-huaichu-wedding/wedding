/* One shared, server-decided buzzer for every wedding activity. */
(function(root){
 const $=id=>document.getElementById(id);
 let config={},state={round:'',status:'idle',opensAt:0,title:'',winner:null},busy=false,reading=false,version=0,offset=0,initialized=false,connected=false,wonRound='',lastRead=0;
 let hosts=[];
 const serverTime=()=>Date.now()+offset;
 const active=()=>!document.hidden&&($('buzzer')?.classList.contains('active')||document.body.classList.contains('display-mode')||hosts.some(el=>!el.closest('.hidden')&&!el.closest('.panel:not(.active)')));
 function apply(result){if(result.buzzer)state=result.buzzer;if(Number.isFinite(result.serverNow))offset=result.serverNow-Date.now();connected=true;lastRead=Date.now();render()}
 function message(text){for(const el of document.querySelectorAll('[data-buzzer-message]'))el.textContent=text}
 function render(){
  const remaining=Math.max(0,Math.ceil((state.opensAt-serverTime())/1000)),open=connected&&state.status==='open'&&!remaining&&!state.winner;
  const text=!connected?'正在連接搶答…':state.winner?'🎉 '+state.winner.name+' 搶到！請上台':state.status==='open'?(remaining?'倒數 '+remaining+' 秒，準備！':'現在可以搶答！'):state.status==='ready'?'準備中，請等待主持人開始':state.status==='closed'?'本輪已關閉，等待下一輪':'請等待主持人準備新一輪';
  for(const el of document.querySelectorAll('[data-buzzer-status]'))el.textContent=text;
  for(const el of document.querySelectorAll('[data-buzzer-title]'))el.textContent=state.title||'現場搶答';
  const button=$('buzzerClaim');if(button){button.disabled=busy||!open;button.textContent=busy?'正在送出…':wonRound===state.round&&state.winner?'你搶到了！請上台':state.winner?'本輪已有得主':remaining&&state.status==='open'?'準備！'+remaining:'我要搶答';}
  for(const host of hosts){host.querySelector('[data-buzzer-prepare]').disabled=busy||!connected;host.querySelector('[data-buzzer-open]').disabled=busy||!connected||state.status!=='ready';host.querySelector('[data-buzzer-close]').disabled=busy||!connected||!(['ready','open'].includes(state.status)||state.winner&&state.showWinner!==false)}
  const overlay=$('buzzerScreen');if(overlay){overlay.hidden=!state.winner||state.showWinner===false;overlay.textContent=state.winner?'🎉 '+state.winner.name+' 搶到！請上台':'';}
 }
 async function refresh(){
  if(reading)return;reading=true;const revision=version;
  try{const response=await fetch('/api/buzzer',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const result=await response.json();if(revision===version&&!busy){apply(result);message('')}}
  catch{if(revision===version&&!busy){connected=false;message('連線中斷，請確認網路；尚未確認前不算搶答成功。');render()}}
  finally{reading=false;lastRead=Date.now()}
 }
 async function command(type,fields={}){
  if(busy)return;busy=true;version++;render();
  try{
   const response=await fetch('/api/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(config.authHeaders?.()||{})},signal:AbortSignal.timeout(10000),body:JSON.stringify({type,round:state.round,...fields})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'操作未完成，請重新確認');
   version++;if(result.won)wonRound=result.buzzer.round;apply(result);message(type==='buzzerClaim'?(result.won?'你搶到了！請依主持人指示上台。':'這輪已有人搶先，等下一輪再試！'):'');return result;
  }catch(error){message(error.message||'連線中斷，請確認結果後再試');}
  finally{busy=false;version++;render();void refresh()}
 }
 function claim(){if(!connected||state.status!=='open'||serverTime()<state.opensAt||state.winner||busy)return;if(config.requireGuest&&!config.requireGuest())return;return command('buzzerClaim')}
 function init(options={}){
  config={...config,...options};if(initialized)return;initialized=true;
  hosts=[...document.querySelectorAll('[data-buzzer-host]')];
  for(const host of hosts){host.classList.add('buzzer-host');host.innerHTML='<h3>⚡ 現場搶答</h3><p class="small">先準備新一輪，請賓客進入「現場搶答」，再開始 5 秒倒數。第一位由伺服器成功受理者上台。</p><label>本輪名稱（選填）<input data-buzzer-name maxlength="60" placeholder="例如：小貓第 1 題"></label><div class="actions"><button class="outline" data-buzzer-prepare>① 準備新一輪</button><button class="primary" data-buzzer-open>② 開始 5 秒倒數</button><button class="outline" data-buzzer-close>關閉／收起投影提示</button></div><p data-buzzer-title></p><p class="buzzer-status" data-buzzer-status role="status" aria-live="polite"></p><p class="small" data-buzzer-message role="status"></p>';
   host.querySelector('[data-buzzer-prepare]').onclick=()=>{if(['ready','open'].includes(state.status)&&!confirm('這會取消目前這輪搶答，確定重新準備？'))return;void command('buzzerPrepare',{title:host.querySelector('[data-buzzer-name]').value})};
   host.querySelector('[data-buzzer-open]').onclick=()=>void command('buzzerOpen');host.querySelector('[data-buzzer-close]').onclick=()=>void command('buzzerClose');
  }
  if(document.body.classList.contains('display-mode')||new URLSearchParams(location.search).get('display')==='1'){
   const overlay=document.createElement('div');overlay.id='buzzerScreen';overlay.className='buzzer-screen';overlay.hidden=true;overlay.setAttribute('role','status');document.body.append(overlay);
  }
  if($('buzzerClaim'))$('buzzerClaim').onclick=claim;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())void refresh()});root.addEventListener('focus',()=>{if(active())void refresh()});
  setInterval(()=>{if(active()){render();if(!reading&&Date.now()-lastRead>=1000)void refresh()}},250);
  render();if(active())void refresh();
 }
 root.WeddingBuzzer={init,refresh,claim,command};
})(window);

