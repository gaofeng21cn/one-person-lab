import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../charter/index.ts';
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
  has_references: boolean;
  has_scripts: boolean;
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

function readSkillCard(sourceRoot: string, skillId: string): SkillCard | null {
  const safeSkillId = assertSafeSkillId(skillId);
  const skillRoot = path.join(sourceRoot, 'skills', safeSkillId);
  const skillPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const markdown = readTextIfPresent(skillPath);
  const frontmatter = extractFrontmatter(markdown);
  const name = firstYamlString(frontmatter, 'name') || safeSkillId;
  return {
    skill_id: safeSkillId,
    name,
    description: firstYamlString(frontmatter, 'description'),
    source_path: skillRoot,
    has_references: fs.existsSync(path.join(skillRoot, 'references')),
    has_scripts: fs.existsSync(path.join(skillRoot, 'scripts')),
    required_environment_variables: extractRequiredEnvironmentVariables(frontmatter),
    allowed_tools: extractStringList(frontmatter, 'allowed-tools'),
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
  const haystack = `${card.skill_id} ${card.name} ${card.description}`.toLowerCase();
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
  };
}

function sourceDigest(sourceId: string, skillId: string, sourceRoot: string) {
  return crypto.createHash('sha256').update(JSON.stringify({
    source_id: sourceId,
    skill_id: skillId,
    source_root: sourceRoot,
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
        install_policy: source.install_policy,
        discovery_policy: source.discovery_policy,
        skill_count: cards.length,
        next_action: source.next_action,
      }],
      skills: cards,
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
        ledger_receipt_candidate_ref: `opl://ledger/connect/external-skills/${sourceDigest(source.source_id, skillId, source.source_root!)}`,
      },
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
    skill_id: skillId,
    target_scope: input.scope,
    target_root: targetRoot,
    skill_root: targetSkillRoot,
    sync_policy: 'single_skill_selected_by_user_or_mas_route',
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
        external_skill_sync_ref: `opl://connect/external-skills/${source.source_id}/${skillId}/sync/${sourceDigest(source.source_id, skillId, source.source_root!)}`,
      },
      authority_boundary: authorityBoundary(),
    },
  };
}
