#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const familyRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT
  ? path.resolve(process.env.OPL_FAMILY_WORKSPACE_ROOT)
  : defaultFamilyWorkspaceRoot();
const requireRealWorkspaces = process.argv.includes('--require-real-workspaces');

const domains = [
  {
    domain_id: 'medautoscience',
    label: 'MAS',
    repo_name: 'med-autoscience',
  },
  {
    domain_id: 'medautogrant',
    label: 'MAG',
    repo_name: 'med-autogrant',
  },
];

const artifactIndexer = resolveHelper('opl-artifact-indexer');
const stateIndexer = resolveHelper('opl-state-indexer');
const output = {
  surface_kind: 'opl_native_helper_family_index_smoke',
  version: 'v1',
  family_root: familyRoot,
  helper_resolution: {
    artifact_indexer: sanitizeResolution(artifactIndexer),
    state_indexer: sanitizeResolution(stateIndexer),
  },
  domains: {},
  source_of_truth_rule:
    'OPL indexes MAS/MAG workspace surfaces as a smoke check and must dereference domain-owned truth before acting.',
};

let hasFailure = false;
for (const domain of domains) {
  const workspacePath = path.join(familyRoot, domain.repo_name);
  output.domains[domain.domain_id] = indexDomain(domain, workspacePath);
  if (output.domains[domain.domain_id].status !== 'indexed') {
    hasFailure = true;
  }
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (requireRealWorkspaces && hasFailure) {
  process.exit(1);
}

function indexDomain(domain, workspacePath) {
  if (!fs.existsSync(workspacePath)) {
    return {
      domain_id: domain.domain_id,
      label: domain.label,
      status: 'missing_workspace',
      workspace_path: workspacePath,
      artifact_manifest: null,
      state_index: null,
      errors: [{ code: 'workspace_missing', message: `${domain.repo_name} workspace not found` }],
    };
  }
  if (!artifactIndexer.path || !stateIndexer.path) {
    return {
      domain_id: domain.domain_id,
      label: domain.label,
      status: 'missing_helper',
      workspace_path: workspacePath,
      artifact_manifest: null,
      state_index: null,
      errors: [{ code: 'native_helper_missing', message: 'native artifact/state indexer helper is unavailable' }],
    };
  }

  const artifact = invokeHelper(artifactIndexer.path, 'opl-artifact-indexer', {
    request_id: `family-smoke-${domain.domain_id}-artifact`,
    workspace_root: workspacePath,
    artifact_roots: [
      path.join(workspacePath, 'contracts'),
      path.join(workspacePath, 'docs'),
      path.join(workspacePath, 'artifacts'),
      path.join(workspacePath, 'manuscript'),
    ],
    artifact_extensions: ['json', 'md', 'docx', 'pptx', 'xlsx', 'pdf'],
    max_depth: 6,
  });
  const state = invokeHelper(stateIndexer.path, 'opl-state-indexer', {
    request_id: `family-smoke-${domain.domain_id}-state`,
    workspace_root: workspacePath,
    max_depth: 4,
  });
  const errors = [...artifact.errors, ...state.errors];

  return {
    domain_id: domain.domain_id,
    label: domain.label,
    status: artifact.ok && state.ok ? 'indexed' : 'helper_error',
    workspace_path: workspacePath,
    artifact_manifest: compactArtifactManifest(artifact.result),
    state_index: compactStateIndex(state.result),
    helper_versions: {
      artifact_indexer: artifact.helper_version,
      state_indexer: state.helper_version,
    },
    errors,
  };
}

function invokeHelper(helperPath, helperId, input) {
  const result = spawnSync(helperPath, [], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      result: null,
      helper_version: null,
      errors: [{
        code: 'helper_execution_failed',
        message: result.error?.message ?? result.stderr.trim() ?? `${helperId} exited with ${result.status}`,
      }],
    };
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      result: null,
      helper_version: null,
      errors: [{ code: 'helper_protocol_error', message: error instanceof Error ? error.message : String(error) }],
    };
  }
  if (payload.protocol_version !== 'opl_native_helper.v1' || payload.helper_id !== helperId || payload.ok !== true) {
    return {
      ok: false,
      result: null,
      helper_version: payload.helper_version ?? null,
      errors: [{ code: 'helper_protocol_error', message: `${helperId} returned an invalid protocol envelope` }],
    };
  }
  return {
    ok: true,
    result: payload.result,
    helper_version: payload.helper_version ?? payload.crate_version ?? null,
    errors: [],
  };
}

function compactArtifactManifest(result) {
  if (!result) {
    return null;
  }
  return {
    surface_kind: result.surface_kind,
    workspace_root: result.workspace_root,
    summary: result.summary ?? null,
  };
}

function compactStateIndex(result) {
  if (!result) {
    return null;
  }
  return {
    surface_kind: result.surface_kind,
    roots: result.roots ?? [],
    json_validation: result.json_validation
      ? {
        surface_kind: result.json_validation.surface_kind,
        checked_files_count: result.json_validation.checked_files_count,
        invalid_files_count: result.json_validation.invalid_files_count,
      }
      : null,
  };
}

function resolveHelper(binary) {
  const explicitBinDir = process.env.OPL_NATIVE_HELPER_BIN_DIR?.trim();
  if (explicitBinDir) {
    const candidate = path.join(explicitBinDir, binary);
    if (fs.existsSync(candidate)) {
      return { source: 'explicit_bin_dir', path: candidate };
    }
  }
  const cacheCandidate = path.join(nativeHelperCacheDir(), binary);
  if (fs.existsSync(cacheCandidate)) {
    return { source: 'state_cache', path: cacheCandidate };
  }
  const targetDebug = path.join(repoRoot, 'target', 'debug', binary);
  if (fs.existsSync(targetDebug)) {
    return { source: 'workspace_target_debug', path: targetDebug };
  }
  for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(entry, binary);
    if (fs.existsSync(candidate)) {
      return { source: 'path', path: candidate };
    }
  }
  return { source: 'not_found', path: null };
}

function nativeHelperCacheDir() {
  const stateDir = process.env.OPL_STATE_DIR
    ?? path.join(process.env.HOME ?? repoRoot, 'Library/Application Support/OPL/state');
  return path.join(stateDir, 'native-helper', 'bin', `${process.platform}-${process.arch}`, nativeHelperCrateVersion());
}

function nativeHelperCrateVersion() {
  try {
    const cargoToml = fs.readFileSync(path.join(repoRoot, 'native/opl-native-helper/Cargo.toml'), 'utf8');
    return cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function sanitizeResolution(resolution) {
  return {
    source: resolution.source,
    path: resolution.path,
  };
}

function defaultFamilyWorkspaceRoot() {
  const parent = path.dirname(repoRoot);
  if (path.basename(parent) === '.worktrees') {
    return path.dirname(path.dirname(parent));
  }
  return parent;
}
