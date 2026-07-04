import { FrameworkContractError, findDomainOrThrow, findSurfaceOrThrow, findWorkstreamOrThrow, validateFrameworkContracts } from '../../../modules/charter/contracts.ts';
import { buildOplWorkspaceRootSurface, writeOplWorkspaceRootSurface } from '../../../modules/connect/system-installation/workspace-root.ts';
import { buildProductEntryHandoffEnvelope } from '../../../modules/console/product-entry-handoff-envelope.ts';
import { buildProductEntryDoctor, runProductEntryResume } from '../../../modules/console/product-entry-runtime.ts';
import { buildRuntimeManager, runRuntimeManagerAction } from '../../../modules/runway/index.ts';
import { buildRuntimeTraySnapshot } from '../../../modules/console/runtime-tray-snapshot.ts';
import { buildMemoryArtifactLifecycleReadback } from '../../../modules/ledger/memory-artifact-lifecycle-readback.ts';
import { runRuntimeOperatorActionExecute } from '../../../modules/runway/runtime-operator-action-execution.ts';
import {
  buildObservabilityExport,
  renderObservabilityOpenMetrics,
  runObservabilityCollectorSmoke,
  serveObservabilityMetricsEndpoint,
} from '../../../modules/runway/observability-export.ts';
import { buildNativeIndexSummary } from '../../../modules/runway/native-index-summary.ts';
import {
  buildStandardDomainAgentScaffold,
  buildStandardDomainAgentScaffoldValidation,
} from '../../../modules/foundry-lab/standard-domain-agent-scaffold.ts';
import { runFamilyAgentLegacyCleanupApply } from '../../../modules/foundry-lab/family-domain-agent-skeleton.ts';
import { withOplMetaAgentRegistryExtension } from '../../../modules/foundry-lab/opl-meta-agent-descriptor-adapter.ts';
import { recordOmaProductionConsumptionReceipts } from '../../../modules/foundry-lab/oma-production-consumption-ledger.ts';
import { repoTrackedOmaStageReplayMissingReceiptReceipts } from '../../../modules/foundry-lab/oma-stage-replay-receipts.ts';
import { buildStandardDomainAgentScaffoldConsumptionEvidence } from '../../../modules/foundry-lab/standard-domain-agent-template-consumption.ts';
import { runAgentExecutor, runAgentExecutorDoctor, runAgentExecutorRequestFile } from '../../../modules/runway/agent-executor.ts';
import { launchDomainEntry } from '../../../modules/atlas/domain-launch.ts';
import { buildDomainManifestCatalog } from '../../../modules/atlas/domain-manifest/catalog-builder.ts';
import { runFamilyRuntime } from '../../../modules/runway/family-runtime.ts';
import { buildOplDashboard, buildOplStart, buildProjectsOverview } from '../../../modules/console/management/runtime-dashboard.ts';
import { buildRuntimeStatus } from '../../../modules/console/management/runtime.ts';
import { buildWorkspaceStatus } from '../../../modules/console/management/workspace.ts';
import { runAcpStdioBridge } from '../../../modules/connect/opl-acp-stdio.ts';
import { syncOplCompanionSkills } from '../../../modules/connect/install-companions.ts';
import { readFamilySkillPacks, syncFamilySkillPacks } from '../../../modules/connect/opl-skills.ts';
import { resolveOplModuleExecCommand } from '../../../modules/connect/index.ts';
import { buildSessionLedger } from '../../../modules/runway/session-ledger.ts';
import { explainDomainBoundary, selectDomainAgentEntry } from '../../../modules/atlas/resolver.ts';
import { activateWorkspaceBinding, archiveWorkspaceBinding, bindWorkspace, buildWorkspaceCatalog } from '../../../modules/workspace/workspace-registry.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildRuntimeAppReleaseEvidenceCommandSpecs } from './runtime-app-release-evidence-command-spec.ts';
import {
  buildRuntimeBrandModuleL5EvidenceCommandSpecs,
} from './runtime-brand-module-l5-evidence-command-spec.ts';
import { buildRuntimeCodexAppRuntimeEvidenceCommandSpecs } from './runtime-codex-app-runtime-evidence-command-spec.ts';
import { buildRuntimeDomainOwnerPayloadSummaryCommandSpecs } from './runtime-domain-owner-payload-summary-command-spec.ts';
import {
  buildRuntimeMagManifestSustainedConsumptionCommandSpecs,
} from './runtime-mag-manifest-sustained-consumption-command-spec.ts';
import { buildRuntimeDeveloperModeCloseoutCommandSpecs } from './runtime-developer-mode-closeout-command-spec.ts';
import { buildRuntimeOmaAppLivePathCommandSpecs } from './runtime-oma-app-live-path-command-spec.ts';
import { buildRuntimeOmaProductionConsumptionCommandSpecs } from './runtime-oma-production-consumption-command-spec.ts';
import { buildIndexCommandSpec } from './index-command-spec.ts';
import { buildRuntimeResearchEvidencePackCommandSpecs } from './runtime-research-evidence-pack-command-spec.ts';
import {
  buildRuntimeResearchHypothesisPortfolioCommandSpecs,
} from './runtime-research-hypothesis-portfolio-command-spec.ts';
import {
  buildRuntimeProviderLongSoakEvidenceCommandSpecs,
} from './runtime-provider-long-soak-evidence-command-spec.ts';
import {
  buildRuntimeMemoryArtifactLifecycleEvidenceCommandSpecs,
} from './runtime-memory-artifact-lifecycle-evidence-command-spec.ts';
import {
  buildRuntimeStageReplayMissingReceiptCommandSpecs,
} from './runtime-stage-replay-missing-receipt-command-spec.ts';
import {
  buildRuntimeStageRunAuthorizationCommandSpecs,
} from './runtime-stage-run-authorization-command-spec.ts';
import {
  buildRuntimeStageTransitionAuthorityCommandSpecs,
} from './runtime-stage-transition-authority-command-spec.ts';
import {
  buildRuntimeStandardAgentTemplateConsumptionCommandSpecs,
} from './runtime-standard-agent-template-consumption-command-spec.ts';
import { buildRuntimeEnvironmentCommandSpecs } from './runtime-environment-command-spec.ts';
import { buildWorkspaceInitializeCommandSpecs } from './workspace-initialize-command-spec.ts';
import { parseAgentsScaffoldArgs } from './private-command-specs-parts/agents-scaffold.ts';
import { assertNoArgs, buildCommandHelp, buildRootHelp, buildUsageError, parseExecutorExecArgs, parseExecutorOption, parseExecutorRequestPath, parseKeyValueArgs, parseLaunchDomainArgs, parseProductEntryArgs, parseRegisteredCommandOptions, parseRuntimeAppOperatorDrilldownArgs, parseRuntimeManagerActionArgs, parseSessionLedgerArgs, parseSessionRuntimeArgs, parseSkillPackArgs, parseStartArgs, parseWorkspaceRegistryArgs, parseWorkspaceRootArgs, printJson, runCodexPassthroughHandled, withContractsContext } from '../modules/support.ts';
import type { CommandSpec, ParsedCliInput } from '../modules/support.ts';

export function buildInternalCommandSpecs(
  parsedInput: ParsedCliInput,
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
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
      examples: ['opl doctor', 'OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite opl doctor'],
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
    'status workspace': {
      usage: 'opl status workspace [--path <workspace_path>]',
      summary: 'Inspect one workspace path for git/worktree state and file-surface visibility.',
      examples: [
        'opl status workspace',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
      ],
      registry: {
        command_id: 'status workspace',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'path',
            flag: '--path',
            value_kind: 'string',
            summary: 'Workspace path to inspect.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/status_workspace/output_schema',
        authority_boundary: {
          owner: 'OPL Console',
          surface: 'workspace_status_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions('status workspace', args, commandSpecs['status workspace']);
        return buildWorkspaceStatus({ workspacePath: parsed.path as string | undefined });
      },
    },
    'status runtime': {
      usage: 'opl status runtime [--limit <n>]',
      summary: 'Show configured family runtime provider status and the OPL-managed session ledger.',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      registry: {
        command_id: 'status runtime',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'limit',
            flag: '--limit',
            value_kind: 'integer',
            summary: 'Maximum managed session ledger entries to include.',
            allowed_range: {
              min: 1,
              max: 500,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/status_runtime/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_status_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions('status runtime', args, commandSpecs['status runtime']);
        return buildRuntimeStatus({ sessionsLimit: parsed.limit as number | undefined });
      },
    },
    'runtime manager': {
      usage: 'opl runtime manager',
      summary:
        'Show the OPL Runtime Manager boundary for the configured provider-backed family runtime.',
      examples: ['opl runtime manager'],
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['runtime manager']);
        return await buildRuntimeManager({}, { buildStandardDomainAgentScaffold });
      },
    },
    'runtime manager action': {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      summary:
        'Plan or apply Runtime Manager adapter actions without making OPL a scheduler or domain truth owner.',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      handler: (args) => runRuntimeManagerAction(
        parseRuntimeManagerActionArgs(args, commandSpecs['runtime manager action']),
        { buildStandardDomainAgentScaffold },
      ),
    },
    'runtime snapshot': {
      usage: 'opl runtime snapshot',
      summary:
        'Project active domain progress surfaces into the desktop tray snapshot without starting a local daemon.',
      examples: ['opl runtime snapshot', 'opl runtime snapshot --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime snapshot']);
        return buildRuntimeTraySnapshot(getContracts());
      },
    },
    'runtime app-operator-drilldown': {
      usage: 'opl runtime app-operator-drilldown [--detail summary|full] [--full]',
      summary:
        'Project the App/operator drilldown read model from the runtime snapshot, summary-first by default.',
      examples: [
        'opl runtime app-operator-drilldown',
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      handler: async (args) => {
        const parsed = parseRuntimeAppOperatorDrilldownArgs(
          args,
          commandSpecs['runtime app-operator-drilldown'],
        );
        const snapshot = await buildRuntimeTraySnapshot(getContracts(), {
          appOperatorDrilldownDetailLevel: parsed.detailLevel,
        });
        return {
          app_operator_drilldown: snapshot.runtime_tray_snapshot.app_operator_drilldown,
        };
      },
    },
    'runtime memory-artifact-lifecycle': {
      usage: 'opl runtime memory-artifact-lifecycle',
      summary:
        'Project the memory/artifact/lifecycle owner follow-through packet without reading bodies or taking domain authority.',
      examples: [
        'opl runtime memory-artifact-lifecycle',
        'opl runtime memory-artifact-lifecycle --json',
      ],
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['runtime memory-artifact-lifecycle']);
        const snapshot = await buildRuntimeTraySnapshot(getContracts(), {
          appOperatorDrilldownDetailLevel: 'full',
        });
        return {
          memory_artifact_lifecycle_readback: buildMemoryArtifactLifecycleReadback(
            snapshot.runtime_tray_snapshot.app_operator_drilldown,
          ),
        };
      },
    },
    ...buildRuntimeAppReleaseEvidenceCommandSpecs(),
    ...buildRuntimeBrandModuleL5EvidenceCommandSpecs(getContracts),
    ...buildRuntimeCodexAppRuntimeEvidenceCommandSpecs(),
    ...buildRuntimeProviderLongSoakEvidenceCommandSpecs(),
    ...buildRuntimeMemoryArtifactLifecycleEvidenceCommandSpecs(),
    ...buildRuntimeStandardAgentTemplateConsumptionCommandSpecs(),
    ...buildRuntimeDomainOwnerPayloadSummaryCommandSpecs(),
    ...buildRuntimeMagManifestSustainedConsumptionCommandSpecs(),
    ...buildRuntimeStageReplayMissingReceiptCommandSpecs(),
    ...buildRuntimeStageRunAuthorizationCommandSpecs(),
    ...buildRuntimeStageTransitionAuthorityCommandSpecs(),
    ...buildRuntimeDeveloperModeCloseoutCommandSpecs(),
    ...buildRuntimeOmaAppLivePathCommandSpecs(),
    ...buildRuntimeOmaProductionConsumptionCommandSpecs(),
    ...buildRuntimeResearchEvidencePackCommandSpecs(),
    ...buildRuntimeResearchHypothesisPortfolioCommandSpecs(),
    ...buildRuntimeEnvironmentCommandSpecs(),
    'runtime action execute': {
      usage: 'opl runtime action execute --action <action_id> [--payload <json>|--payload-file <path>] [--dry-run] [--approve-domain-action]',
      summary:
        'Execute an App/operator action route through the OPL-owned safe action shell without taking domain truth authority.',
      examples: [
        'opl runtime action execute --action action:sat_demo:attempt-query',
        'opl runtime action execute --action action:sat_demo:domain-repair-command:0 --payload \'{"reason":"operator_selected"}\'',
      ],
      handler: (args) => runRuntimeOperatorActionExecute(getContracts(), args, {
        runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        runFamilyAgentLegacyCleanupApply,
        recordOmaProductionConsumptionReceipts,
      }),
    },
    'runtime lifecycle apply': {
      usage: 'opl runtime lifecycle apply --mode dry-run|apply|verify --domain <domain_id> [--action <json>|--handoff <json>] [--receipt-ref <ref>]',
      summary:
        'Expose the App/operator lifecycle apply surface while reusing the OPL family-runtime lifecycle ledger.',
      examples: [
        'opl runtime lifecycle apply --mode dry-run --domain medautogrant --action \'{"action_id":"mark-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/tombstone"}\'',
        'opl runtime lifecycle apply --mode dry-run --domain medautoscience --handoff-file mas-physical-thinning-handoff.json',
        'opl runtime lifecycle apply --mode verify --domain medautogrant',
      ],
      handler: async (args) => {
        const output = await runFamilyRuntime(['lifecycle', 'apply', ...args]);
        if (!('family_runtime_lifecycle_apply' in output)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'family-runtime lifecycle apply did not return lifecycle apply output.',
            {
              command: 'runtime lifecycle apply',
              output_keys: Object.keys(output),
            },
          );
        }
        return {
          runtime_lifecycle_apply: output.family_runtime_lifecycle_apply,
        };
      },
    },
    'runtime lifecycle reconcile': {
      usage: 'opl runtime lifecycle reconcile [--domain <domain_id>] [--expected-source-ref <ref>] [--expected-receipt-ref <ref>] [--expected-restore-proof-ref <ref>] [--expected-domain-artifact-mutation-receipt-ref <ref>] [--max-age-ms <n>]',
      summary:
        'Expose the App/operator lifecycle reconciliation surface without giving OPL domain delete authority.',
      examples: [
        'opl runtime lifecycle reconcile --domain medautogrant --expected-source-ref mag://package/run-1',
        'opl runtime lifecycle reconcile --domain medautogrant --expected-restore-proof-ref restore-proof:mag-package',
      ],
      handler: async (args) => {
        const output = await runFamilyRuntime(['lifecycle', 'reconcile', ...args]);
        if (!('family_runtime_lifecycle_reconcile' in output)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'family-runtime lifecycle reconcile did not return lifecycle reconcile output.',
            {
              command: 'runtime lifecycle reconcile',
              output_keys: Object.keys(output),
            },
          );
        }
        return {
          runtime_lifecycle_reconcile: output.family_runtime_lifecycle_reconcile,
        };
      },
    },
    'runtime observability-export': {
      usage: 'opl runtime observability-export [--format json|openmetrics|collector-config-json]',
      summary:
        'Export read-only runtime observability counters from provider proofs, stage attempts, memory receipts, and SLO receipts.',
      examples: [
        'opl runtime observability-export',
        'opl runtime observability-export --format openmetrics',
        'opl runtime observability-export --format collector-config-json',
      ],
      registry: {
        command_id: 'runtime observability-export',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'format',
            flag: '--format',
            value_kind: 'string',
            summary: 'Output format: json, openmetrics, or collector-config-json.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_observability_export/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_observability_export_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) => {
        const parsed = parseRegisteredCommandOptions(
          'runtime observability-export',
          args,
          commandSpecs['runtime observability-export'],
        );
        if (
          parsed.format !== undefined
          && parsed.format !== 'json'
          && parsed.format !== 'openmetrics'
          && parsed.format !== 'collector-config-json'
        ) {
          throw buildUsageError(
            'runtime observability-export --format must be json, openmetrics, or collector-config-json.',
            commandSpecs['runtime observability-export'],
            {
              option: '--format',
              value: parsed.format,
            },
          );
        }
        const format = parsed.format === 'openmetrics' || parsed.format === 'collector-config-json'
          ? parsed.format
          : 'json';
        const exportPayload = await buildObservabilityExport(getContracts(), {
          format,
          runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        });
        if (format === 'openmetrics') {
          process.stdout.write(renderObservabilityOpenMetrics(exportPayload));
          return { __handled: true as const };
        }
        if (format === 'collector-config-json') {
          process.stdout.write(
            `${JSON.stringify(exportPayload.semantic_conventions.collector_consumption_config.config, null, 2)}\n`,
          );
          return { __handled: true as const };
        }
        return { observability_export: exportPayload };
      },
    },
    'runtime observability-endpoint': {
      usage:
        'opl runtime observability-endpoint [--host <host>] [--port <port>] [--metrics-path <path>] [--once] [--ready-file <path>]',
      summary:
        'Serve the read-only OpenMetrics export over an HTTP /metrics endpoint for Prometheus/OpenTelemetry Collector scraping.',
      examples: [
        'opl runtime observability-endpoint',
        'opl runtime observability-endpoint --port 9464 --metrics-path /metrics',
        'opl runtime observability-endpoint --port 0 --once --ready-file /tmp/opl-observability-endpoint.json',
      ],
      registry: {
        command_id: 'runtime observability-endpoint',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'host',
            flag: '--host',
            value_kind: 'string',
            summary: 'HTTP host to bind.',
          },
          {
            name: 'port',
            flag: '--port',
            value_kind: 'integer',
            summary: 'HTTP port to bind; 0 lets the OS choose an ephemeral port.',
            allowed_range: {
              min: 0,
              max: 65535,
            },
          },
          {
            name: 'metrics-path',
            flag: '--metrics-path',
            value_kind: 'string',
            summary: 'HTTP path that serves OpenMetrics text.',
          },
          {
            name: 'once',
            flag: '--once',
            value_kind: 'boolean',
            summary: 'Close the endpoint after the first request; useful for tests and one-shot readback.',
          },
          {
            name: 'ready-file',
            flag: '--ready-file',
            value_kind: 'string',
            summary: 'Optional JSON file written after the endpoint is listening.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_observability_endpoint/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_observability_metrics_endpoint',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) => {
        const parsed = parseRegisteredCommandOptions(
          'runtime observability-endpoint',
          args,
          commandSpecs['runtime observability-endpoint'],
        );
        await serveObservabilityMetricsEndpoint({
          contracts: getContracts(),
          host: parsed.host as string | undefined,
          port: parsed.port as number | undefined,
          metricsPath: parsed['metrics-path'] as string | undefined,
          once: parsed.once === true,
          readyFile: parsed['ready-file'] as string | undefined,
          runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        });
        return { __handled: true as const };
      },
    },
    'runtime observability-collector-smoke': {
      usage:
        'opl runtime observability-collector-smoke [--collector-command <path>] [--endpoint <url>] [--host <host>] [--port <port>] [--metrics-path <path>] [--timeout-ms <n>]',
      summary:
        'Run an OpenTelemetry Collector against the read-only OPL OpenMetrics endpoint and report observed metrics or a typed blocker.',
      examples: [
        'opl runtime observability-collector-smoke',
        'opl runtime observability-collector-smoke --collector-command /usr/local/bin/otelcol-contrib',
        'opl runtime observability-collector-smoke --endpoint http://127.0.0.1:9464/metrics',
      ],
      registry: {
        command_id: 'runtime observability-collector-smoke',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'collector-command',
            flag: '--collector-command',
            value_kind: 'string',
            summary: 'OpenTelemetry Collector binary path or command name.',
          },
          {
            name: 'endpoint',
            flag: '--endpoint',
            value_kind: 'string',
            summary: 'Existing OpenMetrics endpoint URL to scrape instead of starting a temporary local endpoint.',
          },
          {
            name: 'host',
            flag: '--host',
            value_kind: 'string',
            summary: 'Temporary endpoint host when --endpoint is omitted.',
          },
          {
            name: 'port',
            flag: '--port',
            value_kind: 'integer',
            summary: 'Temporary endpoint port when --endpoint is omitted; default 0 lets the OS choose.',
            allowed_range: {
              min: 0,
              max: 65535,
            },
          },
          {
            name: 'metrics-path',
            flag: '--metrics-path',
            value_kind: 'string',
            summary: 'Temporary endpoint metrics path when --endpoint is omitted.',
          },
          {
            name: 'timeout-ms',
            flag: '--timeout-ms',
            value_kind: 'integer',
            summary: 'Maximum time to wait for Collector debug output containing an OPL metric.',
            allowed_range: {
              min: 1,
              max: 120000,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_observability_collector_smoke/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_observability_collector_smoke',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) => {
        const parsed = parseRegisteredCommandOptions(
          'runtime observability-collector-smoke',
          args,
          commandSpecs['runtime observability-collector-smoke'],
        );
        return {
          observability_collector_smoke: await runObservabilityCollectorSmoke({
            contracts: getContracts(),
            collectorCommand: parsed['collector-command'] as string | undefined,
            endpoint: parsed.endpoint as string | undefined,
            host: parsed.host as string | undefined,
            port: parsed.port as number | undefined,
            metricsPath: parsed['metrics-path'] as string | undefined,
            timeoutMs: parsed['timeout-ms'] as number | undefined,
            runtimeSnapshotProvider: buildRuntimeTraySnapshot,
          }),
        };
      },
    },
    'runtime index': {
      usage: 'opl runtime index',
      summary:
        'Explain the persisted native helper state index without rescanning workspaces or owning domain truth.',
      examples: ['opl runtime index'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime index']);
        return buildNativeIndexSummary();
      },
    },
    index: buildIndexCommandSpec(),
    'agents scaffold': {
      usage: 'opl agents scaffold [--target-dir <path>] [--domain-id <id>] [--domain-label <label>] [--force] | [--validate <repo-dir>] | [--consumption-evidence]',
      summary:
        'Show, generate, or validate the OPL-owned standard domain-agent scaffold without owning domain truth.',
      examples: [
        'opl agents scaffold',
        'opl agents scaffold --target-dir /tmp/new-agent --domain-id award-foundry',
        'opl agents scaffold --validate /tmp/new-agent',
        'opl agents scaffold --consumption-evidence',
      ],
      handler: (args) => {
        const parsed = parseAgentsScaffoldArgs(args, commandSpecs['agents scaffold']);
        if (parsed.consumptionEvidence) {
          return buildStandardDomainAgentScaffoldConsumptionEvidence(parsed);
        }
        if (parsed.validateRepoDir) {
          return buildStandardDomainAgentScaffoldValidation({ repoDir: parsed.validateRepoDir });
        }
        return buildStandardDomainAgentScaffold(parsed);
      },
    },
    'family-runtime': {
      usage:
        'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|intake|tick|enqueue|service start|service status|service stop|worker start|worker status|worker stop|scheduler install|scheduler status|scheduler trigger|scheduler remove|scheduler tick|evidence-worklist|paper-autonomy supervisor decide|paper-autonomy supervisor readback|residency proof|attempt create|attempt list|attempt inspect|attempt start|attempt cancel|attempt query|attempt signal|attempt fixture-run|queue list|queue inspect|queue redrive|queue hold|queue release|queue retire|approve|notify list|events export [options]',
      summary:
        'Manage the provider-backed OPL family runtime queue, stage attempts, evidence worklist, notifications, approvals, and events.',
      examples: [
        'opl family-runtime status',
        'opl family-runtime status --provider temporal',
        'opl family-runtime enqueue --domain medautogrant --task-kind user-loop/wakeup --payload \'{"workspace":"/tmp/mag"}\' --dedupe-key mag-demo',
        'opl family-runtime lifecycle apply --mode dry-run --domain medautogrant --source-ref mag://cleanup/plan --action \'{"action_id":"mark-opl-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/mag/tombstone"}\'',
        'opl family-runtime attempt create --domain medautoscience --stage scout --provider local_sqlite --workspace-locator \'{"workspace_root":"/tmp/mas"}\'',
        'opl family-runtime attempt create --domain medautoscience --stage scout --provider temporal --workspace-locator \'{"workspace_root":"/tmp/mas"}\' --start',
        'opl family-runtime attempt start <stage_attempt_id>',
        'opl family-runtime attempt cancel <stage_attempt_id> --reason operator_superseded',
        'opl family-runtime attempt list',
        'opl family-runtime attempt query <stage_attempt_id>',
        'opl family-runtime attempt signal <stage_attempt_id> --kind resume --payload \'{"reason":"operator_resume"}\'',
        'opl family-runtime attempt fixture-run <stage_attempt_id> --closeout-packet \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:demo"]}\'',
        'opl family-runtime service start --provider temporal',
        'opl family-runtime service status --provider temporal',
        'opl family-runtime worker start --provider temporal',
        'opl family-runtime provider repair --provider temporal',
        'opl family-runtime residency proof --provider temporal [--live|--production]',
        'opl family-runtime provider-slo tick --provider temporal',
        'opl family-runtime provider-worker supervisor install --provider temporal',
        'opl family-runtime provider-worker supervisor status --provider temporal',
        'opl family-runtime scheduler install --provider temporal',
        'opl family-runtime scheduler status --provider temporal',
        'opl family-runtime scheduler trigger --provider temporal',
        'opl family-runtime scheduler remove --provider temporal',
        'opl family-runtime scheduler tick --provider temporal',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
        'opl family-runtime paper-autonomy supervisor decide --obligation-ledger /tmp/obligations.jsonl --decision-ledger /tmp/decisions.jsonl --obligation-id obligation:dm003 --current-identity-file /tmp/current-identity.json --typed-blocker-ref mas://typed-blocker --budget-or-missing-evidence-ref opl://non-advancing',
        'opl family-runtime paper-autonomy supervisor readback --obligation-ledger /tmp/obligations.jsonl --decision-ledger /tmp/decisions.jsonl --obligation-id obligation:dm003 --current-identity-file /tmp/current-identity.json',
        'opl family-runtime tick --source temporal-worker --hydrate',
        'opl family-runtime queue list',
        'opl family-runtime queue hold --study 003-dpcc-primary-care-phenotype-treatment-gap --reason manual_pause_for_mas_upgrade',
        'opl family-runtime queue release --study 003-dpcc-primary-care-phenotype-treatment-gap --reason manual_pause_for_mas_upgrade',
        'opl family-runtime queue retire --study 003-dpcc-primary-care-phenotype-treatment-gap --task-kind paper_autonomy/guarded-apply --reason superseded_by_publication_handoff_owner_gate',
      ],
      handler: (args) => runFamilyRuntime(args, {
        runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        dependencies: { resolveOplModuleExecCommand },
        stageReplayMissingReceiptExtraReceipts: repoTrackedOmaStageReplayMissingReceiptReceipts(),
      }),
    },
    'stage-artifact': {
      usage: 'opl stage-artifact open|commit|status|explain|rebuild|promote|gc|restore|validate|conformance|workbench --domain <domain> --program <id> --topic <id> --deliverable <id>',
      summary:
        'Read or maintain the OPL-owned Stage Folder Contract index without taking domain artifact or receipt authority.',
      examples: [
        'opl stage-artifact open --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --stage-order 4 --attempt attempt-1',
        'opl stage-artifact commit --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --attempt attempt-1 --terminal-status success --required-output deck.png --owner-receipt-ref rca-owner-receipt:deck',
        'opl stage-artifact status --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact explain --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact rebuild --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact validate --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact conformance --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage-artifact workbench --domain redcube_ai --program p1 --topic t1 --deliverable d1',
      ],
      handler: async (args) => {
        const output = await runFamilyRuntime(['stage-artifact', ...args]);
        if (!('stage_artifact_runtime' in output)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'family-runtime stage-artifact did not return stage artifact output.',
            {
              command: 'stage-artifact',
              output_keys: Object.keys(output),
            },
          );
        }
        return {
          stage_artifact_runtime: output.stage_artifact_runtime,
        };
      },
    },
    stage: {
      usage: 'opl stage open|commit|status|explain|rebuild|promote|gc|restore|validate|conformance|workbench --domain <domain> --program <id> --topic <id> --deliverable <id>',
      summary:
        'Operate the Stage Folder + Manifest + Receipt contract through the OPL-owned artifact runtime.',
      examples: [
        'opl stage open --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --stage-order 4 --attempt attempt-1',
        'opl stage commit --domain redcube_ai --program p1 --topic t1 --deliverable d1 --stage artifact_creation --attempt attempt-1 --terminal-status success --required-output deck.png --owner-receipt-ref rca-owner-receipt:deck',
        'opl stage status --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage explain --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage validate --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage conformance --domain redcube_ai --program p1 --topic t1 --deliverable d1',
        'opl stage workbench --domain redcube_ai --program p1 --topic t1 --deliverable d1',
      ],
      handler: async (args) => commandSpecs['stage-artifact'].handler(args),
    },
    dashboard: {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL product-runtime view across projects, workspace, and runtime.',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      registry: {
        command_id: 'status dashboard',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'path',
            flag: '--path',
            value_kind: 'string',
            summary: 'Workspace path to project into the dashboard readback.',
          },
          {
            name: 'sessions-limit',
            flag: '--sessions-limit',
            value_kind: 'integer',
            summary: 'Maximum managed session ledger entries to include.',
            allowed_range: {
              min: 1,
              max: 500,
            },
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/status_dashboard/output_schema',
        authority_boundary: {
          owner: 'OPL Console',
          surface: 'product_runtime_dashboard_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: (args) => {
        const parsed = parseRegisteredCommandOptions('status dashboard', args, commandSpecs.dashboard);
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
      usage: 'opl skill sync [--domain <domain_id>] [--scope <project|codex|workspace|quest>] [--target-project <project_id>] [--target-workspace <path>] [--target-quest <path>] [--target-root <path>] [--home <home_path>] [--quiet]',
      summary: 'Sync family skill packs to their declared target scope without changing default Codex runtime semantics.',
      examples: [
        'opl skill sync',
        'opl skill sync --domain medautoscience',
        'opl skill sync --domain mas-scholar-skills --scope project --target-project medautoscience',
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
          targetProject: parsed.targetProject,
          targetWorkspace: parsed.targetWorkspace,
          targetQuest: parsed.targetQuest,
          targetRoot: parsed.targetRoot,
          companionMode: parsed.companionMode,
          superpowersProfile: parsed.superpowersProfile,
        });
      },
    },
    'skill-companion-status': {
      usage: 'opl skill companion status [--home <home_path>] [--superpowers <keep|lite|full>]',
      summary: 'Inspect the OPL recommended companion skill ecosystem without changing user skill configuration.',
      examples: [
        'opl skill companion status',
        'opl skill companion status --superpowers lite',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-status']);
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode: 'observe',
            superpowersProfile: parsed.superpowersProfile ?? 'keep',
          }),
        };
      },
    },
    'skill-companion-apply': {
      usage: 'opl skill companion apply --mode <ask_to_apply|managed> [--home <home_path>] [--superpowers <keep|lite|full>]',
      summary: 'Apply OPL companion skill recommendations only when the user or OPL-managed profile explicitly permits it.',
      examples: [
        'opl skill companion apply --mode managed --superpowers keep',
        'opl skill companion apply --mode managed --superpowers lite',
        'opl skill companion apply --mode managed --superpowers full',
      ],
      handler: (args) => {
        const parsed = parseSkillPackArgs(args, commandSpecs['skill-companion-apply']);
        const mode = parsed.companionMode ?? 'ask_to_apply';
        return {
          version: 'g2',
          companion_skills: syncOplCompanionSkills(parsed.home, {
            mode,
            superpowersProfile: parsed.superpowersProfile ?? 'keep',
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
      handler: (args) => {
        const parsed = parseLaunchDomainArgs(args, commandSpecs['domain launch']);
        if (!parsed.projectId) {
          throw buildUsageError(
            'domain launch requires --project.',
            commandSpecs['domain launch'],
            { required: ['--project'] },
          );
        }

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
          domain_manifests: withOplMetaAgentRegistryExtension(catalog.domain_manifests),
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
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-bind']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace bind requires both --project and --path.',
            commandSpecs['workspace-bind'],
            { required: ['--project', '--path'] },
          );
        }

        return bindWorkspace(getContracts(), {
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
      },
    },
    'workspace-activate': {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      summary: 'Switch the active workspace binding for an admitted project.',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-activate']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace activate requires both --project and --path.',
            commandSpecs['workspace-activate'],
            { required: ['--project', '--path'] },
          );
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
