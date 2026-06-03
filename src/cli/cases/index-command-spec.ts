import { runFamilyRuntimeStateIndex, type FamilyRuntimeStateIndexAction } from '../../family-runtime-state-index.ts';
import { buildUsageError } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

const INDEX_ACTIONS = new Set<FamilyRuntimeStateIndexAction>([
  'doctor',
  'rebuild',
  'checkpoint',
  'integrity-check',
  'backup',
]);

function parseIndexArgs(args: string[], spec: CommandSpec) {
  const action = args[0] as FamilyRuntimeStateIndexAction | undefined;
  if (!action || !INDEX_ACTIONS.has(action)) {
    throw buildUsageError('index requires doctor, rebuild, checkpoint, integrity-check, or backup.', spec, {
      action,
    });
  }
  const parsed: {
    action: FamilyRuntimeStateIndexAction;
    domain_id?: string;
  } = { action };
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain') {
      parsed.domain_id = args[++index];
      if (!parsed.domain_id) {
        throw buildUsageError('index --domain requires a value.', spec, { option: token });
      }
      continue;
    }
    throw buildUsageError(`Unknown option for index command: ${token}.`, spec, { option: token });
  }
  if (parsed.action !== 'rebuild' && parsed.domain_id) {
    throw buildUsageError('index --domain is only accepted by rebuild.', spec, {
      action: parsed.action,
      option: '--domain',
    });
  }
  return parsed;
}

export function buildIndexCommandSpec(): CommandSpec {
  const spec: CommandSpec = {
    usage: 'opl index doctor|rebuild|checkpoint|integrity-check|backup [--domain <domain_id>]',
    summary:
      'Maintain the OPL-owned SQLite sidecar indexes for queue, lifecycle refs, artifact locators, and operator read-model projections.',
    examples: [
      'opl index doctor --json',
      'opl index rebuild --domain medautoscience --json',
      'opl index integrity-check --json',
      'opl index checkpoint --json',
      'opl index backup --json',
    ],
    group: 'runtime',
    handler: (args) => runFamilyRuntimeStateIndex(parseIndexArgs(args, spec)),
  };
  return spec;
}
