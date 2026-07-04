import {
  asRecord,
  HANDOFF_SURFACE_KIND,
  MATERIALIZED_READBACK_SURFACE_KIND,
  type JsonRecord,
  type MasPaperMissionRouteHandoffExportReadback,
} from './shared.ts';

export function handoffFromTask(task: JsonRecord) {
  if (
    task.surface_kind === HANDOFF_SURFACE_KIND
    || task.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
  ) {
    return task;
  }
  const routeHandoff = asRecord(task.opl_route_handoff);
  if (routeHandoff) {
    return routeHandoff;
  }
  const routeHandoffRecord = asRecord(task.opl_route_handoff_record);
  if (routeHandoffRecord) {
    return routeHandoffRecord;
  }
  const runtimeOwnerRouteHandoff = asRecord(task.opl_runtime_owner_route_handoff);
  if (runtimeOwnerRouteHandoff?.surface_kind === HANDOFF_SURFACE_KIND) {
    return runtimeOwnerRouteHandoff;
  }
  const paperMission = asRecord(task.paper_mission);
  if (paperMission) {
    return handoffFromTask(paperMission);
  }
  const payload = asRecord(task.payload);
  if (payload) {
    return handoffFromTask(payload);
  }
  return null;
}

export function sourceTasks(output: JsonRecord): {
  sourcePath: MasPaperMissionRouteHandoffExportReadback['source_path'];
  tasks: unknown[];
  legacyConsidered: boolean;
} {
  if (
    output.surface_kind === HANDOFF_SURFACE_KIND
    || output.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
  ) {
    return { sourcePath: 'direct_handoff', tasks: [output], legacyConsidered: false };
  }
  if (Array.isArray(output.paper_mission_default_tasks) && output.paper_mission_default_tasks.length > 0) {
    return {
      sourcePath: '/paper_mission_default_tasks',
      tasks: output.paper_mission_default_tasks,
      legacyConsidered: false,
    };
  }
  if (Array.isArray(output.pending_family_tasks)) {
    const explicitHandoffTasks = output.pending_family_tasks.filter((task) => {
      const taskRecord = asRecord(task);
      return Boolean(
        taskRecord
        && (
          taskRecord.surface_kind === HANDOFF_SURFACE_KIND
          || taskRecord.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
          || handoffFromTask(taskRecord) !== null
        ),
      );
    });
    if (explicitHandoffTasks.length === 0) {
      return { sourcePath: 'not_found', tasks: [], legacyConsidered: false };
    }
    return {
      sourcePath: '/pending_family_tasks',
      tasks: explicitHandoffTasks,
      legacyConsidered: true,
    };
  }
  return { sourcePath: 'not_found', tasks: [], legacyConsidered: false };
}
