import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildSourceStructureOperatorReadback } from '../../src/modules/charter/source-structure-operator-readback.ts';

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
  baselines?: Array<{
    path: string;
    limit: number;
    owner?: string;
    reason?: string;
    intended_boundary?: string;
  }>;
}) {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-structure-'));
  const contractPath = path.join(root, 'contracts', 'opl-framework', 'source-structure-budget.json');
  const contract = {
    contract_kind: 'opl_source_structure_budget.v1',
    surface_kind: 'opl_source_structure_budget',
    owner: 'one-person-lab',
    state: 'active_contract',
    default_limit: input.defaultLimit ?? 3,
    advisory_near_limit: input.defaultLimit ?? 3,
    baseline_policy: {
      mode: 'scheduled_advisory_with_explicit_strict_ratchet',
      default_developer_behavior: 'advisory_exit_zero',
      strict_entrypoints: ['npm run line-budget:strict'],
    },
    reviewed_baselines: (input.baselines ?? []).map((entry) => ({
      owner: entry.owner ?? 'test-owner',
      reason: entry.reason ?? 'fixture reviewed baseline',
      intended_boundary: entry.intended_boundary ?? 'fixture semantic boundary',
      ...entry,
    })),
  };

  const init = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  for (const [relativePath, lines] of Object.entries(input.files)) {
    writeLines(path.join(root, relativePath), lines);
  }
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  const add = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);

  return { root, contractPath };
}

test('source structure operator readback reports strict ratchet findings without claiming readiness', () => {
  const { root, contractPath } = fixture({
    files: {
      'src/new-large-entry.ts': 4,
      'src/near-limit-entry.ts': 3,
    },
    defaultLimit: 3,
  });

  try {
    const readback = buildSourceStructureOperatorReadback({
      repoRoot: root,
      contractPath,
      strict: true,
    }).source_structure_operator_readback;

    assert.equal(readback.surface_kind, 'opl_source_structure_operator_readback');
    assert.equal(
      readback.readback_role,
      'operator_source_structure_guard_not_completion_audit_not_readiness_or_quality_verdict',
    );
    assert.equal(readback.mode, 'strict_readback');
    assert.equal(readback.default_limit, 3);
    assert.equal(readback.tracked_source_file_count, 2);
    assert.equal(readback.oversized_file_count, 1);
    assert.equal(readback.near_limit_file_count, 1);
    assert.equal(readback.strict_ratchet_passed, false);
    assert.equal(readback.strict_blocking_finding_count, 1);
    assert.equal(readback.findings[0].finding_kind, 'new_oversized_file');
    assert.equal(readback.findings[0].path, 'src/new-large-entry.ts');
    assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
    assert.equal(readback.authority_boundary.can_claim_quality_verdict, false);
    assert.equal(readback.false_ready_guard.line_budget_clean_can_claim_ready, false);
    assert.equal(readback.false_ready_guard.findings_are_maintenance_signal_not_domain_blocker, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('source structure operator readback recognizes reviewed baselines and retired baseline findings', () => {
  const { root, contractPath } = fixture({
    files: {
      'src/reviewed-entry.ts': 4,
      'src/retired-entry.ts': 3,
    },
    defaultLimit: 3,
    baselines: [
      { path: 'src/reviewed-entry.ts', limit: 4 },
      { path: 'src/retired-entry.ts', limit: 4 },
    ],
  });

  try {
    const readback = buildSourceStructureOperatorReadback({
      repoRoot: root,
      contractPath,
    }).source_structure_operator_readback;

    assert.equal(readback.mode, 'advisory_readback');
    assert.equal(readback.reviewed_baseline_count, 2);
    assert.equal(readback.oversized_file_count, 1);
    assert.equal(readback.strict_ratchet_passed, false);
    assert.equal(
      readback.oversized_files.find((entry) => entry.path === 'src/reviewed-entry.ts')
        ?.reviewed_baseline_status,
      'within_reviewed_baseline',
    );
    assert.ok(
      readback.findings.some((finding) =>
        finding.finding_kind === 'retired_reviewed_baseline'
        && finding.path === 'src/retired-entry.ts'),
    );
    assert.equal(readback.advisory_passed, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
