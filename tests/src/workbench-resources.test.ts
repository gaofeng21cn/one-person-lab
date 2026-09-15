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
    const resources = new WorkbenchResources(path.join(root, 'memories'), [{ id: 'logs', owner: 'fixture', path: log }]);
    const inventory = await resources.inventory(); assert.equal(inventory.categories[0].files.length, 1);
    const id = inventory.categories[0].files[0].id;
    const preview = await resources.cleanupPreview([id]);
    await assert.rejects(resources.cleanupExecute(preview.token, false), /confirmation/);
    await writeFile(path.join(log, 'old.log'), 'changed');
    await assert.rejects(resources.cleanupExecute(preview.token, true), /changed/);
    await utimes(path.join(log, 'old.log'), new Date(0), new Date(0));
    const current = await resources.cleanupPreview([id]);
    assert.equal((await resources.cleanupExecute(current.token, true)).status, 'executed');
    await assert.rejects(access(path.join(log, 'old.log')));
    assert.equal(await readFile(path.join(log, 'active.log'), 'utf8'), 'active');
    assert.equal(await readFile(path.join(root, 'source.txt'), 'utf8'), 'keep');
    await assert.rejects(resources.cleanupExecute(current.token, true), /confirmation/);
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
