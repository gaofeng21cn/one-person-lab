import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow } from '../../../modules/charter/contracts.ts';
import { resolveStandardAgent } from '../../../modules/charter/index.ts';
import { buildOplFrameworkLocator } from '../../../modules/connect/opl-framework-locator.ts';
import {
  buildFrameworkOperatingMaturityCompactReadback,
  buildFrameworkOperatingMaturityReadout,
  buildFrameworkReadinessCompactReadback,
  buildFrameworkReadinessSummary,
  buildPrivatePlatformResidueOwnerDecisionLedgerCommand,
  buildAgentReadinessSummary,
} from '../../../modules/console/index.ts';
import { buildSourceStructureOperatorReadback } from '../../../modules/charter/source-structure-operator-readback.ts';
import { buildRuntimeTraySnapshot } from '../../../modules/console/runtime-tray-snapshot.ts';
import { runOplEngineAction } from '../../../modules/connect/system-installation/engine-actions.ts';
import { runOplTurnkeyInstall } from '../../../modules/connect/system-installation/turnkey.ts';
import {
  buildFamilyActionExport,
  buildFamilyActionInspect,
  buildFamilyActionsList,
} from '../../../modules/console/family-action-catalog.ts';
import {
  buildFamilyAgentDescriptorInspect,
  buildFamilyAgentDescriptorList,
} from '../../../modules/atlas/family-domain-agent-descriptor.ts';
import { buildDomainManifestCatalog } from '../../../modules/atlas/domain-manifest/catalog-builder.ts';
import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
} from '../../../modules/atlas/index.ts';
import {
  buildGeneratedAgentInterfaces,
  buildDomainPackCompilerInspect,
  buildDomainPackCompilerList,
  parsePackCompilerArgs,
} from '../../../modules/pack/domain-pack-compiler.ts';
import {
  buildAgentDefaultCallerReadinessReport,
  buildAgentPlatformSurfaceOwnershipReport,
  buildStandardDomainAgentConformanceReport,
  buildStandardAgentSourceClosureReport,
  buildStandardAgentCheck,
  buildFamilyAgentInspect,
  buildFamilyAgentsList,
  runFamilyAgentLegacyCleanupApply,
  withStandardDomainAgentSkeletonInspection,
} from '../../../modules/workspace/index.ts';
import { agentsEvidenceApplySpec } from './agent-evidence-command-spec.ts';
import {
  buildFamilyDomainMemoryInspect,
  buildFamilyDomainMemoryList,
  buildFamilyDomainMemoryMigrationPlan,
} from '../../../modules/atlas/family-domain-memory.ts';
import {
  buildGenericSubstrateProjectionInspect,
  buildGenericSubstrateProjectionList,
  buildGenericSubstrateWorkbench,
} from '../../../modules/runway/generic-substrate-projection.ts';
import { readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain } from '../../../modules/runway/index.ts';
import { runProductEntryResume } from '../../../modules/console/product-entry-runtime.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildPublicSystemCommandSpecs } from './system-public-command-specs.ts';
import { buildPublicRuntimeCommandSpecs } from './runtime-public-command-specs.ts';
import {
  buildPublicEngineActionPayload,
  buildPublicTurnkeyInstallPayload,
} from '../modules/public-payloads.ts';
import { assertNoArgs, bindCommandRegistryMetadata, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, parseOplEngineArgs, parseResumeArgs, parseTurnkeyInstallArgs, printJson, validateCommandRegistryCoverage, withContractsContext } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';
import { buildBrandCommandSpecs } from './public-command-specs-parts/brand.ts';
import { buildConnectCommandSpecs } from './public-command-specs-parts/connect.ts';
import { buildFoundryCommandSpecs } from './public-command-specs-parts/foundry.ts';
import { buildOkfCommandSpecs } from './public-command-specs-parts/okf.ts';
import { buildPackagesCommandSpecs } from './public-command-specs-parts/packages.ts';
import { buildProfileCommandSpecs } from './public-command-specs-parts/profiles.ts';
import { buildStageCommandSpecs, validateStageDerivedLensCommandSpecs } from './public-command-specs-parts/stages.ts';
import { buildUpdateCommandSpecs } from './public-command-specs-parts/update.ts';
import { buildWorkspaceCommandSpecs } from './public-command-specs-parts/workspace.ts';
import { buildPublicAppCommandSpecs } from './app-public-command-specs.ts';

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const standardAgentPackCompilerInputs = () => ({
    familyRepoInputs: defaultStandardDomainAgentRepoInputs(),
    defaultRepoDirectories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
    resolveDomainSelection: (value: string) => resolveStandardAgent(value)?.domain_id ?? value,
  });
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
      'opl install [--headless | --with-app] [--skip-packages] [--skip-engines] [--skip-native-helper-repair] [--no-online-runtime]',
    summary: 'Install the headless OPL Base by default, or add the optional desktop App; Agent packages use opl packages install.',
    examples: [
      'opl install',
      'opl install --headless --skip-packages',
      'opl install --with-app',
    ],
    group: 'top_level',
    handler: async (args) => buildPublicTurnkeyInstallPayload(
      await runOplTurnkeyInstall(getContracts(), parseTurnkeyInstallArgs(args, installSpec)),
    ),
  };

  const parseFrameworkReadbackDetail = (
    args: string[],
    spec: CommandSpec,
    commandName: string,
  ) => {
    if (args.length === 1 && args[0] === '--family-defaults') {
      return 'full';
    }
    if (
      args.length === 3
      && args[0] === '--family-defaults'
      && args[1] === '--detail'
      && args[2] === 'compact'
    ) {
      return 'compact';
    }
    throw buildUsageError(`${commandName} requires --family-defaults and optionally --detail compact.`, spec, {
      required: ['--family-defaults'],
      optional: ['--detail compact'],
      allowed_detail_levels: ['compact'],
    });
  };

  const commandRegistry = getContracts().cliCommandRegistry;
  bindCommandRegistryMetadata(
    commandSpecs,
    Object.fromEntries(
      Object.entries(commandRegistry.commands).filter(([, entry]) => (
        typeof entry === 'object'
        && entry !== null
        && !Array.isArray(entry)
        && typeof (entry as Record<string, unknown>).command_id === 'string'
        && Boolean(commandSpecs[(entry as Record<string, unknown>).command_id as string])
      )),
    ),
  );
  const systemCommandSpecs = buildPublicSystemCommandSpecs(getContracts);
  const runtimeCommandSpecs = buildPublicRuntimeCommandSpecs(commandSpecs);
  const brandCommandSpecs = buildBrandCommandSpecs(getContracts);
  const connectCommandSpecs = buildConnectCommandSpecs(commandSpecs, systemCommandSpecs);
  const foundryCommandSpecs = buildFoundryCommandSpecs();
  const okfCommandSpecs = buildOkfCommandSpecs();
  const packagesCommandSpecs = buildPackagesCommandSpecs(getContracts, (command) => publicCommandSpecs[command]);
  const profileCommandSpecs = buildProfileCommandSpecs();
  const stageCommandSpecs = buildStageCommandSpecs(getContracts);
  const updateCommandSpecs = buildUpdateCommandSpecs(getContracts);
  const workspaceCommandSpecs = buildWorkspaceCommandSpecs(commandSpecs);
  const appCommandSpecs = buildPublicAppCommandSpecs(getContracts);
  const buildAgentDescriptorManifests = (options: Parameters<typeof buildDomainManifestCatalog>[1] = {}) =>
    withStandardDomainAgentSkeletonInspection(
      buildDomainManifestCatalog(getContracts(), options).domain_manifests,
    );
  const loadAgentDescriptorsForPackCompiler = () =>
    buildFamilyAgentDescriptorList(getContracts(), {
      domainManifests: buildAgentDescriptorManifests({
        manifestCommandTimeoutMs: 120_000,
        manifestCommandTimeoutPolicy: 'fixed',
      }),
      manifestCommandTimeoutMs: 120_000,
      manifestCommandTimeoutPolicy: 'fixed',
    }).family_agent_descriptors.descriptors as Record<string, unknown>[];

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
    ...appCommandSpecs,
    ...brandCommandSpecs,
    ...foundryCommandSpecs,
    ...profileCommandSpecs,
    ...connectCommandSpecs,
    ...packagesCommandSpecs,
    ...updateCommandSpecs,
    ...okfCommandSpecs,
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
      usage: 'opl framework readiness --family-defaults [--detail compact]',
      summary:
        'Read the default attention-first framework readiness summary and Kernel floor without claiming domain, quality, artifact, or production ready.',
      examples: [
        'opl framework readiness --family-defaults --json',
        'opl framework readiness --family-defaults --detail compact --json',
      ],
      group: 'framework',
      handler: async (args) => {
        const detail = parseFrameworkReadbackDetail(
          args,
          publicCommandSpecs['framework readiness'],
          'framework readiness',
        );
        if (detail === 'compact') {
          return await buildFrameworkReadinessCompactReadback(
            getContracts(),
            { familyDefaults: true },
            { runtimeSnapshotProvider: buildRuntimeTraySnapshot },
          );
        }
        return await buildFrameworkReadinessSummary(
          getContracts(),
          { familyDefaults: true },
          { runtimeSnapshotProvider: buildRuntimeTraySnapshot },
        );
      },
    },
    'framework operating-maturity': {
      usage: 'opl framework operating-maturity --family-defaults [--detail compact]',
      summary:
        'Aggregate domain owner-chain scaleout, L5, App release, provider long-soak, cleanup, and lifecycle evidence gaps without claiming readiness.',
      examples: [
        'opl framework operating-maturity --family-defaults --json',
        'opl framework operating-maturity --family-defaults --detail compact --json',
      ],
      group: 'framework',
      handler: async (args) => {
        const detail = parseFrameworkReadbackDetail(
          args,
          publicCommandSpecs['framework operating-maturity'],
          'framework operating-maturity',
        );
        const output = await buildFrameworkOperatingMaturityReadout(
          getContracts(),
          { familyDefaults: true },
          { runtimeSnapshotProvider: buildRuntimeTraySnapshot },
        );
        if (detail === 'compact') {
          return buildFrameworkOperatingMaturityCompactReadback(output.framework_operating_maturity);
        }
        return output;
      },
    },
    'framework source-structure': {
      usage: 'opl framework source-structure --family-defaults [--strict]',
      summary:
        'Read the OPL source-structure line-budget guard as an operator readback without claiming readiness, quality verdict, or completion.',
      examples: [
        'opl framework source-structure --family-defaults --json',
        'opl framework source-structure --family-defaults --strict --json',
      ],
      group: 'framework',
      handler: (args) => {
        const allowed = new Set(['--family-defaults', '--strict']);
        if (
          !args.includes('--family-defaults')
          || args.some((arg) => !allowed.has(arg))
          || args.filter((arg) => arg === '--family-defaults').length !== 1
          || args.filter((arg) => arg === '--strict').length > 1
        ) {
          throw buildUsageError(
            'framework source-structure requires --family-defaults and optionally --strict.',
            publicCommandSpecs['framework source-structure'],
            {
              required: ['--family-defaults'],
              optional: ['--strict'],
            },
          );
        }
        return buildSourceStructureOperatorReadback({ strict: args.includes('--strict') });
      },
    },
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
        const { buildQualityDetails, parseQualityDetailsArgs, renderQualityDetailsMarkdown } = await import('../../../modules/stagecraft/quality-details/index.ts');
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
      usage: 'opl skill companion status [--home <home_path>]',
      group: 'skill',
    }),
    'skill companion apply': cloneCommandSpec(commandSpecs['skill-companion-apply'], {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>]',
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
        'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|scheduler status|scheduler install|scheduler trigger|scheduler remove|evidence-worklist|attempt list|attempt inspect|attempt query|attempt cancel|notify list|events export [options]',
      examples: [
        'opl family-runtime status',
        'opl family-runtime repair',
        'opl family-runtime provider repair --provider temporal',
        'opl family-runtime lifecycle apply --mode dry-run --domain medautogrant --source-ref mag://cleanup/plan --action \'{"action_id":"mark-opl-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/mag/tombstone"}\'',
        'opl family-runtime provider-slo tick --provider temporal',
        'opl family-runtime provider-worker supervisor install --provider temporal',
        'opl family-runtime scheduler install --provider temporal',
        'opl family-runtime scheduler status --provider temporal',
        'opl family-runtime scheduler trigger --provider temporal',
        'opl family-runtime scheduler remove --provider temporal',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
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
    'status dashboard': cloneCommandSpec(commandSpecs['status dashboard'], {
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
      summary: 'List domain-owned family action catalogs from selected managed Standard Agent contracts or non-standard legacy bindings.',
      examples: ['opl actions list'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['actions list']);
        return buildFamilyActionsList(getContracts());
      },
    },
    'actions inspect': {
      usage: 'opl actions inspect --domain <domain> --action <action_id>',
      summary: 'Inspect one managed or legacy domain action plus its derived CLI/MCP/Skill/tool projections.',
      examples: ['opl actions inspect --domain redcube --action start_deliverable'],
      group: 'domain',
      handler: (args) => buildFamilyActionInspect(getContracts(), args),
    },
    'actions export': {
      usage: 'opl actions export --domain <domain> --format <cli|mcp|skill|openai|ai-sdk>',
      summary: 'Export one resolved domain action catalog as a derived CLI, MCP, Skill, OpenAI, or AI SDK descriptor set.',
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
    'agents run': cloneCommandSpec(commandSpecs['agents run'], {
      usage: 'opl agents run --domain <agent> --action <action_id> --workspace <absolute_path> [--payload <json> | --payload-file <path>] [--run-id <id>] [--timeout-ms <ms>]',
      examples: [
        'opl agents run --domain obf --action shape-storyline --workspace /path/to/book --payload \'{"workspace_root":"/path/to/book"}\'',
        'opl agents run --domain mas --action study-progress --workspace /path/to/workspace --payload-file request.json --json',
      ],
      group: 'domain',
    }),
    'agents check': {
      usage: 'opl agents check --repo <agent_repo> [--profile <profile_id>]',
      summary: 'Aggregate existing scaffold, generated-interface, optional profile, and local framework-export compatibility checks for one standard Agent repo.',
      examples: [
        'opl agents check --repo /path/to/agent',
        'opl agents check --repo /path/to/agent --profile evidence_grounded_decision_agent_profile.v1',
      ],
      group: 'domain',
      handler: (args) => buildStandardAgentCheck(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
    },
    'agents descriptors': {
      usage: 'opl agents descriptors',
      summary: 'List unified domain-agent descriptors projected from entry, stage, action, memory, skill, runtime, and artifact refs.',
      examples: ['opl agents descriptors'],
      group: 'domain',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['agents descriptors']);
        return buildFamilyAgentDescriptorList(getContracts(), {
          domainManifests: buildAgentDescriptorManifests(),
        });
      },
    },
    'agents descriptor': {
      usage: 'opl agents descriptor --domain <domain>',
      summary: 'Inspect one unified domain-agent descriptor without embedding domain memory or instruction bodies.',
      examples: ['opl agents descriptor --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyAgentDescriptorInspect(getContracts(), args, {
        domainManifests: buildAgentDescriptorManifests(),
      }),
    },
    'agents pack-compiler': {
      usage: 'opl agents pack-compiler [--family-defaults]',
      summary: 'List OPL-owned generated-surface handoff projections compiled from admitted manifests or default standard agent repo contracts.',
      examples: ['opl agents pack-compiler', 'opl agents pack-compiler --family-defaults'],
      group: 'domain',
      handler: (args) => {
        return buildDomainPackCompilerList(getContracts(), {
          ...parsePackCompilerArgs(args),
          loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
          ...standardAgentPackCompilerInputs(),
        });
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
      handler: (args) => buildDomainPackCompilerInspect(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
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
      handler: (args) => buildGeneratedAgentInterfaces(getContracts(), args, {
        loadAgentDescriptors: loadAgentDescriptorsForPackCompiler,
        ...standardAgentPackCompilerInputs(),
      }),
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
    'agents source-closure': {
      usage: 'opl agents source-closure [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]',
      summary:
        'Prove standard Agent package, action, handler, call, and sensitive-effect closure from executable source instead of audit path declarations.',
      examples: [
        'opl agents source-closure --family-defaults',
        'opl agents source-closure --agent mas=/path/to/med-autoscience',
      ],
      group: 'domain',
      handler: (args) => buildStandardAgentSourceClosureReport(args),
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
        return buildFamilyDomainMemoryList(getContracts(), {
          runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
        });
      },
    },
    'domain-memory inspect': {
      usage: 'opl domain-memory inspect --domain <domain>',
      summary: 'Inspect one domain-owned memory locator, receipt projection, and OPL non-authority boundary.',
      examples: ['opl domain-memory inspect --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryInspect(getContracts(), args, {
        runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
      }),
    },
    'domain-memory migration-plan': {
      usage: 'opl domain-memory migration-plan --domain <domain>',
      summary: 'Project domain-owned migration, proposal contract, router receipt, and writeback receipt locators.',
      examples: ['opl domain-memory migration-plan --domain mas'],
      group: 'domain',
      handler: (args) => buildFamilyDomainMemoryMigrationPlan(getContracts(), args, {
        runtimeReceiptEvidenceIndex: readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain(),
      }),
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
  bindCommandRegistryMetadata(publicCommandSpecs, commandRegistry.commands);
  validateCommandRegistryCoverage(publicCommandSpecs, {
    protectedCommandPrefixes: commandRegistry.protected_command_prefixes,
  });

  return publicCommandSpecs;
}
