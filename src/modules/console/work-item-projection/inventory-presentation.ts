import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import type {
  WorkItemActionKind,
  WorkItemBusinessState,
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
  WorkItemStageState,
} from './types.ts';

const ACTION_KINDS = new Set<WorkItemActionKind>([
  'user_action',
  'system_action',
  'agent_action',
  'safe_action',
  'blocked_no_action',
]);
const COMPLETED_STAGE_STATUSES = new Set([
  'completed',
  'receipt_recorded',
  'succeeded',
  'delivered',
  'accepted',
]);
const FAILED_STAGE_STATUSES = new Set(['typed_blocked', 'blocked', 'failed', 'error']);
const USER_STAGE_STATUSES = new Set([
  'human_gate',
  'owner_decision_required',
  'waiting_for_user',
  'needs_user_decision',
]);

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') ?? 'unknown';
}

function descendant(root: string, relativePath: string | null) {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function humanizeIdentifier(value: string) {
  const withoutOrdinal = value.replace(/^\d+[._-]*/, '');
  const words = withoutOrdinal.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return value;
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function ownerDisplayName(owner: string, agentId: string, agentDisplayName: string) {
  const normalized = owner.toLowerCase();
  if (['user', 'human', 'owner'].includes(normalized)) return '你';
  if (['system', 'opl_framework', 'opl-framework'].includes(normalized)) return 'OPL Framework';
  if (normalized === agentId.toLowerCase()) return agentDisplayName;
  return owner;
}

function lifecycleAction(input: {
  businessState: WorkItemBusinessState;
  agentId: string;
  agentDisplayName: string;
}): WorkItemProjectionItem['action'] {
  const byState: Record<WorkItemBusinessState, Omit<WorkItemProjectionItem['action'], 'owner_display_name'>> = {
    active: {
      kind: 'agent_action',
      title: '继续推进',
      summary: `由 ${input.agentDisplayName} 按当前计划继续推进。`,
      owner: input.agentId,
      action_ref: 'lifecycle:active',
      dry_run_required: false,
    },
    delivered_paused: {
      kind: 'user_action',
      title: '补齐投稿信息或发起修订',
      summary: '里程碑交付已完成；补齐投稿信息，或在需要修订时重新启动。',
      owner: 'user',
      action_ref: 'lifecycle:delivered_paused',
      dry_run_required: false,
    },
    paused: {
      kind: 'user_action',
      title: '等待明确后续方向',
      summary: '当前不会自动继续；明确后续方向后可重新启动。',
      owner: 'user',
      action_ref: 'lifecycle:paused',
      dry_run_required: false,
    },
    stopped: {
      kind: 'blocked_no_action',
      title: '当前不再推进',
      summary: '该任务已停止；只有显式重新启动后才会继续。',
      owner: 'user',
      action_ref: 'lifecycle:stopped',
      dry_run_required: false,
    },
    archived: {
      kind: 'blocked_no_action',
      title: '已归档',
      summary: '该任务已归档，当前没有后续动作。',
      owner: 'user',
      action_ref: 'lifecycle:archived',
      dry_run_required: false,
    },
    unknown: {
      kind: 'blocked_no_action',
      title: '等待状态同步',
      summary: '当前业务状态不完整，需要先由所属智能体同步。',
      owner: input.agentId,
      action_ref: 'lifecycle:unknown',
      dry_run_required: false,
    },
  };
  const projected = byState[input.businessState];
  return {
    ...projected,
    owner_display_name: ownerDisplayName(projected.owner, input.agentId, input.agentDisplayName),
  };
}

export function projectLifecycleAction(input: {
  businessState: WorkItemBusinessState;
  agentId: string;
  agentDisplayName: string;
}) {
  return lifecycleAction(input);
}

export function projectInventoryAction(input: {
  rawAction: unknown;
  businessState: WorkItemBusinessState;
  agentId: string;
  agentDisplayName: string;
}) {
  const fallback = lifecycleAction(input);
  if (input.rawAction === undefined || input.rawAction === null) {
    return { action: fallback, diagnostic: null };
  }
  const raw = isRecord(input.rawAction) ? input.rawAction : null;
  const scalarSummary = stringValue(input.rawAction);
  const summary = scalarSummary
    ?? stringValue(raw?.summary)
    ?? stringValue(raw?.title);
  if (!summary) {
    return { action: fallback, diagnostic: 'inventory_next_action_invalid' };
  }
  const declaredKind = stringValue(raw?.kind) ?? stringValue(raw?.action_type);
  const kind = declaredKind && ACTION_KINDS.has(declaredKind as WorkItemActionKind)
    ? declaredKind as WorkItemActionKind
    : fallback.kind;
  const owner = stringValue(raw?.owner) ?? fallback.owner;
  const title = stringValue(raw?.title) ?? fallback.title;
  return {
    action: {
      kind,
      title,
      summary,
      owner,
      owner_display_name: stringValue(raw?.owner_display_name)
        ?? ownerDisplayName(owner, input.agentId, input.agentDisplayName),
      action_ref: stringValue(raw?.action_ref)
        ?? stringValue(raw?.action_id)
        ?? stringValue(raw?.surface_kind)
        ?? fallback.action_ref,
      dry_run_required: typeof raw?.dry_run_required === 'boolean'
        ? raw.dry_run_required
        : kind === 'system_action' || kind === 'safe_action',
    },
    diagnostic: declaredKind && !ACTION_KINDS.has(declaredKind as WorkItemActionKind)
      ? 'inventory_next_action_kind_unsupported'
      : null,
  };
}

function rawStageNextAction(stage: JsonRecord) {
  const value = stage.next_action;
  if (isRecord(value)) return stringValue(value.summary) ?? stringValue(value.title);
  return stringValue(value);
}

function projectStageState(input: {
  businessState: WorkItemBusinessState;
  currentIndex: number;
  lastRecordedIndex: number;
  index: number;
  status: string;
  firstPendingIndex: number;
}): WorkItemStageState {
  if (input.businessState === 'delivered_paused') {
    if (COMPLETED_STAGE_STATUSES.has(input.status) || input.index <= input.lastRecordedIndex) return 'completed';
    return FAILED_STAGE_STATUSES.has(input.status) ? 'stopped' : 'pending';
  }
  if (input.businessState === 'paused') {
    if (COMPLETED_STAGE_STATUSES.has(input.status)) return 'completed';
    return FAILED_STAGE_STATUSES.has(input.status) ? 'stopped' : 'pending';
  }
  if (input.businessState === 'stopped' || input.businessState === 'archived') {
    return COMPLETED_STAGE_STATUSES.has(input.status) ? 'completed' : 'stopped';
  }
  if (input.businessState === 'unknown') {
    return COMPLETED_STAGE_STATUSES.has(input.status) ? 'completed' : 'pending';
  }
  if (input.currentIndex >= 0) {
    if (input.index < input.currentIndex) return 'completed';
    if (input.index === input.currentIndex) {
      if (USER_STAGE_STATUSES.has(input.status)) return 'waiting_user';
      if (FAILED_STAGE_STATUSES.has(input.status)) return 'failed';
      return 'current';
    }
    return input.index === input.currentIndex + 1 ? 'next' : 'pending';
  }
  if (COMPLETED_STAGE_STATUSES.has(input.status)) return 'completed';
  return input.index === input.firstPendingIndex ? 'next' : 'pending';
}

export function readStageIndexPresentation(input: {
  workItemRoot: string | null;
  stageIndexRef: string | null;
  businessState: WorkItemBusinessState;
  currentStageId: string | null;
  agentId: string;
  agentDisplayName: string;
}): {
  stage_map: WorkItemProjectionItem['stage_map'];
  current_stage_id: string | null;
  current_stage_display_name: string | null;
  next_stage_id: string | null;
  next_stage_display_name: string | null;
  source_ref: string | null;
  diagnostics: WorkItemProjectionDiagnostic[];
} {
  const terminal = input.businessState !== 'active';
  const fallbackCurrentStageId = terminal ? null : input.currentStageId;
  const empty = {
    stage_map: [],
    current_stage_id: fallbackCurrentStageId,
    current_stage_display_name: fallbackCurrentStageId ? humanizeIdentifier(fallbackCurrentStageId) : null,
    next_stage_id: null,
    next_stage_display_name: null,
    source_ref: null,
    diagnostics: [] as WorkItemProjectionDiagnostic[],
  };
  if (!input.stageIndexRef) return empty;
  if (!input.workItemRoot) {
    return {
      ...empty,
      diagnostics: [{ reason: 'stage_index_work_item_root_missing', ref: input.stageIndexRef }],
    };
  }
  const stageIndexPath = descendant(input.workItemRoot, input.stageIndexRef);
  if (!stageIndexPath) {
    return {
      ...empty,
      diagnostics: [{ reason: 'stage_index_ref_escapes_work_item_root', ref: input.stageIndexRef }],
    };
  }
  if (!fs.existsSync(stageIndexPath)) {
    return {
      ...empty,
      diagnostics: [{ reason: 'stage_index_source_missing', ref: stageIndexPath }],
    };
  }
  const payload = readJsonFileOrNull(stageIndexPath);
  if (!isRecord(payload) || !Array.isArray(payload.stages)) {
    return {
      ...empty,
      source_ref: stageIndexPath,
      diagnostics: [{ reason: 'stage_index_shape_invalid', ref: stageIndexPath }],
    };
  }
  const stageRecords = payload.stages.filter(isRecord).flatMap((stage) => {
    const stageId = stringValue(stage.stage_id);
    return stageId ? [{ stage, stageId, status: normalizedStatus(stage.status) }] : [];
  });
  const payloadCurrentStage = isRecord(payload.current_stage)
    ? stringValue(payload.current_stage.stage_id)
    : stringValue(payload.current_stage);
  const currentStageId = terminal
    ? null
    : input.currentStageId ?? stringValue(payload.current_stage_id) ?? payloadCurrentStage;
  const currentIndex = currentStageId
    ? stageRecords.findIndex((entry) => entry.stageId === currentStageId)
    : -1;
  const lastRecordedStageId = stringValue(payload.last_recorded_stage_id);
  const lastRecordedIndex = lastRecordedStageId
    ? stageRecords.findIndex((entry) => entry.stageId === lastRecordedStageId)
    : -1;
  const projectedStageRecords = input.businessState === 'delivered_paused' && lastRecordedIndex >= 0
    ? stageRecords.slice(0, lastRecordedIndex + 1)
    : stageRecords;
  const firstPendingIndex = projectedStageRecords.findIndex(
    (entry) => !COMPLETED_STAGE_STATUSES.has(entry.status),
  );
  const stageMap = projectedStageRecords.map(({ stage, stageId, status }, index) => {
    const owner = stringValue(stage.owner) ?? input.agentId;
    return {
      stage_id: stageId,
      display_name: stringValue(stage.display_name) ?? stringValue(stage.title) ?? humanizeIdentifier(stageId),
      state: projectStageState({
        businessState: input.businessState,
        currentIndex,
        lastRecordedIndex,
        index,
        status,
        firstPendingIndex,
      }),
      owner,
      owner_display_name: stringValue(stage.owner_display_name)
        ?? ownerDisplayName(owner, input.agentId, input.agentDisplayName),
      elapsed_seconds: null,
      usage: null,
      next_action: rawStageNextAction(stage),
    } satisfies WorkItemProjectionItem['stage_map'][number];
  });
  const currentStage = currentStageId
    ? stageMap.find((stage) => stage.stage_id === currentStageId) ?? null
    : null;
  const nextStage = currentIndex >= 0
    ? stageMap[currentIndex + 1] ?? null
    : stageMap.find((stage) => stage.state === 'next') ?? null;
  const invalidStageCount = payload.stages.length - stageRecords.length;
  const stageDiagnostics: WorkItemProjectionDiagnostic[] = [];
  if (invalidStageCount > 0) {
    stageDiagnostics.push({
      reason: 'stage_index_stage_entries_invalid',
      ref: stageIndexPath,
      details: { invalid_stage_count: invalidStageCount },
    });
  }
  if (input.businessState === 'delivered_paused' && !lastRecordedStageId) {
    stageDiagnostics.push({
      reason: 'stage_index_last_recorded_stage_id_missing',
      ref: stageIndexPath,
    });
  } else if (input.businessState === 'delivered_paused' && lastRecordedIndex < 0) {
    stageDiagnostics.push({
      reason: 'stage_index_last_recorded_stage_id_unresolved',
      ref: stageIndexPath,
      details: { last_recorded_stage_id: lastRecordedStageId },
    });
  }
  return {
    stage_map: stageMap,
    current_stage_id: currentStageId,
    current_stage_display_name: currentStage?.display_name
      ?? (currentStageId ? humanizeIdentifier(currentStageId) : null),
    next_stage_id: nextStage?.stage_id ?? null,
    next_stage_display_name: nextStage?.display_name ?? null,
    source_ref: stageIndexPath,
    diagnostics: stageDiagnostics,
  };
}

export function systemRepairAction(input: {
  itemId: string;
  responsibleComponent: string;
  issue: string;
  repairAction: string;
}): WorkItemProjectionItem['action'] {
  return {
    kind: 'system_action',
    title: input.repairAction,
    summary: input.issue,
    owner: input.responsibleComponent,
    owner_display_name: ownerDisplayName(input.responsibleComponent, '', ''),
    action_ref: `system-repair:${input.itemId}`,
    dry_run_required: true,
  };
}
