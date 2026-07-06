import { assert, fs, parseJsonText, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'opl-foundation-skills');
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');

const expectedSkills = [
  {
    id: 'opl-runway-compute-operator',
    tokens: [
      'Runway / Connect as the programmatic authority',
      'provider ready',
      'runtime ready',
      'handoff/receipt briefing',
    ],
  },
  {
    id: 'opl-stagecraft-stage-designer',
    tokens: [
      'Stagecraft contract',
      'AI strategy',
      'handoff_lower_bound',
      'authority_boundary',
    ],
  },
  {
    id: 'opl-connect-source-and-skill-router',
    tokens: [
      'single_skill_sync',
      'refs_only_review',
      'no_authority_flags',
      'Do not full-install external skill libraries',
    ],
  },
  {
    id: 'opl-foundry-agent-improver',
    tokens: [
      'Foundry Lab as the owner',
      'skill_prompt_defect',
      'promotion, rollback, or hold recommendation',
      'no-authority caveat',
    ],
  },
] as const;

function readJson(pathname: string) {
  return parseJsonText(fs.readFileSync(pathname, 'utf8')) as any;
}

function readSkill(skillId: string) {
  return fs.readFileSync(path.join(pluginRoot, 'skills', skillId, 'SKILL.md'), 'utf8');
}

function frontmatter(contents: string) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must contain YAML frontmatter');
  return match[1];
}

function assertContains(contents: string, token: string) {
  assert.equal(contents.includes(token), true, `Expected contents to include ${token}`);
}

test('OPL Foundation Skills plugin manifest exposes a source-only support skill pack', () => {
  const manifest = readJson(manifestPath);

  assert.equal(manifest.name, 'opl-foundation-skills');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.author.name, 'One Person Lab');
  assert.equal(manifest.interface.displayName, 'OPL Foundation Skills');
  assert.equal(manifest.interface.category, 'Productivity');
  assert.equal(manifest.interface.capabilities.includes('Skill'), true);
  assert.equal(manifest.interface.defaultPrompt.length <= 3, true);
  assert.equal(
    manifest.interface.defaultPrompt.every((prompt: string) => prompt.length <= 128),
    true,
  );

  for (const skill of expectedSkills) {
    assert.equal(
      fs.existsSync(path.join(pluginRoot, 'skills', skill.id, 'SKILL.md')),
      true,
      `${skill.id} must be materialized as source-only SKILL.md`,
    );
  }
});

test('OPL Foundation Skills frontmatters are discoverable by Codex', () => {
  for (const skill of expectedSkills) {
    const metadata = frontmatter(readSkill(skill.id));
    assert.match(metadata, new RegExp(`^name:\\s+${skill.id}$`, 'm'));
    assert.match(metadata, /^description:\s+.*OPL .+/m);
    assert.match(metadata, /Use when|Use for|Design OPL/m);
  }
});

test('OPL Foundation Skills preserve no-authority boundaries while covering AI-first support work', () => {
  for (const skill of expectedSkills) {
    const contents = readSkill(skill.id);
    for (const token of skill.tokens) {
      assertContains(contents, token);
    }
    for (const token of [
      'owner receipts',
      'typed blockers',
      'readiness',
    ]) {
      assertContains(contents, token);
    }
  }
});
