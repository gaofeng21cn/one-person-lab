import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildExplicitCheckpointPolicy,
  buildFamilyActionGraph,
  buildFamilyActionGraphEdge,
  buildFamilyActionGraphHumanGate,
  buildFamilyIntakeEvidenceCompanion,
  buildFamilyProjectProfileCompanion,
  buildFamilyHumanGatePreview,
  buildFamilyActionGraphNode,
  buildFamilyHumanGate,
  buildFamilyFrontdeskProductEntryOrchestration,
  buildFamilyProductEntryOrchestration,
  buildFamilyOrchestrationCompanion,
  buildFamilyOrchestrationTemplate,
  resolveActiveRunId,
  resolveProgramId,
} from '../../src/family-orchestration.ts';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');

function readJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

function readFamilyManifestFixture(name: string): Json {
  return JSON.parse(fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8')) as Json;
}

function readFirstSchemaExample(relativePath: string): Json {
  const payload = readJson(relativePath);
  const examples = payload.examples;
  assert.ok(Array.isArray(examples), `${relativePath} is missing examples`);
  assert.ok(examples.length > 0, `${relativePath} is missing the first example`);
  return examples[0] as Json;
}

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

test('buildFamilyIntakeEvidenceCompanion normalizes intake audit and trust-ranked evidence refs', () => {
  const companion = buildFamilyIntakeEvidenceCompanion({
    target_domain_id: 'med-autogrant',
    intake_audit: {
      summary: '  intake audit passed with tracked caveats ',
      verdict: 'ready_for_routing',
      audited_at: '2026-04-21T01:02:03Z',
      summary_ref: {
        ref_kind: 'repo_path',
        ref: 'runtime_watch/intake-audit/latest.json',
        label: 'latest intake audit',
      },
    },
    trust_ranked_evidence_refs: [
      {
        ref_kind: 'repo_path',
        ref: 'evidence/secondary-notes.md',
        trust_rank: 3,
        trust_note: 'secondary operator note',
      },
      {
        ref_kind: 'workspace_locator',
        ref: 'grant_runs/<grant_run_id>/input/critique-package.json',
        trust_rank: 1,
        trust_note: 'primary intake package',
        supports: ['scope_grounding', 'route_selection'],
      },
    ],
    grounding_scope: {
      scope_kind: 'grant_route_scope',
      summary: 'route grounding frozen against intake package and critique context',
      scope_refs: [
        {
          ref_kind: 'json_pointer',
          ref: '/product_entry_manifest/domain_focus',
          label: 'domain focus',
        },
      ],
    },
    human_gate_refs: [
      {
        ref_kind: 'family_human_gate_id',
        ref: 'mag_route_gate_revision',
      },
    ],
    checkpoint_lineage_refs: [
      {
        ref_kind: 'family_checkpoint_lineage_id',
        ref: 'lineage-intake-20260421',
      },
    ],
  }) as unknown as {
    version: string;
    target_domain_id: string;
    intake_audit: { summary: string; verdict: string; summary_ref: { ref: string } };
    trust_ranked_evidence_refs: Array<{ trust_rank: number; ref: string; supports?: string[] }>;
    grounding_scope: { scope_kind: string; scope_refs: Array<{ ref: string }> };
    human_gate_refs: Array<{ ref: string }>;
    checkpoint_lineage_refs: Array<{ ref: string }>;
  };

  assert.equal(companion.version, 'family-intake-evidence-companion.v1');
  assert.equal(companion.target_domain_id, 'med-autogrant');
  assert.equal(companion.intake_audit.summary, 'intake audit passed with tracked caveats');
  assert.equal(companion.intake_audit.verdict, 'ready_for_routing');
  assert.equal(companion.intake_audit.summary_ref.ref, 'runtime_watch/intake-audit/latest.json');
  assert.deepEqual(
    companion.trust_ranked_evidence_refs.map((entry) => entry.trust_rank),
    [1, 3],
  );
  assert.deepEqual(companion.trust_ranked_evidence_refs[0]?.supports, ['scope_grounding', 'route_selection']);
  assert.equal(companion.grounding_scope.scope_kind, 'grant_route_scope');
  assert.equal(companion.grounding_scope.scope_refs[0]?.ref, '/product_entry_manifest/domain_focus');
  assert.equal(companion.human_gate_refs[0]?.ref, 'mag_route_gate_revision');
  assert.equal(companion.checkpoint_lineage_refs[0]?.ref, 'lineage-intake-20260421');
});

test('buildFamilyProjectProfileCompanion normalizes family-level project profile template payload', () => {
  const companion = buildFamilyProjectProfileCompanion({
    target_domain_id: 'med-autogrant',
    project_profile: {
      profile_id: 'grant_nsfc_project_profile_v1',
      project_kind: 'grant_program',
      template_family: 'research_grant',
      template_id: 'nsfc_blueprint_v2026',
      selection_mode: 'preset',
      summary: '  NSFC preset selected for grant planning and authoring ',
      summary_ref: {
        ref_kind: 'repo_path',
        ref: 'docs/presets/nsfc-blueprint.md',
        label: 'NSFC template brief',
      },
    },
    preference_signals: [
      'favor_explicit_scope_freeze',
      'prefer_structured_review_rhythm',
    ],
    grounding_refs: [
      {
        ref_kind: 'repo_path',
        ref: 'docs/project-profile/selection-context.md',
        label: 'selection context',
      },
    ],
  }) as {
    version: string;
    target_domain_id: string;
    project_profile: { profile_id: string; summary: string; summary_ref: { ref: string } };
    preference_signals: string[];
    grounding_refs: Array<{ ref: string }>;
  };

  assert.equal(companion.version, 'family-project-profile-companion.v1');
  assert.equal(companion.target_domain_id, 'med-autogrant');
  assert.equal(companion.project_profile.profile_id, 'grant_nsfc_project_profile_v1');
  assert.equal(companion.project_profile.summary, 'NSFC preset selected for grant planning and authoring');
  assert.equal(companion.project_profile.summary_ref.ref, 'docs/presets/nsfc-blueprint.md');
  assert.deepEqual(companion.preference_signals, [
    'favor_explicit_scope_freeze',
    'prefer_structured_review_rhythm',
  ]);
  assert.equal(companion.grounding_refs[0]?.ref, 'docs/project-profile/selection-context.md');
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
    intake_evidence_companion: {
      version: 'family-intake-evidence-companion.v1',
      target_domain_id: 'med-autoscience',
    },
    project_profile_companion: {
      version: 'family-project-profile-companion.v1',
      target_domain_id: 'med-autoscience',
    },
  }) as unknown as {
    resume_contract: { session_locator_field: string; checkpoint_locator_field: string };
    event_envelope: { session: { active_run_id: string }; payload: { runtime_decision: string } };
    checkpoint_lineage: { checkpoint_id: string };
    human_gates: Array<{ gate_id: string }>;
    intake_evidence_companion: { version: string };
    project_profile_companion: { version: string };
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
  assert.equal(payload.intake_evidence_companion.version, 'family-intake-evidence-companion.v1');
  assert.equal(payload.project_profile_companion.version, 'family-project-profile-companion.v1');
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

test('buildFamilyOrchestrationTemplate passes through project_profile_companion', () => {
  const payload = buildFamilyOrchestrationTemplate({
    action_graph: {
      version: 'family-action-graph.v1',
      graph_id: 'graph-2',
      target_domain_id: 'med-autogrant',
      graph_kind: 'grant_intake_orchestration',
      graph_version: '2026-04-21',
      nodes: [{ node_id: 'step:intake' }],
      edges: [],
      entry_nodes: ['step:intake'],
      exit_nodes: ['step:intake'],
      human_gates: [],
      checkpoint_policy: { mode: 'explicit_nodes', checkpoint_nodes: ['step:intake'] },
    },
    resume_surface_kind: 'grant_entry',
    session_locator_field: 'grant_run_id',
    checkpoint_locator_field: 'checkpoint_id',
    project_profile_companion: {
      version: 'family-project-profile-companion.v1',
      target_domain_id: 'med-autogrant',
    },
  }) as { project_profile_companion?: { version: string } };

  assert.equal(
    payload.project_profile_companion?.version,
    'family-project-profile-companion.v1',
  );
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
  const intakeEvidenceCompanion = buildFamilyIntakeEvidenceCompanion({
    target_domain_id: 'redcube_ai',
    intake_audit: {
      summary: 'redcube intake route audited for current deliverable',
    },
    trust_ranked_evidence_refs: [
      {
        ref_kind: 'json_pointer',
        ref: '/product_entry_manifest/recommended_command',
        trust_rank: 1,
      },
    ],
    grounding_scope: {
      scope_kind: 'deliverable_scope',
      summary: 'grounding locked to current deliverable scope',
      scope_refs: [
        {
          ref_kind: 'json_pointer',
          ref: '/product_entry_manifest/domain_focus',
        },
      ],
    },
  });
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
    intake_evidence_companion: intakeEvidenceCompanion,
  }) as unknown as {
    action_graph_ref: { ref: string; label: string };
    action_graph: { graph_id: string; checkpoint_policy: { checkpoint_nodes: string[] } };
    human_gates: Array<{ gate_id: string; review_surface: { ref: string } }>;
    resume_contract: { surface_kind: string; session_locator_field: string; checkpoint_locator_field: string };
    event_envelope_surface: { ref: string };
    intake_evidence_companion: { version: string };
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
  assert.equal(
    orchestration.intake_evidence_companion.version,
    'family-intake-evidence-companion.v1',
  );
});

test('buildFamilyProductEntryOrchestration passes through project_profile_companion', () => {
  const projectProfileCompanion = buildFamilyProjectProfileCompanion({
    target_domain_id: 'med-autogrant',
    project_profile: {
      profile_id: 'grant_nsfc_project_profile_v1',
      project_kind: 'grant_program',
      template_family: 'research_grant',
      template_id: 'nsfc_blueprint_v2026',
      selection_mode: 'preset',
      summary: 'NSFC preset selected for grant planning and authoring',
    },
    preference_signals: ['favor_explicit_scope_freeze'],
    grounding_refs: [
      {
        ref_kind: 'repo_path',
        ref: 'docs/project-profile/selection-context.md',
      },
    ],
  });
  const orchestration = buildFamilyProductEntryOrchestration({
    graph_id: 'mag_product_entry_graph',
    target_domain_id: 'med-autogrant',
    graph_kind: 'grant_intake_orchestration',
    graph_version: '2026-04-21',
    nodes: [
      {
        node_id: 'step:open_frontdesk',
        node_kind: 'frontdoor',
        title: 'Open frontdesk',
      },
    ],
    edges: [],
    entry_nodes: ['step:open_frontdesk'],
    exit_nodes: ['step:open_frontdesk'],
    resume_surface_kind: 'grant_entry',
    session_locator_field: 'grant_run_id',
    checkpoint_locator_field: 'checkpoint_id',
    project_profile_companion: projectProfileCompanion,
  }) as {
    project_profile_companion: { version: string; target_domain_id: string };
  };

  assert.equal(
    orchestration.project_profile_companion.version,
    'family-project-profile-companion.v1',
  );
  assert.equal(
    orchestration.project_profile_companion.target_domain_id,
    'med-autogrant',
  );
});

test('buildFamilyFrontdeskProductEntryOrchestration materializes the canonical frontdesk-direct-federated-progress graph preset', () => {
  const orchestration = buildFamilyFrontdeskProductEntryOrchestration({
    graph_id: 'redcube_frontdoor_product_entry_graph',
    target_domain_id: 'redcube_ai',
    graph_kind: 'visual_deliverable_orchestration',
    graph_version: '2026-04-20',
    frontdesk_title: 'Open RedCube frontdesk',
    frontdesk_surface_kind: 'product_frontdesk',
    direct_title: 'Start or continue the direct product loop',
    direct_surface_kind: 'product_entry',
    federated_title: 'Enter the same loop through internal OPL bridge',
    federated_surface_kind: 'federated_product_entry',
    progress_title: 'Inspect current product-entry progress',
    progress_surface_kind: 'product_entry_session',
    review_gate_id: 'redcube_operator_review_gate',
    review_gate_title: 'RedCube operator review gate',
    review_gate_status: 'requested',
    review_surface: {
      ref_kind: 'json_pointer',
      ref: '/operator_loop_actions/continue_session',
      label: 'continue session surface',
    },
    resume_surface_kind: 'product_entry_session',
    session_locator_field: 'entry_session.entry_session_id',
    checkpoint_locator_field: 'continuation_snapshot.latest_managed_run_id',
    action_graph_ref: {
      ref_kind: 'json_pointer',
      ref: '/family_orchestration/action_graph',
      label: 'redcube family action graph',
    },
  }) as unknown as {
    action_graph: {
      nodes: Array<{ node_id: string }>;
      edges: Array<{ on: string }>;
      checkpoint_policy: { checkpoint_nodes: string[] };
    };
    human_gates: Array<{ gate_id: string; review_surface: { ref: string } }>;
    resume_contract: { session_locator_field: string };
  };

  assert.deepEqual(
    orchestration.action_graph.nodes.map((node) => node.node_id),
    [
      'step:open_frontdesk',
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  );
  assert.deepEqual(
    orchestration.action_graph.edges.map((edge) => edge.on),
    ['start_direct', 'enter_via_opl_bridge', 'session_started', 'handoff_completed'],
  );
  assert.deepEqual(orchestration.action_graph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  });
  assert.equal(orchestration.human_gates[0]?.gate_id, 'redcube_operator_review_gate');
  assert.equal(
    orchestration.human_gates[0]?.review_surface.ref,
    '/operator_loop_actions/continue_session',
  );
  assert.equal(
    orchestration.resume_contract.session_locator_field,
    'entry_session.entry_session_id',
  );
});

test('family orchestration schema examples stay aligned with canonical family manifest identifiers', () => {
  const redcubeManifest = readFamilyManifestFixture('redcube-product-entry-manifest.json');
  const redcubeExample = readFirstSchemaExample(
    'contracts/family-orchestration/family-product-entry-manifest-v2.schema.json',
  );
  const humanGateExample = readFirstSchemaExample(
    'contracts/family-orchestration/family-human-gate.schema.json',
  );
  const medAutoScienceManifest = readFamilyManifestFixture('med-autoscience-product-entry-manifest.json');
  const eventEnvelopeExample = readFirstSchemaExample(
    'contracts/family-orchestration/family-event-envelope.schema.json',
  );
  const checkpointLineageExample = readFirstSchemaExample(
    'contracts/family-orchestration/family-checkpoint-lineage.schema.json',
  );

  assert.equal(redcubeExample.target_domain_id, redcubeManifest.target_domain_id);
  assert.equal(
    ((redcubeExample.formal_entry as Json).internal_surface),
    ((redcubeManifest.formal_entry as Json).internal_surface),
  );
  assert.equal(
    ((redcubeExample.shared_handoff as Json).opl_return_surface as Json).target_domain_id,
    redcubeManifest.target_domain_id,
  );
  assert.deepEqual(
    ((redcubeExample.family_orchestration as Json).action_graph_ref as Json),
    ((redcubeManifest.family_orchestration as Json).action_graph_ref as Json),
  );
  assert.equal(
    (((redcubeExample.family_orchestration as Json).resume_contract) as Json).checkpoint_locator_field,
    (((redcubeManifest.family_orchestration as Json).resume_contract) as Json).checkpoint_locator_field,
  );
  assert.equal(
    (((redcubeExample.family_orchestration as Json).resume_contract) as Json).session_locator_field,
    (((redcubeManifest.family_orchestration as Json).resume_contract) as Json).session_locator_field,
  );
  assert.equal(
    ((redcubeExample.session_continuity as Json).surface_kind),
    ((redcubeManifest.session_continuity as Json).surface_kind),
  );
  assert.equal(
    ((redcubeExample.progress_projection as Json).surface_kind),
    ((redcubeManifest.progress_projection as Json).surface_kind),
  );
  assert.equal(
    ((redcubeExample.artifact_inventory as Json).surface_kind),
    ((redcubeManifest.artifact_inventory as Json).surface_kind),
  );
  assert.equal(
    ((redcubeExample.runtime_loop_closure as Json).surface_kind),
    ((redcubeManifest.runtime_loop_closure as Json).surface_kind),
  );
  assert.equal(
    (((redcubeExample.runtime_loop_closure as Json).source_linkage) as Json).entry_mode,
    (((redcubeManifest.runtime_loop_closure as Json).source_linkage) as Json).entry_mode,
  );
  assert.equal(humanGateExample.target_domain_id, redcubeManifest.target_domain_id);
  assert.equal(
    humanGateExample.gate_id,
    (((redcubeManifest.family_orchestration as Json).human_gates as Json[])[0] as Json).gate_id,
  );
  assert.equal(eventEnvelopeExample.target_domain_id, medAutoScienceManifest.target_domain_id);
  assert.equal(checkpointLineageExample.target_domain_id, medAutoScienceManifest.target_domain_id);
});

test('family manifest schema requires repo-owned runtime continuity discovery surfaces', () => {
  const schema = readJson('contracts/family-orchestration/family-product-entry-manifest-v2.schema.json');
  const required = schema.required as string[];

  assert.ok(required.includes('skill_catalog'));
  assert.ok(required.includes('runtime_control'));
  assert.ok(required.includes('session_continuity'));
  assert.ok(required.includes('progress_projection'));
  assert.ok(required.includes('artifact_inventory'));
  assert.ok(required.includes('runtime_loop_closure'));

  const properties = schema.properties as Json;
  const runtimeControl = properties.runtime_control as Json;
  assert.equal(runtimeControl.$ref, '#/$defs/runtimeControlSurface');
});
