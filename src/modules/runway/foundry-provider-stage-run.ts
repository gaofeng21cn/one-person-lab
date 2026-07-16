import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { FoundryTransientActivityError } from '../foundry/index.ts';
import type {
  FoundryProviderOperationInvoker,
  FoundryProviderManifest,
  FoundryActivityIdentity,
} from '../foundry/index.ts';
import { FileFoundryContentStore, foundryStoragePaths } from '../ledger/index.ts';
import { runFamilyRuntime } from './family-runtime.ts';

type JsonRecord = Record<string, unknown>;

const TERMINAL_STAGE_RUN_STATUSES = new Set([
  'completed',
  'completed_with_quality_debt',
  'blocked',
  'human_gate',
  'failed',
]);
const SUCCESS_STAGE_RUN_STATUSES = new Set(['completed', 'completed_with_quality_debt']);

function fail(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`);
  return value.trim();
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${field} must be an array of non-empty strings.`);
  }
  return value as string[];
}

function record(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  return value;
}

function activityKey(activity: FoundryActivityIdentity) {
  return sha256(canonicalJsonText({
    run_id: activity.run_id,
    iteration: activity.iteration,
    phase: activity.phase,
    input_digest: activity.input_digest,
  }));
}

export type FoundryProviderStageRunLaunch = {
  workflow_id: string;
};

export interface FoundryProviderStageRunGateway {
  launch(input: {
    provider: FoundryProviderManifest;
    checkout_root: string;
    workspace_root: string;
    stage_id: string;
    stage_run_invocation_id: string;
    activity: FoundryActivityIdentity;
    input_artifact_refs: string[];
    input_artifact_hashes: string[];
  }): Promise<FoundryProviderStageRunLaunch>;
  query(workflowId: string): Promise<unknown>;
}

export class OplFoundryProviderStageRunGateway implements FoundryProviderStageRunGateway {
  readonly #runFamilyRuntime: typeof runFamilyRuntime;

  constructor(runStageRuntime: typeof runFamilyRuntime = runFamilyRuntime) {
    this.#runFamilyRuntime = runStageRuntime;
  }

  async launch(input: Parameters<FoundryProviderStageRunGateway['launch']>[0]) {
    const workspaceLocator = canonicalJsonText({
      workspace_root: input.workspace_root,
      domain_pack_root: input.checkout_root,
      source_refs: input.input_artifact_refs,
      foundry_run_ref: `opl://foundry/runs/${encodeURIComponent(input.activity.run_id)}`,
      foundry_operation: input.activity.phase,
      foundry_iteration: input.activity.iteration,
      foundry_input_digest: input.activity.input_digest,
    });
    const args = [
      'attempt',
      'create',
      '--domain',
      input.provider.domain_id,
      '--stage',
      input.stage_id,
      '--action',
      input.provider.projection_policy.public_action_ids[0],
      '--provider',
      'temporal',
      '--workspace-locator',
      workspaceLocator,
      '--source-fingerprint',
      input.activity.input_digest,
      '--stage-run-invocation-id',
      input.stage_run_invocation_id,
      '--task-id',
      input.activity.run_id,
      '--start',
    ];
    for (let index = 0; index < input.input_artifact_refs.length; index += 1) {
      args.push('--input-artifact-ref', input.input_artifact_refs[index]!);
      args.push('--input-artifact-hash', input.input_artifact_hashes[index]!);
    }
    let launched: Awaited<ReturnType<typeof runFamilyRuntime>>;
    try {
      launched = await this.#runFamilyRuntime(args);
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun launch failed transiently.', { cause: error });
    }
    const stageRun = record(launched.family_runtime_stage_run, 'Foundry provider StageRun launch');
    const stageRunInput = record(stageRun.stage_run_input, 'Foundry provider StageRun input');
    return { workflow_id: stringValue(stageRunInput.workflow_id, 'Foundry provider workflow_id') };
  }

  async query(workflowId: string) {
    let result: Awaited<ReturnType<typeof runFamilyRuntime>>;
    try {
      result = await this.#runFamilyRuntime(['stage-run', 'query', workflowId]);
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun query failed transiently.', { cause: error });
    }
    return record(result.family_runtime_stage_run_query, 'Foundry provider StageRun query');
  }
}

export interface FoundryProviderArtifactReader {
  readExact(input: { ref: string; sha256: string }): Buffer;
}

export class FileFoundryProviderArtifactReader implements FoundryProviderArtifactReader {
  readonly #allowedRoot: string;
  readonly #maxBytes: number;

  constructor(input: { allowed_root: string; max_bytes?: number }) {
    this.#allowedRoot = fs.realpathSync.native(input.allowed_root);
    this.#maxBytes = input.max_bytes ?? 4 * 1024 * 1024;
  }

  readExact(input: { ref: string; sha256: string }) {
    let candidate: string;
    try {
      const url = new URL(input.ref);
      if (url.protocol !== 'file:') fail('Foundry provider output must use an OPL-persisted file artifact ref.');
      candidate = fileURLToPath(url);
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      return fail('Foundry provider output artifact ref is invalid.', { artifact_ref: input.ref });
    }
    const stat = fs.lstatSync(candidate!);
    const real = fs.realpathSync.native(candidate!);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || (real !== this.#allowedRoot && !real.startsWith(`${this.#allowedRoot}${path.sep}`))
      || stat.size <= 0
      || stat.size > this.#maxBytes
    ) {
      fail('Foundry provider output artifact is outside the allowed immutable transport boundary.', {
        artifact_ref: input.ref,
        size_bytes: stat.size,
      });
    }
    const bytes = fs.readFileSync(real);
    const expected = input.sha256.replace(/^sha256:/, '');
    if (!/^[a-f0-9]{64}$/.test(expected) || sha256(bytes) !== expected) {
      fail('Foundry provider output artifact bytes do not match the StageRun hash.', {
        artifact_ref: input.ref,
      });
    }
    return bytes;
  }
}

function defaultTransportRoot(storageRoot: string) {
  return path.resolve(storageRoot);
}

function writeActivityInput(input: {
  storageRoot: string;
  operation: 'design' | 'diagnose';
  activity: FoundryActivityIdentity;
  payload: JsonRecord;
}) {
  const bytes = canonicalJsonBytes({
    surface_kind: 'opl_foundry_provider_activity_input',
    version: 'opl-foundry-provider-activity-input.v1',
    operation: input.operation,
    activity: input.activity,
    payload: input.payload,
  });
  const digest = sha256(bytes);
  const directory = path.join(input.storageRoot, 'provider-inputs');
  const file = path.join(directory, `${digest}.json`);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(file).equals(bytes)) {
      fail('Foundry provider activity input content address is occupied by different bytes.');
    }
  } else {
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  }
  return { ref: pathToFileURL(file).href, sha256: digest };
}

function stageRunState(value: unknown) {
  const state = record(value, 'Foundry provider StageRun state');
  const status = stringValue(state.status, 'Foundry provider StageRun status');
  const stageId = stringValue(state.stage_id, 'Foundry provider StageRun stage_id');
  const artifactRefs = stringList(state.artifact_refs, 'Foundry provider StageRun artifact_refs');
  const artifactHashes = stringList(state.artifact_hashes, 'Foundry provider StageRun artifact_hashes');
  if (artifactRefs.length !== artifactHashes.length) {
    fail('Foundry provider StageRun artifact refs and hashes are not aligned.');
  }
  return { state, status, stageId, artifactRefs, artifactHashes };
}

function nextWorkflowId(state: JsonRecord) {
  if (state.next_stage_run_launch === null || state.next_stage_run_launch === undefined) return null;
  const launch = record(state.next_stage_run_launch, 'Foundry provider next StageRun launch');
  return typeof launch.target_workflow_id === 'string' && launch.target_workflow_id.trim()
    ? launch.target_workflow_id.trim()
    : null;
}

function blueprintContentRefs(value: unknown) {
  const envelope = record(value, 'Foundry provider protocol output');
  const blueprint = envelope.surface_kind === 'opl_foundry_evolution_proposal'
    ? record(envelope.next_blueprint, 'EvolutionProposal.next_blueprint')
    : envelope;
  if (!isRecord(blueprint.content_refs)) return [];
  const refs = blueprint.content_refs;
  return ['prompt_refs', 'skill_refs', 'knowledge_refs', 'helper_refs']
    .flatMap((field) => stringList(refs[field], `AgentBlueprint.content_refs.${field}`))
    .filter((ref) => ref.startsWith('opl-content:'));
}

export class StageRunFoundryProviderInvoker implements FoundryProviderOperationInvoker {
  readonly #gateway: FoundryProviderStageRunGateway;
  readonly #artifactReader: FoundryProviderArtifactReader;
  readonly #storageRoot: string;
  readonly #pollIntervalMs: number;
  readonly #timeoutMs: number;

  constructor(input: {
    gateway?: FoundryProviderStageRunGateway;
    artifact_reader?: FoundryProviderArtifactReader;
    storage_root?: string;
    poll_interval_ms?: number;
    timeout_ms?: number;
  } = {}) {
    this.#storageRoot = input.storage_root ?? foundryStoragePaths().root;
    fs.mkdirSync(this.#storageRoot, { recursive: true });
    this.#gateway = input.gateway ?? new OplFoundryProviderStageRunGateway();
    this.#artifactReader = input.artifact_reader ?? new FileFoundryProviderArtifactReader({
      allowed_root: defaultTransportRoot(this.#storageRoot),
    });
    this.#pollIntervalMs = input.poll_interval_ms ?? 250;
    this.#timeoutMs = input.timeout_ms ?? 28 * 60 * 1000;
  }

  async invoke(input: Parameters<FoundryProviderOperationInvoker['invoke']>[0]) {
    if (input.activity.phase !== input.operation) {
      fail('Foundry provider operation and immutable activity phase do not match.');
    }
    const operation = input.provider.operations[input.operation];
    const allowedStages = new Set([...operation.required_stage_refs, ...operation.optional_stage_refs]);
    if (!allowedStages.has(operation.entry_stage_ref) || !allowedStages.has(operation.terminal_stage_ref)) {
      fail('Foundry provider operation entry or terminal Stage is outside its declared Stage set.');
    }
    const activityInput = writeActivityInput({
      storageRoot: this.#storageRoot,
      operation: input.operation,
      activity: input.activity,
      payload: input.payload,
    });
    const workspaceRoot = path.join(this.#storageRoot, 'provider-runs', activityKey(input.activity));
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const firstInvocationId = `foundry-sri-${activityKey(input.activity)}-${sha256(operation.entry_stage_ref).slice(0, 12)}`;
    let workflowId = (await this.#gateway.launch({
      provider: input.provider,
      checkout_root: input.checkout_root,
      workspace_root: workspaceRoot,
      stage_id: operation.entry_stage_ref,
      stage_run_invocation_id: firstInvocationId,
      activity: input.activity,
      input_artifact_refs: [activityInput.ref],
      input_artifact_hashes: [activityInput.sha256],
    })).workflow_id;
    const deadline = Date.now() + this.#timeoutMs;
    const visitedWorkflows = new Set<string>();
    const visitedStages = new Set<string>();
    let terminalArtifacts: Array<{ ref: string; sha256: string }> = [];

    for (let hops = 0; hops < 32; hops += 1) {
      if (visitedWorkflows.has(workflowId)) {
        fail('Foundry provider StageRun route contains a workflow cycle.', { workflow_id: workflowId });
      }
      visitedWorkflows.add(workflowId);
      let queried = stageRunState(await this.#gateway.query(workflowId));
      while (!TERMINAL_STAGE_RUN_STATUSES.has(queried.status)) {
        if (Date.now() >= deadline) {
          throw new FoundryTransientActivityError(`Foundry provider ${input.operation} StageRun timed out.`);
        }
        await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
        queried = stageRunState(await this.#gateway.query(workflowId));
      }
      if (!allowedStages.has(queried.stageId)) {
        fail('Foundry provider StageRun routed outside the operation manifest.', { stage_id: queried.stageId });
      }
      visitedStages.add(queried.stageId);
      if (!SUCCESS_STAGE_RUN_STATUSES.has(queried.status)) {
        throw new Error(
          `Foundry provider ${input.operation} StageRun ended ${queried.status}: ${String(queried.state.blocked_reason ?? 'no reason')}`,
        );
      }
      const next = nextWorkflowId(queried.state);
      if (queried.stageId === operation.terminal_stage_ref) {
        if (next) fail('Foundry provider terminal Stage launched an undeclared continuation.');
        terminalArtifacts = queried.artifactRefs.map((ref, index) => ({
          ref,
          sha256: queried.artifactHashes[index]!,
        }));
        break;
      }
      if (!next) {
        fail('Foundry provider operation ended before its declared terminal Stage.', {
          stage_id: queried.stageId,
          terminal_stage_ref: operation.terminal_stage_ref,
        });
      }
      workflowId = next;
    }

    const missingStages = operation.required_stage_refs.filter((stageId) => !visitedStages.has(stageId));
    if (missingStages.length > 0) {
      fail('Foundry provider operation skipped required semantic Stages.', { missing_stage_refs: missingStages });
    }
    const expectedSurface = input.operation === 'design'
      ? 'opl_foundry_agent_blueprint'
      : 'opl_foundry_evolution_proposal';
    const candidates: unknown[] = [];
    const artifactBodies: Array<{ ref: string; sha256: string; bytes: Buffer }> = [];
    for (const artifact of terminalArtifacts) {
      const bytes = this.#artifactReader.readExact(artifact);
      artifactBodies.push({ ...artifact, bytes });
      let parsed: unknown;
      try {
        parsed = parseJsonText(bytes.toString('utf8'));
      } catch {
        continue;
      }
      if (isRecord(parsed) && parsed.surface_kind === expectedSurface) candidates.push(parsed);
    }
    if (candidates.length !== 1) {
      fail('Foundry provider terminal Stage must expose exactly one schema-targeted raw output artifact.', {
        expected_surface_kind: expectedSurface,
        matching_artifact_count: candidates.length,
      });
    }
    const contentStore = new FileFoundryContentStore(this.#storageRoot);
    for (const ref of blueprintContentRefs(candidates[0])) {
      if (contentStore.has(ref)) continue;
      const expected = /^opl-content:\/\/sha256\/([a-f0-9]{64})$/.exec(ref)?.[1];
      if (!expected) fail('Foundry provider returned a malformed content ref.', { content_ref: ref });
      const artifact = artifactBodies.find((entry) => entry.sha256.replace(/^sha256:/, '') === expected);
      if (!artifact) {
        fail('Foundry provider did not transport bytes for a content-addressed AgentBlueprint ref.', {
          content_ref: ref,
        });
      }
      contentStore.put(artifact.bytes, ref);
    }
    canonicalJsonText(candidates[0]);
    return candidates[0];
  }
}
