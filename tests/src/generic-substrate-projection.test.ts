import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  loadFamilyManifestFixtures,
  repoRoot,
  runCli,
} from './cli/helpers.ts';

type JsonRecord = Record<string, unknown>;

function attachManifestSurface(payload: JsonRecord, field: string, value: unknown) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return {
    ...payload,
    [field]: value,
  };
}

function withMasLikeMemoryDescriptor(payload: JsonRecord) {
  return attachManifestSurface(payload, 'domain_memory_descriptor', {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: 'mas_publication_route_memory',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    memory_family: 'publication_route_memory',
    memory_pack_ref: {
      ref_kind: 'human_doc',
      ref: 'docs/policies/publication-route-memory.md',
      role: 'markdown_first_memory_policy',
    },
    stage_applicability: ['scout', 'write', 'review'],
    retrieval_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_knowledge_packet',
    },
    writeback_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_memory_closeout_packet',
    },
    receipt_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'memory_write_router_receipt',
    },
    writeback_receipt_locator_ref: {
      ref_kind: 'workspace_locator',
      ref: 'studies/<study_id>/artifacts/memory/writeback_receipts',
    },
    status: 'active',
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: 'MedAutoScience',
      forbidden_opl_authority: [
        'memory_store_owner',
        'domain_truth_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  });
}

function createSidecarExportFixture(payload: JsonRecord) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-substrate-sidecar-'));
  const exportPath = path.join(fixtureRoot, 'mas-sidecar-export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
${JSON.stringify(payload)}
JSON
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath };
}

function masSubstrateSidecarPayload() {
  return {
    surface_kind: 'mas_family_sidecar_export',
    opl_substrate_adapter: {
      surface_kind: 'mas_opl_generic_substrate_adapter',
      version: 'mas-opl-generic-substrate-adapter.v1',
      mode: 'opaque_index_only_refs',
      workspace_refs: [
        {
          role: 'workspace_root',
          ref_kind: 'workspace_path',
          ref: '/fixtures/mas/workspace',
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
        },
      ],
      source_refs: [
        {
          role: 'runtime_supervision_truth',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/001-risk/artifacts/runtime/runtime_supervision/latest.json',
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
          study_id: '001-risk',
        },
      ],
      artifact_refs: [
        {
          role: 'publication_eval',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/001-risk/artifacts/publication_eval/latest.json',
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
          study_id: '001-risk',
        },
      ],
      memory_refs: [
        {
          role: 'paper_soak_memory_apply_proof',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/001-risk/artifacts/stage_knowledge/paper_soak_memory_apply_proof/latest.json',
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
          study_id: '001-risk',
        },
      ],
      projection_policy: {
        body_included: false,
        opl_may_index: true,
        opl_may_write_mas_truth: false,
        opl_may_write_memory_body: false,
      },
      authority_boundary: {
        mas_owns: ['study_truth', 'memory_body', 'evidence_ledger', 'review_ledger'],
        opl_owns: ['locator', 'index', 'lifecycle', 'projection'],
        can_write_publication_eval: false,
        can_write_controller_decisions: false,
        can_write_current_package: false,
      },
    },
  };
}

test('generic substrate projection indexes MAS-like workspace, source, artifact, and memory refs without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = withMasLikeMemoryDescriptor(fixtures.medautoscience);

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['substrate', 'projection', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const projection = inspect.generic_substrate_projection;

    assert.equal(projection.surface_kind, 'opl_generic_substrate_projection_inspection');
    assert.equal(projection.projection_surface_kind, 'opl_generic_substrate_projection');
    assert.equal(projection.projection_status, 'substrate_refs_resolved');
    assert.equal(projection.workspace.workspace_root, '/fixtures/med-autoscience/workspace');
    assert.equal(projection.source_refs.status, 'resolved');
    assert.deepEqual(
      projection.source_refs.refs.map((entry: { ref_id: string }) => entry.ref_id),
      [
        'source_provenance_ref',
        'historical_fixture_ref',
        'explicit_archive_import_ref',
        'parity_oracle_ref',
      ],
    );
    assert.equal(projection.artifact_refs.status, 'resolved');
    assert.equal(projection.artifact_refs.summary.total_files_count, 5);
    assert.deepEqual(
      projection.artifact_refs.refs.map((entry: { ref_id: string }) => entry.ref_id),
      [
        'task_intake_latest',
        'runtime_watch_latest',
        'runtime_supervision_latest',
        'publication_eval_latest',
        'controller_decisions_latest',
      ],
    );
    assert.equal(projection.memory_refs.status, 'resolved');
    assert.equal(projection.memory_refs.refs[0].ref_id, 'mas_publication_route_memory');
    assert.equal(
      projection.memory_refs.refs[0].memory_pack_ref.ref,
      'docs/policies/publication-route-memory.md',
    );
    assert.equal(projection.lifecycle_projection.lifecycle_role, 'locator_index_lifecycle_projection_only');
    assert.equal(projection.lifecycle_projection.indexed_ref_count, 11);
    assert.equal(projection.lifecycle_projection.memory_body_observed, false);
    assert.deepEqual(projection.authority_boundary.opl_owns, [
      'locator_index',
      'ref_transport',
      'lifecycle_projection',
      'operator_projection',
    ]);
    assert.equal(projection.non_authority_flags.opl_reads_memory_body, false);
    assert.equal(projection.non_authority_flags.opl_writes_memory_body, false);
    assert.equal(projection.non_authority_flags.opl_writes_domain_truth, false);
    assert.equal(projection.non_authority_flags.opl_mutates_artifact_body, false);
    assert.equal(projection.non_authority_flags.opl_owns_artifact_authority, false);
    assert.equal(projection.non_authority_flags.opl_authorizes_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('generic substrate projection consumes MAS sidecar opaque substrate adapter refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-sidecar-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const sidecar = createSidecarExportFixture(masSubstrateSidecarPayload());

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['substrate', 'projection', '--domain', 'medautoscience'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: sidecar.exportPath,
    });
    const projection = inspect.generic_substrate_projection;

    assert.equal(projection.sidecar_substrate_adapter.status, 'resolved');
    assert.equal(projection.sidecar_substrate_adapter.surface_kind, 'mas_opl_generic_substrate_adapter');
    assert.equal(projection.sidecar_substrate_adapter.mode, 'opaque_index_only_refs');
    assert.equal(projection.sidecar_substrate_adapter.refs_indexed_count, 4);
    assert.equal(projection.workspace_refs.status, 'resolved');
    assert.equal(projection.workspace_refs.refs[0].role, 'workspace_root');
    assert.equal(projection.source_refs.refs.some((entry: { role: string }) =>
      entry.role === 'runtime_supervision_truth'
    ), true);
    assert.equal(projection.artifact_refs.refs.some((entry: { role: string }) =>
      entry.role === 'publication_eval'
    ), true);
    assert.equal(projection.memory_refs.refs.some((entry: { role: string }) =>
      entry.role === 'paper_soak_memory_apply_proof'
    ), true);
    assert.equal(projection.lifecycle_projection.sidecar_substrate_adapter_status, 'resolved');
    assert.equal(projection.non_authority_flags.opl_reads_memory_body, false);
    assert.equal(projection.non_authority_flags.opl_writes_domain_truth, false);
    assert.equal(projection.non_authority_flags.opl_authorizes_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(sidecar.fixtureRoot, { recursive: true, force: true });
  }
});

test('generic substrate projection list reports partial substrate when memory refs are not declared', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-partial-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['substrate', 'projections'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.generic_substrate_projections.summary.total_projects_count, 3);
    assert.equal(list.generic_substrate_projections.summary.substrate_refs_partial_count, 1);
    const masProjection = list.generic_substrate_projections.projections.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(masProjection.memory_refs.status, 'missing');
    assert.equal(
      masProjection.non_authority_flags.opl_writes_domain_truth,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
