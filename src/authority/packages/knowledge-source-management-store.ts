import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import registrySchema from '../../../contracts/opl-framework/knowledge-source-registry.schema.json' with { type: 'json' };
import bindingsSchema from '../../../contracts/opl-framework/knowledge-source-bindings.schema.json' with { type: 'json' };
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import { listStandardAgentRegistry } from '../../kernel/standard-agent-registry.ts';
import { listWorkspaceBindings, type WorkspaceBinding } from '../workspace/public/app-state.ts';
import { itemSchema } from './durable-knowledge-model.ts';
import { KNOWLEDGE_BINDINGS_REF, type KnowledgeSourceRegistry } from './durable-knowledge-sources.ts';
import { digest, encoded, fail, safePath } from './knowledge-source-mutation-support.ts';

export type ManagementContext = { context_id: string; label: string; root: string; selected: boolean };
export type ManagementBindings = {
  surface_kind: 'opl_knowledge_source_bindings'; version: 'knowledge-source-bindings.v2';
  registries: Array<{ registry_ref: string; source_ids: string[]; scope_ids: string[] }>;
  required_knowledge_ids?: string[];
  requirement_bindings?: Array<{ requirement_id: string; semantic_owner_ref: string; owner_id: string; knowledge_ids: string[] }>;
};
export type ManagementDependencies = { profileRoot?: string; workspaceBindings?: WorkspaceBinding[]; now?: Date };
export function profileWorkspaceRoot(env = process.env) {
  const explicit = env.OPL_PROFILE_WORKSPACE?.trim();
  return explicit ? path.resolve(explicit.startsWith('~/') ? path.join(os.homedir(), explicit.slice(2)) : explicit)
    : path.join(os.homedir(), 'OPL', 'profiles', path.basename(os.homedir()) || 'default');
}
export function managementContexts(deps: ManagementDependencies = {}): ManagementContext[] {
  const profile = path.resolve(deps.profileRoot ?? profileWorkspaceRoot());
  const contexts: ManagementContext[] = [{ context_id: 'profile', label: '个人资料', root: profile, selected: true }];
  for (const binding of deps.workspaceBindings ?? listWorkspaceBindings()) {
    if (binding.status === 'archived' || !path.isAbsolute(binding.workspace_path)
      || contexts.some(context => context.root === path.resolve(binding.workspace_path))) continue;
    contexts.push({ context_id: `workspace:${binding.binding_id}`, label: binding.label ?? binding.project,
      root: path.resolve(binding.workspace_path), selected: false });
  }
  return contexts;
}
export function physicalDirectory(root: string) {
  if (!path.isAbsolute(root) || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) fail('Knowledge source directory is unavailable.');
  const absolute = path.resolve(root);
  return fs.realpathSync(absolute);
}
export function readManagementBindings(context: ManagementContext): { file: string; bytes: Buffer | null; value: ManagementBindings } {
  if (!fs.existsSync(context.root)) return { file: path.join(context.root, KNOWLEDGE_BINDINGS_REF), bytes: null,
    value: { surface_kind: 'opl_knowledge_source_bindings', version: 'knowledge-source-bindings.v2', registries: [] } };
  const file = safePath(context.root, KNOWLEDGE_BINDINGS_REF);
  if (!fs.existsSync(file)) return { file, bytes: null,
    value: { surface_kind: 'opl_knowledge_source_bindings', version: 'knowledge-source-bindings.v2', registries: [] } };
  const bytes = fs.readFileSync(file);
  const value = JSON.parse(bytes.toString('utf8')) as ManagementBindings;
  assertJsonSchemaPayload({ schemaId: bindingsSchema.$id, schema: bindingsSchema }, value);
  if (new Set(value.registries.map(binding => binding.registry_ref)).size !== value.registries.length) fail('Knowledge registry bindings must be unique.');
  return { file, bytes, value };
}
export function readManagementRegistry(file: string) {
  if (!path.isAbsolute(file)) fail('Knowledge registry must be an absolute local file.');
  const root = physicalDirectory(path.dirname(file));
  const safe = safePath(root, path.basename(file));
  const bytes = fs.readFileSync(safe);
  const value = JSON.parse(bytes.toString('utf8')) as KnowledgeSourceRegistry;
  assertJsonSchemaPayload({ schemaId: registrySchema.$id, schema: {
    ...registrySchema, properties: { ...registrySchema.properties, items: { type: 'array', items: { ...itemSchema, $id: undefined } } },
  } }, value);
  if (new Set(value.sources.map(source => source.source_id)).size !== value.sources.length
    || new Set(value.items.map(item => item.knowledge_id)).size !== value.items.length
    || value.sources.some(source => source.grants.some(grant => grant.write_domains?.some(domain => !grant.domains.includes(domain))))) fail('Knowledge source registry identities or grants are invalid.');
  return { file: safe, bytes, value };
}
export function sameWorkspace(left: string, right: string) {
  if (!path.isAbsolute(left)) return false;
  const canonical = (file: string) => fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  return canonical(left) === canonical(right);
}
export function contextRevision(context: ManagementContext) {
  const binding = readManagementBindings(context);
  return digest(encoded({ context_id: context.context_id, root: context.root, binding: binding.bytes?.toString('base64') ?? null }));
}
export function sourceResourceId(context: ManagementContext, registry: string, sourceId: string) {
  return `knowledge:${digest(encoded([context.context_id, registry, sourceId])).slice(7, 31)}`;
}
export function sourceRevision(context: ManagementContext, registry: ReturnType<typeof readManagementRegistry>) {
  return digest(encoded([contextRevision(context), digest(registry.bytes)]));
}
export function knownConsumers(deps: ManagementDependencies = {}) {
  const consumers = new Map<string, { domain_id: string; label: string; package_id?: string }>();
  for (const agent of listStandardAgentRegistry()) {
    const packageId = agent.plugin_name;
    for (const domain of [agent.domain_id, agent.target_domain_id]) if (domain) consumers.set(domain, { domain_id: domain, label: agent.display_name, package_id: packageId });
  }
  for (const context of managementContexts(deps)) {
    try {
      for (const binding of readManagementBindings(context).value.registries) {
        for (const source of readManagementRegistry(binding.registry_ref).value.sources) {
          for (const grant of source.grants) {
            if (!sameWorkspace(grant.workspace_root, context.root)) continue;
            for (const domain of grant.domains) if (/^[\w.:-]{1,160}$/.test(domain) && !consumers.has(domain)) consumers.set(domain, { domain_id: domain, label: domain });
          }
        }
      }
    } catch { /* The projection reports invalid contexts separately. */ }
  }
  return [...consumers.values()].sort((a, b) => a.label.localeCompare(b.label));
}
