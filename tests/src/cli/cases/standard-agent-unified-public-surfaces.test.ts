import { execFileSync } from 'node:child_process';

import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  buildReadyAgentRepo,
  retargetReadyRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../src/kernel/standard-agent-registry.ts';

function initializeManagedCheckout(repoDir: string) {
  execFileSync('git', ['init', '--quiet'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture'],
    { cwd: repoDir },
  );
}

function retargetPublicAction(repoDir: string, actionId: string) {
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  const previousActionId = actionCatalog.actions[0].action_id as string;
  actionCatalog.actions[0].action_id = actionId;
  writeJson(actionCatalogPath, actionCatalog);

  const stageManifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as Record<string, any>;
  for (const stage of stageManifest.stages) {
    stage.allowed_action_refs = stage.allowed_action_refs.map((ref: string) =>
      ref === previousActionId ? actionId : ref
    );
  }
  writeJson(stageManifestPath, stageManifest);
}

function buildManagedAgentCheckout(targetDomainId: string, owner: string, actionId: string) {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, targetDomainId, owner);
  retargetPublicAction(repoDir, actionId);
  initializeManagedCheckout(repoDir);
  return repoDir;
}

test('standard Agent public surfaces derive OMA and OBF admission from the shared registry', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-agent-surfaces-state-'));
  const omaRepo = buildManagedAgentCheckout('agent_engineering', 'OPL Meta Agent', 'engineer-agent');
  const obfRepo = buildManagedAgentCheckout('opl-bookforge', 'OPL Book Forge', 'materialize-book');
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_MODULES_ROOT: path.join(stateRoot, 'modules'),
    OPL_MODULE_PATH_OPLMETAAGENT: omaRepo,
    OPL_MODULE_PATH_OPLBOOKFORGE: obfRepo,
  };
  const canonicalOmaRepo = fs.realpathSync(omaRepo);
  const canonicalObfRepo = fs.realpathSync(obfRepo);
  const expectedStandardAgents = STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP);
  const expectedStandardAgentIds = expectedStandardAgents.map((entry) => entry.agent_id).sort();
  const expectedStandardAgentDomains = expectedStandardAgents.map((entry) => entry.domain_id).sort();

  try {
    const omaInterfaces = runCli([
      'agents', 'interfaces', '--domain', 'oma', '--format', 'cli',
    ], env).generated_agent_interfaces;
    assert.equal(omaInterfaces.status, 'ready');
    assert.equal(omaInterfaces.agent_id, 'oma');
    assert.equal(omaInterfaces.target_domain_id, 'agent_engineering');
    assert.equal(omaInterfaces.standard_agent_contract_resolution.status, 'resolved');
    assert.equal(omaInterfaces.cli.descriptors[0].action_id, 'engineer-agent');
    assert.equal(omaInterfaces.source_contract_consumption.repo_dir, canonicalOmaRepo);

    const obfInterfaces = runCli([
      'agents', 'interfaces', '--domain', 'obf', '--format', 'cli',
    ], env).generated_agent_interfaces;
    assert.equal(obfInterfaces.status, 'ready');
    assert.equal(obfInterfaces.agent_id, 'obf');
    assert.equal(obfInterfaces.target_domain_id, 'opl-bookforge');
    assert.equal(obfInterfaces.standard_agent_contract_resolution.status, 'resolved');
    assert.equal(obfInterfaces.cli.descriptors[0].action_id, 'materialize-book');

    const omaActions = runCli([
      'actions', 'export', '--domain', 'oma', '--format', 'cli',
    ], env).family_action_export;
    assert.equal(omaActions.project_id, 'agent_engineering');
    assert.equal(omaActions.catalog_source.checkout_path, canonicalOmaRepo);
    assert.equal(omaActions.descriptors[0].action_id, 'engineer-agent');

    const obfActions = runCli([
      'actions', 'export', '--domain', 'obf', '--format', 'cli',
    ], env).family_action_export;
    assert.equal(obfActions.project_id, 'oplbookforge');
    assert.equal(obfActions.catalog_source.checkout_path, canonicalObfRepo);
    assert.equal(obfActions.descriptors[0].action_id, 'materialize-book');

    const agentIndex = runCli(['agents', 'list'], env).family_agents;
    assert.deepEqual(
      agentIndex.agents.map((entry: Record<string, any>) =>
        entry.standard_agent_identity.agent_id
      ).sort(),
      expectedStandardAgentIds,
    );
    assert.equal(
      agentIndex.agents.find((entry: Record<string, any>) => entry.agent_id === 'oma').manifest_status,
      'resolved',
    );
    assert.equal(
      agentIndex.agents.find((entry: Record<string, any>) => entry.agent_id === 'obf').manifest_status,
      'resolved',
    );

    const omaAgent = runCli(['agents', 'inspect', '--domain', 'oma'], env).family_agent;
    assert.equal(omaAgent.agent_id, 'oma');
    assert.equal(omaAgent.standard_agent_contract_resolution.status, 'resolved');
    assert.equal(omaAgent.skeleton_status, 'aligned');

    const descriptorIndex = runCli(['agents', 'descriptors'], env).family_agent_descriptors;
    assert.deepEqual(
      descriptorIndex.descriptors.map((entry: Record<string, any>) => entry.agent_id).sort(),
      expectedStandardAgentIds,
    );
    const omaDescriptor = runCli([
      'agents', 'descriptor', '--domain', 'oma',
    ], env).family_agent_descriptor;
    assert.equal(omaDescriptor.agent_id, 'oma');
    assert.deepEqual(omaDescriptor.family_action_catalog.action_ids, ['engineer-agent']);
    assert.equal(omaDescriptor.family_stage_control_plane.stage_count > 0, true);

    const stageIndex = runCli(['stages', 'list'], env).family_stages;
    assert.deepEqual(
      stageIndex.domains.map((entry: Record<string, any>) => entry.agent_id).sort(),
      expectedStandardAgentIds,
    );
    assert.equal(stageIndex.domains.find((entry: Record<string, any>) => entry.agent_id === 'oma').ready, true);
    assert.equal(stageIndex.domains.find((entry: Record<string, any>) => entry.agent_id === 'obf').ready, true);
    assert.equal(
      stageIndex.domains.find((entry: Record<string, any>) => entry.agent_id === 'oma').target_domain_id,
      'agent_engineering',
    );
    const omaStageReadiness = runCli([
      'stages', 'readiness', '--domain', 'oma',
    ], env).family_stage_readiness;
    assert.equal(omaStageReadiness.summary.stage_count > 0, true);

    const actionIndex = runCli(['actions', 'list'], env).family_actions;
    assert.deepEqual(
      actionIndex.domains.map((entry: { project_id: string }) => entry.project_id).sort(),
      expectedStandardAgentDomains,
    );
    assert.equal(actionIndex.domains.some((entry: { project_id: string }) =>
      entry.project_id === 'scholarskills'
    ), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(omaRepo, { recursive: true, force: true });
    fs.rmSync(obfRepo, { recursive: true, force: true });
  }
});

test('registered standard Agents with unavailable checkouts return typed blockers instead of unknown-domain errors', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-agent-blocker-state-'));
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_MODULES_ROOT: path.join(stateRoot, 'modules'),
    OPL_MODULE_PATH_OPLMETAAGENT: path.join(stateRoot, 'missing-oma-checkout'),
  };

  try {
    const interfacesFailure = runCliFailure([
      'agents', 'interfaces', '--domain', 'oma', '--format', 'cli',
    ], env);
    assert.equal(interfacesFailure.payload.error.code, 'contract_file_missing');
    assert.equal(
      interfacesFailure.payload.error.details.failure_code,
      'standard_agent_managed_contract_checkout_unavailable',
    );
    assert.doesNotMatch(interfacesFailure.payload.error.message, /unknown/i);

    const actionsFailure = runCliFailure([
      'actions', 'export', '--domain', 'oma', '--format', 'cli',
    ], env);
    assert.equal(actionsFailure.payload.error.code, 'missing_family_action_catalog');
    assert.equal(
      actionsFailure.payload.error.details.error.code,
      'managed_contract_unavailable',
    );
    assert.doesNotMatch(actionsFailure.payload.error.message, /unknown/i);

    const agentInspect = runCli(['agents', 'inspect', '--domain', 'oma'], env).family_agent;
    assert.equal(agentInspect.agent_id, 'oma');
    assert.equal(agentInspect.manifest_status, 'managed_contract_unavailable');
    assert.equal(agentInspect.standard_agent_contract_resolution.status, 'blocked');
    assert.equal(
      agentInspect.manifest_error.code,
      'standard_agent_managed_contract_checkout_unavailable',
    );

    const descriptor = runCli(['agents', 'descriptor', '--domain', 'oma'], env).family_agent_descriptor;
    assert.equal(descriptor.agent_id, 'oma');
    assert.equal(descriptor.manifest_status, 'managed_contract_unavailable');
    assert.equal(
      descriptor.error.code,
      'standard_agent_managed_contract_checkout_unavailable',
    );

    const stageFailure = runCliFailure([
      'stages', 'readiness', '--domain', 'oma',
    ], env);
    assert.equal(stageFailure.payload.error.code, 'missing_family_stage_control_plane');
    assert.equal(
      stageFailure.payload.error.details.manifest_error.code,
      'standard_agent_managed_contract_checkout_unavailable',
    );
    assert.doesNotMatch(stageFailure.payload.error.message, /unknown/i);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
