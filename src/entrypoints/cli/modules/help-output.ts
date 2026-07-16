import type { FrameworkContracts, FrameworkContractsLoadOptions } from '../../../kernel/types.ts';
import type { CommandHandler, CommandSpec, ParsedCliInput } from './types.ts';
import { buildUsageError } from './cli-errors.ts';

const CODEX_COMMAND_HELP_PASSTHROUGH = new Set([
  'exec',
  'resume',
]);

const ROOT_HELP_DIAGNOSTIC_GROUPS = new Set([
  'contract',
  'capability-pack',
  'domain',
  'engine',
  'framework',
  'module',
  'package',
  'quality',
  'runtime',
  'session',
  'skill',
  'status',
  'system',
]);

function looksLikeNaturalLanguage(command: string, args: string[]) {
  if (args.length > 0) {
    const joined = [command, ...args].join(' ');
    if (/[\u3400-\u9fff]/u.test(joined) || /[.,!?;:()[\]{}'"“”‘’]/.test(joined)) {
      return true;
    }
    if (/^[A-Z]/.test(command)) return true;
    return args.length >= 2 && !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(command);
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
  app: '读取 One Person Lab App 页面状态并执行 App 级安全动作。',
  brand: '读取 OPL 品牌模块的合同、成熟度、接口和 false-authority 边界。',
  'brand-charter': '治理 OPL Charter 的模块级对象模型、authority、术语和验收 surface。',
  'brand-atlas': '读取 OPL Atlas 的 catalog、descriptor、graph、lifecycle 和验收 surface。',
  'brand-pack': '读取 OPL Pack 的 Domain Pack、Pack OS lifecycle、authority ABI、generated surface 和验收 surface。',
  'brand-stagecraft': '读取 OPL Stagecraft 的 stage grammar、StageRun、receipt/blocker 和验收 surface。',
  'brand-runway': '读取 OPL Runway 的 runtime provider、stage-attempt projection、attempt、lease 和验收 surface。',
  'brand-ledger': '读取 OPL Ledger 的 evidence、receipt、lineage、state-index 和验收 surface。',
  'brand-console': '读取 OPL Console 的 App/operator read-model、safe action 和验收 surface。',
  'brand-foundry': '读取 OPL Foundry Kernel 的协议、FoundryRun、版本、激活和回滚 surface。',
  'brand-connect': '读取 OPL Connect 的 descriptor、package/install、skill sync 和验收 surface。',
  'capability-pack': '通用 capability-pack descriptor、安装、锁定与 provenance 入口。',
  framework: '定位和解释 OPL Framework 自身的运行依赖环境。',
  pack: '读取 Declarative Domain Pack、Pack OS lock/lifecycle、authority ABI、pack compiler 和 generated surface 边界读面。',
  stagecraft: '读取 stage 设计、认知计算、tool affordance 与 quality-gate 边界读面。',
  runway: '读取 durable execution、stage-attempt request/projection、attempt、provider 和 runtime blocker 读面。',
  ledger: '读取 evidence、receipt、typed blocker、artifact lineage 和 refs-only ledger 读面。',
  console: '读取 App/operator console、current owner、next action 和 drilldown 读面。',
  foundry: '读取 OPL FoundryRun、版本、Owner gate、canary、激活与回滚控制面。',
  connect: '读取 CLI、MCP、tools、skill/plugin、module install 与分发连接读面。',
  env: '准备和消费默认 Fast Local Env 的 R/Python 依赖环境。',
  skill: '同步 family domain plugin，并查看当前 Codex skill pack 安装状态。',
  status: '读取 family、workspace、runtime 和 dashboard 状态。',
  system: '查看与维护 OPL 的系统状态、初始化和更新通道。',
  update: '读取和执行 OPL 受管组件更新状态、计划、回执和修复动作。',
  engine: '安装、更新与维护执行引擎。',
  module: '安装、更新与维护领域模块。',
  package: '查看 OPL release / Packages 的机器消费 manifest。',
  quality: '生成 Sentrux Free 旁路质量诊断，帮助 Agent 定位函数、文件、依赖、测试缺口和 rules 细节。',
  workspace: '管理项目与 workspace 绑定。',
  domain: '解析域边界、域入口和域 manifest。',
  contract: '读取或验证 machine-readable contract / handoff surface。',
  session: '查看、恢复和审计会话。',
  runtime: '修复或检查底层 runtime 相关入口。',
  'family-runtime': '管理 Temporal-backed family runtime stage attempt、provider readback、notification 与事件。',
  index: '维护 OPL-owned SQLite sidecar indexes，不替代文件真相或 domain authority。',
};

const NON_PASSTHROUGH_COMMAND_PREFIXES = new Set([
  ['front', 'door'].join(''),
  ['front', 'desk'].join(''),
  'app',
  'agent-lab',
  'agents',
  'ask',
  'atlas',
  'brand-modules',
  'capability-pack',
  'charter',
  'chat',
  'connect',
  'env',
  'console',
  'framework',
  'feedback',
  'foundry',
  'foundry-lab',
  'index',
  'module',
  'modules',
  'pack',
  'packages',
  'runtime',
  'runway',
  'vault',
  'scholar-skills',
  'service',
  'session',
  'shell',
  'skill',
  'stagecraft',
  'update',
  'ledger',
  'web',
  'workspace',
  'work-order',
]);

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
  const visibleEntries = Object.entries(commands).filter(([, spec]) => (
    spec.help_surface !== 'diagnostic_drilldown'
    && spec.help_surface !== 'migration_compatibility'
    && !ROOT_HELP_DIAGNOSTIC_GROUPS.has(spec.group ?? 'top_level')
  ));
  const diagnosticGroups = Object.entries(commands)
    .filter(([, spec]) => (
      spec.help_surface === 'diagnostic_drilldown'
      || spec.help_surface === 'migration_compatibility'
      || ROOT_HELP_DIAGNOSTIC_GROUPS.has(spec.group ?? 'top_level')
    ))
    .reduce<Record<string, number>>((acc, [, spec]) => {
      const groupId = spec.group ?? 'top_level';
      acc[groupId] = (acc[groupId] ?? 0) + 1;
      return acc;
    }, {});
  const grouped = visibleEntries.reduce<Record<string, Array<{
    command: string;
    usage: string;
    summary: string;
    examples: string[];
  }>>>((acc, [command, spec]) => {
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
            'Use an explicit OPL contract root. When omitted, the CLI resolves from cwd, cwd/contracts/opl-framework, or the active OPL CLI repo contracts root.',
        },
      ],
      command_groups: Object.entries(grouped).map(([group_id, entries]) => ({
        group_id,
        summary: COMMAND_GROUP_SUMMARIES[group_id] ?? '',
        commands: entries,
      })),
      diagnostic_command_groups: Object.entries(diagnosticGroups)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([group_id, command_count]) => ({
          group_id,
          command_count,
          summary: COMMAND_GROUP_SUMMARIES[group_id] ?? '',
          help_command: `opl help ${group_id}`,
          ordinary_command_surface: false,
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
        'opl install',
        'opl app state --profile fast',
        'opl app action execute --action provider_scheduler_status --dry-run',
        'opl framework operating-maturity --family-defaults',
        'opl brand-modules list',
        'opl brand-modules maturity',
        'opl brand-modules l5-status',
        'opl charter status',
        'opl atlas inspect',
        'opl pack status',
        'opl pack bundle check --assembly contracts/stage_control_plane.bundle-assembly.json',
        'opl pack os validate --descriptor display_pack.json',
        'opl stagecraft interfaces',
        'opl runway l5-status',
        'opl runway doctor',
        'opl ledger validate',
        'opl console status',
        'opl agents run --domain oma --action engineer-agent --workspace <path> --payload-file design-request.json',
        'opl foundry status --run-id <run_id>',
        'opl foundry versions --target-agent-id <agent_id> --target-domain-id <domain_id>',
        'opl connect interfaces',
        'opl connect l5-status',
        'opl connect install --module medautoscience',
        'opl connect sync-skills',
        'opl connect packages manifest',
        'opl packages install mas',
        'opl doctor',
        'opl connect skills',
        'opl connect sync-skills',
        'opl update status',
        'opl packages update --dry-run',
        'opl workspace projects',
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl "Plan a medical grant proposal revision loop."',
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl resume --last',
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
      ...(spec.subcommands ? { subcommands: spec.subcommands } : {}),
      ...(spec.registry ? { registry: spec.registry } : {}),
    },
  };
}

function formatHumanRootHelp(payload: ReturnType<typeof buildRootHelp>) {
  const lines = [
    'One Person Lab (OPL)',
    '',
    'Usage:',
    `  ${payload.help.usage}`,
    '',
    'Fast start:',
    '  opl install                    Install the default Codex engine, modules, Codex skills, and the One Person Lab App',
    '  opl workspace status           Check the OPL Workspace module surface',
    '  opl pack status                Check the OPL Pack domain-pack and Pack OS surface',
    '  opl stagecraft status          Check the OPL Stagecraft module surface',
    '  opl runway doctor              Check the OPL Runway runtime substrate surface',
    '  opl ledger status              Check the OPL Ledger evidence module surface',
    '  opl console status             Check the OPL Console operator module surface',
    '  opl agents run --domain oma --action engineer-agent --workspace <path> --payload-file design-request.json',
    '  opl connect modules            Inspect managed module health',
    '  opl connect sync-skills         Sync family skills to their target scope',
    '  opl "your task"                Start from the default Codex runtime',
    '',
    'Common commands:',
  ];

  for (const group of payload.help.command_groups) {
    lines.push('', `${group.group_id}: ${group.summary}`);
    for (const entry of group.commands) {
      lines.push(`  ${entry.usage}`);
      lines.push(`    ${entry.summary}`);
    }
  }

  lines.push('', 'Machine-readable output:', '  opl help --json', '  opl help <command> --json');
  if (payload.help.diagnostic_command_groups.length > 0) {
    lines.push(
      '',
      'Diagnostic/internal namespaces:',
      `  ${payload.help.diagnostic_command_groups.map((group) => group.group_id).join(', ')}`,
      '  Use opl help <namespace> when maintaining or debugging implementation surfaces.',
    );
  }

  return `${lines.join('\n')}\n`;
}

function formatHumanCommandHelp(payload: ReturnType<typeof buildCommandHelp>) {
  const lines = [
    `One Person Lab command: ${payload.help.command}`,
    '',
    'Usage:',
    `  ${payload.help.usage}`,
    '',
    'What it does:',
    `  ${payload.help.summary}`,
  ];

  if (payload.help.examples.length > 0) {
    lines.push('', 'Examples:');
    for (const example of payload.help.examples) {
      lines.push(`  ${example}`);
    }
  }

  if ('subcommands' in payload.help && Array.isArray(payload.help.subcommands)) {
    lines.push('', 'Subcommands:');
    for (const subcommand of payload.help.subcommands) {
      lines.push(`  ${subcommand.usage}`);
      lines.push(`    ${subcommand.summary}`);
    }
  }

  lines.push('', 'Machine-readable output:', `  opl help ${payload.help.command} --json`);

  return `${lines.join('\n')}\n`;
}

function buildContractsContext(contracts: FrameworkContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function withContractsContext<T extends Record<string, unknown>>(
  contracts: FrameworkContracts,
  payload: T,
) {
  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...payload,
  };
}

function parseCliInput(argv: string[]): ParsedCliInput {
  const args = [...argv];
  const loadOptions: FrameworkContractsLoadOptions = {};
  let helpRequested = false;
  let jsonOutput = false;
  let textOutput = false;

  const findGlobalOptionIndex = (option: string) => {
    const passthroughIndex = args.indexOf('--');
    return args.findIndex((token, index) => (
      token === option
      && (passthroughIndex < 0 || index < passthroughIndex)
    ));
  };

  const jsonIndex = findGlobalOptionIndex('--json');
  if (jsonIndex >= 0) {
    jsonOutput = true;
    args.splice(jsonIndex, 1);
  }

  const textIndex = findGlobalOptionIndex('--text');
  if (textIndex >= 0) {
    textOutput = true;
    args.splice(textIndex, 1);
  }

  while (args[0]?.startsWith('--')) {
    const token = args[0];

    if (token === '--json') {
      jsonOutput = true;
      args.shift();
      continue;
    }

    if (token === '--text') {
      textOutput = true;
      args.shift();
      continue;
    }

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
              'opl --contracts-dir /path/to/contracts/opl-framework validate-contracts',
              'opl --contracts-dir /path/to/contracts/opl-framework get-domain redcube',
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
    jsonOutput,
    textOutput,
    command: args.shift() ?? null,
    args,
    loadOptions: loadOptions.contractsDir ? loadOptions : undefined,
  };
}

export {
  CODEX_COMMAND_HELP_PASSTHROUGH,
  NON_PASSTHROUGH_COMMAND_PREFIXES,
  buildCommandHelp,
  formatHumanCommandHelp,
  formatHumanRootHelp,
  buildRootHelp,
  cloneCommandSpec,
  looksLikeNaturalLanguage,
  parseCliInput,
  resolveCommandSpec,
  withContractsContext,
};
