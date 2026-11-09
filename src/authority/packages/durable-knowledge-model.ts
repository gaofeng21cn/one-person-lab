import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import itemSchema from '../../../contracts/opl-framework/durable-knowledge-item.schema.json' with { type: 'json' };

export type JsonRecord = Record<string, unknown>;
export type DurableKnowledgeScope = { kind: 'product' | 'owner' | 'topic' | 'project'; id: string };
export type KnowledgeDependency = { knowledge_id: string; sha256: string };
export type DurableKnowledgeItem = {
  surface_kind: 'opl_durable_knowledge_item'; version: 'durable-knowledge-item.v2';
  knowledge_id: string; title: string; scope: DurableKnowledgeScope;
  content_kind: 'mechanism' | 'policy' | 'state' | 'decision'; owner: string;
  body_ref: { kind: 'repo_path' | 'source_path'; ref: string; source_id?: string; sha256?: string };
  applicability: { domains: string[]; stages: string[]; tasks?: string[] };
  status: 'draft' | 'active' | 'deprecated' | 'superseded' | 'expired' | 'quarantined';
  reviewed_at: string; next_review_at: string; requirement?: 'required' | 'optional';
  action_critical?: boolean; derived_from?: KnowledgeDependency[];
  sources?: JsonRecord[]; tags?: string[]; supersedes?: string[]; superseded_by?: string[];
  freshness_policy?: string;
  authority_boundary: { semantic_body_owner: string; opl_role: 'catalog_recall_and_receipt_projection_only' };
};

export function knowledgeFailure(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}
export function knowledgeDigest(bytes: Buffer | string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}
export function validateKnowledgeRef(ref: string) {
  if (!ref || path.isAbsolute(ref) || ref.includes('\\') || path.posix.normalize(ref) !== ref
    || ref === '..' || ref.startsWith('../')) knowledgeFailure('Knowledge source requires a canonical contained path.', { ref });
}
export function containedKnowledgeFile(root: string, ref: string) {
  validateKnowledgeRef(ref);
  const resolvedRoot = fs.realpathSync(root);
  const file = path.resolve(resolvedRoot, ref);
  if (!file.startsWith(`${resolvedRoot}${path.sep}`)) knowledgeFailure('Knowledge source path escapes its owner root.', { ref });
  let cursor = file;
  while (cursor !== resolvedRoot) {
    if (fs.lstatSync(cursor).isSymbolicLink()) knowledgeFailure('Knowledge source paths cannot contain symlinks.', { ref });
    cursor = path.dirname(cursor);
  }
  if (!fs.statSync(file).isFile()) knowledgeFailure('Knowledge source must be a regular file.', { ref });
  return file;
}
export function normalizeKnowledgeItem(value: unknown): DurableKnowledgeItem {
  assertJsonSchemaPayload({ schemaId: itemSchema.$id, schema: itemSchema }, value);
  const item = value as DurableKnowledgeItem;
  validateKnowledgeRef(item.body_ref.ref);
  if (!item.body_ref.ref.endsWith('.md')) knowledgeFailure('Knowledge bodies must be Markdown.', { knowledge_id: item.knowledge_id });
  if (Date.parse(item.next_review_at) <= Date.parse(item.reviewed_at)) knowledgeFailure('Knowledge review deadline must follow its review.', { knowledge_id: item.knowledge_id });
  if (item.authority_boundary.semantic_body_owner !== item.owner) knowledgeFailure('Knowledge semantic owner does not match its owner.', { knowledge_id: item.knowledge_id });
  if (item.supersedes?.includes(item.knowledge_id) || item.superseded_by?.includes(item.knowledge_id)
    || item.derived_from?.some((dependency) => dependency.knowledge_id === item.knowledge_id)) {
    knowledgeFailure('Knowledge cannot depend on or supersede itself.', { knowledge_id: item.knowledge_id });
  }
  return structuredClone(item);
}
export function knowledgeCurrentness(item: DurableKnowledgeItem, now = new Date()): string | null {
  if (item.status !== 'active' || item.superseded_by?.length) return `knowledge_inactive:${item.knowledge_id}`;
  if (Date.parse(item.reviewed_at) > now.getTime()) return `knowledge_review_in_future:${item.knowledge_id}`;
  if (Date.parse(item.next_review_at) <= now.getTime()) return `knowledge_review_overdue:${item.knowledge_id}`;
  return null;
}
export { itemSchema };
