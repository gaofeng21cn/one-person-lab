import { buildAgentDefaultCallerReadinessReport } from './agent-platform-surface-ownership.ts';
import {
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
  DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS,
} from './default-caller-retirement-guard.ts';
import type {
  DefaultCallerPrivatePlatformCleanupDisposition,
  DefaultCallerPrivatePlatformResidueTargetKind,
} from './default-caller-retirement-guard.ts';
import {
  type JsonRecord,
  record,
  recordList,
  stringList,
  stringValue as optionalString,
} from '../../kernel/json-record.ts';

export const PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_CONTRACT_REF =
  'contracts/opl-framework/private-platform-residue-owner-decisions.json' as const;

export const PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_ALLOWED_OUTCOMES = [
  'retain_authority_function',
  'raise_to_opl_primitive',
  'no_active_caller_delete_gate',
  'tombstone_gate',
  'typed_blocker_gate',
] as const;

type PrivatePlatformResidueOwnerDecisionOutcome =
  typeof PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_ALLOWED_OUTCOMES[number];

const CLEANUP_DISPOSITION_TO_OWNER_DECISION: Record<
  DefaultCallerPrivatePlatformCleanupDisposition,
  PrivatePlatformResidueOwnerDecisionOutcome
> = {
  retain_authority_function: 'retain_authority_function',
  absorb_opl_primitive: 'raise_to_opl_primitive',
  no_active_caller_delete: 'no_active_caller_delete_gate',
  tombstone: 'tombstone_gate',
  owner_typed_blocker: 'typed_blocker_gate',
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function residueKind(value: unknown): DefaultCallerPrivatePlatformResidueTargetKind | null {
  const text = optionalString(value);
  return text
    && (DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS as readonly string[]).includes(text)
    ? text as DefaultCallerPrivatePlatformResidueTargetKind
    : null;
}

function cleanupDisposition(value: unknown): DefaultCallerPrivatePlatformCleanupDisposition | null {
  const text = optionalString(value);
  return text
    && (DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS as readonly string[]).includes(text)
    ? text as DefaultCallerPrivatePlatformCleanupDisposition
    : null;
}

function ownerDecisionFromDisposition(value: unknown) {
  const disposition = cleanupDisposition(value);
  return disposition ? CLEANUP_DISPOSITION_TO_OWNER_DECISION[disposition] : null;
}

function bridgeExitGateRefs(gate: JsonRecord, fieldNames: string[]) {
  return unique(fieldNames.flatMap((fieldName) => [
    ...stringList(gate[fieldName]),
    optionalString(gate[fieldName.slice(0, -1)]),
  ].filter((entry): entry is string => Boolean(entry))));
}

function physicalDeleteAuthorizationStatus(input: {
  sourceClaimsPhysicalDeleteAuthorized: boolean;
  ownerReceiptRefs: string[];
  typedBlockerRefs: string[];
}) {
  if (input.ownerReceiptRefs.length === 0 && input.typedBlockerRefs.length === 0) {
    return input.sourceClaimsPhysicalDeleteAuthorized
      ? 'blocked_missing_owner_receipt_or_typed_blocker_ref'
      : 'not_authorized_owner_ref_missing';
  }
  if (input.sourceClaimsPhysicalDeleteAuthorized) {
    return 'owner_ref_observed_source_claim_not_authorized_by_ledger';
  }
  if (input.typedBlockerRefs.length > 0 && input.ownerReceiptRefs.length === 0) {
    return 'typed_blocker_observed_not_delete_authorized';
  }
  return 'owner_ref_observed_refs_only_not_delete_authorized';
}

function buildDecisionItem(
  repo: JsonRecord,
  item: JsonRecord,
  index: number,
) {
  const domainId = optionalString(repo.domain_id) ?? optionalString(repo.repo_id) ?? 'unknown_domain';
  const moduleId = optionalString(item.module_id) ?? `unknown_private_platform_residue_${index + 1}`;
  const residue = residueKind(item.residue_kind) ?? 'domain_wrapper';
  const ownerDecision = ownerDecisionFromDisposition(item.disposition) ?? 'typed_blocker_gate';
  const bridgeExitGate = record(item.bridge_exit_gate);
  const ownerReceiptRefs = bridgeExitGateRefs(bridgeExitGate, [
    'owner_receipt_refs',
    'domain_owner_receipt_refs',
  ]);
  const typedBlockerRefs = bridgeExitGateRefs(bridgeExitGate, ['typed_blocker_refs']);
  const physicalDeleteAuthorizationRefs = bridgeExitGateRefs(bridgeExitGate, [
    'physical_delete_authorization_refs',
  ]);
  const sourceClaimsPhysicalDeleteAuthorized = bridgeExitGate.physical_delete_authorized === true;
  const physicalDeleteAuthorized = false;

  return {
    decision_id: `${domainId}:${moduleId}:${residue}`,
    repo_id: domainId,
    domain_id: domainId,
    requested_agent_id: optionalString(repo.requested_agent_id),
    repo_dir: optionalString(repo.repo_dir),
    module_id: moduleId,
    residue_kind: residue,
    owner_decision: ownerDecision,
    source_cleanup_disposition:
      cleanupDisposition(item.disposition) ?? 'owner_typed_blocker',
    code_paths: stringList(item.code_paths),
    active_callers: stringList(item.active_callers),
    active_caller_status: optionalString(item.active_caller_status),
    migration_action: optionalString(item.migration_action),
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    physical_delete_authorization_refs: physicalDeleteAuthorizationRefs,
    owner_decision_ref_status:
      ownerReceiptRefs.length > 0 || typedBlockerRefs.length > 0
        ? 'owner_receipt_or_typed_blocker_ref_observed'
        : 'missing_owner_receipt_or_typed_blocker_ref',
    source_claims_physical_delete_authorized: sourceClaimsPhysicalDeleteAuthorized,
    physical_delete_authorized: physicalDeleteAuthorized,
    physical_delete_authorization_status: physicalDeleteAuthorizationStatus({
      sourceClaimsPhysicalDeleteAuthorized,
      ownerReceiptRefs,
      typedBlockerRefs,
    }),
    authority_boundary: {
      ledger_can_write_domain_truth: false,
      ledger_can_sign_domain_owner_receipt: false,
      ledger_can_create_typed_blocker: false,
      ledger_can_authorize_quality_or_export: false,
      ledger_can_authorize_domain_repo_physical_delete: false,
    },
  };
}

function byAllowedOutcome<T extends { owner_decision: string }>(items: T[]) {
  return Object.fromEntries(
    PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_ALLOWED_OUTCOMES.map((decision) => [
      decision,
      items.filter((item) => item.owner_decision === decision).length,
    ]),
  );
}

function byResidueKind<T extends { residue_kind: string }>(items: T[]) {
  return Object.fromEntries(
    DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS.map((kind) => [
      kind,
      items.filter((item) => item.residue_kind === kind).length,
    ]),
  );
}

export function buildPrivatePlatformResidueOwnerDecisionLedger(args: string[]) {
  const defaultCallerReport = buildAgentDefaultCallerReadinessReport(args);
  const defaultCallers = record(defaultCallerReport.agent_default_caller_readiness);
  const reports = recordList(defaultCallers.reports).map((repo) => {
    const cleanupLane = record(repo.private_platform_residue_deletion_gate);
    const sourceClosure = record(repo.source_closure);
    const items = recordList(cleanupLane.items).map((item, index) =>
      buildDecisionItem(repo, item, index)
    );
    const sourceClosurePassed = optionalString(sourceClosure.status) === 'passed'
      && sourceClosure.scan_complete === true
      && recordList(sourceClosure.unresolved_edges).length === 0
      && recordList(sourceClosure.audit_mismatches).length === 0
      && recordList(sourceClosure.unreachable_sensitive_residue).length === 0;
    return {
      repo_id: optionalString(repo.domain_id) ?? optionalString(repo.repo_id) ?? 'unknown_domain',
      domain_id: optionalString(repo.domain_id),
      requested_agent_id: optionalString(repo.requested_agent_id),
      repo_dir: optionalString(repo.repo_dir),
      status: items.length > 0
        ? 'owner_decisions_required_or_observed'
        : sourceClosurePassed
          ? 'verified_zero'
          : 'source_closure_blocked',
      source_closure_status: optionalString(sourceClosure.status) ?? 'missing',
      source_closure_verified_zero: sourceClosurePassed,
      source_closure_digest: optionalString(sourceClosure.closure_digest),
      lane_id: DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
      decision_item_count: items.length,
      physical_delete_authorized: items.some((item) => item.physical_delete_authorized),
      owner_decision_summary: byAllowedOutcome(items),
      residue_kind_summary: byResidueKind(items),
      items,
    };
  });
  const items = reports.flatMap((report) => report.items);
  const invalidOwnerDecisionCount = items.filter((item) =>
    !(PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_ALLOWED_OUTCOMES as readonly string[])
      .includes(item.owner_decision)
  ).length;
  const missingOwnerRefCount = items.filter((item) =>
    item.owner_decision_ref_status === 'missing_owner_receipt_or_typed_blocker_ref'
  ).length;
  const physicalDeleteAuthorizedCount = items.filter((item) => item.physical_delete_authorized).length;
  const sourceClosureVerifiedRepoCount = reports.filter((report) => (
    report.source_closure_verified_zero
  )).length;
  const verifiedZero = items.length === 0
    && reports.length > 0
    && sourceClosureVerifiedRepoCount === reports.length;

  return {
    surface_kind: 'opl_private_platform_residue_owner_decision_ledger',
    version: 'private-platform-residue-owner-decisions.v1',
    owner: 'one-person-lab',
    state: verifiedZero ? 'verified_zero' : 'refs_only_owner_decision_ledger',
    contract_ref: PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_CONTRACT_REF,
    source_command: `opl agents residue-decisions ${args.join(' ')}`.trim(),
    source_default_caller_command: `opl agents default-callers ${args.join(' ')}`.trim(),
    source_contract_refs: [
      PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_CONTRACT_REF,
      'contracts/opl-framework/standard-agent-admission-gates.json',
      'contracts/opl-framework/agent-platform-surface-ownership-contract.json',
      'contracts/opl-framework/functional-privatization-audit-envelope-contract.json',
    ],
    lane_id: DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
    allowed_owner_decisions: [
      ...PRIVATE_PLATFORM_RESIDUE_OWNER_DECISION_ALLOWED_OUTCOMES,
    ],
    source_cleanup_disposition_mapping: {
      ...CLEANUP_DISPOSITION_TO_OWNER_DECISION,
    },
    residue_target_kinds: [...DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS],
    physical_delete_authorized: physicalDeleteAuthorizedCount > 0,
    physical_delete_authorization_policy: {
      physical_delete_authorized_must_be_false_when_owner_receipt_and_typed_blocker_refs_are_missing:
        true,
      typed_blocker_ref_counts_as_owner_answer_but_not_delete_authorization: true,
      ledger_can_authorize_domain_repo_physical_delete: false,
    },
    summary: {
      total_repo_count: reports.length,
      decision_item_count: items.length,
      invalid_owner_decision_count: invalidOwnerDecisionCount,
      missing_owner_receipt_or_typed_blocker_ref_count: missingOwnerRefCount,
      observed_owner_receipt_or_typed_blocker_ref_count: items.length - missingOwnerRefCount,
      physical_delete_authorized_count: physicalDeleteAuthorizedCount,
      source_closure_verified_repo_count: sourceClosureVerifiedRepoCount,
      source_closure_blocked_repo_count: reports.length - sourceClosureVerifiedRepoCount,
      residue_verification_status: verifiedZero ? 'verified_zero' : 'not_verified_zero',
      by_owner_decision: byAllowedOutcome(items),
      by_residue_kind: byResidueKind(items),
    },
    default_caller_readiness_summary: defaultCallers.summary ?? null,
    reports,
    authority_boundary: {
      ledger_can_write_domain_truth: false,
      ledger_can_write_memory_body: false,
      ledger_can_sign_domain_owner_receipt: false,
      ledger_can_create_typed_blocker: false,
      ledger_can_authorize_quality_or_export: false,
      ledger_can_mutate_domain_artifacts: false,
      ledger_can_authorize_domain_repo_physical_delete: false,
      ledger_can_claim_domain_ready: false,
      ledger_can_claim_production_ready: false,
    },
  };
}

export function buildPrivatePlatformResidueOwnerDecisionLedgerCommand(args: string[]) {
  return {
    private_platform_residue_owner_decisions:
      buildPrivatePlatformResidueOwnerDecisionLedger(args),
  };
}
