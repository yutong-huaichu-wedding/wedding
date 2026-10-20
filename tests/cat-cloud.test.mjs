import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudProjection} from '../public/cat-cloud.js';
const q=id=>({id,name:'cat',prompt:'問',answer:'喵',note:'',image:new Blob(['image-'+id],{type:'image/png'}),answerMedia:new Blob(['movie-'+id],{type:'video/mp4'})});
const work=(question,extra={})=>({q:question,index:0,total:1,revealed:false,serial:1,volume:.8,autoplay:false,...extra});
async function until(fn){for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('Timed out')}
function server(){
 let state=null,revision=0,playAt=0,uploads=0,fail=false;const writes=[];
 return {writes,get uploads(){return uploads},set fail(v){fail=v},async fetch(url,options={}){
   if(fail)throw Error('offline');
   if(options.method==='HEAD')return new Response(null,{status:404});
   if(url==='/api/state')return Response.json({admin:true});
   if(url==='/api/cat-media'){uploads++;return Response.json({url:'/api/cat-media/'+String(uploads).padStart(64,'0')})}
   if(options.method==='POST'){const body=JSON.parse(options.body);state=body.state;if(body.autoplay)playAt=Date.now();revision++;writes.push(body);return Response.json({ok:true})}
   return Response.json({state,revision:String(revision),playAt,screenAt:Date.now()});
 }};
}
test('independent host and screen sync photo, reveal, replay, hide and volume; no blob URLs or hidden answers leave host',async()=>{
 const api=server(),received=[];
 const host=createCloudProjection({session:'room',fetchImpl:api.fetch,pollMs:5});
 const screen=createCloudProjection({session:'room',screen:true,fetchImpl:api.fetch,pollMs:5,onState:(state,autoplay)=>{if(received.at(-1)?.state.serial!==state.serial||received.at(-1)?.state.revealed!==state.revealed||received.at(-1)?.state.volume!==state.volume)received.push({state,autoplay})}});
 try{
   await host.enable();screen.start();const cat=q('a');host.publish(work(cat));await until(()=>received.length===1);
   assert.equal('answer' in received[0].state,false);assert.match(received[0].state.image,/^\/api\/cat-media\//);assert.equal(JSON.stringify(api.writes).includes('blob:'),false);
   host.publish(work(cat,{revealed:true,autoplay:true,serial:2}));await until(()=>received.length===2);assert.equal(received[1].autoplay,true);assert.equal(received[1].state.answer,'喵');
   host.publish(work(cat,{revealed:true,autoplay:true,serial:3}));await until(()=>received.length===3);assert.equal(received[2].state.serial,3);
   host.publish(work(cat,{revealed:true,serial:3,volume:.3}));await until(()=>received.length===4);assert.equal(received[3].state.volume,.3);
   host.publish(work(cat,{serial:3}));await until(()=>received.length===5);assert.equal(received[4].state.revealed,false);assert.equal(api.uploads,2);
 }finally{host.close();screen.close()}
});
test('slow old media cannot overwrite a newer selected question; reveal remains audible when volume changes during upload',async()=>{
 const api=server();let release;const gate=new Promise(r=>release=r);let first=true;
 const fetchImpl=async(url,options)=>{if(url==='/api/cat-media'&&first){first=false;await gate}return api.fetch(url,options)};
 const host=createCloudProjection({session:'room',fetchImpl,pollMs:5});
 try{
  await host.enable();host.publish(work(q('old')));const cat=q('new');
  host.publish(work(cat,{revealed:true,autoplay:true,serial:8}));host.publish(work(cat,{revealed:true,serial:8,volume:.4}));release();
  await until(()=>api.writes.length===1);assert.equal(api.writes[0].state.key,'new');assert.equal(api.writes[0].state.volume,.4);assert.equal(api.writes[0].autoplay,true);
 }finally{release();host.close()}
});
test('offline commands retry only the latest state; newly opened screen restores state without replaying old audio',async()=>{
 const api=server(),received=[];const host=createCloudProjection({session:'room',fetchImpl:api.fetch,pollMs:5});
 const screen=createCloudProjection({session:'room',screen:true,fetchImpl:api.fetch,pollMs:5,onState:(s,a)=>received.push([s,a])});
 try{
  await host.enable();api.fail=true;host.publish(work(q('old')));await new Promise(r=>setTimeout(r,10));host.publish(work(q('latest'),{revealed:true,autoplay:true,serial:4}));api.fail=false;
  await until(()=>api.writes.length>0);assert.equal(api.writes.at(-1).state.key,'latest');screen.start();await until(()=>received.length>0);assert.equal(received[0][0].revealed,true);assert.equal(received[0][1],false);
 }finally{host.close();screen.close()}
});
test('host login is required before enabling; denied host sends no media',async()=>{
 const host=createCloudProjection({session:'room',fetchImpl:async()=>Response.json({admin:false})});
 try{await assert.rejects(()=>host.enable(),/登入/);assert.equal(host.enabled,false)}finally{host.close()}
});

test('question reaches screen during slow answer upload; silent preload arrives before reveal',async()=>{
 const api=server(),cat=q('slow-answer');let release,started=false;
 const gate=new Promise(r=>release=r);
 const fetchImpl=async(url,options={})=>{
  if(options.body===cat.answerMedia){started=true;await gate}
  return api.fetch(url,options);
 };
 const host=createCloudProjection({session:'room',fetchImpl,pollMs:5});
 try{
  await host.enable();host.publish(work(cat));
  await until(()=>started&&api.writes.length>0);
  assert.equal(api.writes[0].state.revealed,false);assert.equal(api.writes[0].autoplay,false);
  assert.equal(api.writes[0].state.preloadMedia,undefined);
  release();await until(()=>api.writes.some(w=>w.state.preloadMedia));
  const hidden=api.writes.at(-1);assert.equal(hidden.state.answer,undefined);assert.equal(hidden.state.answerMedia,undefined);assert.equal(hidden.autoplay,false);
  host.publish(work(cat,{revealed:true,serial:2,autoplay:true}));
  await until(()=>api.writes.at(-1).state.revealed);
  assert.equal(api.writes.at(-1).state.answerMedia,hidden.state.preloadMedia);assert.equal(api.writes.at(-1).autoplay,true);assert.equal(api.uploads,2);
 }finally{release();host.close()}
});

test('answer upload in background does not block switching questions or restore stale selection',async()=>{
 const api=server(),old=q('old');let release,started=false;
 const gate=new Promise(r=>release=r);
 const host=createCloudProjection({session:'room',pollMs:5,fetchImpl:async(url,options={})=>{
  if(options.body===old.answerMedia){started=true;await gate}
  return api.fetch(url,options);
 }});
 try{
  await host.enable();host.publish(work(old));await until(()=>started);
  host.publish(work(q('new')));await until(()=>api.writes.at(-1)?.state.key==='new');
  release();await until(()=>api.writes.at(-1)?.state.preloadMedia);
  assert.equal(api.writes.at(-1).state.key,'new');
 }finally{release();host.close()}
});

test('fresh host reuses content-addressed cloud media without uploading the same blobs again',async()=>{
 const stored=new Set(),writes=[];let uploads=0;
 const fetchImpl=async(url,options={})=>{
  if(url==='/api/state')return Response.json({admin:true});
  if(options.method==='HEAD')return new Response(null,{status:stored.has(url)?200:404});
  if(url==='/api/cat-media'){
   uploads++;const digest=await crypto.subtle.digest('SHA-256',await options.body.arrayBuffer());
   const target='/api/cat-media/'+Buffer.from(digest).toString('hex');stored.add(target);return Response.json({url:target});
  }
  if(options.method==='POST')writes.push(JSON.parse(options.body));
  return Response.json({ok:true});
 };
 for(let i=0;i<2;i++){
  const host=createCloudProjection({session:'room',fetchImpl,pollMs:5});
  try{await host.enable();host.publish(work(q('same'),{revealed:true}));await until(()=>writes.length===i+1)}finally{host.close()}
 }
 assert.equal(uploads,2);assert.equal(writes[0].state.answerMedia,writes[1].state.answerMedia);
});
