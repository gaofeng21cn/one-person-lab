import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  compileFlowCapabilityBuildLock,
  compileFlowCapabilityStrategy,
  compileFlowCapabilityStrategyFromSourceRoot,
} from '../../src/adapters/integration/agent-package-registry/flow-capability-compiler.ts';
import {
  buildOplRecommendedSkills,
  syncOplCompanionSkills,
} from '../../src/adapters/integration/install-companions.ts';
import type {
  AgentPackageFlowCapabilityBundle,
  AgentPackageManagedPolicyDependency,
} from '../../src/adapters/integration/agent-package-registry/types.ts';

function dependency(input: Partial<AgentPackageManagedPolicyDependency> & Pick<AgentPackageManagedPolicyDependency, 'id' | 'kind'>) {
  return {
    online_install_default: true,
    activation: 'task_routed' as const,
    ...input,
  } as AgentPackageManagedPolicyDependency;
}

function runFixtureGit(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`);
}

function githubSkillFixture(input: {
  root: string;
  skillId: string;
  skill: string;
  resources?: Record<string, string>;
}) {
  const repositoryRoot = path.join(input.root, 'upstream');
  const skillRoot = path.join(repositoryRoot, 'skills', input.skillId);
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), input.skill, 'utf8');
  for (const [relativePath, content] of Object.entries(input.resources ?? {})) {
    const target = path.join(skillRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  runFixtureGit(repositoryRoot, ['init', '--quiet']);
  runFixtureGit(repositoryRoot, ['config', 'user.name', 'OPL Test']);
  runFixtureGit(repositoryRoot, ['config', 'user.email', 'opl-test@example.invalid']);
  runFixtureGit(repositoryRoot, ['add', '.']);
  runFixtureGit(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);
  return {
    id: input.skillId,
    sourceMode: 'github' as const,
    repositoryUrl: repositoryRoot,
    repositorySourcePath: `skills/${input.skillId}`,
    owner: 'fixture-owner',
    requiredTools: [],
    installSource: 'framework_git_projection',
    required: false,
  };
}

test('Flow capability compiler derives online and Full plans from bundle-owned policy', () => {
  const experienceBaseline = [
    dependency({ id: 'agent-reach', kind: 'codex_skill', bundle_id: 'internet-research', offline_bundle: 'none' }),
    dependency({ id: 'agent-reach', kind: 'cli', bundle_id: 'internet-research', offline_bundle: 'none' }),
    dependency({ id: 'officecli', kind: 'cli', bundle_id: 'office-authoring', offline_bundle: 'full' }),
    dependency({ id: 'gh-stack', kind: 'cli', bundle_id: 'stacked-pr-landing', offline_bundle: 'none' }),
    dependency({ id: 'ffmpeg', kind: 'cli', bundle_id: 'browser-gif-encoding', offline_bundle: 'none' }),
  ];
  const bundles: AgentPackageFlowCapabilityBundle[] = [{
    id: 'internet-research',
    label: 'Internet research',
    relationship: 'experience_baseline',
    member_refs: ['codex_skill:agent-reach', 'cli:agent-reach'],
    online_materialization: 'members_marked_default',
    full_distribution: 'members_marked_full',
    readiness: {
      aggregation: 'all_members',
      absence_effect: 'degraded_non_blocking',
      repair_policy: 'framework_or_owner_adapter',
    },
  }, {
    id: 'stacked-pr-landing',
    label: 'Stacked pull-request landing',
    relationship: 'experience_baseline',
    member_refs: ['cli:gh-stack'],
    online_materialization: 'members_marked_default',
    full_distribution: 'members_marked_full',
    readiness: {
      aggregation: 'all_members',
      absence_effect: 'degraded_non_blocking',
      repair_policy: 'framework_or_owner_adapter',
    },
  }, {
    id: 'browser-gif-encoding',
    label: 'Browser GIF encoding',
    relationship: 'experience_baseline',
    member_refs: ['cli:ffmpeg'],
    online_materialization: 'members_marked_default',
    full_distribution: 'members_marked_full',
    readiness: {
      aggregation: 'all_members',
      absence_effect: 'degraded_non_blocking',
      repair_policy: 'framework_or_owner_adapter',
    },
  }, {
    id: 'office-authoring',
    label: 'Office authoring',
    relationship: 'experience_baseline',
    member_refs: ['cli:officecli'],
    online_materialization: 'members_marked_default',
    full_distribution: 'members_marked_full',
    readiness: {
      aggregation: 'all_members',
      absence_effect: 'degraded_non_blocking',
      repair_policy: 'framework_or_owner_adapter',
    },
  }];
  const strategy = compileFlowCapabilityStrategy({
    schema: 'opl_flow_workflow_policy.v4',
    package: { id: 'opl-flow', version: '0.1.30' },
    requires: [],
    experienceBaseline,
    compatibleOptional: [],
    capabilityBundles: bundles,
    policySha256: 'a'.repeat(64),
  });
  assert.deepEqual(
    strategy.materialization_plan.items.map((item) => item.capability_ref),
    ['cli:agent-reach', 'cli:ffmpeg', 'cli:gh-stack', 'cli:officecli', 'codex_skill:agent-reach'],
  );
  assert.deepEqual(
    strategy.full_distribution_plan.items.map((item) => item.capability_ref),
    ['cli:officecli'],
  );
  assert.throws(
    () => compileFlowCapabilityBuildLock({ strategy, resolutions: [] }),
    /missing an exact source resolution/,
  );
  const lock = compileFlowCapabilityBuildLock({
    strategy,
    resolutions: [{
      capability_ref: 'cli:officecli',
      source_ref: 'owner-release:officecli@1.2.3',
      source_sha256: 'b'.repeat(64),
      version: '1.2.3',
    }],
  });
  assert.deepEqual(lock.items.map((item) => item.capability_ref), ['cli:officecli']);
  assert.match(lock.lock_digest, /^[a-f0-9]{64}$/);
  assert.throws(
    () => compileFlowCapabilityBuildLock({
      strategy,
      resolutions: [{
        capability_ref: 'cli:mineru-open-api',
        source_ref: 'owner-release:mineru-open-api@1.2.3',
        source_sha256: 'c'.repeat(64),
        version: '1.2.3',
      }],
    }),
    /unselected capabilities/,
  );
});

test('Flow capability compiler rejects invalid dependency lifecycle enums at its public boundary', () => {
  const baseline = dependency({
    id: 'fixture-skill',
    kind: 'codex_skill',
    bundle_id: 'fixture',
    source: 'https://github.com/example/fixture',
    source_path: 'skills/fixture-skill',
  });
  const bundles: AgentPackageFlowCapabilityBundle[] = [{
    id: 'fixture',
    label: 'Fixture',
    relationship: 'experience_baseline',
    member_refs: ['codex_skill:fixture-skill'],
    online_materialization: 'members_marked_default',
    full_distribution: 'members_marked_full',
    readiness: {
      aggregation: 'all_members',
      absence_effect: 'degraded_non_blocking',
      repair_policy: 'framework_or_owner_adapter',
    },
  }];
  for (const [field, invalid] of [
    ['conflict_policy', 'overwrite_user_surface'],
    ['credential_policy', 'bundle_credentials'],
    ['readiness_adapter', 'assume_ready'],
  ] as const) {
    assert.throws(
      () => compileFlowCapabilityStrategy({
        schema: 'opl_flow_workflow_policy.v4',
        package: { id: 'opl-flow', version: '0.1.30' },
        requires: [],
        experienceBaseline: [{ ...baseline, [field]: invalid } as AgentPackageManagedPolicyDependency],
        compatibleOptional: [],
        capabilityBundles: bundles,
        policySha256: 'a'.repeat(64),
      }),
      new RegExp(`experience_baseline\\[0\\]\\.${field} is invalid`),
    );
  }
});

test('Flow source compiler validates the Flow-owned policy schema before projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-policy-schema-'));
  const contracts = path.join(root, 'contracts');
  fs.mkdirSync(contracts, { recursive: true });
  const dependencyProperties = {
    id: { type: 'string' },
    kind: { const: 'codex_skill' },
    bundle_id: { type: 'string' },
    source: { type: 'string' },
    source_path: { type: 'string' },
    online_install_default: { type: 'boolean' },
    activation: { const: 'task_routed' },
  };
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.test/opl-flow-capability-policy-schema.json',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'package', 'requires', 'experience_baseline', 'compatible_optional', 'capability_bundles'],
    properties: {
      schema: { const: 'opl_flow_workflow_policy.v4' },
      package: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'version'],
        properties: { id: { type: 'string' }, version: { type: 'string' } },
      },
      requires: { type: 'array' },
      experience_baseline: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(dependencyProperties),
          properties: dependencyProperties,
        },
      },
      compatible_optional: { type: 'array' },
      capability_bundles: { type: 'array' },
    },
  };
  const policy = {
    schema: 'opl_flow_workflow_policy.v4',
    package: { id: 'opl-flow', version: '0.1.30' },
    requires: [],
    experience_baseline: [{
      id: 'fixture-skill',
      kind: 'codex_skill',
      bundle_id: 'fixture',
      source: 'https://github.com/example/fixture',
      source_path: 'skills/fixture-skill',
      online_install_default: true,
      activation: 'task_routed',
      unexpected_parallel_catalog_hint: true,
    }],
    compatible_optional: [],
    capability_bundles: [],
  };
  fs.writeFileSync(
    path.join(contracts, 'workflow-policy.schema.json'),
    `${JSON.stringify(schema, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(contracts, 'workflow-policy.json'), `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  try {
    assert.throws(
      () => compileFlowCapabilityStrategyFromSourceRoot(root),
      /Payload failed JSON Schema validation/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('companion materialization is a no-op without a Flow-derived plan', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-empty-capability-plan-'));
  assert.deepEqual(buildOplRecommendedSkills(home), []);
  const result = syncOplCompanionSkills(home, { mode: 'managed' });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.summary, {
    total: 0,
    ready: 0,
    synced: 0,
    missing_source: 0,
    failed: 0,
    tools_ready: 0,
    tools_total: 0,
  });
});

test('generic Flow-declared Git Skill projection converges one global entrypoint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-github-skill-'));
  const home = path.join(root, 'home');
  const skillId = 'fixture-skill';
  const managedDependency = githubSkillFixture({
    root,
    skillId,
    skill: [
      '---',
      `name: ${skillId}`,
      'description: Flow-declared upstream fixture.',
      'triggers:',
      '  - fixture work',
      'metadata:',
      '  owner: upstream',
      '---',
      '',
      `# ${skillId}`,
      '',
    ].join('\n'),
  });
  try {
    const managed = syncOplCompanionSkills(home, {
      mode: 'managed',
      skillIds: [skillId],
      managedSkillDependencies: [managedDependency],
    });
    const item = managed.items[0];
    assert.equal(item?.status, 'synced');
    assert.equal(item?.source_authority, 'github_repository');
    assert.equal(item?.frontmatter_schema_status, 'valid');
    assert.equal(item?.resource_closure_status, 'complete');
    assert.equal(item?.payload_currentness, 'current');
    assert.equal(item?.entrypoint_authority_status, 'converged');
    assert.equal(item?.source_payload_sha256, item?.installed_payload_sha256);
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', skillId)), false);

    const sourceRoot = item?.source_path;
    assert.ok(sourceRoot);
    const payloadBefore = item.source_payload_sha256;
    fs.mkdirSync(path.join(sourceRoot, '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '__pycache__', 'helper.pyc'), 'runtime cache\n');
    fs.writeFileSync(path.join(sourceRoot, 'helper.pyo'), 'runtime cache\n');
    const observed = syncOplCompanionSkills(home, {
      mode: 'observe',
      skillIds: [skillId],
      managedSkillDependencies: [managedDependency],
      networkAccess: 'forbidden',
    });
    assert.equal(observed.items[0]?.status, 'ready');
    assert.equal(observed.items[0]?.source_payload_sha256, payloadBefore);
    assert.equal(observed.items[0]?.payload_currentness, 'current');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generic Flow-declared Git Skill projection accepts valid YAML description forms', () => {
  const foldedDescription = 'MinerU extracts documents into reliable structured outputs for downstream workflows. '.repeat(20).trim();
  assert.ok(foldedDescription.length > 1024);
  const cases = [{
    label: 'quoted comparison text',
    skillId: 'quoted-description-skill',
    description: 'description: "Use this dashboard workflow for reports with < 10 rows."',
  }, {
    label: 'folded block scalar',
    skillId: 'folded-description-skill',
    description: `description: >\n  ${foldedDescription}`,
  }];

  for (const fixture of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-yaml-description-'));
    const home = path.join(root, 'home');
    const managedDependency = githubSkillFixture({
      root,
      skillId: fixture.skillId,
      skill: `---\nname: ${fixture.skillId}\n${fixture.description}\n---\n# fixture\n`,
    });
    try {
      const managed = syncOplCompanionSkills(home, {
        mode: 'managed',
        skillIds: [fixture.skillId],
        managedSkillDependencies: [managedDependency],
      });
      const item = managed.items[0];
      assert.equal(item?.status, 'synced', fixture.label);
      assert.equal(item?.frontmatter_schema_status, 'valid', fixture.label);
      assert.equal(item?.resource_closure_status, 'complete', fixture.label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('generic Flow-declared Git Skill projection validates payloads before convergence', () => {
  const cases = [
    {
      label: 'unexpected frontmatter field',
      skill: '---\nname: fixture-skill\ndescription: Valid description.\nhidden: true\n---\n# fixture\n',
      expectedFrontmatter: 'invalid',
      expectedClosure: 'complete',
    },
    {
      label: 'missing resource closure',
      skill: '---\nname: fixture-skill\ndescription: Valid description.\n---\n# fixture\nUse `references/missing.md`.\n',
      expectedFrontmatter: 'valid',
      expectedClosure: 'incomplete',
    },
    {
      label: 'mismatched skill identity',
      skill: '---\nname: another-skill\ndescription: Valid description.\n---\n# fixture\n',
      expectedFrontmatter: 'invalid',
      expectedClosure: 'complete',
    },
    {
      label: 'unsafe description control character',
      skill: '---\nname: fixture-skill\ndescription: "Invalid\u0007description."\n---\n# fixture\n',
      expectedFrontmatter: 'invalid',
      expectedClosure: 'complete',
    },
    {
      label: 'oversized description',
      skill: `---\nname: fixture-skill\ndescription: ${'x'.repeat(4097)}\n---\n# fixture\n`,
      expectedFrontmatter: 'invalid',
      expectedClosure: 'complete',
    },
  ];

  for (const fixture of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-invalid-github-skill-'));
    const home = path.join(root, 'home');
    const managedDependency = githubSkillFixture({ root, skillId: 'fixture-skill', skill: fixture.skill });
    try {
      const managed = syncOplCompanionSkills(home, {
        mode: 'managed',
        skillIds: ['fixture-skill'],
        managedSkillDependencies: [managedDependency],
      });
      const item = managed.items[0];
      assert.equal(item?.status, 'failed', fixture.label);
      assert.equal(item?.frontmatter_schema_status, fixture.expectedFrontmatter, fixture.label);
      assert.equal(item?.resource_closure_status, fixture.expectedClosure, fixture.label);
      assert.equal(fs.existsSync(path.join(home, '.codex', 'skills', 'fixture-skill')), false, fixture.label);
      assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'fixture-skill')), false, fixture.label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('generic Flow-declared Git Skill projection accepts in-root resource directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-github-skill-resource-'));
  const home = path.join(root, 'home');
  const managedDependency = githubSkillFixture({
    root,
    skillId: 'fixture-skill',
    skill: '---\nname: fixture-skill\ndescription: Valid description.\n---\n# fixture\nUse `assets/starter/`.\n',
    resources: { 'assets/starter/template.txt': 'template\n' },
  });
  try {
    const managed = syncOplCompanionSkills(home, {
      mode: 'managed',
      skillIds: ['fixture-skill'],
      managedSkillDependencies: [managedDependency],
    });
    assert.equal(managed.items[0]?.status, 'synced');
    assert.equal(managed.items[0]?.resource_closure_status, 'complete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generic Flow-declared Git Skill projection preserves a user-managed global entrypoint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-github-skill-conflict-'));
  const home = path.join(root, 'home');
  const skillId = 'fixture-skill';
  const managedDependency = githubSkillFixture({
    root,
    skillId,
    skill: '---\nname: fixture-skill\ndescription: Managed fixture.\n---\n# managed\n',
  });
  const userSkillRoot = path.join(home, '.codex', 'skills', skillId);
  const userSkill = '---\nname: fixture-skill\ndescription: User fixture.\n---\n# user\n';
  fs.mkdirSync(userSkillRoot, { recursive: true });
  fs.writeFileSync(path.join(userSkillRoot, 'SKILL.md'), userSkill, 'utf8');
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(home, '.codex');
  try {
    const managed = syncOplCompanionSkills(home, {
      mode: 'managed',
      skillIds: [skillId],
      managedSkillDependencies: [managedDependency],
    });
    assert.equal(managed.items[0]?.status, 'failed');
    assert.match(managed.items[0]?.note ?? '', /User-managed skill entrypoint conflict/);
    assert.equal(fs.readFileSync(path.join(userSkillRoot, 'SKILL.md'), 'utf8'), userSkill);
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', skillId)), false);
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Agent Reach owner adapter links its Skill with unverified channels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-reach-adapter-'));
  const home = path.join(root, 'home');
  const binary = path.join(root, 'agent-reach');
  const calls = path.join(root, 'calls.log');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    `const calls = ${JSON.stringify(calls)};`,
    "fs.appendFileSync(calls, process.argv.slice(2).join(' ') + '\\n');",
    "const args = process.argv.slice(2);",
    "const respond = (action, result) => console.log(JSON.stringify({ schema_version: 1, ok: true, action, result }));",
    "if (args.length === 1 && args[0] === 'version') { respond('version', { version: '1.6.1' }); process.exit(0); }",
    "if (args.length === 1 && args[0] === 'doctor') {",
    "  const channels = [{ channel: 'web', level: 'default', status: 'unverified', problems: [] }];",
    "  respond('doctor', { version: '1.6.1', channels });",
    "  process.exit(0);",
    "}",
    "if (args.length === 3 && args[0] === 'skill' && args[1] === 'link') {",
    "  const target = path.join(args[2], 'agent-reach');",
    "  fs.mkdirSync(target, { recursive: true });",
    "  fs.writeFileSync(path.join(target, 'SKILL.md'), '---\\nname: agent-reach\\ndescription: Internet research owner adapter.\\ntriggers:\\n  - research\\nmetadata:\\n  owner: upstream\\n---\\n# Agent Reach\\n');",
    "  process.exit(0);",
    "}",
    'process.exit(2);',
  ].join('\n'), { mode: 0o755 });
  const previousBinary = process.env.OPL_AGENT_REACH_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_AGENT_REACH_BIN = binary;
  process.env.CODEX_HOME = path.join(home, '.codex');
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  const skillLink = `skill link ${path.join(home, '.codex', 'skills')}`;
  try {
    const dependency = {
      id: 'agent-reach',
      sourceMode: 'owner_cli' as const,
      ownerToolId: 'agent-reach' as const,
      owner: 'agent-reach',
      requiredTools: ['agent-reach' as const],
      installSource: 'owner_cli',
      required: false,
    };
    const managed = syncOplCompanionSkills(home, {
      mode: 'managed',
      skillIds: ['agent-reach'],
      toolIds: ['agent-reach'],
      managedSkillDependencies: [dependency],
      networkAccess: 'forbidden',
    });
    assert.equal(managed.items[0]?.status, 'ready');
    assert.equal(managed.items[0]?.source_authority, 'existing_codex_entry');
    assert.equal(managed.items[0]?.frontmatter_schema_status, 'valid');
    assert.equal(managed.tools[0]?.status, 'ready');
    assert.equal(managed.tools[0]?.health_check?.status, 'ready');
    const managedCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(managedCalls.filter((call) => call === skillLink).length, 1);

    const repeated = syncOplCompanionSkills(home, {
      mode: 'managed',
      skillIds: ['agent-reach'],
      toolIds: ['agent-reach'],
      managedSkillDependencies: [dependency],
      networkAccess: 'forbidden',
    });
    assert.equal(repeated.items[0]?.status, 'ready');
    const repeatedCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(repeatedCalls.filter((call) => call === skillLink).length, 1);

    const observed = syncOplCompanionSkills(home, {
      mode: 'observe',
      skillIds: ['agent-reach'],
      toolIds: ['agent-reach'],
      managedSkillDependencies: [dependency],
      networkAccess: 'forbidden',
    });
    assert.equal(observed.items[0]?.status, 'ready');
    const observedCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(observedCalls.filter((call) => call === skillLink).length, 1);

    fs.writeFileSync(calls, '', 'utf8');
    const fastObserved = syncOplCompanionSkills(home, {
      mode: 'observe',
      skillIds: [],
      toolIds: ['agent-reach'],
      managedSkillDependencies: [],
      networkAccess: 'forbidden',
      toolInspection: 'fast',
    });
    assert.equal(fastObserved.tools[0]?.status, 'ready');
    assert.equal(fastObserved.tools[0]?.health_check, undefined);
    const fastCalls = fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean);
    assert.deepEqual(fastCalls, ['version']);

    fs.writeFileSync(calls, '', 'utf8');
    const fullObserved = syncOplCompanionSkills(home, {
      mode: 'observe',
      skillIds: [],
      toolIds: ['agent-reach'],
      managedSkillDependencies: [],
      networkAccess: 'forbidden',
      toolInspection: 'full',
    });
    assert.equal(fullObserved.tools[0]?.health_check?.status, 'ready');
    const fullCalls = fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean);
    assert.deepEqual(fullCalls, ['version', 'doctor']);
  } finally {
    if (previousBinary === undefined) delete process.env.OPL_AGENT_REACH_BIN;
    else process.env.OPL_AGENT_REACH_BIN = previousBinary;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
