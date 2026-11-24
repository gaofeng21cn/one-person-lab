import type { DomainHandlerRegistry, FamilyActionCatalog } from '../../../kernel/family-action-catalog-contract.ts';
import type { WorkItemExecutionScopeSnapshot } from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import type { HostedAgentRuntimeBindingProvenance } from '../hosted-agent-runtime-binding.ts';

export type StandardAgentActionRunBindingV1 = {
  surface_kind: 'opl_standard_agent_action_run_binding';
  version: 'opl-standard-agent-action-run-binding.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
};

export type StandardAgentActionRunBindingV2 = Omit<StandardAgentActionRunBindingV1, 'version'> & {
  version: 'opl-standard-agent-action-run-binding.v2';
  plan_sha256: string;
  plan_byte_size: number;
};

export type StandardAgentActionRunBinding =
  | StandardAgentActionRunBindingV1
  | StandardAgentActionRunBindingV2;

export type StandardAgentActionRunPlan = {
  surface_kind: 'opl_standard_agent_action_run_plan';
  version: 'opl-standard-agent-action-run-plan.v2';
  run_id: string;
  canonical_domain_id: string;
  accepted_domain_ids: string[];
  action_id: string;
  workspace_root: string;
  checkout_root: string;
  runtime_domain_id: string;
  target_domain_id: string;
  catalog_target_domain_ids: string[];
  package_use_binding: Record<string, unknown> | null;
  hosted_runtime_binding_ref: string;
  execution_kind: 'handler_ref' | 'stage_binding' | 'foundry_binding';
  execution_scope: WorkItemExecutionScopeSnapshot | null;
  catalog: FamilyActionCatalog;
  handler_registry: DomainHandlerRegistry | null;
  foundry_provider_manifest: Record<string, unknown> | null;
  request_payload_sha256: string;
  original_invocation_sha256?: string;
  effective_payload?: Record<string, unknown>;
  request_sha256: string;
  request_byte_size: number;
  input_schema_validation: Record<string, unknown>;
  timeout_ms: number | null;
  started_at: string;
};

export type StandardAgentCompletedHandlerReplay = {
  accepted_domain_ids: string[];
  request_payload_sha256: string;
  package_use_binding: Record<string, unknown> | null;
  input_schema_ref: string;
  input_schema_validation: Record<string, unknown>;
  output_schema_validation: Record<string, unknown>;
};

export type StandardAgentActionRunCompletion = {
  surface_kind: 'opl_standard_agent_action_run_completion';
  version: 'opl-standard-agent-action-run-completion.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  execution_kind: 'handler_ref' | 'stage_binding' | 'foundry_binding';
  status: 'completed' | 'started' | 'blocked' | 'failed';
  failure_disposition: 'permanent' | null;
  binding_ref: string;
  hosted_runtime_binding_ref: string;
  request_sha256: string;
  request_byte_size: number;
  output_sha256: string;
  output_byte_size: number;
  sandbox: {
    runtime_kind: 'node_permission_model' | 'python_audit_hook';
    sandbox_kind: 'macos_sandbox_exec' | 'linux_runtime_guard_only';
    exit_code: number;
    timed_out: boolean;
  } | null;
  error: {
    error_code: string;
    message: string;
    details: Record<string, unknown>;
  } | null;
  completed_handler_replay: StandardAgentCompletedHandlerReplay | null;
};
