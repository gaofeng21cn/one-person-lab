export const DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID = 'opl_domain_lifecycle_admission.v1' as const;

export const DEFAULT_REACTIVATION_RECEIPT_FIELD = 'mas_study_lifecycle_reactivation_receipt';
export const DEFAULT_MATERIALIZATION_AUTHORIZATION_FIELD = 'mas_lifecycle_cas_mutation_authorization';
export const REQUEST_FIELD_MAP_KEYS = [
  'work_item_id',
  'reactivation_request',
  'authority_context',
  'work_item_identity',
  'user_authority',
  'reviewer_revision_intake',
  'current_lifecycle',
  'profile',
  'projection_inventory',
] as const;
export const INITIALIZATION_REQUEST_FIELD_MAP_KEYS = [
  'authority_context',
  'work_item_identity',
  'current_inventory',
] as const;

export type ReactivationRequestInputField = typeof REQUEST_FIELD_MAP_KEYS[number];
export type InitializationRequestInputField = typeof INITIALIZATION_REQUEST_FIELD_MAP_KEYS[number];

export type LifecycleProjectionSource = {
  projection_id: string;
  root: 'workspace' | 'work_item';
  relative_path: string;
  required: boolean;
  media_type: 'application/json';
};

export const EXACT_BYTE_BINDING_SOURCE_KEYS = [
  'user_authority',
  'reviewer_revision_intake',
  'current_lifecycle',
  'projection_target',
] as const;
export const EXACT_BYTE_BINDING_FIELD_KEYS = ['bytes_base64', 'byte_size', 'sha256', 'record'] as const;

export type ExactByteBindingSource = typeof EXACT_BYTE_BINDING_SOURCE_KEYS[number];
export type ExactByteBindingField = typeof EXACT_BYTE_BINDING_FIELD_KEYS[number];
export type ExactByteBindingFieldMap = Record<ExactByteBindingField, string>;
export type LifecycleExactByteBindingFields = Record<ExactByteBindingSource, ExactByteBindingFieldMap>;

export type StandardAgentLifecycleAdmissionContract = {
  capability_id: typeof DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID;
  work_item_id_field: string;
  lifecycle_state_field: string;
  lifecycle_generation_field: string;
  active_state: string;
  stopped_state: string;
  admission_payload_field: string;
  reactivation_action_id: string;
  reactivation_receipt_output_field: string;
  materialization_authorization_output_field: string;
  required_wakeup_gate_id: string;
  stopped_relaunch_gate_id: string;
  reactivation_projection_sources: LifecycleProjectionSource[];
  reactivation_request_input_field_map: Record<ReactivationRequestInputField, string>;
  exact_byte_binding_fields: LifecycleExactByteBindingFields | null;
  initialization_action_id: string | null;
  initialization_receipt_output_field: string | null;
  initialization_materialization_authorization_output_field: string | null;
  initialization_request_input_field_map: Record<InitializationRequestInputField, string> | null;
};

export type ExactFile = {
  file: string;
  ref: string;
  bytes: Buffer;
  sha256: string;
  payload: Record<string, unknown>;
};

export type LocatedLifecycle = {
  descriptorDomainId: string;
  inventory: ExactFile;
  inventoryItem: Record<string, unknown>;
  workItemRoot: string;
  lifecycle: ExactFile;
};

export type LocatedWorkItemIdentity = {
  descriptorDomainId: string;
  inventory: ExactFile;
  inventoryItem: Record<string, unknown>;
  inventoryItemIndex: number;
  workItemRoot: string;
};

export type StandardAgentLifecycleReactivationRequest = {
  user_authority_ref: string;
  user_authority_sha256: string;
  reviewer_revision_intake_ref: string;
  reviewer_revision_intake_sha256: string;
  current_lifecycle_ref: string;
  current_lifecycle_sha256: string;
  profile_ref: string;
  profile_sha256: string;
  observed_lifecycle_state: string;
  observed_lifecycle_generation: number;
  explicit_user_wakeup: boolean;
  allow_stopped_relaunch: boolean;
  requested_at: string;
  reason_code: 'reviewer_revision_reactivation';
  reason_summary: string;
};

export type ParsedStandardAgentLifecycleAdmission =
  | {
      mode: 'reactivation_request';
      value: Record<string, unknown>;
      reactivationRequest: StandardAgentLifecycleReactivationRequest;
    }
  | {
      mode: 'materialized_receipt';
      value: Record<string, unknown>;
      domainAuthorityResultRef: string;
      domainAuthorityResultSha256: string;
      materializationReceiptRef: string;
      materializationReceiptSha256: string;
    }
  | {
      mode: 'initialization_receipt';
      value: Record<string, unknown>;
      domainAuthorityResultRef: string;
      domainAuthorityResultSha256: string;
      materializationReceiptRef: string;
      materializationReceiptSha256: string;
    };

export type StandardAgentLifecycleReactivationBinding = {
  contract: StandardAgentLifecycleAdmissionContract;
  handlerActionId: string;
  handlerRunId: string;
  admissionPayloadField: string;
  admissionScopeId: string;
  originalAdmissionRequestRef: string;
  originalAdmissionRequestSha256: string;
  ownerLedgerRef: string;
};

export type PreparedStandardAgentLifecycleReactivation = StandardAgentLifecycleReactivationBinding & {
  handlerPayload: Record<string, unknown>;
};

export type StandardAgentLifecycleInitializationBinding = {
  contract: StandardAgentLifecycleAdmissionContract;
  handlerActionId: string;
  handlerRunId: string;
  admissionPayloadField: string;
  admissionScopeId: string;
  originalAdmissionRequestRef: string;
  originalAdmissionRequestSha256: string;
  ownerLedgerRef: string;
  workItemId: string;
};

export type PreparedStandardAgentLifecycleInitialization = StandardAgentLifecycleInitializationBinding & {
  handlerPayload: Record<string, unknown>;
};
