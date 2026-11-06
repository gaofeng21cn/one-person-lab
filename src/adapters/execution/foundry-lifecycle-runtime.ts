import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { FoundryKernel } from '../../authority/evolution/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryObjectStore,
  foundryStoragePaths,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../../authority/evidence/index.ts';
import { HostedFoundryActivationRuntime } from './foundry-activation-runtime.ts';
import { DefaultHostedAgentRuntimeBindingResolver } from './hosted-agent-runtime-binding.ts';
import { configuredFoundryOwnerGate } from './foundry-owner-gate.ts';

function deferred(operation: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Foundry ${operation} requires the durable workflow worker.`,
    { failure_code: 'foundry_workflow_worker_required', operation },
  );
}

/** Lifecycle writes must remain available when the semantic provider cannot load. */
export function createFoundryLifecycleKernel(rootOverride?: string, readOnly = false) {
  const versions = new LedgerVersionRegistry(rootOverride, { readOnly });
  const compiler = readOnly ? null : new ContentAddressedCandidateCompiler(rootOverride);
  return new FoundryKernel({
    designer: {
      producer_id: 'foundry-control:deferred-designer',
      design: async () => deferred('design'),
      diagnose: async () => deferred('diagnose'),
    },
    evaluator: {
      evaluator_id: 'foundry-control:deferred-evaluator',
      evaluate: async () => deferred('evaluation'),
      canary: async () => deferred('canary'),
    },
    compiler: compiler ?? { materialize: async () => deferred('materialize') },
    objects: new FileFoundryObjectStore(rootOverride, { readOnly }),
    events: new LedgerFoundryEventStore(rootOverride, { readOnly }),
    versions,
    ...(compiler ? {
      operationResults: new LedgerFoundryOperationResultJournal(rootOverride),
      activationRuntime: new HostedFoundryActivationRuntime({
        resolver: new DefaultHostedAgentRuntimeBindingResolver({
          root_override: rootOverride,
          registry_factory: () => versions,
        }),
        candidate_directory: (digest: string) => compiler.candidateDirectory(digest),
        workspace_root: foundryStoragePaths(rootOverride).root,
      }),
      ownerGate: configuredFoundryOwnerGate(),
    } : {}),
  });
}
