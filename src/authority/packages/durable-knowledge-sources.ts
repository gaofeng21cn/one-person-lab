import fs from 'node:fs';
import path from 'node:path';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import bindingsSchema from '../../../contracts/opl-framework/knowledge-source-bindings.schema.json' with { type: 'json' };
import registrySchema from '../../../contracts/opl-framework/knowledge-source-registry.schema.json' with { type: 'json' };
import {
  containedKnowledgeFile, itemSchema, knowledgeCurrentness, knowledgeDigest, knowledgeFailure,
  normalizeKnowledgeItem, type DurableKnowledgeItem, type KnowledgeDependency,
} from './durable-knowledge-model.ts';

export const KNOWLEDGE_BINDINGS_REF = 'shared/memory/knowledge-bindings.json';
export type KnowledgeSource = {
  source_id: string; root: string; status: 'active' | 'revoked'; writable: boolean;
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
export function resolveKnowledgeSourceItem(input: SourceInput & { knowledgeId: string; allowInactive?: boolean }) {
  const entry = readBoundKnowledgeSources(input).entries.find((candidate) => candidate.item.knowledge_id === input.knowledgeId);
  if (!entry) knowledgeFailure(`knowledge_source_unavailable:${input.knowledgeId}`);
  if (entry.issue) knowledgeFailure(entry.issue);
  if (!input.allowInactive) {
    const currentness = knowledgeCurrentness(entry.item, input.now);
    if (currentness) knowledgeFailure(currentness);
  }
  const bodyPath = containedKnowledgeFile(entry.source.root, entry.item.body_ref.ref);
  const currentSha256 = knowledgeDigest(fs.readFileSync(bodyPath));
  if (!input.allowInactive && currentSha256 !== entry.item.body_ref.sha256) knowledgeFailure(`knowledge_source_drifted:${input.knowledgeId}`);
  const canWrite = entry.source.writable && matchingGrants(entry.source, entry.item, input, knowledgeProjectIdentity(input.workspaceRoot, input.projectRoot))
    .some((grant) => grant.write_domains?.includes(input.domainId));
  return { ...entry, bodyPath, currentSha256, reviewedSha256: entry.item.body_ref.sha256!, canWrite: Boolean(canWrite) };
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
