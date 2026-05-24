import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  listExternalEvidenceReceipts,
} from '../external-evidence-ledger.ts';
import { canonicalOwnerId } from '../evidence-envelope.ts';

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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function identityPart(value: string | null) {
  return (value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|');
}

function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    return typeof entry === 'string' ? [entry] : stringList(entry);
  }));
}

function transitionEvidence(attempt: JsonRecord) {
  return record(record(attempt.transition_bridge_evidence).evidence);
}

function controlledApply(attempt: JsonRecord) {
  return record(attempt.controlled_apply_contract);
}

function routeImpact(attempt: JsonRecord) {
  return record(attempt.route_impact);
}

function attemptWorkspaceLocator(attempt: JsonRecord) {
  return record(attempt.workspace_locator);
}

function domainDispatchIdentity(attempt: JsonRecord) {
  const locator = attemptWorkspaceLocator(attempt);
  const domainId = stringValue(attempt.domain_id);
  const canonicalDomainId = domainId ? canonicalOwnerId(domainId) : null;
  const stageId = stringValue(attempt.stage_id);
  const dispatchRef = stringValue(locator.dispatch_ref);
  const profile = stringValue(locator.profile)
    ?? stringValue(locator.profile_ref)
    ?? stringValue(locator.profile_name);
  const fields = {
    canonical_domain_id: canonicalDomainId,
    stage_id: stageId,
    workspace_root: stringValue(locator.workspace_root),
    profile,
    study_id: stringValue(locator.study_id),
    action_type: stringValue(locator.action_type) ?? stringValue(locator.task_kind),
    dispatch_authority: stringValue(locator.dispatch_authority),
    dispatch_ref: dispatchRef,
  };
  if (!canonicalDomainId || !stageId || !dispatchRef) {
    return {
      key: null,
      key_status: 'unbound_no_dispatch_ref',
      fields,
    };
  }
  return {
    key: [
      canonicalDomainId,
      stageId,
      fields.workspace_root,
      profile,
      fields.study_id,
      fields.action_type,
      fields.dispatch_authority,
      dispatchRef,
    ].map(identityPart).join('|'),
    key_status: 'bound',
    fields,
  };
}

function targetIdentity(attempt: JsonRecord) {
  const locator = attemptWorkspaceLocator(attempt);
  return {
    domain_id: stringValue(attempt.domain_id),
    stage_id: stringValue(attempt.stage_id),
    stage_attempt_id: stringValue(attempt.stage_attempt_id),
    task_kind: stringValue(locator.task_kind) ?? stringValue(attempt.stage_id),
    study_id: stringValue(locator.study_id),
    source_fingerprint: stringValue(attempt.source_fingerprint),
    domain_source_fingerprint: stringValue(locator.domain_source_fingerprint),
    profile: stringValue(locator.profile),
    profile_name: stringValue(locator.profile_name),
  };
}

function externalDispatchReceipts(attempt: JsonRecord) {
  const domainId = stringValue(attempt.domain_id);
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  if (!domainId || !stageAttemptId) {
    return [];
  }
  return listExternalEvidenceReceipts({
    domain_id: domainId,
    request_id: `domain_dispatch:${domainId}:${stageAttemptId}`,
  });
}

function domainReadyClaimed(verdict: string | null) {
  if (!verdict) {
    return false;
  }
  const normalized = verdict.toLowerCase();
  if (
    normalized.endsWith('_pending')
    || normalized.includes('gate_pending')
    || normalized.endsWith('_observed')
    || normalized.includes('receipt_observed')
    || normalized.includes('typed_blocker')
    || normalized.includes('blocker')
  ) {
    return false;
  }
  return normalized === 'ready'
    || normalized === 'domain_ready'
    || normalized === 'domain_ready_claimed'
    || normalized.endsWith('_ready')
    || normalized.endsWith('_ready_claimed');
}

type DomainDispatchAttemptEvidence = ReturnType<typeof attemptDispatchEvidence>;

function hasDefaultActionableEvidenceGap(attempt: DomainDispatchAttemptEvidence) {
  return attempt.owner_receipt_refs.length === 0
    && attempt.typed_blocker_refs.length === 0;
}

function timestampMs(value: unknown) {
  const text = stringValue(value);
  if (!text) {
    return 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareAttemptRecency(left: DomainDispatchAttemptEvidence, right: DomainDispatchAttemptEvidence) {
  return timestampMs(right.updated_at) - timestampMs(left.updated_at)
    || timestampMs(right.created_at) - timestampMs(left.created_at)
    || String(right.stage_attempt_id ?? '').localeCompare(String(left.stage_attempt_id ?? ''));
}

function annotateDefaultActionability(attempts: DomainDispatchAttemptEvidence[]) {
  const candidatesByIdentity = attempts
    .filter(hasDefaultActionableEvidenceGap)
    .reduce<Record<string, DomainDispatchAttemptEvidence[]>>((groups, attempt) => {
      const key = stringValue(attempt.dispatch_identity_key);
      if (!key) {
        return groups;
      }
      groups[key] = [...(groups[key] ?? []), attempt];
      return groups;
    }, {});
  const currentByIdentity = new Map<string, DomainDispatchAttemptEvidence>();
  for (const [key, group] of Object.entries(candidatesByIdentity)) {
    currentByIdentity.set(key, [...group].sort(compareAttemptRecency)[0]);
  }
  return attempts.map((attempt) => {
    if (!hasDefaultActionableEvidenceGap(attempt)) {
      return {
        ...attempt,
        default_actionability_status: 'not_actionable_evidence_refs_observed',
        default_actionable: false,
        superseded_by_stage_attempt_id: null,
        superseded_reason: null,
      };
    }
    const key = stringValue(attempt.dispatch_identity_key);
    if (!key) {
      return {
        ...attempt,
        default_actionability_status: 'current_without_dispatch_identity',
        default_actionable: true,
        superseded_by_stage_attempt_id: null,
        superseded_reason: null,
      };
    }
    const currentAttemptId = currentByIdentity.get(key)?.stage_attempt_id ?? null;
    if (currentAttemptId && currentAttemptId !== attempt.stage_attempt_id) {
      return {
        ...attempt,
        default_actionability_status: 'superseded',
        default_actionable: false,
        superseded_by_stage_attempt_id: currentAttemptId,
        superseded_reason: 'newer_stage_attempt_with_same_domain_dispatch_identity',
      };
    }
    return {
      ...attempt,
      default_actionability_status: 'current',
      default_actionable: true,
      superseded_by_stage_attempt_id: null,
      superseded_reason: null,
    };
  });
}

function authorityBoundary() {
  return {
    opl: 'refs_only_domain_dispatch_evidence_projection',
    domain: 'truth_quality_artifact_memory_and_verdict_owner',
    provider: 'runtime_completion_owner_not_domain_ready_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_authorize_export_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

function attemptDispatchEvidence(attempt: JsonRecord) {
  const transition = transitionEvidence(attempt);
  const controlled = controlledApply(attempt);
  const impact = routeImpact(attempt);
  const externalReceipts = externalDispatchReceipts(attempt);
  const verifiedExternalReceipts = externalReceipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
  );
  const domainReadyVerdict = stringValue(attempt.domain_ready_verdict)
    ?? stringValue(impact.domain_ready_verdict);
  const identity = targetIdentity(attempt);
  const ownerReceiptRefs = uniqueStrings([
    ...stringList(controlled.owner_receipt_refs),
    ...stringList(transition.owner_receipt_refs),
    ...refsFromRecord(impact, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
    ...verifiedExternalReceipts.flatMap((receipt) => receipt.receipt_refs),
    ...verifiedExternalReceipts.flatMap((receipt) => receipt.owner_chain_refs),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...stringList(transition.typed_blocker_refs),
    ...refsFromRecord(impact, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...verifiedExternalReceipts.flatMap((receipt) => receipt.typed_blocker_refs),
  ]);
  const noRegressionEvidenceRefs = uniqueStrings([
    ...stringList(controlled.no_regression_evidence_refs),
    ...stringList(transition.no_regression_evidence_refs),
    ...refsFromRecord(impact, ['no_regression_evidence_ref', 'no_regression_evidence_refs']),
    ...verifiedExternalReceipts.flatMap((receipt) => receipt.no_regression_refs),
    ...verifiedExternalReceipts.flatMap((receipt) => receipt.evidence_refs),
  ]);
  const writebackReceiptRefs = uniqueStrings(stringList(attempt.writeback_receipt_refs));
  const typedBlockerCount = Number(record(transition).typed_blocker_count ?? 0)
    + (Array.isArray(impact.typed_blockers) ? impact.typed_blockers.length : 0)
    + (Array.isArray(controlled.typed_blockers) ? controlled.typed_blockers.length : 0);
  const dispatchIdentity = domainDispatchIdentity(attempt);
  return {
    ref: `/stage_attempt_workbench/attempts/${stringValue(attempt.stage_attempt_id) ?? 'unknown'}/domain_dispatch_evidence`,
    domain_id: stringValue(attempt.domain_id) ?? 'unknown',
    stage_id: stringValue(attempt.stage_id),
    stage_attempt_id: stringValue(attempt.stage_attempt_id),
    provider_kind: stringValue(attempt.provider_kind),
    local_status: stringValue(attempt.local_status),
    closeout_receipt_status: stringValue(attempt.closeout_receipt_status),
    workspace_locator: attemptWorkspaceLocator(attempt),
    source_fingerprint: stringValue(attempt.source_fingerprint),
    created_at: stringValue(attempt.created_at),
    updated_at: stringValue(attempt.updated_at),
    target_identity: identity,
    dispatch_identity_key: dispatchIdentity.key,
    dispatch_identity_key_status: dispatchIdentity.key_status,
    dispatch_identity_fields: dispatchIdentity.fields,
    identity_binding_policy:
      'domain_dispatch_receipt_payload_identity_must_not_conflict_with_stage_attempt_identity',
    dispatch_evidence_receipt_status: verifiedExternalReceipts.length > 0
      ? 'verified'
      : externalReceipts.length > 0
        ? 'recorded'
        : 'missing',
    dispatch_evidence_receipt_refs: uniqueStrings(externalReceipts.map((receipt) => receipt.receipt_ref)),
    verified_dispatch_evidence_receipt_refs:
      uniqueStrings(verifiedExternalReceipts.map((receipt) => receipt.receipt_ref)),
    decision: stringValue(impact.decision),
    next_owner: stringValue(attempt.next_owner) ?? stringValue(impact.next_owner),
    domain_ready_verdict: domainReadyVerdict,
    provider_completion_is_domain_ready: false,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    typed_blocker_count: typedBlockerCount,
    no_regression_evidence_refs: noRegressionEvidenceRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    domain_ready_claimed: domainReadyClaimed(domainReadyVerdict),
    evidence_status:
      ownerReceiptRefs.length > 0
        ? 'domain_owner_receipt_observed'
        : typedBlockerRefs.length > 0 || typedBlockerCount > 0
          ? 'typed_blocker_observed'
          : noRegressionEvidenceRefs.length > 0
            ? 'no_regression_evidence_observed'
            : 'no_dispatch_evidence_observed',
    authority_boundary: authorityBoundary(),
  };
}

function emptyDomainGroup(domainId: string) {
  return {
    domain_id: domainId,
    attempt_count: 0,
    owner_receipt_ref_count: 0,
    typed_blocker_ref_count: 0,
    typed_blocker_count: 0,
    no_regression_evidence_ref_count: 0,
    writeback_receipt_ref_count: 0,
    domain_ready_claim_count: 0,
    current_default_actionable_attempt_count: 0,
    superseded_attempt_count: 0,
    dispatch_identity_keys: [] as string[],
    attempt_refs: [] as string[],
    owner_receipt_refs: [] as string[],
    typed_blocker_refs: [] as string[],
    no_regression_evidence_refs: [] as string[],
    writeback_receipt_refs: [] as string[],
  };
}

export function buildDomainDispatchEvidence(attempts: JsonRecord[]) {
  const attemptEvidence = annotateDefaultActionability(attempts.map(attemptDispatchEvidence));
  const byDomain = attemptEvidence.reduce<Record<string, ReturnType<typeof emptyDomainGroup>>>((groups, attempt) => {
    const domainId = attempt.domain_id;
    const group = groups[domainId] ?? emptyDomainGroup(domainId);
    group.attempt_count += 1;
    group.attempt_refs = uniqueStrings([...group.attempt_refs, attempt.ref]);
    group.dispatch_identity_keys = uniqueStrings([
      ...group.dispatch_identity_keys,
      ...(attempt.dispatch_identity_key ? [attempt.dispatch_identity_key] : []),
    ]);
    group.current_default_actionable_attempt_count += attempt.default_actionable ? 1 : 0;
    group.superseded_attempt_count += attempt.default_actionability_status === 'superseded' ? 1 : 0;
    group.owner_receipt_refs = uniqueStrings([...group.owner_receipt_refs, ...attempt.owner_receipt_refs]);
    group.typed_blocker_refs = uniqueStrings([...group.typed_blocker_refs, ...attempt.typed_blocker_refs]);
    group.typed_blocker_count += attempt.typed_blocker_count;
    group.no_regression_evidence_refs = uniqueStrings([
      ...group.no_regression_evidence_refs,
      ...attempt.no_regression_evidence_refs,
    ]);
    group.writeback_receipt_refs = uniqueStrings([
      ...group.writeback_receipt_refs,
      ...attempt.writeback_receipt_refs,
    ]);
    group.domain_ready_claim_count += attempt.domain_ready_claimed ? 1 : 0;
    group.owner_receipt_ref_count = group.owner_receipt_refs.length;
    group.typed_blocker_ref_count = group.typed_blocker_refs.length;
    group.no_regression_evidence_ref_count = group.no_regression_evidence_refs.length;
    group.writeback_receipt_ref_count = group.writeback_receipt_refs.length;
    groups[domainId] = group;
    return groups;
  }, {});
  const domainGroups = Object.values(byDomain);
  const dispatchIdentityKeys = uniqueStrings(attemptEvidence
    .map((attempt) => attempt.dispatch_identity_key)
    .filter((key): key is string => Boolean(key)));
  const supersededAttempts = attemptEvidence.filter((attempt) =>
    attempt.default_actionability_status === 'superseded'
  );
  return {
    surface_kind: 'opl_app_drilldown_domain_dispatch_evidence',
    projection_policy: 'refs_only_owner_chain_dispatch_evidence_no_domain_verdict_authority',
    default_actionability_policy:
      'only_latest_attempt_per_bound_dispatch_identity_is_default_actionable_superseded_attempts_remain_full_detail_provenance',
    summary: {
      domain_count: domainGroups.length,
      attempt_count: attemptEvidence.length,
      dispatch_identity_group_count: dispatchIdentityKeys.length,
      current_default_actionable_attempt_count:
        attemptEvidence.filter((attempt) => attempt.default_actionable).length,
      superseded_attempt_count: supersededAttempts.length,
      owner_receipt_ref_count: uniqueStrings(domainGroups.flatMap((group) => group.owner_receipt_refs)).length,
      typed_blocker_ref_count: uniqueStrings(domainGroups.flatMap((group) => group.typed_blocker_refs)).length,
      typed_blocker_count: domainGroups.reduce((count, group) => count + group.typed_blocker_count, 0),
      no_regression_evidence_ref_count:
        uniqueStrings(domainGroups.flatMap((group) => group.no_regression_evidence_refs)).length,
      memory_writeback_ref_count: uniqueStrings(domainGroups.flatMap((group) => group.writeback_receipt_refs)).length,
      domain_ready_claim_count:
        domainGroups.reduce((count, group) => count + group.domain_ready_claim_count, 0),
      provider_completion_is_domain_ready: false,
    },
    by_domain: byDomain,
    attempts: attemptEvidence,
    authority_boundary: authorityBoundary(),
  };
}
