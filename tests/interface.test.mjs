// Render and interaction checks without a browser or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},setAttribute(){},disabled:false,style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},append(){},querySelectorAll(){return []}});return elements.get(id)};
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
 assert.doesNotMatch(run('photoCards(false)'),/刪除照片|removePhoto/);const html=run('photoCards(true)');assert.match(html,/刪除照片/);assert.match(html,/&lt;賓客&gt;/);assert.match(html,/removePhoto\('p1'\)/);assert.match(html,/target="_blank"/);
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


test('Kahoot replaces old quiz UI and shared configuration updates guest links, pin and projection',()=>{
 const {run,element}=setup();
 run("data.kahoot={url:'https://kahoot.it/?pin=123456',pin:'123456'};renderKahoot();openProjection('kahoot')");
 assert.equal(element('kahootJoin').href,'https://kahoot.it/?pin=123456');assert.match(element('kahootGuestPin').textContent,/123456/);assert.match(element('projMessage').innerHTML,/Kahoot!.*123456/s);
 run("data.admin=true;renderKahoot();kahootDirty=true");element('kahootUrl').value='https://kahoot.it/?pin=888888';run("data.kahoot={url:'https://kahoot.it/?pin=999999',pin:'999999'};renderKahoot()");
 assert.equal(element('kahootUrl').value,'https://kahoot.it/?pin=888888');assert.equal(element('kahootJoin').href,'https://kahoot.it/?pin=999999');
 run("data.kahoot={url:'javascript:alert(1)',pin:'<script>'};renderKahoot()");assert.equal(element('kahootJoin').href,'https://kahoot.it/');assert.doesNotMatch(element('kahootGuestPin').textContent,/<script>/);
 const html=readFileSync(new URL('../public/wedding_1212.html',import.meta.url),'utf8');
 for(const id of ['quizPane','quizTab','ad-questions','quizRanking','questionManager'])assert.ok(!html.includes('id="'+id+'"'));
 assert.ok(!html.includes('快問快答'));assert.ok(!html.includes('rehearsal.js'));assert.match(html,/id="kahootJoin"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
});
test('saving Kahoot sends configuration once, disables edits and retains failed drafts',async()=>{
 const {run,element}=setup();run("data.admin=true;renderKahoot();kahootDirty=true");element('kahootUrl').value='https://kahoot.it/?pin=333333';element('kahootPin').value='333333';
 run("globalThis.sent=[];globalThis.finish=null;act=(type,fields)=>{sent.push({type,...fields});return new Promise(resolve=>finish=resolve)};globalThis.saving=saveKahoot()");
 assert.equal(element('kahootUrl').disabled,true);await run('saveKahoot()');assert.equal(run('sent.length'),1);assert.equal(run('sent[0].type'),'kahootUpdate');
 run('finish(null)');await run('saving');assert.equal(element('kahootUrl').disabled,false);assert.equal(element('kahootPin').value,'333333');assert.equal(run('kahootDirty'),true);
});

test('lottery sends one ticket with blessing, keeps failed drafts, and clears only on success',async()=>{
 const {run,element}=setup();
 run("data.me={id:'a',name:'賓客',avatarKind:'preset',avatarValue:'cat'};picks=[1,2,3,4,5,6];globalThis.sent=[];globalThis.finish=null;act=(type,fields)=>{sent.push({type,...fields});return new Promise(resolve=>finish=resolve)}");
 element('ticketBlessing').value='  祝幸福久久  ';
 run('globalThis.sending=submitTicket()');assert.equal(element('ticketSubmit').disabled,true);assert.equal(element('ticketBlessing').disabled,true);
 await run('submitTicket()');assert.equal(run('sent.length'),1);assert.equal(run('sent[0].blessing'),'祝幸福久久');
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
