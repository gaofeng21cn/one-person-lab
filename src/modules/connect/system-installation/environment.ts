import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { familyRuntimePaths } from '../../runway/index.ts';
import { readManagedProviderProjectionSummary } from '../../runway/index.ts';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from '../../runway/index.ts';
import {
  readBundledCodexDefaultProfile,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
} from '../../../kernel/local-codex-defaults.ts';
import { buildNativeHelperHealthStatus } from '../../runway/index.ts';
import { buildOplEndpoints } from '../../runway/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

import { buildOplDeveloperModeSurface } from './developer-mode.ts';
import { resolveCodexVersion } from './engine-helpers.ts';
import { buildOplModules } from './modules.ts';
import type {
  OplSystemInitializeEventHandler,
} from './shared.ts';
import { readOplSeedInstallManifest } from './seed-manifest.ts';
import {
  createOplSystemInitializeEventEmitter,
  withOplSystemInitializeEventPhase,
} from './shared.ts';

type OplEnvironmentBuildOptions = {
  onInitializeEvent?: OplSystemInitializeEventHandler;
};

export async function buildOplEnvironment(
  contracts: FrameworkContracts,
  options: OplEnvironmentBuildOptions = {},
) {
  const events = createOplSystemInitializeEventEmitter(options.onInitializeEvent);
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const seedInstallManifest = readOplSeedInstallManifest();
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  const codexAccess = readLocalCodexAccessState();
  const codexDefaultProfile = readBundledCodexDefaultProfile();
  const codexBinary = await withOplSystemInitializeEventPhase(
    events,
    'codex',
    'Inspect Codex CLI and default profile',
    () => resolveCodexVersion(),
    (codex) => ({
      health_status: codex.installed ? codex.version_status : 'missing',
      installed: codex.installed,
      version_status: codex.version_status,
    }),
  );
  const providerKind = await withOplSystemInitializeEventPhase(
    events,
    'family_runtime_provider',
    'Resolve family runtime provider selection',
    () => resolveFamilyRuntimeProviderKind(),
    (kind) => ({ provider_kind: kind }),
  );
  const familyRuntimeProvider = await withOplSystemInitializeEventPhase(
    events,
    'family_runtime_provider',
    'Inspect family runtime provider readiness',
    () => inspectFamilyRuntimeProviderWithLifecycle(
      providerKind,
      familyRuntimePaths(),
      { managedProviderProjection: readManagedProviderProjectionSummary() },
    ),
    (provider) => ({
      status: provider.status,
      ready: provider.ready,
      degraded_reason: provider.degraded_reason,
    }),
  );
  const nativeHelpers = await withOplSystemInitializeEventPhase(
    events,
    'native_helpers',
    'Inspect native helper toolchain',
    () => buildNativeHelperHealthStatus(),
    (helpers) => ({ health_status: helpers.health_status }),
  );
  const modulesPayload = await withOplSystemInitializeEventPhase(
    events,
    'modules',
    'Inspect OPL module checkouts',
    () => buildOplModules().modules,
    (modules) => ({
      installed_modules_count: modules.summary.installed_modules_count,
      total_modules_count: modules.summary.total_modules_count,
    }),
  );
  const developerMode = await withOplSystemInitializeEventPhase(
    events,
    'developer_mode',
    'Inspect Developer Mode settings',
    () => buildOplDeveloperModeSurface(buildOplEndpoints()),
    (surface) => ({
      status: surface.status,
      enabled: surface.enabled,
    }),
  );
  const moduleSummary = modulesPayload.summary;
  const codexIssues = [...codexBinary.issues];
  const codexDiagnostics = [...codexBinary.diagnostics];
  const codexConfigStatus = codexDefaults
    ? codexDefaults.provider_api_key
      ? 'detected'
      : 'api_key_missing'
    : 'not_detected';
  const codexModelAccessStatus = codexAccess.model_access_ready ? 'ready' : 'missing';
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
          latest_version: codexBinary.latest_version,
          latest_version_status: codexBinary.latest_version_status,
          update_available: codexBinary.update_available,
          binary_path: codexBinary.binary_path,
          binary_source: codexBinary.binary_source,
          candidates: codexBinary.candidates,
          runtime_substrate_updater: codexBinary.runtime_substrate_updater,
          diagnostics: codexDiagnostics,
          config_path: codexDefaults?.config_path ?? null,
          default_model: codexDefaults?.model ?? null,
          default_reasoning_effort: codexDefaults?.reasoning_effort ?? null,
          provider_base_url: codexDefaults?.provider_base_url ?? null,
          default_profile: codexDefaultProfile,
          health_status: codexHealthStatus,
          config_status: codexConfigStatus,
          api_key_present: Boolean(codexDefaults?.provider_api_key),
          opl_gateway_configured: codexAccess.opl_gateway_configured,
          model_access_ready: codexAccess.model_access_ready,
          model_access_status: codexModelAccessStatus,
          model_access_source: codexAccess.model_access_source,
          codex_login_present: codexAccess.codex_login_present,
          env_api_key_present: codexAccess.env_api_key_present,
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
      developer_mode: developerMode,
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
        install_manifest_file: statePaths.install_manifest_file,
      },
      seed_install: seedInstallManifest ? {
        status: seedInstallManifest.status ?? 'unknown',
        startup_state: seedInstallManifest.status === 'applied' ? 'seed_applied' : 'initializing',
        seed_applied: seedInstallManifest.status === 'applied',
        needs_startup_maintenance: seedInstallManifest.status !== 'applied',
        image_version: isRecord(seedInstallManifest.image)
          ? seedInstallManifest.image.version ?? null
          : null,
        image_digest: isRecord(seedInstallManifest.image)
          ? seedInstallManifest.image.digest ?? null
          : null,
        data_dir: isRecord(seedInstallManifest.install)
          ? seedInstallManifest.install.data_dir ?? null
          : null,
        projects_dir: isRecord(seedInstallManifest.install)
          ? seedInstallManifest.install.projects_dir ?? null
          : null,
        manifest_file: statePaths.install_manifest_file,
        api_key_status: codexConfigStatus,
        api_key_present: Boolean(codexDefaults?.provider_api_key),
        model_access_status: codexModelAccessStatus,
        model_access_ready: codexAccess.model_access_ready,
        readiness_claim: 'not_claimed',
        can_claim_ready_or_current: false,
      } : {
        status: 'not_applied',
        startup_state: 'needs_startup_maintenance',
        seed_applied: false,
        needs_startup_maintenance: true,
        image_version: null,
        image_digest: null,
        data_dir: null,
        projects_dir: null,
        manifest_file: statePaths.install_manifest_file,
        api_key_status: codexConfigStatus,
        api_key_present: Boolean(codexDefaults?.provider_api_key),
        model_access_status: codexModelAccessStatus,
        model_access_ready: codexAccess.model_access_ready,
        readiness_claim: 'not_claimed',
        can_claim_ready_or_current: false,
      },
      notes: [
        'OPL owns the user-facing initialization surface and reports Codex readiness separately from configured family runtime provider readiness.',
        'Codex CLI readiness and Codex API configuration are reported separately so first-run can guide missing API keys without copying secrets into logs.',
        'Full OPL readiness uses the configured family runtime provider; non-default executors are explicit stage/request selections with independent receipts.',
        'OPL reports native helper lifecycle readiness here; opl install can run the native repair path when helper binaries are missing.',
        'AionUI provides the GUI/WebUI shell; OPL no longer hosts a local Product API service on port 8787.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
        'Developer Mode is exposed as a settings surface backed by the existing developer_supervisor system action and includes GitHub identity, repository authority, and supervised repair route projections.',
        'Docker/WebUI seed state is reported from the install manifest when startup maintenance or seed-apply has recorded it; this read model does not claim runtime readiness.',
      ],
    },
  };
}
