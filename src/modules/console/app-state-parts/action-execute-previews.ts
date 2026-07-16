import { settingsControlCenterActionById } from '../app-state-settings-control-center.ts';
import type { OplEngineAction, OplModuleAction, OplModuleId } from '../../connect/index.ts';
import { stringPayloadField } from './action-execute-payloads.ts';

type JsonRecord = Record<string, unknown>;

type AppActionExecuteRequest = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

export function buildDryRunUnresolvedAction(options: AppActionExecuteRequest) {
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: true,
      route: null,
      execution: {
        execution_status: 'dry_run_unresolved',
        execution_kind: 'unresolved_action_route',
        route_ref: null,
        action_kind: null,
        executed_runtime_command: null,
        result: null,
      },
      authority_boundary: {
        opl: 'app_action_execute_preflight',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}

export function dryRunEngineAction(action: OplEngineAction) {
  return {
    engine_action: {
      engine_id: 'codex',
      action,
      status: 'dry_run',
    },
  };
}

export function dryRunModuleAction(action: OplModuleAction, moduleId: OplModuleId) {
  return {
    module_action: {
      module_id: moduleId,
      action,
      status: 'dry_run',
    },
  };
}

export function buildTaskActionReceiptPreview(payload: JsonRecord) {
  const taskId = stringPayloadField(payload, 'task_id')
    ?? stringPayloadField(payload, 'taskId')
    ?? 'unbound_task';
  const actionRef = stringPayloadField(payload, 'action_ref')
    ?? stringPayloadField(payload, 'actionRef')
    ?? null;
  return {
    task_action_receipt_preview: {
      surface_kind: 'opl_app_task_action_receipt_preview.v1',
      action_id: 'task_action_receipt_preview',
      status: 'dry_run_refs_only',
      task_id: taskId,
      action_ref: actionRef,
      receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/receipt`,
      plan: {
        summary: 'Preview task action receipt refs for App confirmation.',
        required_mode: 'dry_run',
        owner_route: 'domain_owner_route_required_for_execute',
      },
      write_targets: [],
      risk: {
        danger_level: 'medium',
        mutation_policy: 'no_writes_preview_only',
      },
      expected_output: {
        receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/receipt`,
        content_policy: 'refs_only_no_action_receipt_body',
      },
      command_preview: [
        'opl',
        'app',
        'action',
        'execute',
        '--action',
        'task_action_receipt_preview',
        '--payload',
        '<json>',
        '--dry-run',
      ],
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_read_artifact_body: false,
        can_create_owner_receipt: false,
        can_sign_domain_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        execution_requires_domain_owner_route: true,
        temporal_is_diagnostics_only: true,
      },
    },
  };
}

export function buildTaskExportBundlePreview(payload: JsonRecord) {
  const taskId = stringPayloadField(payload, 'task_id')
    ?? stringPayloadField(payload, 'taskId')
    ?? 'unbound_task';
  const exportBundleRef = stringPayloadField(payload, 'export_bundle_ref')
    ?? stringPayloadField(payload, 'exportBundleRef')
    ?? `opl://domains/unbound/tasks/${encodeURIComponent(taskId)}/export-bundles/latest`;
  return {
    task_export_bundle_preview: {
      surface_kind: 'opl_app_task_export_bundle_preview.v1',
      action_id: 'task_export_bundle_preview',
      status: 'dry_run_refs_only',
      task_id: taskId,
      export_bundle_ref: exportBundleRef,
      receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/export-bundle-receipt`,
      plan: {
        summary: 'Preview reproducibility export bundle receipt refs for App confirmation.',
        required_mode: 'dry_run',
        owner_route: 'domain_owner_export_bundle_action_required_for_execute',
      },
      write_targets: [],
      risk: {
        danger_level: 'medium',
        mutation_policy: 'no_writes_preview_only',
      },
      expected_output: {
        export_bundle_ref: exportBundleRef,
        receipt_ref: `opl://app-action-previews/${encodeURIComponent(taskId)}/export-bundle-receipt`,
        content_policy: 'refs_only_no_export_bundle_body',
      },
      command_preview: [
        'opl',
        'app',
        'action',
        'execute',
        '--action',
        'task_export_bundle_preview',
        '--payload',
        '<json>',
        '--dry-run',
      ],
      authority_boundary: {
        can_generate_domain_export_bundle: false,
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_read_artifact_body: false,
        can_create_owner_receipt: false,
        can_sign_domain_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        execution_requires_domain_owner_route: true,
        temporal_is_diagnostics_only: true,
      },
    },
  };
}

export function buildSettingsControlCenterDryRun(actionId: string, payload: JsonRecord) {
  const action = settingsControlCenterActionById(actionId);
  return {
    settings_control_center_action: {
      surface_kind: 'opl_settings_control_center_action_preflight.v1',
      action_id: actionId,
      label: action?.label ?? actionId,
      status: 'dry_run',
      read_model_ref: 'app_state.settings_control_center.app_settings_read_model',
      task_kind: action?.task_kind ?? 'unknown',
      taxonomy: action?.taxonomy ?? null,
      requested: payload,
      payload_fields: action?.payload_fields ?? [],
      mutates: action?.mutates ?? 'unknown',
      confirmation_required: action?.confirmation_required ?? false,
      danger_level: action?.danger_level ?? 'unknown',
      impact: action?.impact ?? null,
      rollback_action_id: action?.rollback_action_id ?? null,
      follow_up_action_ids: action?.follow_up_action_ids ?? [],
      verify_action_id: action?.verify_action_id ?? null,
      command_preview: ['opl', 'app', 'action', 'execute', '--action', actionId],
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_write_provider_queue: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_claim_app_release_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

export function buildSettingsPruneRuntimeRootsPlan() {
  return {
    settings_runtime_roots_cleanup_plan: {
      surface_kind: 'opl_settings_runtime_roots_cleanup_plan.v1',
      status: 'dry_run_plan_only',
      action_id: 'settings_prune_runtime_roots_dry_run',
      inspected_roots: [
        'OPL_STATE_DIR',
        'OPL_MODULES_ROOT',
        'OPL_FAMILY_WORKSPACE_ROOT',
        'configured_workspace_root',
      ],
      allowed_operation: 'report_candidates_only',
      forbidden_operations: [
        'delete_files',
        'write_domain_truth',
        'write_runtime_queue',
        'sign_owner_receipt',
        'create_typed_blocker',
      ],
      verify_surface: 'opl app state --profile full --json#settings_control_center',
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_delete_runtime_roots: false,
      },
    },
  };
}

export function buildDockerWebuiSettingsManualAction(actionId: string, commandPreview: string[], payload: JsonRecord) {
  const action = settingsControlCenterActionById(actionId);
  return {
    settings_control_center_action: {
      surface_kind: 'opl_settings_control_center_action_preflight.v1',
      action_id: actionId,
      label: action?.label ?? actionId,
      status: 'manual_command_preview',
      task_kind: action?.task_kind ?? 'unknown',
      taxonomy: action?.taxonomy ?? null,
      requested: payload,
      payload_fields: action?.payload_fields ?? [],
      mutates: action?.mutates ?? 'unknown',
      confirmation_required: action?.confirmation_required ?? false,
      danger_level: action?.danger_level ?? 'unknown',
      impact: action?.impact ?? null,
      rollback_action_id: action?.rollback_action_id ?? null,
      follow_up_action_ids: action?.follow_up_action_ids ?? [],
      verify_action_id: action?.verify_action_id ?? null,
      command_preview: commandPreview,
      authority_boundary: {
        carries_api_key_secret: false,
        can_write_domain_truth: false,
        can_sign_domain_receipt: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
        can_write_provider_queue: false,
        can_claim_app_release_ready: false,
        can_claim_runtime_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

export function dryRunFamilyRuntimeResult(surface: string, args: string[]) {
  const commandPreview = ['opl', 'family-runtime', ...args];
  if (surface === 'scheduler_cadence') {
    return {
      family_runtime_scheduler_cadence: {
        action: args[1],
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'provider_repair') {
    return {
      family_runtime_provider: {
        action: 'repair',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'service') {
    return {
      family_runtime_service: {
        action: args[1],
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  return {
    family_runtime_worker: {
      action: args[1],
      provider_kind: 'temporal',
      status: 'dry_run',
      command_preview: commandPreview,
    },
  };
}
