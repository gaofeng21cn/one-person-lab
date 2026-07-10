export const EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES = ['e2b'] as const;
export const EXTERNAL_SANDBOX_REQUIRED_REFS = [
  'OPL_EXTERNAL_SANDBOX_ENDPOINT',
  'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
  'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
] as const;

export type ExternalSandboxImplementedSubstrate = typeof EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES[number];

export type ExternalSandboxProviderAdapterConfig = {
  endpoint: string | null;
  credentialRef: string | null;
  providerReceiptRef: string | null;
  substrate: ExternalSandboxImplementedSubstrate | 'generic_external_sandbox';
  missingRequiredEnv: string[];
  configured: boolean;
};

type JsonRecord = Record<string, unknown>;

export function inspectExternalSandboxProviderAdapterEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExternalSandboxProviderAdapterConfig {
  const endpoint = env.OPL_EXTERNAL_SANDBOX_ENDPOINT?.trim() || null;
  const credentialRef = env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF?.trim() || null;
  const providerReceiptRef = env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF?.trim() || null;
  const rawSubstrate = env.OPL_EXTERNAL_SANDBOX_SUBSTRATE?.trim().toLowerCase();
  const substrate = EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES.includes(rawSubstrate as ExternalSandboxImplementedSubstrate)
    ? rawSubstrate as ExternalSandboxImplementedSubstrate
    : 'generic_external_sandbox';
  const missingRequiredEnv = [
    ...(endpoint ? [] : [EXTERNAL_SANDBOX_REQUIRED_REFS[0]]),
    ...(credentialRef ? [] : [EXTERNAL_SANDBOX_REQUIRED_REFS[1]]),
    ...(providerReceiptRef ? [] : [EXTERNAL_SANDBOX_REQUIRED_REFS[2]]),
  ];
  return {
    endpoint,
    credentialRef,
    providerReceiptRef,
    substrate,
    missingRequiredEnv,
    configured: missingRequiredEnv.length === 0,
  };
}

export function buildExternalSandboxProviderAdapterPlan(targetRef: string) {
  const config = inspectExternalSandboxProviderAdapterEnv();
  const status = config.configured
    ? 'external_sandbox_provider_adapter_configured'
    : 'external_sandbox_provider_adapter_unconfigured';
  return {
    adapter_id: 'opl.external_sandbox_provider_adapter.v1',
    adapter_status: status,
    status,
    provider_role: 'agent_sandbox_execution_substrate',
    substrate_boundary: 'external_agent_sandbox_not_temporal_durable_workflow_substrate',
    implemented_external_substrates: [...EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES],
    required_external_sandbox_refs: [...EXTERNAL_SANDBOX_REQUIRED_REFS],
    selected_external_substrate: config.substrate,
    endpoint: config.endpoint,
    credential_ref: config.credentialRef,
    provider_receipt_ref: config.providerReceiptRef,
    missing_required_env: config.missingRequiredEnv,
    configured: config.configured,
    target_ref: targetRef,
    template_ref: `sandbox-template:${targetRef}`,
    sandbox_binding_ref: config.configured
      ? `external-sandbox-binding:${config.substrate}:${targetRef}`
      : null,
    can_bind_provider_receipt: config.configured,
    credential_material_read: false,
    external_api_called: false,
    provider_lifecycle_managed: false,
    creates_cloud_resource: false,
    temporal_durable_workflow_substrate_replacement: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
  };
}

export function buildModelEndpointProviderReadback(policy: JsonRecord) {
  return {
    surface_kind: 'opl_model_endpoint_provider_readback',
    status: policy.status,
    source_ref: policy.source_ref,
    provider_role: policy.provider_role,
    required_endpoint_refs: policy.required_endpoint_refs,
    invoke_contract: policy.invoke_contract,
    readback_contract: policy.readback_contract,
    endpoint_url_ref: null,
    credential_ref: null,
    provider_receipt_ref: null,
    credential_material_read: false,
    endpoint_api_called_by_readback: false,
    endpoint_lifecycle_managed: false,
    creates_endpoint: false,
    updates_endpoint: false,
    deletes_endpoint: false,
    submit_job_supported: false,
    harvest_job_supported: false,
    can_claim_endpoint_ready: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  };
}
