import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SHA256_DIGEST_RE,
  canonicalJsonText,
  contentRefDigest,
  isSafeSingleSegmentId,
  resolveContainedPath,
  sha256Digest,
} from './canonical.mjs';

export function resolveFoundryStateDir(explicitStateDir) {
  const custom = typeof explicitStateDir === 'string' && explicitStateDir.trim() ? explicitStateDir.trim() : null;
  const envState = process.env.OPL_STATE_DIR?.trim() || null;
  const base = custom
    ? path.resolve(custom)
    : envState
      ? path.resolve(envState)
      : path.join(process.env.HOME?.trim() || os.homedir(), '.opl', 'state');
  return path.join(base, 'foundry');
}

function ensureRegistryDirs(stateDir) {
  const root = resolveFoundryStateDir(stateDir);
  const runsDir = path.join(root, 'runs');
  const versionsDir = path.join(root, 'versions');
  const activationsDir = path.join(root, 'activations');
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(versionsDir, { recursive: true });
  fs.mkdirSync(activationsDir, { recursive: true });
  return { root, runsDir, versionsDir, activationsDir };
}

function assertSafeId(value, label) {
  if (!isSafeSingleSegmentId(value)) {
    throw new Error(`Invalid ${label} '${String(value)}': must match single-segment safe identifier.`);
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function saveRunRecord(runRecord, stateDir) {
  assertSafeId(runRecord?.run_id, 'run_id');
  const { runsDir } = ensureRegistryDirs(stateDir);
  const runPath = resolveContainedPath(runsDir, `${runRecord.run_id}.json`);
  writeJsonAtomic(runPath, runRecord);
  return runPath;
}

export function loadRunRecord(runId, stateDir) {
  assertSafeId(runId, 'run_id');
  const { runsDir } = ensureRegistryDirs(stateDir);
  const runPath = resolveContainedPath(runsDir, `${runId}.json`);
  if (!fs.existsSync(runPath)) return null;
  return JSON.parse(fs.readFileSync(runPath, 'utf8'));
}

export function loadActivationPointer(targetAgentId, stateDir) {
  assertSafeId(targetAgentId, 'target_agent_id');
  const { activationsDir } = ensureRegistryDirs(stateDir);
  const ptrPath = resolveContainedPath(activationsDir, `${targetAgentId}.json`);
  if (!fs.existsSync(ptrPath)) {
    return {
      surface_kind: 'opl_foundry_activation_pointer',
      version: 'opl-foundry-activation-pointer.v1',
      target_agent_id: targetAgentId,
      revision: 0,
      active_version: null,
      active_version_digest: null,
      active_run_id: null,
      history: [],
      updated_at: null,
    };
  }
  return JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
}

export function promotePackage(options = {}) {
  const targetAgentId = typeof options.targetAgentId === 'string' ? options.targetAgentId.trim() : '';
  const runId = typeof options.runId === 'string' ? options.runId.trim() : '';
  if (!targetAgentId || !runId) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'INVALID_INPUT',
        message: 'promote requires <targetAgentId> and --run-id <runId>.',
      },
    };
  }
  if (!isSafeSingleSegmentId(targetAgentId)) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'INVALID_ID',
        message: `Invalid target_agent_id '${targetAgentId}': must be a single-segment safe identifier.`,
      },
    };
  }
  if (!isSafeSingleSegmentId(runId)) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'INVALID_ID',
        message: `Invalid run_id '${runId}': must be a single-segment safe identifier.`,
      },
    };
  }

  const runRecord = loadRunRecord(runId, options.stateDir);
  if (!runRecord) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'RUN_NOT_FOUND', message: `Foundry run '${runId}' not found.` },
    };
  }

  if (runRecord.target_agent_id !== targetAgentId && runRecord.package_id !== targetAgentId) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'TARGET_MISMATCH',
        message: `Run '${runId}' belongs to '${runRecord.target_agent_id}', not '${targetAgentId}'.`,
      },
    };
  }

  if (!runRecord.qualified || runRecord.state !== 'qualified') {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'NOT_QUALIFIED',
        message: `Run '${runId}' is in state '${runRecord.state}' and cannot be promoted.`,
      },
    };
  }

  const requireOwnerGate = runRecord.owner_gate_policy?.active_owner_required ?? (runRecord.risk_tier !== 'low');
  const receiptRef = typeof options.authorityReceiptRef === 'string' ? options.authorityReceiptRef.trim() : '';
  if (requireOwnerGate && !receiptRef) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'OWNER_GATE_REQUIRED',
        message: `Promotion for risk_tier='${runRecord.risk_tier}' requires --authority-receipt-ref <ref>.`,
      },
    };
  }

  const pointer = loadActivationPointer(targetAgentId, options.stateDir);
  if (options.expectedRevision !== undefined) {
    const expected = Number(options.expectedRevision);
    if (!Number.isInteger(expected) || expected < 0) {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_REVISION', message: 'expected_revision must be non-negative integer.' } };
    }
    if (expected !== pointer.revision) {
      return {
        ok: false,
        exit_code: 2,
        error: {
          code: 'REVISION_CONFLICT',
          message: `Activation revision conflict for '${targetAgentId}': expected ${expected}, current ${pointer.revision}.`,
        },
      };
    }
  }

  const dirs = ensureRegistryDirs(options.stateDir);
  const pkgVersion = typeof options.pkgVersion === 'string' && options.pkgVersion.trim()
    ? options.pkgVersion.trim()
    : runRecord.package_version;
  const now = new Date().toISOString();

  const versionBase = {
    surface_kind: 'opl_foundry_agent_version',
    version: 'opl-foundry-agent-version.v1',
    target_agent_id: targetAgentId,
    package_version: pkgVersion,
    run_id: runId,
    candidate_digest: runRecord.candidate_digest,
    frozen_test_plan_digest: runRecord.frozen_test_plan_digest,
    evidence_digest: runRecord.evidence_digest,
    authority_receipt_ref: receiptRef || null,
    created_at: now,
  };
  const versionDigest = contentRefDigest(versionBase);
  if (!SHA256_DIGEST_RE.test(versionDigest)) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_ID', message: 'Computed version digest is invalid.' },
    };
  }
  const versionRecord = { ...versionBase, version_digest: versionDigest };
  const versionFile = resolveContainedPath(dirs.versionsDir, targetAgentId, `${versionDigest.replace('sha256:', '')}.json`);
  writeJsonAtomic(versionFile, versionRecord);

  const nextRevision = pointer.revision + 1;
  const nextPointer = {
    ...pointer,
    revision: nextRevision,
    active_version: pkgVersion,
    active_version_digest: versionDigest,
    active_run_id: runId,
    authority_receipt_ref: receiptRef || null,
    history: [
      ...(Array.isArray(pointer.history) ? pointer.history : []),
      {
        revision: nextRevision,
        action: 'promote',
        package_version: pkgVersion,
        version_digest: versionDigest,
        run_id: runId,
        authority_receipt_ref: receiptRef || null,
        updated_at: now,
      },
    ],
    updated_at: now,
  };

  const ptrPath = resolveContainedPath(dirs.activationsDir, `${targetAgentId}.json`);
  writeJsonAtomic(ptrPath, nextPointer);

  const lastEv = runRecord.events[runRecord.events.length - 1];
  const actEvBase = {
    surface_kind: 'opl_foundry_run_event',
    version: 'opl-foundry-run-event.v1',
    event_id: `${runId}:${runRecord.events.length + 1}`,
    run_id: runId,
    revision: runRecord.events.length + 1,
    event_type: 'activation_completed',
    from_state: lastEv.to_state,
    to_state: 'completed_active',
    occurred_at: now,
    idempotency_key: `${runId}:promote:${nextRevision}`,
    previous_event_hash: lastEv.event_hash,
    payload: { version_digest: versionDigest, activation_revision: nextRevision },
  };
  const actEv = {
    ...actEvBase,
    event_hash: sha256Digest(Buffer.from(canonicalJsonText(actEvBase), 'utf8')),
  };
  saveRunRecord(
    {
      ...runRecord,
      state: 'completed_active',
      revision: actEv.revision,
      version_digest: versionDigest,
      last_event_hash: actEv.event_hash,
      events: [...runRecord.events, actEv],
      updated_at: now,
    },
    options.stateDir,
  );

  return {
    ok: true,
    exit_code: 0,
    target_agent_id: targetAgentId,
    revision: nextRevision,
    active_version: pkgVersion,
    version_digest: versionDigest,
    run_id: runId,
    activation_pointer_path: ptrPath,
  };
}

export function rollbackPackage(options = {}) {
  const targetAgentId = typeof options.targetAgentId === 'string' ? options.targetAgentId.trim() : '';
  if (!targetAgentId) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_INPUT', message: 'rollback requires <targetAgentId>.' },
    };
  }
  if (!isSafeSingleSegmentId(targetAgentId)) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'INVALID_ID',
        message: `Invalid target_agent_id '${targetAgentId}': must be a single-segment safe identifier.`,
      },
    };
  }

  const receiptRef = typeof options.authorityReceiptRef === 'string' ? options.authorityReceiptRef.trim() : '';
  if (!receiptRef) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'OWNER_GATE_REQUIRED',
        message: 'Rollback is an authority operation and requires --authority-receipt-ref <ref>.',
      },
    };
  }

  const pointer = loadActivationPointer(targetAgentId, options.stateDir);
  if (pointer.revision === 0 || !Array.isArray(pointer.history) || pointer.history.length === 0) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'NO_ACTIVE_VERSION', message: `No active activation pointer exists for '${targetAgentId}'.` },
    };
  }

  if (options.expectedRevision !== undefined) {
    const expected = Number(options.expectedRevision);
    if (!Number.isInteger(expected) || expected < 0) {
      return { ok: false, exit_code: 2, error: { code: 'INVALID_REVISION', message: 'expected_revision must be non-negative integer.' } };
    }
    if (expected !== pointer.revision) {
      return {
        ok: false,
        exit_code: 2,
        error: {
          code: 'REVISION_CONFLICT',
          message: `Activation revision conflict for '${targetAgentId}': expected ${expected}, current ${pointer.revision}.`,
        },
      };
    }
  }

  let targetEntry = null;
  if (typeof options.versionDigest === 'string' && options.versionDigest.trim()) {
    const digest = options.versionDigest.trim();
    targetEntry = [...pointer.history].reverse().find((h) => h.version_digest === digest) ?? null;
  } else if (typeof options.toVersion === 'string' && options.toVersion.trim()) {
    const ver = options.toVersion.trim();
    targetEntry = [...pointer.history].reverse().find((h) => h.package_version === ver) ?? null;
  } else {
    targetEntry = [...pointer.history]
      .reverse()
      .find((h) => h.version_digest !== pointer.active_version_digest) ?? null;
  }

  if (!targetEntry) {
    return {
      ok: false,
      exit_code: 2,
      error: {
        code: 'ROLLBACK_TARGET_NOT_FOUND',
        message: `No matching prior version found in history for '${targetAgentId}'.`,
      },
    };
  }

  const dirs = ensureRegistryDirs(options.stateDir);
  const now = new Date().toISOString();
  const nextRevision = pointer.revision + 1;
  const nextPointer = {
    ...pointer,
    revision: nextRevision,
    active_version: targetEntry.package_version,
    active_version_digest: targetEntry.version_digest,
    active_run_id: targetEntry.run_id,
    authority_receipt_ref: receiptRef,
    history: [
      ...pointer.history,
      {
        revision: nextRevision,
        action: 'rollback',
        package_version: targetEntry.package_version,
        version_digest: targetEntry.version_digest,
        run_id: targetEntry.run_id,
        authority_receipt_ref: receiptRef,
        reason: typeof options.reason === 'string' ? options.reason : null,
        updated_at: now,
      },
    ],
    updated_at: now,
  };

  const ptrPath = resolveContainedPath(dirs.activationsDir, `${targetAgentId}.json`);
  writeJsonAtomic(ptrPath, nextPointer);

  return {
    ok: true,
    exit_code: 0,
    target_agent_id: targetAgentId,
    revision: nextRevision,
    restored_version: targetEntry.package_version,
    restored_version_digest: targetEntry.version_digest,
    authority_receipt_ref: receiptRef,
    activation_pointer_path: ptrPath,
  };
}
