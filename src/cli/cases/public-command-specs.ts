import { GatewayContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../contracts.ts';
import { buildFrontDeskEnvironment, buildFrontDeskInitialize, buildFrontDeskModules, runFrontDeskEngineAction, runFrontDeskModuleAction, runFrontDeskSystemAction } from '../../frontdesk-installation.ts';
import { getFrontDeskServiceStatus, installFrontDeskService, openFrontDeskService, startFrontDeskService, stopFrontDeskService, uninstallFrontDeskService } from '../../frontdesk-service.ts';
import type { GatewayContracts } from '../../types.ts';
import { assertNoArgs, buildCommandHelp, buildPublicEngineActionPayload, buildPublicModuleActionPayload, buildPublicModulesPayload, buildPublicServicePayload, buildPublicSystemActionPayload, buildPublicSystemInitializePayload, buildPublicSystemPayload, buildRootHelp, buildUsageError, cloneCommandSpec, parseFrontDeskEngineArgs, parseFrontDeskModuleArgs, parseUpdateChannelArgs, parseWebArgs, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => GatewayContracts,
): Record<string, CommandSpec> {
  const publicCommandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command ...]',
      summary: 'Show the top-level command groups or command-scoped runnable examples.',
      examples: ['opl help', 'opl help status workspace', 'opl help service install'],
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
    doctor: cloneCommandSpec(commandSpecs.doctor, { group: 'top_level' }),
    start: cloneCommandSpec(commandSpecs.start, { group: 'top_level' }),
    'skill list': cloneCommandSpec(commandSpecs['skill-list'], {
      usage: 'opl skill list [--domain <domain_id>]',
      group: 'skill',
    }),
    'skill sync': cloneCommandSpec(commandSpecs['skill-sync'], {
      usage: 'opl skill sync [--domain <domain_id>] [--home <home_path>] [--quiet]',
      group: 'skill',
    }),
	    exec: cloneCommandSpec(commandSpecs.exec, { group: 'top_level' }),
	    resume: cloneCommandSpec(commandSpecs.resume, { group: 'top_level' }),
	    ask: cloneCommandSpec(commandSpecs.ask, { group: 'legacy' }),
	    chat: cloneCommandSpec(commandSpecs.chat, { group: 'legacy' }),
	    shell: cloneCommandSpec(commandSpecs.shell, { group: 'legacy' }),
	    web: cloneCommandSpec(commandSpecs.web, {
      summary: 'Start the local OPL Product API service for external GUI shells and API consumers.',
      group: 'top_level',
    }),
    'web bundle': cloneCommandSpec(commandSpecs['frontdesk hosted-bundle'], {
      usage:
        'opl web bundle [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Emit the hosted-pilot-ready OPL web bundle with base-path-aware entry and API endpoints.',
      examples: [
        'opl web bundle',
        'opl web bundle --host 0.0.0.0 --port 8787 --base-path /pilot/opl',
      ],
      group: 'web',
    }),
    'web package': cloneCommandSpec(commandSpecs['frontdesk hosted-package'], {
      usage:
        'opl web package --output <dir> [--public-origin <origin>] [--host <host>] [--port <port>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Export a self-hostable OPL web package with app snapshot, run script, service unit, and reverse-proxy assets.',
      examples: [
        'opl web package --output /tmp/opl-web-package',
        'opl web package --output /tmp/opl-web-package --public-origin https://opl.example.com',
      ],
      group: 'web',
    }),
    'mcp-stdio': cloneCommandSpec(commandSpecs['mcp-stdio'], { group: 'top_level' }),
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
    system: cloneCommandSpec(commandSpecs['frontdesk environment'], {
      usage: 'opl system',
      summary: 'Show the user-facing OPL system surface: core engines, local service, and managed install paths.',
      examples: ['opl system'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk environment']);
        return buildPublicSystemPayload(await buildFrontDeskEnvironment(getContracts()));
      },
    }),
    'system initialize': cloneCommandSpec(commandSpecs['frontdesk initialize'], {
      usage: 'opl system initialize',
      examples: ['opl system initialize'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk initialize']);
        return buildPublicSystemInitializePayload(await buildFrontDeskInitialize(getContracts()));
      },
    }),
    'system repair': cloneCommandSpec(commandSpecs['frontdesk repair'], {
      usage: 'opl system repair',
      examples: ['opl system repair'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk repair']);
        return buildPublicSystemActionPayload(await runFrontDeskSystemAction(getContracts(), 'repair'));
      },
    }),
    'system reinstall-support': cloneCommandSpec(commandSpecs['frontdesk reinstall-support'], {
      usage:
        'opl system reinstall-support [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      examples: ['opl system reinstall-support', 'opl system reinstall-support --port 8787'],
      group: 'system',
      handler: async (args) =>
        buildPublicSystemActionPayload(
          await runFrontDeskSystemAction(
            getContracts(),
            'reinstall_support',
            parseWebArgs(args, commandSpecs['frontdesk reinstall-support']),
          ),
        ),
    }),
    'system update-channel': cloneCommandSpec(commandSpecs['frontdesk update-channel'], {
      usage: 'opl system update-channel [--channel <stable|preview>]',
      examples: ['opl system update-channel', 'opl system update-channel --channel preview'],
      group: 'system',
      handler: async (args) => {
        const parsed = parseUpdateChannelArgs(args, commandSpecs['frontdesk update-channel']);
        return buildPublicSystemActionPayload(
          await runFrontDeskSystemAction(getContracts(), 'update_channel', parsed),
        );
      },
    }),
    modules: cloneCommandSpec(commandSpecs['frontdesk modules'], {
      usage: 'opl modules',
      examples: ['opl modules'],
      group: 'module',
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk modules']);
        return buildPublicModulesPayload(buildFrontDeskModules());
      },
    }),
    'module install': cloneCommandSpec(commandSpecs['frontdesk-module-install'], {
      usage: 'opl module install --module <module_id>',
      examples: ['opl module install --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('install', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-install']).moduleId!),
        ),
    }),
    'module update': cloneCommandSpec(commandSpecs['frontdesk-module-update'], {
      usage: 'opl module update --module <module_id>',
      examples: ['opl module update --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('update', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-update']).moduleId!),
        ),
    }),
    'module reinstall': cloneCommandSpec(commandSpecs['frontdesk-module-reinstall'], {
      usage: 'opl module reinstall --module <module_id>',
      examples: ['opl module reinstall --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('reinstall', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-reinstall']).moduleId!),
        ),
    }),
    'module remove': cloneCommandSpec(commandSpecs['frontdesk-module-remove'], {
      usage: 'opl module remove --module <module_id>',
      examples: ['opl module remove --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('remove', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-remove']).moduleId!),
        ),
    }),
    'engine install': cloneCommandSpec(commandSpecs['frontdesk engine install'], {
      usage: 'opl engine install --engine <codex|hermes>',
      examples: ['opl engine install --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'install',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine install']).engineId!,
          ),
        ),
    }),
    'engine update': cloneCommandSpec(commandSpecs['frontdesk engine update'], {
      usage: 'opl engine update --engine <codex|hermes>',
      examples: ['opl engine update --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'update',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine update']).engineId!,
          ),
        ),
    }),
    'engine reinstall': cloneCommandSpec(commandSpecs['frontdesk engine reinstall'], {
      usage: 'opl engine reinstall --engine <codex|hermes>',
      examples: ['opl engine reinstall --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'reinstall',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine reinstall']).engineId!,
          ),
        ),
    }),
    'engine remove': cloneCommandSpec(commandSpecs['frontdesk engine remove'], {
      usage: 'opl engine remove --engine <codex|hermes>',
      examples: ['opl engine remove --engine hermes'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'remove',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine remove']).engineId!,
          ),
        ),
    }),
    'service install': cloneCommandSpec(commandSpecs['frontdesk-service-install'], {
      usage:
        'opl service install [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Install and bootstrap a local launchd-managed OPL API service for long-running desktop entry.',
      examples: ['opl service install', 'opl service install --port 8787'],
      group: 'service',
      handler: async (args) =>
        buildPublicServicePayload(
          await installFrontDeskService(getContracts(), parseWebArgs(args, commandSpecs['frontdesk-service-install'])),
        ),
    }),
    'service status': cloneCommandSpec(commandSpecs['frontdesk-service-status'], {
      usage: 'opl service status',
      summary: 'Inspect whether the local OPL API service is installed, loaded, and reachable.',
      examples: ['opl service status'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-status']);
        return buildPublicServicePayload(await getFrontDeskServiceStatus(getContracts()));
      },
    }),
    'service start': cloneCommandSpec(commandSpecs['frontdesk-service-start'], {
      usage: 'opl service start',
      summary: 'Start the installed local OPL API service.',
      examples: ['opl service start'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-start']);
        return buildPublicServicePayload(await startFrontDeskService(getContracts()));
      },
    }),
    'service stop': cloneCommandSpec(commandSpecs['frontdesk-service-stop'], {
      usage: 'opl service stop',
      summary: 'Stop the installed local OPL API service without removing its packaging files.',
      examples: ['opl service stop'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-stop']);
        return buildPublicServicePayload(await stopFrontDeskService(getContracts()));
      },
    }),
    'service open': cloneCommandSpec(commandSpecs['frontdesk-service-open'], {
      usage: 'opl service open',
      summary: 'Open the configured local OPL API URL in the default browser.',
      examples: ['opl service open'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-open']);
        return buildPublicServicePayload(await openFrontDeskService(getContracts()));
      },
    }),
    'service uninstall': cloneCommandSpec(commandSpecs['frontdesk-service-uninstall'], {
      usage: 'opl service uninstall',
      summary: 'Remove the local launchd-managed OPL API service packaging.',
      examples: ['opl service uninstall'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-uninstall']);
        return buildPublicServicePayload(await uninstallFrontDeskService(getContracts()));
      },
    }),
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
  };

  return publicCommandSpecs;
}
