export const EXTERNAL_SANDBOX_SUPPORTED_SUBSTRATES = ['e2b', 'daytona', 'modal'] as const;

export type ExternalSandboxSupportedSubstrate = typeof EXTERNAL_SANDBOX_SUPPORTED_SUBSTRATES[number];

export type ExternalSandboxProviderAdapterConfig = {
  endpoint: string | null;
  credentialRef: string | null;
  providerReceiptRef: string | null;
  substrate: ExternalSandboxSupportedSubstrate | 'generic_external_sandbox';
  missingRequiredEnv: string[];
  configured: boolean;
};

export function inspectExternalSandboxProviderAdapterEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExternalSandboxProviderAdapterConfig {
  const endpoint = env.OPL_EXTERNAL_SANDBOX_ENDPOINT?.trim() || null;
  const credentialRef = env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF?.trim() || null;
  const providerReceiptRef = env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF?.trim() || null;
  const rawSubstrate = env.OPL_EXTERNAL_SANDBOX_SUBSTRATE?.trim().toLowerCase();
  const substrate = EXTERNAL_SANDBOX_SUPPORTED_SUBSTRATES.includes(rawSubstrate as ExternalSandboxSupportedSubstrate)
    ? rawSubstrate as ExternalSandboxSupportedSubstrate
    : 'generic_external_sandbox';
  const missingRequiredEnv = [
    ...(endpoint ? [] : ['OPL_EXTERNAL_SANDBOX_ENDPOINT']),
    ...(credentialRef ? [] : ['OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF']),
    ...(providerReceiptRef ? [] : ['OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF']),
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
    supported_external_substrates: [...EXTERNAL_SANDBOX_SUPPORTED_SUBSTRATES],
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
    temporal_durable_workflow_substrate_replacement: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
  };
}
