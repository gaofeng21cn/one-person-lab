import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Json {
  return JSON.parse(read(relativePath)) as Json;
}

test('derived supporting-surface matrices and acceptance docs cover both activation packages as reference-only surfaces', () => {
  const lifecycle = readJson('contracts/opl-gateway/surface-lifecycle-map.json');
  const authority = readJson('contracts/opl-gateway/surface-authority-matrix.json');
  const review = readJson('contracts/opl-gateway/surface-review-matrix.json');
  const acceptance = readJson('contracts/opl-gateway/acceptance-matrix.json');
  const lifecycleDoc = read('docs/references/opl-surface-lifecycle-map.md');
  const lifecycleDocZh = read('docs/references/opl-surface-lifecycle-map.zh-CN.md');
  const authorityDoc = read('docs/references/opl-surface-authority-matrix.md');
  const authorityDocZh = read('docs/references/opl-surface-authority-matrix.zh-CN.md');
  const reviewDoc = read('docs/references/opl-surface-review-matrix.md');
  const reviewDocZh = read('docs/references/opl-surface-review-matrix.zh-CN.md');
  const acceptanceSpec = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceSpecZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');

  const phaseExitId = 'opl_phase_1_exit_activation_package';
  const activationId = 'opl_minimal_admitted_domain_federation_activation_package';

  for (const surfaceId of [phaseExitId, activationId]) {
    assert.ok(lifecycle.covered_surface_ids.includes(surfaceId));
    assert.ok(authority.covered_surface_ids.includes(surfaceId));
    assert.ok(review.covered_surface_ids.includes(surfaceId));
  }

  const phaseExitLifecycle = lifecycle.surfaces.find((entry: Json) => entry.surface_id === phaseExitId);
  const activationLifecycle = lifecycle.surfaces.find((entry: Json) => entry.surface_id === activationId);
  const phaseExitAuthority = authority.authority_entries.find((entry: Json) => entry.surface_id === phaseExitId);
  const activationAuthority = authority.authority_entries.find((entry: Json) => entry.surface_id === activationId);
  const phaseExitReview = review.review_entries.find((entry: Json) => entry.surface_id === phaseExitId);
  const activationReview = review.review_entries.find((entry: Json) => entry.surface_id === activationId);

  for (const entry of [
    phaseExitLifecycle,
    activationLifecycle,
    phaseExitAuthority,
    activationAuthority,
    phaseExitReview,
    activationReview,
  ]) {
    assert.ok(entry);
  }

  assert.equal(phaseExitLifecycle.truth_mode, 'none');
  assert.equal(activationLifecycle.truth_mode, 'none');
  assert.equal(phaseExitLifecycle.follow_on_route_surface, null);
  assert.equal(activationLifecycle.follow_on_route_surface, null);

  for (const entry of [phaseExitAuthority, activationAuthority]) {
    assert.equal(entry.owner_scope, 'opl');
    assert.equal(entry.route_authority, 'none');
    assert.equal(entry.execution_authority, 'none');
    assert.equal(entry.truth_authority, 'none');
    assert.equal(entry.review_authority, 'none');
    assert.equal(entry.publication_authority, 'none');
    assert.equal(entry.allowed_follow_on_surface, null);
  }

  for (const entry of [phaseExitReview, activationReview]) {
    assert.equal(entry.owner_scope, 'opl');
    assert.equal(entry.human_review_required, true);
    assert.equal(entry.publishability_stage, 'supporting_reference_aligned');
  }

  const p14 = acceptance.gates.find((entry: Json) => entry.gate_id === 'p14_surface_lifecycle_map_integrity');
  const p15 = acceptance.gates.find((entry: Json) => entry.gate_id === 'p15_surface_authority_matrix_integrity');
  const p16 = acceptance.gates.find((entry: Json) => entry.gate_id === 'p16_surface_review_matrix_integrity');
  const crossDomain = acceptance.gates.find((entry: Json) => entry.gate_id === 'cross_domain_wording_consistency');

  for (const gate of [p14, p15, p16, crossDomain]) {
    assert.ok(gate);
  }

  for (const gate of [p14, p15, p16]) {
    assert.ok(gate.required_files.includes('contracts/opl-gateway/phase-1-exit-activation-package.json'));
    assert.ok(gate.required_files.includes('contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json'));
  }

  assert.ok(crossDomain.required_files.includes('docs/references/opl-phase-1-exit-activation-package.md'));
  assert.ok(
    crossDomain.required_files.includes(
      'docs/references/opl-minimal-admitted-domain-federation-activation-package.md',
    ),
  );

  for (const doc of [lifecycleDoc, lifecycleDocZh, authorityDoc, authorityDocZh, reviewDoc, reviewDocZh]) {
    assert.match(doc, /Phase 1 Exit Activation Package|Phase 1 exit activation package|Phase 1 Exit Activation/);
    assert.match(doc, /Minimal admitted-domain federation activation package/);
  }

  for (const doc of [acceptanceSpec, acceptanceSpecZh]) {
    assert.match(doc, /opl_phase_1_exit_activation_package/);
    assert.match(doc, /opl_minimal_admitted_domain_federation_activation_package/);
  }
});
