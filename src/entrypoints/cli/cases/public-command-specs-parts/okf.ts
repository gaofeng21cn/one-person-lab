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
import { buildUsageError } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parseOkfBundleArgs(args: string[], spec: CommandSpec) {
  let bundlePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      continue;
    }
    if (arg === '--bundle') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf command requires a value for --bundle.', spec, {
          required: ['--bundle'],
        });
      }
      bundlePath = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown okf option: ${arg}.`, spec, {
      option: arg,
    });
  }
  if (!bundlePath) {
    throw buildUsageError('okf command requires --bundle.', spec, {
      required: ['--bundle'],
    });
  }
  return { bundlePath };
}

function parseOkfProjectPackArgs(args: string[], spec: CommandSpec) {
  let packPath: string | undefined;
  let outputPath: string | undefined;
  let bundleId: string | undefined;
  let sourceRootRef: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      continue;
    }
    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-pack requires a value for --pack.', spec, {
          required: ['--pack'],
        });
      }
      packPath = value;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-pack requires a value for --output.', spec, {
          required: ['--output'],
        });
      }
      outputPath = value;
      index += 1;
      continue;
    }
    if (arg === '--bundle-id') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-pack requires a value for --bundle-id.', spec, {
          option: '--bundle-id',
        });
      }
      bundleId = value;
      index += 1;
      continue;
    }
    if (arg === '--source-root-ref') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-pack requires a value for --source-root-ref.', spec, {
          option: '--source-root-ref',
        });
      }
      sourceRootRef = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown okf project-pack option: ${arg}.`, spec, {
      option: arg,
    });
  }
  if (!packPath || !outputPath) {
    throw buildUsageError('okf project-pack requires --pack and --output.', spec, {
      required: ['--pack', '--output'],
    });
  }
  return {
    bundleId,
    outputPath,
    packPath,
    sourceRootRef,
  };
}

function parseOkfProjectRepoArgs(args: string[], spec: CommandSpec) {
  let repoRoot: string | undefined;
  let outputPath: string | undefined;
  let packPath: string | undefined;
  let memoryDescriptorPath: string | undefined;
  let bundleId: string | undefined;
  let sourceRootRef: string | undefined;
  let includeMemoryLocators = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      continue;
    }
    if (arg === '--repo') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --repo.', spec, {
          required: ['--repo'],
        });
      }
      repoRoot = value;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --output.', spec, {
          required: ['--output'],
        });
      }
      outputPath = value;
      index += 1;
      continue;
    }
    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --pack.', spec, {
          option: '--pack',
        });
      }
      packPath = value;
      index += 1;
      continue;
    }
    if (arg === '--memory-descriptor') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --memory-descriptor.', spec, {
          option: '--memory-descriptor',
        });
      }
      memoryDescriptorPath = value;
      index += 1;
      continue;
    }
    if (arg === '--no-memory-locators') {
      includeMemoryLocators = false;
      continue;
    }
    if (arg === '--bundle-id') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --bundle-id.', spec, {
          option: '--bundle-id',
        });
      }
      bundleId = value;
      index += 1;
      continue;
    }
    if (arg === '--source-root-ref') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf project-repo requires a value for --source-root-ref.', spec, {
          option: '--source-root-ref',
        });
      }
      sourceRootRef = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown okf project-repo option: ${arg}.`, spec, {
      option: arg,
    });
  }
  if (!repoRoot || !outputPath) {
    throw buildUsageError('okf project-repo requires --repo and --output.', spec, {
      required: ['--repo', '--output'],
    });
  }
  return {
    bundleId,
    includeMemoryLocators,
    memoryDescriptorPath,
    outputPath,
    packPath,
    repoRoot,
    sourceRootRef,
  };
}

function parseOkfNativeFrontmatterInspectArgs(args: string[], spec: CommandSpec) {
  let repoRoot: string | undefined;
  let agentRoot: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      continue;
    }
    if (arg === '--repo') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf native-frontmatter inspect requires a value for --repo.', spec, {
          required: ['--repo'],
        });
      }
      repoRoot = value;
      index += 1;
      continue;
    }
    if (arg === '--agent-root') {
      const value = args[index + 1];
      if (!value) {
        throw buildUsageError('okf native-frontmatter inspect requires a value for --agent-root.', spec, {
          option: '--agent-root',
        });
      }
      agentRoot = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown okf native-frontmatter inspect option: ${arg}.`, spec, {
      option: arg,
    });
  }
  if (!repoRoot) {
    throw buildUsageError('okf native-frontmatter inspect requires --repo.', spec, {
      required: ['--repo'],
    });
  }
  return {
    agentRoot,
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
