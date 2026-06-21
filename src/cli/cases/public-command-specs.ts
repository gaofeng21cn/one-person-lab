import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../contracts.ts';
import { buildOplFrameworkLocator } from '../../opl-framework-locator.ts';
import { buildFrameworkOperatingMaturityReadout } from '../../framework-operating-maturity.ts';
import { buildFrameworkReadinessSummary } from '../../framework-readiness.ts';
import { buildFrameworkTrancheBacklogReadback } from '../../framework-tranche-backlog.ts';
import {
  buildOkfContextBundleFromDomainPack,
  buildOkfContextBundleFromDomainRepo,
  inspectOkfContextBundle,
  inspectOkfNativeFrontmatter,
  validateOkfContextBundle,
  writeOkfContextBundleProjection,
} from '../../okf-context-bundle.ts';
import { buildOplAppState, parseAppActionExecuteArgs, parseAppStateArgs, runOplAppActionExecute } from '../../app-state.ts';
import { runOplEngineAction } from '../../system-installation/engine-actions.ts';
import { runOplTurnkeyInstall } from '../../system-installation/turnkey.ts';
import {
  buildFamilyActionExport,
  buildFamilyActionInspect,
  buildFamilyActionsList,
} from '../../family-action-catalog.ts';
import {
  buildFamilyAgentDescriptorInspect,
  buildFamilyAgentDescriptorList,
} from '../../family-domain-agent-descriptor.ts';
import {
  buildGeneratedAgentInterfaces,
  buildDomainPackCompilerInspect,
  buildDomainPackCompilerList,
  parsePackCompilerArgs,
} from '../../domain-pack-compiler.ts';
import {
  buildAgentDefaultCallerReadinessReport,
  buildAgentPlatformSurfaceOwnershipReport,
} from '../../agent-platform-surface-ownership.ts';
import {
  buildPrivatePlatformResidueOwnerDecisionLedgerCommand,
} from '../../private-platform-residue-owner-decisions.ts';
import { buildAgentReadinessSummary } from '../../agent-readiness.ts';
import { buildStandardDomainAgentConformanceReport } from '../../standard-domain-agent-conformance.ts';
import { agentsEvidenceApplySpec } from './agent-evidence-command-spec.ts';
import {
  buildFamilyAgentInspect,
  buildFamilyAgentsList,
  runFamilyAgentLegacyCleanupApply,
} from '../../family-domain-agent-skeleton.ts';
import {
  buildFamilyDomainMemoryInspect,
  buildFamilyDomainMemoryList,
  buildFamilyDomainMemoryMigrationPlan,
} from '../../family-domain-memory.ts';
import {
  buildGenericSubstrateProjectionInspect,
  buildGenericSubstrateProjectionList,
  buildGenericSubstrateWorkbench,
} from '../../generic-substrate-projection.ts';
import { runProductEntryResume } from '../../product-entry-runtime.ts';
import type { FrameworkContracts } from '../../types.ts';
import { buildPublicSystemCommandSpecs } from './system-public-command-specs.ts';
import { buildPublicAgentLabCommandSpecs } from './agent-lab-public-command-specs.ts';
import { buildPublicWorkOrderCommandSpecs } from './work-order-public-command-specs.ts';
import { buildPublicRuntimeCommandSpecs } from './runtime-public-command-specs.ts';
import {
  buildPublicEngineActionPayload,
  buildPublicTurnkeyInstallPayload,
} from '../modules/public-payloads.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, parseOplEngineArgs, parseResumeArgs, parseTurnkeyInstallArgs, printJson, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';
import { buildBrandCommandSpecs } from './public-command-specs-parts/brand.ts';
import { buildConnectCommandSpecs } from './public-command-specs-parts/connect.ts';
import { buildFoundryCommandSpecs } from './public-command-specs-parts/foundry.ts';
import { buildStageCommandSpecs, validateStageDerivedLensCommandSpecs } from './public-command-specs-parts/stages.ts';
import { buildUpdateCommandSpecs } from './public-command-specs-parts/update.ts';
import { buildWorkspaceCommandSpecs } from './public-command-specs-parts/workspace.ts';

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

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const buildEngineActionSpec = (
    action: 'install' | 'update' | 'reinstall' | 'remove',
    usage: string,
    example: string,
    summary?: string,
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage,
      summary: summary ?? `${action[0].toUpperCase()}${action.slice(1)} one OPL execution engine.`,
      examples: [example],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runOplEngineAction(
            getContracts(),
            action,
            parseOplEngineArgs(args, spec).engineId!,
          ),
        ),
    };
    return spec;
  };

  const installSpec: CommandSpec = {
    usage:
      'opl install [--modules <mas,mag,rca>] [--module <module_id>] [--skip-modules] [--skip-engines] [--skip-native-helper-repair] [--skip-gui-open] [--no-online-runtime]',
    summary: 'One-shot install for Codex, the configured family runtime provider, family modules, Codex skills, and the OPL GUI app.',
    examples: [
      'opl install',
      'opl install --modules mas,mag,rca',
      'opl install --modules mas --skip-engines --skip-gui-open',
    ],
    group: 'top_level',
    handler: async (args) => buildPublicTurnkeyInstallPayload(
      await runOplTurnkeyInstall(getContracts(), parseTurnkeyInstallArgs(args, installSpec)),
    ),
  };

  const systemCommandSpecs = buildPublicSystemCommandSpecs(getContracts);
  const agentLabCommandSpecs = buildPublicAgentLabCommandSpecs();
  const workOrderCommandSpecs = buildPublicWorkOrderCommandSpecs();
  const runtimeCommandSpecs = buildPublicRuntimeCommandSpecs(commandSpecs);
  const brandCommandSpecs = buildBrandCommandSpecs(getContracts);
  const connectCommandSpecs = buildConnectCommandSpecs(commandSpecs, systemCommandSpecs);
  const foundryCommandSpecs = buildFoundryCommandSpecs();
  const stageCommandSpecs = buildStageCommandSpecs(getContracts);
  const updateCommandSpecs = buildUpdateCommandSpecs(getContracts);
  const workspaceCommandSpecs = buildWorkspaceCommandSpecs(commandSpecs);

  const engineInstallSpec = buildEngineActionSpec(
    'install',
    'opl engine install --engine codex',
    'opl engine install --engine codex',
  );
  const engineUpdateSpec = buildEngineActionSpec(
    'update',
    'opl engine update --engine codex',
    'opl engine update --engine codex',
  );
  const engineReinstallSpec = buildEngineActionSpec(
    'reinstall',
    'opl engine reinstall --engine codex',
    'opl engine reinstall --engine codex',
  );
  const engineRemoveSpec = buildEngineActionSpec(
    'remove',
    'opl engine remove --engine codex',
    'opl engine remove --engine codex',
  );

  const publicCommandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command ...]',
      summary: 'Show the top-level command groups or command-scoped runnable examples.',
      examples: ['opl help', 'opl help status workspace', 'opl help connect install'],
      group: 'top_level',
      handler: (args) => {
        if (args.length === 0) {
          return buildRootHelp(publicCommandSpecs);
        }

        const helpTarget = args.join(' ');
        const helpSpec = publicCommandSpecs[helpTarget];
        if (!helpSpec) {
          const prefixMatches = Object.entries(publicCommandSpecs)
            .filter(([command]) => command.startsWith(`${helpTarget} `));
          if (prefixMatches.length > 0) {
            return buildCommandHelp(helpTarget, {
              usage: `opl ${helpTarget} <command>`,
              summary: `Show commands under the ${helpTarget} namespace.`,
              examples: prefixMatches.slice(0, 5).map(([command]) => `opl ${command} --json`),
              group: helpTarget,
              handler: () => null,
              subcommands: prefixMatches.map(([command, spec]) => ({
                command,
                usage: spec.usage,
                summary: spec.summary,
              })),
            });
          }
          throw new FrameworkContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(publicCommandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    install: installSpec,
    'app state': {
      usage: 'opl app state [--profile fast|full]',
      summary: 'Read the canonical OPL App state projection for GUI pages without page-local probing.',
      examples: ['opl app state --profile fast', 'opl app state --profile full --json'],
      group: 'app',
      handler: (args) => buildOplAppState(parseAppStateArgs(args)),
    },
    'app action execute': {
      usage: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run]',
      summary: 'Execute App mutations through the OPL-owned action boundary instead of page-local commands.',
      examples: [
        'opl app action execute --action developer_supervisor --payload \'{"developerSupervisorEnabled":"on"}\' --dry-run',
        'opl app action execute --action provider_scheduler_status --dry-run',
      ],
      group: 'app',
      handler: (args) => runOplAppActionExecute(getContracts(), parseAppActionExecuteArgs(args)),
    },
    ...brandCommandSpecs,
    ...foundryCommandSpecs,
    ...connectCommandSpecs,
    ...updateCommandSpecs,
    ...workOrderCommandSpecs,
    'okf validate': {
      usage: 'opl okf validate --bundle <path>',
      summary: 'Validate an OKF v0.1 context bundle projection without taking runtime or domain authority.',
      examples: ['opl okf validate --bundle ./okf --json'],
      group: 'contract',
      handler: (args) => {
        const parsed = parseOkfBundleArgs(args, publicCommandSpecs['okf validate']);
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
        const parsed = parseOkfBundleArgs(args, publicCommandSpecs['okf inspect']);
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
        const parsed = parseOkfProjectPackArgs(args, publicCommandSpecs['okf project-pack']);
        const packInput = JSON.parse(
          readFileSync(resolve(parsed.packPath), 'utf8'),
        );
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
        const parsed = parseOkfProjectRepoArgs(args, publicCommandSpecs['okf project-repo']);
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
          publicCommandSpecs['okf native-frontmatter inspect'],
        );
        return {
          version: 'g2',
          okf_native_frontmatter: inspectOkfNativeFrontmatter(parsed),
        };
      },
    },
    'framework locate': {
      usage: 'opl framework locate',
      summary: 'Locate the OPL Framework runtime dependency for an OPL-compatible agent.',
      examples: [
        'opl framework locate',
        'OPL_FRAMEWORK_ROOT=/Users/gaofeng/workspace/one-person-lab opl framework locate',
      ],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['framework locate']);
        return buildOplFrameworkLocator();
      },
    },
    'framework readiness': {
      usage: 'opl framework readiness --family-defaults',
      summary:
        'Read the default attention-first framework readiness summary and Kernel floor without claiming domain, quality, artifact, or production ready.',
      examples: ['opl framework readiness --family-defaults --json'],
      group: 'framework',
      handler: (args) => {
        if (args.length !== 1 || args[0] !== '--family-defaults') {
          throw buildUsageError('framework readiness requires --family-defaults.', publicCommandSpecs['framework readiness'], {
            required: ['--family-defaults'],
          });
        }
        return buildFrameworkReadinessSummary(getContracts(), { familyDefaults: true });
      },
    },
    'framework operating-maturity': {
      usage: 'opl framework operating-maturity --family-defaults',
      summary:
        'Aggregate domain owner-chain scaleout, L5, App release, provider long-soak, cleanup, and lifecycle evidence gaps without claiming readiness.',
      examples: ['opl framework operating-maturity --family-defaults --json'],
      group: 'framework',
      handler: async (args) => {
        if (args.length !== 1 || args[0] !== '--family-defaults') {
          throw buildUsageError(
            'framework operating-maturity requires --family-defaults.',
            publicCommandSpecs['framework operating-maturity'],
            {
              required: ['--family-defaults'],
            },
          );
        }
        return await buildFrameworkOperatingMaturityReadout(getContracts(), { familyDefaults: true });
      },
    },
    'framework tranche-backlog': {
      usage: 'opl framework tranche-backlog --family-defaults',
      summary:
        'Read the milestone/tranche execution index for functional-structure lanes without creating a second active backlog or completion claim.',
      examples: ['opl framework tranche-backlog --family-defaults --json'],
      group: 'framework',
      handler: (args) => {
        if (args.length !== 1 || args[0] !== '--family-defaults') {
          throw buildUsageError(
            'framework tranche-backlog requires --family-defaults.',
            publicCommandSpecs['framework tranche-backlog'],
            {
              required: ['--family-defaults'],
            },
          );
        }
        return buildFrameworkTrancheBacklogReadback(getContracts());
      },
    },
    ...agentLabCommandSpecs,
    doctor: cloneCommandSpec(commandSpecs.doctor, { group: 'top_level' }),
    start: cloneCommandSpec(commandSpecs.start, { group: 'top_level' }),
    'quality details': {
      usage:
        'opl quality details --root <repo_path> [--format <json|markdown>] [--limit <n>] [--focus <auto|depth|equality|modularity|redundancy|test_gaps|rules>] [--compare-ref <git_ref>]',
      summary: 'Emit deterministic code-quality details for agent triage beside Sentrux Free summaries.',
      examples: [
        'opl quality details --root /Users/gaofeng/workspace/one-person-lab --format json',
        'opl quality details --root . --format markdown --limit 20 --focus auto',
        'opl quality details --root . --format markdown --compare-ref origin/main',
      ],
      group: 'quality',
      handler: async (args) => {
        const { buildQualityDetails, parseQualityDetailsArgs, renderQualityDetailsMarkdown } = await import('../../quality-details/index.ts');
        const parsed = parseQualityDetailsArgs(args);
        if (!parsed.ok) {
          throw buildUsageError(parsed.message, publicCommandSpecs['quality details'], parsed.details);
        }

        const report = await buildQualityDetails(parsed.options);
        if (parsed.options.format === 'markdown') {
          process.stdout.write(`${renderQualityDetailsMarkdown(report)}\n`);
          return { __handled: true as const };
        }

        return {
          version: 'g2',
          quality_details: report,
        };
      },
    },
    'skill companion status': cloneCommandSpec(commandSpecs['skill-companion-status'], {
      usage: 'opl skill companion status [--home <home_path>] [--superpowers <keep|lite|full>]',
      group: 'skill',
    }),
    'skill companion apply': cloneCommandSpec(commandSpecs['skill-companion-apply'], {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>] [--superpowers <keep|lite|full>]',
      group: 'skill',
    }),
    exec: cloneCommandSpec(commandSpecs.exec, { group: 'top_level' }),
    'executor doctor': cloneCommandSpec(commandSpecs['executor doctor'], { group: 'runtime' }),
    'executor run': cloneCommandSpec(commandSpecs['executor run'], { group: 'runtime' }),
    resume: cloneCommandSpec(commandSpecs.resume, {
      usage: 'opl resume [codex resume args...]',
      summary: 'Resume a Codex session as a raw passthrough.',
      examples: [
        'opl resume run_7e2a41a19175465f809c0a7f151278ee',
        'opl resume --last',
      ],
      group: 'top_level',
    }),
    'status workspace': cloneCommandSpec(commandSpecs['status workspace'], {
      usage: 'opl status workspace [--path <workspace_path>]',
      examples: ['opl status workspace', 'opl status workspace --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'status',
    }),
    'status runtime': cloneCommandSpec(commandSpecs['status runtime'], {
      usage: 'opl status runtime [--limit <n>]',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      group: 'status',
    }),
    'family-runtime': cloneCommandSpec(commandSpecs['family-runtime'], {
      usage:
        'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|intake|tick|enqueue|scheduler status|scheduler install|scheduler trigger|scheduler remove|scheduler tick|evidence-worklist|paper-autonomy supervisor decide|paper-autonomy supervisor readback|queue list|queue inspect|queue redrive|queue hold|queue release|queue retire|attempt list|attempt inspect|attempt query|attempt cancel|approve|notify list|events export [options]',
      examples: [
        'opl family-runtime status',
        'opl family-runtime repair',
        'opl family-runtime provider repair --provider temporal',
        'opl family-runtime tick --source provider-cron --hydrate',
        'opl family-runtime lifecycle apply --mode dry-run --domain medautogrant --source-ref mag://cleanup/plan --action \'{"action_id":"mark-opl-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/mag/tombstone"}\'',
        'opl family-runtime provider-slo tick --provider temporal',
        'opl family-runtime provider-worker supervisor install --provider temporal',
        'opl family-runtime scheduler install --provider temporal',
        'opl family-runtime scheduler status --provider temporal',
        'opl family-runtime scheduler trigger --provider temporal',
        'opl family-runtime scheduler remove --provider temporal',
        'opl family-runtime scheduler tick --provider temporal',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
        'opl family-runtime paper-autonomy supervisor decide --obligation-ledger /tmp/obligations.jsonl --decision-ledger /tmp/decisions.jsonl --obligation-id obligation:dm003 --current-identity-file /tmp/current-identity.json --typed-blocker-ref mas://typed-blocker --budget-or-missing-evidence-ref opl://non-advancing',
        'opl family-runtime paper-autonomy supervisor readback --obligation-ledger /tmp/obligations.jsonl --decision-ledger /tmp/decisions.jsonl --obligation-id obligation:dm003 --current-identity-file /tmp/current-identity.json',
        'opl family-runtime queue hold --study 003-dpcc-primary-care-phenotype-treatment-gap --reason manual_pause_for_mas_upgrade',
        'opl family-runtime queue retire --study 003-dpcc-primary-care-phenotype-treatment-gap --task-kind paper_autonomy/guarded-apply --reason superseded_by_publication_handoff_owner_gate',
      ],
      group: 'runtime',
    }),
    index: cloneCommandSpec(commandSpecs.index, {
      usage: 'opl index doctor|rebuild|checkpoint|integrity-check|backup [--domain <domain_id>]',
      examples: [
        'opl index doctor --json',
        'opl index rebuild --domain medautoscience --json',
        'opl index integrity-check --json',
        'opl index checkpoint --json',
        'opl index backup --json',
      ],
      group: 'runtime',
    }),
    'stage-artifact': cloneCommandSpec(commandSpecs['stage-artifact'], {
      usage: 'opl stage-artifact open|commit|status|explain|rebuild|promote|gc|restore|validate|conformance|workbench --domain <domain> --program <id> --topic <id> --deliverable <id>',
      examples: [
        'opl stage-artifact open --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --stage-order 4 --attempt attempt-1',
        'opl stage-artifact commit --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --attempt attempt-1 --terminal-status success --required-output deck.png --owner-receipt-ref rca-owner-receipt:deck',
        'opl stage-artifact status --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact explain --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact validate --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact conformance --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact workbench --domain redcube_ai --program p1 --topic t1 --deliverable d1',
      ],
      group: 'runtime',
    }),
    stage: cloneCommandSpec(commandSpecs.stage, {
      usage: 'opl stage open|commit|status|explain|rebuild|promote|gc|restore|validate|conformance|workbench --domain <domain> --program <id> --topic <id> --deliverable <id>',
      examples: [
        'opl stage open --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --stage-order 4 --attempt attempt-1',
        'opl stage commit --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --attempt attempt-1 --terminal-status success --required-output deck.png --owner-receipt-ref rca-owner-receipt:deck',
        'opl stage status --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage validate --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage conformance --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage workbench --domain redcube_ai --program p1 --topic t1 --deliverable d1',
      ],
      group: 'runtime',
    }),
    'status dashboard': cloneCommandSpec(commandSpecs.dashboard, {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      group: 'status',
    }),
    ...workspaceCommandSpecs,
    'domain manifests': cloneCommandSpec(commandSpecs['domain manifests'], {
      usage: 'opl domain manifests',
      examples: ['opl domain manifests'],
      group: 'domain',
    }),
    'domain launch': cloneCommandSpec(commandSpecs['domain launch'], {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      examples: ['opl domain launch --project redcube --dry-run'],
      group: 'domain',
    }),
    'domain select-entry': cloneCommandSpec(commandSpecs['domain select-entry'], {
      usage:
        'opl domain select-entry --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain select-entry --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      group: 'domain',
    }),
    'domain explain-boundary': cloneCommandSpec(commandSpecs['domain explain-boundary'], {
      usage:
        'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
      ],
      group: 'domain',
    }),
    'actions list': {
      usage: 'opl actions list',
      summary: 'List family action catalogs resolved from bound domain-owned manifests.',
      examples: ['opl actions list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['actions list']);
        return buildFamilyActionsList(getContracts());
      },
    },
    'actions inspect': {
      usage: 'opl actions inspect --domain <domain> --action <action_id>',
      summary: 'Inspect one domain-owned family action plus its derived CLI/MCP/Skill/tool projections.',
      examples: ['opl actions inspect --domain redcube --action start_deliverable'],
      group: 'domain',
      handler: (args) => buildFamilyActionInspect(getContracts(), args),
    },
    'actions export': {
      usage: 'opl actions export --domain <domain> --format <cli|mcp|skill|openai|ai-sdk>',
      summary: 'Export one domain action catalog as a derived CLI, MCP, Skill, OpenAI, or AI SDK descriptor set.',
      examples: [
        'opl actions export --domain medautoscience --format mcp',
        'opl actions export --domain redcube --format openai',
      ],
      group: 'domain',
      handler: (args) => buildFamilyActionExport(getContracts(), args),
    },
    'agents list': {
      usage: 'opl agents list',
      summary: 'List standard domain-agent skeleton completeness for bound MAS, MAG, and RCA manifests.',
      examples: ['opl agents list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents list']);
        return buildFamilyAgentsList(getContracts());
      },
    },
    'agents inspect': {
      usage: 'opl agents inspect --domain <domain>',
      summary: 'Inspect one standard domain-agent skeleton mapping without reading real artifact contents.',
      examples: ['opl agents inspect --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyAgentInspect(getContracts(), args),
    },
    'agents legacy-cleanup apply': {
      usage: 'opl agents legacy-cleanup apply --domain <domain> [--mode dry-run|apply|verify] [--source-ref <ref>] [--receipt-ref <ref>]',
      summary:
        'Apply the OPL-owned legacy cleanup ledger plan for one domain-agent skeleton without deleting domain repo files.',
      examples: [
        'opl agents legacy-cleanup apply --domain mag --mode dry-run',
        'opl agents legacy-cleanup apply --domain mas --mode apply',
        'opl agents legacy-cleanup apply --domain rca --mode verify',
      ],
      group: 'domain',
      handler: (args) => runFamilyAgentLegacyCleanupApply(getContracts(), args),
    },
    'agents evidence apply': agentsEvidenceApplySpec,
    'agents scaffold': cloneCommandSpec(commandSpecs['agents scaffold'], {
      usage: 'opl agents scaffold [--target-dir <path>] [--domain-id <id>] [--domain-label <label>] [--force] | [--validate <repo-dir>] | [--consumption-evidence]',
      examples: [
        'opl agents scaffold',
        'opl agents scaffold --target-dir /tmp/new-agent --domain-id award-foundry',
        'opl agents scaffold --validate /tmp/new-agent',
        'opl agents scaffold --consumption-evidence',
      ],
      group: 'domain',
    }),
    'agents descriptors': {
      usage: 'opl agents descriptors',
      summary: 'List unified domain-agent descriptors projected from entry, stage, action, memory, skill, runtime, and artifact refs.',
      examples: ['opl agents descriptors'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents descriptors']);
        return buildFamilyAgentDescriptorList(getContracts());
      },
    },
    'agents descriptor': {
      usage: 'opl agents descriptor --domain <domain>',
      summary: 'Inspect one unified domain-agent descriptor without embedding domain memory or instruction bodies.',
      examples: ['opl agents descriptor --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyAgentDescriptorInspect(getContracts(), args),
    },
    'agents pack-compiler': {
      usage: 'opl agents pack-compiler [--family-defaults]',
      summary: 'List OPL-owned generated-surface handoff projections compiled from admitted manifests or default standard agent repo contracts.',
      examples: ['opl agents pack-compiler', 'opl agents pack-compiler --family-defaults'],
      group: 'domain',
      handler: (args) => {
        return buildDomainPackCompilerList(getContracts(), parsePackCompilerArgs(args));
      },
    },
    'agents pack-compiler inspect': {
      usage: 'opl agents pack-compiler inspect [--family-defaults] --domain <domain>',
      summary: 'Inspect one OPL-owned generated-surface handoff projection without moving domain authority into OPL.',
      examples: [
        'opl agents pack-compiler inspect --domain mas',
        'opl agents pack-compiler inspect --family-defaults --domain mas',
      ],
      group: 'domain',
      handler: (args) => buildDomainPackCompilerInspect(getContracts(), args),
    },
    'agents interfaces': {
      usage: 'opl agents interfaces (--family-defaults | --domain <domain> | --repo-dir <path>) [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
      summary: 'Generate the unified OPL-owned CLI, MCP, Skill, product-entry, and tool interface bundle from a domain pack or standard agent repo.',
      examples: [
        'opl agents interfaces --family-defaults',
        'opl agents interfaces --domain mas',
        'opl agents interfaces --repo-dir /path/to/opl-compatible-agent',
        'opl agents interfaces --domain redcube --format mcp',
      ],
      group: 'domain',
      handler: (args) => buildGeneratedAgentInterfaces(getContracts(), args),
    },
    'agents platform-surfaces': {
      usage: 'opl agents platform-surfaces [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Classify OPL-owned generic platform surfaces across standard agents while preserving domain truth, verdict, artifact, memory, and owner-receipt authority.',
      examples: [
        'opl agents platform-surfaces --family-defaults',
        'opl agents platform-surfaces --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentPlatformSurfaceOwnershipReport(args),
    },
    'agents default-callers': {
      usage: 'opl agents default-callers [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Project OPL generated and hosted default-caller readiness for standard agents without authorizing domain ready or physical deletion.',
      examples: [
        'opl agents default-callers --family-defaults',
        'opl agents default-callers --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentDefaultCallerReadinessReport(args),
    },
    'agents residue-decisions': {
      usage: 'opl agents residue-decisions [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Project the refs-only owner-decision ledger for private platform residue without writing domain truth or authorizing physical deletion.',
      examples: [
        'opl agents residue-decisions --family-defaults',
        'opl agents residue-decisions --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildPrivatePlatformResidueOwnerDecisionLedgerCommand(args),
    },
    'agents conformance': {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Report structural conformance and live family probe status for standard OPL agents without claiming domain or production readiness.',
      examples: [
        'opl agents conformance',
        'opl agents conformance --repo-dir /path/to/med-autoscience --repo-dir /path/to/redcube-ai',
        'opl agents conformance --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildStandardDomainAgentConformanceReport(args, getContracts()),
    },
    'agents readiness': {
      usage: 'opl agents readiness [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Aggregate standard-agent Kernel-floor readiness as an attention-first operator summary without claiming domain, quality, artifact, or production ready.',
      examples: [
        'opl agents readiness --family-defaults',
        'opl agents readiness --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildAgentReadinessSummary(args),
    },
    'substrate projections': {
      usage: 'opl substrate projections',
      summary: 'List framework-owned workspace, source, artifact, and memory substrate projections from domain manifests.',
      examples: ['opl substrate projections'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['substrate projections']);
        return buildGenericSubstrateProjectionList(getContracts());
      },
    },
    'substrate projection': {
      usage: 'opl substrate projection --domain <domain>',
      summary: 'Inspect one framework-owned substrate projection without reading domain truth, artifact bodies, or memory bodies.',
      examples: ['opl substrate projection --domain mas'],
      group: 'domain',
      handler: (args) => buildGenericSubstrateProjectionInspect(getContracts(), args),
    },
    'substrate workbench': {
      usage: 'opl substrate workbench',
      summary: 'Group substrate refs by domain, status, and ref family for App/operator drilldown without reading domain bodies.',
      examples: ['opl substrate workbench'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['substrate workbench']);
        return buildGenericSubstrateWorkbench(getContracts());
      },
    },
    'domain-memory list': {
      usage: 'opl domain-memory list',
      summary: 'List domain-owned memory locator descriptors resolved from bound manifests.',
      examples: ['opl domain-memory list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['domain-memory list']);
        return buildFamilyDomainMemoryList(getContracts());
      },
    },
    'domain-memory inspect': {
      usage: 'opl domain-memory inspect --domain <domain>',
      summary: 'Inspect one domain-owned memory locator, receipt projection, and OPL non-authority boundary.',
      examples: ['opl domain-memory inspect --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryInspect(getContracts(), args),
    },
    'domain-memory migration-plan': {
      usage: 'opl domain-memory migration-plan --domain <domain>',
      summary: 'Project domain-owned migration, proposal contract, router receipt, and writeback receipt locators.',
      examples: ['opl domain-memory migration-plan --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryMigrationPlan(getContracts(), args),
    },
    ...stageCommandSpecs,
    'contract validate': cloneCommandSpec(commandSpecs['validate-contracts'], {
      usage: 'opl contract validate',
      examples: ['opl contract validate'],
      group: 'contract',
    }),
    'contract workstreams': cloneCommandSpec(commandSpecs['list-workstreams'], {
      usage: 'opl contract workstreams',
      examples: ['opl contract workstreams'],
      group: 'contract',
    }),
    'contract workstream': cloneCommandSpec(commandSpecs['get-workstream'], {
      usage: 'opl contract workstream <workstream_id>',
      examples: ['opl contract workstream research_ops', 'opl contract workstream presentation_ops'],
      group: 'contract',
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('contract workstream requires a workstream id.', publicCommandSpecs['contract workstream'], {
            required: ['workstream_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, { workstream: findWorkstreamOrThrow(contracts, workstreamId) });
      },
    }),
    'contract domains': cloneCommandSpec(commandSpecs['list-domains'], {
      usage: 'opl contract domains',
      examples: ['opl contract domains'],
      group: 'contract',
    }),
    'contract domain': cloneCommandSpec(commandSpecs['get-domain'], {
      usage: 'opl contract domain <domain_id>',
      examples: ['opl contract domain medautoscience', 'opl contract domain redcube'],
      group: 'contract',
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('contract domain requires a domain id.', publicCommandSpecs['contract domain'], {
            required: ['domain_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, { domain: findDomainOrThrow(contracts, domainId) });
      },
    }),
    'contract surfaces': cloneCommandSpec(commandSpecs['list-surfaces'], {
      usage: 'opl contract surfaces',
      examples: ['opl contract surfaces'],
      group: 'contract',
    }),
    'contract surface': cloneCommandSpec(commandSpecs['get-surface'], {
      usage: 'opl contract surface <surface_id>',
      examples: ['opl contract surface opl_framework_contract_hub'],
      group: 'contract',
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('contract surface requires a surface id.', publicCommandSpecs['contract surface'], {
            required: ['surface_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
      },
    }),
    'contract handoff-envelope': cloneCommandSpec(commandSpecs['contract handoff-envelope'], {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
      ],
      group: 'contract',
    }),
    ...systemCommandSpecs,
    'engine install': engineInstallSpec,
    'engine update': engineUpdateSpec,
    'engine reinstall': engineReinstallSpec,
    'engine remove': engineRemoveSpec,
    'session resume': cloneCommandSpec(commandSpecs.resume, {
      usage: 'opl session resume <session_id>',
      examples: [
        'opl session resume run_7e2a41a19175465f809c0a7f151278ee',
      ],
      summary: 'Resume an OPL-managed session through the Codex product-entry runtime.',
      group: 'session',
      handler: (args) => runProductEntryResume(
        parseResumeArgs(args, publicCommandSpecs['session resume']).sessionId,
      ),
    }),
    'session runtime': cloneCommandSpec(commandSpecs['session runtime'], {
      usage: 'opl session runtime --acp',
      examples: ['opl session runtime --acp'],
      group: 'session',
    }),
    'session ledger': cloneCommandSpec(commandSpecs['session ledger'], {
      usage: 'opl session ledger [--limit <n>]',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      group: 'session',
    }),
    ...runtimeCommandSpecs,
  };

  validateStageDerivedLensCommandSpecs(publicCommandSpecs);

  return publicCommandSpecs;
}
