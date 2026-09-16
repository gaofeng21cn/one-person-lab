import { runEnvironmentProcess, type EnvironmentOperation } from '../runtime-environment-process.ts';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import type { JsonRecord, PythonPackageRequirement, RPackageRequirement } from './contract.ts';
import { contentFingerprint, objects, runtimeEnvironmentStateRoot, shortDigest } from './target-state.ts';
import { fileIdentity } from '../runtime-environment-execution.ts';
import { acquirePreparationLock } from './prepared-cache.ts';

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

export async function installedRPackages(rscriptPath: string, libraryPath?: string, operation?: EnvironmentOperation): Promise<Set<string>> {
  const expression = libraryPath
    ? `if (dir.exists(${JSON.stringify(libraryPath)})) cat(paste(rownames(installed.packages(lib.loc = ${JSON.stringify(libraryPath)})), collapse="\\n"))`
    : 'cat(paste(rownames(installed.packages()), collapse="\\n"))';
  const result = await runEnvironmentProcess(rscriptPath, [
    '--vanilla', '-e',
    expression,
  ], {
    operation, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

export async function baseOrRecommendedRPackages(rscriptPath: string, operation?: EnvironmentOperation): Promise<Set<string>> {
  const result = await runEnvironmentProcess(rscriptPath, [
    '--vanilla', '-e',
    'cat(paste(rownames(installed.packages(priority = c("base", "recommended"))), collapse="\\n"))',
  ], {
    operation, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

export async function unsatisfiedRRequirements(rscriptPath: string, libraryPath: string,
  requirements: RPackageRequirement[], operation?: EnvironmentOperation) {
  const checked = requirements.filter((entry) => entry.version || entry.minimum_version || entry.required_exports?.length);
  if (!checked.length) return [];
  const checks = checked.map((entry) => {
    const name = JSON.stringify(entry.name);
    const assertions = [
      `requireNamespace(${name}, quietly=TRUE)`,
      ...(entry.version ? [`as.character(packageVersion(${name}, lib.loc=${JSON.stringify(libraryPath)})) == ${JSON.stringify(entry.version)}`] : []),
      ...(entry.minimum_version ? [`packageVersion(${name}, lib.loc=${JSON.stringify(libraryPath)}) >= package_version(${JSON.stringify(entry.minimum_version)})`] : []),
      ...(entry.required_exports?.length ? [`all(${rCharacterVector(entry.required_exports)} %in% getNamespaceExports(${name}))`] : []),
    ];
    return `if (!tryCatch(${assertions.join(' && ')}, error=function(e) FALSE)) cat(${name}, "\\n", sep="")`;
  });
  const result = await runEnvironmentProcess(rscriptPath, ['--vanilla', '-e',
    `.libPaths(c(${JSON.stringify(libraryPath)}, .Library)); ${checks.join('; ')}`,
  ], { operation });
  if (result.status !== 0) throw new Error(`R dependency validation failed: ${result.stderr}`);
  return result.stdout.trim().split('\n').filter(Boolean);
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
        ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
        ...(typeof entry.minimum_version === 'string' ? { minimum_version: entry.minimum_version } : {}),
        ...(Array.isArray(entry.required_exports) ? { required_exports: [...new Set(entry.required_exports as string[])].sort() } : {}),
        ...(installSource === 'github' ? { github_repo: rPackageGithubRepo(entry) } : {}),
      };
    })
    .filter((entry): entry is RPackageRequirement => Boolean(entry));
}

function uniqueRPackageRequirements(values: RPackageRequirement[]): RPackageRequirement[] {
  const result = new Map<string, RPackageRequirement>();
  for (const value of values) {
    const previous = result.get(value.name);
    if (previous && contentFingerprint(previous) !== contentFingerprint(value)) {
      throw new Error(`Conflicting R dependency declarations for ${value.name}; select compatible sources and versions.`);
    }
    result.set(value.name, value);
  }
  return [...result.values()];
}

function pythonPackageRequirementsFromEntries(value: unknown): PythonPackageRequirement[] {
  return objects(value)
    .filter((entry) => entry.required !== false)
    .map((entry): PythonPackageRequirement | null => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const version = typeof entry.version === 'string' ? entry.version.trim() : '';
      return name ? { name: version ? `${name}${/^[<>=~!]/.test(version) ? '' : '=='}${version}` : name } : null;
    })
    .filter((entry): entry is PythonPackageRequirement => Boolean(entry));
}

function uniquePythonPackageRequirements(values: PythonPackageRequirement[]): PythonPackageRequirement[] {
  const seen = new Set<string>();
  const result: PythonPackageRequirement[] = [];
  values.forEach((value) => {
    const key = value.name;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  });
  return result;
}

export function normalizePythonPackageName(value: string) {
  return value.trim().split(/[<>=~!;\[]/, 1)[0].toLowerCase().replace(/[-_.]+/g, '-');
}

export function pythonExecutableInManagedEnv(environmentPath: string) {
  return path.join(environmentPath, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

export async function installedPythonPackages(pythonPath: string, operation?: EnvironmentOperation): Promise<Set<string>> {
  const result = await runEnvironmentProcess(pythonPath, [
    '-c',
    'import importlib.metadata as m; print("\\n".join(d.metadata["Name"] for d in m.distributions() if d.metadata["Name"]))',
  ], {
    operation, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map(normalizePythonPackageName).filter(Boolean));
}

export async function installPythonPackagesIntoManagedEnv(
  uvPath: string,
  pythonPath: string,
  environmentPath: string,
  packages: string[],
  operation?: EnvironmentOperation,
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
  const venvResult = fs.existsSync(pythonExecutableInManagedEnv(environmentPath))
    ? { status: 0, stderr: '' }
    : await runEnvironmentProcess(uvPath, ['venv', environmentPath, '--python', pythonPath], {
    operation, encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const managedPythonPath = pythonExecutableInManagedEnv(environmentPath);
  const installResult = venvResult.status === 0
    ? await runEnvironmentProcess(uvPath, ['pip', 'install', '--python', managedPythonPath, ...packages], {
      operation, encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    : venvResult;
  const installed = fs.existsSync(managedPythonPath)
    ? await installedPythonPackages(managedPythonPath, operation)
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

export async function installRPackagesIntoManagedLibrary(
  rscriptPath: string,
  libraryPath: string,
  requirements: RPackageRequirement[],
  packages: string[],
  operation?: EnvironmentOperation,
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
  const refs = packages.map((name) => {
    const requirement = requirementsByName.get(name);
    if (requirement?.install_source === 'github') {
      if (!requirement.github_repo) throw new Error(`Missing GitHub source for ${name}.`);
      return requirement.github_repo;
    }
    const ref = requirement?.install_source === 'bioconductor' ? `bioc::${name}` : name;
    return requirement?.version ? `${ref}@${requirement.version}` : ref;
  });
  const stateRoot = runtimeEnvironmentStateRoot();
  const bootstrap = path.join(stateRoot, 'tools', 'renv', shortDigest(fileIdentity(rscriptPath)));
  fs.mkdirSync(libraryPath, { recursive: true });
  fs.mkdirSync(bootstrap, { recursive: true });
  if (!fs.existsSync(path.join(bootstrap, 'renv', 'DESCRIPTION'))) {
    const release = await acquirePreparationLock(bootstrap, operation);
    try {
      if (!fs.existsSync(path.join(bootstrap, 'renv', 'DESCRIPTION'))) {
        const setup = await runEnvironmentProcess(rscriptPath, ['--vanilla', '-e',
          `install.packages("renv", lib=${JSON.stringify(bootstrap)}, repos="https://cloud.r-project.org", quiet=TRUE)`,
        ], { operation, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        if (setup.status !== 0) return { status: 'failed', installed: [], failed: packages,
          managed_library_path: libraryPath, verified_with: 'renv bootstrap', stderr: setup.stderr };
      }
    } finally { release(); }
  }
  const expression = [
    `.libPaths(c(${JSON.stringify(bootstrap)}, .libPaths()))`,
    `options(repos=c(CRAN="https://cloud.r-project.org"))`,
    `renv::install(${rCharacterVector(refs)}, library=${JSON.stringify(libraryPath)}, project=${JSON.stringify(path.dirname(libraryPath))}, prompt=FALSE)`,
  ].join('; ');
  const result = await runEnvironmentProcess(rscriptPath, ['--vanilla', '-e', expression], {
    operation, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env,
      RENV_PATHS_ROOT: path.join(stateRoot, 'cache', 'renv-state'),
      RENV_PATHS_CACHE: path.join(stateRoot, 'cache', 'renv'),
      RENV_CONFIG_AUTO_SNAPSHOT: 'FALSE', RENV_CONFIG_PAK_ENABLED: 'FALSE',
    },
  });
  const installed = await installedRPackages(rscriptPath, libraryPath, operation);
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

export function readPrepareProfile(profilePath: string, requirementProfileId?: string, requirementProfileIds?: string[]) {
  const profile = readJsonPayloadFile(path.resolve(profilePath)) as JsonRecord;
  const profileEntries = objects(profile.profiles);
  const requested = [...new Set(requirementProfileIds ?? (requirementProfileId ? [requirementProfileId] : []))].sort();
  for (const id of requested) {
    if (!profileEntries.some((entry) => entry.profile_id === id)) throw new Error(`runtime env prepare could not find requirement profile id ${JSON.stringify(id)} in ${profilePath}`);
  }
  const selectedProfiles = requested.length ? profileEntries.filter((entry) => requested.includes(String(entry.profile_id))) : profileEntries;
  const selectedRequirementProfileIds = selectedProfiles
    .map((entry) => (typeof entry.profile_id === 'string' ? entry.profile_id.trim() : ''))
    .filter(Boolean).sort();
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
