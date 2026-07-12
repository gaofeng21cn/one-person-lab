import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { normalizeStandardDomainAgentId } from '../../kernel/standard-agent-registry.ts';
import type { FamilyDomainMemoryRef } from './family-domain-memory-contract.ts';

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
}

function parseOptionArgs(args: string[], required: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[token.slice(2)] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return parsed;
}

type RuntimeReceiptEvidence = {
  surface_kind: 'opl_domain_memory_runtime_receipt_evidence';
  domain_id: string;
  status: 'no_runtime_closeout_refs_observed' | 'runtime_closeout_refs_observed';
  source_status: string;
  summary: {
    closeout_count: number;
    consumed_memory_ref_count: number;
    writeback_receipt_ref_count: number;
    rejected_write_count: number;
    opl_writes_memory_body: false;
  };
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: Record<string, unknown>[];
  closeout_refs: string[];
  source_refs: string[];
  authority_boundary: {
    opl: 'runtime_receipt_ref_projection_only';
    domain: 'memory_body_accept_reject_truth_owner';
    opl_writes_memory_body: false;
    opl_accepts_or_rejects_memory_writeback: false;
    opl_applies_memory_writeback: false;
  };
};

type RuntimeReceiptEvidenceIndex = {
  source_status: string;
  byDomain: Map<string, RuntimeReceiptEvidence>;
};

function buildMemoryIndexEntry(
  entry: DomainManifestCatalogEntry,
  runtimeReceiptEvidenceIndex: RuntimeReceiptEvidenceIndex,
) {
  const descriptor = entry.status === 'resolved' ? entry.manifest?.domain_memory_descriptor ?? null : null;
  const receiptProjection = descriptor ? buildReceiptProjection(descriptor) : null;
  const runtimeReceiptEvidence = buildRuntimeReceiptEvidenceForDomain(
    entry.project_id,
    runtimeReceiptEvidenceIndex,
  );
  return {
    project_id: entry.project_id,
    project: entry.project,
    binding_id: entry.binding_id,
    manifest_status: entry.status,
    target_domain_id: descriptor?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
    memory_ref_id: descriptor?.memory_ref_id ?? null,
    memory_family: descriptor?.memory_family ?? null,
    owner: descriptor?.owner ?? null,
    status: descriptor?.status ?? null,
    stage_applicability: descriptor?.stage_applicability ?? [],
    memory_pack_ref: descriptor?.memory_pack_ref ?? null,
    migration_plan_ref: descriptor?.migration_plan_ref ?? null,
    seed_corpus_ref: descriptor?.seed_corpus_ref ?? null,
    writeback_receipt_locator_ref: descriptor?.writeback_receipt_locator_ref ?? null,
    writeback_contract_ref: descriptor?.writeback_contract_ref ?? null,
    receipt_contract_ref: descriptor?.receipt_contract_ref ?? null,
    receipt_projection: receiptProjection,
    runtime_receipt_evidence: runtimeReceiptEvidence,
    freshness: descriptor?.freshness ?? null,
    migration_readiness: descriptor?.migration_readiness ?? null,
    ready: Boolean(descriptor),
    error: entry.error,
  };
}

function buildReceiptProjection(descriptor: FamilyDomainMemoryRef) {
  const authority = descriptor.authority_boundary ?? {};
  const domainOwner = authority.domain_memory_owner ?? descriptor.owner;
  return {
    status: descriptor.receipt_projection?.status ?? 'descriptor_projection_only',
    memory_locator_ref: descriptor.memory_pack_ref,
    proposal_contract_ref: descriptor.writeback_contract_ref,
    router_receipt_contract_ref: descriptor.receipt_contract_ref,
    writeback_receipt_locator_ref: descriptor.writeback_receipt_locator_ref,
    accepted_rejected_authority_owner: domainOwner,
    router_receipt_owner: domainOwner,
    opl_projection_role: 'descriptor_and_receipt_locator_projection_only',
    readiness: {
      descriptor_has_writeback_contract: Boolean(descriptor.writeback_contract_ref),
      descriptor_has_receipt_contract: Boolean(descriptor.receipt_contract_ref),
      descriptor_has_receipt_locator: Boolean(descriptor.writeback_receipt_locator_ref),
      retrieval_apply_landed: false,
      writeback_apply_landed: false,
      memory_body_migration_landed: false,
    },
    authority_flags: {
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_own_memory_body: false,
      can_authorize_quality_verdict: false,
    },
    notes: [
      'Locator, proposal, router receipt, and accepted/rejected authority remain domain-owned.',
      'OPL projects descriptor-level receipt readiness only; it does not apply writeback.',
    ],
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function emptyRuntimeReceiptEvidence(domainId: string, sourceStatus = 'ledger_empty'): RuntimeReceiptEvidence {
  return {
    surface_kind: 'opl_domain_memory_runtime_receipt_evidence',
    domain_id: domainId,
    status: 'no_runtime_closeout_refs_observed',
    source_status: sourceStatus,
    summary: {
      closeout_count: 0,
      consumed_memory_ref_count: 0,
      writeback_receipt_ref_count: 0,
      rejected_write_count: 0,
      opl_writes_memory_body: false,
    },
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    closeout_refs: [],
    source_refs: [],
    authority_boundary: {
      opl: 'runtime_receipt_ref_projection_only',
      domain: 'memory_body_accept_reject_truth_owner',
      opl_writes_memory_body: false,
      opl_accepts_or_rejects_memory_writeback: false,
      opl_applies_memory_writeback: false,
    },
  };
}

function emptyRuntimeReceiptEvidenceIndex(sourceStatus = 'runtime_receipt_evidence_not_injected'): RuntimeReceiptEvidenceIndex {
  return {
    source_status: sourceStatus,
    byDomain: new Map<string, RuntimeReceiptEvidence>(),
  };
}

function buildRuntimeReceiptEvidenceForDomain(
  domainId: string,
  runtimeReceiptEvidenceIndex: RuntimeReceiptEvidenceIndex,
) {
  return runtimeReceiptEvidenceIndex.byDomain.get(domainId)
    ?? emptyRuntimeReceiptEvidence(domainId, runtimeReceiptEvidenceIndex.source_status);
}

function summarizeRuntimeReceiptEvidence(
  memories: Array<ReturnType<typeof buildMemoryIndexEntry>>,
) {
  return {
    closeout_count: memories.reduce((sum, entry) => sum + entry.runtime_receipt_evidence.summary.closeout_count, 0),
    consumed_memory_ref_count: uniqueStrings(memories.flatMap((entry) =>
      entry.runtime_receipt_evidence.consumed_memory_refs
    )).length,
    writeback_receipt_ref_count: uniqueStrings(memories.flatMap((entry) =>
      entry.runtime_receipt_evidence.writeback_receipt_refs
    )).length,
    rejected_write_count: memories.reduce((sum, entry) =>
      sum + entry.runtime_receipt_evidence.summary.rejected_write_count, 0),
    opl_writes_memory_body: false,
  };
}

type DomainManifestCatalog = ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'];
type ManifestCatalogOptions = {
  manifestCommandTimeoutMs?: number;
  domainManifests?: DomainManifestCatalog;
  runtimeReceiptEvidenceIndex?: RuntimeReceiptEvidenceIndex;
};

function buildMemoryIndex(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const catalog = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs,
  }).domain_manifests;
  const runtimeReceiptEvidenceIndex = options.runtimeReceiptEvidenceIndex ?? emptyRuntimeReceiptEvidenceIndex();
  const memories = catalog.projects.map((entry) => buildMemoryIndexEntry(entry, runtimeReceiptEvidenceIndex));
  return {
    domain_manifests: catalog,
    memories,
  };
}

export function buildFamilyDomainMemoryList(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const index = buildMemoryIndex(contracts, options);
  return {
    version: 'g2',
    family_domain_memory: {
      surface_kind: 'opl_family_domain_memory_index',
      summary: {
        total_projects_count: index.memories.length,
        resolved_memory_descriptor_count: index.memories.filter((entry) => entry.ready).length,
        missing_memory_descriptor_count: index.memories.filter((entry) => !entry.ready).length,
        runtime_receipt_evidence: summarizeRuntimeReceiptEvidence(index.memories),
      },
      memories: index.memories,
      notes: [
        'OPL indexes domain-owned memory locators and receipts only.',
        'Memory content, writeback acceptance, quality verdicts and artifacts remain domain-owned.',
      ],
    },
  };
}

export function buildFamilyDomainMemoryInspect(
  contracts: FrameworkContracts,
  args: string[],
  options: ManifestCatalogOptions = {},
) {
  const parsed = parseOptionArgs(args, ['domain']);
  const normalized = normalizeDomainSelection(parsed.domain);
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const entry = catalog.projects.find((candidate) => {
    const descriptor = candidate.status === 'resolved' ? candidate.manifest?.domain_memory_descriptor ?? null : null;
    return candidate.project_id === normalized
      || candidate.project === normalized
      || candidate.manifest?.target_domain_id === parsed.domain
      || candidate.manifest?.target_domain_id === normalized
      || descriptor?.target_domain_id === parsed.domain
      || descriptor?.target_domain_id === normalized;
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family domain memory domain: ${parsed.domain}.`, {
      domain: parsed.domain,
      allowed_domains: catalog.projects.map((project) => project.project_id),
    });
  }

  const descriptor = entry.status === 'resolved' ? entry.manifest?.domain_memory_descriptor ?? null : null;
  const receiptProjection = descriptor ? buildReceiptProjection(descriptor) : null;
  const runtimeReceiptEvidence = buildRuntimeReceiptEvidenceForDomain(
    entry.project_id,
    options.runtimeReceiptEvidenceIndex ?? emptyRuntimeReceiptEvidenceIndex(),
  );
  return {
    version: 'g2',
    family_domain_memory: {
      surface_kind: 'opl_family_domain_memory_inspection',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: descriptor?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
      descriptor_status: descriptor ? 'resolved' : 'missing',
      descriptor,
      receipt_projection: receiptProjection,
      runtime_receipt_evidence: runtimeReceiptEvidence,
      migration_plan: descriptor
        ? {
            migration_plan_ref: descriptor.migration_plan_ref,
            seed_corpus_ref: descriptor.seed_corpus_ref,
            writeback_receipt_locator_ref: descriptor.writeback_receipt_locator_ref,
            writeback_contract_ref: descriptor.writeback_contract_ref,
            receipt_contract_ref: descriptor.receipt_contract_ref,
            receipt_projection: receiptProjection,
            runtime_receipt_evidence: runtimeReceiptEvidence,
            migration_readiness: descriptor.migration_readiness,
            current_state: descriptor.migration_readiness?.status ?? descriptor.freshness?.status ?? 'unknown',
            opl_role: 'migration_projection_only',
          }
        : null,
      authority_boundary: descriptor?.authority_boundary ?? null,
      non_authority_flags: {
        opl_owns_memory_content: false,
        opl_accepts_memory_writeback: false,
        opl_accepts_or_rejects_memory_writeback: false,
        opl_applies_memory_migration: false,
        opl_applies_memory_writeback: false,
        opl_writes_domain_truth: false,
        opl_authorizes_quality_verdict: false,
      },
    },
  };
}

export function buildFamilyDomainMemoryMigrationPlan(
  contracts: FrameworkContracts,
  args: string[],
  options: ManifestCatalogOptions = {},
) {
  const inspected = buildFamilyDomainMemoryInspect(contracts, args, options).family_domain_memory;
  const descriptor = inspected.descriptor;
  if (!descriptor) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Domain memory descriptor is missing for ${inspected.project_id}.`,
      {
        domain: inspected.project_id,
        descriptor_status: inspected.descriptor_status,
      },
    );
  }

  return {
    version: 'g2',
    family_domain_memory_migration_plan: {
      surface_kind: 'opl_family_domain_memory_migration_plan_projection',
      project_id: inspected.project_id,
      project: inspected.project,
      target_domain_id: inspected.target_domain_id,
      memory_ref_id: descriptor.memory_ref_id,
      memory_family: descriptor.memory_family,
      owner: descriptor.owner,
      migration_plan_ref: descriptor.migration_plan_ref,
      seed_corpus_ref: descriptor.seed_corpus_ref,
      writeback_receipt_locator_ref: descriptor.writeback_receipt_locator_ref,
      migration_readiness: descriptor.migration_readiness,
      retrieval_contract_ref: descriptor.retrieval_contract_ref,
      writeback_contract_ref: descriptor.writeback_contract_ref,
      receipt_contract_ref: descriptor.receipt_contract_ref,
      recall_projection_ref: descriptor.recall_projection_ref,
      receipt_projection: buildReceiptProjection(descriptor),
      runtime_receipt_evidence: inspected.runtime_receipt_evidence,
      authority_boundary: inspected.authority_boundary,
      non_authority_flags: {
        opl_owns_memory_content: false,
        opl_applies_memory_migration: false,
        opl_accepts_memory_writeback: false,
        opl_accepts_or_rejects_memory_writeback: false,
        opl_applies_memory_writeback: false,
        opl_writes_domain_truth: false,
        opl_authorizes_quality_verdict: false,
      },
      notes: [
        'This is a projection over domain-owned migration and receipt locators.',
        'Apply, accept/reject, memory body storage, and quality decisions remain domain-owned.',
      ],
    },
  };
}
