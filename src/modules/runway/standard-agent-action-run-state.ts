import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { normalizeFoundryProviderManifest } from '../foundry/designer-adapter.ts';
import type { HostedAgentRuntimeBindingProvenance } from './hosted-agent-runtime-binding.ts';

const ACTION_RUN_STATE_RELATIVE_ROOT = 'control/opl/action_run_state';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type StandardAgentActionRunBindingV1 = {
  surface_kind: 'opl_standard_agent_action_run_binding';
  version: 'opl-standard-agent-action-run-binding.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
};

export type StandardAgentActionRunBindingV2 = Omit<StandardAgentActionRunBindingV1, 'version'> & {
  version: 'opl-standard-agent-action-run-binding.v2';
  plan_sha256: string;
  plan_byte_size: number;
};

export type StandardAgentActionRunBinding =
  | StandardAgentActionRunBindingV1
  | StandardAgentActionRunBindingV2;

export type StandardAgentActionRunPlan = {
  surface_kind: 'opl_standard_agent_action_run_plan';
  version: 'opl-standard-agent-action-run-plan.v2';
  run_id: string;
  canonical_domain_id: string;
  accepted_domain_ids: string[];
  action_id: string;
  workspace_root: string;
  checkout_root: string;
  runtime_domain_id: string;
  target_domain_id: string;
  catalog_target_domain_ids: string[];
  package_use_binding: Record<string, unknown> | null;
  hosted_runtime_binding_ref: string;
  execution_kind: 'handler_ref' | 'stage_binding' | 'foundry_binding';
  catalog: FamilyActionCatalog;
  handler_registry: DomainHandlerRegistry | null;
  foundry_provider_manifest: Record<string, unknown> | null;
  request_payload_sha256: string;
  request_sha256: string;
  request_byte_size: number;
  input_schema_validation: Record<string, unknown>;
  timeout_ms: number | null;
  started_at: string;
};

export type StandardAgentCompletedHandlerReplay = {
  accepted_domain_ids: string[];
  request_payload_sha256: string;
  package_use_binding: Record<string, unknown>;
  input_schema_ref: string;
  input_schema_validation: Record<string, unknown>;
  output_schema_validation: Record<string, unknown>;
};

export type StandardAgentActionRunCompletion = {
  surface_kind: 'opl_standard_agent_action_run_completion';
  version: 'opl-standard-agent-action-run-completion.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  execution_kind: 'handler_ref' | 'stage_binding' | 'foundry_binding';
  status: 'completed' | 'started' | 'blocked' | 'failed';
  failure_disposition: 'permanent' | null;
  binding_ref: string;
  hosted_runtime_binding_ref: string;
  request_sha256: string;
  request_byte_size: number;
  output_sha256: string;
  output_byte_size: number;
  sandbox: {
    runtime_kind: 'node_permission_model' | 'python_audit_hook';
    sandbox_kind: 'macos_sandbox_exec';
    exit_code: number;
    timed_out: boolean;
  } | null;
  error: {
    error_code: string;
    message: string;
    details: Record<string, unknown>;
  } | null;
  completed_handler_replay: StandardAgentCompletedHandlerReplay | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function workspaceRoot(input: string) {
  if (!path.isAbsolute(input)) fail('Standard Agent action state requires an absolute workspace root.');
  let root: string;
  try {
    root = fs.realpathSync.native(input);
  } catch (error) {
    fail('Standard Agent action state requires an existing workspace root.', {
      workspace_root: input,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(root!).isDirectory()) fail('Standard Agent action workspace root must be a directory.');
  return root!;
}

function validateRunId(runId: string) {
  if (!RUN_ID_PATTERN.test(runId)) {
    fail('Standard Agent action run_id must be a single safe path segment.', { run_id: runId });
  }
}

function assertContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  fail('Standard Agent action state path escapes the workspace root.', { workspace_root: root, path: candidate });
}

function ensureDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    if (!fs.existsSync(candidate)) {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Standard Agent action state contains a non-directory or symbolic-link component.', { path: candidate });
    }
    current = fs.realpathSync.native(candidate);
    assertContained(root, current);
  }
  return current;
}

function fsyncDirectory(directory: string) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeExactFile(file: string, bytes: Buffer) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStablePhysicalFile(file: string, label: string) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) fail(`${label} must be a physical file.`, { file });
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const openedBefore = fs.fstatSync(fd, { bigint: true });
    if (!openedBefore.isFile() || !sameFileIdentity(before, openedBefore)) {
      fail(`${label} changed identity before reading.`, { file });
    }
    const bytes = fs.readFileSync(fd);
    const openedAfter = fs.fstatSync(fd, { bigint: true });
    let after: fs.BigIntStats;
    try {
      after = fs.lstatSync(file, { bigint: true });
    } catch {
      fail(`${label} changed identity while reading.`, { file });
    }
    if (
      after!.isSymbolicLink()
      || !sameStableFile(openedBefore, openedAfter)
      || !sameStableFile(openedAfter, after!)
      || BigInt(bytes.byteLength) !== after!.size
    ) {
      fail(`${label} changed while reading.`, { file });
    }
    return { bytes, stat: openedAfter };
  } finally {
    fs.closeSync(fd);
  }
}

function stateDirectory(root: string, runId: string) {
  validateRunId(runId);
  const directory = path.join(root, ...ACTION_RUN_STATE_RELATIVE_ROOT.split('/'), runId);
  assertContained(root, directory);
  return directory;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} contains unexpected fields.`, { unexpected_fields: unexpected });
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function canonicalStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, { field });
  const entries = value.map((entry) => text(entry, field));
  const canonical = [...new Set(entries)].sort();
  if (canonical.length === 0 || canonicalJsonText(entries) !== canonicalJsonText(canonical)) {
    fail(`${field} must be a non-empty sorted set.`, { field });
  }
  return canonical;
}

function nullableText(value: unknown, field: string) {
  if (value === null) return null;
  return text(value, field);
}

function sha256Digest(value: unknown, field: string) {
  const digest = text(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a sha256 digest.`, { field });
  return digest;
}

function packageSha256Digest(value: unknown, field: string) {
  const digest = text(value, field);
  if (!/^(?:sha256:)?[a-f0-9]{64}$/.test(digest)) {
    fail(`${field} must be a package sha256 digest.`, { field });
  }
  return digest;
}

function nullableSha256Digest(value: unknown, field: string) {
  return value === null ? null : sha256Digest(value, field);
}

function hostedRuntimeProvenanceRecord(value: Record<string, unknown>): HostedAgentRuntimeBindingProvenance {
  const sourceKind = value.source_kind;
  const commonKeys = ['surface_kind', 'version', 'source_kind', 'target_agent_id', 'target_domain_id'];
  const sourceKeys = sourceKind === 'foundry_active_agent_version'
    ? [
        'active_version_id',
        'active_version_digest',
        'candidate_digest',
        'candidate_ref',
        'package_closure_digest',
        'activation_revision',
        'activation_updated_at',
        'activation_transaction_kind',
        'prepared_runtime_binding_ref',
      ]
    : sourceKind === 'managed_package_checkout'
      ? [
          'package_id',
          'package_use_boundary_id',
          'package_use_receipt_ref',
          'package_version',
          'package_lock_ref',
          'package_manifest_sha256',
          'package_content_digest',
          'package_artifact_digest',
          'package_dependency_closure_digest',
          'package_source_kind',
        ]
      : fail('Hosted runtime provenance has an unsupported source_kind.');
  exactKeys(value, [...commonKeys, ...sourceKeys], 'Hosted runtime provenance');
  const targetAgentId = text(value.target_agent_id, 'provenance.target_agent_id');
  const targetDomainId = text(value.target_domain_id, 'provenance.target_domain_id');
  if (
    value.surface_kind !== 'opl_hosted_agent_runtime_binding_provenance'
    || value.version !== 'opl-hosted-agent-runtime-binding-provenance.v1'
  ) {
    fail('Hosted runtime provenance has an unsupported identity or version.');
  }
  if (sourceKind === 'managed_package_checkout') {
    const packageId = text(value.package_id, 'provenance.package_id');
    const packageSourceKind = value.package_source_kind === undefined
      ? undefined
      : text(value.package_source_kind, 'provenance.package_source_kind');
    if (
      packageSourceKind !== undefined
      && ![
        'first_party_managed_cohort',
        'bundled_full_runtime_modules',
        'local_manifest_file',
        'manifest_url',
        'manifest_import',
        'developer_checkout_override',
      ].includes(packageSourceKind)
    ) {
      fail('provenance.package_source_kind is not supported.', {
        package_source_kind: packageSourceKind,
      });
    }
    const packageArtifactDigest = nullableSha256Digest(
      value.package_artifact_digest,
      'provenance.package_artifact_digest',
    );
    if (
      packageArtifactDigest === null
      && packageSourceKind !== undefined
      && packageSourceKind !== 'developer_checkout_override'
    ) {
      fail('Only developer checkout provenance may omit package_artifact_digest.');
    }
    if (packageId !== targetAgentId) {
      fail('Managed package provenance package_id must match target_agent_id.', {
        package_id: packageId,
        target_agent_id: targetAgentId,
      });
    }
    return {
      surface_kind: value.surface_kind,
      version: value.version,
      source_kind: sourceKind,
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      package_id: packageId,
      package_use_boundary_id: text(value.package_use_boundary_id, 'provenance.package_use_boundary_id'),
      ...(value.package_use_receipt_ref === undefined ? {} : {
        package_use_receipt_ref: text(
          value.package_use_receipt_ref,
          'provenance.package_use_receipt_ref',
        ),
      }),
      package_version: text(value.package_version, 'provenance.package_version'),
      package_lock_ref: text(value.package_lock_ref, 'provenance.package_lock_ref'),
      ...(value.package_manifest_sha256 === undefined ? {} : {
        package_manifest_sha256: packageSha256Digest(
          value.package_manifest_sha256,
          'provenance.package_manifest_sha256',
        ),
      }),
      package_content_digest: sha256Digest(
        value.package_content_digest,
        'provenance.package_content_digest',
      ),
      package_artifact_digest: packageArtifactDigest,
      ...(value.package_dependency_closure_digest === undefined ? {} : {
        package_dependency_closure_digest: packageSha256Digest(
          value.package_dependency_closure_digest,
          'provenance.package_dependency_closure_digest',
        ),
      }),
      ...(packageSourceKind === undefined ? {} : { package_source_kind: packageSourceKind }),
    };
  }
  if (
    !Number.isSafeInteger(value.activation_revision)
    || Number(value.activation_revision) < 1
    || !Number.isFinite(Date.parse(String(value.activation_updated_at)))
    || !['activate', 'rollback'].includes(String(value.activation_transaction_kind))
  ) {
    fail('Hosted Foundry runtime provenance has invalid activation metadata.');
  }
  const candidateDigest = sha256Digest(value.candidate_digest, 'provenance.candidate_digest');
  const candidateRef = text(value.candidate_ref, 'provenance.candidate_ref');
  if (candidateRef !== `opl://foundry/candidate/${candidateDigest}`) {
    fail('Hosted Foundry runtime provenance candidate ref does not match its digest.');
  }
  const preparedRuntimeBindingRef = text(
    value.prepared_runtime_binding_ref,
    'provenance.prepared_runtime_binding_ref',
  );
  if (!preparedRuntimeBindingRef.startsWith('opl://foundry/prepared-runtime-bindings/')) {
    fail('Hosted Foundry runtime provenance prepared binding ref is invalid.');
  }
  return {
    surface_kind: value.surface_kind,
    version: value.version,
    source_kind: 'foundry_active_agent_version',
    target_agent_id: targetAgentId,
    target_domain_id: targetDomainId,
    active_version_id: text(value.active_version_id, 'provenance.active_version_id'),
    active_version_digest: sha256Digest(
      value.active_version_digest,
      'provenance.active_version_digest',
    ),
    candidate_digest: candidateDigest,
    candidate_ref: candidateRef,
    package_closure_digest: sha256Digest(
      value.package_closure_digest,
      'provenance.package_closure_digest',
    ),
    activation_revision: Number(value.activation_revision),
    activation_updated_at: text(value.activation_updated_at, 'provenance.activation_updated_at'),
    activation_transaction_kind: value.activation_transaction_kind as 'activate' | 'rollback',
    prepared_runtime_binding_ref: preparedRuntimeBindingRef,
  };
}

function completedHandlerReplayRecord(value: unknown): StandardAgentCompletedHandlerReplay | null {
  if (value === null) return null;
  if (!isRecord(value)) fail('Standard Agent completed Handler replay metadata must be an object or null.');
  exactKeys(value, [
    'accepted_domain_ids',
    'request_payload_sha256',
    'package_use_binding',
    'input_schema_ref',
    'input_schema_validation',
    'output_schema_validation',
  ], 'Standard Agent completed Handler replay metadata');
  const acceptedDomainIds = Array.isArray(value.accepted_domain_ids)
    ? value.accepted_domain_ids.map((entry) => text(entry, 'completed_handler_replay.accepted_domain_ids'))
    : fail('completed_handler_replay.accepted_domain_ids must be an array.');
  const canonicalDomainIds = [...new Set(acceptedDomainIds)].sort();
  if (
    canonicalDomainIds.length === 0
    || canonicalJsonText(acceptedDomainIds) !== canonicalJsonText(canonicalDomainIds)
    || typeof value.request_payload_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_payload_sha256)
    || !isRecord(value.package_use_binding)
    || !isRecord(value.input_schema_validation)
    || !isRecord(value.output_schema_validation)
  ) {
    fail('Standard Agent completed Handler replay metadata is invalid.');
  }
  return {
    accepted_domain_ids: canonicalDomainIds,
    request_payload_sha256: value.request_payload_sha256,
    package_use_binding: value.package_use_binding,
    input_schema_ref: text(value.input_schema_ref, 'completed_handler_replay.input_schema_ref'),
    input_schema_validation: schemaValidationRecord(
      value.input_schema_validation,
      'completed_handler_replay.input_schema_validation',
    ),
    output_schema_validation: schemaValidationRecord(
      value.output_schema_validation,
      'completed_handler_replay.output_schema_validation',
    ),
  };
}

function schemaValidationRecord(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  exactKeys(value, ['schema_ref', 'schema_path', 'schema_id', 'status'], field);
  if (value.status !== 'valid') fail(`${field}.status must be valid.`);
  return {
    schema_ref: text(value.schema_ref, `${field}.schema_ref`),
    schema_path: text(value.schema_path, `${field}.schema_path`),
    schema_id: text(value.schema_id, `${field}.schema_id`),
    status: 'valid' as const,
  };
}

function readCanonicalRecord(file: string, label: string) {
  const { bytes } = readStablePhysicalFile(file, label);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!isRecord(value) || !bytes.equals(canonicalJsonBytes(value))) {
    fail(`${label} must contain one canonical JSON object.`, { file });
  }
  return value;
}

function planRecord(value: Record<string, unknown>): StandardAgentActionRunPlan {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'accepted_domain_ids',
    'action_id',
    'workspace_root',
    'checkout_root',
    'runtime_domain_id',
    'target_domain_id',
    'catalog_target_domain_ids',
    'package_use_binding',
    'hosted_runtime_binding_ref',
    'execution_kind',
    'catalog',
    'handler_registry',
    'foundry_provider_manifest',
    'request_payload_sha256',
    'request_sha256',
    'request_byte_size',
    'input_schema_validation',
    'timeout_ms',
    'started_at',
  ], 'Standard Agent action run plan');
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_plan'
    || value.version !== 'opl-standard-agent-action-run-plan.v2'
    || !path.isAbsolute(String(value.workspace_root))
    || !path.isAbsolute(String(value.checkout_root))
    || !['handler_ref', 'stage_binding', 'foundry_binding'].includes(String(value.execution_kind))
    || !isRecord(value.catalog)
    || (value.handler_registry !== null && !isRecord(value.handler_registry))
    || (value.package_use_binding !== null && !isRecord(value.package_use_binding))
    || !isRecord(value.input_schema_validation)
    || typeof value.request_payload_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_payload_sha256)
    || typeof value.request_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || (value.timeout_ms !== null && (!Number.isSafeInteger(value.timeout_ms) || Number(value.timeout_ms) < 1))
  ) {
    fail('Standard Agent action run plan is invalid.');
  }
  let catalog: FamilyActionCatalog;
  try {
    const catalogInput = structuredClone(value.catalog);
    if (!isRecord(catalogInput) || !Array.isArray(catalogInput.actions)) {
      fail('Standard Agent action run plan catalog actions must be an array.');
    }
    for (const action of catalogInput.actions) {
      if (isRecord(action)) delete action.parameter_fields_explicit;
    }
    catalog = normalizeFamilyActionCatalog(catalogInput)
      ?? fail('Standard Agent action run plan catalog is missing.');
  } catch (error) {
    fail('Standard Agent action run plan catalog is invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (canonicalJsonText(catalog) !== canonicalJsonText(value.catalog)) {
    fail('Standard Agent action run plan catalog is not in normalized canonical form.');
  }
  let handlerRegistry: DomainHandlerRegistry | null;
  try {
    handlerRegistry = value.handler_registry === null
      ? null
      : normalizeDomainHandlerRegistry(value.handler_registry as Record<string, unknown>);
    if (
      handlerRegistry !== null
      && canonicalJsonText(handlerRegistry) !== canonicalJsonText(value.handler_registry)
    ) {
      fail('Standard Agent action run plan handler registry is not in normalized canonical form.');
    }
    assertFamilyActionHandlerRefsResolve(catalog!, handlerRegistry);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('Standard Agent action run plan handler registry is invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const runId = text(value.run_id, 'plan.run_id');
  validateRunId(runId);
  const actionId = text(value.action_id, 'plan.action_id');
  const action = catalog.actions.find((entry) => entry.action_id === actionId);
  const executionBinding = action?.execution_binding ?? null;
  const executionKind = value.execution_kind as StandardAgentActionRunPlan['execution_kind'];
  if (!executionBinding || executionBinding.kind !== executionKind) {
    fail('Standard Agent action run plan does not contain its selected execution binding.', {
      action_id: actionId,
      execution_kind: executionKind,
    });
  }
  const foundryProvider = value.foundry_provider_manifest;
  if (
    (executionKind === 'foundry_binding'
      && (!isRecord(foundryProvider) || typeof foundryProvider.provider_id !== 'string' || !foundryProvider.provider_id.trim()))
    || (executionKind !== 'foundry_binding' && foundryProvider !== null)
  ) {
    fail('Standard Agent action run plan has invalid frozen Foundry provider metadata.', {
      execution_kind: executionKind,
    });
  }
  let normalizedFoundryProvider: Record<string, unknown> | null = null;
  if (executionKind === 'foundry_binding') {
    try {
      normalizedFoundryProvider = normalizeFoundryProviderManifest(foundryProvider) as unknown as Record<string, unknown>;
    } catch (error) {
      fail('Standard Agent action run plan has an invalid frozen Foundry provider manifest.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (canonicalJsonText(normalizedFoundryProvider) !== canonicalJsonText(foundryProvider)) {
      fail('Standard Agent action run plan Foundry provider manifest is not in normalized canonical form.');
    }
  }
  const acceptedDomainIds = canonicalStringList(value.accepted_domain_ids, 'plan.accepted_domain_ids');
  const catalogTargetDomainIds = canonicalStringList(
    value.catalog_target_domain_ids,
    'plan.catalog_target_domain_ids',
  );
  const canonicalDomainId = text(value.canonical_domain_id, 'plan.canonical_domain_id');
  const runtimeDomainId = text(value.runtime_domain_id, 'plan.runtime_domain_id');
  const targetDomainId = text(value.target_domain_id, 'plan.target_domain_id');
  const requiredAcceptedDomainIds = [...new Set([
    canonicalDomainId,
    runtimeDomainId,
    targetDomainId,
    ...catalogTargetDomainIds,
  ])].sort();
  if (
    requiredAcceptedDomainIds.some((domainId) => !acceptedDomainIds.includes(domainId))
    || !catalogTargetDomainIds.includes(catalog.target_domain_id)
  ) {
    fail('Standard Agent action run plan domain identity is inconsistent.', {
      canonical_domain_id: canonicalDomainId,
      target_domain_id: targetDomainId,
    });
  }
  return {
    ...value,
    run_id: runId,
    canonical_domain_id: canonicalDomainId,
    accepted_domain_ids: acceptedDomainIds,
    action_id: actionId,
    workspace_root: text(value.workspace_root, 'plan.workspace_root'),
    checkout_root: text(value.checkout_root, 'plan.checkout_root'),
    runtime_domain_id: runtimeDomainId,
    target_domain_id: targetDomainId,
    catalog_target_domain_ids: catalogTargetDomainIds,
    package_use_binding: value.package_use_binding as Record<string, unknown> | null,
    hosted_runtime_binding_ref: text(
      value.hosted_runtime_binding_ref,
      'plan.hosted_runtime_binding_ref',
    ),
    execution_kind: executionKind,
    catalog: catalog!,
    handler_registry: handlerRegistry,
    foundry_provider_manifest: normalizedFoundryProvider,
    request_payload_sha256: value.request_payload_sha256,
    request_sha256: value.request_sha256,
    request_byte_size: Number(value.request_byte_size),
    input_schema_validation: value.input_schema_validation,
    timeout_ms: value.timeout_ms === null ? null : Number(value.timeout_ms),
    started_at: text(value.started_at, 'plan.started_at'),
  } as StandardAgentActionRunPlan;
}

function bindingRecord(value: Record<string, unknown>): StandardAgentActionRunBinding {
  const v2 = value.version === 'opl-standard-agent-action-run-binding.v2';
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'hosted_runtime_binding_ref',
    'hosted_runtime_binding',
    ...(v2 ? ['plan_sha256', 'plan_byte_size'] : []),
  ], 'Standard Agent action run binding');
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_binding'
    || ![
      'opl-standard-agent-action-run-binding.v1',
      'opl-standard-agent-action-run-binding.v2',
    ].includes(String(value.version))
    || !isRecord(value.hosted_runtime_binding)
    || (v2 && (
      typeof value.plan_sha256 !== 'string'
      || !DIGEST_PATTERN.test(value.plan_sha256)
      || !Number.isSafeInteger(value.plan_byte_size)
      || Number(value.plan_byte_size) < 1
    ))
  ) {
    fail('Standard Agent action run binding is invalid.');
  }
  const runId = text(value.run_id, 'binding.run_id');
  validateRunId(runId);
  const hostedRuntimeBinding = hostedRuntimeProvenanceRecord(value.hosted_runtime_binding);
  const hostedRuntimeBindingRef = text(
    value.hosted_runtime_binding_ref,
    'binding.hosted_runtime_binding_ref',
  );
  const expectedHostedRuntimeBindingRef = `opl://hosted-agent-runtime-binding/sha256/${crypto
    .createHash('sha256')
    .update(canonicalJsonText(hostedRuntimeBinding))
    .digest('hex')}`;
  if (hostedRuntimeBindingRef !== expectedHostedRuntimeBindingRef) {
    fail('Standard Agent action run binding provenance ref is not content-addressed.', {
      hosted_runtime_binding_ref: hostedRuntimeBindingRef,
      expected_hosted_runtime_binding_ref: expectedHostedRuntimeBindingRef,
    });
  }
  const canonicalDomainId = text(value.canonical_domain_id, 'binding.canonical_domain_id');
  if (hostedRuntimeBinding.target_agent_id !== canonicalDomainId) {
    fail('Standard Agent action run binding target does not match its hosted runtime provenance.', {
      canonical_domain_id: canonicalDomainId,
      provenance_target_agent_id: hostedRuntimeBinding.target_agent_id,
    });
  }
  const common = {
    surface_kind: 'opl_standard_agent_action_run_binding' as const,
    run_id: runId,
    canonical_domain_id: canonicalDomainId,
    action_id: text(value.action_id, 'binding.action_id'),
    hosted_runtime_binding_ref: hostedRuntimeBindingRef,
    hosted_runtime_binding: hostedRuntimeBinding,
  };
  return v2
    ? {
        ...common,
        version: 'opl-standard-agent-action-run-binding.v2',
        plan_sha256: value.plan_sha256 as string,
        plan_byte_size: Number(value.plan_byte_size),
      }
    : {
        ...common,
        version: 'opl-standard-agent-action-run-binding.v1',
      };
}

function nullableRecordText(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function assertPlanRuntimeIdentity(
  plan: StandardAgentActionRunPlan,
  binding: StandardAgentActionRunBinding,
) {
  const provenance = binding.hosted_runtime_binding;
  if (
    plan.target_domain_id !== provenance.target_domain_id
    || plan.canonical_domain_id !== provenance.target_agent_id
  ) {
    fail('Standard Agent action run plan domain identity conflicts with runtime provenance.', {
      run_id: plan.run_id,
    });
  }
  const packageBinding = plan.package_use_binding;
  if (!isRecord(packageBinding)) {
    fail('Standard Agent action run plan is missing its package-use binding.', { run_id: plan.run_id });
  }
  const useBoundaryId = text(
    packageBinding.use_boundary_id,
    'plan.package_use_binding.use_boundary_id',
  );
  if (provenance.source_kind === 'managed_package_checkout') {
    if (useBoundaryId !== provenance.package_use_boundary_id) {
      fail('Managed package-use boundary conflicts with runtime provenance.', { run_id: plan.run_id });
    }
    const rootPackage = isRecord(packageBinding.root_package)
      ? packageBinding.root_package
      : fail('Managed package-use binding is missing root_package.', { run_id: plan.run_id });
    if (
      packageBinding.surface_kind !== 'opl_agent_package_use_binding.v1'
      || rootPackage.package_id !== provenance.package_id
      || (
        provenance.package_use_receipt_ref !== undefined
        && packageBinding.use_receipt_ref !== provenance.package_use_receipt_ref
      )
      || nullableRecordText(rootPackage, 'package_version') !== provenance.package_version
      || nullableRecordText(rootPackage, 'package_lock_ref') !== provenance.package_lock_ref
      || (
        provenance.package_manifest_sha256 !== undefined
        && nullableRecordText(rootPackage, 'manifest_sha256') !== provenance.package_manifest_sha256
      )
      || nullableRecordText(rootPackage, 'content_digest') !== provenance.package_content_digest
      || nullableRecordText(rootPackage, 'artifact_digest') !== provenance.package_artifact_digest
      || (
        provenance.package_dependency_closure_digest !== undefined
        && packageBinding.dependency_closure_digest !== provenance.package_dependency_closure_digest
      )
      || (
        provenance.package_source_kind !== undefined
        && rootPackage.source_kind !== provenance.package_source_kind
      )
    ) {
      fail('Managed package-use identity conflicts with runtime provenance.', { run_id: plan.run_id });
    }
    return;
  }
  const rootPackage = isRecord(packageBinding.root_package)
    ? packageBinding.root_package
    : fail('Foundry package-use binding is missing root_package.', { run_id: plan.run_id });
  if (
    packageBinding.surface_kind !== 'opl_agent_package_use_binding.v1'
    || packageBinding.binding_origin !== 'foundry_active_agent_version'
    || packageBinding.dependency_closure_digest !== provenance.package_closure_digest
    || rootPackage.package_id !== provenance.target_agent_id
    || rootPackage.package_version !== provenance.active_version_id
    || rootPackage.content_digest !== provenance.candidate_digest
    || rootPackage.source_artifact_ref !== provenance.candidate_ref
    || rootPackage.artifact_digest !== provenance.candidate_digest
    || path.basename(plan.checkout_root) !== provenance.candidate_digest.slice('sha256:'.length)
  ) {
    fail('Foundry package-use identity conflicts with runtime provenance.', { run_id: plan.run_id });
  }
}

function expectedExecutionBindingRef(plan: StandardAgentActionRunPlan) {
  const action = plan.catalog.actions.find((entry) => entry.action_id === plan.action_id)
    ?? fail('Standard Agent action run plan is missing its selected action.');
  const executionBinding = action.execution_binding;
  if (executionBinding.kind === 'handler_ref') return executionBinding.handler_ref;
  if (executionBinding.kind === 'stage_binding') {
    const entryStageRef = action.stage_route?.entry_stage_ref;
    if (typeof entryStageRef !== 'string' || !entryStageRef.trim()) {
      fail('Stage-bound action run plan is missing its entry stage.');
    }
    return `stage:${executionBinding.stage_manifest_ref}#${entryStageRef}`;
  }
  const providerId = plan.foundry_provider_manifest?.provider_id;
  if (typeof providerId !== 'string' || !providerId.trim()) {
    fail('Foundry-bound action run plan is missing its provider identity.');
  }
  return `foundry:${providerId}:${executionBinding.provider_manifest_ref}`;
}

function assertCompletionMatchesRunState(input: {
  binding: StandardAgentActionRunBinding;
  plan: StandardAgentActionRunPlan | null;
  completion: StandardAgentActionRunCompletion;
}) {
  const { binding, plan, completion } = input;
  if (
    binding.run_id !== completion.run_id
    || binding.canonical_domain_id !== completion.canonical_domain_id
    || binding.action_id !== completion.action_id
    || binding.hosted_runtime_binding_ref !== completion.hosted_runtime_binding_ref
  ) {
    fail('Action run completion conflicts with its frozen runtime binding.', { run_id: completion.run_id });
  }
  if (!plan) return;
  const replay = completion.completed_handler_replay;
  const selectedAction = plan.catalog.actions.find((entry) => entry.action_id === plan.action_id)
    ?? fail('Standard Agent action run plan is missing its selected action.');
  if (
    plan.execution_kind !== completion.execution_kind
    || plan.request_sha256 !== completion.request_sha256
    || plan.request_byte_size !== completion.request_byte_size
    || expectedExecutionBindingRef(plan) !== completion.binding_ref
    || (completion.execution_kind === 'handler_ref' && completion.status === 'completed' && (
      !replay
      || canonicalJsonText(replay.accepted_domain_ids) !== canonicalJsonText(plan.accepted_domain_ids)
      || replay.request_payload_sha256 !== plan.request_payload_sha256
      || canonicalJsonText(replay.package_use_binding) !== canonicalJsonText(plan.package_use_binding)
      || canonicalJsonText(replay.input_schema_validation) !== canonicalJsonText(plan.input_schema_validation)
      || replay.input_schema_ref !== selectedAction.input_schema_ref
      || replay.output_schema_validation.schema_ref !== selectedAction.output_schema_ref
    ))
  ) {
    fail('Action run completion conflicts with its frozen durable plan.', { run_id: completion.run_id });
  }
}

function sandboxRecord(value: unknown) {
  if (!isRecord(value)) fail('completion.sandbox must be an object.');
  exactKeys(value, ['runtime_kind', 'sandbox_kind', 'exit_code', 'timed_out'], 'completion.sandbox');
  if (
    !['node_permission_model', 'python_audit_hook'].includes(String(value.runtime_kind))
    || value.sandbox_kind !== 'macos_sandbox_exec'
    || !Number.isSafeInteger(value.exit_code)
    || typeof value.timed_out !== 'boolean'
  ) {
    fail('Standard Agent action run completion sandbox is invalid.');
  }
  return {
    runtime_kind: value.runtime_kind as 'node_permission_model' | 'python_audit_hook',
    sandbox_kind: 'macos_sandbox_exec' as const,
    exit_code: Number(value.exit_code),
    timed_out: value.timed_out,
  };
}

function errorRecord(value: unknown) {
  if (!isRecord(value)) fail('completion.error must be an object.');
  exactKeys(value, ['error_code', 'message', 'details'], 'completion.error');
  if (!isRecord(value.details)) fail('completion.error.details must be an object.');
  return {
    error_code: text(value.error_code, 'completion.error.error_code'),
    message: text(value.message, 'completion.error.message'),
    details: value.details,
  };
}

function completionRecord(value: Record<string, unknown>): StandardAgentActionRunCompletion {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'execution_kind',
    'status',
    'failure_disposition',
    'binding_ref',
    'hosted_runtime_binding_ref',
    'request_sha256',
    'request_byte_size',
    'output_sha256',
    'output_byte_size',
    'sandbox',
    'error',
    'completed_handler_replay',
  ], 'Standard Agent action run completion');
  const completedHandlerReplay = completedHandlerReplayRecord(value.completed_handler_replay);
  const executionKind = value.execution_kind;
  const status = value.status;
  const validStatus = executionKind === 'handler_ref'
    ? status === 'completed' || status === 'failed'
    : executionKind === 'stage_binding'
      ? status === 'started' || status === 'blocked' || status === 'failed'
      : executionKind === 'foundry_binding'
        ? status === 'started' || status === 'failed'
        : false;
  const sandbox = value.sandbox === null ? null : sandboxRecord(value.sandbox);
  const error = value.error === null ? null : errorRecord(value.error);
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_completion'
    || value.version !== 'opl-standard-agent-action-run-completion.v1'
    || !validStatus
    || (value.failure_disposition !== null && value.failure_disposition !== 'permanent')
    || typeof value.request_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || typeof value.output_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.output_sha256)
    || !Number.isSafeInteger(value.output_byte_size)
    || Number(value.output_byte_size) < 1
    || (status === 'failed' && (value.failure_disposition !== 'permanent' || error === null))
    || (status !== 'failed' && (value.failure_disposition !== null || error !== null))
    || (executionKind !== 'handler_ref' && sandbox !== null)
    || (
      executionKind === 'handler_ref'
      && status === 'completed'
      && (
        completedHandlerReplay === null
        || sandbox === null
        || sandbox.exit_code !== 0
        || sandbox.timed_out
      )
    )
    || (
      (executionKind !== 'handler_ref' || status !== 'completed')
      && completedHandlerReplay !== null
    )
  ) {
    fail('Standard Agent action run completion is invalid.');
  }
  const runId = text(value.run_id, 'completion.run_id');
  validateRunId(runId);
  return {
    surface_kind: 'opl_standard_agent_action_run_completion',
    version: 'opl-standard-agent-action-run-completion.v1',
    run_id: runId,
    canonical_domain_id: text(value.canonical_domain_id, 'completion.canonical_domain_id'),
    action_id: text(value.action_id, 'completion.action_id'),
    execution_kind: executionKind as StandardAgentActionRunCompletion['execution_kind'],
    status: status as StandardAgentActionRunCompletion['status'],
    failure_disposition: value.failure_disposition as 'permanent' | null,
    binding_ref: text(value.binding_ref, 'completion.binding_ref'),
    hosted_runtime_binding_ref: text(
      value.hosted_runtime_binding_ref,
      'completion.hosted_runtime_binding_ref',
    ),
    request_sha256: value.request_sha256,
    request_byte_size: Number(value.request_byte_size),
    output_sha256: value.output_sha256,
    output_byte_size: Number(value.output_byte_size),
    sandbox,
    error,
    completed_handler_replay: completedHandlerReplay,
  };
}

function readRunStateFromDirectory(root: string, directory: string, runId: string) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('Standard Agent action run state must be a physical directory.', { run_id: runId });
  }
  const binding = bindingRecord(readCanonicalRecord(path.join(directory, 'binding.json'), 'Action run binding'));
  if (binding.run_id !== runId) fail('Action run binding identity does not match its directory.', { run_id: runId });
  const planFile = path.join(directory, 'plan.json');
  if (binding.version === 'opl-standard-agent-action-run-binding.v1') {
    if (fs.existsSync(planFile)) {
      fail('Legacy Standard Agent action run binding cannot claim an unbound plan.', { run_id: runId });
    }
    return { binding, plan: null };
  }
  if (!fs.existsSync(planFile)) {
    fail('Standard Agent action run binding is missing its durable plan.', { run_id: runId });
  }
  const { bytes: planBytes } = readStablePhysicalFile(planFile, 'Action run plan');
  const planValue = parseJsonText(planBytes.toString('utf8'));
  if (!isRecord(planValue) || !planBytes.equals(canonicalJsonBytes(planValue))) {
    fail('Action run plan must contain one canonical JSON object.', { file: planFile });
  }
  const plan = planRecord(planValue);
  const actualPlanSha256 = crypto.createHash('sha256').update(planBytes).digest('hex');
  if (
    binding.plan_sha256 !== actualPlanSha256
    || binding.plan_byte_size !== planBytes.byteLength
    || plan.run_id !== binding.run_id
    || plan.canonical_domain_id !== binding.canonical_domain_id
    || plan.action_id !== binding.action_id
    || plan.hosted_runtime_binding_ref !== binding.hosted_runtime_binding_ref
    || plan.workspace_root !== root
  ) {
    fail('Standard Agent action run plan conflicts with its frozen binding.', {
      run_id: runId,
      expected_plan_sha256: binding.plan_sha256,
      actual_plan_sha256: actualPlanSha256,
      expected_plan_byte_size: binding.plan_byte_size,
      actual_plan_byte_size: planBytes.byteLength,
    });
  }
  assertPlanRuntimeIdentity(plan, binding);
  return { binding, plan };
}

export function inspectStandardAgentActionRunState(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  const realDirectory = fs.realpathSync.native(directory);
  assertContained(root, realDirectory);
  return readRunStateFromDirectory(root, realDirectory, input.runId);
}

export function inspectStandardAgentActionRunBinding(input: { workspaceRoot: string; runId: string }) {
  return inspectStandardAgentActionRunState(input)?.binding ?? null;
}

export function inspectStandardAgentActionRunPlan(input: { workspaceRoot: string; runId: string }) {
  return inspectStandardAgentActionRunState(input)?.plan ?? null;
}

export function reserveStandardAgentActionRunBinding(input: {
  workspaceRoot: string;
  binding: StandardAgentActionRunBinding;
  plan?: StandardAgentActionRunPlan;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const expected = bindingRecord(input.binding as unknown as Record<string, unknown>);
  const expectedPlan = input.plan
    ? planRecord(input.plan as unknown as Record<string, unknown>)
    : null;
  const planBytes = expectedPlan ? canonicalJsonBytes(expectedPlan) : null;
  if (
    (expected.version === 'opl-standard-agent-action-run-binding.v2' && (
      !expectedPlan
      || expected.plan_sha256 !== crypto.createHash('sha256').update(planBytes!).digest('hex')
      || expected.plan_byte_size !== planBytes!.byteLength
      || expectedPlan.run_id !== expected.run_id
      || expectedPlan.canonical_domain_id !== expected.canonical_domain_id
      || expectedPlan.action_id !== expected.action_id
      || expectedPlan.hosted_runtime_binding_ref !== expected.hosted_runtime_binding_ref
      || expectedPlan.workspace_root !== root
    ))
    || (expected.version === 'opl-standard-agent-action-run-binding.v1' && expectedPlan !== null)
  ) {
    fail('Standard Agent action run binding and durable plan are inconsistent.', {
      run_id: expected.run_id,
    });
  }
  if (expectedPlan) assertPlanRuntimeIdentity(expectedPlan, expected);
  const parent = ensureDirectory(root, ACTION_RUN_STATE_RELATIVE_ROOT.split('/'));
  const directory = stateDirectory(root, expected.run_id);
  if (fs.existsSync(directory)) {
    return {
      status: 'existing' as const,
      ...readRunStateFromDirectory(root, directory, expected.run_id),
    };
  }
  const staging = path.join(parent, `.${expected.run_id}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    writeExactFile(path.join(staging, 'binding.json'), canonicalJsonBytes(expected));
    if (planBytes) writeExactFile(path.join(staging, 'plan.json'), planBytes);
    fsyncDirectory(staging);
    try {
      fs.renameSync(staging, directory);
      fsyncDirectory(parent);
      return { status: 'reserved' as const, binding: expected, plan: expectedPlan };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'ENOTEMPTY'].includes(code ?? '') || !fs.existsSync(directory)) throw error;
      return {
        status: 'existing' as const,
        ...readRunStateFromDirectory(root, directory, expected.run_id),
      };
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function inspectStandardAgentActionRunCompletion(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  const state = readRunStateFromDirectory(root, directory, input.runId);
  const file = path.join(directory, 'completion.json');
  if (!fs.existsSync(file)) return null;
  const completion = completionRecord(readCanonicalRecord(file, 'Action run completion'));
  if (completion.run_id !== input.runId) fail('Action run completion identity does not match its directory.');
  assertCompletionMatchesRunState({ ...state, completion });
  return completion;
}

export function commitStandardAgentActionRunCompletion(input: {
  workspaceRoot: string;
  completion: StandardAgentActionRunCompletion;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const completion = completionRecord(input.completion as unknown as Record<string, unknown>);
  const directory = stateDirectory(root, completion.run_id);
  const { binding, plan } = readRunStateFromDirectory(root, directory, completion.run_id);
  assertCompletionMatchesRunState({ binding, plan, completion });
  const file = path.join(directory, 'completion.json');
  const bytes = canonicalJsonBytes(completion);
  if (fs.existsSync(file)) {
    const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
    if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
      fail('Action run completion conflicts with the existing run identity.', { run_id: completion.run_id });
    }
    return { status: 'already_completed' as const, completion: existing };
  }
  const staging = path.join(directory, `.completion.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    writeExactFile(staging, bytes);
    try {
      fs.linkSync(staging, file);
      fsyncDirectory(directory);
      return { status: 'completed' as const, completion };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !fs.existsSync(file)) throw error;
      const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
      if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
        fail('Action run completion conflicts with a concurrent writer.', { run_id: completion.run_id });
      }
      return { status: 'already_completed' as const, completion: existing };
    }
  } finally {
    fs.rmSync(staging, { force: true });
  }
}
