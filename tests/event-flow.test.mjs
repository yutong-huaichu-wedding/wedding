import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/event-flow.js',import.meta.url),'utf8');
function setup({guest=true,host=false,search='',display=false,projectionMode=''}={}){
 const nodes=new Map(),requests=[],routes=[],storage=new Map();let isGuest=guest,isHost=host;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,value:'',disabled:false,dataset:{},addEventListener(){},setAttribute(){},reset(){},scrollIntoView(){}});return nodes.get(id)};
 const document={hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
 const window={addEventListener(){},WeddingBuzzer:{refresh(){routes.push('buzzer-refresh')}}};
 const ctx=vm.createContext({window,document,Date,URL,URLSearchParams,location:{search,href:'https://wedding.test/wedding_1212'},setInterval(){},AbortSignal,confirm:()=>true,localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,value)},fetch:(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}))});vm.runInContext(source,ctx);
 window.WeddingEvent.init({display,projectionMode:()=>projectionMode,isGuest:()=>isGuest,isHost:()=>isHost,guestId:()=> 'guest-a',authHeaders:()=>({Authorization:'Bearer token'}),navigate:route=>routes.push(route),lottery:()=>routes.push('lotto-pane'),notice(){},questions:()=>[]});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 async function read(activity,quiz=null,players={count:0,names:[]}){let request=requests.findLast(r=>r.url==='/api/activity'&&!r.done);if(!request){void window.WeddingEvent.refresh();request=requests.at(-1)}request.done=true;request.resolve({ok:true,json:async()=>({activity,quiz,players,serverNow:Date.now()})});await flush()}
 return {window,node,requests,routes,flush,read,setGuest:value=>isGuest=value,setHost:value=>isHost=value};
}
test('checked-in phones follow each new activity while host and unsigned guests retain their screens',async()=>{
 const s=setup();await s.read({mode:'reception',serial:'a'});assert.deepEqual(s.routes,['home']);await s.read({mode:'quiz',serial:'b'});assert.equal(s.routes.at(-1),'liveQuiz');await s.read({mode:'cat',serial:'c'});assert.deepEqual(s.routes.slice(-2),['buzzer','buzzer-refresh']);await s.read({mode:'lotto',serial:'d'});assert.deepEqual(s.routes.slice(-2),['games','lotto-pane']);
 const count=s.routes.length;s.setHost(true);await s.read({mode:'quiz',serial:'e'});assert.equal(s.routes.length,count);s.setHost(false);s.setGuest(false);await s.read({mode:'mahjong',serial:'f'});assert.equal(s.routes.length,count);s.setGuest(true);await s.read({mode:'mahjong',serial:'f'});assert.equal(s.routes.at(-2),'buzzer');
});
test('manual departure keeps the current screen until resume or the next host activity and does not touch draft fields',async()=>{
 const s=setup();s.node('ticketBlessing').value='未送出的祝福';await s.read({mode:'quiz',serial:'round1'});s.window.WeddingEvent.pause();const count=s.routes.length;await s.read({mode:'quiz',serial:'round1'});assert.equal(s.routes.length,count);assert.equal(s.node('resumeActivity').hidden,false);s.window.WeddingEvent.resume();assert.equal(s.routes.length,count+1);assert.equal(s.node('ticketBlessing').value,'未送出的祝福');s.window.WeddingEvent.pause();await s.read({mode:'mahjong',serial:'round2'});assert.equal(s.routes.at(-2),'buzzer');
});
test('native quiz sends one authenticated answer per round and does not show the answer until closed',async()=>{
 const s=setup();const quiz={index:0,total:5,round:'r',open:true,endsAt:Date.now()+20000,answered:0,question:{id:'q',text:'<script>新人問題</script>',options:['一','二','三','四']},leaders:[]};await s.read({mode:'quiz',serial:'a'},quiz);assert.match(s.node('liveQuizContent').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(s.node('liveQuizContent').innerHTML,/正確答案：/);
 const sending=s.window.WeddingEvent.choose(1);s.window.WeddingEvent.choose(2);const posts=s.requests.filter(r=>r.url==='/api/action'&&JSON.parse(r.options.body).type==='answer');assert.equal(posts.length,1);assert.equal(posts[0].options.headers.Authorization,'Bearer token');assert.equal(JSON.parse(posts[0].options.body).round,'r');posts[0].resolve({ok:true,json:async()=>({ok:true})});await sending;s.window.WeddingEvent.choose(2);assert.equal(s.requests.filter(r=>r.url==='/api/action'&&JSON.parse(r.options.body).type==='answer').length,1);
 await s.read({mode:'quiz',serial:'a'},{...quiz,open:false,question:{...quiz.question,correct:1},leaders:[{name:'甲',score:10}]});assert.match(s.node('liveQuizContent').innerHTML,/正確答案：B/);assert.match(s.node('liveQuizContent').innerHTML,/你答對了/);
});

test('a game QR waits for check-in, then enters the current game without another registration',async()=>{
 const s=setup({guest:false,search:'?play=1'});await s.read({mode:'reception',serial:'a'});assert.equal(s.routes.length,0);s.setGuest(true);await s.read({mode:'reception',serial:'a'});assert.equal(s.routes.at(-1),'gameEntry');await s.read({mode:'quiz',serial:'b'});assert.equal(s.routes.at(-1),'liveQuiz');assert.equal(s.window.WeddingEvent.gameUrl(),'https://wedding.test/wedding_1212?play=1&openExternalBrowser=1');
});
test('the original wedding page game button and QR use the same activity routing',async()=>{
 const s=setup();await s.read({mode:'reception',serial:'a'});s.window.WeddingEvent.enter();assert.equal(s.routes.at(-1),'gameEntry');await s.read({mode:'cat',serial:'b'});assert.equal(s.routes.at(-2),'buzzer');const s2=setup({guest:false});await s2.read({mode:'reception',serial:'a'});s2.window.WeddingEvent.enter();assert.equal(s2.routes.at(-1),'checkin');s2.setGuest(true);await s2.read({mode:'reception',serial:'a'});assert.equal(s2.routes.at(-1),'gameEntry');
});

test('only entering the game registers a guest once; ordinary reception browsing does not',async()=>{
 const s=setup();await s.read({mode:'reception',serial:'a'});assert.equal(s.requests.filter(r=>r.url==='/api/action').length,0);s.window.WeddingEvent.enter();s.window.WeddingEvent.enter();const joins=s.requests.filter(r=>r.url==='/api/action'&&JSON.parse(r.options.body).type==='gameJoin');assert.equal(joins.length,1);assert.equal(joins[0].options.headers.Authorization,'Bearer token');joins[0].resolve({ok:true});await s.flush();assert.match(s.node('gameJoinStatus').textContent,/已加入遊戲/);await s.read({mode:'quiz',serial:'b'});assert.equal(s.requests.filter(r=>r.url==='/api/action').length,1);
});
test('QR lobby and quiz waiting screens show joined names and participant count with escaped names',async()=>{
 const roster={count:3,names:['小明','<小美>','阿華']};const qr=setup({display:true,projectionMode:'join'});await qr.read({mode:'quiz',serial:'a'},null,roster);assert.match(qr.node('gameLobbyProjection').innerHTML,/已加入 <strong>3/);assert.match(qr.node('gameLobbyProjection').innerHTML,/&lt;小美&gt;/);assert.doesNotMatch(qr.node('gameLobbyProjection').innerHTML,/<小美>/);
 const waiting=setup({display:true,projectionMode:'quiz'});await waiting.read({mode:'quiz',serial:'a'},null,roster);assert.match(waiting.node('projMessage').innerHTML,/已加入 <strong>3/);assert.match(waiting.node('projMessage').innerHTML,/小明/);
});
