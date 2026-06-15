import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildQualityGateRuntimeBinding,
  QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS,
  validateQualityGateRuntimeBinding,
} from '../../src/quality-gate-runtime.ts';
import {
  evaluateStageRunExecutionAuthorization,
} from '../../src/stage-run-kernel.ts';
import {
  currentOwnerDeltaWithClosedStageRunAnswer,
} from '../../src/current-owner-delta-stage-run-closeout.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('quality gate runtime contract is refs-only and cannot authorize quality or export', () => {
  const contract = readJson<Record<string, any>>('contracts/opl-framework/quality-gate-runtime-contract.json');

  assert.equal(contract.contract_kind, 'opl_quality_gate_runtime_contract.v1');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.deepEqual(contract.allowed_receipt_kinds, [
    'owner_receipt',
    'quality_gate_receipt',
    'typed_blocker',
    'human_gate',
    'route_back_evidence',
  ]);
  for (const field of [
    'stage_run_ref',
    'stage_manifest_ref',
    'current_pointer_ref',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
    'quality_gate_attempt_ref',
    'receipt_ref',
    'receipt_kind',
    'receipt_owner',
  ]) {
    assert.equal(contract.required_binding_refs.includes(field), true, `contract must require ${field}`);
  }
  assert.equal(contract.authority_boundary.can_authorize_quality_or_export, false);
  assert.equal(contract.authority_boundary.can_claim_publication_ready, false);
  assert.equal(contract.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(contract.authority_boundary.quality_gate_receipt_is_domain_owned_answer_ref, true);
});

test('quality gate runtime helper binds domain-owned quality gate receipt without creating OPL verdict', () => {
  assert.deepEqual([...QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS], [
    'owner_receipt',
    'quality_gate_receipt',
    'typed_blocker',
    'human_gate',
    'route_back_evidence',
  ]);

  const binding = buildQualityGateRuntimeBinding({
    stage_run_ref: 'stage-run:mas:paper-review',
    stage_manifest_ref: 'stage-manifest:paper-review',
    current_pointer_ref: 'current-pointer:paper-review',
    source_fingerprint: 'sha256:quality-gate-runtime',
    idempotency_key: 'idem-quality-gate-runtime',
    provider_attempt_ref: 'temporal://attempt/sat-quality-gate',
    quality_gate_attempt_ref: 'temporal://attempt/sat-quality-gate-reviewer',
    attempt_lease_ref: 'lease:sat-quality-gate',
    execution_authorization_decision_ref: 'exec-auth:sat-quality-gate',
    receipt_ref: 'mas://quality-gate/receipt/123',
    receipt_kind: 'quality_gate_receipt',
    receipt_owner: 'med-autoscience',
    next_owner: 'med-autoscience',
  });

  assert.equal(binding.surface_kind, 'opl_quality_gate_runtime_binding');
  assert.equal(binding.binding_status, 'bound');
  assert.equal(binding.owner_answer_kind, 'quality_gate_receipt');
  assert.equal(binding.authority_boundary.can_authorize_quality_or_export, false);
  assert.equal(binding.authority_boundary.can_claim_publication_ready, false);
  assert.equal(binding.authority_boundary.can_sign_owner_receipt, false);
  assert.deepEqual(validateQualityGateRuntimeBinding(binding), binding);
});

test('StageRun closeout accepts quality gate receipt as owner answer ref but keeps false authority', () => {
  const report = evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run:mas:paper-review',
    domain_id: 'med-autoscience',
    stage_id: 'paper_review',
    generation: 0,
    current_pointer: {
      stage_run_id: 'stage-run:mas:paper-review',
      generation: 0,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:quality-gate-runtime',
    idempotency_key: 'idem-quality-gate-runtime',
    provider_attempt_ref: 'temporal://attempt/sat-quality-gate',
    attempt_lease_ref: 'lease:sat-quality-gate',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'exec-auth:sat-quality-gate',
    workspace_scope_ref: 'workspace:mas',
    artifact_scope_ref: 'artifact:paper-review',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    owner_answer_ref: 'mas://quality-gate/receipt/123',
    owner_answer_kind: 'quality_gate_receipt',
    owner_answer_stage_run_id: 'stage-run:mas:paper-review',
    owner_answer_generation: 0,
    stage_manifest_ref: 'stage-manifest:paper-review',
    owner_answer_manifest_ref: 'stage-manifest:paper-review',
    current_pointer_ref: 'current-pointer:paper-review',
    owner_answer_current_pointer_ref: 'current-pointer:paper-review',
    owner_answer_source_fingerprint: 'sha256:quality-gate-runtime',
    owner_answer_idempotency_key: 'idem-quality-gate-runtime',
    quality_gate_attempt_ref: 'temporal://attempt/sat-quality-gate-reviewer',
  });

  assert.equal(report.status, 'authorized');
  assert.equal(report.closeout_binding.owner_answer_kind, 'quality_gate_receipt');
  assert.equal(report.authority_boundary.opl_can_authorize_publication_or_quality_verdict, false);

  const currentOwnerDelta = currentOwnerDeltaWithClosedStageRunAnswer(
    {
      hard_gate: {
        state: 'owner_delta_open',
        human_or_domain_owner_required: true,
      },
    } as Record<string, any>,
    {
      execution_authorization: report,
    },
  );

  assert.equal(currentOwnerDelta.latest_owner_answer_ref, 'mas://quality-gate/receipt/123');
  assert.equal(currentOwnerDelta.latest_owner_answer_kind, 'quality_gate_receipt');
  assert.equal(currentOwnerDelta.hard_gate.owner_answer_kind, 'quality_gate_receipt');
  assert.equal(currentOwnerDelta.hard_gate.quality_or_export_authorized, false);
  assert.equal(currentOwnerDelta.hard_gate.domain_ready_authorized, false);
});
