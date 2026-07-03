import {
  findLatestManagedUpdateReceipt,
  type ManagedUpdateOwnerReceiptProjection,
  type ManagedUpdatePostApplyActionReceipt,
  type ManagedUpdateReceiptApplyMode,
  type ManagedUpdateReceiptStatusDetail,
  type ManagedUpdateReloadGuidance,
} from './managed-update-component-receipts.ts';

export type ManagedUpdateOperation = 'status' | 'check' | 'plan' | 'apply' | 'repair' | 'rollback';
export type ManagedUpdateProviderId =
  | 'installation_carrier'
  | 'runtime_substrate'
  | 'capability_packages'
  | 'codex_surface'
  | 'companion_tools'
  | 'workflow_profile';
export type ManagedUpdateProviderAdapterId =
  | 'installation_carrier_status_adapter'
  | 'runtime_substrate_adapter'
  | 'capability_packages_adapter'
  | 'codex_surface_status_adapter'
  | 'companion_tools_status_adapter'
  | 'workflow_profile_adapter';
export type ManagedUpdateComponentClass = ManagedUpdateProviderId;
export type ManagedUpdateConditionStatus = 'True' | 'False' | 'Unknown';
export type ManagedUpdateComponentState =
  | 'current'
  | 'update_available'
  | 'staged'
  | 'needs_reload'
  | 'needs_restart'
  | 'failed_with_repair'
  | 'skipped_manual_required';

export type ManagedUpdateCondition = {
  type: string;
  status: ManagedUpdateConditionStatus;
  reason: string;
  message: string;
  observed_generation: number;
};

export type ManagedUpdateActionRef = {
  action_id: string;
  command: string;
  mode: 'read_only' | 'controlled_apply' | 'manual';
  destructive: boolean;
  reason: string;
};

export type ManagedUpdateOwnerRoute = {
  owner: string;
  authority_surface: string;
  route_kind:
    | 'projection_only'
    | 'manual_owner_route'
    | 'controlled_framework_executor'
    | 'clean_managed_package_executor';
  readback_ref: string;
  apply_owner: string;
  package_manager_claim: false;
  forbidden_claims: string[];
};

export type ManagedUpdateOwnerExecutionBoundary = {
  owner_executor_id: string;
  executor_kind:
    | 'none'
    | 'diagnostic_readback'
    | 'manual_owner_route'
    | 'controlled_framework_executor'
    | 'clean_managed_package_executor';
  runner_can_execute: boolean;
  allowed_operations: ManagedUpdateOperation[]; // reuse-first: allow owner-specific operation vocabulary, not a generic package manager.
  readback_ref: string;
  receipt_projection:
    | 'read_only_projection'
    | 'component_receipt_with_owner_route'
    | 'external_owner_receipt_required';
  diagnostic_only: boolean;
  package_manager_claim: false;
  notes: string[];
};

export type ManagedUpdateComponent = {
  component_id: string;
  provider_id: ManagedUpdateProviderId;
  adapter_id: ManagedUpdateProviderAdapterId;
  component_class: ManagedUpdateComponentClass;
  policy_id: string;
  owner_route: ManagedUpdateOwnerRoute;
  owner_execution_boundary: ManagedUpdateOwnerExecutionBoundary;
  label: string;
  state: ManagedUpdateComponentState;
  channel: string;
  current: Record<string, unknown>;
  target: Record<string, unknown> | null;
  conditions: ManagedUpdateCondition[];
  lifecycle: string[];
  post_apply_hooks: string[];
  auto_apply: {
    mode: ManagedUpdateReceiptApplyMode;
    eligible: boolean;
    app_background_safe: boolean;
    scope: string;
    command_ref: string | null;
    blocked_reasons: string[];
  };
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_guidance: {
    required: boolean;
    command_refs: string[];
    reload_guidance: ManagedUpdateReloadGuidance;
  };
  plan: {
    action: 'none' | 'check' | 'install' | 'update' | 'sync' | 'reload' | 'restart' | 'manual_review';
    summary: string;
    command_refs: ManagedUpdateActionRef[];
  };
  receipt: {
    schema_version: 'opl_managed_update_component_receipt.v1';
    required: boolean;
    last_receipt_ref: string | null;
    source_manifest_ref: string | null;
    from_version: string | null;
    from_digest: string | null;
    to_version: string | null;
    to_digest: string | null;
    verify_result: 'not_run_projection_only' | 'passed' | 'failed' | 'unknown';
    activated_at: string | null;
    post_apply_hooks: string[];
    rollback_ref: string | null;
    repair_action: string | null;
    content_identity_fields: string[];
    apply_mode: ManagedUpdateReceiptApplyMode;
    owner_projection?: ManagedUpdateOwnerReceiptProjection;
    status_detail: ManagedUpdateReceiptStatusDetail;
    post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
    reload_guidance: ManagedUpdateReloadGuidance;
  };
  authority_boundary: Record<string, boolean>;
  notes: string[];
};

export type ManagedUpdateKernelInput = {
  operation: ManagedUpdateOperation;
  componentId?: string;
  receiptId?: string;
};

export const COMPONENT_ALIASES: Record<string, string> = {
  app_binary: 'installation_carrier',
  installation_carrier: 'installation_carrier',
  macos_app: 'installation_carrier',
  docker_webui_image: 'installation_carrier',
  linux_package_carrier: 'installation_carrier',
  runtime_toolchain: 'runtime_substrate',
  runtime_substrate: 'runtime_substrate',
  codex_cli_fallback: 'runtime_substrate',
  embedded_codex_executor: 'runtime_substrate',
  agent_packages: 'capability_packages',
  agent_package_channel: 'capability_packages',
  capability_packages: 'capability_packages',
  capability_exposure: 'codex_surface',
  codex_surface: 'codex_surface',
  workflow_profile: 'workflow_profile',
};

export const MANAGED_UPDATE_KERNEL_ID = 'opl_managed_updater_kernel';

export const KERNEL_LIFECYCLE = [
  'read_manifest',
  'read_current_state',
  'diff_plan',
  'fetch_artifacts',
  'verify',
  'stage',
  'activate',
  'post_apply',
  'write_receipt',
  'report_status_or_repair',
];

export const STATE_VOCABULARY: ManagedUpdateComponentState[] = [
  'current',
  'update_available',
  'staged',
  'needs_restart',
  'needs_reload',
  'failed_with_repair',
  'skipped_manual_required',
];

export const COMPONENT_RECEIPT_REQUIRED_FIELDS = [
  'source_manifest_ref',
  'from_version',
  'from_digest',
  'to_version',
  'to_digest',
  'verify_result',
  'activated_at',
  'post_apply_hooks',
  'rollback_ref',
  'repair_action',
  'apply_mode',
  'owner_projection',
  'status_detail',
  'post_apply_action_statuses',
  'reload_guidance',
];

export function condition(
  type: string,
  status: ManagedUpdateConditionStatus,
  reason: string,
  message: string,
  observedGeneration = 1,
): ManagedUpdateCondition {
  return {
    type,
    status,
    reason,
    message,
    observed_generation: observedGeneration,
  };
}

export function controlledCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'controlled_apply',
    destructive: false,
    reason,
  };
}

export function readOnlyCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'read_only',
    destructive: false,
    reason,
  };
}

export function manualCommand(actionId: string, command: string, reason: string): ManagedUpdateActionRef {
  return {
    action_id: actionId,
    command,
    mode: 'manual',
    destructive: false,
    reason,
  };
}

export function ownerRoute(input: Omit<ManagedUpdateOwnerRoute, 'package_manager_claim'>): ManagedUpdateOwnerRoute {
  return {
    ...input,
    package_manager_claim: false,
  };
}

function ownerReceiptProjection(route: ManagedUpdateOwnerRoute): ManagedUpdateOwnerReceiptProjection {
  return {
    owner: route.owner,
    authority_surface: route.authority_surface,
    route_kind: route.route_kind,
    readback_ref: route.readback_ref,
    apply_owner: route.apply_owner,
    package_manager_claim: false,
    forbidden_claims: [...route.forbidden_claims],
  };
}

export function ownerExecutionBoundary(
  route: ManagedUpdateOwnerRoute,
  input: Omit<ManagedUpdateOwnerExecutionBoundary, 'readback_ref' | 'package_manager_claim'>,
): ManagedUpdateOwnerExecutionBoundary {
  return {
    ...input,
    readback_ref: route.readback_ref,
    package_manager_claim: false,
  };
}

export function bindOwnerReceiptProjection(component: ManagedUpdateComponent): ManagedUpdateComponent {
  return {
    ...component,
    receipt: {
      ...component.receipt,
      owner_projection: ownerReceiptProjection(component.owner_route),
    },
  };
}

export function componentReceipt(options: {
  component_id: string;
  source_manifest_ref: string | null;
  content_identity_fields: string[];
  post_apply_hooks: string[];
  apply_mode: ManagedUpdateReceiptApplyMode;
  status_detail: ManagedUpdateReceiptStatusDetail;
  reload_guidance: ManagedUpdateReloadGuidance;
  from_version?: string | null;
  from_digest?: string | null;
  to_version?: string | null;
  to_digest?: string | null;
  repair_action?: string | null;
}) {
  const latestReceipt = findLatestManagedUpdateReceipt(options.component_id);
  const latestActionStatuses = latestReceipt?.post_apply_action_statuses ?? [];
  return {
    schema_version: 'opl_managed_update_component_receipt.v1' as const,
    required: true,
    last_receipt_ref: latestReceipt?.receipt_ref ?? null,
    source_manifest_ref: options.source_manifest_ref,
    from_version: latestReceipt?.from_version ?? options.from_version ?? null,
    from_digest: latestReceipt?.from_digest ?? options.from_digest ?? null,
    to_version: latestReceipt?.to_version ?? options.to_version ?? null,
    to_digest: latestReceipt?.to_digest ?? options.to_digest ?? null,
    verify_result: latestReceipt?.verify_result ?? 'not_run_projection_only' as const,
    activated_at: latestReceipt?.activated_at ?? null,
    post_apply_hooks: options.post_apply_hooks,
    rollback_ref: latestReceipt?.rollback_ref ?? null,
    repair_action: latestReceipt?.repair_action ?? options.repair_action ?? null,
    content_identity_fields: options.content_identity_fields,
    apply_mode: latestReceipt?.apply_mode ?? options.apply_mode,
    status_detail: latestReceipt?.status_detail ?? options.status_detail,
    post_apply_action_statuses: latestActionStatuses,
    reload_guidance: latestReceipt?.reload_guidance ?? options.reload_guidance,
  };
}

export function noAutoApply(scope: string): ManagedUpdateComponent['auto_apply'] {
  return {
    mode: 'projection_only',
    eligible: false,
    app_background_safe: false,
    scope,
    command_ref: null,
    blocked_reasons: [],
  };
}

export function noReloadGuidance(): ManagedUpdateReloadGuidance {
  return {
    reload_required: false,
    reload_recommended: false,
    reload_targets: [],
    command_ref: null,
    reason: null,
  };
}

export function statusDetail(input: {
  component_state: ManagedUpdateComponentState;
  auto_apply_eligible?: boolean;
  app_background_safe?: boolean;
  clean_managed_targets_count?: number | null;
  manual_required_targets_count?: number | null;
  post_apply_status?: ManagedUpdateReceiptStatusDetail['post_apply_status'];
  reload_status?: ManagedUpdateReceiptStatusDetail['reload_status'];
}): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: input.component_state,
    auto_apply_eligible: input.auto_apply_eligible ?? false,
    app_background_safe: input.app_background_safe ?? false,
    clean_managed_targets_count: input.clean_managed_targets_count ?? null,
    manual_required_targets_count: input.manual_required_targets_count ?? null,
    post_apply_status: input.post_apply_status ?? 'not_run',
    reload_status: input.reload_status ?? 'not_required',
  };
}
