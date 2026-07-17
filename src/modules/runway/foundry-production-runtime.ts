import fs from 'node:fs';

import {
  FoundryKernel,
  isQualificationGradeEvaluationRuntime,
  ManifestFoundryDesignerAdapter,
  type EvaluationExecutor,
} from '../foundry/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryObjectStore,
  foundryStoragePaths,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../ledger/index.ts';
import { StageRunFoundryProviderInvoker } from './foundry-provider-stage-run.ts';
import { configuredFoundryEvaluationExecutor } from './foundry-process-evaluator.ts';
import { HostedFoundryActivationRuntime } from './foundry-activation-runtime.ts';
import { DefaultHostedAgentRuntimeBindingResolver } from './hosted-agent-runtime-binding.ts';
import { configuredFoundryOwnerGate } from './foundry-owner-gate.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';

export async function createProductionFoundryKernel(input: {
  root_override?: string;
  trusted_evaluation_runtime?: EvaluationExecutor;
  semantic_provider_agent_id?: string;
  resolve_managed_checkout?: typeof resolveStandardAgentManagedCheckout;
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
  const storage = foundryStoragePaths(input.root_override);
  fs.mkdirSync(storage.root, { recursive: true });
  const managed = await (input.resolve_managed_checkout ?? resolveStandardAgentManagedCheckout)({
    domainId: input.semantic_provider_agent_id ?? 'oma',
    workspaceRoot: storage.root,
  });
  const compiler = new ContentAddressedCandidateCompiler(input.root_override);
  const evaluator = input.trusted_evaluation_runtime ?? configuredFoundryEvaluationExecutor({
    candidate_pack_resolver: {
      resolveDirectory: (candidate) => compiler.candidateDirectory(candidate.candidate_digest),
    },
  });
  const versions = new LedgerVersionRegistry(input.root_override);
  return new FoundryKernel({
    designer: new ManifestFoundryDesignerAdapter({
      checkout_root: managed.checkout_root,
      invoker: new StageRunFoundryProviderInvoker({ storage_root: storage.root }),
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
    activityMaxAttempts: 1,
    propagateTransientActivityFailures: true,
  });
}
