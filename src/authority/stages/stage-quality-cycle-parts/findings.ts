import type { StageQualityFinding, StageQualityOutcome, StageQualityReReviewResult, StageQualityRepairMapEntry } from "./types.ts";
import { FrameworkContractError } from "../../../kernel/contract-validation.ts";
import { evidenceRefStrings, requiredText, uniqueIds } from "./primitives.ts";

export function validateStageQualityFindings(findings: StageQualityFinding[]) {
  if (!Array.isArray(findings)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage Review findings must be an array.');
  }
  const normalized = findings.map((finding) => {
    const findingId = requiredText(finding.finding_id, 'finding_id');
    if (!['critical', 'major', 'minor'].includes(finding.severity)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage Review finding severity is invalid.', {
        finding_id: findingId,
        severity: finding.severity,
      });
    }
    if (typeof finding.required !== 'boolean') {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage Review finding required must be boolean.', {
        finding_id: findingId,
      });
    }
    return {
      ...finding,
      finding_id: findingId,
      evidence_refs: evidenceRefStrings(finding.evidence_refs, `findings.${findingId}.evidence_refs`),
      repair_expectation: requiredText(
        finding.repair_expectation,
        `findings.${findingId}.repair_expectation`,
      ),
    };
  });
  uniqueIds(normalized.map((finding) => finding.finding_id), 'findings');
  return normalized;
}

export function validateInitialStageQualityReviewOutcome(input: {
  outcome: StageQualityOutcome;
  findings: StageQualityFinding[];
}) {
  const findings = validateStageQualityFindings(input.findings);
  const requiredFindingIds = findings
    .filter((finding) => finding.required)
    .map((finding) => finding.finding_id);
  if (input.outcome === 'repair_required' && requiredFindingIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Initial Review outcome repair_required requires at least one required finding.',
      { outcome: input.outcome },
    );
  }
  if (['pass', 'quality_debt'].includes(input.outcome) && requiredFindingIds.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Initial Review outcome ${input.outcome} cannot carry an open required finding.`,
      { outcome: input.outcome, open_required_finding_ids: requiredFindingIds },
    );
  }
  return findings;
}

export function validateStageQualityRepairMap(input: {
  findings: StageQualityFinding[];
  repairMap: StageQualityRepairMapEntry[];
}) {
  const findings = validateStageQualityFindings(input.findings);
  if (!Array.isArray(input.repairMap)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage repair_map must be an array.');
  }
  const requiredIds = new Set(findings.filter((finding) => finding.required).map((finding) => finding.finding_id));
  const normalized = input.repairMap.map((entry) => {
    const findingId = requiredText(entry.finding_id, 'repair_map.finding_id');
    if (!requiredIds.has(findingId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_map references a non-required finding.', {
        finding_id: findingId,
      });
    }
    if (!['repaired', 'not_repaired', 'blocked'].includes(entry.repair_status)) {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_map repair_status is invalid.', {
        finding_id: findingId,
        repair_status: entry.repair_status,
      });
    }
    return {
      ...entry,
      finding_id: findingId,
      changed_artifact_refs: evidenceRefStrings(
        entry.changed_artifact_refs,
        `repair_map.${findingId}.changed_artifact_refs`,
        true, // A not_repaired or blocked repair need not claim an artifact change.
      ),
      repair_evidence_refs: evidenceRefStrings(
        entry.repair_evidence_refs,
        `repair_map.${findingId}.repair_evidence_refs`,
      ),
    };
  });
  uniqueIds(normalized.map((entry) => entry.finding_id), 'repair_map');
  const missing = [...requiredIds].filter((findingId) =>
    !normalized.some((entry) => entry.finding_id === findingId)
  );
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'repair_map must cover every required finding.', {
      missing_finding_ids: missing,
    });
  }
  return normalized;
}

export function evaluateStageQualityFindingClosure(input: {
  findings: StageQualityFinding[];
  repairMap: StageQualityRepairMapEntry[];
  reReview: StageQualityReReviewResult;
}) {
  const findings = validateStageQualityFindings(input.findings);
  validateStageQualityRepairMap({ findings, repairMap: input.repairMap });
  const requiredIds = new Set(findings.filter((finding) => finding.required).map((finding) => finding.finding_id));
  if (!Array.isArray(input.reReview.finding_closures)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review finding_closures must be an array.');
  }
  const closures = input.reReview.finding_closures.map((closure) => {
    const findingId = requiredText(closure.finding_id, 'finding_closures.finding_id');
    if (!requiredIds.has(findingId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Re-review closure references an unknown required finding.', {
        finding_id: findingId,
      });
    }
    if (!['closed', 'partially_closed', 'still_open'].includes(closure.status)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Re-review closure status is invalid.', {
        finding_id: findingId,
        status: closure.status,
      });
    }
    return {
      ...closure,
      finding_id: findingId,
      evidence_refs: evidenceRefStrings(
        closure.evidence_refs,
        `finding_closures.${findingId}.evidence_refs`,
      ),
    };
  });
  uniqueIds(closures.map((closure) => closure.finding_id), 'finding_closures');
  const missing = [...requiredIds].filter((findingId) =>
    !closures.some((closure) => closure.finding_id === findingId)
  );
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review must close or retain every required finding.', {
      missing_finding_ids: missing,
    });
  }
  const regressions = validateStageQualityFindings(input.reReview.repair_regressions);
  const criticalNewFindings = validateStageQualityFindings(input.reReview.critical_new_findings);
  if (regressions.some((finding) => !finding.required)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'repair_regressions that trigger another repair round must declare required=true.',
    );
  }
  if (criticalNewFindings.some((finding) => finding.severity !== 'critical')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'critical_new_findings may contain only critical findings.',
    );
  }
  if (criticalNewFindings.some((finding) => !finding.required)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'critical_new_findings that trigger another repair round must declare required=true.',
    );
  }
  uniqueIds([
    ...findings.map((finding) => finding.finding_id),
    ...regressions.map((finding) => finding.finding_id),
    ...criticalNewFindings.map((finding) => finding.finding_id),
  ], 'finding_ids_across_prior_regression_and_critical_new_collections');
  if (!Array.isArray(input.reReview.optional_observations)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review optional_observations must be an array.');
  }
  const optionalObservations = input.reReview.optional_observations.map((observation) => ({
    ...observation,
    observation_id: requiredText(observation.observation_id, 'optional_observations.observation_id'),
    evidence_refs: evidenceRefStrings(
      observation.evidence_refs,
      `optional_observations.${observation.observation_id}.evidence_refs`,
    ),
    summary: requiredText(observation.summary, `optional_observations.${observation.observation_id}.summary`),
  }));
  uniqueIds(optionalObservations.map((observation) => observation.observation_id), 'optional_observations');
  const openFindingIds = closures
    .filter((closure) => closure.status !== 'closed')
    .map((closure) => closure.finding_id);
  return {
    trigger_repair: openFindingIds.length > 0 || regressions.length > 0 || criticalNewFindings.length > 0,
    open_required_finding_ids: openFindingIds,
    repair_regression_ids: regressions.map((finding) => finding.finding_id),
    critical_new_finding_ids: criticalNewFindings.map((finding) => finding.finding_id),
    optional_observation_ids: optionalObservations.map((observation) => observation.observation_id),
    optional_observations_do_not_trigger_repair: true,
  } as const;
}

export function validateStageQualityReReviewOutcome(input: {
  outcome: StageQualityOutcome;
  closure: ReturnType<typeof evaluateStageQualityFindingClosure>;
}) {
  if (input.outcome === 'blocked' || input.outcome === 'human_gate') {
    return input.outcome;
  }
  if (input.closure.trigger_repair && input.outcome !== 'repair_required') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review with open required findings or repair regressions must return outcome repair_required.',
      {
        outcome: input.outcome,
        open_required_finding_ids: input.closure.open_required_finding_ids,
        repair_regression_ids: input.closure.repair_regression_ids,
        critical_new_finding_ids: input.closure.critical_new_finding_ids,
      },
    );
  }
  if (!input.closure.trigger_repair && input.outcome === 'repair_required') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review outcome repair_required requires an open required finding, repair regression, or critical new finding.',
      { outcome: input.outcome },
    );
  }
  return input.outcome;
}

export function classifyStageQualityReReviewBudget(input: {
  closure: ReturnType<typeof evaluateStageQualityFindingClosure>;
  qualityRoundIndex: unknown;
  maxRepairRounds: unknown;
}) {
  const round = Number(input.qualityRoundIndex);
  const maxRounds = Number(input.maxRepairRounds);
  if (
    !Number.isInteger(round)
    || !Number.isInteger(maxRounds)
    || round < 1
    || maxRounds < 1
    || round > maxRounds
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair-budget identity requires 1 <= quality_round_index <= max_repair_rounds.',
      { quality_round_index: input.qualityRoundIndex, max_repair_rounds: input.maxRepairRounds },
    );
  }
  if (!input.closure.trigger_repair) return 'terminal_normal' as const;
  return round < maxRounds ? 'continue_repair' as const : 'terminal_quality_debt' as const;
}
