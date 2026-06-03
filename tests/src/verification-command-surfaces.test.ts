import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

test('public surface index binds every surface to the surface budget policy', () => {
  const policy = readJson<{
    default_surface_allowed_reasons: string[];
    promotion_gate: {
      new_default_surface_requires_any_ref_from: string[];
      default_surface_requires_any_reason_from: string[];
      repeated_app_runtime_consumption_requires: {
        minimum_distinct_consumers: number;
        allowed_consumers: string[];
      };
    };
    authority_boundary: Record<string, false>;
  }>('contracts/opl-framework/surface-budget-policy.json');
  const publicSurfaceIndex = readJson<{
    surfaces: Array<{
      surface_id: string;
      surface_budget: {
        default_surface: boolean;
        default_surface_allowed_reasons: string[];
        promotion_evidence_refs: Record<string, string>;
        consumer_refs: string[];
        authority_boundary: Record<string, boolean>;
      };
    }>;
  }>('contracts/opl-framework/public-surface-index.json');

  for (const surface of publicSurfaceIndex.surfaces) {
    const budget = surface.surface_budget;
    assert.equal(budget.default_surface, true, `${surface.surface_id} must explicitly declare its default-surface state`);
    assert.equal(
      budget.default_surface_allowed_reasons.some((reason) =>
        policy.default_surface_allowed_reasons.includes(reason)
      ),
      true,
      `${surface.surface_id} must cite an allowed surface-budget reason`,
    );
    assert.equal(
      policy.promotion_gate.new_default_surface_requires_any_ref_from.some((field) =>
        typeof budget.promotion_evidence_refs[field] === 'string'
      ),
      true,
      `${surface.surface_id} must cite a surface-budget promotion evidence ref`,
    );
    if (budget.default_surface_allowed_reasons.includes('repeated_app_runtime_consumption')) {
      const allowedConsumers = budget.consumer_refs.filter((consumer) =>
        policy.promotion_gate.repeated_app_runtime_consumption_requires.allowed_consumers.includes(consumer)
      );
      assert.ok(
        new Set(allowedConsumers).size >=
          policy.promotion_gate.repeated_app_runtime_consumption_requires.minimum_distinct_consumers,
        `${surface.surface_id} must cite enough repeated App/runtime consumers`,
      );
    }
    for (const claim of Object.keys(policy.authority_boundary)) {
      assert.equal(budget.authority_boundary[claim], false, `${surface.surface_id} must not authorize ${claim}`);
    }
  }
});

test('surface budget policy keeps diagnostic lenses out of default stage entrypoints', () => {
  const policy = readJson<{
    contract_kind: string;
    surface_model: {
      attention_entry: {
        default_operator_payload: string;
        default_read_contract: {
          normal_app_state_command: string;
          default_projection: string;
          full_detail_policy: string;
          raw_refs_policy: string;
          forbidden_fast_profile_fields: string[];
        };
      };
    };
    default_surface_allowed_reasons: string[];
    default_doc_entry_budget: {
      stage_default_commands: string[];
      stage_diagnostic_commands: string[];
      forbidden_default_stage_commands: string[];
    };
    promotion_gate: {
      new_surface_default_state: string;
      new_default_surface_requires_any_ref_from: string[];
      default_surface_requires_any_reason_from: string[];
      hard_gate_allowed_reasons: string[];
      hard_gate_requires_any_reason_from: string[];
      hard_gate_denied_reason_classes: string[];
      repeated_app_runtime_consumption_requires: {
        minimum_distinct_consumers: number;
        allowed_consumers: string[];
      };
    };
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/surface-budget-policy.json');

  assert.equal(policy.contract_kind, 'opl_surface_budget_policy.v1');
  assert.deepEqual(policy.default_surface_allowed_reasons, [
    'launch_safety',
    'authority_boundary',
    'evidence_replay_audit_route_back',
    'repeated_app_runtime_consumption',
  ]);
  assert.deepEqual(policy.default_doc_entry_budget.stage_default_commands, [
    'opl stages readiness --family-defaults',
  ]);
  assert.equal(policy.surface_model.attention_entry.default_operator_payload, 'compact_owner_delta_projection');
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.normal_app_state_command,
    'opl app state --profile fast --json',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.default_projection,
    'opl_compact_owner_delta_projection',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.full_detail_policy,
    'explicit_full_detail_or_lazy_diagnostic_only',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.raw_refs_policy,
    'raw_refs_require_explicit_full_detail',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.forbidden_fast_profile_fields.includes(
      'runtime_tray_snapshot',
    ),
    true,
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.forbidden_fast_profile_fields.includes(
      'raw_evidence_envelope',
    ),
    true,
  );
  assert.equal(
    policy.default_doc_entry_budget.stage_diagnostic_commands.includes('opl stages proof-bundle --domain <domain>'),
    true,
  );
  assert.equal(
    policy.default_doc_entry_budget.forbidden_default_stage_commands.includes('opl stages capacity-budget --domain <domain>'),
    true,
  );
  assert.equal(
    policy.default_doc_entry_budget.forbidden_default_stage_commands.includes('opl stages domain-validity --domain <domain>'),
    true,
  );
  for (const command of [
    'opl stages capacity-budget --domain <domain>',
    'opl stages domain-validity --domain <domain>',
    'opl stages guarantee --domain <domain>',
    'opl stages property --domain <domain>',
    'opl stages isolation --domain <domain>',
  ]) {
    assert.equal(
      policy.default_doc_entry_budget.forbidden_default_stage_commands.includes(command),
      true,
      `${command} must stay out of default stage entrypoints`,
    );
    assert.equal(
      policy.default_doc_entry_budget.stage_default_commands.includes(command),
      false,
      `${command} must not be a default stage command`,
    );
  }
  assert.equal(policy.promotion_gate.new_surface_default_state, 'diagnostic_lens_or_reference');
  assert.deepEqual(policy.promotion_gate.new_default_surface_requires_any_ref_from, [
    'replaced_or_folded_surface_ref',
    'retired_surface_ref',
    'folded_into_attention_entry_ref',
  ]);
  assert.deepEqual(
    policy.promotion_gate.default_surface_requires_any_reason_from,
    policy.default_surface_allowed_reasons,
  );
  assert.deepEqual(policy.promotion_gate.hard_gate_allowed_reasons, [
    'launch_safety',
    'authority_boundary',
    'runtime_boundary_event',
    'receipt_replay_audit_route_back',
  ]);
  assert.deepEqual(
    policy.promotion_gate.hard_gate_requires_any_reason_from,
    policy.promotion_gate.hard_gate_allowed_reasons,
  );
  for (const deniedReasonClass of [
    'advisory',
    'diagnostic',
    'graphflow_gfl_learning_point',
    'capacity_budget',
    'domain_validity',
    'guarantee',
    'property',
    'isolation',
  ]) {
    assert.equal(
      policy.promotion_gate.hard_gate_denied_reason_classes.includes(deniedReasonClass),
      true,
      `${deniedReasonClass} must not become a hard gate reason class by default`,
    );
    assert.equal(
      policy.promotion_gate.hard_gate_allowed_reasons.includes(deniedReasonClass),
      false,
      `${deniedReasonClass} must not be an allowed hard gate reason`,
    );
  }
  assert.equal(policy.promotion_gate.repeated_app_runtime_consumption_requires.minimum_distinct_consumers, 2);
  assert.equal(policy.promotion_gate.repeated_app_runtime_consumption_requires.allowed_consumers.includes('app'), true);

  for (const [claim, allowed] of Object.entries(policy.authority_boundary)) {
    assert.equal(allowed, false, `${claim} must remain false in OPL surface budget policy`);
  }
});

test('stage artifact runtime contract freezes folder truth and CLI boundaries', () => {
  const contract = readJson<{
    contract_kind: string;
    state_root_layout: {
      attempt_root_pattern: string;
      required_attempt_entries: string[];
      current_pointer_role: string;
      derived_index_role: string;
    };
    read_model_semantics: {
      status_source_of_truth: string;
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
  assert.equal(contract.state_root_layout.current_pointer_role, 'refs_only_current_or_canonical_artifact_pointer');
  assert.equal(contract.state_root_layout.derived_index_role, 'rebuildable_projection_not_primary_truth');

  assert.equal(contract.read_model_semantics.status_source_of_truth, 'physical_stage_folder');
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

  for (const command of ['open', 'commit', 'status', 'explain', 'rebuild', 'promote', 'gc']) {
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

  assert.equal(contract.authority_boundary.opl_can_index_refs, true);
  assert.equal(contract.authority_boundary.opl_can_rebuild_projection, true);
  assert.equal(contract.authority_boundary.opl_can_promote_canonical_pointer, true);
  for (const claim of [
    'opl_can_create_domain_owner_receipt',
    'opl_can_write_domain_truth',
    'opl_can_mutate_artifact_body',
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
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    1,
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
  assert.match(verifyScript, /smoke\|fast\|regression\|integration\|structure\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|typecheck/);
});

test('OPL harness pytest cache defaults outside the checkout', () => {
  const pyproject = read('python/opl-harness-shared/pyproject.toml');

  assert.match(pyproject, /\[tool\.pytest\.ini_options\]/);
  assert.match(pyproject, /cache_dir = "\/tmp\/opl-harness-shared-pytest-cache"/);
});

test('node test lanes propagate Python cache isolation to spawned tests', () => {
  const testLanes = read('scripts/test-lanes.mjs');

  assert.match(testLanes, /OPL_REPO_TEMP_ROOT/);
  assert.match(testLanes, /NODE_COMPILE_CACHE/);
  assert.match(testLanes, /NPM_CONFIG_CACHE/);
  assert.match(testLanes, /UV_PROJECT_ENVIRONMENT/);
  assert.match(testLanes, /CARGO_TARGET_DIR/);
  assert.match(testLanes, /opl-node-test-python-cache-/);
  assert.match(testLanes, /PYTHONDONTWRITEBYTECODE/);
  assert.match(testLanes, /PYTHONPYCACHEPREFIX/);
  assert.match(testLanes, /-p no:cacheprovider/);
  assert.match(testLanes, /cache_dir=\$\{path\.join\(pythonCacheRoot, 'pytest-cache'\)\}/);
});

test('native helper prebuild script handles platform executable names', () => {
  const prebuildScript = read('scripts/native-helper-prebuild.mjs');
  const cacheScript = read('scripts/native-helper-cache.mjs');
  const smokeScript = read('scripts/native-helper-family-smoke.mjs');
  const runtime = read('src/native-helper-runtime.ts');

  assert.match(prebuildScript, /targetTriple\.startsWith\('win32-'\)/);
  assert.match(prebuildScript, /--force-local/);
  assert.match(prebuildScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(cacheScript, /process\.platform === 'win32'/);
  assert.match(cacheScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(smokeScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(runtime, /nativeHelperExecutableName/);
});

test('package.json exposes the canonical family shared release maintenance command', () => {
  assert.equal(packageJson.scripts?.['family:shared-release'], 'node ./scripts/family-shared-release.mjs');
  assert.equal(packageJson.exports?.['./family-shared-release'], './dist/family-shared-release.js');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/family-shared-release.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-shared-release.ts')),
    true,
  );
});

test('package.json exports the unified domain-agent descriptor read model', () => {
  assert.equal(
    packageJson.exports?.['./family-domain-agent-descriptor'],
    './dist/family-domain-agent-descriptor.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-domain-agent-descriptor.ts')),
    true,
  );
});

test('package.json exports the OPL functional agent runtime harness', () => {
  assert.equal(
    packageJson.exports?.['./functional-agent-runtime-harness'],
    './dist/functional-agent-runtime-harness.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/functional-agent-runtime-harness.ts')),
    true,
  );
});

test('package.json exposes native helper gate scripts and package dry-run check', () => {
  assert.equal(packageJson.scripts?.['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
  assert.equal(packageJson.scripts?.['native:prebuild-pack'], 'node ./scripts/native-helper-prebuild.mjs pack');
  assert.equal(packageJson.scripts?.['native:prebuild-archive'], 'node ./scripts/native-helper-prebuild.mjs archive');
  assert.equal(packageJson.scripts?.['native:prebuild-check'], 'node ./scripts/native-helper-prebuild.mjs check');
  assert.equal(packageJson.scripts?.['native:pack-check'], 'node ./scripts/native-helper-pack-check.mjs');
  assert.equal(
    packageJson.scripts?.['native:test'],
    'RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --workspace',
  );
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-prebuild.mjs')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-pack-check.mjs')), true);
});

test('package.json exposes package channel maintenance scripts', () => {
  assert.equal(packageJson.scripts?.['packages:manifest'], 'node --experimental-strip-types ./scripts/package-module-archives.mjs');
  assert.equal(packageJson.scripts?.['packages:release-discipline'], 'node ./scripts/package-release-discipline.mjs');
  assert.equal(packageJson.scripts?.['packages:daily-check'], 'node ./scripts/package-channel-daily-check.mjs');
  assert.equal(packageJson.scripts?.['packages:cleanup-ghcr'], 'node --experimental-strip-types ./scripts/cleanup-ghcr-package-versions.mjs');
});

test('package.json exposes the fresh-install smoke lane', () => {
  assert.equal(
    packageJson.scripts?.['fresh-install:smoke'],
    'node ./scripts/fresh-install-smoke.mjs',
  );
  assert.equal(
    packageJson.scripts?.['test:fresh-install'],
    'node ./scripts/test-lanes.mjs run fresh-install',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/fresh-install-smoke.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'contracts/opl-framework/fresh-install-test-matrix.json')),
    true,
  );
});

test('framework repository does not own App release or Full DMG publishing entrypoints', () => {
  for (const scriptName of ['gui:release', 'packages:full-internal', 'packages:full-release']) {
    assert.equal(
      packageJson.scripts?.[scriptName],
      undefined,
      `Framework package.json must not expose App release script ${scriptName}`,
    );
  }

  for (const relativePath of [
    '.github/workflows/standard-macos-release.yml',
    '.github/workflows/full-first-install-release.yml',
    'scripts/publish-gui-release.mjs',
    'scripts/build-full-internal-package.mjs',
    'scripts/full-internal-package-runtime-wrappers.mjs',
    'src/full-internal-package.ts',
    'tests/src/full-internal-package.test.ts',
  ]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, relativePath)),
      false,
      `Framework repo must not keep App release ownership surface: ${relativePath}`,
    );
  }
});

test('framework release discovery consumes App repo assets without publishing them', async () => {
  const release = await import('../../src/opl-release.ts');
  const installCompanions = await import('../../src/install-companions.ts');
  const marker = await import('../../src/packaged-module-marker.ts');

  assert.equal(release.getOplReleaseRepo(), 'gaofeng21cn/one-person-lab-app');
  assert.equal(
    release.buildOplGuiArtifactName({ platform: 'macos', arch: 'arm64', ext: 'dmg', version: '26.5.15' }),
    'One-Person-Lab-26.5.15-mac-arm64.dmg',
  );
  assert.equal(marker.PACKAGED_MODULE_MARKER_FILE, 'opl-runtime-module.json');

  const gui = installCompanions.buildOplGuiShellSurface(repoRoot);
  assert.equal(gui.owner, 'one-person-lab-app');
  assert.equal(gui.release_repo, 'gaofeng21cn/one-person-lab-app');
  assert.equal(
    gui.prebuilt_artifacts[0].distributable_patterns.includes('One-Person-Lab-26.4.27-mac-arm64.dmg'),
    false,
  );
  assert.equal(
    gui.prebuilt_artifacts[0].distributable_patterns.includes('One-Person-Lab-26.6.3-mac-arm64.dmg'),
    true,
  );
  assert.equal(
    gui.notes.some((note) => /uploaded to the one-person-lab GitHub Release/.test(note)),
    false,
  );
});

test('package.json exposes the native MAS/MAG family indexing smoke command', () => {
  assert.equal(packageJson.scripts?.['native:family-smoke'], 'node ./scripts/native-helper-family-smoke.mjs');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs')),
    true,
  );
});
