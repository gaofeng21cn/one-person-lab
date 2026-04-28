import { GatewayContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow, validateGatewayContracts } from '../../contracts.ts';
import { buildFrontDeskWorkspaceRootSurface, writeFrontDeskWorkspaceRootSurface } from '../../frontdesk-installation.ts';
import { buildProductEntryDoctor, buildProductEntryHandoffEnvelope, runProductEntryLogs, runProductEntryRepairHermesGateway, runProductEntryResume, runProductEntrySessions } from '../../product-entry.ts';
import { buildRuntimeManager, runRuntimeManagerAction } from '../../runtime-manager.ts';
import { buildNativeIndexSummary } from '../../native-index-summary.ts';
import { launchDomainEntry } from '../../domain-launch.ts';
import { buildDomainManifestCatalog } from '../../domain-manifest.ts';
import { buildFrontDeskDashboard, buildFrontDeskStart, buildProjectsOverview, buildRuntimeStatus, buildWorkspaceStatus } from '../../management/index.ts';
import { runAcpStdioBridge } from '../../opl-acp-stdio.ts';
import { syncOplCompanionSkills } from '../../install-companions.ts';
import { readFamilySkillPacks, syncFamilySkillPacks } from '../../opl-skills.ts';
import { buildSessionLedger } from '../../session-ledger.ts';
import { explainDomainBoundary, resolveRequestSurface } from '../../resolver.ts';
import { activateWorkspaceBinding, archiveWorkspaceBinding, bindWorkspace, buildWorkspaceCatalog } from '../../workspace-registry.ts';
import type { GatewayContracts } from '../../types.ts';
import { assertNoArgs, buildCommandHelp, buildRetiredCommandError, buildRootHelp, buildUsageError, hasExplicitHermesExecutor, parseDashboardArgs, parseKeyValueArgs, parseLaunchDomainArgs, parseLogsArgs, parseProductEntryArgs, parseResumeArgs, parseRuntimeManagerActionArgs, parseRuntimeStatusArgs, parseSessionLedgerArgs, parseSessionRuntimeArgs, parseSessionsArgs, parseSkillPackArgs, parseStartArgs, parseWorkspaceRegistryArgs, parseWorkspaceRootArgs, parseWorkspaceStatusArgs, printJson, runCodexPassthroughHandled, stripExplicitCodexExecutor, withContractsContext } from '../modules/support.ts';
import type { CommandSpec, ParsedCliInput } from '../modules/support.ts';

export function buildInternalCommandSpecs(
  parsedInput: ParsedCliInput,
  getContracts: () => GatewayContracts,
): Record<string, CommandSpec> {
  const buildRetiredFrontDeskSpec = (
    command: string,
    replacement: string,
    examples: string[],
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage: `opl ${command}`,
      summary: 'Retired historical frontdesk compatibility command.',
      examples,
      group: 'legacy',
      handler: () => {
        throw buildRetiredCommandError(`opl ${command}`, replacement, spec);
      },
    };
    return spec;
  };

  const commandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command]',
      summary: 'Show the top-level command surface or command-scoped runnable examples.',
      examples: ['opl help', 'opl help get-domain'],
      handler: (args) => {
        const [helpTarget, ...extraArgs] = args;
        if (extraArgs.length > 0) {
          throw buildUsageError(
            'help accepts at most one optional command name.',
            commandSpecs.help,
            { command: helpTarget },
          );
        }

        if (!helpTarget) {
          return buildRootHelp(commandSpecs);
        }

        const helpSpec = commandSpecs[helpTarget];
        if (!helpSpec) {
          throw new GatewayContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(commandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    'list-workstreams': {
      usage: 'opl list-workstreams',
      summary: 'List admitted OPL workstream summaries.',
      examples: ['opl list-workstreams'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstreams: contracts.workstreams.workstreams.map((workstream) => ({
            workstream_id: workstream.workstream_id,
            label: workstream.label,
            status: workstream.status,
            domain_id: workstream.domain_id,
          })),
        });
      },
    },
    'get-workstream': {
      usage: 'opl get-workstream <workstream_id>',
      summary: 'Show the full registered meaning for one workstream.',
      examples: ['opl get-workstream research_ops', 'opl get-workstream presentation_ops'],
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('get-workstream requires a workstream id.', commandSpecs['get-workstream'], {
            required: ['workstream_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstream: findWorkstreamOrThrow(contracts, workstreamId),
        });
      },
    },
    'list-domains': {
      usage: 'opl list-domains',
      summary: 'List admitted domain-agent summaries from the legacy gateway contract registry.',
      examples: ['opl list-domains'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          domains: contracts.domains.domains.map((domain) => ({
            domain_id: domain.domain_id,
            gateway_surface: domain.gateway_surface,
            owned_workstreams: domain.owned_workstreams,
          })),
        });
      },
    },
    'get-domain': {
      usage: 'opl get-domain <domain_id>',
      summary: 'Show the full registered meaning for one admitted domain agent.',
      examples: ['opl get-domain medautoscience', 'opl get-domain redcube'],
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('get-domain requires a domain id.', commandSpecs['get-domain'], {
            required: ['domain_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          domain: findDomainOrThrow(contracts, domainId),
        });
      },
    },
    'list-surfaces': {
      usage: 'opl list-surfaces',
      summary: 'List public gateway surface summaries.',
      examples: ['opl list-surfaces'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          surfaces: contracts.publicSurfaceIndex.surfaces.map((surface) => ({
            surface_id: surface.surface_id,
            category_id: surface.category_id,
            surface_kind: surface.surface_kind,
            owner_scope: surface.owner_scope,
          })),
        });
      },
    },
    'get-surface': {
      usage: 'opl get-surface <surface_id>',
      summary: 'Show the full registered meaning for one public surface.',
      examples: ['opl get-surface opl_gateway_contract_hub'],
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('get-surface requires a surface id.', commandSpecs['get-surface'], {
            required: ['surface_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
      },
    },
    'validate-contracts': {
      usage: 'opl validate-contracts',
      summary: 'Validate the required OPL gateway contract set and emit a machine-readable summary.',
      examples: ['opl validate-contracts'],
      handler: () => ({
        version: 'g2',
        validation: validateGatewayContracts(parsedInput.loadOptions),
      }),
    },
    doctor: {
      usage: 'opl doctor',
      summary:
        'Check whether the local OPL product-entry shell and Hermes kernel are ready for direct use.',
      examples: ['opl doctor', 'OPL_HERMES_BIN=/path/to/hermes opl doctor'],
      handler: () => {
        const validation = validateGatewayContracts(parsedInput.loadOptions);
        return buildProductEntryDoctor(validation);
      },
    },
    projects: {
      usage: 'opl projects',
      summary: 'List the current OPL family project surfaces and their admitted workstreams.',
      examples: ['opl projects'],
      handler: () => buildProjectsOverview(getContracts()),
    },
    'status workspace': {
      usage: 'opl status workspace [--path <workspace_path>]',
      summary: 'Inspect one workspace path for git/worktree state and file-surface visibility.',
      examples: [
        'opl status workspace',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) => buildWorkspaceStatus(parseWorkspaceStatusArgs(args, commandSpecs['status workspace'])),
    },
    'status runtime': {
      usage: 'opl status runtime [--limit <n>]',
      summary: 'Show Hermes runtime health, recent sessions, and runtime-level process resource usage.',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      handler: (args) => {
        const parsed = parseRuntimeStatusArgs(args, commandSpecs['status runtime']);
        return buildRuntimeStatus({ sessionsLimit: parsed.limit });
      },
    },
    'runtime manager': {
      usage: 'opl runtime manager',
      summary:
        'Show the OPL Runtime Manager boundary over the external Hermes runtime substrate.',
      examples: ['opl runtime manager'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime manager']);
        return buildRuntimeManager();
      },
    },
    'runtime manager action': {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      summary:
        'Plan or apply Runtime Manager adapter actions without making OPL a scheduler or domain truth owner.',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      handler: (args) => runRuntimeManagerAction(
        parseRuntimeManagerActionArgs(args, commandSpecs['runtime manager action']),
      ),
    },
    'runtime index': {
      usage: 'opl runtime index',
      summary:
        'Explain the persisted native helper state index without rescanning workspaces or owning domain truth.',
      examples: ['opl runtime index'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime index']);
        return buildNativeIndexSummary();
      },
    },
    dashboard: {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL product-runtime view across projects, workspace, and runtime.',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: (args) => buildFrontDeskDashboard(getContracts(), parseDashboardArgs(args, commandSpecs.dashboard)),
    },
    start: {
      usage: 'opl start --project <project_id> [--mode <mode_id>]',
      summary: 'Select one resolved domain start surface and emit the exact next entry mode OPL recommends.',
      examples: [
        'opl start --project redcube',
        'opl start --project med-autogrant --mode build_direct_entry',
      ],
      handler: (args) => {
        const parsed = parseStartArgs(args, commandSpecs.start);
        if (!parsed.projectId) {
          throw buildUsageError(
            'start requires --project.',
            commandSpecs.start,
            { required: ['--project'] },
          );
        }

        return buildFrontDeskStart(getContracts(), {
          projectId: parsed.projectId,
          modeId: parsed.modeId,
        });
      },
    },
    'skill-list': {
      usage: 'opl skill list [--domain <domain_id>]',
      summary: 'Inspect the family domain plugin packs that OPL can register into the local Codex environment.',
      examples: [
        'opl skill list',
        'opl skill list --domain medautoscience',
        'opl skill list --domain rca',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-list']);
        return readFamilySkillPacks({ domains: parsed.domains });
      },
    },
    'skill-sync': {
      usage: 'opl skill sync [--domain <domain_id>] [--home <home_path>] [--quiet]',
      summary: 'Register the family domain plugin packs into the local Codex environment without changing the default Codex runtime semantics.',
      examples: [
        'opl skill sync',
        'opl skill sync --domain medautoscience',
        'opl skill sync --home /tmp/codex-home',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-sync']);
        return syncFamilySkillPacks({
          domains: parsed.domains,
          home: parsed.home,
          companionMode: parsed.companionMode,
          superpowersProfile: parsed.superpowersProfile,
        });
      },
    },
    'skill-companion-status': {
      usage: 'opl skill companion status [--home <home_path>] [--superpowers <keep|lite|full>]',
      summary: 'Inspect the OPL recommended companion skill ecosystem without changing user skill configuration.',
      examples: [
        'opl skill companion status',
        'opl skill companion status --superpowers lite',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-status']);
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode: 'observe',
            superpowersProfile: parsed.superpowersProfile ?? 'keep',
          }),
        };
      },
    },
    'skill-companion-apply': {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>] [--superpowers <keep|lite|full>]',
      summary: 'Apply OPL companion skill recommendations only when the user or OPL-managed profile explicitly permits it.',
      examples: [
        'opl skill companion apply --mode managed --superpowers keep',
        'opl skill companion apply --mode managed --superpowers lite',
        'opl skill companion apply --mode managed --superpowers full',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-apply']);
        const mode = parsed.companionMode ?? 'ask_to_apply';
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode,
            superpowersProfile: parsed.superpowersProfile ?? 'keep',
          }),
        };
      },
    },
    'domain launch': {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      summary:
        'Invoke one already-bound domain direct-entry locator without upgrading OPL into runtime ownership.',
      examples: [
        'opl domain launch --project redcube --dry-run',
        'opl domain launch --project redcube --strategy open_url',
        'opl domain launch --project med-autogrant --path /Users/gaofeng/workspace/med-autogrant --strategy spawn_command',
      ],
      handler: (args) => {
        const parsed = parseLaunchDomainArgs(args, commandSpecs['domain launch']);
        if (!parsed.projectId) {
          throw buildUsageError(
            'domain launch requires --project.',
            commandSpecs['domain launch'],
            { required: ['--project'] },
          );
        }

        return launchDomainEntry(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          strategy: parsed.strategy,
          dryRun: parsed.dryRun,
        });
      },
    },
    'domain manifests': {
      usage: 'opl domain manifests',
      summary:
        'Resolve the active admitted-domain manifest_command bindings into machine-readable product-entry discovery surfaces.',
      examples: ['opl domain manifests'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['domain manifests']);
        return buildDomainManifestCatalog(getContracts());
      },
    },
    'frontdesk environment': {
      usage: 'opl frontdesk environment',
      summary: 'Retired historical frontdesk compatibility command.',
      examples: ['opl frontdesk environment'],
      group: 'legacy',
      handler: () => {
        throw buildRetiredCommandError(
          'opl frontdesk environment',
          'Use `opl system` for the current Codex-default system surface.',
          commandSpecs['frontdesk environment'],
        );
      },
    },
    'frontdesk initialize': {
      usage: 'opl frontdesk initialize',
      summary: 'Retired historical frontdesk compatibility command.',
      examples: ['opl frontdesk initialize'],
      group: 'legacy',
      handler: () => {
        throw buildRetiredCommandError(
          'opl frontdesk initialize',
          'Use `opl system initialize` for the current first-run setup surface.',
          commandSpecs['frontdesk initialize'],
        );
      },
    },
    'frontdesk modules': {
      usage: 'opl frontdesk modules',
      summary: 'Retired historical frontdesk compatibility command.',
      examples: ['opl frontdesk modules'],
      group: 'legacy',
      handler: () => {
        throw buildRetiredCommandError(
          'opl frontdesk modules',
          'Use `opl modules` for the current module inventory surface.',
          commandSpecs['frontdesk modules'],
        );
      },
    },
    'frontdesk-module-install': buildRetiredFrontDeskSpec(
      'frontdesk module install --module <module_id>',
      'Use `opl module install --module <module_id>` for current module installation.',
      ['opl frontdesk module install --module medautoscience'],
    ),
    'frontdesk-module-update': buildRetiredFrontDeskSpec(
      'frontdesk module update --module <module_id>',
      'Use `opl module update --module <module_id>` for current module updates.',
      ['opl frontdesk module update --module medautoscience'],
    ),
    'frontdesk-module-reinstall': buildRetiredFrontDeskSpec(
      'frontdesk module reinstall --module <module_id>',
      'Use `opl module reinstall --module <module_id>` for current module reinstalls.',
      ['opl frontdesk module reinstall --module medautoscience'],
    ),
    'frontdesk-module-remove': buildRetiredFrontDeskSpec(
      'frontdesk module remove --module <module_id>',
      'Use `opl module remove --module <module_id>` for current module removal.',
      ['opl frontdesk module remove --module medautoscience'],
    ),
    'frontdesk engine install': buildRetiredFrontDeskSpec(
      'frontdesk engine install --engine <codex|hermes>',
      'Use `opl engine install --engine <codex|hermes>` for current engine installation.',
      ['opl frontdesk engine install --engine codex'],
    ),
    'frontdesk engine update': buildRetiredFrontDeskSpec(
      'frontdesk engine update --engine <codex|hermes>',
      'Use `opl engine update --engine <codex|hermes>` for current engine updates.',
      ['opl frontdesk engine update --engine codex'],
    ),
    'frontdesk engine reinstall': buildRetiredFrontDeskSpec(
      'frontdesk engine reinstall --engine <codex|hermes>',
      'Use `opl engine reinstall --engine <codex|hermes>` for current engine reinstalls.',
      ['opl frontdesk engine reinstall --engine codex'],
    ),
    'frontdesk engine remove': buildRetiredFrontDeskSpec(
      'frontdesk engine remove --engine <codex|hermes>',
      'Use `opl engine remove --engine <codex|hermes>` for current engine removal.',
      ['opl frontdesk engine remove --engine hermes'],
    ),
    'frontdesk repair': {
      usage: 'opl frontdesk repair',
      summary: 'Retired historical frontdesk compatibility command.',
      examples: ['opl frontdesk repair'],
      group: 'legacy',
      handler: () => {
        throw buildRetiredCommandError(
          'opl frontdesk repair',
          'Use `opl system repair` for the current system repair surface.',
          commandSpecs['frontdesk repair'],
        );
      },
    },
    'mcp-stdio': {
      usage: 'opl mcp-stdio',
      summary: 'Retired Product API MCP bridge command.',
      examples: ['opl mcp-stdio'],
      handler: () => buildRetiredCommandError('mcp-stdio', 'Product API MCP bridge is retired; use the OPL GUI / AionUI WebUI path instead.'),
    },
    web: {
      usage: 'opl web',
      summary: 'Retired local Product API web server command.',
      examples: ['opl web'],
      handler: () => buildRetiredCommandError('web', 'Local Product API web server is retired; use the OPL GUI / AionUI WebUI path instead.'),
    },
    'session runtime': {
      usage: 'opl session runtime --acp',
      summary: 'Run the minimal OPL ACP stdio bridge entry for external shells.',
      examples: [
        'opl session runtime --acp',
      ],
      handler: async (args) => {
        const parsed = parseSessionRuntimeArgs(args, commandSpecs['session runtime']);
        if (!parsed.acp) {
          throw buildUsageError(
            'session runtime currently requires --acp.',
            commandSpecs['session runtime'],
            { required: ['--acp'] },
          );
        }

        await runAcpStdioBridge();
        return {
          __handled: true as const,
        };
      },
    },
    ask: {
  usage:
    'opl ask <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
  summary:
    'Retired compatibility command.',
  examples: [
    'opl exec "Summarize current workspace status."',
    'opl skill sync',
    'opl exec "Prepare a defense-ready deck for next week."',
  ],
  handler: () => {
    throw buildRetiredCommandError(
      'opl ask',
      'Use `opl exec <request...>` for raw Codex one-shot work. If you need MAS/MAG/RCA inside Codex, run `opl skill sync` first and continue through `opl` or `opl exec`.'
    );
  },
},
exec: {
  usage:
    'opl exec [codex exec args...]',
  summary:
    'Run codex exec as a raw passthrough.',
  examples: [
    'opl exec "Plan a medical grant proposal revision loop."',
    'opl exec --cd /Users/gaofeng/workspace/redcube-ai "Prepare a defense-ready slide deck for a thesis committee."',
    'opl exec --model gpt-5.4 "Summarize current workspace status."',
  ],
  handler: (args) => runCodexPassthroughHandled(['exec', ...args]),
},
chat: {
  usage:
    'opl chat <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
  summary:
    'Retired compatibility command.',
  examples: [
    'opl',
    'opl resume run_7e2a41a19175465f809c0a7f151278ee',
    'opl skill sync',
  ],
  handler: () => {
    throw buildRetiredCommandError(
      'opl chat',
      'Use `opl` for the default Codex interactive session, `opl resume <session_id>` to continue a session, and `opl skill sync` when you want the family domain skill packs available inside Codex.'
    );
  },
},
shell: {
  usage:
    'opl shell [<request...> | --resume <session_id>] [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
  summary:
    'Retired compatibility command.',
  examples: [
    'opl',
    'opl resume run_7e2a41a19175465f809c0a7f151278ee',
    'opl skill sync',
  ],
  handler: () => {
    throw buildRetiredCommandError(
      'opl shell',
      'Use `opl` for the default Codex frontdoor, `opl resume <session_id>` to continue a session, and `opl skill sync` to register the family domain skill packs.'
    );
  },
},
resume: {
  usage: 'opl resume [codex resume args...] [--executor hermes]',
  summary: 'Resume a Codex session as a raw passthrough; use --executor hermes for explicit Hermes sessions.',
  examples: [
    'opl resume run_7e2a41a19175465f809c0a7f151278ee',
    'opl resume --last',
    'opl resume run_7e2a41a19175465f809c0a7f151278ee --executor hermes',
  ],
  handler: (args) => {
    if (!hasExplicitHermesExecutor(args)) {
      return runCodexPassthroughHandled(['resume', ...stripExplicitCodexExecutor(args)]);
    }

    const parsed = parseResumeArgs(args, commandSpecs.resume);
    return runProductEntryResume(parsed.sessionId, parsed.executor);
  },
},
    sessions: {
      usage: 'opl session list [--limit <n>] [--source <source>]',
      summary: 'List recent Hermes sessions through a machine-readable OPL product-entry surface.',
      examples: ['opl session list', 'opl session list --limit 10', 'opl session list --limit 10 --source api_server'],
      handler: (args) => runProductEntrySessions(parseSessionsArgs(args, commandSpecs.sessions)),
    },
    logs: {
      usage: 'opl session logs [log_name] [--lines <n>] [--since <cursor>] [--level <level>] [--component <name>] [--session <id>]',
      summary: 'Wrap Hermes log access in an OPL product-entry envelope for debugging and operations.',
      examples: ['opl session logs gateway', 'opl session logs gateway --lines 50', 'opl session logs worker --level info --component runtime'],
      handler: (args) => runProductEntryLogs(parseLogsArgs(args, commandSpecs.logs)),
    },
    'workspace list': {
      usage: 'opl workspace list',
      summary: 'Show the file-backed workspace registry for OPL and admitted domain project surfaces.',
      examples: ['opl workspace list'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace list']);
        return buildWorkspaceCatalog(getContracts());
      },
    },
    'workspace root': {
      usage: 'opl workspace root',
      summary: 'Show the current OPL workspace root preference and its readiness state.',
      examples: ['opl workspace root'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root']);
        return buildFrontDeskWorkspaceRootSurface();
      },
    },
    'workspace root set': {
      usage: 'opl workspace root set --path <workspace_root>',
      summary: 'Persist the selected OPL workspace root for Initialize and GUI settings surfaces.',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      handler: (args) => {
        const parsed = parseWorkspaceRootArgs(args, commandSpecs['workspace root set']);
        if (!parsed.path) {
          throw buildUsageError(
            'workspace root set requires --path.',
            commandSpecs['workspace root set'],
            { required: ['--path'] },
          );
        }

        return writeFrontDeskWorkspaceRootSurface(parsed.path);
      },
    },
    'workspace root doctor': {
      usage: 'opl workspace root doctor',
      summary: 'Re-read the current workspace root selection and report its health surface.',
      examples: ['opl workspace root doctor'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root doctor']);
        return buildFrontDeskWorkspaceRootSurface();
      },
    },
    'workspace-bind': {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      summary:
        'Bind and activate one workspace for an admitted project, optionally freezing or deriving its direct-entry locator.',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai" --entry-url http://127.0.0.1:3310/redcube',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
        'opl workspace bind --project medautogrant --path /Users/gaofeng/workspace/med-autogrant --input /Users/gaofeng/workspace/med-autogrant/examples/nsfc_workspace_p2c_critique.json',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-bind']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace bind requires both --project and --path.',
            commandSpecs['workspace-bind'],
            { required: ['--project', '--path'] },
          );
        }

        return bindWorkspace(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          label: parsed.label,
          entryCommand: parsed.entryCommand,
          manifestCommand: parsed.manifestCommand,
          entryUrl: parsed.entryUrl,
          workspaceRoot: parsed.workspaceRoot,
          profileRef: parsed.profileRef,
          inputPath: parsed.inputPath,
        });
      },
    },
    'workspace-activate': {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      summary: 'Switch the active workspace binding for an admitted project.',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-activate']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace activate requires both --project and --path.',
            commandSpecs['workspace-activate'],
            { required: ['--project', '--path'] },
          );
        }

        return activateWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace-archive': {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      summary: 'Archive one workspace binding so OPL no longer treats it as active or reusable.',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-archive']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace archive requires both --project and --path.',
            commandSpecs['workspace-archive'],
            { required: ['--project', '--path'] },
          );
        }

        return archiveWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'session ledger': {
      usage: 'opl session ledger [--limit <n>]',
      summary: 'Show OPL-managed session events with honest resource samples captured at event time.',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      handler: (args) => {
        const parsed = parseSessionLedgerArgs(args, commandSpecs['session ledger']);
        return buildSessionLedger(parsed.limit);
      },
    },
    'runtime repair-gateway': {
      usage: 'opl runtime repair-gateway',
      summary: 'Reinstall and recheck the Hermes gateway service used by the OPL product shell.',
      examples: ['opl runtime repair-gateway'],
      handler: () => runProductEntryRepairHermesGateway(),
    },
    'domain resolve-request': {
      usage: 'opl domain resolve-request --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Resolve a top-level request to an admitted workstream, domain boundary, or ambiguity envelope.',
      examples: [
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          resolution: resolveRequestSurface(
            parseKeyValueArgs(args, commandSpecs['domain resolve-request']),
            contracts,
          ),
        });
      },
    },
    'domain explain-boundary': {
      usage: 'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Explain why a request routes to a domain, stays under definition, or stops at a family boundary.',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
        'opl domain explain-boundary --intent create --target deliverable --goal "Grant proposal reviewer simulation and revision planning."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          boundary_explanation: explainDomainBoundary(
            parseKeyValueArgs(args, commandSpecs['domain explain-boundary']),
            contracts,
          ),
        });
      },
    },
    'contract handoff-envelope': {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      summary:
        'Build a machine-readable OPL family handoff bundle for the current request and active workspace bindings.',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) =>
        buildProductEntryHandoffEnvelope(
          parseProductEntryArgs(args, commandSpecs['contract handoff-envelope']),
          getContracts(),
        ),
    },
  };

  return commandSpecs;
}
