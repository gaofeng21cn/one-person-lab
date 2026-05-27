import type { Connection } from '@temporalio/client';

import { FrameworkContractError } from './contracts.ts';
import {
  resolveTemporalAddress,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptWorkflowInput,
} from './family-runtime-temporal.ts';
import {
  type TemporalWorkerPaths,
  withTemporalClient,
} from './family-runtime-temporal-client.ts';
import {
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';

type JsonRecord = Record<string, unknown>;
type SearchAttributeType = 'Keyword' | 'Text' | 'Int' | 'Double' | 'Bool' | 'Datetime' | 'KeywordList';
const TEMPORAL_VISIBILITY_INSPECTION_CONNECT_TIMEOUT_MS = 1_000;

const INDEXED_VALUE_TYPE: Record<SearchAttributeType, number> = {
  Text: 1,
  Keyword: 2,
  Int: 3,
  Double: 4,
  Bool: 5,
  Datetime: 6,
  KeywordList: 7,
};

export const TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES = [
  { name: 'OplStageAttemptId', type: 'Keyword', source: 'stage_attempt_id' },
  { name: 'OplDomainId', type: 'Keyword', source: 'domain_id' },
  { name: 'OplStageId', type: 'Keyword', source: 'stage_id' },
  { name: 'OplAttemptStatus', type: 'Keyword', source: 'provider_status_initial' },
  { name: 'OplStagePhase', type: 'Keyword', source: 'workflow_current_phase' },
  { name: 'OplBlockedReason', type: 'Keyword', source: 'short_blocked_reason' },
  { name: 'OplTaskId', type: 'Keyword', source: 'task_id' },
  { name: 'OplSourceFingerprint', type: 'Keyword', source: 'source_fingerprint' },
  { name: 'OplExecutorKind', type: 'Keyword', source: 'executor_kind' },
] as const satisfies ReadonlyArray<{
  name: string;
  type: SearchAttributeType;
  source: string;
}>;

export type TemporalStageAttemptSearchAttributeName =
  typeof TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES[number]['name'];

type TemporalVisibilityReadinessInput = {
  address?: string | null;
  addressSource?: string | null;
  namespace?: string | null;
  taskQueue?: string | null;
  observedCustomAttributes?: Record<string, string | number> | null;
  inspectionError?: string | null;
  unindexedTestServer?: boolean;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function temporalCliAddressArg(address: string | null) {
  return address ? ` --address ${address}` : '';
}

function repairCommand(name: string, type: SearchAttributeType, namespace: string, address: string | null) {
  return `temporal operator search-attribute create --namespace ${namespace}${temporalCliAddressArg(address)} --name ${name} --type ${type}`;
}

function enumName(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === 1) return 'Text';
  if (value === 2) return 'Keyword';
  if (value === 3) return 'Int';
  if (value === 4) return 'Double';
  if (value === 5) return 'Bool';
  if (value === 6) return 'Datetime';
  if (value === 7) return 'KeywordList';
  return null;
}

function observedAttributeType(value: unknown) {
  const normalized = enumName(value);
  if (!normalized) {
    return null;
  }
  if (normalized.includes('KEYWORD_LIST')) return 'KeywordList';
  if (normalized.includes('KEYWORD')) return 'Keyword';
  if (normalized.includes('TEXT')) return 'Text';
  if (normalized.includes('INT')) return 'Int';
  if (normalized.includes('DOUBLE')) return 'Double';
  if (normalized.includes('BOOL')) return 'Bool';
  if (normalized.includes('DATETIME')) return 'Datetime';
  return normalized;
}

function normalizeCustomAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).map(([key, type]) => [
    key,
    observedAttributeType(type) ?? String(type),
  ]));
}

function requiredSearchAttributesSummary(namespace: string, address: string | null) {
  return TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.map((attribute) => ({
    ...attribute,
    repair_command: repairCommand(attribute.name, attribute.type, namespace, address),
  }));
}

function temporalSearchAttributeRefs() {
  return TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES
    .map((attribute) => `temporal-search-attribute:${attribute.name}`);
}

export function temporalStageAttemptTypedSearchAttributes(input: {
  stageAttemptId: string;
  domainId: string;
  stageId: string;
  status?: string | null;
  stagePhase?: string | null;
  blockedReason?: string | null;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  executorKind: string;
}) {
  const blockedReason = optionalString(input.blockedReason);
  return {
    OplStageAttemptId: [input.stageAttemptId],
    OplDomainId: [input.domainId],
    OplStageId: [input.stageId],
    OplAttemptStatus: [input.status ?? 'registered'],
    OplStagePhase: [input.stagePhase ?? input.status ?? 'registered'],
    OplBlockedReason: blockedReason ? [blockedReason] : [],
    OplTaskId: input.taskId ? [input.taskId] : [],
    OplSourceFingerprint: input.sourceFingerprint ? [input.sourceFingerprint] : [],
    OplExecutorKind: [input.executorKind],
  };
}

export function buildTemporalStageAttemptSearchAttributes(input: TemporalStageAttemptWorkflowInput) {
  return {
    OplStageAttemptId: [input.stage_attempt_id],
    OplDomainId: [input.domain_id],
    OplStageId: [input.stage_id],
    OplAttemptStatus: ['registered'],
    OplStagePhase: ['registered'],
    OplBlockedReason: input.provider_blocker?.blocked_reason ? [input.provider_blocker.blocked_reason] : [],
    OplTaskId: input.task_id ? [input.task_id] : [],
    OplSourceFingerprint: input.source_fingerprint ? [input.source_fingerprint] : [],
    OplExecutorKind: [input.executor_kind],
  };
}

export function buildTemporalStageAttemptMemo(input: TemporalStageAttemptWorkflowInput) {
  return {
    surface_kind: 'opl_temporal_stage_attempt_memo',
    owner: 'one-person-lab',
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    executor_kind: input.executor_kind,
    task_id: input.task_id ?? null,
  };
}

export function buildTemporalStageAttemptVisibilityReadiness(
  input: TemporalVisibilityReadinessInput = {},
) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  const address = input.address ?? resolveTemporalAddress();
  const unindexedTestServer = input.unindexedTestServer === true;
  const observed = input.observedCustomAttributes
    ? normalizeCustomAttributes(input.observedCustomAttributes)
    : null;
  const missing = observed
    ? TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.filter((attribute) =>
      observed[attribute.name] !== attribute.type
    )
    : unindexedTestServer ? [] : TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES;
  const readinessStatus = input.inspectionError
    ? 'inspection_failed'
    : unindexedTestServer
      ? 'test_server_unindexed_visibility'
      : observed
      ? missing.length === 0 ? 'ready' : 'missing_search_attributes'
      : 'not_verified';
  return {
    surface_kind: 'temporal_stage_attempt_visibility_readiness',
    provider_kind: 'temporal',
    readiness_status: readinessStatus,
    namespace,
    task_queue: taskQueue,
    address,
    address_source: input.addressSource ?? (address ? 'environment' : 'not_configured'),
    required_search_attributes: requiredSearchAttributesSummary(namespace, address),
    observed_custom_attributes: observed,
    unindexed_visibility_allowed_for_test_server: unindexedTestServer,
    missing_search_attributes: missing.map((attribute) => ({
      ...attribute,
      repair_command: repairCommand(attribute.name, attribute.type, namespace, address),
    })),
    repair_action: missing.length > 0 || input.inspectionError
      ? {
          action_id: input.inspectionError
            ? 'inspect_temporal_search_attributes'
            : 'install_temporal_stage_attempt_search_attributes',
          commands: missing.length > 0
            ? missing.map((attribute) => repairCommand(attribute.name, attribute.type, namespace, address))
            : requiredSearchAttributesSummary(namespace, address).map((attribute) => attribute.repair_command),
          next_check: 'opl family-runtime worker status --provider temporal',
        }
      : null,
    inspection_error: input.inspectionError ?? null,
    visibility_policy:
      unindexedTestServer
        ? 'test_server_unindexed_visibility_refs_only_no_production_searchability_claim'
        : 'search_attributes_hold_small_stage_attempt_refs_only_no_transcript_artifact_memory_or_domain_truth_body',
    authority_boundary: {
      opl: 'temporal_visibility_readiness_and_debug_ref_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export type TemporalStageAttemptVisibilityReadiness =
  ReturnType<typeof buildTemporalStageAttemptVisibilityReadiness>;

export function temporalTestServerAllowsUnindexedVisibility() {
  return process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY?.trim() === '1';
}

export function buildTemporalStageAttemptVisibility(input: {
  providerKind: string;
  stageAttemptId: string;
  workflowId: string;
  domainId: string;
  stageId: string;
  status?: string | null;
  stagePhase?: string | null;
  blockedReason?: string | null;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  executorKind: string;
  providerRun: JsonRecord;
  visibilityReadiness?: TemporalStageAttemptVisibilityReadiness | null;
}) {
  if (input.providerKind !== 'temporal') {
    return null;
  }
  const namespace = optionalString(input.providerRun.namespace) ?? resolveTemporalNamespace();
  const runId = optionalString(input.providerRun.run_id)
    ?? optionalString(input.providerRun.first_execution_run_id)
    ?? optionalString(input.providerRun.diagnostic_run_id);
  return {
    surface_kind: 'temporal_stage_attempt_visibility',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    run_id: runId,
    namespace,
    task_queue: optionalString(input.providerRun.task_queue) ?? resolveTemporalTaskQueue(),
    workflow_status: optionalString(input.providerRun.workflow_status)
      ?? optionalString(input.providerRun.provider_status)
      ?? input.status
      ?? null,
    current_phase: input.stagePhase ?? input.status ?? null,
    blocked_reason: input.blockedReason ?? null,
    search_attributes: temporalStageAttemptTypedSearchAttributes(input),
    search_attribute_refs: temporalSearchAttributeRefs(),
    visibility_readiness: input.visibilityReadiness
      ?? buildTemporalStageAttemptVisibilityReadiness({ namespace }),
    visibility_payload_policy: 'refs_and_indexable_summary_only_no_transcript_artifact_memory_or_domain_body',
    temporal_cli_ref: runId
      ? `temporal workflow show --namespace ${namespace} --workflow-id ${input.workflowId} --run-id ${runId}`
      : `temporal workflow show --namespace ${namespace} --workflow-id ${input.workflowId}`,
    authority_boundary: {
      opl: 'temporal_visibility_metadata_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function buildTemporalStageAttemptWebUiRef(input: {
  namespace?: string | null;
  workflowId: string;
  runId?: string | null;
  stageAttemptId?: string | null;
}) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const configuredBase = process.env.OPL_TEMPORAL_WEB_UI_URL?.trim()
    || process.env.TEMPORAL_WEB_UI_URL?.trim()
    || null;
  const baseUrl = (configuredBase ?? 'http://localhost:8233').replace(/\/+$/, '');
  const workflowPath = `/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(input.workflowId)}`;
  const url = input.runId
    ? `${baseUrl}${workflowPath}/${encodeURIComponent(input.runId)}/history`
    : `${baseUrl}${workflowPath}`;
  return {
    surface_kind: 'temporal_webui_ref',
    provider_kind: 'temporal',
    ref_role: 'operator_debug_link_only',
    stage_attempt_id: input.stageAttemptId ?? null,
    namespace,
    workflow_id: input.workflowId,
    run_id: input.runId ?? null,
    url,
    base_url_source: configuredBase ? 'environment' : 'temporal_cli_default_local_web_ui',
    fallback_cli_command: input.runId
      ? `temporal workflow show --namespace ${namespace} --workflow-id ${input.workflowId} --run-id ${input.runId}`
      : `temporal workflow show --namespace ${namespace} --workflow-id ${input.workflowId}`,
    authority_boundary: {
      opl: 'debug_link_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      user_primary_app_surface: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function buildTemporalWebUiRef(visibility: ReturnType<typeof buildTemporalStageAttemptVisibility>) {
  if (!visibility) {
    return null;
  }
  return buildTemporalStageAttemptWebUiRef({
    namespace: visibility.namespace,
    workflowId: visibility.workflow_id,
    runId: visibility.run_id,
    stageAttemptId: visibility.stage_attempt_id,
  });
}

async function listTemporalCustomSearchAttributes(connection: Connection, namespace: string) {
  const result = await connection.operatorService.listSearchAttributes({ namespace });
  return normalizeCustomAttributes(result.customAttributes ?? {});
}

export async function inspectTemporalStageAttemptVisibilityReadiness(paths?: TemporalWorkerPaths) {
  const resolved = resolveTemporalAddressForPaths(paths);
  const namespace = resolveTemporalNamespace();
  if (!resolved.address) {
    return buildTemporalStageAttemptVisibilityReadiness({
      address: null,
      addressSource: resolved.addressSource,
      namespace,
      taskQueue: resolveTemporalTaskQueue(),
    });
  }
  try {
    return await withTemporalClient(async (_client, connection) =>
      buildTemporalStageAttemptVisibilityReadiness({
        address: resolved.address,
        addressSource: resolved.addressSource,
        namespace,
        taskQueue: resolveTemporalTaskQueue(),
        observedCustomAttributes: await listTemporalCustomSearchAttributes(connection, namespace),
      }), {
        paths,
        addressOverride: resolved.address,
        connectTimeoutMs: TEMPORAL_VISIBILITY_INSPECTION_CONNECT_TIMEOUT_MS,
      });
  } catch (error) {
    return buildTemporalStageAttemptVisibilityReadiness({
      address: resolved.address,
      addressSource: resolved.addressSource,
      namespace,
      taskQueue: resolveTemporalTaskQueue(),
      inspectionError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureTemporalStageAttemptVisibilityReady(
  connection: Connection,
  input: { namespace?: string | null; address?: string | null } = {},
) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const address = input.address ?? resolveTemporalAddress();
  if (temporalTestServerAllowsUnindexedVisibility()) {
    return buildTemporalStageAttemptVisibilityReadiness({
      address,
      namespace,
      taskQueue: resolveTemporalTaskQueue(),
      unindexedTestServer: true,
    });
  }
  let observed: Record<string, string>;
  try {
    observed = await listTemporalCustomSearchAttributes(connection, namespace);
  } catch (error) {
    const readiness = buildTemporalStageAttemptVisibilityReadiness({
      address,
      namespace,
      taskQueue: resolveTemporalTaskQueue(),
      inspectionError: error instanceof Error ? error.message : String(error),
    });
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal stage attempt visibility Search Attributes could not be inspected.',
      {
        provider_kind: 'temporal',
        namespace,
        required_search_attributes: readiness.required_search_attributes,
        repair_action: readiness.repair_action,
        error: readiness.inspection_error,
      },
    );
  }
  const readiness = buildTemporalStageAttemptVisibilityReadiness({
    address,
    namespace,
    taskQueue: resolveTemporalTaskQueue(),
    observedCustomAttributes: observed,
  });
  if (readiness.missing_search_attributes.length === 0) {
    return readiness;
  }
  try {
    await connection.operatorService.addSearchAttributes({
      namespace,
      searchAttributes: Object.fromEntries(
        readiness.missing_search_attributes.map((attribute) => [
          attribute.name,
          INDEXED_VALUE_TYPE[attribute.type as SearchAttributeType],
        ]),
      ),
    });
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal stage attempt visibility Search Attributes are missing and could not be installed.',
      {
        provider_kind: 'temporal',
        namespace,
        missing_search_attributes: readiness.missing_search_attributes,
        repair_action: readiness.repair_action,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const refreshed = await listTemporalCustomSearchAttributes(connection, namespace);
  const refreshedReadiness = buildTemporalStageAttemptVisibilityReadiness({
    address,
    namespace,
    taskQueue: resolveTemporalTaskQueue(),
    observedCustomAttributes: refreshed,
  });
  if (refreshedReadiness.missing_search_attributes.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal stage attempt visibility Search Attributes remain missing after install.',
      {
        provider_kind: 'temporal',
        namespace,
        missing_search_attributes: refreshedReadiness.missing_search_attributes,
        repair_action: refreshedReadiness.repair_action,
      },
    );
  }
  return refreshedReadiness;
}
