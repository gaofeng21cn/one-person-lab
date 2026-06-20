import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
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
  return JSON.parse(result.stdout);
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
    payload: JSON.parse(result.stderr),
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
    payload: JSON.parse(result.stderr),
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
    args: ['module', 'sync'],
    command: 'opl module sync',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect reconcile-modules/],
  },
  {
    args: ['module', 'reconcile'],
    command: 'opl module reconcile',
    errorCode: 'cli_usage_error',
    replacements: [/opl connect reconcile-modules/],
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
  ];

  for (const spec of specs) {
    const repoRoot = path.join(workspaceRoot, spec.project);
    if (spec.project === 'opl-meta-agent') {
      fs.mkdirSync(repoRoot, { recursive: true });
      writeFakeOmaGeneratedSurfacePack(repoRoot);
      continue;
    }
    if (spec.project === 'opl-bookforge') {
      fs.mkdirSync(repoRoot, { recursive: true });
      writeFakeBookForgeGeneratedSurfacePack(repoRoot);
      continue;
    }
    const pluginRoot = path.join(repoRoot, 'plugins', spec.canonicalPlugin);
    const skillRoot = path.join(pluginRoot, 'skills', spec.canonicalPlugin);
    const installerPath = path.join(repoRoot, spec.installer!);
    fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: spec.canonicalPlugin, skills: './skills/' }, null, 2),
    );
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${spec.canonicalPlugin}\ndescription: ${fakeFamilySkillDescriptions[spec.canonicalPlugin]}\n---\n\n# ${spec.canonicalPlugin.toUpperCase()} App Skill\n\nThis fixture represents a canonical family app skill with a real workflow entry, not a placeholder.\n`,
    );
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

export function writeFakeOmaGeneratedSurfacePack(repoRoot: string) {
  const buildAgentBaselineCommand =
    'npm run build-agent-baseline -- --output-dir <output_dir> --opl-bin <opl_bin> --ai-reviewer-evaluation <ai_reviewer_evaluation> --domain-id <domain_id> --domain-label <domain_label> --delivery-domain <delivery_domain> --target-brief <target_brief>';

  fs.mkdirSync(path.join(repoRoot, 'agent', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'runtime', 'authority_functions'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'agent', 'skills', 'opl-meta-agent-domain-skill.md'),
    [
      '# Skill: OPL Meta Agent Domain Skill',
      '',
      'Use this generated-surface fixture to build, test, and improve OPL-compatible Foundry Agents.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'domain_descriptor.json'),
    JSON.stringify({
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: 'opl-meta-agent',
      domain_label: 'OPL Meta Agent',
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'action_catalog.json'),
    JSON.stringify({
      surface_kind: 'family_action_catalog',
      version: 'family-action-catalog.v1',
      catalog_id: 'opl_meta_agent_action_catalog',
      target_domain_id: 'opl-meta-agent',
      owner: 'opl-meta-agent',
      authority_boundary: {
        opl_role: 'generated_interface_projection_only',
        domain_truth_owner: 'opl-meta-agent',
      },
      actions: [
        {
          action_id: 'build-agent-baseline',
          title: 'Build Agent Baseline',
          summary: 'Generate an OPL-compatible candidate agent package from a user natural-language target-agent request, validate its standard scaffold, run an Agent Lab baseline suite, consume a structured AI reviewer evaluation, and emit baseline delivery and learning refs.',
          owner: 'opl-meta-agent',
          effect: 'mutating',
          source_command: {
            command: buildAgentBaselineCommand,
            surface_kind: 'domain_smoke_cli',
          },
          input_schema_ref: 'contracts/schemas/build-agent-baseline.input.schema.json',
          output_schema_ref: 'contracts/schemas/build-agent-baseline.output.schema.json',
          workspace_locator_fields: [
            'output_dir',
            'opl_bin',
            'ai_reviewer_evaluation',
            'domain_id',
            'domain_label',
            'delivery_domain',
            'target_brief',
          ],
          human_gate_ids: ['baseline_delivery_owner_review'],
          supported_surfaces: {
            cli: {
              command: buildAgentBaselineCommand,
              surface_kind: 'domain_smoke_cli',
            },
            mcp: {
              tool_name: 'opl_meta_agent_build_agent_baseline',
              surface_kind: 'opl_generated_mcp_descriptor',
              descriptor_only: true,
              public_runtime: false,
            },
            skill: {
              command_contract_id: 'opl-meta-agent.build-agent-baseline',
              surface_kind: 'opl_generated_skill_contract',
              intent_mapping: 'Codex extracts domain_id, domain_label, delivery_domain, target_brief, output_dir, opl_bin, and ai_reviewer_evaluation from the user natural-language request before invoking this action.',
            },
            product_entry: {
              action_key: 'build-agent-baseline',
              command: buildAgentBaselineCommand,
              surface_kind: 'domain_product_entry_action',
            },
            openai: { tool_name: 'opl_meta_agent_build_agent_baseline' },
            ai_sdk: { tool_name: 'opl_meta_agent_build_agent_baseline' },
          },
          authority_boundary: {
            can_write_target_domain_truth: false,
            can_write_target_domain_memory_body: false,
            can_mutate_target_domain_artifact_body: false,
            can_authorize_target_domain_quality_or_export: false,
            can_promote_default_agent_without_gate: false,
            can_train_or_deploy_model_weights: false,
          },
        },
      ],
      notes: [],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'stage_control_plane.json'),
    JSON.stringify({
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'opl_meta_agent_stage_plane',
      target_domain_id: 'opl-meta-agent',
      owner: 'opl-meta-agent',
      authority_boundary: {
        domain_truth_owner: 'opl-meta-agent',
        opl_role: 'projection_consumer_only',
      },
      stages: [
        {
          stage_id: 'agent-skeleton-build',
          stage_kind: 'creation',
          title: 'Agent Skeleton Build',
          summary: 'Generate a candidate agent skeleton.',
          goal: 'Generate an OPL-compatible candidate agent skeleton.',
          owner: 'opl-meta-agent',
          domain_stage_refs: ['agent-skeleton-build'],
          inputs: [],
          knowledge_refs: [],
          skills: [
            {
              ref_kind: 'domain_skill_ref',
              ref: 'agent/skills/opl-meta-agent-domain-skill.md',
            },
          ],
          prompt_refs: [],
          allowed_action_refs: ['build-agent-baseline'],
          outputs: [],
          evaluation: [],
          handoff: null,
          source_refs: [],
          authority_boundary: {
            domain_truth_owner: 'opl-meta-agent',
          },
        },
      ],
      notes: [],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'generated_surface_handoff.json'),
    JSON.stringify({
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'opl-meta-agent',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: [
        { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
      ],
      handoff_surfaces: [
        {
          surface_id: 'skill',
          current_paths: ['agent/skills/opl-meta-agent-domain-skill.md'],
          current_role: 'domain_handler_target',
          target_role: 'opl_generated_skill_descriptor_surface',
        },
      ],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'functional_privatization_audit.json'),
    JSON.stringify({
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'opl-meta-agent',
      modules: [
        {
          module_id: 'opl_meta_agent_domain_pack',
          classification: 'declarative_pack',
          owner: 'opl-meta-agent',
          code_paths: ['agent/'],
        },
        {
          module_id: 'opl_meta_agent_generated_skill',
          classification: 'declarative_pack_generated_surface',
          owner: 'opl-meta-agent',
          code_paths: ['agent/skills/opl-meta-agent-domain-skill.md'],
          active_callers: ['OPL generated Skill'],
          active_caller_status: 'domain_pack_metadata_consumed_by_opl_generated_skill',
          migration_action: 'derive_skill_metadata_from_declarative_pack_and_opl_generated_surfaces',
        },
      ],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'pack_compiler_input.json'),
    JSON.stringify({
      surface_kind: 'opl_domain_pack_compiler_input',
      schema_version: 1,
      domain_id: 'opl-meta-agent',
      domain_pack_owner: 'opl-meta-agent',
      canonical_semantic_pack_root: 'agent/',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      required_domain_pack_paths: ['agent/skills/opl-meta-agent-domain-skill.md'],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'runtime', 'authority_functions', 'meta-agent-authority-functions.json'),
    JSON.stringify({
      script_morphology_policy: {
        allowed_classes: ['authority_function_implementation_ref'],
        forbidden_roles: ['generic_cli_mcp_product_wrapper_owner'],
      },
    }, null, 2) + '\n',
    'utf8',
  );
}

export function writeFakeBookForgeGeneratedSurfacePack(repoRoot: string) {
  fs.mkdirSync(path.join(repoRoot, 'agent', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'agent', 'skills', 'book-production.md'),
    [
      '# Skill: Book Production',
      '',
      'Use this generated-surface fixture to shape book storylines, materialize chapters, plan figures and tables, and prepare owner-gated export handoff.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'domain_descriptor.json'),
    JSON.stringify({
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: 'opl-bookforge',
      domain_label: 'OPL Book Forge',
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'action_catalog.json'),
    JSON.stringify({
      surface_kind: 'family_action_catalog',
      version: 'family-action-catalog.v1',
      catalog_id: 'opl_bookforge_action_catalog',
      target_domain_id: 'opl-bookforge',
      owner: 'opl-bookforge',
      authority_boundary: {
        opl_role: 'generated_interface_projection_only',
        domain_truth_owner: 'opl-bookforge',
      },
      actions: [
        {
          action_id: 'shape-storyline',
          title: 'Shape Storyline',
          summary: 'Shape a book premise, reader promise, argument arc, source map, chapter thesis chain, style contract, and owner handoff.',
          owner: 'opl-bookforge',
          effect: 'mutating',
          source_command: {
            command: 'npm run shape-storyline -- --book-brief <book_brief> --source-corpus <source_corpus>',
            surface_kind: 'domain_smoke_cli',
          },
          input_schema_ref: 'contracts/schemas/shape-storyline.input.schema.json',
          output_schema_ref: 'contracts/schemas/shape-storyline.output.schema.json',
          workspace_locator_fields: ['book_brief', 'source_corpus'],
          human_gate_ids: ['storyline_owner_review'],
          supported_surfaces: {
            cli: {
              command: 'npm run shape-storyline -- --book-brief <book_brief> --source-corpus <source_corpus>',
              surface_kind: 'domain_smoke_cli',
            },
            mcp: {
              tool_name: 'opl_bookforge_shape_storyline',
              surface_kind: 'opl_generated_mcp_descriptor',
              descriptor_only: true,
              public_runtime: false,
            },
            skill: {
              command_contract_id: 'opl-bookforge.shape-storyline',
              surface_kind: 'opl_generated_skill_contract',
            },
            product_entry: {
              action_key: 'shape-storyline',
              command: 'npm run shape-storyline -- --book-brief <book_brief> --source-corpus <source_corpus>',
              surface_kind: 'domain_product_entry_action',
            },
            openai: { tool_name: 'opl_bookforge_shape_storyline' },
            ai_sdk: { tool_name: 'opl_bookforge_shape_storyline' },
          },
          authority_boundary: {
            can_write_target_domain_truth: false,
            can_write_target_domain_memory_body: false,
            can_mutate_target_domain_artifact_body: false,
            can_authorize_target_domain_quality_or_export: false,
            can_promote_default_agent_without_gate: false,
            can_train_or_deploy_model_weights: false,
          },
        },
        {
          action_id: 'materialize-book',
          title: 'Materialize Book',
          summary: 'Materialize chapters, manuscript body, figure and table plans, style checks, layout QC, exports, and owner-gated handoff refs.',
          owner: 'opl-bookforge',
          effect: 'mutating',
          source_command: {
            command: 'npm run materialize-book -- --storyline <storyline> --output-dir <output_dir>',
            surface_kind: 'domain_smoke_cli',
          },
          input_schema_ref: 'contracts/schemas/materialize-book.input.schema.json',
          output_schema_ref: 'contracts/schemas/materialize-book.output.schema.json',
          workspace_locator_fields: ['storyline', 'output_dir'],
          human_gate_ids: ['book_owner_review'],
          supported_surfaces: {
            cli: {
              command: 'npm run materialize-book -- --storyline <storyline> --output-dir <output_dir>',
              surface_kind: 'domain_smoke_cli',
            },
            mcp: {
              tool_name: 'opl_bookforge_materialize_book',
              surface_kind: 'opl_generated_mcp_descriptor',
              descriptor_only: true,
              public_runtime: false,
            },
            skill: {
              command_contract_id: 'opl-bookforge.materialize-book',
              surface_kind: 'opl_generated_skill_contract',
            },
            product_entry: {
              action_key: 'materialize-book',
              command: 'npm run materialize-book -- --storyline <storyline> --output-dir <output_dir>',
              surface_kind: 'domain_product_entry_action',
            },
            openai: { tool_name: 'opl_bookforge_materialize_book' },
            ai_sdk: { tool_name: 'opl_bookforge_materialize_book' },
          },
          authority_boundary: {
            can_write_target_domain_truth: false,
            can_write_target_domain_memory_body: false,
            can_mutate_target_domain_artifact_body: false,
            can_authorize_target_domain_quality_or_export: false,
            can_promote_default_agent_without_gate: false,
            can_train_or_deploy_model_weights: false,
          },
        },
      ],
      notes: [],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'stage_control_plane.json'),
    JSON.stringify({
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'opl_bookforge_stage_plane',
      target_domain_id: 'opl-bookforge',
      owner: 'opl-bookforge',
      authority_boundary: {
        domain_truth_owner: 'opl-bookforge',
        opl_role: 'projection_consumer_only',
      },
      stages: [
        {
          stage_id: 'storyline-architecture',
          stage_kind: 'creation',
          title: 'Storyline Architecture',
          summary: 'Shape a book storyline.',
          goal: 'Create a reader promise, argument arc, chapter thesis chain, and style contract.',
          owner: 'opl-bookforge',
          domain_stage_refs: ['storyline-architecture'],
          inputs: [],
          knowledge_refs: [],
          skills: [{ ref_kind: 'domain_skill_ref', ref: 'agent/skills/book-production.md' }],
          prompt_refs: [],
          allowed_action_refs: ['shape-storyline'],
          outputs: [],
          evaluation: [],
          handoff: null,
          source_refs: [],
          authority_boundary: { domain_truth_owner: 'opl-bookforge' },
        },
      ],
      notes: [],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'generated_surface_handoff.json'),
    JSON.stringify({
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'opl-bookforge',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: [
        { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
      ],
      handoff_surfaces: [
        {
          surface_id: 'skill',
          current_paths: ['agent/skills/book-production.md'],
          current_role: 'domain_handler_target',
          target_role: 'opl_generated_skill_descriptor_surface',
        },
      ],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'functional_privatization_audit.json'),
    JSON.stringify({
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'opl-bookforge',
      modules: [
        {
          module_id: 'opl_bookforge_domain_pack',
          classification: 'declarative_pack',
          owner: 'opl-bookforge',
          code_paths: ['agent/'],
        },
      ],
    }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'contracts', 'pack_compiler_input.json'),
    JSON.stringify({
      surface_kind: 'opl_domain_pack_compiler_input',
      schema_version: 1,
      domain_id: 'opl-bookforge',
      domain_pack_owner: 'opl-bookforge',
      canonical_semantic_pack_root: 'agent/',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      required_domain_pack_paths: ['agent/skills/book-production.md'],
    }, null, 2) + '\n',
    'utf8',
  );
}
