import {
  listOplAgentPackages,
  buildManagedUpdateKernelProjection,
  runManagedUpdateKernelOperation,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageManifestValidate,
  runOplAgentPackageProfileApply,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageRollback,
  runOplAgentPackageStatus,
  runOplAgentPackageActivate,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  type AgentPackageInstallInput,
  type AgentPackageHomeShortcutPreferencesSetInput,
  type AgentPackageManifestValidateInput,
  type AgentPackagePackageActionInput,
  type AgentPackageProfileApplyInput,
  type AgentPackageRepairInput,
} from '../../../../modules/connect/index.ts';
import { resolveFirstPartyPackageManifest } from '../../../../modules/connect/agent-package-first-party.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { STANDARD_AGENT_REGISTRY } from '../../../../kernel/standard-agent-registry.ts';
import { getActiveWorkspaceBinding } from '../../../../modules/workspace/index.ts';
import { readOptionalString } from '../../modules/json-boundary.ts';
import {
  buildUsageError,
  parseRegisteredCommandOptions,
  type CommandSpec,
} from '../../modules/support.ts';

function takePositionalPackageId(args: string[], command: string, spec: CommandSpec) {
  const optionValues = new Set<number>();
  const valueFlags = new Set(
    spec.registry?.options
      .filter((option) => option.value_kind !== 'boolean')
      .map((option) => option.flag) ?? [],
  );
  for (let index = 0; index < args.length - 1; index += 1) {
    if (valueFlags.has(args[index]) && !args[index].includes('=')) optionValues.add(index + 1);
  }
  const positionalIndexes = args.flatMap((entry, index) => (
    !entry.startsWith('--') && !optionValues.has(index) ? [index] : []
  ));
  const ids = positionalIndexes.map((index) => args[index]);
  if (ids.length > 1) {
    throw buildUsageError(`${command} accepts at most one package id.`, spec, {
      positional_package_ids: ids,
    });
  }
  const packageIndex = positionalIndexes[0] ?? null;
  const packageId = packageIndex === null ? null : args[packageIndex];
  return {
    packageId,
    args: packageIndex === null ? args : args.filter((_, index) => index !== packageIndex),
  };
}

function parsePackageSelection(
  command: string,
  args: string[],
  spec: CommandSpec,
  options: { resolveFirstPartyManifest?: boolean } = {},
): AgentPackageInstallInput {
  const positional = takePositionalPackageId(args, command, spec);
  const parsed = parseRegisteredCommandOptions(command, positional.args, spec);
  const optionPackageId = readOptionalString(parsed['package-id']);
  if (positional.packageId && optionPackageId) {
    throw buildUsageError(`${command} accepts a positional package id or --package-id, not both.`, spec, {
      conflicting: ['<package_id>', '--package-id'],
    });
  }
  const selectedPackageId = positional.packageId ?? optionPackageId;
  const firstParty = selectedPackageId && options.resolveFirstPartyManifest
    ? resolveFirstPartyPackageManifest(selectedPackageId)
    : null;
  return {
    manifestUrl: readOptionalString(parsed['manifest-url']) ?? firstParty?.manifestUrl,
    registryUrl: readOptionalString(parsed['registry-url']),
    packageId: firstParty?.canonicalId ?? selectedPackageId,
    trustTier: readOptionalString(parsed['trust-tier']) ?? (firstParty ? 'first_party' : undefined),
    sourceKind: (readOptionalString(parsed['source-kind']) ?? (firstParty ? 'local_manifest_file' : undefined)) as AgentPackageInstallInput['sourceKind'],
    dryRun: parsed['dry-run'] === true,
    agentRoot: readOptionalString(parsed['agent-root']),
    scope: readOptionalString(parsed.scope) as AgentPackageInstallInput['scope'],
    targetWorkspace: readOptionalString(parsed['target-workspace']),
    targetQuest: readOptionalString(parsed['target-quest']),
    keepMigrationIds: readOptionalString(parsed['keep-migration'])
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function parsePackageAction(
  command: string,
  args: string[],
  spec: CommandSpec,
): AgentPackagePackageActionInput {
  const positional = takePositionalPackageId(args, command, spec);
  const parsed = parseRegisteredCommandOptions(command, positional.args, spec);
  const optionPackageId = String(parsed['package-id'] ?? '').trim();
  if (positional.packageId && optionPackageId) {
    throw buildUsageError(`${command} accepts a positional package id or --package-id, not both.`, spec, {
      conflicting: ['<package_id>', '--package-id'],
    });
  }
  const packageId = positional.packageId ?? optionPackageId;
  if (!packageId) {
    throw buildUsageError(`${command} requires a positional package id or --package-id.`, spec, {
      required: ['<package_id> or --package-id'],
    });
  }
  return {
    packageId,
    dryRun: parsed['dry-run'] === true,
    agentRoot: readOptionalString(parsed['agent-root']),
    scope: readOptionalString(parsed.scope) as AgentPackagePackageActionInput['scope'],
    targetWorkspace: readOptionalString(parsed['target-workspace']),
    targetQuest: readOptionalString(parsed['target-quest']),
  };
}

function parsePackageRepair(args: string[], spec: CommandSpec): AgentPackageRepairInput {
  const input = parsePackageSelection('packages repair', args, spec);
  if (!input.packageId) {
    throw buildUsageError('packages repair requires a positional package id or --package-id.', spec, {
      required: ['<package_id> or --package-id'],
    });
  }
  return { ...input, packageId: input.packageId };
}

function hasExplicitPackageSelection(input: AgentPackageInstallInput) {
  return Boolean(input.manifestUrl || input.registryUrl || input.packageId || input.agentRoot);
}

async function installPackageWithActiveWorkspace(input: AgentPackageInstallInput) {
  const result = await runOplAgentPackageInstall(input);
  if (input.dryRun || input.scope) return result;
  const packageId = result.opl_agent_package_install.package_lock.package_id;
  const agent = STANDARD_AGENT_REGISTRY.find((entry) => entry.project === packageId);
  const binding = agent ? getActiveWorkspaceBinding(agent.domain_id) : null;
  if (!binding) return result;
  const defaultScopeActivation = (await runOplAgentPackageActivate({
    packageId,
    scope: 'workspace',
    targetWorkspace: binding.workspace_path,
  })).opl_agent_package_activation;
  return {
    ...result,
    opl_agent_package_install: {
      ...result.opl_agent_package_install,
      default_scope_activation: defaultScopeActivation,
    },
  };
}

function parseRegistryRefresh(args: string[], spec: CommandSpec) {
  const parsed = parseRegisteredCommandOptions('packages registry refresh', args, spec);
  const registryUrl = String(parsed['registry-url'] ?? '').trim();
  if (!registryUrl) {
    throw buildUsageError('packages registry refresh requires --registry-url.', spec, {
      required: ['--registry-url'],
    });
  }
  return { registryUrl };
}

function parseManifestValidation(args: string[], spec: CommandSpec): AgentPackageManifestValidateInput {
  const parsed = parseRegisteredCommandOptions('packages validate-manifest', args, spec);
  return {
    manifestUrl: readOptionalString(parsed['manifest-url']),
    registryUrl: readOptionalString(parsed['registry-url']),
    packageId: readOptionalString(parsed['package-id']),
    trustTier: readOptionalString(parsed['trust-tier']),
    sourceKind: readOptionalString(parsed['source-kind']) as AgentPackageManifestValidateInput['sourceKind'],
  };
}

function parseFrameworkLink(args: string[], spec: CommandSpec) {
  const parsed = parseRegisteredCommandOptions('packages link-framework', args, spec);
  const agentRoot = String(parsed['agent-root'] ?? '').trim();
  if (!agentRoot) {
    throw buildUsageError('packages link-framework requires --agent-root.', spec, {
      required: ['--agent-root'],
    });
  }
  if (parsed.check === true && parsed['dry-run'] === true) {
    throw buildUsageError('packages link-framework accepts only one of --check or --dry-run.', spec, {
      conflicting: ['--check', '--dry-run'],
    });
  }
  return {
    agentRoot,
    dryRun: parsed['dry-run'] === true,
    checkOnly: parsed.check === true,
  };
}

function parsePreferences(
  args: string[],
  spec: CommandSpec,
): AgentPackageHomeShortcutPreferencesSetInput {
  const parsed = parseRegisteredCommandOptions('packages preferences set', args, spec);
  const packageId = String(parsed['package-id'] ?? '').trim();
  const shortcutId = String(parsed['shortcut-id'] ?? '').trim();
  if (!packageId || !shortcutId) {
    throw buildUsageError('packages preferences set requires --package-id and --shortcut-id.', spec, {
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

function parseProfileApply(args: string[], spec: CommandSpec): AgentPackageProfileApplyInput {
  const positional = takePositionalPackageId(args, 'packages profile apply', spec);
  const parsed = parseRegisteredCommandOptions('packages profile apply', positional.args, spec);
  const optionPackageId = readOptionalString(parsed['package-id']);
  if (positional.packageId && optionPackageId) {
    throw buildUsageError('packages profile apply accepts a positional package id or --package-id, not both.', spec, {
      conflicting: ['<package_id>', '--package-id'],
    });
  }
  const packageId = positional.packageId ?? optionPackageId;
  const mergedFile = readOptionalString(parsed['merged-file']);
  if (!packageId || !mergedFile) {
    throw buildUsageError('packages profile apply requires a package id and --merged-file.', spec, {
      required: ['<package_id> or --package-id', '--merged-file'],
    });
  }
  return {
    packageId,
    mergedFile,
    dryRun: parsed['dry-run'] === true,
  };
}

export function buildPackagesCommandSpecs(
  getContracts: () => FrameworkContracts,
  getCommandSpec: (command: string) => CommandSpec,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'packages list': {
      usage: 'opl packages list',
      summary: 'List installed OPL Packages, content identities, exposure state, projections, and lifecycle receipts.',
      examples: ['opl packages list --json'],
      group: 'packages',
      help_surface: 'default',
      handler: () => listOplAgentPackages(),
    },
    'packages status': {
      usage: 'opl packages status [--package-id <id>] [--scope workspace|quest --target-workspace <path>|--target-quest <path>]',
      summary: 'Read package lock, projection, migration, and lifecycle receipt status.',
      examples: ['opl packages status --package-id mas --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions(
          'packages status',
          args,
          getCommandSpec('packages status'),
        );
        return runOplAgentPackageStatus({
          packageId: readOptionalString(parsed['package-id']),
          scope: readOptionalString(parsed.scope) as 'workspace' | 'quest' | null,
          targetWorkspace: readOptionalString(parsed['target-workspace']),
          targetQuest: readOptionalString(parsed['target-quest']),
        });
      },
    },
    'packages registry refresh': {
      usage: 'opl packages registry refresh --registry-url <url>',
      summary: 'Refresh the OPL Package discovery registry without changing installed packages.',
      examples: ['opl packages registry refresh --registry-url https://example.com/registry.json --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageRegistryRefresh(
        parseRegistryRefresh(args, getCommandSpec('packages registry refresh')),
      ),
    },
    'packages validate-manifest': {
      usage: 'opl packages validate-manifest (--manifest-url <url>|--registry-url <url> --package-id <id>) [--trust-tier <tier>] [--source-kind <kind>]',
      summary: 'Validate one OPL Package manifest and its trust/source boundary without installing it.',
      examples: ['opl packages validate-manifest --manifest-url https://example.com/agent/manifest.json --trust-tier third_party_verified --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageManifestValidate(
        parseManifestValidation(args, getCommandSpec('packages validate-manifest')),
      ),
    },
    'packages link-framework': {
      usage: 'opl packages link-framework --agent-root <repo> [--check|--dry-run]',
      summary: 'Link or verify a Standard Agent developer checkout against the resolved OPL Base installation.',
      examples: [
        'opl packages link-framework --agent-root /path/to/agent --check --json',
      ],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageFrameworkLink(
        parseFrameworkLink(args, getCommandSpec('packages link-framework')),
      ),
    },
    'packages install': {
      usage: 'opl packages install <package_id> [--scope workspace|quest --target-workspace <path>|--target-quest <path>] [--keep-migration <id,...>] [--dry-run] [--manifest-url <url>|--registry-url <url> --trust-tier <tier>] [--source-kind <kind>] [--agent-root <repo>]',
      summary: 'Install one OPL Package through the existing manifest, lock, materializer, projection, and receipt transaction.',
      examples: [
        'opl packages install rca --json',
        'opl packages install opl-flow --json',
      ],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => installPackageWithActiveWorkspace(
        parsePackageSelection('packages install', args, getCommandSpec('packages install'), {
          resolveFirstPartyManifest: true,
        }),
      ),
    },
    'packages activate': {
      usage: 'opl packages activate <package_id> --scope workspace|quest [--target-workspace <path>|--target-quest <path>] [--dry-run]',
      summary: 'Activate one installed OPL Package dependency closure for a workspace or quest.',
      examples: [
        'opl packages activate mas --scope workspace --target-workspace /path/to/study --json',
        'opl packages activate mas --scope quest --target-quest /path/to/quest --json',
      ],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageActivate(
        parsePackageAction('packages activate', args, getCommandSpec('packages activate')),
      ),
    },
    'packages update': {
      usage: 'opl packages update [<package_id>] [--scope workspace|quest --target-workspace <path>|--target-quest <path>] [--keep-migration <id,...>] [--manifest-url <url>|--registry-url <url>] [--trust-tier <tier>] [--source-kind <kind>] [--agent-root <repo>] [--dry-run]',
      summary: 'Update one installed OPL Package, or reconcile all clean managed packages when no package is selected.',
      examples: [
        'opl packages update rca --json',
        'opl packages update --json',
      ],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => {
        const input = parsePackageSelection('packages update', args, getCommandSpec('packages update'));
        if (hasExplicitPackageSelection(input)) {
          return runOplAgentPackageUpdate(input);
        }
        if (input.dryRun) {
          return buildManagedUpdateKernelProjection(getContracts(), {
            operation: 'plan',
            componentId: 'opl_packages',
          });
        }
        return runManagedUpdateKernelOperation(getContracts(), {
          operation: 'apply',
          componentId: 'opl_packages',
        });
      },
    },
    'packages enable': {
      usage: 'opl packages enable <package_id> [--dry-run]',
      summary: 'Enable one installed OPL Package without changing its content identity.',
      examples: ['opl packages enable rca --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageExposureAction(
        'enable',
        parsePackageAction('packages enable', args, getCommandSpec('packages enable')),
      ),
    },
    'packages disable': {
      usage: 'opl packages disable <package_id> [--dry-run]',
      summary: 'Disable one installed OPL Package without uninstalling it.',
      examples: ['opl packages disable rca --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageExposureAction(
        'disable',
        parsePackageAction('packages disable', args, getCommandSpec('packages disable')),
      ),
    },
    'packages hide': {
      usage: 'opl packages hide --package-id <id> [--dry-run]',
      summary: 'Hide one installed OPL Package from ordinary shortcut exposure.',
      examples: ['opl packages hide --package-id mas --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageExposureAction(
        'hide',
        parsePackageAction('packages hide', args, getCommandSpec('packages hide')),
      ),
    },
    'packages unhide': {
      usage: 'opl packages unhide --package-id <id> [--dry-run]',
      summary: 'Restore one installed OPL Package to ordinary shortcut exposure.',
      examples: ['opl packages unhide --package-id mas --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageExposureAction(
        'unhide',
        parsePackageAction('packages unhide', args, getCommandSpec('packages unhide')),
      ),
    },
    'packages preferences set': {
      usage: 'opl packages preferences set --package-id <id> --shortcut-id <id> [--visible] [--sort-order <n>] [--dry-run]',
      summary: 'Set Home shortcut preferences without changing package content.',
      examples: ['opl packages preferences set --package-id mas --shortcut-id research --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageHomeShortcutPreferencesSet(
        parsePreferences(args, getCommandSpec('packages preferences set')),
      ),
    },
    'packages repair': {
      usage: 'opl packages repair <package_id> [--scope workspace|quest --target-workspace <path>|--target-quest <path>] [--manifest-url <url>|--registry-url <url>] [--trust-tier <tier>] [--source-kind <kind>] [--agent-root <repo>] [--dry-run]',
      summary: 'Repair one installed OPL Package dependency closure and current workspace/quest materialization.',
      examples: ['opl packages repair mas --scope workspace --target-workspace /path/to/study --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageRepair(
        parsePackageRepair(args, getCommandSpec('packages repair')),
      ),
    },
    'packages rollback': {
      usage: 'opl packages rollback <package_id> [--scope workspace|quest --target-workspace <path>|--target-quest <path>] [--dry-run]',
      summary: 'Atomically restore one OPL Package dependency closure from its last-known-good generation.',
      examples: ['opl packages rollback mas --scope workspace --target-workspace /path/to/study --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageRollback(
        parsePackageAction('packages rollback', args, getCommandSpec('packages rollback')),
      ),
    },
    'packages profile apply': {
      usage: 'opl packages profile apply <package_id> --merged-file <path> [--dry-run]',
      summary: 'Apply a reviewed semantic profile merge through the installed OPL Package lifecycle.',
      examples: ['opl packages profile apply opl-flow --merged-file /path/to/merged/AGENTS.md --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => runOplAgentPackageProfileApply(
        parseProfileApply(args, getCommandSpec('packages profile apply')),
      ),
    },
    'packages uninstall': {
      usage: 'opl packages uninstall <package_id> [--dry-run]',
      summary: 'Uninstall one OPL Package without deleting domain truth.',
      examples: ['opl packages uninstall rca --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageUninstall(
        parsePackageAction('packages uninstall', args, getCommandSpec('packages uninstall')),
      ),
    },
  };
  return specs;
}
