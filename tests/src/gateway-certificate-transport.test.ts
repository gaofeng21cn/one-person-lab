import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gatewayFetch } from '../../src/adapters/integration/opl-gateway-account-parts/certificate-transport.ts';

const certificateFailure = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }); };
test('Gateway TLS fallback keeps verification and confines credentials to the private stdin pipe', async () => {
 let stdin='', argv: string[]=[];
 const child=Object.assign(new EventEmitter(), {stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true});
 child.stdin.on('data',chunk=>stdin+=chunk);child.stdin.on('finish',()=>{child.stdout.end('{"ok":true}\nOPL_GATEWAY_HTTP_STATUS:200');child.emit('close',0);});
 const response=await gatewayFetch('https://gateway.example/auth/login',{method:'POST',headers:{Authorization:'Bearer fixture-token'},body:JSON.stringify({password:'fixture-password'})}, {
  fetchImpl:certificateFailure,spawnImpl:((_command: string, args: readonly string[] | undefined, options: import('node:child_process').SpawnOptions | undefined)=>{argv=args as string[];assert.equal(options?.shell,false);return child;}) as unknown as typeof import('node:child_process').spawn,
 });
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
 assert.ok(argv.includes('--disable'));assert.ok(argv.includes('--http2'));assert.ok(argv.includes('--config'));
 assert.equal(argv.some(value=>/fixture-|insecure/.test(value)),false);assert.match(stdin,/fixture-token/);assert.match(stdin,/fixture-password/);
});
test('Gateway TLS fallback leaves successful fetches and other failures on the original path', async () => {
 let called=false;const spawnImpl=(()=>{called=true;throw Error('unexpected fallback')}) as unknown as typeof import('node:child_process').spawn;
 assert.equal((await gatewayFetch('https://gateway.example',{}, {fetchImpl:async()=>new Response('ok'),spawnImpl})).status,200);
 await assert.rejects(gatewayFetch('https://gateway.example',{}, {fetchImpl:async()=>{throw new TypeError('ordinary network failure')},spawnImpl}),/ordinary network failure/);
 await assert.rejects(gatewayFetch('http://127.0.0.1',{}, {fetchImpl:certificateFailure,spawnImpl}),/fetch failed/);assert.equal(called,false);
});
test('Gateway system transport preserves response limits and cancellation classification', async () => {
 const fixture=()=>Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true});
 const oversized=fixture();oversized.stdin.on('finish',()=>oversized.stdout.write('x'.repeat(256)));
 await assert.rejects(gatewayFetch('https://gateway.example',{}, {fetchImpl:certificateFailure,maxBytes:4,spawnImpl:(()=>oversized) as unknown as typeof import('node:child_process').spawn}),{code:'response_body_too_large'});
 const aborted=fixture(),controller=new AbortController();aborted.stdin.on('finish',()=>{controller.abort();aborted.emit('error',new Error('private detail'));});
 await assert.rejects(gatewayFetch('https://gateway.example',{signal:controller.signal},{fetchImpl:certificateFailure,spawnImpl:(()=>aborted) as unknown as typeof import('node:child_process').spawn}),{name:'AbortError'});
});
