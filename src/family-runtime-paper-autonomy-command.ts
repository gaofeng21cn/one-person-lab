import type { FamilyRuntimeCommandInput } from './family-runtime-command.ts';
import {
  currentPaperAutonomyRecoveryObligation,
  currentPaperAutonomySupervisorDecision,
  readPaperAutonomyRecoveryObligationStoreJsonl,
  readPaperAutonomySupervisorDecisionLedgerJsonl,
  type PaperAutonomySupervisorDecisionReadback,
} from './family-runtime-paper-autonomy.ts';

type PaperAutonomySupervisorReadbackCommand = Extract<
  FamilyRuntimeCommandInput,
  { mode: 'paper_autonomy_supervisor_readback' }
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
      vault: true,
      console: true,
    },
    authority_boundary: authorityBoundary,
  };
}
