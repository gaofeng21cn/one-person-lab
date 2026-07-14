import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export type StageRunImmutableSpec = {
  surface_kind: 'opl_stage_run_immutable_spec';
  version: 'opl-stage-run-immutable-spec.v1';
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  action_id: string | null;
  task_id: string | null;
  workspace_identity: Record<string, unknown>;
  stage_manifest: {
    ref: string;
    sha256: string;
  };
  quality_policy: {
    ref: string;
    body: Record<string, unknown>;
  };
  stage_packet_ref: string;
  checkpoint_refs: string[];
  source_fingerprint: string | null;
  source_refs: string[];
  input_artifacts: Array<{
    ref: string;
    sha256: string;
  }>;
  content_bindings: StageRunImmutableContentBinding[];
  role_prompt_refs: StandardAgentStageQualityRuntimeBinding['role_prompt_refs'];
  quality_rubric_refs: string[];
  stage_goal_refs: string[];
  lineage_refs: string[];
  package_closure: Record<string, unknown> | null;
  executor_kind: string;
  stage_attempt_executor_policy: Record<string, unknown> | null;
  parent_route_decision_ref: string | null;
};

export type StageRunImmutableContentBinding = {
  purpose:
    | 'stage_manifest'
    | 'quality_policy'
    | 'stage_prompt'
    | 'role_prompt'
    | 'quality_rubric'
    | 'stage_goal'
    | 'source'
    | 'lineage'
    | 'stage_packet'
    | 'checkpoint';
  ref: string;
  sha256: string;
  byte_size: number | null;
  digest_source: 'pack_file_bytes' | 'input_artifact_hash' | 'embedded_sha256';
};

const WORKSPACE_OBSERVATION_FIELDS = new Set([
  'checked_at',
  'checkout_currentness',
  'currentness_observation',
  'domain_pack_root',
  'package_status',
  'package_use_binding',
  'runtime_source_readiness',
  'use_boundary_id',
  'use_receipt_ref',
]);

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `StageRun identity requires ${field}.`,
      { field },
    );
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sha256Digest(value: unknown, field: string) {
  const candidate = text(value, field).toLowerCase();
  const match = candidate.match(/^(?:sha256:)?([0-9a-f]{64})$/);
  if (!match) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `StageRun immutable content binding requires a SHA-256 digest for ${field}.`,
      {
        failure_code: 'stage_run_content_digest_invalid',
        field,
        received_digest: candidate,
      },
    );
  }
  return `sha256:${match[1]}`;
}

function stringList(values: unknown) {
  return Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()))]
    : [];
}

function artifactBindings(refs: unknown, hashes: unknown) {
  const artifactRefs = Array.isArray(refs) ? refs : [];
  const artifactHashes = Array.isArray(hashes) ? hashes : [];
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable input artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  const byRef = new Map<string, string>();
  artifactRefs.forEach((ref, index) => {
    const artifactRef = text(ref, `input_artifact_refs[${index}]`);
    const artifactHash = sha256Digest(
      artifactHashes[index],
      `input_artifact_hashes[${index}]`,
    );
    const existing = byRef.get(artifactRef);
    if (existing && existing !== artifactHash) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun input artifact ref cannot be bound to multiple hashes.',
        { artifact_ref: artifactRef, existing_sha256: existing, received_sha256: artifactHash },
      );
    }
    byRef.set(artifactRef, artifactHash);
  });
  return [...byRef.entries()]
    .map(([ref, sha256]) => ({ ref, sha256 }))
    .sort((left, right) => left.ref.localeCompare(right.ref) || left.sha256.localeCompare(right.sha256));
}

function definedRecord(entries: Array<[string, unknown]>) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function packageIdentity(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `StageRun immutable package closure requires ${field}.`,
      { failure_code: 'stage_run_package_identity_missing', field },
    );
  }
  if (!optionalText(value.content_digest)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `StageRun immutable package closure requires ${field}.content_digest.`,
      {
        failure_code: field.endsWith('root_package')
          ? 'stage_run_root_package_content_digest_missing'
          : 'stage_run_provider_package_content_digest_missing',
        field: `${field}.content_digest`,
      },
    );
  }
  return definedRecord([
    ['package_id', text(value.package_id, `${field}.package_id`)],
    ['package_version', text(value.package_version, `${field}.package_version`)],
    ['owner_language_version', isRecord(value.owner_language_version) ? value.owner_language_version : null],
    ['package_lock_ref', text(value.package_lock_ref, `${field}.package_lock_ref`)],
    ['manifest_sha256', sha256Digest(value.manifest_sha256, `${field}.manifest_sha256`)],
    ['content_digest', sha256Digest(value.content_digest, `${field}.content_digest`)],
    ['source_artifact_ref', optionalText(value.source_artifact_ref)],
    ['artifact_digest', value.artifact_digest === null || value.artifact_digest === undefined
      ? null
      : sha256Digest(value.artifact_digest, `${field}.artifact_digest`)],
  ]);
}

export function immutablePackageClosureFromWorkspaceLocator(
  workspaceLocator: Record<string, unknown>,
): Record<string, unknown> | null {
  const binding = workspaceLocator.package_use_binding;
  if (!isRecord(binding)) return null;
  const rootPackage = packageIdentity(binding.root_package, 'package_use_binding.root_package');
  const providerPackages = Array.isArray(binding.provider_packages)
    ? binding.provider_packages
        .map((entry, index) => packageIdentity(
          entry,
          `package_use_binding.provider_packages[${index}]`,
        ))
        .sort((left, right) => canonicalJsonText(left).localeCompare(canonicalJsonText(right)))
    : [];
  return definedRecord([
    ['surface_kind', 'opl_stage_run_package_closure_identity'],
    ['version', 'opl-stage-run-package-closure-identity.v1'],
    ['root_package', rootPackage],
    ['provider_packages', providerPackages],
    ['dependency_closure_digest', optionalText(binding.dependency_closure_digest)],
    ['core_skill_tree_digest', optionalText(binding.core_skill_tree_digest)],
    ['skill_tree_digest', optionalText(binding.skill_tree_digest)],
  ]);
}

function embeddedSha256(ref: string) {
  const match = ref.match(/@sha256:([0-9a-f]{64})(?:#|$)/i);
  return match ? `sha256:${match[1]!.toLowerCase()}` : null;
}

function packFileBinding(input: {
  domainPackRoot: string;
  purpose: StageRunImmutableContentBinding['purpose'];
  ref: string;
  expectedSha256?: string;
}) {
  const ref = text(input.ref, `${input.purpose}_ref`);
  const embedded = embeddedSha256(ref);
  const fileRef = ref.split('#', 1)[0]!.replace(/@sha256:[0-9a-f]{64}$/i, '');
  if (
    !fileRef
    || path.isAbsolute(fileRef)
    || fileRef.includes('\0')
    || /^[a-z][a-z0-9+.-]*:/i.test(fileRef)
  ) {
    if (embedded) {
      return {
        purpose: input.purpose,
        ref,
        sha256: embedded,
        byte_size: null,
        digest_source: 'embedded_sha256' as const,
      };
    }
    return null;
  }
  const root = fs.realpathSync.native(input.domainPackRoot);
  const candidate = path.resolve(root, fileRef);
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(candidate);
  } catch {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content ref does not exist in the managed package.',
      {
        failure_code: 'stage_run_content_ref_missing',
        purpose: input.purpose,
        ref,
        domain_pack_root: root,
      },
    );
  }
  const relative = path.relative(root, realPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(realPath).isFile()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content ref escapes or is not a file in the managed package.',
      {
        failure_code: 'stage_run_content_ref_not_contained',
        purpose: input.purpose,
        ref,
        domain_pack_root: root,
      },
    );
  }
  const bytes = fs.readFileSync(realPath);
  const actualSha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (input.expectedSha256 && sha256Digest(input.expectedSha256, `${input.purpose}.expected_sha256`) !== actualSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content bytes do not match their declared digest.',
      {
        failure_code: 'stage_run_content_digest_mismatch',
        purpose: input.purpose,
        ref,
        expected_sha256: sha256Digest(input.expectedSha256, `${input.purpose}.expected_sha256`),
        actual_sha256: actualSha256,
      },
    );
  }
  return {
    purpose: input.purpose,
    ref,
    sha256: actualSha256,
    byte_size: bytes.byteLength,
    digest_source: 'pack_file_bytes' as const,
  };
}

function stageRunContentBindings(input: {
  domainPackRoot: string;
  binding: StandardAgentStageQualityRuntimeBinding;
  stagePacketRef: string;
  checkpointRefs: string[];
  lineageRefs: string[];
  inputArtifacts: Array<{ ref: string; sha256: string }>;
}) {
  const artifacts = new Map(input.inputArtifacts.map((entry) => [
    entry.ref,
    sha256Digest(entry.sha256, `input_artifact:${entry.ref}`),
  ]));
  const bindings: StageRunImmutableContentBinding[] = [];
  const bind = (
    purpose: StageRunImmutableContentBinding['purpose'],
    ref: string,
    options: { expectedSha256?: string; artifactAllowed?: boolean } = {},
  ) => {
    const artifactSha256 = options.artifactAllowed ? artifacts.get(ref) : null;
    if (artifactSha256) {
      bindings.push({
        purpose,
        ref,
        sha256: artifactSha256,
        byte_size: null,
        digest_source: 'input_artifact_hash',
      });
      return;
    }
    const resolved = packFileBinding({
      domainPackRoot: input.domainPackRoot,
      purpose,
      ref,
      expectedSha256: options.expectedSha256,
    });
    if (!resolved) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun immutable content ref is not bound to package bytes, an input artifact hash, or an embedded digest.',
        {
          failure_code: 'stage_run_content_ref_unbound',
          purpose,
          ref,
        },
      );
    }
    bindings.push(resolved);
  };
  bind('stage_manifest', input.binding.manifest_ref, {
    expectedSha256: input.binding.manifest_sha256,
  });
  bind('quality_policy', input.binding.policy_ref);
  bind('stage_prompt', input.binding.stage_prompt_ref);
  for (const ref of Object.values(input.binding.role_prompt_refs)) bind('role_prompt', ref);
  for (const ref of input.binding.quality_rubric_refs) bind('quality_rubric', ref);
  for (const ref of input.binding.stage_goal_refs) bind('stage_goal', ref);
  for (const ref of input.binding.source_refs) bind('source', ref);
  for (const ref of input.lineageRefs) bind('lineage', ref);
  bind('stage_packet', input.stagePacketRef, { artifactAllowed: true });
  for (const ref of input.checkpointRefs) bind('checkpoint', ref, { artifactAllowed: true });
  return bindings.sort((left, right) =>
    left.purpose.localeCompare(right.purpose) || left.ref.localeCompare(right.ref));
}

export function validateStageRunImmutableContentBindings(spec: StageRunImmutableSpec) {
  if (!Array.isArray(spec.content_bindings) || spec.content_bindings.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec requires exact content bindings.',
      { failure_code: 'stage_run_content_bindings_missing' },
    );
  }
  const requiredPurposes = new Set<StageRunImmutableContentBinding['purpose']>([
    'stage_manifest',
    'quality_policy',
    'stage_prompt',
    'role_prompt',
    'quality_rubric',
    'stage_goal',
    'source',
    'lineage',
    'stage_packet',
    'checkpoint',
  ]);
  const seen = new Set<string>();
  const allowedDigestSources = new Set<StageRunImmutableContentBinding['digest_source']>([
    'pack_file_bytes',
    'input_artifact_hash',
    'embedded_sha256',
  ]);
  for (const binding of spec.content_bindings) {
    const key = `${binding.purpose}\0${binding.ref}`;
    if (seen.has(key)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun immutable content bindings must be unique by purpose and ref.',
        { failure_code: 'stage_run_content_binding_duplicate', purpose: binding.purpose, ref: binding.ref },
      );
    }
    seen.add(key);
    requiredPurposes.delete(binding.purpose);
    if (!allowedDigestSources.has(binding.digest_source)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun immutable content binding has an unsupported digest source.',
        {
          failure_code: 'stage_run_content_binding_digest_source_invalid',
          purpose: binding.purpose,
          ref: binding.ref,
          digest_source: binding.digest_source,
        },
      );
    }
    sha256Digest(binding.sha256, `content_bindings.${binding.purpose}.sha256`);
    if (binding.byte_size !== null && (!Number.isInteger(binding.byte_size) || binding.byte_size < 0)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun immutable content binding byte_size must be a non-negative integer or null.',
        { purpose: binding.purpose, ref: binding.ref, byte_size: binding.byte_size },
      );
    }
  }
  if (requiredPurposes.size > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content bindings do not cover every executable spec surface.',
      {
        failure_code: 'stage_run_content_binding_coverage_incomplete',
        missing_purposes: [...requiredPurposes].sort(),
      },
    );
  }
  const requiredRefs: Array<[StageRunImmutableContentBinding['purpose'], string]> = [
    ['stage_manifest', spec.stage_manifest.ref],
    ['quality_policy', spec.quality_policy.ref],
    ['stage_packet', spec.stage_packet_ref],
    ...spec.checkpoint_refs.map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['checkpoint', ref]),
    ...Object.values(spec.role_prompt_refs).map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['role_prompt', ref]),
    ...spec.quality_rubric_refs.map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['quality_rubric', ref]),
    ...spec.stage_goal_refs.map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['stage_goal', ref]),
    ...spec.source_refs.map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['source', ref]),
    ...spec.lineage_refs.map((ref): [StageRunImmutableContentBinding['purpose'], string] => ['lineage', ref]),
  ];
  const missingRefs = requiredRefs.filter(([purpose, ref]) => !seen.has(`${purpose}\0${ref}`));
  if (missingRefs.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content bindings do not cover every declared executable ref.',
      {
        failure_code: 'stage_run_content_ref_coverage_incomplete',
        missing_bindings: missingRefs.map(([purpose, ref]) => ({ purpose, ref })),
      },
    );
  }
  const stageManifest = spec.content_bindings.find((entry) =>
    entry.purpose === 'stage_manifest' && entry.ref === spec.stage_manifest.ref);
  if (!stageManifest || stageManifest.sha256 !== sha256Digest(spec.stage_manifest.sha256, 'stage_manifest.sha256')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun manifest bytes binding must match the compiled manifest digest.',
      { failure_code: 'stage_run_manifest_content_binding_mismatch' },
    );
  }
  const qualityPolicy = spec.content_bindings.find((entry) =>
    entry.purpose === 'quality_policy' && entry.ref === spec.quality_policy.ref);
  const stagePacket = spec.content_bindings.find((entry) =>
    entry.purpose === 'stage_packet' && entry.ref === spec.stage_packet_ref);
  if (!qualityPolicy || !stagePacket) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun policy and Stage packet refs require exact content bindings.',
      { failure_code: 'stage_run_primary_content_binding_missing' },
    );
  }
  const artifactDigests = new Map(spec.input_artifacts.map((entry) => [
    entry.ref,
    sha256Digest(entry.sha256, `input_artifacts.${entry.ref}.sha256`),
  ]));
  for (const binding of spec.content_bindings.filter((entry) =>
    entry.purpose === 'stage_packet' || entry.purpose === 'checkpoint')) {
    const artifactDigest = artifactDigests.get(binding.ref);
    if (artifactDigest && binding.sha256 !== artifactDigest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun checkpoint content binding does not match its input artifact digest.',
        {
          failure_code: 'stage_run_checkpoint_artifact_digest_mismatch',
          purpose: binding.purpose,
          ref: binding.ref,
          expected_sha256: artifactDigest,
          received_sha256: binding.sha256,
        },
      );
    }
  }
  const rootPackage = isRecord(spec.package_closure) && isRecord(spec.package_closure.root_package)
    ? spec.package_closure.root_package
    : null;
  if (!rootPackage || !optionalText(rootPackage.content_digest)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec requires a root package content digest.',
      { failure_code: 'stage_run_root_package_content_digest_missing' },
    );
  }
  sha256Digest(rootPackage.content_digest, 'package_closure.root_package.content_digest');
  const providerPackages = Array.isArray(spec.package_closure?.provider_packages)
    ? spec.package_closure.provider_packages
    : [];
  providerPackages.forEach((provider, index) => {
    if (!isRecord(provider) || !optionalText(provider.content_digest)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun immutable spec requires every provider package content digest.',
        {
          failure_code: 'stage_run_provider_package_content_digest_missing',
          provider_index: index,
        },
      );
    }
    sha256Digest(provider.content_digest, `package_closure.provider_packages[${index}].content_digest`);
  });
  return spec;
}

export function verifyStageRunImmutableContentBindingsAtUse(
  spec: StageRunImmutableSpec,
  domainPackRoot: string,
) {
  validateStageRunImmutableContentBindings(spec);
  const artifactDigests = new Map(spec.input_artifacts.map((entry) => [
    entry.ref,
    sha256Digest(entry.sha256, `input_artifacts.${entry.ref}.sha256`),
  ]));
  for (const binding of spec.content_bindings) {
    if (binding.digest_source === 'pack_file_bytes') {
      const current = packFileBinding({
        domainPackRoot,
        purpose: binding.purpose,
        ref: binding.ref,
        expectedSha256: binding.sha256,
      });
      if (!current || current.digest_source !== 'pack_file_bytes') {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun pack content binding no longer resolves to managed package bytes.',
          {
            failure_code: 'stage_run_content_binding_source_drift',
            purpose: binding.purpose,
            ref: binding.ref,
            expected_digest_source: binding.digest_source,
            received_digest_source: current?.digest_source ?? null,
          },
        );
      }
      continue;
    }
    if (binding.digest_source === 'input_artifact_hash') {
      const artifactDigest = artifactDigests.get(binding.ref);
      if (artifactDigest !== binding.sha256) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun input artifact content binding drifted from its immutable artifact digest.',
          {
            failure_code: 'stage_run_input_artifact_binding_drift',
            purpose: binding.purpose,
            ref: binding.ref,
            expected_sha256: binding.sha256,
            received_sha256: artifactDigest ?? null,
          },
        );
      }
      continue;
    }
    const embedded = embeddedSha256(binding.ref);
    if (embedded !== binding.sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun embedded content binding drifted from the digest carried by its ref.',
        {
          failure_code: 'stage_run_embedded_content_binding_drift',
          purpose: binding.purpose,
          ref: binding.ref,
          expected_sha256: binding.sha256,
          received_sha256: embedded,
        },
      );
    }
  }
  return spec;
}

function stableWorkspaceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableWorkspaceValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    if (WORKSPACE_OBSERVATION_FIELDS.has(key)) return [];
    const entry = value[key];
    return entry === undefined ? [] : [[key, stableWorkspaceValue(entry)]];
  }));
}

export function stageRunWorkspaceIdentity(workspaceLocator: Record<string, unknown>) {
  return stableWorkspaceValue(workspaceLocator) as Record<string, unknown>;
}

export function buildCliStageRunInvocationId(input: {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  actionId?: string | null;
  workspaceLocator: Record<string, unknown>;
  taskId?: string | null;
}) {
  return stableId('sri', [
    'cli',
    text(input.domainId, 'domain_id'),
    text(input.stageId, 'stage_id'),
    optionalText(input.actionId),
    stageRunWorkspaceIdentity(input.workspaceLocator),
    optionalText(input.taskId),
  ]);
}

export function buildHostedActionStageRunInvocationId(input: {
  domainId: string;
  stageId: string;
  actionId: string;
  runId: string;
  actionRunRef: string;
}) {
  return stableId('sri', [
    'hosted_action',
    text(input.domainId, 'domain_id'),
    text(input.stageId, 'stage_id'),
    text(input.actionId, 'action_id'),
    text(input.runId, 'run_id'),
    text(input.actionRunRef, 'action_run_ref'),
  ]);
}

export function stageRouteDecisionDigest(decision: Record<string, unknown>) {
  return crypto.createHash('sha256').update(canonicalJsonText(decision)).digest('hex');
}

export function buildStageRouteDecisionIdentity(input: {
  parentStageRunId: string;
  decisiveAttemptRef: string;
  decision: Record<string, unknown>;
}) {
  const routeDecisionSha256 = stageRouteDecisionDigest(input.decision);
  const parentStageRunId = text(input.parentStageRunId, 'parent_stage_run_id');
  const decisiveAttemptRef = text(input.decisiveAttemptRef, 'decisive_attempt_ref');
  return {
    parent_stage_run_id: parentStageRunId,
    decisive_attempt_ref: decisiveAttemptRef,
    parent_route_decision_ref:
      `opl://stage-runs/${encodeURIComponent(parentStageRunId)}/route-decisions/`
      + `${encodeURIComponent(decisiveAttemptRef)}@sha256:${routeDecisionSha256}`,
    route_decision_sha256: routeDecisionSha256,
  };
}

export function buildRouteStageRunInvocation(input: {
  parentStageRunId: string;
  decisiveAttemptRef: string;
  decision: Record<string, unknown>;
  targetStageId: string;
}) {
  const routeDecision = buildStageRouteDecisionIdentity(input);
  const targetStageId = text(input.targetStageId, 'target_stage_id');
  return {
    stage_run_invocation_id: stableId('sri', [
      'route_decision',
      routeDecision.parent_stage_run_id,
      routeDecision.decisive_attempt_ref,
      routeDecision.route_decision_sha256,
      targetStageId,
    ]),
    parent_route_decision_ref: routeDecision.parent_route_decision_ref,
    route_decision_sha256: routeDecision.route_decision_sha256,
  };
}

export function buildStageRunImmutableSpec(input: {
  binding: StandardAgentStageQualityRuntimeBinding;
  domainPackRoot: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint: string | null;
  executorKind?: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  stagePacketRef: string;
  actionId?: string | null;
  taskId?: string | null;
  checkpointRefs?: string[];
  artifactRefs?: string[];
  artifactHashes?: string[];
  parentRouteDecisionRef?: string | null;
}): StageRunImmutableSpec {
  const inputArtifacts = artifactBindings(input.artifactRefs, input.artifactHashes);
  const checkpointRefs = stringList(input.checkpointRefs);
  const lineageRefs = stringList([
    input.binding.policy_ref,
    `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}`,
    input.binding.stage_prompt_ref,
    ...input.binding.lineage_refs,
  ]);
  const packageClosure = immutablePackageClosureFromWorkspaceLocator(input.workspaceLocator);
  if (!packageClosure) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Pack-bound StageRun creation requires an immutable package use binding.',
      {
        failure_code: 'stage_run_package_closure_missing',
        domain_id: input.domainId,
        stage_id: input.stageId,
      },
    );
  }
  return {
    surface_kind: 'opl_stage_run_immutable_spec',
    version: 'opl-stage-run-immutable-spec.v1',
    domain_id: input.domainId,
    stage_id: text(input.stageId, 'stage_id'),
    action_id: optionalText(input.actionId),
    task_id: optionalText(input.taskId),
    workspace_identity: stageRunWorkspaceIdentity(input.workspaceLocator),
    stage_manifest: {
      ref: text(input.binding.manifest_ref, 'stage_manifest_ref'),
      sha256: text(input.binding.manifest_sha256, 'stage_manifest_sha256'),
    },
    quality_policy: {
      ref: text(input.binding.policy_ref, 'quality_policy_ref'),
      body: input.binding.quality_policy as unknown as Record<string, unknown>,
    },
    stage_packet_ref: text(input.stagePacketRef, 'stage_packet_ref'),
    checkpoint_refs: checkpointRefs,
    source_fingerprint: optionalText(input.sourceFingerprint),
    source_refs: stringList(input.binding.source_refs),
    input_artifacts: inputArtifacts,
    content_bindings: stageRunContentBindings({
      domainPackRoot: input.domainPackRoot,
      binding: input.binding,
      stagePacketRef: input.stagePacketRef,
      checkpointRefs,
      lineageRefs,
      inputArtifacts,
    }),
    role_prompt_refs: input.binding.role_prompt_refs,
    quality_rubric_refs: stringList(input.binding.quality_rubric_refs),
    stage_goal_refs: stringList(input.binding.stage_goal_refs),
    lineage_refs: lineageRefs,
    package_closure: packageClosure,
    executor_kind: optionalText(input.executorKind) ?? 'codex_cli',
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy ?? null,
    parent_route_decision_ref: optionalText(input.parentRouteDecisionRef),
  };
}

export function stageRunSpecSha256(spec: StageRunImmutableSpec) {
  return crypto.createHash('sha256').update(canonicalJsonText(spec)).digest('hex');
}

export function validateStageRunImmutableSpecEnvelope(input: {
  spec: StageRunImmutableSpec;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  actionId?: string | null;
  taskId?: string | null;
  workspaceLocator: Record<string, unknown>;
  stageManifestRef: string;
  stageManifestSha256: string;
  qualityPolicyRef: string;
  qualityPolicy: Record<string, unknown>;
  stagePacketRef: string;
  checkpointRefs?: string[];
  sourceFingerprint?: string | null;
  sourceRefs?: string[];
  artifactRefs?: string[];
  artifactHashes?: string[];
  rolePromptRefs: StandardAgentStageQualityRuntimeBinding['role_prompt_refs'];
  qualityRubricRefs: string[];
  stageGoalRefs?: string[];
  lineageRefs?: string[];
  executorKind: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  parentRouteDecisionRef?: string | null;
}) {
  const expected: StageRunImmutableSpec = {
    surface_kind: 'opl_stage_run_immutable_spec',
    version: 'opl-stage-run-immutable-spec.v1',
    domain_id: input.domainId,
    stage_id: text(input.stageId, 'stage_id'),
    action_id: optionalText(input.actionId),
    task_id: optionalText(input.taskId),
    workspace_identity: stageRunWorkspaceIdentity(input.workspaceLocator),
    stage_manifest: {
      ref: text(input.stageManifestRef, 'stage_manifest_ref'),
      sha256: text(input.stageManifestSha256, 'stage_manifest_sha256'),
    },
    quality_policy: {
      ref: text(input.qualityPolicyRef, 'quality_policy_ref'),
      body: input.qualityPolicy,
    },
    stage_packet_ref: text(input.stagePacketRef, 'stage_packet_ref'),
    checkpoint_refs: stringList(input.checkpointRefs),
    source_fingerprint: optionalText(input.sourceFingerprint),
    source_refs: stringList(input.sourceRefs),
    input_artifacts: artifactBindings(input.artifactRefs, input.artifactHashes),
    content_bindings: input.spec.content_bindings,
    role_prompt_refs: input.rolePromptRefs,
    quality_rubric_refs: stringList(input.qualityRubricRefs),
    stage_goal_refs: stringList(input.stageGoalRefs),
    lineage_refs: stringList(input.lineageRefs),
    package_closure: immutablePackageClosureFromWorkspaceLocator(input.workspaceLocator),
    executor_kind: optionalText(input.executorKind) ?? 'codex_cli',
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy ?? null,
    parent_route_decision_ref: optionalText(input.parentRouteDecisionRef),
  };
  if (canonicalJsonText(input.spec) !== canonicalJsonText(expected)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec does not match its exact launch envelope.',
      {
        failure_code: 'stage_run_spec_envelope_mismatch',
        stage_run_spec_sha256: stageRunSpecSha256(input.spec),
        expected_stage_run_spec_sha256: stageRunSpecSha256(expected),
      },
    );
  }
  return input.spec;
}

export function deriveStageRunId(input: {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  stageRunInvocationId: string;
}) {
  return stableId('sr', [
    text(input.domainId, 'domain_id'),
    text(input.stageId, 'stage_id'),
    text(input.stageRunInvocationId, 'stage_run_invocation_id'),
  ]);
}

export function deriveStageRunWorkflowId(stageRunId: string) {
  return stableId('wf_stage_run', [text(stageRunId, 'stage_run_id')]);
}

export function explicitStageRunInvocationId(value: unknown) {
  return text(value, 'stage_run_invocation_id');
}
