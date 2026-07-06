import { assert, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/kernel/contract-validation.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../src/modules/runway/family-runtime-command-parts/registry.ts';
import { parseQueueArgs, parseTickArgs } from '../../../../src/modules/runway/family-runtime-command-parts/queue.ts';
import {
  parseSchedulerLifecycleArgs,
  parseSchedulerTickArgs,
} from '../../../../src/modules/runway/family-runtime-command-parts/scheduler.ts';

function assertUsageError(error: unknown, message: RegExp, option: string) {
  assert.equal(error instanceof FrameworkContractError, true);
  const usageError = error as FrameworkContractError;
  assert.equal(usageError.code, 'cli_usage_error');
  assert.match(usageError.message, message);
  assert.equal(usageError.details?.option, option);
}

test('family-runtime queue parser preserves scoped list and release options', () => {
  assert.deepEqual(parseQueueArgs([
    'list',
    '--domain',
    'medautoscience',
    '--study',
    'DM002',
    '--payload-match',
    'work_unit=primary',
    '--status',
    'queued',
  ]), {
    mode: 'queue_list',
    status: 'queued',
    taskScope: {
      domainId: 'medautoscience',
      payloadMatches: [
        { path: 'study_id', value: 'DM002' },
        { path: 'work_unit', value: 'primary' },
      ],
    },
  });

  assert.deepEqual(parseQueueArgs([
    'release',
    '--study',
    'DM002',
    '--reason',
    'operator repair',
    '--repair-stranded-hold',
    '--source',
    'test',
  ]), {
    mode: 'queue_release',
    taskScope: {
      payloadMatches: [{ path: 'study_id', value: 'DM002' }],
    },
    reason: 'operator repair',
    source: 'test',
    repairStrandedHold: true,
  });
});

test('family-runtime tick parser preserves task scope and domain profile options', () => {
  assert.deepEqual(parseTickArgs([
    '--hydrate',
    '--domain',
    'medautoscience',
    '--profile',
    '/tmp/profile.toml',
    '--study',
    'DM002',
    '--source',
    'test',
    '--limit',
    '3',
  ]), {
    mode: 'tick',
    source: 'test',
    limit: 3,
    hydrate: true,
    taskScope: {
      domainId: 'medautoscience',
      payloadMatches: [{ path: 'study_id', value: 'DM002' }],
    },
    domainProfiles: {
      medautoscience: '/tmp/profile.toml',
    },
  });
});

test('family-runtime scheduler parser preserves tick and lifecycle options', () => {
  assert.deepEqual(parseSchedulerTickArgs([
    'tick',
    '--provider',
    'temporal',
    '--force',
    '--no-hydrate',
    '--limit',
    '2',
    '--domain',
    'medautoscience',
    '--profile',
    '/tmp/profile.toml',
    '--task-kind',
    'domain_route/reconcile-apply',
  ]), {
    mode: 'scheduler_tick',
    providerKind: 'temporal',
    force: true,
    limit: 2,
    hydrate: false,
    taskScope: {
      domainId: 'medautoscience',
      taskKind: 'domain_route/reconcile-apply',
    },
    domainProfiles: {
      medautoscience: '/tmp/profile.toml',
    },
  });

  assert.deepEqual(parseSchedulerLifecycleArgs([
    'status',
    '--provider',
    'temporal',
    '--profile',
    '/tmp/profile.toml',
  ]), {
    mode: 'scheduler_status',
    providerKind: 'temporal',
    domainProfiles: {
      medautoscience: '/tmp/profile.toml',
    },
  });
});

test('family-runtime registry parser reuses shared option walking without changing command payloads', () => {
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
      typed_blocker_refs: [],
      decision_receipt_refs: [],
      dry_run: false,
    },
  });
});

test('family-runtime parser keeps command-specific unknown option payloads', () => {
  assert.throws(
    () => parseQueueArgs(['list', '--bogus']),
    (error) => {
      assertUsageError(error, /Unknown family-runtime queue list option: --bogus\./, '--bogus');
      assert.match((error as FrameworkContractError).details?.usage as string, /queue list/);
      return true;
    },
  );

  assert.throws(
    () => parseSchedulerTickArgs(['tick', '--bogus']),
    (error) => {
      assertUsageError(error, /Unknown family-runtime scheduler tick option: --bogus\./, '--bogus');
      assert.match((error as FrameworkContractError).details?.usage as string, /scheduler tick/);
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
