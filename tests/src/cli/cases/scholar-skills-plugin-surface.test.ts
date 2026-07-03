import { assert, fs, loadFrameworkContracts, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'mas-scholar-skills');
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
const skillRoot = path.join(pluginRoot, 'skills', 'mas-scholar-skills');
const skillPath = path.join(skillRoot, 'SKILL.md');
const displayGalleryDocPath = path.join(repoRoot, 'docs', 'active', 'opl-scholar-skills-display-gallery.md');

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

test('MAS Scholar Skills plugin manifest exposes a repo-tracked skill pack', () => {
  const manifest = readJson(manifestPath);

  assert.equal(manifest.name, 'mas-scholar-skills');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.author.name, 'One Person Lab');
  assert.equal(manifest.interface.displayName, 'MAS Scholar Skills');
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

test('MAS Scholar Skills SKILL frontmatter is discoverable by Codex', () => {
  const metadata = frontmatter(readSkill());

  assert.match(metadata, /^name:\s+mas-scholar-skills$/m);
  assert.match(metadata, /^description:\s+".*MAS Scholar Skills.*MAS owner.*"$/m);
});

test('MAS Scholar Skills SKILL covers contract modules, commands, and authority guardrails', () => {
  const skill = readSkill();
  const contract = loadFrameworkContracts(repoRoot).scholarSkillsCapabilityModules;

  assert.equal(contract.modules.length > 0, true);
  assert.equal(
    new Set(contract.modules.map((module) => module.module_id)).size,
    contract.modules.length,
  );
  assert.equal(contract.modules.length, 8);
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

test('MAS Scholar Skills exposes a Display gallery human review entry without claiming authority', () => {
  const skill = readSkill();
  const displayGallery = fs.readFileSync(displayGalleryDocPath, 'utf8');

  for (const token of [
    'MAS Scholar Skills Display Gallery',
    'med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery.pdf',
    'med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_quality_audit.md',
    'Gallery status、template count、renderer policy、style profile、palette ref 和 audit finding 都从 MAS-owned gallery status / manifest / quality audit 读取。',
    'OPL active doc 只冻结 ref 位置、owner boundary 和维护命令，不冻结高漂移 audit 数字。',
    'do not prove publication readiness',
  ]) {
    assertContains(displayGallery, token);
  }

  for (const token of [
    'gallery/medical-display/medical_display_gallery.pdf',
    'gallery/medical-display/display_pack_gallery_quality_audit.md',
    'display_pack_gallery_quality_audit.md',
    'human review and visual-audit preview refs only',
  ]) {
    assertContains(skill, token);
  }
});
