import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'line-budget.mjs');

type BaselineInput = {
  path: string;
  limit: number;
  owner?: string;
  reason?: string;
  intended_boundary?: string;
};

function writeLines(file: string, lineCount: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Array.from({ length: lineCount }, (_, index) => `export const value${index} = ${index};`).join('\n') + '\n',
  );
}

function fixture(input: {
  files: Record<string, number>;
  defaultLimit?: number;
  baselines?: BaselineInput[];
}) {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-line-budget-'));
  const contractPath = path.join(root, 'line-budget.contract.json');
  const contract = {
    contract_kind: 'opl_source_structure_budget.v1',
    owner: 'one-person-lab',
    state: 'active_contract',
    default_limit: input.defaultLimit ?? 3,
    advisory_near_limit: input.defaultLimit ?? 3,
    baseline_policy: {
      mode: 'ratchet_no_growth',
    },
    reviewed_baselines: (input.baselines ?? []).map((entry) => ({
      owner: entry.owner ?? 'test-owner',
      reason: entry.reason ?? 'fixture reviewed baseline',
      intended_boundary: entry.intended_boundary ?? 'fixture semantic boundary',
      review_after: '2026-12-31',
      ...entry,
    })),
  };

  const init = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  for (const [relativePath, lines] of Object.entries(input.files)) {
    writeLines(path.join(root, relativePath), lines);
  }
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  const add = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);

  return { root, contractPath };
}

function runLineBudget(root: string, contractPath: string, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [scriptPath, '--root', root, '--baseline', contractPath, ...extraArgs],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('line budget ratchet allows a reviewed oversized baseline without requiring a split', () => {
  const { root, contractPath } = fixture({
    files: { 'src/legacy-entry.ts': 4 },
    defaultLimit: 3,
    baselines: [{ path: 'src/legacy-entry.ts', limit: 4 }],
  });

  try {
    const result = runLineBudget(root, contractPath);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('line budget ratchet blocks growth above a reviewed baseline', () => {
  const { root, contractPath } = fixture({
    files: { 'src/legacy-entry.ts': 5 },
    defaultLimit: 3,
    baselines: [{ path: 'src/legacy-entry.ts', limit: 4 }],
  });

  try {
    const result = runLineBudget(root, contractPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /src\/legacy-entry\.ts: 5 lines exceeds locked baseline 4/);
    assert.match(result.stderr, /ratchet baseline/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('line budget blocks a new oversized file until it has a reviewed baseline', () => {
  const { root, contractPath } = fixture({
    files: { 'src/new-large-entry.ts': 4 },
    defaultLimit: 3,
  });

  try {
    const result = runLineBudget(root, contractPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /src\/new-large-entry\.ts: 4 lines exceeds 3 line budget/);
    assert.match(result.stderr, /add a reviewed baseline contract entry/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('line budget rejects baseline entries without review metadata', () => {
  const { root, contractPath } = fixture({
    files: { 'src/legacy-entry.ts': 4 },
    defaultLimit: 3,
    baselines: [{
      path: 'src/legacy-entry.ts',
      limit: 4,
      owner: '',
      reason: '',
      intended_boundary: '',
    }],
  });

  try {
    const result = runLineBudget(root, contractPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /baseline entry for src\/legacy-entry\.ts is missing owner/);
    assert.match(result.stderr, /baseline entry for src\/legacy-entry\.ts is missing reason/);
    assert.match(result.stderr, /baseline entry for src\/legacy-entry\.ts is missing intended_boundary/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('line budget asks for retired baseline removal once a file is back under default budget', () => {
  const { root, contractPath } = fixture({
    files: { 'src/legacy-entry.ts': 3 },
    defaultLimit: 3,
    baselines: [{ path: 'src/legacy-entry.ts', limit: 4 }],
  });

  try {
    const result = runLineBudget(root, contractPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /src\/legacy-entry\.ts: retired line-budget baseline entry/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
