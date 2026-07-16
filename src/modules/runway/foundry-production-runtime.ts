import fs from 'node:fs';

import {
  FoundryKernel,
  ManifestFoundryDesignerAdapter,
  type EvaluationExecutor,
} from '../foundry/index.ts';
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
import { configuredFoundryOwnerGate } from './foundry-owner-gate.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';

export async function createProductionFoundryKernel(input: {
  root_override?: string;
  evaluator?: EvaluationExecutor;
} = {}) {
  const storage = foundryStoragePaths(input.root_override);
  fs.mkdirSync(storage.root, { recursive: true });
  const managed = await resolveStandardAgentManagedCheckout({
    domainId: 'oma',
    workspaceRoot: storage.root,
  });
  const compiler = new ContentAddressedCandidateCompiler(input.root_override);
  const evaluator = input.evaluator ?? configuredFoundryEvaluationExecutor({
    candidate_directory: (candidate) => compiler.candidateDirectory(candidate.candidate_digest),
  });
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
    versions: new LedgerVersionRegistry(input.root_override),
    ownerGate: configuredFoundryOwnerGate(),
    activityMaxAttempts: 1,
    propagateTransientActivityFailures: true,
  });
}
