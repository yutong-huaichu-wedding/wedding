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
test('old bundled GIF and MP3 become one video, while custom media and answers remain',async()=>{
 const type=ext=>ext==='mp4'?'video/mp4':ext==='mp3'?'audio/mpeg':ext==='gif'?'image/gif':ext==='png'?'image/png':'image/jpeg';
 const load=async(id,ext)=>new Blob([await readFile(new URL('../public/cat-meme-assets/'+id+'.'+ext,import.meta.url))],{type:type(ext)});
 const incoming=await createCatMemeDeck(load);assert.equal(incoming.filter(q=>q.answerMedia?.type==='video/mp4').length,9);
 const old=await Promise.all(incoming.map(async q=>{
  if(q.id==='cat-pack-questioning')return {...q,answerMedia:null};
  const id=q.id.slice('cat-pack-'.length);
  return {...q,answer:'自訂答案',sound:await load(id,'mp3'),answerMedia:await load(id==='oiia'?'oiia':id+'-answer','gif')};
 }));
 const upgraded=await upgradeCatMemeSounds(old,incoming);
 assert.equal(upgraded.filter(q=>q.answerMedia?.type==='video/mp4').length,9);
 assert.ok(upgraded.every(q=>!q.sound));assert.equal(upgraded[0].answer,'自訂答案');
 const customSound={...old[0],sound:blob('personal recording','audio/mpeg')};
 const customVideo={...old[1],answerMedia:blob('personal movie','video/mp4')};
 const result=await upgradeCatMemeSounds([customSound,customVideo],incoming);
 assert.equal(result[0],customSound);assert.equal(result[1],customVideo);
});
const app=await readFile(new URL('../public/cat-memes.js',import.meta.url),'utf8');
function stage(){
 const player=()=>({src:'',plays:0,pauses:0,pause(){this.pauses++},removeAttribute(){this.src=''},load(){},async play(){this.plays++}});
 const picture={dataset:{},child:null,_html:'',set innerHTML(value){this._html=value;this.child=value.startsWith('<video')?{...player(),kind:'video'}:value.startsWith('<img')?{kind:'img',src:'',cloneNode(){return {...this}},replaceWith(next){picture.child=next}}:null},get innerHTML(){return this._html},querySelector(tag){return this.child?.kind===tag?this.child:null}};
 picture.contains=node=>picture.child===node;picture.append=node=>{picture.child=node};
 const nodes={picture,answerBox:{append(node){if(picture.child===node)picture.child=null}},soundPlayer:{...player(),kind:'video',id:'soundPlayer',setAttribute(){}}};const ctx=vm.createContext({document:{},nodes});
 vm.runInContext("const $=id=>nodes[id]??(nodes[id]={});let liveState,lastStageKey='',lastPlayed=-1;"+app.slice(app.indexOf('function stopSound()'),app.indexOf('function publish(')),ctx);
 return {ctx,nodes,picture};
}
test('reveal renders video in main picture, plays only its soundtrack, then hides and stops on reset',async()=>{
 const {ctx,nodes,picture}=stage();const state={key:'a',index:0,total:1,prompt:'問',image:'blob:photo',revealed:false};
 ctx.renderStage(state);assert.equal(picture.child.kind,'img');assert.equal(nodes.soundPlayer.plays,0);
 const answer={...state,revealed:true,answerMedia:'blob:movie',answerMediaType:'video/mp4',sound:'blob:other-audio'};
 ctx.renderStage(answer);const video=picture.child;assert.equal(video.controls,false);await ctx.playSound(answer);assert.equal(video.controls,false);assert.equal(video.plays,1);assert.equal(nodes.soundPlayer,video);assert.equal(video.src,'blob:movie');
 ctx.renderStage(state);assert.ok(video.pauses>0);assert.equal(picture.child.kind,'img');assert.equal(picture.child.src,'blob:photo');
});
test('legacy GIF and MP3 never play as separate streams',async()=>{
 const {ctx,nodes,picture}=stage();const answer={key:'a',index:0,total:1,prompt:'問',image:'blob:photo',revealed:true,answerMedia:'blob:gif',answerMediaType:'image/gif',sound:'blob:audio'};
 ctx.renderStage(answer);await ctx.playSound(answer);assert.equal(picture.child.src,'blob:gif');assert.equal(nodes.soundPlayer.plays,0);assert.equal(nodes.replay.disabled,true);
});


test('question GIF is kept as the original animated image, with no canvas freeze or answer leak',async()=>{
 const gif=new Blob(['GIF89a animated frames'],{type:'image/gif'});
 const q={...question(),image:gif};validateDeck([q]);
 const packed=await packDeck([q],async b=>Buffer.from(await b.arrayBuffer()).toString('base64'));
 const restored=unpackDeck(packed,(b,t)=>new Blob([Buffer.from(b,'base64')],{type:t}))[0];
 assert.equal(restored.image.type,'image/gif');assert.equal(await restored.image.text(),await gif.text());
 const {ctx,picture}=stage();ctx.renderStage({...projectionState(restored,0,1,false,()=> 'blob:animated-gif'),key:'animated'});
 assert.equal(picture.child.kind,'img');assert.equal(picture.child.src,'blob:animated-gif');assert.equal(picture.child.onload,undefined);assert.equal(picture.child.replaceWith===undefined,false);
 assert.ok(!app.includes('drawImage(element'));
});
