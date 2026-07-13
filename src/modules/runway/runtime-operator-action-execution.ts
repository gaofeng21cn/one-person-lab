import type { FrameworkContracts } from '../../kernel/types.ts';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  resolveFamilyRuntimeDomainId,
  type FamilyRuntimeDomainId,
} from './family-runtime-types.ts';
import {
  parseExternalEvidenceApplyArgs,
  runExternalEvidenceApply,
} from '../ledger/index.ts';
import {
  assertStageProductionEvidencePayloadReady,
  preflightStageProductionEvidencePayload,
} from '../stagecraft/index.ts';
import {
  assertDomainDispatchEvidencePayloadReady,
  preflightDomainDispatchEvidencePayload,
} from '../ledger/index.ts';
import { providerSloArgs } from './runtime-operator-action-execution-parts/provider-slo-action.ts';
import { providerWorkerArgs, providerWorkerCommand, runProviderWorkerRepair } from './runtime-operator-action-execution-parts/provider-worker-action.ts';
import { providerSchedulerArgs } from './runtime-operator-action-execution-parts/provider-scheduler-action.ts';
import { externalEvidenceApplyArgs } from './runtime-operator-action-execution-parts/external-evidence-action.ts';
import { domainDispatchExternalEvidenceApplyArgs } from './runtime-operator-action-execution-parts/domain-dispatch-evidence-action.ts';
import { appReleaseUserPathEvidenceExecution } from './runtime-operator-action-execution-parts/app-release-user-path-evidence-action.ts';
import { codexAppRuntimeEvidenceExecution } from './runtime-operator-action-execution-parts/codex-app-runtime-evidence-action.ts';
import { domainOwnerPayloadSummaryExecution } from './runtime-operator-action-execution-parts/domain-owner-payload-summary-action.ts';
import { ownerEvidenceSustainedConsumptionExecution } from './runtime-operator-action-execution-parts/owner-evidence-sustained-consumption-action.ts';
import { blockedActionRouteExecution } from './runtime-operator-action-execution-parts/blocked-action-route.ts';
import { SUPPORTED_OPL_ACTION_ROUTE_KINDS } from './runtime-operator-action-execution-parts/supported-action-kinds.ts';
import {
  requireRuntimeTraySnapshotProvider,
  type RuntimeTraySnapshotProvider,
} from './runtime-tray-snapshot-provider.ts';

type JsonRecord = Record<string, unknown>;

type RuntimeActionExecuteOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
  approveDomainAction: boolean;
};

type RuntimeOperatorActionExecuteDependencies = {
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
  runFamilyAgentLegacyCleanupApply?: (contracts: FrameworkContracts, args: string[]) => JsonRecord;
};

function parseJsonObject(value: string, context: string): JsonRecord {
  const parsed = parseJsonText(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${context} must be a JSON object.`, {
      context,
    });
  }
  return parsed as JsonRecord;
}

function parseRuntimeActionExecuteArgs(args: string[]): RuntimeActionExecuteOptions {
  let actionId = '';
  let payload: JsonRecord = {};
  let payloadSet = false;
  let dryRun = false;
  let approveDomainAction = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--action' && value) {
      actionId = value;
      index += 1;
    } else if (token === '--payload' && value) {
      if (payloadSet) {
        throw new FrameworkContractError('cli_usage_error', 'Use either --payload or --payload-file, not both.', {
          options: ['--payload', '--payload-file'],
        });
      }
      payload = parseJsonObject(value, '--payload');
      payloadSet = true;
      index += 1;
    } else if (token === '--payload-file' && value) {
      if (payloadSet) {
        throw new FrameworkContractError('cli_usage_error', 'Use either --payload or --payload-file, not both.', {
          options: ['--payload', '--payload-file'],
        });
      }
      payload = parseJsonObject(fs.readFileSync(path.resolve(value), 'utf8'), '--payload-file');
      payloadSet = true;
      index += 1;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token === '--approve-domain-action') {
      approveDomainAction = true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown runtime action execute option: ${token}.`, {
        option: token,
        usage: 'opl runtime action execute --action <action_id> [--payload <json>|--payload-file <path>] [--dry-run] [--approve-domain-action]',
      });
    }
  }
  if (!actionId) {
    throw new FrameworkContractError('cli_usage_error', 'runtime action execute requires --action.', {
      required: ['--action'],
    });
  }
  return { actionId, payload, dryRun, approveDomainAction };
}

function actionRoutesFromSnapshot(snapshot: JsonRecord) {
  const drilldown = isRecord(snapshot.app_operator_drilldown) ? snapshot.app_operator_drilldown : {};
  const refs = isRecord(drilldown.operator_action_routing_refs)
    && Array.isArray(drilldown.operator_action_routing_refs.refs)
    ? drilldown.operator_action_routing_refs.refs
    : [];
  return refs.filter(isRecord);
}

function domainDispatchActionRouteClosedDetails(snapshot: JsonRecord, actionId: string) {
  const match = actionId.match(/^domain_dispatch:([^:]+):([^:]+):(record|verify)$/);
  if (!match) {
    return null;
  }
  const [, domainId, stageAttemptId, requestedMode] = match;
  const drilldown = isRecord(snapshot.app_operator_drilldown) ? snapshot.app_operator_drilldown : {};
  const domainDispatchEvidence = isRecord(drilldown.domain_dispatch_evidence)
    ? drilldown.domain_dispatch_evidence
    : {};
  const attempts = Array.isArray(domainDispatchEvidence.attempts)
    ? domainDispatchEvidence.attempts.filter(isRecord)
    : [];
  const attempt = attempts.find((candidate) =>
    stringValue(candidate.domain_id) === domainId
    && stringValue(candidate.stage_attempt_id) === stageAttemptId
  );
  if (!attempt) {
    return null;
  }
  const receiptStatus = stringValue(attempt.dispatch_evidence_receipt_status);
  const defaultActionabilityStatus = stringValue(attempt.default_actionability_status);
  if (defaultActionabilityStatus === 'superseded') {
    return {
      error_kind: 'domain_dispatch_evidence_action_route_superseded',
      action_id: actionId,
      requested_mode: requestedMode,
      domain_id: domainId,
      stage_attempt_id: stageAttemptId,
      stage_id: stringValue(attempt.stage_id),
      default_actionability_status: defaultActionabilityStatus,
      superseded_by_stage_attempt_id: stringValue(attempt.superseded_by_stage_attempt_id),
      superseded_reason: stringValue(attempt.superseded_reason),
      dispatch_identity_key: stringValue(attempt.dispatch_identity_key),
      dispatch_supersession_identity_key: stringValue(attempt.dispatch_supersession_identity_key),
      route_status: 'superseded_by_current_domain_dispatch_attempt',
      route_status_detail:
        'Current App/operator drilldown no longer exposes this domain dispatch action because a newer attempt owns the same dispatch identity.',
      next_safe_action: null,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      authority_boundary: executionBoundary(),
    };
  }
  if (receiptStatus !== 'recorded' && receiptStatus !== 'verified') {
    return null;
  }
  const verifiedReceiptRefs = stringList(attempt.verified_dispatch_evidence_receipt_refs);
  const receiptRefs = stringList(attempt.dispatch_evidence_receipt_refs);
  return {
    error_kind: 'domain_dispatch_evidence_action_route_closed',
    action_id: actionId,
    requested_mode: requestedMode,
    domain_id: domainId,
    stage_attempt_id: stageAttemptId,
    stage_id: stringValue(attempt.stage_id),
    dispatch_evidence_receipt_status: receiptStatus,
    current_receipt_ref: verifiedReceiptRefs[0] ?? receiptRefs[0] ?? null,
    current_receipt_refs: receiptStatus === 'verified' && verifiedReceiptRefs.length > 0
      ? verifiedReceiptRefs
      : receiptRefs,
    route_status: 'closed_or_superseded_by_current_domain_dispatch_evidence_receipt',
    route_status_detail:
      'Current App/operator drilldown no longer exposes this action because the domain dispatch evidence receipt is already recorded or verified.',
    next_safe_action: receiptStatus === 'recorded'
      ? `domain_dispatch:${domainId}:${stageAttemptId}:verify`
      : null,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    authority_boundary: executionBoundary(),
  };
}

function providerSignalKind(actionKind: string) {
  if (actionKind === 'provider_signal:resume') {
    return 'resume';
  }
  if (actionKind === 'provider_signal:human_gate') {
    return 'human_gate';
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported provider signal route.', {
    action_kind: actionKind,
    allowed_action_kinds: ['provider_signal:resume', 'provider_signal:human_gate'],
  });
}

function stageAttemptQueryArgs(commandOrSurfaceRef: string) {
  const match = commandOrSurfaceRef.match(/^opl family-runtime attempt query ([A-Za-z0-9_.:-]+)$/);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL action command route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl family-runtime attempt query <stage_attempt_id>',
    });
  }
  return ['attempt', 'query', match[1]];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function requireLegacyCleanupApply(dependencies: RuntimeOperatorActionExecuteDependencies) {
  if (!dependencies.runFamilyAgentLegacyCleanupApply) {
    throw new FrameworkContractError('contract_shape_invalid', 'Legacy cleanup apply handler is not injected.', {
      required_dependency: 'runFamilyAgentLegacyCleanupApply',
    });
  }
  return dependencies.runFamilyAgentLegacyCleanupApply;
}

function stageAttemptCreateArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL attempt create action command route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command:
        'opl family-runtime attempt create --domain <domain> --stage <stage> --provider <provider> --workspace-locator <json> --executor-kind <kind> --executor-binding-ref <ref>',
    });
  }
  if (args[0] !== 'attempt' || args[1] !== 'create') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL attempt create route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return args;
}

function stageAttemptStartArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args[0] === 'attempt' && args[1] === 'start' && args[2]) {
    return args;
  }
  const createArgs = stageAttemptCreateArgs(route, commandOrSurfaceRef);
  if (!createArgs.includes('--start')) {
    return [...createArgs, '--start'];
  }
  return createArgs;
}

function stageProductionEvidenceRecordArgs(
  route: JsonRecord,
  payload: JsonRecord,
  commandOrSurfaceRef: string,
  options: { dryRun: boolean },
) {
  const preflight = options.dryRun
    ? preflightStageProductionEvidencePayload(route, payload)
    : assertStageProductionEvidencePayloadReady(route, payload);
  return {
    runtimeArgs: externalEvidenceApplyArgs(route, payload, commandOrSurfaceRef, {
      allowEmptyRecordPayload: options.dryRun,
    }),
    preflight,
  };
}

function domainDispatchEvidenceRecordArgs(
  route: JsonRecord,
  payload: JsonRecord,
  commandOrSurfaceRef: string,
  options: { dryRun: boolean },
) {
  const preflight = options.dryRun
    ? preflightDomainDispatchEvidencePayload(payload, route)
    : assertDomainDispatchEvidencePayloadReady(route, payload);
  return {
    runtimeArgs: domainDispatchExternalEvidenceApplyArgs(route, payload, commandOrSurfaceRef, {
      allowEmptyRecordPayload: options.dryRun,
    }),
    preflight,
  };
}

function stageProductionEvidenceVerifyResult(result: JsonRecord, route: JsonRecord) {
  const apply = isRecord(result.external_evidence_apply) ? result.external_evidence_apply : {};
  if (stringValue(apply.status) !== 'blocked') {
    return result;
  }
  return {
    ...result,
    stage_production_evidence_receipt_verify_error: {
      surface_kind: 'opl_stage_production_evidence_receipt_verify_error',
      error_kind: 'stage_production_evidence_receipt_not_recorded',
      status: 'blocked',
      action_id: stringValue(route.action_id),
      request_id: stringValue(route.request_id),
      request_pack_id: stringValue(route.request_pack_id),
      required_before_verify: [
        'record_stage_production_evidence_receipt_with_domain_receipt_refs',
        'record_stage_production_evidence_receipt_with_evidence_refs',
        'record_stage_production_evidence_receipt_with_typed_blocker_refs',
      ],
      empty_payload_template_is_success_evidence: false,
      domain_ready_authorized: false,
      production_ready_authorized: false,
    },
  };
}

function legacyCleanupApplyArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL legacy cleanup action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl agents legacy-cleanup apply --domain <domain> --mode <apply|verify> --source-ref <ref>',
    });
  }
  if (args[0] !== 'agents' || args[1] !== 'legacy-cleanup' || args[2] !== 'apply') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL legacy cleanup route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return args;
}

function oplCliRuntimeArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const actionKind = stringValue(route.action_kind);
  if (actionKind === 'stage_attempt_query' || actionKind === 'progress_first_attempt_supervision') {
    return {
      executionKind: 'opl_cli_internal',
      runtimeArgs: stringList(route.opl_cli_args).length > 0
        ? stringList(route.opl_cli_args)
        : stageAttemptQueryArgs(commandOrSurfaceRef),
    };
  }
  if (actionKind === 'stage_production_attempt_request') {
    return {
      executionKind: 'opl_cli_stage_attempt_create',
      runtimeArgs: stageAttemptCreateArgs(route, commandOrSurfaceRef),
    };
  }
  if (actionKind === 'stage_production_attempt_start') {
    return {
      executionKind: 'opl_cli_stage_attempt_create_and_start',
      runtimeArgs: stageAttemptStartArgs(route, commandOrSurfaceRef),
    };
  }
  if (
    actionKind === 'external_evidence_receipt_record'
    || actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_record'
    || actionKind === 'evidence_gate_receipt_verify'
    || actionKind === 'functional_privatization_semantic_equivalence_receipt_record'
    || actionKind === 'stage_production_evidence_receipt_record'
    || actionKind === 'stage_production_evidence_receipt_verify'
    || actionKind === 'domain_dispatch_evidence_receipt_record'
    || actionKind === 'domain_dispatch_evidence_receipt_verify'
    || actionKind === 'app_release_user_path_evidence_receipt_record'
    || actionKind === 'app_release_user_path_evidence_receipt_verify'
    || actionKind === 'codex_app_runtime_evidence_receipt_record'
    || actionKind === 'codex_app_runtime_evidence_receipt_verify'
    || actionKind === 'domain_owner_payload_summary_receipt_record'
    || actionKind === 'domain_owner_payload_summary_receipt_verify'
    || actionKind === 'owner_evidence_sustained_consumption_receipt_record'
    || actionKind === 'owner_evidence_sustained_consumption_receipt_verify'
  ) {
    if (
      actionKind === 'app_release_user_path_evidence_receipt_record'
      || actionKind === 'app_release_user_path_evidence_receipt_verify'
      || actionKind === 'codex_app_runtime_evidence_receipt_record'
      || actionKind === 'codex_app_runtime_evidence_receipt_verify'
      || actionKind === 'domain_owner_payload_summary_receipt_record'
      || actionKind === 'domain_owner_payload_summary_receipt_verify'
      || actionKind === 'owner_evidence_sustained_consumption_receipt_record'
      || actionKind === 'owner_evidence_sustained_consumption_receipt_verify'
    ) {
      return {
        executionKind: actionKind.startsWith('owner_evidence_sustained_consumption_')
            ? 'opl_cli_owner_evidence_sustained_consumption_apply'
          : actionKind.startsWith('domain_owner_payload_summary_')
            ? 'opl_cli_domain_owner_payload_summary_apply'
          : actionKind.startsWith('codex_app_runtime_evidence_')
            ? 'opl_cli_codex_app_runtime_evidence_apply'
            : 'opl_cli_app_release_user_path_evidence_apply',
        runtimeArgs: stringList(route.opl_cli_args),
      };
    }
    return {
      executionKind: 'opl_cli_external_evidence_apply',
      runtimeArgs: externalEvidenceApplyArgs(route, {}, commandOrSurfaceRef, {
        allowEmptyRecordPayload: true,
      }),
    };
  }
  if (
    actionKind === 'provider_slo_cadence_execution'
  ) {
    return {
      executionKind: 'opl_cli_provider_slo',
      runtimeArgs: providerSloArgs(route, commandOrSurfaceRef),
    };
  }
  if (
    actionKind === 'provider_scheduler_status'
    || actionKind === 'provider_scheduler_install'
    || actionKind === 'provider_scheduler_trigger'
  ) {
    return {
      executionKind: 'opl_cli_provider_scheduler',
      runtimeArgs: providerSchedulerArgs(route, commandOrSurfaceRef),
    };
  }
  if (actionKind === 'legacy_cleanup_apply' || actionKind === 'legacy_cleanup_verify') {
    return {
      executionKind: 'opl_cli_legacy_cleanup_apply',
      runtimeArgs: legacyCleanupApplyArgs(route, commandOrSurfaceRef),
    };
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL action command route.', {
    command_or_surface_ref: commandOrSurfaceRef,
    action_kind: actionKind,
    supported_action_kinds: SUPPORTED_OPL_ACTION_ROUTE_KINDS,
  });
}

function domainIdFromRoute(route: JsonRecord): FamilyRuntimeDomainId {
  const domainId = stringValue(route.domain_id);
  const resolvedDomainId = domainId ? resolveFamilyRuntimeDomainId(domainId) : null;
  if (resolvedDomainId) {
    return resolvedDomainId;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported domain route id.', {
    domain_id: domainId,
    allowed_domain_ids: FAMILY_RUNTIME_DOMAIN_IDS,
  });
}

function executionBoundary() {
  return {
    opl: 'operator_action_execution_shell_and_stage_attempt_projection_owner',
    provider: 'provider_signal_receipt_owner',
    domain: 'domain_handler_direct_skill_and_truth_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_quality_verdict: false,
    can_authorize_export_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

async function executeRoute(
  contracts: FrameworkContracts,
  route: JsonRecord,
  options: RuntimeActionExecuteOptions,
  dependencies: RuntimeOperatorActionExecuteDependencies,
) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const owner = stringValue(route.owner) ?? stringValue(route.action_owner) ?? '';
  const targetKind = stringValue(route.route_target_kind) ?? '';
  const commandOrSurfaceRef = stringValue(route.ref) ?? stringValue(route.command_or_surface_ref) ?? '';
  const stageAttemptId = stringValue(route.stage_attempt_id) ?? '';

  if (targetKind === 'app_surface') {
    return {
      execution_status: 'projected',
      execution_kind: 'app_surface_projection',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: null,
    };
  }

  if (owner === 'opl' && targetKind === 'opl_cli') {
    const actionKind = stringValue(route.action_kind);
    const externalEvidenceAction = actionKind === 'external_evidence_receipt_record'
      || actionKind === 'external_evidence_receipt_verify'
      || actionKind === 'evidence_gate_receipt_record'
      || actionKind === 'evidence_gate_receipt_verify'
      || actionKind === 'functional_privatization_semantic_equivalence_receipt_record'
      || actionKind === 'stage_production_evidence_receipt_record'
      || actionKind === 'stage_production_evidence_receipt_verify'
      || actionKind === 'domain_dispatch_evidence_receipt_record'
      || actionKind === 'domain_dispatch_evidence_receipt_verify';
    const appReleaseUserPathEvidenceAction =
      actionKind === 'app_release_user_path_evidence_receipt_record'
      || actionKind === 'app_release_user_path_evidence_receipt_verify';
    const codexAppRuntimeEvidenceAction =
      actionKind === 'codex_app_runtime_evidence_receipt_record'
      || actionKind === 'codex_app_runtime_evidence_receipt_verify';
    const domainOwnerPayloadSummaryAction =
      actionKind === 'domain_owner_payload_summary_receipt_record'
      || actionKind === 'domain_owner_payload_summary_receipt_verify';
    const ownerEvidenceSustainedConsumptionAction =
      actionKind === 'owner_evidence_sustained_consumption_receipt_record'
      || actionKind === 'owner_evidence_sustained_consumption_receipt_verify';
    const legacyCleanupAction = actionKind === 'legacy_cleanup_apply'
      || actionKind === 'legacy_cleanup_verify';
    const stageEvidenceRecordAction = actionKind === 'stage_production_evidence_receipt_record';
    const stageEvidenceVerifyAction = actionKind === 'stage_production_evidence_receipt_verify';
    const domainDispatchEvidenceRecordAction = actionKind === 'domain_dispatch_evidence_receipt_record';
    const stageEvidenceRecord = stageEvidenceRecordAction
      ? stageProductionEvidenceRecordArgs(route, options.payload, commandOrSurfaceRef, {
          dryRun: options.dryRun,
        })
      : null;
    const domainDispatchEvidenceRecord = domainDispatchEvidenceRecordAction
      ? domainDispatchEvidenceRecordArgs(route, options.payload, commandOrSurfaceRef, {
          dryRun: options.dryRun,
        })
      : null;
    const appReleaseUserPathEvidence = appReleaseUserPathEvidenceAction
      ? appReleaseUserPathEvidenceExecution(route, options.payload, { dryRun: options.dryRun })
      : null;
    const codexAppRuntimeEvidence = codexAppRuntimeEvidenceAction
      ? codexAppRuntimeEvidenceExecution(route, options.payload, { dryRun: options.dryRun })
      : null;
    const domainOwnerPayloadSummary = domainOwnerPayloadSummaryAction
      ? domainOwnerPayloadSummaryExecution(route, options.payload, { dryRun: options.dryRun })
      : null;
    const ownerEvidenceSustainedConsumption = ownerEvidenceSustainedConsumptionAction
      ? ownerEvidenceSustainedConsumptionExecution(route, options.payload, {
          dryRun: options.dryRun,
        })
      : null;
    const providerWorkerRepair = actionKind === 'provider_worker_start'
      || actionKind === 'provider_worker_restart'
      ? providerWorkerArgs(route, commandOrSurfaceRef)
      : null;
    const { executionKind, runtimeArgs } = appReleaseUserPathEvidence
      ? {
          executionKind: appReleaseUserPathEvidence.executionKind,
          runtimeArgs: appReleaseUserPathEvidence.runtimeArgs,
        }
      : codexAppRuntimeEvidence
      ? {
          executionKind: codexAppRuntimeEvidence.executionKind,
          runtimeArgs: codexAppRuntimeEvidence.runtimeArgs,
        }
      : domainOwnerPayloadSummary
      ? {
          executionKind: domainOwnerPayloadSummary.executionKind,
          runtimeArgs: domainOwnerPayloadSummary.runtimeArgs,
        }
      : ownerEvidenceSustainedConsumption
      ? {
          executionKind: ownerEvidenceSustainedConsumption.executionKind,
          runtimeArgs: ownerEvidenceSustainedConsumption.runtimeArgs,
        }
      : externalEvidenceAction
      ? {
          executionKind: 'opl_cli_external_evidence_apply',
          runtimeArgs: stageEvidenceRecord?.runtimeArgs
            ?? domainDispatchEvidenceRecord?.runtimeArgs
            ?? externalEvidenceApplyArgs(route, options.payload, commandOrSurfaceRef, {
              allowEmptyRecordPayload: options.dryRun,
            }),
        }
      : providerWorkerRepair
      ? {
          executionKind: 'opl_cli_provider_worker_repair',
          runtimeArgs: [],
        }
      : oplCliRuntimeArgs(route, commandOrSurfaceRef);
    return {
      execution_status: options.dryRun ? 'dry_run' : 'executed',
      execution_kind: executionKind,
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: appReleaseUserPathEvidenceAction
        || codexAppRuntimeEvidenceAction
        || domainOwnerPayloadSummaryAction
        || ownerEvidenceSustainedConsumptionAction
        ? `opl ${runtimeArgs.join(' ')}`
        : providerWorkerRepair
          ? providerWorkerCommand(providerWorkerRepair)
        : externalEvidenceAction
        ? `opl ${runtimeArgs.join(' ')}`
        : legacyCleanupAction
          ? `opl ${runtimeArgs.join(' ')}`
          : `opl family-runtime ${runtimeArgs.join(' ')}`,
      result: appReleaseUserPathEvidence
        ? appReleaseUserPathEvidence.result
        : codexAppRuntimeEvidence
          ? codexAppRuntimeEvidence.result
        : domainOwnerPayloadSummary
          ? domainOwnerPayloadSummary.result
        : ownerEvidenceSustainedConsumption
          ? ownerEvidenceSustainedConsumption.result
        : options.dryRun
        ? (stageEvidenceRecord
            ? {
                stage_production_evidence_payload_preflight: stageEvidenceRecord.preflight,
              }
            : domainDispatchEvidenceRecord
              ? {
                  domain_dispatch_evidence_payload_preflight: domainDispatchEvidenceRecord.preflight,
                }
            : null)
        : externalEvidenceAction
          ? {
              ...(stageEvidenceRecord
                ? {
                    stage_production_evidence_payload_preflight: stageEvidenceRecord.preflight,
                  }
                : {}),
              ...(domainDispatchEvidenceRecord
                ? {
                    domain_dispatch_evidence_payload_preflight: domainDispatchEvidenceRecord.preflight,
                  }
                : {}),
              ...(stageEvidenceVerifyAction
                ? stageProductionEvidenceVerifyResult(
                    runExternalEvidenceApply(parseExternalEvidenceApplyArgs(runtimeArgs.slice(3))) as JsonRecord,
                    route,
                  )
                : runExternalEvidenceApply(parseExternalEvidenceApplyArgs(runtimeArgs.slice(3)))),
            }
        : legacyCleanupAction
            ? requireLegacyCleanupApply(dependencies)(contracts, runtimeArgs.slice(3))
            : providerWorkerRepair
              ? runProviderWorkerRepair(providerWorkerRepair, runFamilyRuntime)
            : await runFamilyRuntime(runtimeArgs, {
                runtimeSnapshotProvider: dependencies.runtimeSnapshotProvider,
              }),
    };
  }

  if (owner === 'provider' && targetKind === 'provider_signal') {
    if (!stageAttemptId) {
      throw new FrameworkContractError('contract_shape_invalid', 'Provider signal route requires a stage attempt id.', {
        action_id: options.actionId,
      });
    }
    const signalKind = providerSignalKind(actionKind);
    const runtimeArgs = [
      'attempt',
      'signal',
      stageAttemptId,
      '--kind',
      signalKind,
      '--payload',
      JSON.stringify({
        route_ref: commandOrSurfaceRef,
        action_id: options.actionId,
        ...options.payload,
      }),
      '--source',
      'app_operator_action_execute',
    ];
    return {
      execution_status: options.dryRun ? 'dry_run' : 'executed',
      execution_kind: 'provider_signal',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: `opl family-runtime ${runtimeArgs.join(' ')}`,
      result: options.dryRun
        ? null
        : await runFamilyRuntime(runtimeArgs, {
            runtimeSnapshotProvider: dependencies.runtimeSnapshotProvider,
          }),
    };
  }

  if (owner === 'domain' && (targetKind === 'domain_handler' || targetKind === 'direct_skill')) {
    const domainId = domainIdFromRoute(route);
    const handoffPayload = {
      action: actionKind,
      action_id: options.actionId,
      route_target_kind: targetKind,
      command_or_surface_ref: commandOrSurfaceRef,
      stage_attempt_id: stageAttemptId || null,
      stage_id: stringValue(route.stage_id),
      operator_payload: options.payload,
      authority_boundary: executionBoundary(),
    };
    return {
      execution_status: options.dryRun ? 'dry_run' : 'blocked_owner_handoff_required',
      execution_kind: 'domain_owner_handoff_required',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      domain_id: domainId,
      approval_policy: 'domain_owner_route_required_no_runtime_queue',
      executed_runtime_command: null,
      result: {
        surface_kind: 'opl_domain_owner_handoff_required',
        status: 'blocked_owner_handoff_required',
        domain_id: domainId,
        handoff_payload: handoffPayload,
        runtime_queue_mutation_performed: false,
        replacement_path:
          'route through a domain-owned owner receipt, typed blocker, or explicit Temporal stage attempt request',
        authority_boundary: {
          ...executionBoundary(),
          can_enqueue_family_runtime_task: false,
          can_write_sqlite_queue: false,
        },
      },
    };
  }

  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported operator action route.', {
    action_id: options.actionId,
    owner,
    route_target_kind: targetKind,
    action_kind: actionKind,
  });
}

export async function runRuntimeOperatorActionExecute(
  contracts: FrameworkContracts,
  args: string[],
  dependencies: RuntimeOperatorActionExecuteDependencies = {},
): Promise<JsonRecord> {
  const options = parseRuntimeActionExecuteArgs(args);
  const runtimeSnapshotProvider = requireRuntimeTraySnapshotProvider(
    dependencies.runtimeSnapshotProvider,
    'runtime action execute',
  );
  const snapshotEnvelope = await runtimeSnapshotProvider(contracts, {
    appOperatorDrilldownDetailLevel: 'full',
  });
  const snapshot = snapshotEnvelope.runtime_tray_snapshot as JsonRecord;
  const route = actionRoutesFromSnapshot(snapshot).find((candidate) => (
    stringValue(candidate.action_id) === options.actionId
  ));
  if (!route) {
    const closedDomainDispatchDetails = domainDispatchActionRouteClosedDetails(
      snapshot,
      options.actionId,
    );
    if (closedDomainDispatchDetails) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'Domain dispatch evidence action route is already closed in the current runtime snapshot.',
        closedDomainDispatchDetails,
      );
    }
    throw new FrameworkContractError('cli_usage_error', 'Operator action route not found in current runtime snapshot.', {
      action_id: options.actionId,
    });
  }

  const blockedExecution = blockedActionRouteExecution(route, executionBoundary());
  if (blockedExecution) {
    return {
      runtime_operator_action_execution: {
        surface_kind: 'opl_runtime_operator_action_execution',
        action_id: options.actionId,
        dry_run: options.dryRun,
        route,
        execution: blockedExecution,
        authority_boundary: executionBoundary(),
        non_goals: [
          'does_not_write_domain_truth',
          'does_not_read_or_store_memory_body',
          'does_not_read_or_mutate_artifact_body',
          'does_not_authorize_quality_readiness_or_export_verdict',
        ],
      },
    };
  }

  const execution = await executeRoute(contracts, route, options, dependencies);
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: options.dryRun,
      route,
      execution,
      authority_boundary: executionBoundary(),
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}
