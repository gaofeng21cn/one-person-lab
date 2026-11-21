import {
  VOLUME_ROOT_IDENTITY_VERSION,
  WORK_ITEM_ROOT_IDENTITY_VERSION,
  WorkItemFileBoundaryError,
} from '../../../authority/workspace/index.ts';
import { isRecord, type JsonRecord } from './shared.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';

// Mechanical field authority repairs ("B layer").
//
// The closeout contract asks the model to echo framework-owned mechanical
// identities — runtime domain ids, identity-envelope version tokens — even
// though the correct value is already in framework hands (the Attempt row,
// the frozen execution scope). LLM copy is a lossy channel: observed live
// failures re-typed `opl-work-item-root-identity.v1` with underscores and
// invented a pack-labelled domain_id while the correct execution_scope sat
// verbatim in the same packet. Each rule below rewrites exactly one such
// mechanical field from its unique framework authority and records a marker
// in route_impact.normalization_findings, so the StageRun controller can
// carry the defect as visible quality debt. Anything not uniquely determined
// by framework authority stays fail-closed — these rules never invent or
// "guess" values.

export const MECHANICAL_REPAIR_DOMAIN_OUTPUT_DOMAIN_ID
  = 'domain_output_domain_id_rebound_to_attempt_domain';
export const MECHANICAL_REPAIR_ROOT_IDENTITY_VERSION
  = 'execution_scope_root_identity_version_rebound_to_canonical_token';

// domain_output.domain_id names the runtime domain that owns the output ref.
// The Attempt row is the only authority for that identity; a mismatch is
// never meaningful, so the declared value is rebound to the attempt's domain.
export function repairDomainOutputDomainIdAgainstAttempt(input: {
  packet: TypedStageCloseoutPacket;
  attemptDomainId: unknown;
}): { packet: TypedStageCloseoutPacket; repaired: boolean } {
  const { packet, attemptDomainId } = input;
  if (
    !packet.domain_output
    || typeof attemptDomainId !== 'string'
    || !attemptDomainId
    || packet.domain_output.domain_id === attemptDomainId
  ) {
    return { packet, repaired: false };
  }
  const routeImpact = { ...(isRecord(packet.route_impact) ? packet.route_impact : {}) };
  const findings = Array.isArray(routeImpact.normalization_findings)
    ? routeImpact.normalization_findings.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    packet: {
      ...packet,
      domain_output: { ...packet.domain_output, domain_id: attemptDomainId },
      route_impact: {
        ...routeImpact,
        normalization_findings: [...new Set([...findings, MECHANICAL_REPAIR_DOMAIN_OUTPUT_DOMAIN_ID])],
      },
    },
    repaired: true,
  };
}

// A model that re-types the root-identity version token with the wrong
// separators (`opl_work_item_root_identity.v1` for the canonical
// `opl-work-item-root-identity.v1`) has written the right token through a
// lossy copy. The repair is narrow on purpose: only the underscore/hyphen
// separator class maps onto the two supported constants. The retried
// validation re-verifies the frozen scope_digest over the repaired snapshot,
// so a repair only lands when the cryptographic identity of the framework's
// own frozen scope confirms it — anything else keeps the original failure.
export function repairExecutionScopeRootIdentityVersionToken(
  value: unknown,
  error: unknown,
): JsonRecord | null {
  if (
    !(error instanceof WorkItemFileBoundaryError)
    || error.failureCode !== 'work_item_file_boundary_root_invalid'
    || !isRecord(value)
    || !isRecord(value.canonical_work_item_root_identity)
  ) {
    return null;
  }
  const version = value.canonical_work_item_root_identity.version;
  if (typeof version !== 'string') return null;
  const normalized = version.replace(/_/g, '-');
  if (normalized !== WORK_ITEM_ROOT_IDENTITY_VERSION && normalized !== VOLUME_ROOT_IDENTITY_VERSION) {
    return null;
  }
  const repaired = structuredClone(value) as JsonRecord;
  (repaired.canonical_work_item_root_identity as JsonRecord).version = normalized;
  return repaired;
}
