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
test('machine mounts once, keeps stable canvas across polling, and destroys its scheduled animation',()=>{
 const a=api(),listeners=new Map(),timers=new Map();let id=0,time=104500;
 const document={hidden:false,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const target=new Element('div'),options={document,clock:()=>time,requestAnimationFrame:f=>{timers.set(++id,f);return id},cancelAnimationFrame:id=>timers.delete(id)};
 const m=a.mount(target,options);m.update(lottery);const svg=target.children[0].children[1];assert.equal(timers.size,1);
 assert.equal(a.mount(target,options),m);m.update(lottery);assert.equal(target.children[0].children[1],svg);assert.equal(timers.size,1);
 time=200000;m.update(lottery);assert.equal(timers.size,0);assert.match(target.textContent,/49/);a.unmount(target);assert.equal(target.children.length,0);assert.equal(listeners.size,0);
});

test('3D solids collide and rebound instead of following overlapping circular tracks',()=>{
 const simulation=api().createPhysics(),[a,b]=simulation.bodies;
 Object.assign(a,{x:-5,y:120,z:0,vx:50,vy:0,vz:0});Object.assign(b,{x:5,y:120,z:0,vx:-50,vy:0,vz:0});
 const removed=new Set(Array.from({length:47},(_,i)=>i+3));simulation.step(.001,removed);
 assert.ok(a.vx<0);assert.ok(b.vx>0);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>=17.9);
});
test('the cylinder simulation stays bounded and finite during a complete draw and resumes safely',()=>{
 const simulation=api().createPhysics(),removed=new Set();
 for(let i=0;i<1800;i++){
  if(i%300===299)removed.add(i/300|0);
  simulation.step(i===900?30:1/60,removed);
  for(const ball of simulation.bodies){
   assert.ok([ball.x,ball.y,ball.z,ball.vx,ball.vy,ball.vz].every(Number.isFinite));
   assert.ok(ball.y>=14&&ball.y<=274);assert.ok(Math.hypot(ball.x/88,ball.z/51)<=1.00001);
  }
 }
 assert.equal(simulation.bodies.length,49);
});
