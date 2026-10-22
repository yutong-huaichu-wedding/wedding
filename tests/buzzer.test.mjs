import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/buzzer.js',import.meta.url),'utf8');
function setup(){
 let time=10000;const callbacks=[],requests=[],elements=new Map();
 const node=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,hidden:false,classList:{contains:()=>id==='buzzer'},setAttribute(){}});return elements.get(id)};
 const document={hidden:false,body:node('body'),getElementById:node,querySelectorAll:selector=>selector==='[data-buzzer-status]'?[node('status')]:selector==='[data-buzzer-message]'?[node('message')]:[],addEventListener(){}};
 const window={addEventListener(){}};
 const ctx=vm.createContext({document,window,Date:{now:()=>time},URLSearchParams,location:{search:''},setInterval:fn=>callbacks.push(fn),AbortSignal,fetch:(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}))});vm.runInContext(source,ctx);window.WeddingBuzzer.init({authHeaders:()=>({Authorization:'Bearer guest-token'}),requireGuest:()=>true});
 const answer=(request,value,ok=true)=>request.resolve({ok,json:async()=>value});const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 return {window,document,node,requests,answer,flush,tick:()=>callbacks[0](),setTime:n=>time=n};
}
test('phone buzzer uses server countdown, sends the current round once, and only confirms a server winner',async()=>{
 const s=setup();assert.equal(s.node('buzzerClaim').disabled,true);s.answer(s.requests[0],{serverNow:20000,buzzer:{round:'round1',status:'open',opensAt:25000,winner:null}});await s.flush();assert.equal(s.node('buzzerClaim').disabled,true);s.window.WeddingBuzzer.claim();assert.equal(s.requests.length,1);
 s.setTime(15001);s.tick();assert.equal(s.node('buzzerClaim').disabled,false);const pending=s.window.WeddingBuzzer.claim();s.window.WeddingBuzzer.claim();const posts=s.requests.filter(x=>x.url==='/api/action');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].options.body).round,'round1');assert.equal(posts[0].options.headers.Authorization,'Bearer guest-token');assert.doesNotMatch(s.node('buzzerClaim').textContent,/你搶到了/);
 s.answer(posts[0],{won:true,serverNow:25001,buzzer:{round:'round1',status:'closed',winner:{name:'王小明',at:25001}}});await pending;assert.equal(s.node('buzzerClaim').disabled,true);assert.match(s.node('buzzerClaim').textContent,/你搶到了/);assert.match(s.node('status').textContent,/王小明/);
});
test('stale polling cannot overwrite a confirmed winner and failures never claim success',async()=>{
 const s=setup();s.answer(s.requests[0],{serverNow:10000,buzzer:{round:'r',status:'open',opensAt:9000,winner:null}});await s.flush();const reading=s.window.WeddingBuzzer.refresh(),old=s.requests.at(-1);const sending=s.window.WeddingBuzzer.claim(),post=s.requests.at(-1);s.answer(post,{won:false,serverNow:10000,buzzer:{round:'r',status:'closed',winner:{name:'別人',at:9999}}});await sending;s.answer(old,{serverNow:10000,buzzer:{round:'r',status:'open',opensAt:9000,winner:null}});await reading;assert.match(s.node('status').textContent,/別人/);assert.equal(s.node('buzzerClaim').disabled,true);assert.doesNotMatch(s.node('buzzerClaim').textContent,/你搶到了/);
});
test('hidden guest pages do not keep polling the buzzer',async()=>{
 const s=setup();s.answer(s.requests[0],{serverNow:10000,buzzer:{round:'',status:'idle'}});await s.flush();s.document.hidden=true;s.setTime(20000);s.tick();assert.equal(s.requests.length,1);
});
