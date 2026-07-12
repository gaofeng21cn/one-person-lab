import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow, validateFrameworkContracts } from '../../../modules/charter/contracts.ts';
import { buildOplWorkspaceRootSurface, writeOplWorkspaceRootSurface } from '../../../modules/connect/system-installation/workspace-root.ts';
import { buildProductEntryHandoffEnvelope } from '../../../modules/console/product-entry-handoff-envelope.ts';
import { buildProductEntryDoctor } from '../../../modules/console/product-entry-runtime.ts';
import { runAgentExecutor, runAgentExecutorDoctor, runAgentExecutorRequestFile } from '../../../modules/runway/agent-executor.ts';
import { launchDomainEntry } from '../../../modules/atlas/domain-launch.ts';
import { buildDomainManifestCatalog } from '../../../modules/atlas/domain-manifest/catalog-builder.ts';
import { buildOplDashboard, buildOplStart, buildProjectsOverview } from '../../../modules/console/management/runtime-dashboard.ts';
import { runAcpStdioBridge } from '../../../modules/connect/opl-acp-stdio.ts';
import { syncOplCompanionSkills } from '../../../modules/connect/install-companions.ts';
import { readFamilySkillPacks, syncFamilySkillPacks } from '../../../modules/connect/opl-skills.ts';
import {
  canonicalAgentPackageId,
  ensureOplAgentPackageScopeActivation,
  runOplAgentPackageStatus,
} from '../../../modules/connect/index.ts';
import { buildSessionLedger } from '../../../modules/runway/session-ledger.ts';
import { explainDomainBoundary, selectDomainAgentEntry } from '../../../modules/atlas/resolver.ts';
import { activateWorkspaceBinding, archiveWorkspaceBinding, bindWorkspace, buildWorkspaceCatalog, resolveWorkspaceLocator } from '../../../modules/workspace/workspace-registry.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildWorkspaceInitializeCommandSpecs } from './workspace-initialize-command-spec.ts';
import { buildPrivateAgentCommandSpecs } from './private-command-specs-parts/agents.ts';
import { buildPrivateRuntimeCommandSpecs } from './private-command-specs-parts/runtime.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, parseExecutorExecArgs, parseExecutorOption, parseExecutorRequestPath, parseKeyValueArgs, parseLaunchDomainArgs, parseProductEntryArgs, parseRegisteredCommandOptions, parseSessionLedgerArgs, parseSessionRuntimeArgs, parseSkillPackArgs, parseStartArgs, parseWorkspaceRegistryArgs, parseWorkspaceRootArgs, runCodexPassthroughHandled, withContractsContext } from '../modules/support.ts';
import type { CommandSpec, ParsedCliInput } from '../modules/support.ts';

async function ensureDomainPackageLaunchReady(
  projectId: string,
  workspacePath?: string,
  options: { activateMissingScope?: boolean } = {},
) {
  const workspaceLocator = resolveWorkspaceLocator(projectId, workspacePath);
  if (!workspaceLocator.binding) return;
  const packageId = canonicalAgentPackageId(projectId);
  if (!packageId) return;
  const initialStatus = runOplAgentPackageStatus({ packageId }).opl_agent_package_status;
  if (options.activateMissingScope !== false && initialStatus.installed_package_count > 0) {
    await ensureOplAgentPackageScopeActivation({
      packageId,
      scope: 'workspace',
      targetWorkspace: workspaceLocator.absolute_path,
    });
  }
  const packageStatus = runOplAgentPackageStatus({
    packageId,
    scope: 'workspace',
    targetWorkspace: workspaceLocator.absolute_path,
  }).opl_agent_package_status;
  if (packageStatus.launch_allowed === true) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Domain launch is blocked until the installed package dependency closure and workspace materialization are repaired.',
    {
      project_id: projectId,
      package_id: packageId,
      launch_allowed: false,
      launch_blocked_reason: packageStatus.launch_blocked_reason,
      allowed_when_blocked: packageStatus.allowed_when_blocked,
      package_dependency_readiness: packageStatus.package_dependency_readiness,
      materialization_readiness: packageStatus.materialization_readiness,
      repair_action: packageStatus.repair_action,
      failure_code: 'agent_package_operational_readiness_blocked',
    },
  );
}

export function buildInternalCommandSpecs(
  parsedInput: ParsedCliInput,
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const getCommandSpecs = () => commandSpecs;
  const commandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command]',
      summary: 'Show the top-level command surface or command-scoped runnable examples.',
      examples: ['opl help', 'opl help get-domain'],
      handler: (args) => {
        const [helpTarget, ...extraArgs] = args;
        if (extraArgs.length > 0) {
          throw buildUsageError(
            'help accepts at most one optional command name.',
            commandSpecs.help,
            { command: helpTarget },
          );
        }

        if (!helpTarget) {
          return buildRootHelp(commandSpecs);
        }

        const helpSpec = commandSpecs[helpTarget];
        if (!helpSpec) {
          throw new FrameworkContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(commandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    'list-workstreams': {
      usage: 'opl list-workstreams',
      summary: 'List admitted OPL workstream summaries.',
      examples: ['opl list-workstreams'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstreams: contracts.workstreams.workstreams.map((workstream) => ({
            workstream_id: workstream.workstream_id,
            label: workstream.label,
            status: workstream.status,
            domain_id: workstream.domain_id,
          })),
        });
      },
    },
    'get-workstream': {
      usage: 'opl get-workstream <workstream_id>',
      summary: 'Show the full registered meaning for one workstream.',
      examples: ['opl get-workstream research_ops', 'opl get-workstream presentation_ops'],
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('get-workstream requires a workstream id.', commandSpecs['get-workstream'], {
            required: ['workstream_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstream: findWorkstreamOrThrow(contracts, workstreamId),
        });
      },
    },
    'list-domains': {
      usage: 'opl list-domains',
      summary: 'List admitted domain-agent summaries from the domain definition contract registry.',
      examples: ['opl list-domains'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          domains: contracts.domains.domains.map((domain) => ({
            domain_id: domain.domain_id,
            product_layer: domain.product_layer,
            package_kind: domain.foundry_agent_package.package_kind,
            embeds_opl_runtime: domain.foundry_agent_package.embeds_opl_runtime,
            independent_domain_agent: domain.independent_domain_agent.agent_id,
            single_app_skill: domain.single_app_skill.skill_id,
            domain_truth_owner: domain.domain_truth_owner,
            opl_projection_role: domain.opl_projection_role,
            owned_workstreams: domain.owned_workstreams,
          })),
        });
      },
    },
    'get-domain': {
      usage: 'opl get-domain <domain_id>',
      summary: 'Show the full registered meaning for one admitted domain agent.',
      examples: ['opl get-domain medautoscience', 'opl get-domain redcube'],
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('get-domain requires a domain id.', commandSpecs['get-domain'], {
            required: ['domain_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          domain: findDomainOrThrow(contracts, domainId),
        });
      },
    },
    'list-surfaces': {
      usage: 'opl list-surfaces',
      summary: 'List current OPL framework and domain-agent surface summaries.',
      examples: ['opl list-surfaces'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          surfaces: contracts.publicSurfaceIndex.surfaces.map((surface) => ({
            surface_id: surface.surface_id,
            category_id: surface.category_id,
            surface_kind: surface.surface_kind,
            boundary_role: surface.boundary_role,
            owner_scope: surface.owner_scope,
            truth_mode: surface.truth_mode,
          })),
        });
      },
    },
    'get-surface': {
      usage: 'opl get-surface <surface_id>',
      summary: 'Show the full registered meaning for one public surface.',
      examples: ['opl get-surface opl_framework_contract_hub'],
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('get-surface requires a surface id.', commandSpecs['get-surface'], {
            required: ['surface_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
      },
    },
    'validate-contracts': {
      usage: 'opl validate-contracts',
      summary: 'Validate the required OPL framework contract set and emit a machine-readable summary.',
      examples: ['opl validate-contracts'],
      handler: () => ({
        version: 'g2',
        validation: validateFrameworkContracts(parsedInput.loadOptions),
      }),
    },
    doctor: {
      usage: 'opl doctor',
      summary:
        'Check whether the local OPL product-entry shell and configured family runtime provider are ready for direct use.',
      examples: ['opl doctor', 'OPL_FAMILY_RUNTIME_PROVIDER=temporal opl doctor'],
      handler: () => {
        const validation = validateFrameworkContracts(parsedInput.loadOptions);
        return buildProductEntryDoctor(validation);
      },
    },
    projects: {
      usage: 'opl projects',
      summary: 'List the current OPL family project surfaces and their admitted workstreams.',
      examples: ['opl projects'],
      handler: () => buildProjectsOverview(getContracts()),
    },
    ...buildPrivateRuntimeCommandSpecs({ getCommandSpecs, getContracts }),
    ...buildPrivateAgentCommandSpecs({ getCommandSpecs }),
    'status dashboard': {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL product-runtime view across projects, workspace, and runtime.',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions('status dashboard', args, commandSpecs['status dashboard']);
        return buildOplDashboard(getContracts(), {
          workspacePath: parsed.path as string | undefined,
          sessionsLimit: parsed['sessions-limit'] as number | undefined,
        });
      },
    },
    start: {
      usage: 'opl start --project <project_id> [--mode <mode_id>]',
      summary: 'Select one resolved domain start surface and emit the exact next entry mode OPL recommends.',
      examples: [
        'opl start --project redcube',
        'opl start --project med-autogrant --mode build_direct_entry',
      ],
      handler: (args) => {
        const parsed = parseStartArgs(args, commandSpecs.start);
        if (!parsed.projectId) {
          throw buildUsageError(
            'start requires --project.',
            commandSpecs.start,
            { required: ['--project'] },
          );
        }

        return buildOplStart(getContracts(), {
          projectId: parsed.projectId,
          modeId: parsed.modeId,
        });
      },
    },
    'skill-list': {
      usage: 'opl skill list [--domain <domain_id>]',
      summary: 'Inspect the family domain plugin packs that OPL can register into the local Codex environment.',
      examples: [
        'opl skill list',
        'opl skill list --domain medautoscience',
        'opl skill list --domain rca',
      ],
      help_surface: 'migration_compatibility',
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-list']);
        return readFamilySkillPacks({ domains: parsed.domains });
      },
    },
    'skill-sync': {
      usage: 'opl skill sync [--domain <domain_id>] [--scope <codex|workspace|quest>] [--target-workspace <path>] [--target-quest <path>] [--target-root <path>] [--home <home_path>] [--quiet]',
      summary: 'Sync family skill packs to their declared target scope without changing default Codex runtime semantics.',
      examples: [
        'opl skill sync',
        'opl skill sync --domain medautoscience',
        'opl skill sync --domain mas-scholar-skills --scope workspace --target-workspace /path/to/workspace',
        'opl skill sync --domain mas-scholar-skills --scope quest --target-quest /path/to/quest',
        'opl skill sync --domain mas-scholar-skills --scope codex',
        'opl skill sync --home /tmp/codex-home',
      ],
      help_surface: 'migration_compatibility',
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-sync']);
        return syncFamilySkillPacks({
          domains: parsed.domains,
          home: parsed.home,
          scope: parsed.scope,
          targetWorkspace: parsed.targetWorkspace,
          targetQuest: parsed.targetQuest,
          targetRoot: parsed.targetRoot,
          companionMode: parsed.companionMode,
        });
      },
    },
    'skill-companion-status': {
      usage: 'opl skill companion status [--home <home_path>]',
      summary: 'Inspect the OPL recommended companion skill ecosystem without changing user skill configuration.',
      examples: [
        'opl skill companion status',
        'opl skill companion status --home /tmp/codex-home',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-status']);
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode: 'observe',
          }),
        };
      },
    },
    'skill-companion-apply': {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>]',
      summary: 'Apply OPL companion skill recommendations only when the user or OPL-managed profile explicitly permits it.',
      examples: [
        'opl skill companion apply --mode managed',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-apply']);
        const mode = parsed.companionMode ?? 'ask_to_apply';
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode,
          }),
        };
      },
    },
    'domain launch': {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      summary:
        'Invoke one already-bound domain direct-entry locator without upgrading OPL into runtime ownership.',
      examples: [
        'opl domain launch --project redcube --dry-run',
        'opl domain launch --project redcube --strategy open_url',
        'opl domain launch --project med-autogrant --path /Users/gaofeng/workspace/med-autogrant --strategy spawn_command',
      ],
      handler: async (args) => {
        const parsed = parseLaunchDomainArgs(args, commandSpecs['domain launch']);
        if (!parsed.projectId) {
          throw buildUsageError(
            'domain launch requires --project.',
            commandSpecs['domain launch'],
            { required: ['--project'] },
          );
        }

        await ensureDomainPackageLaunchReady(parsed.projectId, parsed.workspacePath, {
          activateMissingScope: !parsed.dryRun,
        });
        return launchDomainEntry(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          strategy: parsed.strategy,
          dryRun: parsed.dryRun,
        });
      },
    },
    'domain manifests': {
      usage: 'opl domain manifests',
      summary:
        'Resolve the active admitted-domain manifest_command bindings into machine-readable product-entry discovery surfaces.',
      examples: ['opl domain manifests'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['domain manifests']);
        const catalog = buildDomainManifestCatalog(getContracts());
        return {
          ...catalog,
          domain_manifests: catalog.domain_manifests,
        };
      },
    },
    'session runtime': {
      usage: 'opl session runtime --acp',
      summary: 'Run the minimal OPL ACP stdio bridge entry for external shells.',
      examples: [
        'opl session runtime --acp',
      ],
      handler: async (args) => {
        const parsed = parseSessionRuntimeArgs(args, commandSpecs['session runtime']);
        if (!parsed.acp) {
          throw buildUsageError(
            'session runtime currently requires --acp.',
            commandSpecs['session runtime'],
            { required: ['--acp'] },
          );
        }

        await runAcpStdioBridge();
        return {
          __handled: true as const,
        };
      },
    },
    exec: {
      usage:
        'opl exec [--executor <codex_cli|hermes_agent|claude_code|antigravity_cli>] [--cd <path>] [--model <model>] [--provider <provider>] [--reasoning-effort <effort>] <prompt...>',
      summary:
        'Run an OPL agent executor. Codex CLI remains the default; non-default executors require explicit selection.',
      examples: [
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl exec --executor hermes_agent --cd /Users/gaofeng/workspace/med-autoscience "Run a receipt-gated research stage."',
        'opl exec --executor claude_code --cd /Users/gaofeng/workspace/redcube-ai "Prepare a defense-ready slide deck for a thesis committee."',
        'opl exec --executor antigravity_cli --model gemini-3.5-flash --reasoning-effort high "Build an RCA HTML route candidate."',
        'opl exec --model gpt-5.4 "Summarize current workspace status."',
      ],
      handler: (args) => {
        const parsed = parseExecutorExecArgs(args, commandSpecs.exec);
        if (!parsed.executorKind && !process.env.OPL_EXECUTOR_KIND?.trim()) {
          return runCodexPassthroughHandled(['exec', ...args]);
        }
        return {
          version: 'g2',
          agent_execution_receipt: runAgentExecutor({
            executor_kind: parsed.executorKind,
            prompt: parsed.prompt,
            cwd: parsed.cwd,
            model: parsed.model,
            provider: parsed.provider,
            reasoning_effort: parsed.reasoningEffort,
            json: true,
          }),
        };
      },
    },
    'executor doctor': {
      usage: 'opl executor doctor [--executor <codex_cli|hermes_agent|claude_code|antigravity_cli>]',
      summary: 'Inspect one OPL agent executor adapter without running a task.',
      examples: [
        'opl executor doctor',
        'opl executor doctor --executor hermes_agent',
        'opl executor doctor --executor claude_code',
        'opl executor doctor --executor antigravity_cli',
      ],
      handler: (args) => runAgentExecutorDoctor({
        executorKind: parseExecutorOption(args, commandSpecs['executor doctor']),
      }),
    },
    'executor run': {
      usage: 'opl executor run --request <request.json>',
      summary: 'Run an OPL AgentExecutionRequest JSON file and return an AgentExecutionReceipt.',
      examples: [
        'opl executor run --request /tmp/agent-execution-request.json',
      ],
      handler: (args) => runAgentExecutorRequestFile(
        parseExecutorRequestPath(args, commandSpecs['executor run']),
      ),
    },
resume: {
  usage: 'opl resume [codex resume args...]',
  summary: 'Resume a Codex session as a raw passthrough.',
  examples: [
    'opl resume run_7e2a41a19175465f809c0a7f151278ee',
    'opl resume --last',
  ],
  handler: (args) => runCodexPassthroughHandled(['resume', ...args]),
},
    'workspace list': {
      usage: 'opl workspace list',
      summary: 'Show the file-backed workspace registry for OPL and admitted domain project surfaces.',
      examples: ['opl workspace list'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace list']);
        return buildWorkspaceCatalog(getContracts());
      },
    },
    'workspace root': {
      usage: 'opl workspace root',
      summary: 'Show the current OPL workspace root preference and its readiness state.',
      examples: ['opl workspace root'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root']);
        return buildOplWorkspaceRootSurface();
      },
    },
    'workspace root set': {
      usage: 'opl workspace root set --path <workspace_root>',
      summary: 'Persist the selected OPL workspace root for Initialize and GUI settings surfaces.',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      handler: (args) => {
        const parsed = parseWorkspaceRootArgs(args, commandSpecs['workspace root set']);
        if (!parsed.path) {
          throw buildUsageError(
            'workspace root set requires --path.',
            commandSpecs['workspace root set'],
            { required: ['--path'] },
          );
        }

        return writeOplWorkspaceRootSurface(parsed.path);
      },
    },
    'workspace root doctor': {
      usage: 'opl workspace root doctor',
      summary: 'Re-read the current workspace root selection and report its health surface.',
      examples: ['opl workspace root doctor'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root doctor']);
        return buildOplWorkspaceRootSurface();
      },
    },
    ...buildWorkspaceInitializeCommandSpecs(getContracts),
    'workspace-bind': {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      summary:
        'Bind and activate one workspace for an admitted project, optionally freezing or deriving its direct-entry locator.',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
        'opl workspace bind --project medautogrant --path /Users/gaofeng/workspace/med-autogrant --input /Users/gaofeng/workspace/med-autogrant/examples/nsfc_workspace_p2c_critique.json',
      ],
      handler: async (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-bind']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace bind requires both --project and --path.',
            commandSpecs['workspace-bind'],
            { required: ['--project', '--path'] },
          );
        }

        const workspaceBinding = bindWorkspace(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          label: parsed.label,
          entryCommand: parsed.entryCommand,
          manifestCommand: parsed.manifestCommand,
          entryUrl: parsed.entryUrl,
          workspaceRoot: parsed.workspaceRoot,
          profileRef: parsed.profileRef,
          inputPath: parsed.inputPath,
        });
        const packageId = canonicalAgentPackageId(parsed.projectId);
        const initialStatus = packageId
          ? runOplAgentPackageStatus({ packageId }).opl_agent_package_status
          : null;
        const packageScopeActivation = packageId && initialStatus && initialStatus.installed_package_count > 0
          ? await ensureOplAgentPackageScopeActivation({
              packageId,
              scope: 'workspace',
              targetWorkspace: parsed.workspacePath,
            })
          : null;
        return {
          ...workspaceBinding,
          package_scope_activation: packageScopeActivation,
        };
      },
    },
    'workspace-activate': {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      summary: 'Switch the active workspace binding for an admitted project.',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: async (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-activate']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace activate requires both --project and --path.',
            commandSpecs['workspace-activate'],
            { required: ['--project', '--path'] },
          );
        }

        const locator = resolveWorkspaceLocator(parsed.projectId, parsed.workspacePath);
        const packageId = canonicalAgentPackageId(parsed.projectId);
        if (locator.binding && locator.binding.status !== 'archived' && packageId) {
          await ensureOplAgentPackageScopeActivation({
            packageId,
            scope: 'workspace',
            targetWorkspace: locator.absolute_path,
          });
          const packageStatus = runOplAgentPackageStatus({
            packageId,
            scope: 'workspace',
            targetWorkspace: locator.absolute_path,
          }).opl_agent_package_status;
          if (packageStatus.launch_allowed !== true) {
            throw new FrameworkContractError(
              'contract_shape_invalid',
              'Workspace activation is blocked until package dependency and scope readiness are repaired.',
              {
                project_id: parsed.projectId,
                package_id: packageId,
                launch_blocked_reason: packageStatus.launch_blocked_reason,
                allowed_when_blocked: packageStatus.allowed_when_blocked,
                package_dependency_readiness: packageStatus.package_dependency_readiness,
                materialization_readiness: packageStatus.materialization_readiness,
                repair_action: packageStatus.repair_action,
                failure_code: 'agent_package_scope_activation_blocked',
              },
            );
          }
        }
        return activateWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace-archive': {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      summary: 'Archive one workspace binding so OPL no longer treats it as active or reusable.',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-archive']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace archive requires both --project and --path.',
            commandSpecs['workspace-archive'],
            { required: ['--project', '--path'] },
          );
        }

        return archiveWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'session ledger': {
      usage: 'opl session ledger [--limit <n>]',
      summary: 'Show OPL-managed session events with honest resource samples captured at event time.',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      handler: (args) => {
        const parsed = parseSessionLedgerArgs(args, commandSpecs['session ledger']);
        return buildSessionLedger(parsed.limit);
      },
    },
    'domain select-entry': {
      usage: 'opl domain select-entry --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Resolve a top-level request to an admitted workstream, domain boundary, or ambiguity envelope.',
      examples: [
        'opl domain select-entry --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          resolution: selectDomainAgentEntry(
            parseKeyValueArgs(args, commandSpecs['domain select-entry']),
            contracts,
          ),
        });
      },
    },
    'domain explain-boundary': {
      usage: 'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Explain why a request routes to a domain, stays under definition, or stops at a family boundary.',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
        'opl domain explain-boundary --intent create --target deliverable --goal "Grant proposal reviewer simulation and revision planning."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          boundary_explanation: explainDomainBoundary(
            parseKeyValueArgs(args, commandSpecs['domain explain-boundary']),
            contracts,
          ),
        });
      },
    },
    'contract handoff-envelope': {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      summary:
        'Build a machine-readable OPL family handoff bundle for the current request and active workspace bindings.',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) =>
        buildProductEntryHandoffEnvelope(
          parseProductEntryArgs(args, commandSpecs['contract handoff-envelope']),
          getContracts(),
        ),
    },
  };

  return commandSpecs;
}
