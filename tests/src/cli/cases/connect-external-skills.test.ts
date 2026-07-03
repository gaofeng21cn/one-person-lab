import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

function createExternalSkillsFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-source-'));
  const skillsRoot = path.join(root, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });

  const writeSkill = (skillId: string, description: string, extra = '') => {
    const skillRoot = path.join(skillsRoot, skillId);
    fs.mkdirSync(path.join(skillRoot, 'references'), { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${skillId}\ndescription: ${description}\nrequired_environment_variables: [{\"name\":\"TEST_API_KEY\"}]\n---\n\n# ${skillId}\n${extra}\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(skillRoot, 'references', 'guide.md'), `# ${skillId} guide\n`, 'utf8');
  };

  writeSkill('scanpy', 'Standard single-cell RNA-seq analysis pipeline.');
  writeSkill('scientific-writing', 'Scientific manuscript writing with IMRAD and verified citations.');
  return root;
}

test('connect external-skills list exposes approved source and skill cards', () => {
  const sourceRoot = createExternalSkillsFixture();
  try {
    const output = runCli([
      'connect',
      'external-skills',
      'list',
      '--source-root',
      sourceRoot,
    ]) as {
      opl_connect_external_skills: {
        surface_kind: string;
        status: string;
        sources: Array<{
          source_id: string;
          status: string;
          default_install: boolean;
          install_policy: string;
          skill_count: number;
        }>;
        skills: Array<{ skill_id: string; description: string }>;
        authority_boundary: {
          selective_sync_only: boolean;
          can_install_all_skills_by_default: boolean;
          can_write_domain_truth: boolean;
        };
      };
    };

    assert.equal(output.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_library_index');
    assert.equal(output.opl_connect_external_skills.status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].source_id, 'kdense-scientific-agent-skills');
    assert.equal(output.opl_connect_external_skills.sources[0].status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].default_install, false);
    assert.equal(output.opl_connect_external_skills.sources[0].install_policy, 'selective_sync_only');
    assert.equal(output.opl_connect_external_skills.sources[0].skill_count, 2);
    assert.deepEqual(
      output.opl_connect_external_skills.skills.map((entry) => entry.skill_id),
      ['scanpy', 'scientific-writing'],
    );
    assert.deepEqual(output.opl_connect_external_skills.authority_boundary, {
      read_only: true,
      selective_sync_only: true,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_publication_readiness: false,
      can_install_all_skills_by_default: false,
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills search and inspect return selected skill metadata', () => {
  const sourceRoot = createExternalSkillsFixture();
  try {
    const search = runCli([
      'connect',
      'external-skills',
      'search',
      '--source',
      'kdense',
      '--source-root',
      sourceRoot,
      '--query',
      'single cell rna seq',
      '--limit',
      '1',
    ]) as {
      opl_connect_external_skills: {
        surface_kind: string;
        status: string;
        result_skill_ids: string[];
        results: Array<{ skill_id: string; match_score: number }>;
      };
    };

    assert.equal(search.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_search');
    assert.equal(search.opl_connect_external_skills.status, 'completed');
    assert.deepEqual(search.opl_connect_external_skills.result_skill_ids, ['scanpy']);
    assert.equal(search.opl_connect_external_skills.results[0].match_score > 0, true);

    const inspect = runCli([
      'connect',
      'external-skills',
      'inspect',
      '--source-root',
      sourceRoot,
      '--skill',
      'scanpy',
    ]) as {
      opl_connect_external_skills: {
        surface_kind: string;
        skill: {
          skill_id: string;
          has_references: boolean;
          required_environment_variables: string[];
        };
        sync_command_ref: string;
      };
    };

    assert.equal(inspect.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_inspect');
    assert.equal(inspect.opl_connect_external_skills.skill.skill_id, 'scanpy');
    assert.equal(inspect.opl_connect_external_skills.skill.has_references, true);
    assert.deepEqual(inspect.opl_connect_external_skills.skill.required_environment_variables, ['TEST_API_KEY']);
    assert.match(inspect.opl_connect_external_skills.sync_command_ref, /connect external-skills sync/);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills sync copies only the selected skill into workspace Codex discovery', () => {
  const sourceRoot = createExternalSkillsFixture();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-workspace-'));
  try {
    const output = runCli([
      'connect',
      'external-skills',
      'sync',
      '--source-root',
      sourceRoot,
      '--skill',
      'scanpy',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
    ]) as {
      opl_connect_external_skills: {
        surface_kind: string;
        status: string;
        skill: { skill_id: string };
        target_scope: string;
        target_root: string;
        target_skill_root: string;
        install_receipt_path: string;
      };
    };

    const synced = output.opl_connect_external_skills;
    assert.equal(synced.surface_kind, 'opl_connect_external_skill_sync');
    assert.equal(synced.status, 'synced');
    assert.equal(synced.skill.skill_id, 'scanpy');
    assert.equal(synced.target_scope, 'workspace');
    assert.equal(synced.target_root, workspaceRoot);
    assert.equal(synced.target_skill_root, path.join(workspaceRoot, '.codex', 'skills', 'scanpy'));
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scanpy', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scanpy', 'references', 'guide.md')), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scientific-writing')), false);
    const receipt = JSON.parse(fs.readFileSync(synced.install_receipt_path, 'utf8')) as {
      receipt_kind: string;
      sync_policy: string;
      authority_boundary: { can_install_all_skills_by_default: boolean };
    };
    assert.equal(receipt.receipt_kind, 'opl_connect_external_skill_sync_receipt');
    assert.equal(receipt.sync_policy, 'single_skill_selected_by_user_or_mas_route');
    assert.equal(receipt.authority_boundary.can_install_all_skills_by_default, false);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills sync requires an explicit workspace or quest target', () => {
  const sourceRoot = createExternalSkillsFixture();
  try {
    const failure = runCliFailure([
      'connect',
      'external-skills',
      'sync',
      '--source-root',
      sourceRoot,
      '--skill',
      'scanpy',
      '--scope',
      'workspace',
    ]);
    assert.equal(failure.status, 4);
    assert.equal(failure.payload.error.code, 'codex_command_failed');
    assert.match(failure.payload.error.message, /requires a target root/);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});
