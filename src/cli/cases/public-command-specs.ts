import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../contracts.ts';
import { buildOplPackageManifest } from '../../package-distribution.ts';
import { buildOplFrameworkLocator } from '../../opl-framework-locator.ts';
import { buildFrameworkReadinessSummary } from '../../framework-readiness.ts';
import { buildProductionFunctionalCloseout } from '../../production-functional-closeout.ts';
import { buildOplAppState, parseAppActionExecuteArgs, parseAppStateArgs, runOplAppActionExecute } from '../../app-state.ts';
import { runOplEngineAction } from '../../system-installation/engine-actions.ts';
import { buildOplModules, runOplModuleAction, runOplModuleExec } from '../../system-installation/modules.ts';
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
} from '../../domain-pack-compiler.ts';
import {
  buildAgentDefaultCallerReadinessReport,
  buildAgentPlatformSurfaceOwnershipReport,
} from '../../agent-platform-surface-ownership.ts';
import {
  buildBrandModuleInspect,
  buildBrandModuleInterfaces,
  buildBrandModuleMaturity,
  buildBrandModulesList,
  buildBrandModuleValidation,
  buildAgentInternalBrandModuleDoctor,
  buildAgentInternalBrandModuleInspect,
  buildAgentInternalBrandModuleInterfaces,
  buildAgentInternalBrandModulesList,
  buildAgentInternalBrandModuleValidation,
} from '../../brand-modules.ts';
import {
  FOUNDRY_AGENT_OPERATIONS,
  buildFoundryAgentCliSpine,
} from '../../foundry-agent-cli-spine.ts';
import {
  buildBrandModuleObjectView,
  buildBrandModuleSurfaceCommand,
  listBrandModuleObjectViewCommands,
} from '../../brand-module-surfaces.ts';
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
  buildFamilyStageAssumptionsInspect,
  buildFamilyStageCohortLoopInspect,
  buildFamilyStageGraphInspect,
  buildFamilyStagePackRegistryInspect,
  buildFamilyStagePackSourceSpecInspect,
  buildFamilyStageProofBundleInspect,
  buildFamilyStageReadinessInspect,
  buildFamilyStageReplayCertificationInspect,
  buildFamilyStageRuntimeBudgetInspect,
  buildFamilyStageInspect,
  buildFamilyStagesList,
} from '../../family-stage-control-plane.ts';
import {
  familyStageDiagnosticLensCommands,
  requireFamilyStageDerivedLens,
} from '../../family-stage-derived-lenses.ts';
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
  buildPublicModuleActionPayload,
  buildPublicModuleExecPayload,
  buildPublicModulesPayload,
  buildPublicTurnkeyInstallPayload,
} from '../modules/public-payloads.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, parseOplEngineArgs, parseOplModuleExecArgs, parseOplModuleArgs, parseResumeArgs, parseTurnkeyInstallArgs, printJson, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';
import type { BrandModuleId } from '../../types.ts';

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const buildNoArgSpec = (
    base: Omit<CommandSpec, 'handler'>,
    handler: () => unknown | Promise<unknown>,
  ): CommandSpec => {
    const spec: CommandSpec = {
      ...base,
      handler: (args) => {
        assertNoArgs(args, spec);
        return handler();
      },
    };
    return spec;
  };

  const buildModuleActionSpec = (
    action: 'install' | 'update' | 'reinstall' | 'remove',
    usage: string,
    example: string,
  ): CommandSpec => {
    const spec: CommandSpec = {
      usage,
      summary: `${action[0].toUpperCase()}${action.slice(1)} one OPL-managed domain module.`,
      examples: [example],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runOplModuleAction(action, parseOplModuleArgs(args, spec).moduleId!),
        ),
    };
    return spec;
  };

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
  const buildBrandModuleSurfaceSpecs = (
    moduleId: BrandModuleId,
    group: string,
    subcommands: ReadonlyArray<'status' | 'inspect' | 'interfaces' | 'validate' | 'doctor'> = ['status', 'inspect', 'interfaces', 'validate', 'doctor'],
  ): Record<string, CommandSpec> => {
    const label = `OPL ${moduleId}`;
    const specs: Record<string, CommandSpec> = {};
    for (const subcommand of subcommands) {
      const command = `${moduleId} ${subcommand}`;
      specs[command] = {
        usage: `opl ${moduleId} ${subcommand}`,
        summary: `Read the ${label} module-owned ${subcommand} surface instead of relying on the aggregate brand registry.`,
        examples: [`opl ${moduleId} ${subcommand} --json`],
        group,
        handler: (args) => {
          assertNoArgs(args, specs[command]);
          return buildBrandModuleSurfaceCommand(getContracts(), moduleId, subcommand);
        },
      };
    }
    for (const viewId of listBrandModuleObjectViewCommands(moduleId)) {
      const command = `${moduleId} ${viewId}`;
      specs[command] = {
        usage: `opl ${moduleId} ${viewId}`,
        summary: `Read the ${label} ${viewId} object-model view from the module-owned surface contract.`,
        examples: [`opl ${moduleId} ${viewId} --json`],
        group,
        handler: (args) => {
          assertNoArgs(args, specs[command]);
          return buildBrandModuleObjectView(getContracts(), moduleId, viewId);
        },
      };
    }
    return specs;
  };

  const brandModuleSurfaceSpecs = {
    ...buildBrandModuleSurfaceSpecs('charter', 'brand-charter'),
    ...buildBrandModuleSurfaceSpecs('atlas', 'brand-atlas'),
    ...buildBrandModuleSurfaceSpecs('workspace', 'workspace', ['status', 'inspect']),
    ...buildBrandModuleSurfaceSpecs('stagecraft', 'brand-stagecraft'),
    ...buildBrandModuleSurfaceSpecs('runway', 'brand-runway'),
    ...buildBrandModuleSurfaceSpecs('vault', 'brand-vault'),
    ...buildBrandModuleSurfaceSpecs('console', 'brand-console'),
    ...buildBrandModuleSurfaceSpecs('foundry-lab', 'brand-foundry-lab'),
    ...buildBrandModuleSurfaceSpecs('connect', 'brand-connect'),
  };

  const foundryAgentCommandSpecs: Record<string, CommandSpec> = Object.fromEntries(
    FOUNDRY_AGENT_OPERATIONS.map((operation) => {
      const command = `agents foundry ${operation}`;
      const spec: CommandSpec = {
        usage: `opl ${command}`,
        summary: `Read the Foundry Agent series ${operation} spine for OPL-generated agent CLIs, skills, MCP descriptors, and App action projections.`,
        examples: [`opl ${command} --json`],
        group: 'foundry',
        handler: (args) => buildFoundryAgentCliSpine(operation, args),
      };
      return [command, spec];
    }),
  );

  const connectPackagesManifestSpec = buildNoArgSpec(
    {
      usage: 'opl connect packages manifest',
      summary: 'Show the machine-readable OPL Packages manifest through the canonical Connect frontdoor.',
      examples: ['opl connect packages manifest --json'],
      group: 'connect',
    },
    () => ({
      version: 'g2',
      packages_manifest: buildOplPackageManifest(),
    }),
  );

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
    'brand-modules list': {
      usage: 'opl brand-modules list',
      summary: 'List the nine OPL brand modules and their Workspace-level structural baseline refs.',
      examples: ['opl brand-modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['brand-modules list']);
        return buildBrandModulesList(getContracts());
      },
    },
    'brand-modules inspect': {
      usage: 'opl brand-modules inspect --module <module_id>',
      summary: 'Inspect one OPL brand module with contract, CLI, App, descriptor, validation, status, and authority-boundary refs.',
      examples: ['opl brand-modules inspect --module workspace --json'],
      group: 'brand',
      handler: (args) => buildBrandModuleInspect(getContracts(), args),
    },
    'brand-modules maturity': {
      usage: 'opl brand-modules maturity',
      summary: 'Read the Workspace-baseline maturity matrix for all OPL brand modules.',
      examples: ['opl brand-modules maturity --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['brand-modules maturity']);
        return buildBrandModuleMaturity(getContracts());
      },
    },
    'brand-modules validate': {
      usage: 'opl brand-modules validate',
      summary: 'Validate OPL brand module L4 gates and false-authority boundaries from the registry contract.',
      examples: ['opl brand-modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['brand-modules validate']);
        return buildBrandModuleValidation(getContracts());
      },
    },
    'brand-modules interfaces': {
      usage: 'opl brand-modules interfaces',
      summary: 'Expose descriptor-only CLI, App, validation, and registry surfaces for the OPL brand module bundle.',
      examples: ['opl brand-modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['brand-modules interfaces']);
        return buildBrandModuleInterfaces(getContracts());
      },
    },
    ...brandModuleSurfaceSpecs,
    ...foundryAgentCommandSpecs,
    'connect modules': buildNoArgSpec(
      {
        usage: 'opl connect modules',
        summary: 'List OPL-managed domain modules through the canonical Connect frontdoor.',
        examples: ['opl connect modules --json'],
        group: 'connect',
      },
      () => buildPublicModulesPayload(buildOplModules()),
    ),
    'connect install': {
      ...buildModuleActionSpec(
        'install',
        'opl connect install --module <module_id>',
        'opl connect install --module medautoscience',
      ),
      group: 'connect',
      summary: 'Install one OPL-managed domain module through the canonical Connect frontdoor.',
    },
    'connect update': {
      ...buildModuleActionSpec(
        'update',
        'opl connect update --module <module_id>',
        'opl connect update --module medautoscience',
      ),
      group: 'connect',
      summary: 'Update one OPL-managed domain module through the canonical Connect frontdoor.',
    },
    'connect reinstall': {
      ...buildModuleActionSpec(
        'reinstall',
        'opl connect reinstall --module <module_id>',
        'opl connect reinstall --module medautoscience',
      ),
      group: 'connect',
      summary: 'Reinstall one OPL-managed domain module through the canonical Connect frontdoor.',
    },
    'connect remove': {
      ...buildModuleActionSpec(
        'remove',
        'opl connect remove --module <module_id>',
        'opl connect remove --module medautoscience',
      ),
      group: 'connect',
      summary: 'Remove one OPL-managed domain module through the canonical Connect frontdoor.',
    },
    'connect exec': {
      usage: 'opl connect exec --module <module_id> -- <domain_cli_args...>',
      summary: 'Run a domain module CLI through the canonical Connect frontdoor.',
      examples: [
        'opl connect exec --module medautoscience -- doctor entry-modes',
        'opl connect exec --module medautogrant -- --help',
      ],
      group: 'connect',
      handler: (args) => {
        const parsed = parseOplModuleExecArgs(args, publicCommandSpecs['connect exec']);
        return buildPublicModuleExecPayload(
          runOplModuleExec(parsed.moduleId, parsed.args),
        );
      },
    },
    'connect skills': cloneCommandSpec(commandSpecs['skill-list'], {
      usage: 'opl connect skills [--domain <domain_id>]',
      summary: 'Inspect family domain plugin packs through the canonical Connect frontdoor.',
      examples: [
        'opl connect skills --json',
        'opl connect skills --domain medautoscience --json',
      ],
      group: 'connect',
    }),
    'connect sync-skills': cloneCommandSpec(commandSpecs['skill-sync'], {
      usage: 'opl connect sync-skills [--domain <domain_id>] [--home <home_path>] [--quiet]',
      summary: 'Register family domain plugin packs through the canonical Connect frontdoor.',
      examples: [
        'opl connect sync-skills --json',
        'opl connect sync-skills --domain medautoscience --json',
        'opl connect sync-skills --home /tmp/codex-home --json',
      ],
      group: 'connect',
    }),
    'connect packages manifest': connectPackagesManifestSpec,
    'connect reconcile-modules': cloneCommandSpec(systemCommandSpecs['system reconcile-modules'], {
      usage: 'opl connect reconcile-modules',
      summary: 'Install missing modules and update clean domain modules through the canonical Connect frontdoor.',
      examples: ['opl connect reconcile-modules --json'],
      group: 'connect',
    }),
    'agents modules list': {
      usage: 'opl agents modules list',
      summary: 'List domain-agent internal brand-module spines without making them OPL platform modules.',
      examples: ['opl agents modules list --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents modules list']);
        return buildAgentInternalBrandModulesList(getContracts());
      },
    },
    'agents modules inspect': {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      summary: 'Inspect one domain-agent internal brand-module spine from the OPL governance contract.',
      examples: ['opl agents modules inspect --domain medautoscience --module agent-runway --json'],
      group: 'brand',
      handler: (args) => buildAgentInternalBrandModuleInspect(getContracts(), args),
    },
    'agents modules interfaces': {
      usage: 'opl agents modules interfaces',
      summary: 'Expose CLI and descriptor refs for the agent-owned internal brand-module spine.',
      examples: ['opl agents modules interfaces --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents modules interfaces']);
        return buildAgentInternalBrandModuleInterfaces(getContracts());
      },
    },
    'agents modules validate': {
      usage: 'opl agents modules validate',
      summary: 'Validate agent-owned internal brand-module spine coverage and false-authority boundaries.',
      examples: ['opl agents modules validate --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents modules validate']);
        return buildAgentInternalBrandModuleValidation(getContracts());
      },
    },
    'agents modules doctor': {
      usage: 'opl agents modules doctor',
      summary: 'Fail closed if agent-owned internal brand-module spine governance drifts.',
      examples: ['opl agents modules doctor --json'],
      group: 'brand',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents modules doctor']);
        return buildAgentInternalBrandModuleDoctor(getContracts());
      },
    },
    ...workOrderCommandSpecs,
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
    'framework production-closeout': {
      usage: 'opl framework production-closeout',
      summary:
        'Read the production functional closeout gate across OPL, MAS, MAG, and RCA without running long soaks.',
      examples: ['opl framework production-closeout'],
      group: 'framework',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['framework production-closeout']);
        return buildProductionFunctionalCloseout(getContracts());
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
        'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|intake|tick|enqueue|scheduler status|scheduler install|scheduler trigger|scheduler remove|scheduler tick|evidence-worklist|queue list|queue inspect|queue redrive|queue hold|queue release|queue retire|attempt list|attempt inspect|attempt query|attempt cancel|approve|notify list|events export [options]',
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
    workspace: {
      usage:
        'opl workspace projects|list|root|init|ensure|validate|doctor|adopt|upgrade|project archive|export-map|health|inspect|inventory|interfaces|bind|activate|archive [options]',
      summary:
        'Manage OPL workspace bindings, standard family-agent workspace initialization, generated inspection refs, and workspace-local project lifecycle projections.',
      examples: [
        'opl workspace projects',
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace validate --workspace /Users/gaofeng/workspace/visual-theme-a',
        'opl workspace inspect --workspace /Users/gaofeng/workspace/visual-theme-a',
        'opl workspace interfaces',
      ],
      group: 'workspace',
      subcommands: [
        {
          command: 'workspace projects',
          usage: 'opl workspace projects',
          summary: 'List known project workspace bindings from the OPL workspace registry.',
        },
        {
          command: 'workspace init',
          usage:
            'opl workspace init --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>]',
          summary: 'Materialize the standard OPL workspace topology for one family agent.',
        },
        {
          command: 'workspace ensure',
          usage:
            'opl workspace ensure --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>]',
          summary: 'Reuse an active binding or initialize/append the compatible standard workspace topology.',
        },
        {
          command: 'workspace validate',
          usage: 'opl workspace validate --workspace <path>',
          summary: 'Fail closed unless the workspace index and generated refs match the OPL workspace norm.',
        },
        {
          command: 'workspace doctor',
          usage: 'opl workspace doctor --workspace <path>',
          summary: 'Report workspace topology, generated refs, indexed projects, and blockers without writing.',
        },
        {
          command: 'workspace inspect',
          usage: 'opl workspace inspect --workspace <path>',
          summary: 'Read the workspace inspection projection for user and operator checks.',
        },
        {
          command: 'workspace inventory',
          usage: 'opl workspace inventory --workspace <path>',
          summary: 'Read the shared resource inventory projection without reading resource bodies.',
        },
        {
          command: 'workspace interfaces',
          usage: 'opl workspace interfaces',
          summary: 'Describe CLI/App/MCP/Skill/OpenAI/AI SDK delegates for the workspace protocol.',
        },
      ],
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs.workspace);
        return buildCommandHelp('workspace', publicCommandSpecs.workspace);
      },
    },
    'workspace projects': cloneCommandSpec(commandSpecs.projects, {
      usage: 'opl workspace projects',
      examples: ['opl workspace projects'],
      group: 'workspace',
    }),
    'workspace list': cloneCommandSpec(commandSpecs['workspace list'], {
      usage: 'opl workspace list',
      examples: ['opl workspace list'],
      group: 'workspace',
    }),
    'workspace root': cloneCommandSpec(commandSpecs['workspace root'], {
      usage: 'opl workspace root',
      examples: ['opl workspace root'],
      group: 'workspace',
    }),
    'workspace root set': cloneCommandSpec(commandSpecs['workspace root set'], {
      usage: 'opl workspace root set --path <workspace_root>',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      group: 'workspace',
    }),
    'workspace root doctor': cloneCommandSpec(commandSpecs['workspace root doctor'], {
      usage: 'opl workspace root doctor',
      examples: ['opl workspace root doctor'],
      group: 'workspace',
    }),
    'workspace init': cloneCommandSpec(commandSpecs['workspace-init'], {
      usage:
        'opl workspace init --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]',
      examples: [
        'opl workspace init --agent rca --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent rca --workspace-root /Users/gaofeng/workspace --workspace-id visual-theme-a --project-id deck-001',
        'opl workspace init --agent mas --workspace-root /Users/gaofeng/workspace --workspace-id dm-cvd --project-id DM002',
        'opl workspace init --agent oma --workspace /Users/gaofeng/workspace/agent-foundry --dry-run',
      ],
      group: 'workspace',
    }),
    'workspace ensure': cloneCommandSpec(commandSpecs['workspace-ensure'], {
      usage:
        'opl workspace ensure --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio] [--title <title>] [--dry-run] [--no-bind] [--force]',
      examples: [
        'opl workspace ensure --agent rca --project-id deck-001',
        'opl workspace ensure --agent mas --workspace-id dm-cvd --project-id DM002',
        'opl workspace ensure --agent mag --workspace-root /Users/gaofeng/workspace --workspace-id nsfc-p2c --project-id grant-001',
      ],
      group: 'workspace',
    }),
    'workspace validate': cloneCommandSpec(commandSpecs['workspace validate'], {
      usage: 'opl workspace validate --workspace <path>',
      examples: [
        'opl workspace validate --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace doctor': cloneCommandSpec(commandSpecs['workspace doctor'], {
      usage: 'opl workspace doctor --workspace <path>',
      examples: [
        'opl workspace doctor --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace adopt': cloneCommandSpec(commandSpecs['workspace adopt'], {
      usage:
        'opl workspace adopt --agent <mas|mag|rca|oma> --workspace <path> [--project-id <id>] [--mode auto|one_off|series|portfolio] [--dry-run|--apply]',
      examples: [
        'opl workspace adopt --agent rca --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --dry-run',
        'opl workspace adopt --agent mas --workspace /Users/gaofeng/workspace/dm-cvd --study-id DM002 --apply',
      ],
      group: 'workspace',
    }),
    'workspace upgrade': cloneCommandSpec(commandSpecs['workspace upgrade'], {
      usage: 'opl workspace upgrade --workspace <path> [--dry-run|--apply]',
      examples: [
        'opl workspace upgrade --workspace /Users/gaofeng/workspace/visual-theme-a --apply',
      ],
      group: 'workspace',
    }),
    'workspace project archive': cloneCommandSpec(commandSpecs['workspace project archive'], {
      usage: 'opl workspace project archive --workspace <path> --project-id <id> [--reason <text>] [--dry-run|--apply]',
      examples: [
        'opl workspace project archive --workspace /Users/gaofeng/workspace/visual-theme-a --project-id deck-001 --apply',
      ],
      group: 'workspace',
    }),
    'workspace export-map': cloneCommandSpec(commandSpecs['workspace export-map'], {
      usage: 'opl workspace export-map --workspace <path>',
      examples: [
        'opl workspace export-map --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace health': cloneCommandSpec(commandSpecs['workspace health'], {
      usage: 'opl workspace health --workspace <path>',
      examples: [
        'opl workspace health --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace inspect': cloneCommandSpec(commandSpecs['workspace inspect'], {
      usage: 'opl workspace inspect --workspace <path>',
      examples: [
        'opl workspace inspect --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace inventory': cloneCommandSpec(commandSpecs['workspace inventory'], {
      usage: 'opl workspace inventory --workspace <path>',
      examples: [
        'opl workspace inventory --workspace /Users/gaofeng/workspace/visual-theme-a',
      ],
      group: 'workspace',
    }),
    'workspace interfaces': cloneCommandSpec(commandSpecs['workspace interfaces'], {
      usage: 'opl workspace interfaces',
      examples: ['opl workspace interfaces'],
      group: 'workspace',
    }),
    'workspace bind': cloneCommandSpec(commandSpecs['workspace-bind'], {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
      ],
      group: 'workspace',
    }),
    'workspace activate': cloneCommandSpec(commandSpecs['workspace-activate'], {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'workspace archive': cloneCommandSpec(commandSpecs['workspace-archive'], {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
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
      usage: 'opl agents pack-compiler',
      summary: 'List OPL-owned generated-surface handoff projections compiled from admitted domain packs.',
      examples: ['opl agents pack-compiler'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents pack-compiler']);
        return buildDomainPackCompilerList(getContracts());
      },
    },
    'agents pack-compiler inspect': {
      usage: 'opl agents pack-compiler inspect --domain <domain>',
      summary: 'Inspect one OPL-owned generated-surface handoff projection without moving domain authority into OPL.',
      examples: ['opl agents pack-compiler inspect --domain mas'],
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
    'agents conformance': {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Report structural conformance for standard OPL agents across scaffold, pack compiler, generated interface, and private-surface gates.',
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
    'stages list': {
      usage: 'opl stages list',
      summary: 'List family stage control-plane descriptors resolved from bound domain-owned manifests.',
      examples: ['opl stages list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['stages list']);
        return buildFamilyStagesList(getContracts());
      },
    },
    'stages inspect': {
      usage: 'opl stages inspect --domain <domain> --stage <stage_id>',
      summary: 'Inspect one domain-owned family stage descriptor and its authority boundary.',
      examples: ['opl stages inspect --domain medautoscience --stage manuscript_authoring'],
      group: 'domain',
      handler: (args) => buildFamilyStageInspect(getContracts(), args),
    },
    'stages readiness': {
      usage: 'opl stages readiness (--family-defaults | --domain <domain>) [--detail summary|full]',
      summary: 'Summarize the default operator/App launch-readiness view from admission, proof, assumptions, cohort, replay, and advisory budget/validity refs without issuing a domain verdict.',
      examples: ['opl stages readiness --family-defaults', 'opl stages readiness --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyStageReadinessInspect(getContracts(), args),
    },
    'stages proof-bundle': {
      usage: 'opl stages proof-bundle --domain <domain>',
      summary: 'Diagnostic drilldown for proof-bundle obligations folded into stages readiness; not the default operator path.',
      examples: ['opl stages proof-bundle --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageProofBundleInspect(getContracts(), args),
    },
    'stages graph': {
      usage: 'opl stages graph --domain <domain>',
      summary: 'Diagnostic drilldown for one domain stage pack graph, including admission, edges, guarantee modes, and integrity digest; not the default operator path.',
      examples: ['opl stages graph --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageGraphInspect(getContracts(), args),
    },
    'stages assumptions': {
      usage: 'opl stages assumptions --domain <domain>',
      summary: 'Diagnostic drilldown for runtime assumption lifecycle refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages assumptions --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageAssumptionsInspect(getContracts(), args),
    },
    'stages cohort-loop': {
      usage: 'opl stages cohort-loop --domain <domain>',
      summary: 'Diagnostic drilldown for cohort query, trigger, and monitor/metric refs folded into stages readiness; not the default operator path.',
      examples: ['opl stages cohort-loop --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageCohortLoopInspect(getContracts(), args),
    },
    'stages runtime-budget': {
      usage: 'opl stages runtime-budget --domain <domain>',
      summary: 'Diagnostic drilldown for refs-only runtime boundary and monitor coverage folded into stages readiness/proof; not a standalone domain-ready verdict.',
      examples: ['opl stages runtime-budget --domain mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageRuntimeBudgetInspect(getContracts(), args),
    },
    'stages registry': {
      usage: 'opl stages registry --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--previous-stage-pack-hash <hash>] [--migration-policy <continue_old_hash|migrate_to_new_hash|blocked_human_gate>] [--migration-policy-ref <ref>]',
      summary: 'Diagnostic drilldown for reusable stage-pack registry lifecycle, integrity hash, and migration blockers; not the default operator path.',
      examples: ['opl stages registry --domain mas --library-status deprecated --deprecation-ref human_gate:mas-pack-retire'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStagePackRegistryInspect(getContracts(), args),
    },
    'stages source-spec': {
      usage: 'opl stages source-spec --domain <domain> [--library-status <candidate|admitted|reused|deprecated|superseded>] [--promotion-ref <ref>] [--deprecation-ref <ref>] [--supersession-ref <ref>] [--superseded-by-stage-pack-ref <ref>] [--reused-by-ref <ref>] [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for a body-free stage-pack source/spec bundle from control-plane, proof, graph, registry, replay, assumption, and cohort refs; not the default operator path.',
      examples: ['opl stages source-spec --domain mas --recorded-runtime-event-ref runtime_event:mas.stage_1'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStagePackSourceSpecInspect(getContracts(), args),
    },
    'stages replay-certification': {
      usage: 'opl stages replay-certification --domain <domain> [--append-only-event-log-ref <ref>] [--attempt-ledger-ref <ref>] [--recorded-runtime-event-ref <ref>] [--closeout-receipt-ref <ref>]',
      summary: 'Diagnostic drilldown for replay readiness from proof-bundle obligations and recorded append-only event / receipt refs.',
      examples: ['opl stages replay-certification --domain mas --append-only-event-log-ref opl://events/mas --attempt-ledger-ref opl://attempts/mas'],
      group: 'domain',
      help_surface: 'diagnostic_drilldown',
      handler: (args) => buildFamilyStageReplayCertificationInspect(getContracts(), args),
    },
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

  const registeredDerivedLensCommands = new Set(familyStageDiagnosticLensCommands());
  for (const [command, spec] of Object.entries(publicCommandSpecs)) {
    if (
      command.startsWith('stages ')
      && spec.help_surface === 'diagnostic_drilldown'
      && registeredDerivedLensCommands.has(command)
    ) {
      requireFamilyStageDerivedLens(command);
    }
  }

  return publicCommandSpecs;
}
