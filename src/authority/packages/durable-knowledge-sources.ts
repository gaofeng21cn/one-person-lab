import fs from 'node:fs';
import path from 'node:path';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import bindingsSchema from '../../../contracts/opl-framework/knowledge-source-bindings.schema.json' with { type: 'json' };
import registrySchema from '../../../contracts/opl-framework/knowledge-source-registry.schema.json' with { type: 'json' };
import {
  containedKnowledgeFile, itemSchema, knowledgeCurrentness, knowledgeDigest, knowledgeFailure,
  normalizeKnowledgeItem, validateKnowledgeRef, type DurableKnowledgeItem, type KnowledgeDependency,
} from './durable-knowledge-model.ts';

export const KNOWLEDGE_BINDINGS_REF = 'shared/memory/knowledge-bindings.json';
export type KnowledgeSource = {
  source_id: string; root: string; status: 'active' | 'revoked'; writable: boolean;
  include_globs?: string[]; exclude_globs?: string[]; discovery_max_bytes?: number;
  grants: Array<{ workspace_root: string; domains: string[]; write_domains?: string[]; project_ids?: string[]; scope_ids?: string[] }>;
};
export type KnowledgeSourceRegistry = {
  surface_kind: 'opl_knowledge_source_registry'; version: 'knowledge-source-registry.v2';
  registry_id: string; owner: string; sources: KnowledgeSource[]; items: DurableKnowledgeItem[];
};
type SourceBinding = { registry_ref: string; source_ids: string[]; scope_ids: string[] };
type SourceBindings = {
  surface_kind: 'opl_knowledge_source_bindings'; version: 'knowledge-source-bindings.v2';
  registries: SourceBinding[]; required_knowledge_ids?: string[];
  requirement_bindings?: Array<{ requirement_id: string; semantic_owner_ref: string; owner_id: string; knowledge_ids: string[] }>;
};
export type SourceInput = { workspaceRoot: string; projectRoot?: string | null; domainId: string; now?: Date };
export type BoundKnowledgeItem = {
  item: DurableKnowledgeItem; source: KnowledgeSource; registryRef: string;
  registry: KnowledgeSourceRegistry; issue: string | null;
};

export function knowledgeProjectIdentity(workspaceRoot: string, projectRoot?: string | null): string | null {
  if (!projectRoot) return null;
  const root = fs.realpathSync(workspaceRoot);
  const project = fs.realpathSync(projectRoot);
  if (project === root || !project.startsWith(`${root}${path.sep}`)) knowledgeFailure('Project knowledge root must be a distinct descendant of its workspace.');
  const index = path.join(root, 'workspace_index.json');
  if (!fs.existsSync(index)) return null;
  const parsed = JSON.parse(fs.readFileSync(containedKnowledgeFile(root, 'workspace_index.json'), 'utf8'));
  const projects: Array<{ project_id?: string; project_root?: string }> = Array.isArray(parsed.projects) ? parsed.projects : [];
  const matches = projects.filter((candidate) => {
    if (typeof candidate.project_id !== 'string' || typeof candidate.project_root !== 'string') return false;
    const expected = path.resolve(root, candidate.project_root);
    return expected.startsWith(`${root}${path.sep}`) && fs.existsSync(expected) && fs.realpathSync(expected) === project;
  });
  if (matches.length > 1) knowledgeFailure('Knowledge project identity is ambiguous.');
  return matches[0]?.project_id ?? null;
}
function matchingGrants(source: KnowledgeSource, item: DurableKnowledgeItem, input: SourceInput, projectId: string | null) {
  const workspace = fs.realpathSync(input.workspaceRoot);
  return source.grants.filter((grant) => path.isAbsolute(grant.workspace_root)
    && fs.existsSync(grant.workspace_root) && fs.realpathSync(grant.workspace_root) === workspace
    && grant.domains.includes(input.domainId)
    && (!grant.scope_ids || grant.scope_ids.includes(item.scope.id))
    && (!grant.project_ids || (projectId !== null && grant.project_ids.includes(projectId))));
}
function sourceIssue(source: KnowledgeSource, item: DurableKnowledgeItem, input: SourceInput, projectId: string | null) {
  if (source.status !== 'active') return `knowledge_source_revoked:${item.knowledge_id}`;
  if (!path.isAbsolute(source.root)) return `knowledge_source_root_invalid:${item.knowledge_id}`;
  return matchingGrants(source, item, input, projectId).length ? null : `knowledge_source_unauthorized:${item.knowledge_id}`;
}
function sourcePathAllowed(source: KnowledgeSource, ref: string) {
  return (!source.include_globs?.length || source.include_globs.some((pattern) => path.matchesGlob(ref, pattern)))
    && !source.exclude_globs?.some((pattern) => path.matchesGlob(ref, pattern));
}
export function readBoundKnowledgeSources(input: SourceInput) {
  const bindingsPath = path.join(input.workspaceRoot, KNOWLEDGE_BINDINGS_REF);
  if (!fs.existsSync(bindingsPath)) return { entries: [] as BoundKnowledgeItem[], qualityDebt: ['knowledge_sources_not_bound'], requiredIds: [] as string[], requirementBindings: [] as NonNullable<SourceBindings['requirement_bindings']> };
  const value = JSON.parse(fs.readFileSync(containedKnowledgeFile(input.workspaceRoot, KNOWLEDGE_BINDINGS_REF), 'utf8'));
  assertJsonSchemaPayload({ schemaId: bindingsSchema.$id, schema: bindingsSchema }, value);
  const bindings = value as SourceBindings;
  if (new Set(bindings.requirement_bindings?.map((binding) => binding.requirement_id)).size !== (bindings.requirement_bindings?.length ?? 0)) knowledgeFailure('Knowledge requirement bindings must be unique.');
  const projectId = knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot);
  const entries: BoundKnowledgeItem[] = [];
  const qualityDebt: string[] = [];
  const outsideCaller = new Set<string>();
  const seenRegistries = new Set<string>();
  for (const binding of bindings.registries) {
    if (!path.isAbsolute(binding.registry_ref)) knowledgeFailure('Knowledge registry binding must be an absolute local path.');
    if (!fs.existsSync(binding.registry_ref)) knowledgeFailure('knowledge_registry_unavailable: bound authorization and requirements cannot be established');
    const registryRef = containedKnowledgeFile(path.dirname(binding.registry_ref), path.basename(binding.registry_ref));
    if (seenRegistries.has(registryRef)) knowledgeFailure('Knowledge registry may only be bound once.');
    seenRegistries.add(registryRef);
    const registry = JSON.parse(fs.readFileSync(registryRef, 'utf8')) as KnowledgeSourceRegistry;
    assertJsonSchemaPayload({ schemaId: registrySchema.$id, schema: {
      ...registrySchema, properties: { ...registrySchema.properties, items: { type: 'array', items: { ...itemSchema, $id: undefined } } },
    } }, registry);
    if (new Set(registry.sources.map((source) => source.source_id)).size !== registry.sources.length) knowledgeFailure('Knowledge source ids must be unique in a registry.');
    if (registry.sources.some((source) => source.grants.some((grant) => grant.write_domains?.some((domain) => !grant.domains.includes(domain))))) knowledgeFailure('Source write domains must be a subset of its read domains.');
    const registryItems = registry.items.map(normalizeKnowledgeItem);
    if (new Set(registryItems.map((item) => item.knowledge_id)).size !== registryItems.length) knowledgeFailure('Knowledge ids must be unique in a source registry.');
    for (const item of registryItems) {
      if (item.scope.kind === 'product') knowledgeFailure('Private source registries cannot define product knowledge.');
      if (!binding.source_ids.includes(item.body_ref.source_id!) || !binding.scope_ids.includes(item.scope.id)) continue;
      if (!item.applicability.domains.includes(input.domainId) || (item.scope.kind === 'project' && item.scope.id !== projectId)) {
        outsideCaller.add(item.knowledge_id); continue;
      }
      const source = registry.sources.find((candidate) => candidate.source_id === item.body_ref.source_id);
      if (!source) knowledgeFailure('Knowledge item references an undeclared source.', { knowledge_id: item.knowledge_id });
      entries.push({ item, source, registryRef, registry, issue: sourceIssue(source, item, input, projectId) });
    }
  }
  if (new Set(entries.map((entry) => entry.item.knowledge_id)).size !== entries.length) knowledgeFailure('Effective knowledge ids must have one source owner.');
  return { entries, qualityDebt, requiredIds: (bindings.required_knowledge_ids ?? []).filter((id) => !outsideCaller.has(id)), requirementBindings: bindings.requirement_bindings ?? [] };
}
export function resolveKnowledgeSourceAccess(input: SourceInput & { knowledgeId: string }) {
  const entry = readBoundKnowledgeSources(input).entries.find((candidate) => candidate.item.knowledge_id === input.knowledgeId);
  if (!entry) knowledgeFailure(`knowledge_source_unavailable:${input.knowledgeId}`);
  if (entry.issue) knowledgeFailure(entry.issue);
  if (!sourcePathAllowed(entry.source, entry.item.body_ref.ref)) knowledgeFailure(`knowledge_source_path_unauthorized:${input.knowledgeId}`);
  const canWrite = entry.source.writable && matchingGrants(entry.source, entry.item, input, knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot))
    .some((grant) => grant.write_domains?.includes(input.domainId));
  return { ...entry, canWrite: Boolean(canWrite) };
}
export function resolveKnowledgeSourceItem(input: SourceInput & { knowledgeId: string; allowInactive?: boolean }) {
  const entry = resolveKnowledgeSourceAccess(input);
  if (!input.allowInactive) {
    const currentness = knowledgeCurrentness(entry.item, input.now);
    if (currentness) knowledgeFailure(currentness);
  }
  const bodyPath = containedKnowledgeFile(entry.source.root, entry.item.body_ref.ref);
  const currentSha256 = knowledgeDigest(fs.readFileSync(bodyPath));
  if (!input.allowInactive && currentSha256 !== entry.item.body_ref.sha256) knowledgeFailure(`knowledge_source_drifted:${input.knowledgeId}`);
  return { ...entry, bodyPath, currentSha256, reviewedSha256: entry.item.body_ref.sha256! };
}
export function listKnowledgeSources(input: SourceInput & { knowledgeId?: string }) {
  const bound = readBoundKnowledgeSources(input);
  const qualityDebt = [...bound.qualityDebt];
  const items = [];
  for (const entry of bound.entries) {
    if (input.knowledgeId && entry.item.knowledge_id !== input.knowledgeId) continue;
    // Do not disclose metadata outside the current grant, including its identity.
    if (entry.issue) continue;
    try {
      const source = resolveKnowledgeSourceItem({ ...input, knowledgeId: entry.item.knowledge_id });
      const dependencies = verifyKnowledgeDependencies({ ...input, dependencies: source.item.derived_from ?? [] });
      if (!dependencies.valid) { qualityDebt.push(...dependencies.issues); continue; }
      items.push({ ...source.item, registry_ref: source.registryRef, source_id: source.source.source_id,
        source_ref: source.item.body_ref.ref, sha256: source.reviewedSha256, can_write: source.canWrite });
    } catch (error) { qualityDebt.push(error instanceof Error ? error.message : 'knowledge_source_unavailable'); }
  }
  return { items, quality_debt: [...new Set(qualityDebt)] };
}
export function searchKnowledgeSources(input: SourceInput & { query: string; limit?: number; excerptChars?: number }) {
  const query = input.query.trim();
  const limit = input.limit ?? 10;
  const excerptChars = input.excerptChars ?? 400;
  if (!query || query.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 20
    || !Number.isInteger(excerptChars) || excerptChars < 1 || excerptChars > 1000) knowledgeFailure('Knowledge search requires a bounded non-empty query, limit 1–20 and excerpt size 1–1000.');
  const listing = listKnowledgeSources(input);
  const matches = [];
  for (const item of listing.items) {
    const source = resolveKnowledgeSourceItem({ ...input, knowledgeId: item.knowledge_id });
    const bytes = fs.readFileSync(source.bodyPath);
    if (!bytes.length || bytes.length > 256 * 1024 || knowledgeDigest(bytes) !== item.sha256) knowledgeFailure('Knowledge source changed during search.');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const position = content.toLowerCase().indexOf(query.toLowerCase());
    if (position < 0 && !`${item.title} ${item.knowledge_id}`.toLowerCase().includes(query.toLowerCase())) continue;
    const start = Math.max(0, position - Math.floor(excerptChars / 3));
    matches.push({ ...item, excerpt: content.slice(start, start + excerptChars) });
    if (matches.length === limit) break;
  }
  return { query, matches, quality_debt: listing.quality_debt };
}
export function resolveKnowledgeRegistrationSource(input: SourceInput & { registryRef: string; item: DurableKnowledgeItem }) {
  const bound = readBoundKnowledgeSources(input); // Validate before extending the current registry.
  const bindings = JSON.parse(fs.readFileSync(containedKnowledgeFile(input.workspaceRoot, KNOWLEDGE_BINDINGS_REF), 'utf8')) as SourceBindings;
  const registryRef = containedKnowledgeFile(path.dirname(input.registryRef), path.basename(input.registryRef));
  const binding = bindings.registries.find((candidate) => containedKnowledgeFile(path.dirname(candidate.registry_ref), path.basename(candidate.registry_ref)) === registryRef);
  const item = normalizeKnowledgeItem(input.item);
  if (bound.entries.some((entry) => entry.item.knowledge_id === item.knowledge_id && entry.registryRef !== registryRef)) knowledgeFailure('Knowledge identity already belongs to another bound registry.');
  const projectId = knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot);
  if (!binding || item.scope.kind === 'product' || !binding.source_ids.includes(item.body_ref.source_id!)
    || !binding.scope_ids.includes(item.scope.id) || !item.applicability.domains.includes(input.domainId)
    || (item.scope.kind === 'project' && item.scope.id !== projectId)) knowledgeFailure('Knowledge registration is outside the current source binding.', {
      binding: Boolean(binding), source: item.body_ref.source_id, scope: item.scope.id, project: projectId, domain: input.domainId,
    });
  const registry = JSON.parse(fs.readFileSync(registryRef, 'utf8')) as KnowledgeSourceRegistry;
  const source = registry.sources.find((candidate) => candidate.source_id === item.body_ref.source_id);
  if (!source || sourceIssue(source, item, input, projectId) || !source.writable
    || !matchingGrants(source, item, input, projectId).some((grant) => grant.write_domains?.includes(input.domainId))) knowledgeFailure('Knowledge registration requires the current source write grant.');
  const bodyPath = containedKnowledgeFile(source.root, item.body_ref.ref);
  if (!sourcePathAllowed(source, item.body_ref.ref)) knowledgeFailure('Knowledge registration path is outside its source filter.');
  for (const boundRegistry of bindings.registries) {
    const candidateRegistry = JSON.parse(fs.readFileSync(boundRegistry.registry_ref, 'utf8')) as KnowledgeSourceRegistry;
    for (const candidate of candidateRegistry.items) {
      if (candidate.knowledge_id === item.knowledge_id && fs.realpathSync(boundRegistry.registry_ref) !== registryRef) knowledgeFailure('Knowledge identity already belongs to another bound registry.');
      const candidateSource = candidateRegistry.sources.find((entry) => entry.source_id === candidate.body_ref.source_id);
      if (!candidateSource) continue;
      const candidatePath = path.resolve(candidateSource.root, candidate.body_ref.ref);
      if (fs.existsSync(candidatePath) && fs.realpathSync(candidatePath) === fs.realpathSync(bodyPath)
        && (candidate.knowledge_id !== item.knowledge_id || candidate.body_ref.source_id !== item.body_ref.source_id
          || fs.realpathSync(boundRegistry.registry_ref) !== registryRef)) knowledgeFailure('Knowledge source body already has a registered identity.');
    }
  }
  return { registryRef, registry, source, item, bodyPath };
}
type DiscoveryPosition = [string, string, string];
type KnowledgeDiscoveryCursor = { version: 1; scope: string; after: DiscoveryPosition };
const compareDiscoveryKeys = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const discoveryPosition = (registryRef: string, sourceId: string, sourceRef: string): DiscoveryPosition => [registryRef, sourceId, sourceRef];
const compareDiscoveryPositions = (a: DiscoveryPosition, b: DiscoveryPosition) =>
  compareDiscoveryKeys(a[0], b[0]) || compareDiscoveryKeys(a[1], b[1]) || compareDiscoveryKeys(a[2], b[2]);
function decodeDiscoveryCursor(raw: string, scope: string): KnowledgeDiscoveryCursor {
  if (!raw || raw.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(raw)) knowledgeFailure('Knowledge discovery cursor is invalid.');
  let value: unknown;
  try { value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch {
    knowledgeFailure('Knowledge discovery cursor is invalid.');
  }
  if (!value || typeof value !== 'object') knowledgeFailure('Knowledge discovery cursor is invalid.');
  const cursor = value as Partial<KnowledgeDiscoveryCursor>;
  if (cursor.version !== 1 || cursor.scope !== scope || !Array.isArray(cursor.after) || cursor.after.length !== 3
    || cursor.after.some(part => typeof part !== 'string' || !part)) {
    knowledgeFailure('Knowledge discovery cursor is stale or belongs to a different query or authorization scope; restart discovery.');
  }
  return cursor as KnowledgeDiscoveryCursor;
}
function normalizeDiscoveryPathPrefix(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!value || value.length > 4096 || path.isAbsolute(value) || value.includes('\0')) knowledgeFailure('Knowledge discovery path prefix must be a relative contained path.');
  const prefix = value.replace(/\/$/, '');
  validateKnowledgeRef(prefix);
  if (prefix === '.' || prefix.split('/').some(part => part === '.' || part === '..' || !part)) knowledgeFailure('Knowledge discovery path prefix must be a relative contained path.');
  return prefix;
}
export function discoverKnowledgeSources(input: SourceInput & {
  query: string; limit?: number; excerptChars?: number; sourceId?: string; pathPrefix?: string; cursor?: string;
}) {
  const query = input.query.trim();
  const limit = input.limit ?? 10;
  const excerptChars = input.excerptChars ?? 400;
  const sourceId = input.sourceId;
  const pathPrefix = normalizeDiscoveryPathPrefix(input.pathPrefix);
  if (!query || query.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 20
    || !Number.isInteger(excerptChars) || excerptChars < 1 || excerptChars > 1000
    || (sourceId !== undefined && (!sourceId.trim() || sourceId.length > 256))) {
    knowledgeFailure('Knowledge discovery requires a bounded query, limit 1–20 and excerpt size 1–1000.');
  }
  readBoundKnowledgeSources(input);
  const bindings = JSON.parse(fs.readFileSync(containedKnowledgeFile(input.workspaceRoot, KNOWLEDGE_BINDINGS_REF), 'utf8')) as SourceBindings;
  const projectId = knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot);
  const workspace = fs.realpathSync(input.workspaceRoot);
  const registries = bindings.registries.map(binding => {
    const registryRef = containedKnowledgeFile(path.dirname(binding.registry_ref), path.basename(binding.registry_ref));
    const bytes = fs.readFileSync(registryRef);
    return { binding, registryRef, registry: JSON.parse(bytes.toString('utf8')) as KnowledgeSourceRegistry, sha256: knowledgeDigest(bytes) };
  }).sort((a, b) => compareDiscoveryKeys(a.registryRef, b.registryRef));
  const scope = knowledgeDigest(JSON.stringify({ workspace, domain: input.domainId, projectId,
    query, sourceId, pathPrefix, bindings, registries: registries.map(({ registryRef, sha256 }) => ({ registryRef, sha256 })) }));
  const cursor = input.cursor === undefined ? undefined : decodeDiscoveryCursor(input.cursor, scope);
  // A second source alias must not turn a registered body into an unaccepted candidate.
  const registeredPaths = new Set<string>();
  for (const { registry } of registries) for (const item of registry.items) {
    const source = registry.sources.find(candidate => candidate.source_id === item.body_ref.source_id);
    if (!source || !path.isAbsolute(source.root)) continue;
    const file = path.resolve(source.root, item.body_ref.ref);
    registeredPaths.add(fs.existsSync(file) ? fs.realpathSync(file) : file);
  }
  const candidates: Array<{ candidate: true; accepted: false; source_id: string; source_ref: string;
    registry_ref: string; sha256: string; excerpt: string }> = [];
  let hasMore = false;
  const lowerQuery = query.toLowerCase();
  for (const { binding, registryRef, registry } of registries) {
    for (const source of [...registry.sources].sort((a, b) => compareDiscoveryKeys(a.source_id, b.source_id))) {
      if (source.status !== 'active' || !binding.source_ids.includes(source.source_id)
        || (sourceId !== undefined && source.source_id !== sourceId)
        || !binding.scope_ids.length || !path.isAbsolute(source.root)) continue;
      const allowed = source.grants.some((grant) => path.isAbsolute(grant.workspace_root) && fs.existsSync(grant.workspace_root)
        && fs.realpathSync(grant.workspace_root) === workspace && grant.domains.includes(input.domainId)
        && (!grant.project_ids || (projectId !== null && grant.project_ids.includes(projectId)))
        && (!grant.scope_ids || grant.scope_ids.some((scopeId) => binding.scope_ids.includes(scopeId))));
      if (!allowed) continue;
      const refs: string[] = [];
      const walk = (directory: string, prefix = ''): void => {
        // Recovery control areas remain private evidence even when another workspace shares this source.
        if (/(^|\/)shared\/memory\/knowledge-(retirements|relocations)(\/|$)/.test(directory.split(path.sep).join('/'))) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const ref = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && (pathPrefix === undefined || ref === pathPrefix
              || ref.startsWith(`${pathPrefix}/`) || pathPrefix.startsWith(`${ref}/`))) walk(path.join(directory, entry.name), ref);
          } else if (entry.isFile() && ref.endsWith('.md') && sourcePathAllowed(source, ref)
            && (pathPrefix === undefined || ref === pathPrefix || ref.startsWith(`${pathPrefix}/`))) refs.push(ref);
        }
      };
      walk(fs.realpathSync(source.root));
      for (const ref of refs.sort(compareDiscoveryKeys)) {
        const positionKey = discoveryPosition(registryRef, source.source_id, ref);
        if (cursor && compareDiscoveryPositions(positionKey, cursor.after) <= 0) continue;
        const file = containedKnowledgeFile(source.root, ref);
        if (registeredPaths.has(file) || fs.statSync(file).size > (source.discovery_max_bytes ?? 256 * 1024)) continue;
        const bytes = fs.readFileSync(file);
        if (bytes.length > (source.discovery_max_bytes ?? 256 * 1024)) knowledgeFailure('Knowledge candidate changed during discovery.');
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const position = content.toLowerCase().indexOf(lowerQuery);
        if (position < 0 && !ref.toLowerCase().includes(lowerQuery)) continue;
        if (candidates.length === limit) { hasMore = true; break; }
        const start = Math.max(0, position - Math.floor(excerptChars / 3));
        candidates.push({ candidate: true, accepted: false, source_id: source.source_id, source_ref: ref,
          registry_ref: registryRef, sha256: knowledgeDigest(bytes), excerpt: content.slice(start, start + excerptChars) });
      }
      if (hasMore) break;
    }
    if (hasMore) break;
  }
  const last = candidates.at(-1);
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ version: 1, scope, after: discoveryPosition(last.registry_ref, last.source_id, last.source_ref) } satisfies KnowledgeDiscoveryCursor)).toString('base64url')
    : null;
  return { query, candidates, quality_debt: [] as string[], has_more: hasMore, truncated: hasMore, next_cursor: nextCursor };
}
export function resolveKnowledgeSourceTarget(input: SourceInput & { bodyPath: string }) {
  if (!path.isAbsolute(input.bodyPath)) knowledgeFailure('Knowledge target must be an absolute file path.');
  const locate = (file: string): string => {
    if (fs.existsSync(file)) return fs.realpathSync(file);
    const parent = path.dirname(file);
    return parent === file ? file : path.join(locate(parent), path.basename(file));
  };
  const target = locate(path.resolve(input.bodyPath));
  readBoundKnowledgeSources(input);
  const bindings = JSON.parse(fs.readFileSync(containedKnowledgeFile(input.workspaceRoot, KNOWLEDGE_BINDINGS_REF), 'utf8')) as SourceBindings;
  const matches: Array<{ item: DurableKnowledgeItem; source: KnowledgeSource; registrySha256: string; issue: string | null; disclosed: boolean }> = [];
  const projectId = knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot);
  for (const binding of bindings.registries) {
    const registryBytes = fs.readFileSync(binding.registry_ref);
    const registry = JSON.parse(registryBytes.toString('utf8')) as KnowledgeSourceRegistry;
    for (const item of registry.items) {
      const source = registry.sources.find((candidate) => candidate.source_id === item.body_ref.source_id);
      if (!source) continue;
      const file = path.resolve(source.root, item.body_ref.ref);
      const resolved = locate(file);
      if (resolved !== target) continue;
      const disclosed = binding.source_ids.includes(item.body_ref.source_id!) && binding.scope_ids.includes(item.scope.id)
        && item.applicability.domains.includes(input.domainId) && (item.scope.kind !== 'project' || item.scope.id === projectId)
        && sourcePathAllowed(source, item.body_ref.ref);
      matches.push({ item, source, registrySha256: knowledgeDigest(registryBytes), issue: sourceIssue(source, item, input, projectId), disclosed });
    }
  }
  if (matches.length > 1) knowledgeFailure('Knowledge target has multiple registered identities.');
  const match = matches[0];
  if (match && !match.disclosed) return { registered: true, authorized: false };
  return match ? { registered: true, knowledge_id: match.item.knowledge_id, scope: match.item.scope,
    content_kind: match.item.content_kind, source_id: match.source.source_id, source_ref: match.item.body_ref.ref,
    sha256: match.item.body_ref.sha256, registry_sha256: match.registrySha256, status: match.item.status, authorized: match.issue === null }
    : { registered: false };
}
export function verifyKnowledgeDependencies(input: SourceInput & { dependencies: KnowledgeDependency[] }) {
  const issues: string[] = [];
  const seen = new Set<string>();
  const verify = (dependency: KnowledgeDependency, trail: Set<string>) => {
    if (!dependency || typeof dependency.knowledge_id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(dependency.sha256)) {
      issues.push('knowledge_dependency_invalid'); return;
    }
    if (trail.has(dependency.knowledge_id)) { issues.push(`knowledge_dependency_cycle:${dependency.knowledge_id}`); return; }
    const key = `${dependency.knowledge_id}:${dependency.sha256}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      const source = resolveKnowledgeSourceItem({ ...input, knowledgeId: dependency.knowledge_id });
      if (source.currentSha256 !== dependency.sha256) { issues.push(`knowledge_dependency_drifted:${dependency.knowledge_id}`); return; }
      const next = new Set(trail).add(dependency.knowledge_id);
      for (const child of source.item.derived_from ?? []) verify(child, next);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `knowledge_dependency_unavailable:${dependency.knowledge_id}`);
    }
  };
  for (const dependency of input.dependencies) verify(dependency, new Set());
  return { valid: issues.length === 0, issues };
}
