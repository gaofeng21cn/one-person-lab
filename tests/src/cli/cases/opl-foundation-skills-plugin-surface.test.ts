import { assert, fs, parseJsonText, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'opl-foundation-skills');
const pluginManifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
const exposureManifestPath = path.join(pluginRoot, 'exposure.json');
const skillsRoot = path.join(pluginRoot, 'skills');

const expectedSkillCount = 25;
const expectedDeveloperCodexSkills = new Set([
  'opl-agent-package-lifecycle-reviewer',
  'opl-code-quality-remediation-reviewer',
  'opl-console-operator-copilot',
  'opl-incident-root-cause-triager',
  'opl-runtime-soak-and-recovery-auditor',
  'opl-runway-compute-operator',
]);
const expectedNoRegressionRedirects = new Map([
  ['opl-agent-package-trust-reviewer', 'opl-agent-package-lifecycle-reviewer'],
  ['opl-app-first-run-ux-reviewer', 'opl-console-operator-copilot'],
  ['opl-app-release-evidence-reviewer', 'opl-console-operator-copilot'],
  ['opl-app-settings-ia-reviewer', 'opl-console-operator-copilot'],
  ['opl-runtime-task-awareness-reviewer', 'opl-console-operator-copilot'],
  ['opl-user-workbench-action-reviewer', 'opl-console-operator-copilot'],
  ['opl-brand-l5-evidence-reviewer', 'opl-charter-authority-reviewer'],
  ['opl-conflict-blocker-resolution-reviewer', 'opl-incident-root-cause-triager'],
  ['opl-stop-loss-and-nonprogress-reviewer', 'opl-incident-root-cause-triager'],
  ['opl-domain-private-tail-retirement-reviewer', 'opl-source-module-boundary-reviewer'],
  ['opl-shell-upstream-intake-reviewer', 'opl-source-module-boundary-reviewer'],
  ['opl-external-runtime-provider-fit-reviewer', 'opl-runtime-soak-and-recovery-auditor'],
  ['opl-runtime-environment-bundle-reviewer', 'opl-runtime-soak-and-recovery-auditor'],
  ['opl-native-helper-diagnostics-reviewer', 'opl-runtime-soak-and-recovery-auditor'],
  ['opl-runway-recovery-playbook-writer', 'opl-runtime-soak-and-recovery-auditor'],
  ['opl-external-scientific-skill-router', 'opl-external-specialist-skill-router'],
  ['opl-foundry-promotion-reviewer', 'opl-foundry-agent-improver'],
  ['opl-local-data-lifecycle-reviewer', 'opl-memory-artifact-lifecycle-curator'],
  ['opl-pack-capability-reviewer', 'opl-pack-admission-reviewer'],
  ['opl-stage-admission-reviewer', 'opl-stage-quality-gate-critic'],
  ['opl-workspace-source-readiness-auditor', 'opl-workspace-handoff-writer'],
]);
const legalExposureScopes = new Set([
  'source_only',
  'project_local',
  'workspace_local',
  'quest_local',
  'domain_profile',
  'developer_codex',
  'global_user',
]);
const noAuthorityFlags = [
  'no_owner_receipt',
  'no_typed_blocker',
  'no_human_gate',
  'no_artifact_authority',
  'no_quality_verdict',
  'no_readiness_claim',
];

function readJson(pathname: string) {
  return parseJsonText(fs.readFileSync(pathname, 'utf8')) as any;
}

function skillIdsFromDisk() {
  return fs.readdirSync(skillsRoot)
    .filter((entry) => fs.existsSync(path.join(skillsRoot, entry, 'SKILL.md')))
    .sort();
}

function readSkill(skillId: string) {
  return fs.readFileSync(path.join(skillsRoot, skillId, 'SKILL.md'), 'utf8');
}

function frontmatter(contents: string) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must contain YAML frontmatter');
  return match[1];
}

function frontmatterName(contents: string) {
  const match = frontmatter(contents).match(/^name:\s+["']?([^"'\n]+)["']?\s*$/m);
  assert.ok(match, 'SKILL.md frontmatter must contain name');
  return match[1];
}

test('OPL Foundation Skills plugin manifest remains a source-only support skill pack', () => {
  const pluginManifest = readJson(pluginManifestPath);
  const exposureManifest = readJson(exposureManifestPath);

  assert.equal(pluginManifest.name, 'opl-foundation-skills');
  assert.equal(pluginManifest.version, '0.1.0');
  assert.equal(pluginManifest.description.includes('Source-only'), true);
  assert.equal(pluginManifest.skills, './skills/');
  assert.equal(pluginManifest.author.name, 'One Person Lab');
  assert.equal(pluginManifest.interface.displayName, 'OPL Foundation Skills');
  assert.equal(pluginManifest.interface.category, 'Productivity');
  assert.equal(pluginManifest.interface.capabilities.includes('Skill'), true);
  assert.equal(pluginManifest.interface.defaultPrompt.length <= 3, true);
  assert.equal(
    pluginManifest.interface.defaultPrompt.every((prompt: string) => prompt.length <= 128),
    true,
  );

  assert.equal(exposureManifest.plugin.name, pluginManifest.name);
  assert.equal(exposureManifest.plugin.exposure_scope, 'source_only');
  assert.equal(exposureManifest.plugin.default_global_user, false);
});

test('OPL Foundation Skills exposure manifest exactly covers materialized skills', () => {
  const diskSkillIds = skillIdsFromDisk();
  const exposureManifest = readJson(exposureManifestPath);
  const manifestSkillIds = exposureManifest.skills.map((entry: any) => entry.skill_id).sort();

  assert.equal(diskSkillIds.length, expectedSkillCount);
  assert.deepEqual(manifestSkillIds, diskSkillIds);
});

test('OPL Foundation Skills exposure entries match frontmatter and exposure policy', () => {
  const exposureManifest = readJson(exposureManifestPath);
  const diskSkillIds = new Set(skillIdsFromDisk());
  const seen = new Set<string>();

  for (const entry of exposureManifest.skills) {
    assert.equal(typeof entry.skill_id, 'string');
    assert.equal(diskSkillIds.has(entry.skill_id), true, `${entry.skill_id} must exist on disk`);
    assert.equal(seen.has(entry.skill_id), false, `${entry.skill_id} must be listed once`);
    seen.add(entry.skill_id);

    assert.equal(frontmatterName(readSkill(entry.skill_id)), entry.skill_id);
    assert.equal(entry.default_global_user, false, `${entry.skill_id} must not default global`);
    assert.equal(entry.exposure_scope === 'global_user', false, `${entry.skill_id} must not be global_user`);
    assert.equal(
      legalExposureScopes.has(entry.exposure_scope),
      true,
      `${entry.skill_id} has invalid exposure_scope ${entry.exposure_scope}`,
    );
    assert.equal(typeof entry.activation_gate, 'string');
    assert.equal(entry.activation_gate.length > 0, true, `${entry.skill_id} needs an activation gate`);
    assert.equal(
      entry.kernel,
      fs.existsSync(path.join(skillsRoot, entry.skill_id, 'kernel.py')),
      `${entry.skill_id} kernel flag must match kernel.py existence`,
    );

    assert.equal(Array.isArray(entry.authority_boundary), true);
    for (const flag of noAuthorityFlags) {
      assert.equal(
        entry.authority_boundary.includes(flag),
        true,
        `${entry.skill_id} must declare ${flag}`,
      );
    }
  }

  assert.equal(seen.size, diskSkillIds.size);
});

test('OPL Foundation Skills keep developer Codex exposure intentionally narrow', () => {
  const exposureManifest = readJson(exposureManifestPath);
  const entries = new Map<string, any>(exposureManifest.skills.map((entry: any) => [entry.skill_id, entry]));
  const developerCodexSkills = exposureManifest.skills
    .filter((entry: any) => entry.exposure_scope === 'developer_codex')
    .map((entry: any) => entry.skill_id)
    .sort();

  assert.deepEqual(developerCodexSkills, [...expectedDeveloperCodexSkills].sort());
  assert.equal(entries.has('opl-domain-progress-transition-reviewer'), false);
  assert.equal(entries.has('opl-app-first-run-ux-reviewer'), false);
  assert.equal(entries.has('opl-app-release-evidence-reviewer'), false);
  assert.equal(entries.has('opl-app-settings-ia-reviewer'), false);
  assert.equal(entries.has('opl-runtime-task-awareness-reviewer'), false);
  assert.equal(entries.has('opl-user-workbench-action-reviewer'), false);
});

test('OPL Foundation Skills preserve retired fine-grained coverage without restoring metadata', () => {
  const exposureManifest = readJson(exposureManifestPath);
  const diskSkillIds = new Set(skillIdsFromDisk());
  const activeSkillIds = new Set(exposureManifest.skills.map((entry: any) => entry.skill_id));
  const redirects = exposureManifest.no_regression_redirects ?? [];

  assert.equal(redirects.length, expectedNoRegressionRedirects.size);

  const seen = new Set<string>();
  for (const entry of redirects) {
    assert.equal(typeof entry.retired_skill_id, 'string');
    assert.equal(typeof entry.covered_by_skill_id, 'string');
    assert.equal(expectedNoRegressionRedirects.get(entry.retired_skill_id), entry.covered_by_skill_id);
    assert.equal(seen.has(entry.retired_skill_id), false, `${entry.retired_skill_id} must be listed once`);
    seen.add(entry.retired_skill_id);

    assert.equal(diskSkillIds.has(entry.retired_skill_id), false, `${entry.retired_skill_id} must stay retired on disk`);
    assert.equal(activeSkillIds.has(entry.retired_skill_id), false, `${entry.retired_skill_id} must not re-enter exposure`);
    assert.equal(diskSkillIds.has(entry.covered_by_skill_id), true, `${entry.covered_by_skill_id} must exist on disk`);
    assert.equal(activeSkillIds.has(entry.covered_by_skill_id), true, `${entry.covered_by_skill_id} must be an exposed canonical skill`);
    assert.equal(entry.default_global_user, false, `${entry.retired_skill_id} redirect must not default global`);
    assert.equal(entry.exposure_scope === 'global_user', false, `${entry.retired_skill_id} redirect must not be global`);
    assert.equal(legalExposureScopes.has(entry.exposure_scope), true);
    assert.equal(entry.capability_preserved, true, `${entry.retired_skill_id} must declare capability preservation`);
    assert.equal(typeof entry.coverage_kind, 'string');
    assert.equal(entry.coverage_kind.length > 0, true, `${entry.retired_skill_id} needs coverage_kind`);
    assert.equal(typeof entry.reason, 'string');
    assert.equal(entry.reason.length > 0, true, `${entry.retired_skill_id} needs reason`);
  }

  assert.deepEqual([...seen].sort(), [...expectedNoRegressionRedirects.keys()].sort());
});

test('OPL Foundation Skills expose one canonical external specialist router', () => {
  const exposureManifest = readJson(exposureManifestPath);
  const entries = new Map<string, any>(exposureManifest.skills.map((entry: any) => [entry.skill_id, entry]));
  const genericRouter = entries.get('opl-external-specialist-skill-router') as any;

  assert.ok(genericRouter);
  assert.equal(entries.has('opl-external-scientific-skill-router'), false);
  assert.equal(genericRouter.exposure_scope, 'workspace_local');
  assert.match(genericRouter.activation_gate, /rare scientific external tool/);
  assert.match(genericRouter.activation_gate, /search\/inspect/);
  assert.match(genericRouter.activation_gate, /sync one selected skill only/);
  const routerSkill = readSkill('opl-external-specialist-skill-router');
  assert.equal(routerSkill.includes('no separate scientific alias Skill'), true);
  assert.equal(routerSkill.includes('support_map'), true);
  assert.equal(routerSkill.includes('--scope quest'), true);
});
