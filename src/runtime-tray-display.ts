export type RuntimeTrayDisplayCronJob = {
  name?: unknown;
  script?: unknown;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStatusCode(status: string) {
  return status.trim().toLowerCase();
}

function statusDisplayKey(status: string) {
  return normalizeStatusCode(status).replace(/[-\s]+/g, '_');
}

const STATUS_LABELS_ZH: Record<string, string> = {
  active: '运行中',
  analysis_campaign: '分析补充',
  auto_runtime_parked: '已暂停',
  available: '可查看',
  blocked: '待收口',
  closeout_completed: '已收口',
  completed: '已完成',
  done: '已完成',
  failed: '异常',
  finalize: '交付收口',
  human_gate: '需用户确认',
  inactive: '未运行',
  in_progress: '进行中',
  live: '运行中',
  needs_attention: '需用户处理',
  paused: '已暂停',
  ready: '已就绪',
  recovering: '恢复中',
  repo_tracked: '已入库',
  resumable: '可恢复',
  retrying: '重试中',
  return_to_analysis_campaign: '分析补充',
  return_to_finalize: '交付收口',
  return_to_write: '写作',
  running: '运行中',
  scheduled: '已排程',
  stopped: '已暂停',
  waiting_for_user: '需用户确认',
  write: '写作',
};

export function humanizeStatusLabel(status: string | null) {
  if (!status) {
    return '可查看';
  }

  const key = statusDisplayKey(status);
  if (!key) {
    return '可查看';
  }

  const knownLabel = STATUS_LABELS_ZH[key];
  if (knownLabel) {
    return knownLabel;
  }
  if (key.includes('human') || key.includes('user')) {
    return '需用户确认';
  }
  if (key.includes('blocked') || key.includes('gate') || key.includes('stale')) {
    return '待收口';
  }
  if (key.includes('running') || key.includes('active') || key.includes('live')) {
    return '运行中';
  }
  if (key.includes('recover')) {
    return '恢复中';
  }
  if (key.includes('fail') || key.includes('error') || key.includes('timeout')) {
    return '异常';
  }

  return '状态已记录';
}

export function localizeRuntimeDisplayText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const key = statusDisplayKey(trimmed.replace(/[`.。]/g, ''));
  const exactMap: Record<string, string> = {
    close_current_evidence_gaps: '补齐当前证据缺口。',
    continue_same_line_quality_repair: '继续当前论文线的质量修复。',
    continue_supervision: '继续后台监督。',
    claim_evidence_consistency_failed: '主张与证据一致性仍需修复。',
    medical_publication_surface_blocked: '论文发布面暂未开放写入。',
    managed_runtime_is_live: '托管运行中。',
    publication_quality_gate_summary: '论文质量检查未关闭。',
    refresh_the_current_delivery_bundle: '刷新当前交付包。',
    stale_study_delivery_mirror: '研究交付镜像需要刷新。',
    stale_submission_minimal_authority: '投稿包投影需要刷新。',
    submission_hardening_incomplete: '投稿包加固未完成。',
    submission_surface_qc_failure_present: '投稿面仍有质控失败项。',
  };
  if (exactMap[key]) {
    return exactMap[key];
  }
  if (key.includes('bundle_suggestions_are_downstream_only')
    || key.includes('medical_publication_surface_is_blocked')
    || key.includes('claim_evidence_consistency')) {
    return '论文交付建议仍受发布门禁限制，需要先收口证据一致性和投稿准备检查。';
  }
  if (key.includes('narrowest_supplementary_analysis')) {
    return '需要明确最小补充分析范围。';
  }
  if (key.includes('review_matrix') && key.includes('action_plan')) {
    return '返修矩阵和行动计划需要完整覆盖反馈项。';
  }
  if (key.includes('revised_manuscript_package')) {
    return '修订稿包需要完成并通过监督检查。';
  }
  if (key.includes('repair_claim_evidence')) {
    return '主张、证据、故事线、图表和结果溯源需要修复。';
  }
  if (key.includes('refresh_the_stale_submission_minimal_package')) {
    return '刷新过期投稿包和当前交付包。';
  }
  if (key.includes('timed_out') || key.includes('timeout')) {
    return '后台监督执行超时，需要系统侧恢复。';
  }
  if (/^[\x00-\x7F]+$/.test(trimmed)) {
    return '底层状态已记录；等待下一次状态更新。';
  }
  return trimmed;
}

export function localizeRuntimeDisplayList(values: string[]) {
  return values.map((value) => localizeRuntimeDisplayText(value) ?? value);
}

export function liveRouteStatusLabel(routeTarget: string | null) {
  const routeLabel = routeTarget ? humanizeStatusLabel(routeTarget) : null;
  return routeLabel && routeLabel !== '状态已记录'
    ? `运行中：${routeLabel}`
    : '运行中';
}

export function masPublicationActionSummary(routeTarget: string | null) {
  const routeLabel = routeTarget ? humanizeStatusLabel(routeTarget) : null;
  return routeLabel && routeLabel !== '状态已记录'
    ? `论文质量或交付检查未关闭；当前阶段：${routeLabel}。`
    : '论文质量或交付检查未关闭。';
}

export function masPublicationNextActionSummary(routeTarget: string | null) {
  const routeKey = routeTarget ? statusDisplayKey(routeTarget) : null;
  if (routeKey === 'analysis_campaign' || routeKey === 'return_to_analysis_campaign') {
    return '建议阶段：分析补充；目标：补齐证据一致性。';
  }
  if (routeKey === 'write' || routeKey === 'return_to_write') {
    return '建议阶段：写作；目标：完善修订稿包。';
  }
  if (routeKey === 'finalize' || routeKey === 'return_to_finalize') {
    return '建议阶段：交付收口；目标：确认投稿包达到交付条件。';
  }
  return '建议动作：继续关闭质量与交付检查。';
}

export function titleFromHermesCronJob(job: RuntimeTrayDisplayCronJob) {
  const script = optionalString(job.script);
  const scriptMatch = script?.match(/med-autoscience\/([^/]+)\//);
  if (scriptMatch?.[1]) {
    return scriptMatch[1];
  }

  const name = optionalString(job.name);
  if (!name) {
    return 'MAS';
  }

  return name
    .replace(/^medautoscience-supervision-/, '')
    .replace(/^medautoscience-/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'MAS';
}
