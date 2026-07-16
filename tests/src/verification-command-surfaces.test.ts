import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { SETTINGS_CONTROL_CENTER_ACTIONS } from '../../src/modules/console/app-state-settings-control-center.ts';
import './verification-command-surfaces-cases/surface-budget-policy.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string>; exports?: Record<string, string> };

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return parseJsonText(read(relativePath)) as T;
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
  const sourceHome = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || '/tmp', 'opl-source-home-'));
  const sourceCodexHome = path.join(sourceHome, '.codex');
  const sourceConfig = path.join(sourceCodexHome, 'config.toml');
  fs.mkdirSync(sourceCodexHome, { recursive: true });
  fs.writeFileSync(sourceConfig, 'model = "sentinel"\n');

  const result = spawnSync('bash', [
    'scripts/run-with-repo-temp-env.sh',
    process.execPath,
    '-e',
    [
      'const keys = [',
      '"OPL_REPO_TEMP_ENV_ACTIVE",',
      '"OPL_REPO_TEMP_ROOT",',
      '"HOME",',
      '"CODEX_HOME",',
      '"OPL_STATE_DIR",',
      '"TMPDIR",',
      '"PYTHONPYCACHEPREFIX",',
      '"PYTEST_ADDOPTS",',
      '"UV_PROJECT_ENVIRONMENT",',
      '"NPM_CONFIG_CACHE",',
      '"NODE_COMPILE_CACHE",',
      '"CARGO_TARGET_DIR",',
      '"XDG_CACHE_HOME",',
      '"XDG_CONFIG_HOME",',
      '"XDG_DATA_HOME",',
      '"XDG_STATE_HOME"',
      '];',
      'require("node:fs").writeFileSync(require("node:path").join(process.env.CODEX_HOME, "config.toml"), "isolated\\n");',
      'console.log(JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]]))));',
    ].join(' '),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: sourceHome,
      CODEX_HOME: sourceCodexHome,
      OPL_REPO_TEMP_ROOT: '',
      OPL_REPO_TEMP_ENV_ACTIVE: '',
      PYTHONPYCACHEPREFIX: path.join(repoRoot, 'stale-pycache'),
      UV_PROJECT_ENVIRONMENT: path.join(repoRoot, 'stale-uv-env'),
      NPM_CONFIG_CACHE: path.join(repoRoot, 'stale-npm-cache'),
      NODE_COMPILE_CACHE: path.join(repoRoot, 'stale-node-cache'),
      CARGO_TARGET_DIR: path.join(repoRoot, 'stale-cargo-target'),
      XDG_CACHE_HOME: path.join(repoRoot, 'stale-xdg-cache'),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const env = parseJsonText(result.stdout) as Record<string, string>;
  const tempRoot = env.OPL_REPO_TEMP_ROOT;

  assert.equal(env.OPL_REPO_TEMP_ENV_ACTIVE, '1');
  assert.equal(path.isAbsolute(tempRoot), true);
  assert.equal(tempRoot.startsWith(repoRoot), false);
  assert.equal(env.HOME, path.join(tempRoot, 'home'));
  assert.equal(env.CODEX_HOME, path.join(tempRoot, 'home', '.codex'));
  [
    env.OPL_STATE_DIR,
    env.TMPDIR,
    env.PYTHONPYCACHEPREFIX,
    env.UV_PROJECT_ENVIRONMENT,
    env.NPM_CONFIG_CACHE,
    env.NODE_COMPILE_CACHE,
    env.CARGO_TARGET_DIR,
    env.XDG_CACHE_HOME,
    env.XDG_CONFIG_HOME,
    env.XDG_DATA_HOME,
    env.XDG_STATE_HOME,
  ].forEach((value) => {
    assert.equal(value.startsWith(tempRoot), true);
  });
  assert.match(env.PYTEST_ADDOPTS, new RegExp(`cache_dir=${tempRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(fs.readFileSync(sourceConfig, 'utf8'), 'model = "sentinel"\n');
  assert.equal(fs.existsSync(tempRoot), false);
  fs.rmSync(sourceHome, { recursive: true, force: true });
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

test('policy contract sentinels keep audit, progress, and physical-delete authority closed', () => {
  const guardrailTier = readJson<Record<string, any>>(
    'contracts/opl-framework/guardrail-tier-policy.json',
  );

  assert.equal(guardrailTier.contract_kind, 'opl_guardrail_tier_policy.v1');
  assert.deepEqual(guardrailTier.tiers.map((tier: { tier_id: string }) => tier.tier_id), [
    'launch_hard',
    'runtime_enforced',
    'domain_or_human_gate',
    'audit_only',
  ]);
  assert.equal(
    guardrailTier.tiers.find((tier: { tier_id: string }) => tier.tier_id === 'audit_only')?.default_path_role,
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
  assert.equal(guardrailTier.folding_policy.warning_can_become_launch_blocker_without_tier_change, false);
  for (const [claim, allowed] of Object.entries(guardrailTier.authority_boundary)) {
    assert.equal(allowed, false, `guardrail policy must not claim ${claim}`);
  }

  const progressTruth = readJson<Record<string, any>>(
    'contracts/opl-framework/stage-artifact-progress-truth-policy.json',
  );
  assert.equal(progressTruth.contract_kind, 'opl_stage_artifact_progress_truth_policy.v1');
  for (const claim of [
    'opl_can_mutate_artifact_body',
    'opl_can_create_domain_owner_answer',
    'opl_can_authorize_quality_or_export',
    'provider_completion_counts_as_progress',
    'raw_receipt_count_counts_as_progress',
    'artifact_attempt_pointer_can_write_stage_current_pointer',
    'framework_can_accept_reject_or_override_codex_route',
  ]) {
    assert.equal(progressTruth.authority_boundary[claim], false, `progress truth must not claim ${claim}`);
  }
  assert.equal(progressTruth.authority_boundary.readable_file_counts_as_progress, true);
  assert.equal(progressTruth.authority_boundary.raw_evidence_envelope_counts_as_progress, true);
  assert.equal(
    progressTruth.authority_boundary.decisive_codex_attempt_route_context_is_semantic_owner,
    true,
  );
  assert.equal(
    progressTruth.authority_boundary.stage_transition_materialization_owner_is_opl_stage_run_controller,
    true,
  );

  const wrapperRetirement = readJson<Record<string, any>>(
    'contracts/opl-framework/wrapper-retirement-gate-policy.json',
  );
  assert.equal(wrapperRetirement.contract_kind, 'opl_wrapper_retirement_gate_policy.v1');
  for (const [owner, physicalDeleteAuthorized] of [
    ['OPL', wrapperRetirement.private_platform_residue_deletion_gate.physical_delete_authorized_by_opl],
    ['owner work order', wrapperRetirement.private_platform_residue_deletion_gate.owner_decision_work_order.work_order_can_authorize_domain_repo_physical_delete],
    ['owner route matrix', wrapperRetirement.first_batch_owner_route_tail_matrix.authority_boundary.matrix_can_authorize_physical_delete],
    ['generated readiness', wrapperRetirement.generated_default_caller_readiness_can_authorize_physical_delete],
    ['docs foldback', wrapperRetirement.docs_foldback_boundary.docs_foldback_can_authorize_physical_delete],
    ['delete read model', wrapperRetirement.delete_gate_read_model_boundary.delete_gate_read_model_can_authorize_physical_delete],
    ['lifecycle apply', wrapperRetirement.opl_apply_boundary.family_runtime_lifecycle_apply_can_delete_domain_repo_files],
  ] as const) {
    assert.equal(physicalDeleteAuthorized, false, `${owner} must not authorize physical delete`);
  }
});

test('Settings Control Center contract keeps App and Aion consumer-only', () => {
  const settingsControlCenter = readJson<Record<string, any>>(
    'contracts/opl-framework/settings-control-center-action-read-model-contract.json',
  );
  const configurationActionIds = settingsControlCenter.configuration_catalog.required_configuration_ids.map(
    (configurationId: string) =>
      settingsControlCenter.configuration_catalog.persistent_action_map[configurationId],
  );

  assert.deepEqual(
    settingsControlCenter.allowed_action_ids,
    [
      ...SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => action.action_id),
      ...configurationActionIds,
    ],
  );
  assert.deepEqual(
    settingsControlCenter.action_taxonomy,
    Object.fromEntries(SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => [action.action_id, action.taxonomy])),
  );

  const consumerOnly = settingsControlCenter.consumer_only_enforcement;
  assert.equal(
    consumerOnly.readback_surface,
    'app_state.settings_control_center.app_aion_consumer_only_readback',
  );
  assert.equal(
    consumerOnly.truth_owner_matrix.every((row: { local_truth_allowed: boolean }) => row.local_truth_allowed === false),
    true,
  );
  assert.deepEqual(consumerOnly.local_scheduler_policy.aion_local_scheduler_allowed_roles, [
    'refresh_trigger',
    'ui_maintenance',
    'poll_existing_read_model',
  ]);
  assert.equal(consumerOnly.required_user_visible_boundary_fields.includes('delegated_action_id'), true);
  assert.deepEqual(consumerOnly.validator_status_codes, ['pass', 'attention_required']);
  for (const [claim, allowed] of Object.entries(consumerOnly.authority_boundary)) {
    assert.equal(allowed, false, `App/Aion must not claim ${claim}`);
  }
});

test('machine-readable framework contracts do not pin human docs paths outside typed package payload fields', () => {
  const pinnedHumanDocPathPattern =
    /\b(?:README(?:\.zh-CN)?\.md|AGENTS\.md|docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?|contracts\/[A-Za-z0-9_./-]+\.md)\b/g;

  for (const relativePath of listJsonFiles('contracts/opl-framework')) {
    const payload = JSON.parse(read(relativePath)) as Record<string, any>;
    if (payload.profile_surface) {
      payload.profile_surface = '<typed-package-profile-payload>';
    }
    if (['opl_agent_package_payload_manifest', 'opl_package_payload_manifest.v1', 'opl_package_payload_manifest.v2'].includes(payload.surface_kind)
      && Array.isArray(payload.files)) {
      payload.files = payload.files.map((entry: Record<string, unknown>) => ({
        ...entry,
        path: '<typed-package-payload-path>',
        source_url: entry.source_url ? '<typed-package-payload-source>' : undefined,
      }));
    }
    if (payload.surface_kind === 'opl_package_payload_allowlist.v1' && Array.isArray(payload.paths)) {
      payload.paths = payload.paths.map(() => '<typed-package-payload-path>');
    }
    if (['opl_agent_package_manifest.v1', 'opl_capability_package_manifest.v2'].includes(payload.surface_kind)
      && Array.isArray(payload.content_lock?.paths)) {
      payload.content_lock.paths = payload.content_lock.paths.map(() => '<typed-package-content-lock-path>');
    }
    const content = JSON.stringify(payload);
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
  assert.match(verifyScript, /npm run reuse-first:scan:diff/);
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    4,
  );
  assert.match(verifyScript, /npm run test:smoke/);
  assert.match(verifyScript, /npm run test:fast/);
  assert.match(verifyScript, /npm run test:regression/);
  assert.match(verifyScript, /npm run test:integration/);
  assert.match(verifyScript, /PYTHONDONTWRITEBYTECODE=1/);
  assert.match(verifyScript, /PYTHONPYCACHEPREFIX="\$\{PYTHONPYCACHEPREFIX:-\$\{family_tmp_root\}\/pycache\}"/);
  assert.match(verifyScript, /PYTEST_ADDOPTS="\$\{PYTEST_ADDOPTS:-\} -p no:cacheprovider -o cache_dir=\$\{family_tmp_root\}\/pytest-cache"/);
  assert.match(verifyScript, /PYTHONPATH=python pytest python\/tests/);
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
  assert.match(verifyScript, /smoke\|fast\|regression\|integration\|structure\|structure:strict\|reuse-first\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|line-budget:strict\|typecheck/);
});
