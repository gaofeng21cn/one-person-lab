import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  captureWorkItemRootIdentity, readStableWorkItemFile, reattestWorkItemRootIdentity,
  type WorkItemRootIdentity, WorkItemFileBoundaryError,
} from '../../src/authority/workspace/work-item-file-boundary.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const macOS = { skip: process.platform !== 'darwin' };

function withFixture(invoke: (value: {
  root: string; item: string; file: string; current: WorkItemRootIdentity; original: WorkItemRootIdentity;
}) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-root-reattest-'));
  const item = path.join(root, 'items', 'one');
  fs.mkdirSync(item, { recursive: true });
  const file = path.join(item, 'artifact.txt');
  fs.writeFileSync(file, 'accepted bytes\n');
  const current = captureWorkItemRootIdentity({ workspaceRoot: root, canonicalWorkItemRoot: item });
  const original: WorkItemRootIdentity = {
    surface_kind: 'opl_work_item_root_identity', version: 'opl-work-item-root-identity.v1',
    workspace_inode: current.workspace_inode, work_item_inode: current.work_item_inode,
    workspace_device: String(BigInt(current.workspace_device) + 1n),
    work_item_device: String(BigInt(current.work_item_device) + 1n),
  };
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try { invoke({ root, item, file, current, original }); }
  finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('legacy root requires explicit confirmation and exact observed identity; receipt is immutable and shared with reads', macOS, () => {
  withFixture(({ root, item, file, current, original }) => {
    const input = { workspaceRoot: root, canonicalWorkItemRoot: item, expectedRootIdentity: original };
    const read = () => readStableWorkItemFile({ ...input, filePath: file, ref: file });
    assert.throws(read, WorkItemFileBoundaryError);
    const preview = reattestWorkItemRootIdentity(input);
    assert.equal(preview.status, 'preview');
    assert.equal(preview.receipt_written, false);
    assert.equal(fs.existsSync(preview.receipt_ref as string), false);
    const apply = { ...input, apply: true, expectedCurrentRootIdentity: current,
      operator: 'synthetic-test-operator', evidenceRef: 'fixture:controlled-synthetic-device-drift' };
    assert.throws(() => reattestWorkItemRootIdentity(apply), /explicit.*confirmation/);
    assert.throws(() => reattestWorkItemRootIdentity({ ...apply, confirm: true,
      expectedCurrentRootIdentity: { ...current, boot_uuid: '11111111-1111-4111-8111-111111111111' } }), /changed since operator inspection/);
    assert.throws(() => reattestWorkItemRootIdentity({ ...apply, confirm: true,
      expectedRootIdentity: { ...original, work_item_inode: '1' } }), /unchanged inodes/);
    const accepted = reattestWorkItemRootIdentity({ ...apply, confirm: true });
    const receiptPath = accepted.receipt_ref as string;
    const receiptBytes = fs.readFileSync(receiptPath);
    const artifactBytes = fs.readFileSync(file);
    const observed = read();
    assert.deepEqual(observed.root_identity_continuation?.expected, original);
    assert.deepEqual(observed.root_identity_continuation?.observed, current);
    assert.equal(observed.root_identity_continuation?.reattestation_ref, receiptPath);
    assert.equal(reattestWorkItemRootIdentity({ ...apply, confirm: true,
      evidenceRef: 'fixture:retry-cannot-rewrite' }).receipt_written, false);
    assert.deepEqual(fs.readFileSync(receiptPath), receiptBytes);
    assert.deepEqual(fs.readFileSync(file), artifactBytes);
    const receipt = JSON.parse(receiptBytes.toString());
    receipt.binding.current_root_identity.boot_uuid = '11111111-1111-4111-8111-111111111111';
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    assert.throws(read, /current boot/);
    fs.writeFileSync(receiptPath, receiptBytes);
    fs.renameSync(item, `${item}-original`);
    fs.cpSync(`${item}-original`, item, { recursive: true });
    assert.throws(read, WorkItemFileBoundaryError);
  });
});

test('public CLI previews and applies only with external confirmation flags; no history is rewritten', macOS, () => {
  withFixture(({ root, item, file, current, original }) => {
    const requestPath = path.join(root, 'request.json');
    fs.writeFileSync(requestPath, JSON.stringify({ workspace_root: root, canonical_work_item_root: item,
      original_root_identity: original, current_root_identity: current,
      operator: 'synthetic-cli-test', evidence_ref: 'fixture:synthetic-cli-device-drift' }));
    const history = fs.readFileSync(requestPath);
    const args = ['--conditions=opl-source', '--experimental-strip-types', path.join(repoRoot, 'src/entrypoints/cli.ts'),
      'workspace', 'root', 'reattest', '--input', requestPath, '--json'];
    const invoke = (...flags: string[]) => JSON.parse(execFileSync(process.execPath, [...args, ...flags], {
      cwd: repoRoot, encoding: 'utf8', env: process.env,
    }));
    const preview = invoke();
    assert.equal(preview.status, 'preview');
    const rejected = spawnSync(process.execPath, [...args, '--apply'], { cwd: repoRoot, encoding: 'utf8', env: process.env });
    assert.notEqual(rejected.status, 0);
    assert.equal(fs.existsSync(preview.receipt_ref), false);
    const result = invoke('--apply', '--confirm-same-volume-and-directory');
    assert.equal(result.status, 'accepted');
    assert.equal(readStableWorkItemFile({ workspaceRoot: root, canonicalWorkItemRoot: item,
      expectedRootIdentity: original, filePath: file, ref: file }).byte_size, fs.statSync(file).size);
    assert.deepEqual(fs.readFileSync(requestPath), history);
  });
});
