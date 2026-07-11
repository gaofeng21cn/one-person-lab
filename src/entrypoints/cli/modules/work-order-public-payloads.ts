import { executeOplDeveloperWorkOrder } from '../../../modules/foundry-lab/agent-lab-work-order-execution.ts';
import { materializeWorkOrderRequest } from '../../../modules/foundry-lab/work-order-request-materialization.ts';
import { parseCommandOptions } from './command-registry.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

function parseWorkOrderExecuteArgs(args: string[], spec: CommandSpec, commandLabel: string) {
  const values = parseCommandOptions(args, spec, {
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
  const workOrderPath = values['work-order'] as string | undefined;
  if (!workOrderPath) {
    throw buildUsageError(`${commandLabel} requires --work-order <developer-patch-work-order.json>.`,
      spec, { option: '--work-order' });
  }
  return {
    workOrderPath,
    targetAgentDir: values['target-agent-dir'] as string | undefined ?? null,
    suitePath: values.suite as string | undefined ?? null,
    outputDir: values['output-dir'] as string | undefined ?? null,
    verificationCommands: values['verification-command'] as string[] | undefined ?? [],
    codexBin: values['codex-bin'] as string | undefined ?? null,
    codexTimeoutMs: values['codex-timeout-ms']
      ? parsePositiveInteger(values['codex-timeout-ms'] as string, '--codex-timeout-ms', spec)
      : null,
    codexNoOutputTimeoutMs: values['codex-no-output-timeout-ms']
      ? parsePositiveInteger(values['codex-no-output-timeout-ms'] as string, '--codex-no-output-timeout-ms', spec)
      : null,
    codexCommandNoProgressTimeoutMs: values['codex-command-no-progress-timeout-ms']
      ? parsePositiveInteger(
          values['codex-command-no-progress-timeout-ms'] as string,
          '--codex-command-no-progress-timeout-ms',
          spec,
        )
      : null,
    dryRun: values['dry-run'] === true,
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

function buildWorkOrderMaterializeRequestPayload(args: string[], spec: CommandSpec) {
  const values = parseCommandOptions(args, spec, {
    request: { type: 'string' },
    'target-dir': { type: 'string' },
  });
  const requestPath = values.request as string | undefined;
  const targetDir = values['target-dir'] as string | undefined;
  if (!requestPath || !targetDir) {
    throw buildUsageError(
      'work-order materialize-request requires --request <request.json> and --target-dir <new-dir>.',
      spec,
      { required: ['--request', '--target-dir'] },
    );
  }
  return materializeWorkOrderRequest({ requestPath, targetDir });
}

export {
  buildWorkOrderExecutePayload,
  buildWorkOrderMaterializeRequestPayload,
};
