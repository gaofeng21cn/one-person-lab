import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { record, recordList, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import { readStandardAgentDescriptorInterface } from '../../kernel/standard-agent-interface.ts';
import { listWorkspaceBindings } from '../../authority/workspace/public/app-state.ts';
import { openFamilyRuntimeSqlite, queryStageAttempt } from '../../adapters/execution/public/app-state.ts';
import { readInstalledStandardAgentDescriptorForDomain } from '../../adapters/integration/public/standard-agent-interface.ts';
import { canonicalWorkspacePath } from './work-item-projection/catalog.ts';
import { joinAttemptsToWorkItems, readWorkItemStageAttempts } from './work-item-projection/execution.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import type { WorkItemProjectionItem } from './work-item-projection/types.ts';

function contextError(reason: string, message: string): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { failure_code: reason });
}

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function summary(item: WorkItemProjectionItem) {
  return {
    id: item.item_id,
    title: item.identity.work_item_display_name,
    summary: `${item.identity.agent_display_name} · ${item.lifecycle.current_stage_display_name ?? item.lifecycle.current_stage_id ?? '未登记阶段'} · ${item.lifecycle.primary_state_label}`,
    status: item.lifecycle.primary_state,
    agent_id: item.identity.agent_id,
    domain_id: item.identity.domain_id,
    project_id: item.identity.project_id,
    work_item_id: item.identity.work_item_id,
    work_item_identity: item.identity,
    workspace_path: item.identity.workspace_path,
    work_item_root: item.identity.work_item_root,
    stage_id: item.lifecycle.current_stage_id,
    lifecycle: item.lifecycle,
    stage_map: item.stage_map,
    execution: item.execution,
    action: item.action,
    current_owner: item.action.owner_display_name,
    next_action: item.action,
    source_refs: item.source_refs.map((entry) => entry.ref),
    freshness: item.freshness,
    domain_detail_views: item.domain_detail_views,
  };
}

function identityMatches(item: WorkItemProjectionItem, identity: JsonRecord) {
  const keys = ['agent_id', 'domain_id', 'work_item_id', 'domain_work_item_id', 'work_item_scope_id'] as const;
  return identity.identity_state === 'resolved'
    && keys.every((key) => typeof identity[key] === 'string' && identity[key] === item.identity[key]);
}

function selection(items: WorkItemProjectionItem[]) {
  return {
    state: 'input_required',
    reason: 'runtime_context_work_item_selection_required',
    missing_fields: ['item_id'],
    input_schema: {
      type: 'object',
      required: ['item_id'],
      properties: {
        item_id: {
          type: 'string',
          title: '当前任务',
          enum: items.map((item) => item.item_id),
          enumNames: items.map((item) => item.identity.work_item_display_name),
        },
      },
    },
    data: { items: items.map(summary) },
  };
}

function contained(root: string, file: string) {
  const resolved = path.resolve(file);
  const rootPath = canonicalWorkspacePath(root);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) return false;
  // Validate the nearest existing ancestor as well as existing files: a missing
  // file below an escaping symlink must not become a usable artifact locator.
  let ancestor = resolved;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  const actual = canonicalWorkspacePath(ancestor);
  return actual === rootPath || actual.startsWith(`${rootPath}${path.sep}`);
}

function workspaceArtifacts(item: WorkItemProjectionItem) {
  const workspace = item.identity.workspace_path;
  const projectRoot = item.identity.work_item_root;
  if (!projectRoot || !contained(workspace, projectRoot)) return [];
  const projectionPath = path.join(projectRoot, 'control/opl/artifact_lifecycle/output_lifecycle.json');
  if (!contained(projectRoot, projectionPath) || !fs.existsSync(projectionPath)) return [];
  const projection = parseJsonText(fs.readFileSync(projectionPath, 'utf8'));
  if (!isRecord(projection)
    || projection.surface_kind !== 'opl_workspace_output_lifecycle'
    || projection.project_id !== item.identity.domain_work_item_id
    || typeof projection.project_root !== 'string'
    || canonicalWorkspacePath(path.resolve(workspace, projection.project_root)) !== canonicalWorkspacePath(projectRoot)) {
    contextError('runtime_context_artifact_identity_mismatch', 'Artifact projection does not belong to the selected work item.');
  }
  const byRef = new Map<string, JsonRecord>();
  for (const artifact of [...recordList(projection.artifacts), ...recordList(projection.current_refs)]) {
    const ref = stringValue(artifact.ref);
    const absoluteRef = ref ? path.resolve(workspace, ref) : '';
    if (!ref || !contained(projectRoot, absoluteRef)) continue;
    byRef.set(ref, {
      id: ref,
      title: path.basename(ref),
      source_ref: ref,
      path: absoluteRef,
      summary: stringValue(artifact.role),
      status: artifact.exists === false ? 'missing' : 'recorded',
      kind: artifact.kind,
      bytes: artifact.bytes,
      updated_at: artifact.updated_at,
      observed_at: projection.updated_at,
      content_policy: 'locator_only_no_artifact_content',
    });
  }
  return [...byRef.values()];
}

function attemptArtifacts(item: WorkItemProjectionItem) {
  const ledger = readWorkItemStageAttempts({ items: [item] }, { validateIrrelevantActivityJson: false });
  const joined = joinAttemptsToWorkItems({
    items: [item], attempts: ledger.attempts, qualityCycles: ledger.quality_cycles,
    queueDb: ledger.queue_db, attemptRefLimit: ledger.attempts.length,
  });
  const attemptIds = joined.items[0]?.execution.attempt_ids ?? [];
  if (attemptIds.length === 0 || !fs.existsSync(ledger.queue_db)) return [];
  const db = openFamilyRuntimeSqlite(ledger.queue_db, { readOnly: true });
  try {
    return attemptIds.flatMap((attemptId) => {
      const gallery = record(queryStageAttempt(db, attemptId).stage_attempt_query.artifact_gallery);
      const root = stringValue(gallery.workspace_root);
      const boundRoot = root && path.isAbsolute(root)
        && canonicalWorkspacePath(root) === item.identity.workspace_path ? root : null;
      return recordList(gallery.items).map((artifact) => {
        const ref = stringValue(artifact.ref);
        const localPath = boundRoot && ref && !/^[a-z][a-z0-9+.-]*:/i.test(ref)
          ? path.resolve(boundRoot, ref) : null;
        return {
          ...artifact,
          id: artifact.item_id,
          title: path.basename(String(artifact.ref)),
          source_ref: artifact.ref,
          ...(localPath && contained(boundRoot!, localPath) ? { path: localPath } : {}),
          summary: artifact.stage_id,
        };
      });
    });
  } finally {
    db.close();
  }
}

export function readAppContributionRuntimeContext(options: {
  packageRoot: string;
  view: 'progress' | 'artifacts';
  input: JsonRecord;
}) {
  const workspaceInput = process.env.OPL_PROFILE_WORKSPACE?.trim();
  if (!workspaceInput || !path.isAbsolute(workspaceInput)) {
    return { state: 'unavailable', reason: 'runtime_context_workspace_missing', data: { items: [] } };
  }
  const workspace = canonicalWorkspacePath(workspaceInput);
  const manifest = parseJsonText(fs.readFileSync(path.join(options.packageRoot, 'opl-package.json'), 'utf8'));
  const agentId = isRecord(manifest) ? stringValue(manifest.agent_id) ?? stringValue(manifest.package_id) : null;
  if (!agentId) contextError('runtime_context_package_identity_missing', 'Runtime context requires the Package identity.');
  const localDescriptor = readStandardAgentDescriptorInterface(options.packageRoot);
  const packageId = isRecord(manifest) ? stringValue(manifest.package_id) ?? agentId : agentId;
  if ((localDescriptor?.agent_id && localDescriptor.agent_id !== agentId)
    || (localDescriptor?.package_id && localDescriptor.package_id !== packageId)) {
    contextError('runtime_context_package_identity_mismatch', 'Package and runtime descriptor identities disagree.');
  }
  const descriptor = localDescriptor
    ? { ...localDescriptor, kind: 'agent' as const, agent_id: agentId, package_id: packageId }
    : readInstalledStandardAgentDescriptorForDomain(agentId);
  if (!descriptor) return { state: 'unavailable', reason: 'runtime_context_descriptor_missing', data: { items: [] } };
  const aliases = new Set([
    agentId, descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id,
    ...descriptor.interface.routing.explicit_aliases,
  ].map(normalizedIdentity));
  const bindings = listWorkspaceBindings().filter((binding) => (
    binding.status !== 'archived'
    && canonicalWorkspacePath(binding.workspace_path) === workspace
    && [binding.project_id, binding.project].some((id) => aliases.has(normalizedIdentity(id)))
  ));
  if (bindings.length === 0) {
    return { state: 'unavailable', reason: 'runtime_context_workspace_unregistered', data: { items: [] } };
  }
  const projection = buildWorkItemProjectionV2({
    profile: 'fast', bindings,
    resolveDescriptor: (id) => aliases.has(normalizedIdentity(id)) ? descriptor : null,
  });
  const candidates = projection.items.filter((item) => (
    item.identity.agent_id === agentId
    && item.identity.workspace_path === workspace
    && item.visibility.state === 'visible'
  ));
  const requestedId = stringValue(options.input.item_id);
  const requestedIdentity = options.input.work_item_identity;
  const explicitlySelected = Object.hasOwn(options.input, 'item_id') || Object.hasOwn(options.input, 'work_item_identity');
  const matches = candidates.filter((item) => (
    (!Object.hasOwn(options.input, 'item_id') || requestedId === item.item_id)
    && (!Object.hasOwn(options.input, 'work_item_identity') || (isRecord(requestedIdentity) && identityMatches(item, requestedIdentity)))
  ));
  if (matches.length === 0) {
    return {
      state: 'unavailable',
      reason: explicitlySelected ? 'runtime_context_work_item_not_found' : 'runtime_context_work_item_missing',
      data: { items: [] },
    };
  }
  if (matches.length > 1) return selection(matches);
  const item = matches[0]!;
  if (options.view === 'progress') return { state: 'ready', data: { items: [summary(item)], detail: item } };
  const artifacts = [...attemptArtifacts(item), ...workspaceArtifacts(item)];
  const unique = [...new Map(artifacts.map((artifact) => [artifact.source_ref, artifact])).values()];
  return {
    state: 'ready',
    data: { items: unique, work_item: summary(item), content_policy: 'locator_only_no_artifact_content' },
  };
}
