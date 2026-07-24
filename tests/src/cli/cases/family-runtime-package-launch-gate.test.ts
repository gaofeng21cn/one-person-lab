import { execFileSync } from 'node:child_process';

import {
  assert,
  fs,
  os,
  path,
  removeFixtureTree,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  commitDeveloperCheckout,
  scholarSkillsCoreSkillIds,
  scholarSkillsSpecialtySkillIds,
  writeCapabilityCatalog,
  writeDeveloperCapabilityCheckoutClosure,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';
import { packageLaunchHardStopReason } from '../../../../src/modules/runway/family-runtime-package-readiness.ts';

test('package launch stops only for missing required capability while metadata drift remains quality debt', () => {
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    package_dependency_readiness: {
      status: 'incompatible',
      operational_ready: true,
      dependencies: [{
        required: true,
        reasons: ['version_requirement_unsatisfied', 'dependency_closure_digest_mismatch'],
      }],
    },
    materialization_readiness: {
      status: 'incompatible',
      core_readiness: { status: 'incompatible' },
    },
    runtime_source_readiness: { status: 'current', operational_ready: true },
  }), null);
  for (const reason of [
    'dependency_lock_missing',
    'dependency_disabled',
    'package_id_mismatch',
    'capability_abi_mismatch',
    'required_exports_missing',
    'required_modules_missing',
  ]) {
    assert.equal(packageLaunchHardStopReason({
      installed_package_count: 1,
      package_dependency_readiness: {
        dependencies: [{ required: true, reasons: [reason] }],
      },
      runtime_source_readiness: { status: 'current', operational_ready: true },
    }), reason);
  }
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    materialization_readiness: {
      status: 'missing',
      core_readiness: { status: 'missing' },
    },
    runtime_source_readiness: { status: 'current', operational_ready: true },
  }), 'required_core_skill_missing');
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

function bindMasWorkspace(workspace: string, env: Record<string, string>) {
  fs.mkdirSync(workspace, { recursive: true });
  runCli([
    'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
  ], env);
}

function assertNoAttemptWasQueued(stateRoot: string, env: Record<string, string>) {
  const attempts = runCli([
    'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
  ], env).family_runtime_stage_attempts;
  assert.equal(attempts.summary.total, 0);
  assert.deepEqual(attempts.attempts, []);
}

function queryAttempt(stageAttemptId: string, env: Record<string, string>) {
  return runCli([
    'family-runtime', 'attempt', 'query', stageAttemptId,
  ], env).family_runtime_stage_attempt_query.stage_attempt_query.attempt;
}

function createThenBindAtStart(
  args: string[],
  env: Record<string, string>,
  startEnv: Record<string, string> = env,
) {
  const created = runCli(args, env).family_runtime_stage_attempt.attempt;
  assert.equal(Object.hasOwn(created.workspace_locator, 'package_use_binding'), false);
  const startFailure = runCliFailure([
    'family-runtime', 'attempt', 'start', created.stage_attempt_id,
  ], {
    ...startEnv,
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
  });
  assert.notEqual(
    startFailure.payload.error.details?.failure_code,
    'agent_package_operational_readiness_blocked',
  );
  return {
    created,
    attempt: queryAttempt(created.stage_attempt_id, env),
    startFailure,
  };
}

function assertInstalledOnlyUseBinding(binding: any) {
  assert.equal(binding.source_selection, 'installed_package_lock');
  assert.equal(binding.network_accessed, false);
  assert.equal(binding.remote_dependency_policy, 'forbidden');
  for (const legacyField of [
    'freshness_mode',
    'latest_verified',
    'checked_at',
    'refresh_outcome',
    'channel_ref',
    'channel_digest',
    'reconciliation_issue',
  ]) {
    assert.equal(Object.hasOwn(binding, legacyField), false, legacyField);
  }
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
    removeFixtureTree(root);
  }
});

test('family-runtime keeps duplicate create idempotent and refreshes the scope at actual start', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-package-scope-drift-'));
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    ...releaseSet.env,
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    const bound = runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
    ], env).workspace_catalog;
    const boundProject = bound.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(bound.action, 'bind');
    assert.equal(bound.binding.status, 'active');
    assert.equal(bound.binding.workspace_path, workspace);
    assert.equal(boundProject.active_binding.binding_id, bound.binding.binding_id);
    assert.equal(boundProject.bindings[0].workspace_path_currentness.status, 'current');
    await runCliAsync([
      'packages', 'install', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    const lockPath = path.join(env.OPL_STATE_DIR, 'agent-package-locks.json');
    const ledgerPath = path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json');
    const projectionRoot = path.join(env.OPL_STATE_DIR, 'agent-package-skill-projections');
    const packageBytesBeforeCreate = {
      lock: fs.readFileSync(lockPath, 'utf8'),
      ledger: fs.readFileSync(ledgerPath, 'utf8'),
      generations: fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [],
    };
    const existingAttempt = runCli(createArgs(workspace), env)
      .family_runtime_stage_attempt.attempt;
    assert.equal(Object.hasOwn(existingAttempt.workspace_locator, 'package_use_binding'), false);
    assert.deepEqual({
      lock: fs.readFileSync(lockPath, 'utf8'),
      ledger: fs.readFileSync(ledgerPath, 'utf8'),
      generations: fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [],
    }, packageBytesBeforeCreate);
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
    const startedAttempt = runCli([
      'family-runtime', 'attempt', 'query', existingAttempt.stage_attempt_id,
    ], env).family_runtime_stage_attempt_query.stage_attempt_query.attempt;
    assert.match(
      startedAttempt.workspace_locator.package_use_binding.use_boundary_id,
      /^package-use[_:]/,
    );
    assert.equal(
      startedAttempt.provider_run.execution_package_use_context.status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(
      startedAttempt.provider_run.execution_package_use_context.package_use_binding,
      startedAttempt.workspace_locator.package_use_binding,
    );

    const createStartFailure = runCliFailure([
      ...createArgs(workspace), '--new-attempt', '--start',
    ], env);
    assert.notEqual(
      createStartFailure.payload.error.details?.failure_code,
      'agent_package_operational_readiness_blocked',
    );
    const afterCreateStart = runCli([
      'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
    ], env).family_runtime_stage_attempts;
    assert.equal(afterCreateStart.summary.total, 2);
    const createStartAttemptSummary = afterCreateStart.attempts.find(
      (entry: any) => entry.stage_attempt_id !== existingAttempt.stage_attempt_id,
    );
    const createStartAttempt = runCli([
      'family-runtime', 'attempt', 'query', createStartAttemptSummary.stage_attempt_id,
    ], env).family_runtime_stage_attempt_query.stage_attempt_query.attempt;
    assert.equal(
      createStartAttempt.provider_run.execution_package_use_context.status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(
      createStartAttempt.provider_run.execution_package_use_context.package_use_binding,
      createStartAttempt.workspace_locator.package_use_binding,
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime quest first start activates every Skill while a new attempt use boundary restores drift', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-quest-package-scope-'));
  const workspace = path.join(root, 'workspace');
  const quest = path.join(workspace, 'quest');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    specialtySkillIds: scholarSkillsSpecialtySkillIds,
  });
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    bindMasWorkspace(workspace, env);
    const notInstalled = runCliFailure(createQuestArgs(quest), env);
    assert.equal(notInstalled.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(notInstalled.payload.error.details.launch_blocked_reason, 'package_not_installed');
    assertNoAttemptWasQueued(env.OPL_STATE_DIR, env);

    fs.mkdirSync(quest, { recursive: true });
    await runCliAsync(['packages', 'install', 'mas'], env);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);

    const created = runCli(createQuestArgs(quest), env).family_runtime_stage_attempt.attempt;
    const skillRoot = path.join(quest, '.codex', 'skills');
    assert.equal(Object.hasOwn(created.workspace_locator, 'package_use_binding'), false);
    assert.equal(fs.existsSync(skillRoot), false);
    const firstStart = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(firstStart.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
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
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(startBlocked.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(fs.existsSync(path.join(skillRoot, 'medical-manuscript-writing', 'SKILL.md')), false);

    fs.rmSync(path.join(skillRoot, 'medical-manuscript-review'), {
      recursive: true,
      force: true,
    });

    const nextStartFailure = runCliFailure([
      ...createQuestArgs(quest), '--new-attempt', '--start',
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(
      nextStartFailure.payload.error.details?.failure_code,
      'agent_package_operational_readiness_blocked',
    );
    assert.deepEqual(
      fs.readdirSync(skillRoot).sort(),
      [...scholarSkillsCoreSkillIds, ...scholarSkillsSpecialtySkillIds].sort(),
    );

    const status = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_status;
    assert.equal(status.materialization_readiness.status, 'current');
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);

    const attempts = runCli([
      'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
    ], env).family_runtime_stage_attempts;
    assert.equal(attempts.summary.total, 2);
    const resumedSummary = attempts.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id !== created.stage_attempt_id,
    );
    const resumed = queryAttempt(resumedSummary.stage_attempt_id, env);
    assert.notEqual(resumed.stage_attempt_id, created.stage_attempt_id);
    assert.match(resumed.workspace_locator.package_use_binding.use_boundary_id, /^package-use[_:]/);
    assert.match(resumed.workspace_locator.package_use_binding.use_receipt_ref, /^opl:\/\/agent-package\/use\//);
    assert.equal(resumed.workspace_locator.package_use_binding.scope, 'quest');
    assert.equal(resumed.workspace_locator.package_use_binding.target_root, quest);
    assert.equal(
      resumed.provider_run.execution_package_use_context.status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(
      resumed.provider_run.execution_package_use_context.package_use_binding,
      resumed.workspace_locator.package_use_binding,
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime invocation keeps the installed provider until an explicit update', async () => {
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
  const consumerV3 = writeMasConsumer(path.join(root, 'consumer-v3'), providerV3, '0.1.1', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(
    path.dirname(catalog),
    [consumerV1, consumerV2, providerV1, providerV2],
  );
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    const created = createThenBindAtStart(
      createSessionArgs(workspace, 'paper-session-a'),
      env,
    ).attempt;
    assertInstalledOnlyUseBinding(created.workspace_locator.package_use_binding);
    assert.match(created.workspace_locator.package_use_binding.use_receipt_ref, /^opl:\/\/agent-package\/use\//);
    assert.equal(created.workspace_locator.package_use_binding.provider_packages[0].package_version, '0.1.1');
    assert.match(created.workspace_locator.package_use_binding.provider_packages[0].artifact_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(
      created.workspace_locator.package_use_binding.provider_packages[0].source_artifact_ref,
      'ghcr.io/fixture/one-person-lab-packages/mas-scholar-skills:0.1.1',
    );
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
    const specialtyRecovered = createThenBindAtStart(
      createSessionArgs(workspace, 'specialty-repair'),
      env,
    ).attempt;
    assert.equal(
      fs.existsSync(path.join(workspace, '.codex', 'skills', removedSpecialty, 'SKILL.md')),
      true,
    );
    assert.equal(specialtyRecovered.workspace_locator.package_use_binding.core_readiness.status, 'current');
    assert.equal(specialtyRecovered.workspace_locator.package_use_binding.specialty_exposure.status, 'current');

    const oldLocks = JSON.parse(fs.readFileSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'), 'utf8'));
    assert.equal(oldLocks.packages.find((entry: any) => entry.package_id === 'mas').package_version, '0.1.0');
    assert.equal(
      oldLocks.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills').package_version,
      '0.1.1',
    );
    writeCapabilityCatalog(
      path.dirname(catalog),
      [consumerV1, consumerV2, consumerV3, providerV1, providerV2, providerV3],
    );
    fs.rmSync(path.dirname(helper), { recursive: true, force: true });
    const startFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(startFailure.payload.error.details?.failure_code, 'agent_package_operational_readiness_blocked');
    assert.notEqual(startFailure.payload.error.details?.failure_code, 'agent_package_pinned_closure_changed');
    assert.equal(fs.existsSync(helper), false);

    const installedSession = createThenBindAtStart(
      createSessionArgs(workspace, 'paper-session-b'),
      env,
    ).attempt;
    assert.equal(installedSession.workspace_locator.package_use_binding.root_package.package_version, '0.1.0');
    assert.equal(installedSession.workspace_locator.package_use_binding.provider_packages[0].package_version, '0.1.1');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.1/);

    runCli(['packages', 'update', 'mas'], env);
    const updatedSession = createThenBindAtStart(
      createSessionArgs(workspace, 'paper-session-c'),
      env,
    ).attempt;
    assert.equal(updatedSession.workspace_locator.package_use_binding.root_package.package_version, '0.1.1');
    assert.equal(updatedSession.workspace_locator.package_use_binding.provider_packages[0].package_version, '0.1.2');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.2/);

    const resumedFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', created.stage_attempt_id,
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(resumedFailure.payload.error.details?.failure_code, 'agent_package_pinned_closure_changed');
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.2/);
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime absorbs developer checkout changes only after an explicit update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-developer-use-reconcile-'));
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const provider = writeCapabilityProvider(path.join(root, 'release-provider'), '0.1.0');
  const consumer = writeMasConsumer(path.join(root, 'release-consumer'), provider, '0.1.0a4');
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumer, provider]);
  const fixture = writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: consumer,
    providerManifestPath: provider,
  });
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    ...releaseSet.env,
  };
  const lockFile = path.join(env.OPL_STATE_DIR, 'agent-package-locks.json');
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    const first = createThenBindAtStart(
      createSessionArgs(workspaceA, 'developer-a'),
      env,
    ).attempt;
    const firstBinding = first.workspace_locator.package_use_binding;
    const firstLocks = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const firstProvider = firstLocks.packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assertInstalledOnlyUseBinding(firstBinding);
    assert.equal(firstProvider.developer_checkout_source.source_git_head_sha, fixture.scholarHead);
    assert.equal(firstProvider.source_artifact_ref, null);
    assert.equal(firstProvider.artifact_digest, null);

    fs.writeFileSync(fixture.providerHelperPath, 'medical-manuscript-writing helper B\n');
    const scholarHeadB = commitDeveloperCheckout(scholarCheckout, 'fixture B helper');
    const second = createThenBindAtStart(
      createSessionArgs(workspaceB, 'developer-b'),
      env,
    ).attempt;
    const installedBinding = second.workspace_locator.package_use_binding;
    const installedProvider = installedBinding.provider_packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assertInstalledOnlyUseBinding(installedBinding);
    assert.equal(installedProvider.developer_checkout_source.source_git_head_sha, fixture.scholarHead);
    assert.equal(installedProvider.content_digest, firstProvider.content_digest);
    assert.match(
      fs.readFileSync(path.join(workspaceB, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt'), 'utf8'),
      /helper 0\.1\.0/,
    );

    bindMasWorkspace(workspaceB, env);
    runCli([
      'packages', 'update', 'mas',
      '--scope', 'workspace', '--target-workspace', workspaceB,
    ], env);
    const third = createThenBindAtStart(
      createSessionArgs(workspaceB, 'developer-c'),
      env,
    ).attempt;
    const binding = third.workspace_locator.package_use_binding;
    const nextLocks = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const nextProvider = nextLocks.packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    const boundProvider = binding.provider_packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(boundProvider.source_kind, 'developer_checkout_override');
    assert.equal(boundProvider.developer_checkout_source.source_git_head_sha, scholarHeadB);
    assert.equal(boundProvider.source_artifact_ref, null);
    assert.equal(boundProvider.artifact_digest, null);
    assert.equal(nextProvider.package_version, firstProvider.package_version);
    assert.equal(nextProvider.manifest_sha256, firstProvider.manifest_sha256);
    assert.notEqual(nextProvider.content_digest, firstProvider.content_digest);
    assert.notEqual(nextProvider.developer_checkout_source.tree_sha256, firstProvider.developer_checkout_source.tree_sha256);
    assert.notEqual(nextProvider.dependency_closure_digest, firstProvider.dependency_closure_digest);
    assert.match(
      fs.readFileSync(path.join(workspaceB, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt'), 'utf8'),
      /helper B/,
    );
    assert.equal(
      fs.readFileSync(
        path.join(workspaceB, '.codex', 'skills', 'medical-manuscript-writing', 'fixtures', 'nested.txt'),
        'utf8',
      ),
      'nested developer fixture A\n',
    );
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: masCheckout, encoding: 'utf8' }), '');
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: scholarCheckout, encoding: 'utf8' }), '');
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: masCheckout, encoding: 'utf8' }).trim(),
      fixture.masHead,
    );
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: scholarCheckout, encoding: 'utf8' }).trim(),
      scholarHeadB,
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime ignores an incomplete checkout until an explicit update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-developer-use-lkg-'));
  const workspace = path.join(root, 'fresh-workspace');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const provider = writeCapabilityProvider(path.join(root, 'release-provider'), '0.1.0');
  const consumer = writeMasConsumer(path.join(root, 'release-consumer'), provider, '0.1.0a4');
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumer, provider]);
  const fixture = writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: consumer,
    providerManifestPath: provider,
  });
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    ...releaseSet.env,
  };
  const lockFile = path.join(env.OPL_STATE_DIR, 'agent-package-locks.json');
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    const beforeBytes = fs.readFileSync(lockFile, 'utf8');
    const beforeLocks = JSON.parse(beforeBytes);
    const beforeProvider = beforeLocks.packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    const cachePath = beforeProvider.physical_surface.codex_plugin_cache_path;
    assert.equal(fs.existsSync(path.join(cachePath, 'skills', 'medical-manuscript-writing', 'SKILL.md')), true);

    fs.rmSync(fixture.providerRequiredSkillPath);
    commitDeveloperCheckout(scholarCheckout, 'fixture B incomplete');
    const attempt = createThenBindAtStart(
      createSessionArgs(workspace, 'developer-lkg'),
      env,
    ).attempt;
    const binding = attempt.workspace_locator.package_use_binding;
    assertInstalledOnlyUseBinding(binding);
    const afterLocks = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const afterProvider = afterLocks.packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.deepEqual(
      {
        package_version: afterProvider.package_version,
        manifest_sha256: afterProvider.manifest_sha256,
        content_digest: afterProvider.content_digest,
        owner_source_commit: afterProvider.owner_source_commit,
        developer_checkout_source: afterProvider.developer_checkout_source,
        codex_plugin_cache_path: afterProvider.physical_surface.codex_plugin_cache_path,
      },
      {
        package_version: beforeProvider.package_version,
        manifest_sha256: beforeProvider.manifest_sha256,
        content_digest: beforeProvider.content_digest,
        owner_source_commit: beforeProvider.owner_source_commit,
        developer_checkout_source: beforeProvider.developer_checkout_source,
        codex_plugin_cache_path: beforeProvider.physical_surface.codex_plugin_cache_path,
      },
    );
    assert.equal(fs.existsSync(path.join(cachePath, 'skills', 'medical-manuscript-writing', 'SKILL.md')), true);
    assert.match(
      fs.readFileSync(path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt'), 'utf8'),
      /0\.1\.0/,
    );
    assert.equal(
      fs.readFileSync(
        path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'fixtures', 'nested.txt'),
        'utf8',
      ),
      'nested developer fixture A\n',
    );
    const updateFailure = runCliFailure(['packages', 'update', 'mas'], env);
    assert.equal(
      updateFailure.payload.error.details.failure_code,
      'agent_package_developer_checkout_source_invalid',
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('explicit provider update removes only unchanged package-owned Skills and preserves user-modified projections', async () => {
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
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    createThenBindAtStart(createSessionArgs(workspaceA, 'retirement-a-v1'), env);
    createThenBindAtStart(createSessionArgs(workspaceB, 'retirement-b-v1'), env);
    const userModifiedSkill = path.join(workspaceB, '.codex', 'skills', retiredSkill, 'SKILL.md');
    fs.appendFileSync(userModifiedSkill, '\nUser-owned local note.\n');

    writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1, providerV2]);
    createThenBindAtStart(createSessionArgs(workspaceA, 'retirement-a-still-v1'), env);
    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills', retiredSkill)), true);
    runCli(['packages', 'update', 'mas'], env);
    createThenBindAtStart(createSessionArgs(workspaceA, 'retirement-a-v2'), env);

    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills', retiredSkill)), false);
    assert.equal(fs.existsSync(userModifiedSkill), true);
    assert.match(fs.readFileSync(userModifiedSkill, 'utf8'), /User-owned local note/);
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime use boundary ignores owner channels when the legacy shared snapshot is offline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-offline-'));
  const workspace = path.join(root, 'workspace');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumer, provider]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    fs.writeFileSync(path.join(env.OPL_STATE_DIR, 'agent-package-release-catalog-cache.json'), `${JSON.stringify({
      surface_kind: 'opl_agent_package_release_catalog_cache.v1',
      catalog_ref: catalog,
      catalog_digest: `sha256:${'f'.repeat(64)}`,
      checked_at: new Date().toISOString(),
      catalog_payload: JSON.parse(fs.readFileSync(catalog, 'utf8')),
    }, null, 2)}\n`);
    fs.rmSync(catalog, { force: true });
    const strictEnv = {
      ...env,
      OPL_PACKAGE_USE_STRICT_CURRENTNESS: '1',
    };
    const strict = createThenBindAtStart(
      createSessionArgs(workspace, 'strict-offline'),
      strictEnv,
    ).attempt;
    assertInstalledOnlyUseBinding(strict.workspace_locator.package_use_binding);
    assert.equal(
      strict.workspace_locator.package_use_binding.root_package.source_artifact_ref,
      'ghcr.io/fixture/one-person-lab-packages/mas:0.1.0-alpha.4',
    );
    assert.equal(
      strict.workspace_locator.package_use_binding.provider_packages[0].source_artifact_ref,
      'ghcr.io/fixture/one-person-lab-packages/mas-scholar-skills:0.1.0',
    );

    const offline = createThenBindAtStart(
      createSessionArgs(workspace, 'offline-lkg'),
      env,
    ).attempt;
    assertInstalledOnlyUseBinding(offline.workspace_locator.package_use_binding);
    assert.match(offline.workspace_locator.package_use_binding.use_receipt_ref, /^opl:\/\/agent-package\/use\//);
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime treats lifecycle and prior use receipt metadata as observation-only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-receipt-tamper-'));
  const workspace = path.join(root, 'workspace');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumer, provider]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    const lockIndex = JSON.parse(fs.readFileSync(
      path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'),
      'utf8',
    ));
    const installedMas = lockIndex.packages.find((entry: any) => entry.package_id === 'mas');
    const ledgerPath = path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json');
    const installLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const installReceipt = installLedger.receipts.find((entry: any) =>
      entry.receipt_ref === installedMas.action_receipt_id);
    installReceipt.owner_source_commit = 'f'.repeat(40);
    fs.writeFileSync(ledgerPath, `${JSON.stringify(installLedger, null, 2)}\n`);

    const attempt = createThenBindAtStart(
      createSessionArgs(workspace, 'tampered-receipt'),
      env,
    ).attempt;
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const receipt = ledger.receipts.find((entry: any) =>
      entry.receipt_ref === attempt.workspace_locator.package_use_binding.use_receipt_ref);
    receipt.use_binding.provider_packages[0].package_version = '9.9.9';
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

    const resumedFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', attempt.stage_attempt_id,
    ], env);
    assert.notEqual(resumedFailure.payload.error.details?.failure_code, 'agent_package_use_receipt_invalid');
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime keeps the installed provider callable without an ABI compatibility gate', async () => {
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
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV2]);
    const attempt = createThenBindAtStart(
      createSessionArgs(workspace, 'incompatible-provider'),
      env,
    ).attempt;
    assertInstalledOnlyUseBinding(attempt.workspace_locator.package_use_binding);
    assert.equal(
      attempt.workspace_locator.package_use_binding.provider_packages[0].package_version,
      '0.1.0',
    );
    assert.equal(
      attempt.workspace_locator.package_use_binding.provider_packages[0].source_artifact_ref,
      'ghcr.io/fixture/one-person-lab-packages/mas-scholar-skills:0.1.0',
    );

    runCli(['packages', 'update', 'mas'], env);
    const updatedAttempt = createThenBindAtStart(
      createSessionArgs(workspace, 'updated-provider'),
      env,
    ).attempt;
    assertInstalledOnlyUseBinding(updatedAttempt.workspace_locator.package_use_binding);
    assert.equal(
      updatedAttempt.workspace_locator.package_use_binding.provider_packages[0].package_version,
      '0.2.0',
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('family-runtime does not enter explicit update reconciliation during invocation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-capability-use-rollback-'));
  const workspace = path.join(root, 'workspace');
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const catalog = path.join(root, 'catalog', 'capability-catalog.json');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerV1, '0.1.0a4', {
    capabilityCatalogRef: catalog,
    packageCatalogRef: catalog,
  });
  const releaseSet = writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1]);
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    ...releaseSet.env,
  };
  const helper = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    const baselineAttempt = createThenBindAtStart(
      createSessionArgs(workspace, 'baseline-session'),
      env,
    ).attempt;
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.0/);
    writeCapabilityCatalog(path.dirname(catalog), [consumer, providerV1, providerV2]);

    const installedAttempt = createThenBindAtStart(
      createSessionArgs(workspace, 'faulted-session'),
      env,
      {
        ...env,
        OPL_TEST_CAPABILITY_RECONCILIATION_FAIL_AFTER_SCOPE: '1',
      },
    ).attempt;
    assertInstalledOnlyUseBinding(installedAttempt.workspace_locator.package_use_binding);
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.0/);
    const lockIndex = JSON.parse(fs.readFileSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'), 'utf8'));
    assert.equal(lockIndex.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills').package_version, '0.1.0');
    const attempts = runCli([
      'family-runtime', 'attempt', 'list', '--domain', 'medautoscience', '--full',
    ], env).family_runtime_stage_attempts;
    assert.equal(attempts.summary.total, 2);
    assert.ok(attempts.attempts.some((entry: any) => entry.stage_attempt_id === baselineAttempt.stage_attempt_id));

    const updateFailure = runCliFailure(['packages', 'update', 'mas'], {
      ...env,
      OPL_TEST_CAPABILITY_RECONCILIATION_FAIL_AFTER_SCOPE: '1',
    });
    assert.equal(
      updateFailure.payload.error.details.failure_code,
      'test_capability_reconciliation_interrupted',
    );
    assert.match(fs.readFileSync(helper, 'utf8'), /0\.1\.0/);
  } finally {
    removeFixtureTree(root);
  }
});
