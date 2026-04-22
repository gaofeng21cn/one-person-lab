import { spawn, spawnSync } from 'node:child_process';

import { findDomainOrThrow, GatewayContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest.ts';
import { resolveWorkspaceLocator } from './workspace-registry.ts';
import type { GatewayContracts } from './types.ts';

export type DomainLaunchStrategy = 'auto' | 'open_url' | 'spawn_command';

export type LaunchDomainEntryOptions = {
  projectId: string;
  workspacePath?: string;
  strategy?: DomainLaunchStrategy;
  dryRun?: boolean;
};

function getOpenBinary() {
  return process.env.OPL_OPEN_BIN?.trim() || 'open';
}

function getDomainEntryShell() {
  return process.env.OPL_DOMAIN_ENTRY_SHELL?.trim() || '/bin/zsh';
}

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function availableStrategies(locator: { command: string | null; url: string | null }) {
  return [
    ...(locator.url ? ['open_url' as const] : []),
    ...(locator.command ? ['spawn_command' as const] : []),
  ];
}

function selectStrategy(
  locator: { command: string | null; url: string | null },
  requested: DomainLaunchStrategy,
) {
  const available = availableStrategies(locator);

  if (available.length === 0) {
    throw new GatewayContractError(
      'surface_not_found',
      'The requested project does not currently expose any launchable direct-entry locator.',
      {
        direct_entry_locator: locator,
      },
    );
  }

  if (requested === 'auto') {
    return available[0];
  }

  if (!available.includes(requested)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested launch strategy is not available for the current direct-entry locator.',
      {
        requested_strategy: requested,
        available_strategies: available,
      },
    );
  }

  return requested;
}

function runOpenUrl(url: string) {
  const openBinary = getOpenBinary();
  const result = spawnSync(openBinary, [url], {
    encoding: 'utf8',
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    throw new GatewayContractError(
      'launcher_failed',
      'Failed to open the bound domain direct-entry URL.',
      {
        command: [openBinary, url],
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      },
    );
  }

  return {
    kind: 'open_url' as const,
    opener_bin: openBinary,
    command_preview: [openBinary, url],
    target_url: url,
  };
}

function spawnShellCommand(command: string) {
  const shell = getDomainEntryShell();
  const child = spawn(shell, ['-lc', command], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  return {
    kind: 'spawn_command' as const,
    shell,
    command_preview: [shell, '-lc', command],
    command,
    pid: child.pid ?? null,
  };
}

export async function launchDomainEntry(
  contracts: GatewayContracts,
  options: LaunchDomainEntryOptions,
) {
  if (!options.projectId.trim()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'domain launch requires a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  const domain = findDomainOrThrow(contracts, options.projectId);
  const workspaceLocator = resolveWorkspaceLocator(options.projectId, options.workspacePath);
  const binding = workspaceLocator.binding;

  if (!binding) {
    throw new GatewayContractError(
      'surface_not_found',
      'No active or matching workspace binding exists for the requested project.',
      {
        project_id: options.projectId,
        workspace_path: options.workspacePath ?? null,
      },
    );
  }

  const locator = {
    command: binding.direct_entry.command,
    manifest_command: binding.direct_entry.manifest_command,
    url: binding.direct_entry.url,
    workspace_locator: binding.direct_entry.workspace_locator,
  };
  const requestedStrategy = options.strategy ?? 'auto';
  const selectedStrategy = selectStrategy(locator, requestedStrategy);
  const manifestEntry =
    buildDomainManifestCatalog(contracts).domain_manifests.projects.find(
      (entry) => entry.project_id === options.projectId,
    ) ?? null;

  const action =
    selectedStrategy === 'open_url'
      ? {
          kind: 'open_url' as const,
          opener_bin: getOpenBinary(),
          command_preview: [getOpenBinary(), locator.url!],
          target_url: locator.url!,
        }
      : {
          kind: 'spawn_command' as const,
          shell: getDomainEntryShell(),
          command_preview: [getDomainEntryShell(), '-lc', locator.command!],
          command: locator.command!,
          pid: null,
        };

  if (options.dryRun) {
    return {
      version: 'g2',
      contracts_context: buildContractsContext(contracts),
      domain_entry_launch: {
        surface_id: 'opl_domain_direct_entry_launch',
        project_id: options.projectId,
        project: domain.project,
        target_domain_id: manifestEntry?.manifest?.target_domain_id ?? domain.domain_id,
        dry_run: true,
        requested_strategy: requestedStrategy,
        selected_strategy: selectedStrategy,
        available_strategies: availableStrategies(locator),
        launch_status: 'preview_only',
        domain_agent_entry_spec:
          manifestEntry?.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
        workspace_locator: {
          project_id: workspaceLocator.project_id,
          absolute_path: workspaceLocator.absolute_path,
          source: workspaceLocator.source,
          binding_id: binding.binding_id,
        },
        direct_entry_locator: locator,
        manifest_status: manifestEntry?.status ?? 'not_bound',
        domain_manifest_recommendation: manifestEntry
          ? {
              status: manifestEntry.status,
              domain_agent_entry_spec:
                manifestEntry.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
              frontdesk_surface: manifestEntry.manifest?.frontdesk_surface ?? null,
              recommended_command: manifestEntry.manifest?.recommended_command ?? null,
              product_entry_readiness: manifestEntry.manifest?.product_entry_readiness ?? null,
            }
          : null,
        action,
        notes: [
          'This launcher only consumes an already-configured direct-entry locator from the workspace registry.',
          'It does not upgrade OPL into a domain runtime owner or fabricate domain readiness.',
        ],
      },
    };
  }

  const executedAction =
    selectedStrategy === 'open_url'
      ? runOpenUrl(locator.url!)
      : spawnShellCommand(locator.command!);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    domain_entry_launch: {
      surface_id: 'opl_domain_direct_entry_launch',
      project_id: options.projectId,
      project: domain.project,
      target_domain_id: manifestEntry?.manifest?.target_domain_id ?? domain.domain_id,
      dry_run: false,
      requested_strategy: requestedStrategy,
      selected_strategy: selectedStrategy,
      available_strategies: availableStrategies(locator),
      launch_status: 'launched',
      domain_agent_entry_spec:
        manifestEntry?.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
      workspace_locator: {
        project_id: workspaceLocator.project_id,
        absolute_path: workspaceLocator.absolute_path,
        source: workspaceLocator.source,
        binding_id: binding.binding_id,
      },
      direct_entry_locator: locator,
      manifest_status: manifestEntry?.status ?? 'not_bound',
      domain_manifest_recommendation: manifestEntry
        ? {
            status: manifestEntry.status,
            domain_agent_entry_spec:
              manifestEntry.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
            frontdesk_surface: manifestEntry.manifest?.frontdesk_surface ?? null,
            recommended_command: manifestEntry.manifest?.recommended_command ?? null,
            product_entry_readiness: manifestEntry.manifest?.product_entry_readiness ?? null,
          }
        : null,
      action: executedAction,
      notes: [
        'This launcher stays at the product-entry locator layer and does not claim domain runtime authority.',
        'A successful launch only means the configured direct-entry locator was invoked successfully.',
      ],
    },
  };
}
