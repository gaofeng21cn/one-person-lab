import fs from 'node:fs';

import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from './json-file.ts';
import { withRuntimeStateMutex } from './runtime-state-mutex.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

const PACKAGE_ID = /^[a-z0-9][a-z0-9._-]*$/;

export type AppPackagePreferences = Record<string, boolean>;

export function readAppPackagePreferences(): AppPackagePreferences {
  const file = resolveOplStatePaths().app_package_preferences_file;
  if (!fs.existsSync(file)) return {};
  const stored = readJsonPayloadFile(file);
  if (!isRecord(stored) || stored.version !== 'g1' || !isRecord(stored.packages)
    || Object.entries(stored.packages).some(([id, enabled]) => !PACKAGE_ID.test(id) || typeof enabled !== 'boolean')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Invalid OPL App package preferences.', { file });
  }
  return stored.packages as AppPackagePreferences;
}

export function setAppPackageEnabled(input: { packageId: string; enabled: unknown; dryRun: boolean }) {
  if (!PACKAGE_ID.test(input.packageId) || typeof input.enabled !== 'boolean') {
    throw new FrameworkContractError('cli_usage_error', 'package_app_set_enabled requires a canonical package_id and boolean enabled.', {
      required: ['package_id', 'enabled'],
    });
  }
  const enabled = input.enabled;
  const update = () => {
    const packages = { ...readAppPackagePreferences(), [input.packageId]: enabled };
    if (!input.dryRun) {
      writeJsonPayloadFile(ensureOplStateDir().app_package_preferences_file, {
        version: 'g1',
        packages,
      });
    }
    return {
      surface_kind: 'opl_app_package_preference.v1',
      package_id: input.packageId,
      app_enabled: enabled,
      dry_run: input.dryRun,
      scope: 'opl_app_desktop_and_webui',
    };
  };
  if (input.dryRun) return update();
  return withRuntimeStateMutex({
    lockFile: `${ensureOplStateDir().app_package_preferences_file}.sqlite`,
    timeoutMs: 5_000,
    contentionMessage: 'Timed out waiting for another OPL App package preference write.',
    failureCode: 'app_package_preferences_lock_timeout',
  }, update);
}
