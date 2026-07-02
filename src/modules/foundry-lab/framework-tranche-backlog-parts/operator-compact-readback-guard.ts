import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { readOperatorCompactReadbackContract } from './contract-readers.ts';
import { NO_SECOND_TRUTH_AUTHORITY_BOUNDARY } from './shared.ts';

function compactReadbackUnavailable(error: unknown) {
  return {
    surface_kind: 'opl_operator_compact_readback_guard',
    status: 'blocked_unavailable',
    source_contract_ref: 'contracts/opl-framework/operator-compact-readback-contract.json',
    error_code: error instanceof FrameworkContractError ? error.code : 'compact_readback_contract_unavailable',
    error_message:
      error instanceof Error ? error.message : 'Operator compact readback contract is unavailable.',
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  };
}

export function buildOperatorCompactReadbackGuard(contracts: FrameworkContracts) {
  try {
    const contract = readOperatorCompactReadbackContract(contracts.contractsDir);
    const compactSurfaces = contract.compact_surfaces.map((surface) => ({
      surface_id: surface.surface_id,
      surface_kind: surface.surface_kind,
      compact_command: surface.compact_command,
      full_detail_command: surface.full_detail_command,
      source_surface_ref: surface.source_surface_ref,
      derived_from_full_readback: surface.derived_from_full_readback,
      default_full_readback_unchanged: surface.default_full_readback_unchanged,
      retained_sections: surface.retained_sections,
      omitted_sections: surface.omitted_sections,
      authority_boundary: surface.authority_boundary,
    }));
    return {
      surface_kind: 'opl_operator_compact_readback_guard',
      status: 'closed_structure_gate_not_live_evidence',
      source_contract_ref: 'contracts/opl-framework/operator-compact-readback-contract.json',
      contract_version: contract.version,
      compact_surface_count: compactSurfaces.length,
      compact_surface_ids: compactSurfaces.map((surface) => surface.surface_id),
      compact_surfaces: compactSurfaces,
      operator_use: contract.operator_use,
      no_second_truth_guard: contract.no_second_truth_guard,
      false_ready_guard: contract.false_ready_guard,
      not_authorized_claims: contract.not_authorized_claims,
      structural_closeout_guard: {
        can_close_non_live_structure_gate: true,
        does_not_claim_lower_compute_cost:
          contract.operator_use.does_not_claim_lower_compute_cost === true,
        requires_full_detail_for: contract.operator_use.requires_full_detail_for,
        default_full_readback_unchanged: contract.default_full_readback_unchanged,
      },
      authority_boundary: {
        ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
        compact_readback_can_be_source_of_truth: false,
        compact_readback_can_claim_goal_complete: false,
        compact_readback_can_claim_live_evidence_complete: false,
      },
    };
  } catch (error) {
    return compactReadbackUnavailable(error);
  }
}
