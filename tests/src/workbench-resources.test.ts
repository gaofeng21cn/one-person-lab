import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, mkdir, writeFile, readFile, symlink, utimes, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkbenchResources } from '../../src/host/plugins/workbench-services/resources.ts';

test('memory reads existing content, corrects via notes only, and detects stale edits and symlink escapes', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-memory-test-')));
  try {
    await mkdir(path.join(root, 'memories')); await writeFile(path.join(root, 'memories', 'MEMORY.md'), 'Canonical memory');
    const resources = new WorkbenchResources(path.join(root, 'memories'), []);
    const list = await resources.memoryList(); const id = list.items[0].id;
    assert.equal((await resources.memoryRead(id)).content, 'Canonical memory');
    await assert.rejects(resources.memoryNote({ id, revision: list.items[0].revision, content: 'overwrite' }, false, false), /read-only/);
    await resources.memoryCorrect({ source_id: id, content: 'Correction' }, true);
    assert.equal((await resources.memoryList()).items.length, 1);
    await resources.memoryCorrect({ source_id: id, content: 'Correction' }, false);
    const note = (await resources.memoryList()).items.find(x => x.editable)!;
    const a = resources.memoryNote({ id: note.id, revision: note.revision, content: 'First edit' }, false, false);
    const b = resources.memoryNote({ id: note.id, revision: note.revision, content: 'Stale edit' }, false, false);
    const result = await Promise.allSettled([a, b]); assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected');
    assert.equal(await readFile(path.join(root, 'memories', 'MEMORY.md'), 'utf8'), 'Canonical memory');
    await writeFile(path.join(root, 'private.md'), 'outside');
    await symlink(path.join(root, 'private.md'), path.join(root, 'memories', 'outside.md'));
    assert.equal((await resources.memoryList()).items.some(x => x.name === 'outside.md'), false);
    await assert.rejects(resources.memoryRead(`memory:${Buffer.from('outside.md').toString('base64url')}`), /Symbolic/);
    await assert.rejects(resources.memoryRead(`memory:${Buffer.from('../private.md').toString('base64url')}`), /Invalid/);
    const updated = await resources.memoryRead(note.id);
    await resources.memoryNote({ id: note.id, revision: updated.revision }, true, false);
    assert.equal((await resources.memoryList()).items.filter(x => x.editable).length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cleanup only removes exact old inventory after preview/confirm, detects changes, and excludes symlinks', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-cleanup-test-')));
  try {
    const log = path.join(root, 'log'); await mkdir(log);
    await writeFile(path.join(log, 'old.log'), 'old'); await utimes(path.join(log, 'old.log'), new Date(0), new Date(0));
    await writeFile(path.join(log, 'active.log'), 'active'); await writeFile(path.join(root, 'source.txt'), 'keep');
    await symlink(path.join(root, 'source.txt'), path.join(log, 'link.log'));
    const receiptRoot = path.join(root, 'receipts');
    const resources = new WorkbenchResources(path.join(root, 'memories'), [{ id: 'logs', owner: 'fixture', path: log, cleanupMode: 'inactive_owner_files' }], [], receiptRoot);
    const inventory = await resources.inventory();
    assert.equal(inventory.schema, 'opl_local_data_lifecycle_inventory.v1');
    assert.equal(typeof inventory.observed_at, 'string');
    assert.equal(typeof inventory.scan_duration_ms, 'number');
    assert.equal(inventory.categories[0].files.length, 1);
    assert.equal(inventory.categories[0].retainedBytes, 6);
    assert.equal(inventory.reclaimable_bytes, 3);
    assert.equal(inventory.user_summary.user_goal, 'release_space');
    assert.equal(inventory.user_summary.next_action, 'preview_cleanup');
    assert.equal(inventory.user_summary.expected_after_bytes, 6);
    assert.equal(inventory.categories[0].safety, 'safe_after_preview');
    assert.equal(inventory.categories[0].recoverability, 'not_restorable');
    const id = inventory.categories[0].files[0].id;
    const preview = await resources.cleanupPreview([id]);
    assert.equal(typeof preview.plan_id, 'string');
    assert.equal(typeof preview.plan_hash, 'string');
    assert.equal(preview.selected_bytes, 3);
    assert.equal(preview.restore_supported, false);
    assert.equal(preview.user_goal, 'release_space');
    assert.equal(preview.expected_state.released_bytes, 3);
    assert.equal(preview.expected_state.retained_bytes, 6);
    await assert.rejects(resources.cleanupExecute(preview.token, false), /confirmation/);
    await writeFile(path.join(log, 'old.log'), 'changed');
    await assert.rejects(resources.cleanupExecute(preview.token, true), /changed/);
    await utimes(path.join(log, 'old.log'), new Date(0), new Date(0));
    const current = await resources.cleanupPreview([id]);
    const result = await resources.cleanupExecute(current.token, true);
    assert.equal(result.status, 'executed');
    assert.equal(typeof result.receipt_ref, 'string');
    assert.equal(result.expected_state.readback, 'confirmed');
    assert.equal(result.terminal_readback.inventory_status, 'confirmed');
    assert.equal(result.terminal_readback.inventory.reclaimable_bytes, 0);
    const receiptName = `${String(result.receipt_ref).split(':').at(-1)}.json`;
    const receipt = JSON.parse(await readFile(path.join(receiptRoot, receiptName), 'utf8'));
    assert.equal(receipt.removed_count, 1);
    await assert.rejects(access(path.join(log, 'old.log')));
    assert.equal(await readFile(path.join(log, 'active.log'), 'utf8'), 'active');
    assert.equal(await readFile(path.join(root, 'source.txt'), 'utf8'), 'keep');
    await assert.rejects(resources.cleanupExecute(current.token, true), /confirmation/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cache roots are reclaimable while runtime roots remain read-only', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-cache-test-')));
  try {
    const cache = path.join(root, 'cache'); const runtime = path.join(root, 'runtime');
    await mkdir(cache); await mkdir(runtime);
    await writeFile(path.join(cache, 'stale.bin'), 'stale'); await utimes(path.join(cache, 'stale.bin'), new Date(0), new Date(0));
    await writeFile(path.join(runtime, 'toolchain.bin'), 'runtime');
    const resources = new WorkbenchResources(path.join(root, 'memories'), [
      { id: 'app_cache', owner: 'App', path: cache, cleanupMode: 'stale_cache_files' },
    ], [
      { id: 'runtime_substrate', owner: 'Framework runtime', path: runtime },
    ]);
    const inventory = await resources.inventory();
    assert.equal(inventory.categories[0].id, 'app_cache');
    assert.equal(inventory.categories[0].cleanupMode, 'stale_cache_files');
    assert.equal(inventory.categories[0].reclaimableBytes, 5);
    assert.equal(inventory.protectedCategories[0].id, 'runtime_substrate');
    assert.equal(inventory.protectedCategories[0].cleanupAllowed, false);
    await assert.rejects(resources.cleanupPreview(['runtime_substrate:toolchain.bin']));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('partial cleanup preview counts unselected candidates as retained', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-partial-cleanup-test-')));
  try {
    const cache = path.join(root, 'cache'); await mkdir(cache);
    await writeFile(path.join(cache, 'one.bin'), 'one'); await writeFile(path.join(cache, 'two.bin'), 'two-two');
    await utimes(path.join(cache, 'one.bin'), new Date(0), new Date(0)); await utimes(path.join(cache, 'two.bin'), new Date(0), new Date(0));
    const resources = new WorkbenchResources(path.join(root, 'memories'), [{ id: 'cache', owner: 'App', path: cache, cleanupMode: 'stale_cache_files' }]);
    const inventory = await resources.inventory();
    const one = inventory.categories[0].files.find(file => file.name === 'one.bin')!;
    const preview = await resources.cleanupPreview([one.id]);
    assert.equal(preview.selected_bytes, 3);
    assert.equal(preview.retained_bytes, 7);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('read-only inventory preserves data and reports unavailable roots separately', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-inventory-test-')));
  try {
    await writeFile(path.join(root, 'source.ts'), 'protected');
    const resources = new WorkbenchResources(path.join(root, 'memories'), [], [
      { id: 'app_data', path: root, owner: 'App' }, { id: 'missing', path: path.join(root, 'missing'), owner: 'fixture' },
    ]);
    const inventory = await resources.inventory();
    assert.equal(inventory.protectedCategories[0].bytes, 9);
    assert.equal(inventory.protectedCategories[0].cleanupAllowed, false);
    assert.equal(inventory.protectedCategories[1].status, 'not_configured');
    await assert.rejects(resources.cleanupPreview(['app_data:source.ts']));
    assert.equal(await readFile(path.join(root, 'source.ts'), 'utf8'), 'protected');
  } finally { await rm(root, { recursive: true, force: true }); }
});
