import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const smokeScript = path.join(repoRoot, 'scripts', 'fresh-install-smoke.mjs');
const matrixContractPath = path.join(repoRoot, 'contracts', 'opl-gateway', 'fresh-install-test-matrix.json');

test('fresh-install smoke runner validates local clean-room scenarios', () => {
  const result = spawnSync(process.execPath, [smokeScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      SHELL: process.env.SHELL || '/bin/bash',
      TMPDIR: process.env.TMPDIR || '/tmp',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    surface_id: string;
    status: string;
    summary: {
      total: number;
      failed: number;
    };
    cases: Array<{ scenario_id: string; status: string }>;
  };
  assert.equal(payload.surface_id, 'opl_fresh_install_smoke');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.summary.total, 5);
  assert.equal(payload.summary.failed, 0);
  assert.deepEqual(
    payload.cases.map((entry) => [entry.scenario_id, entry.status]),
    [
      ['clean_user_missing_codex', 'passed'],
      ['compatible_codex_missing_modules', 'passed'],
      ['outdated_codex', 'passed'],
      ['ready_baseline', 'passed'],
      ['offline_module_install_blocker', 'passed'],
    ],
  );
});

test('fresh-install matrix freezes GUI labels and first-run log contract', () => {
  const matrix = JSON.parse(fs.readFileSync(matrixContractPath, 'utf8')) as {
    surface_id: string;
    local_smoke_command: string;
    first_run_log: {
      default_path: string;
      event_schema_version: string;
    };
    gui_accessibility_labels: Record<string, string>;
    scenarios: Array<{ scenario_id: string }>;
    ci_policy: {
      docker: string;
    };
  };

  assert.equal(matrix.surface_id, 'opl_fresh_install_test_matrix');
  assert.equal(matrix.local_smoke_command, 'npm run test:fresh-install');
  assert.equal(matrix.first_run_log.default_path, '~/Library/Logs/One Person Lab/first-run.jsonl');
  assert.equal(matrix.first_run_log.event_schema_version, 'opl_first_run_event.v1');
  assert.equal(matrix.gui_accessibility_labels.window, 'opl-first-run-window');
  assert.equal(matrix.gui_accessibility_labels.install_button, 'opl-first-run-install-button');
  assert.equal(matrix.scenarios.some((entry) => entry.scenario_id === 'clean_vm_release_first_launch'), true);
  assert.match(matrix.ci_policy.docker, /Do not use Docker/);
});
