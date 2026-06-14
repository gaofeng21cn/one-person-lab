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
            delta_id: 'current-owner-delta:dm002-publication-handoff',
            desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
            payload_requirement: 'current_owner_delta_or_provider_human_hard_gate',
            owner_answer_ref: 'mas://owner-answers/dm002/publication-handoff',
            lineage_ref: 'mas://stage-artifact-unit/DM002/08-publication_package_handoff',
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
  assert.deepEqual(item.goal_oracle_refs, [
    'owner-receipt:dm002-publication-handoff',
    'mas://owner-answers/dm002/publication-handoff',
  ]);
  assert.deepEqual(item.deliverable_target_refs, [
    'deliverable:dm002-publication-package-handoff',
    'mas://stage-artifact-unit/DM002/08-publication_package_handoff',
  ]);
  assert.deepEqual(item.current_owner_delta_refs, [
    'current-owner-delta:dm002-publication-handoff',
    'mas://stage-artifact-unit/DM002/08-publication_package_handoff',
  ]);
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

test('workstream operating loop treats current gate replay receipt as owner answer without ready claim', () => {
  const gateReceiptRef =
    'runtime/quests/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/reports/publishability_gate/2026-06-07T015349Z.json';
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-current-gate-replay',
          task_id: 'task-dm003-gate-replay',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'mas_default_executor_source_gate_replay',
          created_at: '2026-06-07T01:50:27.773Z',
          updated_at: '2026-06-07T01:53:49.217Z',
          workspace_locator: {
            dispatch_ref:
              'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'run_gate_clearing_batch',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'typed_blocker',
            deliverable_progress_delta: {
              changed_stage_surfaces: [],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {
            gate_receipt_ref: gateReceiptRef,
            domain_ready_verdict: 'publication_gate_blocked',
          },
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const workstream = drilldown.workstream_operating_loop.workstreams[0];
  assert.equal(workstream.goal_oracle_status, 'observed');
  assert.deepEqual(workstream.quality_gate_refs, [gateReceiptRef]);
  assert.equal(workstream.latest_owner_answer_ref, gateReceiptRef);
  assert.equal(workstream.latest_owner_answer_kind, 'quality_gate_receipt');
  assert.equal(workstream.latest_owner_answer_is_domain_ready_verdict, false);

  const currentOwnerDelta =
    drilldown.attention_first_payload.current_owner_delta_read_model.current_owner_delta;
  assert.equal(currentOwnerDelta.lineage_ref, 'sat-current-gate-replay');
  assert.equal(currentOwnerDelta.latest_owner_answer_ref, gateReceiptRef);
  assert.equal(currentOwnerDelta.latest_owner_answer_kind, 'quality_gate_receipt');
  assert.equal(currentOwnerDelta.hard_gate.state, 'domain_owner_answer_recorded');
  assert.equal(currentOwnerDelta.hard_gate.human_or_domain_owner_required, false);
  assert.equal(currentOwnerDelta.hard_gate.domain_ready_authorized, false);
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none,
    null,
  );
});

test('owner delta first prefers the latest current domain dispatch workstream', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-superseded-dm002',
          task_id: 'task-dm002-old',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:old-dm002',
          created_at: '2026-06-06T16:25:06.270Z',
          updated_at: '2026-06-06T16:38:58.385Z',
          workspace_locator: {
            dispatch_ref: 'studies/002/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/request.json',
            study_id: '002-dm-china-us-mortality-attribution',
            action_type: 'complete_medical_paper_readiness_surface',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm002-old',
            lineage_ref: 'sat-superseded-dm002',
            source_fingerprint: 'sha256:old-dm002',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
        },
        {
          stage_attempt_id: 'sat-current-dm003',
          task_id: 'task-dm003-current',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:current-dm003',
          created_at: '2026-06-06T16:40:06.053Z',
          updated_at: '2026-06-06T16:50:18.414Z',
          workspace_locator: {
            dispatch_ref: 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'complete_medical_paper_readiness_surface',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm003-current',
            lineage_ref: 'sat-current-dm003',
            source_fingerprint: 'sha256:current-dm003',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const [oldWorkstream, currentWorkstream] = drilldown.workstream_operating_loop.workstreams;
  assert.equal(oldWorkstream.default_actionability_status, 'current');
  assert.equal(oldWorkstream.superseded_by_stage_attempt_id, null);
  assert.equal(currentWorkstream.default_actionability_status, 'current');

  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.primary_item.stage_attempt_id,
    'sat-current-dm003',
  );
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model.current_owner_delta.lineage_ref,
    'sat-current-dm003',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.workstream_item.stage_attempt_id,
    'sat-current-dm003',
  );
});

test('owner delta first skips superseded domain dispatch workstreams', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-superseded-dm003',
          task_id: 'task-dm003-old',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:old-dm003',
          created_at: '2026-06-06T16:25:06.270Z',
          updated_at: '2026-06-06T16:38:58.385Z',
          workspace_locator: {
            dispatch_ref: 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'complete_medical_paper_readiness_surface',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm003-old',
            lineage_ref: 'sat-superseded-dm003',
            source_fingerprint: 'sha256:old-dm003',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
        },
        {
          stage_attempt_id: 'sat-current-dm003-retry',
          task_id: 'task-dm003-current',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:current-dm003',
          created_at: '2026-06-06T16:40:06.053Z',
          updated_at: '2026-06-06T16:50:18.414Z',
          workspace_locator: {
            dispatch_ref: 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'complete_medical_paper_readiness_surface',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm003-current',
            lineage_ref: 'sat-current-dm003-retry',
            source_fingerprint: 'sha256:current-dm003',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const [oldWorkstream, currentWorkstream] = drilldown.workstream_operating_loop.workstreams;
  assert.equal(oldWorkstream.default_actionability_status, 'superseded');
  assert.equal(oldWorkstream.superseded_by_stage_attempt_id, 'sat-current-dm003-retry');
  assert.equal(currentWorkstream.default_actionability_status, 'current');

  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.primary_item.stage_attempt_id,
    'sat-current-dm003-retry',
  );
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model.current_owner_delta.lineage_ref,
    'sat-current-dm003-retry',
  );
});

test('owner delta first keeps unbound dispatch workstreams as provenance, not current owner pointer', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-stale-unbound-paper-autonomy',
          task_id: 'frt-stale-unbound-paper-autonomy',
          domain_id: 'medautoscience',
          stage_id: 'paper_autonomy/guarded-apply',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:stale-unbound-paper-autonomy',
          created_at: '2026-06-14T09:00:00.000Z',
          updated_at: '2026-06-14T09:30:00.000Z',
          workspace_locator: {
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'run_quality_repair_batch',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:stale-unbound-paper-autonomy',
            lineage_ref: 'sat-stale-unbound-paper-autonomy',
            source_fingerprint: 'sha256:stale-unbound-paper-autonomy',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
          artifact_refs: [
            'runtime/artifacts/opl_family_domain_handler/dispatch_receipts/a6906c3602db0b2b0601.json',
            'mas-domain-handler-dispatch:frt-stale-unbound-paper-autonomy',
          ],
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const workstream = drilldown.workstream_operating_loop.workstreams[0];
  assert.equal(workstream.heartbeat_status, 'closed');
  assert.equal(workstream.default_actionable, false);
  assert.equal(
    workstream.default_actionability_status,
    'not_actionable_unbound_dispatch_identity',
  );
  assert.equal(
    workstream.next_steering_action.action_id,
    'record_owner_or_gate_for_target_anchor',
  );

  const ownerDeltaFirst = drilldown.attention_first_payload.owner_delta_first;
  assert.notEqual(
    ownerDeltaFirst.primary_item.stage_attempt_id,
    'sat-stale-unbound-paper-autonomy',
  );
  assert.equal(ownerDeltaFirst.workstream_item, null);
  assert.equal(ownerDeltaFirst.primary_item.source, 'evidence_next_steps');
  assert.equal(
    ownerDeltaFirst.next_required_delta,
    'domain_or_app_owner_payload_ref_or_typed_blocker_required',
  );
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model
      .current_owner_delta.lineage_ref,
    null,
  );
});

test('owner delta first projects MAS current work unit ahead of stale unbound dispatch residue', () => {
  const currentWorkUnit = {
    surface_kind: 'mas_current_work_unit_projection',
    projection_policy: 'refs_only_domain_currentness_projection_no_domain_truth_write',
    domain_id: 'medautoscience',
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    stage_id: 'publication_supervision',
    current_owner: 'write',
    owner: 'write',
    action_type: 'run_quality_repair_batch',
    work_unit_id: 'medical_prose_write_repair',
    work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
    status: 'executable_owner_action',
    currentness_basis: {
      truth_epoch: 'truth-event-000035-39f0b8e96689a623',
      runtime_health_epoch: 'runtime-health-event-006839-47eeac962614068d',
      stage_attempt_id: 'sat-current-work-unit',
    },
    source_refs: [
      'mas://study-progress/003-dpcc-primary-care-phenotype-treatment-gap',
    ],
    authority_boundary: {
      mas_truth_owner: true,
      opl_role: 'projection_consumer_only',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-stale-unbound-paper-autonomy',
          task_id: 'frt-stale-unbound-paper-autonomy',
          domain_id: 'medautoscience',
          stage_id: 'paper_autonomy/guarded-apply',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:stale-unbound-paper-autonomy',
          created_at: '2026-06-14T09:00:00.000Z',
          updated_at: '2026-06-14T09:30:00.000Z',
          workspace_locator: {
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'run_quality_repair_batch',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:stale-unbound-paper-autonomy',
            lineage_ref: 'sat-stale-unbound-paper-autonomy',
            source_fingerprint: 'sha256:stale-unbound-paper-autonomy',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
          artifact_refs: [
            'runtime/artifacts/opl_family_domain_handler/dispatch_receipts/a6906c3602db0b2b0601.json',
            'mas-domain-handler-dispatch:frt-stale-unbound-paper-autonomy',
          ],
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    currentWorkUnitProjections: [currentWorkUnit],
    detailLevel: 'full',
  }) as any;

  const ownerDeltaFirst = drilldown.attention_first_payload.owner_delta_first;
  assert.equal(ownerDeltaFirst.primary_item.source, 'domain_current_work_unit');
  assert.equal(ownerDeltaFirst.primary_item.status, 'executable_owner_action');
  assert.equal(ownerDeltaFirst.primary_item.domain_id, 'medautoscience');
  assert.equal(ownerDeltaFirst.primary_item.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
  assert.equal(ownerDeltaFirst.primary_item.stage_id, 'publication_supervision');
  assert.equal(ownerDeltaFirst.primary_item.owner, 'write');
  assert.equal(ownerDeltaFirst.primary_item.action_type, 'run_quality_repair_batch');
  assert.equal(ownerDeltaFirst.primary_item.work_unit_id, 'medical_prose_write_repair');
  assert.equal(ownerDeltaFirst.primary_item.stage_attempt_id, 'sat-current-work-unit');
  assert.equal(
    ownerDeltaFirst.primary_item.work_unit_fingerprint,
    'publication-blockers::0915410f804b3697',
  );
  assert.equal(
    ownerDeltaFirst.primary_item.currentness_basis.truth_epoch,
    'truth-event-000035-39f0b8e96689a623',
  );
  assert.equal(ownerDeltaFirst.next_owner, 'write');
  assert.equal(
    ownerDeltaFirst.next_required_delta,
    'domain_current_work_unit_owner_action_or_typed_blocker_required',
  );
  assert.equal(ownerDeltaFirst.workstream_item, null);

  const readModel = drilldown.attention_first_payload.current_owner_delta_read_model;
  assert.equal(readModel.current_owner, 'write');
  assert.equal(readModel.current_owner_delta.domain_id, 'medautoscience');
  assert.equal(readModel.current_owner_delta.stage_id, 'publication_supervision');
  assert.equal(
    readModel.current_owner_delta.work_unit_id,
    'medical_prose_write_repair',
  );
  assert.equal(
    readModel.current_owner_delta.work_unit_fingerprint,
    'publication-blockers::0915410f804b3697',
  );
  assert.equal(
    readModel.current_owner_delta.owner_route_currentness_basis.truth_epoch,
    'truth-event-000035-39f0b8e96689a623',
  );
  assert.equal(readModel.current_owner_delta.lineage_ref, 'sat-current-work-unit');
  assert.equal(readModel.current_owner_delta.stage_attempt_id, 'sat-current-work-unit');
  assert.equal(
    readModel.current_owner_delta.authority_boundary.can_write_domain_truth,
    false,
  );
  assert.equal(
    readModel.current_owner_delta.authority_boundary.can_create_owner_receipt,
    false,
  );
});

test('owner delta first prioritizes OPL-owned MAS current work-unit blockers over later domain actions', () => {
  const domainActionWorkUnit = {
    surface_kind: 'mas_current_work_unit_projection',
    projection_policy: 'refs_only_domain_currentness_projection_no_domain_truth_write',
    domain_id: 'medautoscience',
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    stage_id: 'publication_supervision',
    current_owner: 'write',
    owner: 'write',
    action_type: 'run_quality_repair_batch',
    work_unit_id: 'medical_prose_write_repair',
    work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
    status: 'executable_owner_action',
    currentness_basis: {
      truth_epoch: 'truth-event-000040-1a4d1f9cfed66d87',
      runtime_health_epoch: 'runtime-health-event-006839-47eeac962614068d',
    },
  };
  const oplBlockerWorkUnit = {
    surface_kind: 'mas_current_work_unit_projection',
    projection_policy: 'refs_only_domain_currentness_projection_no_domain_truth_write',
    domain_id: 'medautoscience',
    study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
    stage_id: 'managed_opl_runtime_owner_handoff_gap',
    current_owner: 'one-person-lab',
    owner: 'one-person-lab',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'truth-snapshot::c275cc9ec942575e291388ff',
    work_unit_fingerprint: 'truth-snapshot::c275cc9ec942575e291388ff',
    status: 'typed_blocker',
    currentness_basis: {
      truth_epoch: 'truth-event-000006-3d805e45be5cd58a',
      runtime_health_epoch: 'runtime-health-event-004968-09c7d147e7508da9',
      stage_attempt_id: 'sat-opl-current-work-unit-blocker',
    },
    current_execution_envelope: {
      state_kind: 'typed_blocker',
      owner: 'one-person-lab',
      typed_blocker: {
        latest_owner_answer_ref:
          'mas://typed-blockers/dm004/truth-snapshot-c275cc9ec942575e291388ff',
        typed_blocker_ref:
          'mas://typed-blockers/dm004/truth-snapshot-c275cc9ec942575e291388ff',
        source_ref:
          'mas://study-progress/004-dpcc-longitudinal-care-inertia-intensification-gap',
      },
    },
  };
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: { attempts: [] },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    currentWorkUnitProjections: [domainActionWorkUnit, oplBlockerWorkUnit],
    detailLevel: 'full',
  }) as any;

  const ownerDeltaFirst = drilldown.attention_first_payload.owner_delta_first;
  assert.equal(ownerDeltaFirst.primary_item.source, 'domain_current_work_unit');
  assert.equal(ownerDeltaFirst.primary_item.status, 'typed_blocker');
  assert.equal(ownerDeltaFirst.primary_item.owner, 'one-person-lab');
  assert.equal(
    ownerDeltaFirst.primary_item.study_id,
    '004-dpcc-longitudinal-care-inertia-intensification-gap',
  );
  assert.equal(
    ownerDeltaFirst.primary_item.work_unit_id,
    'truth-snapshot::c275cc9ec942575e291388ff',
  );
  assert.equal(
    ownerDeltaFirst.primary_item.stage_attempt_id,
    'sat-opl-current-work-unit-blocker',
  );
  assert.equal(ownerDeltaFirst.summary.domain_current_work_unit_count, 2);

  const currentOwnerDelta =
    drilldown.attention_first_payload.current_owner_delta_read_model.current_owner_delta;
  assert.equal(
    currentOwnerDelta.latest_owner_answer_ref,
    'mas://typed-blockers/dm004/truth-snapshot-c275cc9ec942575e291388ff',
  );
  assert.equal(currentOwnerDelta.latest_owner_answer_kind, 'typed_blocker');
  assert.equal(currentOwnerDelta.lineage_ref, 'sat-opl-current-work-unit-blocker');
  assert.equal(currentOwnerDelta.stage_attempt_id, 'sat-opl-current-work-unit-blocker');
  assert.equal(currentOwnerDelta.hard_gate.state, 'domain_owner_answer_recorded');
  assert.equal(currentOwnerDelta.hard_gate.human_or_domain_owner_required, false);
  assert.equal(currentOwnerDelta.hard_gate.domain_ready_authorized, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_write_domain_truth, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_create_typed_blocker, false);
});

test('owner delta first does not promote unclosed running attempts over closed owner target', () => {
  const drilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench: {
      attempts: [
        {
          stage_attempt_id: 'sat-closed-owner-target',
          task_id: 'frt-closed-owner-target',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'completed',
          local_status: 'completed',
          source_fingerprint: 'sha256:closed-owner-target',
          created_at: '2026-06-12T14:45:24.495Z',
          updated_at: '2026-06-12T15:05:59.187Z',
          workspace_locator: {
            dispatch_ref:
              'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'return_to_ai_reviewer_workflow',
          },
          closeout_receipt_status: 'accepted_typed_closeout',
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm003-closed-owner-target',
            lineage_ref: 'sat-closed-owner-target',
            source_fingerprint: 'sha256:closed-owner-target',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'deliverable_progress',
            deliverable_progress_delta: {
              changed_stage_surfaces: ['paper:readiness'],
            },
            platform_repair_delta: {
              changed_stage_surfaces: [],
            },
          },
          route_impact: {},
        },
        {
          stage_attempt_id: 'sat-running-newer-attempt',
          task_id: 'frt-running-newer-attempt',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          status: 'running',
          local_status: 'running',
          source_fingerprint: 'sha256:running-newer-attempt',
          created_at: '2026-06-12T15:00:34.811Z',
          updated_at: '2026-06-12T15:06:34.954Z',
          workspace_locator: {
            dispatch_ref:
              'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/request.json',
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'run_quality_repair_batch',
          },
          closeout_receipt_status: null,
          current_owner_delta: {
            delta_id: 'current-owner-delta:dm003-running-newer-attempt',
            lineage_ref: 'sat-running-newer-attempt',
            source_fingerprint: 'sha256:running-newer-attempt',
          },
          stage_progress_log: {
            surface_kind: 'opl_stage_progress_log',
            progress_delta_classification: 'unknown',
          },
          route_impact: {},
        },
      ],
    },
    providerContinuousProof: {},
    domainProjectionIngestion: {},
    domainManifestProjects: [],
    detailLevel: 'full',
  }) as any;

  const [closedWorkstream, runningWorkstream] = drilldown.workstream_operating_loop.workstreams;
  assert.equal(closedWorkstream.heartbeat_status, 'closed');
  assert.equal(runningWorkstream.heartbeat_status, 'running');
  assert.equal(runningWorkstream.default_actionable, false);
  assert.equal(
    runningWorkstream.default_actionability_status,
    'not_actionable_stage_attempt_not_closed',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.primary_item.stage_attempt_id,
    'sat-closed-owner-target',
  );
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model.current_owner_delta.lineage_ref,
    'sat-closed-owner-target',
  );
});
