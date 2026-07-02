import type { FamilyRuntimeCommandInput } from './family-runtime-command.ts';
import {
  appendPaperAutonomySupervisorDecisionLedgerJsonl,
  currentPaperAutonomyRecoveryObligation,
  currentPaperAutonomySupervisorDecision,
  readPaperAutonomyRecoveryObligationStoreJsonl,
  readPaperAutonomySupervisorDecisionFromObligation,
  readPaperAutonomySupervisorDecisionLedgerJsonl,
  recordPaperAutonomySupervisorDecision,
  type PaperAutonomySupervisorDecisionReadback,
} from './family-runtime-paper-autonomy.ts';

type PaperAutonomySupervisorReadbackCommand = Extract<
  FamilyRuntimeCommandInput,
  { mode: 'paper_autonomy_supervisor_readback' }
>;
type PaperAutonomySupervisorDecideCommand = Extract<
  FamilyRuntimeCommandInput,
  { mode: 'paper_autonomy_supervisor_decide' }
>;

const authorityBoundary = {
  opl_can_write_mas_truth: false,
  opl_can_create_domain_owner_receipt: false,
  opl_can_create_domain_typed_blocker: false,
  provider_completion_is_domain_ready: false,
  readback_can_execute_transition: false,
} as const;

export function runFamilyRuntimePaperAutonomySupervisorReadbackCommand(
  parsed: PaperAutonomySupervisorReadbackCommand,
) {
  const obligationEntries = readPaperAutonomyRecoveryObligationStoreJsonl(
    parsed.input.obligation_ledger_path,
  );
  const decisionEntries = readPaperAutonomySupervisorDecisionLedgerJsonl(
    parsed.input.decision_ledger_path,
  );
  const obligation = currentPaperAutonomyRecoveryObligation(obligationEntries, {
    obligation_id: parsed.input.obligation_id,
    current_identity: parsed.input.current_identity,
  });
  const decision = currentPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: parsed.input.obligation_id,
    current_identity: parsed.input.current_identity,
  });

  return {
    version: 'g2',
    family_runtime_paper_autonomy_supervisor_readback: supervisorReadbackPayload({
      obligation_found: Boolean(obligation),
      decision,
      obligation_id: parsed.input.obligation_id,
      ledger_paths: {
        obligation_ledger_path: parsed.input.obligation_ledger_path,
        decision_ledger_path: parsed.input.decision_ledger_path,
      },
    }),
  };
}

export function runFamilyRuntimePaperAutonomySupervisorDecideCommand(
  parsed: PaperAutonomySupervisorDecideCommand,
) {
  const obligationEntries = readPaperAutonomyRecoveryObligationStoreJsonl(
    parsed.input.obligation_ledger_path,
  );
  const decisionEntries = readPaperAutonomySupervisorDecisionLedgerJsonl(
    parsed.input.decision_ledger_path,
  );
  const obligation = currentPaperAutonomyRecoveryObligation(obligationEntries, {
    obligation_id: parsed.input.obligation_id,
    current_identity: parsed.input.current_identity,
  });
  if (!obligation) {
    return {
      version: 'g2',
      family_runtime_paper_autonomy_supervisor_decision: {
        surface_id: 'opl_family_runtime_paper_autonomy_supervisor_decision',
        surface_kind: 'opl_family_runtime_paper_autonomy_supervisor_decision',
        decision_status: 'missing_obligation',
        missing_reason: 'identity_bound_recovery_obligation_not_found',
        obligation_id: parsed.input.obligation_id,
        decision_readback: null,
        decision_ledger_entry: null,
        authority_boundary: authorityBoundary,
      },
    };
  }

  const decision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: parsed.input.obligation_id,
    current_identity: parsed.input.current_identity,
    current_owner_delta_ref: parsed.input.current_owner_delta_ref,
    provider_admission_identity_ref: parsed.input.provider_admission_identity_ref,
    terminal_closeout_ref: parsed.input.terminal_closeout_ref,
    recovery_action_ref: parsed.input.recovery_action_ref,
    no_progress_or_inconsistency_ref: parsed.input.no_progress_or_inconsistency_ref,
    human_gate_ref: parsed.input.human_gate_ref,
    resume_token: parsed.input.resume_token,
    typed_blocker_ref: parsed.input.typed_blocker_ref,
    owner_receipt_ref: parsed.input.owner_receipt_ref,
    budget_or_missing_evidence_ref: parsed.input.budget_or_missing_evidence_ref,
    evidence_refs: parsed.input.evidence_refs,
    observability_refs: parsed.input.observability_refs,
  });
  const recorded = recordPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: parsed.input.obligation_id,
    current_identity: parsed.input.current_identity,
    decision,
    appended_at: new Date().toISOString(),
  });
  appendPaperAutonomySupervisorDecisionLedgerJsonl(
    parsed.input.decision_ledger_path,
    recorded.entry,
  );

  return {
    version: 'g2',
    family_runtime_paper_autonomy_supervisor_decision: {
      surface_id: 'opl_family_runtime_paper_autonomy_supervisor_decision',
      surface_kind: 'opl_family_runtime_paper_autonomy_supervisor_decision',
      decision_status: recorded.accepted ? 'decision_appended' : 'decision_rejected',
      missing_reason: null,
      obligation_id: parsed.input.obligation_id,
      recovery_obligation: obligation,
      decision_readback: recorded.accepted ? recorded.decision : null,
      decision_ledger_entry: recorded.entry,
      ledger_paths: {
        obligation_ledger_path: parsed.input.obligation_ledger_path,
        decision_ledger_path: parsed.input.decision_ledger_path,
      },
      substrate_modules: {
        runway: true,
        ledger: true,
        console: true,
      },
      authority_boundary: authorityBoundary,
    },
  };
}

function supervisorReadbackPayload(input: {
  obligation_found: boolean;
  decision: PaperAutonomySupervisorDecisionReadback | null;
  obligation_id: string;
  ledger_paths: {
    obligation_ledger_path: string;
    decision_ledger_path: string;
  };
}) {
  const decisionReady = input.obligation_found && Boolean(input.decision);
  return {
    surface_id: 'opl_family_runtime_paper_autonomy_supervisor_readback',
    surface_kind: 'opl_family_runtime_paper_autonomy_supervisor_readback',
    readback_status: decisionReady ? 'decision_ready' : 'missing',
    missing_reason: decisionReady ? null : 'identity_bound_supervisor_decision_not_found',
    obligation_id: input.obligation_id,
    recovery_obligation_found: input.obligation_found,
    supervisor_decision_found: Boolean(input.decision),
    current_supervisor_decision_readback: decisionReady ? input.decision : null,
    ledger_paths: input.ledger_paths,
    substrate_modules: {
      runway: true,
      ledger: true,
      console: true,
    },
    authority_boundary: authorityBoundary,
  };
}
