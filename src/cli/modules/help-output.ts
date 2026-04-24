import { buildFrontDeskEnvironment, buildFrontDeskInitialize, buildFrontDeskModules, runFrontDeskEngineAction, runFrontDeskModuleAction, runFrontDeskSystemAction } from '../../frontdesk-installation.ts';
import { getFrontDeskServiceStatus } from '../../frontdesk-service.ts';
import { buildOplApiCatalog } from '../../opl-api-paths.ts';
import type { GatewayContracts, GatewayContractsLoadOptions } from '../../types.ts';
import type { CommandHandler, CommandSpec, ParsedCliInput } from './types.ts';
import { buildUsageError } from './runtime-helpers.ts';

const CODEX_COMMAND_HELP_PASSTHROUGH = new Set([
  'exec',
  'resume',
]);

function looksLikeNaturalLanguage(command: string, args: string[]) {
  if (args.length > 0) {
    return true;
  }

  if (/\s/.test(command)) {
    return true;
  }

  if (/[\u3400-\u9fff]/u.test(command)) {
    return true;
  }

  return /[.,!?;:()[\]{}'"“”‘’]/.test(command);
}

const COMMAND_GROUP_SUMMARIES: Record<string, string> = {
  top_level: '直接产品入口与前台运行入口。',
  web: '导出或查看 GUI/overlay 需要的 Web bundle 与打包资源。',
  status: '读取 family、workspace、runtime 和 dashboard 状态。',
  system: '查看与维护 OPL 的系统状态、初始化和更新通道。',
  engine: '安装、更新与维护执行引擎。',
  module: '安装、更新与维护领域模块。',
  service: '管理本地 OPL API 服务与桌面入口。',
  workspace: '管理项目与 workspace 绑定。',
  domain: '解析域边界、域入口和域 manifest。',
  contract: '读取或验证 machine-readable contract / handoff surface。',
  session: '查看、恢复和审计会话。',
  runtime: '修复或检查底层 runtime 相关入口。',
  legacy: '历史兼容命令。',
};

const RETIRED_COMMAND_PREFIXES = new Set([
  'frontdesk',
  'ask',
  'chat',
  'shell',
]);

const EXPLICIT_AGENT_HANDLE_SPEC = {
  usage:
    'opl @mas|@mag|@rca <request...> [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
  examples: [
    'opl @mas tighten the manuscript argument around invasive phenotype findings --dry-run',
    'opl @rca build a defense-ready deck for next week',
    'opl @mag draft a grant revision response pack --executor hermes',
  ],
} satisfies Pick<CommandSpec, 'usage' | 'examples'>;

function cloneCommandSpec(
  base: CommandSpec,
  overrides: Partial<Omit<CommandSpec, 'handler'>> & { handler?: CommandHandler } = {},
): CommandSpec {
  return {
    ...base,
    ...overrides,
    examples: overrides.examples ?? base.examples,
  };
}

function resolveCommandSpec(
  tokens: string[],
  commands: Record<string, CommandSpec>,
) {
  const prefixLimit = Math.max(
    1,
    tokens.findIndex((token) => token.startsWith('--')) === -1
      ? tokens.length
      : tokens.findIndex((token) => token.startsWith('--')),
  );

  for (let length = prefixLimit; length >= 1; length -= 1) {
    const candidate = tokens.slice(0, length).join(' ');
    const spec = commands[candidate];
    if (spec) {
      return {
        command: candidate,
        spec,
        args: tokens.slice(length),
      };
    }
  }

  return null;
}

function buildRootHelp(commands: Record<string, CommandSpec>) {
  const visibleEntries = Object.entries(commands).filter(([, spec]) => spec.group !== 'legacy');
  const grouped = Object.entries(commands).reduce<Record<string, Array<{
    command: string;
    usage: string;
    summary: string;
    examples: string[];
  }>>>((acc, [command, spec]) => {
    if (spec.group === 'legacy') {
      return acc;
    }
    const groupId = spec.group ?? 'top_level';
    acc[groupId] ??= [];
    acc[groupId].push({
      command,
      usage: spec.usage,
      summary: spec.summary,
      examples: spec.examples,
    });
    return acc;
  }, {});

  return {
    version: 'g2',
    help: {
      command: null,
      usage: 'opl [command ...|request...] [args]',
      global_options: [
        {
          option: '--contracts-dir <path>',
          summary:
            'Use an explicit OPL contract root. When omitted, the CLI resolves from cwd, cwd/contracts/opl-gateway, or the active OPL CLI repo contracts root.',
        },
      ],
      command_groups: Object.entries(grouped).map(([group_id, entries]) => ({
        group_id,
        summary: COMMAND_GROUP_SUMMARIES[group_id] ?? '',
        commands: entries,
      })),
      commands: visibleEntries.map(([command, spec]) => ({
        command,
        usage: spec.usage,
        summary: spec.summary,
        examples: spec.examples,
      })),
      examples: [
        'opl help',
        'opl',
        'opl doctor',
        'opl system',
        'opl system initialize',
        'opl modules',
        'opl module install --module medautoscience',
        'opl engine install --engine codex',
        'opl service install --port 8787',
        'opl web bundle --port 8787 --base-path /pilot/opl',
        'opl web package --output /tmp/opl-web-package --public-origin https://opl.example.com',
        'opl workspace projects',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai"',
        'opl domain launch --project redcube --dry-run',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
        'opl status runtime --limit 10',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
        'opl web --host 127.0.0.1 --port 8787 --base-path /pilot/opl --path /Users/gaofeng/workspace/one-person-lab',
        'opl "Plan a medical grant proposal revision loop."',
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl resume --last',
        'opl @rca build a defense-ready slide deck for a thesis committee.',
        'opl @mag draft a grant revision response pack --dry-run',
        'opl contract validate',
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
      ],
    },
  };
}

function buildCommandHelp(command: string, spec: CommandSpec) {
  return {
    version: 'g2',
    help: {
      command,
      usage: spec.usage,
      summary: spec.summary,
      examples: spec.examples,
    },
  };
}

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function withContractsContext<T extends Record<string, unknown>>(
  contracts: GatewayContracts,
  payload: T,
) {
  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...payload,
  };
}

function buildPublicSystemPayload(
  payload: Awaited<ReturnType<typeof buildFrontDeskEnvironment>>,
) {
  return {
    version: payload.version,
    system: buildPublicSystemFromFrontDeskEnvironment(payload.frontdesk_environment),
  };
}

function buildPublicSystemFromFrontDeskEnvironment(
  environment: Awaited<ReturnType<typeof buildFrontDeskEnvironment>>['frontdesk_environment'],
) {
  return {
    surface_id: 'opl_system',
    overall_status: environment.overall_status,
    core_engines: environment.core_engines,
    local_service: environment.local_frontdesk,
    module_summary: environment.module_summary,
    managed_paths: environment.managed_paths,
    notes: environment.notes,
  };
}

function buildPublicSystemInitializePayload(
  payload: Awaited<ReturnType<typeof buildFrontDeskInitialize>>,
) {
  const api = buildOplApiCatalog();
  const domainModules = payload.frontdesk_initialize.domain_modules;
  const recommendedNextActionEndpoint =
    payload.frontdesk_initialize.recommended_next_action.action_id === 'set_workspace_root'
      ? api.actions.workspace_root
      : api.actions.system_initialize;
  return {
    version: payload.version,
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: payload.frontdesk_initialize.overall_state,
      checklist: payload.frontdesk_initialize.checklist,
      core_engines: payload.frontdesk_initialize.core_engines,
      domain_modules: {
        surface_id: 'opl_modules',
        modules_root: domainModules.modules_root,
        summary: domainModules.summary,
        modules: domainModules.modules,
        notes: domainModules.notes,
      },
      settings: {
        ...payload.frontdesk_initialize.settings,
        endpoint: api.actions.system_settings,
        action_endpoint: api.actions.system_settings,
      },
      workspace_root: {
        ...payload.frontdesk_initialize.workspace_root,
        endpoint: api.actions.workspace_root,
        action_endpoint: api.actions.workspace_root,
      },
      system: {
        update_channel: payload.frontdesk_initialize.system.update_channel,
        local_service: payload.frontdesk_initialize.system.local_frontdesk,
        actions: payload.frontdesk_initialize.system.actions.map((entry) => ({
          ...entry,
          endpoint: api.actions.system,
        })),
      },
      endpoints: {
        system_initialize: api.actions.system_initialize,
        system: api.resources.system,
        modules: api.resources.modules,
        settings: api.actions.system_settings,
        engine_action: api.actions.engines,
        workspace_root: api.actions.workspace_root,
        system_action: api.actions.system,
      },
      recommended_next_action: {
        ...payload.frontdesk_initialize.recommended_next_action,
        endpoint: recommendedNextActionEndpoint,
      },
      notes: payload.frontdesk_initialize.notes,
    },
  };
}

function buildPublicModulesPayload(
  payload: ReturnType<typeof buildFrontDeskModules>,
) {
  return {
    version: payload.version,
    modules: {
      surface_id: 'opl_modules',
      modules_root: payload.frontdesk_modules.modules_root,
      summary: payload.frontdesk_modules.summary,
      items: payload.frontdesk_modules.modules,
      notes: payload.frontdesk_modules.notes,
    },
  };
}

function buildPublicModuleActionPayload(
  payload: ReturnType<typeof runFrontDeskModuleAction>,
) {
  return {
    version: payload.version,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.frontdesk_module_action,
    },
  };
}

function buildPublicEngineActionPayload(
  payload: Awaited<ReturnType<typeof runFrontDeskEngineAction>>,
) {
  const { frontdesk_environment: environment, ...action } = payload.frontdesk_engine_action;

  return {
    version: payload.version,
    engine_action: {
      surface_id: 'opl_engine_action',
      ...action,
      system: buildPublicSystemFromFrontDeskEnvironment(environment),
    },
  };
}

function buildPublicSystemActionPayload(
  payload: Awaited<ReturnType<typeof runFrontDeskSystemAction>>,
) {
  return {
    version: payload.version,
    system_action: {
      surface_id: 'opl_system_action',
      ...payload.frontdesk_system_action,
    },
  };
}

function buildPublicServicePayload(
  payload: Awaited<ReturnType<typeof getFrontDeskServiceStatus>>,
) {
  return {
    version: payload.version,
    service: {
      surface_id: 'opl_service',
      ...payload.frontdesk_service,
    },
  };
}

function parseCliInput(argv: string[]): ParsedCliInput {
  const args = [...argv];
  const loadOptions: GatewayContractsLoadOptions = {};
  let helpRequested = false;

  while (args[0]?.startsWith('--')) {
    const token = args[0];

    if (token === '--help') {
      helpRequested = true;
      args.shift();
      continue;
    }

    if (token === '--contracts-dir') {
      args.shift();
      const contractsDir = args.shift();

      if (!contractsDir || contractsDir.startsWith('--')) {
        throw buildUsageError(
          'Global option --contracts-dir requires an explicit contract root path.',
          {
            usage: 'opl [--contracts-dir <path>] <command> [args]',
            examples: [
              'opl --contracts-dir /path/to/contracts/opl-gateway validate-contracts',
              'opl --contracts-dir /path/to/contracts/opl-gateway get-domain redcube',
            ],
          },
          { option: '--contracts-dir' },
        );
      }

      loadOptions.contractsDir = contractsDir;
      loadOptions.source = 'cli_flag';
      continue;
    }

    break;
  }

  return {
    helpRequested,
    command: args.shift() ?? null,
    args,
    loadOptions: loadOptions.contractsDir ? loadOptions : undefined,
  };
}

export {
  CODEX_COMMAND_HELP_PASSTHROUGH,
  COMMAND_GROUP_SUMMARIES,
  EXPLICIT_AGENT_HANDLE_SPEC,
  RETIRED_COMMAND_PREFIXES,
  buildCommandHelp,
  buildContractsContext,
  buildPublicEngineActionPayload,
  buildPublicModuleActionPayload,
  buildPublicModulesPayload,
  buildPublicServicePayload,
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
  buildRootHelp,
  cloneCommandSpec,
  looksLikeNaturalLanguage,
  parseCliInput,
  resolveCommandSpec,
  withContractsContext,
};
