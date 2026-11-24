import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  atomicJson,
  digest,
  readStableFile,
  sha256,
  transactionPaths,
} from './shared.ts';

export type DomainArtifactCasMaterializationReadObservation = {
  state: 'clear' | 'sync_pending' | 'indeterminate';
  reason:
    | 'no_workspace_cas_journal'
    | 'workspace_cas_journal_present'
    | 'workspace_cas_epoch_in_progress'
    | 'workspace_cas_read_generation_changed'
    | 'workspace_cas_journal_observation_failed';
  workspace_root: string;
  journal_refs: string[];
  epoch_ref: string;
  observed_generation: string;
  observed_at: string;
  error: string | null;
};

export type DomainArtifactCasReadWindowGuard =
  | {
      status: 'settled_stable';
      reason: 'workspace_cas_read_window_stable';
      initial: DomainArtifactCasMaterializationReadObservation;
      current: DomainArtifactCasMaterializationReadObservation;
      observed_generation: string;
    }
  | {
      status: 'sync_pending';
      reason: DomainArtifactCasMaterializationReadObservation['reason'];
      initial: DomainArtifactCasMaterializationReadObservation;
      current: DomainArtifactCasMaterializationReadObservation;
      observation: DomainArtifactCasMaterializationReadObservation;
    };

type DomainArtifactCasReadEpoch = {
  phase: 'absent' | 'in_progress' | 'settled' | 'invalid';
  generation: string;
  ref: string;
  error: string | null;
};

export function writeReadEpoch(input: {
  file: string;
  workspaceRoot: string;
  requestSha256: string;
  phase: 'in_progress' | 'settled';
  outcome: 'materialized' | 'rolled_back' | null;
}) {
  atomicJson(input.file, {
    surface_kind: 'opl_domain_artifact_cas_read_epoch',
    version: 'opl-domain-artifact-cas-read-epoch.v1',
    workspace_sha256: sha256(input.workspaceRoot),
    request_sha256: input.requestSha256,
    transition_id: crypto.randomUUID(),
    phase: input.phase,
    outcome: input.outcome,
    updated_at: new Date().toISOString(),
  });
}

function readReadEpoch(file: string, workspaceKey: string): DomainArtifactCasReadEpoch {
  const ref = pathToFileURL(file).href;
  if (!fs.existsSync(file)) {
    return { phase: 'absent', generation: 'absent', ref, error: null };
  }
  try {
    const bytes = readStableFile(file, 'Domain artifact CAS read epoch');
    const value = parseJsonText(bytes.toString('utf8'));
    if (
      !isRecord(value)
      || value.surface_kind !== 'opl_domain_artifact_cas_read_epoch'
      || value.version !== 'opl-domain-artifact-cas-read-epoch.v1'
      || value.workspace_sha256 !== workspaceKey
      || !['in_progress', 'settled'].includes(String(value.phase))
      || typeof value.transition_id !== 'string'
      || !value.transition_id
    ) {
      return {
        phase: 'invalid',
        generation: `sha256:${sha256(bytes)}`,
        ref,
        error: 'Domain artifact CAS read epoch is invalid.',
      };
    }
    return {
      phase: value.phase as 'in_progress' | 'settled',
      generation: `sha256:${sha256(bytes)}`,
      ref,
      error: null,
    };
  } catch (error) {
    return {
      phase: 'invalid',
      generation: 'unreadable',
      ref,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function observeDomainArtifactCasMaterialization(
  input: { workspaceRoot: string },
): DomainArtifactCasMaterializationReadObservation {
  const observedAt = new Date().toISOString();
  let workspaceRoot: string;
  try {
    workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  } catch (error) {
    return {
      state: 'indeterminate',
      reason: 'workspace_cas_journal_observation_failed',
      workspace_root: path.resolve(input.workspaceRoot),
      journal_refs: [],
      epoch_ref: '',
      observed_generation: 'unreadable',
      observed_at: observedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const transactionsRoot = path.join(
    resolveOplStatePaths().state_dir,
    'runway',
    'domain-artifact-cas',
    'transactions',
  );
  const workspaceKey = sha256(workspaceRoot);
  const prefix = `${workspaceKey}-`;
  const epochPath = path.join(
    resolveOplStatePaths().state_dir,
    'runway',
    'domain-artifact-cas',
    'read-epochs',
    `${workspaceKey}.json`,
  );
  const beforeEpoch = readReadEpoch(epochPath, workspaceKey);
  let journalRefs: string[];
  try {
    journalRefs = fs.readdirSync(transactionsRoot, { withFileTypes: true })
      .filter((entry) => entry.name.startsWith(prefix) && entry.name.endsWith('.json'))
      .map((entry) => pathToFileURL(path.join(transactionsRoot, entry.name)).href)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      journalRefs = [];
    } else {
      return {
        state: 'indeterminate',
        reason: 'workspace_cas_journal_observation_failed',
        workspace_root: workspaceRoot,
        journal_refs: [],
        epoch_ref: beforeEpoch.ref,
        observed_generation: beforeEpoch.generation,
        observed_at: observedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const afterEpoch = readReadEpoch(epochPath, workspaceKey);
  if (beforeEpoch.phase === 'invalid' || afterEpoch.phase === 'invalid') {
    return {
      state: 'indeterminate',
      reason: 'workspace_cas_journal_observation_failed',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: afterEpoch.generation,
      observed_at: observedAt,
      error: afterEpoch.error ?? beforeEpoch.error,
    };
  }
  if (beforeEpoch.generation !== afterEpoch.generation) {
    return {
      state: 'sync_pending',
      reason: 'workspace_cas_read_generation_changed',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: `${beforeEpoch.generation}->${afterEpoch.generation}`,
      observed_at: observedAt,
      error: null,
    };
  }
  if (afterEpoch.phase === 'in_progress') {
    return {
      state: 'sync_pending',
      reason: 'workspace_cas_epoch_in_progress',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: afterEpoch.generation,
      observed_at: observedAt,
      error: null,
    };
  }
  return {
    state: journalRefs.length > 0 ? 'sync_pending' : 'clear',
    reason: journalRefs.length > 0
      ? 'workspace_cas_journal_present'
      : 'no_workspace_cas_journal',
    workspace_root: workspaceRoot,
    journal_refs: journalRefs,
    epoch_ref: afterEpoch.ref,
    observed_generation: afterEpoch.generation,
    observed_at: observedAt,
    error: null,
  };
}

export function guardDomainArtifactCasReadWindow(
  initial: DomainArtifactCasMaterializationReadObservation,
  current: DomainArtifactCasMaterializationReadObservation,
): DomainArtifactCasReadWindowGuard {
  const unsettled = initial.state === 'clear'
    ? current.state === 'clear' ? null : current
    : initial;
  if (unsettled) {
    return {
      status: 'sync_pending',
      reason: unsettled.reason,
      initial,
      current,
      observation: unsettled,
    };
  }
  if (initial.observed_generation !== current.observed_generation) {
    const observation: DomainArtifactCasMaterializationReadObservation = {
      ...current,
      state: 'sync_pending',
      reason: 'workspace_cas_read_generation_changed',
      observed_generation: `${initial.observed_generation}->${current.observed_generation}`,
    };
    return {
      status: 'sync_pending',
      reason: observation.reason,
      initial,
      current,
      observation,
    };
  }
  return {
    status: 'settled_stable',
    reason: 'workspace_cas_read_window_stable',
    initial,
    current,
    observed_generation: current.observed_generation,
  };
}

export function assertDomainArtifactCasReadWindowStable(
  initial: DomainArtifactCasMaterializationReadObservation,
  current: DomainArtifactCasMaterializationReadObservation,
  onSyncPending: (guard: Extract<DomainArtifactCasReadWindowGuard, { status: 'sync_pending' }>) => never,
) {
  const guard = guardDomainArtifactCasReadWindow(initial, current);
  if (guard.status === 'sync_pending') onSyncPending(guard);
  return guard;
}

export function domainArtifactCasMaterializationInProgress(input: {
  workspaceRoot: string;
  requestSha256: string;
}) {
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  return fs.existsSync(transactionPaths(workspaceRoot, digest(input.requestSha256, 'request_sha256')).journal);
}
