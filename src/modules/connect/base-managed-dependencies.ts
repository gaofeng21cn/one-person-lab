import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectRoot } from './system-installation/shared.ts';
import { resolveCodexVersion } from './system-installation/engine-helpers.ts';
import { readOplFlowManagedDependencies, readOplFlowManagedDependencyIds } from './agent-package-registry.ts';
import {
  inspectManagedCompanionToolCurrentness,
  reconcileManagedCompanionTools,
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
  type OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';
import {
  inspectExternalCodexInstallation,
  inspectExternalTemporalInstallation,
} from './external-dependency-currentness.ts';
import {
  readTemporalStableCohort,
  TEMPORAL_SDK_PACKAGE_NAMES,
} from './temporal-stable-cohort.ts';

function packageVersion(packageName: string) {
  const packagePath = path.join(resolveProjectRoot(), 'node_modules', packageName, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: unknown };
    return typeof payload.version === 'string' ? payload.version : null;
  } catch {
    return null;
  }
}

function toolDependency(tool: OplCompanionToolSyncItem | null, dependencyId: string, selectedByFlow: boolean) {
  const managed = selectedByFlow && (tool?.ownership === 'opl_managed' || tool?.ownership === 'app_bundled' || !tool);
  return {
    dependency_id: dependencyId,
    dependency_kind: 'cli',
    installed: Boolean(tool?.binary_path),
    version: tool?.version ?? null,
    latest_version: tool?.latest_version ?? null,
    currentness: tool?.currentness ?? 'missing',
    content_sha256: tool?.content_sha256 ?? null,
    ownership: tool?.ownership ?? 'missing',
    update_policy: tool?.ownership === 'opl_managed'
      ? 'silent_managed_reconcile'
      : tool?.ownership === 'app_bundled'
        ? 'updated_with_app_runtime_generation'
        : 'detect_only_no_overwrite',
    update_mode: managed ? 'silent_managed' : 'detect_only_guidance',
    update_action: null,
    activation_policy: tool?.ownership === 'app_bundled'
      ? 'app_restart_generation_switch'
      : 'next_process_discovery',
    binary_path: tool?.binary_path ?? null,
    status: tool?.status ?? 'missing',
    note: tool?.note ?? null,
  };
}

function codexCurrentness(value: unknown) {
  return value === 'current' ? 'current' : value === 'outdated' ? 'update_available' : value === 'missing' ? 'missing' : 'unknown';
}

export function inspectBaseManagedDependencies(
  home: string,
  options: { refreshManagedLatest?: boolean } = {},
) {
  const codex = resolveCodexVersion({ skipLatestLookup: !options.refreshManagedLatest });
  const codexRecord = codex as unknown as Record<string, unknown>;
  const codexPath = typeof codexRecord.binary_path === 'string' ? codexRecord.binary_path : null;
  const runtimeUpdater = codexRecord.runtime_substrate_updater && typeof codexRecord.runtime_substrate_updater === 'object'
    ? codexRecord.runtime_substrate_updater as Record<string, unknown>
    : null;
  const currentManagedPath = typeof runtimeUpdater?.current_binary_path === 'string'
    ? path.resolve(runtimeUpdater.current_binary_path)
    : null;
  const codexManaged = Boolean(codexPath && currentManagedPath && path.resolve(codexPath) === currentManagedPath);
  const candidateRecords = Array.isArray(codexRecord.candidates)
    ? codexRecord.candidates.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
  const candidatePaths = candidateRecords.flatMap((entry) => [
    typeof entry.path === 'string' ? { binaryPath: entry.path, version: typeof entry.version === 'string' ? entry.version : null } : null,
    ...(Array.isArray(entry.aliases) ? entry.aliases : [])
      .filter((alias): alias is string => typeof alias === 'string')
      .map((alias) => ({ binaryPath: alias, version: typeof entry.version === 'string' ? entry.version : null })),
  ]).filter((entry): entry is { binaryPath: string; version: string | null } => Boolean(entry));
  const seenCodexPaths = new Set<string>();
  const inspectedCodexInstallations = candidatePaths
    .filter((entry) => {
      const normalized = path.resolve(entry.binaryPath);
      if (normalized === currentManagedPath || seenCodexPaths.has(normalized)) return false;
      seenCodexPaths.add(normalized);
      return true;
    })
    .map((entry) => inspectExternalCodexInstallation({
      ...entry,
      latestVersion: typeof codexRecord.latest_version === 'string' ? codexRecord.latest_version : null,
    }));
  const selectedExternalCodex = inspectedCodexInstallations.find((entry) => (
    Boolean(codexPath) && path.resolve(entry.binary_path ?? '') === path.resolve(codexPath!)
  ));
  const externalCodexInstallations = inspectedCodexInstallations.filter((entry) => (
    !codexPath || path.resolve(entry.binary_path ?? '') !== path.resolve(codexPath)
  ));
  const temporalCohort = readTemporalStableCohort();
  const temporalVersions = Object.fromEntries(TEMPORAL_SDK_PACKAGE_NAMES.map((packageName) => [
    packageName.slice('@temporalio/'.length),
    packageVersion(packageName),
  ]));
  const temporalExpectedVersions = Object.fromEntries(TEMPORAL_SDK_PACKAGE_NAMES.map((packageName) => [
    packageName.slice('@temporalio/'.length),
    temporalCohort.sdk.packages[packageName],
  ]));
  const temporalInstalled = Object.values(temporalVersions).some(Boolean);
  const temporalComplete = Object.values(temporalVersions).every(Boolean);
  const temporalDriftedPackages = TEMPORAL_SDK_PACKAGE_NAMES.filter((packageName) => (
    temporalVersions[packageName.slice('@temporalio/'.length)] !== temporalCohort.sdk.packages[packageName]
  ));
  const temporalCurrent = temporalComplete && temporalDriftedPackages.length === 0;
  const flowDependencyIds = readOplFlowManagedDependencyIds();
  const selectedToolIds = (['officecli', 'mineru-open-api'] as const).filter((id) => flowDependencyIds.includes(id));
  const refreshedToolMap = new Map(
    (options.refreshManagedLatest ? inspectManagedCompanionToolCurrentness(home, [...selectedToolIds]) : [])
      .filter((entry): entry is OplCompanionToolSyncItem => Boolean(entry))
      .map((entry) => [entry.tool_id, entry]),
  );
  const officeCli = refreshedToolMap.get('officecli') ?? resolveOfficeCliTool(home);
  const mineruOpenApi = refreshedToolMap.get('mineru-open-api') ?? resolveMineruOpenApiTool(home);
  const temporalSystemCli = inspectExternalTemporalInstallation({ refreshLatest: options.refreshManagedLatest });
  const dependencies = [
    {
      dependency_id: 'codex-cli',
      dependency_kind: 'runtime_executor',
      installed: Boolean(codexPath),
      version: typeof codexRecord.version === 'string' ? codexRecord.version : null,
      latest_version: typeof codexRecord.latest_version === 'string' ? codexRecord.latest_version : null,
      currentness: codexCurrentness(codexRecord.latest_version_status),
      ownership: codexManaged ? 'opl_managed' : selectedExternalCodex?.ownership ?? (codexPath ? 'global_path' : 'missing'),
      update_policy: codexManaged ? 'silent_stage_verify' : 'detect_only_no_overwrite',
      update_mode: codexManaged
        ? 'silent_managed'
        : selectedExternalCodex?.update_mode ?? 'detect_only_guidance',
      update_action: codexManaged ? null : selectedExternalCodex?.update_action ?? null,
      activation_policy: codexManaged ? 'app_restart_generation_switch' : 'external_owner',
      binary_path: codexPath,
      status: codexRecord.version_status ?? 'unknown',
      external_installations: externalCodexInstallations,
    },
    {
      dependency_id: 'temporal-runtime',
      dependency_kind: 'runtime_substrate',
      installed: temporalInstalled,
      version: temporalVersions,
      latest_version: temporalExpectedVersions,
      currentness: !temporalComplete ? 'missing' : temporalCurrent ? 'current' : 'update_available',
      stable_cohort_version: temporalCohort.sdk.version,
      stable_cohort_ref: temporalCohort.contract_ref,
      drifted_packages: temporalDriftedPackages,
      ownership: 'opl_managed_runtime_generation',
      update_policy: 'updated_with_opl_base_framework_generation',
      update_mode: 'silent_managed',
      update_action: null,
      activation_policy: 'app_launch_reconcile_generation_switch',
      binary_path: null,
      status: temporalCurrent ? 'ready' : 'attention_needed',
    },
    toolDependency(officeCli, 'officecli', flowDependencyIds.includes('officecli')),
    toolDependency(mineruOpenApi, 'mineru-open-api', flowDependencyIds.includes('mineru-open-api')),
    {
      ...temporalSystemCli,
      dependency_kind: 'external_cli',
      update_policy: temporalSystemCli.update_mode === 'explicit_owner_delegated'
        ? 'explicit_owner_delegated_after_confirmation'
        : 'detect_only_no_overwrite',
      activation_policy: 'external_owner',
      status: temporalSystemCli.currentness,
      note: temporalSystemCli.guidance,
    },
  ];
  const dependencyById = new Map(dependencies.map((entry) => [entry.dependency_id, entry]));
  const flowDependencies = readOplFlowManagedDependencies().map((entry) => {
    const baseDependency = dependencyById.get(entry.dependency_id);
    const currentness = entry.dependency_kind === 'base'
      ? 'current'
      : baseDependency?.currentness
        ?? (entry.installed === true ? 'current' : entry.installed === false ? 'missing' : 'unknown');
    return {
      ...entry,
      status: baseDependency?.status ?? entry.observed_status ?? currentness,
      currentness,
      version: baseDependency?.version ?? null,
      latest_version: baseDependency?.latest_version ?? null,
      ownership: baseDependency?.ownership ?? (entry.installed ? 'opl_managed_projection' : 'missing'),
    };
  });
  return {
    surface_kind: 'opl_base_managed_dependency_catalog.v1',
    lifecycle_owner: 'opl_base',
    flow_dependency_ids: flowDependencyIds,
    flow_dependencies: flowDependencies,
    dependencies,
    summary: {
      total_count: dependencies.length,
      opl_managed_count: dependencies.filter((entry) => String(entry.ownership).startsWith('opl_managed')).length,
      detect_only_count: dependencies.filter((entry) => entry.update_policy === 'detect_only_no_overwrite').length,
      silent_managed_count: dependencies.filter((entry) => entry.update_mode === 'silent_managed').length,
      explicit_owner_delegated_count: dependencies.filter((entry) => entry.update_mode === 'explicit_owner_delegated').length,
      update_available_count: dependencies.filter((entry) => entry.currentness === 'update_available').length,
    },
  };
}

export function reconcileBaseManagedDependencies(home: string) {
  const dependencyIds = new Set(readOplFlowManagedDependencyIds());
  const selectedTools = (['officecli', 'mineru-open-api'] as const).filter((id) => dependencyIds.has(id));
  const toolResults = selectedTools.length > 0
    ? reconcileManagedCompanionTools(home, [...selectedTools])
    : [];
  return {
    surface_kind: 'opl_base_managed_dependency_reconcile.v1',
    status: toolResults.some((entry) => entry.status === 'failed' || entry.currentness === 'update_available')
      ? 'attention_needed'
      : 'completed',
    selected_from_installed_package_dependency_closure: [...selectedTools],
    tool_results: toolResults,
    catalog: inspectBaseManagedDependencies(home),
  };
}
