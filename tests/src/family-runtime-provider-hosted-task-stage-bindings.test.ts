import assert from 'node:assert/strict';
import test from 'node:test';

import {
  stageIdForProviderHostedTask,
} from '../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import type { FamilyRuntimeTaskRow } from '../../src/modules/runway/family-runtime-store.ts';

function task(domainId: string, taskKind: string) {
  return {
    domain_id: domainId,
    task_kind: taskKind,
  } as FamilyRuntimeTaskRow;
}

const rcaBinding = {
  runtime_domain_id: 'redcube',
  stage_id: 'controlled_visual_stage_attempt',
  provider_hosted_stage_attempt_required: true,
};

test('provider-hosted task stage consumes the domain owner-receipt binding', () => {
  assert.equal(stageIdForProviderHostedTask(
    task('redcube', 'emit_no_regression_evidence'),
    {
      owner_receipt_contract: {
        provider_hosted_task_stage_bindings: {
          emit_no_regression_evidence: rcaBinding,
        },
      },
    },
  ), 'controlled_visual_stage_attempt');
});

test('provider-hosted task stage consumes a binding projected through product entry manifest', () => {
  assert.equal(stageIdForProviderHostedTask(
    task('redcube', 'emit_no_regression_evidence'),
    {
      product_entry_manifest: {
        owner_receipt_contract: {
          provider_hosted_task_stage_bindings: {
            emit_no_regression_evidence: rcaBinding,
          },
        },
      },
    },
  ), 'controlled_visual_stage_attempt');
});

test('explicit task stage remains authoritative over the domain default', () => {
  assert.equal(stageIdForProviderHostedTask(
    task('redcube', 'emit_no_regression_evidence'),
    {
      provider_hosted_stage_attempt: true,
      stage_id: 'event_specific_stage',
      provider_hosted_task_stage_bindings: {
        emit_no_regression_evidence: rcaBinding,
      },
    },
  ), 'event_specific_stage');
});

test('provider-hosted task binding cannot cross runtime-domain authority', () => {
  assert.equal(stageIdForProviderHostedTask(
    task('medautoscience', 'emit_no_regression_evidence'),
    {
      provider_hosted_task_stage_bindings: {
        emit_no_regression_evidence: rcaBinding,
      },
    },
  ), null);
});

test('legacy RCA persisted tasks retain replay compatibility without restoring retired MAG inference', () => {
  assert.equal(stageIdForProviderHostedTask(
    task('redcube', 'emit_no_regression_evidence'),
    { provider_hosted_stage_attempt: true },
  ), 'controlled_visual_stage_attempt');
  assert.equal(stageIdForProviderHostedTask(
    task('medautogrant', 'autonomy-controller/review'),
    { provider_hosted_stage_attempt: true },
  ), null);
});
