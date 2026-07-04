import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../workspace/index.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

type ExternalSkillSourceId = 'kdense-scientific-agent-skills';
type ExternalSkillScope = 'workspace' | 'quest';

export type ExternalSkillInput = {
  source?: string;
  sourceRoot?: string;
  registryRoot?: string;
};

export type ExternalSkillSourceAddInput = ExternalSkillInput & {
  repo: string;
  pin: string;
};

export type ExternalSkillSearchInput = ExternalSkillInput & {
  query: string;
  limit: number;
};

export type ExternalSkillInspectInput = ExternalSkillInput & {
  skill: string;
};

export type ExternalSkillSyncInput = ExternalSkillInspectInput & {
  scope: ExternalSkillScope;
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
};

type SkillCard = {
  skill_id: string;
  name: string;
  description: string;
  source_path: string;
  source_license: string | null;
  content_sha256: string;
  has_references: boolean;
  has_scripts: boolean;
  keywords: string[];
  risk_flags: string[];
  category: string;
  required_environment_variables: string[];
  allowed_tools: string[];
};

const KDENSE_SOURCE = {
  source_id: 'kdense-scientific-agent-skills' satisfies ExternalSkillSourceId,
  aliases: ['kdense', 'k-dense', 'K-Dense-AI/scientific-agent-skills'],
  label: 'K-Dense Scientific Agent Skills',
  repo_url: 'https://github.com/K-Dense-AI/scientific-agent-skills',
  default_branch: 'main',
  source_kind: 'external_agent_skill_library',
  env_root: 'OPL_CONNECT_KDENSE_SCIENTIFIC_AGENT_SKILLS_ROOT',
};

const EXTERNAL_SKILL_TRIGGER_POLICY = {
  policy_kind: 'opl_connect_external_skill_trigger_policy',
  default_mas_pack_remains_primary: true,
  external_skill_requires_explicit_selection: true,
  applies_when: 'default_mas_medical_paper_pack_does_not_cover_specialist_task',
  coarse_entry_policy: 'ask_connect_before_loading_external_skill_library',
  context_loading_policy: 'do_not_bulk_load_external_skill_library',
  trigger_signals: [
    'explicit_tool_package_database_or_workflow_name',
    'default_professional_skill_route_back',
    'mas_stage_detects_capability_outside_default_eight_skills',
    'governed_external_resource_or_environment_requirement',
  ],
};

type ExternalSkillSourceRegistration = {
  source_id: ExternalSkillSourceId;
  repo_url: string;
  pinned_ref: string;
  source_root?: string;
};

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSourceId(value?: string): ExternalSkillSourceId {
  const raw = normalizeOptionalString(value) ?? KDENSE_SOURCE.source_id;
  if (raw === KDENSE_SOURCE.source_id || KDENSE_SOURCE.aliases.includes(raw)) {
    return 'kdense-scientific-agent-skills';
  }
  throw new FrameworkContractError('codex_command_failed', 'Unknown OPL Connect external skill source.', {
    source: raw,
    supported_sources: [KDENSE_SOURCE.source_id, ...KDENSE_SOURCE.aliases],
  });
}

function sourceRegistryPath(input: ExternalSkillInput = {}) {
  const explicitRoot = normalizeOptionalString(input.registryRoot);
  const root = explicitRoot ? path.resolve(explicitRoot) : resolveDefaultFamilyWorkspaceRoot();
  return path.join(root, '.opl', 'connect', 'external-skill-sources.json');
}

function readSourceRegistry(input: ExternalSkillInput = {}) {
  const registryPath = sourceRegistryPath(input);
  if (!fs.existsSync(registryPath)) {
    return {
      registry_path: registryPath,
      sources: [] as ExternalSkillSourceRegistration[],
    };
  }
  const parsed = parseJsonText(readTextIfPresent(registryPath)) as {
    sources?: Array<Partial<ExternalSkillSourceRegistration>>;
  };
  return {
    registry_path: registryPath,
    sources: (parsed.sources ?? []).flatMap((entry) => {
      try {
        const sourceId = normalizeSourceId(String(entry.source_id ?? ''));
        const repoUrl = normalizeOptionalString(entry.repo_url);
        const pinnedRef = normalizeOptionalString(entry.pinned_ref);
        if (!repoUrl || !pinnedRef) return [];
        return [{
          source_id: sourceId,
          repo_url: repoUrl,
          pinned_ref: pinnedRef,
          source_root: normalizeOptionalString(entry.source_root) ?? undefined,
        }];
      } catch {
        return [];
      }
    }),
  };
}

function registeredSource(input: ExternalSkillInput) {
  const sourceId = normalizeSourceId(input.source);
  return readSourceRegistry(input).sources.find((entry) => entry.source_id === sourceId) ?? null;
}

function candidateSourceRoots(input: ExternalSkillInput) {
  const explicit = normalizeOptionalString(input.sourceRoot);
  const envRoot = normalizeOptionalString(process.env[KDENSE_SOURCE.env_root]);
  const registeredRoot = normalizeOptionalString(registeredSource(input)?.source_root);
  return [
    explicit ? path.resolve(explicit) : null,
    envRoot ? path.resolve(envRoot) : null,
    registeredRoot ? path.resolve(registeredRoot) : null,
    path.join(resolveDefaultFamilyWorkspaceRoot(), 'scientific-agent-skills'),
    path.join(resolveDefaultFamilyWorkspaceRoot(), 'k-dense-scientific-agent-skills'),
    '/tmp/kdense-scientific-agent-skills',
  ].filter((entry): entry is string => Boolean(entry));
}

function hasSkillRoot(sourceRoot: string) {
  return fs.existsSync(path.join(sourceRoot, 'skills'))
    && fs.statSync(path.join(sourceRoot, 'skills')).isDirectory();
}

function resolveSource(input: ExternalSkillInput = {}) {
  const sourceId = normalizeSourceId(input.source);
  const registry = readSourceRegistry(input);
  const registered = registry.sources.find((entry) => entry.source_id === sourceId) ?? null;
  const sourceRoot = candidateSourceRoots(input).find((candidate) => fs.existsSync(candidate) && hasSkillRoot(candidate))
    ?? candidateSourceRoots(input)[0]
    ?? null;
  const available = Boolean(sourceRoot && fs.existsSync(sourceRoot) && hasSkillRoot(sourceRoot));
  return {
    ...KDENSE_SOURCE,
    source_id: sourceId,
    repo_url: registered?.repo_url ?? KDENSE_SOURCE.repo_url,
    pinned_ref: registered?.pinned_ref ?? null,
    source_root: sourceRoot,
    registry_path: registry.registry_path,
    registered: Boolean(registered),
    status: available ? 'available' : 'source_missing',
    install_policy: 'selective_sync_only',
    default_install: false,
    can_install_all_skills_by_default: false,
    default_mas_pack_remains_primary: true,
    external_skill_requires_explicit_selection: true,
    discovery_policy: 'manifest_index_then_explicit_skill_sync',
    next_action: available
      ? null
      : `set ${KDENSE_SOURCE.env_root}=<local scientific-agent-skills checkout> or pass --source-root <path>`,
  };
}

export function runOplConnectExternalSkillsSourceAdd(input: ExternalSkillSourceAddInput) {
  const sourceId = normalizeSourceId(input.source);
  const repoUrl = normalizeOptionalString(input.repo);
  const pinnedRef = normalizeOptionalString(input.pin);
  if (!repoUrl || !pinnedRef) {
    throw new FrameworkContractError('codex_command_failed', 'External skill source registration requires --repo and --pin.', {
      required: ['--repo', '--pin'],
    });
  }

  const registry = readSourceRegistry(input);
  const sourceRoot = normalizeOptionalString(input.sourceRoot) ?? undefined;
  const source: ExternalSkillSourceRegistration = {
    source_id: sourceId,
    repo_url: repoUrl,
    pinned_ref: pinnedRef,
    ...(sourceRoot ? { source_root: path.resolve(sourceRoot) } : {}),
  };
  const nextSources = [
    ...registry.sources.filter((entry) => entry.source_id !== sourceId),
    source,
  ].sort((a, b) => a.source_id.localeCompare(b.source_id));
  const payload = {
    registry_kind: 'opl_connect_external_skill_source_registry',
    version: 'g2',
    sources: nextSources,
  };
  fs.mkdirSync(path.dirname(registry.registry_path), { recursive: true });
  fs.writeFileSync(registry.registry_path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return {
    version: 'g2',
    opl_connect_external_skills: {
      surface_kind: 'opl_connect_external_skill_source_registration',
      status: 'registered',
      source,
      registry_path: registry.registry_path,
      clone_policy: 'operator_managed_checkout',
      next_action: sourceRoot
        ? 'run list/search/inspect against the registered source'
        : `clone ${repoUrl} at ${pinnedRef}, then rerun sources add with --source-root <checkout>`,
      authority_boundary: authorityBoundary(),
    },
  };
}

function readTextIfPresent(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function digestDirectory(root: string) {
  const hash = crypto.createHash('sha256');
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      hash.update(relative);
      hash.update('\0');
      hash.update(fs.readFileSync(absolute));
      hash.update('\0');
    }
  };
  walk(root);
  return hash.digest('hex');
}

function detectSourceLicense(sourceRoot: string) {
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']
    .map((fileName) => path.join(sourceRoot, fileName))
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!licenseFile) return null;
  const licenseText = readTextIfPresent(licenseFile).slice(0, 2000).toLowerCase();
  if (licenseText.includes('mit license')) return 'MIT';
  if (licenseText.includes('apache license')) return 'Apache';
  if (licenseText.includes('bsd license')) return 'BSD';
  if (licenseText.includes('gnu general public license')) return 'GPL';
  if (licenseText.includes('creative commons')) return 'Creative Commons';
  return path.basename(licenseFile);
}

function firstYamlString(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function extractFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? '';
}

function extractStringList(frontmatter: string, key: string) {
  const lineValue = firstYamlString(frontmatter, key);
  if (!lineValue) return [];
  if (lineValue.startsWith('[')) {
    try {
      const parsed = parseJsonText(lineValue);
      return Array.isArray(parsed)
        ? parsed.map((entry) => typeof entry === 'string' ? entry : null).filter((entry): entry is string => Boolean(entry))
        : [];
    } catch {
      return [];
    }
  }
  return [lineValue];
}

function parseYamlListBlock(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)+)`, 'm'));
  if (!match) return [];
  return match[1].split('\n')
    .map((line) => line.trim().replace(/^-\s+/, '').trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function extractRequiredEnvironmentVariables(frontmatter: string) {
  const lineValue = firstYamlString(frontmatter, 'required_environment_variables');
  if (!lineValue.startsWith('[')) return [];
  try {
    const parsed = parseJsonText(lineValue) as Array<{ name?: unknown }>;
    return Array.isArray(parsed)
      ? parsed.map((entry) => typeof entry.name === 'string' ? entry.name : null).filter((entry): entry is string => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

function assertSafeSkillId(skill: string) {
  const skillId = normalizeOptionalString(skill);
  if (!skillId || skillId.includes('/') || skillId.includes('\\') || skillId === '.' || skillId === '..') {
    throw new FrameworkContractError('codex_command_failed', 'External skill id must be a single directory name.', {
      skill,
    });
  }
  return skillId;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function inferSkillCategory(skillId: string, name: string, description: string) {
  const haystack = `${skillId} ${name} ${description}`.toLowerCase();
  const categories: Array<[string, string[]]> = [
    ['omics', ['single-cell', 'scrna', 'rna-seq', 'rnaseq', 'scanpy', 'deseq', 'pathway', 'omics']],
    ['clinical_ai', ['pyhealth', 'clinical decision', 'treatment', 'ehr', 'mimic']],
    ['workflow_compute', ['nextflow', 'modal', 'hpc', 'cloud', 'pipeline']],
    ['chemistry', ['rdkit', 'molecule', 'compound', 'cheminformatics']],
    ['literature', ['literature', 'paper', 'citation', 'pubmed', 'doi', 'review']],
    ['visualization', ['visualization', 'plot', 'matplotlib', 'seaborn', 'schematic', 'infographic', 'figure']],
    ['statistics', ['statistical', 'statistics', 'power', 'experimental design', 'statsmodels', 'eda']],
    ['writing', ['writing', 'manuscript', 'venue', 'template']],
    ['database', ['database', 'lookup', 'api', 'clinicaltrials']],
  ];
  return categories.find(([, needles]) => needles.some((needle) => haystack.includes(needle)))?.[0] ?? 'general_scientific_skill';
}

function inferSkillKeywords(skillId: string, name: string, description: string, frontmatter: string) {
  const frontmatterKeywords = [
    ...extractStringList(frontmatter, 'keywords'),
    ...parseYamlListBlock(frontmatter, 'keywords'),
    ...extractStringList(frontmatter, 'tags'),
    ...parseYamlListBlock(frontmatter, 'tags'),
  ];
  const lexical = tokenize(`${skillId} ${name} ${description}`)
    .filter((token) => token.length >= 3)
    .filter((token) => !['and', 'the', 'with', 'for', 'from', 'using', 'into', 'standard'].includes(token));
  return uniqueSorted([...frontmatterKeywords, ...lexical]).slice(0, 30);
}

function inferRiskFlags(card: Pick<SkillCard, 'skill_id' | 'name' | 'description' | 'has_scripts' | 'required_environment_variables' | 'allowed_tools'>) {
  const haystack = `${card.skill_id} ${card.name} ${card.description}`.toLowerCase();
  const flags: string[] = [];
  if (card.required_environment_variables.length > 0) flags.push('external_credentials_or_api_key_declared');
  if (card.has_scripts) flags.push('executable_script_present');
  if (card.allowed_tools.length > 0) flags.push('tool_allowlist_declared');
  if (/(modal|cloud|hpc|gpu|remote|cluster)/.test(haystack)) flags.push('cloud_or_remote_compute_review');
  if (/(nextflow|scanpy|deseq|pydeseq|rdkit|pyhealth|statsmodels)/.test(haystack)) flags.push('specialist_runtime_environment_review');
  if (/(database|api|pubmed|clinicaltrials|semantic scholar|openalex|crossref)/.test(haystack)) flags.push('external_database_or_api_review');
  if (/(clinical|patient|ehr|mimic|health)/.test(haystack)) flags.push('sensitive_or_clinical_data_policy_review');
  return flags.length > 0 ? uniqueSorted(flags) : ['no_declared_runtime_risk'];
}

function readSkillCard(sourceRoot: string, skillId: string): SkillCard | null {
  const safeSkillId = assertSafeSkillId(skillId);
  const skillRoot = path.join(sourceRoot, 'skills', safeSkillId);
  const skillPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const markdown = readTextIfPresent(skillPath);
  const frontmatter = extractFrontmatter(markdown);
  const name = firstYamlString(frontmatter, 'name') || safeSkillId;
  const baseCard = {
    skill_id: safeSkillId,
    name,
    description: firstYamlString(frontmatter, 'description'),
    source_path: skillRoot,
    source_license: detectSourceLicense(sourceRoot),
    content_sha256: digestDirectory(skillRoot),
    has_references: fs.existsSync(path.join(skillRoot, 'references')),
    has_scripts: fs.existsSync(path.join(skillRoot, 'scripts')),
    required_environment_variables: extractRequiredEnvironmentVariables(frontmatter),
    allowed_tools: extractStringList(frontmatter, 'allowed-tools'),
  };
  return {
    ...baseCard,
    keywords: inferSkillKeywords(safeSkillId, name, baseCard.description, frontmatter),
    risk_flags: inferRiskFlags(baseCard),
    category: inferSkillCategory(safeSkillId, name, baseCard.description),
  };
}

function listSkillCards(sourceRoot: string) {
  const skillsRoot = path.join(sourceRoot, 'skills');
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkillCard(sourceRoot, entry.name))
    .filter((entry): entry is SkillCard => Boolean(entry))
    .sort((a, b) => a.skill_id.localeCompare(b.skill_id));
}

function tokenize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreSkill(card: SkillCard, query: string) {
  const haystack = `${card.skill_id} ${card.name} ${card.description} ${card.category} ${card.keywords.join(' ')} ${card.risk_flags.join(' ')}`.toLowerCase();
  return tokenize(query).reduce((score, token) => {
    if (card.skill_id.toLowerCase() === token || card.name.toLowerCase() === token) return score + 10;
    if (card.skill_id.toLowerCase().includes(token)) return score + 6;
    if (card.name.toLowerCase().includes(token)) return score + 4;
    if (haystack.includes(token)) return score + 2;
    return score;
  }, 0);
}

function requireAvailableSource(input: ExternalSkillInput) {
  const source = resolveSource(input);
  if (source.status !== 'available' || !source.source_root) {
    throw new FrameworkContractError('codex_command_failed', 'External skill source is not available for OPL Connect.', {
      source_id: source.source_id,
      source_root: source.source_root,
      next_action: source.next_action,
    });
  }
  return source;
}

function authorityBoundary() {
  return {
    read_only: true,
    selective_sync_only: true,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_publication_readiness: false,
    can_install_all_skills_by_default: false,
    default_mas_pack_remains_primary: true,
    external_skill_requires_explicit_selection: true,
  };
}

function sourceDigest(sourceId: string, skillId: string, sourceRepoUrl: string, sourcePinnedRef: string | null, contentSha256: string) {
  return crypto.createHash('sha256').update(JSON.stringify({
    source_id: sourceId,
    skill_id: skillId,
    source_repo_url: sourceRepoUrl,
    source_pinned_ref: sourcePinnedRef,
    content_sha256: contentSha256,
  })).digest('hex');
}

function syncTargetRoot(input: ExternalSkillSyncInput) {
  if (input.targetRoot) return path.resolve(input.targetRoot);
  if (input.scope === 'workspace' && input.targetWorkspace) return path.resolve(input.targetWorkspace);
  if (input.scope === 'quest' && input.targetQuest) return path.resolve(input.targetQuest);
  throw new FrameworkContractError('codex_command_failed', 'External skill sync requires a target root for the selected scope.', {
    scope: input.scope,
    required: input.scope === 'workspace'
      ? ['--target-workspace <path> or --target-root <path>']
      : ['--target-quest <path> or --target-root <path>'],
  });
}

export function runOplConnectExternalSkillsList(input: ExternalSkillInput = {}) {
  const source = resolveSource(input);
  const cards = source.status === 'available' && source.source_root ? listSkillCards(source.source_root) : [];
  return {
    version: 'g2',
    opl_connect_external_skills: {
      surface_kind: 'opl_connect_external_skill_library_index',
      status: source.status,
      registry_path: source.registry_path,
      sources: [{
        source_id: source.source_id,
        label: source.label,
        repo_url: source.repo_url,
        pinned_ref: source.pinned_ref,
        source_kind: source.source_kind,
        source_root: source.source_root,
        registered: source.registered,
        status: source.status,
        default_install: source.default_install,
        can_install_all_skills_by_default: source.can_install_all_skills_by_default,
        default_mas_pack_remains_primary: source.default_mas_pack_remains_primary,
        external_skill_requires_explicit_selection: source.external_skill_requires_explicit_selection,
        install_policy: source.install_policy,
        discovery_policy: source.discovery_policy,
        trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
        skill_count: cards.length,
        next_action: source.next_action,
      }],
      skills: cards,
      trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
      authority_boundary: authorityBoundary(),
    },
  };
}

export function runOplConnectExternalSkillsSearch(input: ExternalSkillSearchInput) {
  const source = requireAvailableSource(input);
  const results = listSkillCards(source.source_root!)
    .map((card) => ({ ...card, match_score: scoreSkill(card, input.query) }))
    .filter((card) => card.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score || a.skill_id.localeCompare(b.skill_id))
    .slice(0, input.limit);
  return {
    version: 'g2',
    opl_connect_external_skills: {
      surface_kind: 'opl_connect_external_skill_search',
      status: 'completed',
      source_id: source.source_id,
      source_repo_url: source.repo_url,
      source_pinned_ref: source.pinned_ref,
      source_root: source.source_root,
      query: input.query,
      results,
      result_skill_ids: results.map((entry) => entry.skill_id),
      trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
      authority_boundary: authorityBoundary(),
    },
  };
}

export function runOplConnectExternalSkillsInspect(input: ExternalSkillInspectInput) {
  const source = requireAvailableSource(input);
  const skillId = assertSafeSkillId(input.skill);
  const card = readSkillCard(source.source_root!, skillId);
  if (!card) {
    throw new FrameworkContractError('codex_command_failed', 'External skill was not found in the selected source.', {
      source_id: source.source_id,
      skill_id: skillId,
    });
  }
  return {
    version: 'g2',
    opl_connect_external_skills: {
      surface_kind: 'opl_connect_external_skill_inspect',
      status: 'completed',
      source_id: source.source_id,
      source_repo_url: source.repo_url,
      source_pinned_ref: source.pinned_ref,
      source_root: source.source_root,
      skill: card,
      sync_command_ref: `opl connect external-skills sync --source ${source.source_id} --skill ${skillId} --scope workspace --target-workspace <workspace-root> --json`,
      receipt_refs: {
        external_skill_source_ref: `opl://connect/external-skills/${source.source_id}/${skillId}`,
        ledger_receipt_candidate_ref: `opl://ledger/connect/external-skills/${sourceDigest(source.source_id, skillId, source.repo_url, source.pinned_ref, card.content_sha256)}`,
      },
      trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
      authority_boundary: authorityBoundary(),
    },
  };
}

export function runOplConnectExternalSkillsSync(input: ExternalSkillSyncInput) {
  const source = requireAvailableSource(input);
  const skillId = assertSafeSkillId(input.skill);
  const card = readSkillCard(source.source_root!, skillId);
  if (!card) {
    throw new FrameworkContractError('codex_command_failed', 'External skill was not found in the selected source.', {
      source_id: source.source_id,
      skill_id: skillId,
    });
  }
  const targetRoot = syncTargetRoot(input);
  const targetSkillRoot = path.join(targetRoot, '.codex', 'skills', skillId);
  fs.rmSync(targetSkillRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetSkillRoot), { recursive: true });
  fs.cpSync(card.source_path, targetSkillRoot, { recursive: true });
  fs.rmSync(path.join(targetSkillRoot, '.git'), { recursive: true, force: true });

  const receipt = {
    receipt_kind: 'opl_connect_external_skill_sync_receipt',
    source_id: source.source_id,
    source_repo_url: source.repo_url,
    source_pinned_ref: source.pinned_ref,
    source_root: source.source_root,
    skill_content_sha256: card.content_sha256,
    skill_id: skillId,
    skill_keywords: card.keywords,
    skill_category: card.category,
    skill_risk_flags: card.risk_flags,
    source_license: card.source_license,
    target_scope: input.scope,
    target_root: targetRoot,
    skill_root: targetSkillRoot,
    sync_policy: 'single_skill_selected_by_user_or_mas_route',
    trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
    authority_boundary: authorityBoundary(),
  };
  const receiptPath = path.join(targetSkillRoot, '.opl-install-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return {
    version: 'g2',
    opl_connect_external_skills: {
      surface_kind: 'opl_connect_external_skill_sync',
      status: 'synced',
      source_id: source.source_id,
      source_repo_url: source.repo_url,
      source_pinned_ref: source.pinned_ref,
      source_root: source.source_root,
      skill: card,
      target_scope: input.scope,
      target_root: targetRoot,
      target_skill_root: targetSkillRoot,
      install_receipt_path: receiptPath,
      copied_roots: fs.readdirSync(targetSkillRoot).sort(),
      receipt_refs: {
        external_skill_sync_ref: `opl://connect/external-skills/${source.source_id}/${skillId}/sync/${sourceDigest(source.source_id, skillId, source.repo_url, source.pinned_ref, card.content_sha256)}`,
      },
      trigger_policy: EXTERNAL_SKILL_TRIGGER_POLICY,
      authority_boundary: authorityBoundary(),
    },
  };
}
