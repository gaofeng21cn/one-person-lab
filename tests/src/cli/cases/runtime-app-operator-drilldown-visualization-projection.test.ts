import {
  assert,
  test,
} from '../helpers.ts';
import {
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
    domainProjectionIngestion: {
      items: [{
        domain_id: 'medautoscience',
        operator_route_lens_refs: ['example://operator/lens'],
        paper_route_lens_refs: ['example://retired/paper-lens'],
      }],
    },
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
  assert.equal(projection.operator_lens.surface_kind, 'opl_app_runtime_operator_lens_refs');
  assert.equal(projection.summary.operator_route_lens_ref_count, 1);
  assert.equal(projection.operator_lens.operator_route_lens_refs[0].ref, 'example://operator/lens');
  assert.equal(JSON.stringify(projection).includes('retired/paper-lens'), false);
});
