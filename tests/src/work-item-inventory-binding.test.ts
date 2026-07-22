import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { StandardAgentInventoryProjection } from '../../src/kernel/standard-agent-interface.ts';
import { resolveWorkItemInventoryBinding } from '../../src/modules/workspace/work-item-inventory-binding.ts';

const declaration: StandardAgentInventoryProjection = {
  source_kind: 'workspace_relative_json',
  relative_path: 'workspace_index.json',
  items_pointer: '/studies',
  work_item_root_template: 'studies/{study_id}',
  field_map: {
    work_item_id: 'study_id',
    work_item_root: 'canonical_study_root',
    business_status: 'status',
    current_stage_id: 'current_stage_id',
    current_stage_status: 'current_stage_status',
    package_status: 'package_status',
    lifecycle_ref: 'lifecycle_ref',
  },
};

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-item-inventory-'));
}

function writeInventory(root: string, studies: Array<Record<string, unknown>>) {
  fs.writeFileSync(path.join(root, 'workspace_index.json'), `${JSON.stringify({ studies })}\n`);
}

function failureCode(error: unknown) {
  return (error as { details?: Record<string, unknown> }).details?.failure_code;
}

test('inventory binding requires exactly one owner row', () => {
  const root = workspace();
  try {
    writeInventory(root, []);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_row_missing');

    writeInventory(root, [
      { study_id: 'study-001', canonical_study_root: 'studies/study-001' },
      { study_id: 'study-001', canonical_study_root: 'studies/study-001-copy' },
    ]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_row_ambiguous');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory binding rejects root traversal and symlink escape', () => {
  const root = workspace();
  const outside = workspace();
  try {
    writeInventory(root, [{
      study_id: 'study-001',
      canonical_study_root: path.relative(root, outside),
    }]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_root_invalid');

    fs.symlinkSync(outside, path.join(root, 'study-link'));
    writeInventory(root, [{ study_id: 'study-001', canonical_study_root: 'study-link' }]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_root_symlink');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('inventory binding rejects duplicate canonical roots and path/id template drift', () => {
  const root = workspace();
  try {
    fs.mkdirSync(path.join(root, 'studies', 'study-001'), { recursive: true });
    writeInventory(root, [
      { study_id: 'study-001', canonical_study_root: 'studies/study-001' },
      { study_id: 'study-002', canonical_study_root: 'studies/study-001' },
    ]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_canonical_root_overlap');

    fs.mkdirSync(path.join(root, 'studies', 'wrong-study'), { recursive: true });
    writeInventory(root, [{
      study_id: 'study-001',
      canonical_study_root: 'studies/wrong-study',
    }]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_root_template_mismatch');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory binding rejects the workspace root, overlapping roots, and internal symlink chains', () => {
  const root = workspace();
  try {
    writeInventory(root, [{ study_id: 'study-001', canonical_study_root: '.' }]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_root_invalid');

    fs.mkdirSync(path.join(root, 'studies', 'study-001', 'study-002'), { recursive: true });
    writeInventory(root, [
      { study_id: 'study-001', canonical_study_root: 'studies/study-001' },
      { study_id: 'study-002', canonical_study_root: 'studies/study-001/study-002' },
    ]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_canonical_root_overlap');

    fs.rmSync(path.join(root, 'studies'), { recursive: true, force: true });
    fs.mkdirSync(path.join(root, 'studies', 'physical-study-001'), { recursive: true });
    fs.symlinkSync('physical-study-001', path.join(root, 'studies', 'study-001'));
    writeInventory(root, [{ study_id: 'study-001', canonical_study_root: 'studies/study-001' }]);
    assert.throws(() => resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    }), (error: unknown) => failureCode(error) === 'work_item_inventory_root_symlink');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory digest binds only the selected row and immutable declaration', () => {
  const root = workspace();
  try {
    fs.mkdirSync(path.join(root, 'studies', 'study-001'), { recursive: true });
    fs.mkdirSync(path.join(root, 'studies', 'study-002'), { recursive: true });
    writeInventory(root, [
      { study_id: 'study-001', canonical_study_root: 'studies/study-001', status: 'active' },
      { study_id: 'study-002', canonical_study_root: 'studies/study-002', status: 'active' },
    ]);
    const first = resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    });
    writeInventory(root, [
      { study_id: 'study-001', canonical_study_root: 'studies/study-001', status: 'active' },
      { study_id: 'study-002', canonical_study_root: 'studies/study-002', status: 'paused' },
    ]);
    const afterOtherRowChanged = resolveWorkItemInventoryBinding({
      workspaceRoot: root,
      declaration,
      domainWorkItemId: 'study-001',
    });
    assert.equal(afterOtherRowChanged.inventory_digest, first.inventory_digest);
    assert.match(first.inventory_ref, /#\/studies\/0$/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
