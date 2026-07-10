import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseJsonText } from '../../../../kernel/json-file.ts';
import {
  buildOkfContextBundleFromDomainPack,
  buildOkfContextBundleFromDomainRepo,
  inspectOkfContextBundle,
  inspectOkfNativeFrontmatter,
  validateOkfContextBundle,
  writeOkfContextBundleProjection,
} from '../../../../modules/pack/okf-context-bundle.ts';
import type { OkfDomainPackCompilerInput } from '../../../../modules/pack/okf-context-bundle.ts';
import { buildUsageError, parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parseOkfBundleArgs(args: string[], spec: CommandSpec) {
  const bundlePath = parseCommandOptions(args, spec, {
    bundle: { type: 'string' },
  }).bundle as string | undefined;
  if (!bundlePath) {
    throw buildUsageError('okf command requires --bundle.', spec, {
      required: ['--bundle'],
    });
  }
  return { bundlePath };
}

function parseOkfProjectPackArgs(args: string[], spec: CommandSpec) {
  const values = parseCommandOptions(args, spec, {
    pack: { type: 'string' },
    output: { type: 'string' },
    'bundle-id': { type: 'string' },
    'source-root-ref': { type: 'string' },
  });
  const packPath = values.pack as string | undefined;
  const outputPath = values.output as string | undefined;
  if (!packPath || !outputPath) {
    throw buildUsageError('okf project-pack requires --pack and --output.', spec, {
      required: ['--pack', '--output'],
    });
  }
  return {
    bundleId: values['bundle-id'] as string | undefined,
    outputPath,
    packPath,
    sourceRootRef: values['source-root-ref'] as string | undefined,
  };
}

function parseOkfProjectRepoArgs(args: string[], spec: CommandSpec) {
  const values = parseCommandOptions(args, spec, {
    repo: { type: 'string' },
    output: { type: 'string' },
    pack: { type: 'string' },
    'memory-descriptor': { type: 'string' },
    'no-memory-locators': { type: 'boolean' },
    'bundle-id': { type: 'string' },
    'source-root-ref': { type: 'string' },
  });
  const repoRoot = values.repo as string | undefined;
  const outputPath = values.output as string | undefined;
  if (!repoRoot || !outputPath) {
    throw buildUsageError('okf project-repo requires --repo and --output.', spec, {
      required: ['--repo', '--output'],
    });
  }
  return {
    bundleId: values['bundle-id'] as string | undefined,
    includeMemoryLocators: values['no-memory-locators'] !== true,
    memoryDescriptorPath: values['memory-descriptor'] as string | undefined,
    outputPath,
    packPath: values.pack as string | undefined,
    repoRoot,
    sourceRootRef: values['source-root-ref'] as string | undefined,
  };
}

function parseOkfNativeFrontmatterInspectArgs(args: string[], spec: CommandSpec) {
  const values = parseCommandOptions(args, spec, {
    repo: { type: 'string' },
    'agent-root': { type: 'string' },
  });
  const repoRoot = values.repo as string | undefined;
  if (!repoRoot) {
    throw buildUsageError('okf native-frontmatter inspect requires --repo.', spec, {
      required: ['--repo'],
    });
  }
  return {
    agentRoot: values['agent-root'] as string | undefined,
    repoRoot,
  };
}

export function buildOkfCommandSpecs(): Record<string, CommandSpec> {
  const okfCommandSpecs: Record<string, CommandSpec> = {
    'okf validate': {
      usage: 'opl okf validate --bundle <path>',
      summary: 'Validate an OKF v0.1 context bundle projection without taking runtime or domain authority.',
      examples: ['opl okf validate --bundle ./okf --json'],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfBundleArgs(args, okfCommandSpecs['okf validate']);
        return {
          version: 'g2',
          okf_validation: validateOkfContextBundle(parsed),
        };
      },
    },
    'okf inspect': {
      usage: 'opl okf inspect --bundle <path>',
      summary: 'Inspect the OPL OKF context bundle contract and file-role readback.',
      examples: ['opl okf inspect --bundle ./okf --json'],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfBundleArgs(args, okfCommandSpecs['okf inspect']);
        return {
          version: 'g2',
          okf_bundle: inspectOkfContextBundle(parsed),
        };
      },
    },
    'okf project-pack': {
      usage:
        'opl okf project-pack --pack <pack_compiler_input.json> --output <okf_dir> [--bundle-id <id>] [--source-root-ref <ref>]',
      summary:
        'Project a Foundry Agent domain pack compiler input into a body-free OKF context bundle directory.',
      examples: [
        'opl okf project-pack --pack ./contracts/pack_compiler_input.json --output ./okf --json',
        'opl okf project-pack --pack ./contracts/pack_compiler_input.json --output ./okf --source-root-ref repo:opl-bookforge --json',
      ],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfProjectPackArgs(args, okfCommandSpecs['okf project-pack']);
        const packInput = parseJsonText(
          readFileSync(resolve(parsed.packPath), 'utf8'),
        ) as OkfDomainPackCompilerInput;
        const projection = buildOkfContextBundleFromDomainPack(packInput, {
          bundleId: parsed.bundleId,
          sourceRootRef: parsed.sourceRootRef,
        });
        return {
          version: 'g2',
          okf_projection: projection,
          okf_write: writeOkfContextBundleProjection(projection, parsed.outputPath),
          okf_validation: validateOkfContextBundle({ bundlePath: parsed.outputPath }),
        };
      },
    },
    'okf project-repo': {
      usage:
        'opl okf project-repo --repo <domain_repo> --output <okf_dir> [--pack <path>] [--memory-descriptor <path>] [--no-memory-locators] [--bundle-id <id>] [--source-root-ref <ref>]',
      summary:
        'Project a domain repo pack compiler input and optional memory descriptor into one body-free OKF context bundle directory.',
      examples: [
        'opl okf project-repo --repo ../opl-bookforge --output ./okf --json',
        'opl okf project-repo --repo ../med-autoscience --output ./okf --source-root-ref repo:med-autoscience --json',
      ],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfProjectRepoArgs(args, okfCommandSpecs['okf project-repo']);
        const readback = buildOkfContextBundleFromDomainRepo({
          bundleId: parsed.bundleId,
          includeMemoryLocators: parsed.includeMemoryLocators,
          memoryDescriptorPath: parsed.memoryDescriptorPath,
          packPath: parsed.packPath,
          repoRoot: parsed.repoRoot,
          sourceRootRef: parsed.sourceRootRef,
        });
        return {
          version: 'g2',
          okf_domain_repo: {
            ...readback,
            okf_write: writeOkfContextBundleProjection(readback.projection, parsed.outputPath),
            okf_validation: validateOkfContextBundle({ bundlePath: parsed.outputPath }),
          },
        };
      },
    },
    'okf native-frontmatter inspect': {
      usage:
        'opl okf native-frontmatter inspect --repo <domain_repo> [--agent-root <path>]',
      summary:
        'Inspect native OKF-compatible frontmatter in domain-owned agent markdown as an advisory migration lane only.',
      examples: [
        'opl okf native-frontmatter inspect --repo ../opl-bookforge --json',
        'opl okf native-frontmatter inspect --repo ../med-autoscience --agent-root agent --json',
      ],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfNativeFrontmatterInspectArgs(
          args,
          okfCommandSpecs['okf native-frontmatter inspect'],
        );
        return {
          version: 'g2',
          okf_native_frontmatter: inspectOkfNativeFrontmatter(parsed),
        };
      },
    },
  };
  return okfCommandSpecs;
}
