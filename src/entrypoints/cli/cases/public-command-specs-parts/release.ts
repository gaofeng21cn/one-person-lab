import {
  admitReleaseBundleOperation,
  buildReleaseBundle,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
  type ReleaseBundleStableOperation,
  type ReleaseBundleTrackName,
} from '../../../../modules/connect/release-bundle/index.ts';
import {
  parseRegisteredCommandOptions,
  type CommandSpec,
} from '../../modules/support.ts';
import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';

function stringOption(values: Record<string, unknown>, name: string) {
  const value = values[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(values: Record<string, unknown>, name: string) {
  const value = stringOption(values, name);
  if (!value) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Release operation option --${name} must be a non-empty string.`,
      { option: name, surface_kind: 'opl_release_bundle_operation_control.v1' },
    );
  }
  return value;
}

function operationInvocation(values: Record<string, unknown>) {
  return {
    releaseOperation: requiredString(values, 'operation') as ReleaseBundleStableOperation,
    operationId: requiredString(values, 'operation-id'),
    operationStartedAt: requiredString(values, 'operation-started-at'),
    operationDeadlineAt: requiredString(values, 'operation-deadline-at'),
  };
}

export function buildReleaseCommandSpecs(
  resolveSpec: (command: string) => CommandSpec,
): Record<string, CommandSpec> {
  const parse = (command: string, args: string[]) =>
    parseRegisteredCommandOptions(command, args, resolveSpec(command));

  return {
    'release freeze': {
      usage: 'opl release freeze --request <freeze-request.json> [--source-root <directory>] [--store <directory>]',
      summary: 'Freeze one immutable executor-neutral Release Bundle with prepared AI notes and exact transitive inputs.',
      examples: ['opl release freeze --request release-freeze.json --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release freeze', args);
        return freezeReleaseBundle({
          requestPath: String(values.request),
          sourceRoot: stringOption(values, 'source-root'),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release build': {
      usage: 'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
      summary: 'Stage one local or remote executor result exactly once; unknown outcomes require reconcile.',
      examples: [
        'opl release build --bundle sha256:<digest> --executor-receipt build-receipt.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release build', args);
        return buildReleaseBundle({
          ...operationInvocation(values),
          bundleDigest: String(values.bundle),
          executorReceiptPath: String(values['executor-receipt']),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release operation admit': {
      usage: 'opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
      summary: 'Freeze or exactly resume one immutable operation control before any build, verify, or publish plan.',
      examples: [
        'opl release operation admit --bundle sha256:<digest> --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release operation admit', args);
        return admitReleaseBundleOperation({
          ...operationInvocation(values),
          bundleDigest: String(values.bundle),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release checkpoint export': {
      usage: 'opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
      summary: 'Export one deterministic portable checkpoint without rebuilding or importing publication state.',
      examples: [
        'opl release checkpoint export --bundle sha256:<digest> --output release-checkpoint --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release checkpoint export', args);
        return exportReleaseBundleCheckpoint({
          bundleDigest: String(values.bundle),
          outputDirectory: String(values.output),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release checkpoint import': {
      usage: 'opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
      summary: 'Import exact frozen, built, and qualified bytes without rebuilding; publication still requires fresh readback.',
      examples: [
        'opl release checkpoint import --checkpoint release-checkpoint/checkpoint.json --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release checkpoint import', args);
        return importReleaseBundleCheckpoint({
          checkpointPath: String(values.checkpoint),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release verify': {
      usage: 'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
      summary: 'Bind a passed same-byte installed-artifact qualification receipt to one staged Bundle track.',
      examples: [
        'opl release verify --bundle sha256:<digest> --qualification-receipt vm-qualification.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release verify', args);
        return verifyReleaseBundle({
          ...operationInvocation(values),
          bundleDigest: String(values.bundle),
          qualificationReceiptPath: String(values['qualification-receipt']),
          track: stringOption(values, 'track') as ReleaseBundleTrackName | undefined,
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release publish': {
      usage: 'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
      summary: 'Plan exact missing-asset uploads, accept same-name same-digest assets, and fail closed on conflicts.',
      examples: [
        'opl release publish --bundle sha256:<digest> --executor-receipt remote-inspect.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release publish', args);
        return publishReleaseBundle({
          ...operationInvocation(values),
          bundleDigest: String(values.bundle),
          executorReceiptPath: String(values['executor-receipt']),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release reconcile': {
      usage: 'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
      summary: 'Resolve a prior unknown build or publish result from one fresh executor observation without retrying it.',
      examples: [
        'opl release reconcile --bundle sha256:<digest> --executor-receipt fresh-observation.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json',
      ],
      group: 'release',
      handler: (args) => {
        const values = parse('release reconcile', args);
        return reconcileReleaseBundle({
          ...operationInvocation(values),
          bundleDigest: String(values.bundle),
          executorReceiptPath: String(values['executor-receipt']),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release status': {
      usage: 'opl release status --bundle <sha256:digest> [--store <directory>]',
      summary: 'Read immutable Bundle identity, qualification, publication and reconcile state without external mutation.',
      examples: ['opl release status --bundle sha256:<digest> --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release status', args);
        return readReleaseBundleStatus({
          bundleDigest: String(values.bundle),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
  };
}
