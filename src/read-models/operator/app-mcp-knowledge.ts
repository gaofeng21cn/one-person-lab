import { recallDurableKnowledge } from '../../authority/packages/durable-knowledge-catalog.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

type KnowledgeInput = Parameters<typeof recallDurableKnowledge>[0];
type JsonRecord = Record<string, unknown>;
type KnowledgeRecall = (input: KnowledgeInput) => unknown;

const repairs: Record<string, string> = {
  knowledge_sources_not_bound: '由来源维护者把已有个人库或工作目录绑定到此工作区，并确认此领域的读取范围。',
  knowledge_source_revoked: '由来源维护者核对撤销原因；重新授权前使用其他已授权来源或暂停依赖此知识的动作。',
  knowledge_source_unauthorized: '由来源维护者核对工作区、领域、项目和 scope 授权。',
  knowledge_source_drifted: '在原处核对改动，再由有维护权限者 inspect-source 并 review-source 接受精确版本。',
  knowledge_dependency_drifted: '先复核派生摘要依赖的来源，再重新生成或审阅摘要。',
  knowledge_review_overdue: '由知识 owner 重新审阅原文和复核期限，再接受精确版本。',
  knowledge_review_in_future: '由知识 owner 核对审阅时间和本机时间。',
  knowledge_inactive: '由知识 owner 核对停用状态，选择当前接受的替代知识。',
  knowledge_replacement_unavailable: '由知识 owner 补齐并接受被声明的替代知识。',
  knowledge_source_unavailable: '核对来源绑定和原处文件是否可用，再刷新本视图。',
  knowledge_required_missing: '将此任务必要知识绑定到获授权且已接受的精确条目；不要以默认值代替。',
};

function knowledgeGap(value: string, required = false, requirement = false) {
  const [candidate, id] = value.split(':');
  const code = candidate && candidate in repairs ? candidate : 'knowledge_source_unavailable';
  // Owner errors can contain paths or source text. Only known codes and IDs cross the view boundary.
  const knowledgeId = id && /^[a-z][a-z0-9._-]*$/.test(id) ? id : null;
  return {
    id: `gap:${code}:${knowledgeId ?? ''}`,
    title: knowledgeId ?? '知识来源',
    status: required ? 'required_unavailable' : 'needs_attention',
    issue: code,
    ...(knowledgeId ? { [requirement ? 'requirement_id' : 'knowledge_id']: knowledgeId } : {}),
    repair: repairs[code],
  };
}

function selectedItem(value: unknown) {
  if (!isRecord(value) || typeof value.knowledge_id !== 'string') return [];
  const scope = isRecord(value.scope) && typeof value.scope.kind === 'string' && typeof value.scope.id === 'string'
    ? { kind: value.scope.kind, id: value.scope.id } : null;
  return [{
    id: value.knowledge_id,
    title: value.knowledge_id,
    status: 'available',
    knowledge_id: value.knowledge_id,
    ...(scope ? { scope } : {}),
    ...(typeof value.content_kind === 'string' ? { content_kind: value.content_kind } : {}),
    ...(typeof value.source_id === 'string' ? { source_id: value.source_id } : {}),
    ...(typeof value.sha256 === 'string' ? { revision: value.sha256 } : {}),
    action_critical: value.action_critical === true,
  }];
}

/** Read metadata for a host-resolved package/workspace; never accept consumer identity from UI paths. */
export function readMcpAppKnowledgeSources(input: KnowledgeInput, recall: KnowledgeRecall = recallDurableKnowledge) {
  let receipt: JsonRecord = {};
  let unavailable = false;
  let missing: string[] = [];
  let debt: string[] = [];
  try {
    const result = recall(input);
    if (!isRecord(result) || !Array.isArray(result.selected) || !Array.isArray(result.quality_debt)) {
      throw new Error('Invalid knowledge owner readback.');
    }
    receipt = result;
    debt = result.quality_debt.filter((item): item is string => typeof item === 'string');
  } catch (error) {
    unavailable = true;
    if (error instanceof FrameworkContractError) {
      const details = error.details ?? {};
      missing = Array.isArray(details.missing_knowledge_ids)
        ? details.missing_knowledge_ids.filter((item): item is string => typeof item === 'string') : [];
      debt = Array.isArray(details.quality_debt)
        ? details.quality_debt.filter((item): item is string => typeof item === 'string') : [];
    }
    if (!debt.length && !missing.length) debt = ['knowledge_source_unavailable'];
  }
  const gaps = [
    ...debt.map((issue) => knowledgeGap(issue)),
    ...missing.map((id) => knowledgeGap(`knowledge_required_missing:${id.replace(/^requirement:/, '')}`, true, id.startsWith('requirement:'))),
  ];
  const selected = Array.isArray(receipt.selected) ? receipt.selected.flatMap(selectedItem) : [];
  return {
    state: unavailable ? 'unavailable' : 'ready',
    ...(unavailable ? { reason: 'knowledge_sources_require_attention' } : {}),
    data: {
      items: [...selected, ...gaps],
      detail: {
        domain_id: input.domainId,
        stage_id: input.stageId,
        task_intent: input.taskIntent ?? null,
        selected_count: selected.length,
        gap_count: gaps.length,
        receipt_version: typeof receipt.version === 'string' ? receipt.version : null,
        context_kind: 'current_recall_metadata',
        next_step: '来源修复后刷新；任务执行仍由原 owner prepare/read-context，行动前 revalidate --for-action。',
      },
    },
  };
}
