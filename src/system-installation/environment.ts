import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import { inspectHermesRuntime } from '../hermes.ts';
import { readLocalCodexDefaultsIfAvailable } from '../local-codex-defaults.ts';
import { buildNativeHelperHealthStatus } from '../native-helper-runtime.ts';
import type { GatewayContracts } from '../types.ts';

import { resolveCodexVersion } from './engine-helpers.ts';
import { buildOplModules } from './modules.ts';

export async function buildOplEnvironment(contracts: GatewayContracts) {
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  const codexBinary = resolveCodexVersion();
  const hermes = inspectHermesRuntime();
  const nativeHelpers = buildNativeHelperHealthStatus();
  const modulesPayload = buildOplModules().modules;
  const moduleSummary = modulesPayload.summary;
  const codexIssues = [...codexBinary.issues];
  const codexHealthStatus =
    codexBinary.installed
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
    system_environment: {
      surface_id: 'opl_system_environment',
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
          config_status: codexDefaults ? 'detected' : 'not_detected',
          issues: codexIssues,
        },
        hermes: {
          installed: Boolean(hermes.binary),
          version: hermes.version,
          update_available: hermes.update_available,
          update_summary: hermes.update_summary,
          binary_path: hermes.binary?.path ?? null,
          binary_source: hermes.binary?.source ?? null,
          gateway_loaded: hermes.gateway_service.loaded,
          gateway_status_raw: hermes.gateway_service.raw_output,
          health_status: hermesHealthStatus,
          issues: hermes.issues,
        },
      },
      native_helpers: nativeHelpers,
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
        'Codex config is inherited when present; a missing readable config is not a first-run blocker when the Codex CLI itself is available and compatible.',
        'OPL reports native helper lifecycle readiness here; opl install can run the native repair path when helper binaries are missing.',
        'AionUI provides the GUI/WebUI shell; OPL no longer hosts a local Product API service on port 8787.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
      ],
    },
  };
}
