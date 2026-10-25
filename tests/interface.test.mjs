// Render and interaction checks without a browser or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},setAttribute(){},disabled:false,style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},append(){},querySelectorAll(){return []}});return elements.get(id)};
 const lotteryButtons=Array.from({length:4},(_,i)=>element('lotteryButton'+i));element('ad-lottery').querySelectorAll=()=>lotteryButtons;
 const document={addEventListener(){},getElementById:element,querySelector:element,querySelectorAll(){return []},createElement:element,body:element('body'),hidden:false};
 const ctx=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem(){return null}},setTimeout(){},setInterval(){},clearTimeout(){},console,URLSearchParams,location:{search:''},fetch:()=>new Promise(()=>{}),URL,Blob,confirm:()=>true});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ctx);
 return {ctx,element,run:code=>vm.runInContext(code,ctx)};
}
test('proxy selection is independent, capped at six and clears on guest change',()=>{
 const {run,element}=setup();run(`data.guests=[{id:'a',name:'同名'},{id:'b',name:'同名'},{id:'c',name:'已投注'}];data.tickets=[{guestId:'c'}];picks=[40,41,42,43,44,45];selectProxyGuest('a');[1,2,3,4,5,6,7].forEach(pickProxyNumber)`);
 assert.equal(run('proxyPicks.join()'),'1,2,3,4,5,6');assert.equal(run('picks.join()'),'40,41,42,43,44,45');assert.equal(element('proxySubmit').disabled,false);assert.match(element('proxyGuest').innerHTML,/報到順序 2/);assert.match(element('proxyGuest').innerHTML,/disabled>已投注/);
 run(`selectProxyGuest('b')`);assert.equal(run('proxyPicks.length'),0);assert.equal(element('proxySubmit').disabled,true);
 run(`data.lottery.status='closed';renderProxyControls()`);assert.match(element('proxyHint').textContent,/已截止/);assert.match(element('proxyNumberGrid').innerHTML,/disabled/);
});
test('album deletion is visible to host only and escapes uploader name',()=>{
 const {run}=setup();run(`data.photos=[{id:'p1',name:'<賓客>',url:'/api/photo/p1'}]`);
 assert.doesNotMatch(run('photoCards(false)'),/刪除照片|removePhoto/);run('data.admin=true');const html=run('photoCards(true)');assert.match(html,/刪除照片/);assert.match(html,/&lt;賓客&gt;/);assert.match(html,/removePhoto\('p1'\)/);assert.match(html,/target="_blank"/);
});
test('guest sees delete for own photo only; selecting someone else photo cannot submit a delete',async()=>{
 const {run}=setup();run("data.me={id:'a',name:'賓客',avatarKind:'preset',avatarValue:'cat'};data.photos=[{id:'own',name:'同名賓客',url:'/api/photo/own',canDelete:true},{id:'other',name:'同名賓客',url:'/api/photo/other',canDelete:false}];globalThis.calls=[];act=async(type,fields)=>{calls.push({type,...fields});return {ok:true}}");
 const html=run('photoCards()');assert.match(html,/刪除我的照片/);assert.match(html,/removePhoto\('own'\)/);assert.doesNotMatch(html,/removePhoto\('other'\)/);
 await run("removePhoto('other')");assert.equal(run('calls.length'),0);await run("removePhoto('own')");assert.equal(run('calls.length'),1);assert.equal(run('calls[0].id'),'own');
});
test('mahjong projection renders three distinct manual views and restores when changing projection modes',()=>{
 const {run,element}=setup();
 for(const [phase,title] of [['guess','猜猜是什麼牌？'],['correct','答對了！'],['wrong','答錯了！']]){
  run(`data.mahjong={phase:${JSON.stringify(phase)}};openProjection('mahjong');renderMahjongControls()`);
  assert.equal(element('projector').dataset.mode,'mahjong');assert.equal(element('projector').dataset.mahjongPhase,phase);
  assert.ok(element('projMessage').innerHTML.includes(title));assert.ok(element('mahjongHostStatus').textContent.includes(title));
  assert.equal(element('projBalls').innerHTML,'');assert.equal(element('projWall').style.display,'none');
 }
 run("openProjection('wall');data.mahjong={phase:'wrong'};openProjection('mahjong')");assert.ok(element('projMessage').innerHTML.includes('答錯了！'));
 run("data.mahjong={phase:'invalid'};renderProjection()");assert.ok(element('projMessage').innerHTML.includes('猜猜是什麼牌？'));
});

test('mahjong phone controls send only manual state and prevent overlapping requests without opening projection',async()=>{
 const {run,element}=setup();run("globalThis.calls=[];globalThis.release=null;act=(type,fields)=>{calls.push({type,...fields});return new Promise(resolve=>release=resolve)};globalThis.pending=setMahjongPhase('correct')");
 assert.equal(element('mahjongCorrect').disabled,true);await run("setMahjongPhase('wrong')");assert.equal(run('calls.length'),1);assert.equal(run('calls[0].type'),'mahjongPhase');assert.equal(run('calls[0].phase'),'correct');assert.equal(run('projection'),'');
 run('release(null)');await run('pending');assert.equal(element('mahjongCorrect').disabled,false);
});


test('lottery sends one ticket with blessing, keeps failed drafts, and clears only on success',async()=>{
 const {run,element}=setup();
 run("data.me={id:'a',name:'賓客',avatarKind:'preset',avatarValue:'cat'};picks=[1,2,3,4,5,6];globalThis.sent=[];globalThis.finish=null;act=(type,fields)=>{sent.push({type,...fields});return new Promise(resolve=>finish=resolve)}");
 element('ticketBlessing').value='  祝幸福久久  ';element('ticketRealName').value='王小明';
 run('globalThis.sending=submitTicket()');assert.equal(element('ticketSubmit').disabled,true);assert.equal(element('ticketBlessing').disabled,true);
 await run('submitTicket()');assert.equal(run('sent.length'),1);assert.equal(run('sent[0].blessing'),'祝幸福久久');assert.equal(run('sent[0].realName'),'王小明');
 run('finish(null)');await run('sending');assert.equal(element('ticketBlessing').value,'  祝幸福久久  ');assert.equal(run('picks.length'),6);assert.equal(element('ticketSubmit').disabled,false);
 run('globalThis.sending=submitTicket();finish({ok:true})');await run('sending');assert.equal(element('ticketBlessing').value,'');assert.equal(run('picks.length'),0);
});

test('wedding wall mounts fireworks once and stops them when changing projection activity',()=>{
 const {run}=setup();
 run("globalThis.walls=[];window.WeddingFireworks={mount(target){const item={target,displayAtMount:target.style.display,modeAtMount:$('projector').dataset.mode,active:false,update(messages){this.messages=messages},setActive(active){this.active=active}};walls.push(item);return item}};data.blessings=[{id:'a',name:'賓客',text:'新婚快樂'}];openProjection('wall')");
 assert.equal(run('walls.length'),1);assert.equal(run('walls[0].active'),true);assert.equal(run('walls[0].messages[0].text'),'新婚快樂');
 assert.equal(run('walls[0].displayAtMount'),'block');assert.equal(run('walls[0].modeAtMount'),'wall');
 run('renderProjection()');assert.equal(run('walls.length'),1);
 run("openProjection('mahjong')");assert.equal(run('walls[0].active'),false);
 run("openProjection('wall');closeProjection()");assert.equal(run('walls[0].active'),false);
});

test('offline proxy retains failed drafts, prevents double submit and confirms a successful receipt',async()=>{
 const {run,element}=setup();run("data.admin=true;selectProxyGuest('offline');proxyPicks=[1,2,3,4,5,6];globalThis.sent=[];globalThis.finish=null;act=(type,fields)=>{sent.push({type,...fields});return new Promise(resolve=>finish=resolve)}");
 element('proxyRealName').value='李阿公';element('proxyBlessing').value='幸福久久';run('globalThis.sending=proxyTicket()');
 await run('proxyTicket()');assert.equal(run('sent.length'),1);assert.equal(run('sent[0].offline'),true);assert.equal(run('sent[0].guestId'),undefined);assert.equal(element('proxySubmit').disabled,true);
 run('finish(null)');await run('sending');assert.equal(element('proxyRealName').value,'李阿公');assert.equal(run('proxyPicks.length'),6);
 run('globalThis.sending=proxyTicket();finish({ok:true})');await run('sending');assert.match(element('proxyReceipt').textContent,/李阿公.*01、02、03、04、05、06/);assert.equal(element('proxyRealName').value,'');assert.equal(element('proxyBlessing').value,'');assert.equal(run('proxyGuestId'),'offline');
});

test('projecting the lottery never renders a second machine hidden in the original page',()=>{
 const {run,element}=setup();element('games').classList.contains=()=>true;
 run("globalThis.machines=[];globalThis.stopped=[];window.WeddingLottery={count:()=>0,mount(target){machines.push(target);return {update(){}}},unmount(target){stopped.push(target)}};game='lotto';renderDraw('drawBalls')");
 assert.equal(run('machines.length'),1);run("openProjection('lotto');renderDraw('drawBalls')");assert.equal(run('machines.length'),2);assert.equal(run('machines[1]'),element('projBalls'));assert.ok(run('stopped.includes($(\"drawBalls\"))'));
 run('closeProjection()');assert.equal(run('machines.length'),3);assert.equal(run('machines[2]'),element('drawBalls'));
});
test('completed lottery offers another prize and shows retained named award history',()=>{
 const {run,element}=setup();const buttons=Array.from({length:4},(_,i)=>element('lotteryButton'+i));element('ad-lottery').querySelectorAll=()=>buttons;
 run("data.admin=true;data.tickets=[{guestId:'a'},{guestId:'b'}];data.lottery={status:'drawn',result:[1,2,3,4,5,6],startedAt:Date.now()-60000,durationMs:15600,remainingCount:1,draws:[{index:1,prizeName:'二獎',result:[1,2,3,4,5,6],startedAt:1,winners:['王阿姨']}]};renderLotteryControls()");
 assert.equal(buttons[2].disabled,false);assert.match(buttons[2].textContent,/開下一個獎.*保留彩券/);assert.match(element('hostDrawHistory').innerHTML,/二獎.*王阿姨/s);
 run('data.lottery.remainingCount=0;renderLotteryControls()');assert.equal(buttons[2].disabled,true);assert.match(element('hostLottoStats').innerHTML,/都已中獎/);
});

test('phone host opens and watches a draw in controls without entering projection',async()=>{
 const {run,element}=setup();element('admin').classList.contains=()=>true;
 run("data.admin=true;globalThis.machines=[];window.WeddingLottery={count:()=>0,mount(target){machines.push(target);return {update(){}}},unmount(){}};globalThis.sent=[];act=async(type,fields)=>{sent.push({type,...fields});data.lottery={status:'drawn',result:[1,2,3,4,5,6],startedAt:Date.now(),winners:['王小明']};return {ok:true}}");
 element('drawPrizeName').value='頭獎';await run('beginDraw()');
 assert.equal(run('sent[0].type'),'draw');assert.equal(run('sent[0].prizeName'),'頭獎');assert.equal(run('projection'),'');assert.equal(run('machines.length'),1);assert.equal(run('machines[0]'),element('hostDrawBalls'));assert.equal(element('drawPrizeName').value,'');
 run('window.WeddingLottery.count=()=>6;renderHostDraw()');assert.match(element('hostDrawStatus').textContent,/恭喜 王小明/);
});
test('failed phone draw retains draft and does not open a machine or projection',async()=>{
 const {run,element}=setup();run('data.admin=true;act=async()=>null');element('drawPrizeName').value='加碼獎';await run('beginDraw()');assert.equal(element('drawPrizeName').value,'加碼獎');assert.equal(run('projection'),'');assert.equal(run('drawBusy'),false);
});
test('host may visit guest lottery page without having registered as a guest',()=>{
 const {run,element,ctx}=setup();ctx.window.scrollTo=()=>{};const selected=[];element('games').id='games';element('games').classList.toggle=(name,on)=>selected.push({name,on});ctx.document.querySelectorAll=selector=>selector==='.panel'?[element('games')]:[];
 run("data.admin=true;data.me=null;go('games');setGame('lotto')");assert.ok(selected.some(x=>x.name==='active'&&x.on));assert.equal(run('game'),'lotto');
});
test('normal phone lottery follows shared draw data while hidden host and projection machines stay stopped',()=>{
 const {run,element}=setup();element('games').classList.contains=()=>true;
 run("game='lotto';data.projection={mode:'lotto'};globalThis.machines=[];globalThis.stopped=[];window.WeddingLottery={count:()=>0,mount(target){machines.push(target);return {update(value){globalThis.seen=value}}},unmount(target){stopped.push(target)}};data.lottery={status:'drawn',startedAt:123,result:[1,2,3,4,5,6]};renderDraw('drawBalls');renderHostDraw()");
 assert.equal(run('machines.length'),1);assert.equal(run('machines[0]'),element('drawBalls'));assert.equal(run('seen.startedAt'),123);assert.equal(run('projection'),'');assert.ok(run('stopped.includes($("hostDrawBalls"))'));
 element('admin').classList.contains=()=>true;run("data.admin=true;openProjection('lotto');renderHostDraw()");assert.equal(run('machines.length'),2);assert.equal(run('machines[1]'),element('projBalls'));assert.ok(run('stopped.includes($("drawBalls"))'));assert.ok(run('stopped.includes($("hostDrawBalls"))'));
});

test('mahjong listening preview and projection switch questions and hide answers when returning to touch game',()=>{
 const {run,ctx,element}=setup();vm.runInContext(readFileSync(new URL('../public/mahjong-quiz.js',import.meta.url),'utf8'),ctx);
 run("data.mahjong={kind:'quiz',index:4,phase:'question'};renderMahjongControls();openProjection('mahjong')");assert.match(element('projMessage').innerHTML,/找出所有聽牌/);assert.doesNotMatch(element('projMessage').innerHTML,/class="listen-answer"/);assert.equal(element('mahjongQuizNext').disabled,true);
 run("data.mahjong.phase='answer';renderMahjongControls();renderProjection()");assert.match(element('projMessage').innerHTML,/class="listen-answer"/);assert.match(element('mahjongQuizPreview').innerHTML,/二二／三四五／六七八/);
 run("data.mahjong={phase:'correct'};renderProjection()");assert.match(element('projMessage').innerHTML,/答對了/);
 run("data.mahjong={kind:'quiz',index:4,phase:'answer'};renderProjection()");assert.match(element('projMessage').innerHTML,/class="listen-answer"/);
 run("data.mahjong={kind:'quiz',index:0,phase:'question'};renderMahjongControls();renderProjection()");assert.match(element('projMessage').innerHTML,/還缺哪一張/);assert.doesNotMatch(element('projMessage').innerHTML,/class="listen-answer"/);assert.equal(element('mahjongQuizPrev').disabled,true);
});
test('phone listening commands preserve manual pacing and prevent overlapping requests',async()=>{
 const {run}=setup();run("globalThis.sent=[];globalThis.release=null;act=(type,fields)=>{sent.push({type,...fields});return new Promise(resolve=>release=resolve)};globalThis.pending=setMahjongQuiz(2)");await run("setMahjongQuiz(2,'answer')");assert.equal(run('sent.length'),1);assert.equal(run('sent[0].phase'),'question');run('release({ok:true})');await run('pending');run("act=async(type,fields)=>{sent.push({type,...fields});return {ok:true}}");await run("setMahjongQuiz(2,'answer')");assert.equal(run('sent[1].phase'),'answer');assert.equal(run('projection'),'');
});

test('mahjong answers render from confirmed action state without waiting for the full-state refresh',async()=>{
 const {run,ctx,element}=setup();vm.runInContext(readFileSync(new URL('../public/mahjong-quiz.js',import.meta.url),'utf8'),ctx);
 run("data.admin=true;data.mahjong={kind:'quiz',index:2,phase:'question'};globalThis.sent=[];act=async(type,fields,options)=>{sent.push({type,fields,options});return {ok:true,mahjong:{kind:'quiz',index:fields.index,phase:fields.phase},projection:{mode:'mahjong',session:''}}}");await run("setMahjongQuiz(2,'answer')");assert.equal(run('sent[0].options.skipRefresh'),true);assert.match(element('mahjongQuizPreview').innerHTML,/class="listen-answer"/);assert.equal(run('mahjongBusy'),false);
});
test('an older background state read cannot revert a newly confirmed mahjong answer',async()=>{
 const {run,ctx}=setup();ctx.fetch=()=>new Promise(resolve=>ctx.releaseRead=resolve);
 const old=run('JSON.parse(JSON.stringify(data))');run('refreshPromise=null;globalThis.readingState=refresh()');run("act=async()=>({ok:true,mahjong:{kind:'quiz',index:1,phase:'answer'},projection:{mode:'mahjong',session:''}})");await run("setMahjongQuiz(1,'answer')");ctx.releaseRead({ok:true,json:async()=>old});await run('readingState');assert.equal(run('data.mahjong.phase'),'answer');assert.equal(run('data.mahjong.index'),1);
});
