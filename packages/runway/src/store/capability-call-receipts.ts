import type { SqliteDb } from '@opl/core';
import type { CapabilityCallObservation } from '../executors/spi.ts';

export interface CapabilityCallReceipt {
  readonly stage_run_id: string;
  readonly attempt_id: string;
  readonly call_id: string;
  readonly call_id_source: CapabilityCallObservation['call_id_source'];
  readonly server: string;
  readonly tool_name: string;
  readonly input_digest: string;
  readonly output_digest: string;
  readonly binding_digest: string | null;
  readonly status: 'observed' | 'conflict';
}

export function recordCapabilityCall(db: SqliteDb, attemptId: string, event: CapabilityCallObservation): void {
  // The Attempt is supplied by the executing host. Replayed receipts must agree
  // byte-for-byte on the projection, including the absence of an owner binding.
  db.prepare(`
    INSERT INTO runway_capability_calls
      (attempt_id, call_id_source, call_id, server, tool_name, input_digest, output_digest, binding_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (attempt_id, call_id_source, call_id) DO UPDATE SET status = 'conflict'
    WHERE server != excluded.server OR tool_name != excluded.tool_name
       OR input_digest != excluded.input_digest OR output_digest != excluded.output_digest
       OR binding_digest IS NOT excluded.binding_digest
  `).run(attemptId, event.call_id_source, event.call_id, event.server, event.tool_name,
    event.input_digest, event.output_digest, event.binding_digest ?? null);
}

export function taskCapabilityCalls(db: SqliteDb, taskId: string, attemptId?: string): CapabilityCallReceipt[] {
  return db.prepare(`
    SELECT a.stage_run_id, c.* FROM runway_capability_calls c
    JOIN attempts a ON a.attempt_id = c.attempt_id
    JOIN stage_runs s ON s.stage_run_id = a.stage_run_id
    WHERE s.task_id = ? ${attemptId ? 'AND a.attempt_id = ?' : ''}
    ORDER BY s.seq_no, a.attempt_no, c.rowid
  `).all(taskId, ...(attemptId ? [attemptId] : [])) as unknown as CapabilityCallReceipt[];
}
