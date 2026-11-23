import { createHash } from 'node:crypto';

import {
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  verifyStoredFoundryMaterializedCandidate,
} from '../../authority/evidence/index.ts';
import {
  foundryContentDigest,
  snapshotFromEvents,
  validateAgentBlueprint,
  type MaterializedCandidate,
} from '../../authority/evolution/index.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageRuntimeSourceCheckoutPath,
} from './family-runtime-package-readiness.ts';
import { readStageKnowledgeContext, type StageKnowledgeContext } from './family-runtime-knowledge-context.ts';
import { immutablePackageClosureFromWorkspaceLocator } from './family-runtime-stage-run-identity.ts';

export const FOUNDRY_EVALUATION_STAGE_CANDIDATE = 'foundry_evaluation_stage_candidate';

export type FoundryEvaluationStageCandidate = Readonly<{
  run_id: string;
  generation: number;
  phase: 'evaluation' | 'canary';
  candidate_digest: string;
  case_kind: 'public' | 'protected';
  case_digest: string;
}>;

export type FoundryEvaluationStageAdmission = (input: {
  evaluation: FoundryEvaluationStageCandidate;
  blueprint: ReturnType<typeof validateAgentBlueprint>;
  stageId: string;
  actionId: string | null;
  scopeDigest: string;
  installedClosure: Record<string, unknown> | null;
}) => Promise<{
  authorityRef: string;
  providerPackageIds: readonly string[];
  knowledgeContext: StageKnowledgeContext;
}>;

function candidateBindingFailure(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'foundry_evaluation_stage_candidate_binding_invalid',
    ...details,
  });
}

function readReference(value: unknown): FoundryEvaluationStageCandidate {
  if (
    !isRecord(value)
    || typeof value.run_id !== 'string'
    || !value.run_id.trim()
    || !Number.isSafeInteger(value.generation)
    || Number(value.generation) < 0
    || (value.phase !== 'evaluation' && value.phase !== 'canary')
    || typeof value.candidate_digest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(value.candidate_digest)
    || (value.case_kind !== 'public' && value.case_kind !== 'protected')
    || typeof value.case_digest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(value.case_digest)
  ) {
    candidateBindingFailure('Foundry evaluation StageRun has an invalid candidate reference.');
  }
  return {
    run_id: value.run_id,
    generation: Number(value.generation),
    phase: value.phase,
    candidate_digest: value.candidate_digest,
    case_kind: value.case_kind,
    case_digest: value.case_digest,
  };
}

export function requireEvaluationStageCandidateReference(
  locator: Record<string, unknown>,
  authorization?: FoundryEvaluationStageCandidate,
) {
  const value = locator[FOUNDRY_EVALUATION_STAGE_CANDIDATE];
  if (value === undefined && authorization === undefined) return null;
  const reference = readReference(value);
  if (!authorization || canonicalJsonText(reference) !== canonicalJsonText(authorization)) {
    candidateBindingFailure('Foundry candidate StageRun must start from the trusted evaluation Host.');
  }
  return reference;
}

export async function resolveEvaluationStageCandidate(input: {
  domainId: string;
  workspaceLocator: Record<string, unknown>;
  useBoundaryId: string;
  stageId: string;
  actionId: string | null;
  scopeDigest: string | null;
  admit?: FoundryEvaluationStageAdmission;
}) {
  const value = input.workspaceLocator[FOUNDRY_EVALUATION_STAGE_CANDIDATE];
  if (value === undefined) return null;
  const reference = readReference(value);
  if (!input.admit || !input.scopeDigest) {
    candidateBindingFailure('Candidate execution requires the trusted Host evaluation admission and an isolated work-item scope.', reference);
  }
  const events = await new LedgerFoundryEventStore(undefined, { readOnly: true }).read(reference.run_id);
  const snapshot = snapshotFromEvents(events);
  const expectedState = reference.phase === 'evaluation' ? 'evaluating' : 'canary';
  if (
    snapshot.state !== expectedState
    || snapshot.generation !== reference.generation
    || snapshot.target_domain_id !== input.domainId
    || snapshot.candidate_digest !== reference.candidate_digest
    || !snapshot.candidate_record_digest
  ) {
    candidateBindingFailure('StageRun candidate does not match the active Foundry evaluation generation.', reference);
  }
  const store = new FileFoundryObjectStore(undefined, { readOnly: true });
  const candidate = await store.get<MaterializedCandidate>(snapshot.candidate_record_digest);
  if (!candidate
    || candidate.surface_kind !== 'opl_foundry_materialized_candidate'
    || candidate.target_agent_id !== snapshot.target_agent_id
    || candidate.target_domain_id !== snapshot.target_domain_id
    || candidate.blueprint_digest !== snapshot.blueprint_digest
    || candidate.candidate_digest !== snapshot.candidate_digest
  ) {
    candidateBindingFailure('StageRun candidate record does not match Foundry materialization.', reference);
  }
  const blueprint = validateAgentBlueprint(await store.get(candidate.blueprint_digest));
  const frozenCases = reference.case_kind === 'public'
    ? blueprint.eval_spec.public_cases
    : blueprint.eval_spec.protected_requirements;
  if (blueprint.generation !== reference.generation
    || !frozenCases.some((entry) => foundryContentDigest(entry) === reference.case_digest)
  ) {
    candidateBindingFailure('StageRun case does not match the frozen Foundry EvalSpec.', reference);
  }
  const pack = verifyStoredFoundryMaterializedCandidate(candidate);
  const readiness = await ensureFamilyRuntimePackageLaunchReady({ ...input, nativeCarrierOnly: true });
  const nativeClosure = readiness?.native_package_closure;
  if (readiness && (!nativeClosure || !packageRuntimeSourceCheckoutPath(readiness) || readiness.launch_allowed !== true)) {
    candidateBindingFailure('Foundry evaluation StageRun requires a verified native execution carrier.', reference);
  }
  const admission = await input.admit({
    evaluation: reference, blueprint, stageId: input.stageId, actionId: input.actionId,
    scopeDigest: input.scopeDigest, installedClosure: nativeClosure ?? null,
  });
  const authorityRef = admission.authorityRef?.trim();
  if (!authorityRef) candidateBindingFailure('Candidate evaluation requires a Host admission receipt ref.', reference);
  const context = readStageKnowledgeContext(admission.knowledgeContext, input.domainId, input.stageId);
  if (context.receipt.task_intent !== input.actionId) {
    candidateBindingFailure('Candidate knowledge receipt does not match the Stage action.', reference);
  }
  const rootPackage = {
    package_id: candidate.target_agent_id,
    manifest_sha256: pack.manifest_digest,
    content_digest: candidate.candidate_digest,
    source_artifact_ref: candidate.candidate_ref,
    artifact_digest: candidate.candidate_digest,
  };
  const providerIds = new Set(admission.providerPackageIds);
  const providers = (nativeClosure?.provider_packages as Array<{ package_id: string }> | undefined ?? [])
    .filter((provider) => providerIds.has(provider.package_id));
  if (providers.length !== providerIds.size || providers.some((provider) => provider.package_id === rootPackage.package_id)) {
    candidateBindingFailure('Evaluation provider bindings must select distinct ready provider packages.', reference);
  }
  const closure = {
    root_package: rootPackage,
    provider_packages: providers,
    dependency_closure_digest: `sha256:${createHash('sha256').update(canonicalJsonText({
      root_package: rootPackage,
      provider_packages: providers,
      resource_lock_digest: pack.resource_lock_digest,
      carrier: nativeClosure?.root_package ?? null,
    })).digest('hex')}`,
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
  return {
    domainPackRoot: pack.directory,
    authorityRef,
    knowledgeContext: admission.knowledgeContext,
    closure,
    packageUseBinding: {
      ...closure,
      surface_kind: 'opl_agent_package_use_binding.v1',
      binding_origin: 'foundry_evaluation_candidate',
      use_boundary_id: input.useBoundaryId,
    },
  };
}

export function assertEvaluationStagePackAccess(
  pack: NonNullable<Awaited<ReturnType<typeof resolveEvaluationStageCandidate>>>,
  stage: {
    domain_pack_root?: string | null;
    workspace_locator: Record<string, unknown>;
    stage_run_spec?: { durable_knowledge_context: StageKnowledgeContext } | null;
  },
) {
  if ((stage.domain_pack_root ?? stage.workspace_locator.domain_pack_root) !== pack.domainPackRoot
    || stage.workspace_locator.foundry_evaluation_authority_ref !== pack.authorityRef
    || (stage.stage_run_spec
      && canonicalJsonText(stage.stage_run_spec.durable_knowledge_context) !== canonicalJsonText(pack.knowledgeContext))
    || canonicalJsonText(immutablePackageClosureFromWorkspaceLocator({
      package_use_binding: pack.packageUseBinding,
    })) !== canonicalJsonText(immutablePackageClosureFromWorkspaceLocator(stage.workspace_locator))
  ) {
    candidateBindingFailure('Persisted Stage execution closure differs from the verified Foundry candidate and native dependencies.');
  }
}
