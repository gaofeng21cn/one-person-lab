import { assert, fs, os, parseJsonText, path, runCli, runCliFailure, test } from '../helpers.ts';

test('connect foundation-skills inspect lists manifest-governed foundation support skills', () => {
  const output = runCli(['connect', 'foundation-skills', 'inspect', '--json']) as {
    opl_connect_foundation_skills: {
      surface_kind: string;
      status: string;
      manifest_status: string;
      manifest_ref: string | null;
      skill_count: number;
      skills: Array<{
        skill_id: string;
        content_sha256: string;
        exposure_scope: string;
        activation_gate: string;
        default_global_user: boolean;
        allowed_sync_scopes: string[];
      }>;
      authority_boundary: {
        read_only_inspect: boolean;
        single_skill_sync_only: boolean;
        global_user_scope_allowed: boolean;
        can_write_codex_global_config: boolean;
      };
    };
  };

  assert.equal(output.opl_connect_foundation_skills.surface_kind, 'opl_connect_foundation_skills_inspect');
  assert.equal(output.opl_connect_foundation_skills.status, 'completed');
  assert.equal(output.opl_connect_foundation_skills.manifest_status, 'exposure_manifest');
  assert.equal(output.opl_connect_foundation_skills.manifest_ref, 'plugins/opl-foundation-skills/exposure.json');
  assert.equal(output.opl_connect_foundation_skills.skill_count, 40);
  assert.equal(output.opl_connect_foundation_skills.skills.length, 40);
  const completionAudit = output.opl_connect_foundation_skills.skills.find((entry) => entry.skill_id === 'opl-completion-audit-writer');
  assert.ok(completionAudit);
  assert.equal(completionAudit.exposure_scope, 'project_local');
  assert.equal(completionAudit.default_global_user, false);
  assert.deepEqual(completionAudit.allowed_sync_scopes, ['project']);
  assert.equal(typeof completionAudit.activation_gate, 'string');
  assert.equal(completionAudit.activation_gate.length > 0, true);
  assert.match(output.opl_connect_foundation_skills.skills[0].content_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(output.opl_connect_foundation_skills.authority_boundary, {
    read_only_inspect: true,
    single_skill_sync_only: true,
    global_user_scope_allowed: false,
    codex_scope_allowed: false,
    can_write_codex_global_config: false,
    can_write_opl_marketplace: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  });
});

test('connect foundation-skills sync fails closed without explicit skill', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundation-skill-noskill-'));
  try {
    const failure = runCliFailure([
      'connect',
      'foundation-skills',
      'sync',
      '--scope',
      'project',
      '--target-root',
      targetRoot,
      '--json',
    ]);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /requires --skill/);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('connect foundation-skills sync copies only the selected skill into target root', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundation-skill-target-'));
  try {
    const output = runCli([
      'connect',
      'foundation-skills',
      'sync',
      '--skill',
      'opl-workspace-handoff-writer',
      '--scope',
      'workspace',
      '--target-root',
      targetRoot,
      '--json',
    ]) as {
      opl_connect_foundation_skills: {
        surface_kind: string;
        status: string;
        skill: { skill_id: string; content_sha256: string; exposure_scope: string; allowed_sync_scopes: string[] };
        target_scope: string;
        target_root: string;
        target_skill_root: string;
        readback_path: string;
        no_authority: boolean;
        authority_boundary: { single_skill_sync_only: boolean; can_write_codex_global_config: boolean };
      };
    };

    const synced = output.opl_connect_foundation_skills;
    assert.equal(synced.surface_kind, 'opl_connect_foundation_skill_sync');
    assert.equal(synced.status, 'synced');
    assert.equal(synced.skill.skill_id, 'opl-workspace-handoff-writer');
    assert.equal(synced.skill.exposure_scope, 'workspace_local');
    assert.deepEqual(synced.skill.allowed_sync_scopes, ['workspace', 'quest']);
    assert.match(synced.skill.content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(synced.target_scope, 'workspace');
    assert.equal(synced.target_root, targetRoot);
    assert.equal(synced.target_skill_root, path.join(targetRoot, '.codex', 'skills', 'opl-workspace-handoff-writer'));
    assert.equal(synced.no_authority, true);
    assert.equal(synced.authority_boundary.single_skill_sync_only, true);
    assert.equal(synced.authority_boundary.can_write_codex_global_config, false);
    assert.equal(fs.existsSync(path.join(synced.target_skill_root, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(targetRoot, '.codex', 'skills', 'opl-runway-compute-operator')), false);

    const receipt = parseJsonText(fs.readFileSync(synced.readback_path, 'utf8')) as {
      receipt_kind: string;
      sync_policy: string;
      skill_id: string;
      target_scope: string;
      exposure_scope: string;
      authority_boundary: { global_user_scope_allowed: boolean; can_write_opl_marketplace: boolean };
    };
    assert.equal(receipt.receipt_kind, 'opl_connect_foundation_skill_sync_readback');
    assert.equal(receipt.sync_policy, 'explicit_single_foundation_skill_only');
    assert.equal(receipt.skill_id, 'opl-workspace-handoff-writer');
    assert.equal(receipt.target_scope, 'workspace');
    assert.equal(receipt.exposure_scope, 'workspace_local');
    assert.equal(receipt.authority_boundary.global_user_scope_allowed, false);
    assert.equal(receipt.authority_boundary.can_write_opl_marketplace, false);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('connect foundation-skills sync rejects a target scope outside the manifest exposure scope', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundation-skill-wrong-scope-'));
  try {
    const failure = runCliFailure([
      'connect',
      'foundation-skills',
      'sync',
      '--skill',
      'opl-completion-audit-writer',
      '--scope',
      'workspace',
      '--target-root',
      targetRoot,
      '--json',
    ]);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /exposure scope/);
    assert.equal(failure.payload.error.details.exposure_scope, 'project_local');
    assert.deepEqual(failure.payload.error.details.allowed_sync_scopes, ['project']);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('connect foundation-skills sync rejects global and codex scopes', () => {
  for (const scope of ['global_user', 'codex']) {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-foundation-skill-${scope}-`));
    try {
      const failure = runCliFailure([
        'connect',
        'foundation-skills',
        'sync',
        '--skill',
        'opl-completion-audit-writer',
        '--scope',
        scope,
        '--target-root',
        targetRoot,
        '--json',
      ]);
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.match(failure.payload.error.message, /project\|workspace\|quest/);
    } finally {
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
  }
});

test('connect foundation-skills sync rejects unknown skills', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundation-skill-unknown-'));
  try {
    const failure = runCliFailure([
      'connect',
      'foundation-skills',
      'sync',
      '--skill',
      'missing-foundation-skill',
      '--scope',
      'quest',
      '--target-root',
      targetRoot,
      '--json',
    ]);
    assert.equal(failure.status, 4);
    assert.equal(failure.payload.error.code, 'codex_command_failed');
    assert.match(failure.payload.error.message, /not found/);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
