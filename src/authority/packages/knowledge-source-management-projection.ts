import fs from 'node:fs';
import { containedKnowledgeFile, knowledgeCurrentness, knowledgeDigest } from './durable-knowledge-model.ts';
import type { KnowledgeSource } from './durable-knowledge-sources.ts';
import {
  contextRevision, knownConsumers, managementContexts, physicalDirectory, readManagementBindings,
  readManagementRegistry, sameWorkspace, sourceResourceId, sourceRevision,
  type ManagementContext, type ManagementDependencies,
} from './knowledge-source-management-store.ts';

const safeId = (value: string) => /^[\w.:-]{1,160}$/.test(value) ? value : null;
const label = (value: string | undefined, fallback: string) => value && !value.startsWith('/') && !/[\r\n\0]/.test(value) ? value.slice(0, 160) : fallback;
export function projectKnowledgeSource(context: ManagementContext, registry: ReturnType<typeof readManagementRegistry>, source: KnowledgeSource, deps: ManagementDependencies = {}, availableConsumers = knownConsumers(deps)) {
  const binding = readManagementBindings(context).value.registries.find(entry => sameWorkspace(entry.registry_ref, registry.file));
  const grants = source.grants.filter(grant => sameWorkspace(grant.workspace_root, context.root));
  const connected = binding?.source_ids.includes(source.source_id) === true;
  const accessEditable = grants.length <= 1;
  const scopes = (binding?.scope_ids ?? []).filter(scope => safeId(scope) && grants.some(grant => !grant.scope_ids || grant.scope_ids.includes(scope)));
  const domains = [...new Set(grants.flatMap(grant => grant.domains).filter(domain => safeId(domain)))].sort();
  const writeDomains = [...new Set(grants.flatMap(grant => grant.write_domains ?? []).filter(domain => safeId(domain)))].sort();
  const consumers = availableConsumers.filter(consumer => domains.includes(consumer.domain_id));
  const authorized = connected && source.status === 'active' && domains.length > 0 && scopes.length > 0;
  let reason = !connected ? 'knowledge_source_disconnected' : source.status !== 'active' ? 'knowledge_source_revoked' : !authorized ? 'knowledge_source_authorization_missing' : null;
  try { physicalDirectory(source.root); } catch { reason ??= 'knowledge_source_directory_unavailable'; }
  const items = registry.value.items.filter(item => item.body_ref.source_id === source.source_id && scopes.includes(item.scope.id));
  const activeItems = items.filter(item => item.status === 'active' && !item.superseded_by?.length);
  const inactive = items.length - activeItems.length;
  let current = 0; let reviewDue = 0; let unavailable = 0; let checked = 0;
  const issues: Array<{ knowledge_id: string; status: 'review_due' | 'unavailable'; reason: string }> = [];
  if (authorized && !reason) {
    for (const item of activeItems.slice(0, 100)) {
      checked += 1;
      try {
        const file = containedKnowledgeFile(source.root, item.body_ref.ref);
        const stats = fs.statSync(file);
        if (!stats.size || stats.size > 256 * 1024 || knowledgeDigest(fs.readFileSync(file)) !== item.body_ref.sha256) {
          unavailable += 1;
          issues.push({ knowledge_id: item.knowledge_id, status: 'unavailable', reason: 'knowledge_source_body_requires_review' });
          continue;
        }
        const currentness = knowledgeCurrentness(item, deps.now);
        if (currentness?.startsWith('knowledge_review_overdue:')) {
          reviewDue += 1;
          issues.push({ knowledge_id: item.knowledge_id, status: 'review_due', reason: 'knowledge_review_overdue' });
          continue;
        }
        if (currentness) {
          unavailable += 1;
          issues.push({ knowledge_id: item.knowledge_id, status: 'unavailable', reason: currentness.split(':')[0]! });
          continue;
        }
        current += 1;
      } catch {
        unavailable += 1;
        issues.push({ knowledge_id: item.knowledge_id, status: 'unavailable', reason: 'knowledge_source_body_unavailable' });
      }
    }
    if (unavailable) reason = 'knowledge_source_revision_requires_review';
  }
  const status = reason ? (connected ? 'attention' as const : 'unknown' as const) : 'ready' as const;
  const bounded = activeItems.length > 100;
  return {
    resource_id: sourceResourceId(context, registry.file, source.source_id), source_id: safeId(source.source_id) ?? 'source',
    label: label(source.label, safeId(source.source_id) ?? '知识来源'), context_id: context.context_id,
    status, connected, access_editable: accessEditable, ...(!accessEditable ? { access_edit_reason: 'knowledge_source_granular_grants_require_owner' } : {}), scope_ids: scopes, consumer_domain_ids: domains, write_domain_ids: writeDomains,
    source_writable: source.writable, scope_expansion_allowed: !(binding?.source_ids.some(id => id !== source.source_id)),
    available_scope_ids: binding?.scope_ids.filter(scope => safeId(scope)) ?? [], consumer_package_ids: [...new Set(consumers.flatMap(consumer => consumer.package_id ? [consumer.package_id] : []))].sort(),
    revision_identity: sourceRevision(context, registry), knowledge_count: items.length,
    knowledge_health: { current_count: current, review_due_count: reviewDue, inactive_count: inactive,
      unavailable_count: unavailable, checked_count: checked, truncated: bounded, issues },
    authorization: { status: authorized ? 'authorized' as const : 'attention' as const, consumer_count: domains.length, grant_count: grants.length },
    revision: { status: unavailable ? 'stale' as const : checked && !bounded ? 'current' as const : 'unknown' as const, security_revision: sourceRevision(context, registry) },
    freshness: { status: unavailable ? 'stale' as const : current && !bounded ? 'fresh' as const : 'unknown' as const,
      observed_at: (deps.now ?? new Date()).toISOString() },
    readiness: { status, ...(reason ? { reason } : {}) }, ...(reason ? { reason } : {}),
    owner_settings_route: 'resources',
    action_ids: ['knowledge_source_check', ...(accessEditable ? ['knowledge_source_configure'] : []), ...(connected ? ['knowledge_source_disconnect'] : [])],
  };
}
export function listKnowledgeSourceProjection(deps: ManagementDependencies = {}) {
  const contexts = managementContexts(deps);
  const availableConsumers = knownConsumers(deps);
  const items: ReturnType<typeof projectKnowledgeSource>[] = [];
  const failures: Array<{ context_id: string; reason: string }> = [];
  const contextRows = contexts.map(context => {
    try {
      const bindings = readManagementBindings(context).value;
      for (const binding of bindings.registries) {
        const registry = readManagementRegistry(binding.registry_ref);
        for (const source of registry.value.sources) {
          if (!binding.source_ids.includes(source.source_id) && !source.grants.some(grant => sameWorkspace(grant.workspace_root, context.root))) continue;
          items.push(projectKnowledgeSource(context, registry, source, deps, availableConsumers));
        }
      }
      return { context_id: context.context_id, label: label(context.label, '工作区'), selected: context.selected,
        revision: contextRevision(context), available_scope_ids: [...new Set(bindings.registries.flatMap(binding => binding.scope_ids).filter(scope => safeId(scope)))], status: 'available' as const };
    } catch {
      failures.push({ context_id: context.context_id, reason: 'knowledge_source_configuration_invalid' });
      return { context_id: context.context_id, label: label(context.label, '工作区'), selected: context.selected,
        revision: null, available_scope_ids: [], status: 'attention_required' as const };
    }
  });
  return { surface_kind: 'opl_knowledge_sources_projection.v1', status: failures.length || items.some(item => item.status === 'attention')
    ? 'attention_required' : items.length ? 'available' : 'not_configured',
    contexts: contextRows, items, available_consumers: availableConsumers, failures,
    authority_boundary: { body_included: false, absolute_paths_included: false, second_registry: false, source_owner: 'profile_workspace_knowledge_registry' },
  };
}
