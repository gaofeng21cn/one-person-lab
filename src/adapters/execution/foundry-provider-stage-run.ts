import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Client } from '@temporalio/client';
import agentBlueprintSchema from '../../../contracts/opl-framework/foundry-agent-blueprint.schema.json' with { type: 'json' };
import evolutionProposalSchema from '../../../contracts/opl-framework/foundry-evolution-proposal.schema.json' with { type: 'json' };

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import {
  FoundryTransientActivityError,
  normalizeFoundryProviderManifest,
} from '../../authority/evolution/index.ts';
import type {
  FoundryProviderOperationInvoker,
  FoundryProviderManifest,
  FoundryActivityIdentity,
} from '../../authority/evolution/index.ts';
import { foundryContentDigest } from '../../authority/evolution/index.ts';
import { FileFoundryContentStore, foundryStoragePaths } from '../../authority/evidence/index.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { materializeFoundrySourceArtifacts } from './foundry-source-material.ts';
import { resolveFoundryExecutionScope } from './foundry-execution-scope.ts';
import {
  appendDistinctStageRunObservation,
  summarizeStageRunObservation,
  TERMINAL_STAGE_RUN_STATUSES,
  type StageRunObservation,
} from './family-runtime-stage-run-observation.ts';

import { cancelTemporalStageRunWorkflow } from './family-runtime-temporal-provider-parts/attempt-control.ts';
import {
  withDurableTemporalClient,
  withTemporalRpcDeadline,
} from './family-runtime-temporal-client.ts';
import { stageRunQuery } from './family-runtime-temporal-workflows.ts';

type JsonRecord = Record<string, unknown>;
export type FoundryStageRouteCompositionFactory = NonNullable<
  NonNullable<Parameters<typeof runFamilyRuntime>[1]>['createStageRouteComposition']
>;

const SUCCESS_STAGE_RUN_STATUSES = new Set(['completed', 'completed_with_quality_debt']);
const TERMINAL_FAILURE_WORKFLOW_STATUSES = new Set([
  'FAILED',
  'TIMED_OUT',
  'CANCELED',
  'CANCELLED',
  'TERMINATED',
]);

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

export type FoundryProviderOperationInvocation = Parameters<FoundryProviderOperationInvoker['invoke']>[0];

export type FoundryProviderStageRunAttemptCursor = {
  stage_attempt_id: string;
  workflow_id: string;
  status: string;
};

type FoundryProviderOperationCursorBase = {
  surface_kind: 'opl_foundry_provider_operation_cursor';
  operation_key: string;
  operation: 'design' | 'diagnose';
  provider_id: string;
  provider_manifest_digest: string;
  activity_key: string;
  required_stage_refs: string[];
  optional_stage_refs: string[];
  terminal_stage_ref: string;
  entry_workflow_id: string;
  current_workflow_id: string;
  current_stage_id: string | null;
  visited_path: Array<{ workflow_id: string; stage_id: string }>;
  continuation: {
    from_workflow_id: string;
    target_workflow_id: string;
  } | null;
  active_attempts: FoundryProviderStageRunAttemptCursor[];
  artifact_refs: string[];
  artifact_hashes: string[];
  status: 'pending' | 'terminal';
};

export type FoundryProviderOperationCursorV1 = FoundryProviderOperationCursorBase & {
  version: 'opl-foundry-provider-operation-cursor.v1';
};

export type FoundryProviderOperationCursorV2 = FoundryProviderOperationCursorBase & {
  version: 'opl-foundry-provider-operation-cursor.v2';
  provider_manifest: FoundryProviderManifest;
  provider_source_digest: string;
  checkout_root: string;
};

export type FoundryProviderOperationCursor =
  | FoundryProviderOperationCursorV1
  | FoundryProviderOperationCursorV2;

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
  cancel(workflowId: string): Promise<void>;
}

export async function queryFoundryProviderStageRunHandle(
  client: Client,
  handle: ReturnType<Client['workflow']['getHandle']>,
) {
  const description = await withTemporalRpcDeadline(client, () => handle.describe());
  const workflowStatus = description.status.name;
  if (workflowStatus === 'COMPLETED') {
    return withTemporalRpcDeadline(client, () => handle.result());
  }
  if (TERMINAL_FAILURE_WORKFLOW_STATUSES.has(workflowStatus)) {
    const memo = record(description.memo, 'Foundry provider StageRun workflow memo');
    return {
      surface_kind: 'temporal_stage_run_query',
      provider_kind: 'temporal',
      stage_run_id: stringValue(memo.stage_run_id, 'Foundry provider StageRun memo stage_run_id'),
      workflow_id: description.workflowId,
      run_id: description.runId,
      workflow_status: workflowStatus,
      domain_id: typeof memo.domain_id === 'string' ? memo.domain_id : null,
      stage_id: stringValue(memo.stage_id, 'Foundry provider StageRun memo stage_id'),
      status: 'failed',
      artifact_refs: [],
      artifact_hashes: [],
      attempts: [],
      next_stage_run_launch: null,
      blocked_reason: `temporal_stage_run_workflow_${workflowStatus.toLowerCase()}`,
    };
  }
  return withTemporalRpcDeadline(client, () => handle.query(stageRunQuery));
}

export class OplFoundryProviderStageRunGateway implements FoundryProviderStageRunGateway {
  readonly #runFamilyRuntime: typeof runFamilyRuntime;
  readonly #createStageRouteComposition?: FoundryStageRouteCompositionFactory;

  constructor(runStageRuntime: typeof runFamilyRuntime = runFamilyRuntime, options: {
    create_stage_route_composition?: FoundryStageRouteCompositionFactory;
  } = {}) {
    this.#runFamilyRuntime = runStageRuntime;
    this.#createStageRouteComposition = options.create_stage_route_composition;
  }

  async launch(input: Parameters<FoundryProviderStageRunGateway['launch']>[0]) {
    const executionScope = resolveFoundryExecutionScope({
      provider: input.provider,
      workspace_root: input.workspace_root,
      run_id: input.activity.run_id,
    });
    const workspaceLocator = canonicalJsonText({
      workspace_root: executionScope.workspace_root,
      execution_scope: executionScope,
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
      '--scope-kind',
      'work_item',
      '--execution-scope',
      canonicalJsonText(executionScope),
      '--source-fingerprint',
      input.activity.input_digest,
      '--stage-run-invocation-id',
      input.stage_run_invocation_id,
      '--task',
      input.activity.run_id,
      '--start',
    ];
    for (let index = 0; index < input.input_artifact_refs.length; index += 1) {
      args.push('--input-artifact-ref', input.input_artifact_refs[index]!);
      args.push('--input-artifact-sha256', input.input_artifact_hashes[index]!);
    }
    let launched: Awaited<ReturnType<typeof runFamilyRuntime>>;
    try {
      launched = await this.#runFamilyRuntime(args, {
        createStageRouteComposition: this.#createStageRouteComposition,
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun launch failed transiently.', { cause: error });
    }
    const stageRun = record(launched.family_runtime_stage_run, 'Foundry provider StageRun launch');
    const stageRunInput = record(stageRun.stage_run_input, 'Foundry provider StageRun input');
    return { workflow_id: stringValue(stageRunInput.workflow_id, 'Foundry provider workflow_id') };
  }

  async query(workflowId: string) {
    try {
      return await withDurableTemporalClient(async (client) => {
        const handle = client.workflow.getHandle(workflowId);
        return queryFoundryProviderStageRunHandle(client, handle);
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun query failed transiently.', { cause: error });
    }
  }

  async cancel(workflowId: string) {
    try {
      await cancelTemporalStageRunWorkflow({
        workflowId,
        reason: 'foundry_provider_operation_cancelled',
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun cancellation failed transiently.', {
        cause: error,
      });
    }
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
  provider: FoundryProviderManifest;
  activity: FoundryActivityIdentity;
  payload: JsonRecord;
  sourceArtifacts: ReturnType<typeof materializeFoundrySourceArtifacts>;
}) {
  const bytes = canonicalJsonBytes({
    surface_kind: 'opl_foundry_provider_activity_input',
    version: 'opl-foundry-provider-activity-input.v1',
    operation: input.operation,
    activity: input.activity,
    payload: input.payload,
    source_artifacts: input.sourceArtifacts,
    output_contract: {
      provider_manifest_digest: foundryContentDigest(input.provider),
      ...input.provider.operations[input.operation],
      schemas: (input.operation === 'design'
        ? [agentBlueprintSchema]
        : [evolutionProposalSchema, agentBlueprintSchema]).map((schema) => ({
        schema_id: schema.$id,
        content_ref: `opl-content://sha256/${sha256(canonicalJsonBytes(schema))}`,
        sha256: `sha256:${sha256(canonicalJsonBytes(schema))}`,
        size_bytes: canonicalJsonBytes(schema).length,
        content: canonicalJsonText(schema),
      })),
      transport_requirements: [
        'Apply this output contract throughout the operation, including intermediate blueprint authoring and formal Review. The terminal_stage_ref and output_schema_ref are declared by the bound provider manifest.',
        'The terminal producer or repairer must expose exactly one raw JSON artifact conforming to output_schema_ref. Its root is the protocol object itself, not a Stage report wrapping or referencing the object. Respect the exact schema keys and embedded EvalSpec schema; keep supplementary analysis in separate artifacts.',
        'Declare that raw protocol artifact in closeout_refs, closeout_ref_metadata, and route_impact.stage_quality_cycle.artifact_refs with its exact artifact_hashes entry. A new Stage report alone does not satisfy the terminal output contract.',
        'Also expose the exact bytes of every content_refs entry of the blueprint (next_blueprint for EvolutionProposal) as terminal Stage artifacts with matching SHA-256 identities. This includes prompts, skills, knowledge, helpers, models, tools, and schemas. Nested byte descriptions or a list of content refs are not transported bytes.',
        'Include the raw protocol object and all referenced content bytes in the explicit immutable reviewer snapshot members. Formal Review must check schema conformance and complete content transport before accepting the terminal output. The review report is not a replacement for the reviewed protocol artifact.',
        'These are semantic protocol and content artifacts, not materialized candidate/package/version bytes. OPL retains candidate compilation, independent evaluation, qualification, version and receipt authority.',
      ],
    },
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

function providerObservationContext(
  storageRoot: string,
  cursor: FoundryProviderOperationCursor,
  state?: JsonRecord,
) {
  const file = path.join(storageRoot, 'provider-observations', `${cursor.activity_key}.json`);
  const binding = {
    cursor_version: cursor.version,
    operation_key: cursor.operation_key,
    operation: cursor.operation,
    activity_key: cursor.activity_key,
    provider_id: cursor.provider_id,
    provider_manifest_digest: cursor.provider_manifest_digest,
    ...(cursor.version === 'opl-foundry-provider-operation-cursor.v2' ? {
      provider_source_digest: cursor.provider_source_digest,
      checkout_root: cursor.checkout_root,
    } : {}),
  };
  const observations: StageRunObservation[] = [];
  let persisted = false;
  let observationError: string | null = null;
  try {
    if (fs.existsSync(file)) {
      const prior = record(parseJsonText(fs.readFileSync(file, 'utf8')), 'Provider observation receipt');
      if (
        prior.surface_kind !== 'opl_foundry_provider_stage_run_observation_receipt'
        || prior.version !== 'opl-foundry-provider-stage-run-observation.v2'
        || canonicalJsonText(prior.binding) !== canonicalJsonText(binding)
        || !Array.isArray(prior.observations)
        || prior.observations.some((entry) => !isRecord(entry))
      ) {
        fail('Foundry provider observation receipt does not bind the operation cursor.');
      }
      observations.push(...prior.observations as StageRunObservation[]);
      persisted = true;
    }
  } catch (error) {
    observationError = error instanceof Error ? error.message : String(error);
  }
  if (state) {
    const previousCount = observations.length;
    appendDistinctStageRunObservation(
      observations,
      summarizeStageRunObservation(state, cursor.current_workflow_id),
    );
    if (!observationError && (observations.length !== previousCount || !persisted)) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeJsonPayloadFile(file, {
          surface_kind: 'opl_foundry_provider_stage_run_observation_receipt',
          version: 'opl-foundry-provider-stage-run-observation.v2',
          binding,
          workflow_id: cursor.current_workflow_id,
          status: observations[observations.length - 1]?.status ?? null,
          observations,
          updated_at: new Date().toISOString(),
          authority_boundary: {
            opl: 'provider_stage_run_observation_and_transport_only',
            domain: 'semantic_design_and_evidence_diagnosis_owner',
          },
        });
        persisted = true;
      } catch (error) {
        // Diagnostics never replace the authoritative cursor or provider artifacts.
        observationError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return {
    observation_receipt_ref: persisted ? pathToFileURL(file).href : null,
    observation_error: observationError,
    latest_observation: observations[observations.length - 1] ?? null,
    observation_count: observations.length,
  };
}

const ACTIVE_STAGE_ATTEMPT_STATUSES = new Set(['registered', 'running', 'checkpointed']);

function activeStageAttempts(state: JsonRecord): FoundryProviderStageRunAttemptCursor[] {
  if (!Array.isArray(state.attempts)) return [];
  return state.attempts.flatMap((value) => {
    if (!isRecord(value)) return [];
    const stageAttemptId = typeof value.stage_attempt_id === 'string' ? value.stage_attempt_id.trim() : '';
    const workflowId = typeof value.workflow_id === 'string' ? value.workflow_id.trim() : '';
    const status = typeof value.status === 'string' ? value.status.trim() : '';
    return stageAttemptId && workflowId && ACTIVE_STAGE_ATTEMPT_STATUSES.has(status)
      ? [{ stage_attempt_id: stageAttemptId, workflow_id: workflowId, status }]
      : [];
  });
}

const BLUEPRINT_CONTENT_REF_FIELDS = [
  'prompt_refs',
  'skill_refs',
  'knowledge_refs',
  'helper_refs',
  'model_refs',
  'tool_refs',
  'schema_refs',
] as const;

function blueprintContentRefs(value: unknown) {
  const envelope = record(value, 'Foundry provider protocol output');
  const blueprint = envelope.surface_kind === 'opl_foundry_evolution_proposal'
    ? record(envelope.next_blueprint, 'EvolutionProposal.next_blueprint')
    : envelope;
  const refs = record(blueprint.content_refs, 'AgentBlueprint.content_refs');
  const actualFields = Object.keys(refs).sort();
  const expectedFields = [...BLUEPRINT_CONTENT_REF_FIELDS].sort();
  if (canonicalJsonText(actualFields) !== canonicalJsonText(expectedFields)) {
    fail('AgentBlueprint.content_refs must declare the closed seven-class resource inventory.', {
      actual_fields: actualFields,
      expected_fields: expectedFields,
    });
  }
  return BLUEPRINT_CONTENT_REF_FIELDS.flatMap((field) =>
    stringList(refs[field], `AgentBlueprint.content_refs.${field}`));
}

function assertInvocation(input: FoundryProviderOperationInvocation) {
  if (input.activity.phase !== input.operation) {
    fail('Foundry provider operation and immutable activity phase do not match.');
  }
  const operation = input.provider.operations[input.operation];
  const allowedStages = new Set([...operation.required_stage_refs, ...operation.optional_stage_refs]);
  if (!allowedStages.has(operation.entry_stage_ref) || !allowedStages.has(operation.terminal_stage_ref)) {
    fail('Foundry provider operation entry or terminal Stage is outside its declared Stage set.');
  }
  return { operation, allowedStages };
}

function providerSourceDigest(input: FoundryProviderOperationInvocation) {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.provider_source_digest)) {
    fail('Foundry provider source digest must be an exact sha256 digest.');
  }
  return input.provider_source_digest;
}

export function assertFoundryProviderOperationCursorBinding(
  cursor: FoundryProviderOperationCursor,
  operationKey: string,
) {
  if (!isRecord(cursor)) {
    fail('Foundry provider operation cursor must be an object.');
  }
  if (cursor.operation !== 'design' && cursor.operation !== 'diagnose') {
    fail('Foundry provider operation cursor declares an unsupported operation.');
  }
  if (
    cursor.surface_kind !== 'opl_foundry_provider_operation_cursor'
    || (
      cursor.version !== 'opl-foundry-provider-operation-cursor.v1'
      && cursor.version !== 'opl-foundry-provider-operation-cursor.v2'
    )
    || cursor.operation_key !== operationKey
    || typeof cursor.activity_key !== 'string'
    || !/^[a-f0-9]{64}$/.test(cursor.activity_key)
    || typeof cursor.provider_id !== 'string'
    || !cursor.provider_id.trim()
    || !/^sha256:[a-f0-9]{64}$/.test(cursor.provider_manifest_digest)
    || typeof cursor.terminal_stage_ref !== 'string'
    || !cursor.terminal_stage_ref.trim()
    || !Array.isArray(cursor.required_stage_refs)
    || cursor.required_stage_refs.some((stageId) => typeof stageId !== 'string' || !stageId.trim())
    || !Array.isArray(cursor.optional_stage_refs)
    || cursor.optional_stage_refs.some((stageId) => typeof stageId !== 'string' || !stageId.trim())
    || typeof cursor.entry_workflow_id !== 'string'
    || typeof cursor.current_workflow_id !== 'string'
    || !cursor.entry_workflow_id.trim()
    || !cursor.current_workflow_id.trim()
    || !Array.isArray(cursor.artifact_refs)
    || !Array.isArray(cursor.artifact_hashes)
    || cursor.artifact_refs.length !== cursor.artifact_hashes.length
  ) {
    fail('Foundry provider operation cursor does not bind the immutable invocation.');
  }
  if (cursor.version === 'opl-foundry-provider-operation-cursor.v1') return;
  const providerManifest = normalizeFoundryProviderManifest(cursor.provider_manifest);
  const declaredOperation = providerManifest.operations[cursor.operation];
  if (
    cursor.provider_id !== providerManifest.provider_id
    || foundryContentDigest(providerManifest) !== cursor.provider_manifest_digest
    || !/^sha256:[a-f0-9]{64}$/.test(cursor.provider_source_digest)
    || typeof cursor.checkout_root !== 'string'
    || !path.isAbsolute(cursor.checkout_root)
    || cursor.required_stage_refs.join('\0') !== declaredOperation.required_stage_refs.join('\0')
    || cursor.optional_stage_refs.join('\0') !== declaredOperation.optional_stage_refs.join('\0')
    || cursor.terminal_stage_ref !== declaredOperation.terminal_stage_ref
  ) {
    fail('Foundry provider operation cursor does not bind the immutable invocation.');
  }
}

export class StageRunFoundryProviderCoordinator {
  readonly #gateway: FoundryProviderStageRunGateway;
  readonly #artifactReader: FoundryProviderArtifactReader;
  readonly #storageRoot: string;

  constructor(input: {
    gateway?: FoundryProviderStageRunGateway;
    create_stage_route_composition?: FoundryStageRouteCompositionFactory;
    artifact_reader?: FoundryProviderArtifactReader;
    storage_root?: string;
  } = {}) {
    this.#storageRoot = input.storage_root ?? foundryStoragePaths().root;
    fs.mkdirSync(this.#storageRoot, { recursive: true });
    this.#gateway = input.gateway ?? new OplFoundryProviderStageRunGateway(runFamilyRuntime, {
      create_stage_route_composition: input.create_stage_route_composition,
    });
    this.#artifactReader = input.artifact_reader ?? new FileFoundryProviderArtifactReader({
      allowed_root: defaultTransportRoot(this.#storageRoot),
    });
  }

  async launch(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
  ): Promise<FoundryProviderOperationCursorV2>;

  async launch(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
    cursorVersion: 'opl-foundry-provider-operation-cursor.v1',
  ): Promise<FoundryProviderOperationCursorV1>;

  async launch(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
    cursorVersion: 'opl-foundry-provider-operation-cursor.v2',
  ): Promise<FoundryProviderOperationCursorV2>;

  async launch(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
    cursorVersion: FoundryProviderOperationCursor['version'],
  ): Promise<FoundryProviderOperationCursor>;

  async launch(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
    cursorVersion: FoundryProviderOperationCursor['version'] = 'opl-foundry-provider-operation-cursor.v2',
  ): Promise<FoundryProviderOperationCursor> {
    const { operation } = assertInvocation(input);
    if (!operationKey.trim()) fail('Foundry provider operation cursor requires an operation key.');
    const sourceArtifacts = materializeFoundrySourceArtifacts({
      sourceRefs: input.payload.request?.source_refs ?? [],
      storageRoot: this.#storageRoot,
    });
    const activityInput = writeActivityInput({
      storageRoot: this.#storageRoot,
      operation: input.operation,
      provider: input.provider,
      activity: input.activity,
      payload: input.payload,
      sourceArtifacts,
    });
    const workspaceRoot = this.#storageRoot;
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const firstInvocationId = `foundry-sri-${activityKey(input.activity)}-${sha256(operation.entry_stage_ref).slice(0, 12)}`;
    const workflowId = (await this.#gateway.launch({
      provider: input.provider,
      checkout_root: input.checkout_root,
      workspace_root: workspaceRoot,
      stage_id: operation.entry_stage_ref,
      stage_run_invocation_id: firstInvocationId,
      activity: input.activity,
      input_artifact_refs: [activityInput.ref, ...sourceArtifacts.map((entry) => entry.ref)],
      input_artifact_hashes: [activityInput.sha256, ...sourceArtifacts.map((entry) => entry.sha256)],
    })).workflow_id;
    const cursor = {
      surface_kind: 'opl_foundry_provider_operation_cursor',
      operation_key: operationKey,
      operation: input.operation,
      provider_id: input.provider.provider_id,
      provider_manifest_digest: foundryContentDigest(input.provider),
      activity_key: activityKey(input.activity),
      required_stage_refs: [...operation.required_stage_refs],
      optional_stage_refs: [...operation.optional_stage_refs],
      terminal_stage_ref: operation.terminal_stage_ref,
      entry_workflow_id: workflowId,
      current_workflow_id: workflowId,
      current_stage_id: null,
      visited_path: [],
      continuation: null,
      active_attempts: [],
      artifact_refs: [],
      artifact_hashes: [],
      status: 'pending',
    } satisfies FoundryProviderOperationCursorBase;
    if (cursorVersion === 'opl-foundry-provider-operation-cursor.v1') {
      return { ...cursor, version: cursorVersion };
    }
    return {
      ...cursor,
      version: cursorVersion,
      provider_manifest: input.provider,
      provider_source_digest: providerSourceDigest(input),
      checkout_root: path.resolve(input.checkout_root),
    };
  }

  observationContext(cursor: FoundryProviderOperationCursor) {
    assertFoundryProviderOperationCursorBinding(cursor, cursor.operation_key);
    return providerObservationContext(this.#storageRoot, cursor);
  }

  async observe<T extends FoundryProviderOperationCursor>(
    cursor: T,
    operationKey: string,
  ): Promise<T> {
    assertFoundryProviderOperationCursorBinding(cursor, operationKey);
    const allowedStages = new Set([...cursor.required_stage_refs, ...cursor.optional_stage_refs]);
    if (cursor.status === 'terminal') return cursor;
    let queried: ReturnType<typeof stageRunState>;
    try {
      queried = stageRunState(await this.#gateway.query(cursor.current_workflow_id));
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError(
        `Foundry provider StageRun query failed transiently. ${JSON.stringify(this.observationContext(cursor))}`,
        { cause: error },
      );
    }
    const observationContext = providerObservationContext(this.#storageRoot, cursor, queried.state);
    if (!allowedStages.has(queried.stageId)) {
      fail('Foundry provider StageRun routed outside the operation manifest.', { stage_id: queried.stageId });
    }
    if (!TERMINAL_STAGE_RUN_STATUSES.has(queried.status)) {
      return {
        ...cursor,
        current_stage_id: queried.stageId,
        active_attempts: activeStageAttempts(queried.state),
      };
    }
    if (!SUCCESS_STAGE_RUN_STATUSES.has(queried.status)) {
      throw new Error(
        `Foundry provider ${cursor.operation} StageRun ended ${queried.status}: ${String(queried.state.blocked_reason ?? 'no reason')} ${JSON.stringify(observationContext)}`,
      );
    }
    if (cursor.visited_path.some((entry) => entry.workflow_id === cursor.current_workflow_id)) {
      fail('Foundry provider StageRun route contains a workflow cycle.', {
        workflow_id: cursor.current_workflow_id,
      });
    }
    const visitedPath = [
      ...cursor.visited_path,
      { workflow_id: cursor.current_workflow_id, stage_id: queried.stageId },
    ];
    const next = nextWorkflowId(queried.state);
    if (queried.stageId === cursor.terminal_stage_ref) {
      if (next) fail('Foundry provider terminal Stage launched an undeclared continuation.');
      const visitedStages = new Set(visitedPath.map((entry) => entry.stage_id));
      const missingStages = cursor.required_stage_refs.filter((stageId) => !visitedStages.has(stageId));
      if (missingStages.length > 0) {
        fail('Foundry provider operation skipped required semantic Stages.', {
          missing_stage_refs: missingStages,
        });
      }
      return {
        ...cursor,
        current_stage_id: queried.stageId,
        visited_path: visitedPath,
        active_attempts: [],
        artifact_refs: queried.artifactRefs,
        artifact_hashes: queried.artifactHashes,
        status: 'terminal',
      };
    }
    if (!next) {
      fail('Foundry provider operation ended before its declared terminal Stage.', {
        stage_id: queried.stageId,
        terminal_stage_ref: cursor.terminal_stage_ref,
        ...observationContext,
      });
    }
    if (
      visitedPath.length >= 32
      || next === cursor.current_workflow_id
      || visitedPath.some((entry) => entry.workflow_id === next)
    ) {
      fail('Foundry provider StageRun route contains a workflow cycle or exceeds its hop bound.', {
        workflow_id: next,
      });
    }
    return {
      ...cursor,
      current_workflow_id: next,
      current_stage_id: null,
      visited_path: visitedPath,
      continuation: {
        from_workflow_id: cursor.current_workflow_id,
        target_workflow_id: next,
      },
      active_attempts: [],
    };
  }

  async readTerminal(
    cursor: FoundryProviderOperationCursor,
    operationKey: string,
  ) {
    assertFoundryProviderOperationCursorBinding(cursor, operationKey);
    if (cursor.status !== 'terminal') {
      fail('Foundry provider operation cursor is not terminal.');
    }
    const expectedSurface = cursor.operation === 'design'
      ? 'opl_foundry_agent_blueprint'
      : 'opl_foundry_evolution_proposal';
    const candidates: unknown[] = [];
    const artifactBodies: Array<{ ref: string; sha256: string; bytes: Buffer }> = [];
    for (let index = 0; index < cursor.artifact_refs.length; index += 1) {
      const artifact = { ref: cursor.artifact_refs[index]!, sha256: cursor.artifact_hashes[index]! };
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
    const resultDirectory = path.join(this.#storageRoot, 'provider-results');
    const resultFile = path.join(resultDirectory, `${cursor.activity_key}.json`);
    const result = candidates[0];
    const resultBytes = cursor.version === 'opl-foundry-provider-operation-cursor.v1'
      ? canonicalJsonBytes(result)
      : canonicalJsonBytes({
          surface_kind: 'opl_foundry_provider_operation_result',
          version: 'opl-foundry-provider-operation-result.v2',
          operation_key: cursor.operation_key,
          operation: cursor.operation,
          provider_id: cursor.provider_id,
          provider_manifest_digest: cursor.provider_manifest_digest,
          provider_source_digest: cursor.provider_source_digest,
          checkout_root: cursor.checkout_root,
          activity_key: cursor.activity_key,
          result_digest: foundryContentDigest(result),
          result,
        });
    fs.mkdirSync(resultDirectory, { recursive: true });
    if (fs.existsSync(resultFile)) {
      const stat = fs.lstatSync(resultFile);
      if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(resultFile).equals(resultBytes)) {
        fail('Foundry provider operation result identity is occupied by different bytes.', {
          operation_key: cursor.operation_key,
        });
      }
    } else {
      fs.writeFileSync(resultFile, resultBytes, { flag: 'wx', mode: 0o600 });
    }
    return result;
  }

  readPersisted(
    input: FoundryProviderOperationInvocation,
    operationKey: string,
    requireBoundResult = false,
  ) {
    assertInvocation(input);
    const resultFile = path.join(
      this.#storageRoot,
      'provider-results',
      `${activityKey(input.activity)}.json`,
    );
    if (!fs.existsSync(resultFile)) return null;
    const stat = fs.lstatSync(resultFile);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail('Foundry provider operation result is not an immutable physical file.');
    }
    const persisted = parseJsonText(fs.readFileSync(resultFile, 'utf8'));
    const boundResult = isRecord(persisted)
      && persisted.surface_kind === 'opl_foundry_provider_operation_result';
    if (!boundResult) {
      if (requireBoundResult) {
        fail('Frozen Foundry provider replay requires a generation-bound provider result.');
      }
      canonicalJsonText(persisted);
      return persisted;
    }
    const manifestDigest = foundryContentDigest(input.provider);
    const sourceDigest = providerSourceDigest(input);
    if (
      persisted.version !== 'opl-foundry-provider-operation-result.v2'
      || persisted.operation_key !== operationKey
      || persisted.operation !== input.operation
      || persisted.provider_id !== input.provider.provider_id
      || persisted.provider_manifest_digest !== manifestDigest
      || persisted.provider_source_digest !== sourceDigest
      || persisted.checkout_root !== path.resolve(input.checkout_root)
      || persisted.activity_key !== activityKey(input.activity)
      || persisted.result_digest !== foundryContentDigest(persisted.result)
    ) {
      fail('Foundry provider operation result does not bind the immutable provider invocation.', {
        activity_key: activityKey(input.activity),
        provider_manifest_digest: manifestDigest,
        provider_source_digest: sourceDigest,
      });
    }
    return persisted.result;
  }

  async cancel(
    cursor: FoundryProviderOperationCursor,
    operationKey: string,
  ) {
    assertFoundryProviderOperationCursorBinding(cursor, operationKey);
    if (cursor.status === 'terminal') return cursor;
    let current = cursor;
    for (let hops = current.visited_path.length; hops < 32; hops += 1) {
      const queried = stageRunState(await this.#gateway.query(current.current_workflow_id));
      if (!TERMINAL_STAGE_RUN_STATUSES.has(queried.status)) {
        await this.#gateway.cancel(current.current_workflow_id);
        return {
          ...current,
          current_stage_id: queried.stageId,
          active_attempts: activeStageAttempts(queried.state),
        };
      }
      const next = nextWorkflowId(queried.state);
      if (!next) return current;
      if (
        next === current.current_workflow_id
        || current.visited_path.some((entry) => entry.workflow_id === next)
      ) {
        fail('Foundry provider StageRun cancellation route contains a workflow cycle.', {
          workflow_id: next,
        });
      }
      current = {
        ...current,
        current_workflow_id: next,
        current_stage_id: null,
        visited_path: [
          ...current.visited_path,
          { workflow_id: current.current_workflow_id, stage_id: queried.stageId },
        ],
        continuation: {
          from_workflow_id: current.current_workflow_id,
          target_workflow_id: next,
        },
        active_attempts: [],
      };
    }
    fail('Foundry provider StageRun cancellation route exceeds its hop bound.');
  }
}

export class StageRunFoundryProviderInvoker implements FoundryProviderOperationInvoker {
  readonly #coordinator: StageRunFoundryProviderCoordinator;
  readonly #pollIntervalMs: number;
  readonly #timeoutMs: number;
  readonly #replayOnly: boolean;
  readonly #operationKey: string | null;

  constructor(input: {
    gateway?: FoundryProviderStageRunGateway;
    create_stage_route_composition?: FoundryStageRouteCompositionFactory;
    artifact_reader?: FoundryProviderArtifactReader;
    storage_root?: string;
    poll_interval_ms?: number;
    timeout_ms?: number;
    replay_only?: boolean;
    operation_key?: string;
  } = {}) {
    this.#coordinator = new StageRunFoundryProviderCoordinator(input);
    this.#pollIntervalMs = input.poll_interval_ms ?? 250;
    this.#timeoutMs = input.timeout_ms ?? 28 * 60 * 1000;
    this.#replayOnly = input.replay_only ?? false;
    this.#operationKey = input.operation_key ?? null;
  }

  async invoke(input: Parameters<FoundryProviderOperationInvoker['invoke']>[0]) {
    assertInvocation(input);
    if (this.#replayOnly && this.#operationKey === null) {
      fail('Frozen Foundry provider replay requires its exact operation key.');
    }
    const operationKey = this.#operationKey ?? `direct:${activityKey(input.activity)}`;
    const persisted = this.#coordinator.readPersisted(input, operationKey, this.#replayOnly);
    if (persisted !== null) return persisted;
    if (this.#replayOnly) {
      fail('Frozen Foundry provider operation result is unavailable for exact replay.');
    }
    let cursor: FoundryProviderOperationCursor = await this.#coordinator.launch(input, operationKey);
    const deadline = Date.now() + this.#timeoutMs;
    while (cursor.status !== 'terminal') {
      cursor = await this.#coordinator.observe(cursor, operationKey);
      if (cursor.status === 'terminal') break;
      if (Date.now() >= deadline) {
        throw new FoundryTransientActivityError(
          `Foundry provider ${input.operation} StageRun timed out. ${JSON.stringify(this.#coordinator.observationContext(cursor))}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
    }
    return this.#coordinator.readTerminal(cursor, operationKey);
  }
}
