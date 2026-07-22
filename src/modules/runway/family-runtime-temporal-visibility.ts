import type { Connection } from '@temporalio/client';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import type { WorkItemExecutionScopeSnapshot } from '../workspace/public/standard-agent-action-runtime.ts';
import {
  resolveTemporalAddress,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
} from './family-runtime-temporal.ts';
import {
  type TemporalWorkerPaths,
  withTemporalClient,
} from './family-runtime-temporal-client.ts';
import {
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';

export {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
} from './family-runtime-temporal-visibility-payload.ts';

type JsonRecord = Record<string, unknown>;
type SearchAttributeType = 'Keyword' | 'Text' | 'Int' | 'Double' | 'Bool' | 'Datetime' | 'KeywordList';
const TEMPORAL_VISIBILITY_INSPECTION_CONNECT_TIMEOUT_MS = 1_000;
export const TEMPORAL_KEYWORD_SEARCH_ATTRIBUTE_LIMIT = 10;

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
  { name: 'OplStageRunId', type: 'Keyword', source: 'stage_run_id' },
  { name: 'OplWorkItemScopeId', type: 'Keyword', source: 'execution_scope.work_item_scope_id' },
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
  stageRunId?: string | null;
  executionScope?: WorkItemExecutionScopeSnapshot | null;
  domainId: string;
  stageId: string;
  status?: string | null;
  stagePhase?: string | null;
  blockedReason?: string | null;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  executorKind: string;
}) {
  return {
    OplStageAttemptId: [input.stageAttemptId],
    OplStageRunId: input.stageRunId ? [input.stageRunId] : [],
    OplWorkItemScopeId: input.executionScope ? [input.executionScope.work_item_scope_id] : [],
  };
}

export function buildTemporalStageRunSearchAttributes(
  input: import('./family-runtime-temporal-stage-run.ts').TemporalStageRunWorkflowInput,
) {
  return {
    OplStageAttemptId: [],
    OplStageRunId: [input.stage_run_id],
    OplWorkItemScopeId: input.execution_scope ? [input.execution_scope.work_item_scope_id] : [],
  };
}

export function buildTemporalStageRunMemo(
  input: import('./family-runtime-temporal-stage-run.ts').TemporalStageRunWorkflowInput,
) {
  return {
    surface_kind: 'opl_temporal_stage_run_memo',
    owner: 'one-person-lab',
    stage_run_id: input.stage_run_id,
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    project_scope_id: input.execution_scope?.project_scope_id ?? null,
    work_item_scope_id: input.execution_scope?.work_item_scope_id ?? null,
    workspace_binding_id: input.execution_scope?.workspace_binding_id ?? null,
    scope_digest: input.execution_scope?.scope_digest ?? null,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    executor_kind: input.executor_kind,
    task_id: input.task_id ?? null,
    source_fingerprint: input.source_fingerprint ?? null,
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
  const conflicting = observed
    ? TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.filter((attribute) =>
      Object.hasOwn(observed, attribute.name) && observed[attribute.name] !== attribute.type
    )
    : [];
  const missing = observed
    ? TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.filter((attribute) =>
      observed[attribute.name] !== attribute.type
    )
    : unindexedTestServer ? [] : TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES;
  const absent = observed
    ? TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.filter((attribute) =>
      !Object.hasOwn(observed, attribute.name)
    )
    : [];
  const presentKeywordNames = observed
    ? Object.entries(observed)
      .filter(([, type]) => type === 'Keyword')
      .map(([name]) => name)
    : [];
  const projectedKeywordCount = observed
    ? presentKeywordNames.length + absent.filter((attribute) => attribute.type === 'Keyword').length
    : null;
  const keywordCapacityExceeded = projectedKeywordCount !== null
    && projectedKeywordCount > TEMPORAL_KEYWORD_SEARCH_ATTRIBUTE_LIMIT;
  const readinessStatus = input.inspectionError
    ? 'inspection_failed'
    : unindexedTestServer
      ? 'test_server_unindexed_visibility'
      : observed
      ? conflicting.length > 0
        ? 'search_attribute_type_conflict'
        : keywordCapacityExceeded
          ? 'search_attribute_capacity_exceeded'
          : missing.length === 0 ? 'ready' : 'missing_search_attributes'
      : 'not_verified';
  const migrationRequired = readinessStatus === 'search_attribute_type_conflict'
    || readinessStatus === 'search_attribute_capacity_exceeded';
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
    keyword_capacity: {
      limit: TEMPORAL_KEYWORD_SEARCH_ATTRIBUTE_LIMIT,
      present_count: observed ? presentKeywordNames.length : null,
      missing_required_count: observed ? absent.length : null,
      projected_count: projectedKeywordCount,
      capacity_status: keywordCapacityExceeded ? 'capacity_exceeded' : observed ? 'within_limit' : 'not_verified',
      automatic_remove_allowed: false,
    },
    unindexed_visibility_allowed_for_test_server: unindexedTestServer,
    conflicting_search_attributes: conflicting.map((attribute) => ({
      ...attribute,
      observed_type: observed?.[attribute.name] ?? null,
    })),
    missing_search_attributes: missing.map((attribute) => ({
      ...attribute,
      repair_command: repairCommand(attribute.name, attribute.type, namespace, address),
    })),
    repair_action: missing.length > 0 || input.inspectionError || migrationRequired
      ? {
          action_id: input.inspectionError
            ? 'inspect_temporal_search_attributes'
            : migrationRequired
              ? 'migrate_temporal_visibility_namespace'
              : 'install_temporal_stage_attempt_search_attributes',
          commands: migrationRequired
            ? []
            : missing.length > 0
            ? missing.map((attribute) => repairCommand(attribute.name, attribute.type, namespace, address))
            : requiredSearchAttributesSummary(namespace, address).map((attribute) => attribute.repair_command),
          next_check: migrationRequired
            ? 'provision a fresh Temporal namespace, install the required attributes, then read back readiness before routing new workflows'
            : 'opl family-runtime worker status --provider temporal',
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
  stageRunId?: string | null;
  executionScope?: WorkItemExecutionScopeSnapshot | null;
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
  const namespace = stringValue(input.providerRun.namespace) ?? resolveTemporalNamespace();
  const runId = stringValue(input.providerRun.run_id)
    ?? stringValue(input.providerRun.first_execution_run_id)
    ?? stringValue(input.providerRun.diagnostic_run_id);
  return {
    surface_kind: 'temporal_stage_attempt_visibility',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    run_id: runId,
    namespace,
    task_queue: stringValue(input.providerRun.task_queue) ?? resolveTemporalTaskQueue(),
    workflow_status: stringValue(input.providerRun.workflow_status)
      ?? stringValue(input.providerRun.provider_status)
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

export async function inspectTemporalStageAttemptVisibilityReadiness(
  paths?: TemporalWorkerPaths,
  input: { taskQueue?: string | null } = {},
) {
  const resolved = resolveTemporalAddressForPaths(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  if (!resolved.address) {
    return buildTemporalStageAttemptVisibilityReadiness({
      address: null,
      addressSource: resolved.addressSource,
      namespace,
      taskQueue,
    });
  }
  try {
    return await withTemporalClient(async (_client, connection) =>
      buildTemporalStageAttemptVisibilityReadiness({
        address: resolved.address,
        addressSource: resolved.addressSource,
        namespace,
        taskQueue,
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
      taskQueue,
      inspectionError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureTemporalStageAttemptVisibilityReady(
  connection: Connection,
  input: { namespace?: string | null; address?: string | null; taskQueue?: string | null } = {},
) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const address = input.address ?? resolveTemporalAddress();
  const taskQueue = input.taskQueue ?? resolveTemporalTaskQueue();
  if (temporalTestServerAllowsUnindexedVisibility()) {
    return buildTemporalStageAttemptVisibilityReadiness({
      address,
      namespace,
      taskQueue,
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
      taskQueue,
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
    taskQueue,
    observedCustomAttributes: observed,
  });
  if (readiness.readiness_status === 'search_attribute_type_conflict') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal stage attempt visibility Search Attributes conflict with installed attribute types.',
      {
        failure_code: 'temporal_search_attribute_type_conflict',
        provider_kind: 'temporal',
        namespace,
        conflicting_search_attributes: readiness.conflicting_search_attributes,
        repair_action: readiness.repair_action,
      },
    );
  }
  if (readiness.readiness_status === 'search_attribute_capacity_exceeded') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal Keyword Search Attribute capacity would be exceeded before required attributes are installed.',
      {
        failure_code: 'temporal_search_attribute_capacity_exceeded',
        provider_kind: 'temporal',
        namespace,
        keyword_capacity: readiness.keyword_capacity,
        missing_search_attributes: readiness.missing_search_attributes,
        repair_action: readiness.repair_action,
      },
    );
  }
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
    taskQueue,
    observedCustomAttributes: refreshed,
  });
  if (refreshedReadiness.readiness_status !== 'ready') {
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
