import path from 'node:path';

import {
  bindDurableKnowledgeContext,
  validateDurableKnowledgeContext,
  revalidateDurableKnowledgeContextAccess,
  type DurableKnowledgeContext,
} from '../../authority/packages/index.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  persistCanonicalReviewTransportJson,
  readReviewTransportJsonExactRef,
  reviewTransportRoots,
  type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';

export type StageKnowledgeContext = {
  receipt: DurableKnowledgeContext['receipt'];
  snapshot_ref: ReviewTransportExactRef;
};

function snapshotRoot() {
  return path.join(reviewTransportRoots().root, 'knowledge-context');
}

export function bindStageKnowledgeContext(input: Parameters<typeof bindDurableKnowledgeContext>[0]): StageKnowledgeContext {
  const context = bindDurableKnowledgeContext(input);
  const persisted = persistCanonicalReviewTransportJson({
    root: snapshotRoot(), kind: 'opl_stage_knowledge_snapshot', value: context,
  });
  return { receipt: context.receipt, snapshot_ref: persisted.exact_ref };
}

export function readStageKnowledgeContext(binding: StageKnowledgeContext, domainId: string, stageId: string) {
  if (!binding?.snapshot_ref) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage knowledge snapshot is required.');
  }
  const readback = readReviewTransportJsonExactRef({
    exactRef: binding.snapshot_ref, expectedKind: 'opl_stage_knowledge_snapshot', trustedRoot: snapshotRoot(),
  });
  const context = validateDurableKnowledgeContext(readback.value as unknown as DurableKnowledgeContext, domainId, stageId);
  if (canonicalJsonText(context.receipt) !== canonicalJsonText(binding.receipt)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage knowledge receipt differs from its snapshot.');
  }
  revalidateDurableKnowledgeContextAccess(context);
  return context;
}

export function revalidateStageKnowledgeContext(binding: StageKnowledgeContext, options: { forAction?: boolean } = {}) {
  const context = readStageKnowledgeContext(binding, binding.receipt.domain_id, binding.receipt.stage_id);
  return revalidateDurableKnowledgeContextAccess(context, options);
}
