import type { FrameworkContracts } from './types.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { FrameworkContractError } from './contracts.ts';

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
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

function buildMemoryIndexEntry(entry: DomainManifestCatalogEntry) {
  const descriptor = entry.status === 'resolved' ? entry.manifest?.domain_memory_descriptor ?? null : null;
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
    freshness: descriptor?.freshness ?? null,
    migration_readiness: descriptor?.migration_readiness ?? null,
    ready: Boolean(descriptor),
    error: entry.error,
  };
}

function buildMemoryIndex(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const memories = catalog.projects.map(buildMemoryIndexEntry);
  return {
    domain_manifests: catalog,
    memories,
  };
}

export function buildFamilyDomainMemoryList(contracts: FrameworkContracts) {
  const index = buildMemoryIndex(contracts);
  return {
    version: 'g2',
    family_domain_memory: {
      surface_kind: 'opl_family_domain_memory_index',
      summary: {
        total_projects_count: index.memories.length,
        resolved_memory_descriptor_count: index.memories.filter((entry) => entry.ready).length,
        missing_memory_descriptor_count: index.memories.filter((entry) => !entry.ready).length,
      },
      memories: index.memories,
      notes: [
        'OPL indexes domain-owned memory locators and receipts only.',
        'Memory content, writeback acceptance, quality verdicts and artifacts remain domain-owned.',
      ],
    },
  };
}

export function buildFamilyDomainMemoryInspect(contracts: FrameworkContracts, args: string[]) {
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
  return {
    version: 'g2',
    family_domain_memory: {
      surface_kind: 'opl_family_domain_memory_inspection',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: descriptor?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
      descriptor_status: descriptor ? 'resolved' : 'missing',
      descriptor,
      migration_plan: descriptor
        ? {
            migration_plan_ref: descriptor.migration_plan_ref,
            seed_corpus_ref: descriptor.seed_corpus_ref,
            writeback_receipt_locator_ref: descriptor.writeback_receipt_locator_ref,
            migration_readiness: descriptor.migration_readiness,
            current_state: descriptor.migration_readiness?.status ?? descriptor.freshness?.status ?? 'unknown',
            opl_role: 'migration_projection_only',
          }
        : null,
      authority_boundary: descriptor?.authority_boundary ?? null,
      non_authority_flags: {
        opl_owns_memory_content: false,
        opl_accepts_memory_writeback: false,
        opl_applies_memory_migration: false,
        opl_writes_domain_truth: false,
        opl_authorizes_quality_verdict: false,
      },
    },
  };
}

export function buildFamilyDomainMemoryMigrationPlan(contracts: FrameworkContracts, args: string[]) {
  const inspected = buildFamilyDomainMemoryInspect(contracts, args).family_domain_memory;
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
      authority_boundary: inspected.authority_boundary,
      non_authority_flags: {
        opl_owns_memory_content: false,
        opl_applies_memory_migration: false,
        opl_accepts_memory_writeback: false,
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
