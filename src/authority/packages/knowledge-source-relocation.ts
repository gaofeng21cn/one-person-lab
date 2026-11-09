import fs from 'node:fs';
import path from 'node:path';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { containedKnowledgeFile, normalizeKnowledgeItem } from './durable-knowledge-model.ts';
import { resolveKnowledgeSourceAccess, resolveKnowledgeSourceTarget, type SourceInput } from './durable-knowledge-sources.ts';
import { atomicNoClobber, digest, encoded, fail, readJson, safePath, withRegistryLock } from './knowledge-source-mutation-support.ts';

type Scope = Pick<SourceInput, 'workspaceRoot' | 'projectRoot' | 'domainId'>;
export type KnowledgeRelocationInput = Scope & {
  knowledgeId: string; sourceRef: string; targetRef: string;
  expectedSha256: string; expectedRegistrySha256: string;
  reviewer: string; reviewRef: string; reviewedAt: string;
};
type Access = ReturnType<typeof resolveKnowledgeSourceAccess>;
type Operation = {
  surface_kind: 'opl_knowledge_relocation'; version: 'knowledge-relocation.v1';
  workspace_root: string; project_root: string | null; domain_id: string;
  knowledge_id: string; registry_ref: string; source_id: string; source_root: string;
  source_ref: string; target_ref: string; body_sha256: string; before_registry_sha256: string;
  reviewer: string; review_ref: string; reviewed_at: string;
};
const same = (left: unknown, right: unknown) => canonicalJsonText(left) === canonicalJsonText(right);
function access(input: Scope, knowledgeId: string) {
  const source = resolveKnowledgeSourceAccess({ ...input, knowledgeId });
  if (!source.canWrite) fail('Knowledge relocation requires the current source owner write grant.');
  return source;
}
function allowed(source: Access['source'], ref: string) {
  return (!source.include_globs?.length || source.include_globs.some((pattern) => path.matchesGlob(ref, pattern)))
    && !source.exclude_globs?.some((pattern) => path.matchesGlob(ref, pattern));
}
function files(source: Access, from: string, to: string) {
  if (!from.endsWith('.md') || !to.endsWith('.md') || from === to) fail('Knowledge relocation requires distinct Markdown source and target paths.');
  if (!allowed(source.source, from) || !allowed(source.source, to)) fail('Knowledge relocation paths must remain inside the current source filters.');
  return { original: safePath(source.source.root, from), target: safePath(source.source.root, to) };
}
function artifacts(input: Scope, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail('Invalid knowledge relocation identity.');
  return (name: string) => safePath(input.workspaceRoot, `shared/memory/knowledge-relocations/${operationId}/${name}`);
}
function storeExact(file: string, bytes: Buffer) {
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(bytes)) fail('Knowledge relocation evidence changed.');
  } else {
    try { atomicNoClobber(file, bytes); }
    catch (error) {
      if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return;
      throw error;
    }
  }
}
function recordFor(input: KnowledgeRelocationInput, source: Access): Operation {
  for (const value of [input.knowledgeId, input.sourceRef, input.targetRef, input.reviewer, input.reviewRef]) {
    if (typeof value !== 'string' || !value.trim()) fail('Knowledge relocation requires exact paths, identity and owner review.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedSha256) || !/^sha256:[a-f0-9]{64}$/.test(input.expectedRegistrySha256)
    || typeof input.reviewedAt !== 'string' || !Number.isFinite(Date.parse(input.reviewedAt)) || Date.parse(input.reviewedAt) > Date.now()) {
    fail('Knowledge relocation requires exact observed versions and a valid past review time.');
  }
  files(source, input.sourceRef, input.targetRef);
  return {
    surface_kind: 'opl_knowledge_relocation', version: 'knowledge-relocation.v1',
    workspace_root: fs.realpathSync(input.workspaceRoot), project_root: input.projectRoot ? fs.realpathSync(input.projectRoot) : null,
    domain_id: input.domainId, knowledge_id: input.knowledgeId, registry_ref: source.registryRef,
    source_id: source.source.source_id, source_root: fs.realpathSync(source.source.root),
    source_ref: input.sourceRef, target_ref: input.targetRef, body_sha256: input.expectedSha256,
    before_registry_sha256: input.expectedRegistrySha256, reviewer: input.reviewer, review_ref: input.reviewRef, reviewed_at: input.reviewedAt,
  };
}
function operationIdentity(record: Operation) {
  return digest(encoded({ workspaceRoot: record.workspace_root, projectRoot: record.project_root, domainId: record.domain_id,
    knowledgeId: record.knowledge_id, sourceRef: record.source_ref, targetRef: record.target_ref,
    expectedSha256: record.body_sha256, expectedRegistrySha256: record.before_registry_sha256,
    reviewer: record.reviewer, reviewRef: record.review_ref, reviewedAt: record.reviewed_at })).slice(7);
}
function requestIdentity(input: KnowledgeRelocationInput) {
  return digest(encoded({ workspaceRoot: fs.realpathSync(input.workspaceRoot), projectRoot: input.projectRoot ? fs.realpathSync(input.projectRoot) : null,
    domainId: input.domainId, knowledgeId: input.knowledgeId, sourceRef: input.sourceRef, targetRef: input.targetRef,
    expectedSha256: input.expectedSha256, expectedRegistrySha256: input.expectedRegistrySha256,
    reviewer: input.reviewer, reviewRef: input.reviewRef, reviewedAt: input.reviewedAt })).slice(7);
}
function fileState(file: string) {
  let stat: fs.BigIntStats;
  try { stat = fs.lstatSync(file, { bigint: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Knowledge relocation only handles regular files without symlinks.');
  return { sha256: digest(fs.readFileSync(file)), device: String(stat.dev), inode: String(stat.ino) };
}
function sameFile(left: ReturnType<typeof fileState>, right: ReturnType<typeof fileState>) {
  return Boolean(left && right && left.sha256 === right.sha256 && left.device === right.device && left.inode === right.inode);
}
function stagingPaths(record: Operation, operationId: string) {
  const source = safePath(record.source_root, record.source_ref);
  return {
    body: path.join(path.dirname(source), `.opl-knowledge-relocation-${operationId}`, 'body'),
    registry: path.join(path.dirname(record.registry_ref), `.opl-knowledge-relocation-${operationId}`, 'registry'),
  };
}
function prepareStaging(file: string) {
  const parent = path.dirname(file);
  try { fs.mkdirSync(parent, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink() || fileState(file)) {
    fail('Knowledge relocation has pre-existing staging content; retained evidence requires owner reconciliation.');
  }
}
function verifyStagingPath(file: string) {
  const absolute = path.resolve(file);
  const parts = absolute.split(path.sep);
  let cursor = parts[0] === '' ? path.sep : parts[0];
  for (const part of parts.slice(1, -1)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Knowledge relocation staging path changed to a symlink or non-directory.');
  }
  const parent = path.dirname(absolute);
  if (fs.existsSync(parent) && fs.realpathSync(parent) !== parent) fail('Knowledge relocation staging path changed its real path.');
  if (fs.existsSync(absolute)) {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('Knowledge relocation staging content changed to a symlink or non-file.');
  }
}
function readOperation(input: Scope, operationId: string) {
  const artifact = artifacts(input, operationId);
  const record = readJson(artifact('operation.json')) as Operation;
  if (operationIdentity(record) !== operationId || record.surface_kind !== 'opl_knowledge_relocation'
    || record.version !== 'knowledge-relocation.v1' || record.workspace_root !== fs.realpathSync(input.workspaceRoot)
    || record.domain_id !== input.domainId || record.project_root !== (input.projectRoot ? fs.realpathSync(input.projectRoot) : null)) {
    fail('Knowledge relocation evidence belongs to another operation or scope.');
  }
  return { record, artifact };
}
function restoreCapturedRegistry(input: Scope, operationId: string) {
  const { record } = readOperation(input, operationId);
  const staging = stagingPaths(record, operationId);
  verifyStagingPath(staging.body); verifyStagingPath(staging.registry);
  if (!fileState(staging.registry) || fileState(record.registry_ref)) return;
  const bindings = readJson(safePath(input.workspaceRoot, 'shared/memory/knowledge-bindings.json'));
  if (!bindings.registries?.some((binding: { registry_ref: string; source_ids: string[] }) => path.join(fs.realpathSync(path.dirname(binding.registry_ref)), path.basename(binding.registry_ref)) === record.registry_ref
    && binding.source_ids.includes(record.source_id))) fail('Knowledge relocation registry is no longer bound; retained evidence requires owner reconciliation.');
  // Restore the captured bytes (including a concurrent revocation), never the old
  // reviewed snapshot. The no-clobber link cannot replace another writer's file.
  try { fs.linkSync(staging.registry, record.registry_ref); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  if (sameFile(fileState(staging.registry), fileState(record.registry_ref))) fs.unlinkSync(staging.registry);
}
function load(input: Scope, operationId: string) {
  const { record, artifact } = readOperation(input, operationId);
  const source = access(input, record.knowledge_id);
  if (source.registryRef !== record.registry_ref || source.source.source_id !== record.source_id
    || fs.realpathSync(source.source.root) !== record.source_root) fail('Knowledge relocation source identity changed.');
  const locations = files(source, record.source_ref, record.target_ref);
  const beforeRegistry = fs.readFileSync(artifact('before-registry.json'));
  const recovery = fs.readFileSync(artifact('body.md'));
  if (digest(beforeRegistry) !== record.before_registry_sha256 || digest(recovery) !== record.body_sha256) fail('Knowledge relocation recovery evidence changed.');
  const registry = JSON.parse(beforeRegistry.toString('utf8')) as Access['registry'];
  const beforeItem = normalizeKnowledgeItem(registry.items.find((item) => item.knowledge_id === record.knowledge_id));
  if (beforeItem.body_ref.source_id !== record.source_id || beforeItem.body_ref.ref !== record.source_ref
    || beforeItem.body_ref.sha256 !== record.body_sha256) fail('Knowledge relocation original identity changed.');
  const afterItem = structuredClone(beforeItem);
  afterItem.body_ref.ref = record.target_ref;
  registry.items = registry.items.map((item) => item.knowledge_id === record.knowledge_id ? afterItem : item);
  const afterRegistry = encoded(registry);
  const intent = { operation_id: operationId, body_sha256: record.body_sha256,
    before_registry_sha256: record.before_registry_sha256, after_registry_sha256: digest(afterRegistry) };
  if (!same(readJson(artifact('intent.json')), intent)) fail('Knowledge relocation intent changed.');
  const staging = stagingPaths(record, operationId);
  verifyStagingPath(staging.body); verifyStagingPath(staging.registry);
  for (const bodyPath of [locations.original, locations.target]) {
    const identity = resolveKnowledgeSourceTarget({ ...input, bodyPath });
    if (identity.registered && ('knowledge_id' in identity ? identity.knowledge_id : undefined) !== record.knowledge_id) {
      fail('Knowledge relocation path has another registered identity.');
    }
  }
  return { record, source, artifact, beforeItem, afterItem, afterRegistry, intent, staging, ...locations };
}
function receiptFields(state: ReturnType<typeof load>, operationId: string) {
  const r = state.record;
  return {
    surface_kind: 'opl_knowledge_relocation_receipt', version: 'knowledge-relocation.v1', status: 'relocated',
    operation_id: operationId, knowledge_id: r.knowledge_id, source_id: r.source_id, source_ref: r.source_ref, target_ref: r.target_ref,
    body_sha256: r.body_sha256, registry_sha256: state.intent.after_registry_sha256, reviewer: r.reviewer,
    review_ref: r.review_ref, reviewed_at: r.reviewed_at, recovery_path: state.artifact('body.md'), receipt_ref: state.artifact('receipt.json'),
  };
}
function completed(state: ReturnType<typeof load>, operationId: string) {
  const receipt = readJson(state.artifact('receipt.json'));
  const { relocated_at: relocatedAt, ...fields } = receipt;
  if (!same(fields, receiptFields(state, operationId)) || typeof relocatedAt !== 'string' || !Number.isFinite(Date.parse(relocatedAt))
    || fileState(state.original) !== null || fileState(state.staging.body) !== null || fileState(state.staging.registry) !== null
    || fileState(state.target)?.sha256 !== state.record.body_sha256
    || !same(state.source.item, state.afterItem)) fail('Relocated knowledge changed; historical relocation cannot move new owner content.');
  return receipt as ReturnType<typeof receiptFields> & { relocated_at: string };
}
function pendingPhase(state: ReturnType<typeof load>) {
  const registryState = fileState(state.source.registryRef);
  const registry = registryState?.sha256;
  const original = fileState(state.original);
  const target = fileState(state.target);
  const bodyStage = fileState(state.staging.body);
  const registryStage = fileState(state.staging.registry);
  if (registry && ![state.record.before_registry_sha256, state.intent.after_registry_sha256].includes(registry)
    || (original && original.sha256 !== state.record.body_sha256)
    || (target && target.sha256 !== state.record.body_sha256)
    || (bodyStage && bodyStage.sha256 !== state.record.body_sha256)
    || (registryStage && registryStage.sha256 !== state.record.before_registry_sha256)) {
    fail('Knowledge changed during relocation; retained evidence requires owner reconciliation.');
  }
  if (registry === state.intent.after_registry_sha256) {
    if (original || bodyStage || !target || !same(state.source.item, state.afterItem)) fail('Knowledge relocation state conflicts with its advanced registry.');
    return 'registry_updated';
  }
  if (!same(state.source.item, state.beforeItem)) fail('Knowledge relocation original registration changed.');
  if (registryStage && !registry) return 'registry_staged';
  if (original && !target && !bodyStage) return 'prepared';
  // A linked target has the original inode. The marker binds later recovery after source removal.
  if (original && target && sameFile(original, target) && !bodyStage) return 'target_linked';
  if (!original && target && bodyStage && sameFile(target, bodyStage)) return 'source_staged';
  if (!original && target && !bodyStage && fs.existsSync(state.artifact('target-identity.json'))
    && same(readJson(state.artifact('target-identity.json')), target)) return 'source_removed';
  fail('Knowledge relocation paths require owner reconciliation.');
}

/** Preserve exact reviewed bytes and metadata; move only within the same granted source and filesystem. */
export function relocateKnowledgeSource(input: KnowledgeRelocationInput) {
  const operationId = requestIdentity(input);
  const artifact = artifacts(input, operationId);
  const savedRecord = fs.existsSync(artifact('intent.json')) ? readOperation(input, operationId).record : null;
  const registryRef = savedRecord?.registry_ref ?? access(input, input.knowledgeId).registryRef;
  try { return withRegistryLock(registryRef, () => {
    if (savedRecord) restoreCapturedRegistry(input, operationId);
    const source = access(input, input.knowledgeId);
    const record = recordFor(input, source);
    if (registryRef !== source.registryRef || savedRecord && !same(savedRecord, record)) fail('Knowledge relocation source changed before locking.');
    const locations = files(source, input.sourceRef, input.targetRef);
    if (!fs.existsSync(artifact('intent.json'))) {
      const registryBytes = fs.readFileSync(source.registryRef);
      const bytes = fs.readFileSync(containedKnowledgeFile(source.source.root, input.sourceRef));
      if (source.item.body_ref.ref !== input.sourceRef || source.item.body_ref.sha256 !== input.expectedSha256
        || digest(registryBytes) !== input.expectedRegistrySha256 || digest(bytes) !== input.expectedSha256) {
        fail('Knowledge source or registry changed after relocation review.');
      }
      if (!bytes.length || bytes.length > 256 * 1024) fail('Knowledge relocation body exceeds its source limit.');
      // The source locator itself must have exactly one registered owner across all bound registries.
      resolveKnowledgeSourceTarget({ ...input, bodyPath: locations.original });
      if (fileState(locations.target) !== null || resolveKnowledgeSourceTarget({ ...input, bodyPath: locations.target }).registered) {
        fail('Knowledge relocation target already exists or has a registered identity.');
      }
      const after = JSON.parse(registryBytes.toString('utf8')) as Access['registry'];
      after.items.find((item) => item.knowledge_id === input.knowledgeId)!.body_ref.ref = input.targetRef;
      storeExact(artifact('before-registry.json'), registryBytes); storeExact(artifact('body.md'), bytes);
      storeExact(artifact('operation.json'), encoded(record));
      storeExact(artifact('intent.json'), encoded({ operation_id: operationId, body_sha256: record.body_sha256,
        before_registry_sha256: record.before_registry_sha256, after_registry_sha256: digest(encoded(after)) }));
    }
    let state = load(input, operationId);
    if (fs.existsSync(artifact('receipt.json'))) return completed(state, operationId);
    let phase = pendingPhase(state);
    if (phase === 'prepared') {
      fs.mkdirSync(path.dirname(state.target), { recursive: true, mode: 0o700 });
      state = load(input, operationId); // Recheck current grants and symlink boundaries after directory creation.
      if (pendingPhase(state) !== 'prepared') fail('Concurrent knowledge edit before target creation.');
      fs.linkSync(state.original, state.target); // Atomic no-clobber; EXDEV fails without moving the source.
      phase = pendingPhase(state);
    }
    if (phase === 'target_linked') {
      storeExact(artifact('target-identity.json'), encoded(fileState(state.target)));
      state = load(input, operationId);
      if (pendingPhase(state) !== 'target_linked') fail('Concurrent knowledge edit before source removal.');
      // Rename the reviewed source into a hidden same-directory staging inode. If an
      // editor atomically replaced the path after the hardlink, the replacement is
      // moved to staging and its different identity is retained for reconciliation;
      // it is never silently unlinked.
      prepareStaging(state.staging.body);
      fs.renameSync(state.original, state.staging.body);
      const staged = fileState(state.staging.body);
      if (!sameFile(staged, fileState(state.target))) {
        // Preserve a replacement at its original name when that name is still free.
        if (staged && !fs.existsSync(state.original)) {
          try { fs.linkSync(state.staging.body, state.original); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          }
        }
        fail('Knowledge source was replaced during relocation; retained evidence requires owner reconciliation.');
      }
      if (fs.existsSync(state.original)) fail('Knowledge source was recreated during relocation; retained evidence requires owner reconciliation.');
      fs.unlinkSync(state.staging.body);
      phase = pendingPhase(state);
    }
    if (phase === 'source_staged') {
      state = load(input, operationId);
      if (pendingPhase(state) !== 'source_staged') fail('Concurrent knowledge edit before source staging cleanup.');
      if (fs.existsSync(state.original)) fail('Knowledge source was recreated during relocation; retained evidence requires owner reconciliation.');
      fs.unlinkSync(state.staging.body);
      phase = pendingPhase(state);
    }
    if (phase === 'source_removed' || phase === 'registry_staged') {
      state = load(input, operationId);
      const currentPhase = pendingPhase(state);
      if (currentPhase !== 'source_removed' && currentPhase !== 'registry_staged') fail('Concurrent knowledge edit before registry relocation.');
      const current = fileState(state.source.registryRef);
      const staged = fileState(state.staging.registry);
      if (staged && staged.sha256 !== state.record.before_registry_sha256) fail('Knowledge registry staging evidence changed; retained evidence requires owner reconciliation.');
      if (current?.sha256 === state.intent.after_registry_sha256) {
        if (staged) fs.unlinkSync(state.staging.registry);
      } else {
        if (current && current.sha256 !== state.record.before_registry_sha256) fail('Knowledge registry changed during relocation; retained evidence requires owner reconciliation.');
        if (!staged) {
          if (!current || current.sha256 !== state.record.before_registry_sha256) fail('Knowledge registry disappeared before relocation staging.');
          prepareStaging(state.staging.registry);
          fs.renameSync(state.source.registryRef, state.staging.registry);
          const stagedAfterRename = fileState(state.staging.registry);
          if (!sameFile(stagedAfterRename, current)) {
            restoreCapturedRegistry(input, operationId);
            fail('Knowledge registry was replaced during relocation; retained evidence requires owner reconciliation.');
          }
        }
        if (fs.existsSync(state.source.registryRef)) fail('Knowledge registry was concurrently recreated; retained evidence requires owner reconciliation.');
        const stageBeforePublish = fileState(state.staging.registry);
        if (!stageBeforePublish || stageBeforePublish.sha256 !== state.record.before_registry_sha256) {
          fail('Knowledge registry staging changed before publication; retained evidence requires owner reconciliation.');
        }
        try { atomicNoClobber(state.source.registryRef, state.afterRegistry); }
        catch (error) {
          const published = fileState(state.source.registryRef);
          if (!published || published.sha256 !== state.intent.after_registry_sha256) {
            restoreCapturedRegistry(input, operationId);
            throw error;
          }
        }
        const stageAfterPublish = fileState(state.staging.registry);
        if (!stageAfterPublish || stageAfterPublish.sha256 !== state.record.before_registry_sha256) {
          fail('Knowledge registry staging changed during publication; retained evidence requires owner reconciliation.');
        }
        if (fs.existsSync(state.staging.registry)) fs.unlinkSync(state.staging.registry);
      }
    }
    state = load(input, operationId);
    if (pendingPhase(state) !== 'registry_updated') fail('Knowledge relocation failed final readback.');
    const leftoverRegistryStage = fileState(state.staging.registry);
    if (leftoverRegistryStage) {
      if (leftoverRegistryStage.sha256 !== state.record.before_registry_sha256) fail('Knowledge registry staging evidence changed; retained evidence requires owner reconciliation.');
      fs.unlinkSync(state.staging.registry);
    }
    if (fileState(state.staging.body)) fail('Knowledge body staging evidence remains after relocation.');
    state = load(input, operationId);
    const receipt = { ...receiptFields(state, operationId), relocated_at: new Date().toISOString() };
    storeExact(artifact('receipt.json'), encoded(receipt));
    return receipt;
  }); } catch (error) {
    if (fs.existsSync(artifact('intent.json'))) throw new FrameworkContractError('contract_shape_invalid', error instanceof FrameworkContractError
      ? error.message : 'Knowledge relocation was interrupted; inspect the retained operation before continuing.',
    { operation_id: operationId, inspection_command: 'knowledge inspect-relocation', retry: 'same_reviewed_request_only' });
    throw error;
  }
}

/** Read status only. Recovery uses the original exact reviewed relocate request. */
export function inspectKnowledgeRelocation(input: Scope & { operationId: string }) {
  const { record } = readOperation(input, input.operationId);
  if (!fileState(record.registry_ref) && fileState(stagingPaths(record, input.operationId).registry)) {
    return { operation_id: input.operationId, status: 'recovery_required', phase: 'registry_restore_required' };
  }
  const state = load(input, input.operationId);
  if (fs.existsSync(state.artifact('receipt.json'))) return completed(state, input.operationId);
  return { ...receiptFields(state, input.operationId), status: 'recovery_required', phase: pendingPhase(state) };
}
