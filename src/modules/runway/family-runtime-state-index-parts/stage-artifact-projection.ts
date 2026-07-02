import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { openFamilyRuntimeSqlite } from '../family-runtime-sqlite.ts';
import { resolveOplStatePaths } from '../runtime-state-paths.ts';

type StateIndexDatabaseDefinition = {
  database_id: string;
  path: string;
  ensure: () => void;
};

type JsonRecord = Record<string, unknown>;

type StageFolderProjection = {
  domain_id: string;
  program_id: string;
  topic_id: string;
  deliverable_id: string;
  deliverable_root: string;
  stage_id: string;
  stage_dir: string;
  latest_attempt_id: string | null;
  attempt_id: string;
  attempt_dir: string;
  manifest_file: string;
  manifest: JsonRecord | null;
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => text(entry)).filter(Boolean))];
}

function readJsonFile(file: string): JsonRecord | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readJsonLines(file: string) {
  if (!fs.existsSync(file)) {
    return [] as JsonRecord[];
  }
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function listDirNames(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFilesRecursive(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(dir, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function sha256Text(value: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileContentHash(file: string) {
  if (!fs.existsSync(file)) {
    return null;
  }
  return sha256Text(fs.readFileSync(file));
}

function jsonHash(value: unknown) {
  return sha256Text(JSON.stringify(value ?? null));
}

function stageIdFromFolderName(name: string) {
  return name.replace(/^\d+-/, '');
}

function readPointer(file: string) {
  if (!fs.existsSync(file)) {
    return null;
  }
  const pointer = fs.readFileSync(file, 'utf-8').trim();
  return pointer || null;
}

function domainMatchesFilter(domainId: string, filter: string | undefined) {
  if (!filter) {
    return true;
  }
  const normalize = (value: string) => value.replaceAll('-', '').replaceAll('_', '').toLowerCase();
  return domainId === filter || normalize(domainId) === normalize(filter);
}

function compositeProgramId(input: Pick<StageFolderProjection, 'program_id' | 'topic_id' | 'deliverable_id'>) {
  return `${input.program_id}/${input.topic_id}/${input.deliverable_id}`;
}

function stageSourceRef(input: StageFolderProjection) {
  return [
    'stage-folder',
    input.domain_id,
    input.program_id,
    input.topic_id,
    input.deliverable_id,
    input.stage_id,
    input.attempt_id,
  ].join(':');
}

function deliverableSourceRef(input: Pick<StageFolderProjection, 'domain_id' | 'program_id' | 'topic_id' | 'deliverable_id'>) {
  return [
    'stage-deliverable',
    input.domain_id,
    input.program_id,
    input.topic_id,
    input.deliverable_id,
  ].join(':');
}

function firstReceiptRef(manifest: JsonRecord | null) {
  return [
    ...stringList(manifest?.owner_receipt_refs),
    ...stringList(manifest?.typed_blocker_refs),
    ...stringList(manifest?.decision_receipt_refs),
  ][0] ?? null;
}

function outputHashes(manifest: JsonRecord | null) {
  if (!Array.isArray(manifest?.output_hashes)) {
    return [] as JsonRecord[];
  }
  return manifest.output_hashes.filter(isRecord);
}

function stageAttemptProjections(domainFilter?: string): StageFolderProjection[] {
  const domainsRoot = path.join(resolveOplStatePaths().state_dir, 'runtime-state', 'domains');
  const rows: StageFolderProjection[] = [];
  for (const domainId of listDirNames(domainsRoot).filter((domain) => domainMatchesFilter(domain, domainFilter))) {
    const deliverablesRoot = path.join(domainsRoot, domainId, 'deliverables');
    for (const programId of listDirNames(deliverablesRoot)) {
      for (const topicId of listDirNames(path.join(deliverablesRoot, programId))) {
        for (const deliverableId of listDirNames(path.join(deliverablesRoot, programId, topicId))) {
          const deliverableRoot = path.join(deliverablesRoot, programId, topicId, deliverableId);
          const stagesRoot = path.join(deliverableRoot, 'stages');
          for (const stageFolder of listDirNames(stagesRoot)) {
            const stageId = stageIdFromFolderName(stageFolder);
            const stageDir = path.join(stagesRoot, stageFolder);
            const latestAttemptId = readPointer(path.join(stageDir, 'latest'));
            for (const attemptId of listDirNames(path.join(stageDir, 'attempts'))) {
              const attemptDir = path.join(stageDir, 'attempts', attemptId);
              const manifestFile = path.join(attemptDir, 'manifest.json');
              rows.push({
                domain_id: domainId,
                program_id: programId,
                topic_id: topicId,
                deliverable_id: deliverableId,
                deliverable_root: deliverableRoot,
                stage_id: stageId,
                stage_dir: stageDir,
                latest_attempt_id: latestAttemptId,
                attempt_id: attemptId,
                attempt_dir: attemptDir,
                manifest_file: manifestFile,
                manifest: readJsonFile(manifestFile),
              });
            }
          }
        }
      }
    }
  }
  return rows;
}

function clearStageArtifactProjectionRows(db: DatabaseSync, domainId: string | undefined, tables: string[]) {
  for (const table of tables) {
    if (domainId) {
      db.prepare(`DELETE FROM ${table} WHERE domain_id = ?`).run(domainId);
    } else {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  }
}

function clearStageArtifactReadModelRows(db: DatabaseSync, domainId: string | undefined) {
  for (const [table, surface] of [
    ['operator_tasks', 'opl_stage_artifact_operator_task'],
    ['artifact_drilldown', 'opl_stage_artifact_runtime_workbench'],
    ['owner_route_index', 'opl_stage_artifact_current_pointer'],
    ['source_fingerprints', 'opl_stage_artifact_source_fingerprint'],
    ['work_unit_outbox', 'opl_stage_artifact_work_unit_outbox'],
  ] as const) {
    if (domainId) {
      db.prepare(`DELETE FROM ${table} WHERE domain_id = ? AND surface_id = ?`).run(domainId, surface);
    } else {
      db.prepare(`DELETE FROM ${table} WHERE surface_id = ?`).run(surface);
    }
  }
}

function insertStageArtifactRows(db: DatabaseSync, rows: StageFolderProjection[], rebuildEpoch: string, indexVersion: string) {
  const now = nowIso();
  const currentStmt = db.prepare(`
    INSERT OR REPLACE INTO stage_current_pointers(
      domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref, content_hash,
      observed_at, indexed_at, index_version, rebuild_epoch, payload_ref_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const manifestStmt = db.prepare(`
    INSERT OR REPLACE INTO manifest_index(
      domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref, content_hash,
      observed_at, indexed_at, index_version, rebuild_epoch, manifest_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const artifactStmt = db.prepare(`
    INSERT OR REPLACE INTO artifact_refs(
      artifact_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, locator_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const receiptStmt = db.prepare(`
    INSERT OR REPLACE INTO receipt_refs(
      receipt_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, content_hash,
      observed_at, indexed_at, index_version, rebuild_epoch, locator_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const blockerStmt = db.prepare(`
    INSERT OR REPLACE INTO blocker_refs(
      blocker_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, locator_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let currentPointerRows = 0;
  let manifestRows = 0;
  let artifactRows = 0;
  let receiptRows = 0;
  let blockerRows = 0;
  for (const row of rows) {
    if (!row.manifest) {
      continue;
    }
    const programId = compositeProgramId(row);
    const sourceRef = stageSourceRef(row);
    const manifestHash = fileContentHash(row.manifest_file) ?? jsonHash(row.manifest);
    const receiptRef = firstReceiptRef(row.manifest);
    manifestStmt.run(
      row.domain_id,
      programId,
      row.stage_id,
      row.attempt_id,
      'opl_stage_artifact_manifest',
      sourceRef,
      receiptRef,
      manifestHash,
      now,
      now,
      indexVersion,
      rebuildEpoch,
      JSON.stringify({
        manifest_file: row.manifest_file,
        topic_id: row.topic_id,
        deliverable_id: row.deliverable_id,
      }),
    );
    manifestRows += 1;
    if (row.latest_attempt_id === row.attempt_id) {
      currentStmt.run(
        row.domain_id,
        programId,
        row.stage_id,
        row.attempt_id,
        'opl_stage_artifact_current_pointer',
        sourceRef,
        receiptRef,
        manifestHash,
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          latest_pointer: path.join(row.stage_dir, 'latest'),
          current_file: path.join(row.deliverable_root, 'current.json'),
          topic_id: row.topic_id,
          deliverable_id: row.deliverable_id,
          status: text(row.manifest.terminal_status, 'in_progress'),
          pointer_role: 'artifact_attempt_pointer_not_stage_run_current_pointer',
          stage_run_current_pointer: false,
          stage_run_terminal_state: false,
          current_owner_delta: false,
        }),
      );
      currentPointerRows += 1;
    }
    for (const hash of outputHashes(row.manifest)) {
      const outputPath = text(hash.path);
      if (!outputPath) {
        continue;
      }
      const artifactRef = [
        'stage-output',
        row.domain_id,
        row.program_id,
        row.topic_id,
        row.deliverable_id,
        row.stage_id,
        row.attempt_id,
        outputPath,
      ].join(':');
      artifactStmt.run(
        artifactRef,
        row.domain_id,
        programId,
        row.stage_id,
        row.attempt_id,
        'opl_stage_artifact_output_ref',
        sourceRef,
        receiptRef,
        text(hash.sha256, manifestHash),
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          output_path: path.join(row.attempt_dir, 'outputs', outputPath),
          output_ref_kind: 'physical_file_ref',
          bytes: hash.bytes ?? null,
          topic_id: row.topic_id,
          deliverable_id: row.deliverable_id,
        }),
      );
      artifactRows += 1;
    }
    for (const ref of [
      ...stringList(row.manifest.owner_receipt_refs),
      ...stringList(row.manifest.decision_receipt_refs),
    ]) {
      receiptStmt.run(
        ref,
        row.domain_id,
        programId,
        row.stage_id,
        row.attempt_id,
        'opl_stage_artifact_receipt_ref',
        sourceRef,
        manifestHash,
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          receipt_dir: path.join(row.attempt_dir, 'receipts'),
          topic_id: row.topic_id,
          deliverable_id: row.deliverable_id,
        }),
      );
      receiptRows += 1;
    }
    for (const ref of stringList(row.manifest.typed_blocker_refs)) {
      blockerStmt.run(
        ref,
        row.domain_id,
        programId,
        row.stage_id,
        row.attempt_id,
        'opl_stage_artifact_blocker_ref',
        sourceRef,
        receiptRef,
        manifestHash,
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          evidence_dir: path.join(row.attempt_dir, 'evidence'),
          topic_id: row.topic_id,
          deliverable_id: row.deliverable_id,
        }),
      );
      blockerRows += 1;
    }
  }
  return {
    current_pointer_rows: currentPointerRows,
    manifest_rows: manifestRows,
    artifact_ref_rows: artifactRows,
    receipt_ref_rows: receiptRows,
    blocker_ref_rows: blockerRows,
  };
}

function insertStageArtifactLineageRows(db: DatabaseSync, rows: StageFolderProjection[], rebuildEpoch: string, indexVersion: string) {
  const now = nowIso();
  const byDeliverable = new Map<string, StageFolderProjection>();
  for (const row of rows) {
    byDeliverable.set(deliverableSourceRef(row), row);
  }
  const eventStmt = db.prepare(`
    INSERT OR REPLACE INTO lineage_events(
      event_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, event_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const edgeStmt = db.prepare(`
    INSERT OR REPLACE INTO lineage_edges(
      edge_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, edge_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let eventRows = 0;
  let edgeRows = 0;
  for (const row of byDeliverable.values()) {
    const programId = compositeProgramId(row);
    const eventsFile = path.join(row.deliverable_root, 'lineage', 'events.jsonl');
    for (const event of readJsonLines(eventsFile)) {
      const eventRef = text(event.event_id, `lineage-event:${jsonHash(event)}`);
      eventStmt.run(
        eventRef,
        row.domain_id,
        programId,
        text(event.stage_id, row.stage_id),
        text(event.attempt_id, row.latest_attempt_id ?? row.attempt_id),
        'opl_stage_artifact_lineage_event',
        deliverableSourceRef(row),
        text(event.receipt_ref) || null,
        jsonHash(event),
        text(event.occurred_at, now),
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          events_file: eventsFile,
          event_ref: eventRef,
        }),
      );
      eventRows += 1;
    }
    const graphFile = path.join(row.deliverable_root, 'lineage', 'graph.json');
    const graph = readJsonFile(graphFile);
    const edges = Array.isArray(graph?.edges) ? graph.edges.filter(isRecord) : [];
    for (const edge of edges) {
      const edgeRef = `lineage-edge:${row.domain_id}:${programId}:${text(edge.from)}:${text(edge.to)}`;
      const [stageId, attemptId] = text(edge.from).split('/');
      edgeStmt.run(
        edgeRef,
        row.domain_id,
        programId,
        text(stageId, row.stage_id),
        text(attemptId, row.latest_attempt_id ?? row.attempt_id),
        'opl_stage_artifact_lineage_edge',
        deliverableSourceRef(row),
        null,
        jsonHash(edge),
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          graph_file: graphFile,
          edge,
        }),
      );
      edgeRows += 1;
    }
  }
  return {
    lineage_event_rows: eventRows,
    lineage_edge_rows: edgeRows,
  };
}

function insertStageArtifactRetentionRows(db: DatabaseSync, rows: StageFolderProjection[], rebuildEpoch: string, indexVersion: string) {
  const now = nowIso();
  const byDeliverable = new Map<string, StageFolderProjection>();
  for (const row of rows) {
    byDeliverable.set(deliverableSourceRef(row), row);
  }
  const retentionStmt = db.prepare(`
    INSERT OR REPLACE INTO retention_ledger(
      retention_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, retention_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const restoreStmt = db.prepare(`
    INSERT OR REPLACE INTO restore_proofs(
      restore_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, restore_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let retentionRows = 0;
  let restoreRows = 0;
  for (const row of byDeliverable.values()) {
    const archiveRoot = path.join(row.deliverable_root, 'retention', 'attempts');
    for (const stageId of listDirNames(archiveRoot)) {
      for (const attemptId of listDirNames(path.join(archiveRoot, stageId))) {
        const proofFile = path.join(archiveRoot, stageId, attemptId, 'restore-proof.json');
        const proof = readJsonFile(proofFile);
        const restoreRef = text(proof?.restore_ref, `stage-retention:${row.domain_id}:${compositeProgramId(row)}:${stageId}:${attemptId}`);
        const contentHash = fileContentHash(proofFile) ?? jsonHash(proof);
        retentionStmt.run(
          restoreRef,
          row.domain_id,
          compositeProgramId(row),
          stageId,
          attemptId,
          'opl_stage_artifact_retention_ref',
          deliverableSourceRef(row),
          null,
          contentHash,
          text(proof?.archived_at, now),
          now,
          indexVersion,
          rebuildEpoch,
          JSON.stringify({ proof_file: proofFile }),
        );
        restoreStmt.run(
          restoreRef,
          row.domain_id,
          compositeProgramId(row),
          stageId,
          attemptId,
          'opl_stage_artifact_restore_proof_ref',
          deliverableSourceRef(row),
          null,
          contentHash,
          text(proof?.archived_at, now),
          now,
          indexVersion,
          rebuildEpoch,
          JSON.stringify({ proof_file: proofFile }),
        );
        retentionRows += 1;
        restoreRows += 1;
      }
    }
  }
  return {
    retention_rows: retentionRows,
    restore_proof_rows: restoreRows,
  };
}

function insertStageArtifactReadModelRows(db: DatabaseSync, rows: StageFolderProjection[], rebuildEpoch: string, indexVersion: string) {
  const now = nowIso();
  const byDeliverable = new Map<string, StageFolderProjection[]>();
  for (const row of rows) {
    const key = deliverableSourceRef(row);
    byDeliverable.set(key, [...(byDeliverable.get(key) ?? []), row]);
  }
  const drilldownStmt = db.prepare(`
    INSERT OR REPLACE INTO artifact_drilldown(
      drilldown_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, drilldown_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const taskStmt = db.prepare(`
    INSERT OR REPLACE INTO operator_tasks(
      task_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, task_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const routeStmt = db.prepare(`
    INSERT OR REPLACE INTO owner_route_index(
      route_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, route_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const fingerprintStmt = db.prepare(`
    INSERT OR REPLACE INTO source_fingerprints(
      fingerprint_ref, domain_id, program_id, stage_id, attempt_id, surface_id, source_ref, receipt_ref,
      content_hash, observed_at, indexed_at, index_version, rebuild_epoch, fingerprint_json_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let drilldownRows = 0;
  let taskRows = 0;
  let routeRows = 0;
  let fingerprintRows = 0;
  for (const [sourceRef, deliverableRows] of byDeliverable.entries()) {
    const first = deliverableRows[0];
    const latestRows = deliverableRows.filter((row) => row.latest_attempt_id === row.attempt_id);
    const fallbackLatest = latestRows.at(-1) ?? deliverableRows.at(-1);
    if (!first || !fallbackLatest) {
      continue;
    }
    const statusCounts = Object.fromEntries(['success', 'blocked', 'skipped', 'deferred', 'in_progress']
      .map((status) => [status, latestRows.filter((row) => text(row.manifest?.terminal_status, 'in_progress') === status).length]));
    const contentHash = jsonHash(deliverableRows.map((row) => ({
      stage_id: row.stage_id,
      attempt_id: row.attempt_id,
      manifest_hash: fileContentHash(row.manifest_file),
    })));
    drilldownStmt.run(
      `stage-artifact-drilldown:${sourceRef}`,
      first.domain_id,
      compositeProgramId(first),
      fallbackLatest.stage_id,
      fallbackLatest.attempt_id,
      'opl_stage_artifact_runtime_workbench',
      sourceRef,
      firstReceiptRef(fallbackLatest.manifest),
      contentHash,
      now,
      now,
      indexVersion,
      rebuildEpoch,
      JSON.stringify({
        locator: {
          domain_id: first.domain_id,
          program_id: first.program_id,
          topic_id: first.topic_id,
          deliverable_id: first.deliverable_id,
        },
        deliverable_root: first.deliverable_root,
        stage_count: new Set(deliverableRows.map((row) => row.stage_id)).size,
        attempt_count: deliverableRows.length,
        status_counts: statusCounts,
        artifact_body_access: false,
        domain_verdict_authority: false,
      }),
    );
    drilldownRows += 1;
    routeStmt.run(
      `stage-artifact-current-route:${sourceRef}`,
      first.domain_id,
      compositeProgramId(first),
      fallbackLatest.stage_id,
      fallbackLatest.attempt_id,
      'opl_stage_artifact_current_pointer',
      sourceRef,
      firstReceiptRef(fallbackLatest.manifest),
      contentHash,
      now,
      now,
      indexVersion,
      rebuildEpoch,
      JSON.stringify({
        current_pointer_file: path.join(first.deliverable_root, 'current.json'),
        latest_attempt_id: fallbackLatest.latest_attempt_id,
        stage_id: fallbackLatest.stage_id,
        attempt_id: fallbackLatest.attempt_id,
        pointer_role: 'artifact_attempt_pointer_not_stage_run_current_pointer',
        stage_run_current_pointer: false,
        stage_run_terminal_state: false,
        current_owner_delta: false,
      }),
    );
    routeRows += 1;
    fingerprintStmt.run(
      `stage-artifact-source-fingerprint:${sourceRef}`,
      first.domain_id,
      compositeProgramId(first),
      fallbackLatest.stage_id,
      fallbackLatest.attempt_id,
      'opl_stage_artifact_source_fingerprint',
      sourceRef,
      null,
      contentHash,
      now,
      now,
      indexVersion,
      rebuildEpoch,
      JSON.stringify({
        fingerprint_kind: 'stage_folder_manifest_receipt_refs',
        source_ref: sourceRef,
      }),
    );
    fingerprintRows += 1;
    const terminalStatus = text(fallbackLatest.manifest?.terminal_status, 'in_progress');
    if (terminalStatus !== 'success') {
      taskStmt.run(
        `stage-artifact-owner-delta:${sourceRef}:${fallbackLatest.stage_id}:${fallbackLatest.attempt_id}`,
        first.domain_id,
        compositeProgramId(first),
        fallbackLatest.stage_id,
        fallbackLatest.attempt_id,
        'opl_stage_artifact_operator_task',
        sourceRef,
        firstReceiptRef(fallbackLatest.manifest),
        contentHash,
        now,
        now,
        indexVersion,
        rebuildEpoch,
        JSON.stringify({
          task_kind: 'stage_artifact_owner_delta',
          terminal_status: terminalStatus,
          artifact_body_access: false,
          sqlite_record_counts_as_stage_complete: false,
        }),
      );
      taskRows += 1;
    }
  }
  return {
    artifact_drilldown_rows: drilldownRows,
    operator_task_rows: taskRows,
    owner_route_rows: routeRows,
    source_fingerprint_rows: fingerprintRows,
  };
}

export function rebuildStageArtifactSidecarProjection(input: {
  domainId?: string;
  definitions: StateIndexDatabaseDefinition[];
  indexVersion: string;
}) {
  const { domainId, definitions, indexVersion } = input;
  const artifactDefinition = definitions.find((definition) => definition.database_id === 'artifact_index');
  const readModelDefinition = definitions.find((definition) => definition.database_id === 'operator_read_model');
  if (!artifactDefinition || !readModelDefinition) {
    return null;
  }
  artifactDefinition.ensure();
  readModelDefinition.ensure();
  const rows = stageAttemptProjections(domainId);
  const rebuildEpoch = nowIso();
  const artifactDb = openFamilyRuntimeSqlite(artifactDefinition.path);
  let artifactProjection;
  try {
    artifactDb.exec('BEGIN IMMEDIATE;');
    clearStageArtifactProjectionRows(artifactDb, domainId, [
      'stage_current_pointers',
      'manifest_index',
      'artifact_refs',
      'receipt_refs',
      'blocker_refs',
      'lineage_events',
      'lineage_edges',
      'retention_ledger',
      'restore_proofs',
    ]);
    artifactProjection = {
      ...insertStageArtifactRows(artifactDb, rows, rebuildEpoch, indexVersion),
      ...insertStageArtifactLineageRows(artifactDb, rows, rebuildEpoch, indexVersion),
      ...insertStageArtifactRetentionRows(artifactDb, rows, rebuildEpoch, indexVersion),
    };
    artifactDb.exec('COMMIT;');
  } catch (error) {
    artifactDb.exec('ROLLBACK;');
    throw error;
  } finally {
    artifactDb.close();
  }
  const readModelDb = openFamilyRuntimeSqlite(readModelDefinition.path);
  let readModelProjection;
  try {
    readModelDb.exec('BEGIN IMMEDIATE;');
    clearStageArtifactReadModelRows(readModelDb, domainId);
    readModelProjection = insertStageArtifactReadModelRows(readModelDb, rows, rebuildEpoch, indexVersion);
    readModelDb.exec('COMMIT;');
  } catch (error) {
    readModelDb.exec('ROLLBACK;');
    throw error;
  } finally {
    readModelDb.close();
  }
  return {
    surface_kind: 'opl_stage_artifact_sidecar_projection_rebuild',
    rebuild_epoch: rebuildEpoch,
    filtered_domain_id: domainId ?? null,
    scanned_attempt_count: rows.length,
    scanned_deliverable_count: new Set(rows.map(deliverableSourceRef)).size,
    artifact_index_rows: artifactProjection,
    operator_read_model_rows: readModelProjection,
    authority_boundary: {
      file_truth_source_of_truth: true,
      sqlite_sidecar_source_of_truth: false,
      sqlite_record_counts_as_stage_complete: false,
      stores_artifact_body: false,
      opl_can_create_domain_owner_receipt: false,
    },
  };
}
