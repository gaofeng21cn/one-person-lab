import { TestWorkflowEnvironment } from '@temporalio/testing';

export async function createTemporalTestWorkflowEnvironment() {
  // Temporal's time-skipping test server has no ARM build.
  if (process.arch === 'arm64') {
    return TestWorkflowEnvironment.createLocal({
      server: { searchAttributes: [] },
    });
  }
  return TestWorkflowEnvironment.createTimeSkipping();
}
