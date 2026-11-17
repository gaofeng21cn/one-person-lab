import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {installTemporalCli, managedTemporalCliPath} from '../../src/adapters/execution/managed-temporal-cli.mjs';

// Every case pins the release it installs. Resolving `temporal-cli` from the
// release index reaches api.github.com, which is rate limited for unauthenticated
// CI callers: an archive test that resolves first fails with an HTTP 403 instead
// of the digest or preservation behaviour it is meant to prove.
const PINNED_RELEASE = {
  dependency_id: 'temporal-cli',
  version: '1.2.3',
  source_ref: 'v1.2.3',
  archive_url: 'https://example.invalid/temporal_cli_1.2.3_linux_amd64.tar.gz',
  archive_sha256: '0'.repeat(64),
  platform: 'linux',
  architecture: 'x64',
  install_metadata: {},
} as const;

const noNetwork = () => { throw new Error('network must not run'); };

test('a corrupt upstream archive cannot create a runnable managed CLI',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-corrupt-'));
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',target:PINNED_RELEASE as never,run:((cmd: string,args: readonly string[])=>{assert.equal(cmd,'curl');fs.writeFileSync(args[args.indexOf('--output')+1],'corrupt');}) as typeof execFileSync}),/digest mismatch/);assert.equal(fs.existsSync(path.join(home,'.local/bin/temporal')),false);assert.deepEqual(fs.readdirSync(path.join(home,'.local/bin')),[]);}finally{fs.rmSync(home,{recursive:true,force:true})}
});
test('an existing user-owned binary is reused without network access',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-owner-'));const binary=path.join(home,'temporal');fs.writeFileSync(binary,'user owned',{mode:0o755});
 try{assert.equal(installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:home,target:PINNED_RELEASE as never,run:noNetwork}).status,'reused');assert.equal(fs.readFileSync(binary,'utf8'),'user owned');}finally{fs.rmSync(home,{recursive:true,force:true})}
});
test('a dangling user symlink is retained and blocks installation',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-link-'));fs.mkdirSync(path.join(home,'.local/bin'),{recursive:true});const binary=path.join(home,'.local/bin/temporal');fs.symlinkSync('missing-owner',binary);
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',target:PINNED_RELEASE as never,run:noNetwork}),/preserve/);assert.equal(fs.readlinkSync(binary),'missing-owner');}finally{fs.rmSync(home,{recursive:true,force:true})}
});
// The two cases below reach the same guard from states the reuse scan never
// inspected: `~/.local/bin/temporal` is simultaneously the reuse source and the
// destination when no managed root is configured, and an interrupted download
// leaves a plain non-executable file rather than a symlink.
test('an interrupted download at the user path is preserved instead of replaced',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-partial-'));fs.mkdirSync(path.join(home,'.local/bin'),{recursive:true});const binary=path.join(home,'.local/bin/temporal');fs.writeFileSync(binary,'partial download',{mode:0o644});
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',target:PINNED_RELEASE as never,run:noNetwork}),/preserve/);assert.equal(fs.readFileSync(binary,'utf8'),'partial download');}finally{fs.rmSync(home,{recursive:true,force:true})}
});
test('a dangling user symlink blocks installation even when external reuse is disabled',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-link-noreuse-'));fs.mkdirSync(path.join(home,'.local/bin'),{recursive:true});const binary=path.join(home,'.local/bin/temporal');fs.symlinkSync('missing-owner',binary);
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',reuseExternal:false,target:PINNED_RELEASE as never,run:noNetwork}),/preserve/);assert.equal(fs.readlinkSync(binary),'missing-owner');}finally{fs.rmSync(home,{recursive:true,force:true})}
});

for (const reuseExternal of [true, false]) {
 test(`an independent managed CLI remains ready with a broken user CLI (reuse=${reuseExternal})`,()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-managed-owner-'));
  const root=path.join(home,'managed-state');
  const userBinary=path.join(home,'.local/bin/temporal');
  const managed=managedTemporalCliPath(root);
  fs.mkdirSync(path.dirname(userBinary),{recursive:true});
  fs.symlinkSync('missing-owner',userBinary);
  fs.mkdirSync(path.dirname(managed),{recursive:true});
  fs.writeFileSync(managed,'managed bytes',{mode:0o755});
  try {
   const result=installTemporalCli({homeDir:home,root,platform:'linux',arch:'x64',searchPath:'',reuseExternal,
    target:PINNED_RELEASE as never,
    run:((command: string,args: readonly string[])=>{
     assert.equal(command,managed);assert.deepEqual(args,['--version']);return Buffer.from('temporal version 1.2.3');
    }) as typeof execFileSync});
   assert.equal(result.status,'ready');assert.equal(result.path,managed);
   assert.equal(fs.readFileSync(managed,'utf8'),'managed bytes');
   assert.equal(fs.readlinkSync(userBinary),'missing-owner');
  } finally {fs.rmSync(home,{recursive:true,force:true});}
 });
}
