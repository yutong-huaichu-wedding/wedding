// Use the actual shipped HTML IDs: missing elements return null, unlike generic DOM doubles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/wedding_1212.html',import.meta.url),'utf8');
const catHtml=readFileSync(new URL('../public/cat-memes.html',import.meta.url),'utf8');
function page(markup=html,options={}){
 const nodes=new Map(),timers=new Map();let timerId=0;
 function node(){const classes=new Set();let value='',writes=0;return {dataset:{},style:{},contentWindow:{messages:[],postMessage(value){this.messages.push(value)}},children:[],value:'',disabled:false,textContent:'',get innerHTML(){return value},set innerHTML(v){value=v;writes++;this.children=[]},get writes(){return writes},classList:{add(v){classes.add(v)},remove(v){classes.delete(v)},toggle(v,on){if(on===undefined)on=!classes.has(v);if(on)classes.add(v);else classes.delete(v)},contains(v){return classes.has(v)}},addEventListener(){},setAttribute(){},append(child){this.children.push(child)},prepend(child){this.children.unshift(child)},querySelectorAll(selector){return selector==='.actions button'?buttons:[]}}}
 for(const [,id] of markup.matchAll(/\bid="([^"]+)"/g))nodes.set(id,node());
 const buttons=[node(),node(),node()],avatarGrid=node(),body=node();
 const panels=[...markup.matchAll(/<section id="([^"]+)" class="panel/g)].map(([,id])=>Object.assign(nodes.get(id),{id}));
 const tabs=[...markup.matchAll(/<button[^>]+data-tab="([^"]+)"/g)].map(([,tab])=>Object.assign(node(),{dataset:{tab}}));
 const document={body,hidden:false,addEventListener(){},getElementById:id=>nodes.get(id)||null,createElement:()=>node(),querySelector(selector){if(selector==='.avatar-choice-grid')return avatarGrid;if(selector==='[data-tab="checkin"]')return tabs.find(t=>t.dataset.tab==='checkin');throw Error('Unsupported selector '+selector)},querySelectorAll(selector){if(selector==='.panel')return panels;if(selector==='#tabs button')return tabs;return []}};
 const context=vm.createContext({document,window:{addEventListener(){},scrollTo(){}},console,URL,URLSearchParams,Blob,location:{search:options.search||'',origin:'https://wedding.test',href:'https://wedding.test/wedding_1212'},localStorage:{getItem(){return null}},fetch:()=>new Promise(()=>{}),setInterval(){},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout(id){timers.delete(id)}});
 vm.runInContext(source.replace(/startPage\(\);\s*$/,''),context);
 return {nodes,body,timers,run:code=>vm.runInContext(code,context)};
}
test('actual HTML opens host login and authenticated dashboard without missing element errors',async()=>{
 const app=page();app.run("go('admin')");assert.equal(app.nodes.get('admin').classList.contains('active'),true);assert.equal(app.body.classList.contains('host-mode'),true);
 app.nodes.get('adminPassword').value='local-test';app.run("fetch=async url=>({ok:true,json:async()=>url==='/api/action'?{ok:true}:{...data,admin:true}})");await app.run('loginAdmin()');assert.equal(app.nodes.get('adminPassword').value,'');assert.equal(app.nodes.get('adminLogin').classList.contains('hidden'),true);assert.equal(app.nodes.get('adminDashboard').classList.contains('hidden'),false);
 app.run("go('home')");assert.equal(app.body.classList.contains('host-mode'),false);
});
test('all manual page navigation pauses activity following while host-driven navigation does not',()=>{
 const app=page();app.run("globalThis.pauses=0;window.WeddingEvent={pause(){pauses++},render(){}};data.me={name:'賓客',avatarKind:'preset',avatarValue:'cat'};go('wall');go('games')");
 assert.equal(app.run('pauses'),2);assert.equal(app.nodes.get('games').classList.contains('active'),true);
 app.run("go('gameEntry',{activity:true})");assert.equal(app.run('pauses'),2);assert.equal(app.nodes.get('gameEntry').classList.contains('active'),true);
});
test('partial old HTML cannot make the host login or dashboard crash',()=>{
 const legacy=html.replace('id="mahjongHostStatus"','data-legacy="removed"');
 const app=page(legacy);app.run("go('admin');data.admin=true;render()");assert.equal(app.nodes.get('adminDashboard').classList.contains('hidden'),false);
});
test('unchanged admin refresh preserves gallery markup and number buttons; changed data updates normally',()=>{
 const app=page();app.run("data.admin=true;data.photos=[{id:'p1',name:'照片',url:'/api/photo/p1'}];render()");
 const photoWrites=app.nodes.get('photoGrid').writes,manageWrites=app.nodes.get('managePhotos').writes,numberWrites=app.nodes.get('numberGrid').writes;
 app.run("data.mahjong={phase:'correct'};render()");assert.equal(app.nodes.get('photoGrid').writes,photoWrites);assert.equal(app.nodes.get('managePhotos').writes,manageWrites);assert.equal(app.nodes.get('numberGrid').writes,numberWrites);
 app.run("data.photos.push({id:'p2',name:'新照片',url:'/api/photo/p2'});render()");assert.equal(app.nodes.get('photoGrid').writes,photoWrites+1);assert.match(app.nodes.get('photoGrid').innerHTML,/p2/);
});

test('login waits for an in-flight anonymous poll and then fetches fresh authenticated state',async()=>{
 const app=page();app.nodes.get('adminPassword').value='local-test';
 app.run("globalThis.reads=0;globalThis.finishOld=null;globalThis.stale={...data,admin:false};fetch=url=>url==='/api/action'?Promise.resolve({ok:true,json:async()=>({ok:true})}):reads++===0?new Promise(resolve=>finishOld=resolve):Promise.resolve({ok:true,json:async()=>({...data,admin:true})});globalThis.oldPoll=refresh();globalThis.signingIn=loginAdmin()");
 await new Promise(resolve=>setImmediate(resolve));app.run('finishOld({ok:true,json:async()=>stale})');await app.run('signingIn');
 assert.equal(app.run('data.admin'),true);assert.equal(app.run('reads'),2);assert.equal(app.nodes.get('adminDashboard').classList.contains('hidden'),false);
});

test('opening host mode replaces the pending 60-second guest poll with an immediate refresh and 1-second schedule',async()=>{
 const app=page();app.run("globalThis.reads=0;fetch=async()=>{reads++;return {ok:true,json:async()=>({...data})}};pollStarted=true;globalThis.first=poll()");await app.run('first');
 assert.ok([...app.timers.values()].some(t=>t.delay===60000));
 app.run("go('admin')");await app.run('refreshPromise');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.run('reads'),2);assert.ok(![...app.timers.values()].some(t=>t.delay===60000));assert.ok([...app.timers.values()].some(t=>t.delay===1000));
});
test('one display follows remote Mahjong and cat modes, retains the cat iframe and silences it when hidden',()=>{
 const app=page(html,{search:'?display=1'});app.run("data.projection={mode:'mahjong'};data.mahjong={phase:'correct'};render()");assert.match(app.nodes.get('projMessage').innerHTML,/答對了/);
 app.run("data.projection={mode:'cat'};render()");const frame=app.run('catProjectionFrame');assert.match(frame.src,/follow=1/);assert.equal(frame.style.display,'block');assert.equal(frame.contentWindow.messages.at(-1).active,true);
 app.run("data.projection={mode:'mahjong'};data.mahjong={phase:'wrong'};render()");assert.equal(frame.style.display,'none');assert.equal(frame.contentWindow.messages.at(-1).active,false);assert.match(app.nodes.get('projMessage').innerHTML,/答錯了/);
 app.run("data.projection={mode:'waiting'};render();data.projection={mode:'mahjong'};render()");assert.match(app.nodes.get('projMessage').innerHTML,/答錯了/);
 app.run("data.projection={mode:'cat'};render()");assert.equal(app.run('catProjectionFrame'),frame);
});

test('game QR projection shows the dedicated entry image and can switch back to Mahjong',()=>{
 const app=page(html,{search:'?display=1'});app.run("data.projection={mode:'join'};render()");assert.match(app.nodes.get('projMessage').innerHTML,/game-qr.png/);assert.match(app.nodes.get('projMessage').innerHTML,/一起參與婚禮活動/);app.run("data.projection={mode:'mahjong'};data.mahjong={phase:'guess'};render()");assert.match(app.nodes.get('projMessage').innerHTML,/猜猜是什麼牌/);app.run("data.projection={mode:'join'};render()");assert.match(app.nodes.get('projMessage').innerHTML,/game-qr.png/);
});
test('wedding page offers lotto, cat and mahjong without retired quiz controls',()=>{
 assert.match(html,/id="lottoPane"/);
 assert.match(html,/小貓迷因問答/);
 assert.match(html,/麻將聽牌問答/);
 for(const retired of ['id="liveQuiz"','id="ad-liveQuiz"','id="kahootPane"','id="buzzer"','/buzzer.js','快問快答'])assert.equal(html.includes(retired),false,retired);
});
test('cat meme page still works without the retired phone buzzer',()=>{
 assert.match(catHtml,/id="stageQuestion"/);
 assert.match(catHtml,/id="reveal"/);
 assert.match(catHtml,/event-flow\.js\?v=20261025-games-only1/);
 for(const retired of ['data-buzzer-host','/buzzer.js','/buzzer.css','手機搶答','快問快答'])assert.equal(catHtml.includes(retired),false,retired);
});
