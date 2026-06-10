import fs from 'node:fs';
import path from 'node:path';

import { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
import { listCodexAppRuntimeEvidenceReceipts } from './codex-app-runtime-evidence-ledger.ts';
import { listDomainOwnerPayloadSummaryReceipts } from './domain-owner-payload-summary-ledger.ts';
import {
  booleanValue,
  numberValue,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';
import type { FrameworkContracts } from './types.ts';

type RefCounts = {
  domain_owner_receipt_ref_count: number;
  domain_receipt_ref_count: number;
  no_regression_ref_count: number;
  owner_chain_ref_count: number;
  monitor_freshness_ref_count: number;
  runtime_event_ref_count: number;
  typed_blocker_ref_count: number;
  evidence_ref_count: number;
  owner_acceptance_ref_count: number;
};

type OwnerEvidenceProjection = {
  lane: string;
  status: 'owner_evidence_observed_not_ready_claim' | 'owner_evidence_required';
  recorded_receipt_count: number;
  verified_receipt_count: number;
  observed_receipt_refs: string[];
  observed_ref_counts: RefCounts;
  observed_ref_shapes: string[];
  observed_domains?: Array<{
    domain_id: string;
    recorded_receipt_count: number;
    verified_receipt_count: number;
    observed_receipt_refs: string[];
    observed_ref_counts: RefCounts;
    observed_ref_shapes: string[];
    status: string;
  }>;
  blocker_state: 'owner_route_refs_observed_not_production_claim' | 'owner_route_evidence_missing';
  evidence_route: string;
};

type ObservedDomainEvidence = NonNullable<OwnerEvidenceProjection['observed_domains']>[number];

function domainKey(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    redcubeai: 'redcube',
  };
  return aliases[compact] ?? compact;
}

function emptyCounts(): RefCounts {
  return {
    domain_owner_receipt_ref_count: 0,
    domain_receipt_ref_count: 0,
    no_regression_ref_count: 0,
    owner_chain_ref_count: 0,
    monitor_freshness_ref_count: 0,
    runtime_event_ref_count: 0,
    typed_blocker_ref_count: 0,
    evidence_ref_count: 0,
    owner_acceptance_ref_count: 0,
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function refShapes(counts: RefCounts) {
  return [
    counts.domain_owner_receipt_ref_count > 0 ? 'domain_owner_receipt_ref' : null,
    counts.domain_receipt_ref_count > 0 ? 'domain_receipt_ref' : null,
    counts.no_regression_ref_count > 0 ? 'no_regression_ref' : null,
    counts.owner_chain_ref_count > 0 ? 'owner_chain_ref' : null,
    counts.monitor_freshness_ref_count > 0 ? 'monitor_freshness_ref' : null,
    counts.runtime_event_ref_count > 0 ? 'runtime_event_ref' : null,
    counts.typed_blocker_ref_count > 0 ? 'typed_blocker_ref' : null,
    counts.evidence_ref_count > 0 ? 'evidence_ref' : null,
    counts.owner_acceptance_ref_count > 0 ? 'owner_acceptance_ref' : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function observedStatus(input: {
  recordedReceiptCount: number;
  verifiedReceiptCount: number;
  counts: RefCounts;
}): Pick<
  OwnerEvidenceProjection,
  'status' | 'blocker_state' | 'observed_ref_shapes'
> {
  const observedRefShapes = refShapes(input.counts);
  const observed = input.recordedReceiptCount > 0
    || input.verifiedReceiptCount > 0
    || observedRefShapes.length > 0;
  return {
    status: observed ? 'owner_evidence_observed_not_ready_claim' : 'owner_evidence_required',
    blocker_state: observed
      ? 'owner_route_refs_observed_not_production_claim'
      : 'owner_route_evidence_missing',
    observed_ref_shapes: observedRefShapes,
  };
}

function observedDomainStatus(input: ObservedDomainEvidence) {
  return observedStatus({
    recordedReceiptCount: input.recorded_receipt_count,
    verifiedReceiptCount: input.verified_receipt_count,
    counts: input.observed_ref_counts,
  }).status;
}

function addDomainEvidence(
  current: Record<string, ObservedDomainEvidence>,
  input: {
    domainId: string;
    receiptRefs: string[];
    counts: Partial<RefCounts>;
    recordedReceiptCount?: number;
    verifiedReceiptCount?: number;
  },
) {
  const key = domainKey(input.domainId);
  const entry = current[key] ?? {
    domain_id: input.domainId,
    recorded_receipt_count: 0,
    verified_receipt_count: 0,
    observed_receipt_refs: [],
    observed_ref_counts: emptyCounts(),
    observed_ref_shapes: [],
    status: 'owner_evidence_required',
  };
  entry.recorded_receipt_count += input.recordedReceiptCount ?? 0;
  entry.verified_receipt_count += input.verifiedReceiptCount ?? 0;
  entry.observed_receipt_refs = unique([
    ...entry.observed_receipt_refs,
    ...input.receiptRefs,
  ]);
  entry.observed_ref_counts = {
    ...entry.observed_ref_counts,
    domain_owner_receipt_ref_count:
      entry.observed_ref_counts.domain_owner_receipt_ref_count
      + (input.counts.domain_owner_receipt_ref_count ?? 0),
    domain_receipt_ref_count:
      entry.observed_ref_counts.domain_receipt_ref_count
      + (input.counts.domain_receipt_ref_count ?? 0),
    no_regression_ref_count:
      entry.observed_ref_counts.no_regression_ref_count
      + (input.counts.no_regression_ref_count ?? 0),
    owner_chain_ref_count:
      entry.observed_ref_counts.owner_chain_ref_count
      + (input.counts.owner_chain_ref_count ?? 0),
    monitor_freshness_ref_count:
      entry.observed_ref_counts.monitor_freshness_ref_count
      + (input.counts.monitor_freshness_ref_count ?? 0),
    runtime_event_ref_count:
      entry.observed_ref_counts.runtime_event_ref_count
      + (input.counts.runtime_event_ref_count ?? 0),
    typed_blocker_ref_count:
      entry.observed_ref_counts.typed_blocker_ref_count
      + (input.counts.typed_blocker_ref_count ?? 0),
    evidence_ref_count:
      entry.observed_ref_counts.evidence_ref_count
      + (input.counts.evidence_ref_count ?? 0),
    owner_acceptance_ref_count:
      entry.observed_ref_counts.owner_acceptance_ref_count
      + (input.counts.owner_acceptance_ref_count ?? 0),
  };
  entry.observed_ref_shapes = refShapes(entry.observed_ref_counts);
  entry.status = observedDomainStatus(entry);
  current[key] = entry;
}

function addCounts(current: RefCounts, addition: RefCounts) {
  current.domain_owner_receipt_ref_count += addition.domain_owner_receipt_ref_count;
  current.domain_receipt_ref_count += addition.domain_receipt_ref_count;
  current.no_regression_ref_count += addition.no_regression_ref_count;
  current.owner_chain_ref_count += addition.owner_chain_ref_count;
  current.monitor_freshness_ref_count += addition.monitor_freshness_ref_count;
  current.runtime_event_ref_count += addition.runtime_event_ref_count;
  current.typed_blocker_ref_count += addition.typed_blocker_ref_count;
  current.evidence_ref_count += addition.evidence_ref_count;
  current.owner_acceptance_ref_count += addition.owner_acceptance_ref_count;
}

function repoTrackedContractRef(repoDir: string, evidencePath: string) {
  return `repo-tracked-contract:${path.relative(repoDir, evidencePath)}`;
}

function magRepoTrackedEvidence(
  domains: Record<string, unknown>[],
): ObservedDomainEvidence | null {
  const magDomain = domains.find((domain) =>
    domainKey(stringValue(domain.domain_id)) === 'medautogrant'
  );
  const repoDir = stringValue(magDomain?.repo_dir);
  if (!repoDir) {
    return null;
  }
  const evidencePath = path.join(
    repoDir,
    'contracts',
    'production_acceptance',
    'mag-production-acceptance.json',
  );
  try {
    const evidence = recordValue(JSON.parse(fs.readFileSync(evidencePath, 'utf8')));
    const refs = recordValue(evidence.refs);
    const closureEvidence = recordValue(evidence.closure_evidence);
    const externalEvidenceLedger = recordValue(evidence.external_evidence_receipt_ledger);
    const grantReceiptChain = recordValue(evidence.grant_receipt_chain);
    const domainOwnerReceiptRefs = unique([
      ...stringList(refs.grant_owner_receipt_refs),
      ...stringList(refs.owner_receipt_refs),
      ...stringList(refs.acceptance_receipt_refs),
      stringValue(closureEvidence.owner_receipt_ref) ?? '',
    ]);
    const typedBlockerRefs = unique(stringList(refs.typed_blocker_refs));
    const ownerChainRefs = unique([
      stringValue(externalEvidenceLedger.ledger_ref) ?? '',
      booleanValue(grantReceiptChain.production_like_grant_receipt_chain_present) === true
        ? stringValue(grantReceiptChain.chain_status) ?? 'grant_receipt_chain_present'
        : '',
    ]);
    if (
      domainOwnerReceiptRefs.length === 0
      && typedBlockerRefs.length === 0
      && ownerChainRefs.length === 0
    ) {
      return null;
    }
    const counts = {
      ...emptyCounts(),
      domain_owner_receipt_ref_count: domainOwnerReceiptRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      owner_chain_ref_count: ownerChainRefs.length > 0 ? 1 : 0,
    };
    const observedReceiptRefs = unique([
      repoTrackedContractRef(repoDir, evidencePath),
      ...domainOwnerReceiptRefs,
      ...typedBlockerRefs,
      ...ownerChainRefs,
    ]);
    const verifiedSourceCount = 1;
    const status = observedStatus({
      recordedReceiptCount: 0,
      verifiedReceiptCount: verifiedSourceCount,
      counts,
    });
    return {
      domain_id: stringValue(evidence.domain_id) ?? 'med-autogrant',
      recorded_receipt_count: 0,
      verified_receipt_count: verifiedSourceCount,
      observed_receipt_refs: observedReceiptRefs,
      observed_ref_counts: counts,
      observed_ref_shapes: status.observed_ref_shapes,
      status: status.status,
    };
  } catch {
    return null;
  }
}

function rcaRepoTrackedEvidence(
  domains: Record<string, unknown>[],
): ObservedDomainEvidence | null {
  const rcaDomain = domains.find((domain) =>
    domainKey(stringValue(domain.domain_id)) === 'redcube'
  );
  const repoDir = stringValue(rcaDomain?.repo_dir);
  if (!repoDir) {
    return null;
  }
  const evidencePath = path.join(repoDir, 'contracts', 'owner_chain_live_progress_evidence.json');
  try {
    const evidence = recordValue(JSON.parse(fs.readFileSync(evidencePath, 'utf8')));
    const liveCanary = recordValue(evidence.live_visual_owner_chain_canary);
    const ownerActionCanary = recordValue(evidence.rca_owned_owner_action_canary);
    const ownerReceiptRefs = unique([
      ...stringList(liveCanary.observed_owner_receipt_refs),
      stringValue(ownerActionCanary.observed_owner_receipt_ref) ?? '',
    ]);
    const domainReceiptRefs = unique(stringList(liveCanary.observed_review_export_receipt_refs));
    const typedBlockerRefs = unique([
      ...stringList(liveCanary.observed_typed_blocker_refs),
      stringValue(ownerActionCanary.observed_typed_blocker_ref) ?? '',
    ]);
    const noRegressionRefs = unique([
      stringValue(ownerActionCanary.observed_no_regression_evidence_ref) ?? '',
    ]);
    if (
      ownerReceiptRefs.length === 0
      && domainReceiptRefs.length === 0
      && typedBlockerRefs.length === 0
      && noRegressionRefs.length === 0
    ) {
      return null;
    }
    const counts = {
      ...emptyCounts(),
      domain_owner_receipt_ref_count: ownerReceiptRefs.length,
      domain_receipt_ref_count: domainReceiptRefs.length,
      no_regression_ref_count: noRegressionRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      owner_chain_ref_count: 1,
    };
    const observedReceiptRefs = unique([
      repoTrackedContractRef(repoDir, evidencePath),
      ...ownerReceiptRefs,
      ...domainReceiptRefs,
      ...typedBlockerRefs,
      ...noRegressionRefs,
    ]);
    const verifiedSourceCount = 1;
    const status = observedStatus({
      recordedReceiptCount: 0,
      verifiedReceiptCount: verifiedSourceCount,
      counts,
    });
    return {
      domain_id: stringValue(evidence.domain_id) ?? 'redcube-ai',
      recorded_receipt_count: 0,
      verified_receipt_count: verifiedSourceCount,
      observed_receipt_refs: observedReceiptRefs,
      observed_ref_counts: counts,
      observed_ref_shapes: status.observed_ref_shapes,
      status: status.status,
    };
  } catch {
    return null;
  }
}

function omaRepoTrackedEvidence(
  domains: Record<string, unknown>[],
): ObservedDomainEvidence | null {
  const omaDomain = domains.find((domain) =>
    domainKey(stringValue(domain.domain_id)) === 'oplmetaagent'
  );
  const repoDir = stringValue(omaDomain?.repo_dir);
  if (!repoDir) {
    return null;
  }
  const evidencePath = path.join(repoDir, 'contracts', 'target_agent_owner_chain_evidence.json');
  try {
    const evidence = recordValue(JSON.parse(fs.readFileSync(evidencePath, 'utf8')));
    const blockerClosure = recordValue(evidence.stage_replay_human_gate_blocker_closure);
    const typedBlockerRefs = stringList(blockerClosure.typed_blocker_refs);
    const noRegressionRefs = stringList(blockerClosure.no_regression_refs);
    if (typedBlockerRefs.length === 0 && noRegressionRefs.length === 0) {
      return null;
    }
    const counts = {
      ...emptyCounts(),
      typed_blocker_ref_count: typedBlockerRefs.length,
      no_regression_ref_count: noRegressionRefs.length,
      owner_chain_ref_count: 1,
    };
    const observedReceiptRefs = unique([
      repoTrackedContractRef(repoDir, evidencePath),
      ...typedBlockerRefs,
      ...noRegressionRefs,
    ]);
    const verifiedSourceCount = 1;
    const status = observedStatus({
      recordedReceiptCount: 0,
      verifiedReceiptCount: verifiedSourceCount,
      counts,
    });
    return {
      domain_id: stringValue(evidence.domain_id) ?? 'opl-meta-agent',
      recorded_receipt_count: 0,
      verified_receipt_count: verifiedSourceCount,
      observed_receipt_refs: observedReceiptRefs,
      observed_ref_counts: counts,
      observed_ref_shapes: status.observed_ref_shapes,
      status: status.status,
    };
  } catch {
    return null;
  }
}

function domainOwnerChainProjection(input: {
  domains: Record<string, unknown>[];
}): OwnerEvidenceProjection {
  const receipts = listDomainOwnerPayloadSummaryReceipts();
  const observedDomains = receipts.reduce<Record<string, ObservedDomainEvidence>>((current, receipt) => {
    const domainId = stringValue(receipt.target_identity.domain_id)
      ?? stringValue(receipt.target_identity.target_domain_id)
      ?? stringValue(receipt.target_identity.project)
      ?? 'unknown';
    const key = domainKey(domainId);
    const entry = current[key] ?? {
      domain_id: domainId,
      recorded_receipt_count: 0,
      verified_receipt_count: 0,
      observed_receipt_refs: [],
      observed_ref_counts: emptyCounts(),
      observed_ref_shapes: [],
      status: 'owner_evidence_required',
    };
    entry.recorded_receipt_count += receipt.receipt_status === 'recorded' ? 1 : 0;
    entry.verified_receipt_count += receipt.receipt_status === 'verified' ? 1 : 0;
    entry.observed_receipt_refs = unique([
      ...entry.observed_receipt_refs,
      receipt.receipt_ref,
    ]);
    entry.observed_ref_counts = {
      ...entry.observed_ref_counts,
      domain_owner_receipt_ref_count:
        entry.observed_ref_counts.domain_owner_receipt_ref_count
        + receipt.domain_owner_receipt_refs.length,
      domain_receipt_ref_count:
        entry.observed_ref_counts.domain_receipt_ref_count
        + receipt.domain_receipt_refs.length,
      no_regression_ref_count:
        entry.observed_ref_counts.no_regression_ref_count
        + receipt.no_regression_evidence_refs.length,
      owner_chain_ref_count:
        entry.observed_ref_counts.owner_chain_ref_count
        + receipt.owner_chain_refs.length,
      monitor_freshness_ref_count:
        entry.observed_ref_counts.monitor_freshness_ref_count
        + receipt.monitor_freshness_refs.length,
      runtime_event_ref_count:
        entry.observed_ref_counts.runtime_event_ref_count
        + receipt.runtime_event_refs.length,
      typed_blocker_ref_count:
        entry.observed_ref_counts.typed_blocker_ref_count
        + receipt.typed_blocker_refs.length,
    };
    entry.observed_ref_shapes = refShapes(entry.observed_ref_counts);
    entry.status = observedStatus({
      recordedReceiptCount: entry.recorded_receipt_count,
      verifiedReceiptCount: entry.verified_receipt_count,
      counts: entry.observed_ref_counts,
    }).status;
    current[key] = entry;
    return current;
  }, {});
  const repoTrackedEvidences = [
    magRepoTrackedEvidence(input.domains),
    rcaRepoTrackedEvidence(input.domains),
    omaRepoTrackedEvidence(input.domains),
  ].filter((entry): entry is ObservedDomainEvidence => Boolean(entry));
  for (const evidence of repoTrackedEvidences) {
    addDomainEvidence(observedDomains, {
      domainId: evidence.domain_id,
      receiptRefs: evidence.observed_receipt_refs,
      counts: evidence.observed_ref_counts,
      verifiedReceiptCount: evidence.verified_receipt_count,
    });
  }
  const counts = receipts.reduce((current, receipt) => ({
    ...current,
    domain_owner_receipt_ref_count:
      current.domain_owner_receipt_ref_count + receipt.domain_owner_receipt_refs.length,
    domain_receipt_ref_count:
      current.domain_receipt_ref_count + receipt.domain_receipt_refs.length,
    no_regression_ref_count:
      current.no_regression_ref_count + receipt.no_regression_evidence_refs.length,
    owner_chain_ref_count:
      current.owner_chain_ref_count + receipt.owner_chain_refs.length,
    monitor_freshness_ref_count:
      current.monitor_freshness_ref_count + receipt.monitor_freshness_refs.length,
    runtime_event_ref_count:
      current.runtime_event_ref_count + receipt.runtime_event_refs.length,
    typed_blocker_ref_count:
      current.typed_blocker_ref_count + receipt.typed_blocker_refs.length,
  }), emptyCounts());
  for (const evidence of repoTrackedEvidences) {
    addCounts(counts, evidence.observed_ref_counts);
  }
  const status = observedStatus({
    recordedReceiptCount: receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
    verifiedReceiptCount:
      receipts.filter((receipt) => receipt.receipt_status === 'verified').length
      + repoTrackedEvidences.reduce(
        (total, evidence) => total + evidence.verified_receipt_count,
        0,
      ),
    counts,
  });
  const evidenceRouteParts = [
    'opl runtime domain-owner-payload-summary list --json',
    'MAG contracts/production_acceptance/mag-production-acceptance.json',
    'RCA contracts/owner_chain_live_progress_evidence.json',
    'OMA contracts/target_agent_owner_chain_evidence.json',
  ];
  return {
    lane: 'domain_owner_chain_scaleout',
    ...status,
    recorded_receipt_count: receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
    verified_receipt_count:
      receipts.filter((receipt) => receipt.receipt_status === 'verified').length
      + repoTrackedEvidences.reduce(
        (total, evidence) => total + evidence.verified_receipt_count,
        0,
      ),
    observed_receipt_refs: unique([
      ...receipts.map((receipt) => receipt.receipt_ref),
      ...repoTrackedEvidences.flatMap((evidence) => evidence.observed_receipt_refs),
    ]),
    observed_ref_counts: counts,
    observed_domains: Object.values(observedDomains),
    evidence_route: evidenceRouteParts.join(' + '),
  };
}

function brandModuleL5Projection(contracts: FrameworkContracts): OwnerEvidenceProjection {
  const ledger = listBrandModuleL5EvidenceReceipts(contracts);
  const receipts = recordList(ledger.receipts);
  const counts = receipts.reduce<RefCounts>((current, receipt) => ({
    ...current,
    typed_blocker_ref_count:
      current.typed_blocker_ref_count + stringList(receipt.typed_blocker_refs).length,
    evidence_ref_count:
      current.evidence_ref_count + stringList(receipt.evidence_refs).length,
    owner_acceptance_ref_count:
      current.owner_acceptance_ref_count + stringList(receipt.owner_acceptance_refs).length,
    no_regression_ref_count:
      current.no_regression_ref_count + stringList(receipt.no_regression_refs).length,
  }), emptyCounts());
  const recordedReceiptCount = receipts.filter((receipt) =>
    stringValue(receipt.receipt_status) === 'recorded'
  ).length;
  const verifiedReceiptCount = receipts.filter((receipt) =>
    stringValue(receipt.receipt_status) === 'verified'
  ).length;
  const status = observedStatus({ recordedReceiptCount, verifiedReceiptCount, counts });
  return {
    lane: 'brand_module_l5_operating_maturity',
    ...status,
    recorded_receipt_count: recordedReceiptCount,
    verified_receipt_count: verifiedReceiptCount,
    observed_receipt_refs: receipts
      .map((receipt) => stringValue(receipt.receipt_ref))
      .filter((entry): entry is string => Boolean(entry)),
    observed_ref_counts: counts,
    evidence_route: 'opl runtime brand-module-l5-evidence list --json',
  };
}

function appReleaseProjection(appReleaseEvidence: Record<string, unknown>): OwnerEvidenceProjection {
  const counts = {
    ...emptyCounts(),
    typed_blocker_ref_count: stringList(appReleaseEvidence.typed_blocker_refs).length,
    evidence_ref_count:
      stringList(appReleaseEvidence.verified_ledger_receipt_refs).length
      + stringList(appReleaseEvidence.recorded_ledger_receipt_refs).length,
  };
  const recordedReceiptCount = typeof appReleaseEvidence.recorded_ledger_receipt_ref_count === 'number'
    ? appReleaseEvidence.recorded_ledger_receipt_ref_count
    : 0;
  const verifiedReceiptCount = typeof appReleaseEvidence.verified_ledger_receipt_ref_count === 'number'
    ? appReleaseEvidence.verified_ledger_receipt_ref_count
    : 0;
  const status = observedStatus({ recordedReceiptCount, verifiedReceiptCount, counts });
  return {
    lane: 'app_release_user_path',
    ...status,
    recorded_receipt_count: recordedReceiptCount,
    verified_receipt_count: verifiedReceiptCount,
    observed_receipt_refs: unique([
      ...stringList(appReleaseEvidence.verified_ledger_receipt_refs),
      ...stringList(appReleaseEvidence.recorded_ledger_receipt_refs),
    ]),
    observed_ref_counts: counts,
    evidence_route: 'opl runtime app-release-evidence list --json',
  };
}

function providerLongSoakProjection(): OwnerEvidenceProjection {
  const receipts = listCodexAppRuntimeEvidenceReceipts();
  const counts = receipts.reduce<RefCounts>((current, receipt) => ({
    ...current,
    typed_blocker_ref_count:
      current.typed_blocker_ref_count + receipt.typed_blocker_refs.length,
    evidence_ref_count:
      current.evidence_ref_count
      + receipt.temporal_hosted_long_soak_refs.length
      + receipt.provider_state_linkage_refs.length
      + receipt.operator_evidence_refs.length,
  }), emptyCounts());
  const recordedReceiptCount = receipts.filter((receipt) =>
    receipt.receipt_status === 'recorded'
  ).length;
  const verifiedReceiptCount = receipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
  ).length;
  const status = observedStatus({ recordedReceiptCount, verifiedReceiptCount, counts });
  return {
    lane: 'provider_long_soak',
    ...status,
    recorded_receipt_count: recordedReceiptCount,
    verified_receipt_count: verifiedReceiptCount,
    observed_receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    observed_ref_counts: counts,
    evidence_route: 'opl runtime codex-app-runtime-evidence list --json',
  };
}

function privatePlatformRetirementProjection(
  physicalDeleteAuthority: Record<string, unknown>,
): OwnerEvidenceProjection {
  const prerequisitesObserved =
    booleanValue(physicalDeleteAuthority.all_repos_delete_or_keep_prerequisites_observed) === true
    && booleanValue(physicalDeleteAuthority.all_repos_all_deletion_evidence_requirements_observed) === true;
  const ownerDecisionObserved =
    stringValue(physicalDeleteAuthority.owner_decision_status)
      === 'owner_decision_observed_refs_only_not_delete_authorized';
  const observedRefCount = prerequisitesObserved
    ? numberValue(physicalDeleteAuthority.deletion_evidence_worklist_count)
    : 0;
  const observedReceiptRefs = prerequisitesObserved
    ? unique([
      `refs-only-read-model:agents-default-callers/deletion-evidence-worklist:${observedRefCount}`,
      ownerDecisionObserved
        ? 'refs-only-read-model:agents-default-callers/owner-decision-observed-not-delete-authorized'
        : '',
    ])
    : [];
  const counts = {
    ...emptyCounts(),
    evidence_ref_count: observedReceiptRefs.length,
  };
  const status = observedStatus({
    recordedReceiptCount: 0,
    verifiedReceiptCount: observedReceiptRefs.length,
    counts,
  });
  return {
    lane: 'private_platform_retirement',
    ...status,
    recorded_receipt_count: 0,
    verified_receipt_count: observedReceiptRefs.length,
    observed_receipt_refs: observedReceiptRefs,
    observed_ref_counts: counts,
    evidence_route: 'opl agents default-callers --family-defaults --json',
  };
}

function memoryArtifactLifecycleProjection(
  lifecycleEvidence: Record<string, unknown>,
): OwnerEvidenceProjection {
  const latestHandoff = record(lifecycleEvidence.latest_lifecycle_apply_handoff);
  const typedBlockerRefs = stringList(latestHandoff.typed_blocker_refs);
  const handoffRefs = stringList(latestHandoff.handoff_refs);
  const candidateRefs = stringList(latestHandoff.candidate_refs);
  const receiptRef = stringValue(latestHandoff.receipt_ref);
  const observedRefCount = numberValue(lifecycleEvidence.observed_ref_count);
  const observedReceiptRefs = unique([
    ...(receiptRef ? [receiptRef] : []),
    ...typedBlockerRefs,
    ...handoffRefs,
    ...candidateRefs,
    observedRefCount > 0
      ? `refs-only-read-model:app-operator-drilldown/memory-artifact-lifecycle:${observedRefCount}`
      : '',
  ]);
  const counts = {
    ...emptyCounts(),
    typed_blocker_ref_count: typedBlockerRefs.length,
    evidence_ref_count:
      observedReceiptRefs.length
      - typedBlockerRefs.length,
  };
  const status = observedStatus({
    recordedReceiptCount: 0,
    verifiedReceiptCount: observedReceiptRefs.length,
    counts,
  });
  return {
    lane: 'memory_artifact_lifecycle_apply',
    ...status,
    recorded_receipt_count: 0,
    verified_receipt_count: observedReceiptRefs.length,
    observed_receipt_refs: observedReceiptRefs,
    observed_ref_counts: counts,
    evidence_route: 'opl runtime app-operator-drilldown --json',
  };
}

function emptyProjection(lane: string, evidenceRoute: string): OwnerEvidenceProjection {
  const status = observedStatus({
    recordedReceiptCount: 0,
    verifiedReceiptCount: 0,
    counts: emptyCounts(),
  });
  return {
    lane,
    ...status,
    recorded_receipt_count: 0,
    verified_receipt_count: 0,
    observed_receipt_refs: [],
    observed_ref_counts: emptyCounts(),
    evidence_route: evidenceRoute,
  };
}

export function buildFoundryAgentOsOwnerEvidenceIntake(input: {
  contracts: FrameworkContracts;
  appReleaseEvidence: Record<string, unknown>;
  domainOwnerChain?: Record<string, unknown>;
  physicalDeleteAuthority?: Record<string, unknown>;
  lifecycleEvidence?: Record<string, unknown>;
}) {
  const laneEvidence = [
    domainOwnerChainProjection({
      domains: recordList(input.domainOwnerChain?.domains),
    }),
    brandModuleL5Projection(input.contracts),
    appReleaseProjection(input.appReleaseEvidence),
    providerLongSoakProjection(),
    privatePlatformRetirementProjection(record(input.physicalDeleteAuthority)),
    memoryArtifactLifecycleProjection(record(input.lifecycleEvidence)),
  ];
  return {
    surface_kind: 'foundry_agent_os_owner_evidence_intake',
    status: laneEvidence.some((entry) => entry.status === 'owner_evidence_observed_not_ready_claim')
      ? 'owner_evidence_observed_not_ready_claim'
      : 'owner_evidence_required',
    lane_evidence: laneEvidence,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_app_release_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_l5: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}
