import { domainDispatchEvidencePayloadRefs } from '../../ledger/domain-dispatch-evidence-payload-refs.ts';
import type { JsonRecord } from '../../console/runtime-tray-snapshot-types.ts';
import { externalEvidenceApplyArgs } from './external-evidence-action.ts';

export function domainDispatchExternalEvidenceApplyArgs(
  route: JsonRecord,
  payload: JsonRecord,
  commandOrSurfaceRef: string,
  options: { allowEmptyRecordPayload?: boolean } = {},
) {
  const refs = domainDispatchEvidencePayloadRefs(payload);
  return externalEvidenceApplyArgs(route, {
    ...payload,
    domain_receipt_refs: refs.domainReceiptRefs,
    typed_blocker_refs: refs.typedBlockerRefs,
    no_regression_refs: refs.noRegressionRefs,
    owner_chain_refs: refs.ownerChainRefs,
    evidence_refs: refs.evidenceRefs,
  }, commandOrSurfaceRef, options);
}
