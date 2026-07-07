import { buildExternalSandboxProviderAdapterPlan, buildModelEndpointProviderReadback } from '../external-sandbox-provider-adapter.ts';
import {
  externalSandboxProviderPolicy,
  RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
} from './contract.ts';
import type { JsonRecord, RuntimeEnvironmentTargetInput } from './contract.ts';
import {
  normalizeTarget,
  targetRef,
} from './target-state.ts';

export function sandboxProviderPlan(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const policy = externalSandboxProviderPolicy();
  const modelEndpointPolicy = RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.model_endpoint_provider_policy as JsonRecord;
  const externalSelected = target.sandbox_provider === 'external_sandbox';
  const fastLocalEnvSelected = target.sandbox_provider === 'fast_local_env';
  const localAgentSandboxSelected = target.sandbox_provider === 'local_devcontainer' || target.sandbox_provider === 'local_docker';
  const adapter = externalSelected ? buildExternalSandboxProviderAdapterPlan(targetRef(target)) : null;
  const localTemplateRef = localAgentSandboxSelected
    ? `local-sandbox-template:${target.sandbox_provider}:${targetRef(target)}`
    : null;
  const localSandboxPreflight = localAgentSandboxSelected
    ? {
        surface_kind: 'opl_local_sandbox_provider_preflight' as const,
        status: `${target.sandbox_provider}_preflight_required`,
        provider_kind: target.sandbox_provider,
        required_cli: 'docker',
        required_image_env: [
          'OPL_LOCAL_SANDBOX_IMAGE',
          'OPL_CODEX_STAGE_SANDBOX_IMAGE',
          'OPL_DEVCONTAINER_IMAGE',
        ],
        workspace_transport_required: 'git_clone_or_declared_workspace_mount',
        required_receipt_kind: 'sandbox_execution_receipt',
        credential_material_read: false,
        external_api_called: false,
        provider_lifecycle_managed: false,
        creates_cloud_resource: false,
        can_claim_provider_ready: false,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
      }
    : null;
  const selectedProviderStatus = externalSelected
    ? adapter?.adapter_status
    : fastLocalEnvSelected
      ? 'fast_local_env_selected'
      : localAgentSandboxSelected
        ? `${target.sandbox_provider}_preflight_required`
        : 'local_managed_root_selected';
  const providerRole = externalSelected
    ? 'agent_sandbox_execution_substrate'
    : fastLocalEnvSelected
      ? 'fast_local_env_default_current_path'
      : localAgentSandboxSelected
        ? 'local_agent_sandbox_execution_substrate'
        : 'local_materialized_runtime_root';
  return {
    surface_kind: 'opl_runtime_environment_sandbox_provider_plan' as const,
    status: selectedProviderStatus,
    selected_provider: target.sandbox_provider,
    provider_role: providerRole,
    provider_ref: `sandbox-provider:${target.sandbox_provider}:${targetRef(target)}`,
    later_sandbox_provider_kinds: ['local_docker', 'external_sandbox'],
    later_external_sandbox_substrates: ['e2b', 'daytona', 'modal'],
    supported_provider_kinds: policy.supported_provider_kinds,
    external_provider_examples: policy.external_provider_examples,
    provider_family_catalog: policy.provider_family_catalog,
    required_external_sandbox_refs: policy.required_external_sandbox_refs,
    modal_like_env_spec_catalog: policy.modal_like_env_spec_catalog,
    e2b_default_dependency: policy.e2b_default_dependency,
    e2b_package_dependency_class: policy.e2b_package_dependency_class,
    e2b_connect_configuration_assist_only: policy.e2b_connect_configuration_assist_only,
    default_provider_kind: policy.default_provider_kind,
    local_provider_examples: policy.local_provider_examples,
    adapter,
    local_sandbox_preflight: localSandboxPreflight,
    model_endpoint_provider_family: buildModelEndpointProviderReadback(modelEndpointPolicy),
    template_ref: externalSelected ? adapter?.template_ref : localTemplateRef,
    sandbox_binding_ref: externalSelected ? adapter?.sandbox_binding_ref : null,
    snapshot_ref: null,
    volume_ref: null,
    required_receipt_kind: externalSelected
      ? policy.required_receipt_kind
      : localAgentSandboxSelected
        ? 'sandbox_execution_receipt'
        : null,
    materialization_root_provider: fastLocalEnvSelected || localAgentSandboxSelected
      ? 'local_managed_root'
      : target.sandbox_provider,
    temporal_replacement: false,
    writes_runtime_root: false,
    writes_domain_repo: false,
    credential_material_read: false,
    external_api_called: false,
    provider_lifecycle_managed: false,
    creates_cloud_resource: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
    false_ready_guard: localAgentSandboxSelected ? 'local_sandbox_preflight_is_not_provider_ready' : null,
    local_template_exists_counts_as_provider_ready: false,
    local_sandbox_receipt_counts_as_domain_ready: false,
    local_sandbox_receipt_counts_as_app_release_ready: false,
    local_sandbox_receipt_counts_as_production_ready: false,
    live_provider_receipt_required: localAgentSandboxSelected || (externalSelected && adapter?.configured !== true),
  };
}
