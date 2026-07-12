import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  appOperatorProjectionCommand,
  appOperatorProjectionRef,
  appOperatorProjectionTestRef,
} from '../../ledger/index.ts';

type ReplacementCoverage = {
  coverage_status: 'opl_replacement_surface_available' | 'retired_single_codex_semantic_control_plane';
  replacement_owner: 'one-person-lab' | 'codex_cli';
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

const APP_OPERATOR_PROJECTION_TEST_REF = appOperatorProjectionTestRef();

const OPL_REPLACEMENT_COVERAGE: Record<string, ReplacementCoverage> = {
  workspace_source_intake_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl substrate projections',
      appOperatorProjectionRef('ref_family_refs', 'source_refs'),
      'contracts/opl-framework/generic-substrate-projection-contract.json',
    ],
    focused_verification_refs: [
      APP_OPERATOR_PROJECTION_TEST_REF,
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
      appOperatorProjectionRef('memory_writeback_refs'),
      'contracts/family-orchestration/family-domain-memory-ref.schema.json',
      'contracts/family-orchestration/family-domain-memory-writeback.schema.json',
    ],
    focused_verification_refs: [
      APP_OPERATOR_PROJECTION_TEST_REF,
      'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
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
      appOperatorProjectionRef('package_export_lifecycle_refs'),
      appOperatorProjectionRef('artifact_gallery_refs'),
    ],
    focused_verification_refs: [
      'tests/src/family-runtime-lifecycle-index.test.ts',
      APP_OPERATOR_PROJECTION_TEST_REF,
    ],
    live_evidence_still_required: true,
  },
  stage_run_attempt_transport: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt create',
      'opl family-runtime attempt start',
      'opl family-runtime attempt query',
      '/runtime_tray_snapshot/stage_attempt_workbench',
    ],
    focused_verification_refs: [
      'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
      APP_OPERATOR_PROJECTION_TEST_REF,
    ],
    live_evidence_still_required: true,
  },
  stage_run_recovery_transport: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt signal',
      'opl family-runtime provider-slo tick --provider temporal',
      appOperatorProjectionRef('review_repair_queue_refs'),
      appOperatorProjectionRef('typed_blocker_refs'),
    ],
    focused_verification_refs: [
      'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
      APP_OPERATOR_PROJECTION_TEST_REF,
    ],
    live_evidence_still_required: true,
  },
  operator_workbench_drilldown_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      appOperatorProjectionCommand(),
      appOperatorProjectionRef(),
      appOperatorProjectionRef('app_execution_bridge'),
    ],
    focused_verification_refs: [
      APP_OPERATOR_PROJECTION_TEST_REF,
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
      appOperatorProjectionRef('provider_slo_operator_action_refs'),
    ],
    focused_verification_refs: [
      APP_OPERATOR_PROJECTION_TEST_REF,
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
