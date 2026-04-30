import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('family external orchestration learning board records MAS source and learning taxonomy', () => {
  const board = read('docs/references/family-external-orchestration-learning-board-2026-04-30.md');

  for (const required of [
    'med-autoscience/docs/program/external_agent_orchestration_learning_intake_2026_04_30.md',
    'openai/symphony@58cf97d',
    'msitarzewski/agency-agents@783f6a7',
    'orchestration',
    'research-agent',
    'evaluation',
    'runtime-safety',
    'product-ops',
  ]) {
    assert.match(board, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('family external orchestration learning board freezes decision taxonomy and stop rules', () => {
  const board = read('docs/references/family-external-orchestration-learning-board-2026-04-30.md');

  for (const decision of [
    'adopt_family_contract',
    'adopt_domain_template',
    'watch_only',
    'reject',
    'saturated',
  ]) {
    assert.match(board, new RegExp(decision));
  }
  for (const stopRule of [
    '已有 `OPL` family 等价 contract',
    'external tracker mechanics',
    'generic persona routing',
    '通用 QA label',
    '不能只留在聊天、memory 或 terminal prose',
  ]) {
    assert.match(board, new RegExp(stopRule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('family external orchestration learning board preserves OPL and domain owner boundaries', () => {
  const board = read('docs/references/family-external-orchestration-learning-board-2026-04-30.md');

  for (const boundary of [
    '`OPL` 持有 family-level shared modules',
    '`MAS`、`MAG`、`RCA` 继续持有 domain-owned truth',
    '`OPL Runtime Manager` 只做 product-managed projection',
    '不成为 scheduler、session、memory 或 domain truth owner',
    '不绕过 domain quality gate',
  ]) {
    assert.match(board, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('status points to the family external orchestration learning board', () => {
  const status = read('docs/status.md');

  assert.match(status, /Family External Orchestration Learning Board/);
  assert.match(status, /family-external-orchestration-learning-board-2026-04-30\.md/);
  assert.match(status, /adopt_family_contract/);
  assert.match(status, /adopt_domain_template/);
  assert.match(status, /saturated/);
});

