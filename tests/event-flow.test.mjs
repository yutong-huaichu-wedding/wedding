import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/event-flow.js',import.meta.url),'utf8');
function setup({guest=true,host=false,search='',display=false}={}){
 const nodes=new Map(),requests=[],routes=[];let isGuest=guest,isHost=host;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},setAttribute(){},addEventListener(){}});return nodes.get(id)};
 const document={hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
 const window={addEventListener(){}};
 const ctx=vm.createContext({window,document,Date,URL,URLSearchParams,location:{search,href:'https://wedding.test/wedding_1212'},setInterval(){},AbortSignal,fetch:(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}))});
 vm.runInContext(source,ctx);
 window.WeddingEvent.init({display,isGuest:()=>isGuest,isHost:()=>isHost,navigate:route=>routes.push(route),lottery:()=>routes.push('lotto-pane'),notice(){}});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 async function read(activity){let request=requests.findLast(r=>r.url==='/api/activity'&&!r.done);if(!request){void window.WeddingEvent.refresh();request=requests.at(-1)}request.done=true;request.resolve({ok:true,json:async()=>({activity,serverNow:Date.now()})});await flush()}
 return {window,node,requests,routes,read,setGuest:value=>isGuest=value,setHost:value=>isHost=value};
}
test('guests follow only lotto, cat and mahjong activities',async()=>{
 const s=setup();await s.read({mode:'reception',serial:'a'});assert.deepEqual(s.routes,['home']);
 await s.read({mode:'cat',serial:'b'});assert.equal(s.routes.at(-1),'gameEntry');
 await s.read({mode:'mahjong',serial:'c'});assert.equal(s.routes.at(-1),'gameEntry');
 await s.read({mode:'lotto',serial:'d'});assert.deepEqual(s.routes.slice(-2),['games','lotto-pane']);
 const count=s.routes.length;s.setHost(true);await s.read({mode:'cat',serial:'e'});assert.equal(s.routes.length,count);
 s.setHost(false);s.setGuest(false);await s.read({mode:'mahjong',serial:'f'});assert.equal(s.routes.length,count);
});
test('manual navigation protects an unfinished draft until the next host activity',async()=>{
 const s=setup();s.node('ticketBlessing').value='尚未送出的祝福';s.window.WeddingEvent.pause();
 await s.read({mode:'lotto',serial:'slow-first'});assert.equal(s.routes.length,0);
 s.window.WeddingEvent.resume();assert.deepEqual(s.routes.slice(-2),['games','lotto-pane']);
 assert.equal(s.node('ticketBlessing').value,'尚未送出的祝福');
 s.window.WeddingEvent.pause();await s.read({mode:'mahjong',serial:'new'});assert.equal(s.routes.at(-1),'gameEntry');
});
test('game QR enters the retained activities without creating old quiz registrations',async()=>{
 const s=setup({guest:false,search:'?play=1'});await s.read({mode:'reception',serial:'a'});assert.equal(s.routes.length,0);
 s.setGuest(true);await s.read({mode:'reception',serial:'a'});assert.equal(s.routes.at(-1),'gameEntry');
 await s.read({mode:'cat',serial:'b'});assert.equal(s.routes.at(-1),'gameEntry');
 assert.equal(s.window.WeddingEvent.gameUrl(),'https://wedding.test/wedding_1212?play=1&openExternalBrowser=1');
 assert.equal(s.requests.filter(r=>r.url==='/api/action').length,0);
});
