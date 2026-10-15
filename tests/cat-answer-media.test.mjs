import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {projectionState,ready,validateDeck,packDeck,unpackDeck} from '../public/cat-meme-model.js';
import {createCatMemeDeck,upgradeCatMemeSounds} from '../public/cat-meme-questions.js';
const blob=(text,type)=>new Blob([text],{type});
const question=()=>({id:'custom',name:'我的貓',prompt:'請模仿',answer:'喵',note:'',image:blob('photo','image/png'),sound:null,answerMedia:blob('movie','video/mp4')});
test('answer video alone can supply sound; answer media remains private until reveal',()=>{
 const q=question();assert.equal(ready(q),true);validateDeck([q]);
 const hidden=projectionState(q,0,1,false,()=> 'blob:test');assert.equal('answerMedia' in hidden,false);assert.equal('answerMediaType' in hidden,false);
 const answer=projectionState(q,0,1,true,()=> 'blob:test');assert.equal(answer.answerMediaType,'video/mp4');
 assert.equal(ready({...q,answerMedia:blob('gif','image/gif')}),false);
 assert.throws(()=>validateDeck([{...q,answerMedia:blob('html','text/html')}]));
});
test('video and GIF backup round trip; older backups remain readable',async()=>{
 for(const type of ['video/mp4','image/gif']){
  const q={...question(),sound:blob('audio','audio/mpeg'),answerMedia:blob('moving picture',type)};
  const backup=await packDeck([q],async b=>Buffer.from(await b.arrayBuffer()).toString('base64'));
  const decode=(b,t)=>blob(Buffer.from(b,'base64'),t);
  const copy=unpackDeck(backup,decode)[0];assert.equal(copy.answerMedia.type,type);assert.equal(await copy.answerMedia.text(),'moving picture');
  delete backup.questions[0].answerMedia;assert.equal(unpackDeck(backup,decode)[0].answerMedia,null);
 }
});
test('starter visuals fill old built-in questions without replacing custom recordings or custom videos',async()=>{
 const load=async(id,ext)=>blob(id,ext==='mp3'?'audio/mpeg':ext==='gif'?'image/gif':'image/png');
 const incoming=await createCatMemeDeck(load);assert.equal(incoming.filter(q=>q.answerMedia).length,12);
 const original=incoming[0],saved={...original,answer:'自訂答案',answerMedia:null};
 const upgraded=await upgradeCatMemeSounds([saved],incoming);assert.equal(upgraded[0].answerMedia,original.answerMedia);assert.equal(upgraded[0].answer,'自訂答案');
 const custom={...saved,sound:blob('personal recording','audio/mpeg')},deck=[custom];assert.equal(await upgradeCatMemeSounds(deck,incoming),deck);
 const video={...saved,answerMedia:blob('personal movie','video/mp4')};assert.equal((await upgradeCatMemeSounds([video],incoming))[0],video);
});
const app=await readFile(new URL('../public/cat-memes.js',import.meta.url),'utf8');
function stage(){
 const player=()=>({src:'',plays:0,pauses:0,pause(){this.pauses++},removeAttribute(){this.src=''},load(){},async play(){this.plays++}});
 const picture={dataset:{},child:null,_html:'',set innerHTML(value){this._html=value;this.child=value.startsWith('<video')?{...player(),kind:'video'}:value.startsWith('<img')?{kind:'img',src:'',cloneNode(){return {...this}},replaceWith(next){picture.child=next}}:null},get innerHTML(){return this._html},querySelector(tag){return this.child?.kind===tag?this.child:null}};
 const nodes={picture,soundPlayer:player()};const ctx=vm.createContext({document:{},nodes});
 vm.runInContext("const $=id=>nodes[id]??(nodes[id]={});let liveState,lastStageKey='',lastPlayed=-1;"+app.slice(app.indexOf('function stopSound()'),app.indexOf('function publish(')),ctx);
 return {ctx,nodes,picture};
}
test('reveal renders video in main picture, plays only its soundtrack, then hides and stops on reset',async()=>{
 const {ctx,nodes,picture}=stage();const state={key:'a',index:0,total:1,prompt:'問',image:'blob:photo',revealed:false};
 ctx.renderStage(state);assert.equal(picture.child.kind,'img');assert.equal(nodes.soundPlayer.plays,0);
 const answer={...state,revealed:true,answerMedia:'blob:movie',answerMediaType:'video/mp4',sound:'blob:other-audio'};
 ctx.renderStage(answer);const video=picture.child;await ctx.playSound(answer);assert.equal(video.plays,1);assert.equal(nodes.soundPlayer.plays,0);assert.equal(video.src,'blob:movie');
 ctx.renderStage(state);assert.ok(video.pauses>0);assert.equal(picture.child.kind,'img');assert.equal(picture.child.src,'blob:photo');
});
test('GIF reveal pairs existing audio; autoplay rejection leaves manual replay available',async()=>{
 const {ctx,nodes,picture}=stage();const answer={key:'a',index:0,total:1,prompt:'問',image:'blob:photo',revealed:true,answerMedia:'blob:gif',answerMediaType:'image/gif',sound:'blob:audio'};
 ctx.renderStage(answer);await ctx.playSound(answer);assert.equal(picture.child.src,'blob:gif');assert.equal(nodes.soundPlayer.src,'blob:audio');assert.equal(nodes.soundPlayer.plays,1);assert.equal(nodes.replay.disabled,false);
 nodes.soundPlayer.play=async()=>{throw Error('autoplay blocked')};await ctx.playSound(answer);assert.match(nodes.playbackStatus.textContent,/再播一次/);
});
