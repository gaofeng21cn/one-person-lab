import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  loadFamilyManifestFixtures,
  runCli,
} from './cli/helpers.ts';
import { createFamilyDefaultContractWorkspace } from './cli/cases/domain-pack-compiler-fixtures.ts';
import {
  buildWorkspaceArtifactLocatorProjection,
  buildWorkspaceReceiptInventory,
} from '../../src/modules/runway/generic-substrate-projection.ts';

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

function withGeneratedStageControlPlaneRef(payload: JsonRecord, label: string) {
  const ref = {
    ref_kind: 'generated_surface',
    ref: 'opl-generated:family_stage_control_plane',
    source_ref: 'agent/stages/manifest.json',
    label,
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    const { family_stage_control_plane: _retiredInlinePlane, ...manifest } =
      payload.product_entry_manifest as JsonRecord;
    return {
      ...payload,
      product_entry_manifest: { ...manifest, family_stage_control_plane_ref: ref },
    };
  }
  const { family_stage_control_plane: _retiredInlinePlane, ...manifest } = payload;
  return { ...manifest, family_stage_control_plane_ref: ref };
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

function createDomainHandlerExportFixture(payload: JsonRecord) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-substrate-domain-handler-'));
  const exportPath = path.join(fixtureRoot, 'mas-domain-handler-export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify(payload))});
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath };
}

function masSubstrateDomainHandlerPayload() {
  return {
    surface_kind: 'mas_family_domain_handler_export',
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

function genericSubstrateDomainHandlerPayload(input: {
  surfaceKind: string;
  version: string;
  workspaceRoot: string;
  sourceRole: string;
  sourceRef: string;
  artifactRole: string;
  artifactRef: string;
  memoryRole: string;
  memoryRef: string;
  domainOwns: string[];
}) {
  return {
    opl_substrate_adapter: {
      surface_kind: input.surfaceKind,
      version: input.version,
      mode: 'opaque_index_only_refs',
      workspace_refs: [
        {
          role: 'workspace_root',
          ref_kind: 'workspace_path',
          ref: input.workspaceRoot,
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
        },
      ],
      source_refs: [
        {
          role: input.sourceRole,
          ref_kind: 'workspace_relative_path',
          ref: input.sourceRef,
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
        },
      ],
      artifact_refs: [
        {
          role: input.artifactRole,
          ref_kind: 'workspace_relative_path',
          ref: input.artifactRef,
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
        },
      ],
      memory_refs: [
        {
          role: input.memoryRole,
          ref_kind: 'workspace_relative_path',
          ref: input.memoryRef,
          exists: true,
          body_included: false,
          write_permitted: false,
          opaque_to_opl: true,
          index_only: true,
        },
      ],
      projection_policy: {
        body_included: false,
        opl_may_index: true,
        opl_may_write_domain_truth: false,
        opl_may_write_memory_body: false,
      },
      authority_boundary: {
        domain_owns: input.domainOwns,
        opl_owns: ['locator', 'index', 'lifecycle', 'projection'],
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_mutate_artifact_body: false,
      },
    },
  };
}

test('generic substrate projection indexes MAS-like workspace, source, artifact, and memory refs without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const masManifest = withGeneratedStageControlPlaneRef(
    withMasLikeMemoryDescriptor(fixtures.medautoscience),
    'MAS generated stage plane',
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      path.join(workspaceRoot, 'med-autoscience'),
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

test('generic substrate locators scan receipt and artifact refs without returning bodies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-locators-'));
  const receiptRoot = path.join(root, 'receipts');
  const artifactRoot = path.join(root, 'artifacts');
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(path.join(receiptRoot, 'owner-receipt.json'), JSON.stringify({
    surface_kind: 'domain_owner_receipt',
    receipt_id: 'receipt-1',
    receipt_shape: 'domain_owner_receipt',
    stage_id: 'render',
    status: 'accepted',
    owner_receipt_ref: 'receipt:1',
  }));
  fs.writeFileSync(path.join(artifactRoot, 'publish-bundle.json'), JSON.stringify({
    source_html: 'output/deck.html',
    pptx_file: 'output/deck.pptx',
    final_delivery: {
      pdf_file: 'output/deck.pdf',
      presenter_notes_file: 'output/notes.md',
    },
    artifact_body: 'must not be returned as a locator',
  }));

  try {
    const receiptInventory = buildWorkspaceReceiptInventory({
      roots: [receiptRoot],
      receipt_root_locator: { ref: receiptRoot, ref_kind: 'workspace_path' },
      classifyReceipt: (_payload, context) => ({
        visual_receipt_ref: `sha256:${context.source_sha256}`,
      }),
    });
    assert.equal(receiptInventory.summary.receipt_ref_count, 1);
    assert.equal(receiptInventory.summary.owner_receipt_ref_count, 1);
    assert.equal(receiptInventory.receipts[0]?.body_included, false);

    const artifacts = buildWorkspaceArtifactLocatorProjection({
      roots: [artifactRoot],
      artifact_root_locator: { ref: artifactRoot, ref_kind: 'workspace_path' },
    });
    assert.equal(artifacts.summary.artifact_ref_count, 4);
    assert.deepEqual(
      artifacts.refs.map((entry) => entry.ref).sort(),
      ['output/deck.html', 'output/deck.pdf', 'output/deck.pptx', 'output/notes.md'],
    );
    assert.equal(artifacts.summary.artifact_body_count, 0);
    assert.equal(artifacts.authority_boundary.can_mutate_artifact, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generic substrate projection consumes MAS domain handler opaque substrate adapter refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-domain-handler-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const masManifest = withGeneratedStageControlPlaneRef(
    fixtures.medautoscience,
    'MAS generated stage plane',
  );
  const domainHandler = createDomainHandlerExportFixture(masSubstrateDomainHandlerPayload());

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      path.join(workspaceRoot, 'med-autoscience'),
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['substrate', 'projection', '--domain', 'medautoscience'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: domainHandler.exportPath,
    });
    const projection = inspect.generic_substrate_projection;

    assert.equal(projection.domain_handler_substrate_adapter.status, 'resolved');
    assert.equal(projection.domain_handler_substrate_adapter.surface_kind, 'mas_opl_generic_substrate_adapter');
    assert.equal(projection.domain_handler_substrate_adapter.mode, 'opaque_index_only_refs');
    assert.equal(projection.domain_handler_substrate_adapter.refs_indexed_count, 4);
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
    assert.equal(projection.lifecycle_projection.domain_handler_substrate_adapter_status, 'resolved');
    assert.equal(projection.non_authority_flags.opl_reads_memory_body, false);
    assert.equal(projection.non_authority_flags.opl_writes_domain_truth, false);
    assert.equal(projection.non_authority_flags.opl_authorizes_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(domainHandler.fixtureRoot, { recursive: true, force: true });
  }
});

test('generic substrate projection list reports partial substrate when memory refs are not declared', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-partial-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const masManifest = withGeneratedStageControlPlaneRef(
    fixtures.medautoscience,
    'MAS generated stage plane',
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      path.join(workspaceRoot, 'med-autoscience'),
      '--manifest-command',
      buildManifestCommand(masManifest),
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

test('generic substrate workbench groups family refs for App and operator drilldown without body authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generic-substrate-workbench-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const masManifest = withGeneratedStageControlPlaneRef(
    withMasLikeMemoryDescriptor(fixtures.medautoscience),
    'MAS generated stage plane',
  );
  const masDomainHandler = createDomainHandlerExportFixture(masSubstrateDomainHandlerPayload());
  const magDomainHandler = createDomainHandlerExportFixture(genericSubstrateDomainHandlerPayload({
    surfaceKind: 'mag_opl_generic_substrate_adapter',
    version: 'mag-opl-generic-substrate-adapter.v1',
    workspaceRoot: '/fixtures/med-autogrant/workspace',
    sourceRole: 'grant_workspace_truth',
    sourceRef: 'workspace/nsfc-demo-001/source/latest.json',
    artifactRole: 'grant_package',
    artifactRef: 'workspace/nsfc-demo-001/artifacts/package/latest.zip',
    memoryRole: 'grant_strategy_memory',
    memoryRef: 'workspace/nsfc-demo-001/memory/strategy/latest.json',
    domainOwns: ['grant_truth', 'fundability_verdict', 'package_authority', 'memory_body'],
  }));
  const rcaDomainHandler = createDomainHandlerExportFixture(genericSubstrateDomainHandlerPayload({
    surfaceKind: 'rca_opl_generic_substrate_adapter',
    version: 'rca-opl-generic-substrate-adapter.v1',
    workspaceRoot: '/fixtures/redcube/workspace',
    sourceRole: 'managed_run_truth',
    sourceRef: 'runtime-state/managed-runs/latest.json',
    artifactRole: 'visual_deliverable',
    artifactRef: 'deliverables/latest/final.pptx',
    memoryRole: 'visual_review_memory',
    memoryRef: 'runtime-state/memory/review/latest.json',
    domainOwns: ['visual_truth', 'layout_verdict', 'artifact_authority', 'memory_body'],
  }));

  try {
    [
      ['medautoscience', 'med-autoscience', masManifest],
      ['medautogrant', 'med-autogrant', withGeneratedStageControlPlaneRef(
        fixtures.medautogrant,
        'MAG generated stage plane',
      )],
      ['redcube', 'redcube-ai', fixtures.redcube],
    ].forEach(([project, repoDirectory, manifest]) => {
      runCli([
        'workspace',
        'bind',
        '--project',
        project as string,
        '--path',
        path.join(workspaceRoot, repoDirectory as string),
        '--manifest-command',
        buildManifestCommand(manifest as JsonRecord),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    });

    const output = runCli(['substrate', 'workbench'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: masDomainHandler.exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_EXPORT: magDomainHandler.exportPath,
      OPL_FAMILY_RUNTIME_REDCUBE_EXPORT: rcaDomainHandler.exportPath,
    });
    const workbench = output.generic_substrate_workbench;

    assert.equal(workbench.surface_kind, 'opl_generic_substrate_workbench');
    assert.equal(workbench.workbench_role, 'operator_and_app_drilldown_projection');
    assert.equal(workbench.summary.total_projects_count, 3);
    assert.equal(workbench.summary.resolved_manifest_count, 3);
    assert.equal(workbench.summary.domain_handler_adapter_resolved_count, 3);
    assert.equal(workbench.groups.by_domain.medautoscience.domain_handler_substrate_adapter_status, 'resolved');
    assert.equal(workbench.groups.by_domain.medautogrant.domain_handler_substrate_adapter_status, 'resolved');
    assert.equal(workbench.groups.by_domain.redcube.domain_handler_substrate_adapter_status, 'resolved');
    assert.equal(workbench.groups.by_domain.medautogrant.inspect_command, 'opl substrate projection --domain medautogrant');
    assert.equal(workbench.groups.by_domain.redcube.status_by_ref_family.artifact, 'resolved');
    assert.ok(workbench.groups.by_projection_status.substrate_refs_resolved.includes('medautoscience'));
    assert.ok(workbench.groups.by_projection_status.substrate_refs_resolved.includes('medautogrant'));
    assert.ok(workbench.groups.by_projection_status.substrate_refs_resolved.includes('redcube'));
    assert.ok(workbench.groups.by_domain_handler_status.resolved.includes('medautoscience'));
    assert.ok(workbench.groups.by_domain_handler_status.resolved.includes('medautogrant'));
    assert.ok(workbench.groups.by_domain_handler_status.resolved.includes('redcube'));
    assert.ok(workbench.groups.by_ref_family.workspace.some(
      (entry: { project_id: string; ref_id: string }) =>
        entry.project_id === 'redcube' && entry.ref_id === 'workspace_locator',
    ));
    assert.ok(workbench.groups.by_ref_family.source.some(
      (entry: { project_id: string; role: string }) =>
        entry.project_id === 'medautoscience' && entry.role === 'runtime_supervision_truth',
    ));
    assert.ok(workbench.groups.by_ref_family.artifact.some(
      (entry: { project_id: string; role: string }) =>
        entry.project_id === 'medautogrant' && entry.role === 'grant_package',
    ));
    assert.ok(workbench.groups.by_ref_family.artifact.some(
      (entry: { project_id: string; role: string }) =>
        entry.project_id === 'redcube' && entry.role === 'visual_deliverable',
    ));
    assert.ok(workbench.groups.by_ref_family.memory.some(
      (entry: { project_id: string; ref_id: string }) =>
        entry.project_id === 'medautoscience' && entry.ref_id === 'mas_publication_route_memory',
    ));
    assert.equal(workbench.non_authority_flags.opl_reads_memory_body, false);
    assert.equal(workbench.non_authority_flags.opl_writes_domain_truth, false);
    assert.equal(workbench.non_authority_flags.opl_mutates_artifact_body, false);
    assert.equal(workbench.non_authority_flags.opl_owns_artifact_authority, false);
    assert.equal(workbench.non_authority_flags.opl_authorizes_quality_verdict, false);
    assert.equal(workbench.non_authority_flags.opl_authorizes_publication_or_fundability_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masDomainHandler.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magDomainHandler.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaDomainHandler.fixtureRoot, { recursive: true, force: true });
  }
});
