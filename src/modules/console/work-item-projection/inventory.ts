import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import type { StandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import { readStandardAgentDescriptorForDomain } from '../../connect/index.ts';
import { deriveWorkItemScopeId } from '../../workspace/public/app-state.ts';
import { projectDomainDetailViewLocators } from '../domain-detail-view-locator.ts';
import type {
  ProjectCatalogEntry,
  WorkItemBusinessState,
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
} from './types.ts';
import {
  projectInventoryAction,
  readStageIndexPresentation,
} from './inventory-presentation.ts';
import { readAgentStageCatalog } from './inventory-stage-catalog.ts';
import { projectWorkItemPrimaryState } from './primary-state.ts';

export type InventoryDescriptorResolver = (agentId: string) => StandardAgentDescriptorInterface | null;

const BUSINESS_STATE_BY_STATUS = new Map<string, WorkItemBusinessState>([
  ['active', 'active'],
  ['in_progress', 'active'],
  ['ready', 'active'],
  ['registered', 'active'],
  ['running', 'active'],
  ['delivered', 'delivered_paused'],
  ['delivered_paused', 'delivered_paused'],
  ['submission_ready', 'delivered_paused'],
  ['publication_ready', 'delivered_paused'],
  ['completed', 'delivered_paused'],
  ['succeeded', 'delivered_paused'],
  ['paused', 'paused'],
  ['parked', 'paused'],
  ['frozen', 'paused'],
  ['on_hold', 'paused'],
  ['stopped', 'stopped'],
  ['abandoned', 'stopped'],
  ['cancelled', 'stopped'],
  ['rejected', 'stopped'],
  ['terminated', 'stopped'],
  ['archived', 'archived'],
]);

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') ?? null;
}

function jsonPointer(value: unknown, pointer: string) {
  let current = value;
  for (const rawSegment of pointer.replace(/^\//, '').split('/').filter(Boolean)) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }
  return current;
}

function descendant(root: string, relativePath: string | null) {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function generation(value: JsonRecord) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function sourceValue(item: JsonRecord, field: string) {
  return item[field];
}

function emptyExecution(input: {
  currentStageId: string | null;
  currentStageDisplayName: string | null;
  nextStageId: string | null;
  nextStageDisplayName: string | null;
}): WorkItemProjectionItem['execution'] {
  return {
    state: 'idle',
    stage_id: null,
    stage_status: null,
    current_stage_id: input.currentStageId,
    current_stage_display_name: input.currentStageDisplayName,
    next_stage_id: input.nextStageId,
    next_stage_display_name: input.nextStageDisplayName,
    attempt_id: null,
    attempt_ids: [],
    workflow_id: null,
    provider_kind: null,
    started_at: null,
    last_heartbeat_at: null,
    updated_at: null,
    running_proof_status: 'not_applicable',
    diagnostic_reason: null,
    quality_budget: {
      state: 'not_managed',
      scope_id: null,
      max_attempts: null,
      attempts_used: 0,
      attempts_remaining: null,
      max_elapsed_ms: null,
      elapsed_ms: null,
      max_tokens: null,
      tokens_used: null,
      token_observation_status: 'not_applicable',
      stop_reason: null,
    },
  };
}

function missingToken(reason: string): WorkItemProjectionItem['telemetry']['current_stage'] {
  return {
    state: 'missing',
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    observed_at: null,
    missing_reason: reason,
    source_refs: [],
  };
}

export function readProjectInventory(input: {
  project: ProjectCatalogEntry;
  resolveDescriptor?: InventoryDescriptorResolver;
}) {
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const descriptor = (input.resolveDescriptor ?? readStandardAgentDescriptorForDomain)(input.project.agent_id);
  const stageCatalog = readAgentStageCatalog({
    agentRepoDir: descriptor?.repo_dir ?? '',
    declaration: descriptor?.interface.stage_catalog ?? null,
  });
  diagnostics.push(...stageCatalog.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    agent_id: input.project.agent_id,
    project_id: input.project.project_id,
  })));
  const declaration = descriptor?.interface.inventory_projection;
  if (!declaration) {
    diagnostics.push({
      reason: 'inventory_projection_not_declared',
      agent_id: input.project.agent_id,
      project_id: input.project.project_id,
    });
    return { items: [] as WorkItemProjectionItem[], diagnostics };
  }
  const inventoryPath = descendant(input.project.workspace_path, declaration.relative_path);
  if (!inventoryPath || !fs.existsSync(inventoryPath)) {
    diagnostics.push({
      reason: 'inventory_projection_source_missing',
      agent_id: input.project.agent_id,
      project_id: input.project.project_id,
      ref: inventoryPath ?? declaration.relative_path,
    });
    return { items: [] as WorkItemProjectionItem[], diagnostics };
  }
  const payload = readJsonFileOrNull(inventoryPath);
  const sourceItems = jsonPointer(payload, declaration.items_pointer);
  if (!Array.isArray(sourceItems)) {
    diagnostics.push({
      reason: 'inventory_projection_items_pointer_invalid',
      agent_id: input.project.agent_id,
      project_id: input.project.project_id,
      ref: `${inventoryPath}#${declaration.items_pointer}`,
    });
    return { items: [] as WorkItemProjectionItem[], diagnostics };
  }
  const inventoryObservedAt = fs.statSync(inventoryPath).mtime.toISOString();
  const items: WorkItemProjectionItem[] = [];
  const seen = new Set<string>();
  for (const [index, rawItem] of sourceItems.entries()) {
    if (!isRecord(rawItem)) {
      diagnostics.push({
        reason: 'inventory_projection_item_not_object',
        project_id: input.project.project_id,
        ref: `${inventoryPath}#${declaration.items_pointer}/${index}`,
      });
      continue;
    }
    const fieldMap = declaration.field_map;
    const workItemId = stringValue(sourceValue(rawItem, fieldMap.work_item_id));
    if (!workItemId || seen.has(workItemId)) {
      diagnostics.push({
        reason: workItemId ? 'inventory_projection_duplicate_work_item_id' : 'inventory_projection_work_item_id_missing',
        project_id: input.project.project_id,
        work_item_id: workItemId ?? undefined,
        ref: `${inventoryPath}#${declaration.items_pointer}/${index}`,
      });
      continue;
    }
    seen.add(workItemId);
    const workItemRootRelative = stringValue(sourceValue(rawItem, fieldMap.work_item_root));
    const displayName = fieldMap.display_name
      ? stringValue(sourceValue(rawItem, fieldMap.display_name)) ?? workItemId
      : workItemId;
    const workItemRoot = descendant(input.project.workspace_path, workItemRootRelative);
    const lifecycleRefRelative = stringValue(sourceValue(rawItem, fieldMap.lifecycle_ref));
    const lifecycleRef = descendant(workItemRoot ?? input.project.workspace_path, lifecycleRefRelative);
    const rawBusinessStatus = normalizedStatus(sourceValue(rawItem, fieldMap.business_status));
    const currentStageId = stringValue(sourceValue(rawItem, fieldMap.current_stage_id));
    const currentStageStatus = normalizedStatus(sourceValue(rawItem, fieldMap.current_stage_status));
    const packageStatus = normalizedStatus(sourceValue(rawItem, fieldMap.package_status));
    const rawNextAction = fieldMap.next_action
      ? sourceValue(rawItem, fieldMap.next_action)
      : undefined;
    const stageIndexRef = fieldMap.stage_index_ref
      ? stringValue(sourceValue(rawItem, fieldMap.stage_index_ref))
      : null;
    const mapped = {
      work_item_id: workItemId,
      display_name: displayName,
      work_item_root: workItemRootRelative,
      business_status: rawBusinessStatus,
      current_stage_id: currentStageId,
      current_stage_status: currentStageStatus,
      package_status: packageStatus,
      lifecycle_ref: lifecycleRefRelative,
      next_action: rawNextAction ?? null,
      stage_index_ref: stageIndexRef,
    };
    const observedGeneration = generation(mapped);
    const itemId = `${input.project.project_id}:${encodeURIComponent(workItemId)}`;
    const workItemScopeId = deriveWorkItemScopeId({
      projectScopeId: input.project.scope_id,
      domainId: input.project.domain_id,
      domainWorkItemId: workItemId,
    });
    const missingReason = 'no_stage_attempt_usage_telemetry_observed';
    const domainBusinessState = rawBusinessStatus
      ? BUSINESS_STATE_BY_STATUS.get(rawBusinessStatus) ?? 'unknown'
      : 'unknown';
    const userDecisionRequired = domainBusinessState === 'active'
      && ['human_gate', 'owner_decision_required', 'waiting_for_user', 'needs_user_decision'].includes(currentStageStatus ?? '');
    const attention: WorkItemProjectionItem['attention'] = {
      kind: userDecisionRequired
        ? 'user'
        : 'none',
      reason: userDecisionRequired
        ? 'domain_lifecycle_requires_user_decision'
        : 'no_current_action_required',
      owner: userDecisionRequired
        ? 'user'
        : null,
      responsible_component: null,
      issue: null,
      impact: null,
      repair_action: null,
      expected_outcome: null,
    };
    const actionProjection = projectInventoryAction({
      rawAction: rawNextAction,
      businessState: domainBusinessState,
      agentId: input.project.agent_id,
      agentDisplayName: input.project.agent_display_name,
    });
    if (actionProjection.diagnostic) {
      diagnostics.push({
        reason: actionProjection.diagnostic,
        agent_id: input.project.agent_id,
        project_id: input.project.project_id,
        work_item_id: workItemId,
        ref: `${inventoryPath}#${declaration.items_pointer}/${index}`,
      });
    }
    const stagePresentation = readStageIndexPresentation({
      workItemRoot,
      stageIndexRef,
      businessState: domainBusinessState,
      currentStageId,
      agentId: input.project.agent_id,
      agentDisplayName: input.project.agent_display_name,
      stageCatalog: stageCatalog.entries,
    });
    diagnostics.push(...stagePresentation.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      agent_id: input.project.agent_id,
      project_id: input.project.project_id,
      work_item_id: workItemId,
    })));
    items.push({
      item_id: itemId,
      identity: {
        agent_id: input.project.agent_id,
        agent_display_name: input.project.agent_display_name,
        domain_id: input.project.domain_id,
        project_id: input.project.project_id,
        project_display_name: input.project.display_name,
        project_scope_id: input.project.scope_id,
        workspace_binding_id: input.project.selected_binding_id,
        workspace_path: input.project.workspace_path,
        work_item_id: workItemId,
        work_item_display_name: displayName,
        work_item_kind: descriptor.interface.workspace_binding.project_kind,
        work_item_root: workItemRoot,
        work_item_scope_id: workItemScopeId,
        source_kind: 'domain_inventory',
      },
      lifecycle: {
        business_state: domainBusinessState,
        domain_business_state: domainBusinessState,
        control_state: null,
        ...projectWorkItemPrimaryState({
          businessState: domainBusinessState,
          attention,
          lastTransitionAt: inventoryObservedAt,
        }),
        raw_business_status: rawBusinessStatus,
        current_stage_id: stagePresentation.current_stage_id,
        current_stage_display_name: stagePresentation.current_stage_display_name,
        current_stage_status: currentStageStatus,
        package_status: packageStatus,
        lifecycle_ref: lifecycleRef,
        source: 'domain_inventory_projection',
        control_ref: null,
        control_updated_at: null,
        observed_generation: observedGeneration,
      },
      visibility: {
        state: 'visible',
        source: 'default',
        updated_at: null,
        control_ref: null,
        generation: 0,
      },
      execution: emptyExecution({
        currentStageId: stagePresentation.current_stage_id,
        currentStageDisplayName: stagePresentation.current_stage_display_name,
        nextStageId: stagePresentation.next_stage_id,
        nextStageDisplayName: stagePresentation.next_stage_display_name,
      }),
      session_activity: {
        state: 'inactive',
        active_session_count: 0,
        coordination_session_count: 0,
        controlled_execution_session_count: 0,
        active_session_refs: [],
        nonterminal_session_refs: [],
        session_sequences: {},
        latest_session_ref: null,
        latest_activity_kind: null,
        latest_activity_state: null,
        latest_activity_at: null,
        fresh_until: null,
        label_key: 'runtimeSessionActivity.inactive',
        label_args: { active_session_count: 0 },
        source: 'opl_work_item_execution_session_binding_ledger',
        can_affect_execution: false,
        execution_effect_reason: null,
      },
      attention,
      telemetry: {
        state: 'missing',
        current_stage: missingToken(
          stagePresentation.current_stage_id ? missingReason : 'current_stage_not_applicable',
        ),
        cumulative: missingToken(missingReason),
        missing_reason: missingReason,
      },
      action: actionProjection.action,
      stage_map: stagePresentation.stage_map,
      domain_detail_views: projectDomainDetailViewLocators({
        itemId,
        workItemRoot,
        declarations: descriptor.interface.domain_detail_views,
      }),
      conditions: [],
      freshness: {
        state: 'current',
        inventory_observed_at: inventoryObservedAt,
        execution_observed_at: null,
        last_transition_time: inventoryObservedAt,
        observed_generation: observedGeneration,
        reason: 'domain_inventory_projection_read_currently',
      },
      source_refs: [
        ...input.project.source_refs,
        {
          ref_kind: 'file',
          ref: `${inventoryPath}#${declaration.items_pointer}/${index}`,
          role: 'domain_work_item_inventory',
        },
        ...(lifecycleRef ? [{ ref_kind: 'file' as const, ref: lifecycleRef, role: 'domain_lifecycle_ref' }] : []),
        ...(stagePresentation.source_ref
          ? [{ ref_kind: 'file' as const, ref: stagePresentation.source_ref, role: 'domain_stage_index' }]
          : []),
        ...(stageCatalog.entries && stageCatalog.source_ref
          ? [{ ref_kind: 'file' as const, ref: stageCatalog.source_ref, role: 'agent_stage_catalog' }]
          : []),
      ],
    });
  }
  return { items, diagnostics };
}
