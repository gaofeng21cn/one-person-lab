import { assert, fs, parseJsonText, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'opl-foundation-skills');
const pluginManifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
const exposureManifestPath = path.join(pluginRoot, 'exposure.json');
const skillsRoot = path.join(pluginRoot, 'skills');

const expectedSkillCount = 43;
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

test('OPL Foundation Skills expose generic specialist router as the canonical external skill router', () => {
  const exposureManifest = readJson(exposureManifestPath);
  const entries = new Map(exposureManifest.skills.map((entry: any) => [entry.skill_id, entry]));
  const genericRouter = entries.get('opl-external-specialist-skill-router') as any;
  const scientificRouter = entries.get('opl-external-scientific-skill-router') as any;

  assert.ok(genericRouter);
  assert.ok(scientificRouter);
  assert.equal(genericRouter.exposure_scope, 'workspace_local');
  assert.deepEqual(genericRouter.authority_boundary, scientificRouter.authority_boundary);
  assert.match(scientificRouter.activation_gate, /compatibility scientific specialization/);
  assert.equal(readSkill('opl-external-scientific-skill-router').includes('opl-external-specialist-skill-router'), true);
});
