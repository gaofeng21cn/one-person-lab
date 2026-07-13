type AgentPackageReadinessPort = {
  readStatus: (input: any) => any;
  ensureScopeActivation: (input: any) => Promise<any>;
};

let registeredPort: AgentPackageReadinessPort | null = null;

export function registerAgentPackageReadinessPort(port: AgentPackageReadinessPort) {
  registeredPort = port;
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
import { FrameworkContractError } from './contract-validation.ts';
