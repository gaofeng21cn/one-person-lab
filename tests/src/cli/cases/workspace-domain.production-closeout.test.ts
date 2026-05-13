import { spawnSync } from 'node:child_process';

import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function buildStageControlPlane(targetDomainId: string, stageId: string, options: {
  owner: string;
  title: string;
  stageKind: string;
  domainStageRefs: string[];
}) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner: options.owner,
    authority_boundary: {
      domain_truth_owner: options.owner,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    stages: [
      {
        stage_id: stageId,
        stage_kind: options.stageKind,
        title: options.title,
        summary: `${options.title} is projected as a descriptor-only family stage.`,
        goal: `Expose ${options.title} as a family-level stage descriptor without changing domain route truth.`,
        owner: options.owner,
        domain_stage_refs: options.domainStageRefs,
        inputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/progress_projection',
            role: 'read_model',
          },
        ],
        knowledge_refs: [
          {
            ref_kind: 'domain_memory_ref',
            ref: `${targetDomainId}.domain_memory`,
            role: 'domain_owned_memory_locator',
          },
        ],
        skills: [
          {
            ref_kind: 'skill_id',
            ref: options.owner,
          },
        ],
        prompt_refs: [
          {
            ref_kind: 'repo_path',
            ref: 'prompts/stage.md',
          },
        ],
        outputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/session_continuity',
            role: 'handoff',
          },
        ],
        evaluation: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/product_entry_readiness',
            role: 'descriptor_parity',
          },
        ],
        handoff: {
          next_owner: options.owner,
          resume_surface_ref: '/product_entry_manifest/session_continuity',
        },
        authority_boundary: {
          domain_truth_owner: options.owner,
          opl_role: 'projection_consumer_only',
          no_quality_verdict: true,
        },
      },
    ],
  };
}

function withStandardSkeleton(payload: JsonRecord, overrides: JsonRecord = {}) {
  const defaultPhysicalSkeletonFollowThrough = {
    surface_kind: 'physical_skeleton_follow_through',
    status: 'low_risk_repo_source_follow_through_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    physical_roots: [
      { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'contracts', anchor_ref: 'contracts/README.md', status: 'present_with_runtime_program_contracts' },
      { boundary_id: 'runtime', anchor_ref: 'runtime/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
    ],
    forbidden_moves: [
      'workspace_runtime_artifacts',
      'receipt_instances',
      'memory_content_body',
    ],
  };
  const physicalSkeletonFollowThrough =
    payload.physical_skeleton_follow_through && typeof payload.physical_skeleton_follow_through === 'object'
      ? payload.physical_skeleton_follow_through as JsonRecord
      : defaultPhysicalSkeletonFollowThrough;
  const skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.py'],
      quality_gate_refs: ['contracts/quality-gates.json'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
    ...overrides,
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        standard_domain_agent_skeleton: skeleton,
        physical_skeleton_follow_through: physicalSkeletonFollowThrough,
      },
    };
  }
  return {
    ...payload,
    standard_domain_agent_skeleton: skeleton,
    physical_skeleton_follow_through: physicalSkeletonFollowThrough,
  };
}

test('framework production-closeout reports functional blockers without taking domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-functional-closeout-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = withStandardSkeleton({
    ...(fixtures.medautoscience as JsonRecord),
    family_stage_control_plane: buildStageControlPlane(
      'med-autoscience',
      'manuscript_authoring',
      {
        owner: 'med-autoscience',
        title: 'Manuscript authoring',
        stageKind: 'creation',
        domainStageRefs: ['write'],
      },
    ),
    owner_receipt_contract: {
      surface_kind: 'domain_owner_receipt_contract',
      accepted_return_shapes: ['domain_receipt', 'typed_blocker'],
    },
    managed_temporal_state_consistency: {
      surface_kind: 'managed_temporal_state_consistency',
      projection_mode: 'read_only',
    },
    lifecycle_apply_requests: [
      {
        action_id: 'mas-opl-ledger-retention',
        action_kind: 'retention',
        owner_scope: 'opl_owned_ledger',
        authority_owner: 'opl_framework',
        target_ref: 'opl-ledger:mas',
      },
    ],
    legacy_retirement_tombstone_proof: {
      surface_kind: 'legacy_retirement_tombstone_proof',
      active_default_callers: [],
    },
  });
  const magManifest = withStandardSkeleton({
    ...(fixtures.medautogrant.product_entry_manifest as JsonRecord),
    family_stage_control_plane: buildStageControlPlane(
      'med-autogrant',
      'proposal_authoring',
      {
        owner: 'med-autogrant',
        title: 'Proposal authoring',
        stageKind: 'creation',
        domainStageRefs: ['outline'],
      },
    ),
    owner_receipt_contract: {
      surface_kind: 'domain_owner_receipt_contract',
      accepted_return_shapes: ['domain_receipt', 'typed_blocker', 'no_regression_evidence'],
    },
    lifecycle_apply_requests: [
      {
        action_id: 'mag-cleanup-artifact',
        action_kind: 'cleanup',
        owner_scope: 'domain_owned_artifact',
        authority_owner: 'med-autogrant',
        target_ref: 'grant-workspace:artifact',
        restore_ref: 'restore:mag:artifact',
      },
    ],
    physical_skeleton_follow_through: {
      surface_kind: 'mag_physical_skeleton_follow_through',
      status: 'minimum_repo_source_anchors_landed',
      source_refs: [
        'agent/README.md',
        'contracts/README.md',
        'runtime/README.md',
        'docs/status.md',
      ],
      root_status: [
        { root: 'agent', anchor_ref: 'agent/README.md', exists: true },
        { root: 'contracts', anchor_ref: 'contracts/README.md', exists: true },
        { root: 'runtime', anchor_ref: 'runtime/README.md', exists: true },
        { root: 'docs', anchor_ref: 'docs/status.md', exists: true },
      ],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: [
        {
          path_family: 'default Hermes active path',
          state: 'tombstone_only',
          evidence_ref: 'docs/history/specs/hermes-tombstone.md',
        },
        {
          path_family: 'default Gateway active path',
          state: 'physically_removed_from_active_source',
          evidence_ref: 'docs/decisions.md#temporal-runtime',
        },
      ],
    },
  }, { agent_id: 'mag' });
  const rcaManifest = withStandardSkeleton({
    ...(fixtures.redcube as JsonRecord),
    family_stage_control_plane: buildStageControlPlane(
      'redcube_ai',
      'artifact_creation',
      {
        owner: 'redcube_ai',
        title: 'Artifact creation',
        stageKind: 'creation',
        domainStageRefs: ['author_pptx_native'],
      },
    ),
    owner_receipt_contract: {
      surface_kind: 'domain_owner_receipt_contract',
      accepted_return_shapes: ['domain_receipt', 'typed_blocker', 'no_regression_evidence'],
    },
    lifecycle_apply_requests: [
      {
        action_id: 'rca-retention-artifact',
        action_kind: 'retention',
        owner_scope: 'domain_owned_artifact',
        authority_owner: 'redcube-ai',
        target_ref: 'visual-workspace:artifact',
        restore_ref: 'restore:rca:artifact',
        domain_receipt_ref: 'receipt:rca:lifecycle-retention',
      },
    ],
    legacy_retirement_tombstone_proof: {
      surface_kind: 'legacy_retirement_tombstone_proof',
      active_default_callers: [],
    },
  }, { agent_id: 'rca' });

  try {
    for (const [project, manifest] of [
      ['medautoscience', masManifest],
      ['medautogrant', magManifest],
      ['redcube', rcaManifest],
    ] as const) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    }

    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'proposal_authoring',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mag',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
          owner_receipt_refs: ['receipt:mag:owner-apply'],
        },
      }),
      '--source-fingerprint',
      'sha256:mag-owner-receipt',
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    const masAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'ai_reviewer_re_eval',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
      }),
      '--source-fingerprint',
      'sha256:mas-memory-closeout',
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      masAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_memory_closeout_packet',
        closeout_refs: ['mas-closeout:dm002:ai-reviewer'],
        consumed_refs: ['mas-evidence:dm002:review-ledger'],
        consumed_memory_refs: ['mas-memory:publication-route:negative-result-stoploss'],
        writeback_receipt_refs: ['mas-memory-writeback:dm002:accepted'],
        rejected_writes: [
          { target: 'memory_body', reason: 'domain_owner_required' },
        ],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'artifact_creation',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/rca',
        controlled_soak_no_regression_attempt: {
          surface_kind: 'controlled_soak_no_regression_attempt',
          no_regression_evidence_refs: ['rca:no-regression:visual-stage-1'],
        },
      }),
      '--source-fingerprint',
      'sha256:rca-no-regression',
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).production_functional_closeout;

    assert.equal(closeout.surface_kind, 'opl_production_functional_closeout_gate');
    assert.equal(closeout.status, 'usable_with_typed_blockers');
    assert.equal(closeout.summary.resolved_manifest_count, 3);
    assert.equal(closeout.summary.descriptor_aligned_count, 3);
    assert.equal(closeout.summary.physical_skeleton_evidence_observed_count, 3);
    assert.equal(closeout.summary.physical_skeleton_audit_pending_count, 0);
    assert.equal(closeout.summary.resolved_stage_plane_count, 3);
    assert.equal(closeout.summary.provider_ready, false);
    assert.equal(closeout.authority_boundary.opl_writes_domain_truth, false);
    assert.equal(closeout.authority_boundary.opl_writes_domain_artifact, false);
    assert.equal(closeout.authority_boundary.opl_writes_domain_memory_body, false);
    assert.equal(closeout.stage_attempt_evidence.controlled_apply_summary.domain_receipt_observed_count, 1);
    assert.equal(closeout.stage_attempt_evidence.controlled_apply_summary.no_regression_evidence_observed_count, 1);
    assert.equal(closeout.stage_attempt_evidence.lifecycle_guarded_apply_summary.domain_writes_performed, false);
    assert.equal(closeout.stage_attempt_evidence.memory_ref_summary.consumed_memory_ref_count, 1);
    assert.equal(closeout.stage_attempt_evidence.memory_ref_summary.writeback_receipt_ref_count, 1);
    assert.equal(closeout.stage_attempt_evidence.memory_ref_summary.rejected_write_count, 1);
    assert.equal(closeout.stage_attempt_evidence.memory_ref_summary.opl_writes_memory_body, false);
    const mag = closeout.domains.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const rca = closeout.domains.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    const mas = closeout.domains.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');
    assert.equal(mag.stage_attempt_evidence.owner_receipt_refs[0], 'receipt:mag:owner-apply');
    assert.equal(rca.stage_attempt_evidence.no_regression_evidence_refs[0], 'rca:no-regression:visual-stage-1');
    assert.deepEqual(mas.stage_attempt_evidence.consumed_memory_refs, [
      'mas-memory:publication-route:negative-result-stoploss',
    ]);
    assert.deepEqual(mas.stage_attempt_evidence.writeback_receipt_refs, [
      'mas-memory-writeback:dm002:accepted',
    ]);
    assert.equal(mas.stage_attempt_evidence.rejected_write_count, 1);
    assert.equal(mag.physical_skeleton_evidence.status, 'repo_source_anchor_evidence_observed');
    assert.equal(mag.legacy_retirement_tombstone_declared, true);
    assert.equal(
      mag.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'physical_repo_skeleton_reorganization'
      ).projection_status,
      'evidence_refs_observed',
    );
    assert.equal(
      mag.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'legacy_surface_physical_retirement'
      ).projection_status,
      'no_active_caller_evidence_observed',
    );
    assert.deepEqual(
      mag.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'legacy_surface_physical_retirement'
      ).evidence_refs,
      [
        'agent/README.md',
        'contracts/README.md',
        'runtime/README.md',
        'docs/status.md',
        'docs/history/specs/hermes-tombstone.md',
        'docs/decisions.md#temporal-runtime',
      ],
    );
    assert.equal(mas.managed_temporal_state_consistency_declared, true);
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'temporal_provider_not_configured'
      ),
      true,
    );
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'medautoscience:no_stage_attempt_evidence_in_opl_ledger'
      ),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework production-closeout enumerates admitted domains from contracts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-admitted-domain-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const domainsPath = path.join(fixtureContractsRoot, 'domains.json');
  const domainsPayload = JSON.parse(fs.readFileSync(domainsPath, 'utf8')) as {
    domains: Array<Record<string, unknown>>;
  };
  const template = domainsPayload.domains.find((domain) => domain.domain_id === 'redcube');
  assert.ok(template);
  domainsPayload.domains.push({
    ...template,
    domain_id: 'reviewfoundry',
    label: 'Review Foundry',
    project: 'review-foundry',
    foundry_agent_package: {
      package_kind: 'opl_compatible_package',
      built_on: 'opl_framework',
      app_surface: 'one_person_lab_app',
      direct_skill_entry: true,
      embeds_opl_runtime: false,
    },
    independent_domain_agent: {
      agent_id: 'reviewfoundry',
      status: 'active',
      authority_scope: 'review_domain_agent',
      opl_top_level_domain_agent: true,
    },
    single_app_skill: {
      skill_id: 'reviewfoundry',
      plugin_name: 'Review Foundry',
      activation_kind: 'explicit_app_skill',
      entry_command: 'reviewfoundry product status',
      manifest_command: 'reviewfoundry product manifest',
    },
    domain_truth_owner: [
      'review_run_truth',
      'review_workspace_state',
      'review_quality_judgment',
      'review_user_visible_progress',
    ],
    runtime_dependency_boundary: {
      domain_runtime_owner: 'review-foundry',
      opl_dependency: 'projection_consumer_only',
      opl_truth_write_policy: 'no_domain_truth_writes',
      backend_companions: [],
    },
    owned_workstreams: ['review_ops'],
    non_opl_families: [],
  });
  fs.writeFileSync(domainsPath, `${JSON.stringify(domainsPayload, null, 2)}\n`, 'utf8');

  try {
    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).production_functional_closeout;

    assert.equal(closeout.summary.domain_count, 4);
    assert.equal(
      closeout.stage_attempt_evidence.domain_breakdown.some((entry: { domain_id: string }) =>
        entry.domain_id === 'reviewfoundry'
      ),
      true,
    );
    assert.equal(
      closeout.domains.some((entry: { project_id: string }) =>
        entry.project_id === 'reviewfoundry'
      ),
      true,
    );
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'reviewfoundry:manifest_not_resolved'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework production-closeout projects Temporal residency proof history', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-provider-proof-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    runCli(['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--production'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).production_functional_closeout;

    assert.equal(closeout.provider_continuous_proof.surface_kind, 'opl_temporal_provider_continuous_proof_projection');
    assert.equal(closeout.provider_continuous_proof.proof_event_count, 1);
    assert.equal(typeof closeout.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(closeout.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(closeout.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(closeout.provider_continuous_proof.latest_closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(closeout.provider_continuous_proof.latest_proof_receipt.receipt_status, 'blocked');
    assert.equal(closeout.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(closeout.runtime_ledger.provider_continuous_proof.proof_event_count, 1);
    assert.equal(typeof closeout.runtime_ledger.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(
      closeout.runtime_ledger.provider_continuous_proof.continuous_proof_status,
      'proof_blocker_observed',
    );
    assert.equal(closeout.runtime_ledger.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(closeout.runtime_ledger.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(
      closeout.runtime_ledger.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'temporal_provider_continuous_proof_not_proven'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework production-closeout fails stale proven provider proof as SLO blocker', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-stale-provider-proof-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_stale',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    '2026-05-13T00:00:00.000Z'
  );
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_PROVIDER_PROOF_MAX_AGE_SECONDS: '1',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).production_functional_closeout;

    assert.equal(closeout.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(closeout.provider_continuous_proof.proof_freshness_status, 'stale');
    assert.equal(closeout.provider_continuous_proof.proof_slo_status, 'proof_stale');
    assert.equal(closeout.runtime_ledger.provider_continuous_proof.proof_slo_status, 'proof_stale');
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'temporal_provider_proof_freshness_not_current'
      ),
      true,
    );
    assert.equal(closeout.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework production-closeout times out stalled domain manifests as typed blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-timeout-state-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} -e "setTimeout(() => {}, 5000)"`,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const startedAt = Date.now();
    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_STATE_DIR: stateRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '100',
    }).production_functional_closeout;
    const elapsedMs = Date.now() - startedAt;
    const mas = closeout.domains.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(mas.manifest_status, 'command_timeout');
    assert.equal(mas.manifest_error.code, 'command_timeout');
    assert.equal(mas.manifest_error.timeout_ms, 100);
    assert.match(mas.manifest_error.manifest_command, /setTimeout/);
    assert.equal(mas.manifest_error.repair_command, 'OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=10000 opl framework production-closeout');
    assert.match(mas.manifest_error.next_action, /Increase OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS/);
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'medautoscience:manifest_not_resolved'
      ),
      true,
    );
    const timeoutBlocker = closeout.typed_blockers.find((blocker: { blocker_id: string }) =>
      blocker.blocker_id === 'medautoscience:manifest_not_resolved'
    );
    assert.equal(timeoutBlocker.blocker_kind, 'domain_manifest_timeout');
    assert.equal(timeoutBlocker.repair_command, 'OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=10000 opl framework production-closeout');
    assert.equal(timeoutBlocker.timeout_ms, 100);
    assert.match(timeoutBlocker.manifest_command, /setTimeout/);
    assert.match(timeoutBlocker.next_action, /Increase OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS/);
    assert.equal(closeout.authority_boundary.opl_writes_domain_truth, false);
    assert.equal(elapsedMs < 2000, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
