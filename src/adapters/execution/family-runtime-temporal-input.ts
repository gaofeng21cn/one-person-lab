import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  StageQualityAttemptRole,
  StageQualityFinding,
  StageQualityRepairMapEntry,
} from '../../authority/stages/index.ts';
import { normalizeStageQualityAttemptRole } from '../../authority/stages/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import {
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  TEMPORAL_MAX_INLINE_PAYLOAD_BYTES,
  temporalPayloadHistoryPolicy,
} from './family-runtime-temporal-contract.ts';
import {
  requireFamilyRuntimeExecutionScope,
  requireSameFamilyRuntimeExecutionIdentity,
  type FamilyRuntimeExecutionScopeKind,
  type WorkItemExecutionScopeSnapshot,
} from './family-runtime-execution-scope.ts';
import { requireStageQualityAttemptBoundary } from './family-runtime-stage-quality-attempt-boundary.ts';
import type {
  StageAttemptExecutionContentBinding,
} from './family-runtime-temporal-stage-run.ts';
import type { StageRunImmutableSpec } from './family-runtime-stage-run-identity.ts';

export type TemporalStageAttemptWorkflowInput = {
  stage_attempt_id: string;
  workflow_id: string;
  scope_kind?: FamilyRuntimeExecutionScopeKind;
  execution_scope?: WorkItemExecutionScopeSnapshot | null;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator: Record<string, unknown>;
  source_fingerprint: string | null;
  executor_kind: string;
  stage_run_id?: string | null;
  stage_run_content_binding_version?: 'opl-stage-run-attempt-content-binding.v1' | null;
  stage_run_spec_sha256?: string | null;
  stage_run_spec?: StageRunImmutableSpec | null;
  execution_content_binding?: StageAttemptExecutionContentBinding | null;
  domain_pack_root?: string | null;
  quality_cycle_id?: string | null;
  attempt_role?: StageQualityAttemptRole | null;
  quality_round_index?: number | null;
  parent_attempt_ref?: string | null;
  parent_attempt_lineage?: {
    stage_run_id: string;
    quality_cycle_id: string;
  } | null;
  input_artifact_refs?: string[];
  reviewed_artifact_hashes?: string[];
  quality_source_refs?: string[];
  quality_rubric_refs?: string[];
  knowledge_refs?: string[];
  skill_refs?: string[];
  policy_refs?: string[];
  prior_finding_refs?: string[];
  repair_map_refs?: string[];
  quality_role_prompt_ref?: string | null;
  context_manifest_ref?: string | null;
  no_context_inheritance?: boolean | null;
  quality_context?: {
    findings?: StageQualityFinding[];
    repair_map?: StageQualityRepairMapEntry[];
    context_manifest?: Record<string, unknown>;
  };
  stage_attempt_executor_policy?: Record<string, unknown> | null;
  retry_budget: Record<string, unknown>;
  route_impact?: Record<string, unknown>;
  task_id?: string | null;
  stage_packet_ref?: string | null;
  checkpoint_refs?: string[];
  payload_guard?: {
    policy: ReturnType<typeof temporalPayloadHistoryPolicy>;
    truncated_fields: Array<{
      field: string;
      original_bytes: number;
      ref: string;
    }>;
  };
  closeout_packet?: Record<string, unknown> | null;
  provider_blocker?: {
    blocked_reason?: string | null;
    route_impact?: Record<string, unknown>;
  } | null;
  visibility_search_attributes_upsert_enabled?: boolean;
  codex_stage_runner?: {
    runner_mode?: 'dry_run' | 'live_dry_run' | 'codex_cli';
    timeout_ms?: number;
    no_output_timeout_ms?: number;
  };
};

function payloadRefFor(value: string) {
  return `${temporalPayloadHistoryPolicy().large_payload_ref_prefix}${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function guardInlineString(input: {
  field: string;
  value?: string | null;
  truncatedFields: Array<{ field: string; original_bytes: number; ref: string }>;
}) {
  if (!input.value) {
    return input.value ?? null;
  }
  const bytes = Buffer.byteLength(input.value, 'utf8');
  if (bytes <= TEMPORAL_MAX_INLINE_PAYLOAD_BYTES) {
    return input.value;
  }
  const ref = payloadRefFor(input.value);
  input.truncatedFields.push({
    field: input.field,
    original_bytes: bytes,
    ref,
  });
  return ref;
}

export function guardTemporalStageAttemptWorkflowInputPayload(
  input: TemporalStageAttemptWorkflowInput,
): TemporalStageAttemptWorkflowInput {
  const truncatedFields: Array<{ field: string; original_bytes: number; ref: string }> = [];
  const checkpointRefs = (input.checkpoint_refs ?? [])
    .map((entry, index) => guardInlineString({
      field: `checkpoint_refs[${index}]`,
      value: entry,
      truncatedFields,
    }))
    .filter((entry): entry is string => typeof entry === 'string');
  const stagePacketRef = guardInlineString({
    field: 'stage_packet_ref',
    value: input.stage_packet_ref ?? checkpointRefs[0] ?? null,
    truncatedFields,
  });
  if (truncatedFields.length === 0) {
    return input;
  }
  return {
    ...input,
    stage_packet_ref: stagePacketRef,
    checkpoint_refs: checkpointRefs,
    payload_guard: {
      policy: temporalPayloadHistoryPolicy(),
      truncated_fields: [
        ...(input.payload_guard?.truncated_fields ?? []),
        ...truncatedFields,
      ],
    },
  };
}

export function buildTemporalStageAttemptWorkflowInput(
  attempt: {
    stage_attempt_id: string;
    workflow_id: string;
    domain_id: FamilyRuntimeDomainId;
    stage_id: string;
    workspace_locator: Record<string, unknown>;
    scope_kind?: unknown;
    execution_scope?: unknown;
    identity_state?: unknown;
    source_fingerprint: string | null;
    executor_kind: string;
    stage_run_id?: string | null;
    quality_cycle_id?: string | null;
    attempt_role?: unknown;
    quality_round_index?: number | null;
    parent_attempt_ref?: string | null;
    input_artifact_refs?: unknown[];
    reviewed_artifact_hashes?: unknown[];
    quality_source_refs?: unknown[];
    quality_rubric_refs?: unknown[];
    knowledge_refs?: unknown[];
    skill_refs?: unknown[];
    policy_refs?: unknown[];
    prior_finding_refs?: unknown[];
    repair_map_refs?: unknown[];
    quality_context?: Record<string, unknown> | null;
    quality_role_prompt_ref?: string | null;
    context_manifest_ref?: string | null;
    context_manifest?: Record<string, unknown> | null;
    no_context_inheritance?: boolean | null;
    stage_attempt_executor_policy?: unknown;
    retry_budget: Record<string, unknown>;
    route_impact?: Record<string, unknown>;
    idempotency_key?: string | null;
    task_id?: string | null;
    checkpoint_refs?: unknown[];
  },
): TemporalStageAttemptWorkflowInput {
  requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: attempt as unknown as Record<string, unknown>,
    candidateIdentity: attempt as unknown as Record<string, unknown>,
    operation: 'build_temporal_stage_attempt_input',
    compareStageAttemptId: true,
    compareWorkflowId: true,
  });
  const checkpointRefs = Array.isArray(attempt.checkpoint_refs)
    ? attempt.checkpoint_refs.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
  const executorKind = attempt.executor_kind;
  const executionScope = requireFamilyRuntimeExecutionScope({
    scopeKind: attempt.scope_kind,
    executionScope: attempt.execution_scope,
    workspaceLocator: attempt.workspace_locator,
    domainId: attempt.domain_id,
    operation: 'build_temporal_stage_attempt_input',
  });
  return guardTemporalStageAttemptWorkflowInputPayload({
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    scope_kind: executionScope.scopeKind,
    execution_scope: executionScope.executionScope,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    executor_kind: executorKind,
    stage_run_id: optionalText(attempt.stage_run_id),
    quality_cycle_id: optionalText(attempt.quality_cycle_id),
    attempt_role: attempt.attempt_role
      ? normalizeStageQualityAttemptRole(attempt.attempt_role)
      : null,
    quality_round_index: Number.isInteger(attempt.quality_round_index)
      ? attempt.quality_round_index
      : null,
    parent_attempt_ref: optionalText(attempt.parent_attempt_ref),
    parent_attempt_lineage: attempt.parent_attempt_ref
      ? {
          stage_run_id: optionalText(attempt.stage_run_id) ?? '',
          quality_cycle_id: optionalText(attempt.quality_cycle_id) ?? '',
        }
      : null,
    input_artifact_refs: Array.isArray(attempt.input_artifact_refs)
      ? attempt.input_artifact_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    reviewed_artifact_hashes: Array.isArray(attempt.reviewed_artifact_hashes)
      ? attempt.reviewed_artifact_hashes.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_source_refs: Array.isArray(attempt.quality_source_refs)
      ? attempt.quality_source_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_rubric_refs: Array.isArray(attempt.quality_rubric_refs)
      ? attempt.quality_rubric_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    knowledge_refs: Array.isArray(attempt.knowledge_refs)
      ? attempt.knowledge_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    skill_refs: Array.isArray(attempt.skill_refs)
      ? attempt.skill_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    policy_refs: Array.isArray(attempt.policy_refs)
      ? attempt.policy_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    prior_finding_refs: Array.isArray(attempt.prior_finding_refs)
      ? attempt.prior_finding_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    repair_map_refs: Array.isArray(attempt.repair_map_refs)
      ? attempt.repair_map_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_role_prompt_ref: optionalText(attempt.quality_role_prompt_ref),
    context_manifest_ref: optionalText(attempt.context_manifest_ref),
    no_context_inheritance: attempt.no_context_inheritance ?? null,
    quality_context: attempt.context_manifest || attempt.quality_context
      ? {
          ...(attempt.quality_context ?? {}),
          ...(attempt.context_manifest ? { context_manifest: attempt.context_manifest } : {}),
        }
      : undefined,
    stage_attempt_executor_policy: optionalRecord(attempt.stage_attempt_executor_policy),
    retry_budget: attempt.retry_budget,
    route_impact: optionalRecord(attempt.route_impact) ?? {},
    task_id: typeof attempt.task_id === 'string' ? attempt.task_id : null,
    stage_packet_ref: checkpointRefs[0] ?? null,
    checkpoint_refs: checkpointRefs,
    codex_stage_runner: executorKind === 'codex_cli'
      ? {
          runner_mode: 'codex_cli',
          timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
          no_output_timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
        }
      : undefined,
  });
}

export function requireTemporalStageAttemptWorkflowInputLaunchable(input: TemporalStageAttemptWorkflowInput) {
  requireStageQualityAttemptBoundary(input as unknown as Record<string, unknown>);
  requireFamilyRuntimeExecutionScope({
    scopeKind: input.scope_kind,
    executionScope: input.execution_scope,
    workspaceLocator: input.workspace_locator,
    domainId: input.domain_id,
    operation: 'launch_temporal_stage_attempt',
  });
  const workspaceRoot = typeof input.workspace_locator.workspace_root === 'string' && input.workspace_locator.workspace_root.trim()
    ? input.workspace_locator.workspace_root.trim()
    : typeof input.workspace_locator.repo_root === 'string' && input.workspace_locator.repo_root.trim()
      ? input.workspace_locator.repo_root.trim()
      : null;
  if (input.executor_kind === 'codex_cli' && !workspaceRoot) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal codex_cli workflow input requires a domain workspace root.',
      {
        stage_attempt_id: input.stage_attempt_id,
        workflow_id: input.workflow_id,
        executor_kind: input.executor_kind,
        blocked_reason: 'codex_cli_workspace_root_missing',
        required: ['workspace_locator.workspace_root or workspace_locator.repo_root'],
      },
    );
  }
  return input;
}
