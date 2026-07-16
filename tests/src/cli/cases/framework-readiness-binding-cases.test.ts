import {
  assert,
  fs,
  loadFrameworkContracts,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { buildFrameworkReadinessSummary } from '../../../../src/modules/console/framework-readiness.ts';
import { buildRuntimeTraySnapshot } from '../../../../src/modules/console/runtime-tray-snapshot.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

function restoreEnvVar(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

test('framework readiness treats stale domain workspace bindings as registry attention, not diagnostic failures', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-stale-binding-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-stale-binding-workspace-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-stale-binding-family-'));
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      workspacePath,
      '--manifest-command',
      'printf "{}"',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    fs.rmSync(workspacePath, { recursive: true, force: true });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
    const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    process.env.OPL_META_AGENT_REPO_DIR = omaRepoDir;
    try {
      const readiness = (await buildFrameworkReadinessSummary(loadFrameworkContracts(), {
        familyDefaults: true,
      }, { runtimeSnapshotProvider: buildRuntimeTraySnapshot })).framework_readiness;
      assert.equal(readiness.summary.domain_manifest_stale_binding_count, 1);
      assert.deepEqual(readiness.summary.domain_manifest_stale_binding_project_ids, ['redcube']);
      assert.equal(readiness.summary.domain_manifest_currentness_owner_action_packet_count, 1);
      assert.deepEqual(readiness.summary.domain_manifest_currentness_owner_action_project_ids, ['redcube']);
      const currentnessPacket = readiness.domain_manifest_currentness_owner_action_packet;
      assert.ok(currentnessPacket);
      const currentnessItem = currentnessPacket.items[0] as Record<string, any>;
      assert.equal(
        currentnessItem.action_id,
        'rebind_or_archive_stale_workspace_binding',
      );
      assert.equal(
        currentnessItem.authority_boundary.can_claim_domain_ready,
        false,
      );
      assert.deepEqual(readiness.summary.domain_manifest_live_failed_project_ids, []);
      assert.equal(
        readiness.stages.readiness_by_domain.rca.diagnostic_failure_count,
        0,
      );
      assert.equal(
        readiness.stages.diagnostic_failures.some(
          (failure: { details?: { domain?: string; manifest_status?: string } }) =>
            failure.details?.domain === 'rca'
              || failure.details?.manifest_status === 'workspace_missing',
        ),
        false,
      );
    } finally {
      restoreEnvVar('OPL_STATE_DIR', previousStateDir);
      restoreEnvVar('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
      restoreEnvVar('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework readiness treats missing manifest commands as config attention, not diagnostic failures', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-manifest-config-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-manifest-config-workspace-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-manifest-config-family-'));
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      workspacePath,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
    const previousOmaRepoDir = process.env.OPL_META_AGENT_REPO_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    process.env.OPL_META_AGENT_REPO_DIR = omaRepoDir;
    try {
      const readiness = (await buildFrameworkReadinessSummary(loadFrameworkContracts(), {
        familyDefaults: true,
      }, { runtimeSnapshotProvider: buildRuntimeTraySnapshot })).framework_readiness;
      assert.equal(readiness.summary.domain_manifest_not_configured_count, 1);
      assert.deepEqual(readiness.summary.domain_manifest_not_configured_project_ids, ['medautogrant']);
      assert.equal(readiness.summary.domain_manifest_currentness_owner_action_packet_count, 1);
      assert.deepEqual(readiness.summary.domain_manifest_currentness_owner_action_project_ids, ['medautogrant']);
      const currentnessPacket = readiness.domain_manifest_currentness_owner_action_packet;
      assert.ok(currentnessPacket);
      const currentnessItem = currentnessPacket.items[0] as Record<string, any>;
      assert.equal(
        currentnessItem.action_id,
        'configure_manifest_command_or_record_typed_blocker',
      );
      assert.equal(
        currentnessItem.authority_boundary.can_execute_manifest_command,
        false,
      );
      assert.deepEqual(readiness.summary.domain_manifest_live_failed_project_ids, []);
      assert.equal(
        readiness.stages.readiness_by_domain.mag.diagnostic_failure_count,
        0,
      );
      assert.equal(
        readiness.stages.diagnostic_failures.some(
          (failure: { details?: { domain?: string; manifest_status?: string } }) =>
            failure.details?.domain === 'mag'
              || failure.details?.manifest_status === 'manifest_not_configured',
        ),
        false,
      );
    } finally {
      restoreEnvVar('OPL_STATE_DIR', previousStateDir);
      restoreEnvVar('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
      restoreEnvVar('OPL_META_AGENT_REPO_DIR', previousOmaRepoDir);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
