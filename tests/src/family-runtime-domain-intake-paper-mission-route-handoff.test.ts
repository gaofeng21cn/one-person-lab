import assert from 'node:assert/strict';
import test from 'node:test';

import {
  intakeMasPaperMissionRouteHandoff,
  intakeMasPaperMissionRouteHandoffsFromExport,
} from '../../src/family-runtime-domain-intake-parts/paper-mission-route-handoff.ts';

function readyHandoff(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'mas_paper_mission_opl_route_handoff_record',
    schema_version: 1,
    source: 'paper-mission-consumption-ledger',
    study_id: '001-paper',
    mission_id: 'paper-mission::001-paper::gate-clearing::manual',
    candidate_ref: 'ops/medautoscience/paper_mission_consumption_ledger/001-paper/candidate.json',
    status: 'accepted_candidate',
    selected_outcome: 'accepted',
    handoff_status: 'ready_for_opl_route_command',
    next_owner: 'one-person-lab',
    paper_mission_transaction_ref: 'paper-mission-transaction:001-paper:1',
    transaction_state: 'materialized',
    opl_route_command_ref: 'ops/medautoscience/paper_mission_consumption_ledger/001-paper/opl_route_command.json',
    opl_route_command: {
      command_kind: 'start_next_stage',
      target: 'paper_mission/gate_clearing',
      runtime_owner: 'one-person-lab',
    },
    route_command_kind: 'start_next_stage',
    route_target: 'paper_mission/gate_clearing',
    transaction_materialized: true,
    can_submit_to_opl_runtime: true,
    can_claim_opl_runtime_enqueued: false,
    can_claim_opl_stage_run_created: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
    can_claim_runtime_ready: false,
    authority_boundary: {
      can_write_owner_receipt: false,
      can_write_typed_blocker: false,
      can_write_human_gate: false,
      can_write_current_package: false,
      can_write_paper_body: false,
      can_write_runtime_queue: false,
      can_write_opl_outbox: false,
      can_write_opl_event: false,
      can_write_opl_stage_run: false,
    },
    forbidden_authority_writes: [
      'owner receipt',
      'typed blocker',
      'human gate',
      'current package',
      'paper body',
      'runtime queue',
      'OPL outbox',
      'OPL event',
      'StageRun',
      'provider attempt',
    ],
    forbidden_authority_claims: [
      'paper progress',
      'runtime ready',
      'OPL StageRun created',
      'provider running',
    ],
    ...overrides,
  };
}

test('MAS paper mission route handoff accepts ready command as runtime intake without runtime writes', () => {
  const readback = intakeMasPaperMissionRouteHandoff(readyHandoff());

  assert.equal(readback.surface_kind, 'opl_mas_paper_mission_route_handoff_intake_readback');
  assert.equal(readback.status, 'accepted_for_runtime_intake');
  assert.equal(readback.command_kind, 'start_next_stage');
  assert.equal(readback.can_submit_to_opl_runtime, true);
  assert.equal(readback.writes_opl_outbox, false);
  assert.equal(readback.writes_opl_stage_run, false);
  assert.equal(readback.can_claim_stage_run_created, false);
  assert.equal(readback.can_claim_provider_running, false);
  assert.equal(readback.can_claim_paper_progress, false);
  assert.equal(readback.can_claim_runtime_ready, false);
  assert.equal(readback.runtime_start_requested, false);
  assert.equal(readback.accepted_command_packet.surface_kind, 'mas_paper_mission_opl_route_command_packet');
  assert.equal(readback.accepted_command_packet.command_kind, 'start_next_stage');
  assert.equal(readback.accepted_command_packet.route_command_materialized, true);
  assert.equal(readback.accepted_command_packet.writes_opl_outbox, false);
  assert.deepEqual(readback.blockers, []);
});

test('MAS paper mission route handoff emits typed waits for blocker human gate and mission complete outcomes', () => {
  const typedBlocker = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'waiting_for_typed_blocker_authority',
    selected_outcome: 'typed_blocker_required',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'resume_stage',
    opl_route_command: {
      command_kind: 'resume_stage',
      target: 'paper_mission/gate_clearing',
    },
  }));
  assert.equal(typedBlocker.status, 'typed_wait');
  assert.equal(typedBlocker.wait_kind, 'typed_blocker_authority');
  assert.equal(typedBlocker.runtime_start_requested, false);
  assert.equal(typedBlocker.writes_opl_outbox, false);

  const humanGate = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'waiting_for_human_gate_authority',
    selected_outcome: 'human_gate_required',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'wait_for_human',
    opl_route_command: {
      command_kind: 'wait_for_human',
      target: 'paper_mission/operator_decision',
    },
  }));
  assert.equal(humanGate.status, 'typed_wait');
  assert.equal(humanGate.wait_kind, 'human_gate_authority');
  assert.equal(humanGate.runtime_start_requested, false);

  const complete = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'mission_complete',
    selected_outcome: 'accepted',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'complete_mission',
    opl_route_command: {
      command_kind: 'complete_mission',
      target: 'paper_mission/complete',
    },
  }));
  assert.equal(complete.status, 'terminal_no_runtime');
  assert.equal(complete.wait_kind, 'mission_complete');
  assert.equal(complete.runtime_start_requested, false);
});

test('MAS paper mission route handoff fails closed on unknown missing forbidden and unsupported payloads', () => {
  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      surface_kind: 'mas_other_surface',
    }).blockers[0].reason,
    'unknown_surface_kind',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      paper_mission_transaction_ref: '',
    }).blockers[0].reason,
    'missing_paper_mission_transaction',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      can_claim_opl_stage_run_created: true,
    }).blockers[0].reason,
    'forbidden_authority_claim',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      authority_boundary: {
        can_write_owner_receipt: false,
        can_write_typed_blocker: false,
        can_write_human_gate: false,
        can_write_current_package: false,
        can_write_paper_body: false,
        can_write_runtime_queue: false,
        can_write_opl_outbox: true,
        can_write_opl_event: false,
        can_write_opl_stage_run: false,
      },
    }).blockers[0].reason,
    'forbidden_authority_write',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      route_command_kind: 'launch_provider_now',
      opl_route_command: {
        command_kind: 'launch_provider_now',
      },
    }).blockers[0].reason,
    'unsupported_route_command',
  );
});

test('MAS paper mission route handoff export intake prefers paper_mission_default_tasks over legacy mixed pending queue', () => {
  const exportReadback = intakeMasPaperMissionRouteHandoffsFromExport({
    paper_mission_default_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: readyHandoff(),
      },
    ],
    pending_family_tasks_policy: {
      default_paper_mission_queue_source: '/paper_mission_default_tasks',
      legacy_mixed_queue_source: '/pending_family_tasks',
    },
    pending_family_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: readyHandoff({
          paper_mission_transaction_ref: '',
        }),
      },
    ],
  });

  assert.equal(exportReadback.source_path, '/paper_mission_default_tasks');
  assert.equal(exportReadback.readbacks.length, 1);
  assert.equal(exportReadback.readbacks[0].status, 'accepted_for_runtime_intake');
  assert.equal(exportReadback.legacy_pending_family_tasks_considered, false);
  assert.equal(exportReadback.authority_boundary.writes_opl_outbox, false);
  assert.equal(exportReadback.authority_boundary.writes_opl_stage_run, false);
});

test('MAS paper mission route handoff export intake can consume explicit legacy handoff when default queue is empty', () => {
  const exportReadback = intakeMasPaperMissionRouteHandoffsFromExport({
    paper_mission_default_tasks: [],
    pending_family_tasks_policy: {
      default_paper_mission_queue_source: '/paper_mission_default_tasks',
      legacy_mixed_queue_source: '/pending_family_tasks',
    },
    pending_family_tasks: [
      {
        task_kind: 'domain_owner/default-executor-dispatch',
        default_paper_mission_entry: false,
        paper_mission_default_role: 'diagnostic_or_explicit_owner_handoff',
        opl_route_handoff: readyHandoff({
          route_command_kind: 'route_back',
          opl_route_command: {
            command_kind: 'route_back',
            target: 'paper_mission/corrected_candidate',
          },
        }),
      },
    ],
  });

  assert.equal(exportReadback.source_path, '/pending_family_tasks');
  assert.equal(exportReadback.legacy_pending_family_tasks_considered, true);
  assert.equal(exportReadback.readbacks.length, 1);
  assert.equal(exportReadback.readbacks[0].status, 'accepted_for_runtime_intake');
  assert.equal(exportReadback.readbacks[0].command_kind, 'route_back');
  assert.equal(exportReadback.readbacks[0].writes_opl_stage_run, false);
});
