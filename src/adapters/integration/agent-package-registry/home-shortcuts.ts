import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { withRuntimeStateMutex } from '../../../kernel/runtime-state-mutex.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { nowIso } from './shared.ts';
import type {
  AgentPackageHomeShortcutPreference,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageStoredHomeShortcutPreference,
} from './types.ts';

const HOME_SHORTCUT_PREFERENCE_LOCK_TIMEOUT_MS = 5_000;

export function emptyHomeShortcutPreferenceFile(): AgentPackageHomeShortcutPreferenceFile {
  return {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: nowIso(),
    preferences: [],
  };
}

export function readHomeShortcutPreferenceFile(): AgentPackageHomeShortcutPreferenceFile {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_home_shortcut_preferences_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.preferences)) return emptyHomeShortcutPreferenceFile();
  return {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: stringValue(parsed.updated_at) ?? nowIso(),
    preferences: recordList(parsed.preferences).flatMap((entry) => {
      const shortcutId = stringValue(entry.shortcut_id);
      const declaredPackageId = stringValue(entry.package_id)?.toLowerCase() ?? null;
      const packageId = canonicalAgentPackageId(declaredPackageId);
      if (!shortcutId || !packageId || packageId !== declaredPackageId) return [];
      const sortOrder = typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order)
        ? entry.sort_order
        : null;
      return [{
        shortcut_id: shortcutId,
        package_id: packageId,
        visible: entry.visible !== false,
        sort_order: sortOrder,
        source: 'user_preference' as const,
        updated_at: stringValue(entry.updated_at) ?? nowIso(),
      }];
    }),
  };
}

export function writeHomeShortcutPreferenceFile(file: AgentPackageHomeShortcutPreferenceFile) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_home_shortcut_preferences_file, file);
}

export function withHomeShortcutPreferenceTransaction<T>(
  dryRun: boolean,
  operation: () => T,
) {
  if (dryRun) return operation();
  const lockFile = path.join(
    ensureOplStateDir().state_dir,
    'agent-package-home-shortcut-preferences.sqlite',
  );
  return withRuntimeStateMutex({
    lockFile,
    timeoutMs: HOME_SHORTCUT_PREFERENCE_LOCK_TIMEOUT_MS,
    contentionMessage: 'Timed out waiting for another Home shortcut preference write.',
    failureCode: 'agent_package_home_shortcut_preferences_lock_timeout',
  }, operation);
}

export function updateHomeShortcutPreferences(input: {
  packageId: string;
  shortcutIds: string[];
  visible: boolean;
  dryRun: boolean;
}) {
  const shortcutIds = [...new Set(input.shortcutIds)];
  const stored = readHomeShortcutPreferenceFile();
  const updatedAt = nowIso();
  const preferenceByKey = new Map(
    stored.preferences.map((entry) => [`${entry.package_id}\n${entry.shortcut_id}`, entry]),
  );
  const preferences = shortcutIds.map((shortcutId, index) => {
    const key = `${input.packageId}\n${shortcutId}`;
    const previous = preferenceByKey.get(key);
    const next: AgentPackageStoredHomeShortcutPreference = {
      package_id: input.packageId,
      shortcut_id: shortcutId,
      visible: input.visible,
      sort_order: previous?.sort_order ?? null,
      source: 'user_preference',
      updated_at: updatedAt,
    };
    preferenceByKey.set(key, next);
    return { ...next, action_order: index };
  });
  const nextFile: AgentPackageHomeShortcutPreferenceFile = {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: updatedAt,
    preferences: [...preferenceByKey.values()],
  };
  if (!input.dryRun) writeHomeShortcutPreferenceFile(nextFile);
  return preferences;
}

export function defaultHomeShortcutPreferences(
  directoryOrRegistry: unknown,
): AgentPackageHomeShortcutPreference[] {
  const entries = isRecord(directoryOrRegistry) ? recordList(directoryOrRegistry.entries) : [];
  const installedIds = new Set([
    ...entries.flatMap((entry) => entry.installed === true ? [stringValue(entry.package_id)] : []),
  ]);
  const timestamp = nowIso();
  return entries.flatMap((entry, entryIndex) => {
    const packageId = stringValue(entry.package_id);
    if (!packageId) return [];
    const ownerShortcuts = Array.isArray(entry.home_shortcuts)
      ? recordList(entry.home_shortcuts).flatMap((shortcut) => {
          const shortcutId = stringValue(shortcut.shortcut_id);
          return shortcutId ? [{
            shortcutId,
            visible: shortcut.default_visible === true,
          }] : [];
        })
      : [];
    const shortcuts = ownerShortcuts.length > 0
      ? ownerShortcuts
      : stringList(entry.home_shortcut_ids).map((shortcutId) => ({
          shortcutId,
          visible: entry.starter_default === true,
        }));
    return shortcuts.map(({ shortcutId, visible }, shortcutIndex) => ({
      shortcut_id: shortcutId,
      package_id: packageId,
      visible,
      sort_order: entryIndex * 100 + shortcutIndex,
      source: 'default' as const,
      updated_at: timestamp,
      installed: installedIds.has(packageId),
    }));
  });
}

export function mergedHomeShortcutPreferences(
  directoryOrRegistry: unknown,
): AgentPackageHomeShortcutPreference[] {
  const entries = isRecord(directoryOrRegistry) ? recordList(directoryOrRegistry.entries) : [];
  const installedIds = new Set([
    ...entries.flatMap((entry) => entry.installed === true ? [stringValue(entry.package_id)] : []),
  ]);
  const merged = new Map<string, AgentPackageHomeShortcutPreference>();
  const configurable = new Set<string>();
  const legacyPackages = new Set<string>();
  for (const entry of entries) {
    const packageId = stringValue(entry.package_id);
    if (!packageId) continue;
    const hasOwnerPresentation = isRecord(entry.display_name_i18n)
      && isRecord(entry.description_i18n)
      && isRecord(entry.session_routing_summary_i18n);
    const ownerShortcuts = Array.isArray(entry.home_shortcuts)
      ? recordList(entry.home_shortcuts)
      : [];
    if (hasOwnerPresentation) {
      for (const shortcut of ownerShortcuts) {
        const shortcutId = stringValue(shortcut.shortcut_id);
        if (shortcutId && shortcut.user_configurable === true) configurable.add(`${packageId}\n${shortcutId}`);
      }
    } else {
      legacyPackages.add(packageId);
      for (const shortcutId of stringList(entry.home_shortcut_ids)) configurable.add(`${packageId}\n${shortcutId}`);
    }
  }
  for (const entry of defaultHomeShortcutPreferences(directoryOrRegistry)) {
    merged.set(`${entry.package_id}\n${entry.shortcut_id}`, entry);
  }
  for (const entry of readHomeShortcutPreferenceFile().preferences) {
    const key = `${entry.package_id}\n${entry.shortcut_id}`;
    const declaredDefault = merged.get(key);
    if (!configurable.has(key) && !legacyPackages.has(entry.package_id)) continue;
    merged.set(key, {
      ...(declaredDefault ?? entry),
      visible: entry.visible,
      sort_order: entry.sort_order,
      source: 'user_preference',
      updated_at: entry.updated_at,
      installed: installedIds.has(entry.package_id),
    });
  }
  return [...merged.values()].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      || a.package_id.localeCompare(b.package_id)
      || a.shortcut_id.localeCompare(b.shortcut_id)
  );
}
