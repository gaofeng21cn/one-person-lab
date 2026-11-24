import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import packDoctorSchema from
  '../../../contracts/opl-framework/pack-doctor.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

type JsonRecord = Record<string, unknown>;

type CliCheckSpec = {
  name: string;
  required?: boolean;
  version_args?: string[];
  purpose?: string;
  install_hint?: string;
};

type PythonModuleCheckSpec = {
  module: string;
  package_name?: string;
  required?: boolean;
  purpose?: string;
  install_hint?: string;
};

type NodePackageCheckSpec = {
  name: string;
  required?: boolean;
  purpose?: string;
  install_hint?: string;
};

export type PackDoctorSpec = {
  surface_kind: 'opl_pack_doctor_spec';
  schema_version: 1;
  pack_id: string;
  owner: string;
  provisioning_owner?: string;
  automatic_install_allowed?: false;
  extra_paths?: string[];
  cli_checks?: CliCheckSpec[];
  python_module_checks?: PythonModuleCheckSpec[];
  node_package_checks?: NodePackageCheckSpec[];
};

export type RunPackDoctorInput = {
  repoRoot?: string;
  configRef?: string;
};

export type PackDoctorCheckResult = {
  kind: 'cli' | 'python_module' | 'node_package';
  name: string;
  package_name?: string;
  required: boolean;
  status: 'ok' | 'missing' | 'error';
  path: string | null;
  detail: string | null;
  purpose: string | null;
  install_hint: string | null;
};

const PACK_DOCTOR_SCHEMA_REF = 'contracts/opl-framework/pack-doctor.schema.json';
const DEFAULT_CONFIG_REF = 'contracts/pack_doctor.json';
const DEFAULT_EXTRA_BIN_PATHS = ['/opt/homebrew/bin', '/usr/local/bin'];

function shapeError(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    surface: 'opl_pack_doctor',
    ...details,
  });
}

function normalizeRelativeRef(rawRef: string, field: string): string {
  const trimmed = rawRef.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw shapeError(`${field} must be a non-empty relative path.`, { field, ref: rawRef });
  }
  const posixParts = trimmed.replaceAll('\\', '/').split('/');
  if (posixParts.some((part) => !part || part === '.' || part === '..')) {
    throw shapeError(`${field} must stay cleanly inside the repository.`, { field, ref: rawRef });
  }
  return posixParts.join('/');
}

function resolveContainedFile(repoRoot: string, relativeRef: string, field: string): string {
  const realRoot = fs.realpathSync(repoRoot);
  const candidate = path.resolve(realRoot, relativeRef);
  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
  if (!candidate.startsWith(rootWithSep)) {
    throw shapeError(`${field} escapes repoRoot.`, { field, ref: relativeRef });
  }
  if (!fs.existsSync(candidate)) {
    throw shapeError(`Pack doctor spec file does not exist: ${relativeRef}.`, { field, ref: relativeRef });
  }
  const realCandidate = fs.realpathSync(candidate);
  if (!realCandidate.startsWith(rootWithSep) || !fs.statSync(realCandidate).isFile()) {
    throw shapeError(`${field} must resolve to a regular file inside repoRoot.`, { field, ref: relativeRef });
  }
  return realCandidate;
}

function findExecutable(name: string, extraPaths: string[]): string | null {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    return null;
  }
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidates = [...new Set([...pathEntries, ...extraPaths])];
  for (const dir of candidates) {
    const fullPath = path.join(dir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        continue;
      }
      fs.accessSync(fullPath, fs.constants.X_OK);
      return fullPath;
    } catch {
      // Probe next candidate directory.
    }
  }
  return null;
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function probeCliCheck(spec: CliCheckSpec, extraPaths: string[]): PackDoctorCheckResult {
  const required = spec.required !== false;
  const purpose = spec.purpose ?? null;
  const installHint = spec.install_hint ?? null;
  if (spec.name.includes('/') || spec.name.includes('\\') || spec.name.includes('\0')) {
    return {
      kind: 'cli',
      name: spec.name,
      required,
      status: 'error',
      path: null,
      detail: 'cli_checks[].name must be a bare command name without path separators.',
      purpose,
      install_hint: installHint,
    };
  }
  const executable = findExecutable(spec.name, extraPaths);
  if (!executable) {
    return {
      kind: 'cli',
      name: spec.name,
      required,
      status: 'missing',
      path: null,
      detail: `${spec.name} was not found in PATH or extra_paths.`,
      purpose,
      install_hint: installHint,
    };
  }
  const versionArgs = spec.version_args ?? ['--version'];
  if (versionArgs.length === 0) {
    return {
      kind: 'cli',
      name: spec.name,
      required,
      status: 'ok',
      path: executable,
      detail: 'executable_ready',
      purpose,
      install_hint: installHint,
    };
  }
  const result = spawnSync(executable, versionArgs, {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    return {
      kind: 'cli',
      name: spec.name,
      required,
      status: 'error',
      path: executable,
      detail: result.error.message,
      purpose,
      install_hint: installHint,
    };
  }
  const outputLine = firstNonEmptyLine(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0) {
    return {
      kind: 'cli',
      name: spec.name,
      required,
      status: 'error',
      path: executable,
      detail: outputLine ?? `Exited with status ${String(result.status)}.`,
      purpose,
      install_hint: installHint,
    };
  }
  return {
    kind: 'cli',
    name: spec.name,
    required,
    status: 'ok',
    path: executable,
    detail: outputLine ?? 'executable_ready',
    purpose,
    install_hint: installHint,
  };
}

function resolvePythonExecutable(repoRoot: string, extraPaths: string[]): string | null {
  const configured =
    process.env.OPL_PACK_DOCTOR_PYTHON?.trim()
    || process.env.REDCUBE_TEST_PYTHON?.trim();
  if (configured) {
    try {
      fs.accessSync(configured, fs.constants.X_OK);
      return configured;
    } catch {
      return null;
    }
  }
  for (const venvCandidate of [
    path.join(repoRoot, '.venv', 'bin', 'python'),
    path.join(repoRoot, '.venv', 'bin', 'python3'),
  ]) {
    try {
      if (fs.statSync(venvCandidate).isFile()) {
        fs.accessSync(venvCandidate, fs.constants.X_OK);
        return venvCandidate;
      }
    } catch {
      // Continue to PATH lookup.
    }
  }
  return findExecutable('python3', extraPaths) ?? findExecutable('python', extraPaths);
}

function probePythonModules(
  specs: PythonModuleCheckSpec[],
  repoRoot: string,
  extraPaths: string[],
): PackDoctorCheckResult[] {
  if (specs.length === 0) {
    return [];
  }
  const pythonBin = resolvePythonExecutable(repoRoot, extraPaths);
  if (!pythonBin) {
    return specs.map((spec) => ({
      kind: 'python_module',
      name: spec.module,
      package_name: spec.package_name ?? spec.module,
      required: spec.required !== false,
      status: 'missing',
      path: null,
      detail: 'python3 executable is unavailable to inspect Python modules.',
      purpose: spec.purpose ?? null,
      install_hint: spec.install_hint ?? null,
    }));
  }
  const script =
    'import importlib.util, json, sys; '
    + 'print(json.dumps({m: (importlib.util.find_spec(m) is not None) for m in sys.argv[1:]}))';
  const result = spawnSync(pythonBin, ['-c', script, ...specs.map((spec) => spec.module)], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let foundMap: Record<string, unknown> = {};
  let probeError: string | null = null;
  if (result.error) {
    probeError = result.error.message;
  } else if (result.status !== 0) {
    probeError = firstNonEmptyLine(`${result.stderr ?? ''}\n${result.stdout ?? ''}`)
      ?? `Python module probe exited with status ${String(result.status)}.`;
  } else {
    try {
      const parsed = JSON.parse((result.stdout ?? '').trim()) as unknown;
      if (isRecord(parsed)) {
        foundMap = parsed;
      } else {
        probeError = 'Python module probe did not return a JSON object.';
      }
    } catch (error) {
      probeError = error instanceof Error ? error.message : String(error);
    }
  }

  return specs.map((spec) => {
    const required = spec.required !== false;
    if (probeError) {
      return {
        kind: 'python_module',
        name: spec.module,
        package_name: spec.package_name ?? spec.module,
        required,
        status: 'error',
        path: pythonBin,
        detail: probeError,
        purpose: spec.purpose ?? null,
        install_hint: spec.install_hint ?? null,
      };
    }
    const available = foundMap[spec.module] === true;
    return {
      kind: 'python_module',
      name: spec.module,
      package_name: spec.package_name ?? spec.module,
      required,
      status: available ? 'ok' : 'missing',
      path: pythonBin,
      detail: available ? 'module_spec_found' : `Python module '${spec.module}' not found.`,
      purpose: spec.purpose ?? null,
      install_hint: spec.install_hint ?? null,
    };
  });
}

function probeNodePackage(spec: NodePackageCheckSpec, repoRoot: string): PackDoctorCheckResult {
  const required = spec.required !== false;
  const purpose = spec.purpose ?? null;
  const installHint = spec.install_hint ?? null;
  const sharedRoots = [
    process.env.OPL_SHARED_NODE_MODULES?.trim(),
    path.join(repoRoot, 'node_modules'),
  ].filter((entry): entry is string => Boolean(entry));

  const requireBases = [
    path.join(repoRoot, 'package.json'),
    ...sharedRoots.map((nmDir) => path.join(path.dirname(nmDir), 'package.json')),
  ];

  for (const base of requireBases) {
    try {
      const req = createRequire(base);
      try {
        const resolvedPkg = req.resolve(`${spec.name}/package.json`);
        return {
          kind: 'node_package',
          name: spec.name,
          required,
          status: 'ok',
          path: path.dirname(resolvedPkg),
          detail: 'package_resolved',
          purpose,
          install_hint: installHint,
        };
      } catch {
        const resolvedEntry = req.resolve(spec.name);
        return {
          kind: 'node_package',
          name: spec.name,
          required,
          status: 'ok',
          path: resolvedEntry,
          detail: 'package_resolved',
          purpose,
          install_hint: installHint,
        };
      }
    } catch {
      // Fall back to direct node_modules directory check.
    }
  }

  for (const nmDir of sharedRoots) {
    const pkgDir = path.join(nmDir, spec.name);
    if (fs.existsSync(pkgDir)) {
      return {
        kind: 'node_package',
        name: spec.name,
        required,
        status: 'ok',
        path: pkgDir,
        detail: 'package_dir_found',
        purpose,
        install_hint: installHint,
      };
    }
  }

  return {
    kind: 'node_package',
    name: spec.name,
    required,
    status: 'missing',
    path: null,
    detail: `Node package '${spec.name}' was not resolved in repoRoot or OPL_SHARED_NODE_MODULES.`,
    purpose,
    install_hint: installHint,
  };
}

/** Probe declared CLI tools, Python modules, and Node packages for a pack without executing repairs. */
export function runPackDoctor(input: RunPackDoctorInput = {}) {
  const requestedRoot = path.resolve(input.repoRoot?.trim() || process.cwd());
  if (!fs.existsSync(requestedRoot) || !fs.statSync(requestedRoot).isDirectory()) {
    throw shapeError(`Repository root is not an existing directory: ${requestedRoot}.`, {
      repo_root: requestedRoot,
    });
  }
  const repoRoot = fs.realpathSync(requestedRoot);
  const configRef = normalizeRelativeRef(input.configRef ?? DEFAULT_CONFIG_REF, 'config');
  const configFile = resolveContainedFile(repoRoot, configRef, 'config');
  const rawSpec = parseJsonText(fs.readFileSync(configFile, 'utf8'));
  if (isRecord(rawSpec) && rawSpec.automatic_install_allowed === true) {
    throw shapeError('automatic_install_allowed must be false for read-only pack doctor specs.', {
      config_ref: configRef,
    });
  }
  assertJsonSchemaPayload(
    {
      schemaId: packDoctorSchema.$id,
      schema: packDoctorSchema,
      sourceRef: PACK_DOCTOR_SCHEMA_REF,
    },
    rawSpec,
  );
  const spec = rawSpec as PackDoctorSpec;

  const extraPaths = [...new Set([...(spec.extra_paths ?? []), ...DEFAULT_EXTRA_BIN_PATHS])];
  const cliResults = (spec.cli_checks ?? []).map((entry) => probeCliCheck(entry, extraPaths));
  const pythonResults = probePythonModules(spec.python_module_checks ?? [], repoRoot, extraPaths);
  const nodeResults = (spec.node_package_checks ?? []).map((entry) => probeNodePackage(entry, repoRoot));
  const checks = [...cliResults, ...pythonResults, ...nodeResults];

  let okCount = 0;
  let missingCount = 0;
  let errorCount = 0;
  let requiredMissing = 0;
  let requiredError = 0;
  for (const check of checks) {
    if (check.status === 'ok') {
      okCount += 1;
    } else if (check.status === 'missing') {
      missingCount += 1;
      if (check.required) {
        requiredMissing += 1;
      }
    } else {
      errorCount += 1;
      if (check.required) {
        requiredError += 1;
      }
    }
  }

  return {
    version: 'g2',
    pack_doctor: {
      surface_kind: 'opl_pack_doctor_report',
      schema_version: 1,
      status: requiredMissing > 0 || requiredError > 0 ? 'degraded' : 'ok',
      repo_root: repoRoot,
      config_ref: configRef,
      pack_id: spec.pack_id,
      owner: spec.owner,
      summary: {
        total: checks.length,
        ok: okCount,
        missing: missingCount,
        error: errorCount,
        required_missing: requiredMissing,
      },
      checks,
      dependency_install: {
        automatic_install_allowed: false,
        provisioning_owner: spec.provisioning_owner ?? 'opl_connect_or_operator',
      },
      authority_boundary: {
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
        owner: 'OPL Pack',
        surface: 'declarative_pack_dependency_doctor',
      },
    },
  };
}
