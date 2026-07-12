import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'source-module-boundary.mjs');

const defaultModuleIds = ['charter', 'atlas'];

type ContractFixtureInput = {
  moduleIds?: string[];
  stage?: string;
  allowedTransitionExceptions?: Array<{
    path: string;
    kind: string;
    target_path: string;
    retire_when: string;
  }>;
};

type DependencyPolicyFixtureInput = {
  deepImportFailureMode?: 'advisory' | 'strict';
  dependencyCycleFailureMode?: 'advisory' | 'strict';
  forbiddenDependencies?: Array<{
    from_module_id: string;
    to_module_id: string;
    reason: string;
  }>;
};

type BoundarySummary = {
  module_dependency_policy: string | null;
  enforcement: {
    mode: string;
  };
  module_entrypoints: {
    missing: string[];
    unexpected_module_roots: string[];
  };
  root_ts: {
    allowed_transition_exception_count: number;
    unclassified_transition_count: number;
    unclassified_transition_files: string[];
  };
  cross_module_imports: {
    policy: {
      module_count: number;
      source_scan_scope: string;
      deep_import_failure_mode: string;
      strict_imports_requested: boolean;
      dependency_cycle_failure_mode: string;
      strict_cycles_requested: boolean;
    };
    pair_counts: Array<{
      from_module_id: string;
      to_module_id: string;
      count: number;
    }>;
    deep_import_violations: {
      count: number;
      failure_mode: string;
      enforced: boolean;
    };
    forbidden_dependency_violations: {
      count: number;
    };
    dependency_cycles: {
      count: number;
      failure_mode: string;
      enforced: boolean;
      components: Array<{
        module_ids: string[];
        edge_count: number;
      }>;
    };
  };
  failures: string[];
};

type BoundaryRunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function contractFor(input: ContractFixtureInput = {}) {
  const moduleIds = input.moduleIds ?? defaultModuleIds;
  return {
    version: 'source-module-map.test',
    scope: 'opl_framework_source_module_map',
    owner: 'test',
    purpose: 'test source module boundary',
    state: 'active_contract',
    machine_boundary: 'test fixture',
    source_root: 'src',
    physical_module_root: 'src/modules',
    physical_layout: {
      version: 'source-module-physical-layout.v1',
      stage: input.stage ?? 'transition',
      module_entrypoint_pattern: 'src/modules/<module_id>/index.ts',
      entrypoints_root: 'src/entrypoints',
      target_cli_entrypoint: 'src/entrypoints/cli.ts',
      legacy_cli_entrypoint: 'src/cli.ts',
      target_activation_path: 'src/entrypoints/cli.ts',
      root_ts_policy: {
        target_top_level_ts_count: 0,
        transition_failure_mode: 'enforce_target_when_target_cli_exists',
        allowed_transition_exception_kinds: ['entrypoint', 'kernel'],
        allowed_transition_exceptions: input.allowedTransitionExceptions ?? [
          {
            path: 'src/cli.ts',
            kind: 'entrypoint',
            target_path: 'src/entrypoints/cli.ts',
            retire_when: 'target_cli_entrypoint_exists',
          },
          {
            path: 'src/types.ts',
            kind: 'kernel',
            target_path: 'src/modules/charter/index.ts',
            retire_when: 'module imports no longer need the root public type barrel',
          },
        ],
      },
    },
    alignment_rules: ['test'],
    modules: moduleIds.map((moduleId) => ({
      module_id: moduleId,
      brand_name: moduleId,
      physical_root: `src/modules/${moduleId}`,
      public_entrypoint: `src/modules/${moduleId}/index.ts`,
      primary_source_globs: [`src/${moduleId}-*`],
      shared_source_globs: [],
      owner_note: `${moduleId} owner`,
    })),
    shared_kernel: [],
  };
}

function policyFor(input: DependencyPolicyFixtureInput = {}) {
  return {
    version: 'module-dependency-policy.test',
    scope: 'opl_framework_module_dependency_policy',
    owner: 'test',
    purpose: 'test module dependency policy',
    state: 'active_contract',
    machine_boundary: 'test fixture',
    source_module_map: 'contracts/opl-framework/source-module-map.json',
    module_set_policy: {
      physical_module_root: 'src/modules',
      extra_physical_module_roots: 'strict',
      new_module_requires_source_module_map_update: true,
    },
    public_entrypoint_rule: {
      module_entrypoint_pattern: 'src/modules/<module_id>/index.ts',
      thin_public_entry_pattern: 'src/modules/<module_id>/public/**/*.ts',
      aggregate_entrypoint: 'src/modules/index.ts',
      cross_module_imports: 'public_entrypoint_or_thin_public_entry',
      same_module_deep_imports: 'allowed',
    },
    source_scan_scope: {
      checker_scope: 'all_module_ts_files',
      included: 'src/modules/<module_id>/**/*.ts',
      excluded: 'none',
    },
    deep_cross_module_imports: {
      failure_mode: input.deepImportFailureMode ?? 'advisory',
      strict_flag: '--strict-imports',
    },
    module_dependency_cycles: {
      failure_mode: input.dependencyCycleFailureMode ?? 'advisory',
      strict_flag: '--strict-cycles',
      detection: 'directed_scc_from_cross_module_import_pair_graph',
    },
    dependency_policy: {
      forbidden_dependencies: input.forbiddenDependencies ?? [],
    },
  };
}

function writeFixture(files: string[], contract = contractFor(), policy = policyFor()) {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-boundary-'));
  const contractPath = path.join(root, 'contracts', 'opl-framework', 'source-module-map.json');
  const policyPath = path.join(root, 'contracts', 'opl-framework', 'module-dependency-policy.json');
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, 'export {};\n');
  }

  return { root, contractPath, policyPath };
}

function runBoundary(root: string, contractPath: string, extraArgs: string[] = []): BoundaryRunResult {
  return spawnSync(
    process.execPath,
    [scriptPath, '--root', root, '--contract', contractPath, ...extraArgs],
    { cwd: repoRoot, encoding: 'utf8' },
  ) as BoundaryRunResult;
}

function runDefaultBoundary(extraArgs: string[] = []): BoundaryRunResult {
  return spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
  }) as BoundaryRunResult;
}

function parseSummary(result: BoundaryRunResult): BoundarySummary {
  return parseJsonText(result.stdout) as BoundarySummary;
}

test('source module boundary reports current repo cross-module import summary', () => {
  const result = runDefaultBoundary();
  const summary = parseSummary(result);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(summary.module_dependency_policy, 'contracts/opl-framework/module-dependency-policy.json');
  assert.equal(summary.cross_module_imports.policy.module_count, 10);
  assert.equal(summary.cross_module_imports.policy.source_scan_scope, 'all_module_ts_files');
  assert.equal(summary.cross_module_imports.policy.deep_import_failure_mode, 'strict');
  assert.equal(summary.cross_module_imports.policy.strict_imports_requested, false);
  assert.equal(summary.cross_module_imports.policy.dependency_cycle_failure_mode, 'advisory');
  assert.equal(summary.cross_module_imports.policy.strict_cycles_requested, false);
  assert.equal(summary.cross_module_imports.deep_import_violations.enforced, true);
  assert.equal(summary.cross_module_imports.deep_import_violations.count, 0);
  assert.equal(summary.cross_module_imports.forbidden_dependency_violations.count, 0);
  assert.equal(summary.cross_module_imports.dependency_cycles.enforced, false);
  assert.equal(summary.cross_module_imports.dependency_cycles.count, 1);
  assert.equal(summary.module_entrypoints.unexpected_module_roots.length, 0);
  assert.ok(summary.cross_module_imports.pair_counts.length > 0);
  assert.equal(
    summary.cross_module_imports.pair_counts.some(
      (entry) => entry.from_module_id === 'connect' && entry.to_module_id === 'console',
    ),
    false,
  );
});

test('source module boundary supports help and explicit json format', () => {
  const help = runDefaultBoundary(['--help']);
  const json = runDefaultBoundary(['--format', 'json']);

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: node scripts\/source-module-boundary\.mjs/);
  assert.match(help.stdout, /--format json/);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(parseSummary(json).module_dependency_policy, 'contracts/opl-framework/module-dependency-policy.json');
});

test('source module boundary accepts current transition roots before target CLI lands', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/atlas/index.ts',
    'src/cli.ts',
    'src/legacy-root.ts',
  ]);

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(summary.enforcement.mode, 'transition');
    assert.equal(summary.module_entrypoints.missing.length, 0);
    assert.equal(summary.root_ts.unclassified_transition_count, 1);
    assert.deepEqual(summary.root_ts.unclassified_transition_files, []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary rejects unclassified root TypeScript files in target mode', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/atlas/index.ts',
    'src/entrypoints/cli.ts',
    'src/legacy-root.ts',
  ]);

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.equal(summary.enforcement.mode, 'target');
    assert.equal(summary.failures.some((failure) => failure.includes('src/legacy-root.ts')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary allows explicit kernel root exceptions in target mode', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/atlas/index.ts',
    'src/entrypoints/cli.ts',
    'src/types.ts',
  ]);

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(summary.enforcement.mode, 'target');
    assert.equal(summary.root_ts.allowed_transition_exception_count, 1);
    assert.deepEqual(summary.root_ts.unclassified_transition_files, []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary reports deep cross-module imports as advisory by default', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/modules/atlas/detail.ts',
    'src/cli.ts',
  ]);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasDetail } from '../atlas/detail.ts';\nexport const charterFeature = atlasDetail;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'detail.ts'),
    "export const atlasDetail = 'atlas';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(summary.cross_module_imports.pair_counts, [
      { from_module_id: 'charter', to_module_id: 'atlas', count: 1 },
    ]);
    assert.equal(summary.cross_module_imports.deep_import_violations.count, 1);
    assert.equal(summary.cross_module_imports.deep_import_violations.failure_mode, 'advisory');
    assert.equal(summary.cross_module_imports.deep_import_violations.enforced, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary fails deep cross-module imports in strict mode', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/modules/atlas/detail.ts',
    'src/cli.ts',
  ]);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasDetail } from '../atlas/detail.ts';\nexport const charterFeature = atlasDetail;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'detail.ts'),
    "export const atlasDetail = 'atlas';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath, ['--strict-imports']);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.equal(summary.cross_module_imports.deep_import_violations.enforced, true);
    assert.equal(summary.cross_module_imports.deep_import_violations.count, 1);
    assert.equal(summary.failures.some((failure) => failure.includes('deep cross-module import')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary accepts thin public entries in strict mode', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/modules/atlas/public/detail.ts',
    'src/modules/atlas/detail.ts',
    'src/cli.ts',
  ]);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasDetail } from '../atlas/public/detail.ts';\nexport const charterFeature = atlasDetail;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'public', 'detail.ts'),
    "export { atlasDetail } from '../detail.ts';\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'detail.ts'),
    "export const atlasDetail = 'atlas';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath, ['--strict-imports']);
    const summary = parseSummary(result);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(summary.cross_module_imports.pair_counts, [
      { from_module_id: 'charter', to_module_id: 'atlas', count: 1 },
    ]);
    assert.equal(summary.cross_module_imports.deep_import_violations.count, 0);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary fails forbidden module dependency pairs', () => {
  const contract = contractFor();
  const policy = policyFor({
    forbiddenDependencies: [
      {
        from_module_id: 'charter',
        to_module_id: 'atlas',
        reason: 'fixture forbidden pair',
      },
    ],
  });
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/cli.ts',
  ], contract, policy);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasValue } from '../atlas/index.ts';\nexport const charterFeature = atlasValue;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'index.ts'),
    "export const atlasValue = 'atlas';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.equal(summary.cross_module_imports.deep_import_violations.count, 0);
    assert.equal(summary.cross_module_imports.forbidden_dependency_violations.count, 1);
    assert.equal(summary.failures.some((failure) => failure.includes('charter->atlas')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary reports dependency cycles as advisory by default', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/modules/atlas/feature.ts',
    'src/cli.ts',
  ]);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasValue } from '../atlas/index.ts';\nexport const charterFeature = atlasValue;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'feature.ts'),
    "import { charterValue } from '../charter/index.ts';\nexport const atlasFeature = charterValue;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'index.ts'),
    "export const charterValue = 'charter';\nexport { charterFeature } from './feature.ts';\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'index.ts'),
    "export const atlasValue = 'atlas';\nexport { atlasFeature } from './feature.ts';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(summary.cross_module_imports.dependency_cycles.count, 1);
    assert.equal(summary.cross_module_imports.dependency_cycles.failure_mode, 'advisory');
    assert.equal(summary.cross_module_imports.dependency_cycles.enforced, false);
    assert.deepEqual(summary.cross_module_imports.dependency_cycles.components[0].module_ids, ['atlas', 'charter']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary fails dependency cycles in strict mode', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/charter/feature.ts',
    'src/modules/atlas/index.ts',
    'src/modules/atlas/feature.ts',
    'src/cli.ts',
  ]);
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'feature.ts'),
    "import { atlasValue } from '../atlas/index.ts';\nexport const charterFeature = atlasValue;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'feature.ts'),
    "import { charterValue } from '../charter/index.ts';\nexport const atlasFeature = charterValue;\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'charter', 'index.ts'),
    "export const charterValue = 'charter';\nexport { charterFeature } from './feature.ts';\n",
  );
  fs.writeFileSync(
    path.join(fixture.root, 'src', 'modules', 'atlas', 'index.ts'),
    "export const atlasValue = 'atlas';\nexport { atlasFeature } from './feature.ts';\n",
  );

  try {
    const result = runBoundary(fixture.root, fixture.contractPath, ['--strict-cycles']);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.equal(summary.cross_module_imports.dependency_cycles.enforced, true);
    assert.equal(summary.cross_module_imports.dependency_cycles.count, 1);
    assert.equal(summary.failures.some((failure) => failure.includes('module_dependency_cycles')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary requires every module index entrypoint', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/cli.ts',
  ]);

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.deepEqual(summary.module_entrypoints.missing, ['src/modules/atlas/index.ts']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('source module boundary retires src/cli.ts once target CLI entrypoint exists', () => {
  const fixture = writeFixture([
    'src/modules/charter/index.ts',
    'src/modules/atlas/index.ts',
    'src/entrypoints/cli.ts',
    'src/cli.ts',
  ]);

  try {
    const result = runBoundary(fixture.root, fixture.contractPath);
    const summary = parseSummary(result);

    assert.equal(result.status, 1);
    assert.equal(summary.failures.some((failure) => failure.includes('src/cli.ts')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
