import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Json {
  return JSON.parse(read(relativePath)) as Json;
}

test('phase-2 central reference sync board freezes a multi-slice OPL follow-on owner line without widening authority', () => {
  const board = readJson('contracts/opl-gateway/phase-2-central-reference-sync-board.json');
  const intake = readJson('contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json');
  const boardDoc = read('docs/references/opl-phase-2-central-reference-sync-board.md');
  const intakeDoc = read('docs/references/opl-phase-2-admitted-domain-delta-intake-refresh.md');
  const ownerLine = read('docs/references/opl-phase2-ecosystem-sync-owner-line.md');
  const playbook = read('docs/references/omx-longrun-prompt-playbook.md');
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');

  assert.equal(board.board_id, 'opl_phase_2_central_reference_sync_board');
  assert.equal(board.status, 'prefrozen_follow_on_board');
  assert.equal(board.parent_package_id, 'opl_minimal_admitted_domain_federation_activation_package');
  assert.deepEqual(
    board.ordered_tranches.map((entry: Json) => entry.tranche_id),
    [
      'phase_2_admitted_domain_delta_intake_refresh',
      'phase_2_gateway_surface_wording_sync',
      'phase_2_omx_prompt_and_worktree_handbook_sync',
      'phase_2_reference_regression_refresh',
    ],
  );
  assert.ok(board.hard_boundaries.includes('do not promote OPL into a runtime owner'));
  assert.ok(board.terminal_states.includes('NO_NEW_ADMITTED_DOMAIN_DELTA_HONEST_STOP'));

  assert.equal(intake.package_id, 'opl_phase_2_admitted_domain_delta_intake_refresh');
  assert.equal(intake.parent_board_id, board.board_id);
  assert.equal(intake.status, 'truth_frozen_pending_implementation');
  assert.equal(intake.current_known_delta_families[0].latest_absorbed_commit, '762ea4c');
  assert.equal(intake.current_known_delta_families[1].latest_absorbed_commit, '6c64264');
  assert.equal(intake.closeout.next_tranche_candidate, 'phase_2_gateway_surface_wording_sync');

  for (const doc of [boardDoc, intakeDoc, ownerLine, playbook]) {
    assert.match(doc, /phase_2_admitted_domain_delta_intake_refresh/);
    assert.match(doc, /762ea4c/);
    assert.match(doc, /6c64264/);
  }

  assert.match(playbook, /phase-2-central-reference-sync-board\.json/);
  assert.match(playbook, /phase-2-admitted-domain-delta-intake-refresh\.json/);
  assert.match(playbook, /按 board 中已预冻结的 tranche 顺序执行/);
  assert.match(docsIndex, /references\/opl-phase-2-central-reference-sync-board\.md/);
  assert.match(docsIndex, /references\/opl-phase-2-admitted-domain-delta-intake-refresh\.md/);
  assert.match(docsIndexZh, /references\/opl-phase-2-central-reference-sync-board\.md/);
  assert.match(docsIndexZh, /references\/opl-phase-2-admitted-domain-delta-intake-refresh\.md/);
});
