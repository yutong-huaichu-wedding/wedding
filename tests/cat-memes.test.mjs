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

import {createCatMemeDeck,mergeCatMemeDeck,catMemeQuestions} from '../public/cat-meme-questions.js';
import {readFile} from 'node:fs/promises';
const type=ext=>ext==='mp4'?'video/mp4':ext==='mp3'?'audio/mpeg':ext==='png'?'image/png':ext==='gif'?'image/gif':'image/jpeg';
async function loadAsset(id,ext){return new Blob([await readFile(new URL('../public/cat-meme-assets/'+id+'.'+ext,import.meta.url))],{type:type(ext)})}
test('built-in pack has exactly 13 distinct questions with every picture and accurate media availability',async()=>{
 const deck=await createCatMemeDeck(loadAsset);assert.equal(deck.length,13);assert.equal(new Set(deck.map(q=>q.id)).size,13);assert.equal(validateDeck(deck).length,13);assert.ok(deck.every(q=>q.image&&q.prompt&&q.answer&&q.note));assert.equal(deck.filter(ready).length,12);assert.ok(deck.every(q=>!q.sound));assert.equal(deck.find(q=>q.id==='cat-pack-questioning').answerMedia,null);assert.equal(catMemeQuestions[0].name,'Huh 貓');
});
test('adding built-in pack keeps edited answers and existing media, and never duplicates it',async()=>{
 const incoming=await createCatMemeDeck(loadAsset);const custom={...incoming[0],answer:'我的自訂解答',image:new Blob(['mine'],{type:'image/png'}),answerMedia:null};
 const once=mergeCatMemeDeck([custom],incoming),twice=mergeCatMemeDeck(once,incoming);assert.equal(twice.length,13);assert.equal(twice[0].answer,'我的自訂解答');assert.equal(await twice[0].image.text(),'mine');assert.equal(twice[0].answerMedia.type,'video/mp4');
});
test('backup includes question wording and all 13 questions including pending sound status',async()=>{
 const deck=await createCatMemeDeck(loadAsset),packed=await packDeck(deck,async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(packed,(value,type)=>new Blob([Buffer.from(value,'base64')],{type}));assert.equal(restored.length,13);assert.equal(restored[0].prompt,deck[0].prompt);assert.equal(restored.filter(ready).length,12);
});

test('new German, questioning and aggrieved cats are appended after original ten',()=>{
 assert.deepEqual(catMemeQuestions.slice(-3).map(q=>q.id),['german','questioning','aggrieved']);
 assert.match(catMemeQuestions.find(q=>q.id==='german').note,/不必說出真正德文/);
 assert.match(catMemeQuestions.find(q=>q.id==='questioning').prompt,/碎念/);
 assert.match(catMemeQuestions.find(q=>q.id==='aggrieved').prompt,/小聲回應/);
});

test('a custom question order survives export, import and adding missing starter questions',async()=>{
 const {moveCatQuestion}=await import('../public/cat-meme-model.js');
 const original=await createCatMemeDeck(loadAsset),moved=moveCatQuestion(original,original[12].id,-1);
 const packed=await packDeck(moved,async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(packed,(value,type)=>new Blob([Buffer.from(value,'base64')],{type}));
 assert.deepEqual(restored.map(q=>q.id),moved.map(q=>q.id));
 assert.deepEqual(mergeCatMemeDeck(restored,original).map(q=>q.id),moved.map(q=>q.id));
});
