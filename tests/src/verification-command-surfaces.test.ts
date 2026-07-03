import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import './verification-command-surfaces-cases/surface-budget-policy.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string>; exports?: Record<string, string> };

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

function listJsonFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
  });
}

test('repo hygiene blocks generated tmp artifacts from git', () => {
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^tmp\/$/m);
  assert.match(gitignore, /^build\/$/m);
  assert.match(gitignore, /^out\/$/m);
  assert.match(gitignore, /^\.venv\/$/m);
  assert.match(gitignore, /^\.pytest_cache\/$/m);
  assert.match(gitignore, /^\*\.egg-info\/$/m);
  assert.match(gitignore, /^coverage\/$/m);

  const result = spawnSync('git', ['ls-files', 'tmp'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');

  const hygieneScript = read('scripts/repo-hygiene.sh');
  assert.match(hygieneScript, /git ls-files --others --exclude-standard/);
  assert.match(hygieneScript, /Route the producer to OPL_REPO_TEMP_ROOT/);
  assert.match(hygieneScript, /scripts\/repo-hygiene\.sh \[--fix\]/);
  assert.match(hygieneScript, /\.opl-state/);
});

test('repo hygiene blocks checkout-local OPL runtime state drift', () => {
  const workRoot = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || '/tmp', 'opl-hygiene-'));

  try {
    const init = spawnSync('git', ['init'], {
      cwd: workRoot,
      encoding: 'utf8',
    });
    assert.equal(init.status, 0, init.stderr);
    fs.mkdirSync(path.join(workRoot, 'scripts'), { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'repo-hygiene.sh'),
      path.join(workRoot, 'scripts', 'repo-hygiene.sh'),
    );
    fs.mkdirSync(path.join(workRoot, '.opl-state', 'family-runtime'), { recursive: true });
    fs.writeFileSync(
      path.join(workRoot, '.opl-state', 'family-runtime', 'temporal-worker.json'),
      '{}\n',
    );

    const hygiene = spawnSync('bash', ['scripts/repo-hygiene.sh'], {
      cwd: workRoot,
      encoding: 'utf8',
    });

    assert.equal(hygiene.status, 1);
    assert.match(hygiene.stderr, /repo hygiene: generated paths are not ignored/);
    assert.match(hygiene.stderr, /\.opl-state\/family-runtime\/temporal-worker\.json/);
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
});

test('repo temp env wrapper routes tool caches outside the checkout', () => {
  const result = spawnSync('bash', [
    'scripts/run-with-repo-temp-env.sh',
    process.execPath,
    '-e',
    [
      'const keys = [',
      '"OPL_REPO_TEMP_ENV_ACTIVE",',
      '"OPL_REPO_TEMP_ROOT",',
      '"TMPDIR",',
      '"PYTHONPYCACHEPREFIX",',
      '"PYTEST_ADDOPTS",',
      '"UV_PROJECT_ENVIRONMENT",',
      '"NPM_CONFIG_CACHE",',
      '"NODE_COMPILE_CACHE",',
      '"CARGO_TARGET_DIR",',
      '"XDG_CACHE_HOME"',
      '];',
      'console.log(JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]]))));',
    ].join(' '),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPYCACHEPREFIX: path.join(repoRoot, 'stale-pycache'),
      UV_PROJECT_ENVIRONMENT: path.join(repoRoot, 'stale-uv-env'),
      NPM_CONFIG_CACHE: path.join(repoRoot, 'stale-npm-cache'),
      NODE_COMPILE_CACHE: path.join(repoRoot, 'stale-node-cache'),
      CARGO_TARGET_DIR: path.join(repoRoot, 'stale-cargo-target'),
      XDG_CACHE_HOME: path.join(repoRoot, 'stale-xdg-cache'),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const env = JSON.parse(result.stdout) as Record<string, string>;
  const tempRoot = env.OPL_REPO_TEMP_ROOT;

  assert.equal(env.OPL_REPO_TEMP_ENV_ACTIVE, '1');
  assert.equal(path.isAbsolute(tempRoot), true);
  assert.equal(tempRoot.startsWith(repoRoot), false);
  [
    env.TMPDIR,
    env.PYTHONPYCACHEPREFIX,
    env.UV_PROJECT_ENVIRONMENT,
    env.NPM_CONFIG_CACHE,
    env.NODE_COMPILE_CACHE,
    env.CARGO_TARGET_DIR,
    env.XDG_CACHE_HOME,
  ].forEach((value) => {
    assert.equal(value.startsWith(tempRoot), true);
  });
  assert.match(env.PYTEST_ADDOPTS, new RegExp(`cache_dir=${tempRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('tracked files do not contain Google API key literals', () => {
  const googleApiKeyPattern = ['AI', 'za', '[0-9A-Za-z_-]{35}'].join('');
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-E', googleApiKeyPattern, '--', '.'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.notEqual(result.status, null, result.stderr);
  assert.equal(
    result.status,
    1,
    result.status === 0
      ? `tracked Google API key-like literal found in:\n${result.stdout}`
      : result.stderr,
  );
});

test('repo-tracked verification command surfaces reference valid npm scripts and local test files', () => {
  const files = [
    'contracts/opl-framework/runtime-manager-contract.json',
    'contracts/opl-framework/family-runtime-attempt-contract.json',
    'contracts/opl-framework/functional-agent-runtime-harness-contract.json',
    'contracts/opl-framework/functional-privatization-audit-envelope-contract.json',
    'contracts/opl-framework/family-runtime-online-substrate-contract.json',
    'contracts/opl-framework/fresh-install-test-matrix.json',
    'contracts/opl-framework/surface-budget-policy.json',
  ];

  const npmRunPattern = /npm run ([a-z0-9:-]+)/gi;
  const localTestPattern = /(tests\/[^\s`'"]+\.(?:ts|mjs))/g;

  for (const relativePath of files) {
    const content = read(relativePath);

    for (const match of content.matchAll(npmRunPattern)) {
      const scriptName = match[1];
      assert.ok(
        packageJson.scripts?.[scriptName],
        `${relativePath} references missing npm script: ${scriptName}`,
      );
    }

    for (const match of content.matchAll(localTestPattern)) {
      const filePath = match[1];
      assert.ok(
        fs.existsSync(path.join(repoRoot, filePath)),
        `${relativePath} references missing test file: ${filePath}`,
      );
    }
  }
});

test('target architecture policy contracts keep progress, guardrail, and wrapper retirement gates machine-readable', () => {
  const progressTruth = readJson<{
    contract_kind: string;
    owner: string;
    state: string;
    progress_truth_required_signals: string[];
    single_signal_non_progress_reasons: string[];
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/stage-artifact-progress-truth-policy.json');
  assert.equal(progressTruth.contract_kind, 'opl_stage_artifact_progress_truth_policy.v1');
  assert.equal(progressTruth.owner, 'one-person-lab');
  assert.equal(progressTruth.state, 'active_contract');
  assert.deepEqual(progressTruth.progress_truth_required_signals, [
    'physical_output_present',
    'valid_manifest',
    'owner_answer_present',
    'artifact_attempt_pointer_selected',
  ]);
  assert.equal(progressTruth.single_signal_non_progress_reasons.includes('provider_completion_only'), true);
  assert.equal(progressTruth.single_signal_non_progress_reasons.includes('file_presence_without_owner_answer'), true);
  assert.equal(progressTruth.authority_boundary.provider_completion_counts_as_progress, false);
  assert.equal(progressTruth.authority_boundary.raw_receipt_count_counts_as_progress, false);
  assert.equal(progressTruth.authority_boundary.file_presence_alone_counts_as_progress, false);
  assert.equal(progressTruth.authority_boundary.artifact_attempt_pointer_can_write_stage_current_pointer, false);
  assert.equal(progressTruth.authority_boundary.stage_transition_authority_required_for_stage_run_current, true);

  const guardrailTier = readJson<{
    contract_kind: string;
    owner: string;
    state: string;
    tiers: Array<{ tier_id: string; default_path_role: string }>;
    default_denied_hard_gate_reason_classes: string[];
    folding_policy: {
      audit_signal_can_affect_default_path_only_after_folded_into: string[];
      raw_trace_can_create_default_action: boolean;
      warning_can_become_launch_blocker_without_tier_change: boolean;
    };
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/guardrail-tier-policy.json');
  assert.equal(guardrailTier.contract_kind, 'opl_guardrail_tier_policy.v1');
  assert.deepEqual(guardrailTier.tiers.map((tier) => tier.tier_id), [
    'launch_hard',
    'runtime_enforced',
    'domain_or_human_gate',
    'audit_only',
  ]);
  assert.equal(
    guardrailTier.tiers.find((tier) => tier.tier_id === 'audit_only')?.default_path_role,
    'cannot_block_ordinary_launch_without_folded_delta',
  );
  assert.equal(guardrailTier.default_denied_hard_gate_reason_classes.includes('raw_evidence_envelope'), true);
  assert.equal(
    guardrailTier.folding_policy.audit_signal_can_affect_default_path_only_after_folded_into.includes(
      'current_owner_delta',
    ),
    true,
  );
  assert.equal(guardrailTier.folding_policy.raw_trace_can_create_default_action, false);
  assert.equal(guardrailTier.authority_boundary.audit_only_guardrail_can_block_launch, false);

  const wrapperRetirement = readJson<{
    contract_kind: string;
    owner: string;
    state: string;
    required_before_physical_delete: string[];
    owner_delete_keep_or_blocker_decision_shapes: string[];
    same_work_unit_live_evidence_scope: {
      applies_to: string;
      blocks_static_no_active_caller_retirement: boolean;
      static_retirement_prerequisite_gate_ids: string[];
    };
    lane_separation: {
      default_ordinary_lane: {
        lane_id: string;
        includes_private_platform_cleanup_gate: boolean;
        can_authorize_private_platform_residue_cleanup: boolean;
      };
      private_platform_cleanup_lane: {
        lane_id: string;
        physical_delete_authorized: boolean;
        cleanup_lane_can_authorize_physical_delete: boolean;
      };
    };
    private_platform_residue_deletion_gate: {
      applies_to_agents: string[];
      classification_source_field: string;
      residue_target_kinds: string[];
      allowed_dispositions: string[];
      physical_delete_authorized_by_opl: boolean;
      required_owner_decision_shapes: string[];
    };
    first_batch_owner_route_tail_matrix: {
      row_policy: string;
      rows: Array<{
        repo_id: string;
        tail_classes: string[];
        app_aion_policy: string;
        forbidden_claims: string[];
      }>;
      authority_boundary: Record<string, boolean>;
    };
    forbidden_retirement_shortcuts: string[];
    generated_default_caller_readiness_can_authorize_physical_delete: boolean;
    physical_delete_blocked_by_default: string[];
    docs_foldback_boundary: Record<string, boolean>;
    delete_gate_read_model_boundary: Record<string, boolean>;
    opl_apply_boundary: Record<string, boolean>;
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/wrapper-retirement-gate-policy.json');
  assert.equal(wrapperRetirement.contract_kind, 'opl_wrapper_retirement_gate_policy.v1');
  assert.deepEqual(wrapperRetirement.required_before_physical_delete, [
    'replacement_parity_ref',
    'no_active_caller_ref',
    'no_forbidden_write_ref',
    'tombstone_or_provenance_ref',
  ]);
  assert.deepEqual(wrapperRetirement.owner_delete_keep_or_blocker_decision_shapes, [
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(
    wrapperRetirement.same_work_unit_live_evidence_scope.applies_to,
    'current_owner_answer_compensation_chain',
  );
  assert.equal(
    wrapperRetirement.same_work_unit_live_evidence_scope.blocks_static_no_active_caller_retirement,
    false,
  );
  assert.deepEqual(wrapperRetirement.same_work_unit_live_evidence_scope.static_retirement_prerequisite_gate_ids, [
    'replacement_parity',
    'no_active_caller_proof',
    'no_forbidden_write_proof',
    'tombstone_or_provenance_ref',
  ]);
  assert.equal(wrapperRetirement.lane_separation.default_ordinary_lane.lane_id, 'default_ordinary_lane');
  assert.equal(
    wrapperRetirement.lane_separation.default_ordinary_lane.includes_private_platform_cleanup_gate,
    false,
  );
  assert.equal(
    wrapperRetirement.lane_separation.default_ordinary_lane
      .can_authorize_private_platform_residue_cleanup,
    false,
  );
  assert.equal(
    wrapperRetirement.lane_separation.private_platform_cleanup_lane.lane_id,
    'private_platform_cleanup_lane',
  );
  assert.equal(
    wrapperRetirement.lane_separation.private_platform_cleanup_lane.physical_delete_authorized,
    false,
  );
  assert.equal(
    wrapperRetirement.lane_separation.private_platform_cleanup_lane
      .cleanup_lane_can_authorize_physical_delete,
    false,
  );
  assert.deepEqual(wrapperRetirement.private_platform_residue_deletion_gate.applies_to_agents, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
  ]);
  assert.equal(
    wrapperRetirement.private_platform_residue_deletion_gate.classification_source_field,
    'functional_privatization_audit.modules[].private_platform_residue_gate',
  );
  assert.deepEqual(wrapperRetirement.private_platform_residue_deletion_gate.residue_target_kinds, [
    'scheduler',
    'queue',
    'session_store',
    'workbench',
    'status_shell',
    'domain_wrapper',
    'runtime_watch',
    'agent_lab_materializer',
  ]);
  assert.deepEqual(wrapperRetirement.private_platform_residue_deletion_gate.allowed_dispositions, [
    'retain_authority_function',
    'absorb_opl_primitive',
    'no_active_caller_delete',
    'tombstone',
    'owner_typed_blocker',
  ]);
  assert.equal(
    wrapperRetirement.private_platform_residue_deletion_gate.physical_delete_authorized_by_opl,
    false,
  );
  assert.deepEqual(wrapperRetirement.private_platform_residue_deletion_gate.required_owner_decision_shapes, [
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
    'typed_blocker_ref',
  ]);
  const firstBatchRows = Object.fromEntries(
    wrapperRetirement.first_batch_owner_route_tail_matrix.rows.map((row) => [row.repo_id, row]),
  );
  assert.deepEqual(Object.keys(firstBatchRows), [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
    'mas-scholar-skills',
  ]);
  assert.deepEqual(firstBatchRows['mas-scholar-skills']?.tail_classes, [
    'update',
    'status_shell',
  ]);
  assert.equal(
    firstBatchRows['mas-scholar-skills']?.forbidden_claims.includes('typed_blocker_authority'),
    true,
  );
  assert.equal(
    firstBatchRows['med-autoscience']?.app_aion_policy.includes('must not expose MAS private runtime'),
    true,
  );
  assert.equal(
    wrapperRetirement.first_batch_owner_route_tail_matrix.authority_boundary
      .matrix_can_authorize_physical_delete,
    false,
  );
  assert.equal(
    wrapperRetirement.first_batch_owner_route_tail_matrix.authority_boundary.matrix_can_write_domain_truth,
    false,
  );
  assert.equal(wrapperRetirement.forbidden_retirement_shortcuts.includes('descriptor_ready_only'), true);
  assert.equal(
    wrapperRetirement.forbidden_retirement_shortcuts.includes('generated_default_caller_readiness_only'),
    true,
  );
  assert.equal(wrapperRetirement.forbidden_retirement_shortcuts.includes('test_pass_only'), true);
  assert.equal(wrapperRetirement.forbidden_retirement_shortcuts.includes('docs_foldback_only'), true);
  assert.equal(wrapperRetirement.forbidden_retirement_shortcuts.includes('delete_gate_read_model_only'), true);
  assert.equal(wrapperRetirement.generated_default_caller_readiness_can_authorize_physical_delete, false);
  assert.deepEqual(wrapperRetirement.physical_delete_blocked_by_default, [
    'generated_default_caller_readiness_is_not_delete_authority',
    'docs_foldback_is_not_delete_authority',
    'delete_gate_read_model_is_not_delete_authority',
    'physical_delete_requires_domain_owner_delete_keep_or_blocker_decision_after_structural_evidence',
  ]);
  assert.equal(wrapperRetirement.docs_foldback_boundary.docs_foldback_can_authorize_physical_delete, false);
  assert.equal(wrapperRetirement.docs_foldback_boundary.docs_foldback_can_claim_domain_ready, false);
  assert.equal(wrapperRetirement.delete_gate_read_model_boundary.delete_gate_read_model_can_authorize_physical_delete, false);
  assert.equal(
    wrapperRetirement.delete_gate_read_model_boundary.delete_gate_read_model_can_replace_domain_owner_receipt_or_typed_blocker,
    false,
  );
  assert.equal(wrapperRetirement.opl_apply_boundary.family_runtime_lifecycle_apply_can_record_refs, true);
  assert.equal(wrapperRetirement.opl_apply_boundary.family_runtime_lifecycle_apply_can_delete_domain_repo_files, false);
  assert.equal(wrapperRetirement.authority_boundary.opl_can_ignore_active_caller, false);
  assert.equal(wrapperRetirement.authority_boundary.opl_can_skip_tombstone_or_provenance, false);
});

test('Settings Control Center contract keeps App and Aion consumer-only', () => {
  const settingsControlCenter = readJson<{
    consumer_only_enforcement: {
      truth_owner_matrix: Array<{
        surface: string;
        local_truth_allowed: boolean;
        required_visible_refs: string[];
      }>;
      local_scheduler_policy: {
        aion_local_scheduler_allowed_roles: string[];
        forbidden_roles: string[];
      };
      required_user_visible_boundary_fields: string[];
      authority_boundary: Record<string, boolean>;
    };
  }>('contracts/opl-framework/settings-control-center-action-read-model-contract.json');

  const consumerOnly = settingsControlCenter.consumer_only_enforcement;
  assert.equal(
    consumerOnly.truth_owner_matrix.every((row) => row.local_truth_allowed === false),
    true,
  );
  assert.equal(
    consumerOnly.truth_owner_matrix.find((row) => row.surface === 'runtime_provider_and_stage_status')
      ?.required_visible_refs.includes('owner_route_ref'),
    true,
  );
  assert.deepEqual(consumerOnly.local_scheduler_policy.aion_local_scheduler_allowed_roles, [
    'refresh_trigger',
    'ui_maintenance',
    'poll_existing_read_model',
  ]);
  assert.equal(consumerOnly.local_scheduler_policy.forbidden_roles.includes('write_release_truth'), true);
  assert.equal(consumerOnly.required_user_visible_boundary_fields.includes('delegated_action_id'), true);
  assert.equal(consumerOnly.authority_boundary.app_aion_can_write_runtime_truth, false);
  assert.equal(consumerOnly.authority_boundary.app_aion_can_create_owner_receipt, false);
  assert.equal(consumerOnly.authority_boundary.app_aion_can_claim_app_release_ready, false);
});

test('stage artifact runtime contract freezes folder truth and CLI boundaries', () => {
  const contract = readJson<{
    contract_kind: string;
    state_root_layout: {
      attempt_root_pattern: string;
      required_attempt_entries: string[];
      current_pointer_role: string;
      stage_transition_authority_required_for_stage_run_current: boolean;
      derived_index_role: string;
    };
    read_model_semantics: {
      status_source_of_truth: string;
      stage_artifact_current_is_projection_only: boolean;
      stage_artifact_current_may_write_stage_current_pointer: boolean;
      stage_artifact_current_may_write_stage_run_terminal_state: boolean;
      stage_artifact_current_may_publish_current_owner_delta: boolean;
      status_must_not_depend_on_stale_index: boolean;
      success_requires: string[];
      blocked_requires: string[];
      orphan_artifact_is_completion: boolean;
      explain_must_report_missing_or_blocking_deltas: boolean;
    };
    cli_surfaces: {
      top_level: string;
      legacy_alias: string;
      family_runtime: string;
      open: string;
      commit: string;
      status: string;
      explain: string;
      rebuild: string;
      promote: string;
      gc: string;
      restore: string;
      conformance: string;
      workbench: string;
    };
    content_hash_semantics: {
      algorithm: string;
      manifest_hash_fields: string[];
      success_with_hash_mismatch_is_broken: boolean;
      conformance_requires_hash_entries_for_physical_files: boolean;
    };
    conformance_gate: {
      surface_kind: string;
      fails_on: string[];
      domain_readiness_claim: boolean;
    };
    workbench_projection: {
      surface_kind: string;
      projects: string[];
      artifact_body_access: boolean;
      domain_verdict_authority: boolean;
    };
    retention_restore_policy: {
      policy_id: string;
      gc_dry_run_default: boolean;
      gc_apply_archives_instead_of_physical_delete: boolean;
      restore_requires_restore_proof_ref: boolean;
      restore_does_not_create_owner_receipt: boolean;
      restore_does_not_declare_domain_truth_or_quality: boolean;
    };
    lineage_semantics: {
      event_log: string;
      derived_graph: string;
      event_kinds: string[];
      events_are_refs_only: boolean;
    };
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/stage-artifact-runtime-contract.json');

  assert.equal(contract.contract_kind, 'opl_stage_artifact_runtime_contract.v1');
  assert.equal(
    contract.state_root_layout.attempt_root_pattern,
    'runtime-state/domains/<domain>/deliverables/<program>/<topic>/<deliverable>/stages/<nn-stage>/attempts/<attempt_id>',
  );
  assert.deepEqual(contract.state_root_layout.required_attempt_entries, [
    'attempt.json',
    'manifest.json',
    'inputs/',
    'outputs/',
    'evidence/',
    'receipts/',
  ]);
  assert.equal(
    contract.state_root_layout.current_pointer_role,
    'refs_only_artifact_attempt_pointer_not_stage_run_current_pointer',
  );
  assert.equal(contract.state_root_layout.stage_transition_authority_required_for_stage_run_current, true);
  assert.equal(contract.state_root_layout.derived_index_role, 'rebuildable_projection_not_primary_truth');

  assert.equal(contract.read_model_semantics.status_source_of_truth, 'physical_stage_folder');
  assert.equal(contract.read_model_semantics.stage_artifact_current_is_projection_only, true);
  assert.equal(contract.read_model_semantics.stage_artifact_current_may_write_stage_current_pointer, false);
  assert.equal(contract.read_model_semantics.stage_artifact_current_may_write_stage_run_terminal_state, false);
  assert.equal(contract.read_model_semantics.stage_artifact_current_may_publish_current_owner_delta, false);
  assert.equal(contract.read_model_semantics.status_must_not_depend_on_stale_index, true);
  assert.deepEqual(contract.read_model_semantics.success_requires, [
    'valid_manifest',
    'required_outputs_present',
    'owner_receipt_ref_and_receipt_file',
  ]);
  assert.deepEqual(contract.read_model_semantics.blocked_requires, [
    'typed_blocker_ref',
    'blocker_evidence_file',
  ]);
  assert.equal(contract.read_model_semantics.orphan_artifact_is_completion, false);
  assert.equal(contract.read_model_semantics.explain_must_report_missing_or_blocking_deltas, true);

  assert.equal(contract.content_hash_semantics.algorithm, 'sha256');
  assert.deepEqual(contract.content_hash_semantics.manifest_hash_fields, [
    'output_hashes',
    'evidence_hashes',
    'receipt_hashes',
  ]);
  assert.equal(contract.content_hash_semantics.success_with_hash_mismatch_is_broken, true);
  assert.equal(contract.content_hash_semantics.conformance_requires_hash_entries_for_physical_files, true);

  assert.equal(contract.conformance_gate.surface_kind, 'opl_stage_artifact_runtime_conformance');
  assert.equal(contract.conformance_gate.domain_readiness_claim, false);
  for (const code of ['missing_manifest_hash_entry', 'manifest_content_hash_mismatch', 'attempt_orphan']) {
    assert.equal(contract.conformance_gate.fails_on.includes(code), true);
  }

  assert.equal(contract.workbench_projection.surface_kind, 'opl_stage_artifact_runtime_workbench');
  assert.equal(contract.workbench_projection.projects.includes('lineage_refs'), true);
  assert.equal(contract.workbench_projection.projects.includes('retention_policy'), true);
  assert.equal(contract.workbench_projection.artifact_body_access, false);
  assert.equal(contract.workbench_projection.domain_verdict_authority, false);

  assert.equal(contract.retention_restore_policy.policy_id, 'opl_stage_artifact_retention.v1');
  assert.equal(contract.retention_restore_policy.gc_dry_run_default, true);
  assert.equal(contract.retention_restore_policy.gc_apply_archives_instead_of_physical_delete, true);
  assert.equal(contract.retention_restore_policy.restore_requires_restore_proof_ref, true);
  assert.equal(contract.retention_restore_policy.restore_does_not_create_owner_receipt, true);
  assert.equal(contract.retention_restore_policy.restore_does_not_declare_domain_truth_or_quality, true);

  assert.equal(contract.lineage_semantics.event_log, 'lineage/events.jsonl');
  assert.equal(contract.lineage_semantics.derived_graph, 'lineage/graph.json');
  assert.equal(contract.lineage_semantics.event_kinds.includes('conformance_checked'), true);
  assert.equal(contract.lineage_semantics.events_are_refs_only, true);

  for (const command of ['open', 'commit', 'status', 'explain', 'rebuild', 'promote', 'gc', 'restore', 'validate', 'conformance', 'workbench']) {
    assert.match(contract.cli_surfaces.top_level, new RegExp(`opl stage .*${command}`));
    assert.match(contract.cli_surfaces.legacy_alias, new RegExp(`opl stage-artifact .*${command}`));
    assert.match(contract.cli_surfaces.family_runtime, new RegExp(`opl family-runtime stage-artifact .*${command}`));
  }
  assert.match(contract.cli_surfaces.open, /attempt workspace/);
  assert.match(contract.cli_surfaces.commit, /latest\/current pointers/);
  assert.match(contract.cli_surfaces.status, /physical folders/);
  assert.match(contract.cli_surfaces.explain, /missing receipt/);
  assert.match(contract.cli_surfaces.rebuild, /derived index/);
  assert.match(contract.cli_surfaces.promote, /manifest-declared refs/);
  assert.match(contract.cli_surfaces.gc, /dry-run by default/);
  assert.match(contract.cli_surfaces.restore, /restore proof ref/);
  assert.match(contract.cli_surfaces.conformance, /strict Stage Folder/);
  assert.match(contract.cli_surfaces.workbench, /App\/operator/);

  assert.equal(contract.authority_boundary.opl_can_index_refs, true);
  assert.equal(contract.authority_boundary.opl_can_rebuild_projection, true);
  assert.equal(contract.authority_boundary.opl_can_promote_canonical_pointer, true);
  for (const claim of [
    'opl_can_create_domain_owner_receipt',
    'opl_can_create_rca_owner_receipt',
    'opl_can_write_domain_truth',
    'opl_can_write_rca_visual_truth',
    'opl_can_write_rca_review_export_verdict',
    'opl_can_mutate_artifact_body',
    'opl_can_mutate_rca_artifact_body',
    'opl_can_declare_visual_or_quality_verdict',
  ]) {
    assert.equal(contract.authority_boundary[claim], false, `${claim} must remain outside OPL authority`);
  }
});

test('machine-readable framework contracts do not pin human docs paths', () => {
  const pinnedHumanDocPathPattern =
    /\b(?:README(?:\.zh-CN)?\.md|AGENTS\.md|docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?|contracts\/[A-Za-z0-9_./-]+\.md)\b/g;

  for (const relativePath of listJsonFiles('contracts/opl-framework')) {
    const content = read(relativePath);
    const pinnedPaths = content.match(pinnedHumanDocPathPattern) ?? [];

    assert.deepEqual(
      pinnedPaths,
      [],
      `${relativePath} must use machine contract refs or human_doc:* semantic ids instead of pinning prose document paths`,
    );
  }
});

test('scripts/verify.sh provides the canonical verification wrapper', () => {
  const verifyScript = read('scripts/verify.sh');

  assert.match(verifyScript, /run-with-repo-temp-env\.sh/);
  assert.match(verifyScript, /OPL_REPO_TEMP_ENV_ACTIVE/);
  assert.match(verifyScript, /node scripts\/line-budget\.mjs/);
  assert.match(verifyScript, /node scripts\/line-budget\.mjs --strict/);
  assert.match(verifyScript, /OPL_STRUCTURAL_QUALITY_STRICT=1/);
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    4,
  );
  assert.match(verifyScript, /npm run test:smoke/);
  assert.match(verifyScript, /npm run test:fast/);
  assert.match(verifyScript, /npm run test:regression/);
  assert.match(verifyScript, /npm run test:integration/);
  assert.match(verifyScript, /npm run family:shared-release -- check/);
  assert.match(verifyScript, /PYTHONDONTWRITEBYTECODE=1/);
  assert.match(verifyScript, /PYTHONPYCACHEPREFIX="\$\{PYTHONPYCACHEPREFIX:-\$\{family_tmp_root\}\/pycache\}"/);
  assert.match(verifyScript, /PYTEST_ADDOPTS="\$\{PYTEST_ADDOPTS:-\} -p no:cacheprovider -o cache_dir=\$\{family_tmp_root\}\/pytest-cache"/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_family_shared_release\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_dependency_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_launcher\.py/);
  assert.match(verifyScript, /npm run test:fresh-install/);
  assert.match(verifyScript, /npm run test:artifact/);
  assert.match(verifyScript, /npm run test:full/);
  assert.match(verifyScript, /npm run native:doctor/);
  assert.match(verifyScript, /npm run native:prebuild-check/);
  assert.match(verifyScript, /npm run native:pack-check/);
  assert.match(verifyScript, /npm run native:test/);
  assert.match(verifyScript, /npm run native:build/);
  assert.match(verifyScript, /npm run native:cache/);
  assert.match(verifyScript, /npm run native:family-smoke/);
  assert.match(verifyScript, /\.\/scripts\/run-structural-quality-gate\.sh/);
  assert.match(verifyScript, /smoke\|fast\|regression\|integration\|structure\|structure:strict\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|line-budget:strict\|typecheck/);
});
