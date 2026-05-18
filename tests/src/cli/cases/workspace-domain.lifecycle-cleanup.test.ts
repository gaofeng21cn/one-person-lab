import {
  buildFamilyAgentsList,
  runFamilyAgentLegacyCleanupApply,
} from '../../../../src/family-domain-agent-skeleton.ts';
import type { DomainManifestCatalogEntry } from '../../../../src/domain-manifest/types.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';
import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

const magDomain = {
  domain_id: 'medautogrant',
  label: 'MedAutoGrant',
  project: 'med-autogrant',
  product_layer: 'foundry_agent',
  foundry_agent_package: {
    package_kind: 'opl_compatible_package',
    built_on: 'opl_framework',
    app_surface: 'one_person_lab_app',
    direct_skill_entry: true,
    embeds_opl_runtime: false,
  },
  independent_domain_agent: {
    agent_id: 'mag',
    status: 'active',
    authority_scope: 'grant_authoring_domain_agent',
    opl_top_level_domain_agent: true,
  },
  single_app_skill: {
    skill_id: 'mag',
    plugin_name: 'Med Auto Grant',
    activation_kind: 'explicit_app_skill',
    entry_command: 'medautogrant product status',
    manifest_command: 'medautogrant product manifest',
  },
  domain_truth_owner: [
    'grant_run_truth',
    'grant_workspace_state',
    'grant_submission_artifacts',
  ],
  opl_projection_role: [
    'consume_session_projections',
    'consume_progress_projections',
    'consume_artifact_projections',
  ],
  runtime_dependency_boundary: {
    domain_runtime_owner: 'med-autogrant',
    opl_dependency: 'projection_consumer_only',
    opl_truth_write_policy: 'no_domain_truth_writes',
    backend_companions: [],
  },
  standalone_allowed: true,
  owned_workstreams: ['grant_ops'],
  non_opl_families: [],
} satisfies FrameworkContracts['domains']['domains'][number];

const contracts: FrameworkContracts = {
  contractsDir: '/tmp/opl-lifecycle-cleanup-contracts',
  contractsRootSource: 'cli_flag',
  workstreams: {
    version: 'g2',
    workstreams: [],
  },
  domains: {
    version: 'g2',
    domains: [magDomain],
  },
  stageSelectionVocabulary: {
    version: 'g2',
    intent_id: [],
    workstream_id: [],
    domain_id: ['medautogrant'],
    request_kind: [],
    target_kind: [],
    delivery_kind: [],
    review_kind: [],
    entry_mode: [],
    selection_rules: [],
    special_cases: [],
  },
  taskTopology: {
    version: 'g2',
    scope: 'fixture',
    description: 'fixture',
    non_goals: [],
    topology_rules: [],
    shared_foundation_reuse: [],
    workstreams: [],
  },
  publicSurfaceIndex: {
    version: 'g2',
    scope: 'fixture',
    description: 'fixture',
    non_goals: [],
    ownership_rules: [],
    surface_categories: [],
    surfaces: [],
  },
};

function manifestWithCleanupResidue() {
  return {
    target_domain_id: 'med-autogrant',
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: 'mag',
      repo_source_boundary: {
        required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
        forbidden_dirs: ['artifacts'],
      },
      artifact_boundary: {
        repo_contains_real_artifacts: false,
        artifact_roots_are_locators: true,
        workspace_artifact_locator_refs: ['workspace:/artifacts'],
        runtime_artifact_locator_refs: ['runtime:/receipts'],
      },
      artifact_locator_contract: {
        surface_kind: 'artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root',
      },
      authority_boundary: {
        opl: 'framework_transport_and_projection_only',
        domain: 'truth_quality_artifact_owner',
      },
    },
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
      direct_skill_parity_refs: ['proof:mag:direct-skill-parity'],
      opl_hosted_parity_refs: ['proof:mag:opl-hosted-parity'],
      replacement_parity_refs: ['proof:mag:replacement-parity'],
      provenance_refs: ['docs/history/runtime-substrate/mag-gateway-tombstone.md'],
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
          domain_owner_handoff_receipt_refs: ['mag://receipt/gateway-retired'],
        },
      ],
    },
    legacy_retirement_tombstone_proof: {
      status: 'no_active_default_caller_proven',
      active_default_callers: [],
      tombstone_refs: ['docs/history/specs/hermes-tombstone.md'],
      source_refs: ['docs/decisions.md#temporal-runtime'],
    },
  } as JsonRecord;
}

function manifestWithBlockedCleanupResidue() {
  const manifest = manifestWithCleanupResidue();
  const followThrough = manifest.physical_skeleton_follow_through as JsonRecord;
  delete followThrough.replacement_parity_refs;
  delete followThrough.direct_skill_parity_refs;
  delete followThrough.opl_hosted_parity_refs;
  return manifest;
}

test('legacy cleanup gate emits executable OPL lifecycle apply plan without domain repo delete authority', () => {
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
    },
    projects: [
      {
        project_id: 'medautogrant',
        project: 'med-autogrant',
        binding_id: 'fixture-mag',
        workspace_path: '/tmp/mag',
        manifest_command: 'fixture',
        status: 'resolved',
        manifest: manifestWithCleanupResidue() as unknown as DomainManifestCatalogEntry['manifest'],
        error: null,
      },
    ],
    notes: [],
  };

  const list = buildFamilyAgentsList(contracts, { domainManifests });
  const mag = list.family_agents.agents[0];
  const plan = mag.physical_skeleton_follow_through_gate.executable_cleanup_plan;

  assert.equal(plan.surface_kind, 'opl_legacy_cleanup_executable_plan');
  assert.equal(plan.plan_status, 'ready');
  assert.equal(plan.mode, 'controlled_opl_lifecycle_apply_plan');
  assert.deepEqual(
    plan.actions.map((action: { action_kind: string }) => action.action_kind),
    [
      'mark_opl_legacy_entry_tombstoned',
      'record_domain_owner_handoff_receipt',
    ],
  );
  assert.equal(
    plan.actions.every((action: { domain_repo_delete_requires_owner_receipt: boolean }) =>
      action.domain_repo_delete_requires_owner_receipt === true
    ),
    true,
  );
  assert.equal(plan.authority_boundary.opl_can_move_or_delete_domain_repo_files, false);
  assert.equal(plan.authority_boundary.opl_can_write_cleanup_ledger_receipts, true);
  assert.deepEqual(plan.actions[0].no_active_caller_refs, [
    'docs/decisions.md#temporal-runtime',
    'agent/README.md',
    'contracts/README.md',
    'runtime/README.md',
    'docs/status.md',
    'docs/history/specs/hermes-tombstone.md',
  ]);
  assert.deepEqual(plan.actions[0].replacement_parity_refs, [
    'proof:mag:replacement-parity',
    'proof:mag:direct-skill-parity',
    'proof:mag:opl-hosted-parity',
  ]);
  assert.deepEqual(plan.actions[1].domain_owner_handoff_receipt_refs, [
    'mag://receipt/gateway-retired',
  ]);
});

test('agents legacy-cleanup apply records controlled cleanup receipts from the skeleton gate', () => {
  const previous = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-legacy-cleanup-'));
  process.env.OPL_STATE_DIR = stateRoot;
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
    },
    projects: [
      {
        project_id: 'medautogrant',
        project: 'med-autogrant',
        binding_id: 'fixture-mag',
        workspace_path: '/tmp/mag',
        manifest_command: 'fixture',
        status: 'resolved',
        manifest: manifestWithCleanupResidue() as unknown as DomainManifestCatalogEntry['manifest'],
        error: null,
      },
    ],
    notes: [],
  };
  try {
    const apply = runFamilyAgentLegacyCleanupApply(contracts, [
      '--domain',
      'mag',
      '--mode',
      'apply',
      '--source-ref',
      'mag://legacy-cleanup/physical-gate',
    ], { domainManifests });

    const lifecycleApply = apply.family_agent_legacy_cleanup_apply.lifecycle_apply as JsonRecord;
    const lifecycleApplySummary = lifecycleApply.summary as JsonRecord;
    assert.equal(apply.family_agent_legacy_cleanup_apply.plan_status, 'ready');
    assert.equal(lifecycleApply.status, 'applied');
    assert.equal(lifecycleApplySummary.safe_action_count, 2);
    assert.equal(
      lifecycleApplySummary.domain_owner_handoff_receipt_ref_count,
      1,
    );
    assert.equal(
      apply.family_agent_legacy_cleanup_apply.authority_boundary.opl_can_move_or_delete_domain_repo_files,
      false,
    );
    const applyReceiptRef = lifecycleApply.receipt_ref;
    if (typeof applyReceiptRef !== 'string') {
      throw new Error('Expected lifecycle apply to return a batch receipt ref.');
    }

    const verified = runFamilyAgentLegacyCleanupApply(contracts, [
      '--domain',
      'mag',
      '--mode',
      'verify',
      '--receipt-ref',
      applyReceiptRef,
    ], { domainManifests });

    const verifiedLifecycleApply = verified.family_agent_legacy_cleanup_apply.lifecycle_apply as JsonRecord;
    const verifiedSummary = verifiedLifecycleApply.summary as JsonRecord;
    assert.equal(verifiedLifecycleApply.status, 'verified');
    assert.equal(
      verifiedSummary.verified_receipt_count,
      1,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previous;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents legacy-cleanup apply blocks a non-ready skeleton cleanup plan', () => {
  const previous = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-legacy-cleanup-blocked-'));
  process.env.OPL_STATE_DIR = stateRoot;
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
    },
    projects: [
      {
        project_id: 'medautogrant',
        project: 'med-autogrant',
        binding_id: 'fixture-mag',
        workspace_path: '/tmp/mag',
        manifest_command: 'fixture',
        status: 'resolved',
        manifest: manifestWithBlockedCleanupResidue() as unknown as DomainManifestCatalogEntry['manifest'],
        error: null,
      },
    ],
    notes: [],
  };
  try {
    const apply = runFamilyAgentLegacyCleanupApply(contracts, [
      '--domain',
      'mag',
      '--mode',
      'apply',
      '--source-ref',
      'mag://legacy-cleanup/physical-gate',
    ], { domainManifests });

    const lifecycleApply = apply.family_agent_legacy_cleanup_apply.lifecycle_apply as JsonRecord;
    const lifecycleApplySummary = lifecycleApply.summary as JsonRecord;
    const blocker = lifecycleApply.blocker as JsonRecord;
    assert.equal(apply.family_agent_legacy_cleanup_apply.plan_status, 'blocked');
    assert.equal(lifecycleApply.status, 'blocked');
    assert.equal(lifecycleApply.writes_performed, false);
    assert.equal(
      blocker.blocker_id,
      'legacy_cleanup_plan_not_ready_for_apply',
    );
    assert.deepEqual(
      lifecycleApplySummary.blocked_reasons,
      ['missing_replacement_parity_evidence'],
    );
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previous;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents legacy-cleanup apply is wired through the public command dispatcher', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-legacy-cleanup-cli-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautogrant',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(manifestWithBlockedCleanupResidue()),
  ], env);
  const dispatched = runCli([
    'agents',
    'legacy-cleanup',
    'apply',
    '--domain',
    'mag',
    '--mode',
    'apply',
    '--source-ref',
    'mag://legacy-cleanup/public-dispatch',
  ], env);

  assert.equal(dispatched.family_agent_legacy_cleanup_apply.plan_status, 'blocked');
  assert.equal(dispatched.family_agent_legacy_cleanup_apply.lifecycle_apply.status, 'blocked');
  assert.equal(dispatched.family_agent_legacy_cleanup_apply.lifecycle_apply.writes_performed, false);
  fs.rmSync(stateRoot, { recursive: true, force: true });
});
