import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, loadFamilyManifestFixtures, os, path, removeFixtureTree, repoRoot, runCli, test } from '../helpers.ts';
import { createMasScoutStage } from './family-runtime-stage-fixtures.ts';
import {
  buildAdmittedActionCatalog,
  createAdmittedStagePackFixture,
} from './workspace-domain-test-helper.ts';

type JsonRecord = Record<string, unknown>;

function withDomainMemoryDescriptor(payload: JsonRecord, overrides: JsonRecord = {}) {
  const descriptor = {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: 'mas_publication_route_memory',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    memory_family: 'publication_route_memory',
    memory_pack_ref: {
      ref_kind: 'repo_policy_and_workspace_locator',
      ref: 'docs/policies/study-workflow/publication_route_memory_policy.md',
      role: 'memory_policy_seed',
    },
    stage_applicability: ['scout', 'idea', 'decision', 'analysis-campaign', 'review'],
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
    recall_projection_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_recall_index',
    },
    migration_plan_ref: {
      ref_kind: 'human_doc',
      ref: 'docs/policies/study-workflow/publication_route_memory_policy.md#migration-plan',
      role: 'domain_owned_migration_plan',
    },
    seed_corpus_ref: {
      ref_kind: 'workspace_locator',
      ref: 'portfolio/research_memory/publication_route_memory/seeds',
      role: 'domain_owned_seed_corpus',
    },
    writeback_receipt_locator_ref: {
      ref_kind: 'workspace_locator',
      ref: 'portfolio/research_memory/publication_route_memory/writeback_receipts',
      role: 'domain_owned_router_receipts',
    },
    provenance_refs: [
      {
        ref_kind: 'human_doc',
        ref: 'docs/policies/study-workflow/publication_route_memory_policy.md',
        role: 'policy',
      },
    ],
    freshness: {
      status: 'policy_seed',
      refresh_policy: 'domain_manifest_rebuild_required_before_stage_attempt',
    },
    migration_readiness: {
      status: 'migration_plan_ready_descriptor_only',
      memory_body_migration: 'domain_owned_workspace_apply_required',
      opl_apply_allowed: false,
    },
    receipt_projection: {
      status: 'descriptor_receipt_projection_ready',
      scope: 'locator_proposal_router_receipt_projection_only',
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
    ...overrides,
  };

  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        domain_memory_descriptor: descriptor,
      },
    };
  }
  return {
    ...payload,
    domain_memory_descriptor: descriptor,
  };
}

test('domain memory descriptors are indexed without granting OPL memory or verdict authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-domain-memory-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = withDomainMemoryDescriptor(fixtures.medautoscience);
  const magManifest = withDomainMemoryDescriptor(fixtures.medautogrant, {
    memory_ref_id: 'mag_grant_strategy_memory',
    target_domain_id: 'med-autogrant',
    owner: 'MedAutoGrant',
    memory_family: 'grant_strategy_memory',
    memory_pack_ref: {
      ref_kind: 'human_doc',
      ref: 'docs/references/grant_strategy_memory_policy.md',
      role: 'memory_policy',
    },
    stage_applicability: ['critique', 'revision', 'package'],
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: 'MedAutoGrant',
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
  const masPack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'MedAutoScience',
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(magManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['domain-memory', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_domain_memory.summary.resolved_memory_descriptor_count, 2);
    assert.equal(list.family_domain_memory.summary.missing_memory_descriptor_count, 1);
    const listedMas = list.family_domain_memory.memories.find((entry: { project_id: string }) => (
      entry.project_id === 'medautoscience'
    ));
    assert.equal(
      listedMas.writeback_receipt_locator_ref.ref,
      'portfolio/research_memory/publication_route_memory/writeback_receipts',
    );
    assert.equal(listedMas.writeback_contract_ref.ref, 'stage_memory_closeout_packet');
    assert.equal(listedMas.receipt_contract_ref.ref, 'memory_write_router_receipt');
    assert.equal(listedMas.receipt_projection.accepted_rejected_authority_owner, 'MedAutoScience');
    assert.equal(listedMas.receipt_projection.authority_flags.can_accept_memory_write, false);
    assert.equal(listedMas.receipt_projection.readiness.writeback_apply_landed, false);
    assert.equal(listedMas.runtime_receipt_evidence.summary.closeout_count, 0);

    const inspect = runCli(['domain-memory', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_domain_memory.descriptor_status, 'resolved');
    assert.equal(inspect.family_domain_memory.descriptor.memory_family, 'publication_route_memory');
    assert.equal(
      inspect.family_domain_memory.migration_plan.migration_plan_ref.ref,
      'docs/policies/study-workflow/publication_route_memory_policy.md#migration-plan',
    );
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_applies_memory_migration, false);
    assert.equal(inspect.family_domain_memory.authority_boundary.domain_memory_owner, 'MedAutoScience');
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_owns_memory_content, false);
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_accepts_memory_writeback, false);
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_accepts_or_rejects_memory_writeback, false);
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_applies_memory_writeback, false);
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_authorizes_quality_verdict, false);
    assert.equal(
      inspect.family_domain_memory.receipt_projection.proposal_contract_ref.ref,
      'stage_memory_closeout_packet',
    );
    assert.equal(
      inspect.family_domain_memory.receipt_projection.router_receipt_contract_ref.ref,
      'memory_write_router_receipt',
    );
    assert.equal(
      inspect.family_domain_memory.receipt_projection.writeback_receipt_locator_ref.ref,
      'portfolio/research_memory/publication_route_memory/writeback_receipts',
    );
    assert.equal(
      inspect.family_domain_memory.receipt_projection.readiness.memory_body_migration_landed,
      false,
    );

    const migrationPlan = runCli(['domain-memory', 'migration-plan', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.surface_kind,
      'opl_family_domain_memory_migration_plan_projection',
    );
    assert.equal(migrationPlan.family_domain_memory_migration_plan.memory_ref_id, 'mas_publication_route_memory');
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.seed_corpus_ref.ref,
      'portfolio/research_memory/publication_route_memory/seeds',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.writeback_receipt_locator_ref.ref,
      'portfolio/research_memory/publication_route_memory/writeback_receipts',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.migration_readiness.status,
      'migration_plan_ready_descriptor_only',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.non_authority_flags.opl_accepts_memory_writeback,
      false,
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.non_authority_flags.opl_accepts_or_rejects_memory_writeback,
      false,
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.writeback_contract_ref.ref,
      'stage_memory_closeout_packet',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.receipt_contract_ref.ref,
      'memory_write_router_receipt',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.receipt_projection.accepted_rejected_authority_owner,
      'MedAutoScience',
    );
    assert.equal(
      migrationPlan.family_domain_memory_migration_plan.receipt_projection.authority_flags.can_write_domain_truth,
      false,
    );
    assert.equal(migrationPlan.family_domain_memory_migration_plan.runtime_receipt_evidence.summary.closeout_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('domain memory read model projects runtime receipt refs without applying memory writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-domain-memory-runtime-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: fixtureRoot,
    OPL_STATE_DIR: stateRoot,
  };
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = withDomainMemoryDescriptor(fixtures.medautoscience);
  const magManifest = withDomainMemoryDescriptor(fixtures.medautogrant, {
    memory_ref_id: 'mag_grant_strategy_memory',
    target_domain_id: 'med-autogrant',
    owner: 'MedAutoGrant',
    memory_family: 'grant_strategy_memory',
  });
  const magActionCatalog = buildAdmittedActionCatalog('med-autogrant', 'MedAutoGrant');
  magActionCatalog.actions = [
    {
      ...magActionCatalog.actions[0],
      stage_route: {
        entry_stage_ref: 'review_and_rebuttal',
        required_stage_refs: ['review_and_rebuttal'],
        optional_stage_refs: [],
        terminal_stage_refs: ['review_and_rebuttal'],
        route_policy: 'ai_selected_progress_route',
      },
    },
  ];
  ((magManifest as JsonRecord).product_entry_manifest as JsonRecord).family_action_catalog = magActionCatalog;
  const magReviewStage = createMasScoutStage({
    stage_id: 'review_and_rebuttal',
    allowed_action_refs: [magActionCatalog.actions[0].action_id],
  });
  ((magManifest as JsonRecord).product_entry_manifest as JsonRecord).family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autogrant_stage_control_plane',
    target_domain_id: 'med-autogrant',
    owner: 'MedAutoGrant',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [magReviewStage],
    notes: [],
  };
  const masPack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'MedAutoScience',
  );
  const magPack = createAdmittedStagePackFixture(
    magManifest,
    'med-autogrant',
    'MedAutoGrant',
  );

  try {
    installRuntimePackageFixture(stateRoot, 'mag');
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], env);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      magPack.repoDir,
      '--manifest-command',
      buildManifestCommand(magPack.manifest),
    ], env);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'review_and_rebuttal',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag","runtime_root":"/tmp/mag/runtime"}',
      '--source-fingerprint',
      'sha256:mag-memory',
    ], env);
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_memory_closeout_packet","closeout_refs":["receipt:mag-review-closeout"],"consumed_refs":["evidence:critique"],"consumed_memory_refs":["mag-memory:strategy:accepted"],"writeback_receipt_refs":["mag-memory-writeback:accepted","mag-memory-writeback:rejected"],"rejected_writes":[{"target":"memory","reason":"domain_router_rejected"}],"next_owner":"med-autogrant","domain_ready_verdict":"domain_gate_pending"}',
    ], env);

    const list = runCli(['domain-memory', 'list'], env);
    const listedMag = list.family_domain_memory.memories.find((entry: { project_id: string }) => (
      entry.project_id === 'medautogrant'
    ));

    assert.equal(list.family_domain_memory.summary.runtime_receipt_evidence.closeout_count, 1);
    assert.equal(list.family_domain_memory.summary.runtime_receipt_evidence.writeback_receipt_ref_count, 2);
    assert.equal(listedMag.runtime_receipt_evidence.status, 'runtime_closeout_refs_observed');
    assert.equal(listedMag.runtime_receipt_evidence.summary.closeout_count, 1);
    assert.equal(listedMag.runtime_receipt_evidence.summary.consumed_memory_ref_count, 1);
    assert.equal(listedMag.runtime_receipt_evidence.summary.writeback_receipt_ref_count, 2);
    assert.equal(listedMag.runtime_receipt_evidence.summary.rejected_write_count, 1);
    assert.deepEqual(listedMag.runtime_receipt_evidence.consumed_memory_refs, ['mag-memory:strategy:accepted']);
    assert.deepEqual(listedMag.runtime_receipt_evidence.writeback_receipt_refs, [
      'mag-memory-writeback:accepted',
      'mag-memory-writeback:rejected',
    ]);
    assert.deepEqual(listedMag.runtime_receipt_evidence.closeout_refs, ['receipt:mag-review-closeout']);
    assert.equal(listedMag.runtime_receipt_evidence.authority_boundary.opl_writes_memory_body, false);
    assert.equal(listedMag.receipt_projection.readiness.writeback_apply_landed, false);

    const inspectedMag = runCli(['domain-memory', 'inspect', '--domain', 'mag'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspectedMag.family_domain_memory.runtime_receipt_evidence.summary.closeout_count, 1);
    assert.deepEqual(inspectedMag.family_domain_memory.runtime_receipt_evidence.writeback_receipt_refs, [
      'mag-memory-writeback:accepted',
      'mag-memory-writeback:rejected',
    ]);
    assert.equal(inspectedMag.family_domain_memory.non_authority_flags.opl_applies_memory_writeback, false);
    assert.equal(inspectedMag.family_domain_memory.receipt_projection.readiness.writeback_apply_landed, false);

    const migrationPlanMag = runCli(['domain-memory', 'migration-plan', '--domain', 'mag'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(
      migrationPlanMag.family_domain_memory_migration_plan.runtime_receipt_evidence.summary.closeout_count,
      1,
    );
    assert.deepEqual(
      migrationPlanMag.family_domain_memory_migration_plan.runtime_receipt_evidence.writeback_receipt_refs,
      [
        'mag-memory-writeback:accepted',
        'mag-memory-writeback:rejected',
      ],
    );
    assert.equal(
      migrationPlanMag.family_domain_memory_migration_plan.runtime_receipt_evidence.authority_boundary
        .opl_applies_memory_writeback,
      false,
    );

    const inspectedMas = runCli(['domain-memory', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspectedMas.family_domain_memory.runtime_receipt_evidence.summary.closeout_count, 0);
  } finally {
    removeFixtureTree(stateRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
    fs.rmSync(magPack.repoDir, { recursive: true, force: true });
  }
});

test('domain memory descriptor fails closed when OPL is declared as memory-store owner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-domain-memory-invalid-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const invalidManifest = withDomainMemoryDescriptor(fixtures.medautoscience, {
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: 'OPL',
      forbidden_opl_authority: [
        'domain_truth_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(invalidManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['domain-memory', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mas = list.family_domain_memory.memories.find((entry: { project_id: string }) => (
      entry.project_id === 'medautoscience'
    ));
    assert.equal(mas.manifest_status, 'invalid_manifest');
    assert.match(mas.error.message, /domain_memory_owner/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
