export type PaperAutonomyProjectionTask = {
  domain_id: string;
  task_kind: string;
  dedupe_key: string | null;
};

export const MAS_PAPER_AUTONOMY_TASK_KINDS = new Set([
  'paper_autonomy/repair-recheck',
  'paper_autonomy/ai-reviewer-recheck',
  'paper_autonomy/gate-replay',
  'paper_autonomy/guarded-apply',
  'paper_autonomy/route-decision',
]);

export const MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON = 'domain_handler_closeout_required';

export function paperAutonomyProjection(
  task: PaperAutonomyProjectionTask,
  payload: Record<string, unknown>,
) {
  if (task.domain_id !== 'medautoscience' || !MAS_PAPER_AUTONOMY_TASK_KINDS.has(task.task_kind)) {
    return null;
  }
  const repairWorkUnit = payload.repair_work_unit
    && typeof payload.repair_work_unit === 'object'
    && !Array.isArray(payload.repair_work_unit)
    ? payload.repair_work_unit as Record<string, unknown>
    : {};
  const sourceRefs = Array.isArray(repairWorkUnit.source_refs)
    ? repairWorkUnit.source_refs
    : Array.isArray(payload.source_refs)
      ? payload.source_refs
      : [];
  const sourceFingerprint = typeof repairWorkUnit.source_fingerprint === 'string'
    ? repairWorkUnit.source_fingerprint
    : typeof payload.source_fingerprint === 'string'
      ? payload.source_fingerprint
      : null;
  const guardedApply = task.task_kind === 'paper_autonomy/guarded-apply';
  return {
    surface_kind: 'opl_mas_paper_autonomy_task_projection',
    domain_truth_owner: 'med-autoscience',
    queue_owner: 'one-person-lab',
    online_runtime_substrate_owner: 'provider_backed_family_runtime',
    task_kind: task.task_kind,
    study_id: typeof payload.study_id === 'string' ? payload.study_id : null,
    next_owner: guardedApply
      ? 'med-autoscience'
      : typeof repairWorkUnit.owner === 'string'
        ? repairWorkUnit.owner
        : null,
    callable_surface: guardedApply
      ? 'medautosci domain-handler dispatch'
      : typeof repairWorkUnit.callable_surface === 'string'
        ? repairWorkUnit.callable_surface
        : null,
    repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
    source_refs: sourceRefs,
    source_fingerprint: sourceFingerprint,
    idempotency_key: task.dedupe_key,
    authority_boundary: {
      writes_mas_truth: false,
      writes_publication_quality: false,
      writes_artifact_gate: false,
      writes_current_package: false,
    },
  };
}
