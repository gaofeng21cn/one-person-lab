export type ManagedUpdateOperation = 'status' | 'check' | 'plan' | 'apply' | 'repair' | 'rollback';
export const MANAGED_UPDATE_OWNER_ACTIONS = {
  revert: 'rollback' as ManagedUpdateOperation,
} as const satisfies Record<string, ManagedUpdateOperation>;
export const MANAGED_UPDATE_OWNER_FIELDS = {
  sourceRef: 'source_manifest_ref',
  fromDigest: 'from_digest',
  toDigest: 'to_digest',
  postApplyHooks: 'post_apply_hooks',
  revertRef: 'rollback_ref',
  revertPlan: MANAGED_UPDATE_OWNER_ACTIONS.revert,
} as const;
export const CAPABILITY_PACKAGE_OWNER = 'one-person-lab-managed-modules';
export const CAPABILITY_PACKAGE_APPLY_OWNER = 'opl_connect_managed_module_reconciler';
export const CAPABILITY_PACKAGE_READBACK_REF = 'opl packages list --json';
export const CAPABILITY_PACKAGE_STATUS_READBACK_REF = 'opl packages list --json';
export const CAPABILITY_PACKAGE_APPLY_COMMAND = 'opl packages update --json';
export const CAPABILITY_PACKAGE_REPAIR_COMMAND = 'opl packages repair --package-id <package_id> --json';
export const CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS = [
  'capability_package_channel_signs_owner_receipt',
  'capability_package_channel_writes_domain_truth',
  'managed_update_kernel_is_package_manager',
] as const;

export type ManagedUpdateProviderId =
  | 'installation_carrier'
  | 'runtime_substrate'
  | 'capability_packages';
export type ManagedUpdateProviderAdapterId =
  | 'installation_carrier_status_adapter'
  | 'runtime_substrate_adapter'
  | 'capability_packages_adapter';

export type ManagedUpdateReceiptApplyMode =
  | 'projection_only'
  | 'auto_apply'
  | 'controlled_apply'
  | 'manual_required';

export type ManagedUpdatePostApplyActionReceipt = {
  action_id: string;
  status: 'completed' | 'skipped' | 'manual_required' | 'failed';
  result_ref: string | null;
};

export type ManagedUpdateReloadGuidance = {
  reload_required: boolean;
  reload_recommended: boolean;
  reload_targets: string[];
  command_ref: string | null;
  reason: string | null;
};

export type ManagedUpdateReceiptStatusDetail = {
  component_state: string | null;
  auto_apply_eligible: boolean | null;
  app_background_safe: boolean | null;
  clean_managed_targets_count: number | null;
  manual_required_targets_count: number | null;
  post_apply_status: 'not_run' | 'completed' | 'manual_required' | 'failed' | 'skipped' | 'unknown';
  reload_status: 'not_required' | 'recommended' | 'required' | 'manual_required' | 'unknown';
};

export type ManagedUpdateOwnerReceiptProjection = {
  owner: string;
  authority_surface: string;
  route_kind: string;
  readback_ref: string;
  apply_owner: string;
  package_manager_claim: false;
  forbidden_claims: string[];
};

export type ManagedUpdateComponentReceipt = {
  surface_kind: 'opl_managed_update_component_receipt';
  schema_version: 'opl_managed_update_component_receipt.v1';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  operation: ManagedUpdateOperation;
  component_id: string;
  provider_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  source_manifest_ref: string | null;
  from_version: string | null;
  from_digest: string | null;
  to_version: string | null;
  to_digest: string | null;
  verify_result: 'passed' | 'failed' | 'unknown';
  activated_at: string;
  post_apply_hooks: string[];
  rollback_ref: string | null;
  repair_action: string | null;
  adapter_result_ref: string | null;
  apply_mode: ManagedUpdateReceiptApplyMode;
  owner_projection: ManagedUpdateOwnerReceiptProjection;
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
  reload_guidance: ManagedUpdateReloadGuidance;
  authority_boundary: {
    can_write_domain_truth: false;
    can_write_domain_memory_body: false;
    can_mutate_domain_artifact_body: false;
    can_create_owner_receipt: false;
    can_claim_quality_or_export_verdict: false;
  };
};

export type ManagedUpdateComponentReceiptInput = {
  operation: ManagedUpdateOperation;
  component_id: string;
  provider_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  source_manifest_ref: string | null;
  from_version: string | null;
  from_digest: string | null;
  to_version: string | null;
  to_digest: string | null;
  verify_result: 'passed' | 'failed' | 'unknown';
  activated_at?: string | null;
  post_apply_hooks: string[];
  rollback_ref?: string | null;
  repair_action?: string | null;
  adapter_result_ref?: string | null;
  apply_mode: ManagedUpdateReceiptApplyMode;
  owner_projection: ManagedUpdateOwnerReceiptProjection;
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
  reload_guidance: ManagedUpdateReloadGuidance;
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

function uniqueClaims(values: string[]) {
  return [...new Set(values)];
}

function isCapabilityPackageOwnerRoute(
  input: Omit<ManagedUpdateOwnerRoute, 'package_manager_claim'>,
) {
  return input.owner === CAPABILITY_PACKAGE_OWNER
    || input.apply_owner === CAPABILITY_PACKAGE_APPLY_OWNER
    || input.route_kind === 'clean_managed_package_executor'
    || input.readback_ref === CAPABILITY_PACKAGE_READBACK_REF
    || input.readback_ref === CAPABILITY_PACKAGE_STATUS_READBACK_REF;
}

export function capabilityPackageOwnerRoute(
  input: Partial<Omit<ManagedUpdateOwnerRoute, 'package_manager_claim'>> = {},
): ManagedUpdateOwnerRoute {
  return {
    owner: input.owner ?? CAPABILITY_PACKAGE_OWNER,
    authority_surface: 'descriptor/digest/lock/materializer readback over clean managed capability package roots',
    route_kind: 'clean_managed_package_executor',
    readback_ref: CAPABILITY_PACKAGE_READBACK_REF,
    apply_owner: input.apply_owner ?? CAPABILITY_PACKAGE_APPLY_OWNER,
    package_manager_claim: false,
    forbidden_claims: uniqueClaims([
      ...CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS,
      ...(input.forbidden_claims ?? []),
    ]),
  };
}

export function ownerRoute(input: Omit<ManagedUpdateOwnerRoute, 'package_manager_claim'>): ManagedUpdateOwnerRoute {
  if (isCapabilityPackageOwnerRoute(input)) {
    return capabilityPackageOwnerRoute(input);
  }
  return {
    ...input,
    package_manager_claim: false,
  };
}

export function ownerBoundaryRef(prefix: string, ...segments: string[]) {
  return `${prefix}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
