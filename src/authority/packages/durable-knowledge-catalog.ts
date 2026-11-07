import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import itemSchema from '../../../contracts/opl-framework/durable-knowledge-item.schema.json' with { type: 'json' };
import catalogSchema from '../../../contracts/opl-framework/durable-knowledge-catalog.schema.json' with { type: 'json' };
import receiptSchema from '../../../contracts/opl-framework/durable-knowledge-recall-receipt.schema.json' with { type: 'json' };

export const DURABLE_KNOWLEDGE_CATALOG_REF = 'contracts/durable_knowledge_catalog.json';
export const DURABLE_KNOWLEDGE_ITEM_VERSION = 'durable-knowledge-item.v1';

type JsonRecord = Record<string, unknown>;

export type DurableKnowledgeLayer =
  | 'agent_pack'
  | 'workspace_shared'
  | 'workspace_project'
  | 'dated_state';

export type DurableKnowledgeItem = {
  surface_kind: 'opl_durable_knowledge_item';
  version: typeof DURABLE_KNOWLEDGE_ITEM_VERSION;
  knowledge_id: string;
  title: string;
  layer: DurableKnowledgeLayer;
  owner: string;
  body_ref: {
    kind: 'repo_path' | 'workspace_path';
    ref: string;
    sha256?: string;
  };
  projection_source?: { root: string; ref: string; sha256: string };
  applicability: {
    domains: string[];
    stages: string[];
    tasks?: string[];
  };
  status: 'draft' | 'active' | 'deprecated' | 'superseded' | 'expired' | 'quarantined';
  reviewed_at: string;
  next_review_at: string;
  sources?: JsonRecord[];
  tags?: string[];
  supersedes?: string[];
  superseded_by?: string[];
  freshness_policy?: string;
  authority_boundary: {
    semantic_body_owner: string;
    opl_role: 'catalog_recall_and_receipt_projection_only';
  };
};

export type DurableKnowledgeRecallReceipt = {
  surface_kind: 'opl_durable_knowledge_recall_receipt';
  version: 'durable-knowledge-recall-receipt.v1';
  domain_id: string;
  stage_id: string;
  task_intent: string | null;
  selected: Array<{
    knowledge_id: string;
    layer: DurableKnowledgeLayer;
    body_ref: string;
    sha256: string;
    selection_reason: string;
  }>;
  quality_debt: string[];
  authority_boundary: {
    context_evidence_only: true;
    can_authorize_quality_verdict: false;
    can_authorize_domain_truth: false;
    can_replace_owner_receipt: false;
  };
};

export type DurableKnowledgeCatalogReadback = {
  surface_kind: 'opl_durable_knowledge_catalog';
  version: 'durable-knowledge-catalog.v1';
  owner: 'one-person-lab';
  domain_id: string | null;
  items: DurableKnowledgeItem[];
  catalog_ref: string;
  status: 'declared' | 'not_declared';
};

export const KNOWLEDGE_LOCATIONS = {
  agent_pack: { catalog: DURABLE_KNOWLEDGE_CATALOG_REF, body: 'agent/knowledge/' },
  workspace_shared: { catalog: 'shared/memory/opl_durable_knowledge_catalog.json', body: 'shared/memory/' },
  workspace_project: { catalog: 'memory/opl_durable_knowledge_catalog.json', body: 'memory/' },
  dated_state: { catalog: 'state/opl_durable_knowledge_catalog.json', body: 'state/' },
} as const;

function fail(message: string, details: JsonRecord): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Durable knowledge requires ${field}.`, { field });
  }
  return value.trim();
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`Durable knowledge requires ${field} as a non-empty string array.`, { field });
  }
  return value.map((entry) => (entry as string).trim());
}

function canonicalSha256(bytes: Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function contained(root: string, ref: string, field: string) {
  if (path.isAbsolute(ref) || ref.includes('\\') || path.posix.normalize(ref) !== ref || ref === '..' || ref.startsWith('../')) {
    fail(`Durable knowledge ${field} must be a canonical contained path.`, { field, ref });
  }
  const absolute = path.resolve(root, ref);
  const rootReal = fs.realpathSync(root);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(absolute)) {
    fail(`Durable knowledge ${field} does not resolve inside its declared root.`, { field, ref });
  }
  if (!fs.realpathSync(absolute).startsWith(`${rootReal}${path.sep}`) || !fs.statSync(absolute).isFile()) {
    fail(`Durable knowledge ${field} must resolve to a regular contained file.`, { field, ref });
  }
  return absolute;
}

function normalizeItem(value: unknown, index: number): DurableKnowledgeItem {
  assertJsonSchemaPayload({ schemaId: itemSchema.$id, schema: itemSchema }, value);
  if (!isRecord(value)) {
    fail('Durable knowledge catalog entries must be objects.', { index });
  }
  if (value.surface_kind !== 'opl_durable_knowledge_item' || value.version !== DURABLE_KNOWLEDGE_ITEM_VERSION) {
    fail('Durable knowledge catalog entry has an unsupported surface kind or version.', { index });
  }
  const layer = text(value.layer, `items[${index}].layer`) as DurableKnowledgeLayer;
  if (!['agent_pack', 'workspace_shared', 'workspace_project', 'dated_state'].includes(layer)) {
    fail('Durable knowledge catalog entry has an unsupported layer.', { index, layer });
  }
  const status = text(value.status, `items[${index}].status`);
  if (!['draft', 'active', 'deprecated', 'superseded', 'expired', 'quarantined'].includes(status)) {
    fail('Durable knowledge catalog entry has an unsupported status.', { index, status });
  }
  const body = isRecord(value.body_ref) ? value.body_ref : fail('Durable knowledge requires body_ref.', { index });
  const bodyKind = text(body.kind, `items[${index}].body_ref.kind`);
  if (!['repo_path', 'workspace_path'].includes(bodyKind)) {
    fail('Durable knowledge body_ref kind is unsupported.', { index, body_kind: bodyKind });
  }
  const applicability = isRecord(value.applicability)
    ? value.applicability
    : fail('Durable knowledge requires applicability.', { index });
  const authority = isRecord(value.authority_boundary)
    ? value.authority_boundary
    : fail('Durable knowledge requires authority_boundary.', { index });
  if (bodyKind !== (layer === 'agent_pack' ? 'repo_path' : 'workspace_path')
    || typeof body.ref !== 'string' || !body.ref.startsWith(KNOWLEDGE_LOCATIONS[layer].body)
    || !body.ref.endsWith('.md') || path.posix.normalize(body.ref) !== body.ref
    || body.ref.includes('\\')) {
    fail('Durable knowledge body must use a canonical contained path in its layer.', { index, layer, ref: body.ref });
  }
  if (Date.parse(String(value.next_review_at)) <= Date.parse(String(value.reviewed_at))) {
    fail('Durable knowledge next review must be after its review date.', { index });
  }
  if (authority.semantic_body_owner !== value.owner) {
    fail('Durable knowledge semantic owner must match its declared owner.', { index });
  }
  return {
    surface_kind: 'opl_durable_knowledge_item',
    version: DURABLE_KNOWLEDGE_ITEM_VERSION,
    knowledge_id: text(value.knowledge_id, `items[${index}].knowledge_id`),
    title: text(value.title, `items[${index}].title`),
    layer,
    owner: text(value.owner, `items[${index}].owner`),
    body_ref: {
      kind: bodyKind as DurableKnowledgeItem['body_ref']['kind'],
      ref: text(body.ref, `items[${index}].body_ref.ref`),
      ...(typeof body.sha256 === 'string' ? { sha256: text(body.sha256, `items[${index}].body_ref.sha256`) } : {}),
    },
    applicability: {
      domains: stringList(applicability.domains, `items[${index}].applicability.domains`),
      stages: stringList(applicability.stages, `items[${index}].applicability.stages`),
      ...(applicability.tasks === undefined ? {} : {
        tasks: stringList(applicability.tasks, `items[${index}].applicability.tasks`),
      }),
    },
    status: status as DurableKnowledgeItem['status'],
    reviewed_at: text(value.reviewed_at, `items[${index}].reviewed_at`),
    next_review_at: text(value.next_review_at, `items[${index}].next_review_at`),
    ...(isRecord(value.projection_source) ? {
      projection_source: {
        root: text(value.projection_source.root, 'projection_source.root'),
        ref: text(value.projection_source.ref, 'projection_source.ref'),
        sha256: text(value.projection_source.sha256, 'projection_source.sha256'),
      },
    } : {}),
    ...(Array.isArray(value.sources) ? { sources: value.sources.filter(isRecord) } : {}),
    ...(Array.isArray(value.tags) ? { tags: stringList(value.tags, `items[${index}].tags`) } : {}),
    ...(Array.isArray(value.supersedes) ? { supersedes: stringList(value.supersedes, `items[${index}].supersedes`) } : {}),
    ...(Array.isArray(value.superseded_by) ? { superseded_by: stringList(value.superseded_by, `items[${index}].superseded_by`) } : {}),
    ...(typeof value.freshness_policy === 'string' ? { freshness_policy: value.freshness_policy } : {}),
    authority_boundary: {
      semantic_body_owner: text(authority.semantic_body_owner, `items[${index}].authority_boundary.semantic_body_owner`),
      opl_role: 'catalog_recall_and_receipt_projection_only',
    },
  };
}

export function readDurableKnowledgeCatalog(
  repoDir: string,
  catalogRef = DURABLE_KNOWLEDGE_CATALOG_REF,
): DurableKnowledgeCatalogReadback {
  const layer = (Object.keys(KNOWLEDGE_LOCATIONS) as DurableKnowledgeLayer[])
    .find((candidate) => KNOWLEDGE_LOCATIONS[candidate].catalog === catalogRef);
  if (!layer) fail('Unknown durable knowledge catalog location.', { catalog_ref: catalogRef });
  const catalogPath = path.join(repoDir, catalogRef);
  if (!fs.existsSync(catalogPath)) {
    return {
      surface_kind: 'opl_durable_knowledge_catalog' as const,
      version: 'durable-knowledge-catalog.v1' as const,
      owner: 'one-person-lab' as const,
      domain_id: null,
      items: [] as DurableKnowledgeItem[],
      catalog_ref: catalogRef,
      status: 'not_declared' as const,
    };
  }
  const parsed = parseJsonText(fs.readFileSync(contained(repoDir, catalogRef, 'catalog_ref'), 'utf8'));
  return normalizeDurableKnowledgeCatalog(parsed, layer);
}

export function normalizeDurableKnowledgeCatalog(parsed: unknown, layer: DurableKnowledgeLayer = 'agent_pack'): DurableKnowledgeCatalogReadback {
  const catalogRef = KNOWLEDGE_LOCATIONS[layer].catalog;
  // Compose the canonical item schema in memory; the registry does not resolve files.
  assertJsonSchemaPayload({ schemaId: catalogSchema.$id, schema: {
    ...catalogSchema,
    properties: { ...catalogSchema.properties,
      items: { type: 'array', items: { ...itemSchema, $id: undefined } },
    },
  } }, parsed);
  if (!isRecord(parsed) || parsed.surface_kind !== 'opl_durable_knowledge_catalog' || parsed.version !== 'durable-knowledge-catalog.v1') {
    fail('Durable knowledge catalog has an unsupported surface kind or version.', { catalog_ref: catalogRef });
  }
  if (!Array.isArray(parsed.items)) {
    fail('Durable knowledge catalog items must be an array.', { catalog_ref: catalogRef });
  }
  if (parsed.owner !== 'one-person-lab') fail('Invalid durable knowledge catalog owner.', { catalog_ref: catalogRef });
  if (parsed.domain_id !== undefined && (typeof parsed.domain_id !== 'string' || !parsed.domain_id.trim())) {
    fail('Knowledge catalog domain_id must be a non-empty string.', { catalog_ref: catalogRef });
  }
  const items = parsed.items.map(normalizeItem);
  if (items.some((item) => item.layer !== layer)) {
    fail('Durable knowledge catalog contains an item in the wrong layer.', { catalog_ref: catalogRef, layer });
  }
  if (new Set(items.map((item) => item.knowledge_id)).size !== items.length) {
    fail('Durable knowledge catalog knowledge_id values must be unique.', { catalog_ref: catalogRef });
  }
  for (const item of items) {
    if (layer === 'agent_pack' && typeof parsed.domain_id === 'string'
      && !item.applicability.domains.includes(parsed.domain_id)) {
      fail('Agent knowledge applicability must include its catalog domain.', { knowledge_id: item.knowledge_id });
    }
    if (item.supersedes?.includes(item.knowledge_id) || item.superseded_by?.includes(item.knowledge_id)) {
      fail('Knowledge cannot supersede itself.', { knowledge_id: item.knowledge_id });
    }
  }
  return {
    surface_kind: 'opl_durable_knowledge_catalog' as const,
    version: 'durable-knowledge-catalog.v1' as const,
    owner: 'one-person-lab' as const,
    domain_id: typeof parsed.domain_id === 'string' ? parsed.domain_id : null,
    items,
    catalog_ref: catalogRef,
    status: 'declared' as const,
  };
}

function readOptionalWorkspaceCatalog(input: {
  root: string;
  ref: string;
  expectedLayers: DurableKnowledgeLayer[];
  catalogRole: string;
}) {
  const file = path.join(input.root, input.ref);
  if (!fs.existsSync(file)) {
    return {
      items: [] as DurableKnowledgeItem[],
      qualityDebt: [`knowledge_catalog_not_declared:${input.catalogRole}:${input.ref}`],
    };
  }
  const catalog = readDurableKnowledgeCatalog(input.root, input.ref);
  if (catalog.status === 'not_declared') {
    return {
      items: [] as DurableKnowledgeItem[],
      qualityDebt: [`knowledge_catalog_not_declared:${input.catalogRole}:${input.ref}`],
    };
  }
  const wrongLayer = catalog.items.find((item) => !input.expectedLayers.includes(item.layer));
  if (wrongLayer) {
    fail('Workspace knowledge catalog contains an item in the wrong layer.', {
      catalog_role: input.catalogRole,
      catalog_ref: input.ref,
      knowledge_id: wrongLayer.knowledge_id,
      layer: wrongLayer.layer,
      allowed_layers: input.expectedLayers,
    });
  }
  return { items: catalog.items, qualityDebt: [] as string[] };
}

export function collectDurableKnowledgeItems(input: {
  repoDir: string;
  workspaceRoot?: string | null;
  projectRoot?: string | null;
}) {
  const catalog = readDurableKnowledgeCatalog(input.repoDir);
  if (catalog.status !== 'declared') fail('Agent durable knowledge catalog is required.', { repo_dir: input.repoDir });
  const items = [...catalog.items];
  const qualityDebt: string[] = [];
  if (input.workspaceRoot && input.projectRoot) {
    const workspace = fs.realpathSync(input.workspaceRoot);
    const project = fs.realpathSync(input.projectRoot);
    if (project === workspace || !project.startsWith(`${workspace}${path.sep}`)) {
      fail('Project knowledge root must be a distinct descendant of its workspace.', {});
    }
  }
  if (input.workspaceRoot) {
    const shared = readOptionalWorkspaceCatalog({
      root: input.workspaceRoot,
      ref: KNOWLEDGE_LOCATIONS.workspace_shared.catalog,
      expectedLayers: ['workspace_shared'],
      catalogRole: 'workspace_shared',
    });
    items.push(...shared.items);
    qualityDebt.push(...shared.qualityDebt);
  }
  if (input.projectRoot) {
    const project = readOptionalWorkspaceCatalog({
      root: input.projectRoot,
      ref: KNOWLEDGE_LOCATIONS.workspace_project.catalog,
      expectedLayers: ['workspace_project'],
      catalogRole: 'workspace_project',
    });
    const dated = readOptionalWorkspaceCatalog({
      root: input.projectRoot,
      ref: KNOWLEDGE_LOCATIONS.dated_state.catalog,
      expectedLayers: ['dated_state'],
      catalogRole: 'dated_state',
    });
    items.push(...project.items, ...dated.items);
    qualityDebt.push(...project.qualityDebt, ...dated.qualityDebt);
  }
  const duplicateIds = items
    .map((item) => item.knowledge_id)
    .filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    fail('Durable knowledge ids must be unique across the effective catalogs.', {
      duplicate_knowledge_ids: [...new Set(duplicateIds)].sort(),
    });
  }
  return { catalog, items, qualityDebt };
}

export function resolveDurableKnowledgeBody(input: {
  item: DurableKnowledgeItem;
  domainPackRoot?: string | null;
  workspaceRoot?: string | null;
  projectRoot?: string | null;
}) {
  const root = input.item.layer === 'agent_pack'
    ? input.domainPackRoot
    : input.item.layer === 'workspace_shared'
      ? input.workspaceRoot
      : input.projectRoot;
  if (!root) {
    fail('Durable knowledge body root is unavailable for its layer.', {
      knowledge_id: input.item.knowledge_id,
      layer: input.item.layer,
    });
  }
  const file = contained(root, input.item.body_ref.ref, `body_ref(${input.item.knowledge_id})`);
  const layerRoot = path.resolve(fs.realpathSync(root), KNOWLEDGE_LOCATIONS[input.item.layer].body);
  if (!fs.realpathSync(file).startsWith(`${layerRoot}${path.sep}`)) {
    fail('Knowledge body symlink crosses its layer boundary.', { knowledge_id: input.item.knowledge_id });
  }
  const bytes = fs.readFileSync(file);
  const sha256 = canonicalSha256(bytes);
  if (input.item.body_ref.sha256 && input.item.body_ref.sha256 !== sha256) {
    fail('Durable knowledge body digest does not match the catalog declaration.', {
      knowledge_id: input.item.knowledge_id,
      expected: input.item.body_ref.sha256,
      observed: sha256,
    });
  }
  const source = input.item.projection_source;
  if (source) {
    if (input.item.layer === 'agent_pack' || !path.isAbsolute(source.root)) {
      fail('Projection sources require an explicit workspace-owned absolute source root.', { knowledge_id: input.item.knowledge_id });
    }
    const sourceFile = contained(source.root, source.ref, 'projection_source');
    if (fs.statSync(sourceFile).size > 256 * 1024 || source.sha256 !== sha256
      || canonicalSha256(fs.readFileSync(sourceFile)) !== source.sha256) {
      fail('Knowledge projection source changed; owner review and projection refresh are required.', {
        knowledge_id: input.item.knowledge_id,
      });
    }
  }
  return {
    knowledge_id: input.item.knowledge_id,
    layer: input.item.layer,
    body_ref: input.item.body_ref.ref,
    sha256,
    bytes,
  };
}

export function recallDurableKnowledge(input: {
  repoDir: string;
  domainId: string;
  stageId: string;
  taskIntent?: string | null;
  domainPackRoot?: string | null;
  workspaceRoot?: string | null;
  projectRoot?: string | null;
  now?: Date;
}): DurableKnowledgeRecallReceipt {
  const effective = collectDurableKnowledgeItems(input);
  const now = input.now ?? new Date();
  const selected: DurableKnowledgeRecallReceipt['selected'] = [];
  const qualityDebt: string[] = [...effective.qualityDebt];
  for (const item of effective.items) {
    if (item.status !== 'active') continue;
    if (item.superseded_by?.length) continue;
    if (!item.applicability.domains.includes(input.domainId)) continue;
    if (!item.applicability.stages.includes(input.stageId)) continue;
    if (item.applicability.tasks?.length && !item.applicability.tasks.includes(input.taskIntent ?? '')) {
      continue;
    }
    if (Date.parse(item.reviewed_at) > now.getTime()) {
      qualityDebt.push(`knowledge_review_in_future:${item.knowledge_id}:${item.reviewed_at}`);
      continue;
    }
    if (Date.parse(item.next_review_at) <= now.getTime()) {
      qualityDebt.push(`knowledge_review_overdue:${item.knowledge_id}:${item.next_review_at}`);
      continue;
    }
    const replacement = effective.items.find((other) => other.status === 'active'
      && other.layer === item.layer && !other.superseded_by?.length
      && other.supersedes?.includes(item.knowledge_id)
      && other.applicability.domains.includes(input.domainId)
      && other.applicability.stages.includes(input.stageId)
      && (!other.applicability.tasks?.length || other.applicability.tasks.includes(input.taskIntent ?? ''))
      && Date.parse(other.reviewed_at) <= now.getTime() && Date.parse(other.next_review_at) > now.getTime());
    if (replacement) continue;
    const body = resolveDurableKnowledgeBody({
      item,
      domainPackRoot: input.domainPackRoot,
      workspaceRoot: input.workspaceRoot,
      projectRoot: input.projectRoot,
    });
    selected.push({
      knowledge_id: item.knowledge_id,
      layer: item.layer,
      body_ref: body.body_ref,
      sha256: body.sha256,
      selection_reason: `active_for:${input.domainId}/${input.stageId}`,
    });
  }
  return {
    surface_kind: 'opl_durable_knowledge_recall_receipt',
    version: 'durable-knowledge-recall-receipt.v1',
    domain_id: input.domainId,
    stage_id: input.stageId,
    task_intent: input.taskIntent ?? null,
    selected,
    quality_debt: qualityDebt,
    authority_boundary: {
      context_evidence_only: true,
      can_authorize_quality_verdict: false,
      can_authorize_domain_truth: false,
      can_replace_owner_receipt: false,
    },
  };
}

// One StageRun consumes one snapshot across all quality roles. Bodies remain
// scoped execution inputs; public catalogs and CLI readbacks contain refs only.
export function bindDurableKnowledgeContext(input: Parameters<typeof recallDurableKnowledge>[0]) {
  const receipt = recallDurableKnowledge(input);
  const bodies = receipt.selected.map((selected) => {
    const root = selected.layer === 'agent_pack' ? input.domainPackRoot
      : selected.layer === 'workspace_shared' ? input.workspaceRoot : input.projectRoot;
    if (!root) fail('Knowledge context root is missing.', { layer: selected.layer });
    const bytes = fs.readFileSync(contained(root, selected.body_ref, 'knowledge_context'));
    if (canonicalSha256(bytes) !== selected.sha256) fail('Knowledge changed during context binding.', { knowledge_id: selected.knowledge_id });
    if (!bytes.length || bytes.length > 256 * 1024) fail('Knowledge body exceeds the supported text size.', { knowledge_id: selected.knowledge_id });
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ...selected, content, size_bytes: bytes.length };
  });
  if (bodies.reduce((size, body) => size + body.size_bytes, 0) > 512 * 1024) {
    fail('Stage knowledge selection exceeds its context budget; narrow applicability.', {});
  }
  return { receipt, bodies };
}

export type DurableKnowledgeContext = ReturnType<typeof bindDurableKnowledgeContext>;

export function validateDurableKnowledgeContext(value: unknown, domainId: string, stageId: string): DurableKnowledgeContext {
  if (!isRecord(value) || !Array.isArray(value.bodies)) fail('Knowledge context must contain a receipt and bodies.', {});
  assertJsonSchemaPayload({ schemaId: receiptSchema.$id, schema: receiptSchema }, value.receipt);
  const context = value as DurableKnowledgeContext;
  if (context.receipt.domain_id !== domainId || context.receipt.stage_id !== stageId
    || context.bodies.length !== context.receipt.selected.length) fail('Knowledge context identity mismatch.', {});
  if (new Set(context.receipt.selected.map((item) => item.knowledge_id)).size !== context.bodies.length) {
    fail('Knowledge context contains duplicate identities.', {});
  }
  for (const [index, body] of context.bodies.entries()) {
    const selected = context.receipt.selected[index]!;
    if (!isRecord(body) || typeof body.content !== 'string' || !Number.isInteger(body.size_bytes)
      || body.size_bytes <= 0 || body.size_bytes > 256 * 1024
      || body.knowledge_id !== selected.knowledge_id || body.layer !== selected.layer
      || body.body_ref !== selected.body_ref || body.sha256 !== selected.sha256
      || canonicalSha256(Buffer.from(body.content)) !== selected.sha256
      || Buffer.byteLength(body.content) !== body.size_bytes) fail('Knowledge context bytes differ from recall receipt.', { index });
  }
  if (context.bodies.reduce((size, body) => size + body.size_bytes, 0) > 512 * 1024) {
    fail('Knowledge context exceeds its text budget.', {});
  }
  return context;
}
