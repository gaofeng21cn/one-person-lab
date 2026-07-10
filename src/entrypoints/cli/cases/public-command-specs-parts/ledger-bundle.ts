import {
  doctorArtifactProvenanceBundle,
  exportArtifactProvenanceBundle,
  inspectArtifactProvenanceBundle,
  recordArtifactProvenanceBundle,
  validateArtifactProvenanceBundle,
} from '../../../../modules/ledger/index.ts';
import { buildUsageError, parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parseBundleArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const parsed = parseCommandOptions(args, spec, { bundle: { type: 'string' } });
  const bundle = parsed.bundle as string | undefined;
  if (!bundle) {
    throw buildUsageError('ledger bundle requires --bundle.', spec, { required: ['--bundle'] });
  }
  return { bundlePath: bundle };
}

function parseInspectArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const parsed = parseCommandOptions(args, spec, {
    artifact: { type: 'string' },
    bundle: { type: 'string' },
  });
  const artifact = parsed.artifact as string | undefined;
  const bundle = parsed.bundle as string | undefined;
  if (bundle && !artifact) return { bundlePath: bundle };
  if (artifact && !bundle) return { artifactRef: artifact };
  throw buildUsageError('ledger bundle inspect requires exactly one of --bundle or --artifact.', spec, {
    required_one_of: ['--bundle', '--artifact'],
  });
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const parsed = parseCommandOptions(args, spec, {
    artifact: { type: 'string' },
    bundle: { type: 'string' },
    domain: { type: 'string' },
  });
  const artifact = parsed.artifact as string | undefined;
  const bundle = parsed.bundle as string | undefined;
  const domain = parsed.domain as string | undefined;
  if (!bundle) throw buildUsageError('ledger bundle requires --bundle.', spec, { required: ['--bundle'] });
  if (!domain) throw buildUsageError('ledger bundle requires --domain.', spec, { required: ['--domain'] });
  if (!artifact) throw buildUsageError('ledger bundle requires --artifact.', spec, { required: ['--artifact'] });
  return {
    bundlePath: bundle,
    domainId: domain,
    artifactRef: artifact,
  };
}

function parseExportArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const parsed = parseCommandOptions(args, spec, {
    bundle: { type: 'string' },
    format: { type: 'string' },
  });
  const bundle = parsed.bundle as string | undefined;
  const format = parsed.format as string | undefined;
  if (!bundle) {
    throw buildUsageError('ledger bundle requires --bundle.', spec, { required: ['--bundle'] });
  }
  if (!format) {
    throw buildUsageError('ledger bundle requires --format.', spec, { required: ['--format'] });
  }
  if (format !== 'ro-crate') {
    throw buildUsageError('ledger bundle export --format must be ro-crate.', spec, {
      format,
      allowed_formats: ['ro-crate'],
    });
  }
  return {
    bundlePath: bundle,
    format: 'ro-crate' as const,
  };
}

export function buildLedgerBundleCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {};
  specs['ledger bundle validate'] = {
    usage: 'opl ledger bundle validate --bundle <path>',
    summary: 'Validate an artifact provenance bundle manifest without reading artifact bodies.',
    examples: ['opl ledger bundle validate --bundle bundle.json --json'],
    group: 'brand-ledger',
    handler: (args) => ({
      artifact_provenance_bundle_validation: validateArtifactProvenanceBundle(
        parseBundleArgs(args, specs['ledger bundle validate']).bundlePath,
      ),
    }),
  };
  specs['ledger bundle inspect'] = {
    usage: 'opl ledger bundle inspect (--bundle <path> | --artifact <ref>)',
    summary: 'Inspect artifact provenance bundle refs from a manifest or recorded OPL state without reading artifact bodies.',
    examples: [
      'opl ledger bundle inspect --bundle bundle.json --json',
      'opl ledger bundle inspect --artifact artifact://mas/demo --json',
    ],
    group: 'brand-ledger',
    handler: (args) => ({
      artifact_provenance_bundle_inspection: inspectArtifactProvenanceBundle(
        parseInspectArgs(args, specs['ledger bundle inspect']),
      ),
    }),
  };
  specs['ledger bundle record'] = {
    usage: 'opl ledger bundle record --bundle <path> --domain <id> --artifact <ref>',
    summary: 'Record artifact provenance bundle refs, manifest hash, and index keys in OPL default state without storing bodies.',
    examples: [
      'opl ledger bundle record --bundle bundle.json --domain medautoscience --artifact artifact://mas/demo --json',
    ],
    group: 'brand-ledger',
    handler: (args) => ({
      artifact_provenance_bundle_record: recordArtifactProvenanceBundle(
        parseRecordArgs(args, specs['ledger bundle record']),
      ),
    }),
  };
  specs['ledger bundle export'] = {
    usage: 'opl ledger bundle export --bundle <path> --format ro-crate',
    summary: 'Generate minimal RO-Crate metadata for an artifact provenance bundle without adding dependencies.',
    examples: ['opl ledger bundle export --bundle bundle.json --format ro-crate --json'],
    group: 'brand-ledger',
    handler: (args) => ({
      artifact_provenance_bundle_export: exportArtifactProvenanceBundle(
        parseExportArgs(args, specs['ledger bundle export']),
      ),
    }),
  };
  specs['ledger bundle doctor'] = {
    usage: 'opl ledger bundle doctor --bundle <path>',
    summary: 'Diagnose artifact provenance bundle manifest refs, hashes, body leakage fields, and refs-only authority.',
    examples: ['opl ledger bundle doctor --bundle bundle.json --json'],
    group: 'brand-ledger',
    handler: (args) => ({
      artifact_provenance_bundle_doctor: doctorArtifactProvenanceBundle(
        parseBundleArgs(args, specs['ledger bundle doctor']).bundlePath,
      ),
    }),
  };
  const subcommands = [
    'ledger bundle validate',
    'ledger bundle inspect',
    'ledger bundle record',
    'ledger bundle export',
    'ledger bundle doctor',
  ].map((command) => ({
    command,
    usage: specs[command].usage,
    summary: specs[command].summary,
  }));
  specs['ledger bundle'] = {
    usage: 'opl ledger bundle <validate|inspect|record|export|doctor>',
    summary: 'Artifact Provenance Bundle refs-only commands under OPL Ledger.',
    examples: ['opl ledger bundle validate --bundle bundle.json --json'],
    group: 'brand-ledger',
    subcommands,
    handler: (args) => {
      const unexpected = args.filter((token) => token !== '--json');
      if (unexpected.length > 0) {
        throw buildUsageError(
          `Unknown ledger bundle subcommand: ${unexpected[0]}.`,
          specs['ledger bundle'],
          { subcommands: subcommands.map((entry) => entry.command) },
        );
      }
      return {
        artifact_provenance_bundle_commands: {
          surface_kind: 'opl_artifact_provenance_bundle_command_group',
          subcommands,
          authority_boundary: {
            ledger_refs_only: true,
            artifact_body_read: false,
            can_store_artifact_body: false,
            can_mutate_artifact_body: false,
            can_write_domain_truth: false,
          },
        },
      };
    },
  };
  return specs;
}
