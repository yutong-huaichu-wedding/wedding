// Read-only HTTP load test. No cookies, login, writes, uploads, or resets.
import {performance} from 'node:perf_hooks';
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const profiles={
 reception:[['/api/activity',3000],['/api/state',60000]],
 wall:[['/api/activity',3000],['/api/state',8000]],
 cat:[['/api/activity',3000],['/api/state',60000]],
 mahjong:[['/api/activity',3000],['/api/state',60000]],
 lotto:[['/api/activity',3000],['/api/state',3000]],
};
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const round=n=>Math.round(n*100)/100;
export function summarize(samples){
 const ms=samples.map(s=>s.ms).sort((a,b)=>a-b),q=p=>ms.length?round(ms[Math.max(0,Math.ceil(p*ms.length)-1)]):null;
 const statuses={};for(const s of samples)statuses[s.status]=(statuses[s.status]||0)+1;
 const errors=samples.filter(s=>!s.ok).length;
 return {requests:samples.length,errors,errorPercent:round(errors/Math.max(1,samples.length)*100),p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:ms.length?round(ms.at(-1)):null,bytes:samples.reduce((n,s)=>n+s.bytes,0),statuses};
}
function valid(path,json){
 if(path==='/api/activity')return typeof json?.activity?.serial==='string';
 return Array.isArray(json?.photos)&&Array.isArray(json?.blessings)&&typeof json?.lottery==='object';
}
export function validateOptions(options){
 const origin=new URL(options.url);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('URL must be HTTP(S), without credentials.');
 const profile=options.profile||'mahjong',stages=options.stages||[10,50,150],seconds=options.seconds??20,maxRequests=options.maxRequests??20000;
 if(!profiles[profile]||!Array.isArray(stages)||!stages.length||stages.length>5||stages.some(v=>!Number.isInteger(v)||v<1||v>300)||!Number.isFinite(seconds)||seconds<1||seconds>120||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>50000)throw Error('Invalid options: stages 1–300, seconds 1–120, maxRequests 1–50000.');
 const estimated=stages.reduce((sum,n)=>sum+n*profiles[profile].reduce((t,[,interval])=>t+Math.ceil(seconds*1000/interval),0),0)+profiles[profile].length;
 if(estimated>maxRequests)throw Error(`Estimated ${estimated} requests exceeds budget ${maxRequests}. Shorten the test.`);
 return {origin:origin.origin,profile,stages,seconds,maxRequests,estimated};
}
export async function runLoad(options){
 const c=validateOptions(options),samples=[],start=performance.now();let stopped='',timeouts=0;
 const fetcher=options.fetcher||fetch,log=options.log||console.log;
 const report={schema:1,startedAt:new Date().toISOString(),target:c.origin,profile:c.profile,authentication:options.tokens?.length?'synthetic test guests':'anonymous public GET only',options:{stages:c.stages,seconds:c.seconds,maxRequests:c.maxRequests,estimatedRequests:c.estimated},stages:[],preflight:[],limitations:['HTTP APIs only; no browser rendering, video, Wi-Fi, or photo bandwidth test.','Local measurements do not establish Cloudflare/D1/R2 capacity.','Polling cadence is nominal; slow requests do not overlap within one virtual-user endpoint.'],thresholds:{maxErrorPercent:1,maxP95Ms:1000}};
 let reserved=0,errorCount=0;
 async function request(path,user=0,preflight=false){
  if(stopped)return null;if(reserved>=c.maxRequests){stopped='request budget reached';return null}reserved++;
  const began=performance.now();let status='network',ok=false,bytes=0;
  try{
   const response=await fetcher(c.origin+path,{method:'GET',redirect:'error',headers:{accept:'application/json',...(options.tokens?.length?{authorization:'Bearer '+options.tokens[user%options.tokens.length]}:{})},signal:AbortSignal.timeout(10000)});
   status=response.status;const text=await response.text();bytes=Buffer.byteLength(text);
   if(response.ok){try{ok=valid(path,JSON.parse(text));if(!ok)status='invalid-json-shape'}catch{status='invalid-json'}}
   if(status===403||status===429)stopped=`HTTP ${status}: test halted`;
  }catch(e){status=e.name==='TimeoutError'||e.name==='AbortError'?'timeout':'network';if(status==='timeout'&&++timeouts>=3)stopped='three timeouts: test halted'}
  const sample={path,status,ok,bytes,ms:performance.now()-began};samples.push(sample);if(!ok)errorCount++;
  if(!preflight&&samples.length>=50&&errorCount/samples.length>.1)stopped='error rate above 10%: test halted';
  return sample;
 }
 for(const [path] of profiles[c.profile]){const sample=await request(path,0,true);if(sample)report.preflight.push({...sample,ms:round(sample.ms)});if(!sample?.ok){stopped||='preflight failed';break}}
 if(!stopped)for(const users of c.stages){
  log(`Stage: ${users} users, ${c.seconds}s, ${c.profile}`);
  const stageStart=performance.now(),from=samples.length,end=stageStart+c.seconds*1000;let missedPolls=0;
  await Promise.all(Array.from({length:users},(_,user)=>Promise.all(profiles[c.profile].map(async([path,interval])=>{
   // Stagger virtual users over 500ms; each endpoint keeps its own cadence.
   let due=stageStart+(user/users)*Math.min(500,c.seconds*100);
   while(!stopped&&due<end){await sleep(due-performance.now());if(stopped||performance.now()>=end)break;await request(path,user);due+=interval;
    while(due<performance.now()&&due<end){missedPolls++;due+=interval}
   }
  }))));
  if(!stopped)await sleep(end-performance.now());
  const elapsed=(performance.now()-stageStart)/1000,stageSamples=samples.slice(from),summary=summarize(stageSamples);
  const entry={users,elapsedSeconds:round(elapsed),...summary,requestsPerSecond:round(summary.requests/elapsed),missedPolls,endpoints:Object.fromEntries(profiles[c.profile].map(([path])=>[path,summarize(stageSamples.filter(s=>s.path===path))]))};
  entry.passed=!stopped&&summary.requests>0&&summary.errorPercent<=1&&summary.p95Ms<=1000&&missedPolls===0;
  report.stages.push(entry);log(JSON.stringify({users,requests:summary.requests,p95Ms:summary.p95Ms,errorPercent:summary.errorPercent,missedPolls,passed:entry.passed}));if(stopped||!entry.passed)break;
 }
 report.elapsedSeconds=round((performance.now()-start)/1000);report.summary=summarize(samples);report.stopReason=stopped||null;report.completed=!stopped&&report.stages.length===c.stages.length;report.passed=report.completed&&report.stages.every(s=>s.passed);
 if(options.out){await mkdir(dirname(resolve(options.out)),{recursive:true});await writeFile(options.out,JSON.stringify(report,null,2)+'\n')}
 return report;
}
async function main(){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||args[i+1]===undefined)throw Error('Arguments must be --name value');options[args[i].slice(2)]=args[i+1]}
 if(!options.url){console.log('Node 22.13+\nnode load-test.mjs --url https://YOUR-SITE --profile mahjong --stages 10,50,150 --seconds 20 --out results/mahjong.json\nProfiles: reception, wall, cat, mahjong, lotto. GET only, never writes wedding data.');return}
 for(const key of Object.keys(options))if(!['url','profile','stages','seconds','max-requests','out'].includes(key))throw Error('Unknown option '+key);
 const report=await runLoad({url:options.url,profile:options.profile,stages:options.stages?options.stages.split(',').map(Number):undefined,seconds:options.seconds===undefined?undefined:Number(options.seconds),maxRequests:options['max-requests']===undefined?undefined:Number(options['max-requests']),out:options.out||'load-test-result.json'});
 console.log(JSON.stringify({completed:report.completed,passed:report.passed,stopReason:report.stopReason,summary:report.summary},null,2));process.exitCode=report.passed?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1});
