import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildSubstrateProvenanceSurface } from '../../src/modules/ledger/substrate-provenance-surface.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const HASH_ZERO = '0'.repeat(64);
const HASH_ONE_UPPER = 'A'.repeat(64);

test('substrate provenance surface keeps OpenScience-inspired refs local and non-authoritative', () => {
  const contract = parseJsonText(
    fs.readFileSync(
      new URL('../../contracts/opl-framework/substrate-provenance-surface-contract.json', import.meta.url),
      'utf8',
    ),
  ) as {
    adopted_patterns: string[];
    authority_boundary: Record<string, boolean>;
    forbidden_imports_or_surfaces: string[];
  };
  assert.deepEqual(contract.adopted_patterns, [
    'project_local_artifact_graph_refs',
    'project_local_ledger_pointer_hash',
    'claim_warning_descriptor',
    'annotation_to_source_regeneration_receipt_descriptor',
    'native_viewer_watch_only_descriptor',
  ]);
  assert.equal(contract.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(contract.forbidden_imports_or_surfaces.includes('OpenScience Electron app'), true);
  assert.equal(contract.forbidden_imports_or_surfaces.includes('new dependency'), true);

  const surface = buildSubstrateProvenanceSurface({
    project_id: 'medautoscience',
    artifact_graph_refs: [
      {
        role: 'publication_eval_graph',
        ref: 'workspace://studies/dm003/artifact-graph.json',
        graph_ref: 'opl://artifact-graph/dm003/publication-eval',
        hash: HASH_ONE_UPPER,
      },
    ],
    ledger_ref: 'workspace://runtime/ledger/artifact-provenance.jsonl',
    ledger_hash: HASH_ZERO,
    claim_warnings: [
      {
        claim: 'publication_ready',
        reason: 'Publication readiness belongs to MAS owner evidence, not OPL substrate provenance.',
      },
    ],
    annotation_regeneration_receipts: [
      {
        receipt_ref: 'workspace://receipts/annotation-regeneration/dm003.json',
        annotation_ref: 'workspace://annotations/publication-eval.json',
        source_ref: 'workspace://sources/dm003/latest.json',
        regenerated_artifact_ref: 'workspace://artifacts/publication-eval/latest.json',
        command_ref: 'cmd://mas regenerate-publication-eval',
      },
    ],
    native_viewer_watch_only: {
      viewer_ref: 'native-viewer://artifact-graph',
      watched_refs: [
        'workspace://studies/dm003/artifact-graph.json',
        'workspace://studies/dm003/artifact-graph.json',
      ],
      receipt_ref: 'workspace://receipts/native-viewer-watch.json',
    },
  });

  assert.equal(surface.surface_kind, 'opl_substrate_provenance_surface');
  assert.equal(surface.project_local_artifact_graph_refs[0].locality, 'project_local');
  assert.equal(surface.project_local_artifact_graph_refs[0].body_included, false);
  assert.equal(surface.project_local_artifact_graph_refs[0].hash?.value, HASH_ONE_UPPER.toLowerCase());
  assert.equal(surface.project_local_ledger_pointer.hash.value, HASH_ZERO);
  assert.equal(surface.claim_warning_descriptor.status, 'warning');
  assert.equal(surface.claim_warning_descriptor.can_authorize_claim, false);
  assert.equal(surface.annotation_to_source_regeneration_receipt_descriptor.receipt_count, 1);
  assert.equal(
    surface.annotation_to_source_regeneration_receipt_descriptor.receipts[0].artifact_body_mutated_by_opl,
    false,
  );
  assert.deepEqual(surface.native_viewer_watch_only_descriptor.watched_refs, [
    'workspace://studies/dm003/artifact-graph.json',
  ]);
  assert.equal(surface.native_viewer_watch_only_descriptor.can_mutate_artifact, false);
  assert.equal(surface.authority_boundary.can_write_domain_truth, false);
  assert.equal(surface.authority_boundary.can_claim_production_ready, false);
});

test('substrate provenance surface rejects missing refs and non-sha256 ledger hashes', () => {
  assert.throws(
    () => buildSubstrateProvenanceSurface({
      project_id: 'medautoscience',
      artifact_graph_refs: [{ role: 'graph', ref: 'workspace://artifact-graph.json' }],
      ledger_ref: 'workspace://ledger.jsonl',
      ledger_hash: 'not-a-sha',
    }),
    /ledger_hash sha256 hash/,
  );

  assert.throws(
    () => buildSubstrateProvenanceSurface({
      project_id: 'medautoscience',
      artifact_graph_refs: [],
      ledger_ref: 'workspace://ledger.jsonl',
      ledger_hash: HASH_ZERO,
    }),
    /artifact_graph_refs/,
  );
});
