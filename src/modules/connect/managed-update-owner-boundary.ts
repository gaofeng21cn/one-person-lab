import {
  findLatestManagedUpdateReceipt,
} from './managed-update-component-receipts.ts';
import type {
  ManagedUpdateComponentReceiptInput,
  ManagedUpdateOwnerReceiptProjection,
  ManagedUpdateOwnerRoute,
  ManagedUpdatePostApplyActionReceipt,
  ManagedUpdateProviderAdapterId,
  ManagedUpdateProviderId,
  ManagedUpdateReceiptApplyMode,
  ManagedUpdateReceiptStatusDetail,
  ManagedUpdateReloadGuidance,
  ManagedUpdateOperation,
} from './managed-update-owner-primitives.ts';
export {
  CAPABILITY_PACKAGE_APPLY_COMMAND,
  CAPABILITY_PACKAGE_APPLY_OWNER,
  CAPABILITY_PACKAGE_OWNER,
  CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS,
  CAPABILITY_PACKAGE_READBACK_REF,
  CAPABILITY_PACKAGE_REPAIR_COMMAND,
  CAPABILITY_PACKAGE_STATUS_READBACK_REF,
  capabilityPackageOwnerRoute,
  MANAGED_UPDATE_OWNER_ACTIONS,
  MANAGED_UPDATE_OWNER_FIELDS,
  ownerBoundaryRef,
  ownerRoute,
} from './managed-update-owner-primitives.ts';
export type {
  ManagedUpdateComponentReceipt,
  ManagedUpdateComponentReceiptInput,
  ManagedUpdateOwnerReceiptProjection,
  ManagedUpdateOwnerRoute,
  ManagedUpdatePostApplyActionReceipt,
  ManagedUpdateProviderAdapterId,
  ManagedUpdateProviderId,
  ManagedUpdateReceiptApplyMode,
  ManagedUpdateReceiptStatusDetail,
  ManagedUpdateReloadGuidance,
  ManagedUpdateOperation,
} from './managed-update-owner-primitives.ts';

export type ManagedUpdateLifecycleOwner = 'opl_base' | 'opl_app' | 'opl_packages';
export type ManagedUpdateComponentClass = ManagedUpdateLifecycleOwner;
export type ManagedUpdateCoordinationRole =
  | 'executable_target'
  | 'derived_projection'
  | 'owner_handoff';
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
  lifecycle_owner: ManagedUpdateLifecycleOwner;
  component_id: string;
  provider_id: ManagedUpdateProviderId;
  adapter_id: ManagedUpdateProviderAdapterId;
  component_class: ManagedUpdateComponentClass;
  coordination_role: ManagedUpdateCoordinationRole;
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
  dependency_status?: Record<string, unknown>;
  integration_status?: Record<string, unknown>;
  projection_status?: Record<string, unknown>;
  profile_migration_status?: Record<string, unknown>;
};

export type ManagedUpdateKernelInput = {
  operation: ManagedUpdateOperation;
  componentId?: string;
  receiptId?: string;
  persistReleaseCatalog?: boolean;
  refreshReleaseCatalog?: boolean;
};

export type ManagedUpdateOwnerExecutionStatus =
  | 'completed'
  | 'partial_success'
  | 'partial_failure'
  | 'skipped'
  | 'manual_required'
  | 'failed';

export type ManagedUpdateOwnerPostApplyAction = {
  action_id: string;
  command_ref: string;
  status: ManagedUpdatePostApplyActionReceipt['status'];
  result_ref: string | null;
  result: Record<string, unknown> | null;
};

export type ManagedUpdateOwnerExecutionReceiptResult = {
  component_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  owner_route?: ManagedUpdateOwnerRoute;
  owner_execution_boundary?: ManagedUpdateOwnerExecutionBoundary;
  status: ManagedUpdateOwnerExecutionStatus;
  result_ref: string | null;
  apply_mode?: ManagedUpdateReceiptApplyMode;
  status_detail?: ManagedUpdateReceiptStatusDetail;
  reload_guidance?: ManagedUpdateReloadGuidance;
  post_apply_actions?: ManagedUpdateOwnerPostApplyAction[];
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

export function managedUpdateComponent(
  input: Omit<ManagedUpdateComponent, 'post_apply_hooks'> & { postApplyHooks: string[] },
): ManagedUpdateComponent {
  const { postApplyHooks, ...component } = input;
  return {
    ...component,
    post_apply_hooks: postApplyHooks,
  };
}

export function componentReceipt(options: {
  component_id: string;
  sourceManifestRef: string | null;
  contentIdentityFields: string[];
  postApplyHooks: string[];
  apply_mode: ManagedUpdateReceiptApplyMode;
  status_detail: ManagedUpdateReceiptStatusDetail;
  reload_guidance: ManagedUpdateReloadGuidance;
  from_version?: string | null;
  fromDigest?: string | null;
  to_version?: string | null;
  toDigest?: string | null;
  repair_action?: string | null;
}) {
  const latestReceipt = findLatestManagedUpdateReceipt(options.component_id);
  const latestActionStatuses = latestReceipt?.post_apply_action_statuses ?? [];
  return {
    schema_version: 'opl_managed_update_component_receipt.v1' as const,
    required: true,
    last_receipt_ref: latestReceipt?.receipt_ref ?? null,
    source_manifest_ref: options.sourceManifestRef,
    from_version: latestReceipt?.from_version ?? options.from_version ?? null,
    from_digest: latestReceipt?.from_digest ?? options.fromDigest ?? null,
    to_version: latestReceipt?.to_version ?? options.to_version ?? null,
    to_digest: latestReceipt?.to_digest ?? options.toDigest ?? null,
    verify_result: latestReceipt?.verify_result ?? 'not_run_projection_only' as const,
    activated_at: latestReceipt?.activated_at ?? null,
    post_apply_hooks: options.postApplyHooks,
    rollback_ref: latestReceipt?.rollback_ref ?? null,
    repair_action: latestReceipt?.repair_action ?? options.repair_action ?? null,
    content_identity_fields: options.contentIdentityFields,
    apply_mode: latestReceipt?.apply_mode ?? options.apply_mode,
    status_detail: latestReceipt?.status_detail ?? options.status_detail,
    post_apply_action_statuses: latestActionStatuses,
    reload_guidance: latestReceipt?.reload_guidance ?? options.reload_guidance,
  };
}

export function managedUpdateComponentMatches(component: ManagedUpdateComponent, componentId: string) {
  return component.component_id === componentId
    || component.lifecycle_owner === componentId
    || component.provider_id === componentId;
}

export function filterManagedUpdateComponents(
  components: ManagedUpdateComponent[],
  componentId: string | undefined,
) {
  if (!componentId) {
    return components;
  }
  const requested = componentId.trim();
  return components.filter((entry) => managedUpdateComponentMatches(entry, requested));
}

export function summarizeManagedUpdateComponents(components: ManagedUpdateComponent[]) {
  return {
    total_components_count: components.length,
    current_components_count: components.filter((entry) => entry.state === 'current').length,
    update_available_components_count: components.filter((entry) => entry.state === 'update_available').length,
    staged_components_count: components.filter((entry) => entry.state === 'staged').length,
    restart_required_components_count: components.filter((entry) => entry.state === 'needs_restart').length,
    reload_required_components_count: components.filter((entry) => entry.state === 'needs_reload').length,
    failed_with_repair_components_count: components.filter((entry) => entry.state === 'failed_with_repair').length,
    skipped_manual_required_components_count: components.filter((entry) => entry.state === 'skipped_manual_required').length,
  };
}

export function managedUpdateOperationMode(operation: ManagedUpdateOperation) {
  if (operation === 'apply') {
    return 'controlled_apply';
  }
  if (operation === 'repair') {
    return 'controlled_repair';
  }
  if (operation === 'rollback') { // reuse-first: allow owner-routed operation vocabulary.
    return 'controlled_rollback';
  }
  return 'read_only_projection';
}

export function managedUpdateReceiptWritePolicy(operation: ManagedUpdateOperation) {
  if (operation === 'status' || operation === 'check' || operation === 'plan') {
    return 'read_only';
  }
  return 'recorded_component_receipt';
}

export function managedUpdateComponentCanRunOperation(
  component: ManagedUpdateComponent,
  operation: ManagedUpdateOperation,
) {
  if (operation === 'status' || operation === 'check' || operation === 'plan') {
    return true;
  }
  return component.owner_execution_boundary.runner_can_execute
    && component.owner_execution_boundary.allowed_operations.includes(operation);
}

export function selectedManagedUpdateComponentIds(
  input: ManagedUpdateKernelInput,
  components: ManagedUpdateComponent[],
) {
  const ids = components
    .filter((component) => !input.componentId || managedUpdateComponentMatches(component, input.componentId))
    .filter((component) => managedUpdateComponentCanRunOperation(component, input.operation))
    .filter((component) => input.componentId || input.operation !== 'apply' || (
      component.auto_apply.eligible
      && component.auto_apply.app_background_safe
      && Boolean(component.auto_apply.command_ref)
    ))
    .map((component) => component.component_id);
  return ids;
}

export function bindOwnerExecutionResult<T extends {
  owner_route?: ManagedUpdateOwnerRoute;
  owner_execution_boundary?: ManagedUpdateOwnerExecutionBoundary;
}>(
  component: ManagedUpdateComponent,
  result: T,
): T & {
  owner_route: ManagedUpdateOwnerRoute;
  owner_execution_boundary: ManagedUpdateOwnerExecutionBoundary;
} {
  return {
    ...result,
    owner_route: component.owner_route,
    owner_execution_boundary: component.owner_execution_boundary,
  };
}

export function managedUpdatePostApplyStatus(
  actions: ManagedUpdateOwnerPostApplyAction[],
  fallbackStatus: ManagedUpdateOwnerExecutionStatus,
): ManagedUpdateReceiptStatusDetail['post_apply_status'] {
  if (actions.length > 0) {
    if (actions.some((entry) => entry.status === 'failed')) {
      return 'failed';
    }
    if (actions.some((entry) => entry.status === 'manual_required')) {
      return 'manual_required';
    }
    return 'completed';
  }
  if (fallbackStatus === 'failed' || fallbackStatus === 'partial_failure') {
    return 'failed';
  }
  if (fallbackStatus === 'manual_required' || fallbackStatus === 'partial_success') {
    return 'manual_required';
  }
  return fallbackStatus === 'skipped' ? 'skipped' : 'not_run';
}

export function managedUpdateReloadStatus(
  guidance: ManagedUpdateReloadGuidance,
  fallbackStatus: ManagedUpdateOwnerExecutionStatus,
): ManagedUpdateReceiptStatusDetail['reload_status'] {
  if (guidance.reload_required) {
    return 'required';
  }
  if (guidance.reload_recommended) {
    return 'recommended';
  }
  if (fallbackStatus === 'manual_required' || fallbackStatus === 'partial_success') {
    return 'manual_required';
  }
  return 'not_required';
}

function postApplyActionReceipt(
  action: ManagedUpdateOwnerPostApplyAction,
): ManagedUpdatePostApplyActionReceipt {
  return {
    action_id: action.action_id,
    status: action.status,
    result_ref: action.result_ref,
  };
}

function componentExecutionRollbackRef(componentId: string, resultRef: string | null) {
  return `opl://managed-update/${componentId}/rollback/${encodeURIComponent(resultRef ?? 'previous')}`; // reuse-first: allow owner-routed receipt ref.
}

export function managedUpdateCommand(
  operation: ManagedUpdateOperation,
  lifecycleOwner: string,
  options: { json?: boolean } = {},
) {
  const command = lifecycleOwner === 'opl_packages'
    ? operation === 'repair'
      ? 'opl packages repair --package-id <package_id>'
      : 'opl packages update'
    : lifecycleOwner === 'opl_app'
      ? 'opl app state --profile fast'
      : `opl update ${operation}`;
  return [
    command,
    options.json === false ? null : '--json',
  ].filter(Boolean).join(' ');
}

export function managedUpdateComponentReceiptInput(input: {
  operation: ManagedUpdateOperation;
  component: ManagedUpdateComponent;
  result: ManagedUpdateOwnerExecutionReceiptResult;
}): ManagedUpdateComponentReceiptInput {
  const postApplyActions = input.result.post_apply_actions ?? [];
  const reloadGuidance = input.result.reload_guidance ?? input.component.receipt.reload_guidance;
  const statusDetail = input.result.status_detail ?? {
    ...input.component.receipt.status_detail,
    post_apply_status: managedUpdatePostApplyStatus(postApplyActions, input.result.status),
    reload_status: managedUpdateReloadStatus(reloadGuidance, input.result.status),
  };
  return {
    operation: input.operation,
    component_id: input.component.component_id,
    provider_id: input.component.provider_id,
    adapter_id: input.component.adapter_id,
    source_manifest_ref: input.component.receipt.source_manifest_ref,
    from_version: input.component.receipt.from_version,
    from_digest: input.component.receipt.from_digest,
    to_version: input.component.receipt.to_version,
    to_digest: input.component.receipt.to_digest,
    verify_result: input.result.status === 'failed' || input.result.status === 'partial_failure'
      ? 'failed'
      : input.result.status === 'manual_required'
        ? 'unknown'
        : 'passed',
    post_apply_hooks: input.component.post_apply_hooks,
    rollback_ref: input.result.status === 'completed'
      || input.result.status === 'partial_success'
      || input.result.status === 'partial_failure'
      ? componentExecutionRollbackRef(input.component.component_id, input.result.result_ref)
      : input.component.receipt.rollback_ref,
    repair_action: input.result.status === 'failed'
      || input.result.status === 'manual_required'
      || input.result.status === 'partial_success'
      || input.result.status === 'partial_failure'
      ? input.component.receipt.repair_action ?? input.component.plan.command_refs[0]?.action_id ?? null
      : input.component.receipt.repair_action,
    adapter_result_ref: input.result.result_ref,
    apply_mode: input.result.apply_mode ?? input.component.receipt.apply_mode,
    owner_projection: input.result.owner_route ?? input.component.owner_route,
    status_detail: statusDetail,
    post_apply_action_statuses: postApplyActions.map(postApplyActionReceipt),
    reload_guidance: reloadGuidance,
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
  current_targets_count?: number | null;
  changed_targets_count?: number | null;
  manual_required_targets_count?: number | null;
  failed_targets_count?: number | null;
  post_apply_status?: ManagedUpdateReceiptStatusDetail['post_apply_status'];
  reload_status?: ManagedUpdateReceiptStatusDetail['reload_status'];
}): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: input.component_state,
    auto_apply_eligible: input.auto_apply_eligible ?? false,
    app_background_safe: input.app_background_safe ?? false,
    clean_managed_targets_count: input.clean_managed_targets_count ?? null,
    current_targets_count: input.current_targets_count ?? null,
    changed_targets_count: input.changed_targets_count ?? null,
    manual_required_targets_count: input.manual_required_targets_count ?? null,
    failed_targets_count: input.failed_targets_count ?? null,
    post_apply_status: input.post_apply_status ?? 'not_run',
    reload_status: input.reload_status ?? 'not_required',
  };
}
