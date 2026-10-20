import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/blessing-fireworks.js',import.meta.url),'utf8');
class Element{
 constructor(tag,width=800,height=400){this.tag=tag;this.className='';this.children=[];this.dataset={};this.attrs={};this.style={values:{},setProperty(name,value){this.values[name]=value},getPropertyValue(name){return this.values[name]}};this.clientWidth=width;this.clientHeight=height;this._text='';this.parent=null;this.classList={add:name=>{this.className+=' '+name}}}
 set textContent(value){this._text=String(value);this.children=[]}get textContent(){return this._text+this.children.map(e=>e.textContent).join('')}
 setAttribute(name,value){this.attrs[name]=value}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);this.onAppend?.(child)}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null}
 replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this._text='';this.append(...children)}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.tag===selector)found.push(child);found.push(...child.querySelectorAll(selector))}return found}
}
function setup({width=800,height=400}={}){
 let clock=0,id=0;const timers=new Map(),listeners=new Map(),windowListeners=new Map(),history=[];
 const document={hidden:false,createElement:tag=>{const e=new Element(tag,width,height);e.onAppend=child=>{if(child.className==='fireworks-message')history.push({id:child.dataset.blessingId,time:clock})};return e},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:clock+ms});return id},clearTimeout=key=>timers.delete(key);
 const window={addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)};vm.runInNewContext(source,{window,document,setTimeout,clearTimeout,console});
 const target=new Element('div'),show=window.WeddingFireworks.mount(target,{document,setTimeout,clearTimeout,clock:()=>clock,random:()=>.5});
 const advance=ms=>{const end=clock+ms;for(let i=0;i<100000;i++){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end){clock=end;return}clock=next[1].at;timers.delete(next[0]);next[1].fn()}throw Error('timer loop')};
 const visible=active=>{document.hidden=!active;listeners.get('visibilitychange')?.()};
 const resize=(w,h)=>{const arena=target.querySelector('.fireworks-arena');arena.clientWidth=w;arena.clientHeight=h;windowListeners.get('resize')?.()};
 return {target,show,advance,visible,resize,timers,document,window,history,find:selector=>target.querySelector(selector),all:selector=>target.querySelectorAll(selector)};
}
const blessings=[{id:'a',name:'賓客甲',text:'祝幸福久久',avatarKind:'preset',avatarValue:'cat'},{id:'b',name:'賓客乙',text:'新婚快樂'}];
const many=Array.from({length:9},(_,i)=>({id:'b'+i,name:'賓客'+i,text:'第'+i+'份祝福'}));
function pause(s){s.find('.fireworks-pause').onclick()}
test('cat illustration launches a real blessing; clicking rocket reveals early without replacing another message',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.advance(699);assert.equal(s.find('.fireworks-rocket'),null);
 assert.equal(s.find('.fireworks-cats').src,'/firework-cats-v1.webp');
 s.advance(1);const rocket=s.find('.fireworks-rocket');assert.ok(rocket);assert.equal(s.find('.fireworks-message'),null);
 rocket.onclick();const first=s.find('.fireworks-message');assert.match(first.textContent,/賓客甲/);
 s.advance(900);s.show.launch();s.find('.fireworks-rocket').onclick();assert.equal(s.all('.fireworks-message').length,2);assert.ok(s.all('.fireworks-message').includes(first));
 assert.notEqual(s.all('.fireworks-message')[0].style.left,s.all('.fireworks-message')[1].style.left);
});
test('wide sky reserves six disjoint spaces; trajectories and bursts follow those spaces, including different heights',()=>{
 const s=setup({width:1600,height:720});s.show.update(many);s.show.setActive(true);pause(s);
 for(let i=0;i<6;i++)assert.equal(s.show.launch(),true);
 s.advance(2100);assert.equal(s.all('.fireworks-rocket').length+s.all('.fireworks-message').length,6);
 const occupied=[...s.all('.fireworks-rocket'),...s.all('.fireworks-message')];assert.equal(new Set(occupied.map(e=>e.dataset.slot)).size,6);
 s.advance(2100);const messages=s.all('.fireworks-message');assert.equal(messages.length,6);assert.equal(new Set(messages.map(e=>e.style.left)).size,3);assert.ok(new Set(messages.map(e=>e.style.top)).size>=2);
 const rects=messages.map(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),w:parseFloat(e.style.width),h:parseFloat(e.style.height)}));
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y)}
});
test('fifty rapid clicks all queue, hold each text, then leave a break before the next wave',()=>{
 const s=setup({width:1600,height:720});s.show.update(many);s.show.setActive(true);pause(s);
 for(let i=0;i<50;i++)assert.equal(s.show.launch(),true);
 assert.equal(s.find('.fireworks-scene').dataset.pending,'49');assert.equal(s.find('.fireworks-launch').disabled,false);
 s.advance(4200);const originals=s.all('.fireworks-message');assert.equal(originals.length,6);assert.equal(s.find('.fireworks-scene').dataset.pending,'44');
 s.advance(4400);assert.equal(s.all('.fireworks-message').length,6);for(const message of originals)assert.ok(s.all('.fireworks-message').includes(message));
 s.advance(6150);assert.equal(s.all('.fireworks-message').length,0);assert.equal(s.all('.fireworks-rocket').length,0);assert.match(s.find('.fireworks-queue').textContent,/稍作停留/);
 s.advance(1399);assert.equal(s.all('.fireworks-rocket').length,0);s.advance(1);assert.equal(s.all('.fireworks-rocket').length,1);assert.equal(s.find('.fireworks-scene').dataset.pending,'43');
 s.advance(200000);assert.equal(s.find('.fireworks-scene').dataset.pending,'0');assert.equal(s.all('.fireworks-message').length,0);assert.equal(s.all('.fireworks-rocket').length,0);
 assert.equal(s.history.length,50);assert.equal(new Set(s.history.slice(0,9).map(m=>m.id)).size,9);
});
test('automatic show stays one at a time in the true center; only clicks add side rockets',()=>{
 const s=setup({width:1600,height:720});s.show.update(many);s.show.setActive(true);s.advance(700);
 const rocket=s.find('.fireworks-rocket');assert.equal(rocket.style.getPropertyValue('--end-x'),'800px');assert.equal(rocket.style.getPropertyValue('--end-y'),'360px');
 s.advance(7600);assert.equal(s.all('.fireworks-message').length,1);assert.equal(s.all('.fireworks-rocket').length,0);
 s.show.launch();const extra=s.find('.fireworks-rocket');assert.notEqual(extra.style.getPropertyValue('--end-x'),'800px');
 s.advance(30000);assert.equal(s.all('.fireworks-message').length+s.all('.fireworks-rocket').length,1);
 const current=s.find('.fireworks-message');if(current){assert.equal(parseFloat(current.style.left)+parseFloat(current.style.width)/2,800);assert.equal(parseFloat(current.style.top)+parseFloat(current.style.height)/2,360)}
});
test('unattended playback never exceeds one centered blessing across repeated cycles',()=>{
 const s=setup({width:1600,height:720});s.show.update(many);s.show.setActive(true);
 for(let i=0;i<100;i++){
  s.advance(500);assert.ok(s.all('.fireworks-rocket').length+s.all('.fireworks-message').length<=1);
  for(const rocket of s.all('.fireworks-rocket')){assert.equal(rocket.style.getPropertyValue('--end-x'),'800px');assert.equal(rocket.style.getPropertyValue('--end-y'),'360px')}
 }
 assert.ok(s.history.length>=3);
});
test('a 100-character blessing remains visible longer and retains its full text',()=>{
 const s=setup({width:320,height:360}),text='祝'.repeat(100);s.show.update([{id:'long',name:'長祝福',text}]);s.show.setActive(true);pause(s);s.show.launch();s.advance(2100);
 const message=s.find('.fireworks-message');assert.equal(message.querySelector('blockquote').textContent,text);
 s.advance(9000);assert.equal(s.find('.fireworks-message'),message);s.advance(4250);assert.equal(s.find('.fireworks-message'),null);
});
test('narrow phones use one readable space and queue excess launches rather than overlap',()=>{
 const s=setup({width:300,height:360});s.show.update(many);s.show.setActive(true);pause(s);for(let i=0;i<4;i++)s.show.launch();
 s.advance(2100);assert.equal(s.all('.fireworks-message').length,1);assert.equal(s.find('.fireworks-scene').dataset.pending,'3');assert.equal(s.find('.fireworks-scene').dataset.columns,'1');
});
test('new blessings are prioritized without restarting current flights; deletion immediately removes a displayed message',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.advance(700);const rocket=s.find('.fireworks-rocket');
 s.show.update(blessings);assert.equal(s.find('.fireworks-rocket'),rocket);
 s.show.update([...blessings,{id:'new',name:'新朋友',text:'新祝福'}]);s.advance(800);assert.equal(s.all('.fireworks-rocket').length,1);s.show.launch();const fresh=s.all('.fireworks-rocket')[1];assert.equal(fresh.dataset.blessingId,'new');fresh.onclick();
 assert.ok(s.all('.fireworks-message').some(m=>m.textContent.includes('新祝福')));s.show.update(blessings);assert.equal(s.find('.fireworks-message'),null);
});
test('backgrounding, switching activity and resizing stop timers but preserve queued and interrupted blessings',()=>{
 const s=setup();s.show.update(many);s.show.setActive(true);pause(s);s.show.launch();s.show.launch();s.show.launch();s.advance(500);
 s.visible(false);assert.equal(s.timers.size,0);assert.equal(s.find('.fireworks-scene').dataset.pending,'3');assert.equal(s.all('.fireworks-rocket').length,0);
 s.advance(30000);s.visible(true);s.advance(500);assert.equal(s.all('.fireworks-rocket').length,2);assert.equal(s.find('.fireworks-scene').dataset.pending,'1');
 s.resize(320,400);s.advance(180);assert.equal(s.find('.fireworks-scene').dataset.columns,'1');assert.equal(s.all('.fireworks-rocket').length,1);assert.equal(s.find('.fireworks-scene').dataset.pending,'2');
 s.show.setActive(false);assert.equal(s.timers.size,0);assert.equal(s.show.launch(),false);assert.equal(s.find('.fireworks-scene').dataset.pending,'3');
});
test('empty wall waits; hostile message text stays text; mount is reused; destroy cleans up',()=>{
 const s=setup();s.show.update([]);s.show.setActive(true);assert.ok(s.find('.fireworks-empty'));assert.equal(s.find('.fireworks-launch').disabled,true);
 s.show.update([{id:'safe',name:'<賓客>',text:'<img src=x onerror=alert(1)>'}]);assert.equal(s.find('.fireworks-empty'),null);
 s.advance(700);s.find('.fireworks-rocket').onclick();const message=s.find('.fireworks-message');assert.match(message.textContent,/<img src=x/);assert.equal(message.querySelector('img'),null);
 assert.equal(s.window.WeddingFireworks.mount(s.target),s.show);s.show.destroy();assert.equal(s.timers.size,0);assert.equal(s.target.children.length,0);
});
