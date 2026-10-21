// Actual API and SQL, isolated in-memory database. Never contacts Cloudflare.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../lib/wedding.ts',import.meta.url),'utf8').replace("import { env } from 'cloudflare:workers';",'const env=globalThis.__weddingTestEnv;');
const env={};globalThis.__weddingTestEnv=env;
const api=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
let sqlite,deleted;
function prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},runSync(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async run(){return this.runSync()}}}
function request(token=''){return new Request('https://wedding.test/api/state',{headers:token==='admin'?{cookie:'wedding_admin=test-admin'}:token?{authorization:'Bearer '+token}:{}})}
async function act(type,fields={},token='admin'){const response=await api.action(new Request('https://wedding.test/api/action',{method:'POST',headers:{...Object.fromEntries(request(token).headers),'content-type':'application/json'},body:JSON.stringify({type,...fields})}));return {status:response.status,body:await response.json()}}
async function ok(type,fields={},token='admin'){if(type==='ticket'||type==='proxyTicket')fields={realName:'賓客'+(fields.guestId||token),...fields};const r=await act(type,fields,token);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
async function state(token='a'){return (await api.state(request(token))).json()}
async function answer(token='a',choice=0,extra={}){const s=await state(token);return act('answer',{choice,questionId:s.quiz.question.id,round:s.quiz.round,...extra},token)}
beforeEach(async()=>{
 sqlite?.close();sqlite=new DatabaseSync(':memory:');deleted=[];
 for(const name of ['0000_cold_namorita.sql','0001_yielding_magus.sql','0002_media_in_d1.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 env.DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const st of statements)results.push(st.runSync());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};env.BUCKET={async delete(key){deleted.push(key)}};
 await api.run('INSERT INTO admin_sessions VALUES (?,?)',await api.hash('test-admin'),Date.now()+60000);
 for(const [i,id] of ['a','b','c'].entries())await api.run('INSERT INTO guests VALUES (?,?,?,?,?,?)',id,'賓客'+id,await api.hash(id),i,'preset','cat');
 for(let i=0;i<3;i++)await api.run('INSERT INTO questions VALUES (?,?,?,?,?)','q'+i,'題目'+i,JSON.stringify(['甲','乙','丙','丁']),0,i);
});
test('check-in alone never enrolls; join persists; roster and correct answer stay private',async()=>{
 assert.equal((await state()).quiz.participantCount,0);await ok('quizJoin',{},'a');await ok('quizJoin',{},'a');assert.equal((await state()).quiz.participantCount,1);await ok('quizNext');
 const s=await state();assert.equal(s.quiz.eligible,true);assert.equal(s.quiz.totalParticipants,1);assert.equal(s.quiz.question.correct,undefined);assert.equal(s.quiz.participants,undefined);assert.equal((await answer('b')).status,400);assert.equal((await state()).quiz.joined,true);
});
test('last answer auto closes and reveals to everyone; duplicate rejected',async()=>{
 await ok('quizJoin',{},'a');await ok('quizJoin',{},'b');await ok('quizNext');assert.equal((await answer()).status,200);
 let s=await state();assert.equal(s.quiz.open,true);assert.equal(s.quiz.answeredCount,1);assert.equal((await answer()).status,400);assert.equal((await answer('b',1)).status,200);
 s=await state('c');assert.equal(s.quiz.open,false);assert.equal(s.quiz.question.correct,0);assert.equal(s.quiz.answeredCount,2);assert.equal((await state()).quiz.myScore,10);
});
test('late join waits for next question; empty roster does not auto close',async()=>{
 await ok('quizNext');await ok('quizJoin',{},'a');let s=await state();assert.equal(s.quiz.open,true);assert.equal(s.quiz.totalParticipants,0);assert.equal(s.quiz.eligible,false);assert.equal((await answer()).status,400);
 await ok('quizClose');await ok('quizNext');assert.equal((await state()).quiz.totalParticipants,1);assert.equal((await state()).quiz.eligible,true);
});
test('unanswered exit reduces denominator and auto closes when everyone else answered',async()=>{
 await ok('quizJoin',{},'a');await ok('quizJoin',{},'b');await ok('quizNext');await answer();await ok('quizLeave',{},'b');const s=await state();assert.equal(s.quiz.totalParticipants,1);assert.equal(s.quiz.answeredCount,1);assert.equal(s.quiz.open,false);assert.equal((await state('b')).quiz.joined,false);
});
test('answered exit retains answer, score and denominator; leaves next roster',async()=>{
 await ok('quizJoin',{},'a');await ok('quizJoin',{},'b');await ok('quizNext');await answer();await ok('quizLeave',{},'a');let s=await state();assert.equal(s.quiz.totalParticipants,2);assert.equal(s.quiz.answeredCount,1);assert.equal(s.quiz.myAnswer,0);assert.equal(s.quiz.myScore,10);assert.equal(s.quiz.joined,false);
 await answer('b');await ok('quizNext');s=await state();assert.equal(s.quiz.totalParticipants,1);assert.equal(s.quiz.eligible,false);
});
test('unanswered leave and rejoin waits for next question',async()=>{
 await ok('quizJoin',{},'a');await ok('quizJoin',{},'b');await ok('quizNext');await ok('quizLeave',{},'a');await ok('quizJoin',{},'a');assert.equal((await state()).quiz.eligible,false);assert.equal((await answer()).status,400);assert.equal((await state()).quiz.totalParticipants,1);
});
test('everyone leaving unanswered leaves zero roster open for manual close',async()=>{
 await ok('quizJoin',{},'a');await ok('quizNext');await ok('quizLeave',{},'a');assert.equal((await state()).quiz.open,true);assert.equal((await state()).quiz.totalParticipants,0);await ok('quizClose');assert.equal((await state()).quiz.open,false);
});
test('manual close works; next while open and stale answers are rejected',async()=>{
 await ok('quizJoin',{},'a');await ok('quizNext');const old=await state();assert.equal((await act('quizNext')).status,400);await ok('quizClose');assert.equal((await answer()).status,400);await ok('quizNext');assert.equal((await answer('a',0,{questionId:old.quiz.question.id,round:old.quiz.round})).status,400);assert.equal((await state()).quiz.answeredCount,0);
});
test('reset creates new round token, retains enrollment and unrelated wedding data',async()=>{
 await ok('blessing',{text:'恭喜'},'a');await ok('ticket',{numbers:[1,2,3,4,5,6]},'a');await ok('quizJoin',{},'a');await ok('quizNext');const old=await state();await answer();await ok('quizReset');await ok('quizNext');assert.notEqual((await state()).quiz.round,old.quiz.round);assert.equal((await answer('a',0,{round:old.quiz.round})).status,400);
 const s=await state();assert.equal(s.blessings.length,1);assert.ok(s.myTicket);assert.equal(s.quiz.myScore,0);assert.equal(s.quiz.totalParticipants,1);
});
test('proxy ticket validates six distinct numbers, one ticket, open state and host access',async()=>{
 assert.equal((await act('proxyTicket',{guestId:'b',numbers:[1,2,3,4,5,6]},'a')).status,403);for(const numbers of [[1,1,2,3,4,5],[0,1,2,3,4,5],[1,2,3,4,5,50],[1,2,3]])assert.equal((await act('proxyTicket',{guestId:'b',numbers})).status,400);
 await ok('proxyTicket',{guestId:'b',numbers:[6,5,4,3,2,1]});assert.deepEqual((await state('b')).myTicket.numbers,[1,2,3,4,5,6]);assert.equal((await act('proxyTicket',{guestId:'b',numbers:[7,8,9,10,11,12]})).status,400);await ok('lottoState',{status:'closed'});assert.equal((await act('proxyTicket',{guestId:'c',numbers:[1,2,3,4,5,6]})).status,400);
});

test('ticket and optional blessing save together, appear on wall and ticket, and cannot duplicate on retry',async()=>{
 const numbers=[6,5,4,3,2,1];
 await ok('ticket',{numbers,blessing:'  祝幸福久久 ♡  '},'a');
 let s=await state('a');assert.equal(s.myTicket.blessing,'祝幸福久久 ♡');assert.equal(s.blessings.length,1);assert.equal(s.blessings[0].name,'賓客a');assert.equal(s.blessings[0].text,'祝幸福久久 ♡');
 assert.equal((await act('ticket',{numbers,blessing:'重複送出'},'a')).status,400);assert.equal((await state()).blessings.length,1);
 await ok('ticket',{numbers,blessing:'   '},'b');assert.equal((await state('b')).myTicket.blessing,null);assert.equal((await state()).blessings.length,1);
 const admin=await state('admin');assert.equal(admin.tickets.find(t=>t.guestId==='a').blessing,'祝幸福久久 ♡');
 await ok('lottoReset');assert.equal((await state()).myTicket,null);assert.equal((await state()).blessings.length,1);
});

test('closed rounds, invalid messages and anonymous submissions create neither ticket nor blessing',async()=>{
 const numbers=[1,2,3,4,5,6];
 for(const blessing of ['祝'.repeat(101),{text:'祝福'}])assert.equal((await act('ticket',{numbers,blessing},'a')).status,400);
 assert.equal((await act('ticket',{numbers,blessing:'匿名'},'')).status,401);
 await ok('lottoState',{status:'closed'});assert.equal((await act('ticket',{numbers,blessing:'已截止'},'a')).status,400);
 assert.equal((await state('admin')).tickets.length,0);assert.equal((await state()).blessings.length,0);
});

test('a blessing write failure rolls back the ticket transaction',async()=>{
 sqlite.exec("CREATE TRIGGER reject_blessing BEFORE INSERT ON blessings BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(()=>act('ticket',{numbers:[1,2,3,4,5,6],realName:'賓客a',blessing:'祝福'},'a'));
 assert.equal((await state()).myTicket,null);assert.equal((await state()).blessings.length,0);
});

test('lottery requires a real name, rejects duplicate guest or normalized real name, and profile edits cannot bypass it',async()=>{
 const numbers=[1,2,3,4,5,6];
 for(const realName of [undefined,'',' ',{name:'假格式'},'王','王'.repeat(26)])assert.equal((await act('ticket',{numbers,realName},'a')).status,400);
 await ok('ticket',{numbers,realName:'  Ａｌｉｃｅ　Ｃｈｅｎ  '},'a');assert.equal((await state('a')).myTicket.name,'Alice Chen');
 assert.equal((await act('ticket',{numbers,realName:'alicechen',blessing:'不應新增'},'b')).status,400);assert.equal((await state()).blessings.length,0);
 await ok('profileUpdate',{name:'新暱稱'},'a');assert.equal((await state('a')).myTicket.name,'Alice Chen');
 assert.equal((await act('ticket',{numbers,realName:'王小明'},'a')).status,400);
});

test('simultaneous same-name bets create only one ticket and one accompanying blessing',async()=>{
 const numbers=[1,2,3,4,5,6];
 const results=await Promise.all(['a','b'].map(token=>act('ticket',{numbers,realName:'王小明',blessing:'幸福久久'},token)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);const s=await state('admin');assert.equal(s.tickets.length,1);assert.equal(s.blessings.length,1);
});

test('only host can correct a legacy ticket name, preserving its numbers and duplicate protection',async()=>{
 const numbers=[1,2,3,4,5,6];await ok('ticket',{numbers,realName:'舊暱稱'},'a');await ok('ticket',{numbers,realName:'張小美'},'b');const id=(await state('a')).myTicket.id;
 assert.equal((await act('ticketName',{id,realName:'王小明'},'a')).status,403);
 await ok('ticketName',{id,realName:'王小明'});assert.equal((await state('a')).myTicket.name,'王小明');assert.deepEqual((await state('a')).myTicket.numbers,numbers);
 assert.equal((await act('ticketName',{id,realName:'張 小美'})).status,400);assert.equal((await state('admin')).tickets.length,2);
});
test('photo owner and host may delete; other guests cannot, including forged names or owner IDs',async()=>{
 for(const [id,owner] of [['p1','a'],['p2','b']]){await api.run('INSERT INTO photos VALUES (?,?,?,?,?)',id,owner,'同名賓客','image/jpeg',1);await api.run('INSERT INTO media VALUES (?,?,?)',id,new Uint8Array([1]),1)}
 const owner=await state('a');assert.equal(owner.photos.find(p=>p.id==='p1').canDelete,true);assert.equal(owner.photos.find(p=>p.id==='p2').canDelete,false);assert.equal('guestId' in owner.photos[0],false);
 assert.ok((await state('admin')).photos.every(p=>p.canDelete));assert.ok((await state('')).photos.every(p=>!p.canDelete));
 assert.equal((await act('photoDelete',{id:'p1',guestId:'a',name:'同名賓客'},'b')).status,403);assert.equal((await act('photoDelete',{id:'p1'},'')).status,403);assert.deepEqual(deleted,[]);
 await ok('photoDelete',{id:'p1'},'a');assert.deepEqual(deleted,['photos/p1']);assert.equal((await state()).photos[0].id,'p2');assert.ok(await api.first('SELECT id FROM media WHERE id=?','p2'));assert.equal(await api.first('SELECT id FROM media WHERE id=?','p1'),null);
 await ok('photoDelete',{id:'p2'});assert.equal((await state()).photos.length,0);assert.deepEqual(deleted,['photos/p1','photos/p2']);
});

test('anonymous guests cannot join, leave or answer',async()=>{for(const type of ['quizJoin','quizLeave','answer'])assert.equal((await act(type,{},'')).status,401)});

test('100 simultaneous answers close once with correct final count',async()=>{
 for(let i=0;i<100;i++){
  const id='crowd'+i;await api.run('INSERT INTO guests VALUES (?,?,?,?,?,?)',id,id,await api.hash(id),i,'preset','cat');await ok('quizJoin',{},id);
 }
 await ok('quizNext');const q=(await state('crowd0')).quiz;
 const results=await Promise.all(Array.from({length:100},(_,i)=>act('answer',{choice:i%4,questionId:q.question.id,round:q.round},'crowd'+i)));
 assert.ok(results.every(r=>r.status===200));const s=await state();assert.equal(s.quiz.open,false);assert.equal(s.quiz.answeredCount,100);assert.equal(s.quiz.totalParticipants,100);
});
test('simultaneous host next requests advance only once',async()=>{
 const results=await Promise.all([act('quizNext'),act('quizNext')]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal((await state()).quiz.index,0);
});

test('mahjong host manually controls shared phase; guests cannot change it and unrelated wedding state survives',async()=>{
 assert.equal((await state('a')).mahjong.phase,'guess');
 await ok('blessing',{text:'幸福快樂'},'a');await ok('ticket',{numbers:[1,2,3,4,5,6]},'a');await ok('quizJoin',{},'a');
 const before=await state('a');
 for(const phase of ['correct','wrong','guess']){
   assert.equal((await act('mahjongPhase',{phase},'a')).status,403);
   await ok('mahjongPhase',{phase});
   assert.equal((await state('a')).mahjong.phase,phase);
   assert.equal((await state('b')).mahjong.phase,phase);
   assert.equal((await state('admin')).mahjong.phase,phase);
 }
 assert.equal((await act('mahjongPhase',{phase:'random'})).status,400);
 assert.equal((await act('mahjongPhase',{phase:'correct'},'')).status,403);
 const after=await state('a');assert.equal(after.mahjong.phase,'guess');assert.deepEqual(after.myTicket,before.myTicket);assert.deepEqual(after.quiz,before.quiz);assert.deepEqual(after.blessings,before.blessings);assert.deepEqual(after.lottery,before.lottery);
});

test('Kahoot configuration is host-only and shared with all guests, with strict external URL validation',async()=>{
 assert.deepEqual((await state('a')).kahoot,{url:'https://kahoot.it/',pin:''});
 assert.equal((await act('kahootUpdate',{url:'https://kahoot.it/?pin=123456',pin:'123456'},'a')).status,403);
 await ok('kahootUpdate',{url:'https://kahoot.it/?pin=123456',pin:'123456'});
 for(const who of ['a','b','admin'])assert.deepEqual((await state(who)).kahoot,{url:'https://kahoot.it/?pin=123456',pin:'123456'});
 for(const url of ['javascript:alert(1)','http://kahoot.it/','https://kahoot.it.evil.test/','https://kahoot.it@evil.test/','https://evil.test/kahoot.it','https://user:secret@kahoot.it/','https://kahoot.it:444/'])assert.equal((await act('kahootUpdate',{url,pin:''})).status,400);
 assert.equal((await act('kahootUpdate',{url:'https://kahoot.it/',pin:'<script>'})).status,400);
 assert.equal((await state('a')).kahoot.pin,'123456');assert.equal((await state('a')).mahjong.phase,'guess');
});

test('shared projector follows phone Mahjong commands and only hosts can choose its mode',async()=>{
 let screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'waiting');assert.equal(screen.me,undefined);assert.equal(screen.guests,undefined);
 await ok('mahjongPhase',{phase:'correct'});screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'mahjong');assert.equal(screen.mahjong.phase,'correct');
 assert.equal((await act('projectionMode',{mode:'kahoot'},'a')).status,403);
 await ok('projectionMode',{mode:'kahoot'});screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'kahoot');assert.equal(screen.mahjong.phase,'correct');
 assert.equal((await act('projectionMode',{mode:'cat'})).status,400);assert.equal((await act('projectionMode',{mode:'evil'})).status,400);
});

test('offline proxy registers and bets atomically without guest phone or credential',async()=>{
 const fields={offline:true,realName:'王阿嬤',numbers:[49,8,3,22,7,11],blessing:'祝新人百年好合'};
 assert.equal((await act('proxyTicket',fields,'a')).status,403);
 assert.equal((await act('proxyTicket',fields,'')).status,403);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM guests')).n),3);
 const result=await act('proxyTicket',fields);assert.equal(result.status,200);assert.equal(result.body.token,undefined);
 const guest=await api.first('SELECT * FROM guests WHERE name=?','王阿嬤'),ticket=await api.first('SELECT * FROM tickets WHERE guest_id=?',guest.id);
 assert.deepEqual(JSON.parse(ticket.numbers),[3,7,8,11,22,49]);assert.equal(ticket.name,'王阿嬤');
 assert.equal((await api.first('SELECT text FROM blessings WHERE id=?',ticket.id)).text,fields.blessing);
 assert.equal((await act('proxyTicket',fields)).status,400);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM guests')).n),4);
 assert.equal((await act('ticket',{realName:'王 阿嬤',numbers:[1,2,3,4,5,6]},'b')).status,400);
});
test('offline proxy rejects closed and invalid entries without phantom registrations',async()=>{
 const base={offline:true,realName:'陳阿公',numbers:[1,2,3,4,5,6]};
 for(const fields of [{...base,numbers:[1,1,2,3,4,5]},{...base,realName:''},{...base,guestId:'a'},{...base,blessing:'祝'.repeat(101)}])assert.equal((await act('proxyTicket',fields)).status,400);
 await ok('lottoState',{status:'closed'});assert.equal((await act('proxyTicket',base)).status,400);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM guests')).n),3);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),0);
});
test('concurrent offline submissions with same real name yield one registration and one ticket',async()=>{
 const fields={offline:true,realName:'林阿姨',numbers:[1,2,3,4,5,6],blessing:'新婚快樂'};
 const results=await Promise.all([act('proxyTicket',fields),act('proxyTicket',fields)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM guests')).n),4);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),1);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM blessings')).n),1);
});
test('offline blessing failure rolls back both registration and ticket',async()=>{
 sqlite.exec("CREATE TRIGGER fail_offline_blessing BEFORE INSERT ON blessings BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(()=>act('proxyTicket',{offline:true,realName:'失敗賓客',numbers:[1,2,3,4,5,6],blessing:'祝福'}));
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM guests')).n),3);
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),0);
});
