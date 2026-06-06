import {
  assert,
  test,
} from '../helpers.ts';
import {
  buildAppOperatorDrilldown,
} from '../../../../src/runtime-tray-app-operator-drilldown.ts';

test('runtime App drilldown projects a refs-only workstream operating loop for artifact-first steering', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-codex-maxxing-1',
          task_id: 'task-codex-maxxing-study',
          domain_id: 'medautoscience',
          stage_id: 'manuscript_authoring',
          status: 'checkpointed',
          source_fingerprint: 'sha256:study-source',
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['manuscript:draft'],
              artifact_refs: ['artifact:manuscript-draft-v2'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
            next_forced_delta: {
              owner: 'med-autoscience',
              action: 'independent_ai_review',
            },
          },
          route_impact: {
            owner_receipt_refs: ['owner-receipt:mas/manuscript-draft-v2'],
            typed_blocker_refs: [],
            quality_refs: ['publication-eval:dm002/latest'],
            readiness_refs: ['controller-decision:dm002/latest'],
            package_refs: ['package:submission-v2'],
            export_refs: ['export:submission-v2'],
            memory_recall_trace_refs: ['memory-recall:study-route'],
            memory_retrieval_trace_refs: ['memory-retrieval:study-route'],
          },
          consumed_memory_refs: ['memory:study-route'],
          writeback_receipt_refs: ['memory-writeback:study-route-update'],
          checkpoint_refs: ['checkpoint:manuscript-v2'],
          closeout_refs: ['closeout:manuscript-v2'],
          artifact_refs: ['artifact:manuscript-draft-v2'],
        },
      ],
      artifact_gallery: {
        items: [
          {
            ref: 'artifact:manuscript-draft-v2',
            item_kind: 'manuscript_artifact',
            domain_id: 'medautoscience',
            stage_id: 'manuscript_authoring',
            stage_attempt_id: 'sat-codex-maxxing-1',
            content_policy: 'locator_only_no_artifact_content',
            handoff_target: 'review_and_quality_gate',
          },
        ],
      },
      package_export_lifecycle: {
        package_refs: ['package:submission-v2'],
        export_refs: ['export:submission-v2'],
      },
      memory_locator_index: {
        consumed_memory_refs: ['memory:study-route'],
        writeback_receipt_refs: ['memory-writeback:study-route-update'],
      },
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const loop = drilldown.workstream_operating_loop;
  assert.equal(loop.surface_kind, 'opl_workstream_operating_loop_projection');
  assert.equal(loop.projection_policy, 'refs_only_operator_steering_no_domain_truth_or_artifact_body');
  assert.equal(loop.summary.workstream_count, 1);
  assert.equal(loop.summary.artifact_first_review_available_count, 1);
  assert.equal(loop.summary.deliverable_progress_workstream_count, 1);
  assert.equal(loop.summary.platform_repair_only_workstream_count, 0);
  assert.equal(loop.summary.goal_oracle_missing_count, 0);
  assert.equal(loop.summary.next_steering_action_count, 1);
  assert.equal(loop.false_authority_flags.can_read_artifact_body, false);
  assert.equal(loop.false_authority_flags.can_write_domain_truth, false);
  assert.equal(loop.false_authority_flags.can_create_owner_receipt, false);
  assert.equal(loop.false_authority_flags.can_claim_domain_ready, false);
  assert.equal(loop.false_authority_flags.can_claim_production_ready, false);

  const item = loop.workstreams[0];
  assert.equal(item.workstream_id, 'medautoscience:task-codex-maxxing-study');
  assert.equal(item.operating_loop_status, 'artifact_review_ready');
  assert.equal(item.goal_oracle_status, 'observed');
  assert.equal(item.heartbeat_status, 'checkpointed');
  assert.equal(item.progress_classification, 'deliverable_progress');
  assert.deepEqual(item.artifact_review_refs, ['artifact:manuscript-draft-v2']);
  assert.deepEqual(item.memory_refs, ['memory:study-route']);
  assert.deepEqual(item.memory_writeback_receipt_refs, ['memory-writeback:study-route-update']);
  assert.deepEqual(item.owner_receipt_refs, ['owner-receipt:mas/manuscript-draft-v2']);
  assert.deepEqual(item.package_refs, ['package:submission-v2']);
  assert.deepEqual(item.export_refs, ['export:submission-v2']);
  assert.deepEqual(item.next_steering_action.required_next_refs_any_of, [
    'artifact_review_ref',
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(item.next_steering_action.can_execute_domain_action, false);
  assert.equal(item.next_steering_action.can_create_owner_receipt, false);
  assert.equal(item.next_steering_action.can_claim_domain_ready, false);

  assert.equal(
    drilldown.attention_first_payload.workstream_operating_loop.surface_kind,
    'opl_workstream_operating_loop_projection',
  );
  assert.equal(
    drilldown.attention_first_payload.workstream_operating_loop.summary.workstream_count,
    1,
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.surface_kind,
    'opl_owner_delta_first_projection',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.projection_policy,
    'default_operator_surface_prioritizes_next_owner_delta_raw_refs_only_counters_are_drilldown',
  );
  assert.equal(drilldown.attention_first_payload.owner_delta_first.next_owner, 'med-autoscience');
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_required_delta,
    'artifact_review_or_domain_owner_receipt_required',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.primary_item.source,
    'workstream_operating_loop',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.raw_attention_default_policy,
    'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.authority_boundary.can_create_owner_receipt,
    false,
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.authority_boundary.can_claim_production_ready,
    false,
  );
  assert.equal(
    drilldown.summary.workstream_operating_loop_artifact_first_review_available_count,
    1,
  );
});

test('workstream operating loop separates platform repair from deliverable progress and fails closed without goal oracle', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-platform-repair-only',
          task_id: 'task-platform-repair',
          domain_id: 'medautoscience',
          stage_id: 'review_and_quality_gate',
          status: 'running',
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'platform_repair',
            deliverable_progress_delta: {
              changed_stage_surfaces: [],
            },
            platform_repair_delta: {
              changed_stage_surfaces: ['read-model:currentness'],
            },
          },
          route_impact: {
            typed_blocker_refs: ['typed-blocker:missing-owner-receipt'],
          },
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const item = drilldown.workstream_operating_loop.workstreams[0];
  assert.equal(item.operating_loop_status, 'needs_goal_oracle_or_owner_receipt');
  assert.equal(item.goal_oracle_status, 'missing');
  assert.equal(item.progress_classification, 'platform_repair');
  assert.deepEqual(item.artifact_review_refs, []);
  assert.equal(item.next_steering_action.action_id, 'provide_goal_oracle_or_owner_receipt');
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.status,
    'owner_delta_required',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_required_delta,
    'domain_owner_receipt_quality_gate_or_typed_blocker_required',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.summary.workstream_goal_oracle_missing_count,
    1,
  );
  assert.equal(
    drilldown.workstream_operating_loop.summary.platform_repair_only_workstream_count,
    1,
  );
  assert.equal(drilldown.workstream_operating_loop.summary.goal_oracle_missing_count, 1);
  assert.equal(drilldown.workstream_operating_loop.summary.artifact_first_review_available_count, 0);
});

test('workstream operating loop anchors missing completion oracle to current owner delta and stage target refs', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-current-owner-delta-target',
          task_id: 'task-owner-delta-target',
          domain_id: 'medautoscience',
          stage_id: 'publication_handoff_owner_gate',
          status: 'checkpointed',
          workspace_locator: {
            stage_packet_ref: 'packet:dm002-publication-handoff',
          },
          current_owner_delta: {
            desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
            payload_requirement: 'current_owner_delta',
            owner_answer_ref: 'mas://owner-answers/dm002/publication-handoff',
          },
          stage_contract: {
            expected_deliverable_refs: ['deliverable:dm002-publication-package-handoff'],
            expected_receipt_refs: ['owner-receipt:dm002-publication-handoff'],
          },
          stage_pack_refs: ['stage-pack:mas/publication-handoff'],
          owner_handoff_packet_refs: ['owner-handoff:mas/publication-handoff'],
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['publication:handoff'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {
            typed_blocker_refs: [],
          },
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const loop = drilldown.workstream_operating_loop;
  const item = loop.workstreams[0];
  assert.equal(item.goal_oracle_status, 'target_anchor_observed_owner_or_gate_needed');
  assert.equal(item.operating_loop_status, 'needs_owner_oracle_for_target_anchor');
  assert.deepEqual(item.goal_oracle_refs, ['owner-receipt:dm002-publication-handoff']);
  assert.deepEqual(item.deliverable_target_refs, ['deliverable:dm002-publication-package-handoff']);
  assert.deepEqual(item.owner_handoff_packet_refs, ['owner-handoff:mas/publication-handoff']);
  assert.deepEqual(item.stage_pack_refs, [
    'stage-pack:mas/publication-handoff',
    'packet:dm002-publication-handoff',
  ]);
  assert.equal(item.missing_goal_oracle_signal.signal_kind, 'bounded_goal_oracle_advisory');
  assert.equal(item.missing_goal_oracle_signal.hard_gate, false);
  assert.equal(item.next_steering_action.action_id, 'record_owner_or_gate_for_target_anchor');
  assert.deepEqual(item.next_steering_action.required_next_refs_any_of, [
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(loop.summary.goal_oracle_missing_count, 0);
  assert.equal(loop.summary.goal_oracle_target_anchor_observed_count, 1);
  assert.equal(loop.summary.deliverable_target_ref_observed_count, 1);
  assert.equal(loop.summary.goal_oracle_advisory_count, 1);
  assert.equal(
    drilldown.summary.workstream_operating_loop_goal_oracle_target_anchor_observed_count,
    1,
  );
  assert.equal(
    drilldown.summary.workstream_operating_loop_deliverable_target_ref_observed_count,
    1,
  );
  assert.equal(
    drilldown.summary.workstream_operating_loop_goal_oracle_advisory_count,
    1,
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_required_delta,
    'domain_owner_receipt_quality_gate_or_typed_blocker_required',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.summary.workstream_goal_oracle_missing_count,
    0,
  );
});
