import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { KnowledgeSourceRegistry } from './durable-knowledge-sources.ts';
import { atomic, digest, encoded, safePath, withRegistryLock } from './knowledge-source-mutation-support.ts';
import { listKnowledgeSourceProjection } from './knowledge-source-management-projection.ts';
import {
  contextRevision, knownConsumers, managementContexts, physicalDirectory, readManagementBindings,
  readManagementRegistry, sameWorkspace, sourceResourceId, sourceRevision,
  type ManagementContext, type ManagementDependencies,
} from './knowledge-source-management-store.ts';

export const KNOWLEDGE_SOURCE_ACTION_IDS = ['knowledge_source_list', 'knowledge_source_check', 'knowledge_source_connect', 'knowledge_source_configure', 'knowledge_source_disconnect'] as const;
export type KnowledgeSourceActionId = typeof KNOWLEDGE_SOURCE_ACTION_IDS[number];
export function knowledgeSourceActionCatalog() {
  return KNOWLEDGE_SOURCE_ACTION_IDS.map(action_id => {
    const operation = action_id.slice('knowledge_source_'.length);
    const read = operation === 'list' || operation === 'check';
    return { action_id, label: ({ list: 'List knowledge sources', check: 'Check knowledge sources', connect: 'Connect knowledge source', configure: 'Configure source access', disconnect: 'Disconnect knowledge source' } as Record<string, string>)[operation]!,
      delegated_surface: `opl knowledge source-${operation}`,
      payload_fields: operation === 'list' ? [] : operation === 'check' ? ['resource_id'] : operation === 'connect'
        ? ['context_id', 'vault_path', 'registry_path', 'source_id', 'label', 'scope_ids', 'consumer_domain_ids', 'write_domain_ids', 'expected_revision']
        : operation === 'configure' ? ['resource_id', 'scope_ids', 'consumer_domain_ids', 'write_domain_ids', 'expected_revision'] : ['resource_id', 'expected_revision'],
      mutates: read ? 'none_read_only' : operation === 'disconnect' ? 'current_workspace_source_binding' : 'knowledge_source_registry_and_current_workspace_binding',
      dry_run_supported: read, confirmation_required: !read, danger_level: read ? 'none' as const : 'medium' as const,
      impact: read ? 'Read source access and accepted-version metadata without bodies or paths.' : 'Update the selected source binding and explicit access; preserve source bodies and other workspace grants.',
      follow_up_action_ids: read ? [] : ['knowledge_source_list'], verify_action_id: read ? null : 'knowledge_source_list' };
  });
}
export function listKnowledgeSourceManagement(deps: ManagementDependencies = {}) {
  return { ...listKnowledgeSourceProjection(deps), available_actions: knowledgeSourceActionCatalog() };
}
function reject(reason_code: string, message: string): never { throw new FrameworkContractError('cli_usage_error', message, { reason_code }); }
function requiredString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0')) reject('knowledge_source_payload_invalid', `${key} is required.`);
  return value.trim();
}
function identities(value: unknown, field: string, required = true) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > 100 || value.some(id => typeof id !== 'string' || !/^[\w.:-]{1,160}$/.test(id))) reject('knowledge_source_payload_invalid', `${field} must contain explicit source identities.`);
  return [...new Set(value as string[])].sort();
}
function selection(payload: Record<string, unknown>, deps: ManagementDependencies) {
  const scopes = identities(payload.scope_ids, 'scope_ids');
  const domains = identities(payload.consumer_domain_ids, 'consumer_domain_ids');
  const writes = identities(payload.write_domain_ids ?? [], 'write_domain_ids', false);
  const known = new Set(knownConsumers(deps).map(consumer => consumer.domain_id));
  if (domains.some(domain => !known.has(domain)) || writes.some(domain => !domains.includes(domain))) reject('knowledge_source_consumer_invalid', 'Select consumers reported by the current source owner; write access must be a subset of read access.');
  return { scopes, domains, writes };
}
function resolveContext(contextId: string, deps: ManagementDependencies) {
  const context = managementContexts(deps).find(candidate => candidate.context_id === contextId);
  if (!context) reject('knowledge_source_context_unknown', 'The selected knowledge workspace is no longer available.');
  return context;
}
function resolveResource(resourceId: string, deps: ManagementDependencies) {
  for (const context of managementContexts(deps)) {
    for (const binding of readManagementBindings(context).value.registries) {
      const registry = readManagementRegistry(binding.registry_ref);
      const source = registry.value.sources.find(candidate => sourceResourceId(context, registry.file, candidate.source_id) === resourceId
        && (binding.source_ids.includes(candidate.source_id) || candidate.grants.some(grant => sameWorkspace(grant.workspace_root, context.root))));
      if (source) return { context, registry, source };
    }
  }
  reject('knowledge_source_not_found', 'The selected knowledge source is no longer available; refresh the list.');
}
function assertRevision(actual: string, expected: string) {
  if (actual !== expected) reject('knowledge_source_changed', 'Knowledge source settings changed; refresh them before applying this change.');
}
function contextReady(context: ManagementContext) {
  if (!fs.existsSync(context.root)) {
    if (context.context_id !== 'profile') reject('knowledge_source_context_unavailable', 'The selected workspace directory is unavailable.');
    fs.mkdirSync(context.root, { recursive: true, mode: 0o700 });
  }
  physicalDirectory(context.root);
}
function writePair(context: ManagementContext, registryFile: string, registry: KnowledgeSourceRegistry | null,
  binding: ReturnType<typeof readManagementBindings>, expectedContextRevision: string, expectedRegistryBytes: Buffer | null) {
  fs.mkdirSync(path.dirname(binding.file), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(registryFile), { recursive: true, mode: 0o700 });
  const files = [binding.file, registryFile].sort();
  withRegistryLock(files[0]!, () => withRegistryLock(files[1]!, () => {
    assertRevision(contextRevision(context), expectedContextRevision);
    const currentRegistry = fs.existsSync(registryFile) ? fs.readFileSync(registryFile) : null;
    if ((currentRegistry?.toString('base64') ?? null) !== (expectedRegistryBytes?.toString('base64') ?? null)) reject('knowledge_source_changed', 'Knowledge source registry changed; refresh before applying.');
    if (registry) atomic(registryFile, encoded(registry), expectedRegistryBytes === null);
    // Registry grants alone do not create a binding. A failure remains recoverable by fresh readback.
    atomic(binding.file, encoded(binding.value), binding.bytes === null);
  }));
}
function applyAccess(context: ManagementContext, registry: KnowledgeSourceRegistry, sourceId: string, access: ReturnType<typeof selection>) {
  const source = registry.sources.find(candidate => candidate.source_id === sourceId)!;
  if (source.status !== 'active') reject('knowledge_source_revoked', 'This source was revoked by its owner; restore it there before reconnecting.');
  const selectedGrants = source.grants.filter(grant => sameWorkspace(grant.workspace_root, context.root));
  if (selectedGrants.length > 1) reject('knowledge_source_granular_grants_require_owner', 'This source has separate project or scope grants. Manage its detailed access at the source owner.');
  const retained = source.grants.filter(grant => !sameWorkspace(grant.workspace_root, context.root));
  const templates = selectedGrants.length ? selectedGrants : [{ workspace_root: context.root, domains: [] as string[] }];
  source.grants = retained.concat(templates.map(grant => ({ ...grant, workspace_root: context.root, domains: access.domains,
    scope_ids: access.scopes, write_domains: access.writes })));
  if (!source.writable && access.writes.length && retained.some(grant => grant.write_domains?.length)) reject('knowledge_source_granular_grants_require_owner', 'Enabling writes would activate another workspace grant; manage detailed access at the source owner.');
  source.writable = source.writable || access.writes.length > 0;
}
function bindSource(binding: ReturnType<typeof readManagementBindings>, registryFile: string, sourceId: string, scopes: string[]) {
  let entry = binding.value.registries.find(candidate => sameWorkspace(candidate.registry_ref, registryFile));
  if (!entry) { entry = { registry_ref: registryFile, source_ids: [], scope_ids: [] }; binding.value.registries.push(entry); }
  if (entry.source_ids.some(id => id !== sourceId) && scopes.some(scope => !entry.scope_ids.includes(scope))) reject('knowledge_source_shared_scope_requires_owner', 'This registry shares its scope selection with other sources. Select an existing scope or update the registry through its owner.');
  entry.source_ids = [...new Set([...entry.source_ids, sourceId])];
  entry.scope_ids = [...new Set([...entry.scope_ids, ...scopes])];
}
function runKnowledgeSourceAction(actionId: KnowledgeSourceActionId, rawPayload: unknown, deps: ManagementDependencies = {}) {
  const payload = rawPayload === undefined || rawPayload === null ? {} : rawPayload;
  if (!isRecord(payload)) reject('knowledge_source_payload_invalid', 'Knowledge source payload must be an object.');
  const catalog = knowledgeSourceActionCatalog().find(action => action.action_id === actionId);
  if (!catalog || Object.keys(payload).some(field => !catalog.payload_fields.includes(field))) reject('knowledge_source_payload_invalid', 'Knowledge source action contains unsupported fields.');
  if (actionId === 'knowledge_source_list' || actionId === 'knowledge_source_check') {
    const projection = listKnowledgeSourceManagement(deps);
    if (payload.resource_id !== undefined && !projection.items.some(item => item.resource_id === requiredString(payload, 'resource_id'))) reject('knowledge_source_not_found', 'The selected source is no longer available.');
    return { knowledge_sources: projection };
  }
  const expected = requiredString(payload, 'expected_revision');
  if (actionId === 'knowledge_source_connect') {
    const context = resolveContext(requiredString(payload, 'context_id'), deps);
    assertRevision(contextRevision(context), expected);
    const access = selection(payload, deps);
    const vault = typeof payload.vault_path === 'string' && payload.vault_path.trim() ? payload.vault_path.trim() : null;
    const existing = typeof payload.registry_path === 'string' && payload.registry_path.trim() ? payload.registry_path.trim() : null;
    if (Boolean(vault) === Boolean(existing)) reject('knowledge_source_payload_invalid', 'Choose a notes folder or an existing source registry.');
    const root = vault ? physicalDirectory(vault) : null;
    contextReady(context);
    const binding = readManagementBindings(context);
    const registryFile = existing ? readManagementRegistry(existing).file : safePath(context.root, 'data/knowledge-sources.json');
    const previous = fs.existsSync(registryFile) ? readManagementRegistry(registryFile) : null;
    const registry: KnowledgeSourceRegistry = previous?.value ?? { surface_kind: 'opl_knowledge_source_registry', version: 'knowledge-source-registry.v2', registry_id: `workspace.${digest(encoded(context.root)).slice(7, 23)}`, owner: 'workspace-owner', sources: [], items: [] };
    let sourceId: string;
    if (existing) {
      sourceId = requiredString(payload, 'source_id');
      if (!registry.sources.some(source => source.source_id === sourceId)) reject('knowledge_source_not_found', 'The registry does not contain the selected source.');
    } else {
      sourceId = typeof payload.source_id === 'string' && payload.source_id.trim() ? payload.source_id.trim() : `notes.${crypto.randomUUID()}`;
      if (!/^[\w.:-]{1,160}$/.test(sourceId)) reject('knowledge_source_payload_invalid', 'source_id is invalid.');
      if (registry.sources.some(source => source.source_id === sourceId || fs.existsSync(source.root) && fs.realpathSync(source.root) === root)) reject('knowledge_source_already_connected', 'This notes folder already has a source; configure its existing entry.');
      const label = typeof payload.label === 'string' && payload.label.trim() ? payload.label.trim() : '个人资料库';
      if (label.length > 160 || label.startsWith('/') || /[\r\n\0]/.test(label)) reject('knowledge_source_payload_invalid', 'Use a short source label.');
      registry.sources.push({ source_id: sourceId, label, root: root!, status: 'active', writable: access.writes.length > 0, grants: [] });
    }
    applyAccess(context, registry, sourceId, access);
    bindSource(binding, registryFile, sourceId, access.scopes);
    writePair(context, registryFile, registry, binding, expected, previous?.bytes ?? null);
    return { knowledge_sources: listKnowledgeSourceManagement(deps), knowledge_source_operation: { action_id: actionId, status: 'applied', source_bodies_preserved: true } };
  }
  const selected = resolveResource(requiredString(payload, 'resource_id'), deps);
  assertRevision(sourceRevision(selected.context, selected.registry), expected);
  const beforeContext = contextRevision(selected.context);
  assertRevision(digest(encoded([beforeContext, digest(selected.registry.bytes)])), expected);
  const binding = readManagementBindings(selected.context);
  if (actionId === 'knowledge_source_disconnect') {
    for (const entry of binding.value.registries) if (sameWorkspace(entry.registry_ref, selected.registry.file)) entry.source_ids = entry.source_ids.filter(id => id !== selected.source.source_id);
    writePair(selected.context, selected.registry.file, null, binding, beforeContext, selected.registry.bytes);
  } else {
    const access = selection(payload, deps);
    applyAccess(selected.context, selected.registry.value, selected.source.source_id, access);
    bindSource(binding, selected.registry.file, selected.source.source_id, access.scopes);
    writePair(selected.context, selected.registry.file, selected.registry.value, binding, beforeContext, selected.registry.bytes);
  }
  return { knowledge_sources: listKnowledgeSourceManagement(deps), knowledge_source_operation: { action_id: actionId, status: 'applied', source_bodies_preserved: true, other_workspace_grants_preserved: true } };
}

export function executeKnowledgeSourceAction(actionId: KnowledgeSourceActionId, payload: unknown, deps: ManagementDependencies = {}) {
  try { return runKnowledgeSourceAction(actionId, payload, deps); }
  catch (error) {
    if (error instanceof FrameworkContractError && typeof error.details?.reason_code === 'string' && error.details.reason_code.startsWith('knowledge_source_')) throw error;
    reject('knowledge_source_configuration_invalid', 'The selected source configuration is unavailable or invalid. Check the selected folder and source settings, then refresh.');
  }
}
