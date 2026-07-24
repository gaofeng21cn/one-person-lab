export {
  FoundryKernel,
  FoundryOperationResultUnavailableError,
  FoundryTransientActivityError,
} from './kernel.ts';
export type {
  FoundryAdvanceRunStepOptions,
  FoundryOwnerDecisionReadback,
  FoundryRunInspection,
  FoundryRunTerminalReadback,
  OwnerDecision,
} from './kernel.ts';
export type {
  ActivationPointer,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryActivityIdentity,
  FoundryClock,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  OwnerAuthorityReceipt,
  OwnerAuthorityReceiptStatement,
  OwnerGate,
  OwnerGateAction,
  OwnerGateDecision,
  OwnerGateVerification,
  OwnerGateVerificationContext,
  QualificationRecord,
  VersionRegistry,
} from './ports.ts';
export type { FoundryRunEvent, FoundryRunSnapshot, FoundryRunState } from './state-machine.ts';

import type { FoundryKernel, OwnerDecision } from './kernel.ts';
import type { DesignRequest } from './protocol.ts';

export class FoundryControlService {
  readonly #kernel: FoundryKernel;

  constructor(kernel: FoundryKernel) {
    this.#kernel = kernel;
  }

  async startRun(input: {
    request: DesignRequest;
    run_id?: string;
    advance?: boolean;
  }) {
    const run = await this.#kernel.startRun({ request: input.request, run_id: input.run_id });
    return input.advance === false
      ? this.#kernel.inspectRun(run.run_id)
      : this.#kernel.advanceUntilPause(run.run_id);
  }

  inspectRun(runId: string) {
    return this.#kernel.inspectRun(runId);
  }

  submitOwnerDecision(input: OwnerDecision, options: { advance?: boolean } = {}) {
    return this.#kernel.submitOwnerDecision(input, options);
  }

  cancelRun(input: Parameters<FoundryKernel['cancelRun']>[0]) {
    return this.#kernel.cancelRun(input);
  }

  listVersions(targetAgentId: string, targetDomainId: string) {
    return this.#kernel.listVersions(targetAgentId, targetDomainId);
  }

  rollbackActivation(input: Parameters<FoundryKernel['rollbackActivation']>[0]) {
    return this.#kernel.rollbackActivation(input);
  }
}
