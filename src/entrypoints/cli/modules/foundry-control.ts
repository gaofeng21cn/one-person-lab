import type {
  DesignRequest,
  FoundryKernel,
  OwnerDecision,
} from '../../../authority/evolution/index.ts';
import { createFoundryLifecycleKernel } from '../../../adapters/execution/index.ts';

class FoundryControlService {
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

export function createPersistentFoundryControl(rootOverride?: string) {
  const readControl = new FoundryControlService(createFoundryLifecycleKernel(rootOverride, true));
  let mutationControl: FoundryControlService | null = null;
  const writer = () => mutationControl ??= new FoundryControlService(createFoundryLifecycleKernel(rootOverride));
  return {
    startRun: (input: Parameters<FoundryControlService['startRun']>[0]) => writer().startRun(input),
    inspectRun: readControl.inspectRun.bind(readControl),
    submitOwnerDecision: (
      input: Parameters<FoundryControlService['submitOwnerDecision']>[0],
      options?: Parameters<FoundryControlService['submitOwnerDecision']>[1],
    ) => writer().submitOwnerDecision(input, options),
    cancelRun: (input: Parameters<FoundryControlService['cancelRun']>[0]) => writer().cancelRun(input),
    listVersions: readControl.listVersions.bind(readControl),
    rollbackActivation: (input: Parameters<FoundryControlService['rollbackActivation']>[0]) => (
      writer().rollbackActivation(input)
    ),
  };
}
