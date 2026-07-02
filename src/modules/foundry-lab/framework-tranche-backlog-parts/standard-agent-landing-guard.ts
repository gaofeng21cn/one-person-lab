import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { buildPrivatePlatformResidueOwnerDecisionLedger } from '../private-platform-residue-owner-decisions.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { JsonRecord } from './shared.ts';
import {
  DEFERRED_LIVE_EVIDENCE,
  STANDARD_AGENT_LANDING_AUTHORITY,
} from './shared.ts';

const ACCEPTANCE_CONTRACT_REF =
  'contracts/opl-framework/standard-agent-landing-acceptance-contract.json';
const EVIDENCE_STATUS_REF =
  'contracts/opl-framework/standard-agent-landing-evidence-status.json';
const PRIVATE_RESIDUE_CONTRACT_REF =
  'contracts/opl-framework/private-platform-residue-owner-decisions.json';

function readJsonObject(contractsDir: string, ref: string): JsonRecord {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(contractsDir, ref.replace('contracts/opl-framework/', '')), 'utf8'),
  ) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function numberField(record: JsonRecord, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === 'number' ? value : fallback;
}

function booleanField(record: JsonRecord, key: string) {
  return record[key] === true;
}

function gateCounts(gates: JsonRecord[]) {
  return {
    total: gates.length,
    satisfied: gates.filter((gate) => gate.status === 'satisfied').length,
    evidence_required: gates.filter((gate) => gate.status === 'evidence_required').length,
    satisfied_or_owner_typed_blocker: gates.filter((gate) =>
      gate.status === 'satisfied_or_owner_typed_blocker'
    ).length,
    can_claim_complete: gates.filter((gate) => gate.can_claim_complete === true).length,
  };
}

function statusByGate(gates: JsonRecord[]) {
  return Object.fromEntries(
    gates.map((gate) => [String(gate.gate_id), {
      required_status: gate.required_status,
      status: gate.status,
      can_claim_complete: gate.can_claim_complete,
    }]),
  );
}

export function buildStandardAgentLandingAcceptanceGuardReadback(
  contracts: FrameworkContracts,
) {
  const acceptance = readJsonObject(contracts.contractsDir, ACCEPTANCE_CONTRACT_REF);
  const evidenceStatus = readJsonObject(contracts.contractsDir, EVIDENCE_STATUS_REF);
  const privateResidueContract = readJsonObject(
    contracts.contractsDir,
    PRIVATE_RESIDUE_CONTRACT_REF,
  );
  const gateStatuses = recordList(evidenceStatus.gate_statuses);
  const negativeCases = recordList(evidenceStatus.negative_conformance_cases);
  const openEvidenceTailIds = Object.keys(
    isRecord(evidenceStatus.open_evidence_tails)
      ? evidenceStatus.open_evidence_tails
      : {},
  );
  const privateResidueLedger =
    buildPrivatePlatformResidueOwnerDecisionLedger(['--family-defaults']);
  const privateResidueSummary = isRecord(privateResidueLedger.summary)
    ? privateResidueLedger.summary
    : {};
  const defaultCallerSummary = isRecord(privateResidueLedger.default_caller_readiness_summary)
    ? privateResidueLedger.default_caller_readiness_summary
    : {};
  const guardChecks = [
    acceptance.state === 'active_contract',
    evidenceStatus.state === 'active_evidence_status',
    evidenceStatus.current_completion_status === 'family_evidence_tail_open_not_complete',
    evidenceStatus.completion_claim_authorized === false,
    gateStatuses.length === recordList(acceptance.acceptance_gates).length,
    gateStatuses.every((gate) => gate.can_claim_complete === false),
    negativeCases.every((entry) => entry.status === 'blocked_false_completion'),
    privateResidueContract.state === 'active_contract',
    privateResidueLedger.physical_delete_authorized === false,
    numberField(privateResidueSummary, 'invalid_owner_decision_count') === 0,
    numberField(privateResidueSummary, 'physical_delete_authorized_count') === 0,
  ];

  return {
    surface_kind: 'opl_standard_agent_landing_acceptance_guard_readback',
    readback_role:
      'standard_agent_acceptance_and_private_residue_owner_decision_not_completion_not_live_evidence',
    owner: 'one-person-lab',
    milestone_id: 'standard_agent_landing_acceptance_guard',
    status: guardChecks.every(Boolean)
      ? 'closed_structure_gate_not_live_evidence'
      : 'blocked_structure_gate',
    source_contract_refs: [
      ACCEPTANCE_CONTRACT_REF,
      EVIDENCE_STATUS_REF,
      PRIVATE_RESIDUE_CONTRACT_REF,
      'contracts/opl-framework/standard-agent-negative-conformance-samples.json',
      'contracts/opl-framework/standard-agent-admission-gates.json',
    ],
    source_api_readback_refs: [
      'buildFrameworkTrancheBacklogReadback',
      'buildStandardAgentLandingAcceptanceGuardReadback',
      'buildPrivatePlatformResidueOwnerDecisionLedger(["--family-defaults"])',
    ],
    source_cli_readback_refs: [
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.standard_agent_landing_acceptance_guard',
      'opl agents residue-decisions --family-defaults --json .private_platform_residue_owner_decisions',
      'opl agents default-callers --family-defaults --json',
    ],
    acceptance_summary: {
      contract_state: acceptance.state,
      evidence_state: evidenceStatus.state,
      current_completion_status: evidenceStatus.current_completion_status,
      completion_claim_authorized: evidenceStatus.completion_claim_authorized,
      gate_status_counts: gateCounts(gateStatuses),
      gate_statuses_by_id: statusByGate(gateStatuses),
      open_evidence_tail_ids: openEvidenceTailIds,
      false_completion_claims: stringList(acceptance.false_completion_claims),
      allowed_completion_evidence: stringList(acceptance.allowed_completion_evidence),
    },
    private_residue_owner_decision_summary: {
      contract_state: privateResidueContract.state,
      ledger_state: privateResidueLedger.state,
      source_command: privateResidueLedger.source_command,
      source_default_caller_command: privateResidueLedger.source_default_caller_command,
      total_repo_count: numberField(privateResidueSummary, 'total_repo_count'),
      decision_item_count: numberField(privateResidueSummary, 'decision_item_count'),
      invalid_owner_decision_count:
        numberField(privateResidueSummary, 'invalid_owner_decision_count'),
      physical_delete_authorized_count:
        numberField(privateResidueSummary, 'physical_delete_authorized_count'),
      missing_owner_receipt_or_typed_blocker_ref_count:
        numberField(privateResidueSummary, 'missing_owner_receipt_or_typed_blocker_ref_count'),
      default_caller_delete_ready: booleanField(defaultCallerSummary, 'default_caller_delete_ready'),
      physical_delete_authorized: privateResidueLedger.physical_delete_authorized,
      residue_target_kinds: stringList(privateResidueLedger.residue_target_kinds),
      allowed_owner_decisions: stringList(privateResidueLedger.allowed_owner_decisions),
    },
    functional_closure_followthrough: evidenceStatus.functional_closure_followthrough,
    oma_target_agent_work_order_guard: evidenceStatus.oma_target_agent_work_order_guard,
    negative_conformance_summary: {
      case_count: negativeCases.length,
      blocked_false_completion_count:
        negativeCases.filter((entry) => entry.status === 'blocked_false_completion').length,
      rejected_completion_claims: [
        ...new Set(stringList(negativeCases.map((entry) => entry.rejected_completion_claim))),
      ],
      can_claim_standard_agent_complete_count:
        negativeCases.filter((entry) => entry.can_claim_standard_agent_complete === true).length,
    },
    structural_closeout_guard: {
      can_close_non_live_structure_gate: guardChecks.every(Boolean),
      required_current_truth_surfaces: [
        'standard-agent-landing-acceptance-contract',
        'standard-agent-landing-evidence-status',
        'private-platform-residue-owner-decisions-contract',
        'opl agents residue-decisions --family-defaults --json',
        'standard-agent-negative-conformance-samples',
      ],
      deferred_evidence: [
        'generated_surface_production_consumption_owner_evidence',
        'OMA_target_agent_real_owner_closeout',
        'cross_agent_negative_conformance_scaleout',
        'long_soak_real_user_path_owner_evidence',
        ...DEFERRED_LIVE_EVIDENCE,
      ],
      cannot_claim: [
        'standard_agent_complete',
        'domain_ready',
        'target_agent_ready',
        'App_release_ready',
        'Brand_L5_complete',
        'production_ready',
        'physical_delete_authorized',
        'owner_receipt_signed',
        'typed_blocker_created',
        'quality_or_export_verdict',
        'full_goal_complete',
      ],
    },
    no_second_truth_guard: {
      acceptance_contract_can_replace_domain_truth: false,
      evidence_status_can_create_second_active_backlog: false,
      residue_decision_ledger_can_drive_ordinary_owner_delta: false,
      negative_samples_can_replace_live_owner_evidence: false,
    },
    authority_boundary: { ...STANDARD_AGENT_LANDING_AUTHORITY },
    false_ready_guard: {
      acceptance_definition_landed_can_claim_standard_agent_complete: false,
      evidence_tail_open_can_claim_completion: false,
      residue_decision_ledger_can_authorize_physical_delete: false,
      generated_surface_ready_can_claim_production_consumption: false,
      conformance_pass_can_claim_domain_ready: false,
      negative_samples_can_claim_live_scaleout_complete: false,
      tranche_guard_can_claim_full_goal_complete: false,
    },
  };
}
