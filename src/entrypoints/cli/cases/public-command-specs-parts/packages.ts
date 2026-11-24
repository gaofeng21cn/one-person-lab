import {
  listOplAgentPackages,
  locateInstalledPackage,
  buildManagedUpdateKernelProjection,
  runManagedUpdateKernelOperation,
  runOplAgentPackageExposureAction,
  runOplAgentPackageFrameworkLink,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  type AgentPackageInstallInput,
  type AgentPackageHomeShortcutPreferencesSetInput,
  type AgentPackagePackageActionInput,
  type AgentPackageRepairInput,
} from '../../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
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
  selectionRequired = true,
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
  const manifestUrl = readOptionalString(parsed['manifest-url']);
  const trustTier = readOptionalString(parsed['trust-tier']);
  if (manifestUrl && selectedPackageId) {
    throw buildUsageError(`${command} accepts a package id or --manifest-url, not both.`, spec, {
      conflicting: ['<package_id>', '--manifest-url'],
    });
  }
  if (manifestUrl && trustTier !== 'third_party_unverified' && trustTier !== 'third_party_verified') {
    throw buildUsageError(`${command} requires --trust-tier with --manifest-url.`, spec, {
      required: ['--trust-tier'],
      allowed_trust_tiers: ['third_party_unverified', 'third_party_verified'],
    });
  }
  if (!manifestUrl && trustTier) {
    throw buildUsageError(`${command} accepts --trust-tier only with --manifest-url.`, spec, {
      conflicting: ['--trust-tier', '<package_id>'],
    });
  }
  if (selectionRequired && !selectedPackageId && !manifestUrl) {
    throw buildUsageError(`${command} requires a package id or --manifest-url.`, spec, {
      required: ['<package_id> or --manifest-url'],
    });
  }
  return {
    packageId: selectedPackageId,
    manifestUrl,
    trustTier: trustTier as AgentPackageInstallInput['trustTier'],
    dryRun: parsed['dry-run'] === true,
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
  return Boolean(input.packageId);
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

export function buildPackagesCommandSpecs(
  getContracts: () => FrameworkContracts,
  getCommandSpec: (command: string) => CommandSpec,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'packages list': {
      usage: 'opl packages list',
      summary: 'Browse OPL Packages with fresh installed state, actions, and projections from their native carriers.',
      examples: ['opl packages list --json'],
      group: 'packages',
      help_surface: 'default',
      handler: () => listOplAgentPackages(),
    },
    'packages status': {
      usage: 'opl packages status [--package-id <id>]',
      summary: 'Read compact package presence, callability, actions, and owner-route status.',
      examples: ['opl packages status --package-id mas --json'],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => {
        const spec = getCommandSpec('packages status');
        const parsed = parseRegisteredCommandOptions(
          'packages status',
          args,
          spec,
        );
        return runOplAgentPackageStatus({
          packageId: readOptionalString(parsed['package-id']),
        });
      },
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
    'packages locate': {
      usage: 'opl packages locate <package_id> [--asset <relpath>]',
      summary: 'Locate an installed OPL Package root and verify an optional package-contained relative asset.',
      examples: [
        'opl packages locate mac-media-assets --json',
        'opl packages locate mas-scholar-skills --asset contracts/opl_capability_package_manifest.json --json',
      ],
      group: 'packages',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => {
        const command = 'packages locate';
        const spec = getCommandSpec(command);
        const positional = takePositionalPackageId(args, command, spec);
        const parsed = parseRegisteredCommandOptions(command, positional.args, spec);
        const optionPackageId = readOptionalString(parsed['package-id']);
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
        return locateInstalledPackage({
          packageId,
          asset: readOptionalString(parsed.asset),
        });
      },
    },
    'packages install': {
      usage: 'opl packages install <package_id> [--dry-run] | --manifest-url <url> --trust-tier <tier> [--dry-run]',
      summary: 'Install one Package through its native carrier, or validate and install a third-party Agent manifest.',
      examples: [
        'opl packages install rca --json',
        'opl packages install opl-flow --json',
        'opl packages install --manifest-url https://example.com/agent.json --trust-tier third_party_verified --dry-run --json',
      ],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageInstall(
        parsePackageSelection('packages install', args, getCommandSpec('packages install')),
      ),
    },
    'packages update': {
      usage: 'opl packages update [<package_id>] [--dry-run]',
      summary: 'Update one Package through its native carrier, or run the managed aggregate when no Package is selected.',
      examples: [
        'opl packages update rca --json',
        'opl packages update --json',
      ],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => {
        const input = parsePackageSelection(
          'packages update',
          args,
          getCommandSpec('packages update'),
          false,
        );
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
      usage: 'opl packages repair <package_id> [--dry-run]',
      summary: 'Repair one Package through its native carrier and return fresh readback.',
      examples: ['opl packages repair mas --json'],
      group: 'packages',
      help_surface: 'default',
      handler: (args) => runOplAgentPackageRepair(
        parsePackageRepair(args, getCommandSpec('packages repair')),
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
