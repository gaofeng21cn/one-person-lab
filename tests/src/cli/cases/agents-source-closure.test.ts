import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeSource(repoDir: string, relativePath: string, source: string) {
  const filePath = path.join(repoDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf8');
}

function digest(source: string) {
  return `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`;
}

function buildRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-closure-'));
  writeJson(path.join(repoDir, 'contracts', 'domain_descriptor.json'), {
    surface_kind: 'opl_domain_descriptor',
    domain_id: 'sample-agent',
    domain_label: 'Sample Agent',
  });
  return repoDir;
}

function installTypescriptEntry(repoDir: string, source: string) {
  writeSource(repoDir, 'src/cli.ts', source);
  writeJson(path.join(repoDir, 'package.json'), {
    name: 'sample-agent',
    version: '0.0.0',
    type: 'module',
    bin: { 'sample-agent': './src/cli.ts' },
  });
  writeJson(path.join(repoDir, 'contracts', 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    actions: [{
      action_id: 'run',
      handler_id: 'run',
      source_command: { command: 'node ./src/cli.ts' },
    }],
  });
  writeJson(path.join(repoDir, 'contracts', 'domain_handler_registry.json'), {
    surface_kind: 'domain_handler_registry',
    handlers: [{
      handler_id: 'run',
      binding: { kind: 'typescript_export', file: 'src/cli.ts', export: 'main' },
    }],
  });
}

function installAudit(repoDir: string, entries: unknown[]) {
  writeJson(path.join(repoDir, 'contracts', 'source_closure_audit.json'), {
    surface_kind: 'standard_agent_source_closure_audit',
    version: 'standard-agent-source-closure-audit.v1',
    entries,
  });
}

function runSourceClosure(repoDir: string) {
  return runCli([
    'agents',
    'source-closure',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_agent_source_closure;
}

function runGit(repoDir: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('agents source-closure resolves package, action, handler, and TypeScript calls', () => {
  const repoDir = buildRepo();
  const cliSource = [
    "import { handle } from './handler.ts';",
    'export function main() { return handle(); }',
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, cliSource);
  writeSource(repoDir, 'src/handler.ts', "export function handle() { return 'ok'; }\n");

  const result = runSourceClosure(repoDir);
  const report = result.reports[0];

  assert.equal(result.status, 'passed');
  assert.equal(report.scan_complete, true);
  assert.deepEqual(
    new Set(report.entrypoints.map((entry: { source_kind: string }) => entry.source_kind)),
    new Set(['package_bin', 'action_catalog', 'handler_registry']),
  );
  assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
});

test('agents source-closure resolves Python pyproject scripts and relative calls', () => {
  const repoDir = buildRepo();
  writeSource(repoDir, 'pyproject.toml', [
    '[project]',
    'name = "sample-agent"',
    'version = "0.0.0"',
    '[project.scripts]',
    'sample-agent = "sample.cli:main"',
    '',
  ].join('\n'));
  writeSource(repoDir, 'python/sample/cli.py', [
    'from .handler import handle',
    'def main():',
    '    return handle()',
    '',
  ].join('\n'));
  writeSource(repoDir, 'python/sample/handler.py', [
    'def handle():',
    '    return "ok"',
    '',
  ].join('\n'));

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(report.entrypoints[0].source_kind, 'pyproject_script');
  assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
});

test('agents source-closure fails closed on dynamic import and dispatch', () => {
  const repoDir = buildRepo();
  installTypescriptEntry(repoDir, [
    'export async function main(name: string) {',
    '  const loaded = await import(name);',
    '  return loaded[name]();',
    '}',
    "void main(process.argv[2] ?? './handler.ts');",
    '',
  ].join('\n'));

  const report = runSourceClosure(repoDir).reports[0];
  const reasons = report.unresolved_edges.map((edge: { reason: string }) => edge.reason);

  assert.equal(report.status, 'blocked');
  assert.equal(reasons.includes('dynamic_import'), true);
  assert.equal(reasons.includes('dynamic_dispatch'), true);
});

test('agents source-closure never lets minimal authority audit authorize executor or runtime mutation', () => {
  const repoDir = buildRepo();
  const source = [
    "import fs from 'node:fs';",
    "import { spawnSync } from 'node:child_process';",
    'function save_session(_id: string) { return true; }',
    'export function main() {',
    "  fs.writeFileSync('state.json', '{}');",
    "  spawnSync('codex', ['exec']);",
    "  return save_session('session-1');",
    '}',
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, source);
  installAudit(repoDir, [{
    file: 'src/cli.ts',
    symbol: 'main',
    source_digest: digest(source),
    allowed_effects: ['filesystem_write', 'process_spawn', 'executor_invoke', 'runtime_state_mutation'],
    role: 'minimal_authority_function',
    allowed_targets: ['state.json', 'codex'],
  }]);

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
      item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'executor_invoke'
    ),
    true,
  );
  assert.equal(
    report.audit_mismatches.some((item: { mismatch_kind: string; effect_kind: string }) =>
      item.mismatch_kind === 'audit_role_effect_forbidden' && item.effect_kind === 'runtime_state_mutation'
    ),
    true,
  );
});

test('agents source-closure binds exact audit to source digest and detects drift', () => {
  const repoDir = buildRepo();
  const source = [
    "import fs from 'node:fs';",
    "export function main() { fs.writeFileSync('artifact.json', '{}'); }",
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, source);
  installAudit(repoDir, [{
    file: 'src/cli.ts',
    symbol: 'main',
    source_digest: digest(source),
    allowed_effects: ['filesystem_write'],
    role: 'minimal_authority_function',
    allowed_targets: ['artifact.json'],
  }]);

  assert.equal(runSourceClosure(repoDir).reports[0].status, 'passed');

  writeSource(repoDir, 'src/cli.ts', `${source}\n// digest drift\n`);
  const drifted = runSourceClosure(repoDir).reports[0];
  assert.equal(drifted.status, 'blocked');
  assert.equal(
    drifted.audit_mismatches.some((item: { mismatch_kind: string }) => item.mismatch_kind === 'audit_digest_mismatch'),
    true,
  );
});

test('agents source-closure requires literal targets and rejects glob or directory audits', () => {
  const repoDir = buildRepo();
  const source = [
    "import { spawnSync } from 'node:child_process';",
    "export function main() { return spawnSync('pdftotext', ['in.pdf', 'out.txt']); }",
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, source);
  installAudit(repoDir, [{
    file: 'src/cli.ts',
    symbol: 'main',
    source_digest: digest(source),
    allowed_effects: ['process_spawn'],
    role: 'minimal_authority_function',
    allowed_targets: [],
  }]);
  const noTarget = runSourceClosure(repoDir).reports[0];
  assert.equal(noTarget.status, 'blocked');
  assert.equal(
    noTarget.audit_mismatches.some((item: { mismatch_kind: string }) => item.mismatch_kind === 'effect_target_not_allowed'),
    true,
  );

  installAudit(repoDir, ['src/*.ts', 'src/'].map((file) => ({
    file,
    symbol: 'main',
    source_digest: digest(source),
    allowed_effects: ['process_spawn'],
    role: 'minimal_authority_function',
    allowed_targets: ['pdftotext'],
  })));
  const broadPath = runSourceClosure(repoDir).reports[0];
  assert.equal(broadPath.status, 'blocked');
  assert.equal(
    broadPath.audit_mismatches.filter((item: { mismatch_kind: string }) =>
      item.mismatch_kind === 'audit_path_not_exact'
    ).length,
    2,
  );
});

test('agents source-closure excludes exact unreachable developer tool edges but not registered ones', () => {
  const repoDir = buildRepo();
  const cliSource = "export function main() { return 'ok'; }\nmain();\n";
  const toolSource = [
    'export async function load(name: string) {',
    '  return import(name);',
    '}',
    'void load(process.argv[2]);',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, cliSource);
  writeSource(repoDir, 'scripts/dev.ts', toolSource);
  installAudit(repoDir, [{
    file: 'scripts/dev.ts',
    symbol: 'load',
    source_digest: digest(toolSource),
    allowed_effects: [],
    allowed_unresolved_edge_reasons: ['dynamic_import'],
    role: 'developer_tool',
    allowed_targets: [],
  }]);

  const excluded = runSourceClosure(repoDir).reports[0];
  assert.equal(excluded.status, 'passed');
  assert.equal(excluded.excluded_developer_tool_edges.length, 1);

  const packageJsonPath = path.join(repoDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.bin['sample-dev'] = './scripts/dev.ts';
  writeJson(packageJsonPath, packageJson);
  const registered = runSourceClosure(repoDir).reports[0];
  assert.equal(registered.status, 'blocked');
  assert.equal(registered.unresolved_edges.some((edge: { reason: string }) => edge.reason === 'dynamic_import'), true);
});

test('agents source-closure reports unreachable sensitive residue', () => {
  const repoDir = buildRepo();
  installTypescriptEntry(repoDir, "export function main() { return 'ok'; }\nmain();\n");
  writeSource(repoDir, 'src/legacy.ts', [
    "import fs from 'node:fs';",
    "export function persistQueue() { fs.writeFileSync('queue.json', '{}'); }",
    '',
  ].join('\n'));

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'blocked');
  assert.equal(report.unreachable_sensitive_residue.length, 1);
  assert.equal(report.unreachable_sensitive_residue[0].file, 'src/legacy.ts');
});

test('agents source-closure blocks hosted declarations and missing action handlers', () => {
  const repoDir = buildRepo();
  writeJson(path.join(repoDir, 'contracts', 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    actions: [{
      action_id: 'hosted',
      handler_id: 'missing_handler',
      source_command: { command: 'opl://agents/sample/hosted' },
    }],
  });

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'blocked');
  assert.equal(
    report.entrypoints.some((entry: { entrypoint_id: string; resolution_status: string }) =>
      entry.entrypoint_id === 'action_handler:hosted' && entry.resolution_status === 'unresolved'
    ),
    true,
  );
  assert.equal(
    report.entrypoints.some((entry: { entrypoint_id: string; resolution_status: string }) =>
      entry.entrypoint_id === 'action_catalog:hosted'
      && entry.resolution_status === 'hosted_declaration_unverified'
    ),
    true,
  );
});

test('agents source-closure scans current dirty workspace bytes including untracked replacements', () => {
  const repoDir = buildRepo();
  const oldCli = [
    "import { handle } from './old-handler.ts';",
    'export function main() { return handle(); }',
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, oldCli);
  writeSource(repoDir, 'src/old-handler.ts', "export function handle() { return 'old'; }\n");
  writeJson(path.join(repoDir, 'contracts', 'domain_handler_registry.json'), {
    surface_kind: 'domain_handler_registry',
    handlers: [{
      handler_id: 'run',
      binding: { kind: 'typescript_export', file: 'src/old-handler.ts', export: 'handle' },
    }],
  });
  runGit(repoDir, ['init', '-q']);
  runGit(repoDir, ['add', '.']);

  fs.rmSync(path.join(repoDir, 'src', 'old-handler.ts'));
  writeSource(repoDir, 'src/cli.ts', [
    "import { handleReplacement } from './replacement-handler.ts';",
    'export function main() { return handleReplacement(); }',
    'main();',
    '',
  ].join('\n'));
  writeSource(
    repoDir,
    'src/replacement-handler.ts',
    "export function handleReplacement() { return 'new'; }\n",
  );
  fs.symlinkSync(
    'replacement-handler.ts',
    path.join(repoDir, 'src', 'linked-handler.ts'),
  );
  writeJson(path.join(repoDir, 'contracts', 'domain_handler_registry.json'), {
    surface_kind: 'domain_handler_registry',
    handlers: [{
      handler_id: 'run',
      binding: {
        kind: 'typescript_export',
        file: 'src/replacement-handler.ts',
        export: 'handleReplacement',
      },
    }],
  });

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(Object.hasOwn(report.source_digests, 'src/old-handler.ts'), false);
  assert.equal(Object.hasOwn(report.source_digests, 'src/replacement-handler.ts'), true);
  assert.equal(Object.hasOwn(report.source_digests, 'src/linked-handler.ts'), false);
  assert.equal(
    report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handleReplacement'),
    true,
  );
});

test('agents source-closure does not classify readonly os.open or ordinary object methods as writes', () => {
  const repoDir = buildRepo();
  writeSource(repoDir, 'pyproject.toml', [
    '[project]',
    'name = "sample-agent"',
    'version = "0.0.0"',
    '[project.scripts]',
    'sample-agent = "sample.readonly:main"',
    '',
  ].join('\n'));
  writeSource(repoDir, 'python/sample/readonly.py', [
    'import os',
    'import sys',
    'def main(resolved, metrics, name):',
    '    descriptor = os.open(resolved, os.O_RDONLY | os.O_NOFOLLOW)',
    '    metrics.update({"count": 1})',
    '    name.replace("old", "new")',
    '    sys.path.insert(0, "vendor")',
    '    return descriptor',
    '',
  ].join('\n'));

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.observed_effects, []);
});

test('agents source-closure admits exact native-helper command and artifact slots without executor authority', () => {
  const repoDir = buildRepo();
  const source = [
    'import subprocess',
    'from pathlib import Path',
    'def main(command):',
    '    subprocess.run(command, check=True)',
    '    Path("proof.pdf").write_text("proof")',
    '    return {"status": "candidate"}',
    'main(["pandoc"])',
    '',
  ].join('\n');
  writeSource(repoDir, 'runtime/native_helpers/helper.py', source);
  writeJson(path.join(repoDir, 'runtime', 'native_helpers', 'helper.native-helper-probe.json'), {
    surface_kind: 'opl_pack_native_helper_probe_descriptor',
    schema_version: 1,
    helper_id: 'sample.pdf-export',
    owner: 'sample-agent',
    entrypoint_ref: 'helper.py',
    runtime_command: 'python3',
    required_commands: ['pandoc'],
    source_closure: {
      surface_kind: 'opl_native_helper_source_closure',
      version: 'opl-native-helper-source-closure.v1',
      effect_slots: [
        {
          slot_id: 'pandoc_process',
          source_ref: 'helper.py',
          symbol: 'main',
          source_digest: digest(source),
          effect_kind: 'process_spawn',
          target_policy: 'declared_command_set',
          allowed_targets: ['pandoc'],
        },
        {
          slot_id: 'proof_artifact_write',
          source_ref: 'helper.py',
          symbol: 'main',
          source_digest: digest(source),
          effect_kind: 'filesystem_write',
          target_policy: 'declared_artifact_write_slot',
          allowed_targets: [],
        },
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_readiness: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  });

  const report = runSourceClosure(repoDir).reports[0];

  assert.equal(report.status, 'passed');
  assert.equal(report.entrypoints[0].source_kind, 'native_helper_descriptor');
  assert.equal(report.observed_effects.length, 2);
  assert.equal(
    report.observed_effects.every((effect: { audit_status: string }) =>
      effect.audit_status === 'native_helper_carrier_exact'
    ),
    true,
  );
  assert.equal(
    report.observed_effects.some((effect: { effect_kind: string }) => effect.effect_kind === 'executor_invoke'),
    false,
  );
});

test('agents source-closure only classifies codex or opl commands on process APIs as executor invocation', () => {
  const repoDir = buildRepo();
  const source = [
    "import { spawnSync } from 'node:child_process';",
    'function label(value: string) { return value; }',
    'export function main() {',
    "  label('opl');",
    "  spawnSync('codex', ['exec']);",
    '}',
    'main();',
    '',
  ].join('\n');
  installTypescriptEntry(repoDir, source);

  const report = runSourceClosure(repoDir).reports[0];
  const executorEffects = report.observed_effects.filter(
    (effect: { effect_kind: string }) => effect.effect_kind === 'executor_invoke',
  );

  assert.equal(report.status, 'blocked');
  assert.equal(executorEffects.length, 1);
  assert.equal(executorEffects[0].target, 'codex');
});
