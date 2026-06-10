import {
  buildAgentInternalBrandModuleDoctor,
  buildAgentInternalBrandModuleInspect,
  buildAgentInternalBrandModuleInterfaces,
  buildAgentInternalBrandModulesList,
  buildAgentInternalBrandModuleValidation,
  buildBrandModuleInspect,
  buildBrandModuleInterfaces,
  buildBrandModuleMaturity,
  buildBrandModulesList,
  buildBrandModuleValidation,
} from '../../../brand-modules.ts';
import {
  buildBrandModuleL5Interfaces,
  buildBrandModuleL5ModuleStatus,
  buildBrandModuleL5Status,
  buildBrandModuleL5Validation,
} from '../../../brand-module-l5-evidence.ts';
import {
  buildBrandModuleObjectView,
  buildBrandModuleSurfaceCommand,
  listBrandModuleObjectViewCommands,
} from '../../../brand-module-surfaces.ts';
import {
  buildRunwayHandoffGatesProjection,
  buildRunwayReadinessProjection,
  buildRunwayReconcileProjection,
  buildRunwayRecoveryRepairProjection,
  buildFamilyRuntimeControlLoopStatus,
} from '../../../family-runtime-control-loop.ts';
import {
  openQueueDb,
} from '../../../family-runtime-store.ts';
import {
  runPackOsCacheCommand,
  runPackOsDistributeCommand,
  runPackOsInstallCommand,
  runPackOsInspectCommand,
  runPackOsLockCommand,
  runPackOsMasDisplaySmokeCommand,
  runPackOsRegistryCommand,
  runPackOsValidateCommand,
} from '../../../pack-os.ts';
import { runFamilyRuntime } from '../../../family-runtime.ts';
import type { BrandModuleId, FrameworkContracts } from '../../../types.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type BrandModuleSurfaceSubcommand = 'status' | 'inspect' | 'interfaces' | 'validate' | 'doctor';
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
      'stage_transition_authority.accepted_inputs',
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
      'catalog_and_telemetry.vault_ref_streams',
      'catalog_and_telemetry.vault_policy',
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
    projection_role: 'agent_lab_improvement_work_order_projection',
    source_contract_fields: [
      'multi_plane_operating_system.planes.improvement_plane',
      'agent_lab_improvement_plane',
      'resource_model.resource_kinds.ImprovementWorkOrder',
    ],
    resource_kind_refs: ['ImprovementWorkOrder', 'EvidenceRef'],
    ordinary_path_role: 'advisory_work_order_and_patch_proposal_projection',
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

async function buildRunwayControlLoopProjection(
  projection: 'readiness' | 'reconcile' | 'handoff-gates' | 'recovery-repair',
) {
  const { db, paths } = openQueueDb();
  try {
    const controlLoop = await buildFamilyRuntimeControlLoopStatus(db, paths, 'temporal');
    if (projection === 'readiness') {
      return {
        version: 'g2',
        opl_runway_readiness: buildRunwayReadinessProjection(controlLoop),
      };
    }
    if (projection === 'reconcile') {
      return {
        version: 'g2',
        opl_runway_reconcile: buildRunwayReconcileProjection(controlLoop),
      };
    }
    if (projection === 'handoff-gates') {
      return {
        version: 'g2',
        opl_runway_handoff_gates: buildRunwayHandoffGatesProjection(controlLoop),
      };
    }
    return {
      version: 'g2',
      opl_runway_recovery_repair: buildRunwayRecoveryRepairProjection(controlLoop),
    };
  } finally {
    db.close();
  }
}

function buildBrandModuleSurfaceSpecs(
  getContracts: () => FrameworkContracts,
  moduleId: BrandModuleId,
  group: string,
  subcommands: ReadonlyArray<BrandModuleSurfaceSubcommand> = ['status', 'inspect', 'interfaces', 'validate', 'doctor'],
): Record<string, CommandSpec> {
  const label = `OPL ${moduleId}`;
  const specs: Record<string, CommandSpec> = {};
  for (const subcommand of subcommands) {
    const command = `${moduleId} ${subcommand}`;
    specs[command] = {
      usage: `opl ${moduleId} ${subcommand}`,
      summary: `Read the ${label} module-owned ${subcommand} surface instead of relying on the aggregate brand registry.`,
      examples: [`opl ${moduleId} ${subcommand} --json`],
      group,
      handler: (args) => {
        assertNoArgs(args, specs[command]);
        return buildBrandModuleSurfaceCommand(getContracts(), moduleId, subcommand);
      },
    };
  }
  for (const viewId of listBrandModuleObjectViewCommands(moduleId)) {
    const command = `${moduleId} ${viewId}`;
    specs[command] = {
      usage: `opl ${moduleId} ${viewId}`,
      summary: `Read the ${label} ${viewId} object-model view from the module-owned surface contract.`,
      examples: [`opl ${moduleId} ${viewId} --json`],
      group,
      handler: (args) => {
        assertNoArgs(args, specs[command]);
        return buildBrandModuleObjectView(getContracts(), moduleId, viewId);
      },
    };
  }
  const l5StatusCommand = `${moduleId} l5-status`;
  specs[l5StatusCommand] = {
    usage: `opl ${moduleId} l5-status`,
    summary: `Read the ${label} L5 operating-evidence status without converting L4 structure into production maturity.`,
    examples: [`opl ${moduleId} l5-status --json`],
    group,
    handler: (args) => {
      assertNoArgs(args, specs[l5StatusCommand]);
      return buildBrandModuleL5ModuleStatus(getContracts(), moduleId);
    },
  };
  return specs;
}

export function buildBrandCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const brandModuleSurfaceSpecs = {
    ...buildBrandModuleSurfaceSpecs(getContracts, 'charter', 'brand-charter'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'atlas', 'brand-atlas'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'workspace', 'workspace', ['status', 'inspect']),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'pack', 'brand-pack'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'stagecraft', 'brand-stagecraft'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'runway', 'brand-runway'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'vault', 'brand-vault'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'console', 'brand-console'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'foundry-lab', 'brand-foundry-lab'),
    ...buildBrandModuleSurfaceSpecs(getContracts, 'connect', 'brand-connect'),
  };

  const brandCommandSpecs: Record<string, CommandSpec> = {
    'pack os inspect': {
      usage: 'opl pack os inspect --descriptor <path>',
      summary: 'Inspect a generic capability-pack descriptor through OPL Pack OS without claiming domain authority.',
      examples: [
        'opl pack os inspect --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsInspectCommand,
    },
    'pack os install': {
      usage: 'opl pack os install --descriptor <path> --registry <path> [--cache-root <dir>]',
      summary: 'Install a generic capability-pack descriptor into the OPL refs-only Pack OS registry and cache.',
      examples: [
        'opl pack os install --descriptor display_pack.json --registry build/pack-registry.json --json',
        'opl pack os install --descriptor display_pack.json --registry build/pack-registry.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsInstallCommand,
    },
    'pack os registry': {
      usage: 'opl pack os registry --registry <path>',
      summary: 'Read an OPL Pack OS registry without claiming pack quality or domain readiness.',
      examples: [
        'opl pack os registry --registry build/pack-registry.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsRegistryCommand,
    },
    'pack os cache': {
      usage: 'opl pack os cache --descriptor <path> --cache-root <dir>',
      summary: 'Materialize present local pack resources into an OPL content-addressed cache.',
      examples: [
        'opl pack os cache --descriptor display_pack.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsCacheCommand,
    },
    'pack os distribute': {
      usage: 'opl pack os distribute --descriptor <path> --output <path> [--cache-root <dir>]',
      summary: 'Write a refs-only Pack OS distribution bundle manifest for a generic capability pack.',
      examples: [
        'opl pack os distribute --descriptor display_pack.json --output build/pack-distribution.json --json',
        'opl pack os distribute --descriptor display_pack.json --output build/pack-distribution.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsDistributeCommand,
    },
    'pack os lock': {
      usage: 'opl pack os lock --descriptor <path> [--output <path>]',
      summary: 'Resolve a generic capability-pack descriptor into a refs-only Pack OS lock.',
      examples: [
        'opl pack os lock --descriptor display_pack.json --json',
        'opl pack os lock --descriptor display_pack.json --output build/pack-lock.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsLockCommand,
    },
    'pack os validate': {
      usage: 'opl pack os validate --descriptor <path>',
      summary: 'Validate the generic Pack OS descriptor boundary and false-authority flags.',
      examples: [
        'opl pack os validate --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsValidateCommand,
    },
    'pack os mas-display-smoke': {
      usage: 'opl pack os mas-display-smoke --contract <path> [--output <path>]',
      summary: 'Consume a MAS Display Pack v2 contract into a refs-only Pack OS lock and audit smoke.',
      examples: [
        'opl pack os mas-display-smoke --contract contracts/display-pack-contract.v2.json --json',
        'opl pack os mas-display-smoke --contract contracts/display-pack-contract.v2.json --output build/pack-lock.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsMasDisplaySmokeCommand,
    },
    'runway control-loop status': {
      usage: 'opl runway control-loop status',
      summary: 'Read the Runway control-loop runtime status while keeping Temporal, worker supervisor, scheduler cadence, and Progress Reconciler authority separate.',
      examples: ['opl runway control-loop status --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway control-loop status']);
        return runFamilyRuntime(['control-loop', 'status', '--provider', 'temporal']);
      },
    },
    'runway readiness': {
      usage: 'opl runway readiness',
      summary: 'Read the Runway provider-backed runtime readiness projection without claiming domain or production readiness.',
      examples: ['opl runway readiness --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway readiness']);
        return buildRunwayControlLoopProjection('readiness');
      },
    },
    'runway reconcile': {
      usage: 'opl runway reconcile',
      summary: 'Read the Runway desired/current reconciliation projection and selected next safe action.',
      examples: ['opl runway reconcile --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway reconcile']);
        return buildRunwayControlLoopProjection('reconcile');
      },
    },
    'runway handoff-gates': {
      usage: 'opl runway handoff-gates',
      summary: 'Read Runway handoff gates and accepted owner-answer refs without treating provider completion as a domain answer.',
      examples: ['opl runway handoff-gates --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway handoff-gates']);
        return buildRunwayControlLoopProjection('handoff-gates');
      },
    },
    'runway recovery-repair': {
      usage: 'opl runway recovery-repair',
      summary: 'Read Runway recovery and repair classification with the selected repair action, if any.',
      examples: ['opl runway recovery-repair --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['runway recovery-repair']);
        return buildRunwayControlLoopProjection('recovery-repair');
      },
    },
    'brand-modules list': {
      usage: 'opl brand-modules list',
      summary: 'List the OPL brand modules and their Workspace-level structural baseline refs.',
      examples: ['opl brand-modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules list']);
        return buildBrandModulesList(getContracts());
      },
    },
    'brand-modules inspect': {
      usage: 'opl brand-modules inspect --module <module_id>',
      summary: 'Inspect one OPL brand module with contract, CLI, App, descriptor, validation, status, and authority-boundary refs.',
      examples: ['opl brand-modules inspect --module workspace --json'],
      group: 'brand',
      handler: (args) => buildBrandModuleInspect(getContracts(), args),
    },
    'brand-modules maturity': {
      usage: 'opl brand-modules maturity',
      summary: 'Read the Workspace-baseline maturity matrix for all OPL brand modules.',
      examples: ['opl brand-modules maturity --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules maturity']);
        return buildBrandModuleMaturity(getContracts());
      },
    },
    'brand-modules l5-status': {
      usage: 'opl brand-modules l5-status [--module <module_id>]',
      summary: 'Read the fail-closed L5 operating-evidence matrix without claiming production maturity from structural readiness.',
      examples: [
        'opl brand-modules l5-status --json',
        'opl brand-modules l5-status --module runway --json',
      ],
      group: 'brand',
      handler: (args) => buildBrandModuleL5Status(getContracts(), args),
    },
    'brand-modules l5-validate': {
      usage: 'opl brand-modules l5-validate',
      summary: 'Validate the L5 evidence matrix shape and false-authority policy without treating open evidence as a contract failure.',
      examples: ['opl brand-modules l5-validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules l5-validate']);
        return buildBrandModuleL5Validation(getContracts());
      },
    },
    'brand-modules l5-interfaces': {
      usage: 'opl brand-modules l5-interfaces',
      summary: 'Expose CLI, App descriptor, validation, and contract refs for the brand-module L5 evidence gate.',
      examples: ['opl brand-modules l5-interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules l5-interfaces']);
        return buildBrandModuleL5Interfaces(getContracts());
      },
    },
    'brand-modules validate': {
      usage: 'opl brand-modules validate',
      summary: 'Validate OPL brand module L4 gates and false-authority boundaries from the registry contract.',
      examples: ['opl brand-modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules validate']);
        return buildBrandModuleValidation(getContracts());
      },
    },
    'brand-modules interfaces': {
      usage: 'opl brand-modules interfaces',
      summary: 'Expose descriptor-only CLI, App, validation, and registry surfaces for the OPL brand module bundle.',
      examples: ['opl brand-modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules interfaces']);
        return buildBrandModuleInterfaces(getContracts());
      },
    },
    'brand-modules operating-model-projections': {
      usage: 'opl brand-modules operating-model-projections',
      summary: 'Expose the OPL multi-plane operating model as projection/read-model surfaces without authority to create owner answers, typed blockers, quality verdicts, or readiness claims.',
      examples: ['opl brand-modules operating-model-projections --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['brand-modules operating-model-projections']);
        return buildBrandOperatingModelProjections(getContracts());
      },
    },
    ...brandModuleSurfaceSpecs,
    'agents modules list': {
      usage: 'opl agents modules list',
      summary: 'List domain-agent internal brand-module spines without making them OPL platform modules.',
      examples: ['opl agents modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules list']);
        return buildAgentInternalBrandModulesList(getContracts());
      },
    },
    'agents modules inspect': {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      summary: 'Inspect one domain-agent internal brand-module spine from the OPL governance contract.',
      examples: ['opl agents modules inspect --domain medautoscience --module agent-runway --json'],
      group: 'brand',
      handler: (args) => buildAgentInternalBrandModuleInspect(getContracts(), args),
    },
    'agents modules interfaces': {
      usage: 'opl agents modules interfaces',
      summary: 'Expose CLI and descriptor refs for the agent-owned internal brand-module spine.',
      examples: ['opl agents modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules interfaces']);
        return buildAgentInternalBrandModuleInterfaces(getContracts());
      },
    },
    'agents modules validate': {
      usage: 'opl agents modules validate',
      summary: 'Validate agent-owned internal brand-module spine coverage and false-authority boundaries.',
      examples: ['opl agents modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules validate']);
        return buildAgentInternalBrandModuleValidation(getContracts());
      },
    },
    'agents modules doctor': {
      usage: 'opl agents modules doctor',
      summary: 'Fail closed if agent-owned internal brand-module spine governance drifts.',
      examples: ['opl agents modules doctor --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, brandCommandSpecs['agents modules doctor']);
        return buildAgentInternalBrandModuleDoctor(getContracts());
      },
    },
  };

  return brandCommandSpecs;
}
