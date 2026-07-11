import {
  runPackBundleCheckCommand,
  runPackBundleManifestCommand,
  runPackBundleWriteCommand,
} from '../../../../modules/pack/pack-bundle.ts';
import { runPackNativeHelperProbeCommand } from '../../../../modules/pack/native-helper-probe.ts';
import { runPackNativeHelperExecutionCommand } from '../../../../modules/runway/index.ts';
import {
  runGenericPackCheckCommand,
  runGenericPackGalleryCommand,
  runGenericPackInspectCommand,
  runGenericPackRunCommand,
  runPackOsCacheCommand,
  runPackOsDistributeCommand,
  runPackOsInstallCommand,
  runPackOsInspectCommand,
  runPackOsLockCommand,
  runPackOsRegistryCommand,
  runPackOsValidateCommand,
} from '../../../../modules/pack/pack-os.ts';
import { assertNoArgs, buildCommandHelp } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildBrandPackCommandSpecs(packInspectFallback?: CommandSpec): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'pack inspect': {
      usage: 'opl pack inspect [--pack <path>]',
      summary: 'Inspect OPL Pack itself, or inspect a generic pack descriptor when --pack is provided.',
      examples: [
        'opl pack inspect --json',
        'opl pack inspect --pack packs/medical-display-core --json',
      ],
      group: 'brand-pack',
      handler: (args) => {
        if (args.includes('--pack')) {
          return runGenericPackInspectCommand(args);
        }
        if (!packInspectFallback) {
          assertNoArgs(args, specs['pack inspect']);
          return buildCommandHelp('pack inspect', specs['pack inspect']);
        }
        return packInspectFallback.handler(args);
      },
    },
    'pack check': {
      usage: 'opl pack check --pack <path>',
      summary: 'Validate a generic pack descriptor with Pack OS false-authority and refs-only checks.',
      examples: [
        'opl pack check --pack packs/medical-display-core --json',
      ],
      group: 'brand-pack',
      handler: runGenericPackCheckCommand,
    },
    'pack run': {
      usage: 'opl pack run --pack <path> [--action <id>] [--template <id>] [--mode <final|candidate>] [--output <ref>]',
      summary: 'Plan a generic pack action without executing domain-owned renderers or claiming authority.',
      examples: [
        'opl pack run --pack packs/medical-display-core --action render --template roc_curve_binary --mode final --json',
      ],
      group: 'brand-pack',
      handler: runGenericPackRunCommand,
    },
    'pack gallery': {
      usage: 'opl pack gallery --pack <path> [--output <ref>]',
      summary: 'Read gallery-capable refs from a generic pack descriptor without rendering gallery artifacts.',
      examples: [
        'opl pack gallery --pack packs/medical-display-core --json',
      ],
      group: 'brand-pack',
      handler: runGenericPackGalleryCommand,
    },
    'pack bundle': {
      usage: 'opl pack bundle <manifest|write|check> --assembly <path>',
      summary: 'Manage source parts to generated aggregate bundles without making generated JSON the source of truth.',
      examples: [
        'opl pack bundle manifest --assembly contracts/stage_control_plane.bundle-assembly.json --json',
        'opl pack bundle write --assembly contracts/stage_control_plane.bundle-assembly.json --json',
        'opl pack bundle check --assembly contracts/stage_control_plane.bundle-assembly.json --json',
      ],
      group: 'brand-pack',
      subcommands: [
        {
          command: 'pack bundle manifest',
          usage: 'opl pack bundle manifest --assembly <path>',
          summary: 'Build the refs-only source digest manifest for a generated aggregate bundle.',
        },
        {
          command: 'pack bundle write',
          usage: 'opl pack bundle write --assembly <path>',
          summary: 'Regenerate the aggregate JSON and bundle manifest from source parts.',
        },
        {
          command: 'pack bundle check',
          usage: 'opl pack bundle check --assembly <path>',
          summary: 'Check that the generated aggregate and manifest still match the source parts.',
        },
      ],
      handler: (args) => {
        assertNoArgs(args, specs['pack bundle']);
        return buildCommandHelp('pack bundle', specs['pack bundle']);
      },
    },
    'pack bundle manifest': {
      usage: 'opl pack bundle manifest --assembly <path>',
      summary: 'Build the refs-only source digest manifest for a generated aggregate bundle.',
      examples: [
        'opl pack bundle manifest --assembly contracts/stage_control_plane.bundle-assembly.json --json',
      ],
      group: 'brand-pack',
      handler: runPackBundleManifestCommand,
    },
    'pack bundle write': {
      usage: 'opl pack bundle write --assembly <path>',
      summary: 'Regenerate aggregate JSON and manifest from editable source parts.',
      examples: [
        'opl pack bundle write --assembly contracts/stage_control_plane.bundle-assembly.json --json',
      ],
      group: 'brand-pack',
      handler: runPackBundleWriteCommand,
    },
    'pack bundle check': {
      usage: 'opl pack bundle check --assembly <path>',
      summary: 'Validate that a generated aggregate and manifest still match editable source parts.',
      examples: [
        'opl pack bundle check --assembly contracts/stage_control_plane.bundle-assembly.json --json',
      ],
      group: 'brand-pack',
      handler: runPackBundleCheckCommand,
    },
    'pack native-helper': {
      usage: 'opl pack native-helper <probe|run>',
      summary: 'Probe or execute a declared domain-owned native helper without claiming domain authority.',
      examples: [
        'opl pack native-helper probe --descriptor contracts/native-helper.json --json',
        'opl pack native-helper run --catalog contracts/runtime-program/python-native-helper-catalog.json --helper deck_review --request request.json --json',
      ],
      group: 'brand-pack',
      subcommands: [
        {
          command: 'pack native-helper probe',
          usage: 'opl pack native-helper probe --descriptor <path>',
          summary: 'Resolve declared helper content and required commands into a content-bound no-authority receipt.',
        },
        {
          command: 'pack native-helper run',
          usage: 'opl pack native-helper run --catalog <catalog.json> --helper <id> --request <request.json>',
          summary: 'Execute one catalog-declared Python helper through the OPL-owned process carrier.',
        },
      ],
      handler: (args) => {
        assertNoArgs(args, specs['pack native-helper']);
        return buildCommandHelp('pack native-helper', specs['pack native-helper']);
      },
    },
    'pack native-helper probe': {
      usage: 'opl pack native-helper probe --descriptor <path>',
      summary: 'Resolve declared helper content and required commands into a content-bound no-authority receipt.',
      examples: ['opl pack native-helper probe --descriptor contracts/native-helper.json --json'],
      group: 'brand-pack',
      handler: runPackNativeHelperProbeCommand,
    },
    'pack native-helper run': {
      usage: 'opl pack native-helper run --catalog <catalog.json> --helper <id> --request <request.json>',
      summary: 'Execute one catalog-declared Python helper through the OPL-owned process carrier.',
      examples: ['opl pack native-helper run --catalog contracts/runtime-program/python-native-helper-catalog.json --helper deck_review --request request.json --json'],
      group: 'brand-pack',
      handler: runPackNativeHelperExecutionCommand,
    },
    'pack os inspect': {
      usage: 'opl pack os inspect --descriptor <path>',
      summary: 'Inspect a generic capability-pack descriptor through OPL Pack OS without claiming domain authority.',
      examples: [
        'opl pack os inspect --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsInspectCommand,
    },
    'pack os install': {
      usage: 'opl pack os install --descriptor <path> --registry <path> [--cache-root <dir>]',
      summary: 'Install a generic capability-pack descriptor into the OPL refs-only Pack OS registry and cache.',
      examples: [
        'opl pack os install --descriptor display_pack.json --registry build/pack-registry.json --json',
        'opl pack os install --descriptor display_pack.json --registry build/pack-registry.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsInstallCommand,
    },
    'pack os registry': {
      usage: 'opl pack os registry --registry <path>',
      summary: 'Read an OPL Pack OS registry without claiming pack quality or domain readiness.',
      examples: [
        'opl pack os registry --registry build/pack-registry.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsRegistryCommand,
    },
    'pack os cache': {
      usage: 'opl pack os cache --descriptor <path> --cache-root <dir>',
      summary: 'Materialize present local pack resources into an OPL content-addressed cache.',
      examples: [
        'opl pack os cache --descriptor display_pack.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsCacheCommand,
    },
    'pack os distribute': {
      usage: 'opl pack os distribute --descriptor <path> --output <path> [--cache-root <dir>]',
      summary: 'Write a refs-only Pack OS distribution bundle manifest for a generic capability pack.',
      examples: [
        'opl pack os distribute --descriptor display_pack.json --output build/pack-distribution.json --json',
        'opl pack os distribute --descriptor display_pack.json --output build/pack-distribution.json --cache-root build/pack-cache --json',
      ],
      group: 'brand-pack',
      handler: runPackOsDistributeCommand,
    },
    'pack os lock': {
      usage: 'opl pack os lock --descriptor <path> [--output <path>]',
      summary: 'Resolve a generic capability-pack descriptor into a refs-only Pack OS lock.',
      examples: [
        'opl pack os lock --descriptor display_pack.json --json',
        'opl pack os lock --descriptor display_pack.json --output build/pack-lock.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsLockCommand,
    },
    'pack os validate': {
      usage: 'opl pack os validate --descriptor <path>',
      summary: 'Validate the generic Pack OS descriptor boundary and false-authority flags.',
      examples: [
        'opl pack os validate --descriptor display_pack.json --json',
      ],
      group: 'brand-pack',
      handler: runPackOsValidateCommand,
    },
  };
  return specs;
}
