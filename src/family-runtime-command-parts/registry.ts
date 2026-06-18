import { FrameworkContractError } from '../contracts.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { parseAttemptArgs } from './attempt.ts';
import {
  parseLifecycleApplyArgs,
  parseLifecycleReconcileArgs,
} from './lifecycle.ts';
import {
  parseProviderOnlyArgs,
  parseControlLoopStatusArgs,
  parseProviderWorkerSupervisorArgs,
  parseProviderSloTickArgs,
  parseResidencyProofArgs,
} from './provider.ts';
import { parsePaperAutonomyArgs } from './paper-autonomy.ts';
import { parseEvidenceWorklistArgs } from './evidence-worklist.ts';
import {
  parseApproveArgs,
  parseEnqueueArgs,
  parseIntakeArgs,
  parseQueueArgs,
  parseTickArgs,
} from './queue.ts';
import {
  parseSchedulerLifecycleArgs,
  parseSchedulerTickArgs,
} from './scheduler.ts';
import { parseRuntimeProcessArgs } from './service-worker.ts';
import { parseStageArtifactArgs } from './stage-artifact.ts';

type FamilyRuntimeCommandParser = {
  command_path: string;
  parse: (mode: string | undefined, rest: string[]) => FamilyRuntimeCommandInput | null;
};

function staticCommand(
  command_path: string,
  output: FamilyRuntimeCommandInput,
): FamilyRuntimeCommandParser {
  return {
    command_path,
    parse: (mode, rest) => {
      const [root, leaf] = command_path.split(' ');
      if (mode === root && rest[0] === leaf) {
        return output;
      }
      return null;
    },
  };
}

const FAMILY_RUNTIME_COMMAND_USAGE = 'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|control-loop status|service start|service status|service stop|worker start|worker status|worker stop|scheduler status|scheduler install|scheduler remove|scheduler trigger|scheduler tick|evidence-worklist|intake|tick|enqueue|lifecycle apply|paper-autonomy supervisor readback|stage-artifact open|stage-artifact commit|stage-artifact status|stage-artifact explain|stage-artifact rebuild|stage-artifact promote|stage-artifact gc|stage-artifact restore|stage-artifact validate|stage-artifact conformance|stage-artifact workbench|attempt create|attempt start|attempt cancel|attempt list|attempt inspect|attempt query|attempt signal|attempt fixture-run|queue list|queue inspect|queue redrive|queue hold|queue release|queue retire|approve|notify list|events export';

const FAMILY_RUNTIME_COMMAND_REGISTRY: FamilyRuntimeCommandParser[] = [
  {
    command_path: 'status',
    parse: (mode, rest) => !mode || mode === 'status' ? parseProviderOnlyArgs('status', rest) : null,
  },
  {
    command_path: 'doctor',
    parse: (mode, rest) => mode === 'doctor' ? parseProviderOnlyArgs('doctor', rest) : null,
  },
  {
    command_path: 'install',
    parse: (mode, rest) => mode === 'install' ? parseProviderOnlyArgs('install', rest) : null,
  },
  {
    command_path: 'repair',
    parse: (mode, rest) => mode === 'repair' ? parseProviderOnlyArgs('repair', rest) : null,
  },
  {
    command_path: 'provider repair',
    parse: (mode, rest) =>
      mode === 'provider' && rest[0] === 'repair' ? parseProviderOnlyArgs('repair', rest.slice(1)) : null,
  },
  {
    command_path: 'worker/service',
    parse: (mode, rest) =>
      mode === 'worker' || mode === 'service' ? parseRuntimeProcessArgs(mode, rest) : null,
  },
  {
    command_path: 'residency proof',
    parse: (mode, rest) =>
      mode === 'residency' && rest[0] === 'proof' ? parseResidencyProofArgs(rest) : null,
  },
  {
    command_path: 'provider-slo tick',
    parse: (mode, rest) =>
      mode === 'provider-slo' && rest[0] === 'tick' ? parseProviderSloTickArgs(rest) : null,
  },
  {
    command_path: 'provider-worker supervisor',
    parse: (mode, rest) =>
      mode === 'provider-worker' && rest[0] === 'supervisor' ? parseProviderWorkerSupervisorArgs(rest) : null,
  },
  {
    command_path: 'control-loop status',
    parse: (mode, rest) =>
      mode === 'control-loop' && rest[0] === 'status' ? parseControlLoopStatusArgs(rest) : null,
  },
  {
    command_path: 'scheduler tick',
    parse: (mode, rest) =>
      mode === 'scheduler' && rest[0] === 'tick' ? parseSchedulerTickArgs(rest) : null,
  },
  {
    command_path: 'scheduler lifecycle',
    parse: (mode, rest) =>
      mode === 'scheduler'
        && (rest[0] === 'status' || rest[0] === 'install' || rest[0] === 'remove' || rest[0] === 'trigger')
        ? parseSchedulerLifecycleArgs(rest)
        : null,
  },
  {
    command_path: 'lifecycle apply',
    parse: (mode, rest) =>
      mode === 'lifecycle' && rest[0] === 'apply' ? parseLifecycleApplyArgs(rest) : null,
  },
  {
    command_path: 'lifecycle reconcile',
    parse: (mode, rest) =>
      mode === 'lifecycle' && rest[0] === 'reconcile' ? parseLifecycleReconcileArgs(rest) : null,
  },
  {
    command_path: 'paper-autonomy supervisor readback',
    parse: (mode, rest) => mode === 'paper-autonomy' ? parsePaperAutonomyArgs(rest) : null,
  },
  {
    command_path: 'evidence-worklist',
    parse: (mode, rest) => mode === 'evidence-worklist' ? parseEvidenceWorklistArgs([mode, ...rest]) : null,
  },
  {
    command_path: 'stage-artifact',
    parse: (mode, rest) => mode === 'stage-artifact' ? parseStageArtifactArgs(rest) ?? null : null,
  },
  staticCommand('notify list', { mode: 'notify_list' }),
  staticCommand('events export', { mode: 'events_export' }),
  {
    command_path: 'queue',
    parse: (mode, rest) => mode === 'queue' ? parseQueueArgs(rest) ?? null : null,
  },
  {
    command_path: 'attempt',
    parse: (mode, rest) => mode === 'attempt' ? parseAttemptArgs(rest) ?? null : null,
  },
  {
    command_path: 'tick',
    parse: (mode, rest) => mode === 'tick' ? parseTickArgs(rest) : null,
  },
  {
    command_path: 'intake',
    parse: (mode, rest) => mode === 'intake' ? parseIntakeArgs(rest) : null,
  },
  {
    command_path: 'approve',
    parse: (mode, rest) => mode === 'approve' ? parseApproveArgs(rest) : null,
  },
  {
    command_path: 'enqueue',
    parse: (mode, rest) => mode === 'enqueue' ? parseEnqueueArgs(rest) : null,
  },
];

export function parseRegisteredFamilyRuntimeCommand(args: string[]): FamilyRuntimeCommandInput {
  const [mode, ...rest] = args;
  for (const entry of FAMILY_RUNTIME_COMMAND_REGISTRY) {
    const parsed = entry.parse(mode, rest);
    if (parsed) {
      return parsed;
    }
  }
  throw new FrameworkContractError('unknown_command', `Unknown family-runtime subcommand: ${mode}.`, {
    usage: FAMILY_RUNTIME_COMMAND_USAGE,
  });
}
