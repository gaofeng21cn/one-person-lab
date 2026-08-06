import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../src/kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from '../../../../src/modules/connect/agent-package-identity.ts';
import {
  createFamilyRuntimeQueueTables,
  DEFAULT_MAX_ATTEMPTS,
} from '../../../../src/modules/runway/family-runtime-store.ts';

import { repoRoot } from './constants.ts';
import { createContractsFixtureRoot, readJsonFixture, shellSingleQuote } from './fixtures.ts';

function writeJsonFixture(root: string, relativePath: string, value: unknown) {
  const targetPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function materializeStandardAgentRuntimeFixture(pluginRoot: string, packageId: string) {
  const agent = resolveStandardAgent(packageId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) return;

  const actionId = 'fixture-action';
  const stageIds = [
    'fixture-stage',
    'scout',
    'artifact_creation',
    'closeout',
    'domain_owner/default-executor-dispatch',
    'reference_build',
    'request-intake',
    'context-research',
    'delivery-planning',
    'baseline-assessment',
    'feedback-intake',
    'optimization',
    'write',
    'draft',
    'review',
    'intake',
    'mission-intake',
    'disabled-quality-stage',
    'runtime_storage_refs',
    'review_and_rebuttal',
    'ai_reviewer_re_eval',
    'manuscript_authoring',
    'proposal_authoring',
    'analysis-campaign',
    'finalize_and_publication_handoff',
    'publication_aftercare/reviewer-refresh',
    'old_unregistered_stage',
  ];
  const stageRefs = [
    'agent/stages/manifest.json',
    'agent/stages/fixture-stage.md',
    'agent/prompts/fixture-stage.md',
    'agent/knowledge/fixture.md',
    'agent/quality_gates/fixture.md',
  ];
  for (const relativePath of stageRefs.slice(1)) {
    const targetPath = path.join(pluginRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `# ${agent.display_name} fixture ${relativePath}\n`, 'utf8');
  }

  writeJsonFixture(pluginRoot, 'contracts/domain_descriptor.json', {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    agent_id: agent.agent_id,
    package_id: agent.agent_id,
    domain_id: agent.domain_id,
    domain_label: agent.display_name,
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      workspace_binding: {
        locator_surface_kind: `${agent.agent_id}_workspace_locator`,
        default_profile_id: 'one_off',
        workspace_kind: `${agent.agent_id}_workspace`,
        project_kind: `${agent.agent_id}_project`,
        project_collection_label: 'projects',
        default_workspace_id: `${agent.agent_id}-workspace`,
        default_project_id: `${agent.agent_id}-project`,
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
      },
      runtime: {
        runtime_domain_id: agent.domain_id,
        registration_ref: null,
      },
      progress: {
        deliverable_delta_aliases: ['deliverable_progress_delta'],
        platform_delta_aliases: ['platform_repair_delta'],
      },
      routing: {
        explicit_aliases: [agent.agent_id, agent.project],
        workstream_ids: [`${agent.agent_id}_fixture`],
        intent_signals: [`${agent.agent_id} fixture`],
        ambiguity_policy: 'require_explicit_workstream',
      },
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJsonFixture(pluginRoot, 'contracts/action_catalog.json', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${agent.domain_id}.runtime-fixture.actions`,
    target_domain_id: agent.domain_id,
    owner: agent.domain_id,
    authority_boundary: {
      domain_truth_owner: agent.domain_id,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: actionId,
      title: 'Fixture action',
      summary: 'Exercise the installed Standard Agent fixture ABI.',
      owner: agent.domain_id,
      effect: 'mutating',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      },
      input_schema_ref: 'contracts/input.schema.json',
      output_schema_ref: 'contracts/output.schema.json',
      required_fields: ['workspace_root'],
      optional_fields: [],
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: stageIds[0],
        required_stage_refs: stageIds,
        optional_stage_refs: [],
        terminal_stage_refs: [stageIds[stageIds.length - 1]],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: `${agent.agent_id}_fixture_action`, surface_kind: 'domain_mcp' },
        skill: { command_contract_id: `${agent.agent_id}.fixture-action`, surface_kind: 'domain_skill' },
        product_entry: { action_key: actionId, surface_kind: 'domain_product_entry' },
        openai: { tool_name: `${agent.agent_id}_fixture_action` },
        ai_sdk: { tool_name: `${agent.agent_id}_fixture_action` },
      },
      authority_boundary: {},
    }],
    notes: [],
  });
  writeJsonFixture(pluginRoot, 'contracts/domain_handler_registry.json', {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [],
  });
  writeJsonFixture(pluginRoot, 'contracts/input.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { workspace_root: { type: 'string' } },
    required: ['workspace_root'],
  });
  writeJsonFixture(pluginRoot, 'contracts/output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  });
  writeJsonFixture(pluginRoot, 'contracts/owner_receipt_contract.json', {
    surface_kind: 'owner_receipt_contract',
  });
  writeJsonFixture(pluginRoot, 'contracts/pack_compiler_input.json', {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: agent.domain_id,
    canonical_agent_id: agent.agent_id,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generated_surface_owner: false,
    },
    required_domain_pack_paths: stageRefs,
  });
  writeJsonFixture(pluginRoot, 'agent/stages/manifest.json', {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: agent.domain_id,
    owner: agent.domain_id,
    authority_boundary: {
      domain_truth_owner: agent.domain_id,
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: stageIds.map((stageId) => ({
      stage_id: stageId,
      stage_kind: 'intake',
      title: stageId,
      display_names: { 'en-US': stageId },
      summary: 'Exercise the installed Standard Agent fixture ABI.',
      goal: 'Keep the runtime fixture structurally valid.',
      policy_ref: 'agent/stages/fixture-stage.md',
      prompt_ref: 'agent/prompts/fixture-stage.md',
      knowledge_refs: ['agent/knowledge/fixture.md'],
      quality_gate_refs: ['agent/quality_gates/fixture.md'],
      allowed_action_refs: [actionId],
      requires: ['fixture_request'],
      ensures: ['fixture_observation'],
      next_stage_refs: [],
      trust_lane: 'domain_agent',
    })),
  });
  const primarySkillPath = path.join(pluginRoot, 'agent', 'primary_skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(primarySkillPath), { recursive: true });
  fs.writeFileSync(primarySkillPath, `# ${agent.display_name}\n\nRuntime fixture.\n`, 'utf8');
  const authorityInventoryPath = path.join(pluginRoot, 'runtime', 'authority_functions', 'README.md');
  fs.mkdirSync(path.dirname(authorityInventoryPath), { recursive: true });
  fs.writeFileSync(authorityInventoryPath, `# ${agent.display_name} fixture authority functions\n`, 'utf8');
}

export function installRuntimePackageFixture(stateRoot: string, packageId: string) {
  const canonicalPackageId = canonicalAgentPackageId(packageId);
  assert.ok(canonicalPackageId);
  fs.mkdirSync(stateRoot, { recursive: true });
  const packageManifestPath = path.join(
    repoRoot,
    'contracts',
    'opl-framework',
    'packages',
    `${canonicalPackageId}.json`,
  );
  const packageManifestBytes = fs.readFileSync(packageManifestPath, 'utf8');
  const packageManifest = parseJsonText(packageManifestBytes) as {
    version: string;
    codex_surface: {
      plugin_id: string;
      configured_codex_plugin_carrier?: {
        plugin_selector?: unknown;
      };
      required_skill_ids?: unknown;
    };
  };
  const pluginId = packageManifest.codex_surface.plugin_id;
  assert.ok(pluginId);
  const configuredPluginSelector = packageManifest.codex_surface
    .configured_codex_plugin_carrier?.plugin_selector;
  const pluginSelector = typeof configuredPluginSelector === 'string'
    && configuredPluginSelector.startsWith(`${pluginId}@`)
    ? configuredPluginSelector
    : `${pluginId}@opl-runtime-fixtures`;
  const marketplaceId = pluginSelector.slice(pluginSelector.lastIndexOf('@') + 1);
  const marketplaceRoot = path.join(stateRoot, 'fixture-codex-marketplace');
  const pluginRoot = path.join(marketplaceRoot, 'plugins', pluginId);
  const codexHome = path.join(stateRoot, 'codex-home');
  const requiredSkillIds = Array.isArray(packageManifest.codex_surface.required_skill_ids)
    ? packageManifest.codex_surface.required_skill_ids.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    : [pluginId];
  for (const skillId of requiredSkillIds) {
    const skillRoot = path.join(pluginRoot, 'skills', skillId);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${skillId}\ndescription: Runtime package fixture.\n---\n`,
      'utf8',
    );
  }
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({
      name: pluginId,
      version: packageManifest.version,
      description: 'Runtime package fixture carried by Codex Plugin Manager.',
      skills: './skills/',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(pluginRoot, 'opl-package.json'), packageManifestBytes, 'utf8');
  materializeStandardAgentRuntimeFixture(pluginRoot, canonicalPackageId);

  fs.mkdirSync(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  const currentConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const marketplaceHeader = `[marketplaces."${marketplaceId}"]`;
  const pluginHeader = `[plugins."${pluginSelector}"]`;
  const additions = [
    ...(currentConfig.includes(marketplaceHeader) ? [] : [
      marketplaceHeader,
      `source = ${JSON.stringify(marketplaceRoot)}`,
      '',
    ]),
    ...(currentConfig.includes(pluginHeader) ? [] : [
      pluginHeader,
      'enabled = true',
      '',
    ]),
  ];
  if (additions.length > 0) {
    fs.writeFileSync(
      configPath,
      `${currentConfig.trimEnd()}${currentConfig.trim() ? '\n\n' : ''}${additions.join('\n')}`,
      'utf8',
    );
  }
}

export function loadFamilyManifestFixtures() {
  const medautogrant = readJsonFixture<Record<string, unknown>>('med-autogrant-product-entry-manifest.json');
  delete (medautogrant.product_entry_manifest as Record<string, unknown>).family_stage_control_plane;
  const medautoscience = readJsonFixture<Record<string, unknown>>('med-autoscience-product-entry-manifest.json');
  delete medautoscience.family_stage_control_plane;
  return {
    medautogrant,
    medautoscience,
    redcube: readJsonFixture<Record<string, unknown>>('redcube-product-entry-manifest.json'),
  };
}

export function assertMagActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mag_critique_to_revision_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autogrant');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    ['route:critique', 'route:revision'],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['route:critique']);
  assert.deepEqual(actionGraph.exit_nodes, ['route:revision']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'mag_route_gate_revision',
      trigger_nodes: ['route:revision'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: ['route:critique', 'route:revision'],
  });
}

export function assertMasActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mas_workspace_product_entry_study_runtime_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autoscience');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'product_entry:open_workspace',
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['product_entry:open_workspace']);
  assert.deepEqual(actionGraph.exit_nodes, ['study:inspect_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'study_physician_decision_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
    {
      gate_id: 'publication_release_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  });
}

export function assertRedcubeActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'redcube_product_entry_product_entry_graph');
  assert.equal(actionGraph.target_domain_id, 'redcube_ai');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'step:open_product_entry',
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['step:open_product_entry']);
  assert.deepEqual(actionGraph.exit_nodes, ['step:inspect_current_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'redcube_operator_review_gate',
      trigger_nodes: ['step:inspect_current_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  });
}

export function createFamilyContractsFixtureRoot() {
  return createContractsFixtureRoot((fixtureContractsRoot) => {
    const domainsPath = path.join(fixtureContractsRoot, 'domains.json');
    const payload = parseJsonText(fs.readFileSync(domainsPath, 'utf8')) as {
      version: string;
      domains: Array<Record<string, unknown>>;
    };

    if (!payload.domains.some((domain) => domain.domain_id === 'medautogrant')) {
      payload.domains.push({
        domain_id: 'medautogrant',
        label: 'MedAutoGrant',
        project: 'med-autogrant',
        independent_domain_agent: {
          agent_id: 'mag',
          status: 'active',
          authority_scope: 'grant_authoring_domain_agent',
          opl_top_level_domain_agent: true,
        },
        single_app_skill: {
          skill_id: 'mag',
          plugin_name: 'Med Auto Grant',
          activation_kind: 'explicit_app_skill',
          entry_command: 'medautogrant product status',
          manifest_command: 'medautogrant product-entry-manifest',
        },
        domain_truth_owner: [
          'grant_run_truth',
          'grant_workspace_state',
          'grant_submission_artifacts',
          'grant_review_judgment',
          'grant_user_visible_progress',
        ],
        opl_projection_role: [
          'consume_session_projections',
          'consume_progress_projections',
          'consume_artifact_projections',
          'consume_runtime_projections',
        ],
        runtime_dependency_boundary: {
          domain_runtime_owner: 'med-autogrant',
          opl_dependency: 'projection_consumer_only',
          opl_truth_write_policy: 'no_domain_truth_writes',
          backend_companions: [],
        },
        standalone_allowed: true,
        owned_workstreams: ['grant_ops'],
        non_opl_families: [],
      });
    }

    fs.writeFileSync(domainsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  });
}

export function insertFamilyRuntimeTaskProjectionFixture({
  stateRoot,
  taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  domainId,
  taskKind,
  payload = {},
  dedupeKey = null,
  priority = 50,
  status = 'queued',
  source = 'test_projection_fixture',
}: {
  stateRoot: string;
  taskId?: string;
  domainId: string;
  taskKind: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  priority?: number;
  status?: string;
  source?: string;
}) {
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const db = new DatabaseSync(path.join(runtimeRoot, 'queue.sqlite'));
  createFamilyRuntimeQueueTables(db);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO tasks (
      task_id,
      domain_id,
      task_kind,
      payload_json,
      dedupe_key,
      priority,
      status,
      attempts,
      max_attempts,
      source,
      requires_approval,
      approved_at,
      lease_owner,
      lease_expires_at,
      last_error,
      dead_letter_reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run(
    taskId,
    domainId,
    taskKind,
    JSON.stringify(payload),
    dedupeKey,
    priority,
    status,
    DEFAULT_MAX_ATTEMPTS,
    source,
    now,
    now,
  );
  db.close();
  return {
    task_id: taskId,
    domain_id: domainId,
    task_kind: taskKind,
    payload,
    status,
  };
}

export function createFakeLaunchctlFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launchctl-fixture-'));
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const launchctlPath = path.join(fixtureRoot, 'launchctl');
  fs.writeFileSync(
    launchctlPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${stateDir}"
CALLS="$STATE_DIR/calls.log"
mkdir -p "$STATE_DIR"
printf '%s\\n' "$*" >> "$CALLS"

case "$1" in
  bootstrap)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  bootout)
    rm -f "$STATE_DIR/loaded"
    exit 0
    ;;
  kickstart)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  print)
    if [ -f "$STATE_DIR/loaded" ]; then
      cat <<'EOF'
service = ai.opl.product entry
state = running
EOF
      exit 0
    fi
    echo "service not loaded" >&2
    exit 113
    ;;
esac

echo "unexpected launchctl args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    launchctlPath,
    callsPath: path.join(stateDir, 'calls.log'),
  };
}

export function createFakeOpenFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-open-fixture-'));
  const capturePath = path.join(fixtureRoot, 'open.log');
  const openPath = path.join(fixtureRoot, 'open');
  fs.writeFileSync(
    openPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    openPath,
    capturePath,
  };
}

export function runGitFixtureCommand(
  cwd: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'OPL Test',
      GIT_AUTHOR_EMAIL: 'opl@example.test',
      GIT_COMMITTER_NAME: 'OPL Test',
      GIT_COMMITTER_EMAIL: 'opl@example.test',
      ...envOverrides,
    },
  });

  assert.equal(result.status, 0, `git ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return result;
}

export function createGitModuleRemoteFixture(
  moduleName = 'med-autoscience',
  options: Partial<{
    extraFiles: Record<string, string>;
    executableFiles: string[];
  }> = {},
) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-remote-'));
  const sourceRoot = path.join(fixtureRoot, 'source');
  const remoteRoot = path.join(fixtureRoot, `${moduleName}.git`);

  fs.mkdirSync(sourceRoot, { recursive: true });
  runGitFixtureCommand(sourceRoot, ['init', '--initial-branch', 'main']);

  fs.writeFileSync(path.join(sourceRoot, 'README.md'), `# ${moduleName}\n`, 'utf8');
  const extraFiles = withStandardPrimarySkillCarrierFiles(moduleName, options.extraFiles ?? {});
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const targetPath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, {
      encoding: 'utf8',
      mode:
        relativePath.endsWith('.sh') || (options.executableFiles ?? []).includes(relativePath)
          ? 0o755
          : undefined,
    });
  }
  runGitFixtureCommand(sourceRoot, ['add', '-A']);
  runGitFixtureCommand(sourceRoot, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial module snapshot',
  ]);

  runGitFixtureCommand(fixtureRoot, ['clone', '--bare', sourceRoot, remoteRoot]);
  runGitFixtureCommand(sourceRoot, ['remote', 'add', 'origin', remoteRoot]);

  return {
    fixtureRoot,
    sourceRoot,
    remoteRoot,
    getHeadSha() {
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
    advance(fileName: string, contents: string, message: string) {
      fs.writeFileSync(path.join(sourceRoot, fileName), contents, 'utf8');
      runGitFixtureCommand(sourceRoot, ['add', fileName]);
      runGitFixtureCommand(sourceRoot, [
        '-c',
        'user.name=OPL Test',
        '-c',
        'user.email=opl@example.test',
        'commit',
        '-m',
        message,
      ]);
      runGitFixtureCommand(sourceRoot, ['push', 'origin', 'main']);
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
  };
}

function withStandardPrimarySkillCarrierFiles(moduleName: string, files: Record<string, string>) {
  const carrierFiles = moduleName === 'med-autoscience'
    ? {
        'contracts/action_catalog.json': '{}\n',
        'contracts/domain_handler_registry.json': '{}\n',
        'contracts/pack_compiler_input.json': '{}\n',
        'agent/stages/manifest.json': '{}\n',
        'agent/primary_skill/SKILL.md': '# med-autoscience\n',
        ...files,
      }
    : files;
  const pluginNameByModule: Record<string, string> = {
    'med-autoscience': 'med-autoscience',
    'med-autogrant': 'med-autogrant',
    'redcube-ai': 'redcube-ai',
    'opl-meta-agent': 'opl-meta-agent',
    'opl-bookforge': 'opl-bookforge',
  };
  const pluginName = pluginNameByModule[moduleName];
  if (!pluginName || files['agent/primary_skill/SKILL.md']) {
    return carrierFiles;
  }
  const carrierSkill = carrierFiles[`plugins/${pluginName}/skills/${pluginName}/SKILL.md`];
  return carrierSkill
    ? {
        ...carrierFiles,
        'agent/primary_skill/SKILL.md': carrierSkill,
      }
    : carrierFiles;
}

export function createFakeShellCommandFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-command-fixture-'));
  const capturePath = path.join(fixtureRoot, 'shell-command.log');
  const commandPath = path.join(fixtureRoot, 'fake-domain-entry');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    commandPath,
    capturePath,
  };
}

export function writeMasCleanRunnerFixture(
  workspaceRoot: string,
  options: {
    profilePath?: string;
    manifest?: Record<string, unknown>;
  } = {},
) {
  const runnerPath = path.join(workspaceRoot, 'scripts', 'run-python-clean.sh');
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  if (options.profilePath && options.manifest) {
    const runnerModulePath = path.join(path.dirname(runnerPath), 'run-python-clean-fixture.mjs');
    fs.writeFileSync(
      runnerModulePath,
      [
        `const expectedProfile = ${JSON.stringify(path.resolve(options.profilePath))};`,
        `const manifest = ${JSON.stringify(options.manifest)};`,
        'const args = process.argv.slice(2).join(" ");',
        'if (args.includes(expectedProfile) && args.includes("med_autoscience.controllers.product_entry")) {',
        '  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\\n`);',
        '  process.exit(0);',
        '}',
        'process.stderr.write(`unexpected MAS clean runner args: ${args}\\n`);',
        'process.exit(1);',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.writeFileSync(
      runnerPath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `exec ${shellSingleQuote(process.execPath)} ${shellSingleQuote(runnerModulePath)} "$@"`,
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    );
    return runnerPath;
  }

  fs.writeFileSync(
    runnerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "MAS clean runner fixture should not be executed in this test" >&2',
      'exit 64',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 },
  );
  return runnerPath;
}

export function createFamilyLocatorResolverFixture(options: {
  masProfile: string;
  magInput: string;
  redcubeWorkspaceRoot: string;
  masManifest: Record<string, unknown>;
  magManifest: Record<string, unknown>;
  redcubeManifest: Record<string, unknown>;
}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-locator-fixture-'));
  const uvPath = path.join(fixtureRoot, 'uv');
  const redcubePath = path.join(fixtureRoot, 'redcube');
  const domainEntryPath = path.join(fixtureRoot, 'opl-test-domain-entry');
  const masManifestPath = path.join(fixtureRoot, 'mas-manifest.json');
  const magManifestPath = path.join(fixtureRoot, 'mag-manifest.json');
  const redcubeManifestPath = path.join(fixtureRoot, 'redcube-manifest.json');

  fs.writeFileSync(masManifestPath, `${JSON.stringify(options.masManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(magManifestPath, `${JSON.stringify(options.magManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(redcubeManifestPath, `${JSON.stringify(options.redcubeManifest, null, 2)}\n`, 'utf8');

  fs.writeFileSync(
    domainEntryPath,
    `#!/usr/bin/env bash
set -euo pipefail

case "\${1:-}" in
  mas) cat ${shellSingleQuote(masManifestPath)} ;;
  mag) cat ${shellSingleQuote(magManifestPath)} ;;
  rca) cat ${shellSingleQuote(redcubeManifestPath)} ;;
  *) echo "unexpected domain entry fixture agent: \${1:-}" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == *${shellSingleQuote(`run python -m med_autoscience.cli product manifest --profile ${path.resolve(options.masProfile)} --format json`)}* ]]; then
  cat ${shellSingleQuote(masManifestPath)}
  exit 0
fi

if [[ "$*" == run\\ --isolated\\ --frozen\\ --project\\ *\\ python\\ -c* && "$*" == *med_autoscience.controllers.product_entry* && "$*" == *${path.resolve(options.masProfile)}* ]]; then
  cat ${shellSingleQuote(masManifestPath)}
  exit 0
fi

if [[ "$*" == run\\ --directory\\ *\\ python\\ -c* && "$*" == *${path.resolve(options.magInput)}* ]]; then
  cat ${shellSingleQuote(magManifestPath)}
  exit 0
fi

echo "unexpected uv args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    redcubePath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == ${shellSingleQuote(`product manifest --workspace-root ${path.resolve(options.redcubeWorkspaceRoot)}`)} ]]; then
  cat ${shellSingleQuote(redcubeManifestPath)}
  exit 0
fi

echo "unexpected redcube args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    uvPath,
    redcubePath,
    domainEntryPath,
  };
}
