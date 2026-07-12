import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCapabilityRegistryReadout,
  type CapabilityRegistryCatalog,
  type CurrentOwnerDeltaCapabilityBinding,
} from '../../src/modules/connect/capability-registry-resolver.ts';
import { runOplAgentPackageInstall } from '../../src/modules/connect/agent-package-registry.ts';
import {
  writeCapabilityProvider,
  writeMasConsumer,
} from './cli/cases/packages-cases/capability-fixtures.ts';
import { ensureProviderHostedStageAttempt } from '../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import {
  buildCapabilityRegistryLaunchGateReceipt,
  capabilityRegistryLaunchGateInputFromPayload,
} from '../../src/modules/runway/family-runtime-stage-admission-gate.ts';
import {
  createFamilyRuntimeQueueTables,
  type FamilyRuntimeTaskRow,
} from '../../src/modules/runway/family-runtime-store.ts';

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
    hard_boundary: 'source_data_evidence',
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

test('capability launch gate is not applicable during planning without current delta or typed readout', () => {
  const receipt = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'planning',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
  });

  assert.equal(receipt.status, 'not_applicable');
  assert.equal(receipt.blocked_reason, null);
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
  const receipt = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: optionalDelta,
    capabilityRegistryResolutionReceipts: readout.resolutions,
    capabilityRegistryResolutionReceiptRefs: ['opl://capability-resolutions/optional-review-aid'],
  });

  assert.equal(receipt.status, 'allowed');
  assert.equal(receipt.blocked_reason, null);
  assert.equal(receipt.typed_input_status.capability_registry_readout, 'missing');
  assert.equal(receipt.typed_input_status.capability_registry_resolution_receipt_count, 1);
  assert.deepEqual(
    receipt.input_refs.capability_registry_resolution_receipt_refs,
    ['opl://capability-resolutions/optional-review-aid'],
  );
  assert.deepEqual(receipt.optional_fail_open_capability_refs, ['capability:optional-review-aid']);
  assert.deepEqual(receipt.blocked_capability_refs, []);

  const withoutCurrentDelta = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: readout.resolutions,
  });
  assert.equal(withoutCurrentDelta.status, 'allowed');
  assert.equal(withoutCurrentDelta.blocked_reason, null);
});

test('capability launch gate blocks execution for route-required hard-boundary misses and missing binding', () => {
  const missingCapability = buildCapabilityRegistryLaunchGateReceipt({
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
  const missingBinding = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    currentOwnerDelta: routeRequiredDelta,
    capabilityRegistryReadout: unboundReadout,
  });

  assert.equal(missingCapability.status, 'blocked');
  assert.equal(missingCapability.blocked_reason, 'capability_registry_route_required_hard_boundary_missing');
  assert.deepEqual(missingCapability.blocked_capability_refs, ['capability:review-source-route']);
  assert.equal(missingBinding.status, 'blocked');
  assert.equal(missingBinding.blocked_reason, 'capability_registry_route_required_binding_missing');
});

test('resolved route-required resolution cannot authorize execution without typed current-owner-delta', () => {
  const resolution = resolvedRouteReadout().resolutions[0];
  const execution = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: [resolution],
  });
  const planning = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'planning',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'task:capability-gate',
    capabilityRegistryResolutionReceipts: [resolution],
  });

  assert.equal(execution.status, 'blocked');
  assert.equal(execution.blocked_reason, 'capability_registry_route_required_binding_missing');
  assert.deepEqual(execution.binding_missing_capability_refs, ['capability:review-source-route']);
  assert.equal(planning.status, 'not_applicable');
  assert.equal(planning.blocked_reason, null);
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
    const receipt = buildCapabilityRegistryLaunchGateReceipt({
      lifecyclePhase: 'execution',
      domainId: input.domainId,
      stageId: input.stageId,
      taskId: 'runtime-task:does-not-equal-study-ref',
      currentOwnerDelta: routeRequiredDelta,
      capabilityRegistryResolutionReceipts: [input.resolution],
    });

    assert.equal(receipt.status, 'blocked', input.name);
    assert.equal(
      receipt.blocked_reason,
      'capability_registry_route_required_binding_missing',
      input.name,
    );
    assert.deepEqual(
      receipt.binding_missing_capability_refs,
      ['capability:review-source-route'],
      input.name,
    );
  }

  const allowed = buildCapabilityRegistryLaunchGateReceipt({
    lifecyclePhase: 'execution',
    domainId: 'medautoscience',
    stageId: 'review',
    taskId: 'runtime-task:does-not-equal-study-ref',
    currentOwnerDelta: routeRequiredDelta,
    capabilityRegistryResolutionReceipts: [resolution],
  });
  assert.equal(allowed.status, 'allowed');
  assert.equal(allowed.blocked_reason, null);

  const undeclaredByDelta = buildCapabilityRegistryLaunchGateReceipt({
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
  assert.equal(undeclaredByDelta.status, 'blocked');
  assert.equal(
    undeclaredByDelta.blocked_reason,
    'capability_registry_route_required_binding_missing',
  );
});

test('malformed current-owner-delta envelope preserves route-required hard-boundary refs and blocks execution', () => {
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
    const gateInput = capabilityRegistryLaunchGateInputFromPayload(payload, {
      domainId: 'medautoscience',
      stageId: 'review',
      taskId: 'task:capability-gate',
    });

    assert.ok(gateInput);
    const receipt = buildCapabilityRegistryLaunchGateReceipt(gateInput);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.blocked_reason, 'capability_registry_route_required_binding_missing');
    assert.deepEqual(
      receipt.route_required_hard_boundary_capability_refs,
      ['capability:review-source-route'],
    );
    assert.deepEqual(receipt.binding_missing_capability_refs, ['capability:review-source-route']);
  }
});

test('explicit malformed capability scope blocks unless it proves optional-only', () => {
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
    const gateInput = capabilityRegistryLaunchGateInputFromPayload(payload, {
      domainId: 'medautoscience',
      stageId: 'review',
      taskId: 'task:capability-gate',
    });

    assert.ok(gateInput);
    const receipt = buildCapabilityRegistryLaunchGateReceipt(gateInput);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.blocked_reason, 'capability_registry_route_required_binding_missing');
  }
});

test('malformed current-owner-delta with optional-only requirements remains fail-open', () => {
  const gateInput = capabilityRegistryLaunchGateInputFromPayload({
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
  const receipt = buildCapabilityRegistryLaunchGateReceipt(gateInput);
  assert.equal(receipt.status, 'not_applicable');
  assert.equal(receipt.blocked_reason, null);
  assert.deepEqual(receipt.blocked_capability_refs, []);

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
  const malformedOptionalResolutionInput = capabilityRegistryLaunchGateInputFromPayload({
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
  const malformedOptionalResolutionReceipt = buildCapabilityRegistryLaunchGateReceipt(
    malformedOptionalResolutionInput,
  );
  assert.equal(malformedOptionalResolutionReceipt.status, 'not_applicable');
  assert.equal(malformedOptionalResolutionReceipt.blocked_reason, null);

  const invalidOptionalBoundaryInput = capabilityRegistryLaunchGateInputFromPayload({
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
  const invalidOptionalBoundaryReceipt = buildCapabilityRegistryLaunchGateReceipt(
    invalidOptionalBoundaryInput,
  );
  assert.equal(invalidOptionalBoundaryReceipt.status, 'not_applicable');
  assert.equal(invalidOptionalBoundaryReceipt.blocked_reason, null);
  assert.deepEqual(invalidOptionalBoundaryReceipt.blocked_capability_refs, []);
  assert.equal(
    invalidOptionalBoundaryReceipt.typed_input_status.unproven_explicit_capability_binding,
    false,
  );
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
      assert.deepEqual(error.details?.allowed_when_blocked, ['status', 'doctor', 'repair']);
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

test('provider-hosted attempt launch consumes typed capability readout and records blocking gate receipt', async (t) => {
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-launch-family-'));
  const previousFamilyRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPL_FAMILY_WORKSPACE_ROOT = familyRoot;
  process.env.OPL_STATE_DIR = path.join(familyRoot, 'state');
  process.env.CODEX_HOME = path.join(familyRoot, 'codex-home');
  t.after(() => {
    if (previousFamilyRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousFamilyRoot;
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(familyRoot, { recursive: true, force: true });
  });
  const providerManifest = writeCapabilityProvider(path.join(familyRoot, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(familyRoot, 'consumer'), providerManifest);
  await runOplAgentPackageInstall({
    manifestUrl: consumerManifest,
    trustTier: 'first_party',
    scope: 'workspace',
    targetWorkspace: familyRoot,
  });
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
    });

    assert.ok(attempt);
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'capability_registry_route_required_hard_boundary_missing');
    const launchEvent = attempt.activity_events.find((entry: any) => (
      entry.event_kind === 'stage_launch_admission_gate'
    ));
    assert.ok(launchEvent);
    assert.equal(launchEvent.gate.status, 'blocked');
    assert.equal(launchEvent.gate.capability_registry_gate_receipt.status, 'blocked');
    assert.deepEqual(
      launchEvent.gate.capability_registry_gate_receipt.blocked_capability_refs,
      ['capability:review-source-route'],
    );
    assert.equal(
      launchEvent.gate.capability_registry_gate_receipt.typed_input_status.capability_registry_resolution_receipt_count,
      1,
    );
    assert.equal(
      JSON.stringify(launchEvent.gate).includes(emptyRegistry.registry_id),
      false,
    );
    assert.equal(
      launchEvent.gate.capability_registry_gate_receipt.authority_boundary.can_create_domain_typed_blocker,
      false,
    );

    const resolutionOnlyAttempt = await ensureProviderHostedStageAttempt(db, {
      ...row,
      task_id: 'task:resolved-route-without-current-delta',
    }, {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'review',
      workspace_root: familyRoot,
      capability_registry_resolution: resolvedRouteReadout().resolutions[0],
      capability_registry_resolution_receipt_ref: 'opl://capability-resolutions/resolved-review-source-route',
    });
    assert.ok(resolutionOnlyAttempt);
    assert.equal(resolutionOnlyAttempt.status, 'blocked');
    assert.equal(
      resolutionOnlyAttempt.blocked_reason,
      'capability_registry_route_required_binding_missing',
    );

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
    });
    assert.ok(crossStageAttempt);
    assert.equal(crossStageAttempt.status, 'blocked');
    assert.equal(
      crossStageAttempt.blocked_reason,
      'capability_registry_route_required_binding_missing',
    );
  } finally {
    db.close();
  }
});
