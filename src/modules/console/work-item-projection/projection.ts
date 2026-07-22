import type { JsonRecord } from '../../../kernel/json-record.ts';
import { readStandardAgentDescriptorForDomain } from '../../connect/index.ts';
import { buildWorkItemControlResolver } from '../../ledger/index.ts';
import {
  observeDomainArtifactCasMaterialization,
  type DomainArtifactCasMaterializationReadObservation,
} from '../../runway/index.ts';
import { listWorkspaceBindings, type WorkspaceBinding } from '../../workspace/public/app-state.ts';
import { buildAgentCatalog, buildProjectCatalog } from './catalog.ts';
import {
  applyWorkItemControlState,
  type WorkItemControlResolver,
} from './control.ts';
import { joinAttemptsToWorkItems, readWorkItemStageAttempts } from './execution.ts';
import {
  deriveControlledExecutionSessionBindings,
  joinSessionActivityToWorkItems,
  readWorkItemExecutionSessionBindings,
  type WorkItemExecutionSessionBinding,
} from './session-activity.ts';
import {
  readProjectInventory,
  type InventoryDescriptorResolver,
} from './inventory.ts';
import { withProjectedWorkItemPrimaryState } from './primary-state.ts';
import type {
  WorkItemCondition,
  WorkItemProjectionItem,
  WorkItemProjectionV2,
} from './types.ts';

function nowIso() {
  return new Date().toISOString();
}

function lifecycleConditions(item: WorkItemProjectionItem): WorkItemCondition[] {
  const controlObserved = item.lifecycle.control_state !== null;
  return [
    {
      type: 'BusinessLifecycleKnown',
      status: item.lifecycle.business_state === 'unknown' ? 'Unknown' : 'True',
      reason: item.lifecycle.business_state === 'unknown'
        ? 'business_lifecycle_not_declared'
        : `business_lifecycle_${item.lifecycle.business_state}`,
      message: item.lifecycle.business_state === 'unknown'
        ? 'The domain inventory does not declare a recognized collaboration lifecycle state.'
        : `The effective collaboration lifecycle is ${item.lifecycle.business_state}.`,
      owner: controlObserved ? 'opl_ledger' : item.identity.agent_id,
      severity: 'none',
      last_transition_time: item.lifecycle.control_updated_at ?? item.freshness.inventory_observed_at,
      observed_generation: item.lifecycle.observed_generation,
      ref: item.lifecycle.control_ref ?? item.lifecycle.lifecycle_ref,
    },
    {
      type: 'ControlStateObserved',
      status: controlObserved ? 'True' : 'False',
      reason: controlObserved ? 'work_item_control_ledger_state_observed' : 'no_work_item_control_override',
      message: controlObserved
        ? 'The OPL Ledger user-collaboration lifecycle overrides the inventory collaboration state.'
        : 'No user-collaboration lifecycle override is recorded.',
      owner: 'opl_ledger',
      severity: 'none',
      last_transition_time: item.lifecycle.control_updated_at ?? item.freshness.inventory_observed_at,
      observed_generation: item.lifecycle.observed_generation,
      ref: item.lifecycle.control_ref,
    },
  ];
}

function casSyncPendingItem(
  item: WorkItemProjectionItem,
  observation: DomainArtifactCasMaterializationReadObservation,
): WorkItemProjectionItem {
  const sourceRef = (observation.journal_refs[0] ?? observation.epoch_ref) || null;
  const conditions = item.conditions.map((condition): WorkItemCondition => {
    if (condition.type === 'BusinessLifecycleKnown') {
      return {
        ...condition,
        status: 'Unknown',
        reason: 'domain_artifact_cas_materialization_sync_pending',
        message: 'Business lifecycle projection is withheld while domain artifact materialization is unsettled.',
        owner: 'opl_framework',
        severity: 'warning',
        last_transition_time: observation.observed_at,
        ref: sourceRef,
      };
    }
    if (condition.type === 'ControlStateObserved') {
      return {
        ...condition,
        status: 'Unknown',
        reason: 'domain_artifact_cas_materialization_sync_pending',
        message: 'Effective control state is withheld until domain artifact materialization settles.',
        owner: 'opl_framework',
        severity: 'warning',
        last_transition_time: observation.observed_at,
        ref: sourceRef,
      };
    }
    return condition;
  });
  conditions.unshift({
    type: 'DomainArtifactMaterializationSettled',
    status: 'False',
    reason: observation.reason,
    message: 'A workspace-scoped domain artifact CAS journal is pending or cannot be observed safely.',
    owner: 'opl_framework',
    severity: 'warning',
    last_transition_time: observation.observed_at,
    observed_generation: item.lifecycle.observed_generation,
    ref: sourceRef,
  });
  return {
    ...item,
    lifecycle: {
      ...item.lifecycle,
      business_state: 'unknown',
      domain_business_state: 'unknown',
      control_state: null,
      primary_state: 'sync_pending',
      primary_state_label: '状态待同步',
      primary_state_reason: 'domain_artifact_cas_materialization_sync_pending',
      reason: 'domain_artifact_cas_materialization_sync_pending',
      raw_business_status: null,
      current_stage_id: null,
      current_stage_display_name: null,
      current_stage_status: null,
      package_status: null,
    },
    attention: {
      kind: 'system',
      reason: 'domain_artifact_cas_materialization_sync_pending',
      owner: 'opl_framework',
      responsible_component: 'opl_domain_artifact_cas_materialization',
      issue: 'The domain artifact transaction is not yet settled.',
      impact: 'Business lifecycle and next-owner projection cannot be trusted as one coherent generation.',
      repair_action: 'Recover or complete the exact journaled CAS transaction before reading business state.',
      expected_outcome: 'The journal is absent and the next read observes one settled domain generation.',
    },
    action: {
      kind: 'blocked_no_action',
      title: '等待状态同步',
      title_key: 'domainArtifactCas.syncPending.title',
      summary: 'Business state is temporarily unavailable while an authorized domain update settles.',
      summary_key: 'domainArtifactCas.syncPending.summary',
      message_args: {
        sync_state: 'sync_pending',
        observation_reason: observation.reason,
        journal_refs: observation.journal_refs,
      },
      owner: 'opl_framework',
      owner_kind: 'system',
      owner_display_name: 'OPL Framework',
      action_ref: sourceRef ?? 'opl://domain-artifact-cas/sync-pending',
      dry_run_required: false,
    },
    conditions,
    freshness: {
      ...item.freshness,
      state: 'unknown',
      reason: 'domain_artifact_cas_materialization_sync_pending',
    },
    source_refs: sourceRef
      ? [
          ...item.source_refs,
          { ref_kind: 'file', ref: sourceRef, role: 'domain_artifact_cas_read_guard' },
        ]
      : item.source_refs,
  };
}

export type BuildWorkItemProjectionV2Options = {
  profile?: 'fast' | 'full';
  packageProjectionItems?: ReadonlyArray<JsonRecord>;
  packageStatusById?: Readonly<Record<string, JsonRecord>>;
  bindings?: ReadonlyArray<WorkspaceBinding>;
  attempts?: JsonRecord[];
  qualityCycles?: JsonRecord[];
  queueDb?: string;
  sessionBindings?: WorkItemExecutionSessionBinding[];
  sessionSourceRef?: string;
  now?: () => number;
  resolveDescriptor?: InventoryDescriptorResolver;
  findWorkItemControl?: WorkItemControlResolver;
  generatedAt?: string;
  inventoryDetail?: 'deferred' | 'included';
};

export function buildWorkItemProjectionV2(
  options: BuildWorkItemProjectionV2Options = {},
): WorkItemProjectionV2 {
  const profile = options.profile ?? 'full';
  const generatedAt = options.generatedAt ?? nowIso();
  const projectCatalog = buildProjectCatalog(options.bindings ?? listWorkspaceBindings());
  if (options.inventoryDetail === 'deferred') {
    const { agents, availability } = buildAgentCatalog({
      profile,
      checkedAt: generatedAt,
      packageItems: options.packageProjectionItems,
      packageStatusById: options.packageStatusById,
    });
    return {
      surface_kind: 'opl_work_item_projection',
      schema_version: 'work-item-projection.v2',
      profile,
      generated_at: generatedAt,
      agent_catalog: agents,
      agent_availability: availability,
      project_catalog: projectCatalog.projects,
      identity_health: {
        status: 'not_evaluated',
        execution_count: 0,
        resolved_execution_count: 0,
        unresolved_execution_count: 0,
        conflict_execution_count: 0,
        not_in_inventory_execution_count: 0,
        non_work_item_execution_count: 0,
        reason_counts: [],
        sample_attempt_refs: [],
      },
      unresolved_executions: [],
      summary: {
        agent_count: agents.length,
        project_count: projectCatalog.projects.length,
        work_item_count: 0,
        visible_work_item_count: 0,
        archived_work_item_count: 0,
        total_work_item_count: 0,
        running_count: 0,
        active_session_count: 0,
        user_attention_count: 0,
        system_attention_count: 0,
        telemetry_observed_count: 0,
        telemetry_missing_count: 0,
      },
      items: [],
      diagnostics: {
        count: projectCatalog.diagnostics.length,
        items: [],
        detail_policy: 'summary_only',
      },
      detail_policy: {
        all_work_item_summaries_included: false,
        attempt_ref_limit_per_item: 0,
        diagnostic_details: 'lazy',
        inventory_detail: 'deferred',
        full_detail_surface: 'opl app state --profile full --json',
      },
      authority_boundary: {
        projection_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_verdict: false,
        temporal_is_work_item_inventory: false,
      },
    };
  }
  const inventoryItems: WorkItemProjectionItem[] = [];
  const diagnostics = [...projectCatalog.diagnostics];
  const casObservationByWorkspace = new Map<string, DomainArtifactCasMaterializationReadObservation>();
  const descriptorCache = new Map<string, ReturnType<InventoryDescriptorResolver>>();
  const descriptorResolver = options.resolveDescriptor ?? readStandardAgentDescriptorForDomain;
  const resolveDescriptor = (agentId: string) => {
    if (!descriptorCache.has(agentId)) {
      descriptorCache.set(agentId, descriptorResolver(agentId));
    }
    return descriptorCache.get(agentId) ?? null;
  };
  for (const project of projectCatalog.projects) {
    const observation = observeDomainArtifactCasMaterialization({ workspaceRoot: project.workspace_path });
    casObservationByWorkspace.set(project.workspace_path, observation);
    const inventory = readProjectInventory({ project, resolveDescriptor });
    inventoryItems.push(...inventory.items);
    diagnostics.push(...inventory.diagnostics);
  }
  const controlled = applyWorkItemControlState({
    items: inventoryItems,
    findWorkItemControl: options.findWorkItemControl ?? buildWorkItemControlResolver(),
  });
  diagnostics.push(...controlled.diagnostics);
  const ledger = options.attempts
    ? {
        queue_db: options.queueDb ?? 'in-memory-stage-attempt-fixture',
        attempts: options.attempts,
        quality_cycles: options.qualityCycles ?? [],
        diagnostics: [],
      }
    : readWorkItemStageAttempts(
        profile === 'fast' ? { items: controlled.items } : undefined,
        { validateIrrelevantActivityJson: profile === 'full' },
      );
  diagnostics.push(...ledger.diagnostics);
  const joined = joinAttemptsToWorkItems({
    items: controlled.items,
    attempts: ledger.attempts,
    qualityCycles: ledger.quality_cycles,
    queueDb: ledger.queue_db,
    attemptRefLimit: profile === 'fast' ? 1 : 8,
  });
  diagnostics.push(...joined.diagnostics);
  const sessionLedger = options.sessionBindings !== undefined
    ? {
        bindings: options.sessionBindings,
        source_ref: options.sessionSourceRef ?? 'in-memory-execution-session-fixture',
        diagnostics: [] as WorkItemProjectionV2['diagnostics']['items'],
      }
    : options.attempts
      ? {
          bindings: [] as WorkItemExecutionSessionBinding[],
          source_ref: options.sessionSourceRef ?? 'in-memory-execution-session-fixture',
          diagnostics: [] as WorkItemProjectionV2['diagnostics']['items'],
        }
      : readWorkItemExecutionSessionBindings({ items: joined.items, now: options.now });
  diagnostics.push(...sessionLedger.diagnostics);
  const sessionJoined = joinSessionActivityToWorkItems({
    items: joined.items,
    bindings: [
      ...sessionLedger.bindings,
      ...deriveControlledExecutionSessionBindings({
        items: joined.items,
        attempts: ledger.attempts,
        queueDb: ledger.queue_db,
        now: options.now,
      }),
    ],
    sourceRef: sessionLedger.source_ref,
    now: options.now,
  }) as {
    items: WorkItemProjectionItem[];
    diagnostics: WorkItemProjectionV2['diagnostics']['items'];
  };
  diagnostics.push(...sessionJoined.diagnostics);
  const unsettledCasObservationByWorkspace = new Map<
    string,
    DomainArtifactCasMaterializationReadObservation
  >();
  for (const project of projectCatalog.projects) {
    const before = casObservationByWorkspace.get(project.workspace_path)!;
    const after = observeDomainArtifactCasMaterialization({ workspaceRoot: project.workspace_path });
    const unsettled = before.state !== 'clear'
      ? before
      : after.state !== 'clear'
        ? after
        : before.observed_generation !== after.observed_generation
          ? {
              ...after,
              state: 'sync_pending' as const,
              reason: 'workspace_cas_read_generation_changed' as const,
              observed_generation: `${before.observed_generation}->${after.observed_generation}`,
            }
          : null;
    if (!unsettled) continue;
    unsettledCasObservationByWorkspace.set(project.workspace_path, unsettled);
    diagnostics.push({
      reason: 'domain_artifact_cas_materialization_sync_pending',
      agent_id: project.agent_id,
      project_id: project.project_id,
      ref: unsettled.journal_refs[0] ?? unsettled.epoch_ref,
      details: {
        observation_state: unsettled.state,
        observation_reason: unsettled.reason,
        journal_refs: unsettled.journal_refs,
        observation_error: unsettled.error,
      },
    });
  }
  const items = sessionJoined.items
    .map((item) => withProjectedWorkItemPrimaryState({
      ...item,
      conditions: [...lifecycleConditions(item), ...item.conditions],
    }))
    .map((item) => {
      const unsettled = unsettledCasObservationByWorkspace.get(item.identity.workspace_path);
      return unsettled ? casSyncPendingItem(item, unsettled) : item;
    })
    .sort((left, right) =>
      left.identity.agent_id.localeCompare(right.identity.agent_id)
        || left.identity.project_display_name.localeCompare(right.identity.project_display_name)
        || left.identity.work_item_id.localeCompare(right.identity.work_item_id)
    );
  const exposedDiagnostics = profile === 'full' ? diagnostics : [];
  const { agents, availability } = buildAgentCatalog({
    profile,
    checkedAt: generatedAt,
    packageItems: options.packageProjectionItems,
    packageStatusById: options.packageStatusById,
    descriptorByAgent: descriptorCache,
  });
  const visibleItems = items.filter((item) => item.visibility.state === 'visible');
  const archivedItemCount = items.length - visibleItems.length;

  return {
    surface_kind: 'opl_work_item_projection',
    schema_version: 'work-item-projection.v2',
    profile,
    generated_at: generatedAt,
    agent_catalog: agents,
    agent_availability: availability,
    project_catalog: projectCatalog.projects,
    identity_health: joined.identity_health,
    unresolved_executions: profile === 'full' ? joined.unresolved_executions : [],
    summary: {
      agent_count: agents.length,
      project_count: projectCatalog.projects.length,
      work_item_count: visibleItems.length,
      visible_work_item_count: visibleItems.length,
      archived_work_item_count: archivedItemCount,
      total_work_item_count: items.length,
      running_count: visibleItems.filter((item) => item.execution.state === 'running').length,
      active_session_count: visibleItems.reduce(
        (total, item) => total + item.session_activity.active_session_count,
        0,
      ),
      user_attention_count: visibleItems.filter((item) => item.attention.kind === 'user').length,
      system_attention_count: visibleItems.filter((item) => item.attention.kind === 'system').length,
      telemetry_observed_count: visibleItems.filter((item) => item.telemetry.cumulative.state === 'observed').length,
      telemetry_missing_count: visibleItems.filter((item) => item.telemetry.cumulative.state === 'missing').length,
    },
    items,
    diagnostics: {
      count: diagnostics.length,
      items: exposedDiagnostics,
      detail_policy: profile === 'full' ? 'included' : 'summary_only',
    },
    detail_policy: {
      all_work_item_summaries_included: true,
      attempt_ref_limit_per_item: profile === 'fast' ? 1 : 8,
      diagnostic_details: profile === 'fast' ? 'lazy' : 'included',
      inventory_detail: 'included',
      full_detail_surface: 'opl app state --profile full --json',
    },
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      temporal_is_work_item_inventory: false,
    },
  };
}
