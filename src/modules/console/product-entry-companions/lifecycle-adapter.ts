import {
  cloneRecord,
  isRecord,
  mergeExtraPayload,
  optionalString,
  optionalStringList,
  requireString,
} from './internal.ts';
import type { JsonRecord } from './types.ts';

export interface BuildOplProductEntryLifecycleAdapterInput {
  domain_id: string;
  domain_owner: string;
  runtime_owner?: string | null;
  entry_session_id?: string | null;
  session_file?: string | null;
  delivery_identity?: JsonRecord | null;
  continuation_snapshot?: JsonRecord | null;
  runtime_loop_closure?: JsonRecord | null;
  review_projection?: JsonRecord | null;
  publication_projection?: JsonRecord | null;
  artifact_locator_contract?: JsonRecord | null;
  product_entry_session_command_template: string;
  direct_product_entry_command?: string | null;
  opl_hosted_handoff_ref?: string | null;
  source?: string | null;
  entry_mode?: string | null;
  manifest_projection?: boolean | null;
  adapter_id?: string | null;
  version?: string | null;
  owner_overrides?: JsonRecord | null;
  route_equivalence_ref?: string | null;
  required_input_fields?: string[] | null;
  source_refs?: string[] | null;
  allowed_authority?: string[] | null;
  non_goals?: string[] | null;
  extra_payload?: JsonRecord;
}

export type OplProductEntryLifecycleAdapterSurface = JsonRecord & {
  surface_kind: 'opl_family_lifecycle_adapter';
  adapter_id: string;
  version: string;
  domain_id: string;
  domain_owner: string;
};

function text(value: unknown, fallback = '') {
  return optionalString(value) ?? fallback;
}

function maybeText(value: unknown) {
  return optionalString(value) ?? null;
}

function optionalRecord(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return null;
  }
  return cloneRecord(value, field);
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringListOrDefault(value: unknown, field: string, fallback: string[]) {
  const normalized = optionalStringList(value, field);
  return normalized ?? fallback;
}

function buildRestorePoint(continuationSnapshot: JsonRecord | null) {
  const latestStageExecutionPlanRef = maybeText(continuationSnapshot?.latest_stage_execution_plan_ref);
  const latestRunId = maybeText(continuationSnapshot?.latest_run_id);
  return {
    latest_handle: latestStageExecutionPlanRef || latestRunId || null,
    latest_stage_execution_plan_ref: latestStageExecutionPlanRef,
    latest_run_id: latestRunId,
  };
}

function projectionFromStageExecutionPlan(stageExecutionPlan: unknown): JsonRecord | null {
  if (!isRecord(stageExecutionPlan)) {
    return null;
  }
  const summary = isRecord(stageExecutionPlan.summary) ? stageExecutionPlan.summary : {};
  return {
    projection_kind: 'opl_stage_execution_plan_projection',
    content_status: 'planned_for_opl_stage_execution',
    current_stage: maybeText(summary.first_stage),
    terminal_stage: maybeText(summary.terminal_stage),
    planned_stage_count: Number(summary.planned_stage_count || 0),
    needs_user_decision: isRecord(stageExecutionPlan.control_policy)
      ? stageExecutionPlan.control_policy.approval_required === true
      : false,
    completed_stages: [],
    remaining_stages: list(stageExecutionPlan.stage_attempts)
      .map((stage) => (isRecord(stage) ? maybeText(stage.stage_id) : null))
      .filter(Boolean),
    final_artifact_refs: [],
  };
}

function progressProjection(continuationSnapshot: JsonRecord | null) {
  if (isRecord(continuationSnapshot?.runtime_progress_projection)) {
    return cloneRecord(continuationSnapshot?.runtime_progress_projection, 'continuation_snapshot.runtime_progress_projection');
  }
  return projectionFromStageExecutionPlan(continuationSnapshot?.stage_execution_plan);
}

function buildOwnerSplit(input: {
  domainOwner: string;
  ownerOverrides: JsonRecord | null;
}) {
  return {
    family_persistence_owner: 'one-person-lab',
    session_shell_owner: 'one-person-lab',
    stage_attempt_owner: 'one-person-lab',
    attempt_ledger_owner: 'one-person-lab',
    lifecycle_projection_owner: input.domainOwner,
    domain_truth_owner: input.domainOwner,
    review_publication_owner: input.domainOwner,
    runtime_manager_consumer: 'opl_runtime_manager',
    executor_owner: 'configured_by_opl_runtime_provider',
    ...(input.ownerOverrides ?? {}),
  };
}

function buildRouteSurfaces(domainOwner: string) {
  return [
    {
      surface_id: 'product_entry_registration',
      surface_kind: 'skill_catalog',
      ref: '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration',
      owner: domainOwner,
    },
    {
      surface_id: 'opl_hosted_stage_runtime',
      surface_kind: 'opl_hosted_product_entry',
      ref: '/product_entry_shell/opl_hosted',
      owner: domainOwner,
    },
    {
      surface_id: 'product_entry_session',
      surface_kind: 'opl_generated_product_entry_session',
      ref: '/session_continuity',
      owner: 'one-person-lab',
    },
    {
      surface_id: 'opl_stage_execution_plan',
      surface_kind: 'opl_stage_execution_plan',
      ref: '/continuation_snapshot/latest_stage_execution_plan_ref',
      owner: 'one-person-lab',
    },
    {
      surface_id: 'review_state',
      surface_kind: 'review_state',
      ref: '/review_state',
      owner: domainOwner,
    },
    {
      surface_id: 'publication_projection',
      surface_kind: 'publication_projection',
      ref: '/publication_projection',
      owner: domainOwner,
    },
  ];
}

function buildPersistence(input: {
  domainOwner: string;
  entrySessionId: string | null;
  sessionFile: string | null;
  continuationSnapshot: JsonRecord | null;
  runtimeLoopClosure: JsonRecord | null;
  artifactLocatorContract: JsonRecord | null;
}) {
  const restorePoint = buildRestorePoint(input.continuationSnapshot);
  const runtimeRefs = isRecord(input.continuationSnapshot?.runtime_projection)
    && isRecord(input.continuationSnapshot?.runtime_projection.refs)
    ? input.continuationSnapshot.runtime_projection.refs
    : {};
  const artifactPickup = isRecord(input.runtimeLoopClosure?.artifact_pickup)
    ? input.runtimeLoopClosure.artifact_pickup
    : {};
  return {
    authority_model: 'file_authority_plus_rebuildable_artifact_indexes',
    sqlite: {
      status: 'not_domain_owned_generic_persistence',
      decision: 'domain_repo_must_not_add_private_sqlite_until_opl_generated_session_or_index_shell_requires_it',
      must_not_own: [
        'domain truth',
        'canonical artifact truth',
        'review/export judgment',
        'artifact blob storage',
      ],
    },
    session: {
      surface_kind: 'opl_generated_product_entry_session',
      entry_session_id: input.entrySessionId,
      session_file: input.sessionFile,
      latest_handle: restorePoint.latest_handle,
    },
    stage_execution_plan: {
      surface_kind: 'opl_stage_execution_plan',
      plan_ref: restorePoint.latest_stage_execution_plan_ref,
      provider_owner: 'opl_family_runtime_provider',
      attempt_ledger_owner: 'one-person-lab',
    },
    stage_runtime_projection: {
      surface_kind: 'opl_stage_execution_plan',
      stage_execution_plan_ref: restorePoint.latest_stage_execution_plan_ref,
      latest_run_id: restorePoint.latest_run_id,
      stage_execution_plan_path: maybeText(runtimeRefs.stage_execution_plan_path),
      progress_projection_path: maybeText(runtimeRefs.progress_projection_path),
      runtime_projection_path: maybeText(runtimeRefs.runtime_projection_path),
      escalation_record_path: maybeText(runtimeRefs.escalation_record_path),
    },
    artifact_index: {
      surface_kind: 'artifact_inventory',
      artifact_refs: list(artifactPickup.artifact_refs),
      artifact_ref_count: Number(artifactPickup.artifact_ref_count || 0),
      source_ref: '/artifact_inventory',
    },
    artifact_locator_contract_ref: {
      surface_kind: maybeText(input.artifactLocatorContract?.surface_kind) || 'artifact_locator_contract',
      ref: '/artifact_locator_contract',
      owner: input.domainOwner,
      locator_model: maybeText(input.artifactLocatorContract?.locator_model)
        || 'workspace_runtime_artifact_root_refs_only',
      opl_consumption: 'descriptor_and_refs_only',
    },
  };
}

function buildReviewPublicationRefs(input: {
  domainOwner: string;
  reviewProjection: JsonRecord | null;
  publicationProjection: JsonRecord | null;
}) {
  return {
    review_state_ref: {
      surface_kind: maybeText(input.reviewProjection?.surface_kind) || 'review_state',
      ref: '/review_state',
      owner: input.domainOwner,
      status: input.reviewProjection ? 'hydrated' : 'runtime_projection_ref',
    },
    publication_projection_ref: {
      surface_kind: maybeText(input.publicationProjection?.surface_kind) || 'publication_projection',
      ref: '/publication_projection',
      owner: input.domainOwner,
      status: input.publicationProjection ? 'hydrated' : 'runtime_projection_ref',
    },
    route_rule: 'must_use_domain_product_entry_and_review_export_gates',
  };
}

function buildLifecycle(input: {
  domainOwner: string;
  continuationSnapshot: JsonRecord | null;
  runtimeLoopClosure: JsonRecord | null;
  reviewProjection: JsonRecord | null;
  publicationProjection: JsonRecord | null;
}) {
  const projection = progressProjection(input.continuationSnapshot);
  const runtimeProjection = isRecord(input.continuationSnapshot?.runtime_projection)
    ? input.continuationSnapshot.runtime_projection
    : null;
  const progressCursor = isRecord(input.runtimeLoopClosure?.progress_cursor)
    ? input.runtimeLoopClosure.progress_cursor
    : {};
  return {
    lifecycle_contract_id: 'opl_family_runtime_attempt_contract.v1',
    current_stage: maybeText(projection?.current_stage) ?? maybeText(progressCursor.current_stage),
    content_status: maybeText(projection?.content_status) ?? maybeText(progressCursor.content_status),
    needs_user_decision: projection?.needs_user_decision === true,
    current_blockers: list(projection?.current_blockers),
    completed_stages: list(projection?.completed_stages),
    remaining_stages: list(projection?.remaining_stages),
    latest_events: list(projection?.latest_events).slice(-12),
    runtime_projection: runtimeProjection
      ? {
        health_status: maybeText(runtimeProjection.health_status),
        worker_running: runtimeProjection.worker_running === true,
        active_run_id: maybeText(runtimeProjection.active_run_id),
        runtime_liveness_audit: runtimeProjection.runtime_liveness_audit ?? null,
        needs_human_intervention: runtimeProjection.needs_human_intervention === true,
        next_action: maybeText(runtimeProjection.next_action),
      }
      : null,
    review_publication: buildReviewPublicationRefs({
      domainOwner: input.domainOwner,
      reviewProjection: input.reviewProjection,
      publicationProjection: input.publicationProjection,
    }),
  };
}

function recommendedOwnerRoute(input: {
  runtimeLoopClosure: JsonRecord | null;
  continuationSnapshot: JsonRecord | null;
}) {
  const projection = progressProjection(input.continuationSnapshot);
  const controlPolicy = isRecord(input.runtimeLoopClosure?.control_policy)
    ? input.runtimeLoopClosure.control_policy
    : {};
  if (controlPolicy.approval_required === true || projection?.needs_user_decision === true) {
    return 'resolve_review_gate';
  }
  if (text(projection?.content_status) === 'completed') {
    return 'pick_up_artifacts';
  }
  return 'continue_autonomous_run';
}

function buildOwnerRouteDiscovery(input: {
  domainOwner: string;
  source: string;
  entryMode: string | null;
  runtimeLoopClosure: JsonRecord | null;
  continuationSnapshot: JsonRecord | null;
  productEntrySessionCommandTemplate: string;
  directProductEntryCommand: string | null;
  oplHostedHandoffRef: string | null;
  routeEquivalenceRef: string;
}) {
  const restorePoint = buildRestorePoint(input.continuationSnapshot);
  const candidateRoutes: JsonRecord[] = [
    {
      route_id: 'product_entry_session',
      surface_kind: 'product_entry_session',
      command: input.productEntrySessionCommandTemplate,
      locator_field: 'entry_session_id',
      latest_handle: restorePoint.latest_handle,
    },
  ];
  if (input.directProductEntryCommand) {
    candidateRoutes.push({
      route_id: 'direct_product_entry',
      surface_kind: 'product_entry',
      command: input.directProductEntryCommand,
      owner: input.domainOwner,
    });
  }
  if (input.oplHostedHandoffRef) {
    candidateRoutes.push({
      route_id: 'opl_hosted_handoff',
      surface_kind: 'opl_hosted_product_entry',
      action_ref: input.oplHostedHandoffRef,
      owner: input.domainOwner,
    });
  }
  return {
    current_source: input.source,
    entry_mode: input.entryMode,
    recommended_owner_route: recommendedOwnerRoute(input),
    candidate_routes: candidateRoutes,
    route_equivalence_ref: input.routeEquivalenceRef,
    downstream_entry_surface_kind: 'domain_entry',
  };
}

function buildAdoption(input: {
  entrySessionId: string | null;
  sessionFile: string | null;
  runtimeLoopClosure: JsonRecord | null;
  productEntrySessionCommandTemplate: string;
  requiredInputFields: string[];
  sourceRefs: string[];
}) {
  const controlPolicy = isRecord(input.runtimeLoopClosure?.control_policy)
    ? input.runtimeLoopClosure.control_policy
    : {};
  const continueAction = isRecord(controlPolicy.continue_action) ? controlPolicy.continue_action : {};
  const resumePoint = isRecord(input.runtimeLoopClosure?.resume_point)
    ? input.runtimeLoopClosure.resume_point
    : {};
  return {
    adoption_contract_id: 'opl_family_product_operator_projection.v1',
    adoption_command: input.productEntrySessionCommandTemplate,
    required_input_fields: input.requiredInputFields,
    resume_surface: {
      surface_kind: 'opl_generated_product_entry_session',
      command: input.productEntrySessionCommandTemplate,
      entry_session_id: input.entrySessionId,
      session_file: input.sessionFile,
      checkpoint_locator_field: maybeText(resumePoint.checkpoint_locator_field)
        || 'continuation_snapshot.latest_stage_execution_plan_ref',
    },
    next_surface_ref: continueAction.surface_kind === 'product_entry_session'
      ? '/session_continuity'
      : '/runtime_loop_closure',
    human_gate_reason: controlPolicy.approval_required === true
      ? 'operator_review_gate_requested'
      : null,
    source_refs: input.sourceRefs,
  };
}

function buildAuthorityBoundary(allowedAuthority: string[]) {
  return {
    owns_domain_truth: false,
    owns_canonical_artifacts: false,
    owns_review_truth: false,
    owns_publication_projection: false,
    owns_concrete_executor: false,
    allowed_authority: allowedAuthority,
  };
}

export function buildOplProductEntryLifecycleAdapterSurface(
  input: BuildOplProductEntryLifecycleAdapterInput,
): OplProductEntryLifecycleAdapterSurface {
  const domainId = requireString(input.domain_id, 'domain_id');
  const domainOwner = requireString(input.domain_owner, 'domain_owner');
  const commandTemplate = requireString(
    input.product_entry_session_command_template,
    'product_entry_session_command_template',
  );
  const deliveryIdentity = optionalRecord(input.delivery_identity, 'delivery_identity');
  const continuationSnapshot = optionalRecord(input.continuation_snapshot, 'continuation_snapshot');
  const runtimeLoopClosure = optionalRecord(input.runtime_loop_closure, 'runtime_loop_closure');
  const ownerOverrides = optionalRecord(input.owner_overrides, 'owner_overrides');
  const reviewProjection = optionalRecord(input.review_projection, 'review_projection');
  const publicationProjection = optionalRecord(input.publication_projection, 'publication_projection');
  const artifactLocatorContract = optionalRecord(
    input.artifact_locator_contract,
    'artifact_locator_contract',
  );
  const manifestProjection = input.manifest_projection === true;
  const entrySessionId = manifestProjection ? null : maybeText(input.entry_session_id);
  const sessionFile = manifestProjection ? null : maybeText(input.session_file);
  const requiredInputFields = stringListOrDefault(
    input.required_input_fields,
    'required_input_fields',
    ['entry_session_id', 'workspace_root', 'topic_id', 'deliverable_id'],
  );
  const sourceRefs = stringListOrDefault(
    input.source_refs,
    'source_refs',
    [
      '/session_continuity',
      '/progress_projection',
      '/artifact_inventory',
      '/runtime_loop_closure',
      '/review_state',
      '/publication_projection',
    ],
  );
  const allowedAuthority = stringListOrDefault(
    input.allowed_authority,
    'allowed_authority',
    [
      'discover_product_entry_registration',
      'read_product_entry_session',
      'read_runtime_progress_projection',
      'read_artifact_inventory',
      'read_review_publication_projection_refs',
      'adopt_session_resume_cursor',
    ],
  );
  const nonGoals = stringListOrDefault(
    input.non_goals,
    'non_goals',
    [
      'not_a_domain_truth_owner',
      'not_a_canonical_artifact_owner',
      'not_a_review_or_publication_projection_owner',
      'not_a_concrete_executor',
      'not_a_private_sqlite_authority',
    ],
  );
  const payload: OplProductEntryLifecycleAdapterSurface = {
    surface_kind: 'opl_family_lifecycle_adapter',
    adapter_id: text(input.adapter_id, `${domainId}.opl.family.lifecycle.adapter.v1`),
    version: text(input.version, 'v1'),
    domain_id: domainId,
    domain_owner: domainOwner,
    runtime_owner: maybeText(input.runtime_owner),
    discovery: {
      adoption_state: manifestProjection || !entrySessionId
        ? 'discoverable_manifest_projection'
        : 'hydrated_session_projection',
      owner_split: buildOwnerSplit({ domainOwner, ownerOverrides }),
      route_surfaces: buildRouteSurfaces(domainOwner),
      delivery_identity: {
        deliverable_family: maybeText(deliveryIdentity?.deliverable_family),
        topic_id: maybeText(deliveryIdentity?.topic_id),
        deliverable_id: maybeText(deliveryIdentity?.deliverable_id),
        profile_id: deliveryIdentity?.profile_id ?? null,
      },
    },
    persistence: buildPersistence({
      domainOwner,
      entrySessionId,
      sessionFile,
      continuationSnapshot,
      runtimeLoopClosure,
      artifactLocatorContract,
    }),
    lifecycle: buildLifecycle({
      domainOwner,
      continuationSnapshot,
      runtimeLoopClosure,
      reviewProjection,
      publicationProjection,
    }),
    owner_route_discovery: buildOwnerRouteDiscovery({
      domainOwner,
      source: text(input.source, 'manifest'),
      entryMode: maybeText(input.entry_mode),
      runtimeLoopClosure,
      continuationSnapshot,
      productEntrySessionCommandTemplate: commandTemplate,
      directProductEntryCommand: maybeText(input.direct_product_entry_command),
      oplHostedHandoffRef: maybeText(input.opl_hosted_handoff_ref),
      routeEquivalenceRef: text(input.route_equivalence_ref, '/route_equivalence'),
    }),
    adoption: buildAdoption({
      entrySessionId,
      sessionFile,
      runtimeLoopClosure,
      productEntrySessionCommandTemplate: commandTemplate,
      requiredInputFields,
      sourceRefs,
    }),
    authority_boundary: buildAuthorityBoundary(allowedAuthority),
    non_goals: nonGoals,
  };
  return mergeExtraPayload(payload, input.extra_payload, 'opl product entry lifecycle adapter');
}
