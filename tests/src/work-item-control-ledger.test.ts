import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  buildWorkItemControlResolver,
  findWorkItemControl,
  readWorkItemControlLedger,
  setWorkItemControlState,
  setWorkItemVisibilityState,
} from '../../src/modules/ledger/work-item-control-ledger.ts';

function withStateRoot(prefix: string, run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    run(root);
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('work item control ledger persists lifecycle and visibility as independent axes', () => {
  withStateRoot('opl-work-item-control-', (root) => {
    const identity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-002' };
    const otherIdentity = { ...identity, work_item_id: 'dm-003' };
    const preview = setWorkItemVisibilityState({
      ...identity,
      visibility_state: 'archived',
      reason: 'hide from the default project list',
    }, { dryRun: true });
    assert.equal(preview.status, 'dry_run');
    assert.equal(preview.control_axis, 'visibility');
    assert.equal(fs.existsSync(path.join(root, 'work-item-control-ledger.json')), false);

    const lifecycleApplied = setWorkItemControlState({
      ...identity,
      lifecycle_state: 'delivered_paused',
      reason: 'milestone submission package delivered',
      expected_generation: 0,
    });
    assert.equal(lifecycleApplied.status, 'applied');
    assert.equal(lifecycleApplied.authority_boundary.can_write_domain_truth, false);
    assert.deepEqual(buildWorkItemControlResolver()(otherIdentity), {
      lifecycle_state: null,
      lifecycle_updated_at: null,
      visibility_state: 'visible',
      visibility_source: 'default',
      visibility_updated_at: null,
      source_ref: null,
      generation: 1,
    });

    const visibilityApplied = setWorkItemVisibilityState({
      ...identity,
      visibility_state: 'archived',
      reason: 'hide from the default project list',
      expected_generation: 1,
    });
    const archivedEntry = findWorkItemControl(identity)!;
    assert.equal(archivedEntry.lifecycle_state, 'delivered_paused');
    assert.equal(archivedEntry.visibility_state, 'archived');
    assert.deepEqual(buildWorkItemControlResolver()(identity), {
      lifecycle_state: 'delivered_paused',
      lifecycle_updated_at: lifecycleApplied.current.lifecycle_updated_at,
      visibility_state: 'archived',
      visibility_source: 'work_item_control_ledger',
      visibility_updated_at: visibilityApplied.current.visibility_updated_at,
      source_ref: 'opl://work-item-control/mas/diabetes/dm-002',
      generation: 2,
    });

    const lifecycleUpdated = setWorkItemControlState({
      ...identity,
      lifecycle_state: 'active',
      reason: 'user woke the work item',
      expected_generation: 2,
    });
    assert.equal(lifecycleUpdated.current.visibility_state, 'archived');
    assert.equal(
      lifecycleUpdated.current.visibility_updated_at,
      visibilityApplied.current.visibility_updated_at,
    );

    const restored = setWorkItemVisibilityState({
      ...identity,
      visibility_state: 'visible',
      reason: 'restore to the default project list',
      expected_generation: 3,
    });
    assert.equal(restored.current.lifecycle_state, 'active');
    assert.equal(restored.current.lifecycle_updated_at, lifecycleUpdated.current.lifecycle_updated_at);

    const ledger = readWorkItemControlLedger();
    assert.equal(ledger.surface_kind, 'opl_work_item_control_ledger.v2');
    assert.equal(ledger.version, 2);
    assert.equal(ledger.generation, 4);
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.transitions.length, 4);
    assert.deepEqual(
      ledger.transitions.map((transition) => transition.control_axis),
      ['visibility', 'lifecycle', 'visibility', 'lifecycle'],
    );
  });
});

test('work item control ledger shares one stale generation gate across both axes', () => {
  withStateRoot('opl-work-item-control-conflict-', () => {
    const identity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-003' };
    setWorkItemControlState({ ...identity, lifecycle_state: 'paused' });
    assert.throws(
      () => setWorkItemVisibilityState({
        ...identity,
        visibility_state: 'archived',
        expected_generation: 0,
      }),
      (error: unknown) => (
        error instanceof FrameworkContractError
        && error.details?.reason_code === 'work_item_control_generation_conflict'
        && error.details?.current_generation === 1
      ),
    );
    assert.throws(
      () => setWorkItemControlState({
        ...identity,
        lifecycle_state: 'archived' as never,
      }),
      (error: unknown) => (
        error instanceof FrameworkContractError
        && error.details?.archive_action_id === 'work_item_visibility_set'
      ),
    );
  });
});

test('v1 archived lifecycle migrates to visibility without overriding domain lifecycle', () => {
  withStateRoot('opl-work-item-control-v1-', (root) => {
    const file = path.join(root, 'work-item-control-ledger.json');
    const archivedIdentity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-004' };
    const pausedIdentity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-005' };
    const legacy = {
      surface_kind: 'opl_work_item_control_ledger.v1',
      version: 1,
      generation: 7,
      updated_at: '2026-07-13T10:00:00.000Z',
      items: [
        {
          ...archivedIdentity,
          control_key: 'mas/diabetes/dm-004',
          lifecycle_state: 'archived',
          reason: 'legacy manual archive',
          source: 'opl_app',
          generation: 7,
          updated_at: '2026-07-13T10:00:00.000Z',
        },
        {
          ...pausedIdentity,
          control_key: 'mas/diabetes/dm-005',
          lifecycle_state: 'paused',
          reason: 'waiting for direction',
          source: 'opl_app',
          generation: 6,
          updated_at: '2026-07-13T09:00:00.000Z',
        },
      ],
      transitions: [
        {
          ...archivedIdentity,
          control_key: 'mas/diabetes/dm-004',
          lifecycle_state: 'archived',
          reason: 'legacy manual archive',
          source: 'opl_app',
          generation: 7,
          updated_at: '2026-07-13T10:00:00.000Z',
          transition_id: 'opl://work-item-control/mas/diabetes/dm-004/legacy',
          previous_state: 'active',
        },
      ],
    };
    fs.writeFileSync(file, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    const legacyBytes = fs.readFileSync(file, 'utf8');

    const migrated = readWorkItemControlLedger();
    assert.equal(migrated.version, 2);
    assert.deepEqual(
      migrated.items.map((entry) => [entry.work_item_id, entry.lifecycle_state, entry.visibility_state]),
      [
        ['dm-004', null, 'archived'],
        ['dm-005', 'paused', 'visible'],
      ],
    );
    assert.equal(fs.readFileSync(file, 'utf8'), legacyBytes);

    const dryRun = setWorkItemVisibilityState({
      ...archivedIdentity,
      visibility_state: 'visible',
      expected_generation: 7,
    }, { dryRun: true });
    assert.equal(dryRun.status, 'dry_run');
    assert.equal(fs.readFileSync(file, 'utf8'), legacyBytes);

    const lifecycleApplied = setWorkItemControlState({
      ...archivedIdentity,
      lifecycle_state: 'paused',
      expected_generation: 7,
    });
    assert.equal(lifecycleApplied.current.visibility_state, 'archived');
    const upgradedPayload = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(upgradedPayload.surface_kind, 'opl_work_item_control_ledger.v2');
    assert.equal(upgradedPayload.version, 2);

    const restored = setWorkItemVisibilityState({
      ...archivedIdentity,
      visibility_state: 'visible',
      expected_generation: 8,
    });
    assert.equal(restored.current.lifecycle_state, 'paused');
    assert.equal(restored.current.visibility_state, 'visible');
  });
});
