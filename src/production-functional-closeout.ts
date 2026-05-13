import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { buildFamilyAgentsList } from './family-domain-agent-skeleton.ts';
import { buildFamilyDomainMemoryList } from './family-domain-memory.ts';
import { buildFamilyStageListEntry, buildFamilyStagesList } from './family-stage-control-plane.ts';
import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-command.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import { listStageAttempts, stageAttemptSummary, stageAttemptToPayload } from './family-runtime-stage-attempts.ts';
import { familyRuntimePaths, queueSummary } from './family-runtime-store.ts';
import { DEFAULT_TEMPORAL_TASK_QUEUE, resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { probeTemporalServer, resolveTemporalAddressForPaths } from './family-runtime-temporal-service.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

type TypedBlocker = {
  blocker_kind: string;
  blocker_id: string;
  owner: string;
  source_surface: string;
  repair_command?: string | null;
  next_action?: string;
};

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function tableExists(db: DatabaseSync, tableName: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function safeReadAttemptLedger(paths: ReturnType<typeof familyRuntimePaths>) {
  if (!fs.existsSync(paths.queue_db)) {
    return {
      status: 'not_initialized' as const,
      queue: { total: 0, by_status: {} },
      stage_attempts: { total: 0, by_status: {} },
      attempts: [],
    };
  }

  const db = new DatabaseSync(paths.queue_db, { readOnly: true });
  try {
    const tasksReady = tableExists(db, 'tasks');
    const attemptsReady = tableExists(db, 'stage_attempts');
    return {
      status: 'readable' as const,
      queue: tasksReady ? queueSummary(db) : { total: 0, by_status: {} },
      stage_attempts: attemptsReady ? stageAttemptSummary(db) : { total: 0, by_status: {} },
      attempts: attemptsReady ? listStageAttempts(db) : [],
    };
  } finally {
    db.close();
  }
}

function readTemporalWorkerState(paths: ReturnType<typeof familyRuntimePaths>) {
  const statePath = path.join(paths.root, 'temporal-worker.json');
  const state = readJsonRecord(statePath);
  if (!state) {
    return { state_path: statePath, state: null, pid_alive: false };
  }
  const pid = typeof state.pid === 'number' && Number.isInteger(state.pid) ? state.pid : null;
  return {
    state_path: statePath,
    state,
    pid_alive: pid !== null ? processIsAlive(pid) : false,
  };
}

function temporalRepairAction(readinessStatus: string) {
  const repairCommands = {
    start_local_temporal_service: 'opl family-runtime service start --provider temporal',
    configure_temporal_address: 'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
    verify_temporal_server: 'opl family-runtime worker status --provider temporal',
    start_managed_worker: 'opl family-runtime worker start --provider temporal',
    rerun_production_proof: 'opl family-runtime residency proof --provider temporal --production',
  };
  const nextCommandByStatus: Record<string, string | null> = {
    not_configured: repairCommands.start_local_temporal_service,
    server_unreachable: repairCommands.start_local_temporal_service,
    worker_not_ready: repairCommands.start_managed_worker,
    ready: repairCommands.rerun_production_proof,
  };
  return {
    surface_kind: 'temporal_worker_repair_action',
    provider_kind: 'temporal',
    action_id:
      readinessStatus === 'ready'
        ? 'none'
        : readinessStatus === 'worker_not_ready'
          ? 'start_temporal_worker'
          : readinessStatus === 'server_unreachable'
            ? 'repair_temporal_service'
            : 'configure_temporal_service',
    next_command: nextCommandByStatus[readinessStatus] ?? repairCommands.start_local_temporal_service,
    repair_commands: repairCommands,
  };
}

async function buildProviderReadiness(paths: ReturnType<typeof familyRuntimePaths>) {
  const addressResolution = resolveTemporalAddressForPaths(paths);
  const address = addressResolution.address;
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const workerState = readTemporalWorkerState(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const state = workerState.state;
  const workerStateMatches =
    Boolean(state)
    && optionalString(state?.address) === address
    && optionalString(state?.namespace) === namespace
    && optionalString(state?.task_queue) === taskQueue;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const workerReady = Boolean(serverReachable && (envWorkerReady || (workerStateMatches && workerState.pid_alive)));
  const readinessStatus =
    !address
      ? 'not_configured'
      : !serverReachable
        ? 'server_unreachable'
        : !workerReady
          ? 'worker_not_ready'
          : 'ready';

  return {
    surface_kind: 'opl_production_temporal_provider_readiness',
    provider_kind: 'temporal',
    readiness_status: readinessStatus,
    production_provider_ready: readinessStatus === 'ready',
    address,
    address_source: addressResolution.addressSource,
    server_reachable: serverReachable,
    namespace,
    task_queue: taskQueue,
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    worker_ready: workerReady,
    worker_state_path: workerState.state_path,
    managed_worker_pid:
      workerState.pid_alive && typeof workerState.state?.pid === 'number'
        ? workerState.state.pid
        : null,
    managed_worker_state_matches: workerStateMatches,
    service_state: addressResolution.serviceState,
    repair_action: temporalRepairAction(readinessStatus),
    typed_blocker:
      readinessStatus === 'ready'
        ? null
        : {
            blocker_kind: 'temporal_readiness',
            blocker_id: `temporal_provider_${readinessStatus}`,
            owner: 'opl_provider_runtime',
            source_surface: 'opl_production_temporal_provider_readiness',
            repair_command: temporalRepairAction(readinessStatus).next_command,
            next_action: 'Bring the managed local Temporal service and worker to ready, then rerun production proof.',
          },
    authority_boundary: {
      opl: 'provider_readiness_and_repair_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function contractForAttempt(attempt: ReturnType<typeof stageAttemptToPayload>) {
  return buildFamilyRuntimeControlledApplyContract({
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workspaceLocator: attempt.workspace_locator,
  });
}

function lifecycleForAttempt(attempt: ReturnType<typeof stageAttemptToPayload>) {
  return buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator: attempt.workspace_locator,
    artifactRefs: [
      ...stringList(attempt.closeout_refs),
      ...stringList(attempt.checkpoint_refs),
    ],
  }).guarded_apply_proof;
}

function summarizeAttemptEvidence(attempts: Array<ReturnType<typeof stageAttemptToPayload>>) {
  const contracts = attempts.map(contractForAttempt);
  const lifecycleProofs = attempts.map(lifecycleForAttempt);
  return {
    surface_kind: 'opl_stage_attempt_functional_closeout_evidence',
    ledger_attempt_count: attempts.length,
    controlled_apply_summary: {
      contract_open_count: contracts.filter((contract) => contract.contract_open).length,
      domain_receipt_observed_count: contracts.filter((contract) => contract.apply_status === 'domain_receipt_observed').length,
      no_regression_evidence_observed_count: contracts.filter((contract) => contract.apply_status === 'no_regression_evidence_observed').length,
      blocked_domain_receipt_required_count: contracts.filter((contract) => contract.apply_status === 'blocked_domain_receipt_required').length,
      no_controlled_apply_request_count: contracts.filter((contract) => contract.apply_status === 'no_controlled_apply_request').length,
    },
    lifecycle_guarded_apply_summary: {
      domain_receipt_observed_count: lifecycleProofs.filter((proof) => proof.apply_status === 'domain_receipt_observed').length,
      opl_apply_ready_count: lifecycleProofs.filter((proof) => proof.apply_status === 'opl_apply_ready').length,
      blocked_domain_receipt_required_count: lifecycleProofs.filter((proof) => proof.apply_status === 'blocked_domain_receipt_required').length,
      no_apply_requests_count: lifecycleProofs.filter((proof) => proof.apply_status === 'no_apply_requests').length,
      domain_writes_performed: false,
    },
    domain_breakdown: ['medautoscience', 'medautogrant', 'redcube'].map((domainId) => {
      const domainAttempts = attempts.filter((attempt) => attempt.domain_id === domainId);
      const domainContracts = domainAttempts.map(contractForAttempt);
      const domainLifecycleProofs = domainAttempts.map(lifecycleForAttempt);
      return {
        domain_id: domainId,
        attempt_count: domainAttempts.length,
        controlled_apply_statuses: domainContracts.map((contract) => contract.apply_status),
        owner_receipt_refs: domainContracts.flatMap((contract) => contract.owner_receipt_refs),
        no_regression_evidence_refs: domainContracts.flatMap((contract) => contract.no_regression_evidence_refs),
        typed_blockers: domainContracts.flatMap((contract) => contract.typed_blockers),
        lifecycle_apply_statuses: domainLifecycleProofs.map((proof) => proof.apply_status),
      };
    }),
    authority_boundary: {
      opl_writes_domain_truth: false,
      opl_writes_domain_artifact: false,
      opl_writes_domain_memory_body: false,
      opl_declares_domain_quality_verdict: false,
    },
  };
}

function findByProject<T extends { project_id: string }>(items: T[], projectId: string) {
  return items.find((item) => item.project_id === projectId) ?? null;
}

function entriesByProject(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord & { project_id: string } => (
        isRecord(entry) && typeof entry.project_id === 'string'
      ))
    : [];
}

function buildDomainBlockers(input: {
  entry: DomainManifestCatalogEntry;
  agent: JsonRecord | null;
  memory: JsonRecord | null;
  stageDomain: JsonRecord | null;
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>['domain_breakdown'][number] | null;
}) {
  const blockers: TypedBlocker[] = [];
  const projectId = input.entry.project_id;
  if (input.entry.status !== 'resolved') {
    blockers.push({
      blocker_kind: 'domain_manifest',
      blocker_id: `${projectId}:manifest_not_resolved`,
      owner: projectId,
      source_surface: 'opl_domain_manifest_catalog',
      next_action: 'Bind a domain workspace with a valid manifest command.',
    });
    return blockers;
  }
  if (input.agent?.skeleton_status !== 'aligned') {
    blockers.push({
      blocker_kind: 'domain_skeleton',
      blocker_id: `${projectId}:standard_skeleton_not_aligned`,
      owner: projectId,
      source_surface: 'opl_standard_domain_agent_skeleton_index',
      next_action: 'Expose aligned agent/contracts/runtime/docs skeleton refs without artifact blobs.',
    });
  }
  if (input.stageDomain?.ready !== true) {
    blockers.push({
      blocker_kind: 'domain_stage_plane',
      blocker_id: `${projectId}:stage_control_plane_missing`,
      owner: projectId,
      source_surface: 'opl_family_stage_control_plane_index',
      next_action: 'Expose the domain-owned family_stage_control_plane descriptor.',
    });
  }
  if (input.memory?.ready !== true) {
    blockers.push({
      blocker_kind: 'domain_memory',
      blocker_id: `${projectId}:domain_memory_descriptor_missing`,
      owner: projectId,
      source_surface: 'opl_family_domain_memory_index',
      next_action: 'Expose domain-owned memory locator and receipt refs.',
    });
  }
  if (!input.entry.manifest?.owner_receipt_contract && !input.entry.manifest?.domain_owner_receipt_contract) {
    blockers.push({
      blocker_kind: 'domain_owner_receipt',
      blocker_id: `${projectId}:owner_receipt_contract_not_declared`,
      owner: projectId,
      source_surface: 'domain_product_entry_manifest',
      next_action: 'Declare the domain owner receipt envelope or return typed blocker refs.',
    });
  }
  if (!input.entry.manifest?.legacy_retirement_tombstone_proof && !input.entry.manifest?.runtime_residue_retirement) {
    blockers.push({
      blocker_kind: 'legacy_retirement',
      blocker_id: `${projectId}:legacy_tombstone_proof_not_declared`,
      owner: projectId,
      source_surface: 'domain_product_entry_manifest',
      next_action: 'Publish no-active-default-caller proof or keep legacy residue in history/reference context.',
    });
  }
  if (!input.attemptEvidence || input.attemptEvidence.attempt_count === 0) {
    blockers.push({
      blocker_kind: 'provider_hosted_soak',
      blocker_id: `${projectId}:no_stage_attempt_evidence_in_opl_ledger`,
      owner: projectId,
      source_surface: 'opl_family_runtime_stage_attempt_ledger',
      next_action: 'Run an OPL provider-hosted attempt and return domain receipt, no-regression evidence, or typed blocker.',
    });
  }
  return blockers;
}

function buildDomainCloseoutEntries(input: {
  catalog: ReturnType<typeof buildDomainManifestCatalog>;
  agents: ReturnType<typeof buildFamilyAgentsList>['family_agents'];
  memories: ReturnType<typeof buildFamilyDomainMemoryList>['family_domain_memory'];
  stages: ReturnType<typeof buildFamilyStagesList>['family_stages'];
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>;
}) {
  const agentEntries = entriesByProject(input.agents.agents);
  const memoryEntries = entriesByProject(input.memories.memories);
  const stageDomainEntries = entriesByProject(input.stages.domains);
  return input.catalog.domain_manifests.projects.map((entry) => {
    const agent = findByProject(agentEntries, entry.project_id);
    const memory = findByProject(memoryEntries, entry.project_id);
    const stageDomain = findByProject(stageDomainEntries, entry.project_id);
    const attemptEvidence = input.attemptEvidence.domain_breakdown.find((item) => item.domain_id === entry.project_id) ?? null;
    const manifest = entry.manifest;
    const lifecycleFromManifest = manifest
      ? manifest.lifecycle_guarded_apply_proof ?? buildFamilyRuntimeLifecyclePrimitives({
          workspaceLocator: {
            ...manifest.workspace_locator,
            lifecycle_apply_requests: manifest.lifecycle_apply_requests,
          },
        }).guarded_apply_proof
      : null;
    return {
      project_id: entry.project_id,
      project: entry.project,
      manifest_status: entry.status,
      descriptor_status: agent?.descriptor_readiness && isRecord(agent.descriptor_readiness)
        ? optionalString(agent.descriptor_readiness.status)
        : null,
      skeleton_status: optionalString(agent?.skeleton_status),
      physical_skeleton_status: agent?.physical_skeleton_layout_audit && isRecord(agent.physical_skeleton_layout_audit)
        ? optionalString(agent.physical_skeleton_layout_audit.status)
        : null,
      stage_plane_ready: stageDomain?.ready === true,
      memory_descriptor_ready: memory?.ready === true,
      owner_receipt_contract_declared: Boolean(
        manifest?.owner_receipt_contract ?? manifest?.domain_owner_receipt_contract,
      ),
      managed_temporal_state_consistency_declared: Boolean(manifest?.managed_temporal_state_consistency),
      lifecycle_guarded_apply: lifecycleFromManifest,
      legacy_retirement_tombstone_declared: Boolean(
        manifest?.legacy_retirement_tombstone_proof ?? manifest?.runtime_residue_retirement,
      ),
      stage_attempt_evidence: attemptEvidence,
      typed_blockers: buildDomainBlockers({
        entry,
        agent,
        memory,
        stageDomain,
        attemptEvidence,
      }),
      authority_boundary: {
        opl: 'descriptor_attempt_receipt_locator_projection_only',
        domain: 'truth_quality_artifact_memory_owner',
      },
    };
  });
}

function buildGlobalBlockers(input: {
  providerReadiness: Awaited<ReturnType<typeof buildProviderReadiness>>;
  domainEntries: ReturnType<typeof buildDomainCloseoutEntries>;
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>;
}) {
  const blockers: TypedBlocker[] = [];
  if (input.providerReadiness.typed_blocker) {
    blockers.push(input.providerReadiness.typed_blocker);
  }
  blockers.push(...input.domainEntries.flatMap((entry) => entry.typed_blockers));
  if (input.attemptEvidence.controlled_apply_summary.blocked_domain_receipt_required_count > 0) {
    blockers.push({
      blocker_kind: 'controlled_apply',
      blocker_id: 'controlled_apply_domain_receipt_or_no_regression_required',
      owner: 'domain_agents',
      source_surface: 'family_runtime_controlled_apply_contract',
      next_action: 'Return domain owner receipt refs, no-regression evidence refs, or typed blocker refs.',
    });
  }
  if (input.attemptEvidence.lifecycle_guarded_apply_summary.blocked_domain_receipt_required_count > 0) {
    blockers.push({
      blocker_kind: 'lifecycle_apply',
      blocker_id: 'domain_lifecycle_receipt_required',
      owner: 'domain_agents',
      source_surface: 'family_runtime_lifecycle_guarded_apply_proof',
      next_action: 'Return domain lifecycle receipt refs for cleanup/restore/retention that mutates domain-owned artifacts.',
    });
  }
  return blockers;
}

export async function buildProductionFunctionalCloseout(contracts: FrameworkContracts) {
  const paths = familyRuntimePaths();
  const catalog = buildDomainManifestCatalog(contracts);
  const agents = buildFamilyAgentsList(contracts).family_agents;
  const memories = buildFamilyDomainMemoryList(contracts).family_domain_memory;
  const stages = buildFamilyStagesList(contracts).family_stages;
  const providerReadiness = await buildProviderReadiness(paths);
  const ledger = safeReadAttemptLedger(paths);
  const attemptEvidence = summarizeAttemptEvidence(ledger.attempts);
  const domainEntries = buildDomainCloseoutEntries({
    catalog,
    agents,
    memories,
    stages,
    attemptEvidence,
  });
  const blockers = buildGlobalBlockers({
    providerReadiness,
    domainEntries,
    attemptEvidence,
  });
  return {
    version: 'g2',
    production_functional_closeout: {
      surface_kind: 'opl_production_functional_closeout_gate',
      status: blockers.length === 0 ? 'functional_closure_ready_for_live_soak' : 'usable_with_typed_blockers',
      proof_mode: 'read_only_no_long_running_soak',
      scope: [
        'provider_readiness',
        'domain_descriptor_alignment',
        'owner_receipt_contract',
        'domain_memory_receipt_projection',
        'lifecycle_guarded_apply',
        'physical_skeleton_layout',
        'legacy_tombstone',
        'stage_attempt_evidence',
      ],
      summary: {
        domain_count: domainEntries.length,
        resolved_manifest_count: catalog.domain_manifests.summary.resolved_count,
        descriptor_aligned_count: agents.summary.descriptor_aligned_count,
        resolved_stage_plane_count: stages.summary.resolved_planes_count,
        resolved_memory_descriptor_count: memories.summary.resolved_memory_descriptor_count,
        provider_ready: providerReadiness.production_provider_ready,
        typed_blocker_count: blockers.length,
        live_soak_excluded: true,
      },
      provider_readiness: providerReadiness,
      domain_manifests: catalog.domain_manifests.summary,
      descriptor_alignment: agents.summary,
      stage_plane: stages.summary,
      domain_memory: memories.summary,
      runtime_ledger: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        queue_db: paths.queue_db,
        ledger_status: ledger.status,
        queue: ledger.queue,
        stage_attempts: ledger.stage_attempts,
      },
      stage_attempt_evidence: attemptEvidence,
      domains: domainEntries,
      typed_blockers: blockers,
      authority_boundary: {
        opl: 'framework_readiness_attempt_receipt_locator_projection_only',
        domain_agents: 'truth_quality_artifact_memory_lifecycle_owner',
        opl_writes_domain_truth: false,
        opl_writes_domain_artifact: false,
        opl_writes_domain_memory_body: false,
        opl_declares_paper_grant_visual_success: false,
      },
    },
  };
}
