import { TestWorkflowEnvironment } from '@temporalio/testing';

// The bundled test server has a fixed five second connect budget. A loaded host
// (parallel lane batches, an editor, a VM) can miss that window repeatedly, so
// keep retrying well past the point where the host is merely busy.
const EPHEMERAL_STARTUP_ATTEMPTS = 6;
const EPHEMERAL_STARTUP_BACKOFF_MS = 1000;

function isEphemeralStartupFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to start ephemeral server|Failed connecting to test server/i.test(message);
}

async function startWithRetry(
  start: () => Promise<TestWorkflowEnvironment>,
): Promise<TestWorkflowEnvironment> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await start();
    } catch (error) {
      if (attempt >= EPHEMERAL_STARTUP_ATTEMPTS || !isEphemeralStartupFailure(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, EPHEMERAL_STARTUP_BACKOFF_MS * attempt));
    }
  }
}

export async function createTemporalTestWorkflowEnvironment() {
  // Temporal's time-skipping test server has no ARM build.
  if (process.arch === 'arm64') {
    return await startWithRetry(() => TestWorkflowEnvironment.createLocal({
      server: { searchAttributes: [], log: { format: 'pretty', level: 'error' } },
    }));
  }
  return await startWithRetry(() => TestWorkflowEnvironment.createTimeSkipping());
}
