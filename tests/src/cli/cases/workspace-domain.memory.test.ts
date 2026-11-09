import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, loadFamilyManifestFixtures, os, path, removeFixtureTree, repoRoot, runCli, test } from '../helpers.ts';
import { createMasScoutStage } from './family-runtime-stage-fixtures.ts';
import {
  buildAdmittedActionCatalog,
  createAdmittedStagePackFixture,
} from './workspace-domain-test-helper.ts';

type JsonRecord = Record<string, unknown>;

function withDomainMemoryDescriptor(payload: JsonRecord, overrides: JsonRecord = {}) {
  const domain = String(overrides.target_domain_id ?? 'med-autoscience');
  const owner = String(overrides.owner ?? 'MedAutoScience');
  const descriptor = {
    surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2',
    owner: 'one-person-lab', domain_id: domain, items: [{
      surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v2',
      knowledge_id: overrides.memory_ref_id ?? 'mas_publication_route_memory',
      title: 'Strategy context', scope: { kind: 'product', id: owner }, content_kind: 'mechanism', owner,
      body_ref: { kind: 'repo_path', ref: 'agent/knowledge/method.md' },
      applicability: { domains: [domain], stages: ['scout', 'review_and_rebuttal'] },
      status: 'active', reviewed_at: '2026-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
      authority_boundary: overrides.authority_boundary ?? {
        semantic_body_owner: owner, opl_role: 'catalog_recall_and_receipt_projection_only',
      },
    }],
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return { ...payload, product_entry_manifest: { ...(payload.product_entry_manifest as JsonRecord), domain_memory_descriptor: descriptor } };
  }
  return { ...payload, domain_memory_descriptor: descriptor };
}

function bindKnowledgeFixture(repoDir: string, payload: JsonRecord) {
  const manifest = (payload.product_entry_manifest ?? payload) as JsonRecord;
  fs.writeFileSync(path.join(repoDir, 'contracts/durable_knowledge_catalog.json'),
    JSON.stringify(manifest.domain_memory_descriptor));
}

test('domain memory descriptors are indexed without granting OPL memory or verdict authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-domain-memory-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = withDomainMemoryDescriptor(fixtures.medautoscience);
  const magManifest = withDomainMemoryDescriptor(fixtures.medautogrant, {
    memory_ref_id: 'mag_grant_strategy_memory', target_domain_id: 'med-autogrant', owner: 'MedAutoGrant',
  });
  const masPack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'MedAutoScience',
  );
  bindKnowledgeFixture(masPack.repoDir, masManifest);

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
    assert.equal(listedMas.catalog_ref, 'contracts/durable_knowledge_catalog.json');
    assert.equal(listedMas.items[0].knowledge_id, 'mas_publication_route_memory');
    assert.equal(listedMas.receipt_projection.authority_flags.can_accept_memory_write, false);
    assert.equal(listedMas.runtime_receipt_evidence.summary.closeout_count, 0);
    const inspect = runCli(['domain-memory', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_domain_memory.descriptor_status, 'resolved');
    assert.equal(inspect.family_domain_memory.descriptor.surface_kind, 'opl_durable_knowledge_catalog');
    assert.equal(inspect.family_domain_memory.non_authority_flags.opl_accepts_or_rejects_memory_writeback, false);
    assert.equal('migration_plan' in inspect.family_domain_memory, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('domain memory read model projects runtime receipt refs without applying memory writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-domain-memory-runtime-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const scholarSkillsRoot = path.join(stateRoot, 'scholar-skills-source');
  for (const skillId of [
    'medical-research-lit',
    'medical-statistical-review',
    'medical-methodology-planner',
    'medical-evidence-integrity-reviewer',
    'medical-evidence-synthesis-and-claim-map',
    'medical-reference-integrity-auditor',
  ]) {
    const skillRoot = path.join(scholarSkillsRoot, 'skills', skillId);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${skillId}\n`);
  }
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: fixtureRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarSkillsRoot,
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
  bindKnowledgeFixture(masPack.repoDir, masManifest);
  bindKnowledgeFixture(magPack.repoDir, magManifest);

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
      JSON.stringify({
        workspace_root: magPack.repoDir,
        runtime_root: path.join(magPack.repoDir, 'runtime'),
      }),
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

test('domain memory catalog rejects the retired authority shape', () => {
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
    assert.ok(mas.error.message);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
