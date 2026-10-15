// Render and interaction checks without a browser or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},setAttribute(){},disabled:false,style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},append(){},querySelectorAll(){return []}});return elements.get(id)};
 const document={getElementById:element,querySelector:element,querySelectorAll(){return []},createElement:element,body:element('body'),hidden:false};
 const ctx=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem(){return null}},setTimeout(){},setInterval(){},clearTimeout(){},console,fetch:()=>new Promise(()=>{}),URL,Blob,confirm:()=>true});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(readFileSync(new URL('../public/rehearsal.js',import.meta.url),'utf8'),ctx);
 return {ctx,element,run:code=>vm.runInContext(code,ctx)};
}
test('quiz shows four symbols and colors, progress, disabled late join and published answer',()=>{
 const {run,element}=setup();run(`data.quiz={index:0,open:true,joined:true,eligible:false,totalParticipants:10,answeredCount:9,participantCount:11,myAnswer:null,myScore:0,question:{id:'q',text:'新人 <測試>',options:['甲','乙','丙','丁']}};renderQuiz()`);
 assert.match(element('quizStatus').textContent,/9／10 人已回答/);assert.match(element('quizParticipation').innerHTML,/從下一題開始/);
 const html=element('quizContent').innerHTML;for(let i=0;i<4;i++)assert.ok(html.includes('quiz-color-'+i));for(const symbol of ['▲','◆','●','■'])assert.ok(html.includes(symbol));assert.equal((html.match(/disabled/g)||[]).length,4);assert.ok(html.includes('&lt;測試&gt;'));
 run('data.quiz.open=false;data.quiz.question.correct=2;renderQuiz()');assert.match(element('quizContent').innerHTML,/quiz-color-2 correct/);assert.match(element('quizContent').innerHTML,/C．丙 ✓ 正確答案/);
});
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
test('private rehearsal closes after its single simulated participant answers',()=>{
 const {run}=setup();run(`data.questions=[{text:'試題',options:['甲','乙','丙','丁'],correct:0}];rehearsal={quizIndex:-1,quizOpen:false,choice:null,score:0};renderRehearsal=()=>{};rehearsalNextQuestion();rehearsalAnswer(0)`);
 assert.equal(run('rehearsal.quizOpen'),false);assert.equal(run('rehearsal.score'),10);assert.match(run('rehearsalQuizGuest()'),/1／1 人已回答/);
});
test('question order changes immediately and rapid moves save in sequence',async()=>{
 const {run,element}=setup();run(`data.questions=[{id:'a'},{id:'b'},{id:'c'}];renderQuestionEditor=()=>{};globalThis.requests=[];globalThis.resolvers=[];act=(type,fields,options)=>{requests.push({type,fields,options});return new Promise(resolve=>resolvers.push(resolve))};globalThis.first=reorderQuestions(['b','a','c'])`);
 assert.equal(run('data.questions.map(q=>q.id).join()'),'b,a,c');assert.match(element('questionOrderStatus').textContent,/正在儲存/);
 await run(`reorderQuestions(['b','c','a'])`);assert.equal(run('requests.length'),1);assert.equal(run('data.questions.map(q=>q.id).join()'),'b,c,a');run('resolvers[0]({ok:true})');await new Promise(resolve=>setImmediate(resolve));assert.equal(run('requests.length'),2);assert.equal(run('requests[1].fields.ids.join()'),'b,c,a');assert.equal(run('requests[1].options.skipRefresh'),true);run('resolvers[1]({ok:true})');await run('first');assert.match(element('questionOrderStatus').textContent,/已儲存/);
});
test('question save action can finish without waiting for full state refresh',async()=>{
 const {run}=setup();run(`globalThis.reads=0;refresh=async()=>{reads++};fetch=async()=>({ok:true,json:async()=>({ok:true})})`);
 await run(`act('questionEdit',{id:'a'},{skipRefresh:true})`);assert.equal(run('reads'),0);await run(`act('quizJoin')`);assert.equal(run('reads'),1);
});
test('a state request started before an edit cannot overwrite its updated questions',async()=>{
 const {run}=setup();run(`refreshing=false;globalThis.finishRead=null;render=()=>{};fetch=()=>new Promise(resolve=>finishRead=resolve);data.questions=[{id:'a',text:'舊內容'}];globalThis.pendingRead=refresh();questionRevision++;data.questions=[{id:'a',text:'新內容'}];finishRead({ok:true,json:async()=>({...data,questions:[{id:'a',text:'舊內容'}]})})`);
 await run('pendingRead');assert.equal(run('data.questions[0].text'),'新內容');
});
