import {
  isRecord,
  optionalString,
  collectFieldValues,
  readJsonFile,
  stringList,
  type JsonRecord,
} from '../../packages/index.ts';
const REQUIRED_STAGE_RUN_NATIVE_UNITS = [
  'stage_folder',
  'stage_manifest',
  'role_artifacts',
  'progress_receipt_or_owner_answer_or_hard_stop',
];

const REQUIRED_STAGE_RUN_OBJECT_MODELS = [
  'StageRun',
  'RoleArtifactRef',
  'ProgressDeltaReceipt',
  'OwnerReceipt',
  'TypedBlocker',
  'ReadModel',
];

const REQUIRED_STAGE_RUN_STATE_FLAGS = [
  'provider_completion_counts_as_domain_accepted',
  'file_presence_counts_as_stage_complete',
  'latest_json_counts_as_domain_accepted',
  'read_model_can_select_semantic_route',
  'quality_debt_counts_as_quality_acceptance',
];

const REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS = [
  'readable_artifact_counts_as_progress_input',
  'codex_can_route_to_any_declared_stage',
];

const REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS = [
  'opl_can_write_domain_truth',
  'opl_can_mutate_artifact_body',
  'opl_can_sign_domain_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_authorize_quality_or_export',
  'provider_completion_counts_as_domain_accepted',
  'read_model_can_be_truth_source',
];

const REQUIRED_STAGE_RUN_LAUNCH_HARD_BLOCKERS = [
  'identity',
  'owner',
  'scope',
  'selected_executor',
  'authority_boundary',
  'forbidden_write',
  'currentness',
  'permission_or_credential',
  'irreversible_action',
  'explicit_human_gate',
];

const STAGE_RUN_STRATEGY_ADVISORY_REFS = [
  'prompt_refs',
  'skill_refs',
  'tool_affordance_refs',
  'knowledge_refs',
  'rubric_refs',
  'evaluation_refs',
];

const REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS = [
  'candidate_generation',
  'grounded_reflection',
  'comparative_selection',
  'evolution_and_revision',
  'strategy_retrospective',
  'independent_quality_gate',
];

const REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS = [
  'candidate_pool_ref',
  'reflection_review_ref',
  'ranking_selection_ref',
  'revision_lineage_ref',
  'strategy_retrospective_ref',
  'independent_gate_ref',
];

const REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS = [
  'controlled_canary_claims_live_domain_progress',
  'provider_completion_counts_as_closeout',
  'file_presence_counts_as_closeout',
  'read_model_counts_as_closeout',
  'conformance_pass_counts_as_closeout',
  'opl_can_write_domain_truth',
  'opl_can_mutate_artifact_body',
  'opl_can_sign_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_authorize_quality_or_export',
];

const FORBIDDEN_STAGE_RUN_CANARY_CLAIM_FIELDS = [
  'domain_ready',
  'domain_ready_claimed',
  'claims_domain_ready',
  'quality_ready',
  'quality_verdict',
  'quality_or_export_authorized',
  'export_ready',
  'export_verdict',
  'publication_ready',
  'artifact_ready',
  'artifact_authority',
  'production_ready',
  'live_domain_progress',
  'live_domain_progress_claimed',
  'claims_live_domain_progress',
  'closeout_claims_live_domain_progress',
];

const FORBIDDEN_STAGE_RUN_CANARY_CLAIM_STRING_VALUES = [
  'true',
  'ready',
  'accepted',
  'approved',
  'authorized',
  'complete',
  'completed',
  'passed',
  'production_ready',
  'domain_ready',
  'live_domain_progress',
];

function refString(value: unknown) {
  return optionalString(value) ?? (isRecord(value) ? optionalString(value.ref) : null);
}

function refList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(refString).filter((entry): entry is string => Boolean(entry)))];
  }
  if (!isRecord(value)) {
    return [];
  }
  const directRef = refString(value);
  const nestedRefs = refList(value.refs);
  return [...new Set([
    ...(directRef ? [directRef] : []),
    ...nestedRefs,
  ])];
}

function falseOrNeutralClaimValue(value: unknown) {
  if (value === false || value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === ''
      || normalized === 'false'
      || normalized === '0'
      || normalized === 'pending'
      || normalized === 'domain_gate_pending'
      || normalized.startsWith('not_')
      || normalized.startsWith('no_')
      || normalized.endsWith('_pending');
  }
  return false;
}

function buildForbiddenStageRunCanaryClaimFindings(evidence: JsonRecord | null) {
  if (!evidence) {
    return [];
  }
  return FORBIDDEN_STAGE_RUN_CANARY_CLAIM_FIELDS.flatMap((field) =>
    collectFieldValues(evidence, field)
      .filter((entry) => {
        if (!falseOrNeutralClaimValue(entry.value)) {
          return true;
        }
        if (typeof entry.value !== 'string') {
          return false;
        }
        return FORBIDDEN_STAGE_RUN_CANARY_CLAIM_STRING_VALUES.includes(
          entry.value.trim().toLowerCase(),
        );
      })
      .map((entry) => ({
        path: entry.path,
        field,
        value: entry.value,
      }))
  );
}

function buildStageRunCanaryOperatorSummary(input: {
  authority: JsonRecord;
  blockers: string[];
  closeout: JsonRecord;
  currentPointerRef: string | null;
  domainId: string | null;
  evidenceScope: string | null;
  roleArtifactRefs: JsonRecord;
  stageId: string | null;
  stageManifestRef: string | null;
  stageRunRef: string | null;
  strategyTrace: JsonRecord;
  terminalOutcome: string | null;
}) {
  const cognitiveWork = REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS.map((layer) => ({
    layer,
    refs: refList(input.strategyTrace[layer]),
    ref_count: refList(input.strategyTrace[layer]).length,
  }));
  const roleArtifacts = REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS.map((field) => ({
    role: field,
    ref: refString(input.roleArtifactRefs[field]),
  }));
  const closeoutRef = refString(input.closeout.owner_receipt_ref)
    ?? refString(input.closeout.typed_blocker_ref);
  return {
    surface_kind: 'opl_stage_run_controlled_canary_operator_summary',
    owner: 'one-person-lab',
    status: input.blockers.length === 0 ? 'ready' : 'blocked',
    read_model_role: 'operator_visible_cognitive_work_refs_without_domain_progress_claim',
    domain_id: input.domainId,
    stage_id: input.stageId,
    evidence_scope: input.evidenceScope,
    stage_run_ref: input.stageRunRef,
    stage_manifest_ref: input.stageManifestRef,
    current_pointer_ref: input.currentPointerRef,
    cognitive_work: {
      strategy_layer_count: cognitiveWork.length,
      strategy_ref_count: cognitiveWork.reduce((total, layer) => total + layer.ref_count, 0),
      layers: cognitiveWork,
    },
    role_artifacts: {
      required_role_count: roleArtifacts.length,
      resolved_role_count: roleArtifacts.filter((artifact) => artifact.ref !== null).length,
      refs: roleArtifacts,
    },
    closeout_summary: {
      terminal_outcome: input.terminalOutcome,
      closeout_ref: closeoutRef,
      independent_quality_gate_ref_count:
        refList(input.strategyTrace.independent_quality_gate).length,
      same_attempt_self_review: input.closeout.same_attempt_self_review ?? null,
    },
    visible_progress_policy: {
      controlled_fixture_counts_as_live_domain_progress: false,
      conformance_pass_counts_as_domain_ready: false,
      provider_completion_counts_as_closeout:
        input.authority.provider_completion_counts_as_closeout ?? null,
      read_model_counts_as_closeout:
        input.authority.read_model_counts_as_closeout ?? null,
    },
    authority_boundary: {
      refs_only: input.authority.refs_only ?? null,
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
    blockers: input.blockers,
  };
}

export function buildStageRunKernelProfileChecks(repoDir: string) {
  const profileFile = readJsonFile(repoDir, 'contracts/stage_run_kernel_profile.json');
  const profile = isRecord(profileFile.payload) ? profileFile.payload : null;
  const stateMachine = isRecord(profile?.stage_run_state_machine) ? profile.stage_run_state_machine : {};
  const codexSemanticRoutePolicy = isRecord(profile?.codex_semantic_route_policy)
    ? profile.codex_semantic_route_policy
    : {};
  const projectionBoundary = isRecord(profile?.projection_boundary) ? profile.projection_boundary : {};
  const objectModels = isRecord(profile?.object_models) ? profile.object_models : {};
  const stageRunModel = isRecord(objectModels.StageRun) ? objectModels.StageRun : {};
  const stageRunAuthority = isRecord(stageRunModel.authority_boundary) ? stageRunModel.authority_boundary : {};
  const stageContextPolicy = isRecord(profile?.stage_context_policy)
    ? profile.stage_context_policy
    : {};
  const defaultReadSurface = isRecord(profile?.default_read_surface)
    ? profile.default_read_surface
    : {};
  const oplMasBoundary = isRecord(profile?.opl_mas_boundary) ? profile.opl_mas_boundary : {};
  const forbiddenOplAuthority = stringList(oplMasBoundary.forbidden_opl_authority);
  const authority = isRecord(profile?.authority_boundary) ? profile.authority_boundary : {};
  const stageNativeUnit = stringList(profile?.stage_native_unit);
  const requiredObjectModels = stringList(profile?.required_object_models);
  const launchHardBlockers = stringList(stageContextPolicy.hard_blockers);
  const launchAdvisoryRefs = stringList(stageContextPolicy.advisory_refs);
  const hasObjectModel = (model: string) => model === 'RoleArtifactRef'
    ? requiredObjectModels.includes('RoleArtifactRef') || requiredObjectModels.includes('ArtifactRef')
    : requiredObjectModels.includes(model);
  const stateFlagValue = (flag: string) => {
    if (flag === 'file_presence_counts_as_stage_complete') {
      return stateMachine.file_presence_counts_as_stage_complete
        ?? stateMachine.stage_folder_files_count_as_next_stage_ready;
    }
    if (flag === 'read_model_can_select_semantic_route') {
      return stateMachine.read_model_can_select_semantic_route
        ?? projectionBoundary.projection_can_authorize_next_stage;
    }
    return stateMachine[flag];
  };
  const authorityValue = (flag: string) => {
    if (flag === 'opl_can_write_domain_truth') {
      return authority.opl_can_write_domain_truth
        ?? authority.can_write_mas_truth
        ?? projectionBoundary.projection_can_write_truth
        ?? (forbiddenOplAuthority.includes('write_mas_study_truth') ? false : undefined);
    }
    if (flag === 'opl_can_mutate_artifact_body') {
      return authority.opl_can_mutate_artifact_body
        ?? stageRunAuthority.can_mutate_domain_artifact_body
        ?? (forbiddenOplAuthority.includes('mutate_domain_artifact_body') ? false : undefined);
    }
    if (flag === 'opl_can_sign_domain_owner_receipt') {
      return authority.opl_can_sign_domain_owner_receipt
        ?? authority.can_sign_owner_receipt
        ?? stageRunAuthority.can_sign_owner_receipt
        ?? (forbiddenOplAuthority.includes('sign_mas_owner_receipt') ? false : undefined);
    }
    if (flag === 'opl_can_create_typed_blocker') {
      return authority.opl_can_create_typed_blocker
        ?? authority.can_replace_typed_blocker
        ?? stageRunAuthority.can_replace_typed_blocker
        ?? (forbiddenOplAuthority.includes('replace_mas_typed_blocker') ? false : undefined);
    }
    if (flag === 'opl_can_authorize_quality_or_export') {
      return authority.opl_can_authorize_quality_or_export
        ?? (forbiddenOplAuthority.includes('authorize_publication_quality') ? false : undefined);
    }
    if (flag === 'provider_completion_counts_as_domain_accepted') {
      return authority.provider_completion_counts_as_domain_accepted
        ?? stateMachine.provider_completion_counts_as_domain_accepted;
    }
    if (flag === 'read_model_can_be_truth_source') {
      return authority.read_model_can_be_truth_source
        ?? projectionBoundary.projection_can_write_truth;
    }
    return authority[flag];
  };
  const blockers = [
    profileFile.status === 'resolved' ? null : `stage_run_kernel_profile_${profileFile.status}`,
    profile ? null : 'stage_run_kernel_profile_not_declared',
    ['opl_stage_run_kernel_profile', 'mas_opl_stage_run_kernel_profile'].includes(optionalString(profile?.surface_kind) ?? '')
      ? null
      : 'stage_run_kernel_profile_surface_kind_invalid',
    ['contracts/opl-framework/stage-run-kernel-contract.json', 'human_doc:mas_opl_stage_native_state_machine'].includes(
      optionalString(profile?.kernel_contract_ref) ?? optionalString(profile?.source_design_ref) ?? '',
    )
      ? null
      : 'stage_run_kernel_profile_contract_ref_invalid',
    optionalString(profile?.stage_manifest_schema_ref) === 'contracts/opl-framework/stage-manifest.schema.json'
      || stringList(isRecord(profile?.stage_folder_manifest) ? profile.stage_folder_manifest.required_manifest_sections : []).includes('required_role_artifacts')
      ? null
      : 'stage_run_kernel_profile_stage_manifest_schema_ref_invalid',
    optionalString(profile?.role_artifact_ref_schema_ref) === 'contracts/opl-framework/role-artifact-ref.schema.json'
      || isRecord(isRecord(profile?.stage_folder_manifest) ? profile.stage_folder_manifest.role_artifact_contract : null)
      ? null
      : 'stage_run_kernel_profile_role_artifact_ref_schema_ref_invalid',
    optionalString(profile?.owner_receipt_schema_ref) === 'contracts/opl-framework/stage-owner-receipt.schema.json'
      || stringList(profile?.required_object_models).includes('OwnerReceipt')
      ? null
      : 'stage_run_kernel_profile_owner_receipt_schema_ref_invalid',
    optionalString(profile?.typed_blocker_schema_ref) === 'contracts/opl-framework/stage-typed-blocker.schema.json'
      || stringList(profile?.required_object_models).includes('TypedBlocker')
      ? null
      : 'stage_run_kernel_profile_typed_blocker_schema_ref_invalid',
    ['minimal_state_shell_not_domain_controller_system', 'minimal_state_shell_not_mas_controller_system'].includes(optionalString(profile?.kernel_role) ?? '')
      ? null
      : 'stage_run_kernel_profile_kernel_role_invalid',
    ...REQUIRED_STAGE_RUN_NATIVE_UNITS
      .filter((unit) => !stageNativeUnit.includes(unit))
      .map((unit) => `stage_run_kernel_profile_native_unit_missing:${unit}`),
    ...REQUIRED_STAGE_RUN_OBJECT_MODELS
      .filter((model) => !hasObjectModel(model))
      .map((model) => `stage_run_kernel_profile_object_model_missing:${model}`),
    ...REQUIRED_STAGE_RUN_STATE_FLAGS
      .filter((flag) => stateFlagValue(flag) !== false)
      .map((flag) => `stage_run_kernel_profile_state_flag_must_be_false:${flag}`),
    ...REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS
      .filter((flag) => stateFlagValue(flag) !== true)
      .map((flag) => `stage_run_kernel_profile_state_flag_must_be_true:${flag}`),
    ...REQUIRED_STAGE_RUN_LAUNCH_HARD_BLOCKERS
      .filter((field) => !launchHardBlockers.includes(field))
      .map((field) => `stage_run_kernel_profile_launch_hard_blocker_missing:${field}`),
    ...STAGE_RUN_STRATEGY_ADVISORY_REFS
      .filter((field) => !launchAdvisoryRefs.includes(field))
      .map((field) => `stage_run_kernel_profile_advisory_ref_missing:${field}`),
    stageContextPolicy.advisory_refs_can_block_launch === false
      ? null
      : 'stage_run_kernel_profile_advisory_refs_can_block_launch',
    ...STAGE_RUN_STRATEGY_ADVISORY_REFS
      .filter((field) => launchHardBlockers.includes(field))
      .map((field) => `stage_run_kernel_profile_strategy_ref_promoted_to_launch_blocker:${field}`),
    optionalString(defaultReadSurface.root) === 'stage_run_current_owner_delta'
      ? null
      : 'stage_run_kernel_profile_default_read_surface_invalid',
    defaultReadSurface.raw_worklist_default === false
      ? null
      : 'stage_run_kernel_profile_raw_worklist_default_forbidden',
    defaultReadSurface.readiness_default === false
      ? null
      : 'stage_run_kernel_profile_readiness_default_forbidden',
    defaultReadSurface.replay_packet_default === false
      ? null
      : 'stage_run_kernel_profile_replay_packet_default_forbidden',
    optionalString(codexSemanticRoutePolicy.semantic_route_decision_owner) === 'decisive_codex_attempt'
      ? null
      : 'stage_run_kernel_profile_semantic_route_decision_owner_invalid',
    optionalString(codexSemanticRoutePolicy.stage_transition_materialization_owner)
        === 'opl_stage_run_controller'
      ? null
      : 'stage_run_kernel_profile_stage_transition_materialization_owner_invalid',
    Object.hasOwn(codexSemanticRoutePolicy, 'semantic_owner')
      ? 'stage_run_kernel_profile_legacy_semantic_owner_forbidden'
      : null,
    codexSemanticRoutePolicy.readable_artifact_allows_any_declared_stage === true
      ? null
      : 'stage_run_kernel_profile_readable_artifact_route_policy_invalid',
    codexSemanticRoutePolicy.provider_completion_is_route_decision === false
      ? null
      : 'stage_run_kernel_profile_provider_completion_route_authority_invalid',
    codexSemanticRoutePolicy.file_presence_without_readability_is_progress === false
      ? null
      : 'stage_run_kernel_profile_unreadable_file_progress_invalid',
    codexSemanticRoutePolicy.quality_budget_exhaustion_blocks_route === false
      ? null
      : 'stage_run_kernel_profile_quality_budget_exhaustion_must_not_block_route',
    codexSemanticRoutePolicy.owner_receipt_required_for_quality_or_ready_claim === true
      ? null
      : 'stage_run_kernel_profile_owner_receipt_required_for_quality_or_ready_claim',
    codexSemanticRoutePolicy.framework_can_accept_reject_rank_or_override_route === false
      ? null
      : 'stage_run_kernel_profile_framework_semantic_route_authority_forbidden',
    profile?.transition_authority === undefined
      ? null
      : 'stage_run_kernel_profile_second_transition_authority_plane_forbidden',
    ...REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authorityValue(flag) !== false)
      .map((flag) => `stage_run_kernel_profile_authority_flag_must_be_false:${flag}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    profile_status: blockers.length === 0 ? 'declared' : 'blocked',
    profile_source: 'contracts/stage_run_kernel_profile.json',
    kernel_contract_ref: optionalString(profile?.kernel_contract_ref),
    kernel_role: optionalString(profile?.kernel_role),
    stage_native_unit: stageNativeUnit,
    required_object_models: requiredObjectModels,
    stage_run_state_machine: Object.fromEntries(
      [...REQUIRED_STAGE_RUN_STATE_FLAGS, ...REQUIRED_STAGE_RUN_STATE_TRUE_FLAGS]
        .map((flag) => [flag, stateFlagValue(flag) ?? null]),
    ),
    stage_context_policy: {
      hard_blockers: launchHardBlockers,
      advisory_refs: launchAdvisoryRefs,
      advisory_refs_can_block_launch:
        stageContextPolicy.advisory_refs_can_block_launch ?? null,
    },
    default_read_surface: {
      root: optionalString(defaultReadSurface.root),
      raw_worklist_default: defaultReadSurface.raw_worklist_default ?? null,
      readiness_default: defaultReadSurface.readiness_default ?? null,
      replay_packet_default: defaultReadSurface.replay_packet_default ?? null,
    },
    codex_semantic_route_policy: {
      semantic_route_decision_owner:
        optionalString(codexSemanticRoutePolicy.semantic_route_decision_owner),
      stage_transition_materialization_owner:
        optionalString(codexSemanticRoutePolicy.stage_transition_materialization_owner),
      readable_artifact_allows_any_declared_stage:
        codexSemanticRoutePolicy.readable_artifact_allows_any_declared_stage ?? null,
      provider_completion_is_route_decision:
        codexSemanticRoutePolicy.provider_completion_is_route_decision ?? null,
      file_presence_without_readability_is_progress:
        codexSemanticRoutePolicy.file_presence_without_readability_is_progress ?? null,
      quality_budget_exhaustion_blocks_route:
        codexSemanticRoutePolicy.quality_budget_exhaustion_blocks_route ?? null,
      owner_receipt_required_for_quality_or_ready_claim:
        codexSemanticRoutePolicy.owner_receipt_required_for_quality_or_ready_claim ?? null,
      framework_can_accept_reject_rank_or_override_route:
        codexSemanticRoutePolicy.framework_can_accept_reject_rank_or_override_route ?? null,
    },
    authority_boundary: Object.fromEntries(
      REQUIRED_STAGE_RUN_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authorityValue(flag) ?? null]),
    ),
    blockers,
  };
}

export function buildStageRunCanaryEvidenceChecks(repoDir: string) {
  const evidenceFile = readJsonFile(repoDir, 'contracts/stage_run_canary_evidence.json');
  const evidence = isRecord(evidenceFile.payload) ? evidenceFile.payload : null;
  const strategyTrace = isRecord(evidence?.strategy_trace) ? evidence.strategy_trace : {};
  const roleArtifactRefs = isRecord(evidence?.role_artifact_refs) ? evidence.role_artifact_refs : {};
  const closeout = isRecord(evidence?.closeout) ? evidence.closeout : {};
  const authority = isRecord(evidence?.authority_boundary) ? evidence.authority_boundary : {};
  const terminalOutcome = optionalString(closeout.terminal_outcome);
  const forbiddenClaimFindings = buildForbiddenStageRunCanaryClaimFindings(evidence);
  const hasCloseoutRef = refString(closeout.owner_receipt_ref) !== null
    || refString(closeout.typed_blocker_ref) !== null;
  const blockers = [
    evidenceFile.status === 'resolved' ? null : `stage_run_canary_evidence_${evidenceFile.status}`,
    evidence ? null : 'stage_run_canary_evidence_not_declared',
    optionalString(evidence?.surface_kind) === 'opl_stage_run_controlled_canary_evidence'
      ? null
      : 'stage_run_canary_evidence_surface_kind_invalid',
    optionalString(evidence?.version) === 'stage-run-controlled-canary.v1'
      ? null
      : 'stage_run_canary_evidence_version_invalid',
    optionalString(evidence?.evidence_scope) === 'controlled_fixture_not_live_domain_progress'
      ? null
      : 'stage_run_canary_evidence_scope_invalid',
    optionalString(evidence?.domain_id) ? null : 'stage_run_canary_evidence_domain_id_missing',
    optionalString(evidence?.canary_id) ? null : 'stage_run_canary_evidence_canary_id_missing',
    optionalString(evidence?.stage_id) ? null : 'stage_run_canary_evidence_stage_id_missing',
    refString(evidence?.stage_run_ref) ? null : 'stage_run_canary_evidence_stage_run_ref_missing',
    refString(evidence?.stage_manifest_ref) ? null : 'stage_run_canary_evidence_stage_manifest_ref_missing',
    refString(evidence?.current_pointer_ref) ? null : 'stage_run_canary_evidence_current_pointer_ref_missing',
    ...REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS
      .filter((layer) => refList(strategyTrace[layer]).length === 0)
      .map((layer) => `stage_run_canary_evidence_strategy_layer_missing:${layer}`),
    ...REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS
      .filter((field) => refString(roleArtifactRefs[field]) === null)
      .map((field) => `stage_run_canary_evidence_role_artifact_ref_missing:${field}`),
    ['owner_receipt', 'typed_blocker'].includes(terminalOutcome ?? '')
      ? null
      : 'stage_run_canary_evidence_terminal_outcome_invalid',
    hasCloseoutRef ? null : 'stage_run_canary_evidence_closeout_ref_missing',
    closeout.same_attempt_self_review === false
      ? null
      : 'stage_run_canary_evidence_same_attempt_self_review_forbidden',
    authority.refs_only === true
      ? null
      : 'stage_run_canary_evidence_refs_only_boundary_missing',
    ...REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `stage_run_canary_evidence_authority_flag_must_be_false:${flag}`),
    ...forbiddenClaimFindings
      .map((finding) => `stage_run_canary_evidence_forbidden_claim:${finding.field}:${finding.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  const evidenceScope = optionalString(evidence?.evidence_scope);
  const domainId = optionalString(evidence?.domain_id);
  const stageId = optionalString(evidence?.stage_id);
  const stageRunRef = refString(evidence?.stage_run_ref);
  const stageManifestRef = refString(evidence?.stage_manifest_ref);
  const currentPointerRef = refString(evidence?.current_pointer_ref);
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    evidence_status: blockers.length === 0 ? 'declared' : 'blocked',
    evidence_source: 'contracts/stage_run_canary_evidence.json',
    evidence_scope: evidenceScope,
    domain_id: domainId,
    canary_id: optionalString(evidence?.canary_id),
    stage_id: stageId,
    stage_run_ref: stageRunRef,
    stage_manifest_ref: stageManifestRef,
    current_pointer_ref: currentPointerRef,
    strategy_trace: Object.fromEntries(
      REQUIRED_STAGE_RUN_CANARY_STRATEGY_LAYERS.map((layer) => [layer, refList(strategyTrace[layer])]),
    ),
    role_artifact_refs: Object.fromEntries(
      REQUIRED_STAGE_RUN_CANARY_ROLE_ARTIFACT_REFS.map((field) => [field, refString(roleArtifactRefs[field])]),
    ),
    closeout: {
      terminal_outcome: terminalOutcome,
      owner_receipt_ref: refString(closeout.owner_receipt_ref),
      typed_blocker_ref: refString(closeout.typed_blocker_ref),
      same_attempt_self_review: closeout.same_attempt_self_review ?? null,
    },
    authority_boundary: {
      refs_only: authority.refs_only ?? null,
      ...Object.fromEntries(
        REQUIRED_STAGE_RUN_CANARY_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
      ),
    },
    forbidden_claim_scan: {
      status: forbiddenClaimFindings.length === 0 ? 'passed' : 'blocked',
      forbidden_claim_count: forbiddenClaimFindings.length,
      findings: forbiddenClaimFindings,
      scanned_source: 'contracts/stage_run_canary_evidence.json',
      policy: 'controlled_canary_may_show_cognitive_work_refs_but_cannot_claim_live_domain_progress_domain_ready_quality_export_artifact_or_production_ready',
    },
    operator_summary: buildStageRunCanaryOperatorSummary({
      authority,
      blockers,
      closeout,
      currentPointerRef,
      domainId,
      evidenceScope,
      roleArtifactRefs,
      stageId,
      stageManifestRef,
      stageRunRef,
      strategyTrace,
      terminalOutcome,
    }),
    blockers,
  };
}
