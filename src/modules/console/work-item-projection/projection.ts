import type { JsonRecord } from '../../../kernel/json-record.ts';
import { readStandardAgentDescriptorForDomain } from '../../connect/index.ts';
import { buildWorkItemControlResolver } from '../../ledger/index.ts';
import { listWorkspaceBindings, type WorkspaceBinding } from '../../workspace/public/app-state.ts';
import { buildAgentCatalog, buildProjectCatalog } from './catalog.ts';
import {
  applyWorkItemControlState,
  type WorkItemControlResolver,
} from './control.ts';
import { joinAttemptsToWorkItems, readWorkItemStageAttempts } from './execution.ts';
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

export type BuildWorkItemProjectionV2Options = {
  profile?: 'fast' | 'full';
  packageProjectionItems?: ReadonlyArray<JsonRecord>;
  packageStatusById?: Readonly<Record<string, JsonRecord>>;
  bindings?: ReadonlyArray<WorkspaceBinding>;
  attempts?: JsonRecord[];
  queueDb?: string;
  resolveDescriptor?: InventoryDescriptorResolver;
  findWorkItemControl?: WorkItemControlResolver;
  generatedAt?: string;
};

export function buildWorkItemProjectionV2(
  options: BuildWorkItemProjectionV2Options = {},
): WorkItemProjectionV2 {
  const profile = options.profile ?? 'full';
  const generatedAt = options.generatedAt ?? nowIso();
  const projectCatalog = buildProjectCatalog(options.bindings ?? listWorkspaceBindings());
  const inventoryItems: WorkItemProjectionItem[] = [];
  const diagnostics = [...projectCatalog.diagnostics];
  const descriptorCache = new Map<string, ReturnType<InventoryDescriptorResolver>>();
  const descriptorResolver = options.resolveDescriptor ?? readStandardAgentDescriptorForDomain;
  const resolveDescriptor = (agentId: string) => {
    if (!descriptorCache.has(agentId)) {
      descriptorCache.set(agentId, descriptorResolver(agentId));
    }
    return descriptorCache.get(agentId) ?? null;
  };
  for (const project of projectCatalog.projects) {
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
    ? { queue_db: options.queueDb ?? 'in-memory-stage-attempt-fixture', attempts: options.attempts, diagnostics: [] }
    : readWorkItemStageAttempts();
  diagnostics.push(...ledger.diagnostics);
  const joined = joinAttemptsToWorkItems({
    items: controlled.items,
    projects: projectCatalog.projects,
    attempts: ledger.attempts,
    queueDb: ledger.queue_db,
    attemptRefLimit: profile === 'fast' ? 1 : 8,
  });
  diagnostics.push(...joined.diagnostics);
  const items = joined.items
    .map((item) => withProjectedWorkItemPrimaryState({
      ...item,
      conditions: [...lifecycleConditions(item), ...item.conditions],
    }))
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

  return {
    surface_kind: 'opl_work_item_projection',
    schema_version: 'work-item-projection.v2',
    profile,
    generated_at: generatedAt,
    agent_catalog: agents,
    agent_availability: availability,
    project_catalog: projectCatalog.projects,
    summary: {
      agent_count: agents.length,
      project_count: projectCatalog.projects.length,
      work_item_count: items.length,
      running_count: items.filter((item) => item.execution.state === 'running').length,
      user_attention_count: items.filter((item) => item.attention.kind === 'user').length,
      system_attention_count: items.filter((item) => item.attention.kind === 'system').length,
      telemetry_observed_count: items.filter((item) => item.telemetry.cumulative.state === 'observed').length,
      telemetry_missing_count: items.filter((item) => item.telemetry.cumulative.state === 'missing').length,
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
