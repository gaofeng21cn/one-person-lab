import fs from 'node:fs';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { containedKnowledgeFile } from './durable-knowledge-model.ts';
import { resolveKnowledgeSourceAccess, type SourceInput } from './durable-knowledge-sources.ts';
import { atomic, digest, encoded, fail, readJson, safePath, withRegistryLock } from './knowledge-source-mutation-support.ts';

type Scope = Pick<SourceInput, 'workspaceRoot' | 'projectRoot' | 'domainId'>;
export type KnowledgeRetirementInput = Scope & {
  knowledgeId: string; expectedSha256: string; expectedRegistrySha256: string;
  reason: string; reviewer: string; reviewRef: string; reviewedAt: string;
};
type Operation = {
  surface_kind: 'opl_knowledge_retirement'; version: 'knowledge-retirement.v1';
  workspace_root: string; project_root: string | null; domain_id: string;
  knowledge_id: string; registry_ref: string; source_id: string; source_root: string; source_ref: string;
  before_sha256: string; before_registry_sha256: string;
  reason: string; reviewer: string; review_ref: string; reviewed_at: string;
};
type Access = ReturnType<typeof resolveKnowledgeSourceAccess>;

function access(input: Scope, knowledgeId: string) {
  const source = resolveKnowledgeSourceAccess({ ...input, knowledgeId });
  if (!source.canWrite) fail('Knowledge retirement requires the source owner write grant.');
  return source;
}
function artifacts(input: Scope, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail('Invalid knowledge retirement identity.');
  const prefix = `shared/memory/knowledge-retirements/${operationId}`;
  return (name: string) => safePath(input.workspaceRoot, `${prefix}/${name}`);
}
function same(value: unknown, expected: unknown) {
  return canonicalJsonText(value) === canonicalJsonText(expected);
}
function storeExact(file: string, bytes: Buffer) {
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(bytes)) fail('Knowledge retirement evidence changed.');
  } else atomic(file, bytes, true);
}
function operation(input: KnowledgeRetirementInput, source: Access): Operation {
  for (const value of [input.knowledgeId, input.reason, input.reviewer, input.reviewRef]) {
    if (typeof value !== 'string' || !value.trim()) fail('Knowledge retirement requires explicit identity, reason and owner review.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedSha256)
    || !/^sha256:[a-f0-9]{64}$/.test(input.expectedRegistrySha256)
    || typeof input.reviewedAt !== 'string' || !Number.isFinite(Date.parse(input.reviewedAt))
    || Date.parse(input.reviewedAt) > Date.now()) fail('Knowledge retirement requires exact observed versions and a valid past review time.');
  return {
    surface_kind: 'opl_knowledge_retirement', version: 'knowledge-retirement.v1',
    workspace_root: fs.realpathSync(input.workspaceRoot),
    project_root: input.projectRoot ? fs.realpathSync(input.projectRoot) : null, domain_id: input.domainId,
    knowledge_id: input.knowledgeId, registry_ref: source.registryRef,
    source_id: source.source.source_id, source_root: fs.realpathSync(source.source.root), source_ref: source.item.body_ref.ref,
    before_sha256: input.expectedSha256, before_registry_sha256: input.expectedRegistrySha256,
    reason: input.reason, reviewer: input.reviewer, review_ref: input.reviewRef, reviewed_at: input.reviewedAt,
  };
}
function load(input: Scope, operationId: string) {
  const artifact = artifacts(input, operationId);
  const record = readJson(artifact('operation.json')) as Operation;
  if (digest(encoded(record)) !== `sha256:${operationId}`
    || record.surface_kind !== 'opl_knowledge_retirement' || record.version !== 'knowledge-retirement.v1'
    || record.workspace_root !== fs.realpathSync(input.workspaceRoot) || record.domain_id !== input.domainId
    || record.project_root !== (input.projectRoot ? fs.realpathSync(input.projectRoot) : null)) {
    fail('Knowledge retirement evidence belongs to another operation or scope.');
  }
  const source = access(input, record.knowledge_id);
  if (source.registryRef !== record.registry_ref || source.source.source_id !== record.source_id
    || fs.realpathSync(source.source.root) !== record.source_root || source.item.body_ref.ref !== record.source_ref
    || source.item.body_ref.sha256 !== record.before_sha256) fail('Knowledge retirement source identity changed.');
  const beforeRegistry = fs.readFileSync(artifact('before-registry.json'));
  const recovery = fs.readFileSync(artifact('body.md'));
  if (digest(beforeRegistry) !== record.before_registry_sha256 || digest(recovery) !== record.before_sha256) {
    fail('Knowledge retirement recovery evidence changed.');
  }
  const after = JSON.parse(beforeRegistry.toString('utf8')) as Access['registry'];
  const item = after.items.find((candidate) => candidate.knowledge_id === record.knowledge_id);
  if (!item || item.body_ref.source_id !== record.source_id || item.body_ref.ref !== record.source_ref
    || item.body_ref.sha256 !== record.before_sha256 || item.status === 'deprecated') fail('Knowledge retirement original identity is invalid.');
  item.status = 'deprecated';
  const afterRegistry = encoded(after);
  const intent = { operation_id: operationId, before_registry_sha256: record.before_registry_sha256,
    after_registry_sha256: digest(afterRegistry), body_sha256: record.before_sha256 };
  if (!same(readJson(artifact('intent.json')), intent)) fail('Knowledge retirement intent changed.');
  return { record, source, item, artifact, beforeRegistry, afterRegistry, intent };
}
function originalDigest(source: Access) {
  const bodyPath = safePath(source.source.root, source.item.body_ref.ref);
  try { fs.lstatSync(bodyPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  return digest(fs.readFileSync(containedKnowledgeFile(source.source.root, source.item.body_ref.ref)));
}
function receiptFields(state: ReturnType<typeof load>, operationId: string) {
  return {
    surface_kind: 'opl_knowledge_retirement_receipt', version: 'knowledge-retirement.v1', status: 'retired',
    operation_id: operationId, knowledge_id: state.record.knowledge_id, source_id: state.record.source_id,
    source_ref: state.record.source_ref, before_sha256: state.record.before_sha256,
    registry_sha256: state.intent.after_registry_sha256, recovery_path: state.artifact('body.md'),
    receipt_ref: state.artifact('receipt.json'), reviewer: state.record.reviewer,
    review_ref: state.record.review_ref, reviewed_at: state.record.reviewed_at, reason: state.record.reason,
  };
}
function completed(state: ReturnType<typeof load>, operationId: string) {
  const receipt = readJson(state.artifact('receipt.json'));
  const expected = receiptFields(state, operationId);
  const { retired_at: retiredAt, ...fields } = receipt;
  if (!same(fields, expected)
    || typeof retiredAt !== 'string' || !Number.isFinite(Date.parse(retiredAt))
    || !same(state.source.item, state.item) || originalDigest(state.source) !== null) {
    fail('Retired knowledge changed; historical retirement cannot delete new source content.');
  }
  return receipt as typeof expected & { retired_at: string };
}

/** Retire exact reviewed bytes; keep recovery evidence before making the item inactive. */
export function retireKnowledgeSource(input: KnowledgeRetirementInput) {
  const initial = access(input, input.knowledgeId);
  const record = operation(input, initial);
  const operationId = digest(encoded(record)).slice(7);
  try { return withRegistryLock(initial.registryRef, () => {
    const source = access(input, input.knowledgeId);
    if (!same(record, operation(input, source))) fail('Knowledge retirement source changed before locking.');
    const artifact = artifacts(input, operationId);
    if (!fs.existsSync(artifact('intent.json'))) {
      const registryBytes = fs.readFileSync(source.registryRef);
      const bodyPath = containedKnowledgeFile(source.source.root, source.item.body_ref.ref);
      const bytes = fs.readFileSync(bodyPath);
      if (source.item.status === 'deprecated' || source.item.body_ref.sha256 !== input.expectedSha256
        || digest(bytes) !== input.expectedSha256 || digest(registryBytes) !== input.expectedRegistrySha256) {
        fail('Knowledge source or registry changed after the retirement review.');
      }
      if (!bytes.length || bytes.length > 256 * 1024) fail('Knowledge retirement body exceeds its source limit.');
      storeExact(artifact('before-registry.json'), registryBytes);
      storeExact(artifact('body.md'), bytes);
      storeExact(artifact('operation.json'), encoded(record));
      const after = JSON.parse(registryBytes.toString('utf8')) as Access['registry'];
      after.items.find((item) => item.knowledge_id === input.knowledgeId)!.status = 'deprecated';
      storeExact(artifact('intent.json'), encoded({ operation_id: operationId,
        before_registry_sha256: input.expectedRegistrySha256, after_registry_sha256: digest(encoded(after)), body_sha256: input.expectedSha256 }));
    }
    let state = load(input, operationId);
    if (fs.existsSync(artifact('receipt.json'))) return completed(state, operationId);
    let currentRegistry = digest(fs.readFileSync(source.registryRef));
    const currentBody = originalDigest(state.source);
    if (![record.before_registry_sha256, state.intent.after_registry_sha256].includes(currentRegistry)
      || (currentBody !== null && currentBody !== record.before_sha256)
      || (currentRegistry === record.before_registry_sha256 && currentBody === null)) {
      fail('Knowledge changed during interrupted retirement; retained evidence requires owner reconciliation.');
    }
    // Publish inactivity first. A failed deletion leaves an inactive original, never an active missing body.
    if (currentRegistry === record.before_registry_sha256) {
      access(input, input.knowledgeId);
      if (digest(fs.readFileSync(source.registryRef)) !== currentRegistry || originalDigest(state.source) !== record.before_sha256) {
        fail('Concurrent knowledge edit detected before retirement.');
      }
      atomic(source.registryRef, state.afterRegistry);
      currentRegistry = state.intent.after_registry_sha256;
    }
    state = load(input, operationId);
    if (digest(fs.readFileSync(source.registryRef)) !== currentRegistry || !same(state.source.item, state.item)) {
      fail('Knowledge registry changed before source removal.');
    }
    if (originalDigest(state.source) !== null) {
      const bodyPath = containedKnowledgeFile(state.source.source.root, state.source.item.body_ref.ref);
      if (digest(fs.readFileSync(bodyPath)) !== record.before_sha256) fail('Knowledge source changed before removal.');
      fs.unlinkSync(bodyPath);
    }
    state = load(input, operationId);
    if (originalDigest(state.source) !== null || !same(state.source.item, state.item)) fail('Knowledge retirement changed before final readback.');
    const receipt = { ...receiptFields(state, operationId), retired_at: new Date().toISOString() };
    storeExact(artifact('receipt.json'), encoded(receipt));
    return receipt;
  }); } catch (error) {
    if (fs.existsSync(artifacts(input, operationId)('intent.json'))) {
      throw new FrameworkContractError('contract_shape_invalid', error instanceof FrameworkContractError
        ? error.message : 'Knowledge retirement was interrupted; inspect the retained operation before continuing.',
      { operation_id: operationId, inspection_command: 'knowledge inspect-retirement', retry: 'same_reviewed_request_only' });
    }
    throw error;
  }
}

/** Read status only; recovery always requires the original exact reviewed request. */
export function inspectKnowledgeRetirement(input: Scope & { operationId: string }) {
  const state = load(input, input.operationId);
  if (fs.existsSync(state.artifact('receipt.json'))) return completed(state, input.operationId);
  const currentRegistry = digest(fs.readFileSync(state.source.registryRef));
  const currentBody = originalDigest(state.source);
  if (![state.record.before_registry_sha256, state.intent.after_registry_sha256].includes(currentRegistry)
    || (currentBody !== null && currentBody !== state.record.before_sha256)
    || (currentBody === null && currentRegistry === state.record.before_registry_sha256)) fail('Knowledge retirement requires owner reconciliation.');
  return { ...receiptFields(state, input.operationId), status: 'recovery_required',
    phase: currentRegistry === state.record.before_registry_sha256 ? 'prepared' : currentBody === null ? 'source_removed' : 'registry_retired' };
}
