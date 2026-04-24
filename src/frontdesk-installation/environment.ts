import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from '../frontdesk-state.ts';
import { getFrontDeskServiceStatus } from '../frontdesk-service.ts';
import { inspectHermesRuntime } from '../hermes.ts';
import { readLocalCodexDefaultsIfAvailable } from '../local-codex-defaults.ts';
import type { GatewayContracts } from '../types.ts';

import { resolveCodexVersion } from './engine-helpers.ts';
import { buildFrontDeskModules } from './modules.ts';

export async function buildFrontDeskEnvironment(contracts: GatewayContracts) {
  const statePaths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  const codexBinary = resolveCodexVersion();
  const hermes = inspectHermesRuntime();
  const localService = (await getFrontDeskServiceStatus(contracts)).frontdesk_service;
  const modulesPayload = buildFrontDeskModules().frontdesk_modules;
  const moduleSummary = modulesPayload.summary;
  const codexHealthStatus =
    codexBinary.installed && codexDefaults
      ? 'ready'
      : codexBinary.installed
        ? 'attention_needed'
        : 'missing';
  const hermesHealthStatus =
    hermes.binary && hermes.gateway_service.loaded
      ? 'ready'
      : hermes.binary
        ? 'attention_needed'
        : 'missing';
  const overallStatus =
    codexHealthStatus === 'ready' && hermesHealthStatus === 'ready'
      ? 'ready'
      : 'attention_needed';

  return {
    version: 'g2',
    frontdesk_environment: {
      surface_id: 'opl_frontdesk_environment',
      overall_status: overallStatus,
      core_engines: {
        codex: {
          installed: codexBinary.installed,
          version: codexBinary.version,
          binary_path: codexBinary.binary_path,
          binary_source: codexBinary.binary_source,
          config_path: codexDefaults?.config_path ?? null,
          default_model: codexDefaults?.model ?? null,
          default_reasoning_effort: codexDefaults?.reasoning_effort ?? null,
          provider_base_url: codexDefaults?.provider_base_url ?? null,
          health_status: codexHealthStatus,
        },
        hermes: {
          installed: Boolean(hermes.binary),
          version: hermes.version,
          binary_path: hermes.binary?.path ?? null,
          binary_source: hermes.binary?.source ?? null,
          gateway_loaded: hermes.gateway_service.loaded,
          gateway_status_raw: hermes.gateway_service.raw_output,
          health_status: hermesHealthStatus,
          issues: hermes.issues,
        },
      },
      local_frontdesk: {
        service_installed: localService.installed,
        service_loaded: localService.loaded,
        service_health: localService.health.status,
        gui_shell_strategy: 'external_overlay',
      },
      module_summary: moduleSummary,
      managed_paths: {
        state_dir: statePaths.state_dir,
        modules_root: modulesPayload.modules_root,
        workspace_registry_file: statePaths.workspace_registry_file,
        workspace_root_file: statePaths.workspace_root_file,
        session_ledger_file: statePaths.session_ledger_file,
        runtime_modes_file: statePaths.runtime_modes_file,
        update_channel_file: statePaths.update_channel_file,
        service_config_file: statePaths.service_config_file,
      },
      notes: [
        'OPL owns the user-facing initialization surface and reports whether the local Codex and Hermes engines are ready to be reused.',
        'Local frontdesk service is the repo-tracked adapter/API surface for external GUI shells.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
      ],
    },
  };
}
