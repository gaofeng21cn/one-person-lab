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
  skill: '同步 family domain plugin，并查看当前 Codex skill pack 安装状态。',
  status: '读取 family、workspace、runtime 和 dashboard 状态。',
  system: '查看与维护 OPL 的系统状态、初始化和更新通道。',
  engine: '安装、更新与维护执行引擎。',
  module: '安装、更新与维护领域模块。',
  package: '查看 OPL release / Packages 的机器消费 manifest。',
  workspace: '管理项目与 workspace 绑定。',
  domain: '解析域边界、域入口和域 manifest。',
  contract: '读取或验证 machine-readable contract / handoff surface。',
  session: '查看、恢复和审计会话。',
  runtime: '修复或检查底层 runtime 相关入口。',
  legacy: '历史兼容命令。',
};

const NON_PASSTHROUGH_COMMAND_PREFIXES = new Set([
  ['front', 'desk'].join(''),
  'frontdoor',
  'ask',
  'chat',
  'shell',
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
        'opl install',
        'opl install --modules mas,mag,rca',
        'opl doctor',
        'opl skill list',
        'opl skill sync',
        'opl system',
        'opl system initialize',
        'opl system reconcile-modules',
        'opl modules',
        'opl module install --module medautoscience',
        'opl engine install --engine codex',
        'opl workspace projects',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube product invoke --workspace-root /Users/gaofeng/workspace/redcube-ai" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai"',
        'opl domain launch --project redcube --dry-run',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
        'opl status runtime --limit 10',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
        'opl "Plan a medical grant proposal revision loop."',
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl resume --last',
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

function formatHumanRootHelp(payload: ReturnType<typeof buildRootHelp>) {
  const lines = [
    'One Person Lab (OPL)',
    '',
    'Usage:',
    `  ${payload.help.usage}`,
    '',
    'Fast start:',
    '  opl install                    Install the default Codex engine, modules, Codex skills, and the One Person Lab App',
    '  opl system initialize          Check first-run state and remaining setup actions',
    '  opl modules                    Inspect MAS/MAG/RCA module health',
    '  opl skill sync                 Sync family skills into the Codex skill path',
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

  lines.push('', 'Machine-readable output:', `  opl help ${payload.help.command} --json`);

  return `${lines.join('\n')}\n`;
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

function parseCliInput(argv: string[]): ParsedCliInput {
  const args = [...argv];
  const loadOptions: GatewayContractsLoadOptions = {};
  let helpRequested = false;
  let jsonOutput = false;
  let textOutput = false;

  const jsonIndex = args.indexOf('--json');
  if (jsonIndex >= 0) {
    jsonOutput = true;
    args.splice(jsonIndex, 1);
  }

  const textIndex = args.indexOf('--text');
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
    jsonOutput,
    textOutput,
    command: args.shift() ?? null,
    args,
    loadOptions: loadOptions.contractsDir ? loadOptions : undefined,
  };
}

export {
  CODEX_COMMAND_HELP_PASSTHROUGH,
  COMMAND_GROUP_SUMMARIES,
  NON_PASSTHROUGH_COMMAND_PREFIXES,
  buildCommandHelp,
  buildContractsContext,
  formatHumanCommandHelp,
  formatHumanRootHelp,
  buildRootHelp,
  cloneCommandSpec,
  looksLikeNaturalLanguage,
  parseCliInput,
  resolveCommandSpec,
  withContractsContext,
};
