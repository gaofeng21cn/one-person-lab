import { runCodexPassthrough } from '../../../modules/runway/codex.ts';
export { buildUsageError } from './cli-errors.ts';
export { printJson } from './cli-output.ts';

function runCodexPassthroughHandled(args: string[]) {
  const result = runCodexPassthrough(args);
  process.exitCode = result.exitCode;
  return {
    __handled: true as const,
  };
}

export { runCodexPassthroughHandled };
