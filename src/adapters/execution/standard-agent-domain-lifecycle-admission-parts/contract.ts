import { isRecord } from '../../../kernel/contract-validation.ts';
import path from 'node:path';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';
import {
  DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID,
  DEFAULT_MATERIALIZATION_AUTHORIZATION_FIELD,
  DEFAULT_REACTIVATION_RECEIPT_FIELD,
  INITIALIZATION_REQUEST_FIELD_MAP_KEYS,
  REQUEST_FIELD_MAP_KEYS,
  type LifecycleProjectionSource,
  type ParsedStandardAgentLifecycleAdmission,
  type StandardAgentLifecycleAdmissionContract,
  type StandardAgentLifecycleReactivationRequest,
} from './types.ts';
import {
  boolean,
  digest,
  exactKeys,
  integer,
  jsonPointerText,
  lifecycleExactByteBindingFields,
  optionalContractText,
  blocked,
  text,
} from './shared.ts';

export function standardAgentLifecycleAdmissionContract(
  action: FamilyActionCatalogAction,
): StandardAgentLifecycleAdmissionContract | null {
  const value = action.authority_boundary?.lifecycle_admission_contract;
  if (value === undefined) return null;
  if (action.execution_binding.kind !== 'stage_binding' || !isRecord(value)) {
    blocked('lifecycle_admission_contract is valid only on a stage-bound action.');
  }
  const allowed = new Set([
    'capability_id',
    'work_item_id_field',
    'lifecycle_state_field',
    'lifecycle_generation_field',
    'active_state',
    'stopped_state',
    'admission_payload_field',
    'reactivation_action_id',
    'reactivation_receipt_output_field',
    'materialization_authorization_output_field',
    'required_wakeup_gate_id',
    'stopped_relaunch_gate_id',
    'reactivation_projection_sources',
    'reactivation_request_input_field_map',
    'exact_byte_binding_fields',
    'initialization_action_id',
    'initialization_receipt_output_field',
    'initialization_materialization_authorization_output_field',
    'initialization_request_input_field_map',
  ]);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    blocked('lifecycle_admission_contract contains unsupported fields.', { unsupported_fields: unsupported });
  }
  if (value.capability_id !== DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID) {
    blocked('lifecycle_admission_contract capability_id is unsupported.', { capability_id: value.capability_id });
  }
  if (!isRecord(value.reactivation_request_input_field_map)) {
    blocked('lifecycle_admission_contract.reactivation_request_input_field_map must be an object.');
  }
  const requestInputFieldMap = value.reactivation_request_input_field_map;
  exactKeys(
    requestInputFieldMap,
    REQUEST_FIELD_MAP_KEYS,
    'lifecycle_admission_contract.reactivation_request_input_field_map',
  );
  const fieldMap = Object.fromEntries(REQUEST_FIELD_MAP_KEYS.map((field) => [
    field,
    jsonPointerText(
      requestInputFieldMap[field],
      `lifecycle_admission_contract.reactivation_request_input_field_map.${field}`,
    ),
  ])) as Record<typeof REQUEST_FIELD_MAP_KEYS[number], string>;
  const pointers = Object.values(fieldMap);
  if (new Set(pointers).size !== pointers.length || pointers.some((left) => (
    pointers.some((right) => left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`)))
  ))) blocked('reactivation_request_input_field_map pointers must be unique and non-overlapping.');
  if (!Array.isArray(value.reactivation_projection_sources) || value.reactivation_projection_sources.length === 0) {
    blocked('lifecycle_admission_contract.reactivation_projection_sources must be a non-empty array.');
  }
  const projectionIds = new Set<string>();
  const projectionSources = value.reactivation_projection_sources.map((entry, index): LifecycleProjectionSource => {
    if (!isRecord(entry)) blocked('reactivation_projection_sources entries must be objects.', { index });
    exactKeys(
      entry,
      ['projection_id', 'root', 'relative_path', 'required', 'media_type'],
      `reactivation_projection_sources[${index}]`,
    );
    const projectionId = text(entry.projection_id, `reactivation_projection_sources[${index}].projection_id`);
    if (projectionIds.has(projectionId)) {
      blocked('reactivation_projection_sources projection_id values must be unique.', { projection_id: projectionId });
    }
    projectionIds.add(projectionId);
    if (entry.root !== 'workspace' && entry.root !== 'work_item') {
      blocked('reactivation_projection_sources root is unsupported.', { index });
    }
    if (entry.media_type !== 'application/json') {
      blocked('reactivation_projection_sources media_type must be application/json.', { index });
    }
    const relativePath = text(entry.relative_path, `reactivation_projection_sources[${index}].relative_path`);
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/u).includes('..')) {
      blocked('reactivation_projection_sources relative_path must stay inside its declared root.', { index });
    }
    return {
      projection_id: projectionId,
      root: entry.root,
      relative_path: relativePath,
      required: boolean(entry.required, `reactivation_projection_sources[${index}].required`),
      media_type: 'application/json',
    };
  });
  const initializationFields = [
    'initialization_action_id',
    'initialization_receipt_output_field',
    'initialization_materialization_authorization_output_field',
    'initialization_request_input_field_map',
  ] as const;
  const initializationFieldCount = initializationFields.filter((field) => value[field] !== undefined).length;
  if (initializationFieldCount !== 0 && initializationFieldCount !== initializationFields.length) {
    blocked('lifecycle_admission_contract initialization fields must be declared together.');
  }
  let initializationFieldMap = null;
  if (initializationFieldCount > 0) {
    const rawInitializationFieldMap = value.initialization_request_input_field_map;
    if (!isRecord(rawInitializationFieldMap)) {
      blocked('lifecycle_admission_contract.initialization_request_input_field_map must be an object.');
    }
    exactKeys(
      rawInitializationFieldMap,
      INITIALIZATION_REQUEST_FIELD_MAP_KEYS,
      'lifecycle_admission_contract.initialization_request_input_field_map',
    );
    initializationFieldMap = Object.fromEntries(INITIALIZATION_REQUEST_FIELD_MAP_KEYS.map((field) => [
      field,
      jsonPointerText(
        rawInitializationFieldMap[field],
        `lifecycle_admission_contract.initialization_request_input_field_map.${field}`,
      ),
    ])) as Record<typeof INITIALIZATION_REQUEST_FIELD_MAP_KEYS[number], string>;
    const initializationPointers = Object.values(initializationFieldMap);
    if (
      new Set(initializationPointers).size !== initializationPointers.length
      || initializationPointers.some((left) => initializationPointers.some((right) => (
        left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`))
      )))
    ) blocked('initialization_request_input_field_map pointers must be unique and non-overlapping.');
  }
  return {
    capability_id: DOMAIN_LIFECYCLE_ADMISSION_CAPABILITY_ID,
    work_item_id_field: text(value.work_item_id_field, 'lifecycle_admission_contract.work_item_id_field'),
    lifecycle_state_field: text(value.lifecycle_state_field, 'lifecycle_admission_contract.lifecycle_state_field'),
    lifecycle_generation_field: text(
      value.lifecycle_generation_field,
      'lifecycle_admission_contract.lifecycle_generation_field',
    ),
    active_state: text(value.active_state, 'lifecycle_admission_contract.active_state'),
    stopped_state: text(value.stopped_state, 'lifecycle_admission_contract.stopped_state'),
    admission_payload_field: text(value.admission_payload_field, 'lifecycle_admission_contract.admission_payload_field'),
    reactivation_action_id: text(value.reactivation_action_id, 'lifecycle_admission_contract.reactivation_action_id'),
    reactivation_receipt_output_field: optionalContractText(
      value,
      'reactivation_receipt_output_field',
      DEFAULT_REACTIVATION_RECEIPT_FIELD,
    ),
    materialization_authorization_output_field: optionalContractText(
      value,
      'materialization_authorization_output_field',
      DEFAULT_MATERIALIZATION_AUTHORIZATION_FIELD,
    ),
    required_wakeup_gate_id: optionalContractText(value, 'required_wakeup_gate_id', 'explicit_user_wakeup'),
    stopped_relaunch_gate_id: optionalContractText(value, 'stopped_relaunch_gate_id', 'allow_stopped_relaunch'),
    reactivation_projection_sources: projectionSources,
    reactivation_request_input_field_map: fieldMap,
    exact_byte_binding_fields: lifecycleExactByteBindingFields(value.exact_byte_binding_fields),
    initialization_action_id: initializationFieldCount === 0
      ? null
      : text(value.initialization_action_id, 'lifecycle_admission_contract.initialization_action_id'),
    initialization_receipt_output_field: initializationFieldCount === 0
      ? null
      : text(
          value.initialization_receipt_output_field,
          'lifecycle_admission_contract.initialization_receipt_output_field',
        ),
    initialization_materialization_authorization_output_field: initializationFieldCount === 0
      ? null
      : text(
          value.initialization_materialization_authorization_output_field,
          'lifecycle_admission_contract.initialization_materialization_authorization_output_field',
        ),
    initialization_request_input_field_map: initializationFieldMap,
  };
}

function parseReactivationRequest(value: unknown): StandardAgentLifecycleReactivationRequest {
  if (!isRecord(value)) blocked('reactivation_request must be an object.');
  const fields = [
    'user_authority_ref',
    'user_authority_sha256',
    'reviewer_revision_intake_ref',
    'reviewer_revision_intake_sha256',
    'current_lifecycle_ref',
    'current_lifecycle_sha256',
    'profile_ref',
    'profile_sha256',
    'observed_lifecycle_state',
    'observed_lifecycle_generation',
    'explicit_user_wakeup',
    'allow_stopped_relaunch',
    'requested_at',
    'reason_code',
    'reason_summary',
  ] as const;
  exactKeys(value, fields, 'reactivation_request');
  const requestedAt = text(value.requested_at, 'reactivation_request.requested_at');
  if (!Number.isFinite(Date.parse(requestedAt))) blocked('reactivation_request.requested_at must be an ISO date-time.');
  if (value.reason_code !== 'reviewer_revision_reactivation') {
    blocked('reactivation_request.reason_code is unsupported.', { reason_code: value.reason_code });
  }
  return {
    user_authority_ref: text(value.user_authority_ref, 'reactivation_request.user_authority_ref'),
    user_authority_sha256: digest(value.user_authority_sha256, 'reactivation_request.user_authority_sha256'),
    reviewer_revision_intake_ref: text(
      value.reviewer_revision_intake_ref,
      'reactivation_request.reviewer_revision_intake_ref',
    ),
    reviewer_revision_intake_sha256: digest(
      value.reviewer_revision_intake_sha256,
      'reactivation_request.reviewer_revision_intake_sha256',
    ),
    current_lifecycle_ref: text(value.current_lifecycle_ref, 'reactivation_request.current_lifecycle_ref'),
    current_lifecycle_sha256: digest(value.current_lifecycle_sha256, 'reactivation_request.current_lifecycle_sha256'),
    profile_ref: text(value.profile_ref, 'reactivation_request.profile_ref'),
    profile_sha256: digest(value.profile_sha256, 'reactivation_request.profile_sha256'),
    observed_lifecycle_state: text(value.observed_lifecycle_state, 'reactivation_request.observed_lifecycle_state'),
    observed_lifecycle_generation: integer(
      value.observed_lifecycle_generation,
      'reactivation_request.observed_lifecycle_generation',
    ),
    explicit_user_wakeup: boolean(value.explicit_user_wakeup, 'reactivation_request.explicit_user_wakeup'),
    allow_stopped_relaunch: boolean(
      value.allow_stopped_relaunch,
      'reactivation_request.allow_stopped_relaunch',
    ),
    requested_at: requestedAt,
    reason_code: 'reviewer_revision_reactivation',
    reason_summary: text(value.reason_summary, 'reactivation_request.reason_summary'),
  };
}

export function parseStandardAgentLifecycleAdmission(value: unknown): ParsedStandardAgentLifecycleAdmission {
  if (!isRecord(value)) blocked('lifecycle_admission must be an object.');
  if (
    value.surface_kind !== 'opl_domain_lifecycle_admission'
    || value.version !== 'opl-domain-lifecycle-admission.v1'
  ) blocked('lifecycle_admission identity is unsupported.');
  if (value.mode === 'reactivation_request') {
    exactKeys(value, ['surface_kind', 'version', 'mode', 'reactivation_request'], 'lifecycle_admission');
    return {
      mode: 'reactivation_request',
      value,
      reactivationRequest: parseReactivationRequest(value.reactivation_request),
    };
  }
  if (value.mode === 'materialized_receipt') {
    exactKeys(value, [
      'surface_kind',
      'version',
      'mode',
      'domain_authority_result_ref',
      'domain_authority_result_sha256',
      'materialization_receipt_ref',
      'materialization_receipt_sha256',
    ], 'lifecycle_admission');
    return {
      mode: 'materialized_receipt',
      value,
      domainAuthorityResultRef: text(value.domain_authority_result_ref, 'domain_authority_result_ref'),
      domainAuthorityResultSha256: digest(value.domain_authority_result_sha256, 'domain_authority_result_sha256'),
      materializationReceiptRef: text(value.materialization_receipt_ref, 'materialization_receipt_ref'),
      materializationReceiptSha256: digest(value.materialization_receipt_sha256, 'materialization_receipt_sha256'),
    };
  }
  if (value.mode === 'initialization_receipt') {
    exactKeys(value, [
      'surface_kind',
      'version',
      'mode',
      'domain_authority_result_ref',
      'domain_authority_result_sha256',
      'materialization_receipt_ref',
      'materialization_receipt_sha256',
    ], 'lifecycle_admission');
    return {
      mode: 'initialization_receipt',
      value,
      domainAuthorityResultRef: text(value.domain_authority_result_ref, 'domain_authority_result_ref'),
      domainAuthorityResultSha256: digest(value.domain_authority_result_sha256, 'domain_authority_result_sha256'),
      materializationReceiptRef: text(value.materialization_receipt_ref, 'materialization_receipt_ref'),
      materializationReceiptSha256: digest(value.materialization_receipt_sha256, 'materialization_receipt_sha256'),
    };
  }
  blocked('lifecycle_admission.mode is unsupported.', { mode: value.mode ?? null });
}
