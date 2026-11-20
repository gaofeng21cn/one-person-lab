import assert from 'node:assert/strict';
import test from 'node:test';

import contract from '../../contracts/opl-framework/stage-quality-cycle-contract.json' with { type: 'json' };
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import {
  repairObservationsFromCloseoutRouteImpact,
} from '../../src/adapters/execution/family-runtime-temporal-workflow-artifacts.ts';
import {
  analyzeStageQualityRepairMap,
  evaluateStageQualityFindingClosure,
  validateStageQualityRepairMap,
  validateStageQualityRepairObservations,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageQualityRepairObservation,
} from '../../src/authority/stages/stage-quality-cycle.ts';

const F1: StageQualityFinding = {
  finding_id: 'F1',
  severity: 'major',
  required: true,
  evidence_refs: ['artifact:initial'],
  repair_expectation: 'Repair the required defect.',
};

const F2: StageQualityFinding = {
  finding_id: 'F2',
  severity: 'minor',
  required: false,
  evidence_refs: ['artifact:initial'],
  repair_expectation: 'Optional improvement.',
};

const FINDINGS = [F1, F2];

function repairEntry(
  findingId: string,
  overrides: Partial<StageQualityRepairMapEntry> = {},
): StageQualityRepairMapEntry {
  return {
    finding_id: findingId,
    repair_status: 'repaired',
    changed_artifact_refs: ['artifact:repaired'],
    repair_evidence_refs: ['evidence:repair'],
    ...overrides,
  };
}

function observationEntry(
  findingId: string,
  overrides: Partial<StageQualityRepairObservation> = {},
): StageQualityRepairObservation {
  return {
    ...repairEntry(findingId),
    ...overrides,
  };
}

test('strict repair_map still rejects known non-required over-coverage while analysis is correction-eligible', () => {
  const repairMap = [repairEntry('F1'), repairEntry('F2')];
  assert.throws(
    () => validateStageQualityRepairMap({ findings: FINDINGS, repairMap }),
    /repair_map references a non-required finding/,
  );
  assert.deepEqual(analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap }), {
    repair_map_is_array: true,
    missing_required_ids: [],
    duplicate_ids: [],
    unknown_ids: [],
    non_required_ids: ['F2'],
    invalid_status_ids: [],
    malformed_entries: [],
    correction_eligible: true,
  });
});

test('strict repair_map still rejects missing required coverage and analysis is not correction-eligible', () => {
  const repairMap = [repairEntry('F2')];
  assert.throws(
    () => validateStageQualityRepairMap({ findings: FINDINGS, repairMap }),
    /repair_map references a non-required finding/,
  );
  assert.throws(
    () => validateStageQualityRepairMap({ findings: FINDINGS, repairMap: [] }),
    /repair_map must cover every required finding/,
  );
  const analysis = analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap });
  assert.deepEqual(analysis.missing_required_ids, ['F1']);
  assert.deepEqual(analysis.non_required_ids, ['F2']);
  assert.equal(analysis.correction_eligible, false);
});

test('analysis reports duplicate ids and never treats them as correction-eligible', () => {
  const repairMap = [repairEntry('F1'), repairEntry('F1')];
  assert.throws(
    () => validateStageQualityRepairMap({ findings: FINDINGS, repairMap }),
    /repair_map contains a duplicate id/,
  );
  const analysis = analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap });
  assert.deepEqual(analysis.duplicate_ids, ['F1']);
  assert.deepEqual(analysis.missing_required_ids, []);
  assert.equal(analysis.correction_eligible, false);
});

test('analysis reports invalid repair status and never treats it as correction-eligible', () => {
  const repairMap = [{ ...repairEntry('F1'), repair_status: 'unknown' }];
  assert.throws(
    () => validateStageQualityRepairMap({
      findings: FINDINGS,
      repairMap: repairMap as unknown as StageQualityRepairMapEntry[],
    }),
    /repair_map repair_status is invalid/,
  );
  const analysis = analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap });
  assert.deepEqual(analysis.invalid_status_ids, ['F1']);
  assert.equal(analysis.correction_eligible, false);
});

test('analysis reports unknown finding ids, malformed entries, and non-array maps without throwing', () => {
  const unknown = analyzeStageQualityRepairMap({
    findings: FINDINGS,
    repairMap: [repairEntry('F1'), repairEntry('F-unknown')],
  });
  assert.deepEqual(unknown.unknown_ids, ['F-unknown']);
  assert.equal(unknown.correction_eligible, false);

  const malformed = analyzeStageQualityRepairMap({
    findings: FINDINGS,
    repairMap: [
      repairEntry('F1'),
      { finding_id: 'F2', repair_status: 'repaired', changed_artifact_refs: [], repair_evidence_refs: [] },
    ],
  });
  assert.equal(malformed.malformed_entries.length, 1);
  assert.equal(malformed.malformed_entries[0]!.entry_index, 1);
  assert.equal(malformed.malformed_entries[0]!.finding_id, 'F2');
  assert.deepEqual(malformed.non_required_ids, ['F2']);
  assert.equal(malformed.correction_eligible, false);

  const notArray = analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap: { F1: true } });
  assert.equal(notArray.repair_map_is_array, false);
  assert.deepEqual(notArray.missing_required_ids, ['F1']);
  assert.equal(notArray.correction_eligible, false);
});

test('repair_observations reject a required finding id', () => {
  assert.throws(
    () => validateStageQualityRepairObservations({
      findings: FINDINGS,
      repairObservations: [repairEntry('F1')],
    }),
    /repair_observations must not reference a required finding/,
  );
});

test('repair_observations reject an unknown finding id', () => {
  assert.throws(
    () => validateStageQualityRepairObservations({
      findings: FINDINGS,
      repairObservations: [repairEntry('F-unknown')],
    }),
    /repair_observations references an unknown finding/,
  );
});

test('repair_observations reject duplicate, invalid-status, and malformed entries', () => {
  assert.throws(
    () => validateStageQualityRepairObservations({
      findings: FINDINGS,
      repairObservations: [repairEntry('F2'), repairEntry('F2')],
    }),
    /repair_observations contains a duplicate id/,
  );
  assert.throws(
    () => validateStageQualityRepairObservations({
      findings: FINDINGS,
      repairObservations: [{
        ...repairEntry('F2'),
        repair_status: 'unknown',
      } as unknown as StageQualityRepairMapEntry],
    }),
    /repair_observations repair_status is invalid/,
  );
  assert.throws(
    () => validateStageQualityRepairObservations({
      findings: FINDINGS,
      repairObservations: [{
        ...repairEntry('F2'),
        changed_artifact_refs: 'artifact:repaired',
      } as unknown as StageQualityRepairMapEntry],
    }),
    /repair_observations\.F2\.changed_artifact_refs must contain non-empty string refs/,
  );
});

test('repair_observations cannot substitute for required repair_map coverage', () => {
  const repairMap: StageQualityRepairMapEntry[] = [];
  const observations = validateStageQualityRepairObservations({
    findings: FINDINGS,
    repairObservations: [observationEntry('F2', { note: 'non-required follow-up' })],
  });
  assert.equal(observations.length, 1);
  assert.throws(
    () => validateStageQualityRepairMap({ findings: FINDINGS, repairMap }),
    /repair_map must cover every required finding/,
  );
  assert.deepEqual(
    analyzeStageQualityRepairMap({ findings: FINDINGS, repairMap }).missing_required_ids,
    ['F1'],
  );
});

test('repair_observations normalize note and optional changed refs without closing anything', () => {
  const observations = validateStageQualityRepairObservations({
    findings: FINDINGS,
    repairObservations: [{
      finding_id: 'F2',
      repair_status: 'not_repaired',
      changed_artifact_refs: [],
      repair_evidence_refs: ['evidence:optional-check'],
      note: 'non-required; not a closure claim',
    }],
  });
  assert.deepEqual(observations[0], {
    finding_id: 'F2',
    repair_status: 'not_repaired',
    changed_artifact_refs: [],
    repair_evidence_refs: ['evidence:optional-check'],
    note: 'non-required; not a closure claim',
  });
  const closure = evaluateStageQualityFindingClosure({
    findings: [F1],
    repairMap: [repairEntry('F1')],
    reReview: {
      finding_closures: [{ finding_id: 'F1', status: 'closed', evidence_refs: ['evidence:re-reviewed'] }],
      repair_regressions: [],
      critical_new_findings: [],
      optional_observations: [],
    },
  });
  assert.equal(closure.trigger_repair, false);
  assert.deepEqual(closure.open_required_finding_ids, []);
});

test('contract declares repair_observations optional, known-non-required-only, and non-authoritative', () => {
  assert.deepEqual(
    contract.attempt_outcome_contract.role_required_fields.repairer,
    ['repair_map', 'artifact_refs', 'artifact_hashes'],
  );
  assert.deepEqual(
    contract.attempt_outcome_contract.role_optional_fields.repairer,
    ['repair_observations'],
  );
  assert.equal(contract.finding_closure_contract.repair_map_contains_required_findings_only, true);
  assert.equal(contract.finding_closure_contract.repair_observations.authoritative, false);
  assert.equal(contract.finding_closure_contract.repair_observations.required, false);
  assert.equal(
    contract.finding_closure_contract.repair_observations.may_reference,
    'known_required_false_findings_only',
  );
  assert.equal(contract.finding_closure_contract.repair_observations.closes_findings, false);
  assert.equal(
    contract.finding_closure_contract.repair_observations.substitutes_for_required_repair_map_coverage,
    false,
  );
  assert.equal(contract.finding_closure_contract.repair_observations.changes_repair_route, false);
  assert.equal(contract.finding_closure_contract.repair_observations.enters_repair_map_sha256, false);
  assert.equal(
    contract.review_receipt.finding_lineage_binding
      .repair_observations_excluded_from_repair_map_sha256,
    true,
  );
});

test('repairer prompt keeps repair_map required-only and routes substantiated non-required repairs to observations', () => {
  const prompt = runnerPromptFor({
    attempt: {
      stage_attempt_id: 'sat_repair_observations_prompt',
      stage_run_id: 'sr_repair_observations_prompt',
      quality_cycle_id: 'qc_repair_observations_prompt',
      attempt_role: 'repairer',
      quality_round_index: 1,
      stage_id: 'artifact_creation',
      workspace_locator: { workspace_root: '/tmp/opl-repair-observations-prompt' },
    },
  });
  assert.match(prompt, /repair_map is required-only/);
  assert.match(prompt, /no entry for any non-required or unknown finding/);
  assert.match(prompt, /substantiate or repair a known non-required finding/);
  assert.match(prompt, /non-authoritative repair_observations array/);
  assert.match(prompt, /cannot close a finding, replace or extend required repair_map coverage, or change the repair route/);
  assert.match(prompt, /"repair_observations"/);
  assert.match(prompt, /"authoritative":false/);
});

test('re-review prompt exposes observations only as non-authoritative structured context', () => {
  const prompt = runnerPromptFor({
    attempt: {
      stage_attempt_id: 'sat_re_review_observations_prompt',
      stage_run_id: 'sr_re_review_observations_prompt',
      quality_cycle_id: 'qc_re_review_observations_prompt',
      attempt_role: 're_reviewer',
      quality_round_index: 1,
      stage_id: 'artifact_creation',
      workspace_locator: { workspace_root: '/tmp/opl-re-review-observations-prompt' },
      input_artifact_refs: ['artifact:repaired'],
      reviewed_artifact_hashes: ['sha256:repaired'],
      prior_finding_refs: ['F1'],
      repair_map_refs: ['repair-map:F1'],
      quality_context: {
        findings: FINDINGS,
        repair_map: [repairEntry('F1')],
        repair_observations: [observationEntry('F2', { note: 'non-required; not a closure claim' })],
      },
    },
  });
  assert.match(prompt, /Structured quality context may include repair_observations from the repairer closeout/);
  assert.match(prompt, /They are non-authoritative context only/);
  assert.match(prompt, /cannot close a required finding, replace or extend the required repair_map, or change the outcome or route/);
  assert.match(prompt, /"repair_map":\[\{"finding_id":"F1"/);
  assert.match(prompt, /"repair_observations":\[\{"finding_id":"F2"/);
});

test('re-review context reads observations from the persisted repairer route impact without merging them into repair_map', () => {
  const routeImpact = {
    stage_quality_cycle: {
      repair_map: [repairEntry('F1')],
      repair_observations: [observationEntry('F2', { note: 'non-required; not a closure claim' })],
    },
  };
  const observations = repairObservationsFromCloseoutRouteImpact({
    findings: FINDINGS,
    routeImpact,
  });
  assert.deepEqual(observations, [observationEntry('F2', { note: 'non-required; not a closure claim' })]);
  assert.deepEqual(repairObservationsFromCloseoutRouteImpact({
    findings: FINDINGS,
    routeImpact: { stage_quality_cycle: { repair_map: [repairEntry('F1')] } },
  }), []);
  assert.throws(
    () => repairObservationsFromCloseoutRouteImpact({
      findings: FINDINGS,
      routeImpact: {
        stage_quality_cycle: {
          repair_map: [repairEntry('F1')],
          repair_observations: [repairEntry('F1')],
        },
      },
    }),
    /repair_observations must not reference a required finding/,
  );
  assert.throws(
    () => repairObservationsFromCloseoutRouteImpact({
      findings: FINDINGS,
      routeImpact: {
        stage_quality_cycle: {
          repair_map: [repairEntry('F1')],
          repair_observations: [repairEntry('F-unknown')],
        },
      },
    }),
    /repair_observations references an unknown finding/,
  );
});
