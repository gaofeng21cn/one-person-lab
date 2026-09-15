import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeOplDeveloperSupervisorConfig } from '../../src/kernel/system-preferences.ts';
import {
  buildCapabilityRegistryReadout,
  type CapabilityRegistryCatalog,
  type CurrentOwnerDeltaCapabilityBinding,
} from '../../src/adapters/integration/capability-registry-resolver.ts';
import { sha256Fixture } from './cli/cases/packages-cases/helpers.ts';
import { writeManagedRuntimeSourceFixture } from './cli/cases/packages-cases/managed-runtime-source-fixture.ts';
import { createFakeCodexPluginManagerFixture } from './cli/helpers-parts/fixtures.ts';
import { removeFixtureTree } from './cli/helpers-parts/filesystem.ts';
import {
  DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  ensureProviderHostedStageAttempt,
  findBlockingLiveDefaultExecutorWorkUnitAttempt,
} from '../../src/adapters/execution/family-runtime-provider-hosted-attempts.ts';
import { createCordisBaseHeadlessComposition } from '../../src/host/composition-profiles.ts';
import { createStageAttempt, createStageAttemptTable } from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { persistStageAttemptLaunchBinding } from '../../src/adapters/execution/family-runtime-parts/stage-attempt-launch.ts';
import {
  buildCapabilityRegistryStageContextReceipt,
  capabilityRegistryStageContextInputFromPayload,
} from '../../src/adapters/execution/family-runtime-stage-context-observation.ts';
import {
  createFamilyRuntimeQueueTables,
  type FamilyRuntimeTaskRow,
} from '../../src/adapters/execution/family-runtime-store.ts';
import { resolveFamilyRuntimeProviderKind } from '../../src/adapters/execution/family-runtime-providers.ts';

const emptyRegistry: CapabilityRegistryCatalog = {
  registry_id: 'opl.capability_registry.runtime-gate-test',
  owner_modules: ['atlas', 'pack', 'stagecraft'],
  capabilities: [],
};

const registryWithRequiredRoute: CapabilityRegistryCatalog = {
  ...emptyRegistry,
  capabilities: [{
    capability_ref: 'capability:review-source-route',
    capability_id: 'review_source_route',
    owner: 'one-person-lab',
    source_family: 'opl_native',
    surface_ref: 'opl://capabilities/review-source-route',
    lifecycle: 'available',
  }],
};

const routeRequiredDelta: CurrentOwnerDeltaCapabilityBinding = {
  surface_kind: 'opl_current_owner_delta',
  schema_version: 'current-owner-delta.v1',
  default_planning_root: 'current_owner_delta',
  delta_id: 'current-owner-delta:mas:review',
  domain: 'mas',
  task_or_study_ref: 'task:capability-gate',
  stage_ref: 'review',
  current_owner: 'med-autoscience',
  required_capability_refs: [{
    capability_ref: 'capability:review-source-route',
    binding_kind: 'route_required',
    hard_boundary: 'owner_route_identity',
    required_by_delta_ref: 'current-owner-delta:mas:review',
  }],
};

function missingRouteReadout(delta = routeRequiredDelta) {
  return buildCapabilityRegistryReadout({
    registry: emptyRegistry,
    currentOwnerDelta: delta,
    requestedCapabilities: [{
      capabilityRef: 'capability:review-source-route',
      taskOrStudyRef: 'task:capability-gate',
      stageRef: 'review',
      bindingKind: 'route_required',
    }],
  });
}

function resolvedRouteReadout() {
  return buildCapabilityRegistryReadout({
    registry: registryWithRequiredRoute,
    currentOwnerDelta: routeRequiredDelta,
    requestedCapabilities: [{
      capabilityRef: 'capability:review-source-route',
      taskOrStudyRef: 'task:capability-gate',
      stageRef: 'review',
      bindingKind: 'route_required',
    }],
  });
}

test('default executor cross-task admission reads only StageAttempt state', () => {
  const db = new DatabaseSync(':memory:');
  createStageAttemptTable(db);
  try {
    const providerKind = resolveFamilyRuntimeProviderKind();
    const liveAttempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
      providerKind,
      workspaceLocator: {
        workspace_root: '/tmp/no-tasks-table',
        work_unit_id: 'work-unit:shared',
        action_type: 'old-action',
      },
      sourceFingerprint: 'source:old',
      executorKind: 'codex_cli',
      taskId: 'external-task:old',
      newAttempt: true,
    }).attempt;
    const candidateRow = {
      task_id: 'external-task:new',
      domain_id: 'redcube',
      task_kind: DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
    } as FamilyRuntimeTaskRow;
    const candidatePayload = {
      dispatch_ref: 'dispatch:new',
      source_fingerprint: 'source:new',
      next_executable_owner: 'codex_cli',
      executor_kind: 'codex_cli',
      workspace_root: '/tmp/no-tasks-table',
      work_unit_id: 'work-unit:shared',
      action_type: 'new-action',
    };

    const blockingAttempt = findBlockingLiveDefaultExecutorWorkUnitAttempt(
      db,
      candidateRow,
      candidatePayload,
    );

    assert.equal(blockingAttempt?.stage_attempt_id, liveAttempt.stage_attempt_id);
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get(),
      undefined,
    );
  } finally {
    db.close();
  }
});

test('capability launch gate is not applicable during planning without current delta or typed readout', () => {
  const receipt = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'planning',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
  });

  assert.equal(receipt.status, 'not_applicable');
  assert.equal(receipt.advisory_reason, null);
  assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  assert.equal(receipt.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(receipt.authority_boundary.can_create_domain_typed_blocker, false);
});

test('capability launch gate keeps missing optional capabilities fail-open during execution', () => {
  const optionalDelta: CurrentOwnerDeltaCapabilityBinding = {
    ...routeRequiredDelta,
    required_capability_refs: [{
      capability_ref: 'capability:optional-review-aid',
      binding_kind: 'optional',
    }],
  };
  const readout = buildCapabilityRegistryReadout({
    registry: emptyRegistry,
    currentOwnerDelta: optionalDelta,
    requestedCapabilities: [{
      capabilityRef: 'capability:optional-review-aid',
      taskOrStudyRef: 'task:capability-gate',
      stageRef: 'review',
      bindingKind: 'optional',
    }],
  });
  const receipt = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: optionalDelta,
    capabilityRegistryResolutionReceipts: readout.resolutions,
    capabilityRegistryResolutionReceiptRefs: ['opl://capability-resolutions/optional-review-aid'],
  });

  assert.equal(receipt.status, 'observed');
  assert.equal(receipt.advisory_reason, null);
  assert.equal(receipt.typed_input_status.capability_registry_readout, 'missing');
  assert.equal(receipt.typed_input_status.capability_registry_resolution_receipt_count, 1);
  assert.deepEqual(
    receipt.input_refs.capability_registry_resolution_receipt_refs,
    ['opl://capability-resolutions/optional-review-aid'],
  );
  assert.deepEqual(receipt.optional_fail_open_capability_refs, ['capability:optional-review-aid']);
  assert.deepEqual(receipt.unavailable_capability_refs, []);

  const withoutCurrentDelta = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: readout.resolutions,
  });
  assert.equal(withoutCurrentDelta.status, 'observed');
  assert.equal(withoutCurrentDelta.advisory_reason, null);
});

test('capability preflight records route-required misses without blocking stage execution', () => {
  const missingCapability = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: routeRequiredDelta,
    capabilityRegistryReadout: missingRouteReadout(),
    capabilityRegistryReadoutRef: 'opl://capability-readouts/review-source-route',
  });
  const unboundReadout = missingRouteReadout({
    ...routeRequiredDelta,
    task_or_study_ref: 'task:other',
  });
  const missingBinding = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: routeRequiredDelta,
    capabilityRegistryReadout: unboundReadout,
  });

  assert.equal(missingCapability.status, 'observed');
  assert.equal(missingCapability.advisory_reason, null);
  assert.deepEqual(missingCapability.unavailable_capability_refs, ['capability:review-source-route']);
  assert.equal(missingCapability.progression_effect, 'advisory_only_stage_may_start');
  assert.equal(missingBinding.status, 'observed');
  assert.equal(missingBinding.advisory_reason, null);
});

test('capability launch gate keeps missing source or reviewer capability fail-open for stage progress', () => {
  const sourceEvidenceDelta: CurrentOwnerDeltaCapabilityBinding = {
    ...routeRequiredDelta,
    required_capability_refs: [{
      ...routeRequiredDelta.required_capability_refs![0],
      hard_boundary: 'source_data_evidence',
    }],
  };
  const receipt = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: sourceEvidenceDelta,
    capabilityRegistryReadout: missingRouteReadout(sourceEvidenceDelta),
  });

  assert.equal(receipt.status, 'observed');
  assert.equal(receipt.advisory_reason, null);
  assert.deepEqual(receipt.unavailable_capability_refs, []);
  assert.deepEqual(receipt.optional_fail_open_capability_refs, ['capability:review-source-route']);
});

test('resolved route-required resolution without typed current-owner-delta remains advisory', () => {
  const resolution = resolvedRouteReadout().resolutions[0];
  const execution = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: [resolution],
  });
  const planning = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'planning',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: [resolution],
  });

  assert.equal(execution.status, 'observed');
  assert.equal(execution.advisory_reason, null);
  assert.deepEqual(execution.binding_missing_capability_refs, ['capability:review-source-route']);
  assert.equal(planning.status, 'not_applicable');
  assert.equal(planning.advisory_reason, null);
});

test('route-required resolution binding must match the typed delta and launch context', () => {
  const resolution = resolvedRouteReadout().resolutions[0];
  const inconsistentInputs = [
    {
      name: 'launch stage',
      domainId: 'medautoscience' as const,
      stageId: 'analysis',
      resolution,
    },
    {
      name: 'resolution task or study ref',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: { ...resolution, task_or_study_ref: 'study:other' },
    },
    {
      name: 'binding task or study ref',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: {
        ...resolution,
        current_owner_delta_binding: {
          ...resolution.current_owner_delta_binding,
          task_or_study_ref: 'study:other',
        },
      },
    },
    {
      name: 'resolution stage ref',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: { ...resolution, stage_ref: 'analysis' },
    },
    {
      name: 'binding stage ref',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: {
        ...resolution,
        current_owner_delta_binding: {
          ...resolution.current_owner_delta_binding,
          stage_ref: 'analysis',
        },
      },
    },
    {
      name: 'binding domain',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: {
        ...resolution,
        current_owner_delta_binding: {
          ...resolution.current_owner_delta_binding,
          domain: 'mag',
          domain_id: 'mag',
        },
      },
    },
    {
      name: 'binding delta ref',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: {
        ...resolution,
        current_owner_delta_binding: {
          ...resolution.current_owner_delta_binding,
          current_owner_delta_ref: 'current-owner-delta:mas:other',
        },
      },
    },
    {
      name: 'hard boundary',
      domainId: 'medautoscience' as const,
      stageId: 'review',
      resolution: {
        ...resolution,
        route_required_policy: {
          ...resolution.route_required_policy,
          hard_boundary: 'forbidden_write' as const,
        },
      },
    },
    {
      name: 'launch domain',
      domainId: 'medautogrant' as const,
      stageId: 'review',
      resolution,
    },
  ];

  for (const input of inconsistentInputs) {
    const receipt = buildCapabilityRegistryStageContextReceipt({
      lifecyclePhase: 'execution',
      domainId: input.domainId,
      stageId: input.stageId,
      taskId: 'runtime-task:does-not-equal-study-ref',
      currentOwnerDelta: routeRequiredDelta,
      capabilityRegistryResolutionReceipts: [input.resolution],
    });

    assert.equal(receipt.status, 'observed', input.name);
    assert.equal(receipt.advisory_reason, null, input.name);
    assert.deepEqual(
      receipt.binding_missing_capability_refs,
      ['capability:review-source-route'],
      input.name,
    );
  }

  const allowed = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'runtime-task:does-not-equal-study-ref',
    currentOwnerDelta: routeRequiredDelta,
    capabilityRegistryResolutionReceipts: [resolution],
  });
  assert.equal(allowed.status, 'observed');
  assert.equal(allowed.advisory_reason, null);

  const undeclaredByDelta = buildCapabilityRegistryStageContextReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'runtime-task:does-not-equal-study-ref',
    currentOwnerDelta: {
      ...routeRequiredDelta,
      required_capability_refs: [],
    },
    capabilityRegistryResolutionReceipts: [resolution],
  });
  assert.equal(undeclaredByDelta.status, 'observed');
  assert.equal(undeclaredByDelta.advisory_reason, null);
});

test('malformed current-owner-delta preserves route-required refs as advisory debt', () => {
  const malformedPayloads = [
    { current_owner_delta: {
      ...routeRequiredDelta,
      schema_version: 'malformed-current-owner-delta.v0',
    } },
    { current_owner_delta: {
      ...routeRequiredDelta,
      task_or_study_ref: { malformed: true },
    } },
    {
      current_owner_delta: routeRequiredDelta,
      capability_registry_readout: {
        ...missingRouteReadout(),
        schema_version: 'malformed-capability-readout.v0',
      },
    },
  ];

  for (const payload of malformedPayloads) {
    const gateInput = capabilityRegistryStageContextInputFromPayload(payload, {
      domainId: 'medautoscience',
      stageId: 'review',
      taskId: 'task:capability-gate',
    });

    assert.ok(gateInput);
    const receipt = buildCapabilityRegistryStageContextReceipt(gateInput);
    assert.equal(receipt.status, 'observed');
    assert.equal(receipt.advisory_reason, null);
    assert.deepEqual(
      receipt.route_required_hard_boundary_capability_refs,
      ['capability:review-source-route'],
    );
    assert.deepEqual(receipt.binding_missing_capability_refs, ['capability:review-source-route']);
  }
});

test('explicit malformed capability scope remains advisory unless it proves optional-only', () => {
  const resolvedReadout = resolvedRouteReadout();
  const routeResolution = resolvedReadout.resolutions[0];
  const malformedPayloads = [
    {
      current_owner_delta: {
        ...routeRequiredDelta,
        required_capability_refs: {
          capability_ref: 'capability:review-source-route',
          binding_kind: 'route_required',
        },
      },
    },
    {
      current_owner_delta: {
        ...routeRequiredDelta,
        required_capability_refs: [{
          capability_ref: 'capability:review-source-route',
          binding_kind: 'route_required',
        }],
      },
    },
    {
      current_owner_delta: {
        ...routeRequiredDelta,
        required_capability_refs: [{
          capability_ref: 'capability:review-source-route',
          binding_kind: 'route_required',
          hard_boundary: 'not-a-hard-boundary',
        }],
      },
    },
    {
      capability_registry_resolution: {
        ...routeResolution,
        schema_version: 'malformed-capability-resolution.v0',
        route_required_policy: {
          ...routeResolution.route_required_policy,
          hard_boundary: null,
        },
      },
    },
    {
      capability_registry_readout: {
        ...resolvedReadout,
        schema_version: 'malformed-capability-readout.v0',
        resolutions: { malformed: true },
      },
    },
  ];

  for (const payload of malformedPayloads) {
    const gateInput = capabilityRegistryStageContextInputFromPayload(payload, {
      domainId: 'medautoscience',
      stageId: 'review',
      taskId: 'task:capability-gate',
    });

    assert.ok(gateInput);
    const receipt = buildCapabilityRegistryStageContextReceipt(gateInput);
    assert.equal(receipt.status, 'observed');
    assert.equal(receipt.advisory_reason, null);
  }
});

test('malformed current-owner-delta with optional-only requirements remains fail-open', () => {
  const gateInput = capabilityRegistryStageContextInputFromPayload({
    current_owner_delta: {
      ...routeRequiredDelta,
      schema_version: 'malformed-current-owner-delta.v0',
      required_capability_refs: [{
        capability_ref: 'capability:optional-review-aid',
        binding_kind: 'optional',
      }],
    },
  }, {
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
  });

  assert.ok(gateInput);
  const receipt = buildCapabilityRegistryStageContextReceipt(gateInput);
  assert.equal(receipt.status, 'not_applicable');
  assert.equal(receipt.advisory_reason, null);
  assert.deepEqual(receipt.unavailable_capability_refs, []);

  const optionalDelta: CurrentOwnerDeltaCapabilityBinding = {
    ...routeRequiredDelta,
    required_capability_refs: [{
      capability_ref: 'capability:optional-review-aid',
      binding_kind: 'optional',
    }],
  };
  const optionalResolution = buildCapabilityRegistryReadout({
    registry: emptyRegistry,
    currentOwnerDelta: optionalDelta,
    requestedCapabilities: [{
      capabilityRef: 'capability:optional-review-aid',
      taskOrStudyRef: 'task:capability-gate',
      stageRef: 'review',
      bindingKind: 'optional',
    }],
  }).resolutions[0];
  const malformedOptionalResolutionInput = capabilityRegistryStageContextInputFromPayload({
    capability_registry_resolution: {
      ...optionalResolution,
      schema_version: 'malformed-capability-resolution.v0',
      blocker_candidate: undefined,
      route_required_policy: {
        ...optionalResolution.route_required_policy,
        hard_boundary: undefined,
      },
    },
  }, {
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
  });

  assert.ok(malformedOptionalResolutionInput);
  const malformedOptionalResolutionReceipt = buildCapabilityRegistryStageContextReceipt(
    malformedOptionalResolutionInput,
  );
  assert.equal(malformedOptionalResolutionReceipt.status, 'not_applicable');
  assert.equal(malformedOptionalResolutionReceipt.advisory_reason, null);

  const invalidOptionalBoundaryInput = capabilityRegistryStageContextInputFromPayload({
    current_owner_delta: {
      ...routeRequiredDelta,
      schema_version: 'malformed-current-owner-delta.v0',
      required_capability_refs: [{
        capability_ref: 'capability:optional-review-aid',
        binding_kind: 'optional',
        hard_boundary: 'not-a-hard-boundary',
      }],
    },
  }, {
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
  });
  assert.ok(invalidOptionalBoundaryInput);
  const invalidOptionalBoundaryReceipt = buildCapabilityRegistryStageContextReceipt(
    invalidOptionalBoundaryInput,
  );
  assert.equal(invalidOptionalBoundaryReceipt.status, 'not_applicable');
  assert.equal(invalidOptionalBoundaryReceipt.advisory_reason, null);
  assert.deepEqual(invalidOptionalBoundaryReceipt.unavailable_capability_refs, []);
  assert.equal(
    invalidOptionalBoundaryReceipt.typed_input_status.unproven_explicit_capability_binding,
    false,
  );
});

test('StageAttempt launch binding reservation replaces a preliminary observation once', () => {
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  try {
    const preliminaryBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:preliminary',
      root_package: { package_id: 'mas', content_digest: 'sha256:preliminary' },
    };
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/attempt-binding-reservation',
        domain_pack_root: '/tmp/generation-preliminary',
        package_use_binding: preliminaryBinding,
      },
    }).attempt;
    const firstBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:first',
      root_package: { package_id: 'mas', content_digest: 'sha256:first' },
    };
    const laterBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:later',
      root_package: { package_id: 'mas', content_digest: 'sha256:later' },
    };
    const reserved = persistStageAttemptLaunchBinding(db, attempt, {
      workspaceLocator: {
        ...attempt.workspace_locator,
        domain_pack_root: '/tmp/generation-first',
        package_use_binding: firstBinding,
      },
      packageUseBinding: firstBinding,
      domainPackRoot: '/tmp/generation-first',
    });
    const replay = persistStageAttemptLaunchBinding(db, attempt, {
      workspaceLocator: {
        ...attempt.workspace_locator,
        domain_pack_root: '/tmp/generation-later',
        package_use_binding: laterBinding,
      },
      packageUseBinding: laterBinding,
      domainPackRoot: '/tmp/generation-later',
    });

    assert.notDeepEqual(reserved.workspace_locator.package_use_binding, preliminaryBinding);
    assert.deepEqual(reserved.workspace_locator.package_use_binding, firstBinding);
    assert.equal(
      (reserved.provider_run.execution_package_use_context as { status: string }).status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(replay.workspace_locator, reserved.workspace_locator);
    assert.deepEqual(
      replay.provider_run.execution_package_use_context,
      reserved.provider_run.execution_package_use_context,
    );
  } finally {
    db.close();
  }
});

test('provider-hosted attempt launch fails closed before queueing when its canonical package is absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-gate-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  const now = new Date().toISOString();
  try {
    await assert.rejects(() => ensureProviderHostedStageAttempt(db, {
      task_id: 'task:package-not-installed',
      domain_id: 'medautoscience',
      task_kind: 'test/provider-hosted-package-gate',
      payload_json: '{}',
      dedupe_key: null,
      priority: 0,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      source: 'test',
      requires_approval: 0,
      approved_at: null,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      dead_letter_reason: null,
      created_at: now,
      updated_at: now,
    }, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: path.join(root, 'workspace'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'agent_package_operational_readiness_blocked');
      assert.equal(error.details?.launch_blocked_reason, 'package_not_installed');
      assert.deepEqual(error.details?.allowed_when_blocked, ['status', 'repair']);
      return true;
    });
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts').get() as { count: number }).count, 0);
  } finally {
    db.close();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('provider-hosted attempt launch consumes typed capability readout without creating a stage blocker', async (t) => {
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-launch-family-'));
  const previousFamilyRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousPluginBin = process.env.OPL_CODEX_PLUGIN_BIN;
  const previousPath = process.env.PATH;
  const previousPackagesOwner = process.env.OPL_PACKAGES_OWNER;
  process.env.OPL_FAMILY_WORKSPACE_ROOT = familyRoot;
  process.env.OPL_STATE_DIR = path.join(familyRoot, 'state');
  process.env.CODEX_HOME = path.join(familyRoot, 'codex-home');
  fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
  writeOplDeveloperSupervisorConfig({
    module_source_preferences: { medautoscience: 'managed' },
  });
  const releaseRoot = path.join(familyRoot, 'package-owners');
  const sourceRoot = path.join(releaseRoot, 'source', 'med-autoscience');
  const ownerSourceCommit = 'a'.repeat(40);
  const packageManifest = {
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'mas',
    package_id: 'mas',
    display_name: 'Med Auto Science',
    publisher: 'one-person-lab',
    version: '0.2.1',
    source: 'first_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'med-autoscience',
      carrier_source_commit: ownerSourceCommit,
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: 'med-autoscience@med-autoscience-local',
        executor_route: 'codex_cli',
        marketplace_source: sourceRoot,
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
      },
      required_skill_ids: ['med-autoscience'],
    },
    capability_dependencies: [],
  };
  const packageFiles = {
    '.codex-plugin/plugin.json': `${JSON.stringify({
      name: 'med-autoscience',
      version: '0.2.1',
      skills: './skills/',
    })}\n`,
    '.agents/plugins/marketplace.json': `${JSON.stringify({
      name: 'med-autoscience-local',
      plugins: [{ name: 'med-autoscience', source: { source: 'local', path: './' } }],
    })}\n`,
    'opl-package.json': `${JSON.stringify(packageManifest, null, 2)}\n`,
    'contracts/capability_map.json': `${JSON.stringify({
      surface_kind: 'opl_standard_agent_capability_map',
      capabilities: [{
        capability_id: 'mas-review-fixture',
        surface_role: 'professional_skill',
        capability_kind: 'professional_skill',
        physical_source_ref: {
          ref_kind: 'repo_path',
          ref: 'agent/professional_skills/mas-review-fixture/SKILL.md',
        },
      }],
    }, null, 2)}\n`,
    'agent/professional_skills/mas-review-fixture/SKILL.md': '# MAS review fixture\n',
    'skills/med-autoscience/SKILL.md': '# Med Auto Science\n',
  };
  const packageFixtureEnv = writeManagedRuntimeSourceFixture({
    root: releaseRoot,
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '0.2.1',
    sourceHeadSha: ownerSourceCommit,
    packageManifest,
    payloadManifest: {
      surface_kind: 'opl_package_payload_manifest.v2',
      files: Object.entries(packageFiles).map(([relativePath, content]) => ({
        path: relativePath,
        source_path: relativePath,
        sha256: sha256Fixture(content),
      })),
    },
    sourceFiles: Object.entries(packageFiles).map(([sourcePath, content]) => ({ sourcePath, content })),
  });
  process.env.PATH = packageFixtureEnv.PATH;
  process.env.OPL_PACKAGES_OWNER = packageFixtureEnv.OPL_PACKAGES_OWNER;
  fs.writeFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), [
    '[marketplaces."med-autoscience-local"]',
    `source = ${JSON.stringify(sourceRoot)}`,
    '',
    '[plugins."med-autoscience@med-autoscience-local"]',
    'enabled = true',
    '',
  ].join('\n'), 'utf8');
  process.env.OPL_CODEX_PLUGIN_BIN = createFakeCodexPluginManagerFixture(
    path.join(familyRoot, 'fake-codex-plugin-manager'),
  ).codexPath;
  t.after(() => {
    if (previousFamilyRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousFamilyRoot;
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousPluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousPluginBin;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousPackagesOwner === undefined) delete process.env.OPL_PACKAGES_OWNER;
    else process.env.OPL_PACKAGES_OWNER = previousPackagesOwner;
    removeFixtureTree(familyRoot);
  });
  assert.equal(
    fs.existsSync(path.join(process.env.OPL_STATE_DIR!, 'agent-package-locks.json')),
    false,
  );
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  const now = new Date().toISOString();
  const row: FamilyRuntimeTaskRow = {
    task_id: 'task:capability-gate',
    domain_id: 'medautoscience',
    task_kind: 'test/provider-hosted-capability-gate',
    payload_json: '{}',
    dedupe_key: null,
    priority: 0,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    source: 'test',
    requires_approval: 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const host = await createCordisBaseHeadlessComposition();
    t.after(() => host.dispose());
    const stageRouteOptions = {
      createStageRouteComposition: host.services.childFactories.createStageRouteComposition,
    };
    const readout = missingRouteReadout();
    const attempt = await ensureProviderHostedStageAttempt(db, row, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      current_owner_delta: routeRequiredDelta,
      capability_registry_readout: readout,
      capability_registry_readout_ref: 'opl://capability-readouts/review-source-route',
      capability_registry_resolution: readout.resolutions[0],
      capability_registry_resolution_receipt_ref: 'opl://capability-resolutions/review-source-route',
    }, stageRouteOptions);

    assert.ok(attempt);
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.blocked_reason, null);
    assert.deepEqual(
      (attempt.workspace_locator.native_package_closure as any).skill_projection.skill_ids,
      ['mas-review-fixture'],
    );
    const launchEvent = attempt.activity_events.find((entry: any) => (
      entry.event_kind === 'stage_context_observed'
    ));
    assert.ok(launchEvent);
    assert.equal(launchEvent.observation.status, 'declaration_debt');
    assert.equal(launchEvent.observation.progression_effect, 'stage_may_start');
    assert.equal(launchEvent.observation.capability_registry_context_receipt.status, 'observed');
    assert.deepEqual(
      launchEvent.observation.capability_registry_context_receipt.unavailable_capability_refs,
      ['capability:review-source-route'],
    );
    assert.equal(
      launchEvent.observation.capability_registry_context_receipt.typed_input_status.capability_registry_resolution_receipt_count,
      1,
    );
    assert.equal(
      JSON.stringify(launchEvent.observation).includes(emptyRegistry.registry_id),
      false,
    );
    assert.equal(
      launchEvent.observation.capability_registry_context_receipt.authority_boundary.can_create_domain_typed_blocker,
      false,
    );

    const nextAttempt = await ensureProviderHostedStageAttempt(db, row, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      current_owner_delta: routeRequiredDelta,
      capability_registry_readout: readout,
      capability_registry_readout_ref: 'opl://capability-readouts/review-source-route',
      capability_registry_resolution: readout.resolutions[0],
      capability_registry_resolution_receipt_ref: 'opl://capability-resolutions/review-source-route',
    }, {
      ...stageRouteOptions,
      newAttempt: true,
    });
    assert.ok(nextAttempt);
    assert.notEqual(nextAttempt.stage_attempt_id, attempt.stage_attempt_id);
    const firstUseBinding = attempt.workspace_locator.package_use_binding as Record<string, unknown>;
    const nextUseBinding = nextAttempt.workspace_locator.package_use_binding as Record<string, unknown>;
    assert.equal(firstUseBinding.surface_kind, 'opl_agent_package_use_binding.v1');
    assert.equal(firstUseBinding.binding_origin, 'installed_native_carrier');
    assert.equal(firstUseBinding.scope, 'workspace');
    assert.equal(firstUseBinding.target_root, familyRoot);
    assert.equal(typeof firstUseBinding.use_boundary_id, 'string');
    assert.equal(nextUseBinding.surface_kind, 'opl_agent_package_use_binding.v1');
    assert.equal(nextUseBinding.binding_origin, 'installed_native_carrier');
    assert.notEqual(nextUseBinding.use_boundary_id, firstUseBinding.use_boundary_id);
    assert.equal(Object.hasOwn(firstUseBinding, 'use_receipt_ref'), false);
    assert.equal(Object.hasOwn(nextUseBinding, 'use_receipt_ref'), false);

    let nestedProviderIdentity: Record<string, unknown> = {
      status: 'provider_attempt_pending',
      route_identity_key: 'route:compact-provider-identity',
      attempt_idempotency_key: 'attempt:compact-provider-identity',
    };
    for (let depth = 0; depth < 48; depth += 1) {
      nestedProviderIdentity = {
        status: 'provider_attempt_pending',
        route_identity_key: 'route:compact-provider-identity',
        attempt_idempotency_key: 'attempt:compact-provider-identity',
        nested_provider_attempt_identity: nestedProviderIdentity,
        legacy_payload: 'x'.repeat(4_096),
      };
    }
    const compactIdentityAttempt = await ensureProviderHostedStageAttempt(db, {
      ...row,
      task_id: 'task:compact-provider-attempt-identity',
    }, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      work_unit_id: 'review-current-output',
      work_unit_fingerprint: 'sha256:review-current-output',
      source_fingerprint: 'sha256:compact-provider-attempt-identity',
      provider_attempt_identity: nestedProviderIdentity,
    }, stageRouteOptions);
    assert.ok(compactIdentityAttempt);
    assert.deepEqual(compactIdentityAttempt.workspace_locator.provider_attempt_identity, {
      status: 'provider_attempt_pending',
      schema_source: null,
      generated_at: null,
      source_fingerprint: 'sha256:compact-provider-attempt-identity',
      work_unit_id: 'review-current-output',
      work_unit_fingerprint: 'sha256:review-current-output',
      action_fingerprint: null,
      truth_epoch: null,
      runtime_health_epoch: null,
      source_eval_id: null,
      runtime_digest: null,
      stable_truth_digest: null,
      volatile_projection_digest: null,
      work_unit_digest: null,
      stage_packet_ref: null,
      stage_packet_refs: [],
      route_identity_key: 'route:compact-provider-identity',
      attempt_idempotency_key: 'attempt:compact-provider-identity',
      recovery_obligation_id: null,
    });
    const compactLocatorJson = JSON.stringify(compactIdentityAttempt.workspace_locator);
    assert.equal(compactLocatorJson.includes('nested_provider_attempt_identity'), false);
    assert.equal(compactLocatorJson.includes('legacy_payload'), false);
    assert.ok(compactLocatorJson.length < 16_384);

    const resolutionOnlyAttempt = await ensureProviderHostedStageAttempt(db, {
      ...row,
      task_id: 'task:resolved-route-without-current-delta',
    }, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      capability_registry_resolution: resolvedRouteReadout().resolutions[0],
      capability_registry_resolution_receipt_ref: 'opl://capability-resolutions/resolved-review-source-route',
    }, stageRouteOptions);
    assert.ok(resolutionOnlyAttempt);
    assert.equal(resolutionOnlyAttempt.status, 'queued');
    assert.equal(resolutionOnlyAttempt.blocked_reason, null);

    const stageADelta: CurrentOwnerDeltaCapabilityBinding = {
      ...routeRequiredDelta,
      delta_id: 'current-owner-delta:mas:stage-a',
      stage_ref: 'stage-a',
      required_capability_refs: [{
        ...routeRequiredDelta.required_capability_refs![0],
        required_by_delta_ref: 'current-owner-delta:mas:stage-a',
      }],
    };
    const stageAResolution = buildCapabilityRegistryReadout({
      registry: registryWithRequiredRoute,
      currentOwnerDelta: stageADelta,
      requestedCapabilities: [{
        capabilityRef: 'capability:review-source-route',
        taskOrStudyRef: 'task:capability-gate',
        stageRef: 'stage-a',
        bindingKind: 'route_required',
      }],
    }).resolutions[0];
    const crossStageAttempt = await ensureProviderHostedStageAttempt(db, {
      ...row,
      task_id: 'runtime-task:cross-stage-replay',
    }, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      current_owner_delta: stageADelta,
      capability_registry_resolution: stageAResolution,
      capability_registry_resolution_receipt_ref: 'opl://capability-resolutions/stage-a',
    }, stageRouteOptions);
    assert.ok(crossStageAttempt);
    assert.equal(crossStageAttempt.status, 'queued');
    assert.equal(crossStageAttempt.blocked_reason, null);
  } finally {
    db.close();
  }
});
