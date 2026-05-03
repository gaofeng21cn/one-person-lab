import { GatewayContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../contracts.ts';
import { bootstrapLocalCodexDefaults, readBundledCodexDefaultProfile } from '../../local-codex-defaults.ts';
import { buildOplPackageManifest } from '../../package-distribution.ts';
import { buildQualityDetails, parseQualityDetailsArgs, renderQualityDetailsMarkdown } from '../../quality-details/index.ts';
import { runOplEngineAction } from '../../system-installation/engine-actions.ts';
import { buildOplEnvironment } from '../../system-installation/environment.ts';
import { buildOplInitialize } from '../../system-installation/initialize.ts';
import { buildOplModules, runOplModuleAction } from '../../system-installation/modules.ts';
import { runOplSystemAction } from '../../system-installation/system-actions.ts';
import { runOplTurnkeyInstall } from '../../system-installation/turnkey.ts';
import type { GatewayContracts } from '../../types.ts';
import {
  buildPublicEngineActionPayload,
  buildPublicModuleActionPayload,
  buildPublicModulesPayload,
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
  buildPublicTurnkeyInstallPayload,
} from '../modules/public-payloads.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, parseOplEngineArgs, parseOplModuleArgs, parseSystemConfigureCodexArgs, parseTurnkeyInstallArgs, parseUpdateChannelArgs, printJson, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

async function readStdinText() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => GatewayContracts,
): Record<string, CommandSpec> {
  const buildNoArgSpec = (
    base: Omit<CommandSpec, 'handler'>,
    handler: () => unknown | Promise<unknown>,
  ): CommandSpec => {
    const spec: CommandSpec = {
      ...base,
      handler: (args) => {
        assertNoArgs(args, spec);
        return handler();
      },
    };
    return spec;
  };

  const buildModuleActionSpec = (
    action: 'install' | 'update' | 'reinstall' | 'remove',
    usage: string,
    example: string,
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage,
      summary: `${action[0].toUpperCase()}${action.slice(1)} one OPL-managed domain module.`,
      examples: [example],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runOplModuleAction(action, parseOplModuleArgs(args, spec).moduleId!),
        ),
    };
    return spec;
  };

  const buildEngineActionSpec = (
    action: 'install' | 'update' | 'reinstall' | 'remove',
    usage: string,
    example: string,
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage,
      summary: `${action[0].toUpperCase()}${action.slice(1)} one OPL execution engine.`,
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
      'opl install [--modules <mas,mag,rca>] [--module <module_id>] [--skip-modules] [--skip-engines] [--skip-native-helper-repair] [--skip-gui-open]',
    summary: 'One-shot install for the default Codex engine, family modules, Codex skills, and the OPL GUI app.',
    examples: [
      'opl install',
      'opl install --modules mas,mag,rca',
      'opl install --modules mas --skip-engines --skip-gui-open',
    ],
    group: 'top_level',
    handler: async (args) => buildPublicTurnkeyInstallPayload(
      await runOplTurnkeyInstall(getContracts(), parseTurnkeyInstallArgs(args, installSpec)),
    ),
  };

  const systemSpec = buildNoArgSpec(
    {
      usage: 'opl system',
      summary: 'Show the user-facing OPL system surface: core engines, GUI install state, and managed paths.',
      examples: ['opl system'],
      group: 'system',
    },
    async () => buildPublicSystemPayload(await buildOplEnvironment(getContracts())),
  );

  const systemInitializeSpec = buildNoArgSpec(
    {
      usage: 'opl system initialize',
      summary: 'Show the first-run initialization surface for system, modules, and workspace root.',
      examples: ['opl system initialize'],
      group: 'system',
    },
    async () => buildPublicSystemInitializePayload(await buildOplInitialize(getContracts())),
  );

  const systemRepairSpec = buildNoArgSpec(
    {
      usage: 'opl system repair',
      summary: 'Run the system-level repair action for the current OPL install.',
      examples: ['opl system repair'],
      group: 'system',
    },
    async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'repair')),
  );

  const systemUpdateSpec = buildNoArgSpec(
    {
      usage: 'opl system update',
      summary: 'Update OPL engines and domain modules that report an available update.',
      examples: ['opl system update'],
      group: 'system',
    },
    async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'update')),
  );

  const systemReconcileModulesSpec = buildNoArgSpec(
    {
      usage: 'opl system reconcile-modules',
      summary: 'Install missing modules and update clean domain modules to the latest git upstream.',
      examples: ['opl system reconcile-modules'],
      group: 'system',
    },
    async () => buildPublicSystemActionPayload(await runOplSystemAction(getContracts(), 'reconcile_modules')),
  );

  const systemUpdateChannelSpec: CommandSpec = {
    usage: 'opl system update-channel [--channel <stable|preview>]',
    summary: 'Read or update the local OPL release channel.',
    examples: ['opl system update-channel', 'opl system update-channel --channel preview'],
    group: 'system',
    handler: async (args) => {
      const parsed = parseUpdateChannelArgs(args, systemUpdateChannelSpec);
      return buildPublicSystemActionPayload(
        await runOplSystemAction(getContracts(), 'update_channel', parsed),
      );
    },
  };

  const systemConfigureCodexSpec: CommandSpec = {
    usage: 'opl system configure-codex --api-key-stdin',
    summary: 'Write the local Codex provider config from the OPL default endpoint, current initial model profile, and an API key read from stdin.',
    examples: ['printf "%s" "$OPL_CODEX_API_KEY" | opl system configure-codex --api-key-stdin'],
    group: 'system',
    handler: async (args) => {
      parseSystemConfigureCodexArgs(args, systemConfigureCodexSpec);
      const apiKey = (await readStdinText()).trim();
      if (!apiKey) {
        throw buildUsageError('system configure-codex received an empty API key on stdin.', systemConfigureCodexSpec, {
          required: ['api_key_stdin'],
        });
      }

      const defaultProfile = readBundledCodexDefaultProfile();
      const bootstrap = bootstrapLocalCodexDefaults({
        provider_api_key: apiKey,
        overwrite_existing: true,
      });
      return {
        version: 'g2',
        codex_config: {
          surface_id: 'opl_codex_config',
          status: bootstrap.status,
          config_path: bootstrap.config_path,
          default_profile: defaultProfile,
          bootstrap,
        },
      };
    },
  };

  const modulesSpec = buildNoArgSpec(
    {
      usage: 'opl modules',
      summary: 'List the OPL-managed domain modules available to the current install.',
      examples: ['opl modules'],
      group: 'module',
    },
    () => buildPublicModulesPayload(buildOplModules()),
  );

  const packagesManifestSpec = buildNoArgSpec(
    {
      usage: 'opl packages manifest',
      summary: 'Show the machine-readable OPL Packages manifest for GUI, Docker, native helper, and domain modules.',
      examples: ['opl packages manifest'],
      group: 'package',
    },
    () => ({
      version: 'g2',
      packages_manifest: buildOplPackageManifest(),
    }),
  );

  const moduleInstallSpec = buildModuleActionSpec(
    'install',
    'opl module install --module <module_id>',
    'opl module install --module medautoscience',
  );
  const moduleUpdateSpec = buildModuleActionSpec(
    'update',
    'opl module update --module <module_id>',
    'opl module update --module medautoscience',
  );
  const moduleReinstallSpec = buildModuleActionSpec(
    'reinstall',
    'opl module reinstall --module <module_id>',
    'opl module reinstall --module medautoscience',
  );
  const moduleRemoveSpec = buildModuleActionSpec(
    'remove',
    'opl module remove --module <module_id>',
    'opl module remove --module medautoscience',
  );

  const engineInstallSpec = buildEngineActionSpec(
    'install',
    'opl engine install --engine <codex|hermes>',
    'opl engine install --engine codex',
  );
  const engineUpdateSpec = buildEngineActionSpec(
    'update',
    'opl engine update --engine <codex|hermes>',
    'opl engine update --engine codex',
  );
  const engineReinstallSpec = buildEngineActionSpec(
    'reinstall',
    'opl engine reinstall --engine <codex|hermes>',
    'opl engine reinstall --engine codex',
  );
  const engineRemoveSpec = buildEngineActionSpec(
    'remove',
    'opl engine remove --engine <codex|hermes>',
    'opl engine remove --engine hermes',
  );

  const publicCommandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command ...]',
      summary: 'Show the top-level command groups or command-scoped runnable examples.',
      examples: ['opl help', 'opl help status workspace', 'opl help module install'],
      group: 'top_level',
      handler: (args) => {
        if (args.length === 0) {
          return buildRootHelp(publicCommandSpecs);
        }

        const helpTarget = args.join(' ');
        const helpSpec = publicCommandSpecs[helpTarget];
        if (!helpSpec) {
          throw new GatewayContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(publicCommandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    install: installSpec,
    'packages manifest': packagesManifestSpec,
    doctor: cloneCommandSpec(commandSpecs.doctor, { group: 'top_level' }),
    start: cloneCommandSpec(commandSpecs.start, { group: 'top_level' }),
    'quality details': {
      usage:
        'opl quality details --root <repo_path> [--format <json|markdown>] [--limit <n>] [--focus <auto|depth|equality|modularity|redundancy|test_gaps|rules>]',
      summary: 'Emit deterministic code-quality details for agent triage beside Sentrux Free summaries.',
      examples: [
        'opl quality details --root /Users/gaofeng/workspace/one-person-lab --format json',
        'opl quality details --root . --format markdown --limit 20 --focus auto',
      ],
      group: 'quality',
      handler: async (args) => {
        const parsed = parseQualityDetailsArgs(args);
        if (!parsed.ok) {
          throw buildUsageError(parsed.message, publicCommandSpecs['quality details'], parsed.details);
        }

        const report = await buildQualityDetails(parsed.options);
        if (parsed.options.format === 'markdown') {
          process.stdout.write(`${renderQualityDetailsMarkdown(report)}\n`);
          return { __handled: true as const };
        }

        return {
          version: 'g2',
          quality_details: report,
        };
      },
    },
    'skill list': cloneCommandSpec(commandSpecs['skill-list'], {
      usage: 'opl skill list [--domain <domain_id>]',
      group: 'skill',
    }),
    'skill sync': cloneCommandSpec(commandSpecs['skill-sync'], {
      usage: 'opl skill sync [--domain <domain_id>] [--home <home_path>] [--quiet]',
      group: 'skill',
    }),
    'skill companion status': cloneCommandSpec(commandSpecs['skill-companion-status'], {
      usage: 'opl skill companion status [--home <home_path>] [--superpowers <keep|lite|full>]',
      group: 'skill',
    }),
    'skill companion apply': cloneCommandSpec(commandSpecs['skill-companion-apply'], {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>] [--superpowers <keep|lite|full>]',
      group: 'skill',
    }),
    exec: cloneCommandSpec(commandSpecs.exec, { group: 'top_level' }),
    resume: cloneCommandSpec(commandSpecs.resume, { group: 'top_level' }),
    ask: cloneCommandSpec(commandSpecs.ask, { group: 'legacy' }),
    chat: cloneCommandSpec(commandSpecs.chat, { group: 'legacy' }),
    shell: cloneCommandSpec(commandSpecs.shell, { group: 'legacy' }),
    web: cloneCommandSpec(commandSpecs.web, { group: 'legacy' }),
    'status workspace': cloneCommandSpec(commandSpecs['status workspace'], {
      usage: 'opl status workspace [--path <workspace_path>]',
      examples: ['opl status workspace', 'opl status workspace --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'status',
    }),
    'status runtime': cloneCommandSpec(commandSpecs['status runtime'], {
      usage: 'opl status runtime [--limit <n>]',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      group: 'status',
    }),
    'status dashboard': cloneCommandSpec(commandSpecs.dashboard, {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      group: 'status',
    }),
    'workspace projects': cloneCommandSpec(commandSpecs.projects, {
      usage: 'opl workspace projects',
      examples: ['opl workspace projects'],
      group: 'workspace',
    }),
    'workspace list': cloneCommandSpec(commandSpecs['workspace list'], {
      usage: 'opl workspace list',
      examples: ['opl workspace list'],
      group: 'workspace',
    }),
    'workspace root': cloneCommandSpec(commandSpecs['workspace root'], {
      usage: 'opl workspace root',
      examples: ['opl workspace root'],
      group: 'workspace',
    }),
    'workspace root set': cloneCommandSpec(commandSpecs['workspace root set'], {
      usage: 'opl workspace root set --path <workspace_root>',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      group: 'workspace',
    }),
    'workspace root doctor': cloneCommandSpec(commandSpecs['workspace root doctor'], {
      usage: 'opl workspace root doctor',
      examples: ['opl workspace root doctor'],
      group: 'workspace',
    }),
    'workspace bind': cloneCommandSpec(commandSpecs['workspace-bind'], {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
      ],
      group: 'workspace',
    }),
    'workspace activate': cloneCommandSpec(commandSpecs['workspace-activate'], {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'workspace archive': cloneCommandSpec(commandSpecs['workspace-archive'], {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'domain manifests': cloneCommandSpec(commandSpecs['domain manifests'], {
      usage: 'opl domain manifests',
      examples: ['opl domain manifests'],
      group: 'domain',
    }),
    'domain launch': cloneCommandSpec(commandSpecs['domain launch'], {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      examples: ['opl domain launch --project redcube --dry-run'],
      group: 'domain',
    }),
    'domain resolve-request': cloneCommandSpec(commandSpecs['domain resolve-request'], {
      usage:
        'opl domain resolve-request --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      group: 'domain',
    }),
    'domain explain-boundary': cloneCommandSpec(commandSpecs['domain explain-boundary'], {
      usage:
        'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
      ],
      group: 'domain',
    }),
    'contract validate': cloneCommandSpec(commandSpecs['validate-contracts'], {
      usage: 'opl contract validate',
      examples: ['opl contract validate'],
      group: 'contract',
    }),
    'contract workstreams': cloneCommandSpec(commandSpecs['list-workstreams'], {
      usage: 'opl contract workstreams',
      examples: ['opl contract workstreams'],
      group: 'contract',
    }),
    'contract workstream': cloneCommandSpec(commandSpecs['get-workstream'], {
      usage: 'opl contract workstream <workstream_id>',
      examples: ['opl contract workstream research_ops', 'opl contract workstream presentation_ops'],
      group: 'contract',
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('contract workstream requires a workstream id.', publicCommandSpecs['contract workstream'], {
            required: ['workstream_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstream: findWorkstreamOrThrow(contracts, workstreamId),
        });
      },
    }),
    'contract domains': cloneCommandSpec(commandSpecs['list-domains'], {
      usage: 'opl contract domains',
      examples: ['opl contract domains'],
      group: 'contract',
    }),
    'contract domain': cloneCommandSpec(commandSpecs['get-domain'], {
      usage: 'opl contract domain <domain_id>',
      examples: ['opl contract domain medautoscience', 'opl contract domain redcube'],
      group: 'contract',
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('contract domain requires a domain id.', publicCommandSpecs['contract domain'], {
            required: ['domain_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          domain: findDomainOrThrow(contracts, domainId),
        });
      },
    }),
    'contract surfaces': cloneCommandSpec(commandSpecs['list-surfaces'], {
      usage: 'opl contract surfaces',
      examples: ['opl contract surfaces'],
      group: 'contract',
    }),
    'contract surface': cloneCommandSpec(commandSpecs['get-surface'], {
      usage: 'opl contract surface <surface_id>',
      examples: ['opl contract surface opl_gateway_contract_hub'],
      group: 'contract',
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('contract surface requires a surface id.', publicCommandSpecs['contract surface'], {
            required: ['surface_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
      },
    }),
    'contract handoff-envelope': cloneCommandSpec(commandSpecs['contract handoff-envelope'], {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
      ],
      group: 'contract',
    }),
    system: systemSpec,
    'system initialize': systemInitializeSpec,
    'system configure-codex': systemConfigureCodexSpec,
    'system repair': systemRepairSpec,
    'system update': systemUpdateSpec,
    'system reconcile-modules': systemReconcileModulesSpec,
    'system update-channel': systemUpdateChannelSpec,
    modules: modulesSpec,
    'module install': moduleInstallSpec,
    'module update': moduleUpdateSpec,
    'module reinstall': moduleReinstallSpec,
    'module remove': moduleRemoveSpec,
    'engine install': engineInstallSpec,
    'engine update': engineUpdateSpec,
    'engine reinstall': engineReinstallSpec,
    'engine remove': engineRemoveSpec,
    'session list': cloneCommandSpec(commandSpecs.sessions, {
      usage: 'opl session list [--limit <n>] [--source <source>]',
      examples: ['opl session list', 'opl session list --limit 10'],
      group: 'session',
    }),
    'session resume': cloneCommandSpec(commandSpecs.resume, {
      usage: 'opl session resume <session_id> [--executor <codex|hermes>]',
      examples: [
        'opl session resume run_7e2a41a19175465f809c0a7f151278ee',
        'opl session resume run_7e2a41a19175465f809c0a7f151278ee --executor hermes',
      ],
      summary: 'Compatibility alias for opl resume; default route is raw codex resume.',
      group: 'session',
    }),
    'session logs': cloneCommandSpec(commandSpecs.logs, {
      usage: 'opl session logs [log_name] [--lines <n>] [--since <cursor>] [--level <level>] [--component <name>] [--session <id>]',
      examples: ['opl session logs gateway', 'opl session logs worker --level info --component runtime'],
      group: 'session',
    }),
    'session runtime': cloneCommandSpec(commandSpecs['session runtime'], {
      usage: 'opl session runtime --acp',
      examples: ['opl session runtime --acp'],
      group: 'session',
    }),
    'session ledger': cloneCommandSpec(commandSpecs['session ledger'], {
      usage: 'opl session ledger [--limit <n>]',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      group: 'session',
    }),
    'runtime repair-gateway': cloneCommandSpec(commandSpecs['runtime repair-gateway'], {
      usage: 'opl runtime repair-gateway',
      examples: ['opl runtime repair-gateway'],
      group: 'runtime',
    }),
    'runtime manager': cloneCommandSpec(commandSpecs['runtime manager'], {
      usage: 'opl runtime manager',
      examples: ['opl runtime manager'],
      group: 'runtime',
    }),
    'runtime manager action': cloneCommandSpec(commandSpecs['runtime manager action'], {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      group: 'runtime',
    }),
    'runtime snapshot': cloneCommandSpec(commandSpecs['runtime snapshot'], {
      usage: 'opl runtime snapshot',
      examples: ['opl runtime snapshot', 'opl runtime snapshot --json'],
      group: 'runtime',
    }),
    'runtime index': cloneCommandSpec(commandSpecs['runtime index'], {
      usage: 'opl runtime index',
      examples: ['opl runtime index'],
      group: 'runtime',
    }),
  };

  return publicCommandSpecs;
}
