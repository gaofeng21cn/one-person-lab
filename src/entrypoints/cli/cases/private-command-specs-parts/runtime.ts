import { FrameworkContractError } from '../../../../modules/charter/contracts.ts';
import { buildRuntimeTraySnapshot } from '../../../../modules/console/runtime-tray-snapshot.ts';
import { buildRuntimeStatus, buildWorkspaceStatus } from '../../../../modules/console/management/workspace-runtime.ts';
import { buildMemoryArtifactLifecycleReadback } from '../../../../modules/ledger/memory-artifact-lifecycle-readback.ts';
import { buildRuntimeManager, runRuntimeManagerAction } from '../../../../modules/runway/index.ts';
import { runRuntimeOperatorActionExecute } from '../../../../modules/runway/runtime-operator-action-execution.ts';
import {
  buildObservabilityExport,
  renderObservabilityOpenMetrics,
  runObservabilityCollectorSmoke,
  serveObservabilityMetricsEndpoint,
} from '../../../../modules/runway/observability-export.ts';
import { buildNativeIndexSummary } from '../../../../modules/runway/native-index-summary.ts';
import { runFamilyRuntime } from '../../../../modules/runway/family-runtime.ts';
import { buildStandardDomainAgentScaffold } from '../../../../modules/pack/index.ts';
import { runFamilyAgentLegacyCleanupApply } from '../../../../modules/workspace/index.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { buildRuntimeAppReleaseEvidenceCommandSpecs } from '../runtime-app-release-evidence-command-spec.ts';
import {
  buildRuntimeBrandModuleL5EvidenceCommandSpecs,
} from '../runtime-brand-module-l5-evidence-command-spec.ts';
import { buildRuntimeCodexAppRuntimeEvidenceCommandSpecs } from '../runtime-codex-app-runtime-evidence-command-spec.ts';
import { buildRuntimeDomainOwnerPayloadSummaryCommandSpecs } from '../runtime-domain-owner-payload-summary-command-spec.ts';
import {
  buildRuntimeOwnerEvidenceSustainedConsumptionCommandSpecs,
} from '../runtime-owner-evidence-sustained-consumption-command-spec.ts';
import { buildRuntimeDeveloperModeCloseoutCommandSpecs } from '../runtime-developer-mode-closeout-command-spec.ts';
import { buildIndexCommandSpec } from '../index-command-spec.ts';
import { buildRuntimeStageRunEvidencePackCommandSpecs } from '../runtime-stage-run-evidence-pack-command-spec.ts';
import {
  buildRuntimeStageCandidatePortfolioCommandSpecs,
} from '../runtime-stage-candidate-portfolio-command-spec.ts';
import {
  buildRuntimeProviderLongSoakEvidenceCommandSpecs,
} from '../runtime-provider-long-soak-evidence-command-spec.ts';
import {
  buildRuntimeMemoryArtifactLifecycleEvidenceCommandSpecs,
} from '../runtime-memory-artifact-lifecycle-evidence-command-spec.ts';
import {
  buildRuntimeStageReplayMissingReceiptCommandSpecs,
} from '../runtime-stage-replay-missing-receipt-command-spec.ts';
import {
  buildRuntimeStandardAgentTemplateConsumptionCommandSpecs,
} from '../runtime-standard-agent-template-consumption-command-spec.ts';
import { buildRuntimeEnvironmentCommandSpecs } from '../runtime-environment-command-spec.ts';
import {
  assertNoArgs,
  buildUsageError,
  parseRegisteredCommandOptions,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type PrivateRuntimeCommandSpecsOptions = {
  getCommandSpecs: () => Record<string, CommandSpec>;
  getContracts: () => FrameworkContracts;
};

export function buildPrivateRuntimeCommandSpecs({
  getCommandSpecs,
  getContracts,
}: PrivateRuntimeCommandSpecsOptions): Record<string, CommandSpec> {
  return {
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
        const parsed = parseRegisteredCommandOptions('status workspace', args, getCommandSpecs()['status workspace']);
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
        const parsed = parseRegisteredCommandOptions('status runtime', args, getCommandSpecs()['status runtime']);
        return buildRuntimeStatus({ sessionsLimit: parsed.limit as number | undefined });
      },
    },
    'runtime manager': {
      usage: 'opl runtime manager',
      summary:
        'Show the OPL Runtime Manager boundary for the configured provider-backed family runtime.',
      examples: ['opl runtime manager', 'opl runtime manager --refresh-native-indexes'],
      registry: {
        command_id: 'runtime manager',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'refresh-native-indexes',
            flag: '--refresh-native-indexes',
            value_kind: 'boolean',
            summary: 'Explicitly execute every native state-index helper instead of reusing a fresh cache.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_manager/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_manager_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) => {
        const spec = getCommandSpecs()['runtime manager'];
        const parsed = parseRegisteredCommandOptions('runtime manager', args, spec);
        return await buildRuntimeManager(
          { refreshNativeIndexes: parsed['refresh-native-indexes'] === true },
          { buildStandardDomainAgentScaffold },
        );
      },
    },
    'runtime manager action': {
      usage: 'opl runtime manager action (--dry-run|--apply)',
      summary:
        'Plan or apply Runtime Manager adapter actions without making OPL a scheduler or domain truth owner.',
      examples: ['opl runtime manager action --dry-run', 'opl runtime manager action --apply'],
      registry: {
        command_id: 'runtime manager action',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'dry-run',
            flag: '--dry-run',
            value_kind: 'boolean',
            summary: 'Plan Runtime Manager adapter actions without mutating native helper state.',
          },
          {
            name: 'apply',
            flag: '--apply',
            value_kind: 'boolean',
            summary: 'Apply Runtime Manager adapter repair actions.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_manager_action/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_manager_action_projection',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: (args) => {
        const spec = getCommandSpecs()['runtime manager action'];
        const parsed = parseRegisteredCommandOptions('runtime manager action', args, spec);
        const dryRun = parsed['dry-run'] === true;
        const apply = parsed.apply === true;
        if (dryRun === apply) {
          throw buildUsageError('runtime manager action accepts exactly one of --dry-run or --apply.', spec, {
            required: ['--dry-run or --apply'],
          });
        }
        return runRuntimeManagerAction(
          { mode: dryRun ? 'dry_run' : 'apply' },
          { buildStandardDomainAgentScaffold },
        );
      },
    },
    'runtime snapshot': {
      usage: 'opl runtime snapshot',
      summary:
        'Project active domain progress surfaces into the desktop tray snapshot without starting a local daemon.',
      examples: ['opl runtime snapshot', 'opl runtime snapshot --json'],
      handler: (args) => {
        assertNoArgs(args, getCommandSpecs()['runtime snapshot']);
        return buildRuntimeTraySnapshot(getContracts());
      },
    },
    'runtime app-operator-drilldown': { // reuse-first: allow diagnostic drilldown command projection.
      usage: 'opl runtime app-operator-drilldown [--detail summary|full] [--full]', // reuse-first: allow diagnostic drilldown command projection.
      summary:
        'Project the App/operator drilldown read model from the runtime snapshot, summary-first by default.', // reuse-first: allow diagnostic drilldown command projection.
      examples: [
        'opl runtime app-operator-drilldown', // reuse-first: allow diagnostic drilldown command projection.
        'opl runtime app-operator-drilldown --json', // reuse-first: allow diagnostic drilldown command projection.
        'opl runtime app-operator-drilldown --detail full --json', // reuse-first: allow diagnostic drilldown command projection.
      ],
      registry: {
        command_id: 'runtime app-operator-drilldown',
        parser_adapter: 'node_util_parse_args',
        options: [
          {
            name: 'detail',
            flag: '--detail',
            value_kind: 'string',
            summary: 'Detail level: summary or full.',
          },
          {
            name: 'full',
            flag: '--full',
            value_kind: 'boolean',
            summary: 'Alias for --detail full.',
          },
        ],
        json_output_schema_ref:
          'contracts/opl-framework/cli-command-registry.json#/commands/runtime_app_operator_drilldown/output_schema',
        authority_boundary: {
          owner: 'OPL Runway',
          surface: 'runtime_app_operator_drilldown_readback',
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      handler: async (args) => {
        const spec = getCommandSpecs()['runtime app-operator-drilldown']; // reuse-first: allow diagnostic drilldown command projection.
        const parsed = parseRegisteredCommandOptions(
          'runtime app-operator-drilldown',
          args,
          spec,
        );
        if (
          parsed.detail !== undefined
          && parsed.detail !== 'summary'
          && parsed.detail !== 'full'
        ) {
          throw buildUsageError(
            'runtime app-operator-drilldown --detail must be summary or full.',
            spec,
            {
              option: '--detail',
              value: parsed.detail,
            },
          );
        }
        const snapshot = await buildRuntimeTraySnapshot(getContracts(), {
          appOperatorDrilldownDetailLevel:
            parsed.full === true ? 'full' : (parsed.detail as 'summary' | 'full' | undefined) ?? 'summary',
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
        assertNoArgs(args, getCommandSpecs()['runtime memory-artifact-lifecycle']);
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
    ...buildRuntimeOwnerEvidenceSustainedConsumptionCommandSpecs(),
    ...buildRuntimeStageReplayMissingReceiptCommandSpecs(),
    ...buildRuntimeDeveloperModeCloseoutCommandSpecs(),
    ...buildRuntimeStageRunEvidencePackCommandSpecs(),
    ...buildRuntimeStageCandidatePortfolioCommandSpecs(),
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
          getCommandSpecs()['runtime observability-export'],
        );
        if (
          parsed.format !== undefined
          && parsed.format !== 'json'
          && parsed.format !== 'openmetrics'
          && parsed.format !== 'collector-config-json'
        ) {
          throw buildUsageError(
            'runtime observability-export --format must be json, openmetrics, or collector-config-json.',
            getCommandSpecs()['runtime observability-export'],
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
          getCommandSpecs()['runtime observability-endpoint'],
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
          getCommandSpecs()['runtime observability-collector-smoke'],
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
        assertNoArgs(args, getCommandSpecs()['runtime index']);
        return buildNativeIndexSummary();
      },
    },
    index: buildIndexCommandSpec(),
    'family-runtime': {
      usage:
        'opl family-runtime status|doctor|install|repair|provider repair|provider-slo tick|provider-worker supervisor|service start|service status|service stop|worker start|worker status|worker stop|scheduler install|scheduler status|scheduler trigger|scheduler remove|evidence-worklist|residency proof|attempt create|attempt list|attempt inspect|attempt start|attempt cancel|attempt query|attempt signal|attempt fixture-run|notify list|events export [options]',
      summary:
        'Manage the provider-backed OPL family runtime stage attempts, evidence worklist, notifications, and events.',
      examples: [
        'opl family-runtime status',
        'opl family-runtime status --provider temporal',
        'opl family-runtime lifecycle apply --mode dry-run --domain medautogrant --source-ref mag://cleanup/plan --action \'{"action_id":"mark-opl-tombstone","owner_scope":"opl_owned_tombstone_ref","target_ref":"opl://history/mag/tombstone"}\'',
        'opl family-runtime attempt create --domain agent_engineering --stage mission-intake --action engineer-agent --provider temporal --workspace-locator \'{"workspace_root":"/tmp/oma"}\' --start',
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
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
      ],
      handler: (args) => runFamilyRuntime(args, {
        runtimeSnapshotProvider: buildRuntimeTraySnapshot,
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
      handler: async (args) => getCommandSpecs()['stage-artifact'].handler(args),
    },
  };
}
