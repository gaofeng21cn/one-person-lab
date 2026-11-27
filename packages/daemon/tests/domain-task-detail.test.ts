import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readDomainTaskDetail } from '../src/state/domain-task-detail.ts';
import { createDomainTaskInventoryReader } from '../src/state/domain-task-inventory.ts';

test('reads the selected inventory task’s declared view, bound revision and task identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-task-view-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = { package_id: 'research', install_path: root, enabled: true, intent: 'agent' as const };
  const workspace = { workspace_id: 'portfolio', root_path: path.join(root, 'portfolio'), domain_id: 'research' };
  fs.mkdirSync(path.join(root, 'contracts'));
  fs.mkdirSync(workspace.root_path);
  fs.writeFileSync(path.join(root, 'contracts/domain_descriptor.json'), JSON.stringify({
    surface_kind: 'domain_agent_descriptor', package_id: 'research', domain_id: 'research',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1', domain_detail_views: [],
      inventory_projection: {
        source_kind: 'workspace_relative_json', relative_path: 'index.json', items_pointer: '/items',
        field_map: { work_item_id: 'id', work_item_root: 'root' },
      },
    },
    task_provider: { views: [{
      view_id: 'roadmap', view_kind: 'research-roadmap', schema_version: 'roadmap.v2',
      source_kind: 'work_item_relative_json', relative_path: 'snapshot.json',
      owner_task_binding: { task_id_pointer: '/id', task_ref_pointer: '/ref', task_ref_template: 'study:{task_id}' },
    }] },
  }));
  fs.writeFileSync(path.join(workspace.root_path, 'index.json'), '{"items":[{"id":"paper","root":"paper"}]}');
  const [inventory] = createDomainTaskInventoryReader().read([owner], [workspace]).items;
  const item = { item_id: 'portfolio:paper', identity: { agent_id: owner.package_id, ...inventory } };
  assert.deepEqual(inventory.domain_detail_views?.map((d) => d.view_id), ['roadmap']);
  const read = (revision?: number) => readDomainTaskDetail(owner, item, 'roadmap', revision);
  assert.equal(read().availability, 'missing');
  const itemRoot = path.join(workspace.root_path, 'paper');
  fs.mkdirSync(itemRoot);
  const payload = { revision: 2, id: 'paper', ref: 'study:paper', nodes: [] };
  const bytes = JSON.stringify(payload);
  const target = path.join(itemRoot, 'snapshot.json');
  fs.writeFileSync(target, bytes);
  const current = read();
  assert.equal(current.item_id, item.item_id);
  assert.equal(current.availability, 'available');
  assert.equal(current.revision, 2);
  assert.equal(current.digest, 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(current.payload, payload);
  assert.equal(read(2).not_modified, true);
  assert.equal(read(2).payload, null);
  assert.equal(read(3).availability, 'stale');
  assert.equal(readDomainTaskDetail(owner, item, 'other').availability, 'missing');
  assert.equal(readDomainTaskDetail({ ...owner, enabled: false }, item, 'roadmap').availability, 'missing');
  fs.writeFileSync(target, JSON.stringify({ ...payload, id: 'another' }));
  assert.equal(read().availability, 'stale');
  assert.equal(read().payload, null);
  fs.truncateSync(target, 8 * 1024 * 1024 + 1);
  assert.equal(read().availability, 'invalid');
});
