import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {installTemporalCli} from '../../src/adapters/execution/managed-temporal-cli.mjs';

test('a corrupt upstream archive cannot create a runnable managed CLI',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-corrupt-'));
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',run:((cmd: string,args: readonly string[])=>{assert.equal(cmd,'curl');fs.writeFileSync(args[args.indexOf('--output')+1],'corrupt');}) as typeof execFileSync}),/digest mismatch/);assert.equal(fs.existsSync(path.join(home,'.local/bin/temporal')),false);assert.deepEqual(fs.readdirSync(path.join(home,'.local/bin')),[]);}finally{fs.rmSync(home,{recursive:true,force:true})}
});
test('an existing user-owned binary is reused without network access',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-owner-'));const binary=path.join(home,'temporal');fs.writeFileSync(binary,'user owned',{mode:0o755});
 try{assert.equal(installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:home,run:()=>{throw Error('network must not run')}}).status,'reused');assert.equal(fs.readFileSync(binary,'utf8'),'user owned');}finally{fs.rmSync(home,{recursive:true,force:true})}
});
test('a dangling user symlink is retained and blocks installation',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'opl-temporal-link-'));fs.mkdirSync(path.join(home,'.local/bin'),{recursive:true});const binary=path.join(home,'.local/bin/temporal');fs.symlinkSync('missing-owner',binary);
 try{assert.throws(()=>installTemporalCli({homeDir:home,platform:'linux',arch:'x64',searchPath:'',run:()=>{throw Error('network must not run')}}),/preserve/);assert.equal(fs.readlinkSync(binary),'missing-owner');}finally{fs.rmSync(home,{recursive:true,force:true})}
});
