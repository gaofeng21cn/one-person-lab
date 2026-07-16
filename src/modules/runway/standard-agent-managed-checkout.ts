import fs from 'node:fs';
import path from 'node:path';

import { requireAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';

type AgentPackageReadinessPort = ReturnType<typeof requireAgentPackageReadinessPort>;

function blocked(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'standard_agent_managed_checkout_not_launchable',
  });
}

function managedCheckoutFromStatus(packageStatus: any, packageId: string) {
  if (packageStatus?.launch_allowed !== true) {
    blocked('Standard Agent action launch requires canonical package launch_allowed=true.', {
      package_id: packageId,
      launch_allowed: packageStatus?.launch_allowed ?? false,
      launch_blocked_reason: packageStatus?.launch_blocked_reason ?? 'package_status_unavailable',
      package_dependency_readiness: packageStatus?.package_dependency_readiness ?? null,
      materialization_readiness: packageStatus?.materialization_readiness ?? null,
      runtime_source_readiness: packageStatus?.runtime_source_readiness ?? null,
      repair_action: packageStatus?.repair_action ?? null,
    });
  }
  const source = packageStatus.runtime_source_readiness;
  if (
    source?.status !== 'current'
    || source.operational_ready !== true
    || typeof source.checkout_path !== 'string'
    || !path.isAbsolute(source.checkout_path)
  ) {
    blocked('Standard Agent action launch requires an operationally ready managed runtime source.', {
      package_id: packageId,
      runtime_source_readiness: source ?? null,
    });
  }
  let checkoutRoot: string;
  try {
    checkoutRoot = fs.realpathSync.native(source.checkout_path);
  } catch (error) {
    blocked('Standard Agent managed runtime checkout cannot be resolved.', {
      package_id: packageId,
      checkout_path: source.checkout_path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(checkoutRoot!).isDirectory()) {
    blocked('Standard Agent managed runtime checkout is not a directory.', {
      package_id: packageId,
      checkout_path: checkoutRoot!,
    });
  }
  return checkoutRoot!;
}

export async function resolveStandardAgentManagedCheckout(input: {
  domainId: string;
  workspaceRoot: string;
  useBoundaryId?: string;
  packageReadiness?: AgentPackageReadinessPort;
}) {
  const agent = resolveStandardAgent(input.domainId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    throw new FrameworkContractError('domain_not_found', 'agents run requires one registered Standard OPL Agent.', {
      domain_id: input.domainId,
    });
  }
  const workspaceRoot = path.resolve(input.workspaceRoot);
  if (!path.isAbsolute(input.workspaceRoot) || !fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    throw new FrameworkContractError('cli_usage_error', 'agents run requires an existing absolute workspace root.', {
      workspace_root: input.workspaceRoot,
    });
  }

  const packageReadiness = input.packageReadiness ?? requireAgentPackageReadinessPort();
  const packageId = agent.agent_id;
  const scope = { scope: 'workspace' as const, targetWorkspace: workspaceRoot };
  const initialStatus = packageReadiness.readStatus({ packageId, ...scope }).opl_agent_package_status;
  const useBoundaryId = input.useBoundaryId ?? stableId('package-use', [
    packageId,
    workspaceRoot,
    'standard-agent-action-runtime-v2',
  ]);
  const activation = initialStatus?.installed_package_count > 0
    ? await packageReadiness.ensureScopeActivation({
        packageId,
        ...scope,
        useBoundaryId,
      })
    : null;
  const packageStatus = packageReadiness.readStatus({ packageId, ...scope }).opl_agent_package_status;
  const checkoutRoot = managedCheckoutFromStatus(packageStatus, packageId);

  return {
    agent,
    package_id: packageId,
    workspace_root: workspaceRoot,
    checkout_root: checkoutRoot,
    package_status: packageStatus,
    package_use_binding: activation?.package_use_binding ?? null,
    use_boundary_id: useBoundaryId,
  };
}
