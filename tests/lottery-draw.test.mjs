import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/lottery-draw.js',import.meta.url),'utf8');
function api(){const window={};vm.runInNewContext(source,{window});return window.WeddingLottery}
const lottery={status:'drawn',startedAt:100000,result:[1,7,12,25,38,49]};
test('every screen derives exactly the same suction and reveal timeline without changing results',()=>{
 const a=api(),b=api();
 assert.equal(a.frame(lottery,100000).phase,'mixing');assert.equal(a.count(lottery,100000),0);
 assert.equal(a.frame(lottery,104500).phase,'suction');assert.equal(a.count(lottery,104500),0);
 for(let i=0;i<6;i++){
  const reveal=lottery.startedAt+2400+i*4200+3360;
  assert.equal(a.count(lottery,reveal-1),i);assert.equal(a.count(lottery,reveal),i+1);
  assert.deepEqual(JSON.parse(JSON.stringify(a.frame(lottery,reveal))),JSON.parse(JSON.stringify(b.frame(lottery,reveal))));
 }
 assert.equal(a.frame(lottery,200000).phase,'complete');assert.equal(a.count(lottery,200000),6);assert.deepEqual(lottery.result,[1,7,12,25,38,49]);
});
test('late projector joins current ball instead of replaying earlier balls; reset and invalid state clear',()=>{
 const a=api();assert.equal(a.count(lottery,lottery.startedAt+19000),4);
 assert.equal(a.count({...lottery,status:'open'},200000),0);assert.equal(a.count({...lottery,result:[]},200000),0);assert.equal(a.count(lottery,99999),0);
});
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this._text='';this.classList={add(){},remove(){}}}
 setAttribute(k,v){this.attrs[k]=v}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
 get lastChild(){return this.children.at(-1)}set textContent(t){this._text=String(t)}get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
}
test('machine mounts once, keeps stable SVG across polling, and destroys its scheduled animation',()=>{
 const a=api(),listeners=new Map(),timers=new Map();let id=0,time=104500;
 const document={hidden:false,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const target=new Element('div'),options={document,clock:()=>time,requestAnimationFrame:f=>{timers.set(++id,f);return id},cancelAnimationFrame:id=>timers.delete(id)};
 const m=a.mount(target,options);m.update(lottery);const svg=target.children[0].children[1];assert.equal(timers.size,1);
 assert.equal(a.mount(target,options),m);m.update(lottery);assert.equal(target.children[0].children[1],svg);assert.equal(timers.size,1);
 time=200000;m.update(lottery);assert.equal(timers.size,0);assert.match(target.textContent,/49/);a.unmount(target);assert.equal(target.children.length,0);assert.equal(listeners.size,0);
});
