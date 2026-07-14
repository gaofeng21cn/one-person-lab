import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  scholarSkillsCoreSkillIds,
  scholarSkillsSpecialtySkillIds,
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';
import {
  assertAgentPackageUseBindingCarrierAuthority,
} from '../../../../src/modules/connect/agent-package-registry-parts/carrier-authority.ts';
import { packageLaunchHardStopReason } from '../../../../src/modules/runway/family-runtime-package-readiness.ts';

test('package conformance and materialization gaps are quality debt when runtime source remains usable', () => {
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    package_dependency_readiness: { status: 'incompatible', operational_ready: false },
    materialization_readiness: { status: 'missing' },
    runtime_source_readiness: { status: 'current', operational_ready: true },
  }), null);
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    runtime_source_readiness: {
      status: 'missing',
      operational_ready: false,
      reason: 'managed_runtime_source_missing',
    },
  }), 'managed_runtime_source_missing');
});

function createArgs(workspace: string) {
  return [
    'family-runtime', 'attempt', 'create',
    '--domain', 'medautoscience',
    '--stage', 'scout',
    '--provider', 'temporal',
    '--workspace-locator', JSON.stringify({ workspace_root: workspace }),
    '--source-fingerprint', 'sha256:package-readiness-gate',
  ];
}

function createQuestArgs(quest: string) {
  return [
    'family-runtime', 'attempt', 'create',
    '--domain', 'medautoscience',
    '--stage', 'scout',
    '--provider', 'temporal',
    '--workspace-locator', JSON.stringify({ scope: 'quest', quest_root: quest }),
    '--source-fingerprint', 'sha256:quest-package-readiness-gate',
  ];
}

function createSessionArgs(workspace: string, sessionId: string) {
  return [
    'family-runtime', 'attempt', 'create',
    '--domain', 'medautoscience',
    '--stage', 'scout',
    '--provider', 'temporal',
    '--workspace-locator', JSON.stringify({
      workspace_root: workspace,
      launch_request_id: sessionId,
    }),
    '--source-fingerprint', `sha256:package-use-${sessionId}`,
  ];
}

function assertNoAttemptWasQueued(stateRoot: string, env: Record<string, string>) {
  const attempts = runCli([
    'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
  ], env).family_runtime_stage_attempts;
  assert.equal(attempts.summary.total, 0);
  assert.deepEqual(attempts.attempts, []);
}

test('family-runtime attempt create fails closed when the canonical domain package is not installed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-package-not-installed-'));
  const workspace = path.join(root, 'workspace');
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    const failure = runCliFailure(createArgs(workspace), env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_not_installed');
    assert.deepEqual(failure.payload.error.details.allowed_when_blocked, ['status', 'doctor', 'repair']);
    assertNoAttemptWasQueued(env.OPL_STATE_DIR, env);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime keeps duplicate create idempotent and restores the pinned scope at start', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-package-scope-drift-'));
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    const existingAttempt = runCli(createArgs(workspace), env)
      .family_runtime_stage_attempt.attempt;
    fs.rmSync(path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing'), {
      recursive: true,
      force: true,
    });

    const duplicate = runCli(createArgs(workspace), env).family_runtime_stage_attempt;
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.idempotent_noop, true);
    const status = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(status.launch_allowed, false);
    assert.equal(status.materialization_readiness.status, 'missing');
    const attempts = runCli([
      'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
    ], env).family_runtime_stage_attempts;
    assert.equal(attempts.summary.total, 1);
    assert.equal(attempts.attempts[0].stage_attempt_id, existingAttempt.stage_attempt_id);

    const startFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', existingAttempt.stage_attempt_id,
    ], env);
    assert.notEqual(startFailure.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(
      fs.existsSync(path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'SKILL.md')),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime quest launch activates every declared Skill and start or repair restores drift', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-quest-package-scope-'));
  const quest = path.join(root, 'quest');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    const notInstalled = runCliFailure(createQuestArgs(quest), env);
    assert.equal(notInstalled.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(notInstalled.payload.error.details.launch_blocked_reason, 'package_not_installed');
    assertNoAttemptWasQueued(env.OPL_STATE_DIR, env);

    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
    ], env);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);

    const created = runCli(createQuestArgs(quest), env).family_runtime_stage_attempt.attempt;
    const skillRoot = path.join(quest, '.codex', 'skills');
    assert.deepEqual(
      fs.readdirSync(skillRoot).sort(),
      [...scholarSkillsCoreSkillIds, ...scholarSkillsSpecialtySkillIds].sort(),
    );
    assert.equal(fs.existsSync(path.join(skillRoot, 'medical-genomics-foundation-models', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'medical-single-cell-modeling', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'medical-optional-specialty')), false);

    fs.rmSync(path.join(skillRoot, 'medical-manuscript-writing'), {
      recursive: true,
      force: true,
    });
    const drifted = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_status;
    assert.equal(drifted.launch_allowed, false);
    assert.equal(drifted.materialization_readiness.status, 'missing');

    const startBlocked = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], env);
    assert.notEqual(startBlocked.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(fs.existsSync(path.join(skillRoot, 'medical-manuscript-writing', 'SKILL.md')), true);

    fs.rmSync(path.join(skillRoot, 'medical-manuscript-review'), {
      recursive: true,
      force: true,
    });

    const repaired = await runCliAsync([
      'packages', 'repair', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    assert.deepEqual(
      fs.readdirSync(skillRoot).sort(),
      [...scholarSkillsCoreSkillIds, ...scholarSkillsSpecialtySkillIds].sort(),
    );

    const status = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_status;
    assert.equal(status.materialization_readiness.status, 'current');
    assert.match(
      status.materialization_readiness.lifecycle_receipt_ref,
      /^opl:\/\/agent-package\/repair\/mas\//,
    );
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);

    const resumed = runCli([...createQuestArgs(quest), '--new-attempt'], env)
      .family_runtime_stage_attempt.attempt;
    assert.notEqual(resumed.stage_attempt_id, created.stage_attempt_id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime use boundary reconciles the highest compatible provider and freezes an existing attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-reconcile-'));
  const workspace = path.join(root, 'workspace');
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const providerV3 = writeCapabilityProvider(path.join(root, 'provider-v3'), '0.1.2', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumerV1 = writeMasConsumer(path.join(root, 'consumer-v1'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const consumerV2 = writeMasConsumer(path.join(root, 'consumer-v2'), providerV2, '0.1.0', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  writeCapabilityCatalog(path.dirname(catalog), [consumerV1, consumerV2, providerV1, providerV2]);
  const consumer = writeMasConsumer(path.join(root, 'consumer-install'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    const created = runCli(createSessionArgs(workspace, 'paper-session-a'), env)
      .family_runtime_stage_attempt.attempt;
    assert.equal(created.workspace_locator.package_use_binding.freshness_mode, 'channel_verified');
    assert.match(created.workspace_locator.package_use_binding.use_receipt_ref, /^opl:\/\/agent-package\/use\//);
    assert.equal(created.workspace_locator.package_use_binding.provider_packages[0].package_version, '0.1.1');
    assert.match(created.workspace_locator.package_use_binding.provider_packages[0].artifact_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(created.workspace_locator.package_use_binding.provider_packages[0].source_artifact_ref, providerV2);
    assert.equal(created.workspace_locator.package_use_binding.root_package.package_version, '0.1.0');
    assert.deepEqual(created.workspace_locator.package_use_binding.root_package.owner_language_version, {
      scheme: 'pep440',
      value: '0.1.0',
    });
    const helper = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.1/);
    assert.equal(fs.readdirSync(path.join(workspace, '.codex', 'skills')).length, 35);
    assert.equal(created.workspace_locator.package_use_binding.core_readiness.status, 'current');
    assert.equal(created.workspace_locator.package_use_binding.specialty_exposure.status, 'current');

    const removedSpecialty = 'medical-genomics-foundation-models';
    fs.rmSync(path.join(workspace, '.codex', 'skills', removedSpecialty), {
      recursive: true,
      force: true,
    });
    const specialtyDrift = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(specialtyDrift.materialization_readiness.core_readiness.status, 'current');
    assert.equal(specialtyDrift.materialization_readiness.specialty_exposure.status, 'degraded');
    assert.equal(specialtyDrift.launch_allowed, true);
    const specialtyRecovered = runCli(createSessionArgs(workspace, 'specialty-repair'), env)
      .family_runtime_stage_attempt.attempt;
    assert.equal(
      fs.existsSync(path.join(workspace, '.codex', 'skills', removedSpecialty, 'SKILL.md')),
      true,
    );
    assert.equal(specialtyRecovered.workspace_locator.package_use_binding.core_readiness.status, 'current');
    assert.equal(specialtyRecovered.workspace_locator.package_use_binding.specialty_exposure.status, 'current');

    writeCapabilityCatalog(path.dirname(catalog), [consumerV1, consumerV2, providerV1, providerV2, providerV3]);
    fs.rmSync(path.dirname(helper), { recursive: true, force: true });
    const startFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], env);
    assert.notEqual(startFailure.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.1/);

    const nextSession = runCli(createSessionArgs(workspace, 'paper-session-b'), env)
      .family_runtime_stage_attempt.attempt;
    assert.equal(nextSession.workspace_locator.package_use_binding.provider_packages[0].package_version, '0.1.2');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.2/);

    const pinnedBlocked = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], env);
    assert.equal(pinnedBlocked.payload.error.details.failure_code, 'agent_package_pinned_closure_changed');
    assert.equal(
      pinnedBlocked.payload.error.details.resume_policy,
      'fail_closed_shared_scope_cannot_restore_pinned_bytes_without_mutating_current_scope',
    );
    assert.deepEqual(pinnedBlocked.payload.error.details.shared_scope, {
      scope: 'workspace',
      target_root: workspace,
      discovery_surface: `${workspace}/.codex/skills`,
    });
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.2/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('provider retirement removes only unchanged package-owned Skills and preserves user-modified projections', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-retirement-'));
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const retiredSkill = 'medical-genomics-foundation-models';
  const retainedSpecialties = scholarSkillsSpecialtySkillIds.filter((skillId) => skillId !== retiredSkill);
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1', {
    specialtySkillIds: retainedSpecialties,
  });
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    runCli(createSessionArgs(workspaceA, 'retirement-a-v1'), env);
    runCli(createSessionArgs(workspaceB, 'retirement-b-v1'), env);
    const userModifiedSkill = path.join(workspaceB, '.codex', 'skills', retiredSkill, 'SKILL.md');
    fs.appendFileSync(userModifiedSkill, '\nUser-owned local note.\n');

    writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1, providerV2]);
    runCli(createSessionArgs(workspaceA, 'retirement-a-v2'), env);

    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills', retiredSkill)), false);
    assert.equal(fs.existsSync(userModifiedSkill), true);
    assert.match(fs.readFileSync(userModifiedSkill, 'utf8'), /User-owned local note/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime use boundary uses verified LKG offline unless strict currentness is requested', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-offline-'));
  const workspace = path.join(root, 'workspace');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  writeCapabilityCatalog(path.dirname(catalog), [consumer, provider]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    fs.rmSync(catalog, { force: true });
    const strict = runCliFailure(createSessionArgs(workspace, 'strict-offline'), {
      ...env,
      OPL_PACKAGE_USE_STRICT_CURRENTNESS: '1',
    });
    assert.equal(strict.payload.error.details.failure_code, 'agent_package_capability_channel_unavailable');
    assert.equal(strict.payload.error.details.update_action, 'opl packages update mas');
    assertNoAttemptWasQueued(env.OPL_STATE_DIR, env);

    const offline = runCli(createSessionArgs(workspace, 'offline-lkg'), env)
      .family_runtime_stage_attempt.attempt;
    assert.equal(offline.workspace_locator.package_use_binding.freshness_mode, 'offline_lkg');
    assert.equal(offline.workspace_locator.package_use_binding.latest_verified, false);
    assert.match(offline.workspace_locator.package_use_binding.use_receipt_ref, /^opl:\/\/agent-package\/use\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime attempt start fails closed when its use receipt is tampered', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-receipt-tamper-'));
  const workspace = path.join(root, 'workspace');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    const attempt = runCli(createSessionArgs(workspace, 'tampered-receipt'), env)
      .family_runtime_stage_attempt.attempt;
    const ledgerPath = path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const receipt = ledger.receipts.find((entry: any) =>
      entry.receipt_ref === attempt.workspace_locator.package_use_binding.use_receipt_ref);
    receipt.use_binding.provider_packages[0].package_version = '9.9.9';
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

    const blocked = runCliFailure([
      'family-runtime', 'attempt', 'start', attempt.stage_attempt_id,
    ], env);
    assert.equal(blocked.payload.error.details.failure_code, 'agent_package_use_receipt_invalid');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime use binding rejects a pinned provider after its installed lock drifts', () => {
  const packageLock = (packageId: string) => ({
    package_id: packageId,
    package_version: '0.1.0',
    lock_ref: `opl://agent-package-lock/${packageId}/0.1.0/current`,
    manifest_sha256: 'a'.repeat(64),
    content_digest: `sha256:${'b'.repeat(64)}`,
    source_artifact_ref: null,
    artifact_digest: null,
    owner_source_commit: null,
    carrier_authority: null,
    source_kind: 'manifest_url',
    resolved_dependencies: [] as Array<{ package_id: string }>,
    dependency_closure_digest: `sha256:${'c'.repeat(64)}`,
  });
  const boundPackage = (lock: ReturnType<typeof packageLock>) => ({
    package_id: lock.package_id,
    package_version: lock.package_version,
    owner_language_version: null,
    package_lock_ref: lock.lock_ref,
    manifest_sha256: lock.manifest_sha256,
    content_digest: lock.content_digest,
    source_artifact_ref: lock.source_artifact_ref,
    artifact_digest: lock.artifact_digest,
    owner_source_commit: lock.owner_source_commit,
    carrier_authority: lock.carrier_authority,
  });
  const providerLock = packageLock('fixture.mas-scholar-skills');
  const rootLock = {
    ...packageLock('fixture.mas'),
    resolved_dependencies: [{ package_id: providerLock.package_id }],
  };
  const binding = {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'fixture-use-boundary',
    use_receipt_ref: 'opl://agent-package/use/fixture',
    root_package: boundPackage(rootLock),
    provider_packages: [boundPackage(providerLock)],
    dependency_closure_digest: rootLock.dependency_closure_digest,
  };
  providerLock.package_version = '9.9.9';

  assert.throws(
    () => assertAgentPackageUseBindingCarrierAuthority({
      binding: binding as any,
      root: rootLock as any,
      installedLocks: [rootLock, providerLock] as any,
    }),
    (error: any) => error?.details?.failure_code === 'agent_package_use_binding_carrier_authority_invalid'
      && JSON.stringify(error?.details?.failures) === JSON.stringify([
        'provider_package_authority_mismatch:fixture.mas-scholar-skills',
      ]),
  );
});

test('family-runtime use boundary fails closed when the catalog has no compatible retained provider', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-incompatible-'));
  const workspace = path.join(root, 'workspace');
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.2.0', {
    capabilityAbi: 'mas-scholar-skills.v2',
  });
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV2]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    const blocked = runCliFailure(createSessionArgs(workspace, 'incompatible-provider'), env);
    assert.equal(blocked.payload.error.details.failure_code, 'agent_package_capability_no_compatible_version');
    assert.equal(blocked.payload.error.details.update_action, 'opl packages update mas');
    assertNoAttemptWasQueued(env.OPL_STATE_DIR, env);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('family-runtime use reconciliation rolls provider and scope back after an injected mid-transaction failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-rollback-'));
  const workspace = path.join(root, 'workspace');
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  const helper = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party',
    ], env);
    const baselineAttempt = runCli(createSessionArgs(workspace, 'baseline-session'), env)
      .family_runtime_stage_attempt.attempt;
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.0/);
    writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1, providerV2]);

    const failed = runCliFailure(createSessionArgs(workspace, 'faulted-session'), {
      ...env,
      OPL_TEST_CAPABILITY_RECONCILIATION_FAIL_AFTER_SCOPE: '1',
    });
    assert.equal(failed.payload.error.details.failure_code, 'test_capability_reconciliation_interrupted');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.0/);
    const lockIndex = JSON.parse(fs.readFileSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'), 'utf8'));
    assert.equal(lockIndex.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills').package_version, '0.1.0');
    const attempts = runCli([
      'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
    ], env).family_runtime_stage_attempts;
    assert.equal(attempts.summary.total, 1);
    assert.equal(attempts.attempts[0].stage_attempt_id, baselineAttempt.stage_attempt_id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
