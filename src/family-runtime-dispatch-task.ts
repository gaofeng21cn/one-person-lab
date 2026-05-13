import fs from 'node:fs';
import path from 'node:path';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { familyRuntimePaths, taskToPayload } from './family-runtime-store.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function writeFamilyRuntimeDispatchTask(
  paths: ReturnType<typeof familyRuntimePaths>,
  row: FamilyRuntimeTaskRow,
) {
  const payload = JSON.parse(row.payload_json) as unknown;
  const action = isRecord(payload) && typeof payload.action === 'string' && payload.action.trim()
    ? payload.action.trim()
    : row.task_kind;
  const sidecarTask = isRecord(payload) ? payload : {};
  const taskPayload = taskToPayload(row);
  const dispatchPath = path.join(paths.dispatch_dir, `${row.task_id}.json`);
  fs.writeFileSync(
    dispatchPath,
    JSON.stringify({
      ...sidecarTask,
      task_id: row.task_id,
      id: row.task_id,
      domain_id: row.domain_id,
      task_kind: row.task_kind,
      action,
      payload,
      paper_autonomy: taskPayload.paper_autonomy,
      attempts: row.attempts,
      source: 'opl_family_runtime',
      authority_boundary: {
        provider: 'stage_attempt_transport_and_control_metadata_only',
        opl: 'typed_queue_and_dispatch_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    }, null, 2),
    'utf8',
  );
  return dispatchPath;
}
