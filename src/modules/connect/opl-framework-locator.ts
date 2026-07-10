import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../../kernel/family-workspace-root.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

type FrameworkLocatorSource =
  | 'OPL_FRAMEWORK_ROOT'
  | 'OPL_CLI_BIN'
  | 'OPL_BIN'
  | 'PATH:opl'
  | 'current_cli_entry'
  | 'sibling_checkout';

type FrameworkLocatorCandidate = {
  source: FrameworkLocatorSource;
  kind: 'root' | 'bin';
  value: string | null;
  required: boolean;
};

type FrameworkLocatorResolution = {
  source: FrameworkLocatorSource;
  root: string;
  bin: string;
  source_dir: string;
  contracts_dir: string;
  state_dir: string;
  modules_root: string;
};

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function currentSourceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function findOnPath(commandName: string) {
  const pathValue = normalizeOptionalString(process.env.PATH);
  if (!pathValue) {
    return null;
  }

  for (const searchPath of pathValue.split(path.delimiter)) {
    if (!searchPath) {
      continue;
    }

    const candidate = path.join(searchPath, commandName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function resolveRootFromBin(binPath: string) {
  const realBinPath = fs.realpathSync.native(path.resolve(binPath));
  return path.resolve(path.dirname(realBinPath), '..');
}

function hasFrameworkShape(rootPath: string) {
  return (
    fs.existsSync(path.join(rootPath, 'contracts', 'opl-framework', 'public-surface-index.json'))
    && fs.existsSync(path.join(rootPath, 'bin', 'opl'))
    && (
      fs.existsSync(path.join(rootPath, 'src', 'entrypoints', 'cli.ts'))
      || fs.existsSync(path.join(rootPath, 'dist', 'entrypoints', 'cli.js'))
    )
  );
}

function normalizeFrameworkRoot(rootPath: string) {
  return fs.realpathSync.native(path.resolve(rootPath));
}

function buildResolution(source: FrameworkLocatorSource, rootPath: string): FrameworkLocatorResolution | null {
  let root: string;
  try {
    root = normalizeFrameworkRoot(rootPath);
  } catch {
    return null;
  }

  if (!hasFrameworkShape(root)) {
    return null;
  }

  const statePaths = resolveOplStatePaths();
  return {
    source,
    root,
    bin: path.join(root, 'bin', 'opl'),
    source_dir: fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : path.join(root, 'dist'),
    contracts_dir: path.join(root, 'contracts', 'opl-framework'),
    state_dir: statePaths.state_dir,
    modules_root: path.resolve(
      normalizeOptionalString(process.env.OPL_MODULES_ROOT) ?? path.join(statePaths.state_dir, 'modules'),
    ),
  };
}

function candidateValue(candidate: FrameworkLocatorCandidate) {
  if (candidate.kind === 'root') {
    return candidate.value ? path.resolve(candidate.value) : null;
  }

  if (!candidate.value) {
    return null;
  }

  try {
    return resolveRootFromBin(candidate.value);
  } catch {
    return null;
  }
}

function buildCandidateList(): FrameworkLocatorCandidate[] {
  const currentRoot = currentSourceRoot();
  return [
    {
      source: 'OPL_FRAMEWORK_ROOT',
      kind: 'root',
      value: normalizeOptionalString(process.env.OPL_FRAMEWORK_ROOT),
      required: Object.hasOwn(process.env, 'OPL_FRAMEWORK_ROOT'),
    },
    {
      source: 'OPL_CLI_BIN',
      kind: 'bin',
      value: normalizeOptionalString(process.env.OPL_CLI_BIN),
      required: Object.hasOwn(process.env, 'OPL_CLI_BIN'),
    },
    {
      source: 'OPL_BIN',
      kind: 'bin',
      value: normalizeOptionalString(process.env.OPL_BIN),
      required: Object.hasOwn(process.env, 'OPL_BIN'),
    },
    {
      source: 'PATH:opl',
      kind: 'bin',
      value: findOnPath('opl'),
      required: false,
    },
    {
      source: 'current_cli_entry',
      kind: 'root',
      value: currentRoot,
      required: true,
    },
    {
      source: 'sibling_checkout',
      kind: 'root',
      value: path.join(resolveDefaultFamilyWorkspaceRoot({ repoRootHint: currentRoot }), 'one-person-lab'),
      required: false,
    },
  ];
}

function buildResolutionOrder(candidates: FrameworkLocatorCandidate[]) {
  return candidates.map((candidate) => ({
    source: candidate.source,
    required: candidate.required,
    configured: candidate.value !== null,
  }));
}

function failInvalidRequiredCandidate(candidate: FrameworkLocatorCandidate) {
  throw new FrameworkContractError(
    'framework_locator_invalid_root',
    `${candidate.source} does not point to an OPL Framework root.`,
    {
      source: candidate.source,
      candidate: candidate.value,
    },
  );
}

function resolveFramework(candidates: FrameworkLocatorCandidate[]) {
  for (const candidate of candidates) {
    const rootPath = candidateValue(candidate);
    if (!rootPath) {
      if (candidate.required) {
        failInvalidRequiredCandidate(candidate);
      }
      continue;
    }

    const resolution = buildResolution(candidate.source, rootPath);
    if (resolution) {
      return resolution;
    }

    if (candidate.required) {
      failInvalidRequiredCandidate(candidate);
    }
  }

  throw new FrameworkContractError(
    'framework_locator_not_found',
    'Unable to locate an OPL Framework root for this agent runtime dependency.',
    {
      checked_sources: candidates.map((candidate) => candidate.source),
    },
  );
}

function buildAgentContract() {
  return {
    agent_runtime_dependency: 'external_opl_framework',
    embeds_opl_runtime: false,
    app_required: false,
    app_role: 'optional_projection_consumer',
    recommended_agent_shape: [
      'independent_repo_or_package',
      'declares_opl_compatible_contract',
      'uses_opl_framework_locator_before_framework_runtime_calls',
      'may_register_projection_with_one_person_lab_app',
      'may_expose_direct_skill_or_cli_entry_without_app',
    ],
  };
}

export function buildOplFrameworkLocator() {
  const candidates = buildCandidateList();
  const resolved = resolveFramework(candidates);

  return {
    version: 'g2',
    framework_locator: {
      surface_id: 'opl_framework_locator',
      framework: 'OPL Framework',
      status: 'resolved',
      resolved,
      resolution_order: buildResolutionOrder(candidates),
      environment_keys: [
        'OPL_FRAMEWORK_ROOT',
        'OPL_CLI_BIN',
        'OPL_BIN',
        'OPL_STATE_DIR',
        'OPL_MODULES_ROOT',
      ],
      agent_contract: buildAgentContract(),
      app_boundary: {
        one_person_lab_app_required: false,
        one_person_lab_app_role: 'optional_frontend_workbench_and_projection_consumer',
      },
      platform: {
        os: os.platform(),
        arch: os.arch(),
      },
    },
  };
}
