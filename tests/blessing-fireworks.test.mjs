import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/blessing-fireworks.js',import.meta.url),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){}};this.clientWidth=800;this.clientHeight=400;this._text='';this.parent=null;this.classList={add:name=>{this.className+=' '+name}}}
 set textContent(value){this._text=String(value);this.children=[]}get textContent(){return this._text+this.children.map(e=>e.textContent).join('')}
 setAttribute(name,value){this.attrs[name]=value}
 append(...children){for(const child of children){child.parent=this;this.children.push(child)}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null}
 replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this._text='';this.append(...children)}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.tag===selector)found.push(child);found.push(...child.querySelectorAll(selector))}return found}
}
function setup(){
 let clock=0,id=0;const timers=new Map(),listeners=new Map();
 const document={hidden:false,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:clock+ms});return id},clearTimeout=key=>timers.delete(key);
 const window={};vm.runInNewContext(source,{window,document,setTimeout,clearTimeout,console});
 const target=new Element('div'),show=window.WeddingFireworks.mount(target,{document,setTimeout,clearTimeout,clock:()=>clock,random:()=>.5});
 const advance=ms=>{const end=clock+ms;for(let i=0;i<10000;i++){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;clock=next[1].at;timers.delete(next[0]);next[1].fn()}clock=end};
 const visible=active=>{document.hidden=!active;listeners.get('visibilitychange')?.()};
 return {target,show,advance,visible,timers,document,window,find:selector=>target.querySelector(selector)};
}
const blessings=[{id:'a',name:'賓客甲',text:'祝幸福久久',avatarKind:'preset',avatarValue:'cat'},{id:'b',name:'賓客乙',text:'新婚快樂'}];
test('auto launches one blessing; clicking its rocket reveals it early and accelerates next launch',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.advance(699);assert.equal(s.find('.fireworks-rocket'),null);
 s.advance(1);const rocket=s.find('.fireworks-rocket');assert.ok(rocket);assert.equal(s.find('.fireworks-message'),null);
 rocket.onclick();assert.match(s.find('.fireworks-message').textContent,/賓客甲/);assert.match(s.find('.fireworks-message').textContent,/祝幸福久久/);
 assert.equal(s.find('.fireworks-rocket'),null);s.advance(1200);assert.ok(s.find('.fireworks-rocket'));s.advance(2600);assert.match(s.find('.fireworks-message').textContent,/賓客乙/);
});
test('new blessings are prioritized, ordinary polling does not restart flight, deleted blessings disappear',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.advance(700);const rocket=s.find('.fireworks-rocket');
 s.show.update(blessings);assert.equal(s.find('.fireworks-rocket'),rocket);
 s.show.update([...blessings,{id:'new',name:'新朋友',text:'新祝福'}]);s.advance(800);assert.equal(s.target.querySelectorAll('.fireworks-rocket').length,2);
 const fresh=s.target.querySelectorAll('.fireworks-rocket')[1];fresh.onclick();assert.match(s.find('.fireworks-message').textContent,/新祝福/);
 s.show.update(blessings);assert.equal(s.find('.fireworks-message'),null);
});
test('hidden tab or switched activity cancels every timer and rocket, then resumes when active',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.advance(700);assert.ok(s.find('.fireworks-rocket'));
 s.visible(false);assert.equal(s.timers.size,0);assert.equal(s.find('.fireworks-rocket'),null);s.advance(30000);assert.equal(s.find('.fireworks-message'),null);
 s.visible(true);s.advance(700);assert.ok(s.find('.fireworks-rocket'));s.show.setActive(false);assert.equal(s.timers.size,0);assert.equal(s.show.launch(),false);
});
test('pause stops automatic launch but keeps manual interaction; rapid clicks are bounded',()=>{
 const s=setup();s.show.update(blessings);s.show.setActive(true);s.find('.fireworks-pause').onclick();s.advance(30000);assert.equal(s.find('.fireworks-rocket'),null);
 assert.equal(s.show.launch(),true);for(let i=0;i<50;i++)s.show.launch();assert.equal(s.target.querySelectorAll('.fireworks-rocket').length,1);
 s.advance(350);assert.equal(s.show.launch(),true);s.advance(350);assert.equal(s.show.launch(),false);assert.equal(s.target.querySelectorAll('.fireworks-rocket').length,2);
 assert.equal(s.find('.fireworks-launch').disabled,true);s.advance(3000);assert.equal(s.target.querySelectorAll('.fireworks-message').length,1);
});
test('empty wall waits for real messages; message text is not HTML and one mount is reused',()=>{
 const s=setup();s.show.update([]);s.show.setActive(true);assert.ok(s.find('.fireworks-empty'));assert.equal(s.find('.fireworks-launch').disabled,true);
 s.show.update([{id:'safe',name:'<賓客>',text:'<img src=x onerror=alert(1)>'}]);assert.equal(s.find('.fireworks-empty'),null);
 s.advance(700);s.find('.fireworks-rocket').onclick();assert.match(s.find('.fireworks-message').textContent,/<img src=x/);assert.equal(s.target.querySelector('img'),null);
 assert.equal(s.window.WeddingFireworks.mount(s.target),s.show);s.show.destroy();assert.equal(s.timers.size,0);assert.equal(s.target.children.length,0);
});
