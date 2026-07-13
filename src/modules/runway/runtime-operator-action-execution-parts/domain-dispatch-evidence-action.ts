import { domainDispatchEvidencePayloadRefs } from '../../ledger/index.ts';
import type { JsonRecord } from '../../../kernel/types.ts';
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
    evidence_refs: [...new Set([...refs.evidenceRefs, ...refs.progressArtifactRefs])],
  }, commandOrSurfaceRef, options);
}
