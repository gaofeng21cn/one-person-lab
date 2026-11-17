import { sleep } from '@temporalio/workflow';

// A durable delay before entering the workflow models a resumed worker without
// spending wall time or replacing the runtime's clock and execution APIs.
export const interceptors = () => ({ inbound: [{
  async execute(input, next) { await sleep('6 minutes'); return next(input); },
}] });
