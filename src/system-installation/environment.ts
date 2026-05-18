import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import { familyRuntimePaths } from '../family-runtime-store.ts';
import { readMasManagedProviderProjection } from '../family-runtime-mas-managed-provider-projection.ts';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from '../family-runtime-providers.ts';
import { readBundledCodexDefaultProfile, readLocalCodexDefaultsIfAvailable } from '../local-codex-defaults.ts';
import { buildNativeHelperHealthStatus } from '../native-helper-runtime.ts';
import type { FrameworkContracts } from '../types.ts';

import { resolveCodexVersion } from './engine-helpers.ts';
import { buildOplModules } from './modules.ts';

export async function buildOplEnvironment(contracts: FrameworkContracts) {
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  const codexDefaultProfile = readBundledCodexDefaultProfile();
  const codexBinary = resolveCodexVersion();
  const providerKind = resolveFamilyRuntimeProviderKind();
  const familyRuntimeProvider = await inspectFamilyRuntimeProviderWithLifecycle(
    providerKind,
    familyRuntimePaths(),
    { managedProviderProjection: readMasManagedProviderProjection() },
  );
  const nativeHelpers = buildNativeHelperHealthStatus();
  const modulesPayload = buildOplModules().modules;
  const moduleSummary = modulesPayload.summary;
  const codexIssues = [...codexBinary.issues];
  const codexDiagnostics = [...codexBinary.diagnostics];
  const codexConfigStatus = codexDefaults
    ? codexDefaults.provider_api_key
      ? 'detected'
      : 'api_key_missing'
    : 'not_detected';
  const codexHealthStatus =
    codexBinary.installed
      && codexBinary.version_status === 'compatible'
      && codexBinary.issues.length === 0
      ? 'ready'
      : codexBinary.installed
        ? 'attention_needed'
        : 'missing';
  const familyRuntimeProviderHealthStatus = familyRuntimeProvider.ready ? 'ready' : 'attention_needed';
  const overallStatus =
    codexHealthStatus === 'ready' && familyRuntimeProviderHealthStatus === 'ready'
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
          diagnostics: codexDiagnostics,
          config_path: codexDefaults?.config_path ?? null,
          default_model: codexDefaults?.model ?? null,
          default_reasoning_effort: codexDefaults?.reasoning_effort ?? null,
          provider_base_url: codexDefaults?.provider_base_url ?? null,
          default_profile: codexDefaultProfile,
          health_status: codexHealthStatus,
          config_status: codexConfigStatus,
          api_key_present: Boolean(codexDefaults?.provider_api_key),
          issues: codexIssues,
        },
        family_runtime_provider: {
          provider_kind: providerKind,
          required_for: 'full_opl_family_runtime_readiness',
          health_status: familyRuntimeProviderHealthStatus,
          status: familyRuntimeProvider.status,
          degraded_reason: familyRuntimeProvider.degraded_reason,
          capabilities: familyRuntimeProvider.capabilities,
          details: familyRuntimeProvider.details,
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
        developer_supervisor_config_file: statePaths.developer_supervisor_config_file,
      },
      notes: [
        'OPL owns the user-facing initialization surface and reports Codex readiness separately from configured family runtime provider readiness.',
        'Codex CLI readiness and Codex API configuration are reported separately so first-run can guide missing API keys without copying secrets into logs.',
        'Full OPL readiness uses the configured family runtime provider; non-default executors are explicit stage/request selections with independent receipts.',
        'OPL reports native helper lifecycle readiness here; opl install can run the native repair path when helper binaries are missing.',
        'AionUI provides the GUI/WebUI shell; OPL no longer hosts a local Product API service on port 8787.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
      ],
    },
  };
}
