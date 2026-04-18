import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExplicitCheckpointPolicy,
  buildFamilyActionGraph,
  buildFamilyActionGraphEdge,
  buildFamilyActionGraphHumanGate,
  buildFamilyHumanGatePreview,
  buildFamilyActionGraphNode,
  buildFamilyHumanGate,
  buildFamilyProductEntryOrchestration,
  buildFamilyOrchestrationCompanion,
  buildFamilyOrchestrationTemplate,
  resolveActiveRunId,
  resolveProgramId,
} from '../../src/family-orchestration.ts';

test('resolveActiveRunId and resolveProgramId normalize canonical runtime identifiers', () => {
  assert.equal(resolveActiveRunId(null, '', 'run-123'), 'run-123');
  assert.equal(resolveProgramId({ runtime_program_id: 'program-xyz' }), 'program-xyz');
});

test('buildFamilyHumanGate normalizes required gate fields', () => {
  const gate = buildFamilyHumanGate({
    gate_id: 'gate-1',
    gate_kind: 'operator_review',
    requested_at: '2026-04-18T00:00:00Z',
    request_surface_kind: 'runtime_watch',
    request_surface_id: 'runtime_watch/latest.json',
    evidence_refs: [{ ref_kind: 'repo_path', ref: 'runtime_watch/latest.json', label: 'watch report' }],
    decision_options: ['approve', 'pause'],
  }) as {
    gate_id: string;
    request_surface: { surface_kind: string };
    decision_options: string[];
  };

  assert.equal(gate.gate_id, 'gate-1');
  const requestSurface = gate.request_surface as { surface_kind: string };
  const decisionOptions = gate.decision_options as string[];
  assert.equal(requestSurface.surface_kind, 'runtime_watch');
  assert.deepEqual(decisionOptions, ['approve', 'pause']);
});

test('buildFamilyOrchestrationCompanion materializes event envelope and checkpoint lineage', () => {
  const payload = buildFamilyOrchestrationCompanion({
    surface_kind: 'runtime_watch',
    surface_id: 'runtime_watch/latest.json',
    event_name: 'runtime_watch.runtime_scanned',
    source_surface: 'runtime_watch',
    session_id: 'session-1',
    program_id: 'program-1',
    study_id: 'study-1',
    quest_id: 'quest-1',
    active_run_id: 'run-1',
    runtime_decision: 'continue',
    runtime_reason: 'healthy',
    target_domain_id: 'medautoscience',
    human_gates: [{ gate_id: 'gate-1', status: 'requested' }],
    event_envelope_surface: { ref_kind: 'json_pointer', ref: '/runtime_watch/latest' },
    checkpoint_lineage_surface: { ref_kind: 'json_pointer', ref: '/runtime_watch/lineage' },
  }) as unknown as {
    resume_contract: { session_locator_field: string; checkpoint_locator_field: string };
    event_envelope: { session: { active_run_id: string }; payload: { runtime_decision: string } };
    checkpoint_lineage: { checkpoint_id: string };
    human_gates: Array<{ gate_id: string }>;
  };

  assert.equal(payload.resume_contract.session_locator_field, 'event_envelope.session.session_id');
  assert.equal(payload.resume_contract.checkpoint_locator_field, 'checkpoint_lineage.checkpoint_id');
  const eventEnvelope = payload.event_envelope as {
    session: { active_run_id: string };
    payload: { runtime_decision: string };
  };
  const checkpointLineage = payload.checkpoint_lineage as { checkpoint_id: string };
  const humanGates = payload.human_gates as Array<{ gate_id: string }>;
  assert.equal(eventEnvelope.session.active_run_id, 'run-1');
  assert.equal(eventEnvelope.payload.runtime_decision, 'continue');
  assert.equal(checkpointLineage.checkpoint_id.startsWith('checkpoint-'), true);
  assert.equal(humanGates[0]?.gate_id, 'gate-1');
});

test('buildFamilyOrchestrationTemplate normalizes shared preview surfaces', () => {
  const payload = buildFamilyOrchestrationTemplate({
    action_graph: {
      version: 'family-action-graph.v1',
      graph_id: 'graph-1',
      target_domain_id: 'med-autoscience',
      graph_kind: 'study_runtime_orchestration',
      graph_version: '2026-04-18',
      nodes: [{ node_id: 'step:open_frontdesk' }],
      edges: [],
      entry_nodes: ['step:open_frontdesk'],
      exit_nodes: ['step:open_frontdesk'],
      human_gates: [{ gate_id: 'gate-1', trigger_nodes: ['step:open_frontdesk'], blocking: true }],
      checkpoint_policy: { mode: 'explicit_nodes', checkpoint_nodes: ['step:open_frontdesk'] },
    },
    human_gates: [{ gate_id: 'gate-1', title: 'Gate 1', status: 'requested' }],
    resume_surface_kind: 'launch_study',
    session_locator_field: 'study_id',
    checkpoint_locator_field: 'controller_decision_path',
    event_envelope_surface: { ref_kind: 'workspace_locator', ref: 'studies/<study_id>/runtime_watch/latest.json' },
    checkpoint_lineage_surface: { ref_kind: 'workspace_locator', ref: 'studies/<study_id>/controller_decisions/latest.json' },
  }) as unknown as {
    action_graph_ref: { ref: string };
    action_graph: { graph_id: string };
    resume_contract: { surface_kind: string; session_locator_field: string; checkpoint_locator_field: string };
    event_envelope_surface?: { ref_kind: string };
    checkpoint_lineage_surface?: { ref_kind: string };
  };

  assert.equal(payload.action_graph_ref.ref, '/family_orchestration/action_graph');
  assert.equal(payload.action_graph.graph_id, 'graph-1');
  assert.equal('family_human_gates' in payload, false);
  assert.deepEqual(payload.resume_contract, {
    surface_kind: 'launch_study',
    session_locator_field: 'study_id',
    checkpoint_locator_field: 'controller_decision_path',
  });
  assert.ok(payload.event_envelope_surface);
  assert.ok(payload.checkpoint_lineage_surface);
  assert.equal(payload.event_envelope_surface.ref_kind, 'workspace_locator');
  assert.equal(payload.checkpoint_lineage_surface.ref_kind, 'workspace_locator');
});

test('buildFamilyActionGraph validates canonical family graph payloads', () => {
  const graph = buildFamilyActionGraph({
    graph_id: 'redcube_frontdoor_product_entry_graph',
    target_domain_id: 'redcube_ai',
    graph_kind: 'visual_deliverable_orchestration',
    graph_version: '2026-04-18',
    nodes: [
      buildFamilyActionGraphNode({
        node_id: 'step:open_frontdesk',
        node_kind: 'frontdoor',
        title: 'Open RedCube frontdesk',
        surface_kind: 'product_frontdesk',
      }),
      buildFamilyActionGraphNode({
        node_id: 'step:continue_current_loop',
        node_kind: 'deliverable_runtime',
        title: 'Start or continue the direct product loop',
        surface_kind: 'product_entry',
        produces_checkpoint: true,
      }),
    ],
    edges: [
      buildFamilyActionGraphEdge({
        from: 'step:open_frontdesk',
        to: 'step:continue_current_loop',
        on: 'start_direct',
      }),
    ],
    entry_nodes: ['step:open_frontdesk'],
    exit_nodes: ['step:continue_current_loop'],
    human_gates: [
      buildFamilyActionGraphHumanGate({
        gate_id: 'redcube_operator_review_gate',
        trigger_nodes: ['step:continue_current_loop'],
        blocking: true,
      }),
    ],
    checkpoint_policy: buildExplicitCheckpointPolicy({
      checkpoint_nodes: ['step:continue_current_loop'],
    }),
  });

  assert.equal(graph.version, 'family-action-graph.v1');
  assert.equal(graph.nodes[1].produces_checkpoint, true);
  assert.deepEqual(graph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: ['step:continue_current_loop'],
  });
});

test('buildFamilyHumanGatePreview normalizes shared preview fields', () => {
  const preview = buildFamilyHumanGatePreview({
    gate_id: 'route-review',
    title: 'Route review gate',
    status: 'approved',
    review_surface: {
      ref_kind: 'json_pointer',
      ref: '/product_entry_manifest/operator_loop_surface',
      label: 'operator loop surface',
    },
  }) as {
    gate_id: string;
    title: string;
    status: string;
    review_surface: { ref_kind: string; ref: string; label: string };
  };

  assert.equal(preview.gate_id, 'route-review');
  assert.equal(preview.title, 'Route review gate');
  assert.equal(preview.status, 'approved');
  assert.deepEqual(preview.review_surface, {
    ref_kind: 'json_pointer',
    ref: '/product_entry_manifest/operator_loop_surface',
    label: 'operator loop surface',
  });
});

test('buildFamilyProductEntryOrchestration materializes action graph and gate previews together', () => {
  const orchestration = buildFamilyProductEntryOrchestration({
    graph_id: 'redcube_frontdoor_product_entry_graph',
    target_domain_id: 'redcube_ai',
    graph_kind: 'visual_deliverable_orchestration',
    graph_version: '2026-04-18',
    nodes: [
      {
        node_id: 'step:open_frontdesk',
        node_kind: 'frontdoor',
        title: 'Open RedCube frontdesk',
        surface_kind: 'product_frontdesk',
      },
      {
        node_id: 'step:continue_current_loop',
        node_kind: 'deliverable_runtime',
        title: 'Continue current loop',
        surface_kind: 'product_entry',
        produces_checkpoint: true,
      },
      {
        node_id: 'step:inspect_current_progress',
        node_kind: 'progress_read',
        title: 'Inspect current progress',
        surface_kind: 'product_entry_session',
        produces_checkpoint: true,
      },
    ],
    edges: [
      {
        from: 'step:open_frontdesk',
        to: 'step:continue_current_loop',
        on: 'start_direct',
      },
      {
        from: 'step:continue_current_loop',
        to: 'step:inspect_current_progress',
        on: 'session_started',
      },
    ],
    entry_nodes: ['step:open_frontdesk'],
    exit_nodes: ['step:inspect_current_progress'],
    human_gates: [
      {
        gate_id: 'redcube_operator_review_gate',
        trigger_nodes: ['step:inspect_current_progress'],
        blocking: true,
      },
    ],
    checkpoint_nodes: ['step:continue_current_loop', 'step:inspect_current_progress'],
    human_gate_previews: [
      {
        gate_id: 'redcube_operator_review_gate',
        title: 'RedCube operator review gate',
        status: 'requested',
        review_surface: {
          ref_kind: 'json_pointer',
          ref: '/operator_loop_actions/continue_session',
          label: 'continue session surface',
        },
      },
    ],
    resume_surface_kind: 'product_entry_session',
    session_locator_field: 'entry_session.entry_session_id',
    checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
    action_graph_ref: {
      ref_kind: 'json_pointer',
      ref: '/family_orchestration/action_graph',
      label: 'redcube family action graph',
    },
    event_envelope_surface: {
      ref_kind: 'json_pointer',
      ref: '/recommended_command',
      label: 'recommended command',
    },
  }) as unknown as {
    action_graph_ref: { ref: string; label: string };
    action_graph: { graph_id: string; checkpoint_policy: { checkpoint_nodes: string[] } };
    human_gates: Array<{ gate_id: string; review_surface: { ref: string } }>;
    resume_contract: { surface_kind: string; session_locator_field: string; checkpoint_locator_field: string };
    event_envelope_surface: { ref: string };
  };

  assert.equal(orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
  assert.equal(orchestration.action_graph_ref.label, 'redcube family action graph');
  assert.equal(orchestration.action_graph.graph_id, 'redcube_frontdoor_product_entry_graph');
  assert.deepEqual(orchestration.action_graph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: ['step:continue_current_loop', 'step:inspect_current_progress'],
  });
  assert.equal(orchestration.human_gates[0]?.gate_id, 'redcube_operator_review_gate');
  assert.equal(
    orchestration.human_gates[0]?.review_surface.ref,
    '/operator_loop_actions/continue_session',
  );
  assert.deepEqual(orchestration.resume_contract, {
    surface_kind: 'product_entry_session',
    session_locator_field: 'entry_session.entry_session_id',
    checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
  });
  assert.equal(orchestration.event_envelope_surface.ref, '/recommended_command');
});
