import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

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
    kind: 'repo_path' | 'workspace_path' | 'external_ref';
    ref: string;
    sha256?: string;
  };
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
  workspace_catalog_ref?: string;
  project_catalog_ref?: string;
  dated_state_catalog_ref?: string;
};

export type LegacyMemoryDescriptorReadback = {
  status: 'compatible_legacy_descriptor' | 'missing' | 'invalid';
  descriptor_ref: string;
  memory_ref_id: string | null;
  domain_id: string | null;
  body_ref: string | null;
  migration_state: 'legacy_preserved' | 'catalog_declared' | 'invalid';
};

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
  if (!['repo_path', 'workspace_path', 'external_ref'].includes(bodyKind)) {
    fail('Durable knowledge body_ref kind is unsupported.', { index, body_kind: bodyKind });
  }
  const applicability = isRecord(value.applicability)
    ? value.applicability
    : fail('Durable knowledge requires applicability.', { index });
  const authority = isRecord(value.authority_boundary)
    ? value.authority_boundary
    : fail('Durable knowledge requires authority_boundary.', { index });
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
  const parsed = parseJsonText(fs.readFileSync(catalogPath, 'utf8'));
  if (!isRecord(parsed) || parsed.surface_kind !== 'opl_durable_knowledge_catalog' || parsed.version !== 'durable-knowledge-catalog.v1') {
    fail('Durable knowledge catalog has an unsupported surface kind or version.', { catalog_ref: catalogRef });
  }
  if (!Array.isArray(parsed.items)) {
    fail('Durable knowledge catalog items must be an array.', { catalog_ref: catalogRef });
  }
  const items = parsed.items.map(normalizeItem);
  if (new Set(items.map((item) => item.knowledge_id)).size !== items.length) {
    fail('Durable knowledge catalog knowledge_id values must be unique.', { catalog_ref: catalogRef });
  }
  return {
    surface_kind: 'opl_durable_knowledge_catalog' as const,
    version: 'durable-knowledge-catalog.v1' as const,
    owner: 'one-person-lab' as const,
    domain_id: typeof parsed.domain_id === 'string' ? parsed.domain_id : null,
    items,
    catalog_ref: catalogRef,
    status: 'declared' as const,
    ...(typeof parsed.workspace_catalog_ref === 'string'
      ? { workspace_catalog_ref: parsed.workspace_catalog_ref }
      : {}),
    ...(typeof parsed.project_catalog_ref === 'string'
      ? { project_catalog_ref: parsed.project_catalog_ref }
      : {}),
    ...(typeof parsed.dated_state_catalog_ref === 'string'
      ? { dated_state_catalog_ref: parsed.dated_state_catalog_ref }
      : {}),
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

function collectDurableKnowledgeItems(input: {
  repoDir: string;
  workspaceRoot?: string | null;
  projectRoot?: string | null;
}) {
  const catalog = readDurableKnowledgeCatalog(input.repoDir);
  const items = [...catalog.items];
  const qualityDebt: string[] = [];
  if (input.workspaceRoot && input.projectRoot) {
    const shared = readOptionalWorkspaceCatalog({
      root: input.workspaceRoot,
      ref: catalog.workspace_catalog_ref ?? 'shared/memory/opl_durable_knowledge_catalog.json',
      expectedLayers: ['workspace_shared'],
      catalogRole: 'workspace_shared',
    });
    items.push(...shared.items);
    qualityDebt.push(...shared.qualityDebt);
  }
  if (input.projectRoot) {
    const project = readOptionalWorkspaceCatalog({
      root: input.projectRoot,
      ref: catalog.project_catalog_ref ?? 'memory/opl_durable_knowledge_catalog.json',
      expectedLayers: ['workspace_project'],
      catalogRole: 'workspace_project',
    });
    const dated = readOptionalWorkspaceCatalog({
      root: input.projectRoot,
      ref: catalog.dated_state_catalog_ref ?? 'state/opl_durable_knowledge_catalog.json',
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

export function readLegacyMemoryDescriptor(repoDir: string): LegacyMemoryDescriptorReadback {
  const ref = 'contracts/memory_descriptor.json';
  const file = path.join(repoDir, ref);
  if (!fs.existsSync(file)) {
    return {
      status: 'missing',
      descriptor_ref: ref,
      memory_ref_id: null,
      domain_id: null,
      body_ref: null,
      migration_state: 'legacy_preserved',
    };
  }
  try {
    const parsed = parseJsonText(fs.readFileSync(file, 'utf8'));
    if (!isRecord(parsed)) throw new Error('descriptor is not an object');
    const memoryRefId = typeof parsed.memory_ref_id === 'string' ? parsed.memory_ref_id : null;
    const domainId = typeof parsed.target_domain_id === 'string'
      ? parsed.target_domain_id
      : typeof parsed.domain_id === 'string' ? parsed.domain_id : null;
    const bodyRef = isRecord(parsed.canonical_body_ref) && typeof parsed.canonical_body_ref.ref === 'string'
      ? parsed.canonical_body_ref.ref
      : isRecord(parsed.memory_pack_ref) && typeof parsed.memory_pack_ref.ref === 'string'
        ? parsed.memory_pack_ref.ref
        : null;
    const catalogExists = fs.existsSync(path.join(repoDir, DURABLE_KNOWLEDGE_CATALOG_REF));
    return {
      status: 'compatible_legacy_descriptor',
      descriptor_ref: ref,
      memory_ref_id: memoryRefId,
      domain_id: domainId,
      body_ref: bodyRef,
      migration_state: catalogExists ? 'catalog_declared' : 'legacy_preserved',
    };
  } catch {
    return {
      status: 'invalid',
      descriptor_ref: ref,
      memory_ref_id: null,
      domain_id: null,
      body_ref: null,
      migration_state: 'invalid',
    };
  }
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
  const bytes = fs.readFileSync(file);
  const sha256 = canonicalSha256(bytes);
  if (input.item.body_ref.sha256 && input.item.body_ref.sha256 !== sha256) {
    fail('Durable knowledge body digest does not match the catalog declaration.', {
      knowledge_id: input.item.knowledge_id,
      expected: input.item.body_ref.sha256,
      observed: sha256,
    });
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
    if (!item.applicability.domains.includes(input.domainId)) continue;
    if (!item.applicability.stages.includes(input.stageId)) continue;
    if (item.applicability.tasks?.length && !item.applicability.tasks.some((token) => input.taskIntent?.includes(token))) {
      continue;
    }
    if (Date.parse(item.next_review_at) < now.getTime()) {
      qualityDebt.push(`knowledge_review_overdue:${item.knowledge_id}:${item.next_review_at}`);
      continue;
    }
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
