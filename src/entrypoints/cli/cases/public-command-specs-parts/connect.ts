import { buildOplPackageManifest } from '../../../../modules/connect/package-distribution.ts';
import {
  runOplConnectExternalSkillsInspect,
  runOplConnectExternalSkillsList,
  runOplConnectExternalSkillsSearch,
  runOplConnectExternalSkillsSourceAdd,
  runOplConnectExternalSkillsSync,
} from '../../../../modules/connect/opl-connect-external-skills.ts';
import {
  listOplAgentPackages,
  runOplAgentPackageExposureAction,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageManifestValidate,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageRollback,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  type AgentPackageInstallInput,
  type AgentPackageManifestValidateInput,
  type AgentPackageHomeShortcutPreferencesSetInput,
  type AgentPackagePackageActionInput,
  type AgentPackageRollbackInput,
} from '../../../../modules/connect/index.ts';
import { runOplConnectPubMedSearch } from '../../../../modules/connect/opl-connect-pubmed.ts';
import {
  runOplConnectReferenceVerification,
  type ReferenceVerificationInput,
} from '../../../../modules/connect/opl-connect-reference-verification.ts';
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
import { readOptionalString } from '../../modules/json-boundary.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { buildNoArgSpec, commandActionSummary } from './shared.ts';

type ModuleAction = 'install' | 'update' | 'reinstall' | 'remove';

type PubMedSearchArgs = {
  query: string;
  limit: number;
};

type ReferenceVerificationArgs = ReferenceVerificationInput;

type ExternalSkillsBaseArgs = {
  source?: string;
  sourceRoot?: string;
  registryRoot?: string;
};

type ExternalSkillsSourceAddArgs = ExternalSkillsBaseArgs & {
  repo: string;
  pin: string;
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

type AgentPackageSelectionArgs = AgentPackageManifestValidateInput;

type AgentPackageInstallArgs = AgentPackageInstallInput;

type AgentPackageRollbackArgs = AgentPackageRollbackInput;

type AgentPackagePackageActionArgs = AgentPackagePackageActionInput;

type AgentPackageHomeShortcutPreferencesSetArgs = AgentPackageHomeShortcutPreferencesSetInput;

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

function parseReferenceProviders(raw: string, spec: CommandSpec): ReferenceVerificationInput['providers'] {
  const providers = raw.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry === 'semantic_scholar' ? 'semantic-scholar' : entry);
  const allowed = new Set(['crossref', 'pubmed', 'openalex', 'semantic-scholar', 'crossmark', 'publisher']);
  const invalid = providers.filter((provider) => !allowed.has(provider));
  if (providers.length === 0 || invalid.length > 0) {
    throw buildUsageError('connect references verify requires --providers crossref,pubmed,openalex,semantic-scholar,crossmark,publisher.', spec, {
      providers,
      invalid,
    });
  }
  return providers as ReferenceVerificationInput['providers'];
}

function parseReferenceVerificationArgs(args: string[], spec: CommandSpec): ReferenceVerificationArgs {
  const parsed = parseRegisteredCommandOptions('connect references verify', args, spec);
  const referencesFile = String(parsed['references-file'] ?? '').trim();
  if (referencesFile.length === 0) {
    throw buildUsageError('connect references verify requires --references-file.', spec, {
      required: ['--references-file'],
    });
  }
  return {
    referencesFile,
    providers: parseReferenceProviders(
      String(parsed.providers ?? 'crossref,pubmed,openalex,semantic-scholar,crossmark,publisher'),
      spec,
    ),
    cacheRoot: readOptionalString(parsed['cache-root']) ?? undefined,
    maxRetries: Number(parsed['max-retries']),
  };
}

function parseExternalSkillsBase(command: string, args: string[], spec: CommandSpec): ExternalSkillsBaseArgs {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  return {
    source: readOptionalString(parsed.source) ?? undefined,
    sourceRoot: readOptionalString(parsed['source-root']) ?? undefined,
    registryRoot: readOptionalString(parsed['registry-root']) ?? undefined,
  };
}

function parseExternalSkillsSourceAddArgs(args: string[], spec: CommandSpec): ExternalSkillsSourceAddArgs {
  const parsed = parseRegisteredCommandOptions('connect external-skills sources add', args, spec);
  const repo = String(parsed.repo ?? '').trim();
  const pin = String(parsed.pin ?? '').trim();
  if (!repo || !pin) {
    throw buildUsageError('connect external-skills sources add requires --repo and --pin.', spec, {
      required: ['--repo', '--pin'],
    });
  }
  return {
    source: readOptionalString(parsed.source) ?? undefined,
    sourceRoot: readOptionalString(parsed['source-root']) ?? undefined,
    registryRoot: readOptionalString(parsed['registry-root']) ?? undefined,
    repo,
    pin,
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
    source: readOptionalString(parsed.source) ?? undefined,
    sourceRoot: readOptionalString(parsed['source-root']) ?? undefined,
    registryRoot: readOptionalString(parsed['registry-root']) ?? undefined,
    query,
    limit: Number(parsed.limit),
  };
}

function normalizeExternalSkillSelectionArgs(args: string[]) {
  return args.map((arg) => (arg === '--skill-id' ? '--skill' : arg));
}

function canonicalExternalSkillSourceSelector(value: string) {
  return ['kdense', 'k-dense', 'K-Dense-AI/scientific-agent-skills', 'kdense-scientific-agent-skills'].includes(value)
    ? 'kdense-scientific-agent-skills'
    : value;
}

function normalizeExternalSkillSelector(rawSkill: string, rawSource: unknown, spec: CommandSpec) {
  const skill = rawSkill.trim();
  const source = readOptionalString(rawSource) ?? undefined;
  if (!skill.includes('/')) {
    return { source, skill };
  }
  const [selectorSource, selectorSkill, ...rest] = skill.split('/');
  if (!selectorSource || !selectorSkill || rest.length > 0) {
    return { source, skill };
  }
  if (
    source
    && canonicalExternalSkillSourceSelector(source) !== canonicalExternalSkillSourceSelector(selectorSource)
  ) {
    throw buildUsageError('connect external-skills selector source conflicts with --source.', spec, {
      selector_source: selectorSource,
      source,
    });
  }
  return {
    source: source ?? selectorSource,
    skill: selectorSkill,
  };
}

function parseExternalSkillsInspectArgs(args: string[], spec: CommandSpec): ExternalSkillsInspectArgs {
  const parsed = parseRegisteredCommandOptions(
    'connect external-skills inspect',
    normalizeExternalSkillSelectionArgs(args),
    spec,
  );
  const skill = String(parsed.skill ?? '').trim();
  if (skill.length === 0) {
    throw buildUsageError('connect external-skills inspect requires --skill.', spec, {
      required: ['--skill'],
    });
  }
  const selector = normalizeExternalSkillSelector(skill, parsed.source, spec);
  return {
    source: selector.source,
    sourceRoot: readOptionalString(parsed['source-root']) ?? undefined,
    registryRoot: readOptionalString(parsed['registry-root']) ?? undefined,
    skill: selector.skill,
  };
}

function parseExternalSkillsSyncArgs(args: string[], spec: CommandSpec): ExternalSkillsSyncArgs {
  const parsed = parseRegisteredCommandOptions(
    'connect external-skills sync',
    normalizeExternalSkillSelectionArgs(args),
    spec,
  );
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
  const selector = normalizeExternalSkillSelector(skill, parsed.source, spec);
  return {
    source: selector.source,
    sourceRoot: readOptionalString(parsed['source-root']) ?? undefined,
    registryRoot: readOptionalString(parsed['registry-root']) ?? undefined,
    skill: selector.skill,
    scope,
    targetWorkspace: readOptionalString(parsed['target-workspace']) ?? undefined,
    targetQuest: readOptionalString(parsed['target-quest']) ?? undefined,
    targetRoot: readOptionalString(parsed['target-root']) ?? undefined,
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

function parseAgentPackageRegistryRefreshArgs(args: string[], spec: CommandSpec) {
  const parsed = parseRegisteredCommandOptions('connect agent-packages registry refresh', args, spec);
  const registryUrl = String(parsed['registry-url'] ?? '').trim();
  if (!registryUrl) {
    throw buildUsageError('connect agent-packages registry refresh requires --registry-url.', spec, {
      required: ['--registry-url'],
    });
  }
  return { registryUrl };
}

function parseAgentPackageSelectionArgs(
  command: string,
  args: string[],
  spec: CommandSpec,
): AgentPackageSelectionArgs {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  return {
    manifestUrl: readOptionalString(parsed['manifest-url']),
    registryUrl: readOptionalString(parsed['registry-url']),
    packageId: readOptionalString(parsed['package-id']),
    trustTier: readOptionalString(parsed['trust-tier']),
    sourceKind: readOptionalString(parsed['source-kind']) as AgentPackageSelectionArgs['sourceKind'],
  };
}

function parseAgentPackageInstallArgs(command: string, args: string[], spec: CommandSpec): AgentPackageInstallArgs {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  return {
    manifestUrl: readOptionalString(parsed['manifest-url']),
    registryUrl: readOptionalString(parsed['registry-url']),
    packageId: readOptionalString(parsed['package-id']),
    trustTier: readOptionalString(parsed['trust-tier']),
    sourceKind: readOptionalString(parsed['source-kind']) as AgentPackageInstallArgs['sourceKind'],
    dryRun: parsed['dry-run'] === true,
  };
}

function parseAgentPackageRollbackArgs(command: string, args: string[], spec: CommandSpec): AgentPackageRollbackArgs {
  return parseAgentPackageInstallArgs(command, args, spec);
}

function parseAgentPackagePackageActionArgs(command: string, args: string[], spec: CommandSpec): AgentPackagePackageActionArgs {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  const packageId = String(parsed['package-id'] ?? '').trim();
  if (!packageId) {
    throw buildUsageError(`${command} requires --package-id.`, spec, {
      required: ['--package-id'],
    });
  }
  return {
    packageId,
    dryRun: parsed['dry-run'] === true,
  };
}

function parseAgentPackageHomeShortcutPreferencesSetArgs(
  args: string[],
  spec: CommandSpec,
): AgentPackageHomeShortcutPreferencesSetArgs {
  const command = 'connect agent-packages home-shortcut-preferences set';
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  const packageId = String(parsed['package-id'] ?? '').trim();
  const shortcutId = String(parsed['shortcut-id'] ?? '').trim();
  if (!packageId || !shortcutId) {
    throw buildUsageError(`${command} requires --package-id and --shortcut-id.`, spec, {
      required: ['--package-id', '--shortcut-id'],
    });
  }
  return {
    packageId,
    shortcutId,
    visible: parsed.visible === true ? true : null,
    sortOrder: typeof parsed['sort-order'] === 'number' ? parsed['sort-order'] : null,
    dryRun: parsed['dry-run'] === true,
  };
}

function agentPackagePackageActionOptions(summary: string) {
  return [
    {
      name: 'package-id',
      flag: '--package-id',
      value_kind: 'string' as const,
      summary,
      required: true,
    },
    {
      name: 'dry-run',
      flag: '--dry-run',
      value_kind: 'boolean' as const,
      summary: 'Validate and preview receipt output without writing state.',
      required: false,
    },
  ];
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
    {
      name: 'registry-root',
      flag: '--registry-root',
      value_kind: 'string' as const,
      summary: 'Root containing the OPL Connect external skill source registry.',
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

  const agentPackageAuthorityBoundary = {
    owner: 'OPL Connect',
    surface: 'agent_package_registry_and_manifest_lifecycle',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  } as const;

  const agentPackageSelectionOptions = [
    {
      name: 'manifest-url',
      flag: '--manifest-url',
      value_kind: 'string' as const,
      summary: 'Direct OPL Agent Package manifest URL or local file path.',
      required: false,
    },
    {
      name: 'registry-url',
      flag: '--registry-url',
      value_kind: 'string' as const,
      summary: 'Registry URL used to select a package manifest.',
      required: false,
    },
    {
      name: 'package-id',
      flag: '--package-id',
      value_kind: 'string' as const,
      summary: 'Package id to select from --registry-url.',
      required: false,
    },
    {
      name: 'trust-tier',
      flag: '--trust-tier',
      value_kind: 'string' as const,
      summary: 'Explicit user/organization trust tier assigned before install.',
      required: false,
    },
    {
      name: 'source-kind',
      flag: '--source-kind',
      value_kind: 'string' as const,
      summary: 'Package source kind for the package lock receipt.',
      required: false,
    },
  ];

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
    'connect references verify': {
      usage: 'opl connect references verify --references-file <json> [--providers crossref,pubmed,openalex,semantic-scholar,crossmark,publisher] [--cache-root <path>] [--max-retries <n>]',
      summary: 'Verify literature reference metadata through read-only OPL Connect provider receipts.',
      examples: [
        'opl connect references verify --references-file references.json --providers crossref,pubmed --cache-root .cache/opl-connect --max-retries 1 --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect references verify',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'references-file',
            flag: '--references-file',
            value_kind: 'string',
            summary: 'JSON file containing references as an array or { references: [...] }.',
            required: true,
          },
          {
            name: 'providers',
            flag: '--providers',
            value_kind: 'string',
            summary: 'Comma-separated provider ids: crossref,pubmed,openalex,semantic-scholar,crossmark,publisher.',
            default: 'crossref,pubmed,openalex,semantic-scholar,crossmark,publisher',
          },
          {
            name: 'cache-root',
            flag: '--cache-root',
            value_kind: 'string',
            summary: 'Optional cache root for provider evidence receipts.',
            required: false,
          },
          {
            name: 'max-retries',
            flag: '--max-retries',
            value_kind: 'integer',
            summary: 'Retry count for retryable provider failures.',
            default: 1,
            allowed_range: {
              min: 0,
              max: 5,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_references_verify/output_schema',
        authority_boundary: {
          owner: 'OPL Connect',
          surface: 'read_only_reference_verification_connector',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) =>
        runOplConnectReferenceVerification(
          parseReferenceVerificationArgs(args, connectCommandSpecs['connect references verify']),
        ),
    },
    'connect external-skills list': {
      usage: 'opl connect external-skills list [--source <source_id>] [--source-root <path>] [--registry-root <path>]',
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
    'connect external-skills sources add': {
      usage: 'opl connect external-skills sources add --source <source_id> --repo <repo_url> --pin <ref> [--source-root <path>] [--registry-root <path>]',
      summary: 'Register an approved external scientific skill library source without cloning or bulk installing it.',
      examples: [
        'opl connect external-skills sources add --source kdense --repo https://github.com/K-Dense-AI/scientific-agent-skills --pin 1e024ea8547ada12039edbe8197aaa959d97763f --source-root /path/to/scientific-agent-skills --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect external-skills sources add',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...externalSkillsBaseOptions,
          {
            name: 'repo',
            flag: '--repo',
            value_kind: 'string',
            summary: 'Pinned external skill library repository URL.',
            required: true,
          },
          {
            name: 'pin',
            flag: '--pin',
            value_kind: 'string',
            summary: 'Pinned external skill library commit, tag, or immutable ref.',
            required: true,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_external_skills_sources_add/output_schema',
        authority_boundary: externalSkillsAuthorityBoundary,
      },
      handler: (args) =>
        runOplConnectExternalSkillsSourceAdd(
          parseExternalSkillsSourceAddArgs(args, connectCommandSpecs['connect external-skills sources add']),
        ),
    },
    'connect external-skills search': {
      usage: 'opl connect external-skills search --query <query> [--source <source_id>] [--source-root <path>] [--registry-root <path>] [--limit <n>]',
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
      usage: 'opl connect external-skills inspect --skill <skill_id|source_id/skill_id> [--source <source_id>] [--source-root <path>] [--registry-root <path>]',
      summary: 'Inspect one external scientific skill card before syncing it into a workspace or quest.',
      examples: [
        'opl connect external-skills inspect --skill scanpy --source kdense --json',
        'opl connect external-skills inspect --skill kdense/scanpy --json',
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
            summary: 'External skill directory id, or source_id/skill_id selector.',
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
      usage: 'opl connect external-skills sync --skill <skill_id|source_id/skill_id> --scope <workspace|quest> [--target-workspace <path>|--target-quest <path>|--target-root <path>] [--source <source_id>] [--source-root <path>] [--registry-root <path>]',
      summary: 'Selectively sync one approved external scientific skill into a workspace or quest Codex discovery directory.',
      examples: [
        'opl connect external-skills sync --skill scanpy --source kdense --scope workspace --target-workspace /path/to/workspace --json',
        'opl connect external-skills sync --skill kdense/scanpy --scope quest --target-quest /path/to/quest --json',
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
            summary: 'External skill directory id, or source_id/skill_id selector.',
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
    'connect agent-packages registry refresh': {
      usage: 'opl connect agent-packages registry refresh --registry-url <url>',
      summary: 'Fetch and validate an OPL Agent Package registry, then write the Framework-owned registry refresh receipt.',
      examples: [
        'opl connect agent-packages registry refresh --registry-url https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages registry refresh',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'registry-url',
            flag: '--registry-url',
            value_kind: 'string',
            summary: 'HTTP(S), file://, or absolute path to an OPL Agent Package registry JSON document.',
            required: true,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_registry_refresh/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageRegistryRefresh(
          parseAgentPackageRegistryRefreshArgs(args, connectCommandSpecs['connect agent-packages registry refresh']),
        ),
    },
    'connect agent-packages validate-manifest': {
      usage: 'opl connect agent-packages validate-manifest (--manifest-url <url>|--registry-url <url> --package-id <id>) [--trust-tier <tier>] [--source-kind <kind>]',
      summary: 'Fetch and validate one OPL Agent Package manifest, then record a validation receipt without installing or claiming domain authority.',
      examples: [
        'opl connect agent-packages validate-manifest --manifest-url https://example.com/agent/manifest.json --trust-tier third_party_verified --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages validate-manifest',
        parser_adapter: 'node_util_parse_args',
        options: agentPackageSelectionOptions,
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_validate_manifest/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageManifestValidate(
          parseAgentPackageSelectionArgs(
            'connect agent-packages validate-manifest',
            args,
            connectCommandSpecs['connect agent-packages validate-manifest'],
          ),
        ),
    },
    'connect agent-packages install': {
      usage: 'opl connect agent-packages install (--manifest-url <url>|--registry-url <url> --package-id <id>) --trust-tier <tier> [--source-kind <kind>] [--dry-run]',
      summary: 'Validate an OPL Agent Package manifest and write the Framework-owned package lock plus lifecycle receipt.',
      examples: [
        'opl connect agent-packages install --manifest-url https://example.com/agent/manifest.json --trust-tier third_party_verified --json',
        'opl connect agent-packages install --registry-url https://example.com/registry.json --package-id mas --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages install',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...agentPackageSelectionOptions,
          {
            name: 'dry-run',
            flag: '--dry-run',
            value_kind: 'boolean',
            summary: 'Validate and preview lock/receipt output without writing state.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_install/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageInstall(
          parseAgentPackageInstallArgs(
            'connect agent-packages install',
            args,
            connectCommandSpecs['connect agent-packages install'],
          ),
        ),
    },
    'connect agent-packages update': {
      usage: 'opl connect agent-packages update (--manifest-url <url>|--registry-url <url> --package-id <id>) [--trust-tier <tier>] [--source-kind <kind>] [--dry-run]',
      summary: 'Validate an installed OPL Agent Package manifest and replace its Framework-owned package lock plus lifecycle receipt.',
      examples: [
        'opl connect agent-packages update --registry-url https://example.com/registry.json --package-id mas --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages update',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...agentPackageSelectionOptions,
          {
            name: 'dry-run',
            flag: '--dry-run',
            value_kind: 'boolean',
            summary: 'Validate and preview lock/receipt output without writing state.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_update/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageUpdate(
          parseAgentPackageInstallArgs(
            'connect agent-packages update',
            args,
            connectCommandSpecs['connect agent-packages update'],
          ),
        ),
    },
    'connect agent-packages repair': {
      usage: 'opl connect agent-packages repair --package-id <id> [--dry-run]',
      summary: 'Re-record the Framework-owned lock and lifecycle receipt for an installed OPL Agent Package.',
      examples: ['opl connect agent-packages repair --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages repair',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to repair.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_repair/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageRepair(
          parseAgentPackagePackageActionArgs(
            'connect agent-packages repair',
            args,
            connectCommandSpecs['connect agent-packages repair'],
          ),
        ),
    },
    'connect agent-packages rollback': {
      usage: 'opl connect agent-packages rollback (--manifest-url <url>|--registry-url <url> --package-id <id>) [--trust-tier <tier>] [--source-kind <kind>] [--dry-run]',
      summary: 'Validate a rollback OPL Agent Package manifest and replace the Framework-owned package lock plus lifecycle receipt.',
      examples: [
        'opl connect agent-packages rollback --manifest-url file:///tmp/agent/rollback-manifest.json --trust-tier third_party_verified --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages rollback',
        parser_adapter: 'node_util_parse_args',
        options: [
          ...agentPackageSelectionOptions,
          {
            name: 'dry-run',
            flag: '--dry-run',
            value_kind: 'boolean',
            summary: 'Validate and preview rollback lock/receipt output without writing state.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_rollback/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageRollback(
          parseAgentPackageRollbackArgs(
            'connect agent-packages rollback',
            args,
            connectCommandSpecs['connect agent-packages rollback'],
          ),
        ),
    },
    'connect agent-packages uninstall': {
      usage: 'opl connect agent-packages uninstall --package-id <id> [--dry-run]',
      summary: 'Remove an installed OPL Agent Package lock and write a lifecycle receipt without deleting domain truth.',
      examples: ['opl connect agent-packages uninstall --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages uninstall',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to uninstall.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_uninstall/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageUninstall(
          parseAgentPackagePackageActionArgs(
            'connect agent-packages uninstall',
            args,
            connectCommandSpecs['connect agent-packages uninstall'],
          ),
        ),
    },
    'connect agent-packages hide': {
      usage: 'opl connect agent-packages hide --package-id <id> [--dry-run]',
      summary: 'Hide an installed OPL Agent Package from ordinary shortcut exposure while keeping its lock.',
      examples: ['opl connect agent-packages hide --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages hide',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to hide.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_hide/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'hide',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages hide',
            args,
            connectCommandSpecs['connect agent-packages hide'],
          ),
        ),
    },
    'connect agent-packages unhide': {
      usage: 'opl connect agent-packages unhide --package-id <id> [--dry-run]',
      summary: 'Restore an installed OPL Agent Package to ordinary shortcut exposure.',
      examples: ['opl connect agent-packages unhide --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages unhide',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to unhide.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_unhide/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'unhide',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages unhide',
            args,
            connectCommandSpecs['connect agent-packages unhide'],
          ),
        ),
    },
    'connect agent-packages enable': {
      usage: 'opl connect agent-packages enable --package-id <id> [--dry-run]',
      summary: 'Enable an installed OPL Agent Package exposure state without claiming domain readiness.',
      examples: ['opl connect agent-packages enable --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages enable',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to enable.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_enable/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'enable',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages enable',
            args,
            connectCommandSpecs['connect agent-packages enable'],
          ),
        ),
    },
    'connect agent-packages disable': {
      usage: 'opl connect agent-packages disable --package-id <id> [--dry-run]',
      summary: 'Disable an installed OPL Agent Package exposure state without uninstalling it.',
      examples: ['opl connect agent-packages disable --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages disable',
        parser_adapter: 'node_util_parse_args',
        options: agentPackagePackageActionOptions('Installed OPL Agent Package id to disable.'),
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_disable/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'disable',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages disable',
            args,
            connectCommandSpecs['connect agent-packages disable'],
          ),
        ),
    },
    'connect agent-packages home-shortcut-preferences set': {
      usage: 'opl connect agent-packages home-shortcut-preferences set --package-id <id> --shortcut-id <id> [--visible] [--sort-order <n>] [--dry-run]',
      summary: 'Persist the user Home shortcut preference for an installed OPL Agent Package.',
      examples: [
        'opl connect agent-packages home-shortcut-preferences set --package-id mas --shortcut-id research --json',
      ],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages home-shortcut-preferences set',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'package-id',
            flag: '--package-id',
            value_kind: 'string',
            summary: 'Installed OPL Agent Package id.',
            required: true,
          },
          {
            name: 'shortcut-id',
            flag: '--shortcut-id',
            value_kind: 'string',
            summary: 'Home shortcut id to prefer for this package.',
            required: true,
          },
          {
            name: 'visible',
            flag: '--visible',
            value_kind: 'boolean',
            summary: 'Mark the shortcut preference visible.',
            required: false,
          },
          {
            name: 'sort-order',
            flag: '--sort-order',
            value_kind: 'integer',
            summary: 'Optional user-visible ordering value.',
            required: false,
          },
          {
            name: 'dry-run',
            flag: '--dry-run',
            value_kind: 'boolean',
            summary: 'Validate and preview preference output without writing state.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_home_shortcut_preferences_set/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) =>
        runOplAgentPackageHomeShortcutPreferencesSet(
          parseAgentPackageHomeShortcutPreferencesSetArgs(
            args,
            connectCommandSpecs['connect agent-packages home-shortcut-preferences set'],
          ),
        ),
    },
    'connect agent-packages status': {
      usage: 'opl connect agent-packages status [--package-id <id>]',
      summary: 'Read installed OPL Agent Package lock and lifecycle receipt status.',
      examples: ['opl connect agent-packages status --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages status',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'package-id',
            flag: '--package-id',
            value_kind: 'string',
            summary: 'Optional installed OPL Agent Package id to inspect.',
            required: false,
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_status/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions(
          'connect agent-packages status',
          args,
          connectCommandSpecs['connect agent-packages status'],
        );
        return runOplAgentPackageStatus({ packageId: readOptionalString(parsed['package-id']) });
      },
    },
    'connect agent-packages list': {
      usage: 'opl connect agent-packages list',
      summary: 'Read the Framework-owned Agent Package registry cache, package locks, and lifecycle receipts.',
      examples: ['opl connect agent-packages list --json'],
      group: 'connect',
      help_surface: 'default',
      registry: {
        command_id: 'connect agent-packages list',
        parser_adapter: 'node_util_parse_args',
        options: [],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/connect_agent_packages_list/output_schema',
        authority_boundary: agentPackageAuthorityBoundary,
      },
      handler: () => listOplAgentPackages(),
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
    protectedCommandPrefixes: ['connect pubmed', 'connect references', 'connect external-skills', 'connect agent-packages'],
    requiredCommandIds: ['connect pubmed search', 'connect references verify', ...MODULE_ACTION_COMMANDS],
  });

  return connectCommandSpecs;
}
