import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { parseJsonText } from '../../../../src/kernel/json-file.ts';

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

type ExternalSkillTriggerPolicy = {
  policy_kind: string;
  default_mas_pack_remains_primary: boolean;
  external_skill_requires_explicit_selection: boolean;
  applies_when: string;
  coarse_entry_policy: string;
  context_loading_policy: string;
  trigger_signals: string[];
};

function assertExternalSkillTriggerPolicy(policy: ExternalSkillTriggerPolicy) {
  assert.equal(policy.policy_kind, 'opl_connect_external_skill_trigger_policy');
  assert.equal(policy.default_mas_pack_remains_primary, true);
  assert.equal(policy.external_skill_requires_explicit_selection, true);
  assert.equal(policy.applies_when, 'default_mas_medical_paper_pack_does_not_cover_specialist_task');
  assert.equal(policy.coarse_entry_policy, 'ask_connect_before_loading_external_skill_library');
  assert.equal(policy.context_loading_policy, 'do_not_bulk_load_external_skill_library');
  assert.deepEqual(policy.trigger_signals, [
    'explicit_tool_package_database_or_workflow_name',
    'default_professional_skill_route_back',
    'mas_stage_detects_capability_outside_default_eight_skills',
    'governed_external_resource_or_environment_requirement',
  ]);
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
          can_install_all_skills_by_default: boolean;
          default_mas_pack_remains_primary: boolean;
          external_skill_requires_explicit_selection: boolean;
          install_policy: string;
          trigger_policy: ExternalSkillTriggerPolicy;
          skill_count: number;
        }>;
        skills: Array<{ skill_id: string; description: string }>;
        trigger_policy: ExternalSkillTriggerPolicy;
        authority_boundary: {
          selective_sync_only: boolean;
          can_install_all_skills_by_default: boolean;
          default_mas_pack_remains_primary: boolean;
          external_skill_requires_explicit_selection: boolean;
          can_write_domain_truth: boolean;
        };
      };
    };

    assert.equal(output.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_library_index');
    assert.equal(output.opl_connect_external_skills.status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].source_id, 'kdense-scientific-agent-skills');
    assert.equal(output.opl_connect_external_skills.sources[0].status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].default_install, false);
    assert.equal(output.opl_connect_external_skills.sources[0].can_install_all_skills_by_default, false);
    assert.equal(output.opl_connect_external_skills.sources[0].default_mas_pack_remains_primary, true);
    assert.equal(output.opl_connect_external_skills.sources[0].external_skill_requires_explicit_selection, true);
    assert.equal(output.opl_connect_external_skills.sources[0].install_policy, 'selective_sync_only');
    assertExternalSkillTriggerPolicy(output.opl_connect_external_skills.sources[0].trigger_policy);
    assertExternalSkillTriggerPolicy(output.opl_connect_external_skills.trigger_policy);
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
      default_mas_pack_remains_primary: true,
      external_skill_requires_explicit_selection: true,
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills sources add registers a pinned source for later discovery', () => {
  const sourceRoot = createExternalSkillsFixture();
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-registry-'));
  try {
    const added = runCli([
      'connect',
      'external-skills',
      'sources',
      'add',
      '--source',
      'kdense',
      '--repo',
      'https://github.com/K-Dense-AI/scientific-agent-skills',
      '--pin',
      '1e024ea8547ada12039edbe8197aaa959d97763f',
      '--source-root',
      sourceRoot,
      '--registry-root',
      registryRoot,
    ]) as {
      opl_connect_external_skills: {
        surface_kind: string;
        status: string;
        registry_path: string;
        source: {
          source_id: string;
          repo_url: string;
          pinned_ref: string;
          source_root: string;
        };
        authority_boundary: { can_install_all_skills_by_default: boolean };
      };
    };

    assert.equal(added.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_source_registration');
    assert.equal(added.opl_connect_external_skills.status, 'registered');
    assert.equal(added.opl_connect_external_skills.source.source_id, 'kdense-scientific-agent-skills');
    assert.equal(added.opl_connect_external_skills.source.pinned_ref, '1e024ea8547ada12039edbe8197aaa959d97763f');
    assert.equal(added.opl_connect_external_skills.authority_boundary.can_install_all_skills_by_default, false);
    assert.equal(fs.existsSync(added.opl_connect_external_skills.registry_path), true);

    const listed = runCli([
      'connect',
      'external-skills',
      'list',
      '--registry-root',
      registryRoot,
    ]) as {
      opl_connect_external_skills: {
        status: string;
        sources: Array<{
          source_id: string;
          registered: boolean;
          pinned_ref: string;
          source_root: string;
        }>;
        skills: Array<{ skill_id: string }>;
      };
    };

    assert.equal(listed.opl_connect_external_skills.status, 'available');
    assert.equal(listed.opl_connect_external_skills.sources[0].registered, true);
    assert.equal(listed.opl_connect_external_skills.sources[0].pinned_ref, '1e024ea8547ada12039edbe8197aaa959d97763f');
    assert.equal(listed.opl_connect_external_skills.sources[0].source_root, sourceRoot);
    assert.deepEqual(
      listed.opl_connect_external_skills.skills.map((entry) => entry.skill_id),
      ['scanpy', 'scientific-writing'],
    );
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(registryRoot, { recursive: true, force: true });
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
        trigger_policy: ExternalSkillTriggerPolicy;
      };
    };

    assert.equal(search.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_search');
    assert.equal(search.opl_connect_external_skills.status, 'completed');
    assert.deepEqual(search.opl_connect_external_skills.result_skill_ids, ['scanpy']);
    assert.equal(search.opl_connect_external_skills.results[0].match_score > 0, true);
    assertExternalSkillTriggerPolicy(search.opl_connect_external_skills.trigger_policy);

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
        trigger_policy: ExternalSkillTriggerPolicy;
      };
    };

    assert.equal(inspect.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_inspect');
    assert.equal(inspect.opl_connect_external_skills.skill.skill_id, 'scanpy');
    assert.equal(inspect.opl_connect_external_skills.skill.has_references, true);
    assert.deepEqual(inspect.opl_connect_external_skills.skill.required_environment_variables, ['TEST_API_KEY']);
    assert.match(inspect.opl_connect_external_skills.sync_command_ref, /connect external-skills sync/);
    assertExternalSkillTriggerPolicy(inspect.opl_connect_external_skills.trigger_policy);
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
        source_repo_url: string;
        source_pinned_ref: string | null;
        skill: { skill_id: string };
        target_scope: string;
        target_root: string;
        target_skill_root: string;
        install_receipt_path: string;
        trigger_policy: ExternalSkillTriggerPolicy;
      };
    };

    const synced = output.opl_connect_external_skills;
    assert.equal(synced.surface_kind, 'opl_connect_external_skill_sync');
    assert.equal(synced.status, 'synced');
    assert.equal(synced.source_repo_url, 'https://github.com/K-Dense-AI/scientific-agent-skills');
    assert.equal(synced.source_pinned_ref, null);
    assert.equal(synced.skill.skill_id, 'scanpy');
    assert.equal(synced.target_scope, 'workspace');
    assert.equal(synced.target_root, workspaceRoot);
    assert.equal(synced.target_skill_root, path.join(workspaceRoot, '.codex', 'skills', 'scanpy'));
    assertExternalSkillTriggerPolicy(synced.trigger_policy);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scanpy', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scanpy', 'references', 'guide.md')), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'scientific-writing')), false);
    const receipt = parseJsonText(
      fs.readFileSync(synced.install_receipt_path, 'utf8'),
    ) as {
      receipt_kind: string;
      sync_policy: string;
      trigger_policy: ExternalSkillTriggerPolicy;
      authority_boundary: { can_install_all_skills_by_default: boolean };
    };
    assert.equal(receipt.receipt_kind, 'opl_connect_external_skill_sync_receipt');
    assert.equal(receipt.sync_policy, 'single_skill_selected_by_user_or_mas_route');
    assertExternalSkillTriggerPolicy(receipt.trigger_policy);
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
