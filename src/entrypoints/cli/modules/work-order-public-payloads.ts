import { executeOplDeveloperWorkOrder } from '../../../modules/foundry-lab/agent-lab-work-order-execution.ts';
import { parseCommandOptions } from './command-registry.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

function parseWorkOrderExecuteArgs(args: string[], spec: CommandSpec, commandLabel: string) {
  const parsed = parseCommandOptions(args, spec, {
    'work-order': { type: 'string' },
    'target-agent-dir': { type: 'string' },
    suite: { type: 'string' },
    'output-dir': { type: 'string' },
    'verification-command': { type: 'string', multiple: true },
    'codex-bin': { type: 'string' },
    'codex-timeout-ms': { type: 'string' },
    'codex-no-output-timeout-ms': { type: 'string' },
    'codex-command-no-progress-timeout-ms': { type: 'string' },
    'dry-run': { type: 'boolean' },
  });
  const workOrderPath = parsed['work-order'] as string | undefined;
  if (!workOrderPath) {
    throw buildUsageError(`${commandLabel} requires --work-order <developer-patch-work-order.json>.`,
      spec, { option: '--work-order' });
  }
  return {
    workOrderPath,
    targetAgentDir: (parsed['target-agent-dir'] as string | undefined) ?? null,
    suitePath: (parsed.suite as string | undefined) ?? null,
    outputDir: (parsed['output-dir'] as string | undefined) ?? null,
    verificationCommands: (parsed['verification-command'] as string[] | undefined) ?? [],
    codexBin: (parsed['codex-bin'] as string | undefined) ?? null,
    codexTimeoutMs: typeof parsed['codex-timeout-ms'] === 'string'
      ? parsePositiveInteger(parsed['codex-timeout-ms'], '--codex-timeout-ms', spec)
      : null,
    codexNoOutputTimeoutMs: typeof parsed['codex-no-output-timeout-ms'] === 'string'
      ? parsePositiveInteger(parsed['codex-no-output-timeout-ms'], '--codex-no-output-timeout-ms', spec)
      : null,
    codexCommandNoProgressTimeoutMs: typeof parsed['codex-command-no-progress-timeout-ms'] === 'string'
      ? parsePositiveInteger(
          parsed['codex-command-no-progress-timeout-ms'],
          '--codex-command-no-progress-timeout-ms',
          spec,
        )
      : null,
    dryRun: parsed['dry-run'] === true,
  };
}

function parsePositiveInteger(value: string, option: string, spec: CommandSpec): number {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw buildUsageError(`Option ${option} must be a positive integer.`, spec, { option });
  }
  return numeric;
}

async function buildWorkOrderExecutePayload(args: string[], spec: CommandSpec) {
  return await executeOplDeveloperWorkOrder(parseWorkOrderExecuteArgs(args, spec, 'work-order execute'));
}

export {
  buildWorkOrderExecutePayload,
};
