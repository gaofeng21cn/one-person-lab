import {
  record,
  recordList,
  stringList,
  stringValue as optionalString,
} from '../../../kernel/json-record.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type EnqueueInput,
  type FamilyRuntimeDomainId,
} from '../family-runtime-command.ts';

export type PendingTaskExportContext = {
  cwd: string;
  source: string;
  owner_fingerprint: string;
};

function isFamilyRuntimeDomainId(value: string): value is FamilyRuntimeDomainId {
  return FAMILY_RUNTIME_DOMAIN_IDS.includes(value as FamilyRuntimeDomainId);
}

function canonicalFamilyRuntimeDomainId(value: unknown): FamilyRuntimeDomainId | null {
  const raw = optionalString(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const aliases: Record<string, FamilyRuntimeDomainId> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    med_autoscience: 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-auto-grant': 'medautogrant',
    'med-autogrant': 'medautogrant',
    med_auto_grant: 'medautogrant',
    med_autogrant: 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
    oma: 'opl-meta-agent',
    oplmetaagent: 'opl-meta-agent',
    'opl-meta-agent': 'opl-meta-agent',
    opl_meta_agent: 'opl-meta-agent',
  };
  return aliases[normalized] ?? null;
}

function taskPayloadFrom(item: Record<string, unknown>) {
  return record(item.payload);
}

function taskPayloadBlockedByForbiddenWrite(payload: Record<string, unknown>) {
  return payload.domain_truth_write === true || payload.artifact_gate_override === true;
}

function explicitRefFromRecord(value: unknown) {
  const recordValue = recordList([value])[0];
  if (!recordValue) {
    return null;
  }
  for (const key of ['ref', 'route_ref', 'owner_route_ref', 'handoff_ref']) {
    const ref = optionalString(recordValue[key]);
    if (ref) {
      return ref;
    }
  }
  return null;
}

function ownerRouteRefsFrom(item: Record<string, unknown>) {
  return [...new Set([
    ...stringList(item.owner_route_refs),
    optionalString(item.owner_route_ref),
    explicitRefFromRecord(item.owner_route),
  ].filter((entry): entry is string => Boolean(entry)))];
}

function handoffPayloadFrom(item: Record<string, unknown>) {
  const handoff = recordList([item.opl_runtime_owner_route_handoff])[0]
    ?? recordList([item.owner_route_handoff])[0]
    ?? null;
  if (!handoff) {
    return {};
  }
  return {
    opl_runtime_owner_route_handoff: handoff,
  };
}

function domainDispatchEvidencePayloadFrom(item: Record<string, unknown>) {
  const payload = recordList([item.domain_dispatch_evidence_record_payload])[0];
  return payload
    ? { domain_dispatch_evidence_record_payload: payload }
    : {};
}

function pendingTaskInputFrom(
  domainId: FamilyRuntimeDomainId,
  item: Record<string, unknown>,
  source: string,
  exportContext: PendingTaskExportContext,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  const declaredDomain = typeof item.domain_id === 'string' ? item.domain_id : domainId;
  const exportedDomain = canonicalFamilyRuntimeDomainId(declaredDomain);
  const taskKind = optionalString(item.task_kind) ?? optionalString(item.recommended_task_kind) ?? '';
  const payload = taskPayloadFrom(item);
  if (!exportedDomain || !isFamilyRuntimeDomainId(exportedDomain) || !taskKind) {
    return { blocked: { reason: 'invalid_domain_or_task_kind', task: item } };
  }
  if (taskPayloadBlockedByForbiddenWrite(payload)) {
    return { blocked: { reason: 'domain_forbidden_write', task: item } };
  }
  const ownerRouteRefs = ownerRouteRefsFrom(item);
  return {
    input: {
      domainId: exportedDomain,
      taskKind,
      payload: {
        ...payload,
        ...(typeof item.source_fingerprint === 'string' ? { source_fingerprint: item.source_fingerprint } : {}),
        ...(Array.isArray(item.source_refs) ? { source_refs: item.source_refs } : {}),
        ...(ownerRouteRefs.length > 0 ? { owner_route_refs: ownerRouteRefs } : {}),
        ...(Array.isArray(item.owner_receipt_refs) ? { owner_receipt_refs: item.owner_receipt_refs } : {}),
        ...(Array.isArray(item.typed_blocker_refs) ? { typed_blocker_refs: item.typed_blocker_refs } : {}),
        ...(typeof item.dispatch_owner === 'string' ? { dispatch_owner: item.dispatch_owner } : {}),
        ...(typeof item.profile_name === 'string' ? { profile_name: item.profile_name } : {}),
        ...(typeof item.domain_truth_owner === 'string' ? { domain_truth_owner: item.domain_truth_owner } : {}),
        ...(typeof item.queue_owner === 'string' ? { queue_owner: item.queue_owner } : {}),
        ...(typeof item.recommended_task_kind === 'string' ? { recommended_task_kind: item.recommended_task_kind } : {}),
        ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
        ...(typeof item.runtime_state_path === 'string' ? { runtime_state_path: item.runtime_state_path } : {}),
        ...domainDispatchEvidencePayloadFrom(item),
        opl_domain_export_context: {
          command_source: exportContext.source,
          owner_fingerprint: exportContext.owner_fingerprint,
          command_cwd: exportContext.cwd,
        },
        ...handoffPayloadFrom(item),
      },
      dedupeKey: typeof item.dedupe_key === 'string' ? item.dedupe_key : undefined,
      priority: Number.isInteger(item.priority) ? item.priority as number : 0,
      source: typeof item.source === 'string' ? item.source : source,
      requiresApproval: item.requires_approval === true,
    },
  };
}

export function toPendingTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
  exportContext: PendingTaskExportContext,
) {
  const tasks = Array.isArray(output.pending_family_tasks) ? output.pending_family_tasks : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const task of tasks) {
    const taskRecord = recordList([task])[0];
    if (!taskRecord) {
      blocked.push({ reason: 'invalid_pending_task', task });
      continue;
    }
    const result = pendingTaskInputFrom(domainId, taskRecord, source, exportContext);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}
