import type { ConsumerOnlyTruthSurface } from './types.ts';

export const SETTINGS_CONTROL_CENTER_CONTRACT_REF =
  'contracts/opl-framework/settings-control-center-action-read-model-contract.json';

export const APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES = [
  'refresh_trigger',
  'ui_maintenance',
  'poll_existing_read_model',
] as const;

export const APP_AION_FORBIDDEN_LOCAL_SCHEDULER_ROLES = [
  'write_policy_truth',
  'write_currentness_truth',
  'write_runtime_truth',
  'write_release_truth',
  'write_domain_private_platform_truth',
  'create_owner_receipt',
  'create_typed_blocker',
] as const;

export const APP_AION_FORBIDDEN_TRUTH_ONLY_PATHS = [
  'aion_shell_settings_store_as_policy_truth',
  'aion_local_scheduler_as_update_truth',
  'app_local_read_model_as_runtime_truth_without_opl_source_ref',
  'shell_docker_probe_as_runtime_ready_claim',
  'gui_release_status_without_app_owner_receipt_or_typed_blocker',
  'private_platform_cleanup_lane_as_ordinary_settings_status',
] as const;

export const APP_AION_REQUIRED_USER_VISIBLE_BOUNDARY_FIELDS = [
  'owner',
  'current_source_ref',
  'blocked_reason',
  'receipt_ref_or_typed_blocker_ref',
  'delegated_action_id',
] as const;

export const APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY = {
  app_aion_can_write_policy_truth: false,
  app_aion_can_write_runtime_truth: false,
  app_aion_can_write_release_truth: false,
  app_aion_can_write_domain_truth: false,
  app_aion_can_create_owner_receipt: false,
  app_aion_can_create_typed_blocker: false,
  app_aion_can_authorize_private_platform_cleanup: false,
  app_aion_can_claim_app_release_ready: false,
  app_aion_can_claim_production_ready: false,
} as const;

export const APP_AION_CONSUMER_ONLY_TRUTH_SURFACES: ConsumerOnlyTruthSurface[] = [
  {
    surface: 'settings_policy',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab framework settings_control_center contract plus one-person-lab-app product contract',
    app_aion_role: 'render read model and route listed actions',
    local_truth_allowed: false,
    current_source_ref: 'app_state.settings_control_center.contract_ref',
    delegated_action_id: 'app_state.settings_control_center.allowed_action_ids',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: null,
    required_visible_refs: ['owner', 'current_source_ref', 'delegated_action_id'],
  },
  {
    surface: 'app_release_and_installer',
    owner: 'one-person-lab-app',
    truth_owner: 'one-person-lab-app release owner',
    app_aion_role: 'display release owner status, blocker, or receipt ref',
    local_truth_allowed: false,
    current_source_ref: 'app_state.release',
    delegated_action_id: 'settings_check_app_update',
    receipt_ref_or_typed_blocker_ref: null,
    app_owner_receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'app_owner_receipt_or_typed_blocker_required_before_release_currentness_claim',
    required_visible_refs: [
      'app_owner_receipt_ref_or_typed_blocker_ref',
      'current_source_ref',
      'blocked_reason',
    ],
  },
  {
    surface: 'runtime_provider_and_stage_status',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab Runway, StageRun, Temporal provider, and current_owner_delta read model',
    app_aion_role: 'consume opl app state fast/full or explicit operator detail readback',
    local_truth_allowed: false,
    current_source_ref: 'app_state.operator.current_owner_delta_read_model',
    delegated_action_id: 'runtime_operator_detail_readback',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: null,
    current_owner_delta_ref: 'app_state.operator.current_owner_delta',
    runtime_status_source_ref: 'app_state.provider.temporal',
    owner_route_ref: 'app_state.operator.current_owner_delta_read_model.owner_route',
    required_visible_refs: [
      'current_owner_delta_ref',
      'runtime_status_source_ref',
      'owner_route_ref',
    ],
  },
  {
    surface: 'managed_module_and_capability_packages',
    owner: 'one-person-lab',
    truth_owner: 'one-person-lab Packages fresh status and presence projection',
    app_aion_role: 'show functional package readiness and package action refs while source carriers remain provenance',
    local_truth_allowed: false,
    current_source_ref: 'app_state.agent_packages.status_index',
    delegated_action_id: 'agent_package_repair',
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'repair_only_when_installed_enabled_package_has_no_fresh_runnable_readback',
    package_descriptor_ref: 'app_state.agent_packages.directory',
    required_visible_refs: [
      'package_descriptor_ref',
      'receipt_ref_or_typed_blocker_ref',
      'delegated_action_id',
    ],
  },
  {
    surface: 'domain_private_platform_residue',
    owner: 'domain-owner-via-private-platform-cleanup-lane',
    truth_owner: 'domain-private-platform-tail-matrix cleanup lane plus domain owner decision',
    app_aion_role: 'developer/operator detail only; never default Settings or first-screen truth',
    local_truth_allowed: false,
    current_source_ref: 'contracts/opl-framework/domain-private-platform-tail-matrix.json',
    delegated_action_id: null,
    receipt_ref_or_typed_blocker_ref: null,
    blocked_reason: 'domain_owner_decision_required_before_private_platform_cleanup_status_claim',
    cleanup_lane_ref: 'contracts/opl-framework/domain-private-platform-tail-matrix.json',
    domain_owner_decision_ref_or_typed_blocker_ref: null,
    required_visible_refs: [
      'cleanup_lane_ref',
      'domain_owner_decision_ref_or_typed_blocker_ref',
    ],
  },
];

function visibleBoundaryValuePresent(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}
function consumerOnlySurfaceField(surface: ConsumerOnlyTruthSurface, field: string) {
  return (surface as unknown as Record<string, unknown>)[field];
}

export function buildAppAionConsumerOnlyReadback() {
  const truthSurfaces = APP_AION_CONSUMER_ONLY_TRUTH_SURFACES.map((surface) => ({ ...surface }));
  const validatorFindings = truthSurfaces.flatMap((surface) =>
    surface.required_visible_refs
      .filter((field) => !visibleBoundaryValuePresent(consumerOnlySurfaceField(surface, field)))
      .map((field) => ({
        finding_id: `${surface.surface}:${field}:missing_required_visible_ref`,
        severity: 'attention',
        surface: surface.surface,
        missing_field: field,
        blocked_reason: 'required_visible_boundary_field_missing',
        required_next_evidence: 'owner_current_source_delegated_action_or_receipt_blocker_ref',
      }))
  );
  const forbiddenAuthorityFlagsEnabled = Object.entries(APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY)
    .filter(([, value]) => value !== false)
    .map(([field]) => field);
  const forbiddenSchedulerRolesEnabled: string[] = [];

  return {
    surface_kind: 'opl_app_aion_consumer_only_readback.v1',
    schema_version: 'opl_app_aion_consumer_only_readback.v1',
    source_contract_ref: SETTINGS_CONTROL_CENTER_CONTRACT_REF,
    source_phase: 'reuse_first_platform_risk_audit_phase_8',
    readback_scope: 'opl_framework_contract_readback_only_no_app_or_aion_repo_mutation',
    validation_status: validatorFindings.length === 0
        && forbiddenAuthorityFlagsEnabled.length === 0
        && forbiddenSchedulerRolesEnabled.length === 0
      ? 'pass'
      : 'attention_required',
    validator_findings: [
      ...validatorFindings,
      ...forbiddenAuthorityFlagsEnabled.map((field) => ({
        finding_id: `authority_boundary:${field}:must_be_false`,
        severity: 'blocker',
        surface: 'authority_boundary',
        missing_field: field,
        blocked_reason: 'app_aion_forbidden_authority_enabled',
        required_next_evidence: 'authority_flag_false',
      })),
      ...forbiddenSchedulerRolesEnabled.map((field) => ({
        finding_id: `local_scheduler:${field}:forbidden_role_enabled`,
        severity: 'blocker',
        surface: 'local_scheduler_policy',
        missing_field: field,
        blocked_reason: 'local_scheduler_truth_role_enabled',
        required_next_evidence: 'scheduler_role_refresh_ui_poll_only',
      })),
    ],
    truth_surfaces: truthSurfaces,
    local_scheduler_policy: {
      aion_local_scheduler_allowed_roles: [...APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES],
      observed_local_scheduler_roles: [...APP_AION_ALLOWED_LOCAL_SCHEDULER_ROLES],
      forbidden_roles: [...APP_AION_FORBIDDEN_LOCAL_SCHEDULER_ROLES],
      forbidden_roles_enabled: forbiddenSchedulerRolesEnabled,
      scheduler_must_delegate_to: [
        'opl app state --profile fast|full --json',
        'opl app action execute --json',
        'one-person-lab-app release owner receipt or typed blocker',
      ],
    },
    forbidden_truth_only_paths: [...APP_AION_FORBIDDEN_TRUTH_ONLY_PATHS],
    required_user_visible_boundary_fields: [...APP_AION_REQUIRED_USER_VISIBLE_BOUNDARY_FIELDS],
    authority_boundary: APP_AION_CONSUMER_ONLY_AUTHORITY_BOUNDARY,
    forbidden_claims: [
      'app_release_ready_without_app_owner_receipt_or_typed_blocker',
      'runtime_ready_from_shell_docker_probe',
      'settings_policy_truth_from_aion_local_store',
      'domain_private_cleanup_status_from_default_settings',
    ],
  };
}


