import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/photo-album.js',import.meta.url),'utf8');
function setup(files=[]){
 const nodes=new Map(),requests=[];let mine=0,failOnce=false,limit=60,imageFails=false;const file=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',disabled:false,hidden:false,files:[]});return nodes.get(id)};file('photoFile').files=files;
 class Image{constructor(){this.width=2400;this.height=1800}set src(_){queueMicrotask(()=>imageFails?this.onerror():this.onload())}}
 const canvas={getContext:()=>({drawImage(){},fillRect(){},fillText(){}})};const window={};
 const ctx=vm.createContext({window,document:{getElementById:file,createElement:()=>({...canvas})},URL,Image,FormData,Blob,crypto,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{requests.push({url,options});const name=options.body.get('original').name;if(failOnce&&name==='retry.jpg'){failOnce=false;return{ok:false,json:async()=>({error:'暫時失敗'})}}mine++;return{ok:true,json:async()=>({ok:true})}}});vm.runInContext(code,ctx);
 window.WeddingAlbum.init({album:()=>({mine,hasMore:true}),requireGuest:()=>true,authHeaders:()=>({Authorization:'Bearer test'}),notice(){},fitJpeg:async()=>new Blob([new Uint8Array([255,216,255,...Array(20).fill(1)])],{type:'image/jpeg'}),refresh:async()=>{},increaseLimit:()=>limit+=60});
 return{window,file,requests,setFailOnce:()=>failOnce=true,setImageFailure:()=>imageFails=true,setMine:value=>mine=value,limit:()=>limit};
}
test('multiple photos retain their exact original bytes and send separate previews with authentication',async()=>{
 const bytes=new Uint8Array([255,216,255,5,6,7,8,9]),files=[new File([bytes],'first.jpg',{type:'image/jpeg'}),new File([bytes],'second.jpg',{type:'image/jpeg'})];const s=setup(files);await s.window.WeddingAlbum.upload();assert.equal(s.requests.length,2);for(const r of s.requests){assert.deepEqual(new Uint8Array(await r.options.body.get('original').arrayBuffer()),bytes);assert.equal(r.options.body.get('preview').type,'image/jpeg');assert.equal(r.options.headers.Authorization,'Bearer test');assert.ok(r.options.body.get('uploadId'))}assert.match(s.file('photoUploadStatus').textContent,/成功 2 張/);assert.equal(s.file('photoFile').disabled,false);
});
test('retry skips completed photos and reuses the failed photo upload ID even when quota fills',async()=>{
 const files=['ok.jpg','retry.jpg'].map(name=>new File(['original'],name,{type:'image/jpeg'}));const s=setup(files);s.setFailOnce();await s.window.WeddingAlbum.upload();assert.equal(s.requests.length,2);const id=s.requests[1].options.body.get('uploadId');s.setMine(20);await s.window.WeddingAlbum.upload();assert.equal(s.requests.length,3);assert.equal(s.requests[2].options.body.get('original').name,'retry.jpg');assert.equal(s.requests[2].options.body.get('uploadId'),id);
});
test('load-more increases the album window while leaving the selected photo input untouched',async()=>{
 const files=[new File(['photo'],'selected.jpg',{type:'image/jpeg'})],s=setup(files);await s.window.WeddingAlbum.more();assert.equal(s.limit(),120);assert.equal(s.file('photoFile').files,files);
});
const browserCode=readFileSync(new URL('../public/browser-entry.js',import.meta.url),'utf8');
function browser({ua='Line/15.0',token=null,search='?play=1'}={}){const added=[];const context=vm.createContext({navigator:{userAgent:ua},URL,URLSearchParams,location:{search,href:'https://wedding.test/wedding_1212'+search},localStorage:{getItem:()=>token},document:{body:{prepend:el=>added.push(el)},createElement:()=>({children:[],setAttribute(){},append(...children){this.children.push(...children)}})}});vm.runInContext(browserCode,context);return added}
test('LINE guidance preserves the game link and uses the official external-browser parameter without copying credentials',()=>{
 const added=browser();assert.equal(added.length,1);const link=added[0].children[1],url=new URL(link.href);assert.equal(url.searchParams.get('play'),'1');assert.equal(url.searchParams.get('openExternalBrowser'),'1');assert.doesNotMatch(link.href,/token|password/);assert.equal(browser({token:'existing-guest'}).length,0);assert.equal(browser({ua:'Safari/605'}).length,0);assert.equal(browser({search:'?display=1'}).length,0);
});

test('a browser unable to preview HEIC still uploads the untouched original with a fallback thumbnail',async()=>{
 const original=new File(['heic-original'],'iPhone.HEIC',{type:'image/heic'}),s=setup([original]);s.setImageFailure();await s.window.WeddingAlbum.upload();assert.equal(s.requests.length,1);assert.equal(await s.requests[0].options.body.get('original').text(),'heic-original');assert.equal(s.requests[0].options.body.get('preview').type,'image/jpeg');
});
