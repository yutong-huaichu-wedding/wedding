import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runLoad,summarize,validateOptions} from '../scripts/load-test.mjs';
test('a 403 preflight never escalates to simulated user traffic or writes',async()=>{
 const calls=[];const report=await runLoad({url:'https://wedding.test',profile:'mahjong',stages:[150],seconds:20,log(){},fetcher:async(url,options)=>{calls.push({url,options});return new Response('blocked',{status:403})}});
 assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.equal(report.completed,false);assert.equal(report.passed,false);assert.equal(report.stages.length,0);
});
test('a 200 HTML page or unrelated JSON cannot falsely pass the API preflight',async()=>{
 for(const body of ['<h1>Login required</h1>','{}']){const r=await runLoad({url:'https://wedding.test',stages:[1],seconds:1,log(){},fetcher:async()=>new Response(body)});assert.equal(r.passed,false);assert.equal(r.stages.length,0)}
});
test('load configuration enforces user and request budgets before networking',()=>{
 assert.throws(()=>validateOptions({url:'https://wedding.test',stages:[301]}));assert.throws(()=>validateOptions({url:'https://wedding.test',profile:'mahjong',stages:[300],seconds:120,maxRequests:1000}));assert.throws(()=>validateOptions({url:'https://user:secret@wedding.test'}));
 assert.equal(validateOptions({url:'https://wedding.test',profile:'mahjong',stages:[150],seconds:20}).estimated,1202);
});
test('percentiles and explicit HTTP failures include all samples',()=>{
 const r=summarize([{ms:10,status:200,ok:true,bytes:10},{ms:1000,status:500,ok:false,bytes:20}]);assert.equal(r.p50Ms,10);assert.equal(r.p95Ms,1000);assert.equal(r.errorPercent,50);assert.equal(r.bytes,30);
});
