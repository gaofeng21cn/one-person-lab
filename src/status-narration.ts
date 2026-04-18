function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function normalizeInlineText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/\r?\n+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\\$/g, '')
    .trim();

  return normalized ? normalized : null;
}

export function humanizeProgressCode(code: string | null) {
  if (!code) {
    return null;
  }

  const labels: Record<string, string> = {
    publication_supervision: '论文可发表性监管',
    bundle_stage_ready: '投稿打包就绪',
    managed_runtime_recovering: '托管运行恢复中',
    runtime_blocked: '运行阻塞',
    live: '在线推进',
    recovering: '恢复中',
    stale: '进度陈旧',
    fresh: '进度新鲜',
  };

  return labels[code] ?? code.replace(/_/g, ' ');
}

export function readStatusNarrationContract(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

export function statusNarrationLatestUpdate(contract: Record<string, unknown> | null) {
  return normalizeInlineText(optionalString(contract?.latest_update));
}

export function statusNarrationNextStep(contract: Record<string, unknown> | null) {
  return normalizeInlineText(optionalString(contract?.next_step));
}

export function statusNarrationStageSummary(contract: Record<string, unknown> | null) {
  if (!contract) {
    return null;
  }
  const stage = isRecord(contract.stage) ? contract.stage : null;
  const currentStage = optionalString(stage?.current_stage);
  const recommendedNextStage = optionalString(stage?.recommended_next_stage);
  const currentStageLabel = humanizeProgressCode(currentStage) ?? currentStage;
  const nextStageLabel = humanizeProgressCode(recommendedNextStage) ?? recommendedNextStage;
  return normalizeInlineText([
    currentStageLabel ? `当前状态：${currentStageLabel}` : null,
    nextStageLabel ? `下一阶段：${nextStageLabel}` : null,
  ].filter(Boolean).join('；'));
}

export function statusNarrationSummary(contract: Record<string, unknown> | null) {
  if (!contract) {
    return null;
  }
  const blockers = uniqueStrings(optionalStringList(contract.current_blockers));
  return normalizeInlineText([
    statusNarrationStageSummary(contract),
    blockers.length > 0 ? `当前卡点：${blockers.join('；')}` : null,
  ].filter(Boolean).join('；'));
}
