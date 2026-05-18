import { buildFamilyAgentsList } from '../../../../src/family-domain-agent-skeleton.ts';
import type { DomainManifestCatalogEntry } from '../../../../src/domain-manifest/types.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';
import { assert, test } from '../helpers.ts';

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
});
