import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from '../frontdesk-state.ts';
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
  const modulesPayload = buildFrontDeskModules().frontdesk_modules;
  const moduleSummary = modulesPayload.summary;
  const codexIssues = [
    ...codexBinary.issues,
    ...(codexDefaults ? [] : ['codex_config_missing']),
  ];
  const codexHealthStatus =
    codexBinary.installed
      && codexDefaults
      && codexBinary.version_status === 'compatible'
      && codexBinary.issues.length === 0
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
          parsed_version: codexBinary.parsed_version,
          minimum_version: codexBinary.minimum_version,
          version_status: codexBinary.version_status,
          binary_path: codexBinary.binary_path,
          binary_source: codexBinary.binary_source,
          candidates: codexBinary.candidates,
          config_path: codexDefaults?.config_path ?? null,
          default_model: codexDefaults?.model ?? null,
          default_reasoning_effort: codexDefaults?.reasoning_effort ?? null,
          provider_base_url: codexDefaults?.provider_base_url ?? null,
          health_status: codexHealthStatus,
          issues: codexIssues,
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
      gui_shell: {
        strategy: 'aionui_remote_webui',
        service_dependency: 'none',
        local_product_api_retired: true,
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
      },
      notes: [
        'OPL owns the user-facing initialization surface and reports whether the local Codex and Hermes engines are ready to be reused.',
        'AionUI provides the GUI/WebUI shell; OPL no longer hosts a local Product API service on port 8787.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
      ],
    },
  };
}
