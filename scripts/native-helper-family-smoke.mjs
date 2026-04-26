#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const domains = [
  {
    domain_id: 'medautoscience',
    label: 'MAS',
    repo_name: 'med-autoscience',
    native_helper_consumption: {
      projection_kind: 'native_helper_consumption_contract',
      declaration_file: 'contracts/opl-gateway/native-helper-contract.json',
      registration_summary_paths: [
        ['indexable_runtime_surface_refs'],
        ['indexable_product_entry_surface_refs'],
      ],
      proof_surface_ref: 'contracts/opl-gateway/native-helper-contract.json',
      proof_summary_paths: [
        ['contract_id'],
      ],
      authority_summary_paths: {
        domain_truth_owner: ['authority_boundary', 'domain_truth_owner'],
        helper_write_policy: ['authority_boundary', 'helper_write_policy'],
        authoritative_truth_refs: ['authority_boundary', 'authoritative_truth_refs'],
        excluded_scopes: ['excluded_scopes'],
      },
      json_equals: [
        { group: 'proof', path: ['surface_kind'], value: 'opl_native_helper_consumption_contract' },
        { group: 'registration', path: ['consumer_domain'], value: 'medautoscience' },
        { group: 'authority', path: ['authority_boundary', 'domain_truth_owner'], value: 'MedAutoScience' },
        { group: 'authority', path: ['authority_boundary', 'helper_write_policy'], value: 'no_domain_truth_writes' },
      ],
      array_includes: [
        { group: 'proof', path: ['allowed_operations'], values: ['index_only'] },
        {
          group: 'registration',
          path: ['indexable_runtime_surface_refs'],
          values: ['/skill_catalog/skills/0/domain_projection/runtime_continuity'],
        },
        {
          group: 'registration',
          path: ['indexable_product_entry_surface_refs'],
          values: [
            '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/domain_entry_surface',
            '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/registration_surface',
          ],
        },
        {
          group: 'authority',
          path: ['authority_boundary', 'authoritative_truth_refs'],
          values: ['/publication_eval/latest.json', '/controller_decisions/latest.json'],
        },
        { group: 'authority', path: ['excluded_scopes'], values: ['publication_gate', 'rca'] },
      ],
      text_checks: [
        { group: 'registration', file: 'docs/status.md', phrases: ['opl_runtime_manager_registration'] },
        {
          group: 'proof',
          file: 'docs/status.md',
          phrases: ['native_helper_consumption.proof_surface', 'contracts/opl-gateway/native-helper-contract.json'],
        },
        { group: 'authority', file: 'docs/status.md', phrases: ['MAS durable truth'] },
        { group: 'authority', file: 'docs/invariants.md', phrases: ['OPL native helper', 'publication_eval/latest.json'] },
      ],
    },
  },
  {
    domain_id: 'medautogrant',
    label: 'MAG',
    repo_name: 'med-autogrant',
    native_helper_consumption: {
      projection_kind: 'runtime_program_projection',
      declaration_file: 'contracts/runtime-program/current-program.json',
      registration_summary_paths: [
        ['runtime_owner', 'runtime_manager_boundary', 'manager_consumed_projection'],
        ['ideal_target', 'opl_runtime_manager', 'consumes_mag_surfaces'],
      ],
      proof_surface_ref: 'skill_catalog.domain_projection.opl_runtime_manager_registration.native_helper_consumption.proof_surface',
      proof_summary_paths: [
        ['runtime_owner', 'runtime_manager_boundary', 'manager_consumed_projection'],
        ['ideal_target', 'opl_runtime_manager', 'consumes_mag_surfaces'],
      ],
      authority_summary_paths: {
        domain_truth_owner: ['ideal_target', 'authoring_truth_owner'],
        domain_owned_truth_refs: ['runtime_owner', 'runtime_manager_boundary', 'mag_owned_truth'],
        manager_non_goals: ['runtime_owner', 'runtime_manager_boundary', 'manager_non_goals'],
        does_not_own: ['ideal_target', 'opl_runtime_manager', 'does_not_own'],
      },
      json_equals: [
        { group: 'registration', path: ['program_id'], value: 'med-autogrant-mainline' },
        { group: 'authority', path: ['ideal_target', 'authoring_truth_owner'], value: 'Med Auto Grant' },
      ],
      array_includes: [
        {
          group: 'registration',
          path: ['runtime_owner', 'runtime_manager_boundary', 'manager_consumed_projection'],
          values: ['skill_catalog.domain_projection.opl_runtime_manager_registration'],
        },
        {
          group: 'proof',
          path: ['runtime_owner', 'runtime_manager_boundary', 'manager_consumed_projection'],
          values: ['skill_catalog.domain_projection.opl_runtime_manager_registration.native_helper_consumption.proof_surface'],
        },
        {
          group: 'registration',
          path: ['ideal_target', 'opl_runtime_manager', 'consumes_mag_surfaces'],
          values: ['opl_runtime_manager_registration', 'native_helper_consumption'],
        },
        {
          group: 'proof',
          path: ['ideal_target', 'opl_runtime_manager', 'consumes_mag_surfaces'],
          values: ['native_helper_consumption.proof_surface'],
        },
        {
          group: 'authority',
          path: ['runtime_owner', 'runtime_manager_boundary', 'mag_owned_truth'],
          values: ['author-side route truth', 'submission-ready export gate'],
        },
        {
          group: 'authority',
          path: ['runtime_owner', 'runtime_manager_boundary', 'manager_non_goals'],
          values: ['grant-domain truth owner', 'concrete authoring executor'],
        },
        {
          group: 'authority',
          path: ['ideal_target', 'opl_runtime_manager', 'does_not_own'],
          values: ['grant authoring truth', 'route truth', 'submission-ready export gate'],
        },
      ],
      text_checks: [
        { group: 'registration', file: 'docs/status.md', phrases: ['opl_runtime_manager_registration'] },
        { group: 'proof', file: 'docs/status.md', phrases: ['native_helper_consumption.proof_surface'] },
        { group: 'authority', file: 'docs/status.md', phrases: ['grant truth', 'submission-ready export gate'] },
        { group: 'authority', file: 'docs/invariants.md', phrases: ['OPL native helper', 'current-program.json'] },
      ],
    },
  },
];
const fixtureMode = process.argv.includes('--fixture');
const fixtureFamilyRoot = fixtureMode ? createFixtureFamilyRoot() : null;
const familyRoot = fixtureFamilyRoot ?? (process.env.OPL_FAMILY_WORKSPACE_ROOT
  ? path.resolve(process.env.OPL_FAMILY_WORKSPACE_ROOT)
  : defaultFamilyWorkspaceRoot());
const requireRealWorkspaces = process.argv.includes('--require-real-workspaces');

const artifactIndexer = resolveHelper('opl-artifact-indexer');
const stateIndexer = resolveHelper('opl-state-indexer');
const output = {
  surface_kind: 'opl_native_helper_family_index_smoke',
  version: 'v1',
  fixture_mode: fixtureMode,
  family_root: familyRoot,
  helper_resolution: {
    artifact_indexer: sanitizeResolution(artifactIndexer),
    state_indexer: sanitizeResolution(stateIndexer),
  },
  domains: {},
  registration_proof_summary: {},
  source_of_truth_rule:
    'OPL indexes and verifies MAS/MAG declared native helper consumption projections as a smoke check; domain-owned truth remains authoritative.',
};

let hasFailure = false;
for (const domain of domains) {
  const workspacePath = path.join(familyRoot, domain.repo_name);
  output.domains[domain.domain_id] = indexDomain(domain, workspacePath);
  output.registration_proof_summary[domain.domain_id] = summarizeRegistrationProof(
    output.domains[domain.domain_id].native_helper_consumption,
  );
  if (output.domains[domain.domain_id].status !== 'indexed') {
    hasFailure = true;
  }
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (fixtureFamilyRoot) {
  fs.rmSync(path.dirname(fixtureFamilyRoot), { recursive: true, force: true });
}
if (requireRealWorkspaces && hasFailure) {
  process.exitCode = 1;
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
      native_helper_consumption: null,
      errors: [{ code: 'workspace_missing', message: `${domain.repo_name} workspace not found` }],
    };
  }

  const nativeHelperConsumption = verifyNativeHelperConsumption(domain, workspacePath);
  if (!artifactIndexer.path || !stateIndexer.path) {
    return {
      domain_id: domain.domain_id,
      label: domain.label,
      status: 'missing_helper',
      workspace_path: workspacePath,
      artifact_manifest: null,
      state_index: null,
      native_helper_consumption: nativeHelperConsumption,
      errors: [
        { code: 'native_helper_missing', message: 'native artifact/state indexer helper is unavailable' },
        ...nativeHelperConsumption.errors,
      ],
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
  errors.push(...nativeHelperConsumption.errors);
  const helpersOk = artifact.ok && state.ok;

  return {
    domain_id: domain.domain_id,
    label: domain.label,
    status: helpersOk && nativeHelperConsumption.status === 'verified'
      ? 'indexed'
      : helpersOk ? 'verification_failed' : 'helper_error',
    workspace_path: workspacePath,
    artifact_manifest: compactArtifactManifest(artifact.result),
    state_index: compactStateIndex(state.result),
    native_helper_consumption: nativeHelperConsumption,
    helper_versions: {
      artifact_indexer: artifact.helper_version,
      state_indexer: state.helper_version,
    },
    errors,
  };
}

function verifyNativeHelperConsumption(domain, workspacePath) {
  const spec = domain.native_helper_consumption;
  const declarationPath = path.join(workspacePath, spec.declaration_file);
  const checkedFiles = [];
  const errorsByGroup = {
    registration: [],
    proof: [],
    authority: [],
  };
  const declaration = readJsonSurface(declarationPath, spec.declaration_file, 'all', errorsByGroup);
  if (declaration) {
    checkedFiles.push(spec.declaration_file);
    verifyJsonEquals(declaration, spec, spec.json_equals, errorsByGroup);
    verifyArrayIncludes(declaration, spec, spec.array_includes, errorsByGroup);
  }
  verifyTextChecks(workspacePath, spec, checkedFiles, errorsByGroup);

  const errors = [
    ...errorsByGroup.registration,
    ...errorsByGroup.proof,
    ...errorsByGroup.authority,
  ];
  return {
    status: errors.length === 0 ? 'verified' : 'failed',
    projection_kind: spec.projection_kind,
    declaration_file: spec.declaration_file,
    checked_files: [...new Set(checkedFiles)].sort(),
    registration: {
      status: errorsByGroup.registration.length === 0 ? 'verified' : 'failed',
      refs: compactRefs(collectValues(declaration, spec.registration_summary_paths)),
    },
    proof: {
      status: errorsByGroup.proof.length === 0 ? 'verified' : 'failed',
      surface_ref: spec.proof_surface_ref,
      refs: compactRefs(collectValues(declaration, spec.proof_summary_paths), 'native_helper_consumption'),
    },
    authority_boundary: {
      status: errorsByGroup.authority.length === 0 ? 'verified' : 'failed',
      ...collectSummaryValues(declaration, spec.authority_summary_paths),
    },
    errors,
  };
}

function readJsonSurface(filePath, fileRef, group, errorsByGroup) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    pushVerificationError(errorsByGroup, group, {
      code: 'surface_missing',
      file: fileRef,
      message: `${fileRef} is required for native helper consumption proof`,
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    pushVerificationError(errorsByGroup, group, {
      code: 'surface_json_invalid',
      file: fileRef,
      message: `${fileRef} must be valid JSON`,
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function verifyJsonEquals(surface, spec, checks, errorsByGroup) {
  for (const check of checks) {
    const actual = getPath(surface, check.path);
    if (actual !== check.value) {
      pushVerificationError(errorsByGroup, check.group, {
        code: 'json_value_mismatch',
        file: spec.declaration_file,
        path: jsonPointer(check.path),
        message: `${jsonPointer(check.path)} must equal ${JSON.stringify(check.value)}`,
        actual,
      });
    }
  }
}

function verifyArrayIncludes(surface, spec, checks, errorsByGroup) {
  for (const check of checks) {
    const actual = getPath(surface, check.path);
    if (!Array.isArray(actual)) {
      pushVerificationError(errorsByGroup, check.group, {
        code: 'json_array_missing',
        file: spec.declaration_file,
        path: jsonPointer(check.path),
        message: `${jsonPointer(check.path)} must be an array`,
        actual,
      });
      continue;
    }
    for (const value of check.values) {
      if (!actual.includes(value)) {
        pushVerificationError(errorsByGroup, check.group, {
          code: 'json_array_value_missing',
          file: spec.declaration_file,
          path: jsonPointer(check.path),
          message: `${jsonPointer(check.path)} must include ${JSON.stringify(value)}`,
          actual,
        });
      }
    }
  }
}

function verifyTextChecks(workspacePath, spec, checkedFiles, errorsByGroup) {
  for (const check of spec.text_checks) {
    const filePath = path.join(workspacePath, check.file);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
      checkedFiles.push(check.file);
    } catch (error) {
      pushVerificationError(errorsByGroup, check.group, {
        code: 'text_surface_missing',
        file: check.file,
        message: `${check.file} is required for native helper consumption wording proof`,
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const phrase of check.phrases) {
      if (!raw.includes(phrase)) {
        pushVerificationError(errorsByGroup, check.group, {
          code: 'required_wording_missing',
          file: check.file,
          message: `${check.file} must include ${JSON.stringify(phrase)}`,
        });
      }
    }
  }
}

function pushVerificationError(errorsByGroup, group, error) {
  const groups = group === 'all' ? Object.keys(errorsByGroup) : [group];
  for (const groupName of groups) {
    errorsByGroup[groupName]?.push(error);
  }
}

function summarizeRegistrationProof(nativeHelperConsumption) {
  if (!nativeHelperConsumption) {
    return { status: 'missing' };
  }
  return {
    status: nativeHelperConsumption.status,
    registration_status: nativeHelperConsumption.registration.status,
    proof_status: nativeHelperConsumption.proof.status,
    authority_status: nativeHelperConsumption.authority_boundary.status,
    declaration_file: nativeHelperConsumption.declaration_file,
    proof_surface_ref: nativeHelperConsumption.proof.surface_ref,
  };
}

function collectValues(surface, paths) {
  if (!surface) {
    return [];
  }
  const values = [];
  for (const pathParts of paths) {
    const value = getPath(surface, pathParts);
    if (Array.isArray(value)) {
      values.push(...value);
    } else if (value !== undefined && value !== null) {
      values.push(value);
    }
  }
  return values;
}

function collectSummaryValues(surface, pathsByKey) {
  if (!surface) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(pathsByKey)
      .map(([key, pathParts]) => [key, getPath(surface, pathParts)])
      .filter(([, value]) => value !== undefined && value !== null),
  );
}

function compactRefs(values, match = null) {
  const refs = values
    .filter((value) => typeof value === 'string')
    .filter((value) => !match || value.includes(match));
  return [...new Set(refs)].sort();
}

function getPath(value, pathParts) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function jsonPointer(pathParts) {
  return `/${pathParts.join('/')}`;
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

function createFixtureFamilyRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-smoke-fixture-'));
  const familyRoot = path.join(root, 'workspace');
  for (const domain of domains) {
    const repoPath = path.join(familyRoot, domain.repo_name);
    fs.mkdirSync(path.join(repoPath, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'docs', 'status.md'), fixtureStatus(domain));
    fs.writeFileSync(path.join(repoPath, 'docs', 'invariants.md'), fixtureInvariants(domain));
    fs.writeFileSync(path.join(repoPath, 'contracts', 'surface.json'), '{"surface_kind":"fixture"}\n');
    writeFixtureNativeHelperProjection(domain, repoPath);
  }
  return familyRoot;
}

function writeFixtureNativeHelperProjection(domain, repoPath) {
  if (domain.domain_id === 'medautoscience') {
    const contractPath = path.join(repoPath, 'contracts', 'opl-gateway', 'native-helper-contract.json');
    fs.mkdirSync(path.dirname(contractPath), { recursive: true });
    fs.writeFileSync(contractPath, `${JSON.stringify({
      schema_version: 1,
      surface_kind: 'opl_native_helper_consumption_contract',
      contract_id: 'mas.opl_native_helper.consumption.v1',
      manager_surface_id: 'opl_runtime_manager',
      consumer_domain: 'medautoscience',
      helper_owner: 'one-person-lab',
      helper_language: 'rust',
      allowed_operations: ['index_only'],
      indexable_runtime_surface_refs: [
        '/skill_catalog/skills/0/domain_projection/runtime_continuity',
        '/progress_projection/domain_projection/research_runtime_control_projection',
        '/runtime_inventory',
      ],
      indexable_product_entry_surface_refs: [
        '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/domain_entry_surface',
        '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/registration_surface',
        '/artifact_inventory/artifact_surface',
        '/automation/automations/0',
      ],
      authority_boundary: {
        domain_truth_owner: 'MedAutoScience',
        helper_write_policy: 'no_domain_truth_writes',
        authoritative_truth_refs: [
          '/study_runtime_status',
          '/runtime_watch',
          '/publication_eval/latest.json',
          '/controller_decisions/latest.json',
        ],
      },
      excluded_scopes: [
        'domain_logic',
        'publication_gate',
        'evidence_or_review_ledger',
        'hermes_agent_implementation',
        'rca',
      ],
    }, null, 2)}\n`);
    return;
  }

  const currentProgramPath = path.join(repoPath, 'contracts', 'runtime-program', 'current-program.json');
  fs.mkdirSync(path.dirname(currentProgramPath), { recursive: true });
  fs.writeFileSync(currentProgramPath, `${JSON.stringify({
    program_id: 'med-autogrant-mainline',
    runtime_owner: {
      runtime_manager_boundary: {
        manager: 'OPL Runtime Manager',
        mag_owned_truth: [
          'grant_run_id/workspace_id/draft_id/program_id identity boundary',
          'author-side route truth',
          'submission-ready export gate',
        ],
        manager_consumed_projection: [
          'domain_entry_contract',
          'runtime_control.semantic_closure',
          'skill_catalog.domain_projection.runtime_continuity',
          'skill_catalog.domain_projection.opl_runtime_manager_registration',
          'skill_catalog.domain_projection.opl_runtime_manager_registration.native_helper_consumption.proof_surface',
        ],
        manager_non_goals: [
          'grant-domain truth owner',
          'concrete authoring executor',
        ],
      },
    },
    ideal_target: {
      authoring_truth_owner: 'Med Auto Grant',
      opl_runtime_manager: {
        consumes_mag_surfaces: [
          'runtime_control',
          'runtime_continuity',
          'opl_runtime_manager_registration',
          'native_helper_consumption',
          'native_helper_consumption.proof_surface',
        ],
        does_not_own: [
          'grant authoring truth',
          'route truth',
          'submission-ready export gate',
        ],
      },
    },
  }, null, 2)}\n`);
}

function fixtureStatus(domain) {
  if (domain.domain_id === 'medautoscience') {
    return [
      '# MAS fixture',
      '',
      '- The skill-catalog domain projection exposes opl_runtime_manager_registration v1.',
      '- native_helper_consumption.proof_surface points to contracts/opl-gateway/native-helper-contract.json.',
      '- MAS durable truth remains authoritative for OPL native helper index-only consumption.',
      '',
    ].join('\n');
  }
  return [
    '# MAG fixture',
    '',
    '- The skill descriptor domain projection exposes opl_runtime_manager_registration v1.',
    '- native_helper_consumption.proof_surface fixes the read-only OPL helper coverage.',
    '- OPL indexing must not copy grant truth or bypass the submission-ready export gate.',
    '',
  ].join('\n');
}

function fixtureInvariants(domain) {
  if (domain.domain_id === 'medautoscience') {
    return [
      '# MAS invariant fixture',
      '',
      '- OPL native helper indexing may read publication_eval/latest.json only as projection input.',
      '',
    ].join('\n');
  }
  return [
    '# MAG invariant fixture',
    '',
    '- OPL native helper indexing reads current-program.json and does not own grant truth.',
    '',
  ].join('\n');
}
