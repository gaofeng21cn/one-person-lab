export function humanizeProgressCode(code: string | null) {
  if (!code) {
    return null;
  }

  const labels: Record<string, string> = {
    accepted: '已受理',
    queued: '排队中',
    running: '运行中',
    waiting: '等待中',
    ready: '可继续',
    succeeded: '已完成',
    failed: '已失败',
    cancelled: '已取消',
    canceled: '已取消',
    paused: '已暂停',
    planning: '规划中',
    analysis: '分析中',
    writing: '撰写中',
    reviewing: '审阅中',
    revising: '修改中',
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
