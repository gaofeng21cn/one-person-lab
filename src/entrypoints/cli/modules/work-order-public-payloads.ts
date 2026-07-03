import { executeOplDeveloperWorkOrder } from '../../../modules/foundry-lab/agent-lab-work-order-execution.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

function parseWorkOrderExecuteArgs(args: string[], spec: CommandSpec, commandLabel: string) {
  const parsed: {
    workOrderPath: string | null;
    targetAgentDir: string | null;
    suitePath: string | null;
    outputDir: string | null;
    verificationCommands: string[];
    codexBin: string | null;
    codexTimeoutMs: number | null;
    dryRun: boolean;
  } = {
    workOrderPath: null,
    targetAgentDir: null,
    suitePath: null,
    outputDir: null,
    verificationCommands: [],
    codexBin: null,
    codexTimeoutMs: null,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--work-order') {
      if (!value) {
        throw buildUsageError('Missing value for option: --work-order.', spec, { option: '--work-order' });
      }
      parsed.workOrderPath = value;
      index += 1;
      continue;
    }
    if (token === '--target-agent-dir') {
      if (!value) {
        throw buildUsageError('Missing value for option: --target-agent-dir.', spec, { option: '--target-agent-dir' });
      }
      parsed.targetAgentDir = value;
      index += 1;
      continue;
    }
    if (token === '--suite') {
      if (!value) {
        throw buildUsageError('Missing value for option: --suite.', spec, { option: '--suite' });
      }
      parsed.suitePath = value;
      index += 1;
      continue;
    }
    if (token === '--output-dir') {
      if (!value) {
        throw buildUsageError('Missing value for option: --output-dir.', spec, { option: '--output-dir' });
      }
      parsed.outputDir = value;
      index += 1;
      continue;
    }
    if (token === '--verification-command') {
      if (!value) {
        throw buildUsageError('Missing value for option: --verification-command.', spec, {
          option: '--verification-command',
        });
      }
      parsed.verificationCommands.push(value);
      index += 1;
      continue;
    }
    if (token === '--codex-bin') {
      if (!value) {
        throw buildUsageError('Missing value for option: --codex-bin.', spec, { option: '--codex-bin' });
      }
      parsed.codexBin = value;
      index += 1;
      continue;
    }
    if (token === '--codex-timeout-ms') {
      if (!value) {
        throw buildUsageError('Missing value for option: --codex-timeout-ms.', spec, {
          option: '--codex-timeout-ms',
        });
      }
      const numeric = Number.parseInt(value, 10);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw buildUsageError('Option --codex-timeout-ms must be a positive integer.', spec, {
          option: '--codex-timeout-ms',
        });
      }
      parsed.codexTimeoutMs = numeric;
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    throw buildUsageError(`Unknown option for ${commandLabel}: ${token}.`, spec, { option: token });
  }

  if (!parsed.workOrderPath) {
    throw buildUsageError(`${commandLabel} requires --work-order <developer-patch-work-order.json>.`,
      spec, { option: '--work-order' });
  }
  return {
    ...parsed,
    workOrderPath: parsed.workOrderPath,
  };
}

async function buildWorkOrderExecutePayload(args: string[], spec: CommandSpec) {
  return await executeOplDeveloperWorkOrder(parseWorkOrderExecuteArgs(args, spec, 'work-order execute'));
}

export {
  buildWorkOrderExecutePayload,
};
