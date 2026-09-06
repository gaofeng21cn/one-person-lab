import fs from 'node:fs';

import {
  preflightFoundryBaselineAdoption,
  FoundryKernel,
  foundryContentDigest,
  isQualificationGradeEvaluationRuntime,
  ManifestFoundryDesignerAdapter,
  type AgentBlueprint,
  type EvaluationExecutor,
  type EvidenceBundle,
  type FoundryRunInspection,
} from '../../authority/evolution/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  foundryStoragePaths,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../../authority/evidence/index.ts';
import {
  StageRunFoundryProviderCoordinator,
  StageRunFoundryProviderInvoker,
  assertFoundryProviderOperationCursorBinding,
  type FoundryProviderOperationInvocation,
  type FoundryProviderOperationCursor,
  type FoundryStageRouteCompositionFactory,
} from './foundry-provider-stage-run.ts';
import type { FoundryAdvanceRunActivityInput } from './foundry-temporal.ts';
import { configuredFoundryEvaluationExecutor } from './foundry-process-evaluator.ts';
import { HostedFoundryActivationRuntime } from './foundry-activation-runtime.ts';
import { DefaultHostedAgentRuntimeBindingResolver } from './hosted-agent-runtime-binding.ts';
import { configuredFoundryOwnerGate } from './foundry-owner-gate.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';
import type { FoundryDevCompositionFactory } from './composition-factory-ports.ts';

type ProductionFoundryRuntimeOptions = {
  root_override?: string;
  semantic_provider_agent_id?: string;
  resolve_managed_checkout?: typeof resolveStandardAgentManagedCheckout;
  create_foundry_dev_composition?: FoundryDevCompositionFactory;
  create_stage_route_composition?: FoundryStageRouteCompositionFactory;
};

async function resolveProductionFoundryProviderBinding(input: ProductionFoundryRuntimeOptions) {
  const storage = foundryStoragePaths(input.root_override);
  fs.mkdirSync(storage.root, { recursive: true });
  const foundryComposition = await input.create_foundry_dev_composition?.();
  if (!foundryComposition) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Production Foundry requires a Host-provided foundry-dev composition.',
      { failure_code: 'host_foundry_dev_composition_factory_missing' },
    );
  }
  try {
    const managed = await (input.resolve_managed_checkout ?? resolveStandardAgentManagedCheckout)({
      domainId: input.semantic_provider_agent_id ?? 'oma',
      workspaceRoot: storage.root,
      refreshWorkspaceSkills: foundryComposition.services.refreshWorkspaceSkills,
    });
    const providerManifest = foundryComposition.services.foundryProviderManifest.read(
      managed.checkout_root,
    );
    return {
      storage,
      managed,
      providerManifest,
      providerSourceDigest: managed.native_runtime.source_tree_sha256,
    };
  } finally {
    await foundryComposition.dispose();
  }
}

export async function createProductionFoundryProviderOperationRuntime(input: ProductionFoundryRuntimeOptions & {
  advance_operation: FoundryAdvanceRunActivityInput;
  inspection: FoundryRunInspection;
}) {
  const { storage, managed, providerManifest } = await resolveProductionFoundryProviderBinding(input);
  const objects = new FileFoundryObjectStore(input.root_override, { readOnly: true });
  let invocation: FoundryProviderOperationInvocation;
  if (input.advance_operation.phase === 'design') {
    invocation = {
      operation: 'design',
      provider: providerManifest,
      checkout_root: managed.checkout_root,
      payload: { request: input.inspection.request },
      activity: {
        run_id: input.inspection.run.run_id,
        iteration: 0,
        phase: 'design',
        input_digest: input.inspection.run.request_digest,
      },
      provider_source_digest: managed.native_runtime.source_tree_sha256,
    };
  } else if (input.advance_operation.phase === 'diagnose') {
    const blueprintDigest = input.inspection.run.blueprint_digest;
    const evidenceDigest = input.inspection.run.evidence_digest;
    if (!blueprintDigest || !evidenceDigest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Foundry diagnose provider operation requires blueprint and evidence digests.',
        { run_id: input.inspection.run.run_id },
      );
    }
    const blueprint = await objects.get<AgentBlueprint>(blueprintDigest);
    const evidence = await objects.get<EvidenceBundle>(evidenceDigest);
    if (!blueprint || !evidence) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Foundry diagnose provider operation objects are unavailable.',
        { blueprint_digest: blueprintDigest, evidence_digest: evidenceDigest },
      );
    }
    invocation = {
      operation: 'diagnose',
      provider: providerManifest,
      checkout_root: managed.checkout_root,
      payload: { request: input.inspection.request, blueprint, evidence },
      activity: {
        run_id: input.inspection.run.run_id,
        iteration: input.inspection.run.generation,
        phase: 'diagnose',
        input_digest: foundryContentDigest({
          blueprint_digest: blueprintDigest,
          evidence_digest: evidenceDigest,
        }),
      },
      provider_source_digest: managed.native_runtime.source_tree_sha256,
    };
  } else {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Durable provider orchestration is only valid for design and diagnose phases.',
      { phase: input.advance_operation.phase },
    );
  }
  return {
    coordinator: new StageRunFoundryProviderCoordinator({
      storage_root: storage.root,
      create_stage_route_composition: input.create_stage_route_composition,
    }),
    invocation,
  };
}

export function createProductionFoundryProviderOperationCoordinator(input: {
  root_override?: string;
} = {}) {
  return new StageRunFoundryProviderCoordinator({
    storage_root: foundryStoragePaths(input.root_override).root,
  });
}

export function preflightProductionFoundryBaselineAdoption(input: {
  request: unknown;
  run_id: string;
  root_override?: string;
}) {
  return preflightFoundryBaselineAdoption(input, {
    versions: new LedgerVersionRegistry(input.root_override),
    ownerGate: configuredFoundryOwnerGate(),
    contentRefs: new FileFoundryContentStore(input.root_override),
  });
}

export async function createProductionFoundryKernel(input: {
  root_override?: string;
  trusted_evaluation_runtime?: EvaluationExecutor;
  semantic_provider_agent_id?: string;
  resolve_managed_checkout?: typeof resolveStandardAgentManagedCheckout;
  create_foundry_dev_composition?: FoundryDevCompositionFactory;
  create_stage_route_composition?: FoundryStageRouteCompositionFactory;
  provider_operation_cursor?: FoundryProviderOperationCursor | null;
} = {}) {
  if (
    input.trusted_evaluation_runtime
    && !isQualificationGradeEvaluationRuntime(input.trusted_evaluation_runtime)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Production Foundry qualification requires a Framework-owned FrozenPlan Evaluation Runtime.',
      {
        evaluator_id: input.trusted_evaluation_runtime.evaluator_id,
        qualification_capability: input.trusted_evaluation_runtime.qualification_capability ?? null,
      },
    );
  }
  const frozenCursor = input.provider_operation_cursor ?? null;
  if (frozenCursor) {
    assertFoundryProviderOperationCursorBinding(frozenCursor, frozenCursor.operation_key);
    if (
      frozenCursor.version !== 'opl-foundry-provider-operation-cursor.v2'
      || frozenCursor.status !== 'terminal'
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Production Foundry exact replay requires a terminal generation-bound provider operation cursor.',
        {
          operation_key: frozenCursor.operation_key,
          cursor_version: frozenCursor.version,
        },
      );
    }
  }
  const currentBinding = frozenCursor
    ? null
    : await resolveProductionFoundryProviderBinding(input);
  const storage = currentBinding?.storage ?? foundryStoragePaths(input.root_override);
  fs.mkdirSync(storage.root, { recursive: true });
  const checkoutRoot = frozenCursor?.checkout_root ?? currentBinding!.managed.checkout_root;
  const providerManifest = frozenCursor?.provider_manifest ?? currentBinding!.providerManifest;
  const providerSourceDigest = frozenCursor?.provider_source_digest
    ?? currentBinding!.providerSourceDigest;
  const compiler = new ContentAddressedCandidateCompiler(input.root_override);
  const contentRefs = new FileFoundryContentStore(input.root_override);
  const evaluator = input.trusted_evaluation_runtime ?? configuredFoundryEvaluationExecutor({
    candidate_pack_resolver: {
      resolveDirectory: (candidate) => compiler.candidateDirectory(candidate.candidate_digest),
    },
  });
  const versions = new LedgerVersionRegistry(input.root_override);
  return new FoundryKernel({
    designer: new ManifestFoundryDesignerAdapter({
      checkout_root: checkoutRoot,
      provider_manifest: providerManifest,
      provider_source_digest: providerSourceDigest,
      invoker: new StageRunFoundryProviderInvoker({
        storage_root: storage.root,
        create_stage_route_composition: input.create_stage_route_composition,
        replay_only: frozenCursor !== null,
        operation_key: frozenCursor?.operation_key,
      }),
    }),
    compiler,
    evaluator,
    objects: new FileFoundryObjectStore(input.root_override),
    events: new LedgerFoundryEventStore(input.root_override),
    operationResults: new LedgerFoundryOperationResultJournal(input.root_override),
    versions,
    activationRuntime: new HostedFoundryActivationRuntime({
      resolver: new DefaultHostedAgentRuntimeBindingResolver({
        root_override: input.root_override,
        registry_factory: () => versions,
      }),
      candidate_directory: (candidateDigest) => compiler.candidateDirectory(candidateDigest),
      workspace_root: storage.root,
    }),
    ownerGate: configuredFoundryOwnerGate(),
    baselineAdoptionContentRefs: contentRefs,
    activityMaxAttempts: 1,
    propagateTransientActivityFailures: true,
  });
}
