import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  familyRuntimeCommandDomainId,
  stageProductionEvidenceRequestId,
  stageProductionEvidenceRequestPackId,
} from './stage-production-evidence-route-common.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  buildStageProductionEvidencePayloadWorkorder,
  STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS,
  STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS,
  STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS,
} from '../../stagecraft/index.ts';

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function routeAuthorityBoundary() {
  return {
    ...refsOnlyAuthorityBoundary(),
    can_start_provider_attempt: true,
    reviewer_gate_receipts_are_refs_only: true,
    reviewer_attempt_must_be_separate_from_execution_attempt: true,
    gate_attempt_must_be_separate_from_execution_attempt: true,
    same_attempt_self_review_valid: false,
    creates_domain_owner_receipt: false,
    closes_domain_ready: false,
  };
}

function refsOnlyAuthorityBoundary() {
  return buildAppDrilldownRefsOnlyAuthorityBoundary();
}

function attemptIdFromRef(ref: string | null) {
  if (!ref) {
    return null;
  }
  const prefix = 'opl://stage_attempts/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

export function buildStageProductionAttemptRoutes(stageProductionEvidence: JsonRecord) {
  return uniqueRefs(recordList(stageProductionEvidence.stages)
    .filter((stage) => (
      stringValue(stage.conformance_status) === 'admitted'
      && stringList(stage.missing_production_evidence).includes('production_caller_attempt_not_observed')
    ))
    .map((stage) => {
      const commandDomainId = familyRuntimeCommandDomainId(
        stringValue(stage.target_domain_id),
        stringValue(stage.project_id),
      );
      const stageId = stringValue(stage.stage_id);
      if (!commandDomainId || !stageId) {
        return null;
      }
      const workspaceLocator = JSON.stringify({
        surface_kind: 'opl_stage_production_attempt_request_workspace_locator',
        domain_id: stringValue(stage.target_domain_id),
        command_domain_id: commandDomainId,
        stage_id: stageId,
        workspace_binding_required: true,
        source: 'app_operator_stage_production_request',
      });
      const oplCliArgs = [
        'attempt',
        'create',
        '--domain',
        commandDomainId,
        '--stage',
        stageId,
        '--provider',
        'temporal',
        '--workspace-locator',
        workspaceLocator,
        '--executor-kind',
        'codex_cli',
        '--executor-binding-ref',
        'opl://executors/codex-cli/default',
      ];
      const startOplCliArgs = [
        'attempt',
        'create',
        ...oplCliArgs.slice(2),
        '--start',
      ];
      const productionAttemptChain = {
        surface_kind: 'opl_stage_production_attempt_chain',
        chain_policy: 'request_start_independent_reviewer_gate_refs_only',
        request_action_id: `stage-production-attempt:${commandDomainId}:${stageId}`,
        start_action_id: `stage-production-attempt-start:${commandDomainId}:${stageId}`,
        reviewer_obligation_ref: `opl://stage-production/${commandDomainId}/${stageId}/independent-reviewer-obligation`,
        gate_obligation_ref: `opl://stage-production/${commandDomainId}/${stageId}/independent-gate-obligation`,
        reviewer_attempt_must_be_separate_from_execution_attempt: true,
        gate_attempt_must_be_separate_from_execution_attempt: true,
        request_creates_provider_backed_attempt: true,
        start_creates_or_starts_provider_attempt: true,
        reviewer_or_gate_can_only_close_with_external_receipt_ref_or_typed_blocker: true,
        closes_domain_ready: false,
        closes_quality_or_export_verdict: false,
      };
      return {
        ref: [
          'opl family-runtime attempt create',
          `--domain ${commandDomainId}`,
          `--stage ${stageId}`,
          '--provider temporal',
          `--workspace-locator ${JSON.stringify(workspaceLocator)}`,
          '--executor-kind codex_cli',
          '--executor-binding-ref opl://executors/codex-cli/default',
        ].join(' '),
        opl_cli_args: oplCliArgs,
        role: 'operator_action_route',
        action_id: `stage-production-attempt:${commandDomainId}:${stageId}`,
        action_kind: 'stage_production_attempt_request',
        owner: 'opl',
        route_target_kind: 'opl_cli',
        route_status: 'request_route_available',
        request_scope: 'opl_owned_stage_attempt_request_only',
        execution_policy: 'opl_safe_action_shell',
        execution_surface: 'opl runtime action execute',
        route_closure_policy:
          'creates_opl_stage_attempt_request_only_without_domain_action_owner_receipt_or_monitor_closure',
        creates_domain_action: false,
        creates_owner_receipt: false,
        owner_receipt_refs: [],
        closes_expected_receipt_refs: false,
        closes_monitor_freshness: false,
        stage_attempt_id: null,
        domain_id: commandDomainId,
        target_domain_id: stringValue(stage.target_domain_id),
        project_id: stringValue(stage.project_id),
        stage_id: stageId,
        missing_production_evidence: stringList(stage.missing_production_evidence),
        evidence_obligations: recordList(stage.evidence_obligations),
        evidence_obligation_summary: isRecord(stage.evidence_obligation_summary)
          ? stage.evidence_obligation_summary
          : {},
        domain_owned_typed_blocker_refs: stringList(stage.domain_owned_typed_blocker_refs),
        executor_envelope: isRecord(stage.executor_envelope) ? stage.executor_envelope : {},
        expected_receipt_refs: stringList(stage.expected_receipt_refs),
        source_scope_refs: stringList(stage.source_scope_refs),
        artifact_scope_refs: stringList(stage.artifact_scope_refs),
        workspace_scope_refs: stringList(stage.workspace_scope_refs),
        monitor_refs: stringList(stage.monitor_refs),
        runtime_event_refs: stringList(stage.runtime_event_refs),
        reviewer_receipt_refs: stringList(stage.reviewer_receipt_refs),
        gate_receipt_refs: stringList(stage.gate_receipt_refs),
        production_attempt_chain: productionAttemptChain,
        follow_up_action_ids: [
          productionAttemptChain.start_action_id,
          productionAttemptChain.reviewer_obligation_ref,
          productionAttemptChain.gate_obligation_ref,
        ],
        can_execute: false as const,
        authority_boundary: routeAuthorityBoundary(),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}

export function buildStageProductionAttemptStartRoutes(stageProductionEvidence: JsonRecord) {
  return uniqueRefs(recordList(stageProductionEvidence.stages)
    .filter((stage) => {
      const hasMissingCaller = stringList(stage.missing_production_evidence)
        .includes('production_caller_attempt_not_observed');
      const hasExistingAttempt = stringList(stage.stage_attempt_refs).length > 0;
      return stringValue(stage.conformance_status) === 'admitted'
        && (hasMissingCaller || hasExistingAttempt);
    })
    .map((stage) => {
      const commandDomainId = familyRuntimeCommandDomainId(
        stringValue(stage.target_domain_id),
        stringValue(stage.project_id),
      );
      const stageId = stringValue(stage.stage_id);
      if (!commandDomainId || !stageId) {
        return null;
      }
      const stageAttemptRefs = stringList(stage.stage_attempt_refs);
      const existingStageAttemptId = attemptIdFromRef(stageAttemptRefs[0] ?? null);
      const workspaceLocator = JSON.stringify({
        surface_kind: 'opl_stage_production_attempt_request_workspace_locator',
        domain_id: stringValue(stage.target_domain_id),
        command_domain_id: commandDomainId,
        stage_id: stageId,
        workspace_binding_required: true,
        source: 'app_operator_stage_production_start',
      });
      const oplCliArgs = existingStageAttemptId
        ? ['attempt', 'start', existingStageAttemptId]
        : [
            'attempt',
            'create',
            '--domain',
            commandDomainId,
            '--stage',
            stageId,
            '--provider',
            'temporal',
            '--workspace-locator',
            workspaceLocator,
            '--executor-kind',
            'codex_cli',
            '--executor-binding-ref',
            'opl://executors/codex-cli/default',
            '--start',
          ];
      return {
        ref: existingStageAttemptId
          ? `opl family-runtime attempt start ${existingStageAttemptId}`
          : [
              'opl family-runtime attempt create',
              `--domain ${commandDomainId}`,
              `--stage ${stageId}`,
              '--provider temporal',
              `--workspace-locator ${JSON.stringify(workspaceLocator)}`,
              '--executor-kind codex_cli',
              '--executor-binding-ref opl://executors/codex-cli/default',
              '--start',
            ].join(' '),
        opl_cli_args: oplCliArgs,
        role: 'operator_action_route',
        action_id: `stage-production-attempt-start:${commandDomainId}:${stageId}`,
        action_kind: 'stage_production_attempt_start',
        owner: 'opl',
        route_target_kind: 'opl_cli',
        execution_policy: 'opl_safe_action_shell',
        execution_surface: 'opl runtime action execute',
        stage_attempt_id: existingStageAttemptId,
        domain_id: commandDomainId,
        target_domain_id: stringValue(stage.target_domain_id),
        project_id: stringValue(stage.project_id),
        stage_id: stageId,
        missing_production_evidence: stringList(stage.missing_production_evidence),
        evidence_obligations: recordList(stage.evidence_obligations),
        evidence_obligation_summary: isRecord(stage.evidence_obligation_summary)
          ? stage.evidence_obligation_summary
          : {},
        expected_receipt_refs: stringList(stage.expected_receipt_refs),
        source_scope_refs: stringList(stage.source_scope_refs),
        artifact_scope_refs: stringList(stage.artifact_scope_refs),
        workspace_scope_refs: stringList(stage.workspace_scope_refs),
        monitor_refs: stringList(stage.monitor_refs),
        runtime_event_refs: stringList(stage.runtime_event_refs),
        reviewer_receipt_refs: stringList(stage.reviewer_receipt_refs),
        gate_receipt_refs: stringList(stage.gate_receipt_refs),
        owner_receipt_refs: [],
        creates_domain_action: false,
        creates_owner_receipt: false,
        closes_expected_receipt_refs: false,
        closes_monitor_freshness: false,
        can_execute: false as const,
        authority_boundary: {
          ...routeAuthorityBoundary(),
          can_create_opl_owned_stage_attempt_request: true,
          creates_domain_action: false,
          creates_owner_receipt: false,
          closes_expected_receipt_refs: false,
          closes_monitor_freshness: false,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

function shellSingleQuotedJson(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "'\\''")}'`;
}

function runtimeActionExecuteCommand(input: {
  actionId: string;
  payload?: JsonRecord | null;
  dryRun?: boolean;
}) {
  return [
    'opl runtime action execute',
    `--action ${input.actionId}`,
    ...(input.dryRun ? ['--dry-run'] : []),
    ...(input.payload ? [`--payload ${shellSingleQuotedJson(input.payload)}`] : []),
  ].join(' ');
}

function hasRecordableStageEvidenceObligation(stage: JsonRecord) {
  return recordList(stage.evidence_obligations).some((obligation) => (
    (stringValue(obligation.obligation_id) === 'expected_receipt'
      || stringValue(obligation.obligation_id) === 'monitor_freshness'
      || stringValue(obligation.obligation_id) === 'source_scope'
      || stringValue(obligation.obligation_id) === 'runtime_event')
    && (
      stringValue(obligation.status) === 'open'
      || stringValue(obligation.status) === 'blocked_by_domain_owned_typed_blocker'
    )
  ));
}

function declaredObligationRef(ref: string) {
  return ref === 'owner_receipt'
    || ref === 'monitor_freshness'
    || ref === 'no_regression'
    || ref === 'typed_blocker'
    || ref === 'domain_receipt'
    || ref.startsWith('owner_receipt:')
    || ref.startsWith('monitor_freshness:')
    || ref.startsWith('no_regression:')
    || ref.startsWith('typed_blocker:')
    || ref.startsWith('domain_receipt:');
}

function coveredRequiredRefs(requiredRefs: string[], candidateRefs: string[]) {
  return uniqueStrings(requiredRefs
    .filter((ref) => !declaredObligationRef(ref))
    .filter((ref) => candidateRefs.includes(ref)));
}

function missingRequiredRefsAfterCandidate(requiredRefs: string[], candidateRefs: string[]) {
  const concreteRequiredRefs = requiredRefs.filter((ref) => !declaredObligationRef(ref));
  const declaredRequiredRefs = requiredRefs.filter(declaredObligationRef);
  const concreteCandidateRefs = candidateRefs.filter((ref) => !declaredObligationRef(ref));
  return uniqueStrings([
    ...concreteRequiredRefs.filter((ref) => !candidateRefs.includes(ref)),
    ...(declaredRequiredRefs.length > 0 && concreteCandidateRefs.length === 0
      ? declaredRequiredRefs
      : []),
  ]);
}

function stagePayloadCandidateRefs(input: {
  stage: JsonRecord;
  commandDomainId: string;
  stageId: string;
  domainOwnerPayloadSummaryRefs?: JsonRecord;
}) {
  const unobservedExpectedReceiptRefs = stringList(input.stage.unobserved_expected_receipt_refs);
  const unobservedMonitorRefs = stringList(input.stage.unobserved_monitor_refs);
  const unobservedSourceScopeRefs = stringList(input.stage.unobserved_source_scope_refs);
  const unobservedRuntimeEventRefs = stringList(input.stage.unobserved_runtime_event_refs);
  return recordList(input.domainOwnerPayloadSummaryRefs?.domains).flatMap((domain) => {
    const domainId = stringValue(domain.domain_id);
    const targetDomainId = stringValue(domain.target_domain_id);
    if (domainId !== input.commandDomainId && targetDomainId !== stringValue(input.stage.target_domain_id)) {
      return [];
    }
    const summary = record(domain.stage_expected_receipt_payload_summary);
    return recordList(summary.stages)
      .filter((stage) => stringValue(stage.stage_id) === input.stageId)
      .map((stage) => {
        const successPayload = record(stage.success_refs_path_payload);
        const typedBlockerPayload = record(stage.typed_blocker_path_payload);
        const domainReceiptRefs = stringList(successPayload.domain_receipt_refs);
        const monitorFreshnessRefs = stringList(successPayload.monitor_freshness_refs);
        const sourceScopeRefs = stringList(successPayload.source_scope_refs);
        const runtimeEventRefs = stringList(successPayload.runtime_event_refs);
        const typedBlockerRefs = stringList(typedBlockerPayload.typed_blocker_refs);
        return {
          candidate_kind: 'domain_owner_payload_summary_stage_expected_receipt',
          source_surface: stringValue(domain.source_surface),
          source_ref: stringValue(domain.source_ref),
          domain_id: domainId,
          target_domain_id: targetDomainId,
          owner: stringValue(domain.owner),
          stage_id: input.stageId,
          payload_kind: stringValue(stage.payload_kind) ?? stringValue(summary.payload_kind),
          recommended_current_payload_path: stringValue(stage.recommended_current_payload_path),
          stage_evidence_record_success_payload: {
            domain_receipt_refs: domainReceiptRefs,
            evidence_refs: monitorFreshnessRefs,
            source_scope_refs: sourceScopeRefs,
            runtime_event_refs: runtimeEventRefs,
            typed_blocker_refs: [],
          },
          stage_evidence_record_typed_blocker_payload: {
            domain_receipt_refs: [],
            evidence_refs: [],
            typed_blocker_refs: typedBlockerRefs,
          },
          covered_required_refs: {
            domain_receipt_refs: coveredRequiredRefs(
              unobservedExpectedReceiptRefs,
              domainReceiptRefs,
            ),
            evidence_refs: coveredRequiredRefs(unobservedMonitorRefs, monitorFreshnessRefs),
            source_scope_refs: coveredRequiredRefs(unobservedSourceScopeRefs, sourceScopeRefs),
            runtime_event_refs: coveredRequiredRefs(unobservedRuntimeEventRefs, runtimeEventRefs),
          },
          missing_required_refs_after_candidate: {
            domain_receipt_refs: missingRequiredRefsAfterCandidate(
              unobservedExpectedReceiptRefs,
              domainReceiptRefs,
            ),
            evidence_refs: missingRequiredRefsAfterCandidate(
              unobservedMonitorRefs,
              monitorFreshnessRefs,
            ),
            source_scope_refs: missingRequiredRefsAfterCandidate(
              unobservedSourceScopeRefs,
              sourceScopeRefs,
            ),
            runtime_event_refs: missingRequiredRefsAfterCandidate(
              unobservedRuntimeEventRefs,
              runtimeEventRefs,
            ),
          },
          candidate_is_completion_evidence: false,
          route_can_auto_close_from_candidate: false,
          payload_body_allowed: false,
          authority_boundary: {
            ...refsOnlyAuthorityBoundary(),
            can_create_owner_receipt: false,
            can_generate_typed_blocker: false,
            can_close_stage_evidence: false,
            can_claim_domain_ready: false,
            can_claim_production_ready: false,
          },
        };
      });
  });
}

function stageEvidenceRoute(
  stage: JsonRecord,
  mode: 'record' | 'verify',
  domainOwnerPayloadSummaryRefs?: JsonRecord,
) {
  const commandDomainId = familyRuntimeCommandDomainId(
    stringValue(stage.target_domain_id),
    stringValue(stage.project_id),
  );
  const stageId = stringValue(stage.stage_id);
  if (!commandDomainId || !stageId) {
    return null;
  }
  const requestId = stageProductionEvidenceRequestId(commandDomainId, stageId);
  const requestPackId = stageProductionEvidenceRequestPackId(commandDomainId);
  const sourceRef = stringValue(stage.ref)
    ?? `/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence/${commandDomainId}/${stageId}`;
  const recordMode = mode === 'record';
  const unobservedExpectedReceiptRefs = stringList(stage.unobserved_expected_receipt_refs);
  const unobservedMonitorRefs = stringList(stage.unobserved_monitor_refs);
  const unobservedSourceScopeRefs = stringList(stage.unobserved_source_scope_refs);
  const unobservedRuntimeEventRefs = stringList(stage.unobserved_runtime_event_refs);
  const domainOwnerPayloadCandidateRefs = recordMode
    ? stagePayloadCandidateRefs({
        stage,
        commandDomainId,
        stageId,
        domainOwnerPayloadSummaryRefs,
      })
    : [];
  const payloadTemplate = recordMode
    ? {
        domain_receipt_refs: [],
        evidence_refs: [],
        typed_blocker_refs: [],
        no_regression_refs: [],
        owner_chain_refs: [],
        source_scope_refs: [],
        runtime_event_refs: [],
      }
    : null;
  const payloadRefHints = recordMode
    ? {
        domain_receipt_refs_should_cover: unobservedExpectedReceiptRefs,
        evidence_refs_should_cover_monitor_freshness: unobservedMonitorRefs,
        source_scope_refs_should_cover: unobservedSourceScopeRefs,
        runtime_event_refs_should_cover: unobservedRuntimeEventRefs,
        domain_owner_payload_candidate_refs: domainOwnerPayloadCandidateRefs,
        typed_blocker_refs_may_close_instead_of_success: true,
        required_any_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS],
        optional_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS],
        no_regression_refs_recommended: true,
        owner_chain_refs_recommended: true,
      }
    : null;
  const actionId = `stage-production-evidence:${commandDomainId}:${stageId}:${mode}`;
  const recordedReceiptRefs = stringList(stage.recorded_stage_evidence_receipt_refs);
  const recordedReceiptRef = recordedReceiptRefs[0] ?? stringList(stage.stage_evidence_receipt_refs)[0] ?? null;
  const successPayloadExample = recordMode
    ? {
        domain_receipt_refs: unobservedExpectedReceiptRefs.filter((ref) => !ref.startsWith('owner_receipt:')),
        evidence_refs: unobservedMonitorRefs.filter((ref) => !ref.startsWith('monitor_freshness:')),
        typed_blocker_refs: [],
        source_scope_refs: unobservedSourceScopeRefs,
        runtime_event_refs: unobservedRuntimeEventRefs,
      }
    : null;
  const typedBlockerPayloadExample = recordMode
    ? {
        domain_receipt_refs: [],
        evidence_refs: [],
        typed_blocker_refs: ['<domain-owned-typed-blocker-ref>'],
      }
    : null;
  const args = [
    'agents',
    'evidence',
    'apply',
    '--domain',
    commandDomainId,
    '--request-id',
    requestId,
    ...(mode === 'verify' ? ['--mode', 'verify'] : []),
    '--request-pack-id',
    requestPackId,
    '--source-ref',
    sourceRef,
    ...(mode === 'verify' && recordedReceiptRef ? ['--receipt-ref', recordedReceiptRef] : []),
  ];
  const route = {
    ref: commandRef(args),
    opl_cli_args: args,
    role: 'operator_action_route',
    action_id: actionId,
    action_kind: mode === 'verify'
      ? 'stage_production_evidence_receipt_verify'
      : 'stage_production_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    route_status: mode === 'verify' ? 'verify_route_available' : 'record_route_available',
    route_status_detail: recordMode
      ? 'record_route_available_waiting_for_domain_app_or_live_refs_payload'
      : 'verify_route_available_for_recorded_refs_only_stage_evidence_receipt',
    request_scope: 'opl_owned_stage_evidence_refs_only_receipt',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    route_closure_policy:
      'records_or_verifies_refs_only_stage_expected_receipt_source_scope_runtime_event_and_monitor_freshness_without_domain_action_or_ready_claim',
    open_reason: recordMode
      ? 'unobserved_stage_evidence_refs_require_domain_app_or_live_payload_before_closure'
      : null,
    payload_requirement: recordMode
      ? 'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness'
      : 'previously_recorded_opl_refs_only_receipt_required_to_verify_stage_evidence',
    payload_owner: recordMode ? 'domain_repository_or_app_live_operator' : 'opl_external_evidence_ledger',
    route_requires_domain_or_app_payload: recordMode,
    can_close_without_domain_or_app_payload: !recordMode,
    opl_generated_receipt_policy: 'OPL_must_not_generate_domain_owner_receipts_monitor_freshness_or_no_regression_refs',
    payload_template: payloadTemplate,
    payload_ref_hints: payloadRefHints,
    payload_template_policy: recordMode
      ? 'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit'
      : 'verify_route_uses_previously_recorded_opl_refs_only_receipt_no_payload_required',
    empty_payload_template_is_success_evidence: false,
    payload_preflight_error_code: recordMode ? 'cli_usage_error' : null,
    payload_preflight_blocked_error_kind: recordMode
      ? 'stage_production_evidence_payload_preflight_blocked'
      : null,
    copyable_runtime_action_execute_commands: recordMode
      ? {
          dry_run_with_empty_template_blocks:
            runtimeActionExecuteCommand({ actionId, payload: payloadTemplate, dryRun: true }),
          dry_run_success_path:
            runtimeActionExecuteCommand({ actionId, payload: successPayloadExample, dryRun: true }),
          record_success_path:
            runtimeActionExecuteCommand({ actionId, payload: successPayloadExample }),
          dry_run_typed_blocker_path:
            runtimeActionExecuteCommand({ actionId, payload: typedBlockerPayloadExample, dryRun: true }),
          record_typed_blocker_path:
            runtimeActionExecuteCommand({ actionId, payload: typedBlockerPayloadExample }),
        }
      : {
          verify_recorded_receipt: runtimeActionExecuteCommand({ actionId }),
        },
    creates_domain_action: false,
    creates_owner_receipt: false,
    owner_receipt_refs: [],
    closes_expected_receipt_refs: mode === 'verify',
    closes_monitor_freshness: mode === 'verify',
    stage_attempt_id: null,
    domain_id: commandDomainId,
    target_domain_id: stringValue(stage.target_domain_id),
    project_id: stringValue(stage.project_id),
    stage_id: stageId,
    request_id: requestId,
    request_pack_id: requestPackId,
    evidence_route_kind: 'stage_production_evidence',
    evidence_source_ref: sourceRef,
    stage_evidence_receipt_status: stringValue(stage.stage_evidence_receipt_status),
    stage_evidence_receipt_refs: stringList(stage.stage_evidence_receipt_refs),
    recorded_stage_evidence_receipt_refs: recordedReceiptRefs,
    verified_stage_evidence_receipt_refs: stringList(stage.verified_stage_evidence_receipt_refs),
    missing_production_evidence: stringList(stage.missing_production_evidence),
    evidence_obligation_summary: isRecord(stage.evidence_obligation_summary)
      ? stage.evidence_obligation_summary
      : {},
    expected_receipt_refs: stringList(stage.expected_receipt_refs),
    unobserved_expected_receipt_refs: unobservedExpectedReceiptRefs,
    unobserved_source_scope_refs: unobservedSourceScopeRefs,
    unobserved_runtime_event_refs: unobservedRuntimeEventRefs,
    monitor_refs: stringList(stage.monitor_refs),
    unobserved_monitor_refs: unobservedMonitorRefs,
    required_operator_payload_refs: mode === 'verify' ? [] : [
      ...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS,
    ],
    optional_operator_payload_refs: mode === 'verify'
      ? []
      : [...STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS],
    required_evidence_refs: [
      ...unobservedExpectedReceiptRefs,
      ...unobservedSourceScopeRefs,
      ...unobservedRuntimeEventRefs,
      ...unobservedMonitorRefs,
    ],
    required_return_shapes: [
      'domain_owner_receipt_ref',
      'monitor_freshness_ref',
      'source_scope_ref',
      'runtime_event_ref',
      'domain_typed_blocker_ref',
      'no_regression_ref',
    ],
    required_receipt_shapes: [
      'stage_expected_receipt_ref',
      'stage_monitor_freshness_ref',
      'stage_source_scope_ref',
      'stage_runtime_event_ref',
    ],
    can_execute: false as const,
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_record_stage_expected_receipt_refs: true,
      can_record_stage_monitor_freshness_refs: true,
      can_record_stage_source_scope_refs: true,
      can_record_stage_runtime_event_refs: true,
      creates_domain_action: false,
      creates_owner_receipt: false,
      closes_domain_ready: false,
    },
  };
  return recordMode
    ? {
        ...route,
        payload_workorder: buildStageProductionEvidencePayloadWorkorder(route),
        payload_preflight_policy:
          'opl_preflights_stage_evidence_payload_before_recording_refs_only_receipt',
      }
    : route;
}

export function buildStageProductionEvidenceReceiptRoutes(input: {
  stageProductionEvidence: JsonRecord;
  domainOwnerPayloadSummaryRefs?: JsonRecord;
}) {
  return uniqueRefs(recordList(input.stageProductionEvidence.stages)
    .filter((stage) => (
      stringValue(stage.conformance_status) === 'admitted'
      && hasRecordableStageEvidenceObligation(stage)
      && (
        stringList(stage.unobserved_expected_receipt_refs).length > 0
        || stringList(stage.unobserved_monitor_refs).length > 0
        || stringList(stage.unobserved_source_scope_refs).length > 0
        || stringList(stage.unobserved_runtime_event_refs).length > 0
      )
    ))
    .map((stage) => {
      const hasRecordedButUnverifiedReceipt = stringValue(stage.stage_evidence_receipt_status) === 'recorded'
        || stringList(stage.recorded_stage_evidence_receipt_refs).length > 0;
      const hasVerifiedReceipt = stringValue(stage.stage_evidence_receipt_status) === 'verified';
      const hasOpenReceiptOrMonitorRefs =
        stringList(stage.unobserved_expected_receipt_refs).length > 0
        || stringList(stage.unobserved_monitor_refs).length > 0;
      return stageEvidenceRoute(
        stage,
        hasRecordedButUnverifiedReceipt && (!hasVerifiedReceipt || hasOpenReceiptOrMonitorRefs)
          ? 'verify'
          : 'record',
        input.domainOwnerPayloadSummaryRefs,
      );
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}
