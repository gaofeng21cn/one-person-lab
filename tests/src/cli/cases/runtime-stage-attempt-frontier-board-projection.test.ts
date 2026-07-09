import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { QUEUE_PROJECTION_VOCABULARY } from '../../../../src/kernel/queue-projection-vocabulary.ts';
import {
  buildAttemptGenericProjections,
  type StageAttemptGenericProjectionInput,
} from '../../../../src/modules/runway/index.ts';

function baseAttempt(
  overrides: Partial<StageAttemptGenericProjectionInput> = {},
): StageAttemptGenericProjectionInput {
  return {
    stage_attempt_id: 'attempt-frontier-1',
    domain_id: 'medautoscience',
    stage_id: 'research-frontier',
    next_owner: null,
    route_impact: {},
    workspace_locator: {},
    source_fingerprint: null,
    checkpoint_refs: [],
    closeout_refs: [],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    artifact_refs: [],
    rejected_writes: [],
    attention_flags: [],
    human_gate_refs: [],
    human_gate_ledger: [],
    resume_ledger: [],
    [QUEUE_PROJECTION_VOCABULARY.deadLetter]: null,
    domain_ready_verdict: null,
    controlled_apply_contract: {},
    lifecycle_primitives: {},
    current_provider_readiness: null,
    ...overrides,
  };
}

function frontierBoard() {
  return {
    surface_kind: 'domain_research_frontier_board_refs',
    board_ref: 'domain://mas/frontier/board',
    summary: {
      summary_ref: 'domain://mas/frontier/summary',
      content: 'must-not-be-projected',
    },
    items: [
      {
        ref: 'domain://mas/frontier/candidate/a',
        status: 'active',
        stage_id: 'literature-scan',
        candidate_id: 'candidate:a',
        route_family: 'evidence-route',
        rollback_target_ref: 'rollback:frontier/a',
        advisory_reason_ref: 'reason:frontier/a',
        hypothesis_body: 'must-not-be-projected',
        evidence_body: 'must-not-be-projected',
        memory_body: 'must-not-be-projected',
      },
    ],
  };
}

function masOplFrontierProjection() {
  return {
    surface: 'stage_research_frontier_board_opl_refs_projection',
    display_role: 'refs_and_summary_only',
    body_included: false,
    frontier_board_refs: [{
      ref_kind: 'research_frontier_candidate_ref',
      candidate_id: 'endpoint-failed',
      status: 'rejected',
      failure_scope: 'endpoint',
      signals: ['failure_scope:endpoint'],
    }],
    rollback_target_suggestions: [{
      candidate_id: 'endpoint-failed',
      signal: 'failure_scope:endpoint',
      suggested_target_stage: '02-protocol_and_analysis_plan',
      advisory_only: true,
      reason: 'must-not-be-projected',
    }],
    authority_boundary: {
      can_replace_next_action: false,
      can_write_domain_truth: false,
    },
  };
}

test('stage attempt generic projections expose research frontier board as refs-only', () => {
  const projection = buildAttemptGenericProjections(baseAttempt({
    research_frontier_board: frontierBoard(),
  })).research_frontier_board;

  assert.equal(projection.surface_kind, 'opl_research_frontier_board_projection');
  assert.equal(projection.canonical_surface_kind, 'stage_candidate_portfolio_refs_projection');
  assert.equal(projection.legacy_surface_kind, 'opl_research_frontier_board_projection');
  assert.deepEqual(projection.compatibility_profile, {
    profile_id: 'research-frontier-board',
    profile_role: 'domain_specific_compatibility_profile',
    source_surface: 'research_frontier_board',
    legacy_carriers: ['research_frontier_board', 'frontier_board', 'opl_research_frontier_projection'],
    compatibility_only: true,
    canonical_projection: 'stage_candidate_portfolio',
  });
  assert.equal(projection.projection_scope, 'stage_attempt');
  assert.equal(projection.renderer_role, 'generic_research_frontier_board_refs_shell');
  assert.equal(projection.availability, 'frontier_refs_observed');
  assert.deepEqual(projection.items, [{
    item_id: 'frontier:attempt-frontier-1:0',
    ref: 'domain://mas/frontier/candidate/a',
    status: 'active',
    stage_id: 'literature-scan',
    candidate_id: 'candidate:a',
    route_family: 'evidence-route',
    rollback_target_ref: 'rollback:frontier/a',
    advisory_reason_ref: 'reason:frontier/a',
  }]);
  assert.equal(JSON.stringify(projection.items).includes('must-not-be-projected'), false);
  assert.equal(projection.stage_candidate_portfolio.surface_kind, 'stage_candidate_portfolio_refs_projection');
  assert.equal(projection.stage_candidate_portfolio.canonical_projection_kind, 'stage_candidate_portfolio');
  assert.equal(projection.stage_candidate_portfolio.candidate_count, 1);
  assert.deepEqual(projection.stage_candidate_portfolio.portfolio_refs, [
    'domain://mas/frontier/candidate/a',
  ]);
  assert.equal(JSON.stringify(projection.stage_candidate_portfolio).includes('must-not-be-projected'), false);
  assert.equal(projection.summary.omitted_body_field_count, 4);
  assert.equal(projection.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.authority_boundary.can_accept_or_reject_memory_writeback, false);
  assert.equal(projection.authority_boundary.can_infer_route_decision, false);
  assert.equal(projection.authority_boundary.can_authorize_owner_receipt, false);
  assert.equal(projection.authority_boundary.can_authorize_typed_blocker, false);
  assert.equal(projection.authority_boundary.can_claim_paper_progress, false);
  assert.equal(projection.authority_boundary.can_claim_domain_progress, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(projection.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(projection.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
});

test('stage attempt generic projections read MAS OPL frontier projection shape', () => {
  const projection = buildAttemptGenericProjections(baseAttempt({
    research_frontier_board: masOplFrontierProjection(),
  })).research_frontier_board;

  assert.equal(projection.availability, 'frontier_refs_observed');
  assert.equal(projection.summary.item_count, 2);
  assert.equal(projection.summary.status_counts.rejected, 1);
  assert.equal(projection.summary.status_counts['failure_scope:endpoint'], 1);
  assert.equal(projection.summary.rollback_target_ref_count, 1);
  assert.deepEqual(projection.summary.rollback_target_refs, ['02-protocol_and_analysis_plan']);
  assert.equal(projection.items[1].stage_id, '02-protocol_and_analysis_plan');
  assert.equal(projection.items[1].rollback_target_ref, '02-protocol_and_analysis_plan');
  assert.equal(JSON.stringify(projection).includes('must-not-be-projected'), false);
  assert.equal(projection.authority_boundary.can_infer_route_decision, false);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
});

test('stage attempt generic projections expose eight-stage rollback targets as refs-only labels', () => {
  const rollbackStages = [
    'question',
    'search',
    'screen',
    'extract',
    'analyze',
    'draft',
    'review',
    'submit',
  ];
  const projection = buildAttemptGenericProjections(baseAttempt({
    research_frontier_board: {
      surface_kind: 'domain_research_frontier_board_refs',
      board_ref: 'domain://mas/frontier/eight-stage-board',
      summary_ref: 'domain://mas/frontier/eight-stage-summary',
      rollback_targets: rollbackStages.map((stage, index) => ({
        stage_label: stage,
        status_label: index === 7 ? 'ready_for_owner_review' : 'candidate',
        route_family: index % 2 === 0 ? 'research-route' : 'rollback-route',
        rollback_target_ref: `domain://mas/frontier/rollback-target/${stage}`,
        advisory_reason_ref: `domain://mas/frontier/advisory-reason/${stage}`,
        memory_body: `must-not-project-${stage}`,
      })),
    },
  })).research_frontier_board;

  assert.equal(projection.availability, 'frontier_refs_observed');
  assert.equal(projection.summary.item_count, 8);
  assert.equal(projection.summary.board_ref, 'domain://mas/frontier/eight-stage-board');
  assert.equal(projection.summary.summary_ref, 'domain://mas/frontier/eight-stage-summary');
  assert.equal(projection.summary.rollback_target_ref_count, 8);
  assert.equal(projection.summary.advisory_reason_ref_count, 8);
  assert.equal(projection.summary.status_counts.candidate, 7);
  assert.equal(projection.summary.status_counts.ready_for_owner_review, 1);
  assert.equal(projection.summary.route_family_counts['research-route'], 4);
  assert.equal(projection.summary.route_family_counts['rollback-route'], 4);
  assert.deepEqual(projection.items.map((item) => item.stage_id), rollbackStages);
  assert.deepEqual(projection.items.map((item) => item.rollback_target_ref), rollbackStages.map((stage) =>
    `domain://mas/frontier/rollback-target/${stage}`
  ));
  assert.equal(JSON.stringify(projection).includes('must-not-project'), false);
  assert.equal(projection.summary.omitted_body_field_count, 8);
  assert.equal(projection.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.authority_boundary.can_infer_route_decision, false);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
});

test('runtime workbench summarizes frontier board status counts and rollback refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frontier-board-state-'));
  try {
    const env = { OPL_STATE_DIR: stateRoot };
    const activeAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'research-frontier',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:frontier-active',
    ], env);
    const blockedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'research-frontier',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:frontier-blocked',
      '--new-attempt',
    ], env);

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      activeAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:frontier-active'],
        route_impact: {
          opl_research_frontier_projection: masOplFrontierProjection(),
        },
      }),
    ], env);
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      blockedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:frontier-blocked'],
        route_impact: {
          research_frontier_board: {
            surface_kind: 'domain_research_frontier_board_refs',
            items: [{
              ref: 'domain://mas/frontier/candidate/b',
              status: 'blocked',
              stage_id: 'research-frontier',
              candidate_id: 'candidate:b',
              route_family: 'owner-review',
              rollback_target_ref: 'rollback:frontier/b',
              advisory_reason_ref: 'reason:frontier/b',
              body: 'must-not-be-projected',
            }],
          },
        },
      }),
    ], env);

    const snapshot = runCli(['runtime', 'snapshot'], env);
    const board = snapshot.runtime_tray_snapshot.stage_attempt_workbench.research_frontier_board;

    assert.equal(board.surface_kind, 'opl_research_frontier_board_projection');
    assert.equal(board.canonical_surface_kind, 'stage_candidate_portfolio_refs_projection');
    assert.equal(board.compatibility_profile.compatibility_only, true);
    assert.equal(board.projection_scope, 'stage_attempt_workbench');
    assert.equal(board.availability, 'frontier_refs_observed');
    assert.equal(board.stage_candidate_portfolio.canonical_projection_kind, 'stage_candidate_portfolio');
    assert.equal(board.stage_candidate_portfolio.candidate_count, 3);
    assert.equal(board.stage_candidate_portfolio.authority_boundary.can_claim_domain_progress, false);
    assert.equal(board.summary.item_count, 3);
    assert.equal(board.summary.status_counts.rejected, 1);
    assert.equal(board.summary.status_counts['failure_scope:endpoint'], 1);
    assert.equal(board.summary.status_counts.blocked, 1);
    assert.deepEqual(board.summary.rollback_target_refs, [
      'rollback:frontier/b',
      '02-protocol_and_analysis_plan',
    ]);
    assert.equal(board.authority_boundary.can_write_domain_truth, false);
    assert.equal(board.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(JSON.stringify(board.items).includes('must-not-be-projected'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
