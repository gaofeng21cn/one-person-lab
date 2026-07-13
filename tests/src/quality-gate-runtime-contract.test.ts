import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildQualityGateRuntimeBinding,
  QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS,
  validateQualityGateRuntimeBinding,
} from '../../src/modules/stagecraft/quality-gate-runtime.ts';
import { evaluateStageRunProgress } from '../../src/modules/stagecraft/stage-run-kernel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('quality gate binding is optional evidence for quality claims, never stage progress authorization', () => {
  const contract = readJson('contracts/opl-framework/quality-gate-runtime-contract.json');

  assert.equal(contract.binding_policy.missing_binding_blocks_next_stage, false);
  assert.equal(contract.binding_policy.missing_binding_records_quality_debt, true);
  assert.equal(contract.required_binding_refs.includes('attempt_lease_ref'), false);
  assert.equal(contract.required_binding_refs.includes('execution_authorization_decision_ref'), false);
  assert.equal(contract.authority_boundary.can_authorize_quality_or_export, false);
});

test('quality gate helper binds an independent reviewer receipt without OPL verdict authority', () => {
  assert.ok(QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS.includes('quality_gate_receipt'));
  const binding = buildQualityGateRuntimeBinding({
    stage_run_ref: 'stage-run:mas:paper-review',
    stage_manifest_ref: 'stage-manifest:paper-review',
    current_pointer_ref: 'current-pointer:paper-review',
    source_fingerprint: 'sha256:quality-gate-runtime',
    idempotency_key: 'idem-quality-gate-runtime',
    provider_attempt_ref: 'temporal://attempt/sat-author',
    quality_gate_attempt_ref: 'temporal://attempt/sat-reviewer',
    receipt_ref: 'mas://quality-gate/receipt/123',
    receipt_kind: 'quality_gate_receipt',
    receipt_owner: 'med-autoscience',
    next_owner: 'med-autoscience',
  });

  assert.equal(binding.binding_status, 'bound');
  assert.equal(binding.authority_boundary.can_authorize_quality_or_export, false);
  assert.deepEqual(validateQualityGateRuntimeBinding(binding), binding);
});

test('StageRun advances a readable artifact without a quality receipt', () => {
  const report = evaluateStageRunProgress({
    phase: 'closeout',
    stage_run_id: 'stage-run:mas:paper-review',
    domain_id: 'med-autoscience',
    stage_id: 'paper_review',
    consumable_artifact_refs: ['mas://paper/review-draft'],
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
  });

  assert.equal(report.status, 'progress_ready_with_quality_debt');
  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.closeout_hard_stop_reasons, []);
  assert.ok(report.quality_debt_reasons.includes('owner_answer_missing_for_quality_or_ready_claim'));
});
