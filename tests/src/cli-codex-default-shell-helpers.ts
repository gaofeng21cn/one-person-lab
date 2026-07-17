import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { STANDARD_AGENT_PACK_ABI } from '../../src/modules/pack/public/standard-agent-pack-abi.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'entrypoints', 'cli.ts');
export const binPath = path.join(repoRoot, 'bin', 'opl');

export function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return parseJsonText(result.stdout) as any;
}

export function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runEntryPathRaw(cliPath, args, envOverrides);
}

export function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: parseJsonText(result.stderr) as any,
  };
}

export function runEntryPathRaw(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result;
}

export function runEntryPathFailure(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: parseJsonText(result.stderr) as any,
  };
}

export function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-default-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

const fakeFamilySkillDescriptions: Record<string, string> = {
  mas: 'Use when Codex should operate MedAutoScience through its stable runtime, controller, overlay, and workspace contracts instead of ad-hoc scripts.',
  mag: 'Use when Codex should operate Med Auto Grant through its grant-authoring product entry, user-loop, and schema-backed contracts instead of ad-hoc repo scripting.',
  rca: 'Operate RedCube AI as the formal RCA visual-deliverable domain app through product-entry, recoverable deliverable runtime, and same-session continuation contracts.',
  'opl-meta-agent': 'Use when Codex should operate OPL Meta Agent to design, test, improve, or take over testing for OPL-compatible Foundry Agents.',
  'opl-bookforge': 'Use when Codex should operate OPL Book Forge for book storyline architecture, manuscript materialization, figures, tables, style control, export handoff, and owner-gated publication decisions.',
};

function writeFakePrimarySkill(repoRoot: string, skillName: string, heading: string, body: string) {
  const primarySkillRoot = path.join(repoRoot, 'agent', 'primary_skill');
  fs.mkdirSync(primarySkillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(primarySkillRoot, 'SKILL.md'),
    [
      '---',
      `name: ${skillName}`,
      `description: ${fakeFamilySkillDescriptions[skillName] ?? fakeFamilySkillDescriptions[heading] ?? `${heading} primary skill fixture.`}`,
      '---',
      '',
      `# ${heading}`,
      '',
      body,
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeFakeRepoLocalPluginCarrier(repoRoot: string, pluginName: string) {
  const pluginRoot = path.join(repoRoot, 'plugins', pluginName);
  const skillRoot = path.join(pluginRoot, 'skills', pluginName);
  const displayName = pluginName === 'med-autoscience'
    ? 'Med Auto Science'
    : pluginName === 'med-autogrant'
      ? 'Med Auto Grant'
      : pluginName === 'redcube-ai'
        ? 'RedCube AI'
        : pluginName === 'opl-meta-agent'
          ? 'OPL Meta Agent'
          : pluginName === 'opl-bookforge'
            ? 'OPL Book Forge'
            : pluginName;
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'assets'), { recursive: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    JSON.stringify({
      name: pluginName,
      version: '0.1.0',
      skills: './skills/',
      interface: {
        displayName,
        defaultPrompt: [
          `Use ${displayName} to inspect the current domain state.`,
          `Use ${displayName} to advance the domain workflow without bypassing authority.`,
        ],
        composerIcon: './assets/icon.svg',
        logo: './assets/icon.svg',
      },
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(pluginRoot, 'assets', 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-label="${displayName} icon"><rect width="64" height="64" rx="8"/></svg>\n`,
    'utf8',
  );
  fs.copyFileSync(
    path.join(repoRoot, 'agent', 'primary_skill', 'SKILL.md'),
    path.join(skillRoot, 'SKILL.md'),
  );
}

export const retiredCliCommandMatrix: Array<{
  args: string[];
  command: string;
  errorCode: string;
  replacements?: RegExp[];
}> = [
  {
    args: ['ask', 'Plan the next paper submission steps.'],
    command: 'opl ask',
    errorCode: 'unknown_command',
  },
  {
    args: ['chat', 'Plan the next paper submission steps.'],
    command: 'opl chat',
    errorCode: 'unknown_command',
  },
  {
    args: ['shell'],
    command: 'opl shell',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mas', 'tighten the manuscript argument around invasive phenotype findings'],
    command: 'opl @mas',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mag', 'Draft a grant revision response pack.', '--dry-run'],
    command: 'opl @mag',
    errorCode: 'unknown_command',
  },
  {
    args: ['@rca', 'Prepare a defense-ready slide deck.', '--dry-run'],
    command: 'opl @rca',
    errorCode: 'unknown_command',
  },
  {
    args: ['web'],
    command: 'web',
    errorCode: 'unknown_command',
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
    errorCode: 'unknown_command',
  },
  {
    args: ['modules'],
    command: 'opl modules',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect modules/],
  },
  {
    args: ['packages', 'manifest'],
    command: 'opl packages manifest',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect packages manifest/],
  },
  {
    args: ['skill', 'list'],
    command: 'opl skill list',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect skills/],
  },
  {
    args: ['skill', 'sync'],
    command: 'opl skill sync',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect sync-skills/],
  },
  {
    args: ['module', 'install'],
    command: 'opl module install',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect install/],
  },
  {
    args: ['module', 'update'],
    command: 'opl module update',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect update/],
  },
  {
    args: ['module', 'reinstall'],
    command: 'opl module reinstall',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect reinstall/],
  },
  {
    args: ['module', 'remove'],
    command: 'opl module remove',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect remove/],
  },
  {
    args: ['module', 'exec'],
    command: 'opl module exec',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect exec/],
  },
  {
    args: ['agents', 'foundry', 'status'],
    command: 'opl agents foundry',
    errorCode: 'unknown_command',
  },
  {
    args: ['agents', 'scaffold'],
    command: 'opl agents scaffold',
    errorCode: 'unknown_command',
  },
  {
    args: ['agent-lab', 'sample'],
    command: 'opl agent-lab',
    errorCode: 'unknown_command',
  },
  {
    args: ['foundry-lab', 'status'],
    command: 'opl foundry-lab',
    errorCode: 'unknown_command',
  },
  {
    args: ['feedback', 'submit'],
    command: 'opl feedback',
    errorCode: 'unknown_command',
  },
  {
    args: ['work-order', 'execute'],
    command: 'opl work-order',
    errorCode: 'unknown_command',
  },
];

export function createFakeFamilySkillWorkspace(captureDir: string) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-skills-'));
  const specs = [
    {
      project: 'med-autoscience',
      plugin: 'med-autoscience',
      canonicalPlugin: 'mas',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autoscience\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autoscience","sync":"ok"}
EOF
`,
    },
    {
      project: 'med-autogrant',
      plugin: 'med-autogrant',
      canonicalPlugin: 'mag',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autogrant\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autogrant","sync":"ok"}
EOF
`,
    },
    {
      project: 'redcube-ai',
      plugin: 'redcube-ai',
      canonicalPlugin: 'rca',
      installer: path.join('scripts', 'install-codex-plugin.ts'),
      scriptBody: `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(captureDir, 'sync.log'))}, 'redcube-ai\\n');
process.stdout.write(JSON.stringify({ repo: 'redcube-ai', sync: 'ok' }) + '\\n');
`,
    },
    {
      project: 'opl-meta-agent',
      plugin: 'opl-meta-agent',
      canonicalPlugin: 'opl-meta-agent',
      installer: null,
      scriptBody: null,
    },
    {
      project: 'opl-bookforge',
      plugin: 'opl-bookforge',
      canonicalPlugin: 'opl-bookforge',
      installer: null,
      scriptBody: null,
    },
    {
      project: 'mas-scholar-skills',
      plugin: 'mas-scholar-skills',
      canonicalPlugin: 'mas-scholar-skills',
      installer: null,
      scriptBody: null,
    },
  ];

  for (const spec of specs) {
    const repoRoot = path.join(workspaceRoot, spec.project);
    if (spec.project === 'opl-meta-agent') {
      fs.mkdirSync(repoRoot, { recursive: true });
      writeFakeOmaGeneratedSurfacePack(repoRoot);
      writeFakeRepoLocalPluginCarrier(repoRoot, spec.plugin);
      continue;
    }
    if (spec.project === 'opl-bookforge') {
      fs.mkdirSync(repoRoot, { recursive: true });
      writeFakeBookForgeGeneratedSurfacePack(repoRoot);
      writeFakeRepoLocalPluginCarrier(repoRoot, spec.plugin);
      continue;
    }
    if (spec.project === 'mas-scholar-skills') {
      const skillRoot = path.join(repoRoot, 'skills', spec.canonicalPlugin);
      fs.mkdirSync(path.join(repoRoot, '.codex-plugin'), { recursive: true });
      fs.mkdirSync(skillRoot, { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, '.codex-plugin', 'plugin.json'),
        JSON.stringify({ name: spec.canonicalPlugin, skills: './skills/' }, null, 2),
      );
      fs.writeFileSync(
        path.join(skillRoot, 'SKILL.md'),
        `---\nname: ${spec.canonicalPlugin}\ndescription: MAS Scholar Skills fixture capability plugin pack.\n---\n\n# MAS Scholar Skills\n\nThis fixture represents the external ScholarSkills capability plugin pack.\n`,
      );
      continue;
    }
    const pluginRoot = path.join(repoRoot, 'plugins', spec.plugin);
    const skillRoot = path.join(pluginRoot, 'skills', spec.plugin);
    const installerPath = path.join(repoRoot, spec.installer!);
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    writeFakePrimarySkill(
      repoRoot,
      spec.plugin,
      `${spec.plugin.toUpperCase()} Primary Skill`,
      `This fixture represents the repo-owned rich primary skill for ${spec.project}. The tracked legacy plugin skill is only a compatibility mirror.`,
    );
    for (const relativePath of [
      path.join('contracts', 'action_catalog.json'),
      path.join('contracts', 'domain_descriptor.json'),
      path.join('contracts', 'pack_compiler_input.json'),
      path.join('agent', 'stages', 'manifest.json'),
      ...(spec.project === 'med-autoscience'
        ? [path.join('contracts', 'domain_handler_registry.json')]
        : []),
    ]) {
      writeJsonFixture(path.join(repoRoot, relativePath), {
        surface_kind: 'opl_test_standard_agent_pack_fixture',
        repo_name: spec.project,
      });
    }
    writeFakeRepoLocalPluginCarrier(repoRoot, spec.plugin);
    fs.mkdirSync(path.join(skillRoot, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'agents', 'openai.yaml'),
      `interface:\n  display_name: "${spec.project === 'med-autoscience' ? 'Med Auto Science' : spec.project === 'med-autogrant' ? 'Med Auto Grant' : spec.project === 'redcube-ai' ? 'RedCube AI' : 'OPL Meta Agent'}"\n  short_description: "Canonical family app skill"\n  default_prompt: "Use $${spec.canonicalPlugin} to inspect the current family app state."\n`,
    );
    fs.writeFileSync(installerPath, spec.scriptBody!, { mode: 0o755 });
  }

  return {
    workspaceRoot,
    syncLogPath: path.join(captureDir, 'sync.log'),
  };
}

type GeneratedSurfaceActionFixture = {
  actionId: string;
  title: string;
  summary: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  requiredFields?: string[];
  workspaceLocatorFields: string[];
  humanGateIds: string[];
  toolName: string;
  commandContractId: string;
  executionBinding?: {
    kind: 'foundry_binding';
    providerManifestRef: string;
  };
};

type GeneratedSurfaceStageFixture = {
  stageId: string;
  stageKind: string;
  title: string;
  summary: string;
  goal: string;
  domainStageRefs: string[];
  allowedActionRefs: string[];
};

type GeneratedSurfacePackFixture = {
  canonicalAgentId: string;
  domainId: string;
  carrierSlug?: string;
  domainLabel: string;
  primarySkillBody: string;
  skillPath: string;
  skillTitle: string;
  skillDescription: string;
  catalogId: string;
  planeId: string;
  actions: GeneratedSurfaceActionFixture[];
  stage: GeneratedSurfaceStageFixture;
  modules: Array<Record<string, unknown>>;
  authorityFile?: {
    fileName: string;
    payload: Record<string, unknown>;
  };
};

const generatedSurfaceRefs = [
  { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
  { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
  { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
  { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
  {
    surface_id: 'domain_handler',
    owner: 'one-person-lab',
    target_role: 'opl_generated_surface',
    status: 'descriptor_source_available',
  },
  {
    surface_id: 'status_read_model',
    owner: 'one-person-lab',
    target_role: 'opl_generated_surface',
    status: 'descriptor_source_available',
  },
  {
    surface_id: 'workbench_drilldown',
    owner: 'one-person-lab',
    target_role: 'opl_hosted_surface',
    status: 'descriptor_source_available',
  },
];

const targetActionAuthorityBoundary = {
  can_write_target_domain_truth: false,
  can_write_target_domain_memory_body: false,
  can_mutate_target_domain_artifact_body: false,
  can_authorize_target_domain_quality_or_export: false,
  can_promote_default_agent_without_gate: false,
  can_train_or_deploy_model_weights: false,
};

function writeJsonFixture(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function writeGeneratedSkillFixture(filePath: string, title: string, description: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, ['# Skill: ' + title, '', description, ''].join('\n'), 'utf8');
}

function toGeneratedSurfaceAction(pack: GeneratedSurfacePackFixture, action: GeneratedSurfaceActionFixture) {
  const skillSurface: Record<string, string> = {
    command_contract_id: action.commandContractId,
    surface_kind: 'opl_generated_skill_contract',
  };
  const executionBinding = action.executionBinding
    ? {
      kind: action.executionBinding.kind,
      provider_manifest_ref: action.executionBinding.providerManifestRef,
    }
    : {
      kind: 'stage_binding' as const,
      stage_manifest_ref: 'agent/stages/manifest.json',
    };
  return {
    action_id: action.actionId,
    title: action.title,
    summary: action.summary,
    owner: pack.domainId,
    effect: 'mutating',
    execution_binding: executionBinding,
    input_schema_ref: action.inputSchemaRef,
    output_schema_ref: action.outputSchemaRef,
    required_fields: action.requiredFields ?? action.workspaceLocatorFields,
    optional_fields: [],
    workspace_locator_fields: action.workspaceLocatorFields,
    human_gate_ids: action.humanGateIds,
    ...(action.executionBinding ? {} : {
      stage_route: {
        entry_stage_ref: pack.stage.stageId,
        required_stage_refs: [pack.stage.stageId],
        optional_stage_refs: [],
        terminal_stage_refs: [pack.stage.stageId],
        route_policy: 'ai_selected_progress_route',
      },
    }),
    supported_surfaces: {
      cli: {
        surface_kind: 'opl_generated_action_cli',
      },
      mcp: {
        tool_name: action.toolName,
        surface_kind: 'opl_generated_mcp_descriptor',
        descriptor_only: true,
        public_runtime: false,
      },
      skill: skillSurface,
      product_entry: {
        action_key: action.actionId,
        surface_kind: 'domain_product_entry_action',
      },
      openai: { tool_name: action.toolName },
      ai_sdk: { tool_name: action.toolName },
    },
    authority_boundary: targetActionAuthorityBoundary,
  };
}

function writeGeneratedSurfacePackFixture(repoRoot: string, pack: GeneratedSurfacePackFixture) {
  const carrierSlug = pack.carrierSlug ?? pack.domainId;
  fs.mkdirSync(path.join(repoRoot, 'agent', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'contracts'), { recursive: true });
  if (pack.authorityFile) {
    fs.mkdirSync(path.join(repoRoot, 'runtime', 'authority_functions'), { recursive: true });
  }
  writeFakePrimarySkill(repoRoot, carrierSlug, pack.domainLabel, pack.primarySkillBody);
  writeFakeRepoLocalPluginCarrier(repoRoot, carrierSlug);
  writeGeneratedSkillFixture(path.join(repoRoot, pack.skillPath), pack.skillTitle, pack.skillDescription);
  writeJsonFixture(path.join(repoRoot, 'contracts', 'domain_descriptor.json'), {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    domain_id: pack.domainId,
    domain_label: pack.domainLabel,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJsonFixture(path.join(repoRoot, 'contracts', 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: pack.catalogId,
    target_domain_id: pack.domainId,
    owner: pack.domainId,
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      domain_truth_owner: pack.domainId,
      write_policy: 'no_domain_truth_writes',
    },
    actions: pack.actions.map((action) => toGeneratedSurfaceAction(pack, action)),
    notes: [],
  });
  for (const action of pack.actions) {
    if (!action.inputSchemaRef.startsWith('opl://')) writeJsonFixture(path.join(repoRoot, action.inputSchemaRef), {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: action.requiredFields ?? action.workspaceLocatorFields,
      properties: Object.fromEntries(
        (action.requiredFields ?? action.workspaceLocatorFields).map((field) => [field, { type: 'string' }]),
      ),
    });
    if (!action.outputSchemaRef.startsWith('opl://')) writeJsonFixture(path.join(repoRoot, action.outputSchemaRef), {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    });
  }
  const stagePolicyRef = `agent/stages/${pack.stage.stageId}.md`;
  const promptRef = `agent/prompts/${pack.stage.stageId}.md`;
  const knowledgeRef = 'agent/knowledge/domain-boundary.md';
  const qualityGateRef = `agent/quality_gates/${pack.stage.stageId}.md`;
  const toolRef = 'agent/tools/domain-affordances.md';
  for (const ref of [stagePolicyRef, promptRef, knowledgeRef, qualityGateRef, toolRef]) {
    writeGeneratedSkillFixture(path.join(repoRoot, ref), pack.stage.title, pack.stage.goal);
  }
  writeJsonFixture(path.join(repoRoot, 'agent', 'stages', 'manifest.json'), {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: pack.domainId,
    owner: pack.domainId,
    authority_boundary: {
      domain_truth_owner: pack.domainId,
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: [{
      stage_id: pack.stage.stageId,
      stage_kind: pack.stage.stageKind,
      title: pack.stage.title,
      summary: pack.stage.summary,
      goal: pack.stage.goal,
      policy_ref: stagePolicyRef,
      prompt_ref: promptRef,
      knowledge_refs: [knowledgeRef],
      quality_gate_refs: [qualityGateRef],
      allowed_action_refs: pack.stage.allowedActionRefs,
      requires: [`${pack.stage.stageId}_input_ref`],
      ensures: [`${pack.stage.stageId}_owner_receipt_or_typed_blocker_ref`],
      next_stage_refs: [],
      trust_lane: 'codex_executor',
    }],
  });
  writeJsonFixture(path.join(repoRoot, 'contracts', 'owner_receipt_contract.json'), {
    surface_kind: 'owner_receipt_contract',
    schema_version: 1,
    owner: pack.domainId,
  });
  writeGeneratedSkillFixture(
    path.join(repoRoot, 'runtime', 'authority_functions', 'README.md'),
    'Authority Functions',
    'Domain-owned authority functions return refs, receipts, or typed blockers.',
  );
  writeJsonFixture(path.join(repoRoot, 'contracts', 'stage_control_plane.json'), {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: pack.planeId,
    target_domain_id: pack.domainId,
    owner: pack.domainId,
    authority_boundary: {
      domain_truth_owner: pack.domainId,
      opl_role: 'projection_consumer_only',
    },
    stages: [
      {
        stage_id: pack.stage.stageId,
        stage_kind: pack.stage.stageKind,
        title: pack.stage.title,
        summary: pack.stage.summary,
        goal: pack.stage.goal,
        owner: pack.domainId,
        domain_stage_refs: pack.stage.domainStageRefs,
        inputs: [],
        knowledge_refs: [],
        skills: [{ ref_kind: 'domain_skill_ref', ref: pack.skillPath }],
        prompt_refs: [],
        allowed_action_refs: pack.stage.allowedActionRefs,
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        authority_boundary: { domain_truth_owner: pack.domainId },
      },
    ],
    notes: [],
  });
  writeJsonFixture(path.join(repoRoot, 'contracts', 'generated_surface_handoff.json'), {
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 1,
    domain_id: pack.domainId,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    generated_surfaces: generatedSurfaceRefs,
    handoff_surfaces: [
      {
        surface_id: 'skill',
        current_paths: [pack.skillPath],
        current_role: 'domain_handler_target',
        target_role: 'opl_generated_skill_descriptor_surface',
      },
    ],
  });
  writeJsonFixture(path.join(repoRoot, 'contracts', 'functional_privatization_audit.json'), {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: pack.domainId,
    modules: pack.modules,
  });
  writeJsonFixture(path.join(repoRoot, 'contracts', 'pack_compiler_input.json'), {
    surface_kind: 'opl_domain_pack_compiler_input',
    schema_version: 1,
    domain_id: pack.domainId,
    canonical_agent_id: pack.canonicalAgentId,
    domain_pack_owner: pack.domainId,
    domain_repo_runtime_role: 'domain_handler_target_and_authority_functions',
    canonical_semantic_pack_root: 'agent/',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    standard_agent_pack_abi: STANDARD_AGENT_PACK_ABI,
    required_domain_pack_paths: [
      'agent/stages/manifest.json',
      stagePolicyRef,
      promptRef,
      pack.skillPath,
      toolRef,
      knowledgeRef,
      qualityGateRef,
    ],
  });
  if (pack.authorityFile) {
    writeJsonFixture(
      path.join(repoRoot, 'runtime', 'authority_functions', pack.authorityFile.fileName),
      pack.authorityFile.payload,
    );
  }
}

export function writeFakeOmaGeneratedSurfacePack(repoRoot: string) {
  writeGeneratedSurfacePackFixture(repoRoot, {
    canonicalAgentId: 'oma',
    domainId: 'agent_engineering',
    carrierSlug: 'opl-meta-agent',
    domainLabel: 'OPL Meta Agent',
    primarySkillBody: 'Use this rich primary skill to provide Agent engineering semantics to the OPL Foundry Kernel without owning execution, evidence, versions, activation, or rollback.',
    skillPath: 'agent/professional_skills/oma-design-basis-architecture/SKILL.md',
    skillTitle: 'OMA Design Basis Architecture',
    skillDescription: 'Design a traceable AgentBlueprint without materializing or activating target bytes.',
    catalogId: 'oma_action_catalog',
    planeId: 'oma_stage_plane',
    actions: [
      {
        actionId: 'engineer-agent',
        title: 'Engineer Agent',
        summary: 'Start one OPL-owned FoundryRun that uses OMA semantics to design or evolve an Agent and OPL to independently qualify and activate it.',
        inputSchemaRef: 'opl://foundry-protocol/DesignRequest',
        outputSchemaRef: 'opl://foundry-control/FoundryRun',
        requiredFields: [
          'surface_kind',
          'version',
          'request_id',
          'mode',
          'target_agent_id',
          'target_domain_id',
          'target_version_ref',
          'objective',
          'acceptance_criteria',
          'non_goals',
          'source_refs',
          'constraints',
          'delivery_policy',
        ],
        workspaceLocatorFields: [],
        humanGateIds: [],
        toolName: 'oma_engineer_agent',
        commandContractId: 'oma.engineer-agent',
        executionBinding: {
          kind: 'foundry_binding',
          providerManifestRef: 'contracts/foundry_provider.json',
        },
      },
    ],
    stage: {
      stageId: 'mission-intake',
      stageKind: 'intake',
      title: 'Mission Intake',
      summary: 'Normalize the Agent engineering mission and exact target identity.',
      goal: 'Admit a precise DesignRequest without inventing target-domain truth.',
      domainStageRefs: ['mission-intake'],
      allowedActionRefs: ['engineer-agent'],
    },
    modules: [
      {
        module_id: 'oma_domain_pack',
        classification: 'declarative_pack',
        owner: 'oma',
        code_paths: ['agent/'],
      },
      {
        module_id: 'oma_generated_skill',
        classification: 'declarative_pack_generated_surface',
        owner: 'oma',
        code_paths: ['agent/professional_skills/oma-design-basis-architecture/SKILL.md'],
        active_callers: ['OPL generated Skill'],
        active_caller_status: 'domain_pack_metadata_consumed_by_opl_generated_skill',
        migration_action: 'derive_skill_metadata_from_declarative_pack_and_opl_generated_surfaces',
      },
    ],
  });
}

export function writeFakeBookForgeGeneratedSurfacePack(repoRoot: string) {
  writeGeneratedSurfacePackFixture(repoRoot, {
    canonicalAgentId: 'obf',
    domainId: 'opl-bookforge',
    domainLabel: 'OPL Book Forge',
    primarySkillBody: 'Use this rich primary skill to shape book storylines, materialize chapters, plan figures and tables, run style checks, and prepare owner-gated export handoff. Generated action contracts may be appended by OPL, but they are not the primary skill source.',
    skillPath: 'agent/skills/book-production.md',
    skillTitle: 'Book Production',
    skillDescription: 'Use this generated-surface fixture to shape book storylines, materialize chapters, plan figures and tables, and prepare owner-gated export handoff.',
    catalogId: 'opl_bookforge_action_catalog',
    planeId: 'opl_bookforge_stage_plane',
    actions: [
      {
        actionId: 'shape-storyline',
        title: 'Shape Storyline',
        summary: 'Shape a book premise, reader promise, argument arc, source map, chapter thesis chain, style contract, and owner handoff.',
        inputSchemaRef: 'contracts/schemas/shape-storyline.input.schema.json',
        outputSchemaRef: 'contracts/schemas/shape-storyline.output.schema.json',
        workspaceLocatorFields: ['book_brief', 'source_corpus'],
        humanGateIds: ['storyline_owner_review'],
        toolName: 'opl_bookforge_shape_storyline',
        commandContractId: 'opl-bookforge.shape-storyline',
      },
      {
        actionId: 'materialize-book',
        title: 'Materialize Book',
        summary: 'Materialize chapters, manuscript body, figure and table plans, style checks, layout QC, exports, and owner-gated handoff refs.',
        inputSchemaRef: 'contracts/schemas/materialize-book.input.schema.json',
        outputSchemaRef: 'contracts/schemas/materialize-book.output.schema.json',
        workspaceLocatorFields: ['storyline', 'output_dir'],
        humanGateIds: ['book_owner_review'],
        toolName: 'opl_bookforge_materialize_book',
        commandContractId: 'opl-bookforge.materialize-book',
      },
    ],
    stage: {
      stageId: 'book-production',
      stageKind: 'creation',
      title: 'Book Production',
      summary: 'Shape and materialize a book deliverable.',
      goal: 'Create a coherent storyline and materialize its owner-gated book deliverable.',
      domainStageRefs: ['book-production'],
      allowedActionRefs: ['shape-storyline', 'materialize-book'],
    },
    modules: [
      {
        module_id: 'opl_bookforge_domain_pack',
        classification: 'declarative_pack',
        owner: 'opl-bookforge',
        code_paths: ['agent/'],
      },
    ],
  });
}
