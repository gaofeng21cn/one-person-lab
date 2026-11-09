import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import { resolveKnowledgeSourceItem } from './durable-knowledge-sources.ts';
import type { DurableKnowledgeItem } from './durable-knowledge-model.ts';
import proposalSchema from '../../../contracts/opl-framework/knowledge-writeback-proposal.schema.json' with { type: 'json' };
import reviewSchema from '../../../contracts/opl-framework/knowledge-writeback-review.schema.json' with { type: 'json' };
import receiptSchema from '../../../contracts/opl-framework/knowledge-writeback-receipt.schema.json' with { type: 'json' };

type Scope = { workspaceRoot: string; domainId: string; projectRoot?: string | null };
type Source = ReturnType<typeof resolveKnowledgeSourceItem>;
type Proposal = {
  source_refs: string[];
  target_scope: DurableKnowledgeItem['scope'];
  content_kind: DurableKnowledgeItem['content_kind'];
  proposed_rule_or_mechanism: string;
  evidence_class: string;
  review_requirement: string;
};
type Envelope = {
  surface_kind: 'opl_knowledge_writeback_proposal'; version: 'knowledge-writeback-proposal.v2';
  workspace_root: string; project_root: string | null; domain_id: string;
  knowledge_id: string; registry_ref: string; source_id: string; source_ref: string;
  proposal: Proposal; before_registry_sha256: string; before_sha256: string; after_sha256: string;
};
type ReviewInput = {
  reviewer: string; reviewRef: string; reviewedAt: string; nextReviewAt: string;
};

function fail(message: string): never { throw new FrameworkContractError('contract_shape_invalid', message); }
function digest(bytes: Buffer | string) { return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`; }
function encoded(value: unknown) { return Buffer.from(`${canonicalJsonText(value)}\n`); }
function readJson(file: string) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function check(schema: typeof proposalSchema | typeof reviewSchema | typeof receiptSchema, value: unknown) {
  assertJsonSchemaPayload({ schemaId: schema.$id, schema }, value);
}

// This serializes cooperating writers on one host; it is not a cloud filesystem transaction.
function withRegistryLock<T>(registry: string, run: () => T): T {
  const lock = `${registry}.knowledge-writeback.lock`;
  const marker = encoded({ host: os.hostname(), pid: process.pid, token: crypto.randomUUID() });
  const acquire = () => {
    try { return fs.openSync(lock, 'wx', 0o600); }
    catch {
      if (!fs.existsSync(lock) || fs.lstatSync(lock).isSymbolicLink()) fail('Knowledge registry has an unreconciled writer lock.');
      const previous = fs.readFileSync(lock);
      let value: { host?: string; pid?: number };
      try { value = JSON.parse(previous.toString('utf8')); } catch { fail('Knowledge registry lock is malformed.'); }
      if (value!.host !== os.hostname() || !Number.isInteger(value!.pid) || value!.pid! < 1) fail('Knowledge registry has another host writer lock.');
      try { process.kill(value!.pid!, 0); fail('Knowledge registry has an active writer lock.'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
      if (!fs.readFileSync(lock).equals(previous)) fail('Knowledge writer lock changed during reconciliation.');
      fs.unlinkSync(lock);
      return fs.openSync(lock, 'wx', 0o600);
    }
  };
  const fd = acquire();
  try { fs.writeFileSync(fd!, marker); fs.fsyncSync(fd!); return run(); }
  finally {
    fs.closeSync(fd);
    if (fs.existsSync(lock) && fs.readFileSync(lock).equals(marker)) fs.unlinkSync(lock);
  }
}

function safePath(root: string, ref: string) {
  if (path.isAbsolute(ref) || ref.includes('\\') || path.posix.normalize(ref) !== ref || ref.split('/').includes('..')) {
    fail('Knowledge writeback path must be a canonical contained relative path.');
  }
  const base = fs.realpathSync(root);
  const target = path.join(base, ref);
  if (!target.startsWith(`${base}${path.sep}`)) fail('Knowledge writeback path escapes its workspace.');
  let cursor = base;
  for (const part of ref.split('/')) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail('Knowledge writeback cannot traverse a symlink.');
  }
  return target;
}

function atomic(file: string, bytes: Buffer, exclusive = false) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail('Knowledge writeback refuses a symlink target.');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (exclusive) {
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return;
  }
  const temporary = path.join(path.dirname(file), `.opl-knowledge-${crypto.randomUUID()}`);
  try { atomic(temporary, bytes, true); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function body(bytes: Buffer) {
  if (!bytes.length || bytes.length > 256 * 1024) fail('Knowledge replacement must contain 1–262144 bytes.');
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return bytes;
}

function resolve(input: Scope, knowledgeId: string): Source {
  const source = resolveKnowledgeSourceItem({ ...input, knowledgeId, allowInactive: true });
  if (!source.canWrite) fail('Knowledge source is not enabled for this domain owner writeback.');
  if (source.item.scope.kind === 'product') fail('Product knowledge is revised through its product owner.');
  return source;
}

function assertProposal(source: Source, proposal: Proposal) {
  check(proposalSchema, proposal);
  if (canonicalJsonText(source.item.scope) !== canonicalJsonText(proposal.target_scope)
    || source.item.content_kind !== proposal.content_kind) fail('Knowledge proposal cannot silently change its scope or content kind.');
}

function directory(input: Scope, proposalId: string) {
  if (!/^[a-f0-9]{64}$/.test(proposalId)) fail('Invalid knowledge proposal identity.');
  return safePath(input.workspaceRoot, `shared/memory/knowledge-writeback/${proposalId}`);
}

function loadProposal(input: Scope, proposalId: string) {
  const dir = directory(input, proposalId);
  const envelope = readJson(safePath(input.workspaceRoot, `shared/memory/knowledge-writeback/${proposalId}/proposal.json`)) as Envelope;
  if (digest(encoded(envelope)) !== `sha256:${proposalId}`) fail('Knowledge proposal digest changed.');
  if (envelope.workspace_root !== fs.realpathSync(input.workspaceRoot) || envelope.domain_id !== input.domainId
    || envelope.project_root !== (input.projectRoot ? fs.realpathSync(input.projectRoot) : null)) {
    fail('Knowledge proposal belongs to a different execution scope.');
  }
  const artifact = (name: string) => safePath(input.workspaceRoot, `shared/memory/knowledge-writeback/${proposalId}/${name}`);
  const replacement = body(fs.readFileSync(artifact('replacement.md')));
  const before = body(fs.readFileSync(artifact('before.md')));
  const registryBytes = fs.readFileSync(artifact('before-registry.json'));
  if (digest(replacement) !== envelope.after_sha256 || digest(before) !== envelope.before_sha256
    || digest(registryBytes) !== envelope.before_registry_sha256) fail('Knowledge proposal source or replacement evidence changed.');
  const source = resolve(input, envelope.knowledge_id);
  if (source.registryRef !== envelope.registry_ref || source.item.body_ref.source_id !== envelope.source_id
    || source.item.body_ref.ref !== envelope.source_ref) fail('Knowledge source moved or rebound since proposal creation.');
  assertProposal(source, envelope.proposal);
  return { dir, envelope, replacement, registryBytes, source, artifact };
}

export function proposeKnowledgeWriteback(input: Scope & { knowledgeId: string; proposal: unknown; replacement: Buffer }) {
  const source = resolve(input, input.knowledgeId);
  return withRegistryLock(source.registryRef, () => {
    const fresh = resolve(input, input.knowledgeId);
    const proposal = input.proposal as Proposal;
    assertProposal(fresh, proposal);
    const previous = body(fs.readFileSync(fresh.bodyPath));
    if (digest(previous) !== fresh.item.body_ref.sha256) fail('Source changed without review; review the current source before proposing another edit.');
    const replacement = body(input.replacement);
    if (previous.equals(replacement)) fail('Knowledge writeback proposal must change the source.');
    const registryBytes = fs.readFileSync(fresh.registryRef);
    const envelope: Envelope = {
      surface_kind: 'opl_knowledge_writeback_proposal', version: 'knowledge-writeback-proposal.v2',
      workspace_root: fs.realpathSync(input.workspaceRoot),
      project_root: input.projectRoot ? fs.realpathSync(input.projectRoot) : null,
      domain_id: input.domainId, knowledge_id: input.knowledgeId,
      registry_ref: fresh.registryRef, source_id: fresh.item.body_ref.source_id!, source_ref: fresh.item.body_ref.ref,
      proposal, before_registry_sha256: digest(registryBytes), before_sha256: digest(previous), after_sha256: digest(replacement),
    };
    const proposalId = digest(encoded(envelope)).slice(7);
    const dir = directory(input, proposalId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of [['before.md', previous], ['replacement.md', replacement], ['before-registry.json', registryBytes], ['proposal.json', encoded(envelope)]] as const) {
      const target = safePath(input.workspaceRoot, `shared/memory/knowledge-writeback/${proposalId}/${name}`);
      if (fs.existsSync(target)) {
        if (!fs.readFileSync(target).equals(bytes)) fail('Knowledge proposal identity collision.');
      } else atomic(target, bytes, true);
    }
    return { proposal_id: proposalId, proposal_ref: path.join(dir, 'proposal.json'), knowledge_id: input.knowledgeId };
  });
}

function reviewRecord(input: ReviewInput, proposalId: string, decision: 'accepted' | 'rejected') {
  const value = {
    surface_kind: 'opl_knowledge_owner_review', version: 'knowledge-owner-review.v2',
    proposal_sha256: `sha256:${proposalId}`, decision, reviewer: input.reviewer,
    review_ref: input.reviewRef, reviewed_at: input.reviewedAt, next_review_at: input.nextReviewAt,
  };
  check(reviewSchema, value);
  if (Date.parse(input.nextReviewAt) <= Date.parse(input.reviewedAt) || Date.parse(input.reviewedAt) > Date.now()) {
    fail('Knowledge review requires an observed review date and a later review deadline.');
  }
  return value;
}

export function reviewKnowledgeWriteback(input: Scope & ReviewInput & { proposalId: string; decision: 'accepted' | 'rejected' }) {
  const initial = loadProposal(input, input.proposalId);
  return withRegistryLock(initial.source.registryRef, () => {
    const { source, envelope, artifact } = loadProposal(input, input.proposalId);
    if (digest(fs.readFileSync(source.bodyPath)) !== envelope.before_sha256
      || digest(fs.readFileSync(source.registryRef)) !== envelope.before_registry_sha256) fail('Knowledge source or registry changed since proposal creation.');
    const review = reviewRecord(input, input.proposalId, input.decision);
    const target = artifact('review.json');
    if (fs.existsSync(target)) {
      if (canonicalJsonText(readJson(target)) !== canonicalJsonText(review)) fail('Knowledge proposal already has a different review.');
    } else atomic(target, encoded(review), true);
    return review;
  });
}

function updatedRegistry(registryBytes: Buffer, knowledgeId: string, afterSha256: string, review: ReturnType<typeof reviewRecord>) {
  const registry = JSON.parse(registryBytes.toString('utf8')) as Source['registry'];
  const item = registry.items.find((candidate) => candidate.knowledge_id === knowledgeId);
  if (!item) fail('Knowledge disappeared from its source registry.');
  item.body_ref.sha256 = afterSha256;
  item.reviewed_at = review.reviewed_at;
  item.next_review_at = review.next_review_at;
  return encoded(registry);
}

export function applyKnowledgeWriteback(input: Scope & { proposalId: string }) {
  const initial = loadProposal(input, input.proposalId);
  return withRegistryLock(initial.source.registryRef, () => {
    const { source, envelope, artifact, replacement, registryBytes } = loadProposal(input, input.proposalId);
    const review = readJson(artifact('review.json')) as ReturnType<typeof reviewRecord>;
    check(reviewSchema, review);
    if (review.decision !== 'accepted' || review.proposal_sha256 !== `sha256:${input.proposalId}`) fail('Exact knowledge proposal requires accepted owner review.');
    reviewRecord({ reviewer: review.reviewer, reviewRef: review.review_ref, reviewedAt: review.reviewed_at, nextReviewAt: review.next_review_at }, input.proposalId, 'accepted');
    if (Date.parse(review.next_review_at) <= Date.now()) fail('Knowledge writeback review has expired.');
    const afterRegistry = updatedRegistry(registryBytes, envelope.knowledge_id, envelope.after_sha256, review);
    const intent = { proposal_sha256: review.proposal_sha256, review_sha256: digest(encoded(review)), after_registry_sha256: digest(afterRegistry) };
    const intentPath = artifact('apply-intent.json');
    const currentBody = digest(fs.readFileSync(source.bodyPath));
    const currentRegistry = digest(fs.readFileSync(source.registryRef));
    const receiptPath = artifact('receipt.json');
    if (fs.existsSync(receiptPath)) {
      const receipt = readJson(receiptPath);
      check(receiptSchema, receipt);
      if (receipt.proposal_sha256 !== review.proposal_sha256 || receipt.review_sha256 !== intent.review_sha256
        || receipt.knowledge_id !== envelope.knowledge_id || receipt.source_id !== envelope.source_id
        || receipt.source_ref !== envelope.source_ref || receipt.content_kind !== envelope.proposal.content_kind
        || canonicalJsonText(receipt.scope) !== canonicalJsonText(envelope.proposal.target_scope)
        || receipt.before_sha256 !== envelope.before_sha256 || receipt.after_sha256 !== envelope.after_sha256
        || receipt.registry_sha256 !== intent.after_registry_sha256 || receipt.review_ref !== review.review_ref
        || receipt.reviewer !== review.reviewer || receipt.status !== 'applied'
        || currentBody !== envelope.after_sha256 || currentRegistry !== intent.after_registry_sha256) fail('Applied knowledge changed; do not replay a historical write.');
      return receipt;
    }
    if (fs.existsSync(intentPath)) {
      if (canonicalJsonText(readJson(intentPath)) !== canonicalJsonText(intent)) fail('Knowledge apply intent differs from accepted review.');
    } else {
      if (currentBody !== envelope.before_sha256 || currentRegistry !== envelope.before_registry_sha256) fail('Knowledge source or registry changed after review.');
      atomic(intentPath, encoded(intent), true);
    }
    if (![envelope.before_sha256, envelope.after_sha256].includes(currentBody)
      || ![envelope.before_registry_sha256, intent.after_registry_sha256].includes(currentRegistry)) fail('Knowledge changed during interrupted application.');
    if (currentBody === envelope.before_sha256 && currentRegistry === intent.after_registry_sha256) {
      fail('Knowledge source was reverted after registry advancement; reconcile the owner edit instead of replaying the write.');
    }
    // Recheck authorization and versions immediately before mutation. Uncooperative editors still require readback reconciliation.
    resolve(input, envelope.knowledge_id);
    if (digest(fs.readFileSync(source.bodyPath)) !== currentBody || digest(fs.readFileSync(source.registryRef)) !== currentRegistry) fail('Concurrent knowledge edit detected before writeback.');
    if (currentBody === envelope.before_sha256) atomic(source.bodyPath, replacement);
    if (digest(fs.readFileSync(source.registryRef)) !== currentRegistry) fail('Knowledge registry changed after body write; reconcile the retained intent.');
    atomic(source.registryRef, afterRegistry);
    if (!fs.readFileSync(source.bodyPath).equals(replacement) || !fs.readFileSync(source.registryRef).equals(afterRegistry)) fail('Knowledge writeback changed before final readback.');
    const receipt = {
      surface_kind: 'opl_knowledge_writeback_receipt', version: 'knowledge-writeback-receipt.v2', status: 'applied',
      knowledge_id: envelope.knowledge_id, scope: envelope.proposal.target_scope, content_kind: envelope.proposal.content_kind,
      source_id: envelope.source_id, source_ref: envelope.source_ref,
      proposal_sha256: review.proposal_sha256, review_sha256: intent.review_sha256,
      reviewer: review.reviewer, review_ref: review.review_ref, before_sha256: envelope.before_sha256,
      after_sha256: envelope.after_sha256, registry_sha256: intent.after_registry_sha256, applied_at: new Date().toISOString(),
    };
    check(receiptSchema, receipt); atomic(receiptPath, encoded(receipt), true);
    return receipt;
  });
}

export function reviewKnowledgeSource(input: Scope & ReviewInput & { knowledgeId: string; expectedSha256: string }) {
  const initial = resolve(input, input.knowledgeId);
  return withRegistryLock(initial.registryRef, () => {
    const source = resolve(input, input.knowledgeId);
    const bytes = body(fs.readFileSync(source.bodyPath));
    const afterSha256 = digest(bytes);
    if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedSha256) || afterSha256 !== input.expectedSha256) {
      fail('Knowledge source changed after the reviewed observation; read and review the new version before acceptance.');
    }
    const identity = {
      workspace_root: fs.realpathSync(input.workspaceRoot), domain_id: input.domainId,
      project_root: input.projectRoot ? fs.realpathSync(input.projectRoot) : null,
      knowledge_id: input.knowledgeId, after_sha256: afterSha256,
      reviewer: input.reviewer, review_ref: input.reviewRef, reviewed_at: input.reviewedAt, next_review_at: input.nextReviewAt,
    };
    const proposalId = digest(encoded(identity)).slice(7);
    const review = reviewRecord(input, proposalId, 'accepted');
    const prefix = `shared/memory/knowledge-source-reviews/${proposalId}`;
    const dir = safePath(input.workspaceRoot, prefix);
    const artifact = (name: string) => safePath(input.workspaceRoot, `${prefix}/${name}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const intentPath = artifact('intent.json');
    let beforeRegistry = fs.readFileSync(source.registryRef);
    if (fs.existsSync(artifact('before-registry.json'))) beforeRegistry = fs.readFileSync(artifact('before-registry.json'));
    const before = JSON.parse(beforeRegistry.toString('utf8')) as Source['registry'];
    const oldItem = before.items.find((candidate) => candidate.knowledge_id === input.knowledgeId);
    if (!oldItem || oldItem.body_ref.source_id !== source.item.body_ref.source_id || oldItem.body_ref.ref !== source.item.body_ref.ref
      || canonicalJsonText(oldItem.scope) !== canonicalJsonText(source.item.scope)) fail('Knowledge source review target changed.');
    const afterRegistry = updatedRegistry(beforeRegistry, input.knowledgeId, afterSha256, review);
    const evidence = {
      identity, registry_ref: source.registryRef, before_registry_sha256: digest(beforeRegistry),
      after_registry_sha256: digest(afterRegistry), before_sha256: oldItem.body_ref.sha256,
      after_sha256: afterSha256, review,
    };
    if (fs.existsSync(intentPath)) {
      if (canonicalJsonText(readJson(intentPath)) !== canonicalJsonText(evidence)) fail('Knowledge source review intent changed.');
    } else {
      if (digest(fs.readFileSync(source.registryRef)) !== evidence.before_registry_sha256) fail('Knowledge registry changed before source review.');
      if (!fs.existsSync(artifact('before-registry.json'))) atomic(artifact('before-registry.json'), beforeRegistry, true);
      if (!fs.existsSync(artifact('reviewed-source.md'))) atomic(artifact('reviewed-source.md'), bytes, true);
      atomic(intentPath, encoded(evidence), true);
    }
    if (!fs.readFileSync(artifact('reviewed-source.md')).equals(bytes)) fail('Reviewed source bytes differ from retained evidence.');
    const receiptPath = artifact('receipt.json');
    if (fs.existsSync(receiptPath)) {
      const receipt = readJson(receiptPath);
      check(receiptSchema, receipt);
      if (receipt.proposal_sha256 !== review.proposal_sha256 || receipt.review_sha256 !== digest(encoded(review))
        || receipt.status !== 'source_reviewed' || receipt.knowledge_id !== input.knowledgeId
        || receipt.source_id !== source.item.body_ref.source_id || receipt.source_ref !== source.item.body_ref.ref
        || canonicalJsonText(receipt.scope) !== canonicalJsonText(source.item.scope) || receipt.content_kind !== source.item.content_kind
        || receipt.reviewer !== review.reviewer || receipt.review_ref !== review.review_ref || receipt.before_sha256 !== oldItem.body_ref.sha256
        || receipt.after_sha256 !== afterSha256 || receipt.registry_sha256 !== evidence.after_registry_sha256
        || !fs.readFileSync(source.registryRef).equals(afterRegistry)) fail('Previously reviewed source or receipt changed.');
      return receipt;
    }
    resolve(input, input.knowledgeId);
    const currentRegistry = digest(fs.readFileSync(source.registryRef));
    if (!fs.readFileSync(source.bodyPath).equals(bytes)
      || ![evidence.before_registry_sha256, evidence.after_registry_sha256].includes(currentRegistry)) fail('Source changed during owner review.');
    atomic(source.registryRef, afterRegistry);
    if (!fs.readFileSync(source.bodyPath).equals(bytes) || !fs.readFileSync(source.registryRef).equals(afterRegistry)) fail('Source review changed before readback.');
    const receipt = {
      surface_kind: 'opl_knowledge_writeback_receipt', version: 'knowledge-writeback-receipt.v2', status: 'source_reviewed',
      knowledge_id: input.knowledgeId, scope: source.item.scope, content_kind: source.item.content_kind,
      source_id: source.item.body_ref.source_id, source_ref: source.item.body_ref.ref,
      proposal_sha256: review.proposal_sha256, review_sha256: digest(encoded(review)),
      reviewer: review.reviewer, review_ref: review.review_ref, before_sha256: oldItem.body_ref.sha256,
      after_sha256: afterSha256, registry_sha256: digest(afterRegistry), applied_at: new Date().toISOString(),
    };
    check(receiptSchema, receipt); atomic(receiptPath, encoded(receipt), true);
    return receipt;
  });
}
