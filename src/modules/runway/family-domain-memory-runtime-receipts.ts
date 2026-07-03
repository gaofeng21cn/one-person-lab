import fs from 'node:fs';

import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import {
  listStageAttemptCloseouts,
  listStageAttempts,
} from './family-runtime-stage-attempts.ts';

type RuntimeReceiptEvidence = {
  surface_kind: 'opl_domain_memory_runtime_receipt_evidence';
  domain_id: string;
  status: 'no_runtime_closeout_refs_observed' | 'runtime_closeout_refs_observed';
  source_status: string;
  summary: {
    closeout_count: number;
    consumed_memory_ref_count: number;
    writeback_receipt_ref_count: number;
    rejected_write_count: number;
    opl_writes_memory_body: false;
  };
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: Record<string, unknown>[];
  closeout_refs: string[];
  source_refs: string[];
  authority_boundary: {
    opl: 'runtime_receipt_ref_projection_only';
    domain: 'memory_body_accept_reject_truth_owner';
    opl_writes_memory_body: false;
    opl_accepts_or_rejects_memory_writeback: false;
    opl_applies_memory_writeback: false;
  };
};

type RuntimeReceiptEvidenceIndex = {
  source_status: string;
  byDomain: Map<string, RuntimeReceiptEvidence>;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function emptyRuntimeReceiptEvidence(domainId: string, sourceStatus = 'ledger_empty'): RuntimeReceiptEvidence {
  return {
    surface_kind: 'opl_domain_memory_runtime_receipt_evidence',
    domain_id: domainId,
    status: 'no_runtime_closeout_refs_observed',
    source_status: sourceStatus,
    summary: {
      closeout_count: 0,
      consumed_memory_ref_count: 0,
      writeback_receipt_ref_count: 0,
      rejected_write_count: 0,
      opl_writes_memory_body: false,
    },
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    closeout_refs: [],
    source_refs: [],
    authority_boundary: {
      opl: 'runtime_receipt_ref_projection_only',
      domain: 'memory_body_accept_reject_truth_owner',
      opl_writes_memory_body: false,
      opl_accepts_or_rejects_memory_writeback: false,
      opl_applies_memory_writeback: false,
    },
  };
}

function emptyRuntimeReceiptEvidenceIndex(sourceStatus: string): RuntimeReceiptEvidenceIndex {
  return {
    source_status: sourceStatus,
    byDomain: new Map<string, RuntimeReceiptEvidence>(),
  };
}

export function readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(): RuntimeReceiptEvidenceIndex {
  const paths = familyRuntimePaths();
  if (!fs.existsSync(paths.queue_db)) {
    return emptyRuntimeReceiptEvidenceIndex('queue_db_missing');
  }

  const db = openFamilyRuntimeSqlite(paths.queue_db, { readOnly: true });
  try {
    const attemptsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_attempts'").get();
    const closeoutsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_attempt_closeouts'").get();
    if (!attemptsTable || !closeoutsTable) {
      return emptyRuntimeReceiptEvidenceIndex('stage_attempt_ledger_missing');
    }
    const byDomain = new Map<string, RuntimeReceiptEvidence>();
    for (const attempt of listStageAttempts(db)) {
      const domainId = attempt.domain_id;
      const closeouts = listStageAttemptCloseouts(db, attempt.stage_attempt_id);
      if (closeouts.length === 0) {
        continue;
      }
      const current = byDomain.get(domainId) ?? emptyRuntimeReceiptEvidence(domainId, 'stage_attempt_ledger_readable');
      const consumedMemoryRefs = uniqueStrings([
        ...current.consumed_memory_refs,
        ...closeouts.flatMap((closeout) => stringList(closeout.packet.consumed_memory_refs)),
      ]);
      const writebackReceiptRefs = uniqueStrings([
        ...current.writeback_receipt_refs,
        ...closeouts.flatMap((closeout) => stringList(closeout.packet.writeback_receipt_refs)),
      ]);
      const closeoutRefs = uniqueStrings([
        ...current.closeout_refs,
        ...closeouts.flatMap((closeout) => stringList(closeout.packet.closeout_refs)),
      ]);
      const rejectedWrites = [
        ...current.rejected_writes,
        ...closeouts.flatMap((closeout) => recordList(closeout.packet.rejected_writes)),
      ];
      const sourceRefs = uniqueStrings([
        ...current.source_refs,
        ...closeouts.map((closeout) => `${paths.queue_db}#stage_attempt_closeouts/${closeout.closeout_id}`),
      ]);
      byDomain.set(domainId, {
        ...current,
        status: 'runtime_closeout_refs_observed',
        source_status: 'stage_attempt_ledger_readable',
        summary: {
          closeout_count: current.summary.closeout_count + closeouts.length,
          consumed_memory_ref_count: consumedMemoryRefs.length,
          writeback_receipt_ref_count: writebackReceiptRefs.length,
          rejected_write_count: rejectedWrites.length,
          opl_writes_memory_body: false,
        },
        consumed_memory_refs: consumedMemoryRefs,
        writeback_receipt_refs: writebackReceiptRefs,
        rejected_writes: rejectedWrites,
        closeout_refs: closeoutRefs,
        source_refs: sourceRefs,
      });
    }
    return {
      source_status: 'stage_attempt_ledger_readable',
      byDomain,
    };
  } catch {
    return emptyRuntimeReceiptEvidenceIndex('stage_attempt_ledger_unreadable');
  } finally {
    db.close();
  }
}
