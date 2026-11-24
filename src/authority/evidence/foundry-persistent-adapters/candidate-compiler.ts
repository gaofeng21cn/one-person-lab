import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { compileStandardAgentStageManifest } from '../../packages/index.ts';
import {
  foundryContentDigest,
  materializeFoundryOperationResult,
  validateFoundryEvaluationOperationIdentity,
  validateFoundryOperationResult,
  type FoundryEvaluationOperationIdentity,
  type FoundryOperationResultJournal,
} from '../../evolution/index.ts';
import type {
  ActivationPointer,
  ActivationRuntimeBindingVerification,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  QualificationRecord,
  VersionRegistry,
} from '../../evolution/index.ts';
import {
  assertFoundryEventReplay,
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
  verifyFoundryEventChain,
  type FoundryRunEvent,
  type FoundryRunSnapshot,
} from '../../evolution/index.ts';

import {
  CANDIDATE_ACTION_CATALOG_PATH,
  CANDIDATE_INDEX_VERSION,
  CANDIDATE_QUALITY_POLICY_PATH,
  CANDIDATE_QUALITY_ROLE_PROMPT_PATH,
  CANDIDATE_QUALITY_RUBRIC_PATH,
  CANDIDATE_RESOURCE_FIELDS,
  CANDIDATE_RESOURCE_LOCK_PATH,
  CANDIDATE_RESOURCE_LOCK_VERSION,
  CANDIDATE_STAGE_MANIFEST_PATH,
  FILE_STORE_VERSION,
  VERSION_REGISTRY_EPOCH_DIRECTORY,
  VERSION_REGISTRY_EPOCH_MARKER,
  VERSION_REGISTRY_EPOCH_VERSION,
  candidateResourcePackPath,
  canonicalDigest,
  cleanupDeadMutationLocks,
  cleanupDeadStaging,
  cleanupLegacyMutationLockTemps,
  clone,
  contentDigestFromRef,
  digestSegment,
  ensureDurableDirectory,
  ensureStorage,
  errorCode,
  fail,
  foundryStoragePaths,
  fsyncDirectory,
  fsyncFile,
  processIsAlive,
  readJson,
  readMutationLock,
  readPhysicalCanonicalJson,
  reclaimAbandonedMutationLock,
  requireSafeSegment,
  requireDigest,
  requireExactKeys,
  requireRecord,
  requireString,
  requireUnique,
  requireWritable,
  sha256,
  stagedEntry,
  targetStorageKey,
  withMutationLock,
  writeAtomic,
  writeExclusive,
  writeStagedFile,
  listPhysicalFiles,
  type CandidateResourceBinding,
  type CandidateResourceKind,
  type CandidateResourceLock,
  type FoundryPersistentAdapterOptions,
  type FoundryStoragePaths,
  type MutationLockRecord,
} from './shared.ts';

import { FileFoundryContentStore } from './object-content-stores.ts';
import { validateCandidateDirectory } from './registry-validation.ts';
import { candidateLaunchMetadata } from './candidate-launch-metadata.ts';

function candidateConformance(input: Parameters<CandidateCompiler['materialize']>[0]) {
  const blueprint = input.blueprint;
  const stageIds = blueprint.stage_graph.stages.map((stage) => stage.stage_id);
  const stageIdSet = new Set(stageIds);
  requireUnique(stageIds, 'AgentBlueprint stage graph');
  requireUnique(blueprint.actions.map((action) => action.action_id), 'AgentBlueprint actions');
  requireUnique(blueprint.artifact_contracts.map((artifact) => artifact.artifact_type), 'AgentBlueprint artifact contracts');
  for (const stage of blueprint.stage_graph.stages) {
    for (const next of stage.next_stage_ids) {
      if (!stageIdSet.has(next)) fail('AgentBlueprint Stage route targets an undeclared Stage.', {
        stage_id: stage.stage_id,
        next_stage_id: next,
      });
    }
  }
  for (const action of blueprint.actions) {
    if (!stageIdSet.has(action.entry_stage_id)) {
      fail('AgentBlueprint action targets an undeclared entry Stage.', { action_id: action.action_id });
    }
  }
  const declaredContent = new Set([
    ...blueprint.content_refs.prompt_refs,
    ...blueprint.content_refs.skill_refs,
    ...blueprint.content_refs.knowledge_refs,
    ...blueprint.content_refs.helper_refs,
  ]);
  for (const stage of blueprint.stage_graph.stages) {
    for (const ref of [stage.prompt_ref, ...stage.skill_refs, ...stage.knowledge_refs]) {
      if (!declaredContent.has(ref)) {
        fail('AgentBlueprint Stage content ref is absent from the top-level content inventory.', {
          stage_id: stage.stage_id,
          content_ref: ref,
        });
      }
    }
  }
  return {
    surface_kind: 'opl_foundry_agent_pack_conformance',
    version: 'opl-foundry-agent-pack-conformance.v1',
    status: 'valid',
    checks: {
      target_identity_bound: true,
      stage_graph_closed: true,
      action_entries_declared: true,
      content_inventory_closed: true,
      generated_agent_authority_restricted: true,
    },
  } as const;
}

function candidateManifest(
  input: Parameters<CandidateCompiler['materialize']>[0],
  contentBindings: CandidateResourceBinding[],
  resourceLockDigest: string,
  conformance: ReturnType<typeof candidateConformance>,
) {
  return {
    surface_kind: 'opl_foundry_agent_pack',
    version: 'opl-foundry-agent-pack.v1',
    target_agent_id: input.blueprint.target_agent_id,
    target_domain_id: input.blueprint.target_domain_id,
    blueprint_digest: input.blueprint_digest,
    entry_stage_id: input.blueprint.stage_graph.entry_stage_id,
    stages: input.blueprint.stage_graph.stages,
    actions: input.blueprint.actions,
    artifact_contracts: input.blueprint.artifact_contracts,
    content_bindings: contentBindings,
    resource_lock: {
      ref: CANDIDATE_RESOURCE_LOCK_PATH,
      digest: resourceLockDigest,
    },
    capability_requirements: input.blueprint.capability_requirements,
    authority_policy: input.blueprint.authority_policy,
    memory_policy: input.blueprint.memory_policy,
    eval_spec: input.blueprint.eval_spec,
    conformance,
  };
}

const CANDIDATE_QUALITY_ROLE_PROMPT = `# Foundry Stage Quality Roles

## Producer

Produce the requested Stage artifact from the frozen Stage goal, inputs, and exact candidate resources.

## Reviewer

Review the exact producer artifact independently against the frozen quality rubric and Stage goal.

## Repairer

Repair only substantiated findings while preserving the frozen authority and resource boundaries.

## Re Reviewer

Re-review the repaired artifact independently and close only findings supported by exact evidence.
`;

const CANDIDATE_QUALITY_RUBRIC = `# Foundry Generated Agent Quality Rubric

- The result satisfies the frozen Stage goal and declared artifact contract.
- Claims are supported by the exact candidate resources and input artifacts.
- The result does not exceed target-owner authority or mutate Foundry state.
- Remaining quality debt, safety concerns, and owner decisions are explicit.
`;

function candidateStagePolicyPath(index: number) {
  return `agent/stages/stage-${String(index + 1).padStart(4, '0')}.md`;
}

function candidateStagePolicy(input: {
  stage_id: string;
  stage_kind: string;
  goal: string;
}) {
  return `# ${input.stage_id} Stage Policy

Stage kind: ${input.stage_kind}

Goal: ${input.goal}

Use only the frozen candidate resources and runtime-provided inputs. Return consumable progress, explicit quality debt, or a target-owner decision request without modifying versions, evaluation policy, permissions, or activation state.
`;
}

function bindingFor(
  bindings: CandidateResourceBinding[],
  kind: CandidateResourceKind,
  ref: string,
) {
  return bindings.find((entry) => entry.kind === kind && entry.declared_ref === ref)
    ?? fail('Foundry candidate runtime pack references an unhydrated resource.', {
      resource_kind: kind,
      declared_ref: ref,
    });
}

function candidateSchemaFields(bytes: Buffer, ref: string) {
  let parsed: unknown;
  try {
    parsed = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    fail('Foundry candidate action schema content is not valid JSON.', {
      schema_ref: ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('Foundry candidate action schema content must be a JSON object.', { schema_ref: ref });
  }
  const schema = parsed as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? schema.required.map((entry, index) => {
        if (typeof entry !== 'string' || entry.length === 0) {
          fail('Foundry candidate action schema required fields must be non-empty strings.', {
            schema_ref: ref,
            required_index: index,
          });
        }
        return entry;
      })
    : [];
  requireUnique(required, `Foundry candidate action schema ${ref} required fields`);
  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? Object.keys(schema.properties as Record<string, unknown>).sort()
    : [];
  const parameterFields = [...new Set([...required, ...properties])];
  return {
    required,
    optional: parameterFields.filter((entry) => !required.includes(entry)),
    workspaceLocatorFields: parameterFields.filter((entry) => (
      entry === 'workspace_root' || entry === 'workspace_path'
    )),
  };
}

function candidateSurfaceId(value: string) {
  return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'generated';
}

const STANDARD_CANDIDATE_STAGE_KINDS = new Set([
  'intake',
  'planning',
  'source_preparation',
  'creation',
  'review',
  'revision',
  'packaging',
  'publish',
  'operator_gate',
  'domain_specific',
]);

function candidateStandardStageKind(stageKind: string) {
  return STANDARD_CANDIDATE_STAGE_KINDS.has(stageKind) ? stageKind : 'domain_specific';
}

function reachableCandidateStages(
  blueprint: Parameters<CandidateCompiler['materialize']>[0]['blueprint'],
  entryStageId: string,
) {
  const stagesById = new Map(blueprint.stage_graph.stages.map((stage) => [stage.stage_id, stage]));
  const reached = new Set<string>();
  const pending = [entryStageId];
  while (pending.length > 0) {
    const stageId = pending.shift()!;
    if (reached.has(stageId)) continue;
    reached.add(stageId);
    pending.push(...(stagesById.get(stageId)?.next_stage_ids ?? []));
  }
  const ordered = blueprint.stage_graph.stages.filter((stage) => reached.has(stage.stage_id));
  const terminal = ordered.filter((stage) => stage.next_stage_ids.length === 0).map((stage) => stage.stage_id);
  if (terminal.length === 0) {
    fail('Foundry candidate action route must reach at least one terminal Stage.', { entry_stage_id: entryStageId });
  }
  return { ordered: ordered.map((stage) => stage.stage_id), terminal };
}

function buildCandidateRuntimePack(input: {
  materialize: Parameters<CandidateCompiler['materialize']>[0];
  contentBindings: CandidateResourceBinding[];
  hydratedByPath: Map<string, Buffer>;
}) {
  const { blueprint } = input.materialize;
  const actionRoutes = new Map(blueprint.actions.map((action) => [
    action.action_id,
    reachableCandidateStages(blueprint, action.entry_stage_id),
  ]));
  const actions = blueprint.actions.map((action, index) => {
    const inputBinding = bindingFor(input.contentBindings, 'schema', action.input_schema_ref);
    const outputBinding = bindingFor(input.contentBindings, 'schema', action.output_schema_ref);
    const inputBytes = input.hydratedByPath.get(inputBinding.pack_path)
      ?? fail('Foundry candidate input schema bytes are unavailable.', { schema_ref: action.input_schema_ref });
    const fields = candidateSchemaFields(inputBytes, action.input_schema_ref);
    const route = actionRoutes.get(action.action_id)!;
    const surfaceId = `${candidateSurfaceId(blueprint.target_agent_id)}_${candidateSurfaceId(action.action_id)}_${index + 1}`;
    return {
      action_id: action.action_id,
      title: action.action_id,
      summary: action.summary,
      owner: blueprint.target_domain_id,
      effect: 'mutating',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: CANDIDATE_STAGE_MANIFEST_PATH,
      },
      input_schema_ref: inputBinding.pack_path,
      output_schema_ref: outputBinding.pack_path,
      required_fields: fields.required,
      optional_fields: fields.optional,
      workspace_locator_fields: fields.workspaceLocatorFields,
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: action.entry_stage_id,
        required_stage_refs: [action.entry_stage_id],
        optional_stage_refs: route.ordered.filter((stageId) => stageId !== action.entry_stage_id),
        terminal_stage_refs: route.terminal,
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'foundry_generated_agent_action' },
        mcp: { surface_kind: 'foundry_generated_agent_action', tool_name: surfaceId },
        skill: {
          surface_kind: 'foundry_generated_agent_action',
          command_contract_id: `${blueprint.target_agent_id}.${action.action_id}`,
        },
        product_entry: { surface_kind: 'foundry_generated_agent_action', action_key: action.action_id },
        openai: { surface_kind: 'foundry_generated_agent_action', tool_name: surfaceId },
        ai_sdk: { surface_kind: 'foundry_generated_agent_action', tool_name: surfaceId },
      },
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        opl_can_sign_owner_receipt: false,
        provider_completion_is_domain_completion: false,
      },
    };
  });
  const actionCatalog = {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${blueprint.target_agent_id}.foundry-generated-actions`,
    target_domain_id: blueprint.target_domain_id,
    owner: blueprint.target_domain_id,
    authority_boundary: {
      domain_truth_owner: blueprint.target_domain_id,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_sign_owner_receipt: false,
      provider_completion_is_domain_completion: false,
    },
    actions,
    notes: [],
  };
  const qualityPolicies = Object.fromEntries(blueprint.stage_graph.stages.map((stage) => {
    const reviewDepth = blueprint.risk_hint === 'high'
      ? 'multi_axis'
      : blueprint.risk_hint === 'medium' ? 'full' : 'focused';
    return [stage.stage_id, {
      surface_kind: 'opl_stage_quality_cycle_policy',
      version: 'stage-quality-cycle-policy.v1',
      enabled: true,
      stage_prompt_ref: bindingFor(input.contentBindings, 'prompt', stage.prompt_ref).pack_path,
      role_prompt_refs: {
        producer: `${CANDIDATE_QUALITY_ROLE_PROMPT_PATH}#producer`,
        reviewer: `${CANDIDATE_QUALITY_ROLE_PROMPT_PATH}#reviewer`,
        repairer: `${CANDIDATE_QUALITY_ROLE_PROMPT_PATH}#repairer`,
        re_reviewer: `${CANDIDATE_QUALITY_ROLE_PROMPT_PATH}#re-reviewer`,
      },
      quality_rubric_refs: [CANDIDATE_QUALITY_RUBRIC_PATH],
      in_thread_refinement: { allowed: true, authoritative: false },
      formal_review: {
        required: true,
        risk_tier: blueprint.risk_hint,
        review_depth: reviewDepth,
        context_isolation_required: true,
        max_repair_rounds: 1,
      },
      budget_exhaustion: 'complete_with_quality_debt_if_consumable',
      attempt_boundary: {
        inherits_stage_goal_scope_authority: true,
        role_overlay_may_only_narrow: true,
        controller_creates_next_attempt: true,
        attempt_is_not_sub_stage: true,
      },
    }];
  }));
  const stages = blueprint.stage_graph.stages.map((stage, index) => {
    const promptBinding = bindingFor(input.contentBindings, 'prompt', stage.prompt_ref);
    return {
      stage_id: stage.stage_id,
      stage_kind: candidateStandardStageKind(stage.stage_kind),
      title: stage.stage_id,
      display_names: { 'en-US': stage.stage_id },
      summary: stage.goal,
      goal: stage.goal,
      policy_ref: candidateStagePolicyPath(index),
      prompt_ref: promptBinding.pack_path,
      skill_refs: stage.skill_refs.map((ref) => bindingFor(input.contentBindings, 'skill', ref).pack_path),
      knowledge_refs: stage.knowledge_refs.map((ref) => bindingFor(input.contentBindings, 'knowledge', ref).pack_path),
      quality_gate_refs: [CANDIDATE_QUALITY_RUBRIC_PATH],
      allowed_action_refs: blueprint.actions
        .filter((action) => actionRoutes.get(action.action_id)!.ordered.includes(stage.stage_id))
        .map((action) => action.action_id),
      requires: stage.input_artifact_types,
      ensures: stage.output_artifact_types,
      next_stage_refs: stage.next_stage_ids,
      trust_lane: 'domain_agent',
      stage_quality_cycle_policy_ref: `${CANDIDATE_QUALITY_POLICY_PATH}#/stages/${stage.stage_id.replaceAll('~', '~0').replaceAll('/', '~1')}`,
      ...(stage.stage_kind === 'packaging' ? {
        handoff_review_boundary: {
          artifact_effect: 'new_or_transformed_reviewable_bytes',
          freezes_canonical_artifact_bytes: false,
          issues_quality_export_publication_or_ready_claim: false,
          downstream_owner_retains_acceptance: true,
        },
      } : {}),
    };
  });
  const stageManifest = {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: blueprint.target_domain_id,
    owner: blueprint.target_domain_id,
    authority_boundary: {
      domain_truth_owner: blueprint.target_domain_id,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_sign_owner_receipt: false,
      provider_completion_is_domain_completion: false,
    },
    stages,
  };
  const stagePolicyFiles = blueprint.stage_graph.stages.map((stage, index) => ({
    path: candidateStagePolicyPath(index),
    bytes: Buffer.from(candidateStagePolicy(stage), 'utf8'),
  }));
  const launchFiles = candidateLaunchMetadata(blueprint, input.contentBindings);
  const requiredPackPaths = [...new Set([
    CANDIDATE_STAGE_MANIFEST_PATH,
    CANDIDATE_QUALITY_POLICY_PATH,
    CANDIDATE_QUALITY_ROLE_PROMPT_PATH,
    CANDIDATE_QUALITY_RUBRIC_PATH,
    ...stagePolicyFiles.map((entry) => entry.path),
    ...launchFiles.map((entry) => entry.path),
    ...input.contentBindings.map((entry) => entry.pack_path),
  ])].sort();
  const artifactContracts = blueprint.artifact_contracts.map((artifact) => ({
    ...artifact,
    schema_ref: bindingFor(input.contentBindings, 'schema', artifact.schema_ref).pack_path,
  }));
  return [
    { path: 'contracts/domain_descriptor.json', bytes: canonicalJsonBytes({
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: blueprint.target_domain_id,
      domain_label: blueprint.target_agent_id,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        opl_can_sign_owner_receipt: false,
      },
    }) },
    { path: CANDIDATE_ACTION_CATALOG_PATH, bytes: canonicalJsonBytes(actionCatalog) },
    { path: CANDIDATE_STAGE_MANIFEST_PATH, bytes: canonicalJsonBytes(stageManifest) },
    { path: CANDIDATE_QUALITY_POLICY_PATH, bytes: canonicalJsonBytes({
      surface_kind: 'opl_domain_stage_quality_cycle_profile',
      version: 'domain-stage-quality-cycle-profile.v1',
      stages: qualityPolicies,
    }) },
    { path: CANDIDATE_QUALITY_ROLE_PROMPT_PATH, bytes: Buffer.from(CANDIDATE_QUALITY_ROLE_PROMPT, 'utf8') },
    { path: CANDIDATE_QUALITY_RUBRIC_PATH, bytes: Buffer.from(CANDIDATE_QUALITY_RUBRIC, 'utf8') },
    { path: 'contracts/pack_compiler_input.json', bytes: canonicalJsonBytes({
      surface_kind: 'opl_domain_pack_compiler_input',
      domain_id: blueprint.target_domain_id,
      canonical_agent_id: blueprint.target_agent_id,
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_can_claim_generated_surface_owner: false,
      },
      required_domain_pack_paths: requiredPackPaths,
    }) },
    { path: 'contracts/owner_receipt_contract.json', bytes: canonicalJsonBytes({
      surface_kind: 'owner_receipt_contract',
      authority_owner_ref: blueprint.authority_policy.truth_owner_ref,
      provider_can_sign_owner_receipt: false,
    }) },
    { path: 'runtime/authority_functions/README.md', bytes: Buffer.from(
      '# Target Owner Authority Boundary\n\nThe target owner remains the only authority for domain truth, quality acceptance, permissions, and production adoption.\n',
      'utf8',
    ) },
    { path: 'contracts/artifact_contracts.json', bytes: canonicalJsonBytes(artifactContracts) },
    ...stagePolicyFiles,
    ...launchFiles,
  ];
}

export class ContentAddressedCandidateCompiler implements CandidateCompiler {
  readonly #paths: FoundryStoragePaths;
  readonly #candidateRoot: string;
  readonly #content: FileFoundryContentStore;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
    const stat = fs.lstatSync(this.#paths.candidates);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Foundry candidate root must be a physical directory.');
    }
    this.#candidateRoot = fs.realpathSync.native(this.#paths.candidates);
    this.#content = new FileFoundryContentStore(rootOverride);
  }

  async materialize(input: Parameters<CandidateCompiler['materialize']>[0]): Promise<MaterializedCandidate> {
    if (foundryContentDigest(input.blueprint) !== input.blueprint_digest) {
      fail('Candidate compiler received a stale AgentBlueprint digest.');
    }
    const conformance = candidateConformance(input);
    const contentBindings: CandidateResourceBinding[] = [];
    const hydratedFiles: Array<{ path: string; bytes: Buffer }> = [];
    for (const { kind, field } of CANDIDATE_RESOURCE_FIELDS) {
      const refs = input.blueprint.content_refs[field];
      for (const ref of refs) {
        const digest = contentDigestFromRef(ref);
        if (!digest) {
          fail('Foundry candidate resources require exact immutable opl-content refs.', {
            resource_kind: kind,
            declared_ref: ref,
          });
        }
        const bytes = this.#content.readExact(ref);
        const packPath = candidateResourcePackPath(kind, digest);
        hydratedFiles.push({ path: packPath, bytes });
        contentBindings.push({
          kind,
          declared_ref: ref,
          immutable_ref: ref,
          pack_path: packPath,
          sha256: `sha256:${digest}`,
          byte_size: bytes.byteLength,
        });
      }
    }
    const resourceLock: CandidateResourceLock = {
      surface_kind: 'opl_foundry_candidate_resource_lock',
      version: CANDIDATE_RESOURCE_LOCK_VERSION,
      blueprint_digest: input.blueprint_digest,
      resources: contentBindings,
    };
    const resourceLockDigest = canonicalDigest(resourceLock);
    const manifest = candidateManifest(input, contentBindings, resourceLockDigest, conformance);
    const descriptor = {
      surface_kind: 'opl_foundry_generated_agent_descriptor',
      version: 'opl-foundry-generated-agent-descriptor.v1',
      agent_id: input.blueprint.target_agent_id,
      domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      action_ids: input.blueprint.actions.map((action) => action.action_id),
    };
    const hydratedByPath = new Map(hydratedFiles.map((entry) => [entry.path, entry.bytes]));
    const runtimePackFiles = buildCandidateRuntimePack({
      materialize: input,
      contentBindings,
      hydratedByPath,
    });
    const files = [
      { path: 'agent-blueprint.json', bytes: canonicalJsonBytes(input.blueprint) },
      { path: 'agent/descriptor.json', bytes: canonicalJsonBytes(descriptor) },
      { path: 'agent/agent-pack.json', bytes: canonicalJsonBytes(manifest) },
      { path: 'contracts/authority_policy.json', bytes: canonicalJsonBytes(input.blueprint.authority_policy) },
      { path: 'contracts/memory_policy.json', bytes: canonicalJsonBytes(input.blueprint.memory_policy) },
      { path: 'contracts/evaluation_spec.json', bytes: canonicalJsonBytes(input.blueprint.eval_spec) },
      { path: 'contracts/agent-pack-conformance.json', bytes: canonicalJsonBytes(conformance) },
      { path: CANDIDATE_RESOURCE_LOCK_PATH, bytes: canonicalJsonBytes(resourceLock) },
      ...runtimePackFiles,
      ...hydratedFiles,
    ].sort((left, right) => left.path.localeCompare(right.path));
    requireUnique(files.map((entry) => entry.path), 'Foundry candidate file plan');
    const fileIndex = files.map((entry) => ({
      path: entry.path,
      sha256: sha256(entry.bytes),
      byte_size: entry.bytes.byteLength,
    }));
    const manifestDigest = canonicalDigest(manifest);
    const candidateDigest = canonicalDigest({
      surface_kind: 'opl_foundry_candidate_file_index',
      version: CANDIDATE_INDEX_VERSION,
      blueprint_digest: input.blueprint_digest,
      files: fileIndex,
    });
    const directory = path.join(this.#candidateRoot, digestSegment(candidateDigest));
    const temporary = stagedEntry(this.#paths.staging, 'candidate-directory');
    const candidateIndex = {
      surface_kind: 'opl_foundry_candidate_file_index',
      version: CANDIDATE_INDEX_VERSION,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: candidateDigest,
      files: fileIndex,
    };
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(temporary, { recursive: false });
      fsyncDirectory(this.#paths.staging);
      try {
        for (const entry of files) {
          writeExclusive(path.join(temporary, entry.path), entry.bytes, this.#paths.staging);
        }
        compileStandardAgentStageManifest(temporary);
        writeExclusive(
          path.join(temporary, 'candidate-index.json'),
          canonicalJsonBytes(candidateIndex),
          this.#paths.staging,
        );
        let published = false;
        try {
          fs.renameSync(temporary, directory);
          published = true;
        } catch (error) {
          if (!fs.existsSync(directory)) throw error;
        }
        if (published) fsyncDirectory(this.#candidateRoot);
      } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
        fsyncDirectory(this.#paths.staging);
      }
    }
    const directoryStat = fs.lstatSync(directory);
    const realDirectory = fs.realpathSync.native(directory);
    if (
      !directoryStat.isDirectory()
      || directoryStat.isSymbolicLink()
      || !realDirectory.startsWith(`${this.#candidateRoot}${path.sep}`)
    ) {
      fail('Foundry candidate directory escapes the content-addressed candidate root.');
    }
    const expectedFiles = [...files.map((entry) => entry.path), 'candidate-index.json'].sort();
    const actualFiles = listPhysicalFiles(realDirectory).sort();
    if (canonicalJsonText(actualFiles) !== canonicalJsonText(expectedFiles)) {
      fail('Existing content-addressed candidate contains missing or forbidden writes.', {
        candidate_digest: candidateDigest,
        expected_files: expectedFiles,
        actual_files: actualFiles,
      });
    }
    for (const entry of [...files, { path: 'candidate-index.json', bytes: canonicalJsonBytes(candidateIndex) }]) {
      const file = path.join(directory, entry.path);
      const stat = fs.lstatSync(file);
      const real = fs.realpathSync.native(file);
      if (
        !stat.isFile()
        || stat.isSymbolicLink()
        || !real.startsWith(`${realDirectory}${path.sep}`)
        || sha256(fs.readFileSync(real)) !== sha256(entry.bytes)
      ) {
        fail('Existing content-addressed candidate bytes are invalid.', { candidate_digest: candidateDigest, file: entry.path });
      }
    }
    return {
      surface_kind: 'opl_foundry_materialized_candidate',
      target_agent_id: input.blueprint.target_agent_id,
      target_domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: candidateDigest,
      candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
      manifest_digest: manifestDigest,
    };
  }

  candidateDirectory(candidateDigest: string) {
    return path.join(this.#candidateRoot, digestSegment(candidateDigest));
  }

  verifyMaterializedCandidate(candidate: MaterializedCandidate) {
    return verifyStoredFoundryMaterializedCandidate(candidate, this.#paths);
  }
}

export function verifyStoredFoundryMaterializedCandidate(
  candidate: MaterializedCandidate,
  paths = foundryStoragePaths(),
) {
  const verified = validateCandidateDirectory(paths, candidate);
  if (verified.manifest_digest !== candidate.manifest_digest) {
    fail('Foundry candidate manifest does not match the materialization record.', {
      candidate_digest: candidate.candidate_digest,
      expected_manifest_digest: candidate.manifest_digest,
      actual_manifest_digest: verified.manifest_digest,
    });
  }
  return verified;
}
