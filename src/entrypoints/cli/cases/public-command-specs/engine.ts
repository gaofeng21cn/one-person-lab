import { runOplEngineAction } from '../../../../adapters/integration/system-installation/engine-actions.ts';
import { runOplTurnkeyInstall } from '../../../../adapters/integration/system-installation/turnkey.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import {
  buildPublicEngineActionPayload,
  buildPublicTurnkeyInstallPayload,
} from '../../modules/public-payloads.ts';
import {
  parseOplEngineArgs,
  parseTurnkeyInstallArgs,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildInstallationCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const buildEngineActionSpec = (
    action: 'install' | 'update' | 'reinstall' | 'remove',
    usage: string,
    example: string,
    summary?: string,
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage,
      summary: summary ?? `${action[0].toUpperCase()}${action.slice(1)} one OPL execution engine.`,
      examples: [example],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runOplEngineAction(
            getContracts(),
            action,
            parseOplEngineArgs(args, spec).engineId!,
          ),
        ),
    };
    return spec;
  };

  const installSpec: CommandSpec = {
    usage:
      'opl install [--headless | --with-app] [--skip-packages] [--skip-engines] [--skip-native-helper-repair] [--no-online-runtime]',
    summary: 'Install the headless OPL Base by default, or add the optional desktop App; Agent packages use opl packages install.',
    examples: [
      'opl install',
      'opl install --headless --skip-packages',
      'opl install --with-app',
    ],
    group: 'top_level',
    handler: async (args) => buildPublicTurnkeyInstallPayload(
      await runOplTurnkeyInstall(getContracts(), parseTurnkeyInstallArgs(args, installSpec)),
    ),
  };

  return {
    install: installSpec,
    'engine install': buildEngineActionSpec(
      'install',
      'opl engine install --engine codex',
      'opl engine install --engine codex',
    ),
    'engine update': buildEngineActionSpec(
      'update',
      'opl engine update --engine codex',
      'opl engine update --engine codex',
    ),
    'engine reinstall': buildEngineActionSpec(
      'reinstall',
      'opl engine reinstall --engine codex',
      'opl engine reinstall --engine codex',
    ),
    'engine remove': buildEngineActionSpec(
      'remove',
      'opl engine remove --engine codex',
      'opl engine remove --engine codex',
    ),
  };
}
