import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { admitFoundrySourceMaterials, materializeFoundrySourceArtifacts } from '../../src/adapters/execution/foundry-source-material.ts';
import { FileFoundryContentStore } from '../../src/authority/evidence/index.ts';

function fixture(t: test.TestContext) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-source-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, 'workspace');
  const storageRoot = path.join(root, 'state');
  const transportRoot = path.join(root, 'work-item');
  fs.mkdirSync(transportRoot);
  fs.mkdirSync(path.join(workspaceRoot, 'control/opl/source_materials'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'shared/sources'), { recursive: true });
  const bytes = Buffer.from('Source evidence body.\n');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const ref = `source-material:sha256:${digest}`;
  const body = path.join(workspaceRoot, 'shared/sources/evidence.txt');
  fs.writeFileSync(body, bytes);
  const receipt = {
    surface_kind: 'opl_workspace_source_material_receipt',
    version: 'workspace-source-material.v3',
    source_material_ref: ref,
    source_fingerprint_ref: `sha256:${digest}`,
    stored_file: { ref: 'shared/sources/evidence.txt', copied: true },
    original_file: { sha256: digest, bytes: bytes.length },
  };
  const receiptFile = path.join(workspaceRoot, `control/opl/source_materials/${digest}.json`);
  const writeReceipt = () => fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  writeReceipt();
  return { root, workspaceRoot, storageRoot, transportRoot, sourceRefs: [ref], bytes, digest, ref, body, receipt, writeReceipt };
}

test('Foundry transports exact admitted source bytes without a second binding registry', (t) => {
  const input = fixture(t);
  admitFoundrySourceMaterials(input);
  const artifacts = materializeFoundrySourceArtifacts(input);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]!.source_ref, input.ref);
  assert.equal(artifacts[0]!.sha256, input.digest);
  assert.deepEqual(fs.readFileSync(new URL(artifacts[0]!.ref)), input.bytes);
  assert.deepEqual(materializeFoundrySourceArtifacts(input), artifacts);
  assert.deepEqual(materializeFoundrySourceArtifacts({
    ...input, sourceRefs: [`opl-content://sha256/${input.digest}`],
  }).map(({ ref, sha256 }) => ({ ref, sha256 })), artifacts.map(({ ref, sha256 }) => ({ ref, sha256 })));
  assert.equal(fs.existsSync(path.join(input.storageRoot, 'source-material-bindings')), false);
});

for (const mutation of ['body', 'size', 'identity', 'dry-run', 'traversal', 'symlink'] as const) {
  test(`Foundry source admission rejects ${mutation} before provider launch`, (t) => {
    const input = fixture(t);
    switch (mutation) {
      case 'body': fs.writeFileSync(input.body, Buffer.alloc(input.bytes.length)); break;
      case 'size': input.receipt.original_file.bytes++; break;
      case 'identity': input.receipt.source_material_ref = `source-material:sha256:${'0'.repeat(64)}`; break;
      case 'dry-run': input.receipt.stored_file.copied = false; break;
      case 'traversal':
        fs.writeFileSync(path.join(input.root, 'outside.txt'), input.bytes);
        input.receipt.stored_file.ref = '../outside.txt';
        break;
      case 'symlink':
        fs.mkdirSync(path.join(input.root, 'outside'));
        fs.writeFileSync(path.join(input.root, 'outside/evidence.txt'), input.bytes);
        fs.symlinkSync(path.join(input.root, 'outside'), path.join(input.workspaceRoot, 'linked'));
        input.receipt.stored_file.ref = 'linked/evidence.txt';
        break;
    }
    input.writeReceipt();
    assert.throws(() => admitFoundrySourceMaterials(input));
    assert.equal(new FileFoundryContentStore(input.storageRoot).has(`opl-content://sha256/${input.digest}`), false);
  });
}

test('Foundry fails closed for absent or modified source content and conflicting transport bytes', (t) => {
  const input = fixture(t);
  assert.throws(() => materializeFoundrySourceArtifacts(input), /not available/);
  admitFoundrySourceMaterials(input);
  const [artifact] = materializeFoundrySourceArtifacts(input);
  fs.writeFileSync(new URL(artifact!.ref), 'conflicting transport bytes');
  assert.throws(() => materializeFoundrySourceArtifacts(input), /invalid bytes/);
  assert.throws(() => materializeFoundrySourceArtifacts({ ...input, sourceRefs: ['source-material:invalid'] }), /ref is invalid/);
});

test('Concurrent source transport admits only an identical content-address winner', (t) => {
  const input = fixture(t);
  admitFoundrySourceMaterials(input);
  const target = path.join(input.transportRoot, 'provider-inputs', `${input.digest}.blob`);
  const existsSync = fs.existsSync;
  t.mock.method(fs, 'existsSync', (file: fs.PathLike) => {
    if (file === target && !existsSync(file)) {
      fs.writeFileSync(file, input.bytes, { flag: 'wx' });
      return false;
    }
    return existsSync(file);
  });
  assert.deepEqual(fs.readFileSync(new URL(materializeFoundrySourceArtifacts(input)[0]!.ref)), input.bytes);
});


test('Foundry CAS bytes are transported separately for each work item', (t) => {
  const input = fixture(t);
  admitFoundrySourceMaterials(input);
  const first = materializeFoundrySourceArtifacts(input);
  const secondRoot = path.join(input.root, 'another-work-item');
  fs.mkdirSync(secondRoot);
  const second = materializeFoundrySourceArtifacts({ ...input, transportRoot: secondRoot });
  assert.notEqual(first[0]!.ref, second[0]!.ref);
  assert.equal(first[0]!.sha256, second[0]!.sha256);
  assert.deepEqual(fs.readFileSync(new URL(second[0]!.ref)), input.bytes);
  assert.equal(fs.existsSync(path.join(input.storageRoot, 'provider-inputs')), false);
});

for (const location of ['root', 'directory', 'file'] as const) {
  test(`Foundry source transport rejects a symlink at ${location}`, (t) => {
    const input = fixture(t);
    admitFoundrySourceMaterials(input);
    const outside = path.join(input.root, 'outside');
    fs.mkdirSync(outside);
    if (location === 'root') {
      fs.rmdirSync(input.transportRoot);
      fs.symlinkSync(outside, input.transportRoot);
    } else if (location === 'directory') {
      fs.symlinkSync(outside, path.join(input.transportRoot, 'provider-inputs'));
    } else {
      fs.mkdirSync(path.join(input.transportRoot, 'provider-inputs'));
      fs.writeFileSync(path.join(outside, 'body'), input.bytes);
      fs.symlinkSync(path.join(outside, 'body'), path.join(input.transportRoot, 'provider-inputs', `${input.digest}.blob`));
    }
    assert.throws(() => materializeFoundrySourceArtifacts(input), /physical|invalid bytes/);
    assert.deepEqual(fs.readdirSync(outside), location === 'file' ? ['body'] : []);
  });
}
