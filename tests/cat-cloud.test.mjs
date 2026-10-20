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
   if(url==='/api/state')return Response.json({admin:true});
   if(url==='/api/cat-media'){uploads++;return Response.json({url:'/api/cat-media/'+String(uploads).padStart(64,'0')})}
   if(options.method==='POST'){const body=JSON.parse(options.body);state=body.state;if(body.autoplay)playAt=Date.now();revision++;writes.push(body);return Response.json({ok:true})}
   return Response.json({state,revision:String(revision),playAt,screenAt:Date.now()});
 }};
}
test('independent host and screen sync photo, reveal, replay, hide and volume; no blob URLs or hidden answers leave host',async()=>{
 const api=server(),received=[];
 const host=createCloudProjection({session:'room',fetchImpl:api.fetch,pollMs:5});
 const screen=createCloudProjection({session:'room',screen:true,fetchImpl:api.fetch,pollMs:5,onState:(state,autoplay)=>received.push({state,autoplay})});
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
