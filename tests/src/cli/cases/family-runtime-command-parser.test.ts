import { assert, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/kernel/contract-validation.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../src/modules/runway/family-runtime-command-parts/registry.ts';
import { parseSchedulerLifecycleArgs } from '../../../../src/modules/runway/family-runtime-command-parts/scheduler.ts';
import { buildTemporalSchedulerTickWorkflowArgs } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/scheduler-cadence.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  resolveFamilyRuntimeDomainId,
  runtimeDomainProfileFor,
} from '../../../../src/modules/runway/family-runtime-types.ts';

function assertUsageError(error: unknown, message: RegExp, option: string) {
  assert.equal(error instanceof FrameworkContractError, true);
  const usageError = error as FrameworkContractError;
  assert.equal(usageError.code, 'cli_usage_error');
  assert.match(usageError.message, message);
  assert.equal(usageError.details?.option, option);
}

test('family runtime support and aliases derive from standard-agent runtime profiles', () => {
  assert.deepEqual(FAMILY_RUNTIME_DOMAIN_IDS, [
    'medautoscience',
    'medautogrant',
    'redcube',
    'opl-meta-agent',
  ]);
  assert.equal(resolveFamilyRuntimeDomainId('mas'), 'medautoscience');
  assert.equal(resolveFamilyRuntimeDomainId('redcube-ai'), 'redcube');
  assert.equal(resolveFamilyRuntimeDomainId('obf'), null);

  const mas = runtimeDomainProfileFor('medautoscience');
  assert.ok(mas);
  assert.deepEqual(mas.dispatch_command, ['medautosci', 'domain-handler', 'dispatch']);
  assert.equal(mas.runtime_manager_registration?.domain_owner, 'med-autoscience');
});

test('family-runtime scheduler parser binds a profile to an explicit registry runtime domain', () => {
  assert.deepEqual(parseSchedulerLifecycleArgs([
    'status',
    '--provider',
    'temporal',
    '--domain',
    'rca',
    '--profile',
    '/tmp/profile.toml',
  ]), {
    mode: 'scheduler_status',
    providerKind: 'temporal',
    domainProfiles: {
      redcube: '/tmp/profile.toml',
    },
  });
});

test('family-runtime scheduler rejects runtime-only domains without a scheduler registration', () => {
  assert.throws(
    () => parseSchedulerLifecycleArgs([
      'status',
      '--provider',
      'temporal',
      '--domain',
      'oma',
      '--profile',
      '/tmp/oma.toml',
    ]),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const contractError = error as FrameworkContractError;
      assert.equal(contractError.code, 'cli_usage_error');
      assert.deepEqual(contractError.details?.allowed_domain_ids, [
        'medautoscience',
        'medautogrant',
        'redcube',
      ]);
      return true;
    },
  );

  assert.throws(
    () => buildTemporalSchedulerTickWorkflowArgs({
      domainProfiles: { 'opl-meta-agent': '/tmp/oma.toml' },
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      assert.equal((error as FrameworkContractError).code, 'contract_shape_invalid');
      return true;
    },
  );
});

test('family-runtime registry parser reuses shared option walking without changing command payloads', () => {
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'attempt',
    'archive',
    'sat_example',
    '--reason',
    'no longer needed',
  ]), {
    mode: 'attempt_archive',
    stageAttemptId: 'sat_example',
    reason: 'no longer needed',
    source: undefined,
  });

  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'attempt',
    'list',
    '--domain',
    'medautoscience',
    '--study',
    'DM002',
    '--since-hours',
    '2',
    '--compact-timeline',
  ]), {
    mode: 'attempt_list',
    filters: {
      domainId: 'medautoscience',
      status: undefined,
      studyId: 'DM002',
      sinceHours: 2,
      compactTimeline: true,
      full: false,
    },
  });

  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'attempt',
    'create',
    '--domain',
    'opl-meta-agent',
    '--stage',
    'intent-intake',
    '--action',
    'build-agent-baseline',
    '--workspace-locator',
    '{"workspace_root":"/tmp/oma"}',
  ]), {
    mode: 'attempt_create',
    input: {
      domainId: 'opl-meta-agent',
      stageId: 'intent-intake',
      actionId: 'build-agent-baseline',
      providerKind: undefined,
      workspaceLocator: { workspace_root: '/tmp/oma' },
      sourceFingerprint: undefined,
      executorKind: undefined,
      executorBindingRef: undefined,
      invocationMode: undefined,
      boundedEditRef: undefined,
      taskId: undefined,
      retryBudget: undefined,
      checkpointRefs: [],
      closeoutRefs: [],
      humanGateRefs: [],
      blockedReason: undefined,
      newAttempt: false,
      start: false,
    },
  });

  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'provider-slo',
    'tick',
    '--provider',
    'temporal',
    '--force',
  ]), {
    mode: 'provider_slo_tick',
    providerKind: 'temporal',
    force: true,
  });

  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'stage-artifact',
    'commit',
    '--domain',
    'medautoscience',
    '--program',
    'dm-cvd',
    '--topic',
    'dm002',
    '--deliverable',
    'paper',
    '--stage',
    'draft',
    '--attempt',
    'attempt-1',
    '--terminal-status',
    'success',
    '--required-output',
    'artifact:paper',
    '--owner-receipt-ref',
    'receipt:owner',
    '--apply',
  ]), {
    mode: 'stage_artifact',
    input: {
      action: 'commit',
      domain_id: 'medautoscience',
      program_id: 'dm-cvd',
      topic_id: 'dm002',
      deliverable_id: 'paper',
      stage_id: 'draft',
      attempt_id: 'attempt-1',
      terminal_status: 'success',
      required_outputs: ['artifact:paper'],
      owner_receipt_refs: ['receipt:owner'],
      quality_debt_refs: [],
      typed_blocker_refs: [],
      decision_receipt_refs: [],
      dry_run: false,
    },
  });
});

test('family-runtime parser keeps command-specific unknown option payloads', () => {
  assert.throws(
    () => parseRegisteredFamilyRuntimeCommand(['queue', 'list']),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const usageError = error as FrameworkContractError;
      assert.equal(usageError.code, 'unknown_command');
      assert.doesNotMatch(usageError.details?.usage as string, /queue list/);
      return true;
    },
  );

  assert.throws(
    () => parseRegisteredFamilyRuntimeCommand(['scheduler', 'tick']),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const usageError = error as FrameworkContractError;
      assert.equal(usageError.code, 'unknown_command');
      assert.doesNotMatch(usageError.details?.usage as string, /scheduler tick/);
      return true;
    },
  );

  assert.throws(
    () => parseRegisteredFamilyRuntimeCommand(['attempt', 'create', '--bogus']),
    (error) => {
      assertUsageError(error, /Unknown family-runtime attempt create option: --bogus\./, '--bogus');
      return true;
    },
  );
});
