import { buildOplPackageManifest } from '../../../package-distribution.ts';
import { buildOplModules, runOplModuleAction, runOplModuleExec } from '../../../system-installation/modules.ts';
import {
  buildPublicModuleActionPayload,
  buildPublicModuleExecPayload,
  buildPublicModulesPayload,
} from '../../modules/public-payloads.ts';
import {
  cloneCommandSpec,
  parseOplModuleArgs,
  parseOplModuleExecArgs,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { buildNoArgSpec, commandActionSummary } from './shared.ts';

type ModuleAction = 'install' | 'update' | 'reinstall' | 'remove';

function buildModuleActionSpec(
  action: ModuleAction,
  usage: string,
  example: string,
): CommandSpec {
  const spec: CommandSpec = {
    usage,
    summary: commandActionSummary(action, 'one OPL-managed domain module'),
    examples: [example],
    group: 'module',
    handler: (args) =>
      buildPublicModuleActionPayload(
        runOplModuleAction(action, parseOplModuleArgs(args, spec).moduleId!),
      ),
  };
  return spec;
}

export function buildConnectCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  systemCommandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  const connectPackagesManifestSpec = buildNoArgSpec(
    {
      usage: 'opl connect packages manifest',
      summary: 'Show the machine-readable OPL Packages manifest through the canonical Connect command surface.',
      examples: ['opl connect packages manifest --json'],
      group: 'connect',
    },
    () => ({
      version: 'g2',
      packages_manifest: buildOplPackageManifest(),
    }),
  );

  const connectCommandSpecs: Record<string, CommandSpec> = {
    'connect modules': buildNoArgSpec(
      {
        usage: 'opl connect modules',
        summary: 'List OPL-managed domain modules through the canonical Connect command surface.',
        examples: ['opl connect modules --json'],
        group: 'connect',
      },
      () => buildPublicModulesPayload(buildOplModules()),
    ),
    'connect install': {
      ...buildModuleActionSpec(
        'install',
        'opl connect install --module <module_id>',
        'opl connect install --module medautoscience',
      ),
      group: 'connect',
      summary: 'Install one OPL-managed domain module through the canonical Connect command surface.',
    },
    'connect update': {
      ...buildModuleActionSpec(
        'update',
        'opl connect update --module <module_id>',
        'opl connect update --module medautoscience',
      ),
      group: 'connect',
      summary: 'Update one OPL-managed domain module through the canonical Connect command surface.',
    },
    'connect reinstall': {
      ...buildModuleActionSpec(
        'reinstall',
        'opl connect reinstall --module <module_id>',
        'opl connect reinstall --module medautoscience',
      ),
      group: 'connect',
      summary: 'Reinstall one OPL-managed domain module through the canonical Connect command surface.',
    },
    'connect remove': {
      ...buildModuleActionSpec(
        'remove',
        'opl connect remove --module <module_id>',
        'opl connect remove --module medautoscience',
      ),
      group: 'connect',
      summary: 'Remove one OPL-managed domain module through the canonical Connect command surface.',
    },
    'connect exec': {
      usage: 'opl connect exec --module <module_id> -- <domain_cli_args...>',
      summary: 'Run a domain module CLI through the canonical Connect command surface.',
      examples: [
        'opl connect exec --module medautoscience -- doctor entry-modes',
        'opl connect exec --module medautogrant -- --help',
      ],
      group: 'connect',
      handler: (args) => {
        const parsed = parseOplModuleExecArgs(args, connectCommandSpecs['connect exec']);
        return buildPublicModuleExecPayload(
          runOplModuleExec(parsed.moduleId, parsed.args),
        );
      },
    },
    'connect skills': cloneCommandSpec(commandSpecs['skill-list'], {
      usage: 'opl connect skills [--domain <domain_id>]',
      summary: 'Inspect family domain plugin packs through the canonical Connect command surface.',
      examples: [
        'opl connect skills --json',
        'opl connect skills --domain medautoscience --json',
      ],
      group: 'connect',
      help_surface: 'default',
    }),
    'connect sync-skills': cloneCommandSpec(commandSpecs['skill-sync'], {
      usage: 'opl connect sync-skills [--domain <domain_id>] [--scope <project|codex>] [--target-project <project_id>] [--home <home_path>] [--quiet]',
      summary: 'Sync family/domain capability packs to their declared target scope through the canonical Connect command surface.',
      examples: [
        'opl connect sync-skills --json',
        'opl connect sync-skills --domain medautoscience --json',
        'opl connect sync-skills --domain scholarskills --scope project --target-project medautoscience --json',
        'opl connect sync-skills --domain scholarskills --scope codex --json',
        'opl connect sync-skills --home /tmp/codex-home --json',
      ],
      group: 'connect',
      help_surface: 'default',
    }),
    'connect packages manifest': connectPackagesManifestSpec,
    'connect reconcile-modules': cloneCommandSpec(systemCommandSpecs['system reconcile-modules'], {
      usage: 'opl connect reconcile-modules',
      summary: 'Install missing modules and update clean domain modules through the canonical Connect command surface.',
      examples: ['opl connect reconcile-modules --json'],
      group: 'connect',
    }),
  };

  return connectCommandSpecs;
}
