import { buildOplPackageManifest } from '../../../../modules/connect/package-distribution.ts';
import {
  runOplConnectExternalSkillsInspect,
  runOplConnectExternalSkillsList,
  runOplConnectExternalSkillsSearch,
  runOplConnectExternalSkillsSync,
} from '../../../../modules/connect/opl-connect-external-skills.ts';
import { runOplConnectPubMedSearch } from '../../../../modules/connect/opl-connect-pubmed.ts';
import { buildOplModules, runOplModuleAction, runOplModuleExec } from '../../../../modules/connect/system-installation/modules.ts';
import {
  buildPublicModuleActionPayload,
  buildPublicModuleExecPayload,
  buildPublicModulesPayload,
} from '../../modules/public-payloads.ts';
import {
  buildUsageError,
  cloneCommandSpec,
  parseRegisteredCommandOptions,
  parseOplModuleExecArgs,
  validateCommandRegistryCoverage,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { buildNoArgSpec, commandActionSummary } from './shared.ts';

type ModuleAction = 'install' | 'update' | 'reinstall' | 'remove';

type PubMedSearchArgs = {
  query: string;
  limit: number;
};

type ExternalSkillsBaseArgs = {
  source?: string;
  sourceRoot?: string;
};

type ExternalSkillsSearchArgs = ExternalSkillsBaseArgs & {
  query: string;
  limit: number;
};

type ExternalSkillsInspectArgs = ExternalSkillsBaseArgs & {
  skill: string;
};

type ExternalSkillsSyncArgs = ExternalSkillsInspectArgs & {
  scope: 'workspace' | 'quest';
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
};

const MODULE_ACTION_COMMANDS = [
  'connect install',
  'connect update',
  'connect reinstall',
  'connect remove',
];

function parsePubMedSearchArgs(args: string[], spec: CommandSpec): PubMedSearchArgs {
  const parsed = parseRegisteredCommandOptions('connect pubmed search', args, spec);
  const query = String(parsed.query ?? '').trim();
  if (query.length === 0) {
    throw buildUsageError('connect pubmed search requires --query.', spec, {
      required: ['--query'],
    });
  }

  return { query, limit: Number(parsed.limit) };
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseExternalSkillsBase(command: string, args: string[], spec: CommandSpec): ExternalSkillsBaseArgs {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  return {
    source: optionalString(parsed.source),
    sourceRoot: optionalString(parsed['source-root']),
  };
}

function parseExternalSkillsSearchArgs(args: string[], spec: CommandSpec): ExternalSkillsSearchArgs {
  const parsed = parseRegisteredCommandOptions('connect external-skills search', args, spec);
  const query = String(parsed.query ?? '').trim();
  if (query.length === 0) {
    throw buildUsageError('connect external-skills search requires --query.', spec, {
      required: ['--query'],
    });
  }
  return {
    source: optionalString(parsed.source),
    sourceRoot: optionalString(parsed['source-root']),
    query,
    limit: Number(parsed.limit),
  };
}

function parseExternalSkillsInspectArgs(args: string[], spec: CommandSpec): ExternalSkillsInspectArgs {
  const parsed = parseRegisteredCommandOptions('connect external-skills inspect', args, spec);
  const skill = String(parsed.skill ?? '').trim();
  if (skill.length === 0) {
    throw buildUsageError('connect external-skills inspect requires --skill.', spec, {
      required: ['--skill'],
    });
  }
  return {
    source: optionalString(parsed.source),
    sourceRoot: optionalString(parsed['source-root']),
    skill,
  };
}

function parseExternalSkillsSyncArgs(args: string[], spec: CommandSpec): ExternalSkillsSyncArgs {
  const parsed = parseRegisteredCommandOptions('connect external-skills sync', args, spec);
  const skill = String(parsed.skill ?? '').trim();
  const scope = String(parsed.scope ?? '').trim();
  if (skill.length === 0) {
    throw buildUsageError('connect external-skills sync requires --skill.', spec, {
      required: ['--skill'],
    });
  }
  if (scope !== 'workspace' && scope !== 'quest') {
    throw buildUsageError('connect external-skills sync requires --scope workspace|quest.', spec, {
      required: ['--scope workspace|quest'],
    });
  }
  return {
    source: optionalString(parsed.source),
    sourceRoot: optionalString(parsed['source-root']),
    skill,
    scope,
    targetWorkspace: optionalString(parsed['target-workspace']),
    targetQuest: optionalString(parsed['target-quest']),
    targetRoot: optionalString(parsed['target-root']),
  };
}

function parseModuleActionArgs(command: string, args: string[], spec: CommandSpec) {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  const moduleId = String(parsed.module ?? '').trim();
  if (moduleId.length === 0) {
    throw buildUsageError(`${command} requires --module.`, spec, {
      required: ['--module'],
    });
  }
  return moduleId;
}

function buildModuleActionSpec(
  action: ModuleAction,
  usage: string,
  example: string,
): CommandSpec {
  const command = `connect ${action}`;
  const spec: CommandSpec = {
    usage,
    summary: commandActionSummary(action, 'one OPL-managed domain module'),
    examples: [example],
    group: 'module',
    registry: {
      command_id: command,
      parser_adapter: 'node_util_parse_args',
      options: [
        {
          name: 'module',
          flag: '--module',
          value_kind: 'string',
          summary: 'OPL-managed domain module id.',
          required: true,
        },
      ],
      json_output_schema_ref:
        `contracts/opl-framework/cli-command-registry.json#/commands/connect_${action}/output_schema`,
      authority_boundary: {
        owner: 'OPL Connect',
        surface: 'managed_module_action',
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    handler: (args) =>
      buildPublicModuleActionPayload(
        runOplModuleAction(action, parseModuleActionArgs(command, args, spec)),
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

  const externalSkillsBaseOptions = [
    {
      name: 'source',
      flag: '--source',
      value_kind: 'string' as const,
      summary: 'External skill library source id. Defaults to kdense-scientific-agent-skills.',
      required: false,
    },
    {
      name: 'source-root',
      flag: '--source-root',
      value_kind: 'string' as const,
      summary: 'Local checkout path for the external skill library source.',
      required: false,
    },
  ];

  const externalSkillsAuthorityBoundary = {
    owner: 'OPL Connect',
    surface: 'external_skill_library_connector',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  } as const;

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
    'connect pubmed search': {
      usage: 'opl connect pubmed search --query <query> [--limit <n>]',
      summary: 'Search PubMed through the OPL Connect read-only literature connector and return normalized source refs.',
      examples: [
        'opl connect pubmed search --query "diabetes mortality prediction" --limit 5 --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect pubmed search',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'query',
            flag: '--query',
            value_kind: 'string',
            summary: 'PubMed search query.',
            required: true,
          },
          {
            name: 'limit',
            flag: '--limit',
            value_kind: 'integer',
            summary: 'Maximum number of normalized literature refs to return.',
            default: 10,
            allowed_range: {
              min: 1,
              max: 50,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_pubmed_search/output_schema',
        authority_boundary: {
          owner: 'OPL Connect',
          surface: 'read_only_literature_connector',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) =>
        runOplConnectPubMedSearch(
          parsePubMedSearchArgs(args, connectCommandSpecs['connect pubmed search']),
        ),
    },
    'connect external-skills list': {
      usage: 'opl connect external-skills list [--source <source_id>] [--source-root <path>]',
      summary: 'List registered external scientific skill libraries and their available skill cards.',
      examples: [
        'opl connect external-skills list --source kdense-scientific-agent-skills --json',
        'opl connect external-skills list --source-root /path/to/scientific-agent-skills --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect external-skills list',
        parser_adapter: 'node_util_parse_args',
        options: externalSkillsBaseOptions,
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_external_skills_list/output_schema',
        authority_boundary: externalSkillsAuthorityBoundary,
      },
      handler: (args) =>
        runOplConnectExternalSkillsList(
          parseExternalSkillsBase('connect external-skills list', args, connectCommandSpecs['connect external-skills list']),
        ),
    },
    'connect external-skills search': {
      usage: 'opl connect external-skills search --query <query> [--source <source_id>] [--source-root <path>] [--limit <n>]',
      summary: 'Search an approved external scientific skill library before selectively syncing one skill.',
      examples: [
        'opl connect external-skills search --query "single cell RNA-seq" --source kdense --limit 5 --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect external-skills search',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...externalSkillsBaseOptions,
          {
            name: 'query',
            flag: '--query',
            value_kind: 'string',
            summary: 'Capability, package, database, or tool need.',
            required: true,
          },
          {
            name: 'limit',
            flag: '--limit',
            value_kind: 'integer',
            summary: 'Maximum matching external skill cards to return.',
            default: 10,
            allowed_range: {
              min: 1,
              max: 50,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_external_skills_search/output_schema',
        authority_boundary: externalSkillsAuthorityBoundary,
      },
      handler: (args) =>
        runOplConnectExternalSkillsSearch(
          parseExternalSkillsSearchArgs(args, connectCommandSpecs['connect external-skills search']),
        ),
    },
    'connect external-skills inspect': {
      usage: 'opl connect external-skills inspect --skill <skill_id> [--source <source_id>] [--source-root <path>]',
      summary: 'Inspect one external scientific skill card before syncing it into a workspace or quest.',
      examples: [
        'opl connect external-skills inspect --skill scanpy --source kdense --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect external-skills inspect',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...externalSkillsBaseOptions,
          {
            name: 'skill',
            flag: '--skill',
            value_kind: 'string',
            summary: 'External skill directory id.',
            required: true,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_external_skills_inspect/output_schema',
        authority_boundary: externalSkillsAuthorityBoundary,
      },
      handler: (args) =>
        runOplConnectExternalSkillsInspect(
          parseExternalSkillsInspectArgs(args, connectCommandSpecs['connect external-skills inspect']),
        ),
    },
    'connect external-skills sync': {
      usage: 'opl connect external-skills sync --skill <skill_id> --scope <workspace|quest> [--target-workspace <path>|--target-quest <path>|--target-root <path>] [--source <source_id>] [--source-root <path>]',
      summary: 'Selectively sync one approved external scientific skill into a workspace or quest Codex discovery directory.',
      examples: [
        'opl connect external-skills sync --skill scanpy --source kdense --scope workspace --target-workspace /path/to/workspace --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect external-skills sync',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...externalSkillsBaseOptions,
          {
            name: 'skill',
            flag: '--skill',
            value_kind: 'string',
            summary: 'External skill directory id.',
            required: true,
          },
          {
            name: 'scope',
            flag: '--scope',
            value_kind: 'string',
            summary: 'Target Codex discovery scope.',
            required: true,
          },
          {
            name: 'target-workspace',
            flag: '--target-workspace',
            value_kind: 'string',
            summary: 'Workspace root for workspace-scoped sync.',
            required: false,
          },
          {
            name: 'target-quest',
            flag: '--target-quest',
            value_kind: 'string',
            summary: 'Quest root for quest-scoped sync.',
            required: false,
          },
          {
            name: 'target-root',
            flag: '--target-root',
            value_kind: 'string',
            summary: 'Explicit target root override.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_external_skills_sync/output_schema',
        authority_boundary: externalSkillsAuthorityBoundary,
      },
      handler: (args) =>
        runOplConnectExternalSkillsSync(
          parseExternalSkillsSyncArgs(args, connectCommandSpecs['connect external-skills sync']),
        ),
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
      usage: 'opl connect sync-skills [--domain <domain_id>] [--scope <project|codex|workspace|quest>] [--target-project <project_id>] [--target-workspace <path>] [--target-quest <path>] [--target-root <path>] [--home <home_path>] [--quiet]',
      summary: 'Sync family/domain capability packs to their declared target scope through the canonical Connect command surface.',
      examples: [
        'opl connect sync-skills --json',
        'opl connect sync-skills --domain medautoscience --json',
        'opl connect sync-skills --domain mas-scholar-skills --scope project --target-project medautoscience --json',
        'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace /path/to/workspace --json',
        'opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest /path/to/quest --json',
        'opl connect sync-skills --domain mas-scholar-skills --scope codex --json',
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

  validateCommandRegistryCoverage(connectCommandSpecs, {
    protectedCommandPrefixes: ['connect pubmed', 'connect external-skills'],
    requiredCommandIds: ['connect pubmed search', ...MODULE_ACTION_COMMANDS],
  });

  return connectCommandSpecs;
}
