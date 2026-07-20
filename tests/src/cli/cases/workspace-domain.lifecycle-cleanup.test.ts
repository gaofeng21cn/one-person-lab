import {
  buildFamilyAgentsList,
  runFamilyAgentLegacyCleanupApply,
} from '../../../../src/modules/workspace/family-domain-agent-skeleton.ts';
import type { DomainManifestCatalogEntry } from '../../../../src/modules/atlas/domain-manifest/types.ts';
import type { FrameworkContracts } from '../../../../src/kernel/types.ts';
import {
  MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT,
  MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT,
  MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT,
  MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT,
  MINIMAL_BRAND_MODULE_SURFACES_CONTRACT,
  MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT,
  MINIMAL_CLI_COMMAND_REGISTRY_CONTRACT,
  MINIMAL_OBSERVABILITY_SEMANTIC_CONVENTIONS_CONTRACT,
  MINIMAL_PACK_BUNDLE_CONTRACT,
  MINIMAL_PACK_OS_CONTRACT,
  MINIMAL_SOURCE_MODULE_MAP_CONTRACT,
  MINIMAL_STANDARD_AGENT_PRINCIPLES_CONTRACT,
  MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT,
} from './agent-workspace-norm-fixture.ts';
import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
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
  agentWorkspaceNorm: MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT,
  brandModuleRegistry: MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT,
  brandCliGovernance: MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT,
  brandModuleSurfaces: MINIMAL_BRAND_MODULE_SURFACES_CONTRACT,
  brandModuleL5OperatingEvidence: MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT,
  brandSystemProfile: MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT,
  sourceModuleMap: MINIMAL_SOURCE_MODULE_MAP_CONTRACT,
  cliCommandRegistry: MINIMAL_CLI_COMMAND_REGISTRY_CONTRACT,
  targetOperatingArchitecture: MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT,
  observabilitySemanticConventions: MINIMAL_OBSERVABILITY_SEMANTIC_CONVENTIONS_CONTRACT,
  standardAgentPrinciples: MINIMAL_STANDARD_AGENT_PRINCIPLES_CONTRACT,
  packBundle: MINIMAL_PACK_BUNDLE_CONTRACT,
  packOs: MINIMAL_PACK_OS_CONTRACT,
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

function manifestWithMasCurrentStandardAgentEvidence() {
  return {
    target_domain_id: 'med-autoscience',
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      agent_id: 'mas',
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
      physical_skeleton_layout_audit: {
        surface_kind: 'standard_domain_agent_physical_skeleton_layout_audit',
        status: 'repo_source_physical_anchors_landed',
        slots: [
          { slot_id: 'agent/stages', repo_paths: ['agent/stages/stage_route_contract.yaml'] },
          { slot_id: 'contracts/runtime/sidecar', repo_paths: ['contracts/runtime/sidecar'] },
          { slot_id: 'runtime/artifact_locator', repo_paths: ['runtime/artifact_locator'] },
          { slot_id: 'docs', repo_paths: ['docs/status.md'] },
        ],
      },
      artifact_locator_contract: {
        surface_kind: 'artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root',
      },
    },
    functional_consumer_boundary: {
      surface_kind: 'mas_functional_consumer_boundary',
      proof_surfaces: [
        'product_entry_manifest.functional_consumer_boundary',
        'sidecar_export.functional_consumer_boundary',
      ],
      standard_agent_purity: {
        surface_kind: 'mas_standard_opl_agent_purity',
        status: 'standard_agent_source_shape_landed',
        default_runtime_owner: 'one-person-lab',
        generated_surface_owner: 'one-person-lab',
        domain_owner: 'med-autoscience',
        active_private_generic_residue_count: 0,
        functional_structure_gap_count: 0,
        default_caller_count: 0,
        default_caller_readiness_status: 'opl_generated_default_caller_ready',
        source_purity_cutover_status: 'standard_agent_source_shape_landed',
        repo_local_wrapper_tail_count: 0,
        repo_local_wrapper_tail_module_ids: [],
        runtime_package_residue_count: 0,
        retired_alias_residue_refs: [],
        history_detail_in_default_read_model: false,
        domain_projection_policy: 'refs_receipts_blockers_only_no_body_verdict_or_blob',
      },
      standard_agent_purity_guard: {
        status: 'standard_agent_purity_cutover_guard',
        default_caller_count: 0,
        default_caller_readiness_status: 'opl_generated_default_caller_ready',
        source_purity_cutover_status: 'standard_agent_source_shape_landed',
        repo_local_wrapper_tail_count: 0,
        repo_local_wrapper_tail_module_ids: [],
        runtime_package_residue_count: 0,
        retired_alias_residue_refs: [],
        proof_items: [
          'standard_agent_purity.active_private_generic_residue_count=0',
          'standard_agent_purity.default_caller_count=0',
          'standard_agent_purity.retired_alias_residue_refs=[]',
          'standard_agent_purity.default_caller_readiness_status=opl_generated_default_caller_ready',
          'standard_agent_purity.source_purity_cutover_status=standard_agent_source_shape_landed',
          'standard_agent_purity.domain_projection_policy=refs_receipts_blockers_only_no_body_verdict_or_blob',
        ],
      },
      generated_surface_handoff: {
        surface_kind: 'mas_generated_surface_handoff',
        generated_surface_owner: 'one-person-lab',
      },
      generated_default_caller_boundary: {
        surface_kind: 'mas_generated_default_caller_boundary',
        status: 'opl_generated_hosted_shell_is_default_caller',
        default_caller_owner: 'one-person-lab',
        mas_handwritten_shell_default_caller_allowed: false,
        all_default_surfaces_generated: true,
        physical_delete_is_not_implied: true,
        default_caller_surfaces: [
          'cli',
          'mcp',
          'skill',
          'product_entry',
          'product_status',
          'product_session',
          'domain_action_adapter',
          'workbench',
        ],
        proof_refs: [
          'functional_consumer_boundary.generated_surface_handoff',
          'family_action_catalog',
          'family_stage_control_plane_descriptor',
        ],
        opl_default_caller_readiness_evidence: {
          surface_kind: 'mas_opl_default_caller_readiness_evidence',
          source_command: 'opl agents default-callers --agent mas=/Users/gaofeng/workspace/med-autoscience --json',
          source_surface_kind: 'opl_agent_generated_default_caller_readiness_report',
          structural_replacement_evidence_ready: true,
          replacement_parity: 'ready',
          default_surface_cutover: 'ready',
          physical_delete_authorized: false,
        },
      },
    },
    source_provenance: {
      surface_kind: 'source_provenance',
      source_provenance_ref: {
        ref: 'docs/references/med-deepscientist/source_provenance.json',
      },
      historical_fixture_ref: {
        ref: 'fixtures/med-deepscientist/parity/',
      },
      explicit_archive_import_ref: {
        command: 'uv run python -m med_autoscience.cli backend-audit --mode archive-import',
      },
      parity_oracle_ref: {
        ref: 'program:med_deepscientist_retained_capability_parity',
      },
    },
  } as JsonRecord;
}

function manifestWithMasCutoverPendingStandardAgentEvidence() {
  const manifest = manifestWithMasCurrentStandardAgentEvidence();
  const boundary = manifest.functional_consumer_boundary as JsonRecord;
  const purity = boundary.standard_agent_purity as JsonRecord;
  const guard = boundary.standard_agent_purity_guard as JsonRecord;

  purity.status = 'standard_agent_purity_cutover_pending';
  purity.default_caller_readiness_status = 'opl_generated_default_caller_ready';
  purity.source_purity_cutover_status = 'physical_wrapper_retirement_pending';
  purity.repo_local_wrapper_tail_count = 3;
  purity.repo_local_wrapper_tail_module_ids = [
    'generic_cli_mcp_product_wrappers',
    'owner_route_reconcile_materialize_dispatch_shell',
    'workbench_portal_generic_shell',
  ];
  guard.status = 'standard_agent_purity_cutover_guard';
  guard.proof_items = [
    'standard_agent_purity.active_private_generic_residue_count=0',
    'standard_agent_purity.default_caller_count=0',
    'standard_agent_purity.retired_alias_residue_refs=[]',
    'standard_agent_purity.default_caller_readiness_status=opl_generated_default_caller_ready',
    'standard_agent_purity.source_purity_cutover_status=physical_wrapper_retirement_pending',
    'standard_agent_purity.domain_projection_policy=refs_receipts_blockers_only_no_body_verdict_or_blob',
  ];

  return manifest;
}

function fullMasManifestWithCurrentStandardAgentEvidence() {
  return {
    ...loadFamilyManifestFixtures().medautoscience,
    ...manifestWithMasCurrentStandardAgentEvidence(),
  };
}

function fullMasManifestWithCutoverPendingStandardAgentEvidence() {
  return {
    ...loadFamilyManifestFixtures().medautoscience,
    ...manifestWithMasCutoverPendingStandardAgentEvidence(),
  };
}

test('legacy cleanup gate emits executable OPL lifecycle apply plan without domain repo delete authority', () => {
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      stale_binding_count: 0,
      stale_binding_project_ids: [],
      manifest_not_configured_count: 0,
      manifest_not_configured_project_ids: [],
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
      projection_cache_used_count: 0,
      live_failed_project_ids: [],
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

test('MAS current standard-agent evidence closes cleanup ledger without resurrecting legacy fields', () => {
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      stale_binding_count: 0,
      stale_binding_project_ids: [],
      manifest_not_configured_count: 0,
      manifest_not_configured_project_ids: [],
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
      projection_cache_used_count: 0,
      live_failed_project_ids: [],
    },
    projects: [
      {
        project_id: 'medautoscience',
        project: 'med-autoscience',
        binding_id: 'fixture-mas',
        workspace_path: '/tmp/mas',
        manifest_command: 'fixture',
        status: 'resolved',
        manifest: manifestWithMasCurrentStandardAgentEvidence() as unknown as DomainManifestCatalogEntry['manifest'],
        error: null,
      },
    ],
    notes: [],
  };

  const list = buildFamilyAgentsList(contracts, { domainManifests });
  const mas = list.family_agents.agents[0];
  const gate = mas.physical_skeleton_follow_through_gate;
  const plan = gate.executable_cleanup_plan;

  assert.equal(gate.status, 'ready_for_supervised_physical_delete_or_history_tombstone');
  assert.equal(gate.checklist.no_active_caller.source_surface, 'functional_consumer_boundary.standard_agent_purity');
  assert.equal(gate.checklist.no_active_caller.status, 'observed');
  assert.equal(gate.checklist.replacement_parity.status, 'observed');
  assert.equal(gate.checklist.history_or_tombstone.status, 'observed');
  assert.equal(plan.plan_status, 'ready');
  assert.deepEqual(plan.actions, []);
  assert.equal(gate.delete_gate.opl_cleanup_apply_can_execute, true);
  assert.equal(gate.delete_gate.can_execute_domain_physical_delete, false);
  assert.equal(plan.authority_boundary.opl_can_move_or_delete_domain_repo_files, false);
  assert.equal(plan.authority_boundary.domain_repo_delete_requires_owner_receipt, true);
  assert.equal(
    gate.evidence_refs.includes('/product_entry_manifest/functional_consumer_boundary/standard_agent_purity'),
    true,
  );
  assert.equal(
    gate.evidence_refs.includes('/product_entry_manifest/functional_consumer_boundary/generated_default_caller_boundary'),
    true,
  );
  assert.equal(
    gate.evidence_refs.includes('docs/references/med-deepscientist/source_provenance.json'),
    true,
  );
});

test('MAS legacy workspace evidence stays diagnostic after managed owner contract selection', () => {
  for (const scenario of [
    {
      prefix: 'opl-agent-mas-cleanup-normalized-',
      manifest: fullMasManifestWithCurrentStandardAgentEvidence(),
    },
    {
      prefix: 'opl-agent-mas-cutover-cleanup-',
      manifest: fullMasManifestWithCutoverPendingStandardAgentEvidence(),
    },
  ]) {
    const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), scenario.prefix));
    const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

    try {
      runCli([
        'workspace',
        'bind',
        '--project',
        'medautoscience',
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(scenario.manifest),
      ], env);

      const descriptor = runCli(['agents', 'descriptor', '--domain', 'mas'], env);
      const gate = descriptor.family_agent_descriptor.standard_domain_agent_skeleton
        .physical_skeleton_follow_through_gate;
      const diagnostic = descriptor.family_agent_descriptor.legacy_workspace_manifest_diagnostic;

      assert.equal(gate, null);
      assert.equal(diagnostic.manifest_status, 'resolved');
      assert.equal(diagnostic.used_for_standard_agent_membership, false);
      assert.equal(diagnostic.used_for_owner_action_or_stage_contracts, false);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  }
});

test('agents legacy-cleanup apply records controlled cleanup receipts from the skeleton gate', () => {
  const previous = process.env.OPL_STATE_DIR;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-legacy-cleanup-'));
  process.env.OPL_STATE_DIR = stateRoot;
  const domainManifests: NonNullable<Parameters<typeof buildFamilyAgentsList>[1]>['domainManifests'] = {
    summary: {
      total_projects_count: 1,
      active_bindings_count: 1,
      stale_binding_count: 0,
      stale_binding_project_ids: [],
      manifest_not_configured_count: 0,
      manifest_not_configured_project_ids: [],
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
      projection_cache_used_count: 0,
      live_failed_project_ids: [],
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

    const duplicateApply = runFamilyAgentLegacyCleanupApply(contracts, [
      '--domain',
      'mag',
      '--mode',
      'apply',
      '--source-ref',
      'mag://legacy-cleanup/physical-gate',
    ], { domainManifests });
    const duplicateLifecycleApply = duplicateApply.family_agent_legacy_cleanup_apply
      .lifecycle_apply as JsonRecord;
    assert.equal(duplicateLifecycleApply.receipt_ref, applyReceiptRef);

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

    const verifiedAll = runFamilyAgentLegacyCleanupApply(contracts, [
      '--domain',
      'mag',
      '--mode',
      'verify',
    ], { domainManifests });
    const verifiedAllLifecycleApply = verifiedAll.family_agent_legacy_cleanup_apply
      .lifecycle_apply as JsonRecord;
    const verifiedAllSummary = verifiedAllLifecycleApply.summary as JsonRecord;
    assert.equal(verifiedAllSummary.verified_receipt_count, 3);
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
      stale_binding_count: 0,
      stale_binding_project_ids: [],
      manifest_not_configured_count: 0,
      manifest_not_configured_project_ids: [],
      manifest_configured_count: 1,
      resolved_count: 1,
      failed_count: 0,
      projection_cache_used_count: 0,
      live_failed_project_ids: [],
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
