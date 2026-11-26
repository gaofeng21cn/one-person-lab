import type {
  OwnerViewDescriptor,
  RenderableItem,
  SourceRefLike,
} from './types.ts';

export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escape = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);

const LABELS: Readonly<Record<string, string>> = {
  title: '标题',
  summary: '摘要',
  status: '状态',
  reason: '原因',
  owner: '负责人',
  current_owner: '负责人',
  stage_id: '阶段',
  stage_status: '阶段状态',
  next_action: '下一步',
  business_status: '业务状态',
  pending: '待处理',
  running: '运行中',
  active: '进行中',
  ready: '可用',
  available: '可用',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻塞',
  waiting: '等待',
  queued: '待执行',
  skipped: '已跳过',
  unknown: '尚未提供',
  approved: '已批准',
  rejected: '已拒绝',
  applied: '已应用',
  candidate: '候选',
  unavailable: '不可用',
  review_pending: '待审阅',
  review_required: '需要审阅',
  revision: '版本',
  artifact_ref: '产物引用',
  quality_debt: '待完善项',
  unresolved_quality_debt: '待完善项',
  source_refs: '来源',
  evidence_refs: '证据',
  workspace_file: '工作区文件',
  status_path: '状态文件',
  manifest_path: '产物清单',
  body: '正文',
  content: '内容',
  statement: '说明',
  target: '目标',
  work_item_identity: '当前任务',
  workspace_path: '工作区',
  work_item_root: '任务目录',
  item_id: '任务',
  action_id: '操作',
  action_revision: '操作版本',
  route_revision: '操作版本',
  payload: '操作参数',
  before: '修改前',
  after: '修改后',
};

export const fieldLabel = (key: string): string =>
  LABELS[key] || String(key).replaceAll('_', ' ');

export const statusLabel = (value: unknown): string =>
  (typeof value === 'string' && LABELS[value]) || (value ? String(value) : '尚未提供');

export const empty = (text: unknown): string =>
  `<p class="workbench-empty">${escape(text)}</p>`;

export const rawRecord = (value: unknown): string =>
  `<details class="raw-record"><summary>完整记录</summary><pre class="json">${escape(JSON.stringify(value, null, 2))}</pre></details>`;

export function renderSources(refs: unknown): string {
  const entries = list(refs);
  if (!entries.length) return '';
  return `<ul class="source-list">${entries
    .map((ref) => {
      const refObj = typeof ref === 'object' && ref !== null ? (ref as SourceRefLike) : null;
      const value = typeof ref === 'string' ? ref : refObj?.ref;
      const title = refObj ? refObj.title || refObj.label || value : value;
      return value
        ? `<li><button type="button" class="source-ref" data-source-ref="${escape(value)}">${escape(title)}</button></li>`
        : '';
    })
    .join('')}</ul>`;
}

export function presentationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (url.protocol !== 'opl-workspace:' || url.hostname !== 'artifact' || url.hash) return null;
    if (
      !url.searchParams.get('ref')
      || [...url.searchParams.keys()].some((key) => !['ref', 'start', 'end'].includes(key))
    ) {
      return null;
    }
    for (const key of ['start', 'end']) {
      if (
        url.searchParams.has(key)
        && (
          !url.searchParams.get(key)?.trim()
          || !Number.isFinite(Number(url.searchParams.get(key)))
          || Number(url.searchParams.get(key)) < 0
        )
      ) {
        return null;
      }
    }
    if (
      url.searchParams.has('start')
      && url.searchParams.has('end')
      && Number(url.searchParams.get('end')) < Number(url.searchParams.get('start'))
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function artifactPresentationUrl(
  ref: unknown,
  start?: number,
  end?: number,
): string | null {
  if (
    typeof ref !== 'string'
    || !ref.trim()
    || !(ref.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ref))
  ) {
    return null;
  }
  const url = new URL('opl-workspace://artifact');
  url.searchParams.set('ref', ref);
  if (typeof start === 'number' && Number.isFinite(start) && start >= 0) {
    url.searchParams.set('start', String(start));
  }
  if (
    typeof end === 'number'
    && Number.isFinite(end)
    && end > (typeof start === 'number' && Number.isFinite(start) ? start : 0)
  ) {
    url.searchParams.set('end', String(end));
  }
  return presentationUrl(url.href);
}

const IGNORED_FIELD_KEYS = new Set([
  'schema_version',
  'surface_kind',
  'version',
  'digest',
  'audience',
  'style',
  'language',
]);

export function renderFields(
  value: unknown,
  depth = 0,
  vocabulary: Readonly<Record<string, string>> = {},
): string {
  if (value === null || value === undefined) return '尚未提供';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value !== 'object') return escape(value);
  if (depth > 8) return escape(JSON.stringify(value));
  if (Array.isArray(value)) {
    return value.length
      ? `<ul>${value.map((entry) => `<li>${renderFields(entry, depth + 1, vocabulary)}</li>`).join('')}</ul>`
      : '暂无';
  }
  return `<dl class="meta-grid">${Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !IGNORED_FIELD_KEYS.has(key))
    .map(
      ([key, entry]) =>
        `<div class="meta-row"><dt>${escape(vocabulary[key] || fieldLabel(key))}</dt><dd>${
          key.endsWith('_refs') && Array.isArray(entry)
            ? renderSources(entry)
            : renderFields(entry, depth + 1, vocabulary)
        }</dd></div>`,
    )
    .join('')}</dl>`;
}

export function renderArtifact(rawItem: unknown): string {
  const item = record(rawItem);
  const ref = item.artifact_ref || item.source_ref;
  const presentation = record(item.presentation);
  const refObj = record(ref);
  const localRef = typeof ref === 'object' && ref !== null ? refObj.path || refObj.ref : item.path || ref;
  const url = presentationUrl(presentation.url || item.media_url) || artifactPresentationUrl(localRef);
  const available = item.availability !== 'unavailable' && item.status !== 'unavailable';
  const refAttrValue = typeof ref === 'object' && ref !== null ? refObj.ref : ref;
  return `<article class="artifact-entry"><div class="section-heading"><h3>${escape(item.title || item.name || item.artifact_kind || '产物')}</h3><span class="badge">${escape(statusLabel(item.status || item.availability))}</span></div>
    ${item.summary ? `<p>${escape(item.summary)}</p>` : ''}
    ${item.artifact_kind || item.media_type ? `<p class="subtitle">${escape(item.artifact_kind || item.media_type)}</p>` : ''}
    ${item.quality_debt || item.unresolved_quality_debt ? `<div class="quality-debt"><h4>待完善项</h4>${renderFields(item.quality_debt || item.unresolved_quality_debt)}</div>` : ''}
    <div class="detail-actions">${available && url ? `<button type="button" class="dsh-button action" data-open-link="${escape(url)}">${escape(presentation.title || '打开产物')}</button>` : ''}${ref ? `<button type="button" class="source-ref" data-source-ref="${escape(refAttrValue)}">查看产物引用</button>` : ''}</div>
    ${renderSources(item.evidence_refs || item.source_refs)}${rawRecord(item)}</article>`;
}

export function renderArtifacts(items: unknown, title = '可用产物'): string {
  const arr = list(items);
  return `<section class="artifact-list"><h2>${escape(title)}</h2>${arr.length ? arr.map(renderArtifact).join('') : empty('当前尚未提供产物')}</section>`;
}

export function renderProgress(
  rawItem: unknown,
  ownerDetails?: Record<string, unknown>,
): string {
  const item = record(rawItem);
  const owner = record(ownerDetails);
  const lifecycle = record(item.lifecycle);
  const phase = record(owner.phase);
  const stages = list(item.stage_map || item.stages);
  const action = record(item.action || item.next_action || owner.next_action);
  const current =
    lifecycle.current_stage_display_name
    || lifecycle.current_stage_id
    || item.lifecycle_stage
    || item.stage_id
    || phase.stage_id;
  const artifacts = list(item.artifacts || owner.artifacts);
  const debt = item.quality_debt || item.unresolved_quality_debt || owner.quality_debt;
  const ownerWork = record(owner.work);
  const freshness = record(item.freshness);
  return `<section class="progress-view"><div class="section-heading"><h2>执行进度</h2><span class="badge">${escape(lifecycle.primary_state_label || statusLabel(lifecycle.primary_state || item.status || phase.business_status))}</span></div>
    ${current ? `<p class="current-stage">${escape(current)}</p>` : ''}${item.summary ? `<p>${escape(item.summary)}</p>` : ''}
    ${stages.length ? `<ol class="stage-timeline">${stages.map((rawStage) => {
      const stage = record(rawStage);
      const displayNames = record(stage.display_names);
      return `<li data-state="${escape(stage.state || stage.status)}"><strong>${escape(displayNames.zh || stage.display_name || stage.title || stage.stage_id)}</strong><span class="badge">${escape(statusLabel(stage.state || stage.status))}</span>${stage.owner_display_name ? `<p>${escape(stage.owner_display_name)}</p>` : ''}${stage.next_action ? `<div>${renderFields(stage.next_action)}</div>` : ''}</li>`;
    }).join('')}</ol>` : ''}
    ${owner.current_owner || item.current_owner ? `<h3>负责人</h3>${renderFields(owner.current_owner || item.current_owner)}` : ''}
    ${list(ownerWork.active).length ? `<h3>进行中</h3>${renderFields(ownerWork.active)}` : ''}
    ${list(ownerWork.queued).length ? `<h3>待执行</h3>${renderFields(ownerWork.queued)}` : ''}
    ${action.title || action.summary ? `<div class="next-action"><h3>下一步</h3>${action.title ? `<p><strong>${escape(action.title)}</strong></p>` : ''}${action.summary ? `<p>${escape(action.summary)}</p>` : ''}${action.owner_display_name ? `<p class="subtitle">${escape(action.owner_display_name)}</p>` : ''}</div>` : ''}
    ${artifacts.length ? renderArtifacts(artifacts) : ''}${debt ? `<div class="quality-debt"><h3>待完善项</h3>${renderFields(debt)}</div>` : ''}
    ${freshness.state === 'stale' ? '<p role="status">当前显示上次读取的进度，请刷新。</p>' : ''}</section>`;
}

export function renderReview(rawItem: unknown): string {
  const item = record(rawItem);
  const preview = record(item.preview);
  const payload = record(item.payload);
  const target =
    preview.target || item.target_path || payload.target_path || item.review_target;
  const before = preview.before;
  const after =
    preview.after
    ?? preview.body
    ?? payload.body
    ?? item.body_text
    ?? item.body
    ?? item.content
    ?? item.statement;
  return `<section class="review-view"><div class="section-heading"><h2>${escape(item.title || item.display_name || '审阅修改')}</h2>${item.status ? `<span class="badge">${escape(statusLabel(item.status))}</span>` : ''}</div>
    ${item.summary ? `<p>${escape(item.summary)}</p>` : ''}${target ? `<h3>目标</h3>${renderFields(target)}` : ''}
    ${before !== undefined || after !== undefined ? `<div class="review-diff">${before !== undefined ? `<section><h3>修改前</h3><div class="review" data-change="removed">${renderFields(before)}</div></section>` : ''}${after !== undefined ? `<section><h3>${before !== undefined ? '修改后' : '审阅内容'}</h3><div class="review" data-change="added">${renderFields(after)}</div></section>` : ''}</div>` : ''}
    ${list(item.alternatives).length ? `<h3>备选方案</h3>${renderFields(item.alternatives)}` : ''}${item.quality_debt || item.unknowns ? `<h3>待完善项</h3>${renderFields(item.quality_debt || item.unknowns)}` : ''}
    ${list(item.artifacts).length ? renderArtifacts(item.artifacts, '完整审阅产物') : ''}${renderSources(preview.evidence_refs || item.evidence_refs || item.source_refs)}${rawRecord(item)}</section>`;
}

function renderMediaSegments(item: Record<string, unknown>): string {
  const media = record(item.media);
  const shots = list(item.shots);
  if (!shots.length) return '';
  return `<section class="media-segments"><h3>镜头与时码</h3><ol>${shots
    .map((rawShot) => {
      const shot = record(rawShot);
      const shotPresentation = record(shot.presentation);
      const selection = {
        artifact_ref: shot.artifact_ref || media.path || media.artifact_ref,
        shot_id: shot.id,
        start: shot.start,
        end: shot.end,
      };
      const url =
        presentationUrl(shotPresentation.url)
        || artifactPresentationUrl(
          selection.artifact_ref,
          typeof shot.start === 'number' ? shot.start : undefined,
          typeof shot.end === 'number' ? shot.end : undefined,
        );
      return `<li><button type="button" class="source-ref" data-media-selection="${escape(JSON.stringify(selection))}" ${url ? `data-open-link="${escape(url)}"` : ''}>${escape(shot.title || shot.id)} <span>${escape(shot.start)} – ${escape(shot.end)} 秒</span></button></li>`;
    })
    .join('')}</ol></section>`;
}

export function renderOwnerView(
  view: OwnerViewDescriptor,
  rawItem: RenderableItem,
): string {
  const item = record(rawItem);
  const viewType = view.view_type;

  if (viewType === 'artifact_view') {
    if (item.artifacts) {
      const nextAction = record(item.next_action);
      return `${renderArtifacts(item.artifacts, typeof item.title === 'string' ? item.title : '可用产物')}${renderMediaSegments(item)}${nextAction.title ? `<section class="next-action"><h3>下一步</h3><p>${escape(nextAction.title)}</p>${nextAction.summary ? `<p>${escape(nextAction.summary)}</p>` : ''}</section>` : ''}${list(item.review_notes).length ? `<section><h3>审看记录</h3>${renderFields(item.review_notes)}</section>` : ''}${rawRecord(item)}`;
    }
    return renderArtifacts([item]);
  }
  if (viewType === 'approval_diff') {
    return renderReview(item);
  }
  if (viewType === 'task_board') {
    return `${renderProgress(item)}${rawRecord(item)}`;
  }
  if (viewType === 'timeline' || viewType === 'activity_log') {
    const events = list(item.events || item.activity || item.entries);
    return `<section><h2>${escape(item.title || '活动记录')}</h2>${item.summary ? `<p>${escape(item.summary)}</p>` : ''}${events.length ? `<ol class="activity-timeline">${events.map((rawEvent) => {
      const event = record(rawEvent);
      return `<li>${event.occurred_at || event.timestamp ? `<time>${escape(event.occurred_at || event.timestamp)}</time>` : ''}<strong>${escape(event.title || event.label || event.kind || '')}</strong><p>${escape(event.summary || event.message || '')}</p>${renderSources(event.source_refs)}</li>`;
    }).join('')}</ol>` : renderFields(item)}${rawRecord(item)}</section>`;
  }
  return `<section><h2>${escape(item.title || item.display_name || item.name || '详情')}</h2>${renderFields(item)}${rawRecord(item)}</section>`;
}
