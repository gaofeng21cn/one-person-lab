import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

type BoundarySummary = {
  enforcement: {
    mode: string;
  };
  module_entrypoints: {
    missing: string[];
  };
  root_ts: {
    allowed_transition_exception_count: number;
    unclassified_transition_count: number;
    unclassified_transition_files: string[];
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

function writeFixture(files: string[], contract = contractFor()) {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-boundary-'));
  const contractPath = path.join(root, 'contracts', 'opl-framework', 'source-module-map.json');
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);

  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, 'export {};\n');
  }

  return { root, contractPath };
}

function runBoundary(root: string, contractPath: string, extraArgs: string[] = []): BoundaryRunResult {
  return spawnSync(
    process.execPath,
    [scriptPath, '--root', root, '--contract', contractPath, ...extraArgs],
    { cwd: repoRoot, encoding: 'utf8' },
  ) as BoundaryRunResult;
}

function parseSummary(result: BoundaryRunResult): BoundarySummary {
  return JSON.parse(result.stdout) as BoundarySummary;
}

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
