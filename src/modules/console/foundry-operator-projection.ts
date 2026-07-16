import fs from 'node:fs';

import {
  type FoundryRunSnapshot,
} from '../foundry/index.ts';
import {
  foundryStoragePaths,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
} from '../ledger/index.ts';

const OWNER_GATE_STATES = new Set([
  'awaiting_owner_canary',
  'awaiting_owner_active',
]);

const ATTENTION_STATES = new Set([
  'failed',
  'quarantined',
  'completed_unqualified',
]);

const TERMINAL_STATES = new Set([
  'completed_active',
  'completed_qualified',
  'completed_unqualified',
  'rejected',
  'cancelled',
  'failed',
  'quarantined',
]);

function targetKey(run: FoundryRunSnapshot) {
  return `${run.target_agent_id}\0${run.target_domain_id}`;
}

function projectRun(run: FoundryRunSnapshot) {
  return {
    run_id: run.run_id,
    target_agent_id: run.target_agent_id,
    target_domain_id: run.target_domain_id,
    state: run.state,
    revision: run.revision,
    generation: run.generation,
    risk_tier: run.risk_tier,
    version_digest: run.version_digest,
    updated_at: run.updated_at,
    owner_decision_required: OWNER_GATE_STATES.has(run.state),
    terminal: TERMINAL_STATES.has(run.state),
    status_ref: `opl foundry status --run-id ${run.run_id} --json`,
  };
}

function emptyProjection() {
  return {
    surface_kind: 'opl_foundry_operator_projection',
    version: 'opl-foundry-operator-projection.v1',
    status: 'no_runs',
    summary: {
      run_count: 0,
      active_run_count: 0,
      awaiting_owner_count: 0,
      attention_count: 0,
      terminal_run_count: 0,
      target_count: 0,
      qualified_version_count: 0,
      active_version_count: 0,
    },
    runs: [],
    targets: [],
    authority_boundary: {
      owner: 'OPL Console',
      projection_only: true,
      can_write_foundry_state: false,
      can_create_agent_version: false,
      can_activate_or_rollback: false,
      can_write_target_domain_truth: false,
    },
  } as const;
}

export async function buildFoundryOperatorProjection(input: {
  profile?: 'fast' | 'full';
  storageRoot?: string;
} = {}) {
  const paths = foundryStoragePaths(input.storageRoot);
  if (!fs.existsSync(paths.state_index)) return emptyProjection();

  const runs = (await new LedgerFoundryEventStore(input.storageRoot).list())
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  const targetRuns = new Map<string, FoundryRunSnapshot>();
  for (const run of runs) {
    if (!targetRuns.has(targetKey(run))) targetRuns.set(targetKey(run), run);
  }

  const registry = new LedgerVersionRegistry(input.storageRoot);
  const targets = await Promise.all([...targetRuns.values()].map(async (run) => {
    const versions = await registry.list(run.target_agent_id, run.target_domain_id);
    const activation = await registry.activation(run.target_agent_id, run.target_domain_id);
    return {
      target_agent_id: run.target_agent_id,
      target_domain_id: run.target_domain_id,
      latest_run_id: run.run_id,
      latest_run_state: run.state,
      qualified_version_count: versions.length,
      latest_version_digest: versions.at(-1)?.version_digest ?? null,
      active_version_digest: activation.active_version_digest,
      activation_revision: activation.revision,
      versions_ref:
        `opl foundry versions --target-agent-id ${run.target_agent_id} --target-domain-id ${run.target_domain_id} --json`,
    };
  }));

  const activeRuns = runs.filter((run) => !TERMINAL_STATES.has(run.state));
  const awaitingOwnerRuns = runs.filter((run) => OWNER_GATE_STATES.has(run.state));
  const attentionRuns = runs.filter((run) => ATTENTION_STATES.has(run.state));
  const runLimit = input.profile === 'full' ? 100 : 20;
  const qualifiedVersionCount = targets.reduce(
    (total, target) => total + target.qualified_version_count,
    0,
  );
  const activeVersionCount = targets.filter((target) => target.active_version_digest).length;

  return {
    ...emptyProjection(),
    status: awaitingOwnerRuns.length > 0
      ? 'awaiting_owner'
      : attentionRuns.length > 0
        ? 'attention_required'
        : activeRuns.length > 0
          ? 'running'
          : runs.length > 0
            ? 'idle'
            : 'no_runs',
    summary: {
      run_count: runs.length,
      active_run_count: activeRuns.length,
      awaiting_owner_count: awaitingOwnerRuns.length,
      attention_count: attentionRuns.length,
      terminal_run_count: runs.length - activeRuns.length,
      target_count: targets.length,
      qualified_version_count: qualifiedVersionCount,
      active_version_count: activeVersionCount,
    },
    runs: runs.slice(0, runLimit).map(projectRun),
    targets,
  };
}
