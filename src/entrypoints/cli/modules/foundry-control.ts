import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  FoundryControlService,
  FoundryKernel,
  type DesignerPort,
  type EvaluationExecutor,
} from '../../../modules/foundry/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../../../modules/ledger/index.ts';
import { configuredFoundryOwnerGate } from '../../../modules/runway/foundry-owner-gate.ts';

function deferred(operation: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Foundry ${operation} requires the durable workflow worker.`,
    {
      failure_code: 'foundry_workflow_worker_required',
      operation,
    },
  );
}

const deferredDesigner: DesignerPort = {
  producer_id: 'foundry-control:deferred-designer',
  design: async () => deferred('design'),
  diagnose: async () => deferred('diagnose'),
};

const deferredEvaluator: EvaluationExecutor = {
  evaluator_id: 'foundry-control:deferred-evaluator',
  evaluate: async () => deferred('evaluation'),
  canary: async () => deferred('canary'),
};

export function createPersistentFoundryControl(rootOverride?: string) {
  return new FoundryControlService(new FoundryKernel({
    designer: deferredDesigner,
    evaluator: deferredEvaluator,
    compiler: new ContentAddressedCandidateCompiler(rootOverride),
    objects: new FileFoundryObjectStore(rootOverride),
    events: new LedgerFoundryEventStore(rootOverride),
    operationResults: new LedgerFoundryOperationResultJournal(rootOverride),
    versions: new LedgerVersionRegistry(rootOverride),
    ownerGate: configuredFoundryOwnerGate(),
  }));
}
