import {
  listOplAgentPackages,
  runOplAgentPackageExposureAction,
  runOplAgentPackageHomeShortcutPreferencesSet,
  runOplAgentPackageInstall,
  runOplAgentPackageManifestValidate,
  runOplAgentPackageRegistryRefresh,
  runOplAgentPackageRepair,
  runOplAgentPackageStatus,
  runOplAgentPackageUninstall,
  runOplAgentPackageUpdate,
  type AgentPackageHomeShortcutPreferencesSetInput,
  type AgentPackageInstallInput,
  type AgentPackageManifestValidateInput,
  type AgentPackagePackageActionInput,
} from '../../../../modules/connect/index.ts';
import { readOptionalString } from '../../modules/json-boundary.ts';
import {
  buildUsageError,
  parseRegisteredCommandOptions,
  type CommandSpec,
} from '../../modules/support.ts';

type AgentPackageSelectionArgs = AgentPackageManifestValidateInput;
type AgentPackageInstallArgs = AgentPackageInstallInput;
type AgentPackagePackageActionArgs = AgentPackagePackageActionInput;
type AgentPackageHomeShortcutPreferencesSetArgs = AgentPackageHomeShortcutPreferencesSetInput;

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

export function buildAgentPackageCommandSpecs(
  getCommandSpec: (command: string) => CommandSpec,
): Record<string, CommandSpec> {
  return {
    'connect agent-packages registry refresh': {
      usage: 'opl connect agent-packages registry refresh --registry-url <url>',
      summary: 'Fetch and validate an OPL Agent Package registry, then write the Framework-owned registry refresh receipt.',
      examples: [
        'opl connect agent-packages registry refresh --registry-url https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json --json',
      ],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageRegistryRefresh(
          parseAgentPackageRegistryRefreshArgs(args, getCommandSpec('connect agent-packages registry refresh')),
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
      handler: (args) =>
        runOplAgentPackageManifestValidate(
          parseAgentPackageSelectionArgs(
            'connect agent-packages validate-manifest',
            args,
            getCommandSpec('connect agent-packages validate-manifest'),
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
      handler: (args) =>
        runOplAgentPackageInstall(
          parseAgentPackageInstallArgs(
            'connect agent-packages install',
            args,
            getCommandSpec('connect agent-packages install'),
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
      handler: (args) =>
        runOplAgentPackageUpdate(
          parseAgentPackageInstallArgs(
            'connect agent-packages update',
            args,
            getCommandSpec('connect agent-packages update'),
          ),
        ),
    },
    'connect agent-packages repair': {
      usage: 'opl connect agent-packages repair --package-id <id> [--dry-run]',
      summary: 'Re-record the Framework-owned lock and lifecycle receipt for an installed OPL Agent Package.',
      examples: ['opl connect agent-packages repair --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageRepair(
          parseAgentPackagePackageActionArgs(
            'connect agent-packages repair',
            args,
            getCommandSpec('connect agent-packages repair'),
          ),
        ),
    },
    'connect agent-packages uninstall': {
      usage: 'opl connect agent-packages uninstall --package-id <id> [--dry-run]',
      summary: 'Remove an installed OPL Agent Package lock and write a lifecycle receipt without deleting domain truth.',
      examples: ['opl connect agent-packages uninstall --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageUninstall(
          parseAgentPackagePackageActionArgs(
            'connect agent-packages uninstall',
            args,
            getCommandSpec('connect agent-packages uninstall'),
          ),
        ),
    },
    'connect agent-packages hide': {
      usage: 'opl connect agent-packages hide --package-id <id> [--dry-run]',
      summary: 'Hide an installed OPL Agent Package from ordinary shortcut exposure while keeping its lock.',
      examples: ['opl connect agent-packages hide --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'hide',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages hide',
            args,
            getCommandSpec('connect agent-packages hide'),
          ),
        ),
    },
    'connect agent-packages unhide': {
      usage: 'opl connect agent-packages unhide --package-id <id> [--dry-run]',
      summary: 'Restore an installed OPL Agent Package to ordinary shortcut exposure.',
      examples: ['opl connect agent-packages unhide --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'unhide',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages unhide',
            args,
            getCommandSpec('connect agent-packages unhide'),
          ),
        ),
    },
    'connect agent-packages enable': {
      usage: 'opl connect agent-packages enable --package-id <id> [--dry-run]',
      summary: 'Enable an installed OPL Agent Package exposure state without claiming domain readiness.',
      examples: ['opl connect agent-packages enable --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'enable',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages enable',
            args,
            getCommandSpec('connect agent-packages enable'),
          ),
        ),
    },
    'connect agent-packages disable': {
      usage: 'opl connect agent-packages disable --package-id <id> [--dry-run]',
      summary: 'Disable an installed OPL Agent Package exposure state without uninstalling it.',
      examples: ['opl connect agent-packages disable --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) =>
        runOplAgentPackageExposureAction(
          'disable',
          parseAgentPackagePackageActionArgs(
            'connect agent-packages disable',
            args,
            getCommandSpec('connect agent-packages disable'),
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
      handler: (args) =>
        runOplAgentPackageHomeShortcutPreferencesSet(
          parseAgentPackageHomeShortcutPreferencesSetArgs(
            args,
            getCommandSpec('connect agent-packages home-shortcut-preferences set'),
          ),
        ),
    },
    'connect agent-packages status': {
      usage: 'opl connect agent-packages status [--package-id <id>]',
      summary: 'Read installed OPL Agent Package lock and lifecycle receipt status.',
      examples: ['opl connect agent-packages status --package-id mas --json'],
      group: 'connect',
      help_surface: 'default',
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions(
          'connect agent-packages status',
          args,
          getCommandSpec('connect agent-packages status'),
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
      handler: () => listOplAgentPackages(),
    },
  };
}
