import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { buildOwnerPayloadWorkorder } from './owner-payload-workorder.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function uniqueSortedStrings(values: unknown[]) {
  return [...new Set(values.flatMap((value) => stringList(value)))].sort();
}

function firstStringValue(values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function requiredRefsForOwnerEntry(payloadGroups: JsonRecord[], dispatchGroups: JsonRecord[]) {
  return uniqueSortedStrings([
    ...payloadGroups.map((group) => group.required_refs_any_of),
    ...dispatchGroups.map((group) => group.required_operator_payload_refs),
    ...dispatchGroups.map((group) => group.sample_required_evidence_refs),
  ]);
}

export function buildOwnerHandoffPacket(input: {
  ownerPayloadGroups: JsonRecord[];
  domainDispatchGroupAttentionItems: JsonRecord[];
  evidenceEnvelopeAttentionCount: number;
  domainDispatchAttentionCount: number;
  itemLimit: number;
}) {
  const byOwner = new Map<string, {
    ownerPayloadGroups: JsonRecord[];
    dispatchGroups: JsonRecord[];
  }>();
  const entryFor = (owner: string) => {
    const existing = byOwner.get(owner);
    if (existing) {
      return existing;
    }
    const entry = {
      ownerPayloadGroups: [],
      dispatchGroups: [],
    };
    byOwner.set(owner, entry);
    return entry;
  };
  for (const group of input.ownerPayloadGroups) {
    const owner = stringValue(group.owner) ?? 'domain_repository_or_app_live_operator';
    entryFor(owner).ownerPayloadGroups.push(group);
  }
  for (const group of input.domainDispatchGroupAttentionItems) {
    const owner =
      stringValue(group.canonical_domain_id)
      ?? stringValue(group.domain_id)
      ?? stringValue(group.payload_owner)
      ?? 'domain_repository_or_app_live_operator';
    entryFor(owner).dispatchGroups.push(group);
  }

  const allOwners = [...byOwner.entries()].map(([owner, groups]) => {
    const openEnvelopeCount = groups.ownerPayloadGroups.reduce(
      (total, group) => total + numberValue(group.open_envelope_count),
      0,
    );
    const blockedEnvelopeCount = groups.ownerPayloadGroups.reduce(
      (total, group) => total + numberValue(group.blocked_envelope_count),
      0,
    );
    const dispatchAttentionCount = groups.dispatchGroups.reduce(
      (total, group) => total + numberValue(group.workorder_count),
      0,
    );
    const ownerPayloadAttentionCount = groups.ownerPayloadGroups.reduce(
      (total, group) => total + numberValue(group.attention_count),
      0,
    );
    const attentionCount = ownerPayloadAttentionCount + dispatchAttentionCount;
    const acceptedPayloadPaths = record(
      groups.dispatchGroups.find((group) =>
        Object.keys(record(group.accepted_payload_paths)).length > 0
      )?.accepted_payload_paths,
    );
    const payloadPreflightPolicies = uniqueSortedStrings(
      groups.dispatchGroups.map((group) => [group.payload_preflight_policy]),
    );
    const fullDetailSections = uniqueSortedStrings([
      groups.ownerPayloadGroups.length > 0 ? ['evidence_envelope'] : [],
      groups.dispatchGroups.length > 0 ? ['domain_dispatch_evidence'] : [],
    ]);
    const payloadKinds = uniqueSortedStrings(
      groups.ownerPayloadGroups.map((group) => [group.payload_kind]),
    );
    const requiredRefsAnyOf = requiredRefsForOwnerEntry(
      groups.ownerPayloadGroups,
      groups.dispatchGroups,
    );
    const requiredReturnShapes = uniqueSortedStrings(
      groups.dispatchGroups.map((group) => group.required_return_shapes),
    );
    const ownerPayloadWorkorder = buildOwnerPayloadWorkorder({
      owner,
      payloadKinds,
      requiredRefsAnyOf,
      requiredReturnShapes,
      fullDetailSections,
    });
    const workorderAcceptedPayloadPaths = record(ownerPayloadWorkorder.accepted_payload_paths);
    const workorderPayloadPathPolicy = stringValue(ownerPayloadWorkorder.payload_path_policy);
    return {
      owner,
      status: attentionCount > 0 ? 'handoff_required' : 'clear',
      attention_count: attentionCount,
      open_envelope_count: openEnvelopeCount,
      blocked_envelope_count: blockedEnvelopeCount,
      owner_payload_group_count: groups.ownerPayloadGroups.length,
      domain_dispatch_group_count: groups.dispatchGroups.length,
      top_payload_kind: stringValue(groups.ownerPayloadGroups[0]?.payload_kind),
      top_stage_id: stringValue(groups.dispatchGroups[0]?.stage_id),
      payload_kinds: payloadKinds,
      stage_ids: uniqueSortedStrings(
        groups.dispatchGroups.map((group) => [group.stage_id]),
      ),
      required_refs_any_of: requiredRefsAnyOf,
      required_return_shapes: requiredReturnShapes,
      payload_path_policy: firstStringValue(
        groups.dispatchGroups.map((group) => group.payload_path_policy),
      ) ?? workorderPayloadPathPolicy,
      accepted_payload_paths: Object.keys(acceptedPayloadPaths).length > 0
        ? acceptedPayloadPaths
        : workorderAcceptedPayloadPaths,
      owner_payload_workorder: ownerPayloadWorkorder,
      empty_payload_template_is_success_evidence: false,
      payload_preflight_policy: payloadPreflightPolicies[0] ?? null,
      payload_preflight_policy_count: payloadPreflightPolicies.length,
      payload_preflight_blocked_error_kind: firstStringValue(
        groups.dispatchGroups.map((group) => group.payload_preflight_blocked_error_kind),
      ),
      full_detail_sections: fullDetailSections,
      payload_owner: 'domain_repository_or_app_live_operator',
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      authority_boundary: {
        can_execute_domain_action: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_close_owner_chain: false,
        can_close_domain_ready: false,
        can_claim_production_ready: false,
        can_authorize_quality_or_export: false,
        refs_only: true,
      },
    };
  })
    .filter((entry) => entry.attention_count > 0)
    .sort((left, right) => (
      right.attention_count - left.attention_count
      || right.open_envelope_count - left.open_envelope_count
      || right.blocked_envelope_count - left.blocked_envelope_count
      || String(left.owner).localeCompare(String(right.owner))
    ));
  const owners = allOwners.slice(0, input.itemLimit);
  return {
    surface_kind: 'opl_app_operator_owner_handoff_packet',
    projection_policy:
      'bounded_owner_handoff_refs_only_no_domain_action_execution_or_receipt_creation',
    status: allOwners.length > 0 ? 'handoff_required' : 'clear',
    owner_count: allOwners.length,
    owner_omitted_count: Math.max(allOwners.length - owners.length, 0),
    evidence_envelope_attention_count: input.evidenceEnvelopeAttentionCount,
    domain_dispatch_attention_count: input.domainDispatchAttentionCount,
    owners,
    authority_boundary: {
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      refs_only: true,
    },
  };
}
