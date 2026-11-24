import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeOplDeveloperSupervisorConfig } from '../../../src/kernel/system-preferences.ts';
import {
  buildCapabilityRegistryReadout,
  type CapabilityRegistryCatalog,
  type CurrentOwnerDeltaCapabilityBinding,
} from '../../../src/adapters/integration/capability-registry-resolver.ts';
import { sha256Fixture } from '../cli/cases/packages-cases/helpers.ts';
import { writeManagedRuntimeSourceFixture } from '../cli/cases/packages-cases/managed-runtime-source-fixture.ts';
import { createFakeCodexPluginManagerFixture } from '../cli/helpers/fixtures.ts';
import { removeFixtureTree } from '../cli/helpers/filesystem.ts';
import {
  DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  ensureProviderHostedStageAttempt,
  findBlockingLiveDefaultExecutorWorkUnitAttempt,
} from '../../../src/adapters/execution/family-runtime-provider-hosted-attempts.ts';
import { createCordisBaseHeadlessComposition } from '../../../src/host/composition-profiles.ts';
import { createStageAttempt, createStageAttemptTable } from '../../../src/adapters/execution/family-runtime-stage-attempts.ts';
import {
  createFamilyRuntimeQueueTables,
  type FamilyRuntimeTaskRow,
} from '../../../src/adapters/execution/family-runtime-store.ts';
import { resolveFamilyRuntimeProviderKind } from '../../../src/adapters/execution/family-runtime-providers.ts';

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

export function registerDefaultExecutorAdmissionTest() {
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
}

export function registerProviderHostedLaunchTests() {
test('provider-hosted attempt launch fails closed before queueing when its canonical package is absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-gate-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
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
}
