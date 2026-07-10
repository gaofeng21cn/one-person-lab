import {
  assert,
  test,
} from '../helpers.ts';
import {
  buildDomainOwnerPayloadSummaryRefs,
  buildRuntimeVisualizationProjection,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/index.ts';

test('runtime visualization projection exposes canonical stage progress and Temporal refs only', () => {
  const projection = buildRuntimeVisualizationProjection({
    attempts: [
      {
        domain_id: 'medautoscience',
        stage_id: 'write',
        stage_attempt_id: 'attempt-stage-progress',
        task_id: 'task-stage-progress',
        status: 'running',
        stage_progress_log: {
          actual_work: { status: 'running' },
          timeline: {
            duration_telemetry_status: 'observed',
            events: [
              {
                activity_kind: 'codex_stage_activity',
                activity_status: 'running',
                runner_event_kind: 'codex_delta',
                observed_at: '2026-05-27T00:00:00.000Z',
                ref: 'stage_attempt:attempt-stage-progress#activity_events[0]',
              },
            ],
          },
          temporal_webui_ref: {
            url: 'http://localhost:8233/namespaces/default/workflows/attempt-stage-progress/run-1/history',
          },
          memory_body: 'must-not-be-projected',
          artifact_body: 'must-not-be-projected',
        },
      },
    ],
    routeRefs: [],
    decisionRefs: [],
    artifactRefs: [],
    packageLifecycle: {},
    memoryRefs: {},
    qualityRefs: {},
    actionRefs: [],
    ownerReceipts: [],
    typedBlockers: {},
    domainProjectionIngestion: {},
    routeTransitionDrilldown: {},
    stageProductionEvidence: {},
    domainDispatchEvidence: {},
    safeActions: [],
  });

  assert.equal(projection.visual_ref_groups.stage_progress_log_refs.length, 1);
  assert.equal(
    projection.visual_ref_groups.stage_progress_log_refs[0].ref,
    '/stage_attempt_workbench/attempts/attempt-stage-progress/stage_progress_log',
  );
  assert.equal(
    projection.visual_ref_groups.stage_progress_log_refs[0].temporal_webui_url,
    'http://localhost:8233/namespaces/default/workflows/attempt-stage-progress/run-1/history',
  );
  assert.equal(projection.summary.stage_progress_event_count, 1);
  assert.equal(projection.summary.temporal_stage_progress_ref_count, 1);
  assert.equal(
    projection.graph.nodes.some((node: any) =>
      node.node_kind === 'stage_progress_log' && node.stage_attempt_id === 'attempt-stage-progress'
    ),
    true,
  );
  assert.equal(
    projection.graph.edges.some((edge: any) =>
      edge.edge_kind === 'attempt_has_stage_progress_log'
      && edge.stage_attempt_id === 'attempt-stage-progress'
    ),
    true,
  );
  assert.equal(JSON.stringify(projection).includes('must-not-be-projected'), false);
  assert.equal(projection.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.authority_boundary.can_read_artifact_body, false);
  assert.equal(projection.authority_boundary.can_claim_domain_ready, false);
});

test('runtime visualization consumes generic operator lens refs only', () => {
  const projection = buildRuntimeVisualizationProjection({
    attempts: [],
    routeRefs: [],
    decisionRefs: [],
    artifactRefs: [],
    packageLifecycle: {},
    memoryRefs: {},
    qualityRefs: {},
    actionRefs: [],
    ownerReceipts: [],
    typedBlockers: {},
    domainProjectionIngestion: {
      items: [{
        domain_id: 'example-domain',
        operator_route_lens_refs: ['example://operator/lens'],
        paper_route_lens_refs: ['example://retired/paper-lens'],
      }],
    },
    routeTransitionDrilldown: {},
    stageProductionEvidence: {},
    domainDispatchEvidence: {},
    safeActions: [],
  });

  assert.equal(projection.operator_lens.surface_kind, 'opl_app_runtime_operator_lens_refs');
  assert.equal(projection.summary.operator_route_lens_ref_count, 1);
  assert.equal(projection.operator_lens.operator_route_lens_refs[0].ref, 'example://operator/lens');
  assert.equal(JSON.stringify(projection).includes('retired/paper-lens'), false);
});

test('domain owner payload summary preserves active MAS closeout as refs-only compatibility', () => {
  const projection = buildDomainOwnerPayloadSummaryRefs({
    domainManifestProjects: [
      {
        status: 'resolved',
        project_id: 'medautoscience',
        project: 'Med Auto Science',
        manifest: {
          target_domain_id: 'medautoscience',
          real_paper_autonomy_guarded_apply_proof: {
            paper_line_provider_canary_closeout: {
              paper_line_owner_payload_summary: { paper_line_count: 1 },
              paper_line_domain_dispatch_evidence_record_payloads: [{
                study_id: 'legacy',
                record_payload: {
                  typed_blocker_refs: ['typed-blocker:mas/paper-line'],
                },
              }],
            },
          },
        },
      },
      {
        status: 'resolved',
        project_id: 'example-domain',
        project: 'Example Domain',
        manifest: {
          target_domain_id: 'example-domain',
          operator_evidence_readiness_projection: {
            production_evidence_scaleout_refs: {
              owner_payload_item_summary: {
                surface_kind: 'example_owner_payload_item_summary',
                owner: 'example-domain',
                work_items: [],
              },
            },
          },
        },
      },
    ] as any,
  });

  assert.equal(projection.summary.domain_count, 2);
  const legacyMas = projection.domains.find((entry) => entry.domain_id === 'medautoscience');
  assert.ok(legacyMas);
  assert.ok(legacyMas.owner_payload_item_summary);
  assert.equal(
    legacyMas.source_surface,
    'real_paper_autonomy_guarded_apply_proof_compatibility',
  );
  assert.deepEqual(
    legacyMas.owner_payload_item_summary.work_items[0].typed_blocker_path_payload,
    { typed_blocker_refs: ['typed-blocker:mas/paper-line'] },
  );
  const generic = projection.domains.find((entry) => entry.domain_id === 'example-domain');
  assert.ok(generic);
  assert.equal(generic.source_surface, 'operator_evidence_readiness_projection');
});
