import { SearchAttributeType } from '@temporalio/common';

import {
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
} from './family-runtime-temporal.ts';

type JsonRecord = Record<string, unknown>;

export const TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES = {
  OplStageAttemptId: SearchAttributeType.KEYWORD,
  OplDomainId: SearchAttributeType.KEYWORD,
  OplStageId: SearchAttributeType.KEYWORD,
  OplTaskId: SearchAttributeType.KEYWORD,
  OplSourceFingerprint: SearchAttributeType.KEYWORD,
  OplExecutorKind: SearchAttributeType.KEYWORD,
} as const;

export type TemporalStageAttemptSearchAttributeName =
  keyof typeof TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function temporalWebUiBaseUrl() {
  return process.env.OPL_TEMPORAL_WEB_UI_URL?.trim()
    || process.env.TEMPORAL_WEB_UI_URL?.trim()
    || 'http://localhost:8233';
}

function temporalSearchAttributeRefs() {
  return Object.keys(TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES)
    .map((name) => `temporal-search-attribute:${name}`);
}

export function temporalStageAttemptTypedSearchAttributes(input: {
  stageAttemptId: string;
  domainId: string;
  stageId: string;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  executorKind: string;
}) {
  return {
    OplStageAttemptId: [input.stageAttemptId],
    OplDomainId: [input.domainId],
    OplStageId: [input.stageId],
    OplTaskId: input.taskId ? [input.taskId] : [],
    OplSourceFingerprint: input.sourceFingerprint ? [input.sourceFingerprint] : [],
    OplExecutorKind: [input.executorKind],
  };
}

export function buildTemporalStageAttemptVisibility(input: {
  providerKind: string;
  stageAttemptId: string;
  workflowId: string;
  domainId: string;
  stageId: string;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  executorKind: string;
  providerRun: JsonRecord;
}) {
  if (input.providerKind !== 'temporal') {
    return null;
  }
  const runId = optionalString(input.providerRun.run_id)
    ?? optionalString(input.providerRun.first_execution_run_id)
    ?? optionalString(input.providerRun.diagnostic_run_id);
  return {
    surface_kind: 'temporal_stage_attempt_visibility',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    run_id: runId,
    namespace: resolveTemporalNamespace(),
    task_queue: resolveTemporalTaskQueue(),
    search_attributes: temporalStageAttemptTypedSearchAttributes(input),
    search_attribute_refs: temporalSearchAttributeRefs(),
    visibility_payload_policy: 'refs_and_indexable_summary_only_no_transcript_artifact_memory_or_domain_body',
    authority_boundary: {
      opl: 'temporal_visibility_metadata_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
    },
  };
}

export function buildTemporalWebUiRef(visibility: ReturnType<typeof buildTemporalStageAttemptVisibility>) {
  if (!visibility) {
    return null;
  }
  const baseUrl = temporalWebUiBaseUrl().replace(/\/+$/, '');
  const namespace = encodeURIComponent(visibility.namespace);
  const workflowId = encodeURIComponent(visibility.workflow_id);
  const runParam = visibility.run_id ? `&runId=${encodeURIComponent(visibility.run_id)}` : '';
  return {
    surface_kind: 'temporal_webui_ref',
    provider_kind: 'temporal',
    ref_role: 'operator_debug_link_only',
    stage_attempt_id: visibility.stage_attempt_id,
    workflow_id: visibility.workflow_id,
    run_id: visibility.run_id,
    namespace: visibility.namespace,
    url: `${baseUrl}/namespaces/${namespace}/workflows/${workflowId}/history?${runParam}`,
    fallback_cli: `temporal workflow describe --namespace ${visibility.namespace} --workflow-id ${visibility.workflow_id}`,
    authority_boundary: {
      opl: 'debug_link_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      user_primary_app_surface: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
    },
  };
}
