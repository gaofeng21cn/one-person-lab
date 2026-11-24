import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { HostedAgentRuntimeBindingSnapshot } from '../hosted-agent-runtime-binding.ts';
import {
  reserveStandardAgentActionRunBinding,
  type StandardAgentActionRunPlan,
} from '../standard-agent-action-run-state.ts';
import type { StandardAgentActionContext } from './action-context.ts';
import { fail, sha256 } from './shared.ts';

export function packageUseBinding(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('Hosted Agent package_use_binding must be an object or null.');
  return value;
}

export function canonicalDomainIds(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function reserveStandardAgentActionRunPlan({
  requestedDomainId,
  runId,
  runtimeBinding,
  context,
  requestPayloadSha256,
  invocationSha256,
  requestBytes,
  timeoutMs,
  startedAt,
}: {
  requestedDomainId: string;
  runId: string;
  runtimeBinding: HostedAgentRuntimeBindingSnapshot;
  context: StandardAgentActionContext;
  requestPayloadSha256: string;
  invocationSha256: string;
  requestBytes: Buffer;
  timeoutMs: number | null;
  startedAt: string;
}) {
  const acceptedDomainIds = canonicalDomainIds([
    requestedDomainId,
    runtimeBinding.agent_id,
    runtimeBinding.runtime_domain_id,
    runtimeBinding.target_domain_id,
    ...runtimeBinding.catalog_target_domain_ids,
  ]);
  const catalogTargetDomainIds = canonicalDomainIds(runtimeBinding.catalog_target_domain_ids);
  const plan: StandardAgentActionRunPlan = {
    surface_kind: 'opl_standard_agent_action_run_plan',
    version: 'opl-standard-agent-action-run-plan.v2',
    run_id: runId,
    canonical_domain_id: runtimeBinding.agent_id,
    accepted_domain_ids: acceptedDomainIds,
    action_id: context.action.action_id,
    workspace_root: runtimeBinding.workspace_root,
    checkout_root: runtimeBinding.checkout_root,
    runtime_domain_id: runtimeBinding.runtime_domain_id,
    target_domain_id: runtimeBinding.target_domain_id,
    catalog_target_domain_ids: catalogTargetDomainIds,
    package_use_binding: packageUseBinding(runtimeBinding.package_use_binding),
    hosted_runtime_binding_ref: runtimeBinding.provenance_ref,
    execution_kind: context.action.execution_binding.kind,
    execution_scope: context.executionScope,
    catalog: context.catalog,
    handler_registry: context.registry,
    foundry_provider_manifest: context.foundryProvider as unknown as Record<string, unknown> | null,
    request_payload_sha256: requestPayloadSha256,
    original_invocation_sha256: invocationSha256,
    effective_payload: context.payload,
    request_sha256: sha256(requestBytes),
    request_byte_size: requestBytes.byteLength,
    input_schema_validation: context.inputValidation,
    timeout_ms: timeoutMs,
    started_at: startedAt,
  };
  const planBytes = canonicalJsonBytes(plan);
  const reservation = reserveStandardAgentActionRunBinding({
    workspaceRoot: runtimeBinding.workspace_root,
    binding: {
      surface_kind: 'opl_standard_agent_action_run_binding',
      version: 'opl-standard-agent-action-run-binding.v2',
      run_id: runId,
      canonical_domain_id: runtimeBinding.agent_id,
      action_id: context.action.action_id,
      hosted_runtime_binding_ref: runtimeBinding.provenance_ref,
      hosted_runtime_binding: runtimeBinding.provenance,
      plan_sha256: sha256(planBytes),
      plan_byte_size: planBytes.byteLength,
    },
    plan,
  });
  if (!reservation.plan || reservation.binding.version !== 'opl-standard-agent-action-run-binding.v2') {
    fail('Hosted Agent action run_id is already bound to an incompatible legacy run.', { run_id: runId });
  }
  return { binding: reservation.binding, plan: reservation.plan };
}
