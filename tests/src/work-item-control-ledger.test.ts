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
} from '../../src/modules/ledger/work-item-control-ledger.ts';

test('work item control ledger persists user lifecycle independently from domain truth', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-item-control-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    const identity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-002' };
    const preview = setWorkItemControlState({
      ...identity,
      lifecycle_state: 'delivered_paused',
      reason: 'milestone submission package delivered',
    }, { dryRun: true });
    assert.equal(preview.status, 'dry_run');
    assert.equal(fs.existsSync(path.join(root, 'work-item-control-ledger.json')), false);

    const applied = setWorkItemControlState({
      ...identity,
      lifecycle_state: 'delivered_paused',
      reason: 'milestone submission package delivered',
      expected_generation: 0,
    });
    assert.equal(applied.status, 'applied');
    assert.equal(applied.authority_boundary.can_write_domain_truth, false);
    assert.equal(findWorkItemControl(identity)?.lifecycle_state, 'delivered_paused');
    assert.deepEqual(buildWorkItemControlResolver()(identity), {
      state: 'delivered_paused',
      updated_at: applied.current.updated_at,
      source_ref: 'opl://work-item-control/mas/diabetes/dm-002',
    });

    setWorkItemControlState({
      ...identity,
      lifecycle_state: 'active',
      reason: 'user woke the work item',
      expected_generation: 1,
    });
    const ledger = readWorkItemControlLedger();
    assert.equal(ledger.generation, 2);
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0]?.lifecycle_state, 'active');
    assert.equal(ledger.transitions.length, 2);
    assert.equal(ledger.transitions[0]?.previous_state, 'delivered_paused');
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('work item control ledger rejects stale generation writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-item-control-conflict-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    const identity = { agent_id: 'mas', project_id: 'diabetes', work_item_id: 'dm-003' };
    setWorkItemControlState({ ...identity, lifecycle_state: 'paused' });
    assert.throws(
      () => setWorkItemControlState({ ...identity, lifecycle_state: 'active', expected_generation: 0 }),
      (error: unknown) => (
        error instanceof FrameworkContractError
        && error.details?.reason_code === 'work_item_control_generation_conflict'
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
