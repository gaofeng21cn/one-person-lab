import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { nowIso, sha256Text } from './shared.ts';
import type {
  AgentPackageHomeShortcutPreference,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageLockIndex,
} from './types.ts';

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
        installed: entry.installed === true,
      }];
    }),
  };
}

export function writeHomeShortcutPreferenceFile(file: AgentPackageHomeShortcutPreferenceFile) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_home_shortcut_preferences_file, file);
}

export function defaultHomeShortcutPreferences(
  registryCache: unknown,
  lockIndex: AgentPackageLockIndex,
): AgentPackageHomeShortcutPreference[] {
  const entries = isRecord(registryCache) ? recordList(registryCache.entries) : [];
  const installedIds = new Set(lockIndex.packages.map((entry) => entry.package_id));
  const timestamp = nowIso();
  return entries.flatMap((entry, entryIndex) => {
    const packageId = stringValue(entry.package_id);
    if (!packageId) return [];
    return stringList(entry.home_shortcut_ids).map((shortcutId, shortcutIndex) => ({
      shortcut_id: shortcutId,
      package_id: packageId,
      visible: entry.starter_default === true,
      sort_order: entryIndex * 100 + shortcutIndex,
      source: 'default' as const,
      updated_at: timestamp,
      installed: installedIds.has(packageId),
    }));
  });
}

export function mergedHomeShortcutPreferences(
  registryCache: unknown,
  lockIndex: AgentPackageLockIndex,
): AgentPackageHomeShortcutPreference[] {
  const installedIds = new Set(lockIndex.packages.map((entry) => entry.package_id));
  const merged = new Map<string, AgentPackageHomeShortcutPreference>();
  for (const entry of defaultHomeShortcutPreferences(registryCache, lockIndex)) {
    merged.set(`${entry.package_id}\n${entry.shortcut_id}`, entry);
  }
  for (const entry of readHomeShortcutPreferenceFile().preferences) {
    merged.set(`${entry.package_id}\n${entry.shortcut_id}`, {
      ...entry,
      source: 'user_preference',
      installed: installedIds.has(entry.package_id),
    });
  }
  return [...merged.values()].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      || a.package_id.localeCompare(b.package_id)
      || a.shortcut_id.localeCompare(b.shortcut_id)
  );
}

export function homeShortcutPreferenceSourceSha256(input: AgentPackageHomeShortcutPreferencesSetInput) {
  return sha256Text([
    input.packageId,
    input.shortcutId,
    input.visible === false ? 'hidden' : 'visible',
    input.sortOrder ?? '',
  ].join('\n'));
}
