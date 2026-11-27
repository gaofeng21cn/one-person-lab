import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { verifyReleaseLock } from '@opl/pack';
import { createDaemonSandbox, writeMinimalV2Package } from './helpers/sandbox.ts';

function extension(root: string, id: string, code: string) {
  const dir = writeMinimalV2Package(path.join(root, id), {
    id,
    intent: 'extension',
    extraManifest: {
      provides: { cli_extensions: [{
        namespace: 'example',
        entrypoint: { kind: 'esm_module', module: './cli.mjs', export: 'register' },
      }] },
    },
  });
  fs.writeFileSync(path.join(dir, 'cli.mjs'), code);
  return dir;
}

const validExtension = `
  export function register() {
    return { namespace: 'example', commands: ['ping'], handlers: { ping: () => ({ revision: 'original' }) } };
  }
`;

test('a failed replacement probe preserves the installed release, files and CLI command', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const { runtime } = await sb.startInProcess();
  const id = 'replaceable-cli';
  const original = extension(path.join(sb.root, 'original'), id, validExtension);
  const broken = extension(path.join(sb.root, 'candidate'), id, 'throw new Error("broken candidate");');
  const source = (dir: string) => ({ kind: 'local_dir' as const, path: dir });
  const first = await runtime.installPackage({ source: source(original), syncCodex: false });
  const installed = first.package;
  const originalSource = runtime.packService.store.getInstallSource(id);
  for (const replace of [
    () => runtime.installPackage({ source: source(broken), syncCodex: false }),
    () => runtime.packService.update({ packageId: id, source: source(broken), syncCodex: false }),
  ]) {
    await assert.rejects(replace, /broken candidate/);
    assert.deepEqual(runtime.packService.inspect(id), installed);
    assert.deepEqual(runtime.packService.store.getInstallSource(id), originalSource);
    assert.equal(verifyReleaseLock(installed.install_path).digest, installed.content_digest);
  }
  const cli = await sb.spawnCli(['example', 'ping', '--json']);
  assert.equal(cli.code, 0, cli.stderr + cli.stdout);
  assert.deepEqual(cli.json, { revision: 'original' });
});

test('simultaneous registrations cannot claim the same CLI namespace', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const { runtime } = await sb.startInProcess();
  const probe = `import fs from 'node:fs';
    fs.writeFileSync(new URL('./probe.cache', import.meta.url), 'transient');
    ${validExtension}`;
  const add = (id: string) => runtime.installPackage({
    source: { kind: 'local_dir', path: extension(sb.root, id, probe) },
    syncCodex: false,
  });
  const results = await Promise.allSettled([add('first-cli'), add('second-cli')]);
  assert.deepEqual(results.map(item => item.status).sort(), ['fulfilled', 'rejected']);
  assert.match(String(results.find(item => item.status === 'rejected')?.reason), /collides with already-installed package/);
  const installed = runtime.packService.list();
  assert.equal(installed.length, 1);
  assert.equal(fs.existsSync(path.join(installed[0]!.install_path, 'probe.cache')), false);
  assert.equal(verifyReleaseLock(installed[0]!.install_path).digest, installed[0]!.content_digest);
});
