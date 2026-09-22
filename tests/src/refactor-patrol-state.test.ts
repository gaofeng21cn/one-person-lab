import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'refactor-patrol-state.mjs');

function candidate() {
  return {
    id: 'candidate-1',
    repo: 'one-person-lab',
    truth_owner: 'one-person-lab',
    owner_surface: 'src/example.ts',
    candidate: 'shrink duplicate helper family',
    tag: 'shrink',
    route: 'refactor_patrol',
    active_caller_evidence: 'CodeGraph callers read back',
    authority_blocker: null,
    allowed_write_set: ['src/example.ts'],
    forbidden_write_set: ['contracts/domain-truth/**'],
    risk_class: 'medium',
    verification_command: 'npm test',
    estimated_complexity_reduction: 'one duplicate implementation removed',
    status: 'selected',
    selected_or_skipped_reason: 'highest-value executable package',
    source_provenance_class: 'model_invented',
    source_provenance_evidence: 'No user, external-learning, contract, or owner source found in current history.',
    reserve_capability_assessment: 'No research, connector, provider, integration, or future-boundary reserve value found.',
    replacement_or_retirement_evidence: 'No active consumer and no replacement obligation after exact caller and owner readback.',
  };
}

function validState() {
  return {
    schema: 'opl_reasonable_refactor_patrol_state.v1',
    snapshot: {
      captured_at: '2026-08-04T00:00:00Z',
      source_refs: { 'one-person-lab': 'abc123' },
    },
    issue_library: [candidate()],
    work_packages: [{
      package_id: 'package-1',
      child_candidate_ids: ['candidate-1'],
      repo: 'one-person-lab',
      semantic_boundary: 'example helper family',
      expected_complexity_reduction: 'one duplicate implementation removed',
      verification_fan_in: ['npm test'],
      allowed_write_set: ['src/example.ts'],
      forbidden_write_set: ['contracts/domain-truth/**'],
      package_acceptance_gate: 'canonical main and remote readback',
    }],
    selected_package_ids: ['package-1'],
    burn_down: [{
      package_id: 'package-1',
      status: 'done',
      evidence: ['tests passed', 'canonical main read back'],
      commit_or_reason: 'abc123',
      next_action: 'closed',
    }],
    run_status: 'completed',
    remaining: [] as string[],
  };
}

function run(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('refactor patrol policy contract rejects fixed orchestration quotas', () => {
  const result = run(['contract']);
  assert.equal(result.status, 0, result.stderr);
  const output = parseJsonText(result.stdout) as any;
  assert.equal(output.status, 'ok');
  assert.deepEqual(output.errors, []);
});

test('refactor patrol state accepts a coherent terminal selected batch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-state-'));
  try {
    const input = path.join(root, 'state.json');
    fs.writeFileSync(input, `${JSON.stringify(validState(), null, 2)}\n`);
    const result = run(['validate', '--input', input]);
    assert.equal(result.status, 0, result.stderr);
    const output = parseJsonText(result.stdout) as any;
    assert.equal(output.status, 'ok');
    assert.deepEqual(output.counts, {
      candidates: 1,
      work_packages: 1,
      selected_packages: 1,
      burn_down: 1,
      remaining: 0,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refactor patrol state schema stays compatible with the shared 2020-12 registry', () => {
  const result = assertRepoJsonSchemaPayload({
    repoRoot,
    schemaRef: 'contracts/opl-framework/reasonable-refactor-patrol-state.schema.json',
    payload: validState(),
    label: 'reasonable refactor patrol state',
  });

  assert.equal(result.status, 'valid');
});

test('refactor patrol state rejects missing burn-down and false completed status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-state-'));
  try {
    const input = path.join(root, 'state.json');
    const state = validState();
    state.burn_down = [];
    fs.writeFileSync(input, `${JSON.stringify(state, null, 2)}\n`);
    const result = run(['validate', '--input', input]);
    assert.equal(result.status, 1, result.stderr);
    const output = parseJsonText(result.stdout) as any;
    assert.equal(output.status, 'invalid');
    assert.ok(output.errors.includes('selected package has no burn-down entry: package-1'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refactor patrol state rejects terminal runs with remaining work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-state-'));
  try {
    const input = path.join(root, 'state.json');
    const state = validState();
    state.remaining = ['package-1 canonical absorption'];
    fs.writeFileSync(input, `${JSON.stringify(state, null, 2)}\n`);
    const result = run(['validate', '--input', input]);
    assert.equal(result.status, 1, result.stderr);
    const output = parseJsonText(result.stdout) as any;
    assert.equal(output.status, 'invalid');
    assert.ok(output.errors.includes('completed run must have remaining=[]'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refactor patrol state rejects deletion of user-requested reserve capability', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-state-'));
  try {
    const input = path.join(root, 'state.json');
    const state = validState();
    state.issue_library[0].tag = 'delete';
    state.issue_library[0].source_provenance_class = 'user_requested';
    fs.writeFileSync(input, `${JSON.stringify(state, null, 2)}\n`);
    const result = run(['validate', '--input', input]);
    assert.equal(result.status, 1, result.stderr);
    const output = parseJsonText(result.stdout) as any;
    assert.ok(output.errors.includes(
      'candidate-1: user_requested provenance cannot be selected for delete',
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('protected capability organization is allowed without authorizing its deletion', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-organization-'));
  try {
    const input = path.join(root, 'state.json');
    const state = validState();
    Object.assign(state.issue_library[0], {
      source_provenance_class: 'user_requested',
      change_kind: 'behavior_preserving_organization',
    });
    fs.writeFileSync(input, JSON.stringify(state));
    assert.equal(run(['validate', '--input', input]).status, 0);
    state.issue_library[0].tag = 'delete';
    fs.writeFileSync(input, JSON.stringify(state));
    assert.equal(run(['validate', '--input', input]).status, 1);
    state.issue_library[0].tag = 'shrink';
    Object.assign(state.issue_library[0], { change_kind: 'capability_retirement' });
    fs.writeFileSync(input, JSON.stringify(state));
    assert.equal(run(['validate', '--input', input]).status, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file metrics distinguish aggregate lines from the largest individual file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-refactor-patrol-files-'));
  try {
    const input = path.join(root, 'state.json');
    const state = validState();
    const fileMetrics = [
      { path: 'src/example.ts', before_lines: 1200, after_lines: 500, responsibility: 'Runtime orchestration' },
      { path: 'src/example-storage.ts', before_lines: 0, after_lines: 720, responsibility: 'Persistence and readback' },
    ];
    Object.assign(state.work_packages[0], { file_metrics: fileMetrics });
    fs.writeFileSync(input, JSON.stringify(state));
    const result = run(['validate', '--input', input]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((parseJsonText(result.stdout) as any).file_totals, [{
      package_id: 'package-1', scope: 'multi_file_total', file_count: 2,
      before_lines: 1200, after_lines: 1220, largest_after_file_lines: 720,
    }]);
    fileMetrics[1].path = fileMetrics[0].path;
    fs.writeFileSync(input, JSON.stringify(state));
    const duplicate = run(['validate', '--input', input]);
    assert.equal(duplicate.status, 1, duplicate.stderr);
    assert.ok((parseJsonText(duplicate.stdout) as any).errors.includes('duplicate package-1 file id: src/example.ts'));
    fileMetrics[1].path = 'src/example-storage.ts';
    fileMetrics[1].after_lines = -1;
    fs.writeFileSync(input, JSON.stringify(state));
    assert.equal(run(['validate', '--input', input]).status, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
