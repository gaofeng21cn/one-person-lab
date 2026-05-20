import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

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
  return {
    opl: 'app_operator_drilldown_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
    can_execute_provider_signal: false,
    provider_completion_is_domain_ready: false,
  };
}

function attemptIdFromRef(ref: string | null) {
  if (!ref) {
    return null;
  }
  const prefix = 'opl://stage_attempts/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

function familyRuntimeCommandDomainId(domainId: string | null, projectId: string | null): string | null {
  const normalizedValues = [domainId, projectId].flatMap((value) => {
    if (!value) {
      return [];
    }
    const normalized = value.trim().toLowerCase().replaceAll('_', '-');
    return [normalized, normalized.replaceAll('-', '')];
  });
  if (normalizedValues.some((value) => value === 'medautoscience' || value === 'med-autoscience' || value === 'mas')) {
    return 'medautoscience';
  }
  if (normalizedValues.some((value) => value === 'medautogrant' || value === 'med-autogrant' || value === 'mag')) {
    return 'medautogrant';
  }
  if (normalizedValues.some((value) => value === 'redcube' || value === 'redcube-ai' || value === 'redcubeai' || value === 'rca')) {
    return 'redcube';
  }
  return null;
}

export function buildStageProductionAttemptRoutes(stageProductionEvidence: JsonRecord) {
  return uniqueRefs(recordList(stageProductionEvidence.stages)
    .filter((stage) => (
      stringValue(stage.admission_status) === 'admitted'
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
        '--require-stage-admission',
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
          '--require-stage-admission',
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
      return stringValue(stage.admission_status) === 'admitted'
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
            '--require-stage-admission',
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
              '--require-stage-admission',
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
