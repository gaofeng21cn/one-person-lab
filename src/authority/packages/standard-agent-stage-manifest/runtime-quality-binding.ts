import crypto from 'node:crypto';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import {
  STANDARD_AGENT_STAGE_MANIFEST_REF,
  readStandardAgentManagedTextFile,
  readStandardAgentStagePromptFile,
} from '../standard-agent-stage-prompt.ts';
import {
  fail,
  readJson,
  readJsonPointer,
  repoFile,
  repoRef,
  record,
  optionalStrings,
  strings,
  text,
} from './repo-validation.ts';
import {
  reviewLaneBinding,
  validateHandoffReviewBoundary,
  validateStageQualityCyclePolicy,
} from './stage-quality-validation.ts';
import type { StandardAgentStageQualityRuntimeBinding } from './types.ts';

const TARGET_STAGE_CONTRACT_EXTENSION_FORBIDDEN_FIELDS = new Set([
  'requires',
  'ensures',
  'boundary_assumptions',
  'properties',
  'expected_receipt_refs',
  'receipt_schema_refs',
  'authority_function_refs',
  'l4_entry_gate',
  'l5_entry_gate',
  'stage_completion_policy',
  'user_stage_log_contract',
  'progress_delta_policy',
  'typed_blocker_lineage_policy',
  'runtime_event_refs',
]);

function assertTargetStageAuthority(value: Record<string, unknown>, field: string, repoDir: string) {
  const forbidden = Object.entries(value).filter(([key, entry]) => (
    (key.startsWith('opl_can_') || key === 'provider_completion_is_domain_completion')
      ? entry !== false
      : (key === 'quality_verdict_owner' || key === 'artifact_authority_owner')
        && optionalString(entry) === 'one-person-lab'
  ));
  if (forbidden.length > 0) {
    fail(`${field} grants forbidden OPL or provider authority.`, {
      repo_dir: repoDir,
      forbidden_authority_fields: forbidden.map(([key]) => key),
    });
  }
}

/**
 * A Stage attempt only needs the identity and contracts of its target Stage.
 * Full-pack compilation remains the qualification/projection path. Keeping
 * this reader here prevents an unrelated later Stage from becoming a launch
 * prerequisite while preserving the target Stage's hard boundaries.
 */
function compileTargetStageBinding(repoDir: string, stageId: string) {
  const descriptor = record(
    readJsonPointer(repoDir, 'contracts/domain_descriptor.json', 'domain_descriptor'),
    'domain_descriptor',
    repoDir,
  );
  if (text(descriptor.surface_kind, 'domain_descriptor.surface_kind', repoDir) !== 'domain_agent_descriptor') {
    fail('domain_descriptor.surface_kind must be domain_agent_descriptor.', { repo_dir: repoDir });
  }
  const domainId = text(descriptor.domain_id, 'domain_descriptor.domain_id', repoDir);
  const actionCatalog = record(
    readJsonPointer(repoDir, 'contracts/action_catalog.json', 'action_catalog'),
    'action_catalog',
    repoDir,
  );
  if (text(actionCatalog.target_domain_id, 'action_catalog.target_domain_id', repoDir) !== domainId) {
    fail('Action catalog target_domain_id must match domain_descriptor.domain_id.', { repo_dir: repoDir });
  }
  const actionIds = new Set(
    Array.isArray(actionCatalog.actions)
      ? actionCatalog.actions
        .filter(isRecord)
        .map((action) => optionalString(action.action_id))
        .filter((value): value is string => Boolean(value))
      : [],
  );
  const manifestRead = readJson(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF, 'stage_manifest_ref');
  const manifest = record(manifestRead.payload, 'stage_manifest', repoDir);
  if (text(manifest.surface_kind, 'stage_manifest.surface_kind', repoDir) !== 'opl_standard_agent_declarative_stage_manifest'
    || text(manifest.version, 'stage_manifest.version', repoDir) !== 'opl-standard-agent-declarative-stage-manifest.v1') {
    fail('Stage manifest kind or version is invalid.', { repo_dir: repoDir, stage_id: stageId });
  }
  if (text(manifest.target_domain_id, 'stage_manifest.target_domain_id', repoDir) !== domainId
    || text(manifest.owner, 'stage_manifest.owner', repoDir) !== domainId) {
    fail('Stage manifest identity must match domain_descriptor.domain_id.', { repo_dir: repoDir, stage_id: stageId });
  }
  if (!Array.isArray(manifest.stages) || manifest.stages.length === 0) {
    fail('Stage manifest must declare at least one stage.', { repo_dir: repoDir });
  }
  const stageRecords = manifest.stages.filter(isRecord);
  const declaredStageIds = stageRecords
    .map((stage) => optionalString(stage.stage_id))
    .filter((value): value is string => Boolean(value));
  const stage = stageRecords.find((entry) => optionalString(entry.stage_id) === stageId);
  if (!stage) {
    fail('Stage quality runtime binding requires a declared target Stage.', {
      repo_dir: repoDir,
      stage_id: stageId,
      stage_manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    });
  }
  if (declaredStageIds.filter((entry) => entry === stageId).length !== 1) {
    fail('Target Stage identity must be unique in the Stage manifest.', {
      repo_dir: repoDir,
      stage_id: stageId,
    });
  }
  const stageKind = text(stage.stage_kind, 'stage.stage_kind', repoDir);
  const declaredStageContract = stage.stage_contract === undefined
    ? {}
    : record(stage.stage_contract, 'stage.stage_contract', repoDir);
  const stageContractExtension = stage.stage_contract_extension === undefined
    ? {}
    : record(stage.stage_contract_extension, 'stage.stage_contract_extension', repoDir);
  const stageContract = { ...declaredStageContract, ...stageContractExtension };
  assertTargetStageAuthority(declaredStageContract, 'stage.stage_contract', repoDir);
  assertTargetStageAuthority(stageContractExtension, 'stage.stage_contract_extension', repoDir);
  const forbiddenExtensionFields = Object.keys(stageContractExtension)
    .filter((field) => TARGET_STAGE_CONTRACT_EXTENSION_FORBIDDEN_FIELDS.has(field));
  if (forbiddenExtensionFields.length > 0) {
    fail('Target Stage contract extension cannot override Framework-owned fields.', {
      repo_dir: repoDir,
      stage_id: stageId,
      forbidden_fields: forbiddenExtensionFields,
    });
  }
  const stagePromptRef = repoRef(repoDir, stage.prompt_ref, 'stage.prompt_ref');
  readStandardAgentStagePromptFile(repoDir, stagePromptRef);
  const stagePolicyRef = repoFile(repoDir, stage.policy_ref, 'stage.policy_ref').ref;
  text(stage.goal, 'stage.goal', repoDir);
  const policyRef = optionalString(stage.stage_quality_cycle_policy_ref);
  const qualityGateRefs = strings(stage.quality_gate_refs, 'stage.quality_gate_refs', repoDir);
  const knowledgeRefs = strings(stage.knowledge_refs, 'stage.knowledge_refs', repoDir);
  const skillRefs = optionalStrings(stage.skill_refs, 'stage.skill_refs', repoDir);
  const policyRefs = optionalStrings(stage.policy_refs, 'stage.policy_refs', repoDir);
  knowledgeRefs.forEach((ref) => readStandardAgentManagedTextFile(repoDir, ref));
  skillRefs.forEach((ref) => readStandardAgentManagedTextFile(repoDir, ref));
  policyRefs.forEach((ref) => readStandardAgentManagedTextFile(repoDir, ref));
  qualityGateRefs.forEach((ref) => repoFile(repoDir, ref, 'stage.quality_gate_refs'));
  const allowedActionRefs = strings(stage.allowed_action_refs, 'stage.allowed_action_refs', repoDir);
  const missingActions = allowedActionRefs.filter((ref) => !actionIds.has(ref));
  if (missingActions.length > 0) {
    fail('Target Stage references missing family actions.', {
      repo_dir: repoDir,
      stage_id: stageId,
      missing_actions: missingActions,
    });
  }
  const nextStageRefs = strings(stage.next_stage_refs, 'stage.next_stage_refs', repoDir);
  const missingStages = nextStageRefs.filter((ref) => !declaredStageIds.includes(ref));
  if (missingStages.length > 0) {
    fail('Target Stage references unresolved next stages.', {
      repo_dir: repoDir,
      stage_id: stageId,
      missing_stages: missingStages,
    });
  }
  const handoffReviewBoundary = validateHandoffReviewBoundary({
    repoDir,
    stageId,
    stageKind,
    value: stage.handoff_review_boundary,
  });
  const policy = policyRef
    ? validateStageQualityCyclePolicy({
      repoDir,
      ref: policyRef,
      stageId,
      stagePromptRef,
      stageRole: optionalString(stage.stage_role),
      handoffReviewBoundary,
    })
    : null;
  const qualityProfileRef = optionalString(manifest.quality_governance_profile_ref);
  if (qualityProfileRef && stage.trust_lane !== 'human_gate' && !policy) {
    fail('Official knowledge-deliverable AI stages require a Stage quality-cycle policy ref.', {
      repo_dir: repoDir,
      stage_id: stageId,
    });
  }
  if (qualityProfileRef && stage.trust_lane !== 'human_gate' && policy && !policy.enabled) {
    fail('Official knowledge-deliverable AI stages must enable their Stage quality cycle.', {
      repo_dir: repoDir,
      stage_id: stageId,
      stage_quality_cycle_policy_ref: policyRef,
    });
  }
  const metaReviewPolicyRef = optionalString(manifest.meta_review_policy_ref);
  const metaReviewPolicy = metaReviewPolicyRef
    ? record(readJsonPointer(repoDir, metaReviewPolicyRef, `meta_review_policy:${stageId}`), `meta_review_policy:${stageId}`, repoDir)
    : null;
  const maxRouteBackRounds = metaReviewPolicy?.max_route_back_rounds;
  if (metaReviewPolicy
    && (!Number.isInteger(maxRouteBackRounds) || Number(maxRouteBackRounds) < 0 || Number(maxRouteBackRounds) > 3)) {
    fail('Meta Review route-back budget must be an integer between zero and three.', {
      repo_dir: repoDir,
      stage_id: stageId,
      max_route_back_rounds: maxRouteBackRounds,
    });
  }
  return {
    domainId,
    stage,
    stageContract,
    stagePolicyRef,
    stageIndex: manifest.stages.findIndex((entry) => entry === stage),
    declaredStageIds,
    manifestSha256: crypto.createHash('sha256').update(manifestRead.source).digest('hex'),
    policyRef,
    policy,
    metaReviewPolicy,
    handoffReviewBoundary,
    qualityProfileRef,
    knowledgeRefs,
    skillRefs,
    policyRefs,
  };
}

export function resolveStandardAgentStageTargetBinding(
  repoDirInput: string,
  stageIdInput: string,
) {
  const repoDir = path.resolve(repoDirInput);
  const stageId = text(stageIdInput, 'stage_id', repoDir);
  return compileTargetStageBinding(repoDir, stageId);
}

export function resolveStandardAgentStageQualityRuntimeBinding(
  repoDirInput: string,
  stageIdInput: string,
): StandardAgentStageQualityRuntimeBinding | null {
  const repoDir = path.resolve(repoDirInput);
  const stageId = text(stageIdInput, 'stage_id', repoDir);
  const compilation = compileTargetStageBinding(repoDir, stageId);
  const stage = compilation.stage;
  const policyRef = compilation.policyRef;
  if (!policyRef) return null;
  const policy = compilation.policy!;
  const metaReviewPolicy = compilation.metaReviewPolicy;
  const maxRouteBackRounds = metaReviewPolicy?.max_route_back_rounds;
  if (
    metaReviewPolicy
    && (!Number.isInteger(maxRouteBackRounds) || Number(maxRouteBackRounds) < 0 || Number(maxRouteBackRounds) > 3)
  ) {
    fail('Meta Review route-back budget must be an integer between zero and three.', {
      repo_dir: repoDir,
      stage_id: stageId,
      max_route_back_rounds: maxRouteBackRounds,
    });
  }
  const routeBudget = metaReviewPolicy
    ? { max_route_back_rounds: Number(maxRouteBackRounds), route_back_rounds_used: 0 }
    : null;
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    compile_mode: 'target_stage_binding',
    stage_id: text(stage.stage_id, 'stage.stage_id', repoDir),
    declared_stage_ids: compilation.declaredStageIds,
    enabled: policy.enabled,
    stage_role: optionalString(stage.stage_role),
    policy_ref: policyRef,
    stage_prompt_ref: policy.stage_prompt_ref,
    quality_policy: policy.quality_policy,
    route_budget: routeBudget,
    handoff_review_boundary: compilation.handoffReviewBoundary,
    review_lane_binding: reviewLaneBinding(compilation.stageContract, repoDir),
    role_prompt_refs: policy.role_prompt_refs,
    quality_rubric_refs: policy.quality_rubric_refs,
    knowledge_refs: compilation.knowledgeRefs,
    skill_refs: compilation.skillRefs,
    policy_refs: compilation.policyRefs,
    stage_goal_refs: [`${STANDARD_AGENT_STAGE_MANIFEST_REF}#/stages/${compilation.stageIndex}/goal`],
    source_refs: [compilation.stagePolicyRef],
    lineage_refs: [`${STANDARD_AGENT_STAGE_MANIFEST_REF}#/stages/${compilation.stageIndex}`],
    manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    manifest_sha256: compilation.manifestSha256,
  };
}
