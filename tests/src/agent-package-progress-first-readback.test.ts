import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  agentPackageLifecycleUxReadback,
  ownerRouteReadback,
} from '../../src/modules/connect/agent-package-registry-parts/readback.ts';
import {
  scopeMaterializationReadiness,
} from '../../src/modules/connect/agent-package-registry-parts/scope-materialization.ts';
import {
  materializeAgentPackageSkillProjection,
} from '../../src/modules/connect/agent-package-registry-parts/skill-projection.ts';
import { hostAttemptSkillRuntime } from '../../src/modules/runway/family-runtime-attempt-skill-projection.ts';
import { createFakeCodexFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';
import type {
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManagedPolicyCurrentness,
} from '../../src/modules/connect/agent-package-registry-parts/types.ts';

function carrierLock() {
  const ownerSourceCommit = 'a'.repeat(40);
  const catalogSha256 = `sha256:${'b'.repeat(64)}`;
  return {
    package_id: 'fixture.mas',
    source_kind: 'first_party_managed_cohort',
    owner_source_commit: ownerSourceCommit,
    release_channel_ref: 'opl://release-set/stable',
    release_channel_digest: catalogSha256,
    action_receipt_id: 'opl://agent-package/install/fixture.mas/current',
    carrier_authority: {
      surface_kind: 'opl_agent_package_carrier_authority.v1',
      status: 'verified',
      catalog_ref: 'opl://release-set/stable',
      catalog_sha256: catalogSha256,
      catalog_owner_source_commit: ownerSourceCommit,
      manifest_carrier_source_commit: ownerSourceCommit,
      payload_source_commit: ownerSourceCommit,
      verified_source_commit: ownerSourceCommit,
    },
    capability_dependencies: [],
  } as unknown as AgentPackageLock;
}

function policyCurrentness(status: 'drifted' | 'invalid'): AgentPackageManagedPolicyCurrentness {
  return {
    surface_kind: 'opl_package_managed_policy_currentness',
    status,
    policy_kind: 'opl_flow_workflow_policy',
    policy_path: '/tmp/fixture-policy.json',
    schema_path: '/tmp/fixture-policy.schema.json',
    expected_policy_sha256: `sha256:${'c'.repeat(64)}`,
    actual_policy_sha256: status === 'drifted' ? `sha256:${'d'.repeat(64)}` : null,
    inventory_digest: null,
    enabled_migration_ids: [],
    detected_conflicts: [],
    dependency_sync: null,
    repair_command: 'opl packages repair --package-id fixture.opl-flow',
    reason: status === 'drifted'
      ? 'Managed policy currentness changed after activation.'
      : 'Managed policy runtime path is unavailable.',
  };
}

test('carrier receipt and policy currentness drift remain observations', () => {
  const lock = carrierLock();
  const receiptDrift = agentPackageLifecycleUxReadback({
    packageId: 'fixture.mas',
    lock,
    receipt: null,
  });
  const carrierCondition = receiptDrift.conditions.find(
    (condition) => condition.condition_id === 'carrier_authority_invalid',
  );
  assert.equal(receiptDrift.status, 'installed');
  assert.equal(receiptDrift.recommended_action, null);
  assert.equal(carrierCondition?.status, 'ok');
  assert.equal(carrierCondition?.action_ref, null);
  assert.match(carrierCondition?.reason ?? '', /lifecycle_receipt_missing/);
  const ownerReadback = ownerRouteReadback({
    selectedPackageId: 'fixture.mas',
    packages: [{ packageId: 'fixture.mas', lock, receipt: null }],
  }).packages[0];
  assert.equal(ownerReadback.carrier_authority_readiness.status, 'invalid');
  assert.equal(ownerReadback.operational_ready, true);
  assert.equal(ownerReadback.launch_allowed, true);
  assert.equal(ownerReadback.launch_blocked_reason, null);

  const policyDrift = agentPackageLifecycleUxReadback({
    packageId: 'fixture.opl-flow',
    lock: {
      package_id: 'fixture.opl-flow',
      source_kind: 'registry_manifest',
      capability_dependencies: [],
    } as unknown as AgentPackageLock,
    managedPolicyCurrentness: policyCurrentness('drifted'),
  });
  const policyCondition = policyDrift.conditions.find(
    (condition) => condition.condition_id === 'managed_policy_drift_detected',
  );
  assert.equal(policyDrift.status, 'installed');
  assert.equal(policyDrift.recommended_action, null);
  assert.equal(policyCondition?.status, 'ok');
  assert.equal(policyCondition?.action_ref, null);
});

test('invalid managed policy runtime remains a hard lifecycle condition', () => {
  const invalidPolicy = agentPackageLifecycleUxReadback({
    packageId: 'fixture.opl-flow',
    lock: {
      package_id: 'fixture.opl-flow',
      source_kind: 'registry_manifest',
      capability_dependencies: [],
    } as unknown as AgentPackageLock,
    managedPolicyCurrentness: policyCurrentness('invalid'),
  });
  const condition = invalidPolicy.conditions.find(
    (entry) => entry.condition_id === 'managed_policy_drift_detected',
  );
  assert.equal(invalidPolicy.status, 'attention_needed');
  assert.equal(invalidPolicy.recommended_action, 'repair');
  assert.equal(condition?.status, 'attention_needed');
  assert.equal(condition?.action_ref, 'repair');
});

test('scope readiness observes digest receipt and provider lock drift but still requires core Skills', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-scope-readback-'));
  const skillRoot = path.join(targetRoot, '.codex', 'skills', 'required-skill');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# Required Skill\n', 'utf8');
  const materialization = {
    scope: 'workspace' as const,
    target_root: targetRoot,
    provider_package_id: 'fixture.provider',
    provider_lock_ref: 'opl://agent-package/fixture.provider/old-generation',
    transaction_id: 'fixture-transaction',
    required_skill_ids: ['required-skill'],
    managed_skill_ids: ['required-skill'],
    specialty_skill_ids: [],
    retired_skill_ids: [],
    skill_digests: { 'required-skill': `sha256:${'0'.repeat(64)}` },
    content_digest: `sha256:${'0'.repeat(64)}`,
    core_digest: `sha256:${'0'.repeat(64)}`,
    full_export_digest: `sha256:${'0'.repeat(64)}`,
    materialized_at: '2026-07-17T00:00:00.000Z',
    lifecycle_receipt_ref: 'pending_dependency_transaction',
  };
  const consumer = {
    package_id: 'fixture.consumer',
    capability_dependencies: [{ package_id: 'fixture.provider' }],
    scope_materializations: [materialization],
  } as unknown as AgentPackageLock;
  const provider = {
    package_id: 'fixture.provider',
    lock_ref: 'opl://agent-package/fixture.provider/current-generation',
    capability_provider: {
      exports: [{ skill_id: 'required-skill', install_mode: 'core_required' }],
    },
  } as unknown as AgentPackageLock;
  const index = {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [consumer, provider],
  } satisfies AgentPackageLockIndex;

  try {
    const observedDrift = scopeMaterializationReadiness(consumer, index, {
      scope: 'workspace',
      targetWorkspace: targetRoot,
    });
    assert.equal(observedDrift.status, 'current');
    assert.equal(observedDrift.core_readiness.status, 'current');
    assert.notEqual(observedDrift.actual_digest, observedDrift.expected_digest);
    assert.equal(observedDrift.lifecycle_receipt_ref, 'pending_dependency_transaction');

    const noReceiptRecord = scopeMaterializationReadiness({
      ...consumer,
      scope_materializations: [],
    }, index, {
      scope: 'workspace',
      targetWorkspace: targetRoot,
    });
    assert.equal(noReceiptRecord.status, 'current');
    assert.equal(noReceiptRecord.core_readiness.status, 'current');
    assert.equal(noReceiptRecord.lifecycle_receipt_ref, null);

    fs.rmSync(skillRoot, { recursive: true, force: true });
    const missingSkill = scopeMaterializationReadiness(consumer, index, {
      scope: 'workspace',
      targetWorkspace: targetRoot,
    });
    assert.equal(missingSkill.status, 'missing');
    assert.equal(missingSkill.core_readiness.status, 'missing');

    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# Required Skill\n', 'utf8');
    const missingProvider = scopeMaterializationReadiness(consumer, {
      ...index,
      packages: [consumer],
    }, {
      scope: 'workspace',
      targetWorkspace: targetRoot,
    });
    assert.equal(missingProvider.status, 'incompatible');
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
}

test('package use materializes one immutable root and specialist Skill generation for Codex', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-skill-projection-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const rootPlugin = path.join(fixtureRoot, 'root-plugin');
  const providerPlugin = path.join(fixtureRoot, 'provider-plugin');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousHome = process.env.HOME;
  try {
    for (const [pluginRoot, skillId, body] of [
      [rootPlugin, 'fixture-agent', 'Root agent generation one.'],
      [providerPlugin, 'fixture-core', 'Core capability generation one.'],
      [providerPlugin, 'fixture-specialty', 'Specialty generation one.'],
    ]) {
      const skillRoot = path.join(pluginRoot, 'skills', skillId);
      fs.mkdirSync(skillRoot, { recursive: true });
      fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), [
        '---',
        `name: ${skillId}`,
        `description: ${body}`,
        '---',
        '',
        body,
        '',
      ].join('\n'));
    }
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.HOME = path.join(fixtureRoot, 'real-home');
    process.env.CODEX_HOME = path.join(fixtureRoot, 'real-codex-home');
    const rootLock = {
      package_id: 'fixture-agent-package',
      lock_ref: 'opl://agent-package/fixture-agent-package/generation-one',
      source_kind: 'first_party_managed_cohort',
      bundled_required_skill_ids: ['fixture-agent'],
      physical_surface: { plugin_source_path: rootPlugin },
    } as unknown as AgentPackageLock;
    const providerLock = {
      package_id: 'fixture-provider-package',
      lock_ref: 'opl://agent-package/fixture-provider-package/generation-one',
      source_kind: 'first_party_managed_cohort',
      physical_surface: { plugin_source_path: providerPlugin },
      capability_provider: {
        exports: [
          { skill_id: 'fixture-core', install_mode: 'core_required' },
          { skill_id: 'fixture-specialty', install_mode: 'optional_named_specialty' },
        ],
      },
    } as unknown as AgentPackageLock;
    const plannedProjection = materializeAgentPackageSkillProjection({
      root: rootLock,
      providers: [providerLock],
      dryRun: true,
    });
    assert.ok(plannedProjection);
    assert.equal(plannedProjection.status, 'planned_no_write');
    assert.equal(fs.existsSync(stateRoot), false);

    const projection = materializeAgentPackageSkillProjection({
      root: rootLock,
      providers: [providerLock],
      dryRun: false,
    });
    assert.ok(projection);
    assert.equal(projection.status, 'materialized');
    assert.deepEqual(projection.root_skill_ids, ['fixture-agent']);
    assert.deepEqual(projection.core_skill_ids, ['fixture-agent', 'fixture-core']);
    assert.deepEqual(projection.specialty_skill_ids, ['fixture-specialty']);
    assert.deepEqual(projection.skill_ids, ['fixture-agent', 'fixture-core', 'fixture-specialty']);
    assert.match(projection.core_digest, /^sha256:[a-f0-9]{64}$/);
    assert.match(projection.full_export_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(
      fs.readFileSync(path.join(projection.skills_root, 'fixture-agent', 'SKILL.md'), 'utf8').includes('generation one'),
      true,
    );
    assert.equal(fs.statSync(projection.projection_root).mode & 0o222, 0);
    assert.equal(fs.statSync(path.join(projection.skills_root, 'fixture-agent', 'SKILL.md')).mode & 0o222, 0);

    fs.writeFileSync(
      path.join(rootPlugin, 'skills', 'fixture-agent', 'SKILL.md'),
      '---\nname: fixture-agent\ndescription: Changed later.\n---\nChanged later.\n',
    );
    assert.equal(
      fs.readFileSync(path.join(projection.skills_root, 'fixture-agent', 'SKILL.md'), 'utf8').includes('generation one'),
      true,
    );

    const runtime = hostAttemptSkillRuntime({
      workspace_locator: {
        package_use_binding: { skill_projection: projection },
      },
    });
    assert.ok(runtime);
    assert.equal(runtime.env.HOME, projection.projection_root);
    assert.equal(runtime.env.CODEX_HOME, process.env.CODEX_HOME);
    assert.equal(runtime.shellHome, process.env.HOME);
    assert.deepEqual(
      runtime.packageSkillBindings.map((entry) => entry.name),
      projection.skill_ids,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    makeTreeWritable(fixtureRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('hosted Codex Attempt reads the bound Skill generation without replacing the user Codex home', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-skill-hosted-attempt-'));
  const sourceRoot = path.join(fixtureRoot, 'plugin');
  const stateRoot = path.join(fixtureRoot, 'state');
  const invocationLog = path.join(fixtureRoot, 'invocation.log');
  const skillRoot = path.join(sourceRoot, 'skills', 'fixture-hosted-agent');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), [
    '---',
    'name: fixture-hosted-agent',
    'description: Use for the hosted package Skill projection fixture.',
    '---',
    '',
    'Use the immutable hosted fixture instructions.',
    '',
  ].join('\n'));
  const closeout = JSON.stringify({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-package-skill-projection',
    closeout_refs: ['artifact:fixture'],
    consumed_refs: ['packet:fixture'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    authority_boundary: { opl: 'transport_only', domain: 'fixture_owner' },
  });
  const script = [
    `printf 'HOME=%s\\nCODEX_HOME=%s\\nARGS=%s\\n' "$HOME" "$CODEX_HOME" "$*" > ${JSON.stringify(invocationLog)}`,
    'printf \'{"type":"thread.started","thread_id":"thread-package-skill"}\\n\'',
    `printf '%s\\n' ${JSON.stringify(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', id: 'message-package-skill', text: closeout },
    }))}`,
    'printf \'{"type":"turn.completed"}\\n\'',
  ].join('\n');
  const fakeCodex = createFakeCodexFixture(script);
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousSandbox = process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CODEX_BIN = fakeCodex.codexPath;
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'host';
    const lock = {
      package_id: 'fixture-hosted-package',
      lock_ref: 'opl://agent-package/fixture-hosted-package/generation-one',
      source_kind: 'first_party_managed_cohort',
      bundled_required_skill_ids: ['fixture-hosted-agent'],
      physical_surface: { plugin_source_path: sourceRoot },
    } as unknown as AgentPackageLock;
    const projection = materializeAgentPackageSkillProjection({
      root: lock,
      providers: [],
      dryRun: false,
    });
    assert.ok(projection);
    const expectedCodexHome = process.env.CODEX_HOME?.trim()
      || path.join(process.env.HOME?.trim() || os.homedir(), '.codex');
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat-package-skill-projection',
        stage_id: 'fixture-stage',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: fakeCodex.fixtureRoot,
          package_use_binding: { skill_projection: projection },
        },
        checkpoint_refs: ['packet:fixture'],
      },
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    assert.equal(receipt.closeout_packet?.stage_attempt_id, 'sat-package-skill-projection');
    const invocation = fs.readFileSync(invocationLog, 'utf8');
    assert.match(invocation, new RegExp(`HOME=${projection.projection_root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(invocation, new RegExp(`CODEX_HOME=${expectedCodexHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(invocation, /skills\.config=\[\{name="fixture-hosted-agent",enabled=false\}/);
    assert.match(invocation, /shell_environment_policy\.set\.HOME=/);
    assert.match(invocation, /\$fixture-hosted-agent/);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousCodexBin === undefined) delete process.env.OPL_CODEX_BIN;
    else process.env.OPL_CODEX_BIN = previousCodexBin;
    if (previousSandbox === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previousSandbox;
    makeTreeWritable(fixtureRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fakeCodex.fixtureRoot, { recursive: true, force: true });
  }
});
