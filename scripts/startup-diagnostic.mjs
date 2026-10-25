// One bounded, anonymous startup burst. Records timing and status, never response bodies.
import {performance} from 'node:perf_hooks';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {summarize} from './load-test.mjs';

const [origin, usersText, out] = process.argv.slice(2);
const users = Number(usersText);
if (!origin || !Number.isInteger(users) || users < 1 || users > 50 || !out) {
  throw Error('Usage: node scripts/startup-diagnostic.mjs HTTPS_ORIGIN USERS(1-50) OUTPUT_JSON');
}
const target = new URL(origin);
if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
  throw Error('Use a credential-free HTTPS origin');
}
const paths = ['/api/activity', '/api/state'];
async function request(path) {
  const began = performance.now();
  let status = 'network', ok = false, bytes = 0;
  try {
    const response = await fetch(target.origin + path, {method:'GET', redirect:'error', headers:{accept:'application/json'}, signal:AbortSignal.timeout(10000)});
    status = response.status;
    const body = await response.text();
    bytes = Buffer.byteLength(body);
    if (response.ok) {
      try {
        const json = JSON.parse(body);
        ok = path === '/api/activity' ? typeof json?.activity?.serial === 'string' : Array.isArray(json?.photos) && Array.isArray(json?.blessings);
        if (!ok) status = 'invalid-json-shape';
      } catch { status = 'invalid-json'; }
    }
  } catch (error) { status = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'network'; }
  return {path, status, ok, bytes, ms:performance.now()-began};
}
const startedAt = new Date().toISOString();
const samples = await Promise.all(Array.from({length:users}, () => paths.map(request)).flat());
const report = {startedAt, target:target.origin, users, authentication:'anonymous public GET only', summary:summarize(samples), endpoints:Object.fromEntries(paths.map(path => [path, summarize(samples.filter(sample => sample.path === path))]))};
await mkdir(dirname(resolve(out)), {recursive:true});
await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
