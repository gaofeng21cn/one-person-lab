import {
  buildReleaseBundle,
  freezeReleaseBundle,
  publishReleaseBundle,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
  type ReleaseBundleTrackName,
} from '../../../../modules/connect/release-bundle/index.ts';
import {
  parseRegisteredCommandOptions,
  type CommandSpec,
} from '../../modules/support.ts';

function stringOption(values: Record<string, unknown>, name: string) {
  const value = values[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
      usage: 'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> [--store <directory>]',
      summary: 'Stage one local or remote executor result exactly once; unknown outcomes require reconcile.',
      examples: ['opl release build --bundle sha256:<digest> --executor-receipt build-receipt.json --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release build', args);
        return buildReleaseBundle({
          bundleDigest: String(values.bundle),
          executorReceiptPath: String(values['executor-receipt']),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release verify': {
      usage: 'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> [--track standard|full] [--store <directory>]',
      summary: 'Bind a passed same-byte installed-artifact qualification receipt to one staged Bundle track.',
      examples: ['opl release verify --bundle sha256:<digest> --qualification-receipt vm-qualification.json --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release verify', args);
        return verifyReleaseBundle({
          bundleDigest: String(values.bundle),
          qualificationReceiptPath: String(values['qualification-receipt']),
          track: stringOption(values, 'track') as ReleaseBundleTrackName | undefined,
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release publish': {
      usage: 'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> [--store <directory>]',
      summary: 'Plan exact missing-asset uploads, accept same-name same-digest assets, and fail closed on conflicts.',
      examples: ['opl release publish --bundle sha256:<digest> --executor-receipt remote-inspect.json --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release publish', args);
        return publishReleaseBundle({
          bundleDigest: String(values.bundle),
          executorReceiptPath: String(values['executor-receipt']),
          storeRoot: stringOption(values, 'store'),
        });
      },
    },
    'release reconcile': {
      usage: 'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> [--store <directory>]',
      summary: 'Resolve a prior unknown build or publish result from one fresh executor observation without retrying it.',
      examples: ['opl release reconcile --bundle sha256:<digest> --executor-receipt fresh-observation.json --json'],
      group: 'release',
      handler: (args) => {
        const values = parse('release reconcile', args);
        return reconcileReleaseBundle({
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
