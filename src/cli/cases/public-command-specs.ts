import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../contracts.ts';
import { buildOplPackageManifest } from '../../package-distribution.ts';
import { buildOplFrameworkLocator } from '../../opl-framework-locator.ts';
import { buildFrameworkReadinessSummary } from '../../framework-readiness.ts';
import { buildProductionFunctionalCloseout } from '../../production-functional-closeout.ts';
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
import {
  buildPublicEngineActionPayload,
  buildPublicModuleActionPayload,
  buildPublicModuleExecPayload,
  buildPublicModulesPayload,
  buildPublicTurnkeyInstallPayload,
} from '../modules/public-payloads.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, parseOplEngineArgs, parseOplModuleExecArgs, parseOplModuleArgs, parseResumeArgs, parseTurnkeyInstallArgs, printJson, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

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

  const modulesSpec = buildNoArgSpec(
    {
      usage: 'opl modules',
      summary: 'List the OPL-managed domain modules available to the current install.',
      examples: ['opl modules'],
      group: 'module',
    },
    () => buildPublicModulesPayload(buildOplModules()),
  );

  const packagesManifestSpec = buildNoArgSpec(
    {
      usage: 'opl packages manifest',
      summary: 'Show the machine-readable OPL Packages manifest for GUI, Docker, native helper, and domain modules.',
      examples: ['opl packages manifest'],
      group: 'package',
    },
    () => ({
      version: 'g2',
      packages_manifest: buildOplPackageManifest(),
    }),
  );

  const moduleInstallSpec = buildModuleActionSpec(
    'install',
    'opl module install --module <module_id>',
    'opl module install --module medautoscience',
  );
  const moduleUpdateSpec = buildModuleActionSpec(
    'update',
    'opl module update --module <module_id>',
    'opl module update --module medautoscience',
  );
  const moduleReinstallSpec = buildModuleActionSpec(
    'reinstall',
    'opl module reinstall --module <module_id>',
    'opl module reinstall --module medautoscience',
  );
  const moduleRemoveSpec = buildModuleActionSpec(
    'remove',
    'opl module remove --module <module_id>',
    'opl module remove --module medautoscience',
  );
  const moduleExecSpec: CommandSpec = {
    usage: 'opl module exec --module <module_id> -- <domain_cli_args...>',
    summary: 'Run a domain module CLI through the OPL-managed module checkout instead of a global PATH tool.',
    examples: [
      'opl module exec --module medautoscience -- doctor entry-modes',
      'opl module exec --module medautogrant -- --help',
      'opl module exec --module redcube -- product manifest --workspace-root /tmp/demo',
    ],
    group: 'module',
    handler: (args) => {
      const parsed = parseOplModuleExecArgs(args, moduleExecSpec);
      return buildPublicModuleExecPayload(
        runOplModuleExec(parsed.moduleId, parsed.args),
      );
    },
  };

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
      examples: ['opl help', 'opl help status workspace', 'opl help module install'],
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
    'packages manifest': packagesManifestSpec,
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
    'skill list': cloneCommandSpec(commandSpecs['skill-list'], {
      usage: 'opl skill list [--domain <domain_id>]',
      group: 'skill',
    }),
    'skill sync': cloneCommandSpec(commandSpecs['skill-sync'], {
      usage: 'opl skill sync [--domain <domain_id>] [--home <home_path>] [--quiet]',
      group: 'skill',
    }),
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
        'opl family-runtime status|doctor|install|repair|intake|tick|enqueue|evidence-worklist|queue list|queue inspect|approve|notify list|events export [options]',
      examples: [
        'opl family-runtime status',
        'opl family-runtime repair',
        'opl family-runtime tick --source provider-cron --hydrate',
        'opl family-runtime lifecycle apply --mode dry-run --domain medautogrant --source-ref mag://cleanup/plan --action \'{"action_id":"mark-opl-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/mag/tombstone"}\'',
        'opl family-runtime provider-slo tick --provider temporal',
        'opl family-runtime scheduler install --provider temporal',
        'opl family-runtime scheduler status --provider temporal',
        'opl family-runtime scheduler trigger --provider temporal',
        'opl family-runtime scheduler remove --provider temporal',
        'opl family-runtime scheduler tick --provider temporal',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
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
      usage: 'opl agents interfaces (--domain <domain> | --repo-dir <path>) [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
      summary: 'Generate the unified OPL-owned CLI, MCP, Skill, product-entry, and tool interface bundle from a domain pack or standard agent repo.',
      examples: [
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
      handler: (args) => buildStandardDomainAgentConformanceReport(args),
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
      usage: 'opl stages readiness --domain <domain>',
      summary: 'Summarize the default operator/App launch-readiness view from admission, proof, assumptions, cohort, replay, and advisory budget/validity refs without issuing a domain verdict.',
      examples: ['opl stages readiness --domain mas'],
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
    modules: modulesSpec,
    'module install': moduleInstallSpec,
    'module update': moduleUpdateSpec,
    'module reinstall': moduleReinstallSpec,
    'module remove': moduleRemoveSpec,
    'module exec': moduleExecSpec,
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
    'runtime manager': cloneCommandSpec(commandSpecs['runtime manager'], {
      usage: 'opl runtime manager',
      examples: ['opl runtime manager'],
      group: 'runtime',
    }),
    'runtime manager action': cloneCommandSpec(commandSpecs['runtime manager action'], {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      group: 'runtime',
    }),
    'runtime snapshot': cloneCommandSpec(commandSpecs['runtime snapshot'], {
      usage: 'opl runtime snapshot',
      examples: ['opl runtime snapshot', 'opl runtime snapshot --json'],
      group: 'runtime',
    }),
    'runtime app-operator-drilldown': cloneCommandSpec(commandSpecs['runtime app-operator-drilldown'], {
      usage: 'opl runtime app-operator-drilldown [--detail summary|full] [--full]',
      examples: [
        'opl runtime app-operator-drilldown',
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      group: 'runtime',
    }),
    'runtime action execute': cloneCommandSpec(commandSpecs['runtime action execute'], {
      usage: 'opl runtime action execute --action <action_id> [--payload <json>] [--dry-run] [--approve-domain-action]',
      examples: [
        'opl runtime action execute --action action:sat_demo:attempt-query',
        'opl runtime action execute --action action:sat_demo:domain-repair-command:0 --dry-run',
      ],
      group: 'runtime',
    }),
    'runtime lifecycle apply': cloneCommandSpec(commandSpecs['runtime lifecycle apply'], {
      usage: 'opl runtime lifecycle apply --mode dry-run|apply|verify --domain <domain_id> [--action <json>] [--receipt-ref <ref>]',
      examples: [
        'opl runtime lifecycle apply --mode dry-run --domain medautogrant --action \'{"action_id":"mark-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/tombstone"}\'',
        'opl runtime lifecycle apply --mode verify --domain medautogrant',
      ],
      group: 'runtime',
    }),
    'runtime lifecycle reconcile': cloneCommandSpec(commandSpecs['runtime lifecycle reconcile'], {
      usage: 'opl runtime lifecycle reconcile [--domain <domain_id>] [--expected-source-ref <ref>] [--expected-receipt-ref <ref>] [--expected-restore-proof-ref <ref>] [--expected-domain-artifact-mutation-receipt-ref <ref>] [--max-age-ms <n>]',
      examples: [
        'opl runtime lifecycle reconcile --domain medautogrant --expected-source-ref mag://package/run-1',
        'opl runtime lifecycle reconcile --domain medautogrant --expected-restore-proof-ref restore-proof:mag-package',
      ],
      group: 'runtime',
    }),
    'runtime observability-export': cloneCommandSpec(commandSpecs['runtime observability-export'], {
      usage: 'opl runtime observability-export [--format json|openmetrics]',
      examples: [
        'opl runtime observability-export',
        'opl runtime observability-export --format openmetrics',
      ],
      group: 'runtime',
    }),
    'runtime index': cloneCommandSpec(commandSpecs['runtime index'], {
      usage: 'opl runtime index',
      examples: ['opl runtime index'],
      group: 'runtime',
    }),
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
