import { assert, fs, loadFrameworkContracts, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'opl-scholarskills');
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
const skillRoot = path.join(pluginRoot, 'skills', 'opl-scholarskills');
const skillPath = path.join(skillRoot, 'SKILL.md');

function readJson(pathname: string) {
  return JSON.parse(fs.readFileSync(pathname, 'utf8'));
}

function readSkill() {
  return fs.readFileSync(skillPath, 'utf8');
}

function frontmatter(contents: string) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must contain YAML frontmatter');
  return match[1];
}

function assertContains(contents: string, token: string) {
  assert.equal(contents.includes(token), true, `Expected SKILL.md to include ${token}`);
}

test('OPL ScholarSkills plugin manifest exposes a repo-tracked skill pack', () => {
  const manifest = readJson(manifestPath);

  assert.equal(manifest.name, 'opl-scholarskills');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.author.name, 'One Person Lab');
  assert.equal(manifest.interface.displayName, 'OPL ScholarSkills');
  assert.equal(manifest.interface.category, 'Productivity');
  assert.equal(manifest.interface.capabilities.includes('Skill'), true);
  assert.equal(manifest.interface.capabilities.includes('CLI'), true);
  assert.equal(manifest.interface.defaultPrompt.length <= 3, true);
  assert.equal(
    manifest.interface.defaultPrompt.every((prompt: string) => prompt.length <= 128),
    true,
  );
  assert.equal(fs.existsSync(skillPath), true);
});

test('OPL ScholarSkills SKILL frontmatter is discoverable by Codex', () => {
  const metadata = frontmatter(readSkill());

  assert.match(metadata, /^name:\s+opl-scholarskills$/m);
  assert.match(metadata, /^description:\s+".*OPL ScholarSkills.*MAS owner.*"$/m);
});

test('OPL ScholarSkills SKILL covers contract modules, commands, and authority guardrails', () => {
  const skill = readSkill();
  const contract = loadFrameworkContracts(repoRoot).scholarSkillsCapabilityModules;

  assert.equal(contract.modules.length, 10);
  for (const module of contract.modules) {
    assertContains(skill, module.module_id);
    assertContains(skill, module.display_name);
  }

  for (const token of [
    'opl scholar-skills list --json',
    'opl scholar-skills inspect --module',
    'opl scholar-skills prepare --module',
    'opl scholar-skills run-context --module',
    'opl scholar-skills invoke --module',
    'opl scholar-skills receipt --module',
    'opl scholar-skills materialize --module',
    'opl scholar-skills runtime-prepare --module',
    'opl scholar-skills runtime-run-context --module',
    'opl scholar-skills validate --json',
    'opl scholar-skills doctor --json',
  ]) {
    assertContains(skill, token);
  }

  for (const token of [
    'authority false',
    'MAS owner gate',
    'can_write_domain_truth: false',
    'can_sign_owner_receipt: false',
    'can_create_typed_blocker: false',
    'refs-only',
    'materialized_candidate_package',
  ]) {
    assertContains(skill, token);
  }
});
