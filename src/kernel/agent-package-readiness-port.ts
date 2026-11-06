import { FrameworkContractError } from './contract-validation.ts';
import type { StandardAgentDescriptorInterface } from './standard-agent-interface.ts';
import type { StandardAgentRegistryEntry } from './standard-agent-registry.ts';

export type StandardAgentContractCheckout = {
  agent_id: string;
  domain_id: string;
  target_domain_id: string;
  package_id: string;
  checkout_path: string;
  install_origin:
    | 'managed_root'
    | 'sibling_workspace'
    | 'env_override'
    | 'missing'
    | 'invalid_checkout'
    | 'package_status';
  source_kind: 'opl_selected_developer_checkout' | 'opl_installed_native_carrier';
};

export type StandardAgentContractCheckoutResolution = {
  surface_kind: 'opl_standard_agent_contract_checkout_resolution';
  status: 'resolved' | 'blocked' | 'not_applicable';
  launch_allowed: boolean;
  reason: string | null;
  source_status: string | null;
  checkout: StandardAgentContractCheckout | null;
};

export type StandardAgentProgressDeltaKeySet = {
  deliverable: string[];
  platform: string[];
};

export type AgentPackageReadinessPort = {
  readStatus: (input: any) => any;
  listInstalledStandardAgentEntries?: () => StandardAgentRegistryEntry[];
  readSourcePolicy?: (packageId: string) => any;
  refreshWorkspaceSkills?: (input: {
    packageId: string;
    packageStatus?: any;
    targetWorkspace?: string | null;
    dryRun?: boolean;
  }) => any;
  readInstalledStandardAgentDescriptorForPackage?: (
    packageId: string,
  ) => StandardAgentDescriptorInterface | null;
  readPackageManagedStandardAgentDescriptor?: (
    packageIds: readonly string[],
  ) => StandardAgentDescriptorInterface | null;
  readStandardAgentDescriptorForDomain?: (
    domainId: string,
  ) => StandardAgentDescriptorInterface | null;
  resolveStandardAgentContractCheckout?: (
    domainId: string,
  ) => StandardAgentContractCheckoutResolution;
  standardAgentProgressDeltaKeySet?: (
    domainId: string,
  ) => StandardAgentProgressDeltaKeySet;
};

let registeredPort: AgentPackageReadinessPort | null = null;

export function registerAgentPackageReadinessPort(port: AgentPackageReadinessPort) {
  registeredPort = port;
}

export function readAgentPackageReadinessPort() {
  return registeredPort;
}

export function readInstalledStandardAgentDescriptorFromPackagePort(packageId: string) {
  return registeredPort?.readInstalledStandardAgentDescriptorForPackage?.(packageId) ?? null;
}

export function readPackageManagedStandardAgentDescriptorFromPackagePort(
  packageIds: readonly string[],
) {
  return registeredPort?.readPackageManagedStandardAgentDescriptor?.(packageIds) ?? null;
}

export function readStandardAgentDescriptorForDomainFromPackagePort(domainId: string) {
  return registeredPort?.readStandardAgentDescriptorForDomain?.(domainId) ?? null;
}

export function resolveStandardAgentContractCheckoutFromPackagePort(
  domainId: string,
): StandardAgentContractCheckoutResolution {
  return registeredPort?.resolveStandardAgentContractCheckout?.(domainId) ?? {
    surface_kind: 'opl_standard_agent_contract_checkout_resolution',
    status: 'not_applicable',
    launch_allowed: false,
    reason: 'agent_package_readiness_port_not_registered',
    source_status: null,
    checkout: null,
  };
}

export function standardAgentProgressDeltaKeySetFromPackagePort(
  domainId: string,
): StandardAgentProgressDeltaKeySet {
  return registeredPort?.standardAgentProgressDeltaKeySet?.(domainId) ?? {
    deliverable: ['deliverable_progress_delta'],
    platform: ['platform_repair_delta'],
  };
}

export function requireAgentPackageReadinessPort() {
  if (!registeredPort) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL agent package readiness port is not registered.',
      { failure_code: 'agent_package_readiness_port_not_registered' },
    );
  }
  return registeredPort;
}
