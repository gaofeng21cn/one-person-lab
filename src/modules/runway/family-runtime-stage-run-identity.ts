import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import {
  buildStageRunImmutableContentBindings,
  canonicalStageRunSha256,
  revalidateStageRunImmutableContentBindings,
  type StageRunImmutableContentBinding,
} from './family-runtime-stage-run-identity-parts/content-bindings.ts';

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
    identity_receipt_ref: string | null;
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

const WORKSPACE_OBSERVATION_FIELDS = new Set([
  'checked_at',
  'checkout_currentness',
  'currentness_observation',
  'domain_pack_root',
  'package_status',
  'package_use_binding',
  'runtime_source_readiness',
  'stage_run_currentness_admission',
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

function optionalSha256(value: unknown, field: string) {
  return value === null || value === undefined || value === ''
    ? null
    : canonicalStageRunSha256(value, field);
}

function stringList(values: unknown) {
  return Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()))]
    : [];
}

export function canonicalStageRunInputArtifacts(
  refs: unknown,
  hashes: unknown,
  receiptRefs: unknown,
) {
  const artifactRefs = Array.isArray(refs) ? refs : [];
  const artifactHashes = Array.isArray(hashes) ? hashes : [];
  const artifactReceiptRefs = Array.isArray(receiptRefs) ? receiptRefs : [];
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable input artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  if (artifactReceiptRefs.length !== 0 && artifactReceiptRefs.length !== artifactRefs.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun artifact identity receipt refs must be omitted or pair exactly with artifact refs and hashes.',
      {
        artifact_ref_count: artifactRefs.length,
        artifact_identity_receipt_ref_count: artifactReceiptRefs.length,
      },
    );
  }
  const byRef = new Map<string, { sha256: string; identity_receipt_ref: string | null }>();
  artifactRefs.forEach((ref, index) => {
    const artifactRef = text(ref, `input_artifact_refs[${index}]`);
    const artifactHash = canonicalStageRunSha256(
      artifactHashes[index],
      `input_artifact_hashes[${index}]`,
    );
    const identityReceiptRef = optionalText(artifactReceiptRefs[index]);
    const existing = byRef.get(artifactRef);
    if (existing && (
      existing.sha256 !== artifactHash
      || existing.identity_receipt_ref !== identityReceiptRef
    )) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun input artifact ref cannot be bound to conflicting hashes or receipts.',
        {
          artifact_ref: artifactRef,
          existing_sha256: existing.sha256,
          received_sha256: artifactHash,
          existing_identity_receipt_ref: existing.identity_receipt_ref,
          received_identity_receipt_ref: identityReceiptRef,
        },
      );
    }
    byRef.set(artifactRef, { sha256: artifactHash, identity_receipt_ref: identityReceiptRef });
  });
  return [...byRef.entries()]
    .map(([ref, identity]) => ({ ref, ...identity }))
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
  return definedRecord([
    ['package_id', text(value.package_id, `${field}.package_id`)],
    ['package_version', optionalText(value.package_version)],
    ['owner_language_version', isRecord(value.owner_language_version) ? value.owner_language_version : null],
    ['package_lock_ref', optionalText(value.package_lock_ref)],
    ['manifest_sha256', optionalSha256(value.manifest_sha256, `${field}.manifest_sha256`)],
    ['content_digest', optionalSha256(value.content_digest, `${field}.content_digest`)],
    ['source_artifact_ref', optionalText(value.source_artifact_ref)],
    ['artifact_digest', optionalSha256(value.artifact_digest, `${field}.artifact_digest`)],
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
    ['dependency_closure_digest', optionalSha256(
      binding.dependency_closure_digest,
      'package_use_binding.dependency_closure_digest',
    )],
    ['core_skill_tree_digest', binding.core_skill_tree_digest === null || binding.core_skill_tree_digest === undefined
      ? null
      : canonicalStageRunSha256(binding.core_skill_tree_digest, 'package_use_binding.core_skill_tree_digest')],
    ['skill_tree_digest', binding.skill_tree_digest === null || binding.skill_tree_digest === undefined
      ? null
      : canonicalStageRunSha256(binding.skill_tree_digest, 'package_use_binding.skill_tree_digest')],
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
  artifactIdentityReceiptRefs?: string[];
  parentRouteDecisionRef?: string | null;
}): StageRunImmutableSpec {
  const checkpointRefs = stringList(input.checkpointRefs);
  const sourceRefs = stringList(input.binding.source_refs);
  const qualityRubricRefs = stringList(input.binding.quality_rubric_refs);
  const stageGoalRefs = stringList(input.binding.stage_goal_refs);
  const lineageRefs = stringList([
    input.binding.policy_ref,
    `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}`,
    input.binding.stage_prompt_ref,
    ...input.binding.lineage_refs,
  ]);
  const inputArtifacts = canonicalStageRunInputArtifacts(
    input.artifactRefs,
    input.artifactHashes,
    input.artifactIdentityReceiptRefs,
  );
  const workspaceRoot = optionalText(input.workspaceLocator.workspace_root)
    ?? optionalText(input.workspaceLocator.repo_root);
  const contentBindings = buildStageRunImmutableContentBindings({
    domainId: input.domainId,
    domainPackRoot: text(input.domainPackRoot, 'domain_pack_root'),
    workspaceRoot,
    stageManifest: {
      ref: text(input.binding.manifest_ref, 'stage_manifest_ref'),
      sha256: canonicalStageRunSha256(input.binding.manifest_sha256, 'stage_manifest_sha256'),
    },
    qualityPolicyRef: text(input.binding.policy_ref, 'quality_policy_ref'),
    stagePromptRef: text(input.binding.stage_prompt_ref, 'stage_prompt_ref'),
    rolePromptRefs: Object.values(input.binding.role_prompt_refs),
    qualityRubricRefs,
    stageGoalRefs,
    sourceRefs,
    lineageRefs,
    stagePacketRef: text(input.stagePacketRef, 'stage_packet_ref'),
    checkpointRefs,
    inputArtifacts,
  });
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
      sha256: canonicalStageRunSha256(input.binding.manifest_sha256, 'stage_manifest_sha256'),
    },
    quality_policy: {
      ref: text(input.binding.policy_ref, 'quality_policy_ref'),
      body: input.binding.quality_policy as unknown as Record<string, unknown>,
    },
    stage_packet_ref: text(input.stagePacketRef, 'stage_packet_ref'),
    checkpoint_refs: checkpointRefs,
    source_fingerprint: input.sourceFingerprint === null
      ? null
      : canonicalStageRunSha256(input.sourceFingerprint, 'source_fingerprint'),
    source_refs: sourceRefs,
    input_artifacts: inputArtifacts,
    content_bindings: contentBindings,
    role_prompt_refs: input.binding.role_prompt_refs,
    quality_rubric_refs: qualityRubricRefs,
    stage_goal_refs: stageGoalRefs,
    lineage_refs: lineageRefs,
    package_closure: immutablePackageClosureFromWorkspaceLocator(input.workspaceLocator),
    executor_kind: optionalText(input.executorKind) ?? 'codex_cli',
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy ?? null,
    parent_route_decision_ref: optionalText(input.parentRouteDecisionRef),
  };
}

export function stageRunSpecSha256(spec: StageRunImmutableSpec) {
  return crypto.createHash('sha256').update(canonicalJsonText(spec)).digest('hex');
}

export function canonicalStageAttemptDeclaredStageIds(value: unknown) {
  const declaredStageIds = stringList(value).sort();
  if (declaredStageIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Attempt execution content binding requires at least one declared Stage id.',
      { failure_code: 'stage_attempt_execution_declared_stages_missing' },
    );
  }
  return declaredStageIds;
}

export function stageAttemptExecutionContentBindingSha256(input: {
  parent_stage_run_spec_sha256: string;
  use_boundary_id: string;
  spec_sha256: string;
  spec: StageRunImmutableSpec;
  declared_stage_ids: string[];
}) {
  return crypto.createHash('sha256').update(canonicalJsonText({
    parent_stage_run_spec_sha256: text(
      input.parent_stage_run_spec_sha256,
      'parent_stage_run_spec_sha256',
    ),
    use_boundary_id: text(input.use_boundary_id, 'use_boundary_id'),
    spec_sha256: text(input.spec_sha256, 'spec_sha256'),
    spec: input.spec,
    declared_stage_ids: canonicalStageAttemptDeclaredStageIds(input.declared_stage_ids),
  })).digest('hex');
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
  artifactIdentityReceiptRefs?: string[];
  rolePromptRefs: StandardAgentStageQualityRuntimeBinding['role_prompt_refs'];
  qualityRubricRefs: string[];
  stageGoalRefs?: string[];
  lineageRefs?: string[];
  executorKind: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  parentRouteDecisionRef?: string | null;
}) {
  const inputArtifacts = canonicalStageRunInputArtifacts(
    input.artifactRefs,
    input.artifactHashes,
    input.artifactIdentityReceiptRefs,
  );
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
      sha256: canonicalStageRunSha256(input.stageManifestSha256, 'stage_manifest_sha256'),
    },
    quality_policy: {
      ref: text(input.qualityPolicyRef, 'quality_policy_ref'),
      body: input.qualityPolicy,
    },
    stage_packet_ref: text(input.stagePacketRef, 'stage_packet_ref'),
    checkpoint_refs: stringList(input.checkpointRefs),
    source_fingerprint: input.sourceFingerprint === null || input.sourceFingerprint === undefined
      ? null
      : canonicalStageRunSha256(input.sourceFingerprint, 'source_fingerprint'),
    source_refs: stringList(input.sourceRefs),
    input_artifacts: inputArtifacts,
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

export function revalidateStageRunImmutableSpecContent(input: {
  spec: StageRunImmutableSpec;
  domainPackRoot: string;
  workspaceLocator: Record<string, unknown>;
  skipManagedPackBytes?: boolean;
}) {
  const required = [
    ['stage_manifest', input.spec.stage_manifest.ref],
    ['quality_policy', input.spec.quality_policy.ref],
    ['stage_packet', input.spec.stage_packet_ref],
    ...input.spec.checkpoint_refs.map((ref) => ['checkpoint', ref]),
    ...Object.values(input.spec.role_prompt_refs).map((ref) => ['role_prompt', ref]),
    ...input.spec.quality_rubric_refs.map((ref) => ['quality_rubric', ref]),
    ...input.spec.stage_goal_refs.map((ref) => ['stage_goal', ref]),
    ...input.spec.source_refs.map((ref) => ['source', ref]),
    ...input.spec.lineage_refs.map((ref) => ['lineage', ref]),
  ] as Array<[StageRunImmutableContentBinding['purpose'], string]>;
  const missing = required.filter(([purpose, ref]) => !input.spec.content_bindings.some(
    (binding) => binding.purpose === purpose && binding.ref === ref,
  ));
  const stagePromptBindings = input.spec.content_bindings.filter((binding) => (
    binding.purpose === 'stage_prompt'
    && input.spec.lineage_refs.includes(binding.ref)
  ));
  const artifactMissing = input.spec.input_artifacts.filter((artifact) => !input.spec.content_bindings.some(
    (binding) => binding.ref === artifact.ref && binding.sha256 === artifact.sha256,
  ));
  if (missing.length > 0 || stagePromptBindings.length !== 1 || artifactMissing.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable content bindings do not cover the exact executable spec refs.',
      {
        failure_code: 'stage_run_content_binding_coverage_incomplete',
        missing_bindings: missing.map(([purpose, ref]) => ({ purpose, ref })),
        stage_prompt_binding_count: stagePromptBindings.length,
        missing_input_artifact_refs: artifactMissing.map((artifact) => artifact.ref),
      },
    );
  }
  const managedPurposes = new Set<StageRunImmutableContentBinding['purpose']>([
    'stage_manifest',
    'quality_policy',
    'stage_prompt',
    'role_prompt',
    'quality_rubric',
    'stage_goal',
    'lineage',
  ]);
  const invalidManagedBindings = input.spec.content_bindings.filter((binding) => (
    managedPurposes.has(binding.purpose)
    && binding.verification_kind !== 'managed_pack_file_bytes'
  ));
  if (invalidManagedBindings.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun pack-owned manifests, prompts, policies, rubrics, goals, and lineage must bind managed package bytes.',
      {
        failure_code: 'stage_run_pack_content_binding_authority_mismatch',
        invalid_bindings: invalidManagedBindings.map((binding) => ({
          purpose: binding.purpose,
          ref: binding.ref,
          verification_kind: binding.verification_kind,
        })),
      },
    );
  }
  revalidateStageRunImmutableContentBindings({
    domainId: input.spec.domain_id,
    domainPackRoot: text(input.domainPackRoot, 'domain_pack_root'),
    workspaceRoot: optionalText(input.workspaceLocator.workspace_root)
      ?? optionalText(input.workspaceLocator.repo_root),
    bindings: input.spec.content_bindings,
    skipManagedPackBytes: input.skipManagedPackBytes,
  });
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
