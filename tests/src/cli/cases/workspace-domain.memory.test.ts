import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
