import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { pathToFileURL } from 'node:url';
import { parseJsonText } from '../../../../src/kernel/json-file.ts';

function createExternalSkillsFixture(extraSkills: Array<{
  skillId: string;
  description: string;
  extraFrontmatter?: string;
}> = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-source-'));
  const skillsRoot = path.join(root, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'LICENSE'), 'MIT License\n', 'utf8');

  const writeSkill = (skillId: string, description: string, extraFrontmatter = '', extraBody = '') => {
    const skillRoot = path.join(skillsRoot, skillId);
    fs.mkdirSync(path.join(skillRoot, 'references'), { recursive: true });
    if (skillId === 'scanpy') {
      fs.mkdirSync(path.join(skillRoot, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(skillRoot, 'scripts', 'run.py'), 'print("scanpy")\n', 'utf8');
    }
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${skillId}\ndescription: ${description}\nrequired_environment_variables: [{\"name\":\"TEST_API_KEY\"}]\n${extraFrontmatter}---\n\n# ${skillId}\n${extraBody}\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(skillRoot, 'references', 'guide.md'), `# ${skillId} guide\n`, 'utf8');
  };

  writeSkill('scanpy', 'Standard single-cell RNA-seq analysis pipeline.', 'keywords: ["single-cell","omics","scanpy"]\nallowed-tools: ["python"]\n');
  writeSkill('scientific-writing', 'Scientific manuscript writing with IMRAD and verified citations.');
  for (const extra of extraSkills) {
    writeSkill(extra.skillId, extra.description, extra.extraFrontmatter ?? '');
  }
  return root;
}

type ExternalSkillTriggerPolicy = {
  policy_kind: string;
  registry_role: string;
  default_opl_domain_professional_pack_remains_primary: boolean;
  default_mas_pack_remains_primary: boolean;
  external_specialist_requires_explicit_selection: boolean;
  external_skill_requires_explicit_selection: boolean;
  applies_when: string;
  coarse_entry_policy: string;
  context_loading_policy: string;
  trigger_signals: string[];
};

function assertExternalSkillTriggerPolicy(policy: ExternalSkillTriggerPolicy) {
  assert.equal(policy.policy_kind, 'opl_connect_external_specialist_registry_trigger_policy');
  assert.equal(policy.registry_role, 'external_specialist_source_registry');
  assert.equal(policy.default_opl_domain_professional_pack_remains_primary, true);
  assert.equal(policy.default_mas_pack_remains_primary, true);
  assert.equal(policy.external_specialist_requires_explicit_selection, true);
  assert.equal(policy.external_skill_requires_explicit_selection, true);
  assert.equal(policy.applies_when, 'default_opl_or_domain_professional_pack_does_not_cover_specialist_task');
  assert.equal(policy.coarse_entry_policy, 'ask_connect_before_loading_external_skill_library');
  assert.equal(policy.context_loading_policy, 'do_not_bulk_load_external_skill_library');
  assert.deepEqual(policy.trigger_signals, [
    'explicit_tool_package_database_or_workflow_name',
    'default_professional_skill_route_back',
    'domain_stage_detects_capability_outside_default_professional_pack',
    'governed_external_resource_or_environment_requirement',
  ]);
}

test('connect external-skills help names generic specialist registry while keeping K-Dense compatibility', () => {
  const listHelp = runCli(['help', 'connect', 'external-skills', 'list']).help;
  const sourceOption = listHelp.registry.options.find((option: { name: string }) => option.name === 'source');
  assert.match(listHelp.summary, /external specialist sources/);
  assert.doesNotMatch(listHelp.summary, /external scientific/);
  assert.match(sourceOption.summary, /kdense-scientific-agent-skills for compatibility/);

  const syncHelp = runCli(['help', 'connect', 'external-skills', 'sync']).help;
  assert.match(syncHelp.summary, /external specialist skill/);
  assert.doesNotMatch(syncHelp.summary, /external scientific/);
});

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
          source_kind: string;
          source_role: string;
          source_profile: string;
          canonical_ontology_role: string;
          default_install: boolean;
          can_install_all_skills_by_default: boolean;
          default_opl_domain_professional_pack_remains_primary: boolean;
          default_mas_pack_remains_primary: boolean;
          external_specialist_requires_explicit_selection: boolean;
          external_skill_requires_explicit_selection: boolean;
          install_policy: string;
          trigger_policy: ExternalSkillTriggerPolicy;
          skill_count: number;
        }>;
        skills: Array<{
          skill_id: string;
          description: string;
          content_sha256: string;
          source_license: string;
          category: string;
          keywords: string[];
          risk_flags: string[];
          has_scripts: boolean;
        }>;
        trigger_policy: ExternalSkillTriggerPolicy;
        authority_boundary: {
          selective_sync_only: boolean;
          can_install_all_skills_by_default: boolean;
          default_opl_domain_professional_pack_remains_primary: boolean;
          default_mas_pack_remains_primary: boolean;
          external_specialist_requires_explicit_selection: boolean;
          external_skill_requires_explicit_selection: boolean;
          can_claim_runtime_readiness: boolean;
          can_claim_live_readiness: boolean;
          can_write_domain_truth: boolean;
        };
      };
    };

    assert.equal(output.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_library_index');
    assert.equal(output.opl_connect_external_skills.status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].source_id, 'kdense-scientific-agent-skills');
    assert.equal(output.opl_connect_external_skills.sources[0].status, 'available');
    assert.equal(output.opl_connect_external_skills.sources[0].source_kind, 'external_specialist_skill_source');
    assert.equal(output.opl_connect_external_skills.sources[0].source_role, 'registered_external_specialist_source');
    assert.equal(output.opl_connect_external_skills.sources[0].source_profile, 'kdense_scientific_agent_skills_compat_source');
    assert.equal(output.opl_connect_external_skills.sources[0].canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
    assert.equal(output.opl_connect_external_skills.sources[0].default_install, false);
    assert.equal(output.opl_connect_external_skills.sources[0].can_install_all_skills_by_default, false);
    assert.equal(output.opl_connect_external_skills.sources[0].default_opl_domain_professional_pack_remains_primary, true);
    assert.equal(output.opl_connect_external_skills.sources[0].default_mas_pack_remains_primary, true);
    assert.equal(output.opl_connect_external_skills.sources[0].external_specialist_requires_explicit_selection, true);
    assert.equal(output.opl_connect_external_skills.sources[0].external_skill_requires_explicit_selection, true);
    assert.equal(output.opl_connect_external_skills.sources[0].install_policy, 'selective_sync_only');
    assertExternalSkillTriggerPolicy(output.opl_connect_external_skills.sources[0].trigger_policy);
    assertExternalSkillTriggerPolicy(output.opl_connect_external_skills.trigger_policy);
    assert.equal(output.opl_connect_external_skills.sources[0].skill_count, 2);
    assert.deepEqual(
      output.opl_connect_external_skills.skills.map((entry) => entry.skill_id),
      ['scanpy', 'scientific-writing'],
    );
    assert.match(output.opl_connect_external_skills.skills[0].content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(output.opl_connect_external_skills.skills[0].source_license, 'MIT');
    assert.equal(output.opl_connect_external_skills.skills[0].category, 'omics');
    assert.equal(output.opl_connect_external_skills.skills[0].keywords.includes('single-cell'), true);
    assert.equal(output.opl_connect_external_skills.skills[0].risk_flags.includes('executable_script_present'), true);
    assert.equal(output.opl_connect_external_skills.skills[0].risk_flags.includes('specialist_runtime_environment_review'), true);
    assert.equal(output.opl_connect_external_skills.skills[0].has_scripts, true);
    assert.deepEqual(output.opl_connect_external_skills.authority_boundary, {
      read_only: true,
      selective_sync_only: true,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_publication_readiness: false,
      can_claim_runtime_readiness: false,
      can_claim_live_readiness: false,
      can_install_all_skills_by_default: false,
      default_opl_domain_professional_pack_remains_primary: true,
      default_mas_pack_remains_primary: true,
      external_specialist_requires_explicit_selection: true,
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
        source_role: string;
        source_profile: string;
        canonical_ontology_role: string;
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
    assert.equal(added.opl_connect_external_skills.source_role, 'registered_external_specialist_source');
    assert.equal(added.opl_connect_external_skills.source_profile, 'kdense_scientific_agent_skills_compat_source');
    assert.equal(added.opl_connect_external_skills.canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
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

test('connect external-skills auto-materializes a registered source before list and search', () => {
  const sourceRoot = createExternalSkillsFixture();
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-auto-registry-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-auto-state-'));
  try {
    const registration = runCli([
      'connect',
      'external-skills',
      'sources',
      'add',
      '--source',
      'kdense',
      '--repo',
      pathToFileURL(sourceRoot).href,
      '--pin',
      'fixture-pin',
      '--registry-root',
      registryRoot,
    ], { OPL_STATE_DIR: stateRoot }) as {
      opl_connect_external_skills: {
        clone_policy: string;
        next_action: string;
      };
    };
    assert.equal(registration.opl_connect_external_skills.clone_policy, 'opl_connect_auto_materialized_cache');
    assert.match(registration.opl_connect_external_skills.next_action, /materialize the registered source/);

    const listed = runCli([
      'connect',
      'external-skills',
      'list',
      '--registry-root',
      registryRoot,
    ], { OPL_STATE_DIR: stateRoot }) as {
      opl_connect_external_skills: {
        status: string;
        sources: Array<{ source_root: string; skill_count: number }>;
        skills: Array<{ skill_id: string }>;
      };
    };

    assert.equal(listed.opl_connect_external_skills.status, 'available');
    assert.notEqual(listed.opl_connect_external_skills.sources[0].source_root, sourceRoot);
    assert.equal(listed.opl_connect_external_skills.sources[0].skill_count, 2);
    assert.deepEqual(
      listed.opl_connect_external_skills.skills.map((entry) => entry.skill_id),
      ['scanpy', 'scientific-writing'],
    );

    const output = runCli([
      'connect',
      'external-skills',
      'search',
      '--query',
      'single cell',
      '--registry-root',
      registryRoot,
    ], { OPL_STATE_DIR: stateRoot }) as {
      opl_connect_external_skills: {
        status: string;
        source_root: string;
        result_skill_ids: string[];
      };
    };

    assert.equal(output.opl_connect_external_skills.status, 'completed');
    assert.notEqual(output.opl_connect_external_skills.source_root, sourceRoot);
    assert.deepEqual(output.opl_connect_external_skills.result_skill_ids, ['scanpy']);
    assert.equal(
      fs.existsSync(path.join(output.opl_connect_external_skills.source_root, 'skills', 'scanpy', 'SKILL.md')),
      true,
    );
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(registryRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
        source_role: string;
        canonical_ontology_role: string;
        result_skill_ids: string[];
        results: Array<{ skill_id: string; match_score: number }>;
        trigger_policy: ExternalSkillTriggerPolicy;
      };
    };

    assert.equal(search.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_search');
    assert.equal(search.opl_connect_external_skills.status, 'completed');
    assert.equal(search.opl_connect_external_skills.source_role, 'registered_external_specialist_source');
    assert.equal(search.opl_connect_external_skills.canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
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
        source_role: string;
        canonical_ontology_role: string;
        skill: {
          skill_id: string;
          content_sha256: string;
          has_references: boolean;
          source_license: string;
          category: string;
          keywords: string[];
          risk_flags: string[];
          required_environment_variables: string[];
        };
        sync_command_ref: string;
        trigger_policy: ExternalSkillTriggerPolicy;
      };
    };

    assert.equal(inspect.opl_connect_external_skills.surface_kind, 'opl_connect_external_skill_inspect');
    assert.equal(inspect.opl_connect_external_skills.source_role, 'registered_external_specialist_source');
    assert.equal(inspect.opl_connect_external_skills.canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
    assert.equal(inspect.opl_connect_external_skills.skill.skill_id, 'scanpy');
    assert.match(inspect.opl_connect_external_skills.skill.content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(inspect.opl_connect_external_skills.skill.has_references, true);
    assert.equal(inspect.opl_connect_external_skills.skill.source_license, 'MIT');
    assert.equal(inspect.opl_connect_external_skills.skill.category, 'omics');
    assert.equal(inspect.opl_connect_external_skills.skill.keywords.includes('scanpy'), true);
    assert.equal(inspect.opl_connect_external_skills.skill.risk_flags.includes('external_credentials_or_api_key_declared'), true);
    assert.deepEqual(inspect.opl_connect_external_skills.skill.required_environment_variables, ['TEST_API_KEY']);
    assert.match(inspect.opl_connect_external_skills.sync_command_ref, /connect external-skills sync/);
    assertExternalSkillTriggerPolicy(inspect.opl_connect_external_skills.trigger_policy);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills classifies specialist families for on-demand domain routing', () => {
  const sourceRoot = createExternalSkillsFixture([
    {
      skillId: 'pydicom',
      description: 'DICOM medical imaging workflow for CT and MRI patient study metadata.',
    },
    {
      skillId: 'scikit-survival',
      description: 'Clinical survival model validation with censored time-to-event outcomes.',
    },
    {
      skillId: 'nextflow',
      description: 'Nextflow workflow pipeline for reproducible bioinformatics compute.',
    },
    {
      skillId: 'rdkit',
      description: 'Cheminformatics molecule and compound analysis.',
    },
    {
      skillId: 'pyzotero',
      description: 'Zotero citation library and literature metadata management.',
    },
    {
      skillId: 'crm-admin',
      description: 'Specialist CRM administration for account field hygiene.',
    },
  ]);
  try {
    const output = runCli([
      'connect',
      'external-skills',
      'list',
      '--source-root',
      sourceRoot,
    ]) as {
      opl_connect_external_skills: {
        skills: Array<{
          skill_id: string;
          category: string;
          risk_flags: string[];
        }>;
      };
    };
    const byId = new Map(output.opl_connect_external_skills.skills.map((entry) => [entry.skill_id, entry]));

    assert.equal(byId.get('pydicom')?.category, 'medical_imaging');
    assert.equal(byId.get('pydicom')?.risk_flags.includes('sensitive_or_clinical_data_policy_review'), true);
    assert.equal(byId.get('pydicom')?.risk_flags.includes('specialist_runtime_environment_review'), true);
    assert.equal(byId.get('scikit-survival')?.category, 'clinical_ai');
    assert.equal(byId.get('scikit-survival')?.risk_flags.includes('specialist_runtime_environment_review'), true);
    assert.equal(byId.get('nextflow')?.category, 'workflow_compute');
    assert.equal(byId.get('nextflow')?.risk_flags.includes('cloud_or_remote_compute_review'), true);
    assert.equal(byId.get('rdkit')?.category, 'chemistry');
    assert.equal(byId.get('rdkit')?.risk_flags.includes('specialist_runtime_environment_review'), true);
    assert.equal(byId.get('pyzotero')?.category, 'literature');
    assert.equal(byId.get('pyzotero')?.risk_flags.includes('external_database_or_api_review'), true);
    assert.equal(byId.get('crm-admin')?.category, 'general_external_specialist_skill');
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills accepts source slash skill selector for inspect and sync', () => {
  const sourceRoot = createExternalSkillsFixture();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-selector-workspace-'));
  try {
    const inspect = runCli([
      'connect',
      'external-skills',
      'inspect',
      '--source-root',
      sourceRoot,
      '--source',
      'kdense-scientific-agent-skills',
      '--skill',
      'kdense/scanpy',
    ]) as {
      opl_connect_external_skills: {
        source_id: string;
        skill: { skill_id: string };
      };
    };
    assert.equal(inspect.opl_connect_external_skills.source_id, 'kdense-scientific-agent-skills');
    assert.equal(inspect.opl_connect_external_skills.skill.skill_id, 'scanpy');

    const sync = runCli([
      'connect',
      'external-skills',
      'sync',
      '--source-root',
      sourceRoot,
      '--skill',
      'kdense/scanpy',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
    ]) as {
      opl_connect_external_skills: {
        source_id: string;
        skill: { skill_id: string; risk_flags: string[] };
        target_skill_root: string;
      };
    };
    assert.equal(sync.opl_connect_external_skills.source_id, 'kdense-scientific-agent-skills');
    assert.equal(sync.opl_connect_external_skills.skill.skill_id, 'scanpy');
    assert.equal(sync.opl_connect_external_skills.skill.risk_flags.includes('specialist_runtime_environment_review'), true);
    assert.equal(sync.opl_connect_external_skills.target_skill_root, path.join(workspaceRoot, '.codex', 'skills', 'scanpy'));
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
        source_role: string;
        canonical_ontology_role: string;
        source_repo_url: string;
        source_pinned_ref: string | null;
        skill: { skill_id: string; content_sha256: string };
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
    assert.equal(synced.source_role, 'registered_external_specialist_source');
    assert.equal(synced.canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
    assert.equal(synced.source_repo_url, 'https://github.com/K-Dense-AI/scientific-agent-skills');
    assert.equal(synced.source_pinned_ref, null);
    assert.equal(synced.skill.skill_id, 'scanpy');
    assert.match(synced.skill.content_sha256, /^[a-f0-9]{64}$/);
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
      skill_content_sha256: string;
      skill_keywords: string[];
      skill_category: string;
      skill_risk_flags: string[];
      source_license: string;
      sync_policy: string;
      compat_sync_policy_aliases: string[];
      source_role: string;
      canonical_ontology_role: string;
      trigger_policy: ExternalSkillTriggerPolicy;
      authority_boundary: { can_install_all_skills_by_default: boolean };
    };
    assert.equal(receipt.receipt_kind, 'opl_connect_external_skill_sync_receipt');
    assert.equal(receipt.source_role, 'registered_external_specialist_source');
    assert.equal(receipt.canonical_ontology_role, 'registered_source_not_opl_canonical_ontology');
    assert.equal(receipt.sync_policy, 'single_skill_selected_by_user_or_domain_route');
    assert.deepEqual(receipt.compat_sync_policy_aliases, ['single_skill_selected_by_user_or_mas_route']);
    assert.equal(receipt.skill_content_sha256, synced.skill.content_sha256);
    assert.equal(receipt.skill_keywords.includes('scanpy'), true);
    assert.equal(receipt.skill_category, 'omics');
    assert.equal(receipt.skill_risk_flags.includes('executable_script_present'), true);
    assert.equal(receipt.source_license, 'MIT');
    assertExternalSkillTriggerPolicy(receipt.trigger_policy);
    assert.equal(receipt.authority_boundary.can_install_all_skills_by_default, false);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('connect external-skills accepts skill-id alias for MAS helper compatibility', () => {
  const sourceRoot = createExternalSkillsFixture();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdense-skills-alias-workspace-'));
  try {
    const inspect = runCli([
      'connect',
      'external-skills',
      'inspect',
      '--source-root',
      sourceRoot,
      '--skill-id',
      'scanpy',
    ]) as {
      opl_connect_external_skills: {
        skill: { skill_id: string };
      };
    };
    assert.equal(inspect.opl_connect_external_skills.skill.skill_id, 'scanpy');

    const sync = runCli([
      'connect',
      'external-skills',
      'sync',
      '--source-root',
      sourceRoot,
      '--skill-id',
      'scanpy',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
    ]) as {
      opl_connect_external_skills: {
        status: string;
        skill: { skill_id: string };
        target_skill_root: string;
      };
    };
    assert.equal(sync.opl_connect_external_skills.status, 'synced');
    assert.equal(sync.opl_connect_external_skills.skill.skill_id, 'scanpy');
    assert.equal(sync.opl_connect_external_skills.target_skill_root, path.join(workspaceRoot, '.codex', 'skills', 'scanpy'));
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
