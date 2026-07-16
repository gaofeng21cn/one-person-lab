import type { BrandModuleId, FrameworkContracts } from '../../../../kernel/types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type OperatingModelProjectionSurface = {
  surface_id: string;
  module_id: BrandModuleId;
  plane_id: string;
  surface_kind: 'projection_read_model';
  projection_role: string;
  source_contract_fields: string[];
  resource_kind_refs: string[];
  ordinary_path_role: string;
  drilldown_policy: string;
  authority_boundary: Record<string, boolean>;
  forbidden_claims: string[];
};

const OPERATING_MODEL_PROJECTION_AUTHORITY_BOUNDARY = {
  can_generate_owner_answer: false,
  can_claim_quality_verdict: false,
  can_create_typed_blocker: false,
  can_claim_production_ready: false,
  can_claim_domain_ready: false,
  can_claim_artifact_authority: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_replace_domain_owner: false,
  can_replace_app_release_truth: false,
};

const OPERATING_MODEL_PLANE_PROJECTION_METADATA: Record<string, {
  projection_role: string;
  source_contract_fields: string[];
  resource_kind_refs: string[];
  ordinary_path_role: string;
  drilldown_policy: string;
}> = {
  purpose_pack_plane: {
    projection_role: 'domain_pack_and_authority_abi_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.purpose_pack_plane',
      'domain_pack_authority_abi',
      'resource_model.resource_kinds.DomainPack',
    ],
    resource_kind_refs: ['DomainPack', 'Agent'],
    ordinary_path_role: 'stage_pack_launch_context_projection',
    drilldown_policy: 'descriptor_and_generated_surface_refs_only',
  },
  ordinary_progress_plane: {
    projection_role: 'current_owner_delta_stage_goal_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.ordinary_progress_plane',
      'surface_budget_compiler_policy.ordinary_path_root',
      'resource_model.resource_kinds.StageRun',
      'resource_model.resource_kinds.OwnerAnswer',
    ],
    resource_kind_refs: ['StageRun', 'OwnerAnswer'],
    ordinary_path_role: 'default_progress_spine_from_current_owner_delta',
    drilldown_policy: 'stage_graph_receipt_and_blocker_refs_only',
  },
  stage_artifact_plane: {
    projection_role: 'stage_artifact_unit_and_workspace_topology_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.stage_artifact_plane',
      'resource_model.resource_kinds.StageArtifactUnit',
      'resource_model.resource_kinds.WorkspaceGroup',
      'resource_model.resource_kinds.ProjectUnit',
    ],
    resource_kind_refs: ['WorkspaceGroup', 'ProjectUnit', 'StageArtifactUnit'],
    ordinary_path_role: 'artifact_ref_and_handoff_pointer_projection',
    drilldown_policy: 'no_artifact_body_or_quality_verdict',
  },
  durable_runway_plane: {
    projection_role: 'provider_backed_runtime_control_loop_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.durable_runway_plane',
      'resource_model.resource_kinds.RunwayControlLoop',
      'reconciler_model.substrate_policy',
    ],
    resource_kind_refs: ['RunwayControlLoop', 'StageRun'],
    ordinary_path_role: 'attempt_lease_provider_observation_and_recovery_refs',
    drilldown_policy: 'provider_completion_is_not_domain_completion',
  },
  authority_decision_plane: {
    projection_role: 'owner_answer_human_gate_route_back_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.authority_decision_plane',
      'codex_stage_route_owner.route_capabilities',
      'resource_model.resource_kinds.OwnerAnswer',
    ],
    resource_kind_refs: ['OwnerAnswer'],
    ordinary_path_role: 'accepted_owner_answer_or_gate_ref_projection',
    drilldown_policy: 'domain_or_human_owner_signature_refs_only',
  },
  evidence_telemetry_plane: {
    projection_role: 'refs_only_evidence_and_telemetry_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.evidence_telemetry_plane',
      'catalog_and_telemetry.ledger_ref_streams',
      'catalog_and_telemetry.ledger_policy',
      'resource_model.resource_kinds.EvidenceRef',
    ],
    resource_kind_refs: ['EvidenceRef', 'OwnerAnswer', 'StageArtifactUnit'],
    ordinary_path_role: 'audit_drilldown_only_record_everything_plan_from_nothing',
    drilldown_policy: 'refs_only_no_body_storage_or_quality_verdict',
  },
  reconciler_plane: {
    projection_role: 'desired_current_safe_action_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.reconciler_plane',
      'resource_model.resource_kinds.ProgressReconciler',
      'reconciler_model',
    ],
    resource_kind_refs: ['ProgressReconciler', 'StageRun'],
    ordinary_path_role: 'exactly_one_safe_action_or_owner_wait_projection',
    drilldown_policy: 'safe_action_does_not_replace_owner_delta',
  },
  app_cockpit_plane: {
    projection_role: 'operator_state_action_read_model_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.app_cockpit_plane',
      'app_console_policy',
      'surface_budget_compiler_policy.ordinary_path_root',
    ],
    resource_kind_refs: ['ProgressReconciler', 'OwnerAnswer', 'StageArtifactUnit'],
    ordinary_path_role: 'current_owner_next_action_artifact_or_blocker_projection',
    drilldown_policy: 'drilldown_fields_do_not_override_current_owner_delta',
  },
  improvement_plane: {
    projection_role: 'foundry_run_version_activation_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.improvement_plane',
      'foundry_kernel_plane',
      'resource_model.resource_kinds.FoundryRun',
    ],
    resource_kind_refs: ['FoundryRun', 'EvidenceRef'],
    ordinary_path_role: 'durable_agent_engineering_run_projection',
    drilldown_policy: 'no_target_agent_acceptance_or_production_authority',
  },
};

function resourceKindIndex(contracts: FrameworkContracts) {
  return new Map(
    contracts.targetOperatingArchitecture.resource_model.resource_kinds.map((entry) => [entry.kind, entry]),
  );
}

function buildOperatingModelProjectionSurface(
  contracts: FrameworkContracts,
  plane: FrameworkContracts['targetOperatingArchitecture']['multi_plane_operating_system']['planes'][number],
): OperatingModelProjectionSurface {
  const resources = resourceKindIndex(contracts);
  const metadata = OPERATING_MODEL_PLANE_PROJECTION_METADATA[plane.plane_id];
  return {
    surface_id: plane.plane_id,
    module_id: plane.owner_modules[0],
    plane_id: plane.plane_id,
    surface_kind: 'projection_read_model',
    projection_role: metadata?.projection_role ?? 'multi_plane_contract_projection',
    source_contract_fields: metadata?.source_contract_fields ?? [
      `multi_plane_operating_system.planes.${plane.plane_id}`,
    ],
    resource_kind_refs: (metadata?.resource_kind_refs ?? []).filter((kind) => resources.has(kind)),
    ordinary_path_role: metadata?.ordinary_path_role ?? 'contract_defined_projection',
    drilldown_policy: metadata?.drilldown_policy ?? 'contract_refs_only',
    authority_boundary: { ...OPERATING_MODEL_PROJECTION_AUTHORITY_BOUNDARY },
    forbidden_claims: contracts.targetOperatingArchitecture.forbidden_claims,
  };
}

function buildBrandOperatingModelProjections(contracts: FrameworkContracts) {
  return {
    version: 'g2',
    brand_operating_model_projections: {
      surface_kind: 'opl_multi_plane_operating_model_projection_index',
      projection_role: 'projection_read_model_only',
      model_ref: 'target_operating_architecture.multi_plane_operating_system',
      plane_model_id: contracts.targetOperatingArchitecture.multi_plane_operating_system.plane_model_id,
      source_refs: [
        'contracts/opl-framework/target-operating-architecture-contract.json',
        'human_doc:opl_family_ideal_operating_model_redesign',
        ...contracts.targetOperatingArchitecture.source_refs,
      ],
      ordinary_path_root:
        contracts.targetOperatingArchitecture.surface_budget_compiler_policy.ordinary_path_root,
      default_lane_policy: {
        allowed_lanes: contracts.targetOperatingArchitecture.surface_budget_compiler_policy.allowed_lanes,
        small_detail_default_lanes:
          contracts.targetOperatingArchitecture.surface_budget_compiler_policy.small_detail_default_lanes,
        ordinary_path_must_not_be_overridden_by:
          contracts.targetOperatingArchitecture.surface_budget_compiler_policy
            .ordinary_path_must_not_be_overridden_by,
        surface_plane_binding_required:
          contracts.targetOperatingArchitecture.surface_budget_compiler_policy
            .surface_plane_binding_required,
        ordinary_surface_allowed_planes:
          contracts.targetOperatingArchitecture.surface_budget_compiler_policy
            .ordinary_surface_allowed_planes,
      },
      authority_boundary: contracts.targetOperatingArchitecture.authority_boundary,
      projection_authority_boundary: {
        ...OPERATING_MODEL_PROJECTION_AUTHORITY_BOUNDARY,
      },
      forbidden_claims: contracts.targetOperatingArchitecture.forbidden_claims,
      surfaces: contracts.targetOperatingArchitecture.multi_plane_operating_system.planes.map((plane) =>
        buildOperatingModelProjectionSurface(contracts, plane)
      ),
    },
  };
}

export function buildBrandOperatingModelCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'brand-modules operating-model-projections': {
      usage: 'opl brand-modules operating-model-projections',
      summary: 'Expose the OPL multi-plane operating model as projection/read-model surfaces without authority to create owner answers, typed blockers, quality verdicts, or readiness claims.',
      examples: ['opl brand-modules operating-model-projections --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, specs['brand-modules operating-model-projections']);
        return buildBrandOperatingModelProjections(getContracts());
      },
    },
  };
  return specs;
}
