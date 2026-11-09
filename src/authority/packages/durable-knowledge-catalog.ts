import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { validateKnowledgeRequirements } from '../evolution/index.ts';
import catalogSchema from '../../../contracts/opl-framework/durable-knowledge-catalog.schema.json' with { type: 'json' };
import receiptSchema from '../../../contracts/opl-framework/durable-knowledge-recall-receipt.schema.json' with { type: 'json' };
import {
  containedKnowledgeFile, itemSchema, knowledgeCurrentness, knowledgeDigest, knowledgeFailure,
  normalizeKnowledgeItem, type DurableKnowledgeItem, type DurableKnowledgeScope, type KnowledgeDependency,
} from './durable-knowledge-model.ts';
import {
  readBoundKnowledgeSources, resolveKnowledgeSourceItem, type SourceInput,
} from './durable-knowledge-sources.ts';
export { resolveKnowledgeSourceItem, verifyKnowledgeDependencies, KNOWLEDGE_BINDINGS_REF } from './durable-knowledge-sources.ts';
export type { DurableKnowledgeItem, DurableKnowledgeScope, KnowledgeDependency } from './durable-knowledge-model.ts';
export const DURABLE_KNOWLEDGE_CATALOG_REF = 'contracts/durable_knowledge_catalog.json';
export const DURABLE_KNOWLEDGE_ITEM_VERSION = 'durable-knowledge-item.v2';

type KnowledgeInput = {
  repoDir: string; domainId: string; stageId: string; taskIntent?: string | null;
  domainPackRoot?: string | null; workspaceRoot?: string | null; projectRoot?: string | null; now?: Date;
};
type Selection = {
  knowledge_id: string; scope: DurableKnowledgeScope; content_kind: DurableKnowledgeItem['content_kind'];
  body_ref: string; source_id?: string; sha256: string; selection_reason: string; action_critical?: boolean;
};
type DependencySnapshot = KnowledgeDependency & { scope: DurableKnowledgeScope; action_critical?: boolean };
export type DurableKnowledgeRecallReceipt = {
  surface_kind: 'opl_durable_knowledge_recall_receipt'; version: 'durable-knowledge-recall-receipt.v2';
  domain_id: string; stage_id: string; task_intent: string | null; selected: Selection[]; quality_debt: string[];
  knowledge_domain_id?: string;
  authority_boundary: { context_evidence_only: true; can_authorize_quality_verdict: false; can_authorize_domain_truth: false; can_replace_owner_receipt: false };
};
export type DurableKnowledgeCatalogReadback = {
  surface_kind: 'opl_durable_knowledge_catalog'; version: 'durable-knowledge-catalog.v2'; owner: 'one-person-lab';
  domain_id: string | null; items: DurableKnowledgeItem[]; catalog_ref: string; status: 'declared' | 'not_declared';
};
export function normalizeDurableKnowledgeCatalog(parsed: unknown): DurableKnowledgeCatalogReadback {
  assertJsonSchemaPayload({ schemaId: catalogSchema.$id, schema: {
    ...catalogSchema, properties: { ...catalogSchema.properties, items: { type: 'array', items: { ...itemSchema, $id: undefined } } },
  } }, parsed);
  const value = parsed as { domain_id?: string; items: unknown[] };
  const items = value.items.map(normalizeKnowledgeItem);
  if (items.some((item) => item.scope.kind !== 'product')) knowledgeFailure('Agent catalogs may only declare product knowledge.');
  if (new Set(items.map((item) => item.knowledge_id)).size !== items.length) knowledgeFailure('Knowledge ids must be unique.');
  for (const item of items) {
    if (value.domain_id && !item.applicability.domains.includes(value.domain_id)) knowledgeFailure('Product knowledge must apply to its catalog domain.', { knowledge_id: item.knowledge_id });
  }
  return { surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2', owner: 'one-person-lab',
    domain_id: value.domain_id ?? null, items, catalog_ref: DURABLE_KNOWLEDGE_CATALOG_REF, status: 'declared' };
}
export function readDurableKnowledgeCatalog(repoDir: string, catalogRef = DURABLE_KNOWLEDGE_CATALOG_REF): DurableKnowledgeCatalogReadback {
  if (catalogRef !== DURABLE_KNOWLEDGE_CATALOG_REF) knowledgeFailure('Private knowledge uses explicit source bindings, not path-based catalogs.');
  if (!fs.existsSync(path.join(repoDir, catalogRef))) return {
    surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2', owner: 'one-person-lab',
    domain_id: null, items: [], catalog_ref: catalogRef, status: 'not_declared',
  };
  return normalizeDurableKnowledgeCatalog(JSON.parse(fs.readFileSync(containedKnowledgeFile(repoDir, catalogRef), 'utf8')));
}
export function resolveKnowledgeDomainId(repoDir: string, domainId: string) {
  const catalog = readDurableKnowledgeCatalog(repoDir);
  if (!catalog.domain_id || domainId === catalog.domain_id) return domainId;
  const descriptorRef = 'contracts/domain_descriptor.json';
  if (fs.existsSync(path.join(repoDir, descriptorRef))) {
    const descriptor = JSON.parse(fs.readFileSync(containedKnowledgeFile(repoDir, descriptorRef), 'utf8'));
    if (descriptor.domain_id === catalog.domain_id && descriptor.standard_agent_interface?.runtime?.runtime_domain_id === domainId) return catalog.domain_id;
  }
  knowledgeFailure('Knowledge domain is not owned by this declared Agent descriptor.', { domain_id: domainId });
}
export function collectDurableKnowledgeItems(input: {
  repoDir: string; domainId?: string; workspaceRoot?: string | null; projectRoot?: string | null;
}) {
  const catalog = readDurableKnowledgeCatalog(input.repoDir);
  if (catalog.status !== 'declared') knowledgeFailure('Agent durable knowledge catalog is required.');
  const sources = input.workspaceRoot ? readBoundKnowledgeSources({
    workspaceRoot: input.workspaceRoot, projectRoot: input.projectRoot, domainId: input.domainId ?? catalog.domain_id ?? '',
  }) : { entries: [], qualityDebt: [], requiredIds: [] as string[], requirementBindings: [] };
  const items = [...catalog.items, ...sources.entries.map((entry) => entry.item)];
  if (new Set(items.map((item) => item.knowledge_id)).size !== items.length) knowledgeFailure('Effective knowledge ids must have one source owner.');
  return { catalog, items, qualityDebt: sources.qualityDebt, sourceEntries: sources.entries, requiredIds: sources.requiredIds, requirementBindings: sources.requirementBindings };
}
export function resolveDurableKnowledgeBody(input: {
  item: DurableKnowledgeItem; domainId?: string; domainPackRoot?: string | null;
  workspaceRoot?: string | null; projectRoot?: string | null; now?: Date;
}) {
  const { item } = input;
  let bodyPath: string;
  if (item.scope.kind === 'product') {
    if (!input.domainPackRoot) knowledgeFailure('Product knowledge root is missing.');
    bodyPath = containedKnowledgeFile(input.domainPackRoot, item.body_ref.ref);
  } else {
    if (!input.workspaceRoot || !input.domainId) knowledgeFailure('Private knowledge requires its authorized workspace and domain.');
    const resolved = resolveKnowledgeSourceItem({ workspaceRoot: input.workspaceRoot, projectRoot: input.projectRoot,
      domainId: input.domainId, knowledgeId: item.knowledge_id, now: input.now });
    if (resolved.item.body_ref.sha256 !== item.body_ref.sha256) knowledgeFailure('Knowledge source changed during selection.');
    bodyPath = resolved.bodyPath;
  }
  const bytes = fs.readFileSync(bodyPath);
  if (!bytes.length || bytes.length > 256 * 1024) knowledgeFailure('Knowledge body exceeds its text budget.', { knowledge_id: item.knowledge_id });
  const sha256 = knowledgeDigest(bytes);
  if (item.body_ref.sha256 && sha256 !== item.body_ref.sha256) knowledgeFailure(`knowledge_source_drifted:${item.knowledge_id}`);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { knowledge_id: item.knowledge_id, scope: item.scope, content_kind: item.content_kind,
    body_ref: item.body_ref.ref, source_id: item.body_ref.source_id, sha256, content, size_bytes: bytes.length };
}
function applicable(item: DurableKnowledgeItem, input: KnowledgeInput) {
  return item.applicability.domains.includes(input.domainId) && item.applicability.stages.includes(input.stageId)
    && (!item.applicability.tasks?.length || item.applicability.tasks.includes(input.taskIntent ?? ''));
}
function selectedBodies(input: KnowledgeInput) {
  const runtimeDomainId = input.domainId;
  input = { ...input, domainId: resolveKnowledgeDomainId(input.repoDir, input.domainId) };
  const effective = collectDurableKnowledgeItems(input);
  const qualityDebt = [...effective.qualityDebt];
  const bodies: Array<Selection & { content: string; size_bytes: number; dependencies?: DependencySnapshot[] }> = [];
  const required = new Set(effective.requiredIds.filter((id) => {
    const item = effective.items.find((candidate) => candidate.knowledge_id === id);
    return !item || applicable(item, input);
  }));
  const resolve = (item: DurableKnowledgeItem, trail = new Set<string>(), dependencies: DependencySnapshot[] = []): ReturnType<typeof resolveDurableKnowledgeBody> => {
    if (trail.has(item.knowledge_id)) knowledgeFailure(`knowledge_dependency_cycle:${item.knowledge_id}`);
    const issue = knowledgeCurrentness(item, input.now);
    if (issue) knowledgeFailure(issue);
    const sourceIssue = effective.sourceEntries.find((entry) => entry.item.knowledge_id === item.knowledge_id)?.issue;
    if (sourceIssue) knowledgeFailure(sourceIssue);
    const next = new Set(trail).add(item.knowledge_id);
    for (const dependency of item.derived_from ?? []) {
      const source = effective.items.find((candidate) => candidate.knowledge_id === dependency.knowledge_id);
      if (!source || !source.applicability.domains.includes(input.domainId)) knowledgeFailure(`knowledge_dependency_unavailable:${dependency.knowledge_id}`);
      if (resolve(source, next, dependencies).sha256 !== dependency.sha256) knowledgeFailure(`knowledge_dependency_drifted:${dependency.knowledge_id}`);
      if (!dependencies.some((candidate) => candidate.knowledge_id === source.knowledge_id)) dependencies.push({
        ...dependency, scope: source.scope, ...(source.action_critical ? { action_critical: true } : {}),
      });
    }
    return resolveDurableKnowledgeBody({ item, domainId: input.domainId, domainPackRoot: input.domainPackRoot ?? input.repoDir,
      workspaceRoot: input.workspaceRoot, projectRoot: input.projectRoot, now: input.now });
  };
  for (const item of effective.items) {
    if (!applicable(item, input)) continue;
    if (item.requirement === 'required') required.add(item.knowledge_id);
    const replacement = effective.items.find((other) => applicable(other, input) && !knowledgeCurrentness(other, input.now)
      && other.scope.kind === item.scope.kind && other.scope.id === item.scope.id && other.supersedes?.includes(item.knowledge_id));
    if (replacement || item.superseded_by?.length) {
      if (!replacement) qualityDebt.push(`knowledge_replacement_unavailable:${item.knowledge_id}`);
      continue;
    }
    try {
      const dependencies: DependencySnapshot[] = [];
      const body = resolve(item, new Set(), dependencies);
      bodies.push({ knowledge_id: body.knowledge_id, scope: body.scope, content_kind: body.content_kind,
        body_ref: body.body_ref, ...(body.source_id ? { source_id: body.source_id } : {}), sha256: body.sha256,
        selection_reason: `active_for:${input.domainId}/${input.stageId}`, ...(item.action_critical ? { action_critical: true } : {}),
        content: body.content, size_bytes: body.size_bytes,
        ...(dependencies.length ? { dependencies } : {}) });
    } catch (error) {
      qualityDebt.push(error instanceof Error ? error.message : `knowledge_unavailable:${item.knowledge_id}`);
    }
  }
  const missing = [...required].filter((id) => {
    if (bodies.some((body) => body.knowledge_id === id)) return false;
    if (effective.requiredIds.includes(id)) return true;
    const original = effective.items.find((item) => item.knowledge_id === id);
    return !original || !bodies.some((body) => {
      const candidate = effective.items.find((item) => item.knowledge_id === body.knowledge_id)!;
      return candidate.scope.kind === original.scope.kind && candidate.scope.id === original.scope.id
        && candidate.content_kind === original.content_kind
        && (candidate.supersedes?.includes(id) || original.superseded_by?.includes(candidate.knowledge_id));
    });
  });
  const policyPath = path.join(input.repoDir, 'contracts/memory_policy.json');
  if (fs.existsSync(policyPath)) {
    const policy = JSON.parse(fs.readFileSync(containedKnowledgeFile(input.repoDir, 'contracts/memory_policy.json'), 'utf8'));
    if (policy.knowledge_requirements !== undefined) {
      for (const requirement of validateKnowledgeRequirements(policy.knowledge_requirements)) {
        const mapping = effective.requirementBindings.find((candidate) => candidate.requirement_id === requirement.requirement_id
          && candidate.semantic_owner_ref === requirement.semantic_owner_ref);
        const matches = bodies.filter((body) => {
          const item = effective.items.find((candidate) => candidate.knowledge_id === body.knowledge_id)!;
          if (body.scope.kind !== requirement.scope_kind || body.content_kind !== requirement.content_kind) return false;
          if (mapping ? item.owner !== mapping.owner_id || !mapping.knowledge_ids.includes(body.knowledge_id) : item.owner !== requirement.semantic_owner_ref) return false;
          const source = effective.sourceEntries.find((entry) => entry.item.knowledge_id === body.knowledge_id);
          const sourceRoot = source ? fs.realpathSync(source.source.root) : null;
          const workspaceRoot = input.workspaceRoot ? fs.realpathSync(input.workspaceRoot) : null;
          const local = sourceRoot && workspaceRoot && (sourceRoot === workspaceRoot || sourceRoot.startsWith(`${workspaceRoot}${path.sep}`));
          const mode = body.scope.kind === 'product' ? 'product' : local ? 'workspace' : 'external';
          return requirement.source_modes.includes(mode);
        });
        if (requirement.action_critical) for (const body of matches) body.action_critical = true;
        if (requirement.requirement === 'required' && !matches.length) {
          missing.push(`requirement:${requirement.requirement_id}`);
        }
      }
    }
  }
  if (missing.length) knowledgeFailure('Required knowledge is unavailable.', { missing_knowledge_ids: missing, quality_debt: qualityDebt });
  if (bodies.reduce((sum, body) => sum + body.size_bytes, 0) > 512 * 1024) knowledgeFailure('Stage knowledge exceeds its context budget; narrow applicability.');
  const receipt: DurableKnowledgeRecallReceipt = {
    surface_kind: 'opl_durable_knowledge_recall_receipt', version: 'durable-knowledge-recall-receipt.v2',
    domain_id: runtimeDomainId, knowledge_domain_id: input.domainId, stage_id: input.stageId, task_intent: input.taskIntent ?? null,
    selected: bodies.map(({ content: _content, size_bytes: _size, dependencies: _dependencies, ...selection }) => selection),
    quality_debt: qualityDebt, authority_boundary: { context_evidence_only: true, can_authorize_quality_verdict: false,
      can_authorize_domain_truth: false, can_replace_owner_receipt: false },
  };
  return { receipt, bodies };
}
export function recallDurableKnowledge(input: KnowledgeInput): DurableKnowledgeRecallReceipt {
  return selectedBodies(input).receipt;
}
export type DurableKnowledgeContext = {
  receipt: DurableKnowledgeRecallReceipt;
  bodies: Array<Selection & { content: string; size_bytes: number; dependencies?: DependencySnapshot[] }>;
  access_context?: { workspace_root: string; project_root: string | null };
};
export function bindDurableKnowledgeContext(input: KnowledgeInput): DurableKnowledgeContext {
  return { ...selectedBodies(input), ...(input.workspaceRoot ? { access_context: {
    workspace_root: fs.realpathSync(input.workspaceRoot), project_root: input.projectRoot ? fs.realpathSync(input.projectRoot) : null,
  } } : {}) };
}
export function validateDurableKnowledgeContext(value: unknown, domainId: string, stageId: string): DurableKnowledgeContext {
  if (!isRecord(value) || !Array.isArray(value.bodies)) knowledgeFailure('Knowledge context must contain a receipt and bodies.');
  assertJsonSchemaPayload({ schemaId: receiptSchema.$id, schema: receiptSchema }, value.receipt);
  const context = value as DurableKnowledgeContext;
  if (context.receipt.domain_id !== domainId || context.receipt.stage_id !== stageId
    || context.bodies.length !== context.receipt.selected.length) knowledgeFailure('Knowledge context identity mismatch.');
  if (new Set(context.receipt.selected.map((item) => item.knowledge_id)).size !== context.bodies.length) knowledgeFailure('Knowledge context contains duplicate identities.');
  for (const [index, body] of context.bodies.entries()) {
    const selection = context.receipt.selected[index]!;
    const { content, size_bytes, dependencies: _dependencies, ...identity } = body;
    if (typeof content !== 'string' || !Number.isInteger(size_bytes) || size_bytes <= 0 || size_bytes > 256 * 1024
      || canonicalJsonText(identity) !== canonicalJsonText(selection) || knowledgeDigest(content) !== selection.sha256
      || Buffer.byteLength(content) !== size_bytes) knowledgeFailure('Knowledge context bytes differ from recall receipt.', { index });
    if (body.scope.kind !== 'product' && (!context.access_context?.workspace_root || !body.source_id)) knowledgeFailure('Private snapshot lacks its access binding.');
  }
  if (context.bodies.reduce((sum, body) => sum + body.size_bytes, 0) > 512 * 1024) knowledgeFailure('Knowledge context exceeds its text budget.');
  return context;
}
export function revalidateDurableKnowledgeContextAccess(context: DurableKnowledgeContext, options: { forAction?: boolean } = {}) {
  const access = context.access_context;
  const hasPrivateKnowledge = context.bodies.some((body) => body.scope.kind !== 'product'
    || body.dependencies?.some((dependency) => dependency.scope.kind !== 'product'));
  if (hasPrivateKnowledge && !access) knowledgeFailure('Private snapshot lacks its current authorization binding.');
  if (!access) return { valid: true, checked_knowledge_ids: [] as string[] };
  const input: SourceInput = { workspaceRoot: access.workspace_root, projectRoot: access.project_root, domainId: context.receipt.knowledge_domain_id ?? context.receipt.domain_id };
  if (options.forAction) {
    const current = readBoundKnowledgeSources(input);
    const selected = new Set(context.bodies.map((body) => body.knowledge_id));
    for (const id of current.requiredIds) {
      const item = current.entries.find((entry) => entry.item.knowledge_id === id)?.item;
      if (item && (!item.applicability.stages.includes(context.receipt.stage_id)
        || (item.applicability.tasks?.length && !item.applicability.tasks.includes(context.receipt.task_intent ?? '')))) continue;
      if (!selected.has(id)) knowledgeFailure(`knowledge_action_context_changed:${id}`);
    }
    for (const entry of current.entries) {
      const item = entry.item;
      if (!item.applicability.stages.includes(context.receipt.stage_id)
        || (item.applicability.tasks?.length && !item.applicability.tasks.includes(context.receipt.task_intent ?? ''))) continue;
      const replacementConsumed = current.entries.some(({ item: candidate }) => selected.has(candidate.knowledge_id)
        && !knowledgeCurrentness(candidate) && candidate.scope.kind === item.scope.kind && candidate.scope.id === item.scope.id
        && candidate.content_kind === item.content_kind
        && (candidate.supersedes?.includes(item.knowledge_id) || item.superseded_by?.includes(candidate.knowledge_id)));
      if ((item.action_critical || item.requirement === 'required') && !selected.has(item.knowledge_id) && !replacementConsumed) {
        knowledgeFailure(`knowledge_action_context_changed:${item.knowledge_id}`);
      }
    }
  }
  const checked = new Set<string>();
  const authorize = (id: string) => {
    const current = resolveKnowledgeSourceItem({ ...input, knowledgeId: id, allowInactive: true });
    if (current.item.status === 'quarantined') knowledgeFailure(`knowledge_source_quarantined:${id}`);
    checked.add(id);
    return current;
  };
  for (const body of context.bodies) {
    for (const dependency of body.dependencies ?? []) {
      if (dependency.scope.kind === 'product') continue;
      const origin = authorize(dependency.knowledge_id);
      if (origin.item.scope.kind !== dependency.scope.kind || origin.item.scope.id !== dependency.scope.id) knowledgeFailure('Snapshot dependency ownership changed.');
      if (options.forAction && (dependency.action_critical || origin.item.action_critical)) {
        if (knowledgeCurrentness(origin.item) || origin.currentSha256 !== dependency.sha256 || origin.item.body_ref.sha256 !== dependency.sha256) {
          knowledgeFailure(`knowledge_action_context_changed:${dependency.knowledge_id}`);
        }
      }
    }
    if (body.scope.kind === 'product') continue;
    const current = authorize(body.knowledge_id);
    if (current.source.source_id !== body.source_id || current.item.scope.kind !== body.scope.kind
      || current.item.scope.id !== body.scope.id) knowledgeFailure('Snapshot knowledge ownership changed.');
    if (options.forAction && (body.action_critical || current.item.action_critical)) {
      const issue = knowledgeCurrentness(current.item);
      if (issue || current.currentSha256 !== body.sha256 || current.item.body_ref.sha256 !== body.sha256) knowledgeFailure(`knowledge_action_context_changed:${body.knowledge_id}`);
    }
  }
  return { valid: true, checked_knowledge_ids: [...checked] };
}
