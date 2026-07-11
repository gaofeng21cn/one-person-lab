import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import type { JsonRecord, PythonPackageRequirement, RPackageRequirement } from './contract.ts';
import { contentFingerprint, objects } from './target-state.ts';

export function requirementProfileIdentity(
  profilePath: string,
  requestedRequirementProfileId: string | undefined,
  selectedRequirementProfileIds: string[],
  profile: JsonRecord,
) {
  const profileRef = path.resolve(profilePath);
  return {
    surface_kind: 'opl_runtime_environment_requirement_profile_identity',
    requirement_profile_ref: profileRef,
    requested_requirement_profile_id: requestedRequirementProfileId ?? null,
    selected_requirement_profile_ids: selectedRequirementProfileIds,
    profile_fingerprint: contentFingerprint({
      requirement_profile_ref: profileRef,
      requested_requirement_profile_id: requestedRequirementProfileId ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      profile,
    }),
  };
}

export function resolveBinary(binaryName: string): string | null {
  if (binaryName.includes(path.sep)) {
    try {
      fs.accessSync(binaryName, fs.constants.X_OK);
      return path.resolve(binaryName);
    } catch {
      return null;
    }
  }
  for (const searchRoot of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!searchRoot) {
      continue;
    }
    const candidate = path.join(searchRoot, binaryName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Continue scanning PATH.
    }
  }
  return null;
}

export function installedRPackages(rscriptPath: string, libraryPath?: string): Set<string> {
  const expression = libraryPath
    ? `if (dir.exists(${JSON.stringify(libraryPath)})) cat(paste(rownames(installed.packages(lib.loc = ${JSON.stringify(libraryPath)})), collapse="\\n"))`
    : 'cat(paste(rownames(installed.packages()), collapse="\\n"))';
  const result = spawnSync(rscriptPath, [
    '-e',
    expression,
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

export function baseOrRecommendedRPackages(rscriptPath: string): Set<string> {
  const result = spawnSync(rscriptPath, [
    '-e',
    'cat(paste(rownames(installed.packages(priority = c("base", "recommended"))), collapse="\\n"))',
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

function rCharacterVector(values: string[]) {
  return `c(${values.map((value) => JSON.stringify(value)).join(', ')})`;
}

function rPackageInstallSource(entry: JsonRecord): RPackageRequirement['install_source'] {
  const source = entry.source;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const sourceRecord = source as JsonRecord;
    if (sourceRecord.type === 'github' || sourceRecord.type === 'bioconductor') {
      return sourceRecord.type;
    }
  }
  return entry.install_source === 'github' || entry.install_source === 'bioconductor'
    ? entry.install_source
    : 'cran';
}

function rPackageGithubRepo(entry: JsonRecord): string | undefined {
  const source = entry.source;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const sourceRecord = source as JsonRecord;
    const repo = sourceRecord.repo ?? sourceRecord.repository;
    return typeof repo === 'string' && repo.trim() ? repo.trim() : undefined;
  }
  const repo = entry.github_repo ?? entry.repository;
  return typeof repo === 'string' && repo.trim() ? repo.trim() : undefined;
}

function rPackageRequirementsFromEntries(value: unknown): RPackageRequirement[] {
  return objects(value)
    .filter((entry) => entry.required !== false)
    .map((entry): RPackageRequirement | null => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!name) {
        return null;
      }
      const installSource = rPackageInstallSource(entry);
      return {
        name,
        install_source: installSource,
        ...(installSource === 'github' ? { github_repo: rPackageGithubRepo(entry) } : {}),
      };
    })
    .filter((entry): entry is RPackageRequirement => Boolean(entry));
}

function uniqueRPackageRequirements(values: RPackageRequirement[]): RPackageRequirement[] {
  const seen = new Set<string>();
  const result: RPackageRequirement[] = [];
  values.forEach((value) => {
    if (!seen.has(value.name)) {
      seen.add(value.name);
      result.push(value);
      return;
    }
    if (value.install_source !== 'cran') {
      const index = result.findIndex((entry) => entry.name === value.name);
      if (index >= 0) {
        result[index] = value;
      }
    }
  });
  return result;
}

function pythonPackageRequirementsFromEntries(value: unknown): PythonPackageRequirement[] {
  return objects(value)
    .filter((entry) => entry.required !== false)
    .map((entry): PythonPackageRequirement | null => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      return name ? { name } : null;
    })
    .filter((entry): entry is PythonPackageRequirement => Boolean(entry));
}

function uniquePythonPackageRequirements(values: PythonPackageRequirement[]): PythonPackageRequirement[] {
  const seen = new Set<string>();
  const result: PythonPackageRequirement[] = [];
  values.forEach((value) => {
    const key = normalizePythonPackageName(value.name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  });
  return result;
}

export function normalizePythonPackageName(value: string) {
  return value.trim().toLowerCase().replace(/[-_.]+/g, '-');
}

export function pythonExecutableInManagedEnv(environmentPath: string) {
  return path.join(environmentPath, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

export function installedPythonPackages(pythonPath: string): Set<string> {
  const result = spawnSync(pythonPath, [
    '-c',
    'import importlib.metadata as m; print("\\n".join(d.metadata["Name"] for d in m.distributions() if d.metadata["Name"]))',
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map(normalizePythonPackageName).filter(Boolean));
}

export function installPythonPackagesIntoManagedEnv(
  uvPath: string,
  pythonPath: string,
  environmentPath: string,
  packages: string[],
) {
  if (packages.length === 0) {
    return {
      status: 'not_required',
      installed: [],
      failed: [],
      managed_environment_path: environmentPath,
      verified_with: 'importlib.metadata.distributions() in managed Python environment',
      stderr: '',
    };
  }
  fs.mkdirSync(path.dirname(environmentPath), { recursive: true });
  const venvResult = spawnSync(uvPath, ['venv', environmentPath, '--python', pythonPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const managedPythonPath = pythonExecutableInManagedEnv(environmentPath);
  const installResult = venvResult.status === 0
    ? spawnSync(uvPath, ['pip', 'install', '--python', managedPythonPath, ...packages], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    : venvResult;
  const installed = fs.existsSync(managedPythonPath)
    ? installedPythonPackages(managedPythonPath)
    : new Set<string>();
  const failed = packages.filter((packageName) => !installed.has(normalizePythonPackageName(packageName)));
  return {
    status: installResult.status === 0 && failed.length === 0 ? 'installed' : 'failed',
    installed: packages.filter((packageName) => installed.has(normalizePythonPackageName(packageName))),
    failed,
    managed_environment_path: environmentPath,
    verified_with: 'importlib.metadata.distributions() in managed Python environment',
    stderr: `${venvResult.stderr.trim()}\n${installResult.stderr.trim()}`.trim(),
  };
}

export function installRPackagesIntoManagedLibrary(
  rscriptPath: string,
  libraryPath: string,
  requirements: RPackageRequirement[],
  packages: string[],
) {
  if (packages.length === 0) {
    return {
      status: 'not_required',
      installed: [],
      failed: [],
      managed_library_path: libraryPath,
      verified_with: 'installed.packages(lib.loc = managed_library_path)',
      stderr: '',
    };
  }
  const requirementsByName = new Map(requirements.map((entry) => [entry.name, entry]));
  const packagesToInstall = packages.map((packageName) => (
    requirementsByName.get(packageName) ?? { name: packageName, install_source: 'cran' as const }
  ));
  const cranPackages = packagesToInstall
    .filter((entry) => entry.install_source === 'cran')
    .map((entry) => entry.name);
  const githubPackages = packagesToInstall.filter((entry) => entry.install_source === 'github');
  const bioconductorPackages = packagesToInstall
    .filter((entry) => entry.install_source === 'bioconductor')
    .map((entry) => entry.name);
  fs.mkdirSync(libraryPath, { recursive: true });
  const expression = [
    `dir.create(${JSON.stringify(libraryPath)}, recursive = TRUE, showWarnings = FALSE)`,
    `.libPaths(c(${JSON.stringify(libraryPath)}, .libPaths()))`,
    cranPackages.length > 0
      ? `install.packages(${rCharacterVector(cranPackages)}, lib = ${JSON.stringify(libraryPath)}, repos = "https://cloud.r-project.org", quiet = TRUE)`
      : '',
    bioconductorPackages.length > 0
      ? [
        `if (!requireNamespace("BiocManager", quietly = TRUE)) install.packages("BiocManager", lib = ${JSON.stringify(libraryPath)}, repos = "https://cloud.r-project.org", quiet = TRUE)`,
        `BiocManager::install(${rCharacterVector(bioconductorPackages)}, lib = ${JSON.stringify(libraryPath)}, ask = FALSE, update = FALSE, force = TRUE, quiet = TRUE)`,
      ].join('; ')
      : '',
    ...githubPackages.map((entry) => {
      if (!entry.github_repo) {
        return `stop("missing github repo for R package ${entry.name}")`;
      }
      return [
        `if (!requireNamespace("remotes", quietly = TRUE)) install.packages("remotes", lib = ${JSON.stringify(libraryPath)}, repos = "https://cloud.r-project.org", quiet = TRUE)`,
        `remotes::install_github(${JSON.stringify(entry.github_repo)}, lib = ${JSON.stringify(libraryPath)}, dependencies = TRUE, upgrade = "never", quiet = TRUE)`,
      ].join('; ');
    }),
  ].filter(Boolean).join('; ');
  const result = spawnSync(rscriptPath, ['-e', expression], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      R_REMOTES_NO_ERRORS_FROM_WARNINGS: 'true',
    },
  });
  const installed = installedRPackages(rscriptPath, libraryPath);
  const failed = packages.filter((packageName) => !installed.has(packageName));
  return {
    status: result.status === 0 && failed.length === 0 ? 'installed' : 'failed',
    installed: packages.filter((packageName) => installed.has(packageName)),
    failed,
    managed_library_path: libraryPath,
    verified_with: 'installed.packages(lib.loc = managed_library_path)',
    stderr: result.stderr.trim(),
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
}

export function readPrepareProfile(profilePath: string, requirementProfileId?: string) {
  const profile = readJsonPayloadFile(path.resolve(profilePath)) as JsonRecord;
  const profileEntries = objects(profile.profiles);
  const selectedProfiles = requirementProfileId
    ? profileEntries.filter((entry) => entry.profile_id === requirementProfileId)
    : profileEntries;
  if (requirementProfileId && selectedProfiles.length === 0) {
    throw new Error(
      `runtime env prepare could not find requirement profile id ${JSON.stringify(requirementProfileId)} in ${profilePath}`,
    );
  }
  const selectedRequirementProfileIds = selectedProfiles
    .map((entry) => (typeof entry.profile_id === 'string' ? entry.profile_id.trim() : ''))
    .filter(Boolean);
  const runtimeBinaries = uniqueStrings(selectedProfiles.flatMap((entry) => (
    objects(entry.runtime_binaries)
      .filter((binary) => binary.required !== false)
      .map((binary) => (typeof binary.name === 'string' ? binary.name.trim() : ''))
      .filter(Boolean)
  )));
  const requiredRPackages = uniqueStrings(selectedProfiles.flatMap((entry) => {
    const languagePackages = entry.language_packages as JsonRecord | undefined;
    return rPackageRequirementsFromEntries(languagePackages?.r).map((requirement) => requirement.name);
  }));
  const requiredRPackageRequirements = uniqueRPackageRequirements(selectedProfiles.flatMap((entry) => {
    const languagePackages = entry.language_packages as JsonRecord | undefined;
    return rPackageRequirementsFromEntries(languagePackages?.r);
  }));
  const requiredPythonPackageRequirements = uniquePythonPackageRequirements(selectedProfiles.flatMap((entry) => {
    const languagePackages = entry.language_packages as JsonRecord | undefined;
    return pythonPackageRequirementsFromEntries(languagePackages?.python);
  }));
  const requiredPythonPackages = requiredPythonPackageRequirements.map((requirement) => requirement.name);
  return {
    profile,
    selected: selectedProfiles.length === 1 ? selectedProfiles[0] : {},
    selectedRequirementProfileIds,
    runtimeBinaries,
    requiredRPackages,
    requiredRPackageRequirements,
    requiredPythonPackages,
    requiredPythonPackageRequirements,
  };
}

export function runtimeEnvironmentConsumerBoundary() {
  return {
    surface_kind: 'opl_runtime_environment_consumer_boundary',
    consumer_role: 'consume_opl_prepared_run_context_only',
    host_environment_fallback_allowed: false,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_schedule_domain_stage: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  };
}

export function runContextTargetMismatchFields(
  target: { domain_id: string; profile_id: string; platform_id: string },
  runContext: JsonRecord,
) {
  return (['domain_id', 'profile_id', 'platform_id'] as const).filter((field) => (
    runContext[field] !== target[field]
  ));
}

export function buildRunContextConsumerPreflight(
  status: 'bound' | 'missing_run_context' | 'artifact_root_not_supplied' | 'target_mismatch',
  targetMismatchFields: string[] = [],
) {
  const canConsumeRunContext = status === 'bound';
  return {
    surface_kind: 'opl_runtime_environment_run_context_consumer_preflight',
    status,
    can_consume_run_context: canConsumeRunContext,
    fail_closed: true,
    target_mismatch_fields: targetMismatchFields,
    route_hint: canConsumeRunContext ? null : 'opl_runtime_env_prepare',
    host_environment_fallback_allowed: false,
    can_schedule_domain_stage: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  };
}
