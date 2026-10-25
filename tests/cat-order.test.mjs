import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {moveCatQuestion,ready} from '../public/cat-meme-model.js';
function setup(){
 const els=new Map();const el=id=>{if(!els.has(id))els.set(id,{dataset:{},innerHTML:'',textContent:'',value:'draft',disabled:false,hidden:false,volume:.8,classList:{add(){}},addEventListener(){},pause(){},load(){},removeAttribute(){},contains(){return false},querySelector(){return null}});return els.get(id)};
 const ctx=vm.createContext({console,Blob,URL,URLSearchParams,crypto,location:{search:'?screen=1'},document:{addEventListener(){},getElementById:el,body:el('body')},window:{addEventListener(){}},createCloudProjection:()=>({enabled:false,start(){},close(){}}),setInterval(){},setTimeout(){},clearTimeout(){},moveCatQuestion,ready});
 vm.runInContext(readFileSync(new URL('../public/cat-memes.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('import.meta.url',JSON.stringify('https://wedding.test/cat-memes.js')),ctx);
 const run=s=>vm.runInContext(s,ctx);
 run(`deck=[{id:'a'},{id:'b'},{id:'c'}];index=1;revealed=true;dirty=true;renderDeck=()=>{};globalThis.published=[];publish=play=>published.push({play,id:current().id,index});globalThis.writes=[];globalThis.resolves=[];globalThis.rejects=[];storeDeck=(order,apply)=>{writes.push({ids:order.map(q=>q.id).join(),apply});return new Promise((resolve,reject)=>{resolves.push(resolve);rejects.push(reject)})}`);
 return {run,el};
}
test('sort helper handles boundaries and preserves original deck and media objects',()=>{
 const a={id:'a'},b={id:'b'},deck=[a,b];const moved=moveCatQuestion(deck,'b',-1);assert.deepEqual(moved,[b,a]);assert.deepEqual(deck,[a,b]);assert.equal(moved[0],b);assert.equal(moveCatQuestion(deck,'a',-1),deck);assert.equal(moveCatQuestion(deck,'b',1),deck);assert.equal(moveCatQuestion(deck,'missing',1),deck);assert.equal(moveCatQuestion(deck,'a',2),deck);
});
test('rapid moves update immediately, persist latest order, keep active cat and drafts',async()=>{
 const {run,el}=setup();run(`globalThis.first=moveMemeQuestion('c',-1)`);assert.equal(run('deck.map(q=>q.id).join()'),'a,c,b');assert.equal(run('current().id'),'b');assert.equal(run('revealed'),true);
 await run(`moveMemeQuestion('c',-1)`);assert.equal(run('deck.map(q=>q.id).join()'),'c,a,b');assert.equal(run('writes.length'),1);run('resolves[0]()');await new Promise(r=>setImmediate(r));assert.equal(run('writes[1].ids'),'c,a,b');assert.equal(run('writes[1].apply'),false);run('resolves[1]()');await run('first');assert.equal(run('current().id'),'b');assert.equal(run('dirty'),true);assert.equal(el('memeName').value,'draft');assert.equal(run('published.every(p=>p.play===false)'),true);assert.match(el('orderStatus').textContent,/已儲存/);
});
test('failed save restores last successful order and preserves current cat',async()=>{
 const {run,el}=setup();run(`globalThis.first=moveMemeQuestion('c',-1)`);await run(`moveMemeQuestion('a',1)`);run('resolves[0]()');await new Promise(r=>setImmediate(r));run(`rejects[1](new Error('storage full'))`);await run('first');assert.equal(run('deck.map(q=>q.id).join()'),'a,c,b');assert.equal(run('current().id'),'b');assert.equal(run('orderSaving'),false);assert.equal(run('dirty'),true);assert.match(el('orderStatus').textContent,/已還原/);
});
test('sort blocked during other writes; first and last row boundaries do not write',async()=>{
 const {run}=setup();await run(`moveMemeQuestion('a',-1)`);await run(`moveMemeQuestion('c',1)`);await run(`busy=true;moveMemeQuestion('b',1)`);assert.equal(run('writes.length'),0);assert.equal(run('deck.map(q=>q.id).join()'),'a,b,c');
});
