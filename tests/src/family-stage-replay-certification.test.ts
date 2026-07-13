import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { buildFamilyStageConformanceReview } from '../../src/modules/stagecraft/family-stage-conformance.ts';
import type { FamilyActionCatalog } from '../../src/kernel/family-action-catalog-contract.ts';
import type { FamilyStageContract, FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import { buildFamilyStageProofBundle } from '../../src/modules/stagecraft/family-stage-proof-bundle.ts';
import {
  buildFamilyStageReplayCertification,
  buildFamilyStageReplayEvidenceFromControlPlane,
} from '../../src/modules/stagecraft/family-stage-replay-certification.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function buildActionCatalog(): FamilyActionCatalog {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'mas_stage_actions',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [
      {
        action_id: 'review_draft',
        title: 'Review draft',
        summary: 'Review explicit artifact refs and emit owner receipt refs.',
        owner: 'med-autoscience',
        effect: 'read_only',
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'schemas/review.input.schema.json',
        output_schema_ref: 'schemas/review.output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        stage_route: {
          entry_stage_ref: 'publication_review',
          required_stage_refs: ['publication_review'],
          optional_stage_refs: [],
          terminal_stage_refs: ['publication_review'],
          route_policy: 'ai_selected_progress_route',
        },
        supported_surfaces: {
          cli: null,
          mcp: null,
          skill: null,
          product_entry: null,
          openai: null,
          ai_sdk: null,
        },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  };
}

function progressFirstPolicies(): Pick<
  FamilyStageContract,
  'progress_delta_policy' | 'typed_blocker_lineage_policy'
> {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

function buildStagePlane(overrides: {
  reviewRuntimeEventRefs?: string[];
  reviewRecordsRuntimeEvents?: boolean;
  authorEnsures?: string[];
} = {}): FamilyStageControlPlane {
  const runtimeEventRefs = overrides.reviewRuntimeEventRefs ?? ['runtime_event:publication_review.gate_recorded'];
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'mas_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS domain authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: {
          next_stage_refs: ['publication_review'],
          provides: overrides.authorEnsures ?? ['draft_ready'],
        },
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: overrides.authorEnsures ?? ['draft_ready'],
          boundary_assumptions: ['source_refs_are_domain_owned'],
          properties: ['deterministic_handoff_refs'],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
          ...progressFirstPolicies(),
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
          owner_receipt_required: false,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          can_write_domain_truth: false,
        },
      },
      {
        stage_id: 'publication_review',
        stage_kind: 'review',
        title: 'Publication review',
        summary: 'Review draft refs with independent receipt.',
        goal: 'Gate the draft through MAS publication review authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['review_draft'],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_receipt_ready'],
          boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
          runtime_event_refs: runtimeEventRefs,
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
          ...progressFirstPolicies(),
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: overrides.reviewRecordsRuntimeEvents ?? true,
          runtime_event_refs: runtimeEventRefs,
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          independent_gate_receipt_required: true,
          expected_receipt_refs: ['mas:publication_review_receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
}

function proofBundle(overrides: Parameters<typeof buildStagePlane>[0] = {}) {
  const actionCatalog = buildActionCatalog();
  const plane = buildStagePlane(overrides);
  return buildFamilyStageProofBundle(plane, {
    actionCatalog,
    conformanceReview: buildFamilyStageConformanceReview(plane, { family_action_catalog: actionCatalog }),
  });
}

test('stage replay certification passes with append-only log, attempt ledger, runtime events, and receipts', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle(), {
    append_only_event_log_refs: ['event-log:mas/stages'],
    attempt_ledger_refs: ['attempt-ledger:opl/mas'],
    codex_attempt_trace_refs: ['codex-attempt-trace-ref:mas/publication-review'],
    stage_manifest_refs: ['stage-manifest:publication_review'],
    current_pointer_refs: ['current-pointer:publication_review'],
    owner_answer_binding_refs: ['owner-answer-binding:publication_review'],
    recorded_runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    closeout_receipt_refs: ['mas:publication_review_receipt', 'owner_receipt:publication_review', 'human_gate:publication_quality_gate'],
  });

  assert.equal(certification.surface_kind, 'opl_family_stage_replay_certification');
  assert.equal(certification.replay_status, 'replay_ready');
  assert.equal(certification.summary.blocker_count, 0);
  assert.equal(certification.summary.replay_ready_stage_count, 2);
  assert.equal(certification.summary.missing_runtime_event_ref_count, 0);
  assert.equal(certification.summary.missing_receipt_ref_count, 0);
  assert.equal(certification.summary.codex_attempt_trace_ref_count, 1);
  assert.equal(certification.summary.stage_manifest_ref_count, 1);
  assert.equal(certification.summary.current_pointer_ref_count, 1);
  assert.equal(certification.summary.owner_answer_binding_ref_count, 1);
  assert.equal(certification.authority_boundary.replay_reads_append_only_log_refs_only, true);
  assert.equal(certification.authority_boundary.can_requery_ai, false);
  assert.equal(certification.authority_boundary.can_requery_human, false);
  assert.equal(certification.authority_boundary.can_requery_external_system, false);
  assert.equal(certification.authority_boundary.can_write_domain_truth, false);
});

test('stage replay certification blocks when no replay evidence refs are declared', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle());

  assert.equal(certification.replay_status, 'blocked');
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'append_only_event_log_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'attempt_ledger_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'runtime_event_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'expected_receipt_ref_missing'));
  assert.equal(certification.authority_boundary.can_requery_ai, false);
  assert.equal(certification.authority_boundary.can_requery_human, false);
  assert.equal(certification.authority_boundary.can_requery_external_system, false);
  assert.equal(certification.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(certification.authority_boundary.can_authorize_quality_verdict, false);
});

test('stage replay certification consumes plane and stage-contract replay evidence refs', () => {
  const plane = buildStagePlane();
  plane.replay_evidence_refs = [
    { ref_kind: 'append_only_event_log_ref', ref: 'event-log:mas/stages' },
    { role: 'codex_attempt_trace_ref', ref: 'codex-attempt-trace-ref:mas/publication-review' },
    { ref_kind: 'stage_manifest_ref', ref: 'stage-manifest:publication_review' },
  ];
  const reviewStage = plane.stages.find((stage) => stage.stage_id === 'publication_review');
  assert.ok(reviewStage?.stage_contract);
  reviewStage.stage_contract.replay_evidence_refs = [
    { role: 'recorded_runtime_event_ref', ref: 'runtime_event:publication_review.gate_recorded' },
    { ref_kind: 'closeout_receipt_ref', ref: 'mas:publication_review_receipt' },
    { ref_kind: 'owner_receipt_ref', ref: 'owner_receipt:publication_review' },
    { role: 'replay_receipt_ref', ref_kind: 'receipt_ref', ref: 'human_gate:publication_quality_gate' },
    { ref_kind: 'current_pointer_ref', ref: 'current-pointer:publication_review' },
    { role: 'owner_answer_binding_ref', ref: 'owner-answer-binding:publication_review' },
    { ref_kind: 'receipt_ref', ref: 'unclassified:receipt' },
  ];

  const evidence = buildFamilyStageReplayEvidenceFromControlPlane(plane);
  assert.deepEqual(evidence, {
    append_only_event_log_refs: ['event-log:mas/stages'],
    attempt_ledger_refs: ['codex-attempt-trace-ref:mas/publication-review'],
    stage_manifest_refs: ['stage-manifest:publication_review'],
    current_pointer_refs: ['current-pointer:publication_review'],
    owner_answer_binding_refs: ['owner-answer-binding:publication_review'],
    recorded_runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    closeout_receipt_refs: [
      'mas:publication_review_receipt',
      'owner_receipt:publication_review',
      'human_gate:publication_quality_gate',
    ],
  });

  const certification = buildFamilyStageReplayCertification(proofBundle(), evidence);
  assert.equal(certification.replay_status, 'replay_ready');
  assert.equal(certification.summary.blocker_count, 0);
  assert.equal(certification.authority_boundary.can_write_domain_truth, false);
  assert.equal(certification.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(certification.authority_boundary.can_authorize_quality_verdict, false);
});

test('stage replay certification blocks missing runtime event refs with minimal counterexample', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle(), {
    append_only_event_log_refs: ['event-log:mas/stages'],
    attempt_ledger_refs: ['attempt-ledger:opl/mas'],
    stage_manifest_refs: ['stage-manifest:publication_review'],
    current_pointer_refs: ['current-pointer:publication_review'],
    owner_answer_binding_refs: ['owner-answer-binding:publication_review'],
    closeout_receipt_refs: ['mas:publication_review_receipt', 'owner_receipt:publication_review', 'human_gate:publication_quality_gate'],
  });

  assert.equal(certification.replay_status, 'blocked');
  assert.equal(certification.summary.missing_runtime_event_ref_count, 1);
  const blocker = certification.blockers.find((entry) => entry.blocker_id === 'runtime_event_ref_missing');
  assert.equal(blocker?.stage_id, 'publication_review');
  assert.equal(blocker?.minimal_counterexample.missing_ref, 'runtime_event:publication_review.gate_recorded');
  assert.equal(blocker?.repair_action, 'record_runtime_event_ref');
});

test('stage replay certification blocks missing expected receipt refs with minimal counterexample', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle(), {
    append_only_event_log_refs: ['event-log:mas/stages'],
    attempt_ledger_refs: ['attempt-ledger:opl/mas'],
    stage_manifest_refs: ['stage-manifest:publication_review'],
    current_pointer_refs: ['current-pointer:publication_review'],
    owner_answer_binding_refs: ['owner-answer-binding:publication_review'],
    recorded_runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    closeout_receipt_refs: ['mas:publication_review_receipt'],
  });

  assert.equal(certification.replay_status, 'blocked');
  assert.equal(certification.summary.missing_receipt_ref_count, 2);
  const reviewStage = certification.stage_results.find((entry) => entry.stage_id === 'publication_review');
  assert.equal(reviewStage?.missing_receipt_workorders.length, 2);
  const humanGateWorkorder = reviewStage?.missing_receipt_workorders.find(
    (entry) => entry.missing_ref === 'human_gate:publication_quality_gate',
  );
  assert.deepEqual(humanGateWorkorder?.payload_template, {
    receipt_refs: [],
    typed_blocker_refs: [],
  });
  assert.equal(humanGateWorkorder?.missing_ref_kind, 'human_gate_ref');
  assert.deepEqual(humanGateWorkorder?.required_return_shapes, [
    'human_gate_receipt_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(humanGateWorkorder?.accepted_payload_paths.success_refs_path.required_receipt_ref, 'human_gate:publication_quality_gate');
  assert.equal(humanGateWorkorder?.accepted_payload_paths.success_refs_path.closes_domain_ready, false);
  assert.equal(humanGateWorkorder?.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(humanGateWorkorder?.authority_boundary.can_requery_human, false);
  assert.equal(humanGateWorkorder?.authority_boundary.can_create_owner_receipt, false);
  assert.ok(certification.blockers.some((entry) => (
    entry.blocker_id === 'expected_receipt_ref_missing'
    && entry.stage_id === 'publication_review'
    && entry.minimal_counterexample.missing_ref === 'owner_receipt:publication_review'
  )));
  const gateBlocker = certification.blockers.find((entry) => (
    entry.blocker_id === 'expected_receipt_ref_missing'
    && entry.stage_id === 'publication_review'
    && entry.minimal_counterexample.missing_ref === 'human_gate:publication_quality_gate'
  ));
  assert.equal(gateBlocker?.payload_workorder?.surface_kind, 'opl_stage_replay_missing_receipt_workorder');
  assert.equal(gateBlocker?.payload_workorder?.payload_owner, 'domain_or_human_gate_owner');
  assert.equal(gateBlocker?.payload_workorder?.authority_boundary.can_write_domain_truth, false);
});

test('stage replay certification refuses non-admitted stage packs and missing replay ledgers', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle({
    authorEnsures: ['draft_exists'],
  }), {
    recorded_runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    closeout_packet: {
      closeout_refs: ['mas:publication_review_receipt', 'owner_receipt:publication_review'],
      runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
      receipt_refs: ['human_gate:publication_quality_gate'],
      stage_manifest_ref: 'stage-manifest:publication_review',
      current_pointer_ref: 'current-pointer:publication_review',
      owner_answer_binding_ref: 'owner-answer-binding:publication_review',
    },
  });

  assert.equal(certification.replay_status, 'blocked');
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'stage_pack_not_conformant'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'append_only_event_log_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'attempt_ledger_ref_missing'));
  assert.equal(certification.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(certification.authority_boundary.can_mutate_artifact_body, false);
});

test('stage replay certification schema freezes replay-only non-authority boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-replay-certification.schema.json');
  const properties = schema.properties as Record<string, JsonRecord>;
  const defs = schema.$defs as Record<string, JsonRecord>;
  const authority = defs.authority_boundary as JsonRecord;
  const authorityProperties = authority.properties as Record<string, JsonRecord>;
  const example = (schema.examples as JsonRecord[])[0];
  const exampleAuthority = example.authority_boundary as JsonRecord;

  assert.equal(properties.surface_kind.const, 'opl_family_stage_replay_certification');
  assert.equal(properties.version.const, 'family-stage-replay-certification.v1');
  assert.equal(properties.stage_pack_hash.pattern, '^[0-9a-f]{64}$');
  const summary = defs.summary as JsonRecord;
  const stageResult = defs.stage_result as JsonRecord;
  const missingReceiptWorkorder = defs.missing_receipt_workorder as JsonRecord;
  const missingReceiptWorkorderProperties = missingReceiptWorkorder.properties as Record<string, JsonRecord>;
  assert.equal(authorityProperties.opl_role.const, 'replay_certification_projection_only');
  assert.equal(authorityProperties.replay_reads_append_only_log_refs_only.const, true);
  assert.equal(authorityProperties.can_requery_ai.const, false);
  assert.equal(authorityProperties.can_requery_human.const, false);
  assert.equal(authorityProperties.can_requery_external_system.const, false);
  assert.equal(authorityProperties.can_write_domain_truth.const, false);
  assert.equal(authorityProperties.can_authorize_quality_verdict.const, false);
  assert.equal((summary.required as string[]).includes('codex_attempt_trace_ref_count'), true);
  assert.equal((summary.required as string[]).includes('stage_manifest_ref_count'), true);
  assert.equal((summary.required as string[]).includes('current_pointer_ref_count'), true);
  assert.equal((summary.required as string[]).includes('owner_answer_binding_ref_count'), true);
  assert.equal((stageResult.required as string[]).includes('missing_receipt_workorders'), true);
  assert.equal(missingReceiptWorkorderProperties.surface_kind.const, 'opl_stage_replay_missing_receipt_workorder');
  assert.deepEqual(missingReceiptWorkorderProperties.missing_ref_kind.enum, [
    'human_gate_ref',
    'owner_receipt_ref',
    'domain_receipt_ref',
  ]);
  const workorderAuthority = (
    (missingReceiptWorkorderProperties.authority_boundary as JsonRecord).properties as Record<string, JsonRecord>
  );
  assert.equal(workorderAuthority.can_requery_human.const, false);
  assert.equal(workorderAuthority.can_create_owner_receipt.const, false);
  assert.equal(workorderAuthority.can_authorize_quality_or_export.const, false);
  assert.equal(exampleAuthority.can_requery_external_system, false);
});

test('stage replay certification blocks missing manifest, current pointer, and owner answer binding refs', () => {
  const certification = buildFamilyStageReplayCertification(proofBundle(), {
    append_only_event_log_refs: ['event-log:mas/stages'],
    attempt_ledger_refs: ['attempt-ledger:opl/mas'],
    recorded_runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
    closeout_receipt_refs: [
      'mas:publication_review_receipt',
      'owner_receipt:publication_review',
      'human_gate:publication_quality_gate',
    ],
  });

  assert.equal(certification.replay_status, 'blocked');
  assert.equal(certification.summary.stage_manifest_ref_count, 0);
  assert.equal(certification.summary.current_pointer_ref_count, 0);
  assert.equal(certification.summary.owner_answer_binding_ref_count, 0);
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'stage_manifest_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'current_pointer_ref_missing'));
  assert.ok(certification.blockers.some((entry) => entry.blocker_id === 'owner_answer_binding_ref_missing'));
  assert.equal(certification.authority_boundary.can_accept_or_reject_owner_receipt, false);
  assert.equal(certification.authority_boundary.can_authorize_domain_ready, false);
});
