import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  commandFailure,
  configuredPackageCarrierEnv,
  defaultRunner,
  ensureConfiguredCodexHomeForMutation,
  nativeArgs,
  parsePluginList,
  marketplaceName,
} from './configured-codex-plugin-carrier-native.ts';
import {
  missingRequiredSkills,
  readConfiguredLocalPluginEntry,
  setConfiguredPluginEnabled,
} from './configured-codex-plugin-carrier-local.ts';
import { installPayloadMarketplace } from './configured-codex-plugin-carrier-payload.ts';
import {
  ensureMarketplaceAvailable,
  removeUnusedMarketplaces,
} from './configured-codex-plugin-carrier-marketplace.ts';
import {
  configuredCarrierPrecedence,
  configuredPluginReadback,
  configuredPluginSelection,
  unavailableReadback,
} from './configured-codex-plugin-carrier-readback.ts';
import { sameMarketplaceSource } from './shared.ts';
import type { AgentPackageConfiguredCodexPluginCarrierDescriptor } from './types.ts';
import type {
  ConfiguredCodexPluginCarrierAction,
  ConfiguredCodexPluginCarrierReadback,
  CodexPluginCommandRunner,
  CodexPluginListEntry,
} from './configured-codex-plugin-carrier-types.ts';

export { githubMarketplaceSourceIdentity } from './shared.ts';
export {
  createMemoizedCodexPluginListRunner,
  isTransientConfiguredDownloadFailure,
  runConfiguredDownloadWithTransientRetry,
  sourceTreeSha256,
} from './configured-codex-plugin-carrier-native.ts';
export { githubArchiveFileSource } from './configured-codex-plugin-carrier-payload.ts';
export type {
  ConfiguredCodexPluginCarrierAction,
  ConfiguredCodexPluginCarrierObservedSource,
  ConfiguredCodexPluginCarrierReadback,
  CodexPluginCommandResult,
  CodexPluginCommandRunner,
} from './configured-codex-plugin-carrier-types.ts';

function assertDescriptor(descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor) {
  if (!descriptor.packageId.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/
      .test(descriptor.carrier.pluginId)
    || (descriptor.carrier.marketplaceSource !== null
      && (!descriptor.carrier.marketplaceSource.trim()
        || descriptor.carrier.marketplaceSource.startsWith('-')
        || descriptor.carrier.marketplaceSource.includes('\0')))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager descriptor has an invalid identity or plugin selector.',
      {
        package_id: descriptor.packageId,
        plugin_id: descriptor.carrier.pluginId,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
}

function dispatchConfiguredPluginAction(input: {
  dispatchAction: boolean;
  packageId: string;
  action: ConfiguredCodexPluginCarrierAction;
  actionArgs: string[];
  binary: string;
  env: NodeJS.ProcessEnv;
  runner: CodexPluginCommandRunner;
}) {
  if (!input.dispatchAction) return;
  const actionResult = input.runner({
    binary: input.binary,
    args: input.actionArgs,
    env: input.env,
  });
  if (actionResult.status !== 0 || actionResult.error) {
    commandFailure({
      packageId: input.packageId,
      action: input.action,
      args: input.actionArgs,
      result: actionResult,
    });
  }
}

function listUnavailableReadback(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  listArgs: string[];
  dispatchAction: boolean;
}): ConfiguredCodexPluginCarrierReadback {
  return unavailableReadback({
    descriptor: input.descriptor,
    action: input.action,
    nativeCommand: input.listArgs,
    nativeActionDispatched: input.action === 'list',
    reason: 'configured_native_carrier_unavailable',
  });
}

function invalidListReadback(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  listArgs: string[];
  error: unknown;
}): ConfiguredCodexPluginCarrierReadback {
  return unavailableReadback({
    descriptor: input.descriptor,
    action: input.action,
    nativeCommand: input.listArgs,
    nativeActionDispatched: input.action === 'list',
    reason: input.error instanceof FrameworkContractError
      ? String(input.error.details?.failure_code ?? 'configured_native_carrier_readback_invalid')
      : 'configured_native_carrier_readback_invalid',
  });
}

function readConfiguredPluginEntries(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  dispatchAction: boolean;
  binary: string;
  env: NodeJS.ProcessEnv;
  runner: CodexPluginCommandRunner;
}): CodexPluginListEntry[] | ConfiguredCodexPluginCarrierReadback {
  const listArgs = ['plugin', 'list', '--json'];
  const list = input.runner({ binary: input.binary, args: listArgs, env: input.env });
  if (list.status !== 0 || list.error) {
    if (input.action === 'list' && list.error) {
      try {
        return {
          ...configuredPluginReadback({
            descriptor: input.descriptor,
            action: input.action,
            dryRun: false,
            dispatchAction: false,
            actionArgs: listArgs,
            entries: [readConfiguredLocalPluginEntry({
              descriptor: input.descriptor,
              env: input.env,
            })],
          }),
          native_action_dispatched: false,
        };
      } catch (error) {
        return invalidListReadback({
          descriptor: input.descriptor,
          action: input.action,
          listArgs,
          error,
        });
      }
    }
    if (input.dispatchAction) {
      commandFailure({
        packageId: input.descriptor.packageId,
        action: input.action,
        args: listArgs,
        result: list,
      });
    }
    return listUnavailableReadback({
      descriptor: input.descriptor,
      action: input.action,
      listArgs,
      dispatchAction: input.dispatchAction,
    });
  }
  try {
    return parsePluginList(list.stdout, input.descriptor.packageId);
  } catch (error) {
    if (input.dispatchAction) throw error;
    return invalidListReadback({
      descriptor: input.descriptor,
      action: input.action,
      listArgs,
      error,
    });
  }
}

function isConfiguredCarrierReadback(
  value: CodexPluginListEntry[] | ConfiguredCodexPluginCarrierReadback,
): value is ConfiguredCodexPluginCarrierReadback {
  return !Array.isArray(value);
}

function configuredCarrierActionNeedsMarketplace(action: ConfiguredCodexPluginCarrierAction) {
  return action === 'install' || action === 'update' || action === 'repair';
}

export function runConfiguredCodexPluginCarrier(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  dryRun?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
  beforeConfigReplace?: () => void;
  packageDirectory?: string;
  installedPayloadCarrier?: boolean;
}): ConfiguredCodexPluginCarrierReadback {
  assertDescriptor(input.descriptor);
  if (input.action === 'enable' && input.descriptor.interactionMode === 'headless_internal') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Headless internal Package carriers cannot be enabled for ordinary Codex interaction.',
      {
        package_id: input.descriptor.packageId,
        plugin_id: input.descriptor.carrier.pluginId,
        failure_code: 'configured_codex_plugin_carrier_headless_enable_forbidden',
      },
    );
  }
  const binary = input.binary?.trim()
    || process.env.OPL_CODEX_PLUGIN_BIN?.trim()
    || 'codex';
  const runner = input.runner ?? defaultRunner;
  const env = configuredPackageCarrierEnv(
    input.descriptor.interactionMode,
    { ...process.env, ...input.env },
  );
  const actionArgs = nativeArgs(input.action, input.descriptor.carrier.pluginId);
  const isConfigToggle = input.action === 'enable' || input.action === 'disable';
  const dispatchAction = !isConfigToggle && input.action !== 'list' && input.dryRun !== true;
  if (dispatchAction) ensureConfiguredCodexHomeForMutation(env);
  const declaredMarketplaceSource = input.descriptor.carrier.marketplaceSource;
  // Payload-backed Packages must use the same owner-verified carrier for
  // install, update and repair. Falling back to the declared Git repository
  // on update re-adds a different marketplace instead of refreshing the
  // already installed local payload.
  const marketplaceSource = dispatchAction && (input.action === 'install'
    || (input.installedPayloadCarrier === true && configuredCarrierActionNeedsMarketplace(input.action)))
    ? installPayloadMarketplace({
        packageId: input.descriptor.packageId,
        pluginId: input.descriptor.carrier.pluginId,
        env,
        packageDirectory: input.packageDirectory,
      }) ?? declaredMarketplaceSource
    : declaredMarketplaceSource;
  if (dispatchAction && configuredCarrierActionNeedsMarketplace(input.action) && marketplaceSource) {
    ensureMarketplaceAvailable({
      packageId: input.descriptor.packageId,
      action: input.action,
      pluginId: input.descriptor.carrier.pluginId,
      marketplaceSource,
      binary,
      env,
      runner,
    });
  }
  dispatchConfiguredPluginAction({
    dispatchAction,
    packageId: input.descriptor.packageId,
    action: input.action,
    actionArgs,
    binary,
    env,
    runner,
  });
  let entries = readConfiguredPluginEntries({
    descriptor: input.descriptor,
    action: input.action,
    dispatchAction,
    binary,
    env,
    runner,
  });
  if (isConfiguredCarrierReadback(entries)) return entries;
  if ((input.action === 'update' || input.action === 'repair') && marketplaceSource) {
    const selection = configuredPluginSelection({ entries, descriptor: input.descriptor });
      const targetEntry = selection.installedSameName.find((entry) => (
        entry.pluginId === input.descriptor.carrier.pluginId
        && (input.descriptor.interactionMode === 'headless_internal' || entry.enabled)
        && sameMarketplaceSource(entry.marketplaceSource, marketplaceSource)
      && missingRequiredSkills(
        entry.sourcePath,
        input.descriptor.executor.requiredSkillIds,
      ).length === 0
    )) ?? null;
    const staleSameNameSources = targetEntry
      ? selection.installedSameName.filter(
        (entry) => (
          entry.pluginId !== targetEntry.pluginId
          || !sameMarketplaceSource(entry.marketplaceSource, marketplaceSource)
        ),
      )
      : [];
    if (targetEntry && staleSameNameSources.length > 0) {
      for (const pluginId of new Set(staleSameNameSources.map((entry) => entry.pluginId))) {
        const removeArgs = nativeArgs('remove', pluginId);
        dispatchConfiguredPluginAction({
          dispatchAction: true,
          packageId: input.descriptor.packageId,
          action: input.action,
          actionArgs: removeArgs,
          binary,
          env,
          runner,
        });
      }
      entries = readConfiguredPluginEntries({
        descriptor: input.descriptor,
        action: input.action,
        dispatchAction: true,
        binary,
        env,
        runner,
      });
      if (isConfiguredCarrierReadback(entries)) return entries;
      removeUnusedMarketplaces({
        packageId: input.descriptor.packageId,
        action: input.action,
        marketplaceNames: staleSameNameSources
          .filter((entry) => sameMarketplaceSource(entry.marketplaceSource, marketplaceSource))
          .map((entry) => marketplaceName(entry.pluginId)),
        installedEntries: entries,
        binary,
        env,
        runner,
      });
    }
  }
  const enforceHeadlessInternal = input.descriptor.interactionMode === 'headless_internal'
    && input.action !== 'list'
    && input.action !== 'remove'
    && input.dryRun !== true;
  if ((isConfigToggle || enforceHeadlessInternal) && input.dryRun !== true) {
    setConfiguredPluginEnabled({
      descriptor: input.descriptor,
      entries,
      enabled: enforceHeadlessInternal ? false : input.action === 'enable',
      env,
      beforeConfigReplace: input.beforeConfigReplace,
      selection: configuredPluginSelection,
      precedence: configuredCarrierPrecedence,
    });
    entries = readConfiguredPluginEntries({
      descriptor: input.descriptor,
      action: input.action,
      dispatchAction: true,
      binary,
      env,
      runner,
    });
    if (isConfiguredCarrierReadback(entries)) return entries;
  }
  return configuredPluginReadback({
    descriptor: input.descriptor,
    action: input.action,
    dryRun: input.dryRun,
    dispatchAction,
    actionArgs,
    entries,
  });
}
