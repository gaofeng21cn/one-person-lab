import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../../../src/kernel/contract-validation.ts';
import {
  assertAgentPackageSkillProjection,
  materializeAgentPackageWorkspaceSkillProjection,
  refreshInstalledAgentPackageWorkspaceSkills,
  syncAgentPackageSkillProjectionToWorkspace,
} from '../../../../src/adapters/integration/agent-package-registry-parts/skill-projection.ts';
import { hostAttemptSkillRuntime } from '../../../../src/adapters/execution/family-runtime-attempt-skill-projection.ts';

function writeProfessionalSkill(root: string, skillId: string, body = `# ${skillId}\n`) {
  const skillRoot = path.join(root, 'agent', 'professional_skills', skillId);
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), body);
}

function writeCapabilityMap(root: string, skillIds: string[]) {
  fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'contracts', 'capability_map.json'), `${JSON.stringify({
    surface_kind: 'opl_standard_agent_capability_map',
    capabilities: skillIds.map((skillId) => ({
      capability_id: skillId,
      surface_role: 'professional_skill',
      capability_kind: 'professional_skill',
      physical_source_ref: {
        ref_kind: 'repo_path',
        ref: `agent/professional_skills/${skillId}/SKILL.md`,
      },
    })),
  }, null, 2)}\n`);
}

function rootFixture(root: string, skillIds: string[]) {
  for (const skillId of skillIds) writeProfessionalSkill(root, skillId);
  writeCapabilityMap(root, skillIds);
}

function providerFixture(root: string, skillIds: string[]) {
  for (const skillId of skillIds) {
    const skillRoot = path.join(root, 'skills', skillId);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${skillId}\n`);
  }
}

function numberedSkills(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

function removeFixture(root: string) {
  function makeWritable(candidate: string) {
    if (!fs.existsSync(candidate)) return;
    const stat = fs.lstatSync(candidate);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.chmodSync(candidate, 0o755);
      for (const entry of fs.readdirSync(candidate)) makeWritable(path.join(candidate, entry));
    } else if (!stat.isSymbolicLink()) {
      fs.chmodSync(candidate, 0o644);
    }
  }
  makeWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}

test('installed Skill refresh consumes the Connect descriptor discovery service', () => {
  let discoveries = 0;
  const result = refreshInstalledAgentPackageWorkspaceSkills({
    packageId: 'future-agent',
    packageStatus: {
      installed_package_count: 1,
      launch_allowed: true,
    },
    descriptorDiscovery: {
      discover() {
        discoveries += 1;
        return new Map();
      },
    },
  });

  assert.equal(discoveries, 1);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.reason, 'package_not_installed');
  assert.equal(result.writes_performed, false);
});

test('installed Skill refresh rejects an implicit descriptor discovery path', () => {
  assert.throws(
    () => refreshInstalledAgentPackageWorkspaceSkills({
      packageId: 'future-agent',
      packageStatus: {
        installed_package_count: 1,
        launch_allowed: true,
      },
    }),
    (error: unknown) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'cordis_connect_descriptor_discovery_service_required',
  );
});

test('explicit developer source supplies Skill bytes instead of the older installed carrier', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-skill-source-'));
  const installedRoot = path.join(fixtureRoot, 'installed');
  const developerRoot = path.join(fixtureRoot, 'developer');
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_MODULE_PATH_OPLMETAAGENT: process.env.OPL_MODULE_PATH_OPLMETAAGENT,
    OPL_FULL_RUNTIME_HOME: process.env.OPL_FULL_RUNTIME_HOME,
  };
  process.env.OPL_STATE_DIR = path.join(fixtureRoot, 'state');
  process.env.OPL_MODULE_PATH_OPLMETAAGENT = developerRoot;
  delete process.env.OPL_FULL_RUNTIME_HOME;
  try {
    rootFixture(installedRoot, ['engineering-method']);
    rootFixture(developerRoot, ['engineering-method']);
    writeProfessionalSkill(installedRoot, 'engineering-method', '# Installed policy\n');
    writeProfessionalSkill(developerRoot, 'engineering-method', '# Selected developer policy\n');
    const request = {
      packageId: 'oma',
      packageStatus: { installed_package_count: 1, launch_allowed: true },
      descriptorDiscovery: { discover: () => new Map([['oma', {
        sourcePath: installedRoot,
        marketplaceSource: installedRoot,
        manifestPath: path.join(installedRoot, 'opl-package.json'),
        manifest: {
          package_role: 'standard_agent', required_skill_ids: ['opl-meta-agent'], capability_dependencies: [],
        },
      }]]) as any },
    };
    const projected = refreshInstalledAgentPackageWorkspaceSkills(request);
    assert.ok(projected.projection);
    const projectedFile = path.join(projected.projection.skills_root, 'engineering-method/SKILL.md');
    assert.equal(fs.readFileSync(projectedFile, 'utf8'), '# Selected developer policy\n');
    writeProfessionalSkill(developerRoot, 'engineering-method', '# Newer developer policy\n');
    const refreshed = refreshInstalledAgentPackageWorkspaceSkills(request);
    assert.notEqual(refreshed.generation_id, projected.generation_id);
    assert.equal(fs.readFileSync(projectedFile, 'utf8'), '# Selected developer policy\n');

    fs.unlinkSync(path.join(developerRoot, 'contracts/capability_map.json'));
    const unavailable = refreshInstalledAgentPackageWorkspaceSkills(request);
    assert.equal(unavailable.status, 'attention_needed');
    assert.equal(unavailable.projection, null);

    process.env.OPL_MODULE_PATH_OPLMETAAGENT = path.join(fixtureRoot, 'missing');
    const missing = refreshInstalledAgentPackageWorkspaceSkills(request);
    assert.equal(missing.status, 'attention_needed');
    assert.equal(missing.projection, null);

    const blocked = refreshInstalledAgentPackageWorkspaceSkills({
      ...request, packageStatus: { installed_package_count: 1, launch_allowed: false },
    });
    assert.equal(blocked.status, 'attention_needed');
    assert.equal(blocked.writes_performed, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeFixture(fixtureRoot);
  }
});

test('standard Agents project required Skills while provider defaults stay explicit', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-skill-closure-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    const cases = [
      { packageId: 'mas', rootSkills: [], providerSkills: numberedSkills('mas-scholar', 34), expected: 35 },
      { packageId: 'mag', rootSkills: numberedSkills('mag-method', 2), providerSkills: [], expected: 2 },
      { packageId: 'rca', rootSkills: numberedSkills('rca-method', 8), providerSkills: [], expected: 8 },
      { packageId: 'oma', rootSkills: numberedSkills('oma-method', 4), providerSkills: [], expected: 4 },
      { packageId: 'obf', rootSkills: numberedSkills('obf-method', 5), providerSkills: [], expected: 5 },
    ] as const;

    for (const fixture of cases) {
      const agentRoot = path.join(fixtureRoot, fixture.packageId);
      rootFixture(agentRoot, [...fixture.rootSkills]);
      const providerRoot = path.join(fixtureRoot, `${fixture.packageId}-provider`);
      providerFixture(providerRoot, fixture.packageId === 'mas'
        ? ['mas-scholar-skills', ...fixture.providerSkills]
        : [...fixture.providerSkills]);
      const result = materializeAgentPackageWorkspaceSkillProjection({
        rootPackageId: fixture.packageId,
        rootSkillIds: [fixture.packageId],
        rootSourceRoot: agentRoot,
        rootSourceRef: `${fixture.packageId}:installed-descriptor`,
        providers: fixture.providerSkills.length > 0
          ? [{
              packageId: 'mas-scholar-skills',
              sourceRoot: providerRoot,
              sourceRef: 'mas-scholar-skills:installed-descriptor',
              defaultMaterializedSkillIds: ['mas-scholar-skills', ...fixture.providerSkills],
              defaultMaterializationPolicy: 'all_exported_skills',
              exports: [
                { skillId: 'mas-scholar-skills', installMode: 'core_required' },
                ...fixture.providerSkills.map((skillId) => ({
                  skillId,
                  installMode: 'core_required' as const,
                })),
              ],
            }]
          : [],
      });

      assert.ok(result.projection, fixture.packageId);
      assert.equal(result.skill_ids.length, fixture.expected, fixture.packageId);
      assert.deepEqual(result.root_skill_ids, [fixture.packageId], fixture.packageId);
      assert.equal(result.skill_ids.includes(fixture.packageId), false, fixture.packageId);
      assert.equal(result.skill_ids.includes('mas-scholar-skills'), fixture.packageId === 'mas', fixture.packageId);
    }
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('core-only capability projection keeps optional specialists on demand', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-core-only-skill-projection-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'mas');
  const providerRoot = path.join(fixtureRoot, 'scholar');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, ['mas-native']);
    providerFixture(providerRoot, ['medical-manuscript-writing', 'medical-single-cell-modeling']);
    const provider = {
      packageId: 'mas-scholar-skills',
      sourceRoot: providerRoot,
      sourceRef: 'mas-scholar-skills:installed-descriptor',
      defaultMaterializedSkillIds: ['medical-manuscript-writing'],
      defaultMaterializationPolicy: 'core_skills_only' as const,
      exports: [
        { skillId: 'medical-manuscript-writing', installMode: 'core_required' as const },
        { skillId: 'medical-single-cell-modeling', installMode: 'optional_named_specialty' as const },
      ],
    };

    const coreOnly = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mas:installed-descriptor',
      providers: [provider],
    });
    assert.deepEqual(coreOnly.skill_ids, ['mas-native', 'medical-manuscript-writing']);
    assert.deepEqual(coreOnly.projection?.specialty_skill_ids, []);

    const selected = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mas:installed-descriptor',
      providers: [provider],
      selectedSkillIds: ['medical-single-cell-modeling'],
    });
    assert.deepEqual(selected.skill_ids, [
      'mas-native',
      'medical-manuscript-writing',
      'medical-single-cell-modeling',
    ]);
    assert.deepEqual(selected.projection?.specialty_skill_ids, ['medical-single-cell-modeling']);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Skill refresh creates a new immutable generation while an existing Attempt stays pinned', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-generation-refresh-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'mag-method';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    rootFixture(agentRoot, [skillId]);
    const first = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mag:installed-descriptor',
    });
    assert.ok(first.projection);
    assert.equal(
      syncAgentPackageSkillProjectionToWorkspace(first.projection, workspaceRoot).status,
      'materialized',
    );

    const unchanged = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mag:installed-descriptor',
    });
    assert.equal(unchanged.status, 'unchanged');
    assert.equal(unchanged.generation_id, first.generation_id);
    assert.equal(
      syncAgentPackageSkillProjectionToWorkspace(unchanged.projection!, workspaceRoot).status,
      'unchanged',
    );

    const oldAttemptRuntime = hostAttemptSkillRuntime({
      workspace_locator: {
        native_package_closure: { skill_projection: first.projection },
      },
    });
    assert.ok(oldAttemptRuntime);
    assert.equal(oldAttemptRuntime.env.HOME, first.projection.projection_root);

    writeProfessionalSkill(agentRoot, skillId, '# mag-method\n\nUpdated professional method.\n');
    const refreshed = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mag:installed-descriptor',
    });
    assert.ok(refreshed.projection);
    assert.notEqual(refreshed.generation_id, first.generation_id);
    assert.equal(assertAgentPackageSkillProjection(first.projection), first.projection);
    assert.equal(oldAttemptRuntime.env.HOME, first.projection.projection_root);

    syncAgentPackageSkillProjectionToWorkspace(refreshed.projection, workspaceRoot);
    assert.match(
      fs.readFileSync(path.join(workspaceRoot, '.agents', 'skills', skillId, 'SKILL.md'), 'utf8'),
      /Updated professional method/,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('MAS and MAG share identical managed Skill bytes in one Workspace', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shared-skill-ownership-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const masRoot = path.join(fixtureRoot, 'mas');
  const magRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'medical-advanced-biomed-router';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    rootFixture(masRoot, [skillId]);
    rootFixture(magRoot, [skillId]);
    const masProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: masRoot,
      rootSourceRef: 'mas:installed-descriptor',
    }).projection!;
    const magProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: magRoot,
      rootSourceRef: 'mag:installed-descriptor',
    }).projection!;

    assert.equal(syncAgentPackageSkillProjectionToWorkspace(masProjection, workspaceRoot).status, 'materialized');
    const skillRoot = path.join(workspaceRoot, '.agents', 'skills', skillId);
    const firstInode = fs.statSync(skillRoot).ino;
    assert.equal(syncAgentPackageSkillProjectionToWorkspace(magProjection, workspaceRoot).status, 'materialized');

    assert.equal(fs.statSync(skillRoot).ino, firstInode);
    const owner = JSON.parse(fs.readFileSync(
      path.join(workspaceRoot, '.codex', 'opl-agent-package-skill-owners', `${skillId}.json`),
      'utf8',
    ));
    assert.equal(owner.surface_kind, 'opl_workspace_agent_package_skill_owner.v2');
    assert.deepEqual(owner.owners.map((entry: { package_id: string }) => entry.package_id), ['mag', 'mas']);
    assert.equal(
      syncAgentPackageSkillProjectionToWorkspace(masProjection, workspaceRoot).status,
      'unchanged',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('shared Workspace Skill ownership keeps bytes until the remaining Agent releases them', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shared-skill-release-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const masRoot = path.join(fixtureRoot, 'mas');
  const magRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const sharedSkillId = 'medical-advanced-biomed-router';
  const masOnlySkillId = 'medical-manuscript-writing';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    rootFixture(masRoot, [sharedSkillId, masOnlySkillId]);
    rootFixture(magRoot, [sharedSkillId]);
    const masProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: masRoot,
      rootSourceRef: 'mas:installed-descriptor',
    }).projection!;
    const magProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: magRoot,
      rootSourceRef: 'mag:installed-descriptor',
    }).projection!;
    syncAgentPackageSkillProjectionToWorkspace(masProjection, workspaceRoot);
    syncAgentPackageSkillProjectionToWorkspace(magProjection, workspaceRoot);

    writeCapabilityMap(masRoot, [masOnlySkillId]);
    const refreshedMasProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: masRoot,
      rootSourceRef: 'mas:installed-descriptor',
    }).projection!;
    syncAgentPackageSkillProjectionToWorkspace(refreshedMasProjection, workspaceRoot);

    assert.equal(
      fs.existsSync(path.join(workspaceRoot, '.agents', 'skills', sharedSkillId, 'SKILL.md')),
      true,
    );
    const owner = JSON.parse(fs.readFileSync(
      path.join(workspaceRoot, '.codex', 'opl-agent-package-skill-owners', `${sharedSkillId}.json`),
      'utf8',
    ));
    assert.deepEqual(owner.owners.map((entry: { package_id: string }) => entry.package_id), ['mag']);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection refuses a different digest still owned by another Agent', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shared-skill-digest-conflict-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const masRoot = path.join(fixtureRoot, 'mas');
  const magRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'medical-advanced-biomed-router';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    rootFixture(masRoot, [skillId]);
    rootFixture(magRoot, [skillId]);
    writeProfessionalSkill(magRoot, skillId, '# Different MAG router bytes\n');
    const masProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mas',
      rootSkillIds: ['mas'],
      rootSourceRoot: masRoot,
      rootSourceRef: 'mas:installed-descriptor',
    }).projection!;
    const magProjection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: magRoot,
      rootSourceRef: 'mag:installed-descriptor',
    }).projection!;
    syncAgentPackageSkillProjectionToWorkspace(masProjection, workspaceRoot);

    assert.throws(
      () => syncAgentPackageSkillProjectionToWorkspace(magProjection, workspaceRoot),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_workspace_skill_owner_conflict',
    );
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, '.agents', 'skills', skillId, 'SKILL.md'), 'utf8'),
      `# ${skillId}\n`,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection refuses to overwrite an unmanaged Skill directory', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-workspace-collision-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'oma');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'oma-method';
  const unmanagedRoot = path.join(workspaceRoot, '.agents', 'skills', skillId);
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(unmanagedRoot, { recursive: true });
    fs.writeFileSync(path.join(unmanagedRoot, 'SKILL.md'), '# User-owned method\n');
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'oma',
      rootSkillIds: ['oma'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'oma:installed-descriptor',
    }).projection!;

    assert.throws(
      () => syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_workspace_skill_unowned_collision',
    );
    assert.equal(
      fs.readFileSync(path.join(unmanagedRoot, 'SKILL.md'), 'utf8'),
      '# User-owned method\n',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection refuses to repair through a malformed owner marker', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-owner-marker-collision-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'oma');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'oma-method';
  const ownerRoot = path.join(workspaceRoot, '.codex', 'opl-agent-package-skill-owners');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(ownerRoot, { recursive: true });
    fs.writeFileSync(path.join(ownerRoot, `${skillId}.json`), `${JSON.stringify({
      surface_kind: 'opl_workspace_agent_package_skill_owner.v2',
      skill_id: skillId,
      skill_digest: `sha256:${'a'.repeat(64)}`,
      owners: [],
    })}\n`);
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'oma',
      rootSkillIds: ['oma'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'oma:installed-descriptor',
    }).projection!;

    assert.throws(
      () => syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_workspace_skill_unowned_collision',
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills', skillId)), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection refuses a .codex symlink before writing outside the Workspace', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-workspace-symlink-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'oma');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const outsideCodex = path.join(fixtureRoot, 'outside-codex');
  const skillId = 'oma-method';
  const sentinelPath = path.join(outsideCodex, 'sentinel.txt');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outsideCodex, { recursive: true });
    fs.writeFileSync(sentinelPath, 'must remain untouched\n');
    fs.symlinkSync(outsideCodex, path.join(workspaceRoot, '.codex'), 'dir');
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'oma',
      rootSkillIds: ['oma'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'oma:installed-descriptor',
    }).projection!;

    assert.throws(
      () => syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_workspace_skill_projection_path_invalid',
    );
    assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'must remain untouched\n');
    assert.equal(fs.existsSync(path.join(outsideCodex, 'skills')), false);
    assert.equal(fs.lstatSync(path.join(workspaceRoot, '.codex')).isSymbolicLink(), true);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection accepts an existing physical .codex directory', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-workspace-physical-codex-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'mag-method';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(path.join(workspaceRoot, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.codex', 'config.toml'), 'model = "gpt-5"\n');
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mag:installed-descriptor',
    }).projection!;

    assert.equal(
      syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot).status,
      'materialized',
    );
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, '.agents', 'skills', skillId, 'SKILL.md'), 'utf8'),
      `# ${skillId}\n`,
    );
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8'),
      'model = "gpt-5"\n',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection migrates an OPL-owned legacy Skill into .agents', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-workspace-legacy-migration-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'mag');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'mag-method';
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'mag',
      rootSkillIds: ['mag'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'mag:installed-descriptor',
    }).projection!;
    syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot);
    const currentSkillRoot = path.join(workspaceRoot, '.agents', 'skills', skillId);
    const legacySkillRoot = path.join(workspaceRoot, '.codex', 'skills', skillId);
    fs.mkdirSync(path.dirname(legacySkillRoot), { recursive: true });
    fs.renameSync(currentSkillRoot, legacySkillRoot);

    assert.equal(syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot).status, 'materialized');
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills', skillId, 'SKILL.md')), true);
    assert.equal(fs.existsSync(legacySkillRoot), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});

test('Workspace projection preserves an unmanaged legacy Skill directory', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-workspace-legacy-collision-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const agentRoot = path.join(fixtureRoot, 'oma');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const skillId = 'oma-method';
  const legacySkillRoot = path.join(workspaceRoot, '.codex', 'skills', skillId);
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;

  try {
    rootFixture(agentRoot, [skillId]);
    fs.mkdirSync(legacySkillRoot, { recursive: true });
    fs.writeFileSync(path.join(legacySkillRoot, 'USER.md'), 'preserve legacy user bytes\n');
    const projection = materializeAgentPackageWorkspaceSkillProjection({
      rootPackageId: 'oma',
      rootSkillIds: ['oma'],
      rootSourceRoot: agentRoot,
      rootSourceRef: 'oma:installed-descriptor',
    }).projection!;

    assert.throws(
      () => syncAgentPackageSkillProjectionToWorkspace(projection, workspaceRoot),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_workspace_skill_legacy_unowned_collision',
    );
    assert.equal(fs.readFileSync(path.join(legacySkillRoot, 'USER.md'), 'utf8'), 'preserve legacy user bytes\n');
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills', skillId)), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixture(fixtureRoot);
  }
});
