import type { WorkItemExecutionScopeSnapshot } from '../authority/workspace/public/standard-agent-action-runtime.ts';
import { foundryContentDigest, type EvaluationCaseExecutor } from '../authority/evolution/index.ts';
import { FOUNDRY_EVALUATION_STAGE_CANDIDATE, runFamilyRuntime, type FoundryEvaluationStageAdmission, type FoundryEvaluationStageCandidate } from '../adapters/execution/index.ts';
import { canonicalJsonText } from '../kernel/canonical-json.ts';
import { FrameworkContractError } from '../kernel/contract-validation.ts';
import { createCordisStageRouteComposition } from './plugins/cordis-agent-executor-experiment.ts';

type EvaluationCase = Parameters<EvaluationCaseExecutor['runPublicCase']>[0]
  | Parameters<EvaluationCaseExecutor['runProtectedRequirement']>[0];

export function launchFoundryCandidateStageRun(input: {
  evaluationCase: EvaluationCase;
  admitEvaluationStage: FoundryEvaluationStageAdmission;
  executionScope: WorkItemExecutionScopeSnapshot;
  stageId: string;
  actionId: string;
  invocationId: string;
  inputArtifacts?: ReadonlyArray<{ ref: string; sha256: string }>;
}) {
  const { evaluationCase, executionScope } = input;
  if (evaluationCase.subject.kind !== 'candidate' || !evaluationCase.subject.candidate_pack) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Foundry candidate StageRun requires a verified candidate evaluation subject.',
      { failure_code: 'foundry_evaluation_stage_candidate_binding_invalid' },
    );
  }
  const candidate = evaluationCase.subject.candidate;
  const evaluationCandidate: FoundryEvaluationStageCandidate = {
    run_id: evaluationCase.run_id,
    generation: evaluationCase.generation,
    phase: evaluationCase.phase,
    candidate_digest: candidate.candidate_digest,
    case_kind: 'test_case' in evaluationCase ? 'public' : 'protected',
    case_digest: foundryContentDigest('test_case' in evaluationCase ? evaluationCase.test_case : evaluationCase.requirement),
  };
  const locator = {
    workspace_root: executionScope.workspace_root,
    execution_scope: executionScope,
    [FOUNDRY_EVALUATION_STAGE_CANDIDATE]: evaluationCandidate,
  };
  const args = [
    'attempt', 'create',
    '--domain', candidate.target_domain_id,
    '--stage', input.stageId,
    '--action', input.actionId,
    '--provider', 'temporal',
    '--workspace-locator', canonicalJsonText(locator),
    '--scope-kind', 'work_item',
    '--execution-scope', canonicalJsonText(executionScope),
    '--stage-run-invocation-id', foundryContentDigest({
      evaluation: evaluationCandidate, invocation_id: input.invocationId,
    }),
    '--source-fingerprint', candidate.candidate_digest,
    '--task', evaluationCase.run_id,
    '--start',
  ];
  for (const artifact of input.inputArtifacts ?? []) {
    args.push('--input-artifact-ref', artifact.ref, '--input-artifact-sha256', artifact.sha256);
  }
  return runFamilyRuntime(args, {
    stageRunRuntime: { evaluationCandidate, admitEvaluationStage: input.admitEvaluationStage },
    createStageRouteComposition: createCordisStageRouteComposition,
  });
}
