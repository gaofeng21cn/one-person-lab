import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startCordisWorkbenchServicesHost } from '../../dist/host/plugins/workbench-services/index.js';
import test from 'node:test';
test('Temporal skips overlap and interrupts timed-out Codex execution', { skip: !process.env.OPL_TEST_TEMPORAL_ADDRESS, timeout: 100_000 }, async () => {
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.OPL_TEST_TEMPORAL_ADDRESS)) throw Error('Use an isolated loopback Temporal server.');
const root = await realpath(await mkdtemp(`${tmpdir()}/opl-timeout-`));
let starts = 0; let interrupts = 0;
const host = await startCordisWorkbenchServicesHost({ env: { ...process.env, CODEX_HOME:root, OPL_STATE_DIR:root, OPL_TEMPORAL_ADDRESS:process.env.OPL_TEST_TEMPORAL_ADDRESS, OPL_TEMPORAL_NAMESPACE:'default' }, executor: {
 createThread: async () => ({threadId:'timeout-thread'}),
 startTask: async () => {starts++;return {threadId:'timeout-thread',turnId:'timeout-turn'};},
 readTask: async ref => ({...ref,status:'inProgress'}),
 interruptTask: async () => {interrupts++;},
}});
async function act(op,input) {const r={package_id:'opl-workbench-services',ref:`workbench#${op}`,input};const p=await host.execute(r);return host.execute({...r,dryRun:false,confirmed:true,confirmationId:p.confirmationId});}
try {
 const task={id:'timeout',title:'Timeout fixture',prompt:'fake only',cwd:root,permissions:':workspace',timeoutMinutes:1,schedule:{kind:'daily',time:'08:00',timeZone:'UTC'}};
 await act('task_create',task);
 await act('task_run',{id:'timeout',revision:1});
 await new Promise(r=>setTimeout(r,1200));
 await act('task_run',{id:'timeout',revision:1});
 await new Promise(r=>setTimeout(r,1200));
 assert.equal(starts,1,'overlap must not start another turn');
 console.log('OVERLAP_PASS');
 let found;
 const deadline=Date.now()+75000;
 while(Date.now()<deadline) {const history=await host.read({package_id:'opl-workbench-services',ref:'workbench#history'});found=history.items.find(x=>x.result?.status==='timed_out'); if(found)break; await new Promise(r=>setTimeout(r,1000));}
 assert.ok(found);assert.equal(interrupts,1);assert.equal(starts,1);
 console.log(JSON.stringify({status:'passed',checks:['overlap-skip','one-minute-timeout','canonical-interrupt'],result:found.result}));
 await act('task_delete',{id:'timeout',revision:1});
} finally {await host.dispose();await rm(root,{recursive:true,force:true});}

});

test('Temporal failure is local and does not block memory or cleanup reads', { timeout: 15000 }, async () => {
  const root = await realpath(await mkdtemp(`${tmpdir()}/opl-unavailable-`));
  const host = await startCordisWorkbenchServicesHost({ env: { ...process.env, CODEX_HOME: root, OPL_STATE_DIR: root, OPL_TEMPORAL_ADDRESS: '127.0.0.1:1' }, executor: {
    createThread: async () => { throw Error('must not execute'); }, startTask: async () => { throw Error('must not execute'); },
    readTask: async () => { throw Error('must not execute'); }, interruptTask: async () => {},
  } });
  try {
    const memory = await host.read({package_id:'opl-workbench-services',ref:'workbench#memory'});
    assert.equal(memory.status, 'available');
    await assert.rejects(host.read({package_id:'opl-workbench-services',ref:'workbench#tasks'}), /Temporal/);
    assert.equal(host.appStatePatch().workbench_services.tasks.status, 'not_configured');
    const inventory = await host.read({package_id:'opl-workbench-services',ref:'workbench#inventory'});
    assert.equal(inventory.status, 'available');
    await assert.rejects(host.execute({package_id:'opl-workbench-services',ref:'workbench#unsupported'}), /Unknown/);
  } finally { await host.dispose(); await rm(root,{recursive:true,force:true}); }
});
