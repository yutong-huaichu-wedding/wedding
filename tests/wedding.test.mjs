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
beforeEach(async()=>{
 sqlite?.close();sqlite=new DatabaseSync(':memory:');deleted=[];
 for(const name of ['0000_cold_namorita.sql','0001_yielding_magus.sql','0002_media_in_d1.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 env.DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const st of statements)results.push(st.runSync());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};env.BUCKET={async delete(key){deleted.push(key)}};
 await api.run('INSERT INTO admin_sessions VALUES (?,?)',await api.hash('test-admin'),Date.now()+60000);
 for(const [i,id] of ['a','b','c'].entries())await api.run('INSERT INTO guests VALUES (?,?,?,?,?,?)',id,'賓客'+id,await api.hash(id),i,'preset','cat');
 for(let i=0;i<3;i++)await api.run('INSERT INTO questions VALUES (?,?,?,?,?)','q'+i,'題目'+i,JSON.stringify(['甲','乙','丙','丁']),0,i);
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
 await ok('photoDelete',{id:'p1'},'a');assert.deepEqual(deleted,['photo-previews/p1','photos/p1']);assert.equal((await state()).photos[0].id,'p2');assert.ok(await api.first('SELECT id FROM media WHERE id=?','p2'));assert.equal(await api.first('SELECT id FROM media WHERE id=?','p1'),null);
 await ok('photoDelete',{id:'p2'});assert.equal((await state()).photos.length,0);assert.deepEqual(deleted,['photo-previews/p1','photos/p1','photo-previews/p2','photos/p2']);
});

test('mahjong host manually controls shared phase; guests cannot change it and unrelated wedding state survives',async()=>{
 assert.equal((await state('a')).mahjong.phase,'guess');
 await ok('blessing',{text:'幸福快樂'},'a');await ok('ticket',{numbers:[1,2,3,4,5,6]},'a');
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
 const after=await state('a');assert.equal(after.mahjong.phase,'guess');assert.deepEqual(after.myTicket,before.myTicket);assert.deepEqual(after.blessings,before.blessings);assert.deepEqual(after.lottery,before.lottery);
});

test('shared projector follows phone Mahjong commands and only hosts can choose its mode',async()=>{
 let screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'waiting');assert.equal(screen.me,undefined);assert.equal(screen.guests,undefined);
 await ok('mahjongPhase',{phase:'correct'});screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'mahjong');assert.equal(screen.mahjong.phase,'correct');
 assert.equal((await act('projectionMode',{mode:'wall'},'a')).status,403);
 await ok('projectionMode',{mode:'wall'});screen=await (await api.readProjection()).json();assert.equal(screen.projection.mode,'wall');assert.equal(screen.mahjong.phase,'correct');
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

async function finishLotteryDraw(){const lottery=await api.setting('lottery',{});lottery.startedAt=Date.now()-60000;if(lottery.draws?.length)lottery.draws.at(-1).startedAt=lottery.startedAt;await api.setSetting('lottery',lottery)}
async function threeTickets(){for(const [i,token]of ['a','b','c'].entries())await ok('ticket',{realName:'賓客'+token,numbers:Array.from({length:6},(_,n)=>n+1+i*6)},token);await ok('lottoState',{status:'closed'})}
test('one round supports multiple named prizes without changing tickets or repeating winners',async()=>{
 await threeTickets();const original=await api.all('SELECT * FROM tickets ORDER BY id');
 await ok('draw',{prizeName:'二獎'});let s=await state('admin');assert.equal(s.lottery.draws.length,1);assert.equal(s.lottery.prizeName,'二獎');assert.equal(s.lottery.durationMs,15600);assert.equal(s.lottery.remainingCount,2);
 assert.equal((await act('draw',{prizeName:'頭獎'})).status,400);assert.equal((await act('lottoReset')).status,400);
 await finishLotteryDraw();await ok('draw',{prizeName:'頭獎'});await finishLotteryDraw();await ok('draw',{prizeName:'加碼獎'});await finishLotteryDraw();
 s=await state('admin');assert.equal(s.lottery.draws.length,3);assert.equal(new Set(s.lottery.draws.flatMap(d=>d.winners)).size,3);assert.equal(s.lottery.remainingCount,0);
 assert.deepEqual(await api.all('SELECT * FROM tickets ORDER BY id'),original);
 assert.equal((await act('draw')).status,400);assert.equal((await state('a')).lottery.draws[0].winnerIds,undefined);
 const projected=await (await api.readProjection()).json();assert.equal(projected.lottery.draws.length,3);assert.equal(projected.lottery.draws[0].winnerIds,undefined);
 await ok('lottoReset');assert.equal((await state()).lottery.draws.length,0);assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),0);
});
test('a legacy completed result is preserved and all guests matching it are excluded from later prizes',async()=>{
 const numbers=[1,2,3,4,5,6];for(const token of ['a','b'])await ok('ticket',{realName:'賓客'+token,numbers},token);
 await ok('ticket',{realName:'賓客c',numbers:[7,8,9,10,11,12]},'c');
 await api.setSetting('lottery',{status:'drawn',result:numbers,startedAt:Date.now()-60000});await ok('draw',{prizeName:'加碼獎'});
 const s=await state('admin');assert.equal(s.lottery.draws.length,2);assert.equal(s.lottery.draws[0].winners.length,2);assert.deepEqual(s.lottery.draws[1].winners,['賓客c']);assert.equal(s.lottery.remainingCount,0);
});
test('simultaneous host draw commands only publish one prize',async()=>{
 await threeTickets();const results=await Promise.all([act('draw'),act('draw')]);assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.some(r=>r.status===409||r.status===400));
 assert.equal((await state('admin')).lottery.draws.length,1);assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),3);
});
test('failed draw publication releases its lock and keeps every ticket',async()=>{
 await threeTickets();const originalBatch=env.DB.batch;env.DB.batch=async()=>{throw Error('test write failure')};
 await assert.rejects(()=>act('draw'));env.DB.batch=originalBatch;assert.equal((await api.setting('lottery',{})).status,'closed');
 assert.equal(Number((await api.first('SELECT COUNT(*) AS n FROM tickets')).n),3);await ok('draw');assert.equal((await state('admin')).lottery.draws.length,1);
});

test('host listening quiz synchronizes question, answer and original touch game without changing other activities',async()=>{
 const before=await state('a');
 for(const index of [0,1,2,3,4])for(const phase of ['question','answer']){
  assert.equal((await act('mahjongQuiz',{index,phase},'a')).status,403);
  await ok('mahjongQuiz',{index,phase});const phone=await state('admin'),screen=await (await api.readProjection()).json();
  assert.deepEqual(phone.mahjong,{kind:'quiz',index,phase});assert.deepEqual(screen.mahjong,phone.mahjong);assert.equal(screen.projection.mode,'mahjong');
 }
 for(const fields of [{index:-1,phase:'question'},{index:5,phase:'answer'},{index:'1',phase:'question'},{index:1.5,phase:'answer'},{index:0,phase:'bad'}])assert.equal((await act('mahjongQuiz',fields)).status,400);
 assert.equal((await act('mahjongQuiz',{index:0,phase:'question'},'')).status,403);
 await ok('mahjongPhase',{phase:'guess'});assert.deepEqual((await state()).mahjong,{phase:'guess'});
 const after=await state();for(const key of ['lottery','blessings','photos'])assert.deepEqual(after[key],before[key]);
});

test('mahjong answer command returns saved display state for immediate phone rendering',async()=>{
 const result=await ok('mahjongQuiz',{index:3,phase:'answer'});assert.deepEqual(result.mahjong,{kind:'quiz',index:3,phase:'answer'});assert.deepEqual(result.projection,{mode:'mahjong',session:''});
 const touch=await ok('mahjongPhase',{phase:'correct'});assert.deepEqual(touch.mahjong,{phase:'correct'});
});

test('host activity routing persists for newly arriving guests and rejects guest changes',async()=>{
 assert.equal((await (await api.readActivity()).json()).activity.mode,'reception');
 for(const mode of ['reception','cat','mahjong','lotto']){
  assert.equal((await act('eventActivity',{mode},'a')).status,403);
  const changed=await ok('eventActivity',{mode}),read=await (await api.readActivity()).json();assert.equal(read.activity.mode,mode);assert.equal(read.activity.serial,changed.activity.serial);
  if(mode!=='cat')assert.equal((await (await api.readProjection()).json()).projection.mode,{reception:'waiting',mahjong:'mahjong',lotto:'lotto'}[mode]);
 }
 assert.equal((await act('eventActivity',{mode:'quiz'})).status,400);
 assert.equal((await act('eventActivity',{mode:'invalid'})).status,400);
});
test('retired quiz, Kahoot and buzzer actions cannot change stored wedding data',async()=>{
 const beforeQuestions=await api.all('SELECT id FROM questions');
 const beforeAnswers=await api.all('SELECT id FROM answers');
 for(const type of ['answer','liveQuizNext','quizReset','questionDelete','kahootUpdate','buzzerOpen','gameJoin']){
  assert.equal((await act(type,{id:'q0',mode:'quiz'},'admin')).status,410);
 }
 assert.equal((await act('projectionMode',{mode:'quiz'})).status,400);
 assert.equal((await act('projectionMode',{mode:'kahoot'})).status,400);
 assert.deepEqual(await api.all('SELECT id FROM questions'),beforeQuestions);
 assert.deepEqual(await api.all('SELECT id FROM answers'),beforeAnswers);
});
test('independent activity and state reads overlap without changing their public responses',async()=>{
 const original=env.DB;let active=0,peak=0;
 const tracked=async task=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,2));return await task()}finally{active--}};
 env.DB={...original,prepare(sql){const statement=original.prepare(sql);return {
  bind(...args){statement.bind(...args);return this},
  first(){return tracked(()=>statement.first())},
  all(){return tracked(()=>statement.all())}
 }}};
 try{
  const activity=await (await api.readActivity()).json();assert.equal(activity.activity.mode,'reception');assert.equal(activity.players,undefined);assert.equal(peak,1);
  peak=0;const snapshot=await state('a');assert.equal(snapshot.me.name,'賓客a');assert.equal(snapshot.quiz,undefined);assert.ok(Array.isArray(snapshot.photos));assert.ok(peak>=7,`state peak ${peak}`);
 }finally{env.DB=original}
});
