import crypto from 'node:crypto';

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
  role_prompt_refs: StandardAgentStageQualityRuntimeBinding['role_prompt_refs'];
  quality_rubric_refs: string[];
  stage_goal_refs: string[];
  lineage_refs: string[];
  package_closure: Record<string, unknown> | null;
  executor_kind: string;
  stage_attempt_executor_policy: Record<string, unknown> | null;
  parent_route_decision_ref: string | null;
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
    const artifactHash = text(artifactHashes[index], `input_artifact_hashes[${index}]`);
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

function packageIdentity(value: unknown) {
  if (!isRecord(value)) return null;
  return definedRecord([
    ['package_id', optionalText(value.package_id)],
    ['package_version', optionalText(value.package_version)],
    ['owner_language_version', isRecord(value.owner_language_version) ? value.owner_language_version : null],
    ['package_lock_ref', optionalText(value.package_lock_ref)],
    ['manifest_sha256', optionalText(value.manifest_sha256)],
    ['content_digest', optionalText(value.content_digest)],
    ['source_artifact_ref', optionalText(value.source_artifact_ref)],
    ['artifact_digest', optionalText(value.artifact_digest)],
  ]);
}

export function immutablePackageClosureFromWorkspaceLocator(
  workspaceLocator: Record<string, unknown>,
): Record<string, unknown> | null {
  const binding = workspaceLocator.package_use_binding;
  if (!isRecord(binding)) return null;
  const rootPackage = packageIdentity(binding.root_package);
  const providerPackages = Array.isArray(binding.provider_packages)
    ? binding.provider_packages
        .map(packageIdentity)
        .filter((entry): entry is Record<string, unknown> => entry !== null)
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
    checkpoint_refs: stringList(input.checkpointRefs),
    source_fingerprint: optionalText(input.sourceFingerprint),
    source_refs: stringList(input.binding.source_refs),
    input_artifacts: artifactBindings(input.artifactRefs, input.artifactHashes),
    role_prompt_refs: input.binding.role_prompt_refs,
    quality_rubric_refs: stringList(input.binding.quality_rubric_refs),
    stage_goal_refs: stringList(input.binding.stage_goal_refs),
    lineage_refs: stringList([
      input.binding.policy_ref,
      `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}`,
      input.binding.stage_prompt_ref,
      ...input.binding.lineage_refs,
    ]),
    package_closure: immutablePackageClosureFromWorkspaceLocator(input.workspaceLocator),
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

export function explicitStageRunInvocationId(value: unknown) {
  return text(value, 'stage_run_invocation_id');
}
