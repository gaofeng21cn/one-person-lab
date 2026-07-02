import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

type ReplacementCoverage = {
  coverage_status: 'opl_replacement_surface_available';
  replacement_owner: 'one-person-lab';
  replacement_surface_refs: string[];
  focused_verification_refs: string[];
  live_evidence_still_required: boolean;
};

const UNKNOWN_REPLACEMENT_COVERAGE = {
  coverage_status: 'coverage_unknown',
  replacement_owner: 'one-person-lab',
  replacement_surface_refs: [],
  focused_verification_refs: [],
  live_evidence_still_required: true,
};

const OPL_REPLACEMENT_COVERAGE: Record<string, ReplacementCoverage> = {
  workspace_source_intake_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl substrate projections',
      '/runtime_tray_snapshot/app_operator_drilldown/ref_family_refs/source_refs',
      'contracts/opl-framework/generic-substrate-projection-contract.json',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: true,
  },
  memory_locator_writeback_transport: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl domain-memory list',
      'opl domain-memory inspect',
      '/runtime_tray_snapshot/app_operator_drilldown/memory_writeback_refs',
      'contracts/family-orchestration/family-domain-memory-ref.schema.json',
      'contracts/family-orchestration/family-domain-memory-writeback.schema.json',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/functional-agent-runtime-harness.test.ts',
    ],
    live_evidence_still_required: true,
  },
  artifact_package_lifecycle_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime lifecycle apply',
      'opl runtime lifecycle apply',
      '/family-runtime/lifecycle-index',
      '/runtime_tray_snapshot/app_operator_drilldown/package_export_lifecycle_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/artifact_gallery_refs',
    ],
    focused_verification_refs: [
      'tests/src/family-runtime-lifecycle-index.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  generic_transition_runner: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl framework transition run',
      'family_transition_matrix',
      '/runtime_tray_snapshot/app_operator_drilldown/route_graph_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/decision_map_refs',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: true,
  },
  functional_harness_queue_stage_attempt_typed_closeout: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt create',
      'opl family-runtime attempt start',
      'opl family-runtime attempt query',
      'opl family-runtime queue list',
      '/runtime_tray_snapshot/stage_attempt_workbench',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  functional_harness_restart_dead_letter_repair_human_gate: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt signal',
      'opl family-runtime approve',
      'opl family-runtime scheduler tick --provider temporal',
      '/runtime_tray_snapshot/app_operator_drilldown/review_repair_queue_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/typed_blocker_refs',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  operator_workbench_drilldown_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl runtime app-operator-drilldown',
      '/runtime_tray_snapshot/app_operator_drilldown',
      '/runtime_tray_snapshot/app_operator_drilldown/app_execution_bridge',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  observability_repair_projection: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl runtime snapshot',
      'opl family-runtime provider-slo tick --provider temporal',
      'opl family-runtime scheduler status --provider temporal',
      '/runtime_tray_snapshot/provider_continuous_proof',
      '/runtime_tray_snapshot/app_operator_drilldown/provider_slo_operator_action_refs',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/product-entry-runtime.test.ts',
    ],
    live_evidence_still_required: true,
  },
  agent_scaffold_checklist: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl agents scaffold',
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      'src/standard-domain-agent-scaffold.ts',
      'src/standard-domain-agent-scaffold-policy.ts',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/domain-pack-compiler.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: false,
  },
};

export function replacementCoverage(primitiveId: string): JsonRecord {
  return OPL_REPLACEMENT_COVERAGE[primitiveId] ?? UNKNOWN_REPLACEMENT_COVERAGE;
}
