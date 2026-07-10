import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import type { DomainAutonomyStageRunIdentity } from '../family-runtime-domain-autonomy.ts';
import { parseCliOptions, parsePayload, parsePayloadFile } from './shared.ts';

export type DomainAutonomySupervisorCommandInput =
  | {
    mode: 'domain_autonomy_supervisor_readback';
    input: {
      obligation_ledger_path: string;
      decision_ledger_path: string;
      obligation_id: string;
      current_identity: DomainAutonomyStageRunIdentity;
    };
  }
  | {
    mode: 'domain_autonomy_supervisor_decide';
    input: {
      obligation_ledger_path: string;
      decision_ledger_path: string;
      obligation_id: string;
      current_identity: DomainAutonomyStageRunIdentity;
      current_owner_delta_ref?: string;
      provider_admission_identity_ref?: string;
      terminal_closeout_ref?: string;
      recovery_action_ref?: string;
      no_progress_or_inconsistency_ref?: string;
      human_gate_ref?: string;
      resume_token?: string;
      typed_blocker_ref?: string;
      owner_receipt_ref?: string;
      budget_or_missing_evidence_ref?: string;
      evidence_refs: string[];
      observability_refs: string[];
    };
  };

export type AutonomySupervisorCommandInput = DomainAutonomySupervisorCommandInput;

export function parseAutonomySupervisorArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  if (rest[0] !== 'readback' && rest[0] !== 'decide') {
    return null;
  }

  return parseAutonomySupervisorAction(rest[0], rest, 1, 'autonomy-supervisor');
}

function parseAutonomySupervisorAction(
  action: 'readback' | 'decide',
  rest: string[],
  optionStart: number,
  commandPath: string,
): FamilyRuntimeCommandInput {
  let obligationLedgerPath = '';
  let decisionLedgerPath = '';
  let obligationId = '';
  let currentIdentity: DomainAutonomyStageRunIdentity | null = null;
  let currentOwnerDeltaRef: string | undefined;
  let providerAdmissionIdentityRef: string | undefined;
  let terminalCloseoutRef: string | undefined;
  let recoveryActionRef: string | undefined;
  let noProgressOrInconsistencyRef: string | undefined;
  let humanGateRef: string | undefined;
  let resumeToken: string | undefined;
  let typedBlockerRef: string | undefined;
  let ownerReceiptRef: string | undefined;
  let budgetOrMissingEvidenceRef: string | undefined;
  const evidenceRefs: string[] = [];
  const observabilityRefs: string[] = [];

  parseCliOptions(rest, optionStart, (token, value) => {
    if (token === '--obligation-ledger' && value) {
      obligationLedgerPath = value;
      return true;
    } else if (token === '--decision-ledger' && value) {
      decisionLedgerPath = value;
      return true;
    } else if (token === '--obligation-id' && value) {
      obligationId = value;
      return true;
    } else if (token === '--current-identity' && value) {
      currentIdentity = parseDomainAutonomyStageRunIdentity(parsePayload(value), commandPath);
      return true;
    } else if (token === '--current-identity-file' && value) {
      currentIdentity = parseDomainAutonomyStageRunIdentity(parsePayloadFile(value), commandPath);
      return true;
    } else if (action === 'decide' && token === '--current-owner-delta-ref' && value) {
      currentOwnerDeltaRef = value;
      return true;
    } else if (action === 'decide' && token === '--provider-admission-identity-ref' && value) {
      providerAdmissionIdentityRef = value;
      return true;
    } else if (action === 'decide' && token === '--terminal-closeout-ref' && value) {
      terminalCloseoutRef = value;
      return true;
    } else if (action === 'decide' && token === '--recovery-action-ref' && value) {
      recoveryActionRef = value;
      return true;
    } else if (action === 'decide' && token === '--no-progress-or-inconsistency-ref' && value) {
      noProgressOrInconsistencyRef = value;
      return true;
    } else if (action === 'decide' && token === '--human-gate-ref' && value) {
      humanGateRef = value;
      return true;
    } else if (action === 'decide' && token === '--resume-token' && value) {
      resumeToken = value;
      return true;
    } else if (action === 'decide' && token === '--typed-blocker-ref' && value) {
      typedBlockerRef = value;
      return true;
    } else if (action === 'decide' && token === '--owner-receipt-ref' && value) {
      ownerReceiptRef = value;
      return true;
    } else if (action === 'decide' && token === '--budget-or-missing-evidence-ref' && value) {
      budgetOrMissingEvidenceRef = value;
      return true;
    } else if (action === 'decide' && token === '--evidence-ref' && value) {
      evidenceRefs.push(value);
      return true;
    } else if (action === 'decide' && token === '--observability-ref' && value) {
      observabilityRefs.push(value);
      return true;
    } else {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown family-runtime ${commandPath} ${action} option: ${token}.`,
        {
          option: token,
          usage: `opl family-runtime ${commandPath} ${action} --obligation-ledger <path> --decision-ledger <path> --obligation-id <id> --current-identity <json>|--current-identity-file <path>`,
        },
      );
    }
  });

  const missing = [
    obligationLedgerPath ? null : '--obligation-ledger',
    decisionLedgerPath ? null : '--decision-ledger',
    obligationId ? null : '--obligation-id',
    currentIdentity ? null : '--current-identity or --current-identity-file',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime ${commandPath} ${action} requires obligation ledger, decision ledger, obligation id, and current identity.`,
      {
        required: missing,
      },
    );
  }
  if (!currentIdentity) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime ${commandPath} ${action} requires current identity.`,
      {
        required: ['--current-identity', '--current-identity-file'],
      },
    );
  }

  if (action === 'decide') {
    return {
      mode: 'domain_autonomy_supervisor_decide',
      input: {
        obligation_ledger_path: obligationLedgerPath,
        decision_ledger_path: decisionLedgerPath,
        obligation_id: obligationId,
        current_identity: currentIdentity,
        current_owner_delta_ref: currentOwnerDeltaRef,
        provider_admission_identity_ref: providerAdmissionIdentityRef,
        terminal_closeout_ref: terminalCloseoutRef,
        recovery_action_ref: recoveryActionRef,
        no_progress_or_inconsistency_ref: noProgressOrInconsistencyRef,
        human_gate_ref: humanGateRef,
        resume_token: resumeToken,
        typed_blocker_ref: typedBlockerRef,
        owner_receipt_ref: ownerReceiptRef,
        budget_or_missing_evidence_ref: budgetOrMissingEvidenceRef,
        evidence_refs: evidenceRefs,
        observability_refs: observabilityRefs,
      },
    };
  }

  return {
    mode: 'domain_autonomy_supervisor_readback',
    input: {
      obligation_ledger_path: obligationLedgerPath,
      decision_ledger_path: decisionLedgerPath,
      obligation_id: obligationId,
      current_identity: currentIdentity,
    },
  };
}

function parseDomainAutonomyStageRunIdentity(
  payload: Record<string, unknown>,
  commandPath: string,
): DomainAutonomyStageRunIdentity {
  const stagePacketRefs = Array.isArray(payload.stage_packet_refs)
    ? payload.stage_packet_refs.filter((value): value is string => typeof value === 'string')
    : [];
  if (stagePacketRefs.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime ${commandPath} current identity requires stage_packet_refs.`,
      {
        field: 'stage_packet_refs',
      },
    );
  }
  return {
    stage_run_id: stringField(payload, 'stage_run_id', commandPath),
    route_identity_key: stringField(payload, 'route_identity_key', commandPath),
    attempt_idempotency_key: stringField(payload, 'attempt_idempotency_key', commandPath),
    selected_dispatch_ref: stringField(payload, 'selected_dispatch_ref', commandPath),
    stage_packet_ref: stringField(payload, 'stage_packet_ref', commandPath),
    stage_packet_refs: stagePacketRefs,
    provider_attempt_ref: stringField(payload, 'provider_attempt_ref', commandPath),
    attempt_lease_ref: stringField(payload, 'attempt_lease_ref', commandPath),
    workflow_ref: stringField(payload, 'workflow_ref', commandPath),
    source_fingerprint: stringField(payload, 'source_fingerprint', commandPath),
    truth_epoch: stringField(payload, 'truth_epoch', commandPath),
    runtime_health_epoch: stringField(payload, 'runtime_health_epoch', commandPath),
    work_unit_fingerprint: stringField(payload, 'work_unit_fingerprint', commandPath),
  };
}

function stringField(payload: Record<string, unknown>, field: string, commandPath: string) {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime ${commandPath} current identity requires ${field}.`,
      {
        field,
      },
    );
  }
  return value;
}
