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

test('phase-1 exit activation package freezes completed tranches, deferred items, and the external-readiness block honestly', () => {
  const pkg = readJson('contracts/opl-gateway/phase-1-exit-activation-package.json');
  const doc = read('docs/references/opl-phase-1-exit-activation-package.md');
  const docZh = read('docs/references/opl-phase-1-exit-activation-package.zh-CN.md');

  assert.equal(pkg.phase, 'phase_1_exit');
  assert.equal(pkg.package_status, 'external_readiness_blocked');
  assert.equal(pkg.phase_1_formal_entry.entry_surface, 'TypeScript CLI-first / read-only gateway surface');
  assert.equal(pkg.phase_1_formal_entry.runtime_owner, false);
  assert.equal(pkg.phase_1_formal_entry.mutation_entry, false);
  assert.equal(pkg.phase_1_formal_entry.run_launch, false);
  assert.equal(pkg.phase_1_formal_entry.workspace_write, false);
  assert.equal(pkg.phase_1_formal_entry.shared_execution_core, false);
  assert.equal(pkg.phase_1_formal_entry.managed_web_runtime, false);

  assert.deepEqual(
    pkg.phase_1_completed_tranches.map((entry: Json) => entry.tranche_id),
    [
      'g2_release_closeout',
      'g3_thin_handoff_planning_freeze_hardening',
      'grant_ops_candidate_closeout',
      'review_ops_candidate_closeout',
      'thesis_ops_candidate_closeout',
    ],
  );
  assert.ok(pkg.phase_1_deferred_items.includes('Grant Ops domain admission'));
  assert.ok(pkg.phase_1_deferred_items.includes('Review Ops domain admission'));
  assert.ok(pkg.phase_1_deferred_items.includes('Thesis Ops domain admission'));
  assert.ok(pkg.phase_1_deferred_items.includes('G3 mutation or routed-action runtime'));
  assert.ok(pkg.phase_1_deferred_items.includes('shared execution core or managed web runtime'));

  const thresholds = Object.fromEntries(
    pkg.phase_exit_thresholds.map((entry: Json) => [entry.threshold_id, entry]),
  );
  assert.equal(thresholds.opl_public_truth_contracts_and_tests_stable.status, 'met');
  assert.equal(thresholds.candidate_domain_paths_closed_at_current_definition_layer.status, 'met');
  assert.equal(thresholds.minimal_next_stage_tranche_honestly_frozen.status, 'met');
  assert.equal(thresholds.two_admitted_domain_surfaces_stable_enough_for_stronger_federation.status, 'blocked_external');
  assert.equal(thresholds.two_admitted_domain_surfaces_stable_enough_for_stronger_federation.depends_on_external_domain_readiness, true);
  assert.equal(thresholds.no_runtime_owner_or_shared_runtime_drift.status, 'met');

  assert.equal(pkg.activation_decision.eligible_to_activate_now, false);
  assert.equal(pkg.activation_decision.decision, 'external_readiness_blocked');
  assert.match(pkg.activation_decision.blockers[0].detail, /redcube-ai/i);
  assert.match(pkg.activation_decision.blockers[0].detail, /two admitted domain surfaces/i);

  assert.equal(pkg.minimal_next_stage_tranche.tranche_id, 'minimal_admitted_domain_federation_activation_package');
  assert.ok(pkg.minimal_next_stage_tranche.scope.some((item: string) => /already admitted domains/i.test(item)));
  assert.ok(pkg.minimal_next_stage_tranche.non_goals.some((item: string) => /no routed-action runtime/i.test(item)));
  assert.ok(pkg.minimal_next_stage_tranche.non_goals.some((item: string) => /no Grant\/Review\/Thesis admission/i.test(item)));
  assert.ok(pkg.minimal_next_stage_tranche.verification_requirements.includes('npm test'));
  assert.ok(pkg.minimal_next_stage_tranche.verification_requirements.includes('NODE_NO_WARNINGS=1 node --test tests/built/cli.test.mjs'));

  for (const text of [doc, docZh]) {
    assert.match(text, /Phase 1 \/ Review Ops candidate-domain backlog and onboarding-package hardening/);
    assert.match(text, /Phase 1 \/ Thesis Ops candidate-domain backlog and onboarding-package hardening/);
    assert.match(text, /EXTERNAL_READINESS_BLOCKED_AFTER_ABSORB/);
    assert.match(text, /runtime owner/i);
    assert.match(text, /shared execution core/i);
    assert.match(text, /managed web runtime/i);
  }

  assert.match(doc, /two admitted domain surfaces are truly stable enough/i);
  assert.match(doc, /not activated now/i);
  assert.match(docZh, /至少两个 admitted domain surface 真实稳定/);
  assert.match(docZh, /当前不会被激活/);
});

test('activation package is exposed as a reference-grade supporting surface rather than a runtime surface', () => {
  const publicIndex = read('docs/opl-public-surface-index.md');
  const publicIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const contractReadme = read('contracts/opl-gateway/README.md');
  const contractReadmeZh = read('contracts/opl-gateway/README.zh-CN.md');

  assert.match(publicIndex, /OPL Phase 1 Exit Activation Package/);
  assert.match(publicIndexZh, /OPL Phase 1 Exit Activation Package/);
  assert.match(contractReadme, /phase-1-exit-activation-package\.json/);
  assert.match(contractReadmeZh, /phase-1-exit-activation-package\.json/);
  assert.match(contractReadme, /reference-grade freeze/i);
  assert.match(contractReadmeZh, /reference-grade freeze/);
});
