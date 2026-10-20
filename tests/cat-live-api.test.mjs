import {test,beforeEach} from 'node:test';
import {createCloudProjection} from '../public/cat-cloud.js';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const env={};globalThis.__catTestEnv=env;
const weddingSource=readFileSync(new URL('../lib/wedding.ts',import.meta.url),'utf8').replace("import { env } from 'cloudflare:workers';",'const env=globalThis.__catTestEnv;');
const wedding=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(weddingSource)).toString('base64'));
globalThis.__catWedding=wedding;
const catSource=readFileSync(new URL('../lib/cat-live.ts',import.meta.url),'utf8').replace(/^import .*from '.\/wedding';/m,'const {bad,good,isAdmin,sameOrigin,setting,db,bucket,setSetting}=globalThis.__catWedding;');
const api=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(catSource)).toString('base64'));
const room='12345678-1234-1234-1234-123456789abc',media='/api/cat-media/'+'a'.repeat(64);
let sqlite,objects,puts;
function prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}}
beforeEach(async()=>{
 sqlite?.close();sqlite=new DatabaseSync(':memory:');objects=new Map();puts=0;
 sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)');
 env.DB={prepare};env.BUCKET={async head(key){return objects.get(key)},async put(key,bytes,options){puts++;objects.set(key,{bytes,httpMetadata:options.httpMetadata})},async get(key,options){const object=objects.get(key);if(!object)return null;const range=options?.range?.get('range');return {body:range?object.bytes.slice(0,2):object.bytes,size:object.bytes.byteLength,httpMetadata:object.httpMetadata,...(range?{range:{offset:0,length:2}}:{})}}};
 await wedding.run('INSERT INTO admin_sessions VALUES (?,?)',await wedding.hash('test-admin'),Date.now()+60000);
 await wedding.setSetting('lottery',{status:'open',result:[]});
});
function state(extra={}){return {key:'a',prompt:'請模仿',total:9,index:0,revealed:false,ready:true,image:media,serial:10,volume:.8,...extra}}
function request(method='GET',body,admin=true,suffix=''){return new Request('https://wedding.test/api/cat-live?session='+room+suffix,{method,headers:{...(admin?{cookie:'wedding_admin=test-admin'}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
async function send(s,autoplay=false){return api.catLive(request('POST',{state:s,autoplay}))}
test('host-authenticated state is shared with independent screen, private answers stripped before reveal, heartbeat preserves state',async()=>{
 const s=state({answer:'PRIVATE',note:'PRIVATE'});assert.equal((await send(s)).status,200);
 const screen=await (await api.catLive(request('GET',null,false,'&screen=1'))).json();assert.equal(screen.state.answer,undefined);assert.equal(screen.state.note,undefined);assert.ok(screen.screenAt>0);
 const answer=state({revealed:true,answer:'Huh',name:'貓',note:'',answerMedia:media,answerMediaType:'video/mp4',sound:'',soundType:'',serial:11});
 await send(answer,true);const updated=await (await api.catLive(request('GET',null,false))).json();assert.equal(updated.state.answer,'Huh');assert.ok(updated.playAt>0);assert.equal(updated.screenAt,screen.screenAt);
 assert.deepEqual(await wedding.setting('lottery',null),{status:'open',result:[]});
 await send(state({serial:11}));const hidden=await (await api.catLive(request('GET',null,false))).json();assert.equal(hidden.state.revealed,false);assert.equal(hidden.state.answerMedia,undefined);
});
test('unauthorized and foreign-origin commands rejected; room IDs and browser-local media cannot be published',async()=>{
 assert.equal((await api.catLive(request('POST',{state:state()},false))).status,401);
 const foreign=request('POST',{state:state()});foreign.headers.set('origin','https://evil.test');assert.equal((await api.catLive(foreign)).status,403);
 assert.equal((await api.catLive(new Request('https://wedding.test/api/cat-live?session=guess'))).status,400);
 for(const s of [state({image:'blob:local'}),state({image:'https://evil.test/a.png'}),state({index:50}),state({volume:2}),state({serial:-1})])assert.equal((await send(s)).status,400);
});
test('rooms are isolated and expired room state is not returned',async()=>{
 await send(state());const other=await api.catLive(new Request('https://wedding.test/api/cat-live?session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));assert.equal((await other.json()).state,null);
 await wedding.setSetting('catLive:'+room,{state:state(),updatedAt:Date.now()-86400001});assert.equal((await (await api.catLive(request())).json()).state,null);
});
test('media requires host auth, deduplicates bytes and enforces types and limits; immutable media supports video ranges',async()=>{
 const upload=(headers={},body='video',admin=true)=>api.uploadCatMedia(new Request('https://wedding.test/api/cat-media',{method:'POST',headers:{...(admin?{cookie:'wedding_admin=test-admin'}:{}),'content-type':'video/mp4',...headers},body}));
 assert.equal((await upload({},'video',false)).status,401);assert.equal((await upload({'content-type':'text/html'})).status,400);assert.equal((await upload({'content-length':String(51*1024*1024)})).status,413);
 const a=await (await upload()).json(),b=await (await upload()).json();assert.equal(a.url,b.url);assert.equal(puts,1);
 const head=await api.readCatMedia(new Request('https://wedding.test'+a.url,{method:'HEAD'}),a.url.split('/').at(-1));assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await api.readCatMedia(new Request('https://wedding.test'+media,{method:'HEAD'}),'a'.repeat(64))).status,404);
 const full=await api.readCatMedia(new Request('https://wedding.test'+a.url),a.url.split('/').at(-1));assert.equal(full.headers.get('accept-ranges'),'bytes');assert.equal(await full.text(),'video');
 const partial=await api.readCatMedia(new Request('https://wedding.test'+a.url,{headers:{range:'bytes=0-1'}}),a.url.split('/').at(-1));assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 0-1/5');assert.equal(await partial.text(),'vi');
 assert.equal((await api.readCatMedia(new Request('https://wedding.test'), 'invalid')).status,404);
});

test('silent preload accepts only internal durable media URL and still strips answer text',async()=>{
 assert.equal((await send(state({preloadMedia:'https://evil.test/a.mp4'}))).status,400);
 assert.equal((await send(state({preloadMedia:'blob:phone'}))).status,400);
 assert.equal((await send(state({preloadMedia:media,answer:'private',note:'private',answerMedia:media}))).status,200);
 const result=await (await api.catLive(request())).json();assert.equal(result.state.preloadMedia,media);
 assert.equal(result.state.answer,undefined);assert.equal(result.state.note,undefined);assert.equal(result.state.answerMedia,undefined);assert.equal(result.state.revealed,false);
});

test('a fixed screen discovers the active phone session and follows a new session without copying private room URLs',async()=>{
 let result=await api.catLive(new Request('https://wedding.test/api/cat-live?follow=1&screen=1'));assert.equal((await result.json()).active,false);
 await send(state());result=await api.catLive(new Request('https://wedding.test/api/cat-live?follow=1&screen=1'));let data=await result.json();assert.equal(data.session,room);assert.equal(data.state.key,'a');
 const second='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';const req=new Request('https://wedding.test/api/cat-live?session='+second,{method:'POST',headers:{cookie:'wedding_admin=test-admin'},body:JSON.stringify({state:state({key:'phone2'})})});assert.equal((await api.catLive(req)).status,200);
 data=await (await api.catLive(new Request('https://wedding.test/api/cat-live?follow=1&screen=1'))).json();assert.equal(data.session,second);assert.equal(data.state.key,'phone2');
 await wedding.setSetting('projection',{mode:'mahjong',session:''});data=await (await api.catLive(new Request('https://wedding.test/api/cat-live?follow=1&screen=1'))).json();assert.equal(data.active,false);assert.equal(data.state,null);
});

test('independent phone transport and fixed-screen transport work through the real state/media APIs and database',async()=>{
 const second='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',states=[];
 const route=(admin)=>async(path,options={})=>{
  const request=new Request('https://wedding.test'+path,{...options,headers:{...(options.headers||{}),...(admin?{cookie:'wedding_admin=test-admin'}:{})}});
  if(path==='/api/state')return Response.json({admin:await wedding.isAdmin(request)});
  if(path==='/api/cat-media')return api.uploadCatMedia(request);
  if(path.startsWith('/api/cat-media/'))return api.readCatMedia(request,path.split('/').at(-1));
  return api.catLive(request);
 };
 const host=createCloudProjection({session:second,fetchImpl:route(true),pollMs:5});
 const screen=createCloudProjection({screen:true,follow:true,fetchImpl:route(false),pollMs:5,onState:(state,play)=>{if(states.at(-1)?.state.serial!==state.serial||states.at(-1)?.state.revealed!==state.revealed)states.push({state,play})}});
 const q={id:'live-cat',name:'貓',prompt:'請模仿',answer:'喵',note:'',image:new Blob(['GIF89a'],{type:'image/gif'}),answerMedia:new Blob(['movie'],{type:'video/mp4'})};
 const work={q,index:0,total:1,revealed:false,serial:1,volume:.8};
 const until=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,5))}throw Error('sync timeout')};
 try{
  screen.start();await host.enable();host.publish(work);await until(()=>states.length===1);
  assert.equal(states[0].state.key,'live-cat');assert.equal(states[0].state.revealed,false);assert.match(states[0].state.image,/^\/api\/cat-media\//);
  host.publish({...work,revealed:true,serial:2,autoplay:true});await until(()=>states.length===2);assert.equal(states[1].play,true);assert.equal(states[1].state.answer,'喵');
  host.publish({...work,revealed:true,serial:3,autoplay:true});await until(()=>states.length===3);assert.equal(states[2].state.serial,3);
  host.publish({...work,serial:3});await until(()=>states.length===4);assert.equal(states[3].state.revealed,false);
 }finally{host.close();screen.close()}
});
