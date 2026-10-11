import { FrameworkContractError } from '../../../authority/contracts/contracts.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildPublicSystemCommandSpecs } from './system-public-command-specs.ts';
import { buildPublicRuntimeCommandSpecs } from './runtime-public-command-specs.ts';
import { assertNoArgs, bindCommandRegistryMetadata, buildCommandHelp, buildRootHelp, buildUsageError, cloneCommandSpec, validateCommandRegistryCoverage } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';
import { buildContractCommandSpecs } from './public-command-specs-parts/contract.ts';
import { buildDomainCommandSpecs } from './public-command-specs-parts/domain.ts';
import { buildFrameworkCommandSpecs } from './public-command-specs-parts/framework.ts';
import { buildInstallationCommandSpecs } from './public-command-specs-parts/engine.ts';
import { buildSessionCommandSpecs } from './public-command-specs-parts/session.ts';
import { buildBrandCommandSpecs } from './public-command-specs-parts/brand.ts';
import { buildConnectCommandSpecs } from './public-command-specs-parts/connect.ts';
import { buildFoundryCommandSpecs } from './public-command-specs-parts/foundry.ts';
import { buildOkfCommandSpecs } from './public-command-specs-parts/okf.ts';
import { buildPackagesCommandSpecs } from './public-command-specs-parts/packages.ts';
import { buildProfileCommandSpecs } from './public-command-specs-parts/profiles.ts';
import { buildReleaseCommandSpecs } from './public-command-specs-parts/release.ts';
import { buildStageCommandSpecs, validateStageDerivedLensCommandSpecs } from './public-command-specs-parts/stages.ts';
import { buildUpdateCommandSpecs } from './public-command-specs-parts/update.ts';
import { buildWorkspaceCommandSpecs } from './public-command-specs-parts/workspace.ts';
import {
  buildCordisCommandSpecs,
  type CordisCliComposition,
} from './public-command-specs-parts/cordis.ts';
import { buildPublicAppCommandSpecs } from './app-public-command-specs.ts';

export function buildPublicCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
  getContracts: () => FrameworkContracts,
  cordis?: CordisCliComposition,
): Record<string, CommandSpec> {
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
  const brandCommandSpecs = buildBrandCommandSpecs(
    getContracts,
    cordis?.services.familyRuntime ?? (() => {
      throw new Error('CLI command requires an explicit Cordis base-headless composition.');
    }),
  );
  const connectCommandSpecs = buildConnectCommandSpecs(commandSpecs, systemCommandSpecs);
  const foundryCommandSpecs = buildFoundryCommandSpecs();
  const okfCommandSpecs = buildOkfCommandSpecs();
  const packagesCommandSpecs = buildPackagesCommandSpecs(
    getContracts,
    (command) => publicCommandSpecs[command],
  );
  const profileCommandSpecs = buildProfileCommandSpecs();
  const createReleaseOperationComposition =
    cordis?.profileId === 'base-headless'
      ? cordis.services.childFactories.createReleaseOperationComposition
      : undefined;
  const releaseCommandSpecs = buildReleaseCommandSpecs(
    (command) => publicCommandSpecs[command],
    createReleaseOperationComposition,
  );
  const atlasService = cordis?.services.atlas;
  const installationCommandSpecs = buildInstallationCommandSpecs(getContracts);
  const frameworkCommandSpecs = buildFrameworkCommandSpecs(getContracts);
  const domainCommandSpecs = buildDomainCommandSpecs({
    getContracts,
    commandSpecs,
    atlasService,
  });
  const contractCommandSpecs = buildContractCommandSpecs(commandSpecs, getContracts);
  const sessionCommandSpecs = buildSessionCommandSpecs(commandSpecs);
  const stageCommandSpecs = buildStageCommandSpecs(getContracts, atlasService);
  const updateCommandSpecs = buildUpdateCommandSpecs(getContracts);
  const workspaceCommandSpecs = buildWorkspaceCommandSpecs(commandSpecs);
  const appCommandSpecs = buildPublicAppCommandSpecs(
    getContracts,
    cordis?.services.descriptorDiscovery,
    cordis?.services.familyRuntime,
    cordis?.services.ownerDeltaObserver,
    cordis?.profileId === 'app-full' ? cordis.services.automationProviderHost : null,
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
    ...installationCommandSpecs,
    ...appCommandSpecs,
    ...brandCommandSpecs,
    ...foundryCommandSpecs,
    ...profileCommandSpecs,
    ...connectCommandSpecs,
    ...packagesCommandSpecs,
    ...updateCommandSpecs,
    ...okfCommandSpecs,
    ...buildCordisCommandSpecs(cordis),
    ...frameworkCommandSpecs,
    doctor: cloneCommandSpec(commandSpecs.doctor, { group: 'top_level' }),
    start: cloneCommandSpec(commandSpecs.start, { group: 'top_level' }),
    'connect mcp-stdio': {
      usage: 'opl connect mcp-stdio',
      summary: 'Serve the curated read-only OPL Connect MCP toolset over stdio.',
      examples: ['opl connect mcp-stdio'],
      group: 'connect',
      handler: (args) => {
        assertNoArgs(args, publicCommandSpecs['connect mcp-stdio']);
        return {
          version: 'g2',
          opl_connect_mcp_stdio: {
            surface_kind: 'opl_connect_mcp_stdio_interface',
            server_id: 'opl-connect',
            transport: 'stdio',
            runtime_command: ['opl', 'connect', 'mcp-stdio'],
            tool_exposure: 'curated_progressive_read_only',
            authority_boundary: {
              can_write_domain_truth: false,
              can_sign_owner_receipt: false,
              can_create_typed_blocker: false,
              can_claim_reference_truth: false,
              can_claim_publication_readiness: false,
            },
          },
        };
      },
    },
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
        const { buildQualityDetails, parseQualityDetailsArgs, renderQualityDetailsMarkdown } = await import('../../../authority/stages/quality-details/index.ts');
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
    ...releaseCommandSpecs,
    ...domainCommandSpecs,
    ...stageCommandSpecs,
    ...contractCommandSpecs,
    ...systemCommandSpecs,
    ...installationCommandSpecs,
    ...sessionCommandSpecs,
    ...runtimeCommandSpecs,
  };

  validateStageDerivedLensCommandSpecs(publicCommandSpecs);
  bindCommandRegistryMetadata(publicCommandSpecs, commandRegistry.commands);
  validateCommandRegistryCoverage(publicCommandSpecs, {
    protectedCommandPrefixes: commandRegistry.protected_command_prefixes,
  });

  return publicCommandSpecs;
}
