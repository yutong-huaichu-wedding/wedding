import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const env={};globalThis.__photoEnv=env;
const source=readFileSync(new URL('../lib/wedding.ts',import.meta.url),'utf8').replace("import { env } from 'cloudflare:workers';",'const env=globalThis.__photoEnv;');
const api=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));globalThis.__photoApi=api;
const downloadSource=readFileSync(new URL('../app/api/photo/[id]/route.ts',import.meta.url),'utf8').replace("import { bucket, first } from '@/lib/wedding';",'const {bucket,first}=globalThis.__photoApi;');const downloads=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(downloadSource)).toString('base64'));
let sqlite,objects,putHook;
function prepare(sql){let args=[];return{bind(...a){args=a;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},runSync(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}},async run(){return this.runSync()}}}
const jpeg=()=>new Uint8Array([255,216,255,...Array(29).fill(4)]);
function upload({id=crypto.randomUUID(),name='婚禮.jpg',token='a',preview=true,bytes=jpeg(),extraHeaders={}}={}){const form=new FormData();form.append('original',new Blob([bytes],{type:'image/jpeg'}),name);if(preview)form.append('preview',new Blob([jpeg()],{type:'image/jpeg'}),'preview.jpg');form.append('uploadId',id);return new Request('https://wedding.test/api/photo',{method:'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),...extraHeaders},body:form})}
async function send(options){const response=await api.uploadWeddingPhoto(upload(options));return{status:response.status,body:await response.json()}}
async function state(query=''){return(await api.state(new Request('https://wedding.test/api/state'+query,{headers:{authorization:'Bearer a'}}))).json()}
beforeEach(async()=>{
 sqlite?.close();sqlite=new DatabaseSync(':memory:');objects=new Map();putHook=null;
 for(const name of ['0000_cold_namorita.sql','0001_yielding_magus.sql','0002_media_in_d1.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 env.DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.runSync());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 env.BUCKET={async put(key,value,options){await putHook?.(key);const bytes=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value;objects.set(key,{body:bytes,...options})},async get(key){return objects.get(key)||null},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)}};
 for(const id of ['a','b'])await api.run('INSERT INTO guests VALUES (?,?,?,?,?,?)',id,'賓客'+id,await api.hash(id),1,'preset','cat');
});
test('original bytes are preserved, thumbnail is separate and original download retains a safe filename',async()=>{
 const result=await send();assert.equal(result.status,200);const id=result.body.id;assert.deepEqual(objects.get('photos/'+id).body,jpeg());assert.ok(objects.has('photo-previews/'+id));assert.equal(Number((await api.first('SELECT size FROM media WHERE id=?',id)).size),64);
 const current=await state();assert.equal(current.album.mine,1);assert.equal(current.album.capacityBytes,20*1024**3);assert.match(current.photos[0].thumbnailUrl,/preview=1/);assert.match(current.photos[0].downloadUrl,/download=1/);
 const response=await downloads.GET(new Request('https://wedding.test/api/photo/'+id+'?download=1'),{params:Promise.resolve({id})});assert.deepEqual(new Uint8Array(await response.arrayBuffer()),jpeg());assert.match(response.headers.get('content-disposition'),/%E5%A9%9A%E7%A6%AE/);
});
test('twenty-one simultaneous uploads reserve only twenty slots and stay within the byte budget',async()=>{
 const results=await Promise.all(Array.from({length:21},()=>send()));assert.equal(results.filter(r=>r.status===200).length,20);assert.equal((await state()).album.mine,20);assert.equal((await api.all('SELECT id FROM media')).length,20);assert.equal(objects.size,40);assert.equal((await api.all("SELECT key FROM settings WHERE key LIKE 'photoPending:%'")).length,0);
});
test('failed preview write rolls back objects, quota and pending rows, and the same ID can retry',async()=>{
 const id=crypto.randomUUID();putHook=key=>{if(key.startsWith('photo-previews/'))throw Error('simulated write failure')};const logger=console.error;let first;try{console.error=()=>{};first=await send({id})}finally{console.error=logger}assert.equal(first.status,500);assert.equal((await state()).album.mine,0);assert.equal(await api.mediaBytes(),0);assert.equal(objects.size,0);
 putHook=null;assert.equal((await send({id})).status,200);assert.equal((await state()).album.mine,1);
});
test('pending objects stay hidden and concurrent retry cannot hide or overwrite the completed photo',async()=>{
 const id=crypto.randomUUID();let reached,release;const started=new Promise(resolve=>reached=resolve),hold=new Promise(resolve=>release=resolve);putHook=async key=>{if(key==='photos/'+id){reached();await hold}};const pending=send({id});await started;const current=await state();assert.equal(current.album.mine,1);assert.equal(current.photos.length,0);assert.equal((await send({id})).status,409);
 release();assert.equal((await pending).status,200);putHook=null;const retry=await send({id});assert.equal(retry.status,200);assert.equal(retry.body.alreadyUploaded,true);assert.equal((await state()).photos.length,1);assert.equal(objects.size,2);
 assert.equal((await send({id,token:'b'})).status,409);
});
test('20GB and 30MB limits, invalid formats and missing check-in reject before R2 writes',async()=>{
 assert.equal((await send({token:''})).status,401);assert.equal((await send({bytes:new Uint8Array(32)})).status,400);assert.equal((await send({extraHeaders:{'content-length':String(api.photoFileLimit+700*1024+1)}})).status,413);
 await api.run('INSERT INTO media VALUES (?,?,?)','existing',new Uint8Array(),api.mediaLimit-63);assert.equal((await send()).status,409);assert.equal(objects.size,0);assert.equal((await state()).album.mine,0);
});
test('legacy photos without thumbnails still display, and loading more reaches all photos after the first 150',async()=>{
 for(let i=0;i<161;i++){const id=crypto.randomUUID();await api.run('INSERT INTO photos VALUES (?,?,?,?,?)',id,'a','賓客a','image/jpeg',i);objects.set('photos/'+id,{body:jpeg()})}
 const initial=await state();assert.equal(initial.photos.length,60);assert.equal(initial.album.total,161);assert.equal(initial.album.hasMore,true);const more=await state('?photos=180');assert.equal(more.photos.length,161);assert.equal(more.album.hasMore,false);
 const id=more.photos[0].id;const image=await downloads.GET(new Request('https://wedding.test/api/photo/'+id+'?preview=1'),{params:Promise.resolve({id})});assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),jpeg());
});
test('abandoned pending uploads expire without removing already published photos',async()=>{
 const id=crypto.randomUUID();await api.run('INSERT INTO photos VALUES (?,?,?,?,?)',id,'a','賓客a','image/jpeg',1);await api.run('INSERT INTO media VALUES (?,?,?)',id,new Uint8Array(),64);await api.setSetting('photoPending:'+id,Date.now()-31*60*1000);objects.set('photos/'+id,{body:jpeg()});objects.set('photo-previews/'+id,{body:jpeg()});assert.equal((await state()).album.mine,0);assert.equal((await send()).status,200);assert.equal(await api.first('SELECT id FROM photos WHERE id=?',id),null);assert.equal(objects.has('photos/'+id),false);assert.equal((await state()).album.mine,1);
});

test('HEIC originals retain their format while the gallery uses the separate JPEG preview',async()=>{
 const bytes=new Uint8Array(32);bytes[3]=32;bytes.set(new TextEncoder().encode('ftypheic'),4);bytes.set(new TextEncoder().encode('mif1'),16);const result=await send({bytes,name:'iPhone.HEIC'});assert.equal(result.status,200);const id=result.body.id;assert.equal((await api.first('SELECT type FROM photos WHERE id=?',id)).type,'image/heic');assert.deepEqual(objects.get('photos/'+id).body,bytes);
 const thumbnail=await downloads.GET(new Request('https://wedding.test/api/photo/'+id+'?preview=1'),{params:Promise.resolve({id})});assert.equal(thumbnail.headers.get('content-type'),'image/jpeg');
 const original=await downloads.GET(new Request('https://wedding.test/api/photo/'+id+'?download=1'),{params:Promise.resolve({id})});assert.equal(original.headers.get('content-type'),'image/heic');assert.deepEqual(new Uint8Array(await original.arrayBuffer()),bytes);
});
test('simultaneous uploads cannot spend the same final bytes of the shared 20GB allowance twice',async()=>{
 await api.run('INSERT INTO media VALUES (?,?,?)','existing',new Uint8Array(),api.mediaLimit-64);const results=await Promise.all([send({token:'a'}),send({token:'b'})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await api.mediaBytes(),api.mediaLimit);assert.equal(objects.size,2);
});

test('retrying an expired interrupted upload releases its slot and requests a fresh upload ID',async()=>{
 const id=crypto.randomUUID();await api.run('INSERT INTO photos VALUES (?,?,?,?,?)',id,'a','賓客a','image/jpeg',1);await api.run('INSERT INTO media VALUES (?,?,?)',id,new Uint8Array(),64);await api.setSetting('photoPending:'+id,Date.now()-31*60*1000);const retry=await send({id});assert.equal(retry.status,410);assert.equal((await state()).album.mine,0);assert.equal((await send()).status,200);
});
