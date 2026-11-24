import { runOplSystemAction } from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { dockerWebuiSeedEnv } from './action-execute-payloads.ts';
import { buildDockerWebuiSettingsManualAction } from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

type EnvironmentAppActionResult = {
  delegatedSurface: string;
  result: unknown;
};

async function withTemporaryEnv<T>(
  updates: Record<string, string | null>,
  run: () => Promise<T>,
) {
  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function executeEnvironmentAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
): Promise<EnvironmentAppActionResult | null> {
  if (options.actionId !== 'settings_select_webui_seed') {
    return null;
  }
  const seed = dockerWebuiSeedEnv(options.payload);
  return {
    delegatedSurface: 'OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json',
    result: options.dryRun
      ? buildDockerWebuiSettingsManualAction(options.actionId, seed.commandPreview, options.payload)
      : await withTemporaryEnv({
        OPL_IMAGE_MANIFEST_PATH: seed.imageManifestPath,
        OPL_IMAGE_SEED_DIR: seed.imageSeedDir,
      }, () => runOplSystemAction(contracts, 'startup_maintenance')),
  };
}
