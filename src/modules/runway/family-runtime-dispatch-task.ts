import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../kernel/json-file.ts';
import { record } from '../../kernel/json-record.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { familyRuntimePaths, taskToPayload } from './family-runtime-store.ts';

export function writeFamilyRuntimeDispatchTask(
  paths: ReturnType<typeof familyRuntimePaths>,
  row: FamilyRuntimeTaskRow,
) {
  const payload = parseJsonText(row.payload_json);
  const payloadRecord = record(payload);
  const isPayloadRecord = payloadRecord === payload;
  const action = isPayloadRecord && typeof payloadRecord.action === 'string' && payloadRecord.action.trim()
    ? payloadRecord.action.trim()
    : row.task_kind;
  const domainHandlerTask = isPayloadRecord ? payloadRecord : {};
  const taskPayload = taskToPayload(row);
  const dispatchPath = path.join(paths.dispatch_dir, `${row.task_id}.json`);
  fs.writeFileSync(
    dispatchPath,
    JSON.stringify({
      ...domainHandlerTask,
      task_id: row.task_id,
      id: row.task_id,
      domain_id: row.domain_id,
      task_kind: row.task_kind,
      action,
      payload,
      domain_route: taskPayload.domain_route,
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
