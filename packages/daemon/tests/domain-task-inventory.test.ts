import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDomainTaskInventoryReader } from '../src/state/domain-task-inventory.ts';

test('declared inventories remain bound to their workspace and refresh after owner file changes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkgDir = path.join(root, 'agent');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(path.join(pkgDir, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'studies', 'a'), { recursive: true });
  const owner = { package_id: 'medical-agent', intent: 'agent' as const, install_path: pkgDir, enabled: true };
  const ws = { workspace_id: 'ws-a', domain_id: 'medical-research', root_path: workspace };
  const descriptorPath = path.join(pkgDir, 'contracts', 'domain_descriptor.json');
  const fields = { work_item_id: 'study', display_name: 'title', business_status: 'phase', work_item_root: 'location' };
  const descriptor = {
    surface_kind: 'domain_agent_descriptor', domain_id: 'medical-research', package_id: owner.package_id,
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: { source_kind: 'workspace_relative_json', relative_path: 'index.json', items_pointer: '/a~1b/items', field_map: fields },
    },
  };
  const reader = createDomainTaskInventoryReader();
  const read = () => reader.read([owner], [ws]);
  const initial = read();
  assert.strictEqual(read(), initial);
  fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));
  assert.equal(read().diagnostics[0].reason, 'inventory_source_unavailable');
  const inventoryPath = path.join(workspace, 'index.json');
  const record = { study: 'a', title: 'Follow up', phase: 'publication_ready', location: 'studies/a' };
  const setInventory = (items: unknown[]) => fs.writeFileSync(inventoryPath, JSON.stringify({ 'a/b': { items } }));
  setInventory([record, record, { bad: true }]);
  const expected = read();
  const [item] = expected.items;
  assert.equal(expected.items.length, 1);
  assert.equal(item.workspace_id, ws.workspace_id);
  assert.equal(item.package_id, owner.package_id);
  assert.equal(item.title, record.title);
  assert.equal(item.business_state, 'delivered_paused');
  assert.equal(item.work_item_root, fs.realpathSync(path.join(workspace, record.location)));
  assert.strictEqual(read(), expected);
  setInventory([{ ...record, phase: 'new owner state' }]);
  assert.equal(read().items[0].business_state, 'unknown');
  fs.rmSync(inventoryPath);
  assert.deepEqual(read().items, []);
  setInventory([record]);
  assert.deepEqual(reader.read([{ ...owner, enabled: false }], [ws]).items, []);
  assert.deepEqual(reader.read([owner], [{ ...ws, domain_id: null }]).items, []);
  assert.deepEqual(reader.read([owner], [{ ...ws, domain_id: 'unrelated' }]).items, []);
  fs.writeFileSync(descriptorPath, JSON.stringify({ ...descriptor, package_id: 'another-agent' }));
  assert.deepEqual(read().items, []);
});

test('an unreadable inventory stays local to its owner and project', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'contracts'));
  fs.writeFileSync(path.join(root, 'contracts', 'domain_descriptor.json'), JSON.stringify({
    surface_kind: 'domain_agent_descriptor', domain_id: 'research',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: { source_kind: 'workspace_relative_json', relative_path: 'index.json', items_pointer: '/items', field_map: { work_item_id: 'id' } },
    },
  }));
  const dirs = ['ws-a', 'ws-b'].map((id) => {
    const dir = path.join(root, id);
    fs.mkdirSync(dir);
    return { workspace_id: id, domain_id: 'research', root_path: dir };
  });
  fs.writeFileSync(path.join(dirs[0].root_path, 'index.json'), '{');
  fs.writeFileSync(path.join(dirs[1].root_path, 'index.json'), JSON.stringify({ items: [{ id: 'project-b' }] }));
  const packages = [{ package_id: 'research', install_path: root, enabled: true, intent: 'agent' as const }];
  const result = createDomainTaskInventoryReader().read(packages, dirs);
  assert.deepEqual(result.items.map((item) => item.work_item_id), ['project-b']);
  assert.equal(result.items[0].business_state, 'unknown');
  assert.deepEqual(result.diagnostics, [{ package_id: 'research', workspace_id: 'ws-a', reason: 'inventory_items_invalid' }]);
});
