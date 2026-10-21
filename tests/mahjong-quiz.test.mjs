import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/mahjong-quiz.js',import.meta.url),'utf8'),ctx);
const {questions,markup}=ctx.MahjongQuiz;
const tiles=[...'mps'].flatMap(s=>Array.from({length:9},(_,i)=>s+(i+1))).concat(Array.from({length:7},(_,i)=>'z'+(i+1)));
function sets(counts){
 const i=counts.findIndex(n=>n>0);if(i<0)return true;
 if(counts[i]>=3){counts[i]-=3;if(sets(counts)){counts[i]+=3;return true}counts[i]+=3}
 if(i<27&&i%9<7&&counts[i+1]&&counts[i+2]){for(const j of [i,i+1,i+2])counts[j]--;const done=sets(counts);for(const j of [i,i+1,i+2])counts[j]++;if(done)return true}
 return false;
}
function wins(hand){
 const c=tiles.map(t=>hand.filter(x=>x===t).length);
 for(let i=0;i<c.length;i++)if(c[i]>=2){c[i]-=2;const done=sets(c);c[i]+=2;if(done)return true}return false;
}
test('all five 16-tile questions have exactly the stated winning draws, independently enumerated',()=>{
 assert.equal(questions.length,5);
 for(const q of questions){
  const fixed=q.fixed.flat(),all=[...fixed,...q.hand];assert.equal(all.length,16,q.title);assert.ok(tiles.every(t=>all.filter(x=>x===t).length<=4));
  for(const group of q.fixed)assert.equal(sets(tiles.map(t=>group.filter(x=>x===t).length)),true);
  const waits=tiles.filter(t=>all.filter(x=>x===t).length<4&&wins([...q.hand,t]));
  assert.deepEqual([...q.answers].sort(),waits.sort(),q.title);
 }
});
test('question screens omit answer text and explanation; revealed screens include all winning tiles',()=>{
 questions.forEach((q,i)=>{
  const hidden=markup(i,false),shown=markup(i,true);assert.ok(!hidden.includes(q.explanation));assert.ok(!hidden.includes('class="listen-answer"'));assert.ok(shown.includes(q.explanation));assert.ok(shown.includes('class="listen-answer"'));assert.ok(hidden.includes('listen-fixed" open'));for(const t of q.answers)assert.ok(shown.includes('aria-label="'+ctx.MahjongQuiz.label(t)+'"'));
 });
});
