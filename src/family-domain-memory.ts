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
    freshness: descriptor?.freshness ?? null,
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
      authority_boundary: descriptor?.authority_boundary ?? null,
      non_authority_flags: {
        opl_owns_memory_content: false,
        opl_accepts_memory_writeback: false,
        opl_writes_domain_truth: false,
        opl_authorizes_quality_verdict: false,
      },
    },
  };
}
