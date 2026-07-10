import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  uniqueRefs,
  uniqueRefsByValue,
} from './value-utils.ts';

type RuntimeVisualizationInput = {
  attempts: JsonRecord[];
  routeRefs: JsonRecord[];
  decisionRefs: JsonRecord[];
  artifactRefs: JsonRecord[];
  packageLifecycle: JsonRecord;
  memoryRefs: JsonRecord;
  qualityRefs: JsonRecord;
  actionRefs: JsonRecord[];
  ownerReceipts: JsonRecord[];
  typedBlockers: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  routeTransitionDrilldown: JsonRecord;
  stageProductionEvidence: JsonRecord;
  domainDispatchEvidence: JsonRecord;
  safeActions: JsonRecord[];
};

function nonNullRef<T extends { ref: string | null }>(value: T): value is T & { ref: string } {
  return Boolean(value.ref);
}

function attemptRef(stageAttemptId: string) {
  return `/stage_attempt_workbench/attempts/${stageAttemptId}`;
}

function attemptNodes(attempts: JsonRecord[]) {
  return attempts
    .map((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId) {
        return null;
      }
      const currentState = record(attempt.current_control_state);
      return {
        node_id: `stage_attempt:${stageAttemptId}`,
        node_kind: 'stage_attempt',
        ref: attemptRef(stageAttemptId),
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        task_id: stringValue(attempt.task_id),
        status: stringValue(attempt.status)
          ?? stringValue(attempt.local_status)
          ?? stringValue(currentState.current_attempt_state),
        current_control_state: stringValue(currentState.reconciliation_status)
          ?? stringValue(currentState.current_attempt_state),
        updated_at: stringValue(attempt.updated_at),
        source_fingerprint: stringValue(attempt.source_fingerprint),
      };
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
}

function refNodes(refs: JsonRecord[], nodeKind: string, fallbackRole: string) {
  return uniqueRefsByValue(refs
    .map((entry) => ({
      node_id: `${nodeKind}:${stringValue(entry.ref) ?? ''}`,
      node_kind: nodeKind,
      ref: stringValue(entry.ref),
      role: stringValue(entry.role) ?? fallbackRole,
      domain_id: stringValue(entry.domain_id),
      stage_id: stringValue(entry.stage_id),
      stage_attempt_id: stringValue(entry.stage_attempt_id),
      action_id: stringValue(entry.action_id),
      action_kind: stringValue(entry.action_kind),
      owner: stringValue(entry.owner) ?? stringValue(entry.action_owner),
      route_target_kind: stringValue(entry.route_target_kind),
    }))
    .filter(nonNullRef));
}

function progressLogRefs(attempts: JsonRecord[]) {
  return attempts
    .map((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      const progressLog = record(attempt.stage_progress_log);
      if (!stageAttemptId || Object.keys(progressLog).length === 0) {
        return null;
      }
      const temporalWebUiRef = record(progressLog.temporal_webui_ref);
      return {
        ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/stage_progress_log`,
        role: 'stage_attempt_progress_log',
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        status: stringValue(record(progressLog.actual_work).status),
        duration_telemetry_status: stringValue(record(progressLog.timeline).duration_telemetry_status),
        temporal_webui_url: stringValue(temporalWebUiRef.url),
      };
    })
    .filter((entry): entry is {
      ref: string;
      role: string;
      domain_id: string | null;
      stage_id: string | null;
      stage_attempt_id: string;
      status: string | null;
      duration_telemetry_status: string | null;
      temporal_webui_url: string | null;
    } => Boolean(entry));
}

function packageExportNodes(packageLifecycle: JsonRecord) {
  return uniqueRefsByValue([
    ...stringList(packageLifecycle.package_refs).map((ref) => ({
      node_id: `package_ref:${ref}`,
      node_kind: 'package_ref',
      ref,
      role: 'package_ref',
    })),
    ...stringList(packageLifecycle.export_refs).map((ref) => ({
      node_id: `export_ref:${ref}`,
      node_kind: 'export_ref',
      ref,
      role: 'export_ref',
    })),
    ...stringList(packageLifecycle.gap_report_refs).map((ref) => ({
      node_id: `gap_report_ref:${ref}`,
      node_kind: 'gap_report_ref',
      ref,
      role: 'gap_report_ref',
    })),
  ]);
}

function memoryNodes(memoryRefs: JsonRecord) {
  return uniqueRefsByValue([
    ...stringList(memoryRefs.consumed_memory_refs).map((ref) => ({
      node_id: `memory_ref:${ref}`,
      node_kind: 'memory_ref',
      ref,
      role: 'consumed_memory_ref',
    })),
    ...stringList(memoryRefs.writeback_receipt_refs).map((ref) => ({
      node_id: `memory_writeback_receipt:${ref}`,
      node_kind: 'memory_writeback_receipt',
      ref,
      role: 'memory_writeback_receipt_ref',
    })),
  ]);
}

function qualityReadinessNodes(qualityRefs: JsonRecord) {
  return uniqueRefsByValue([
    ...stringList(qualityRefs.quality_refs).map((ref) => ({
      node_id: `quality_ref:${ref}`,
      node_kind: 'quality_ref',
      ref,
      role: 'quality_ref',
    })),
    ...stringList(qualityRefs.readiness_refs).map((ref) => ({
      node_id: `readiness_ref:${ref}`,
      node_kind: 'readiness_ref',
      ref,
      role: 'readiness_ref',
    })),
  ]);
}

function edgeId(from: string, to: string, kind: string) {
  return `${from}->${to}:${kind}`;
}

function attemptEdges(refs: JsonRecord[], nodeKind: string, edgeKind: string) {
  return uniqueRefsByValue(refs
    .map((entry) => {
      const stageAttemptId = stringValue(entry.stage_attempt_id);
      const ref = stringValue(entry.ref);
      if (!stageAttemptId || !ref) {
        return null;
      }
      const from = `stage_attempt:${stageAttemptId}`;
      const to = `${nodeKind}:${ref}`;
      return {
        ref: `${attemptRef(stageAttemptId)}#${edgeKind}:${encodeURIComponent(ref)}`,
        edge_id: edgeId(from, to, edgeKind),
        edge_kind: edgeKind,
        from_node_id: from,
        to_node_id: to,
        domain_id: stringValue(entry.domain_id),
        stage_id: stringValue(entry.stage_id),
        stage_attempt_id: stageAttemptId,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)));
}

function stageProductionNodes(stageProductionEvidence: JsonRecord) {
  return recordList(stageProductionEvidence.stages).map((stage) => {
    const domainId = stringValue(stage.target_domain_id)
      ?? stringValue(stage.domain_id)
      ?? stringValue(stage.project_id);
    const stageId = stringValue(stage.stage_id);
    const ref = stringValue(stage.ref) ?? `/stage_production_evidence/${domainId ?? 'domain'}/${stageId ?? 'stage'}`;
    return {
      node_id: `stage_evidence:${domainId ?? 'domain'}:${stageId ?? 'stage'}`,
      node_kind: 'stage_evidence',
      ref,
      domain_id: domainId,
      stage_id: stageId,
      production_evidence_status: stringValue(stage.production_evidence_status),
      expected_receipt_ref_count: stringList(stage.expected_receipt_refs).length,
      observed_expected_receipt_ref_count: stringList(stage.observed_expected_receipt_refs).length,
      unobserved_expected_receipt_ref_count: stringList(stage.unobserved_expected_receipt_refs).length,
      missing_production_evidence_count: stringList(stage.missing_production_evidence).length,
    };
  });
}

function stageProductionEdges(attempts: JsonRecord[], stageProductionEvidence: JsonRecord) {
  const attemptKeys = new Set(
    attempts.map((attempt) => [
      stringValue(attempt.domain_id),
      stringValue(attempt.stage_id),
      stringValue(attempt.stage_attempt_id),
    ] as const),
  );
  return uniqueRefsByValue(recordList(stageProductionEvidence.stages).flatMap((stage) => {
    const domainId = stringValue(stage.target_domain_id)
      ?? stringValue(stage.domain_id)
      ?? stringValue(stage.project_id);
    const stageId = stringValue(stage.stage_id);
    if (!domainId || !stageId) {
      return [];
    }
    return [...attemptKeys].flatMap(([attemptDomainId, attemptStageId, stageAttemptId]) => {
      if (!stageAttemptId || attemptDomainId !== domainId || attemptStageId !== stageId) {
        return [];
      }
      const from = `stage_attempt:${stageAttemptId}`;
      const to = `stage_evidence:${domainId}:${stageId}`;
      return [{
        ref: `${attemptRef(stageAttemptId)}#stage_production_evidence`,
        edge_id: edgeId(from, to, 'attempt_has_stage_evidence'),
        edge_kind: 'attempt_has_stage_evidence',
        from_node_id: from,
        to_node_id: to,
        domain_id: domainId,
        stage_id: stageId,
        stage_attempt_id: stageAttemptId,
      }];
    });
  }));
}

function timelineEvents(input: RuntimeVisualizationInput) {
  return [
    ...input.attempts.flatMap((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      const progressLog = record(attempt.stage_progress_log);
      const progressEvents = recordList(record(progressLog.timeline).events);
      if (!stageAttemptId || progressEvents.length === 0) {
        return [];
      }
      return progressEvents.map((event, index) => ({
        event_id: `stage_progress:${stageAttemptId}:${index}`,
        event_kind: 'stage_progress_event',
        ref: stringValue(event.ref) ?? `/stage_attempt_workbench/attempts/${stageAttemptId}/stage_progress_log`,
        node_id: `stage_progress_log:${stageAttemptId}`,
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        activity_kind: stringValue(event.activity_kind),
        activity_status: stringValue(event.activity_status),
        runner_event_kind: stringValue(event.runner_event_kind),
        observed_at: stringValue(event.observed_at),
      }));
    }),
    ...input.attempts.flatMap((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId) {
        return [];
      }
      const currentState = record(attempt.current_control_state);
      return [{
        event_id: `stage_attempt:${stageAttemptId}`,
        event_kind: 'stage_attempt_status',
        ref: attemptRef(stageAttemptId),
        node_id: `stage_attempt:${stageAttemptId}`,
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        status: stringValue(attempt.status)
          ?? stringValue(attempt.local_status)
          ?? stringValue(currentState.current_attempt_state),
        current_control_state: stringValue(currentState.reconciliation_status)
          ?? stringValue(currentState.current_attempt_state),
        updated_at: stringValue(attempt.updated_at),
      }];
    }),
    ...recordList(input.routeTransitionDrilldown.stage_attempt_refs).map((entry) => ({
      event_id: `route_transition:${stringValue(entry.stage_attempt_id) ?? stringValue(entry.ref)}`,
      event_kind: 'route_transition_observed',
      ref: stringValue(entry.ref),
      node_id: `stage_attempt:${stringValue(entry.stage_attempt_id) ?? ''}`,
      domain_id: stringValue(entry.domain_id),
      stage_id: stringValue(entry.stage_id),
      stage_attempt_id: stringValue(entry.stage_attempt_id),
      status: stringValue(entry.status),
      decision: stringValue(entry.decision),
    })),
    ...input.ownerReceipts.map((entry) => ({
      event_id: `owner_receipt:${stringValue(entry.ref) ?? ''}`,
      event_kind: 'owner_receipt_ref_observed',
      ref: stringValue(entry.ref),
      node_id: `owner_receipt:${stringValue(entry.ref) ?? ''}`,
      domain_id: stringValue(entry.domain_id),
      stage_id: stringValue(entry.stage_id),
      stage_attempt_id: stringValue(entry.stage_attempt_id),
      role: stringValue(entry.role),
    })),
    ...recordList(input.typedBlockers.refs).map((entry) => ({
      event_id: `typed_blocker:${stringValue(entry.ref) ?? ''}`,
      event_kind: 'typed_blocker_ref_observed',
      ref: stringValue(entry.ref),
      node_id: `typed_blocker:${stringValue(entry.ref) ?? ''}`,
      domain_id: stringValue(entry.domain_id),
      stage_id: stringValue(entry.stage_id),
      stage_attempt_id: stringValue(entry.stage_attempt_id),
      role: stringValue(entry.role),
    })),
  ].filter((event) => stringValue(event.event_id) && stringValue(event.ref));
}

function operatorRouteLensRefs(domainProjectionIngestion: JsonRecord) {
  return uniqueRefs(recordList(domainProjectionIngestion.items).flatMap((item) =>
    stringList(item.operator_route_lens_refs).map((ref) => ({
      ref,
      role: 'operator_route_lens_ref',
      domain_id: stringValue(item.domain_id),
      source_surface: stringValue(item.source_surface),
      pointer: stringValue(item.pointer),
      projection_surface_kind: stringValue(item.projection_surface_kind),
      body_policy: stringValue(item.body_policy),
    }))
  ));
}

function operatorLens(input: RuntimeVisualizationInput) {
  const lensRefs = operatorRouteLensRefs(input.domainProjectionIngestion);
  const lensDomains = new Set(lensRefs.map((entry) => entry.domain_id).filter(Boolean));
  const stageAttemptRefs = input.attempts
    .filter((attempt) => {
      const domainId = stringValue(attempt.domain_id);
      return domainId ? lensDomains.has(domainId) : false;
    })
    .map((attempt) => ({
      ref: attemptRef(stringValue(attempt.stage_attempt_id) ?? ''),
      role: 'operator_stage_attempt_ref',
      domain_id: stringValue(attempt.domain_id),
      stage_id: stringValue(attempt.stage_id),
      stage_attempt_id: stringValue(attempt.stage_attempt_id),
      status: stringValue(attempt.status) ?? stringValue(attempt.local_status),
    }))
    .filter(nonNullRef);
  return {
    surface_kind: 'opl_app_runtime_operator_lens_refs',
    projection_policy: 'domain_declared_operator_route_lens_refs_only_no_domain_body_or_verdict',
    operator_route_lens_refs: lensRefs,
    stage_attempt_refs: uniqueRefs(stageAttemptRefs),
    owner_route_refs: recordList(input.routeTransitionDrilldown.owner_route_refs),
    owner_receipt_refs: input.ownerReceipts,
    typed_blocker_refs: recordList(input.typedBlockers.refs),
    summary: {
      operator_route_lens_ref_count: lensRefs.length,
      stage_attempt_ref_count: stageAttemptRefs.length,
      owner_route_ref_count: recordList(input.routeTransitionDrilldown.owner_route_refs).length,
      owner_receipt_ref_count: input.ownerReceipts.length,
      typed_blocker_ref_count: recordList(input.typedBlockers.refs).length,
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_read_domain_body: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
    },
  };
}

function domainDisplayLabel(domainId: string | null) {
  return domainId ?? 'General';
}

function attemptState(attempt: JsonRecord) {
  const currentState = record(attempt.current_control_state);
  return stringValue(attempt.status)
    ?? stringValue(attempt.local_status)
    ?? stringValue(currentState.current_attempt_state)
    ?? stringValue(currentState.reconciliation_status)
    ?? 'unknown';
}

function priorityBucketForAttempt(attempt: JsonRecord, blockerCount: number, safeActionCount: number) {
  const state = attemptState(attempt);
  if (blockerCount > 0 || state === 'blocked') {
    return 'blocked';
  }
  if (safeActionCount > 0) {
    return 'can_continue';
  }
  if (state === 'running' || state === 'active') {
    return 'running';
  }
  if (state === 'completed' || state === 'done') {
    return 'recent_done';
  }
  return 'running';
}

function refsForAttempt(refs: JsonRecord[], stageAttemptId: string) {
  return refs.filter((ref) => stringValue(ref.stage_attempt_id) === stageAttemptId);
}

function taskKey(attempt: JsonRecord) {
  return stringValue(attempt.task_id)
    ?? stringValue(attempt.stage_attempt_id)
    ?? 'unknown-task';
}

function activePathForAttempt(
  attempt: JsonRecord,
  routeRefs: JsonRecord[],
  decisionRefs: JsonRecord[],
  typedBlockerRefs: JsonRecord[],
  safeActions: JsonRecord[],
) {
  const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? '';
  const stageNode = {
    node_id: `stage_attempt:${stageAttemptId}`,
    node_kind: 'stage_attempt',
    label: stringValue(attempt.stage_id) ?? stageAttemptId,
    state: attemptState(attempt),
    ref: attemptRef(stageAttemptId),
  };
  const routeNodes = refsForAttempt(routeRefs, stageAttemptId).map((ref) => ({
    node_id: `route_graph:${stringValue(ref.ref) ?? ''}`,
    node_kind: 'route_graph',
    label: stringValue(ref.role) ?? 'route',
    state: stringValue(ref.status),
    ref: stringValue(ref.ref),
  }));
  const decisionNodes = refsForAttempt(decisionRefs, stageAttemptId).map((ref) => ({
    node_id: `decision_map:${stringValue(ref.ref) ?? ''}`,
    node_kind: 'decision_map',
    label: stringValue(ref.role) ?? 'decision',
    state: stringValue(ref.status),
    ref: stringValue(ref.ref),
  }));
  const blockerNodes = refsForAttempt(typedBlockerRefs, stageAttemptId).map((ref) => ({
    node_id: `typed_blocker:${stringValue(ref.ref) ?? ''}`,
    node_kind: 'typed_blocker',
    label: stringValue(ref.role) ?? 'typed blocker',
    state: 'blocked',
    ref: stringValue(ref.ref),
  }));
  const actionNodes = refsForAttempt(safeActions, stageAttemptId).map((ref) => ({
    node_id: `safe_action:${stringValue(ref.action_id) ?? stringValue(ref.ref) ?? ''}`,
    node_kind: 'safe_action',
    label: stringValue(ref.action_kind) ?? stringValue(ref.role) ?? 'safe action',
    state: 'available',
    ref: stringValue(ref.ref),
  }));
  return [stageNode, ...routeNodes, ...decisionNodes, ...blockerNodes, ...actionNodes];
}

function buildRuntimeWorkbench(
  input: RuntimeVisualizationInput,
  nodes: JsonRecord[],
  edges: JsonRecord[],
  timeline: JsonRecord[],
  lens: JsonRecord,
) {
  const lensRefs = recordList(lens.operator_route_lens_refs);
  const lensDomains = new Set(lensRefs.map((ref) => stringValue(ref.domain_id)).filter(Boolean));
  const typedBlockerRefs = recordList(input.typedBlockers.refs);
  const taskDrilldowns = input.attempts.map((attempt) => {
    const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? 'unknown-attempt';
    const domainId = stringValue(attempt.domain_id);
    const stageId = stringValue(attempt.stage_id);
    const taskId = taskKey(attempt);
    const safeActionRefs = refsForAttempt(input.safeActions, stageAttemptId);
    const blockerRefs = refsForAttempt(typedBlockerRefs, stageAttemptId);
    const operatorRouteLensRefCount = domainId && lensDomains.has(domainId) ? lensRefs.length : 0;
    return {
      task_id: taskId,
      title: `${domainDisplayLabel(domainId)} ${stageId ?? 'task'}`,
      domain_id: domainId,
      domain_label: domainDisplayLabel(domainId),
      state: attemptState(attempt),
      active_stage_id: stageId,
      stage_attempt_ids: [stageAttemptId],
      updated_at: stringValue(attempt.updated_at),
      priority_bucket: priorityBucketForAttempt(attempt, blockerRefs.length, safeActionRefs.length),
      active_path: activePathForAttempt(
        attempt,
        input.routeRefs,
        input.decisionRefs,
        typedBlockerRefs,
        input.safeActions,
      ),
      key_branch_refs: [
        ...refsForAttempt(input.routeRefs, stageAttemptId),
        ...refsForAttempt(input.decisionRefs, stageAttemptId),
      ],
      owner_receipt_ref_count: refsForAttempt(input.ownerReceipts, stageAttemptId).length,
      blocker_ref_count: blockerRefs.length,
      safe_action_ref_count: safeActionRefs.length,
      operator_route_lens_ref_count: operatorRouteLensRefCount,
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  });
  const actionQueueItems = taskDrilldowns
    .map((task) => ({
      item_id: `task:${task.task_id}`,
      task_id: task.task_id,
      title: task.title,
      subtitle: task.active_stage_id,
      domain_id: task.domain_id,
      domain_label: task.domain_label,
      state: task.state,
      priority_bucket: task.priority_bucket,
      safe_action_ref_count: task.safe_action_ref_count,
      blocker_ref_count: task.blocker_ref_count,
      operator_route_lens_ref_count: task.operator_route_lens_ref_count,
      stage_attempt_ids: task.stage_attempt_ids,
    }))
    .sort((left, right) => {
      const order: Record<string, number> = {
        blocked: 0,
        can_continue: 1,
        running: 2,
        recent_done: 3,
      };
      return (order[left.priority_bucket] ?? 9) - (order[right.priority_bucket] ?? 9)
        || left.title.localeCompare(right.title);
    });
  const lanes = [...new Set(taskDrilldowns.map((task) => task.domain_id ?? 'general'))].map((domainId) => {
    const tasks = taskDrilldowns.filter((task) => (task.domain_id ?? 'general') === domainId);
    return {
      domain_id: domainId,
      lane_label: domainDisplayLabel(domainId === 'general' ? null : domainId),
      active_task_count: tasks.filter((task) => task.priority_bucket !== 'recent_done').length,
      blocked_task_count: tasks.filter((task) => task.priority_bucket === 'blocked').length,
      operator_route_lens_ref_count: tasks.reduce((count, task) => count + task.operator_route_lens_ref_count, 0),
      tasks: tasks.map((task) => ({
        task_id: task.task_id,
        label: task.title,
        state: task.state,
        priority_bucket: task.priority_bucket,
        active_stage_id: task.active_stage_id,
        active_path_node_ids: task.active_path.map((node) => node.node_id),
        operator_route_lens_ref_count: task.operator_route_lens_ref_count,
      })),
    };
  });
  const activeTasks = taskDrilldowns.filter((task) => task.priority_bucket !== 'recent_done').length;
  const blockedTasks = taskDrilldowns.filter((task) => task.priority_bucket === 'blocked').length;
  const canContinueTasks = taskDrilldowns.filter((task) => task.priority_bucket === 'can_continue').length;
  return {
    surface_kind: 'opl_app_runtime_workbench_visualization_model',
    layout_model: 'vertical_summary_action_queue_lane_map_task_drilldown.v1',
    source_surface: 'runtime_visualization_projection',
    refresh_policy: {
      mode: 'event_driven_with_light_polling_fallback',
      summary_poll_interval_seconds: 10,
      full_detail_auto_poll: false,
      per_token_streaming: false,
      full_detail_load_policy: 'operator_requested_only',
    },
    performance_policy: {
      global_map_renderer: 'lightweight_dom_css_lane_map',
      detail_graph_renderer: 'on_demand_graph_renderer',
      visible_only_rendering: true,
      list_windowing_required: true,
      graph_layout_recompute: 'topology_changes_only',
      state_updates_only_refresh_badges_and_highlights: true,
      batch_visual_updates_with_request_animation_frame: true,
    },
    summary_cards: [
      { card_id: 'active_tasks', label: 'Active tasks', value: activeTasks, tone: activeTasks > 0 ? 'running' : 'idle' },
      { card_id: 'needs_user', label: 'Needs user', value: blockedTasks, tone: blockedTasks > 0 ? 'attention' : 'ok' },
      { card_id: 'can_continue', label: 'Can continue', value: canContinueTasks, tone: canContinueTasks > 0 ? 'ready' : 'idle' },
      {
        card_id: 'recent_done',
        label: 'Recent done',
        value: taskDrilldowns.filter((task) => task.priority_bucket === 'recent_done').length,
        tone: 'done',
      },
      { card_id: 'graph_nodes', label: 'Graph nodes', value: nodes.length, tone: 'meta' },
      { card_id: 'timeline_events', label: 'Timeline events', value: timeline.length, tone: 'meta' },
    ],
    action_queue: {
      sort_order: ['needs_user', 'blocked', 'can_continue', 'running', 'recent_done'],
      items: actionQueueItems,
    },
    domain_lane_map: {
      map_model: 'vertical_domain_lanes_compact_active_path.v1',
      lanes,
    },
    task_drilldowns: taskDrilldowns,
    operator_route_lens_refs: lensRefs,
    graph_budget: {
      default_node_limit: 120,
      default_edge_limit: 160,
      full_detail_required_above_limit: true,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function buildRuntimeVisualizationProjection(input: RuntimeVisualizationInput) {
  const progressRefs = progressLogRefs(input.attempts);
  const nodes = uniqueRefsByValue([
    ...attemptNodes(input.attempts),
    ...refNodes(progressRefs, 'stage_progress_log', 'stage_attempt_progress_log'),
    ...refNodes(input.routeRefs, 'route_graph', 'stage_attempt_route_decision_graph'),
    ...refNodes(input.decisionRefs, 'decision_map', 'stage_attempt_decision_map'),
    ...refNodes(input.artifactRefs, 'artifact_ref', 'artifact_or_receipt_ref'),
    ...packageExportNodes(input.packageLifecycle),
    ...memoryNodes(input.memoryRefs),
    ...qualityReadinessNodes(input.qualityRefs),
    ...refNodes(input.ownerReceipts, 'owner_receipt', 'owner_receipt_ref'),
    ...refNodes(recordList(input.typedBlockers.refs), 'typed_blocker', 'typed_blocker_ref'),
    ...refNodes(input.safeActions, 'safe_action', 'safe_action_ref'),
    ...stageProductionNodes(input.stageProductionEvidence),
  ]);
  const edges = uniqueRefsByValue([
    ...attemptEdges(progressRefs, 'stage_progress_log', 'attempt_has_stage_progress_log'),
    ...attemptEdges(input.routeRefs, 'route_graph', 'attempt_has_route_graph'),
    ...attemptEdges(input.decisionRefs, 'decision_map', 'attempt_has_decision_map'),
    ...attemptEdges(input.artifactRefs, 'artifact_ref', 'attempt_references_artifact'),
    ...attemptEdges(input.ownerReceipts, 'owner_receipt', 'attempt_observed_owner_receipt'),
    ...attemptEdges(recordList(input.typedBlockers.refs), 'typed_blocker', 'attempt_observed_typed_blocker'),
    ...attemptEdges(input.safeActions, 'safe_action', 'attempt_has_safe_action_route'),
    ...stageProductionEdges(input.attempts, input.stageProductionEvidence),
  ]);
  const timeline = timelineEvents(input);
  const lens = operatorLens(input);
  const runtimeWorkbench = buildRuntimeWorkbench(input, nodes, edges, timeline, lens);
  const graphSummary = {
    node_count: nodes.length,
    edge_count: edges.length,
    stage_attempt_node_count: nodes.filter((node) => node.node_kind === 'stage_attempt').length,
    route_graph_node_count: nodes.filter((node) => node.node_kind === 'route_graph').length,
    decision_map_node_count: nodes.filter((node) => node.node_kind === 'decision_map').length,
    owner_receipt_node_count: nodes.filter((node) => node.node_kind === 'owner_receipt').length,
    typed_blocker_node_count: nodes.filter((node) => node.node_kind === 'typed_blocker').length,
    safe_action_node_count: nodes.filter((node) => node.node_kind === 'safe_action').length,
    stage_progress_log_node_count: nodes.filter((node) => node.node_kind === 'stage_progress_log').length,
  };

  return {
    surface_kind: 'opl_app_runtime_visualization_projection',
    projection_scope: 'runtime_snapshot_app_operator_drilldown',
    projection_policy: 'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
    graph_model: 'stage_attempt_route_decision_owner_evidence_graph.v1',
    graph: {
      nodes,
      edges,
      summary: graphSummary,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    timeline: {
      event_model: 'runtime_visualization_timeline_event_refs.v1',
      events: timeline,
      summary: {
        event_count: timeline.length,
        stage_attempt_event_count:
          timeline.filter((event) => event.event_kind === 'stage_attempt_status').length,
        route_transition_event_count:
          timeline.filter((event) => event.event_kind === 'route_transition_observed').length,
        owner_receipt_event_count:
          timeline.filter((event) => event.event_kind === 'owner_receipt_ref_observed').length,
        typed_blocker_event_count:
          timeline.filter((event) => event.event_kind === 'typed_blocker_ref_observed').length,
        stage_progress_event_count:
          timeline.filter((event) => event.event_kind === 'stage_progress_event').length,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    operator_lens: lens,
    runtime_workbench: runtimeWorkbench,
    visual_ref_groups: {
      route_graph_refs: input.routeRefs,
      decision_map_refs: input.decisionRefs,
      owner_receipt_refs: input.ownerReceipts,
      typed_blocker_refs: recordList(input.typedBlockers.refs),
      safe_action_refs: input.safeActions,
      stage_progress_log_refs: progressRefs,
      domain_dispatch_evidence_summary: record(input.domainDispatchEvidence.summary),
      stage_production_evidence_summary: record(input.stageProductionEvidence.summary),
    },
    summary: {
      ...graphSummary,
      timeline_event_count: timeline.length,
      operator_route_lens_ref_count:
        record(record(lens).summary).operator_route_lens_ref_count ?? 0,
      operator_stage_attempt_ref_count:
        record(record(lens).summary).stage_attempt_ref_count ?? 0,
      stage_progress_event_count:
        timeline.filter((event) => event.event_kind === 'stage_progress_event').length,
      temporal_stage_progress_ref_count:
        progressRefs.filter((ref) => ref.temporal_webui_url).length,
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_read_domain_truth_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_write_owner_receipt: false,
      can_create_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_publication_ready: false,
      can_claim_stage_complete: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    non_goals: [
      'does_not_read_domain_or_memory_or_artifact_body',
      'does_not_create_owner_receipt_or_typed_blocker',
      'does_not_close_stage_domain_publication_or_production_ready',
      'does_not_execute_domain_action',
    ],
  };
}
