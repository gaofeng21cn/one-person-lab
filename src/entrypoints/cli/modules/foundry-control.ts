import { FoundryControlService } from '../../../authority/evolution/index.ts';
import { createFoundryLifecycleKernel } from '../../../adapters/execution/index.ts';

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
