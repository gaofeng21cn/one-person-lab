import { acceptedConfiguredCodexPluginIds } from '../system-installation/codex-plugin-registry.ts';
import { observedSource, pluginBareName } from './configured-codex-plugin-carrier-native.ts';
import { missingRequiredSkills } from './configured-codex-plugin-carrier-local.ts';
import type { AgentPackageConfiguredCodexPluginCarrierDescriptor } from './types.ts';
import type {
  ConfiguredCodexPluginCarrierAction,
  ConfiguredCodexPluginCarrierReadback,
  CodexPluginListEntry,
} from './configured-codex-plugin-carrier-types.ts';

export function unavailableReadback(input: {
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

export function configuredPluginSelection(input: {
  entries: CodexPluginListEntry[];
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
}) {
  const pluginId = input.descriptor.carrier.pluginId;
  const pluginName = pluginBareName(pluginId);
  const acceptedPluginIds = acceptedConfiguredCodexPluginIds(
    input.descriptor.packageId,
    pluginId,
  );
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

export function configuredCarrierPrecedence(input: { ambiguous: boolean; unexpectedOnly: boolean; installed: boolean }) {
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

export function configuredPluginReadback(input: {
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
