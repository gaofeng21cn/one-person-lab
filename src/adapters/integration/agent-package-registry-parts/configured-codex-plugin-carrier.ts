import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { resolveCanonicalOplFamilyMarketplaceId } from '../system-installation/codex-plugin-registry.ts';
import {
  commandFailure,
  defaultRunner,
  ensureConfiguredCodexHomeForMutation,
  nativeArgs,
  observedSource,
  parsePluginList,
  pluginBareName,
} from './configured-codex-plugin-carrier-native.ts';
import {
  missingRequiredSkills,
  readConfiguredLocalPluginEntry,
  setConfiguredPluginEnabled,
} from './configured-codex-plugin-carrier-local.ts';
import { installPayloadMarketplace } from './configured-codex-plugin-carrier-payload.ts';
import { ensureMarketplaceAvailable } from './configured-codex-plugin-carrier-marketplace.ts';
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

function unavailableReadback(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  nativeCommand: string[];
  nativeActionDispatched: boolean;
  reason: string;
}): ConfiguredCodexPluginCarrierReadback {
  return {
    surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
    package_id: input.descriptor.packageId,
    carrier: {
      kind: 'codex_plugin_manager',
      plugin_id: input.descriptor.carrier.pluginId,
      marketplace_source: null,
      observed_sources: [],
      precedence: 'unavailable',
    },
    executor: {
      route: input.descriptor.executor.route,
      required_skill_ids: [...input.descriptor.executor.requiredSkillIds],
      status: 'attention_needed',
    },
    publication_ref: input.descriptor.publicationRef,
    status: 'physical_unavailable',
    installed_version: null,
    enabled: null,
    plugin_source_path: null,
    operation: input.action,
    native_command: input.nativeCommand,
    native_action_dispatched: input.nativeActionDispatched,
    reason: input.reason,
  };
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

function configuredPluginSelection(input: {
  entries: CodexPluginListEntry[];
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
}) {
  const pluginId = input.descriptor.carrier.pluginId;
  const pluginName = pluginBareName(pluginId);
  const canonicalMarketplaceId = resolveCanonicalOplFamilyMarketplaceId(
    input.descriptor.packageId,
    pluginName,
  );
  const acceptedPluginIds = new Set([
    pluginId,
    ...(canonicalMarketplaceId ? [`${pluginName}@${canonicalMarketplaceId}`] : []),
  ]);
  const installedSameName = input.entries.filter(
    (candidate) => candidate.installed && pluginBareName(candidate.pluginId) === pluginName,
  );
  const acceptedEntries = installedSameName.filter((candidate) => acceptedPluginIds.has(candidate.pluginId));
  const entry = acceptedEntries.find((candidate) => candidate.enabled)
    ?? acceptedEntries.find((candidate) => candidate.pluginId === pluginId)
    ?? acceptedEntries[0]
    ?? null;
  const unexpectedSameName = installedSameName.filter(
    (candidate) => !acceptedPluginIds.has(candidate.pluginId),
  );
  const enabledSameName = installedSameName.filter((candidate) => candidate.enabled);
  const ambiguous = Boolean(entry?.installed) && (
    enabledSameName.length > 1
    || (
      input.descriptor.interactionMode === 'headless_internal'
      && unexpectedSameName.some((candidate) => candidate.enabled)
    )
  );
  const unexpectedOnly = !entry?.installed && unexpectedSameName.length > 0;
  const missingSkills = entry
    ? missingRequiredSkills(entry.sourcePath, input.descriptor.executor.requiredSkillIds)
    : input.descriptor.executor.requiredSkillIds;
  const expectedEnabled = input.descriptor.interactionMode !== 'headless_internal';
  const callable = Boolean(
    entry?.installed
    && entry.enabled === expectedEnabled
    && missingSkills.length === 0
    && !ambiguous
    && !unexpectedOnly,
  );
  return { installedSameName, entry, unexpectedSameName, ambiguous, unexpectedOnly, missingSkills, callable };
}

function configuredCarrierPrecedence(input: { ambiguous: boolean; unexpectedOnly: boolean; installed: boolean }) {
  if (input.ambiguous) return 'ambiguous_same_plugin_name' as const;
  if (input.unexpectedOnly) return 'unexpected_same_plugin_name' as const;
  return input.installed ? 'exact_single_source' as const : 'not_present' as const;
}

function configuredCarrierReason(input: {
  installed: boolean;
  interactionMode: 'interactive' | 'headless_internal';
  ambiguous: boolean;
  unexpectedOnly: boolean;
  callable: boolean;
  enabled: boolean;
  missingSkills: string[];
}) {
  if (input.installed) {
    if (input.ambiguous) return 'configured_native_carrier_source_ambiguous';
    if (!input.enabled && input.interactionMode !== 'headless_internal') return 'configured_native_carrier_disabled';
    if (input.enabled && input.interactionMode === 'headless_internal') return 'configured_native_carrier_headless_exposure_enabled';
    return input.callable ? null : `required_skill_unavailable:${input.missingSkills.join(',')}`;
  }
  return input.unexpectedOnly
    ? 'configured_native_carrier_unexpected_source_present'
    : 'native_carrier_reports_not_installed';
}

function configuredPluginReadback(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  action: ConfiguredCodexPluginCarrierAction;
  dryRun: boolean | undefined;
  dispatchAction: boolean;
  actionArgs: string[];
  entries: CodexPluginListEntry[];
}): ConfiguredCodexPluginCarrierReadback {
  const selection = configuredPluginSelection({ entries: input.entries, descriptor: input.descriptor });
  const installed = Boolean(selection.entry?.installed);
  return {
    surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
    package_id: input.descriptor.packageId,
    carrier: {
      kind: 'codex_plugin_manager',
      plugin_id: input.descriptor.carrier.pluginId,
      marketplace_source: selection.ambiguous ? null : selection.entry?.marketplaceSource ?? null,
      observed_sources: selection.installedSameName.map(observedSource),
      precedence: configuredCarrierPrecedence({
        ambiguous: selection.ambiguous,
        unexpectedOnly: selection.unexpectedOnly,
        installed,
      }),
    },
    executor: {
      route: input.descriptor.executor.route,
      required_skill_ids: [...input.descriptor.executor.requiredSkillIds],
      status: selection.callable ? 'callable' : 'attention_needed',
    },
    publication_ref: input.descriptor.publicationRef,
    status: installed ? 'installed' : selection.unexpectedOnly ? 'not_installed' : 'physical_unavailable',
    installed_version: selection.ambiguous ? null : selection.entry?.version ?? null,
    enabled: installed ? selection.entry?.enabled ?? false : null,
    plugin_source_path: selection.ambiguous ? null : selection.entry?.sourcePath ?? null,
    operation: input.action,
    native_command: input.action === 'list' || input.dryRun === true
      ? ['plugin', 'list', '--json']
      : input.actionArgs,
    native_action_dispatched: input.action === 'list' || input.dispatchAction,
    reason: configuredCarrierReason({
      installed,
      interactionMode: input.descriptor.interactionMode ?? 'interactive',
      ambiguous: selection.ambiguous,
      unexpectedOnly: selection.unexpectedOnly,
      callable: selection.callable,
      enabled: selection.entry?.enabled === true,
      missingSkills: selection.missingSkills,
    }),
  };
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
  const env = { ...process.env, ...input.env };
  const actionArgs = nativeArgs(input.action, input.descriptor.carrier.pluginId);
  const isConfigToggle = input.action === 'enable' || input.action === 'disable';
  const dispatchAction = !isConfigToggle && input.action !== 'list' && input.dryRun !== true;
  if (dispatchAction) ensureConfiguredCodexHomeForMutation(env);
  const declaredMarketplaceSource = input.descriptor.carrier.marketplaceSource;
  const marketplaceSource = dispatchAction && input.action === 'install'
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
      entry.enabled
      && sameMarketplaceSource(entry.marketplaceSource, marketplaceSource)
      && missingRequiredSkills(
        entry.sourcePath,
        input.descriptor.executor.requiredSkillIds,
      ).length === 0
    )) ?? null;
    const staleSameNameSources = targetEntry
      ? selection.installedSameName.filter(
        (entry) => !sameMarketplaceSource(entry.marketplaceSource, marketplaceSource),
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
