import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDeck,validateMedia,ready,projectionState,packDeck,unpackDeck} from '../public/cat-meme-model.js';
const question=()=>({id:'huh',name:'Huh 貓',answer:'Huh？',note:'一起 Huh',image:new Blob(['image'],{type:'image/png'}),sound:null,answerMedia:new Blob(['movie'],{type:'video/mp4'})});
test('question projection contains no answer, private title, note or sound before reveal',()=>{
 const state=projectionState(question(),0,1,false,()=> 'blob:example');assert.equal(state.image,'blob:example');for(const key of ['answer','name','note','sound','soundType','answerMedia'])assert.equal(key in state,false);
 const revealed=projectionState(question(),0,1,true,()=> 'blob:example');assert.equal(revealed.answer,'Huh？');assert.equal(revealed.answerMedia,'blob:example');
});
test('question requires both picture and a single answer video to reveal',()=>{
 assert.equal(ready(question()),true);assert.equal(ready({...question(),image:null}),false);assert.equal(ready({...question(),answerMedia:null}),false);assert.equal(ready({...question(),answerMedia:new Blob(['gif'],{type:'image/gif'}),sound:new Blob(['mp3'],{type:'audio/mpeg'})}),false);assert.equal(ready(null),false);
});
test('backup round trip retains media bytes, answers and order',async()=>{
 const q=question(),packed=await packDeck([q],async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(JSON.parse(JSON.stringify(packed)),(data,type)=>new Blob([Buffer.from(data,'base64')],{type}));
 assert.equal(restored[0].answer,q.answer);assert.equal(await restored[0].image.text(),'image');assert.equal(await restored[0].answerMedia.text(),'movie');assert.equal(restored[0].answerMedia.type,'video/mp4');
});
test('invalid backup or duplicate IDs cannot replace valid deck',()=>{
 assert.throws(()=>unpackDeck({version:999,questions:[]},()=>null));assert.throws(()=>validateDeck([question(),question()]));assert.throws(()=>validateDeck([{...question(),answer:''}]));assert.throws(()=>validateMedia(new Blob(['<svg>'],{type:'image/svg+xml'}),'image'));assert.throws(()=>validateMedia(new Blob(['x'],{type:'text/html'}),'sound'));
});

import {createCatMemeDeck,mergeCatMemeDeck,catMemeQuestions,applyFinalCatMemeDeck} from '../public/cat-meme-questions.js';
import {readFile} from 'node:fs/promises';
const type=ext=>ext==='mp4'?'video/mp4':ext==='mp3'?'audio/mpeg':ext==='png'?'image/png':ext==='gif'?'image/gif':'image/jpeg';
async function loadAsset(id,ext){return new Blob([await readFile(new URL('../public/cat-meme-assets/'+id+'.'+ext,import.meta.url))],{type:type(ext)})}
test('built-in pack has the final nine questions with every picture and video',async()=>{
 const deck=await createCatMemeDeck(loadAsset);assert.equal(deck.length,9);assert.equal(new Set(deck.map(q=>q.id)).size,9);assert.equal(validateDeck(deck).length,9);assert.ok(deck.every(q=>q.image&&q.prompt&&q.answer&&q.note));assert.equal(deck.filter(ready).length,9);assert.ok(deck.every(q=>!q.sound));assert.deepEqual(deck.map(q=>q.id),['huh','happy','banana','oiia','pop','no-no','german','questioning','aggrieved'].map(id=>'cat-pack-'+id));assert.equal(catMemeQuestions[0].name,'Huh 貓');
});
test('adding built-in pack keeps edited answers and existing media, and never duplicates it',async()=>{
 const incoming=await createCatMemeDeck(loadAsset);const custom={...incoming[0],answer:'我的自訂解答',image:new Blob(['mine'],{type:'image/png'}),answerMedia:null};
 const once=mergeCatMemeDeck([custom],incoming),twice=mergeCatMemeDeck(once,incoming);assert.equal(twice.length,9);assert.equal(twice[0].answer,'我的自訂解答');assert.equal(await twice[0].image.text(),'mine');assert.equal(twice[0].answerMedia.type,'video/mp4');
});
test('backup includes question wording and all nine playable questions',async()=>{
 const deck=await createCatMemeDeck(loadAsset),packed=await packDeck(deck,async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(packed,(value,type)=>new Blob([Buffer.from(value,'base64')],{type}));assert.equal(restored.length,9);assert.equal(restored[0].prompt,deck[0].prompt);assert.equal(restored.filter(ready).length,9);
});

test('German, questioning and aggrieved cats are the final three',()=>{
 assert.deepEqual(catMemeQuestions.slice(-3).map(q=>q.id),['german','questioning','aggrieved']);
 assert.match(catMemeQuestions.find(q=>q.id==='german').note,/不必說出真正德文/);
 assert.match(catMemeQuestions.find(q=>q.id==='questioning').prompt,/碎念/);
 assert.match(catMemeQuestions.find(q=>q.id==='aggrieved').prompt,/小聲回應/);
});

test('a custom question order survives export, import and adding missing starter questions',async()=>{
 const {moveCatQuestion}=await import('../public/cat-meme-model.js');
 const original=await createCatMemeDeck(loadAsset),moved=moveCatQuestion(original,original[8].id,-1);
 const packed=await packDeck(moved,async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(packed,(value,type)=>new Blob([Buffer.from(value,'base64')],{type}));
 assert.deepEqual(restored.map(q=>q.id),moved.map(q=>q.id));
 assert.deepEqual(mergeCatMemeDeck(restored,original).map(q=>q.id),moved.map(q=>q.id));
});
test('site update keeps unprovided banana media and replaces only the requested files',async()=>{
 const incoming=await createCatMemeDeck(loadAsset),old=incoming.filter(q=>q.id!=='cat-pack-oiia').map(q=>({...q}));
 const banana=old.find(q=>q.id==='cat-pack-banana');banana.image=new Blob(['old photo'],{type:'image/jpeg'});banana.answerMedia=new Blob(['old video'],{type:'video/mp4'});
 const pop=old.find(q=>q.id==='cat-pack-pop');pop.image=new Blob(['kept photo'],{type:'image/jpeg'});pop.answerMedia=new Blob(['old video'],{type:'video/mp4'});
 old.splice(5,0,{...banana,id:'cat-pack-maxwell'});
 const updated=applyFinalCatMemeDeck(old,incoming);
 assert.deepEqual(updated.map(q=>q.id),incoming.map(q=>q.id));
 assert.equal(await updated[2].image.text(),'old photo');assert.equal(await updated[2].answerMedia.text(),'old video');
 assert.equal(await updated[4].image.text(),'kept photo');assert.notEqual(await updated[4].answerMedia.text(),'old video');
 assert.equal(updated.every(ready),true);
});
