import type { OplAppOperatorViewModelInput } from '../app-state-view-model.ts';

type JsonRecord = Record<string, unknown>;

const ORDINARY_COCKPIT_DISPLAY_FIELDS = [
  'purpose',
  'task',
  'current_owner',
  'next_action',
  'artifact_or_blocker',
] as const;

const ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY = [
  'provider',
  'ledger',
  'worklist',
  'mcp_tool_catalog',
  'raw_receipts',
  'release_evidence',
] as const;

const FORBIDDEN_FAST_PROFILE_FIELDS = [
  'runtime_tray_snapshot',
  'raw_evidence_envelope',
  'raw_evidence_browser',
  'raw_ledger_browser',
  'ledger_browser',
  'stage_replay_packet_body',
  'private_residue_inventory_body',
  'provider_internal_ledger_body',
  'provider_internal_trace',
  'route_variant_menu',
] as const;

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ownerKey(value: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
}

function selectOrdinaryCockpitTaskFallback(
  currentOwner: string,
  runtimeActivityItems: ReadonlyArray<JsonRecord>,
) {
  const currentOwnerKey = ownerKey(currentOwner);
  const matching = runtimeActivityItems.filter((item) => {
    const itemOwnerKey = ownerKey(asString(item.domain_owner));
    const itemProjectKey = ownerKey(asString(item.project_id));
    return currentOwnerKey.length > 0
      && (itemOwnerKey === currentOwnerKey || itemProjectKey === currentOwnerKey);
  });
  return matching.find((item) => asString(item.lane) === 'attention')
    ?? matching.find((item) => asString(item.lane) === 'running')
    ?? matching[0]
    ?? null;
}

export function buildOrdinaryCockpit(
  currentOwnerDeltaTopline: JsonRecord,
  input: OplAppOperatorViewModelInput,
) {
  const currentOwnerDelta = asRecord(currentOwnerDeltaTopline.current_owner_delta);
  const currentOwnerDeltaReadModel = asRecord(currentOwnerDeltaTopline.current_owner_delta_read_model);
  const nextAction = asRecord(currentOwnerDeltaTopline.operator_next_action);
  const hardGate = asRecord(currentOwnerDelta.hard_gate);
  const auditRefs = asRecord(currentOwnerDelta.audit_refs);
  const currentOwner = asString(currentOwnerDelta.current_owner)
    ?? asString(currentOwnerDelta.owner)
    ?? 'one-person-lab';
  const taskFallback = selectOrdinaryCockpitTaskFallback(currentOwner, input.runtimeActivityItems);
  const taskRef = asString(currentOwnerDelta.task_or_study_ref)
    ?? asString(currentOwnerDelta.stage_ref)
    ?? asString(currentOwnerDelta.stage_id)
    ?? asString(taskFallback?.item_id)
    ?? asString(taskFallback?.study_id)
    ?? 'opl-current-owner-delta';
  const latestOwnerAnswerRef = asString(currentOwnerDelta.latest_owner_answer_ref)
    ?? asString(hardGate.owner_answer_ref)
    ?? asString(currentOwnerDelta.latest_typed_blocker_ref);
  const artifactScopeRef = asString(auditRefs.artifact_scope_ref)
    ?? asString(currentOwnerDelta.artifact_scope_ref);
  const blockerRef = asString(currentOwnerDelta.latest_typed_blocker_ref)
    ?? asString(hardGate.typed_blocker_ref);
  const actionOwner = asString(currentOwnerDeltaTopline.operator_next_action_owner)
    ?? asString(nextAction.next_required_owner)
    ?? currentOwner;
  const actionKind = asString(currentOwnerDeltaTopline.operator_next_action_kind)
    ?? asString(nextAction.action_kind)
    ?? 'owner_delta_followthrough_required';
  const actionSummary = actionOwner === 'one-person-lab'
    ? 'Continue the current stage handoff.'
    : (asString(currentOwnerDelta.desired_delta_description)
        ?? 'Return an owner receipt, typed blocker, or current stage artifact.');

  return {
    surface_kind: 'opl_app_ordinary_cockpit',
    schema_version: 'ordinary-cockpit.v1',
    display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
    ordinary_progress_spine: asRecord(currentOwnerDelta.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDelta.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDelta.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDelta.audit_sidecar_policy),
    display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
    developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    display_payload: {
      purpose: {
        purpose_id: 'continue_current_stage',
        label: 'Continue current stage',
        source_ref: 'app_state.operator.current_owner_delta',
      },
      task: {
        task_ref: taskRef,
        stage_ref: asString(currentOwnerDelta.stage_ref) ?? asString(currentOwnerDelta.stage_id),
        domain_id: asString(currentOwnerDelta.domain_id) ?? asString(currentOwnerDelta.domain),
        title: asString(taskFallback?.title),
        status_label: asString(taskFallback?.status_label),
      },
      current_owner: currentOwner,
      next_action: {
        owner: actionOwner,
        action_kind: actionKind,
        summary: actionSummary,
        source_ref: 'app_state.operator.current_owner_delta',
      },
      artifact_or_blocker: {
        status: blockerRef
          ? 'blocker_available'
          : latestOwnerAnswerRef || artifactScopeRef
            ? 'artifact_or_receipt_available'
            : 'awaiting_owner_answer',
        artifact_ref: artifactScopeRef,
        owner_answer_ref: latestOwnerAnswerRef,
        blocker_ref: blockerRef,
        expected_shape: 'owner_receipt_or_typed_blocker_or_stage_artifact_ref',
        content_policy: 'refs_only_no_artifact_or_receipt_body',
      },
    },
    authority_boundary: {
      default_next_action_derives_from: asString(
        currentOwnerDeltaReadModel.default_next_action_derivation_policy,
      ) ?? 'derive_default_next_action_only_from_current_owner_delta',
      default_planning_root: asString(currentOwnerDelta.default_planning_root)
        ?? 'current_owner_delta',
      can_write_domain_truth: false,
      can_read_artifact_body: false,
      can_read_memory_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export function buildDefaultReadSurfacePolicy(input: OplAppOperatorViewModelInput) {
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  return {
    surface_kind: 'opl_app_default_read_surface_policy',
    schema_version: 'default-read-surface-policy.v1',
    profile: input.profile,
    default_operator_payload: 'ordinary_cockpit',
    default_planning_root: 'current_owner_delta',
    ordinary_progress_spine: asRecord(currentOwnerDeltaReadModel.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDeltaReadModel.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDeltaReadModel.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDeltaReadModel.audit_sidecar_policy),
    normal_state_surface: 'opl app state --profile fast --json',
    full_state_surface: 'opl app state --profile full --json',
    full_runtime_drilldown_surface: 'opl runtime app-operator-drilldown --detail full --json',
    raw_runtime_projection_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    runtime_tray_projection_policy: 'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    worklist_projection_policy: 'secondary_drilldown_never_default_planning_root',
    first_screen_answers: [
      ...ORDINARY_COCKPIT_DISPLAY_FIELDS,
    ],
    diagnostic_only_answers: [
      'current_owner_delta',
      'current_owner_delta_read_model',
      'count_summary',
      'audit_next_safe_action_or_none',
      'full_detail_refs',
      ...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY,
    ],
    ordinary_cockpit: {
      display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
      ordinary_progress_spine_ref: 'app_state.operator.ordinary_cockpit.ordinary_progress_spine',
      progress_delta_receipt_ref: 'app_state.operator.ordinary_cockpit.progress_delta_receipt',
      artifact_tier_policy_ref: 'app_state.operator.ordinary_cockpit.artifact_tier_policy',
      audit_sidecar_policy_ref: 'app_state.operator.ordinary_cockpit.audit_sidecar_policy',
      brand_experience_profile_ref: 'app_state.operator.brand_experience_profile',
      display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
      developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    },
    fast_profile_excludes: [
      ...FORBIDDEN_FAST_PROFILE_FIELDS,
    ],
    forbidden_fast_profile_fields: [...FORBIDDEN_FAST_PROFILE_FIELDS],
    shell_contract: {
      shell_must_not_use_full_drilldown_as_normal_state: true,
      shell_must_not_derive_layout_from_raw_runtime_projection: true,
      full_detail_auto_poll: false,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
      raw_worklist_can_generate_default_next_action: false,
      raw_evidence_can_generate_default_next_action: false,
      audit_sidecar_can_generate_default_next_action: false,
    },
  };
}

export function buildBrandExperienceProfile(input: OplAppOperatorViewModelInput) {
  const ordinaryAppExperience = asRecord(input.brandSystemProfile.ordinary_app_experience);
  return {
    surface_kind: 'opl_app_brand_experience_profile',
    schema_version: 'app-brand-experience-profile.v1',
    source_profile_ref: 'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
    default_read_surface_ref: asString(ordinaryAppExperience.default_read_surface_ref)
      ?? 'app_state.operator.ordinary_cockpit',
    contract_refs: [
      'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
      'contracts/opl-framework/brand-module-l5-operating-evidence.json#evidence_classes.ordinary_app_experience',
    ],
    experience_axes: asRecordArray(ordinaryAppExperience.experience_axes).map((axis) => ({
      axis_id: asString(axis.axis_id),
      user_visible_goal: asString(axis.user_visible_goal),
      app_projection_ref: asString(axis.app_projection_ref),
      l5_evidence_class_ref: asString(axis.l5_evidence_class_ref),
      must_not_claim: Array.isArray(axis.must_not_claim)
        ? axis.must_not_claim.filter((entry): entry is string => typeof entry === 'string')
        : [],
    })),
    display_language_refs: {
      status_terms_ref: 'contracts/opl-framework/brand-system-profile.json#app_status_language.default_terms',
      visual_patterns_ref: 'contracts/opl-framework/brand-system-profile.json#visual_system.pattern_groups',
      receipt_blocker_language_ref:
        'contracts/opl-framework/brand-system-profile.json#receipt_blocker_language',
    },
    l5_evidence_refs_only: ordinaryAppExperience.l5_evidence_refs_only === true,
    authority_boundary: {
      can_claim_l5: false,
      can_claim_app_release_ready: false,
      can_authorize_quality_verdict: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  };
}

export function buildOneShotPlanLandingProfile(input: OplAppOperatorViewModelInput) {
  const model = asRecord(input.targetOperatingArchitecture.one_shot_plan_landing_model);
  const summary = asRecord(model.summary);
  const implementationSlices = asRecordArray(model.implementation_slices);
  return {
    surface_kind: 'opl_app_one_shot_plan_landing_profile',
    schema_version: 'one-shot-plan-landing-profile.v1',
    source_contract_ref:
      'contracts/opl-framework/target-operating-architecture-contract.json#one_shot_plan_landing_model',
    model_id: asString(model.model_id) ?? 'opl_family_one_shot_plan_landing.v1',
    status: summary.external_owner_evidence_still_required === true
      ? 'opl_surfaces_landed_external_owner_evidence_required'
      : 'opl_surfaces_landed_no_external_owner_gate_observed',
    summary: {
      total_plan_count: asNumber(summary.total_plan_count) ?? implementationSlices.length,
      opl_landed_count: asNumber(summary.opl_landed_count) ?? 0,
      opl_landed_owner_gated_count: asNumber(summary.opl_landed_owner_gated_count) ?? 0,
      external_owner_gated_count: asNumber(summary.external_owner_gated_count) ?? 0,
      all_opl_controlled_surfaces_landed: summary.all_opl_controlled_surfaces_landed === true,
      external_owner_evidence_still_required: summary.external_owner_evidence_still_required === true,
      ready_claim_authorized: false,
    },
    owner_gated_plan_ids: implementationSlices
      .filter((slice) => asString(slice.status) !== 'opl_landed')
      .map((slice) => asString(slice.plan_id))
      .filter((entry): entry is string => Boolean(entry)),
    visible_completion_message:
      'OPL-controlled contracts, read models, runtime routes, App projection, and evidence routers are landed; domain/App/L5/production readiness still requires owner evidence.',
    remaining_owner_gates: implementationSlices
      .filter((slice) => asString(slice.remaining_owner_gate) !== 'none')
      .map((slice) => ({
        plan_id: asString(slice.plan_id),
        title: asString(slice.title),
        status: asString(slice.status),
        remaining_owner_gate: asString(slice.remaining_owner_gate),
      })),
    validation_commands: [
      ...new Set(implementationSlices.flatMap((slice) =>
        Array.isArray(slice.validation_commands)
          ? slice.validation_commands.filter((entry): entry is string => typeof entry === 'string')
          : []
      )),
    ],
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_app_release_ready: false,
      can_claim_brand_l5_ready: false,
      can_claim_production_ready: false,
      can_claim_mas_paper_done: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
}
