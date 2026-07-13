import { buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject } from '../stagecraft/index.ts';
import { stableId } from './family-runtime-store.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';

type JsonRecord = Record<string, unknown>;
type InvocationMode = 'invocation' | 'authoring';
type LaunchInvocationBlockerReason =
  | 'non_default_executor_binding_ref_missing';

const invocationAgentActions = ['retrieve', 'select', 'bind', 'launch', 'deploy'] as const;
const authoringAgentActions = ['retrieve', 'select', 'bind', 'author_bounded_edit'] as const;

export interface StageLaunchInvocationProjection {
  surface_kind: 'opl_stage_launch_invocation';
  version: 'opl-stage-launch-invocation.v1';
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  invocation_mode: InvocationMode;
  allowed_agent_actions: Array<typeof invocationAgentActions[number] | typeof authoringAgentActions[number]>;
  bounded_edit_ref: string | null;
  policy: {
    stage_pack_launch_scope: 'codex_selected_declared_or_requested_stage';
    authoring_output: 'readable_artifact_preferred_bounded_edit_optional';
    unadmitted_agent_generated_stage_pack: 'advisory_quality_debt_no_ready_claim';
    graphflow_runtime_dependency: false;
    runtime_equivalence_claim: false;
  };
  provider_kind: FamilyRuntimeProviderKind;
  selected_executor_kind: string;
  default_executor: boolean;
  executor_binding_ref: string | null;
  executor_binding_status:
    | 'default_codex_cli'
    | 'explicit_executor_binding_declared'
    | 'missing_non_default_executor_binding';
  source_fingerprint: string | null;
  workspace_locator_ref: string;
  idempotency_key: string;
  task_id: string | null;
  launch_refs: {
    stage_pack_ref: string | null;
    stage_context_ref: string | null;
    source_binding_ref: string | null;
    workspace_binding_ref: string;
    executor_binding_ref: string | null;
    bounded_edit_ref: string | null;
  };
  blocker_reason: LaunchInvocationBlockerReason | null;
  conflict_or_blocker_envelopes: ReturnType<typeof buildFamilyConflictOrBlockerEnvelope>[];
  authority_boundary: {
    opl_role: 'launch_invocation_projection_only';
    graphflow_runtime_dependency: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    executor_behavior_equivalence_claim: false;
  };
}

function text(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function invocationMode(value: string | null | undefined): InvocationMode {
  return text(value) === 'authoring' ? 'authoring' : 'invocation';
}

export function buildStageLaunchInvocationProjection(input: {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  providerKind: FamilyRuntimeProviderKind;
  workspaceLocator: JsonRecord;
  sourceFingerprint?: string | null;
  executorKind?: string | null;
  executorBindingRef?: string | null;
  invocationMode?: string | null;
  boundedEditRef?: string | null;
  taskId?: string | null;
  idempotencyKey: string;
  planeId?: string | null;
  contextPlaneId?: string | null;
}): StageLaunchInvocationProjection {
  const selectedExecutorKind = text(input.executorKind) ?? 'codex_cli';
  const executorBindingRef = text(input.executorBindingRef);
  const mode = invocationMode(input.invocationMode);
  const boundedEditRef = text(input.boundedEditRef);
  const sourceFingerprint = text(input.sourceFingerprint);
  const workspaceLocatorRef = `workspace_locator:${stableId('wl', [input.domainId, input.stageId, input.workspaceLocator])}`;
  const sourceBindingRef = sourceFingerprint ? `source_fingerprint:${sourceFingerprint}` : null;
  const defaultExecutor = selectedExecutorKind === 'codex_cli';
  const executorBindingStatus = defaultExecutor
    ? 'default_codex_cli' as const
    : executorBindingRef
      ? 'explicit_executor_binding_declared' as const
      : 'missing_non_default_executor_binding' as const;
  const blockerReason: LaunchInvocationBlockerReason | null =
    executorBindingStatus === 'missing_non_default_executor_binding'
      ? 'non_default_executor_binding_ref_missing'
      : null;
  const subject = buildFamilyConflictSubject({
    domain: input.domainId,
    stageId: input.stageId,
    taskKind: input.stageId,
    sourceFingerprint,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
    sourceRefs: [
      ...(input.planeId ? [`opl://family_stage_control_planes/${input.planeId}`] : []),
      ...(input.contextPlaneId ? [`opl://family_stage_context/${input.contextPlaneId}`] : []),
      ...(executorBindingRef ? [executorBindingRef] : []),
      ...(boundedEditRef ? [boundedEditRef] : []),
    ],
  });
  const allowedAgentActions: StageLaunchInvocationProjection['allowed_agent_actions'] = mode === 'authoring'
    ? [...authoringAgentActions]
    : [...invocationAgentActions];
  return {
    surface_kind: 'opl_stage_launch_invocation',
    version: 'opl-stage-launch-invocation.v1',
    domain_id: input.domainId,
    stage_id: input.stageId,
    invocation_mode: mode,
    allowed_agent_actions: allowedAgentActions,
    bounded_edit_ref: boundedEditRef,
    policy: {
      stage_pack_launch_scope: 'codex_selected_declared_or_requested_stage',
      authoring_output: 'readable_artifact_preferred_bounded_edit_optional',
      unadmitted_agent_generated_stage_pack: 'advisory_quality_debt_no_ready_claim',
      graphflow_runtime_dependency: false,
      runtime_equivalence_claim: false,
    },
    provider_kind: input.providerKind,
    selected_executor_kind: selectedExecutorKind,
    default_executor: defaultExecutor,
    executor_binding_ref: executorBindingRef,
    executor_binding_status: executorBindingStatus,
    source_fingerprint: sourceFingerprint,
    workspace_locator_ref: workspaceLocatorRef,
    idempotency_key: input.idempotencyKey,
    task_id: text(input.taskId),
    launch_refs: {
      stage_pack_ref: input.planeId ? `opl://stage-packs/${input.domainId}/${input.planeId}` : null,
      stage_context_ref: input.contextPlaneId ? `opl://family_stage_context/${input.contextPlaneId}` : null,
      source_binding_ref: sourceBindingRef,
      workspace_binding_ref: workspaceLocatorRef,
      executor_binding_ref: executorBindingRef,
      bounded_edit_ref: boundedEditRef,
    },
    blocker_reason: blockerReason,
    conflict_or_blocker_envelopes: blockerReason
      ? [
          buildFamilyConflictOrBlockerEnvelope({
            subject,
            classification: 'evidence_blocker',
            owner: 'opl_runtime',
            authority: 'opl_runtime',
            status: 'blocked',
            reason: blockerReason,
            evidenceRefs: [
              `invocation_mode:${mode}`,
              `executor_kind:${selectedExecutorKind}`,
              'missing:executor_binding_ref',
            ],
            allowedNextActions: ['declare_executor_binding_ref', 'use_default_codex_cli'],
            forbiddenActions: ['start_non_default_executor_without_binding_ref', 'claim_executor_equivalence'],
            failClosed: true,
          }),
        ]
      : [],
    authority_boundary: {
      opl_role: 'launch_invocation_projection_only',
      graphflow_runtime_dependency: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      executor_behavior_equivalence_claim: false,
    },
  };
}
