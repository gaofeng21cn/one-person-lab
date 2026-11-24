import { escape, renderSources, renderProgress, renderArtifacts, rawRecord } from './presentation.js';
import {
  DEFAULT_TRAJECTORY_LABELS,
  parseContributionTrajectory,
  parseTrajectorySnapshot,
  renderTrajectory,
  renderTrajectoryFields,
} from './trajectory-renderer.js';

export {
  escape,
  renderSources,
  renderProgress,
  parseTrajectorySnapshot,
  parseContributionTrajectory,
  renderTrajectory,
};

const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const list = (value) => (Array.isArray(value) ? value : []);
const empty = (text) => `<p class="workbench-empty">${escape(text)}</p>`;

export const renderFields = (value, depth = 0, labels = DEFAULT_TRAJECTORY_LABELS) => (
  renderTrajectoryFields(value, depth, labels)
);

// Host-neutral exports plus neutral compatibility aliases for callers using earlier names.
export const parseResearchSnapshot = parseTrajectorySnapshot;
export const parseContributionResearch = parseContributionTrajectory;
export const renderResearch = renderTrajectory;

export const domainViewRenderers = {};

export function registerDomainViewRenderer(viewKind, renderer) {
  if (typeof viewKind !== 'string' || !viewKind.trim()) {
    throw new Error('viewKind is required when registering a domain view renderer');
  }
  domainViewRenderers[viewKind] = renderer;
}

function resolveRenderer(descriptor, payloadSchemaRef) {
  const registered = Object.hasOwn(domainViewRenderers, descriptor?.view_kind)
    ? domainViewRenderers[descriptor.view_kind]
    : undefined;
  if (registered) {
    if (
      Array.isArray(registered.schema_compatibility)
      && !registered.schema_compatibility.includes(payloadSchemaRef)
    ) {
      throw new Error('此视图格式尚不受支持');
    }
    return registered;
  }
  if (
    !descriptor?.schema_ref
    && (typeof payloadSchemaRef !== 'string' || !/\.schema\.json$/i.test(payloadSchemaRef))
  ) {
    throw new Error('此视图格式尚不受支持');
  }
  return {
    parse: (payload, workItemId) => parseTrajectorySnapshot(payload, workItemId),
    component: (snapshot, selectedId, section, options) => renderTrajectory(snapshot, selectedId, section, options),
  };
}

export function acceptDomainRead(readback, item, descriptor, previous) {
  const r = obj(readback);
  if (
    r.schema_version !== 'opl_domain_detail_view.v1'
    || r.surface_kind !== 'opl_domain_detail_view'
    || r.item_id !== item.item_id
    || r.view_id !== descriptor.view_id
    || r.view_kind !== descriptor.view_kind
    || !Number.isSafeInteger(r.revision)
    || r.revision < 0
    || typeof r.not_modified !== 'boolean'
  ) {
    throw new Error('详情与当前任务或视图不匹配');
  }
  if (r.availability !== 'available') throw new Error('此视图暂不可用');
  if (
    (descriptor.schema_ref && descriptor.schema_ref !== r.payload_schema_ref)
    || (descriptor.schema_version && descriptor.schema_version !== r.payload_schema)
  ) {
    throw new Error('此视图格式尚不受支持');
  }
  const renderer = resolveRenderer(descriptor, r.payload_schema_ref);
  if (previous && r.revision < previous.revision) throw new Error('详情版本已回退');
  if (r.not_modified) {
    if (!previous || r.revision !== previous.revision || r.payload != null) throw new Error('缺少对应的有效详情');
    return previous;
  }
  const snapshot = renderer.parse(r.payload, item.identity?.domain_work_item_id);
  if (snapshot.revision !== r.revision) throw new Error('详情版本与数据不匹配');
  return { revision: r.revision, snapshot, renderer };
}

export function mountTaskWorkbench({
  container,
  item,
  snapshot: initialSnapshot,
  initialViewId,
  read,
  onContext,
  relatedViews = [],
  onOpenView,
  ownerDetails,
  actions = [],
  readActions,
  onAction,
  onOpenLink,
}) {
  const descriptors = list(item.domain_detail_views);
  const cache = new Map();
  let section = initialViewId ? 'trajectory' : 'progress';
  let viewId = initialViewId || descriptors[0]?.view_id;
  let snapshot = initialSnapshot;
  let activeRenderer = null;
  let selectedId = snapshot?.current_focus?.node_id;
  let error = '';
  let busy = false;
  let alive = true;
  let generation = 0;
  let actionsBusy = false;
  let actionsError = '';
  let actionsLoaded = !item.runtime_actions_deferred;
  const emit = (extra) => onContext({
    item_id: item.item_id,
    work_item_identity: item.identity,
    section,
    view_id: viewId,
    node: snapshot?.nodes?.find((node) => node.id === selectedId) || null,
    ...extra,
  });

  function renderViewBody(targetSection) {
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    const renderComponent = activeRenderer?.component || renderTrajectory;
    const options = {
      title: descriptor?.title,
      labels: descriptor?.labels,
      summary_keys: descriptor?.summary_keys,
      evidence_node_kinds: descriptor?.evidence_node_kinds,
      decision_node_kinds: descriptor?.decision_node_kinds,
    };
    return renderComponent(snapshot, selectedId, targetSection, options);
  }

  function render() {
    if (!alive) return;
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused
      ? ['data-section', 'data-domain-view', 'data-refresh-domain', 'data-node-id', 'data-load-actions']
        .find((key) => focused.hasAttribute(key))
      : null;
    const focusValue = focusKey ? focused.getAttribute(focusKey) : null;
    const hasDetailView = descriptors.length || snapshot;
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    const trajectoryTabTitle = descriptor?.title || '任务路径';
    const runtimeActions = `<div class="detail-actions" aria-label="当前可用操作">${actions.map((action, index) => `<button type="button" class="dsh-button action" data-runtime-action="${index}">${escape(action.label_i18n?.['zh-CN'] || action.label_i18n?.['en-US'] || action.command_id)}${action.confirmation_required ? '…' : ''}</button>`).join('')}${readActions && (!actionsLoaded || actionsError) ? `<button type="button" class="dsh-button action" data-load-actions ${actionsBusy ? 'disabled' : ''}>${actionsBusy ? '正在读取可用操作…' : actionsError ? '重试读取操作' : '查看可用操作'}</button>` : ''}${actionsError ? `<p role="alert">${escape(actionsError)}</p>` : actionsLoaded && item.runtime_actions_deferred && !actions.length ? '<p role="status">当前没有可用操作。</p>' : ''}</div>`;
    const tabs = [['progress', '执行进度'], ...(hasDetailView ? [['trajectory', trajectoryTabTitle]] : []), ['evidence', '证据与产物'], ['decisions', '待人决定']];
    container.innerHTML = `<div class="task-workbench"><h2>${escape(item.identity?.work_item_display_name || item.identity?.work_item_id || '任务详情')}</h2><nav class="workbench-tabs" aria-label="任务详情">${tabs.map(([id, title]) => `<button class="dsh-button action" data-section="${id}" aria-current="${id === section ? 'page' : 'false'}">${escape(title)}</button>`).join('')}</nav>
      ${hasDetailView && section !== 'progress' && descriptors.length ? `<div class="toolbar-row">${descriptors.map((view) => `<button class="dsh-button action" data-domain-view="${escape(view.view_id)}" aria-pressed="${viewId === view.view_id}">${escape(view.title || view.view_id)}</button>`).join('')}<button class="dsh-button action" data-refresh-domain ${busy ? 'disabled' : ''}>刷新视图</button></div>` : ''}
      ${item.runtime_actions_unavailable ? '<p role="status">操作暂时无法读取，可刷新任务后重试。</p>' : ''}${busy ? '<p role="status">正在读取视图…</p>' : ''}${error ? `<p role="alert">${escape(error)}${snapshot ? '；保留上次有效视图' : ''}</p>` : ''}
      ${section === 'progress' ? `${runtimeActions}${renderProgress(item, ownerDetails)}${rawRecord(item)}`
        : section === 'evidence' ? `${snapshot ? renderViewBody(section) : ''}${item.artifacts?.length ? renderArtifacts(item.artifacts) : ''}<section class="card"><h3>任务来源</h3>${renderSources(item.source_refs)}</section>`
        : section === 'decisions' ? `<section class="card"><h3>当前待办</h3>${ownerDetails ? renderFields(ownerDetails.work?.pending || []) : item.attention?.kind === 'user' || item.action?.owner_kind === 'user' ? `<p>${escape(item.action?.title)}</p><p>${escape(item.action?.summary)}</p>${item.attention?.issue ? `<p>${escape(item.attention.issue)}</p>` : ''}` : empty('当前没有投影到此处的人工待办')}</section>${snapshot ? renderViewBody(section) : ''}`
        : snapshot ? renderViewBody(section) : empty('此任务的结构视图暂不可用')}
      ${relatedViews.length ? `<nav class="detail-actions" aria-label="任务能力">${relatedViews.map((view, index) => `<button class="dsh-button action" data-related-view="${index}">${escape(view.title_i18n?.['zh-CN'] || view.title_i18n?.['en-US'] || view.view_id)}</button>`).join('')}</nav>` : ''}
      </div>`;
    if (focusKey) [...container.querySelectorAll(`[${focusKey}]`)].find((element) => element.getAttribute(focusKey) === focusValue)?.focus({ preventScroll: true });
  }

  async function load() {
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    if (!descriptor || !read) { error = '此视图暂不可用'; render(); return; }
    const ticket = ++generation;
    busy = true; error = ''; render();
    try {
      const previous = cache.get(viewId);
      const response = await read({ item_id: item.item_id, view_id: viewId, ...(previous ? { if_revision: previous.revision } : {}) });
      if (!alive || ticket !== generation) return;
      const accepted = acceptDomainRead(response, item, descriptor, previous);
      cache.set(viewId, accepted);
      snapshot = accepted.snapshot;
      activeRenderer = accepted.renderer;
      if (!snapshot.nodes?.some((node) => node.id === selectedId)) {
        selectedId = snapshot.current_focus?.node_id || snapshot.nodes?.[0]?.id;
      }
    } catch (reason) {
      if (alive && ticket === generation) error = reason.message || '此视图暂不可用';
    } finally {
      if (alive && ticket === generation) { busy = false; render(); emit({}); }
    }
  }

  async function loadActions() {
    if (!readActions || actionsBusy) return;
    actionsBusy = true; actionsError = ''; render();
    try {
      const result = await readActions();
      if (!alive) return;
      actions = result; actionsLoaded = true;
    } catch {
      if (alive) actionsError = '操作暂时无法读取，请重试。';
    } finally {
      if (alive) { actionsBusy = false; render(); }
    }
  }

  function click(event) {
    const button = event.target.closest('[data-section],[data-domain-view],[data-refresh-domain],[data-node-id],[data-source-ref],[data-related-view],[data-runtime-action],[data-open-link],[data-load-actions]');
    if (!button || !container.contains(button)) return;
    if (button.hasAttribute('data-section')) {
      section = button.dataset.section; render(); emit({});
      if (section !== 'progress' && !snapshot && descriptors.length && !busy) void load();
    } else if (button.hasAttribute('data-domain-view')) {
      ++generation; viewId = button.dataset.domainView;
      const cached = cache.get(viewId);
      snapshot = cached?.snapshot; activeRenderer = cached?.renderer || null; selectedId = undefined;
      render(); void load();
    } else if (button.hasAttribute('data-refresh-domain')) {
      void load();
    } else if (button.hasAttribute('data-node-id')) {
      selectedId = button.dataset.nodeId; section = 'trajectory'; render(); emit({});
      container.querySelector('.node-detail')?.scrollIntoView({ block: 'nearest' });
    } else if (button.hasAttribute('data-load-actions')) {
      void loadActions();
    } else if (button.hasAttribute('data-runtime-action')) {
      onAction?.(actions[Number(button.dataset.runtimeAction)]);
    } else if (button.hasAttribute('data-open-link')) {
      onOpenLink?.(button.dataset.openLink);
    } else if (button.hasAttribute('data-related-view')) {
      onOpenView?.(relatedViews[Number(button.dataset.relatedView)]);
    } else {
      emit({ source_ref: button.dataset.sourceRef });
    }
  }

  function keydown(event) {
    if (event.target.matches('.trajectory-node, .research-node') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      click(event);
    }
  }

  container.addEventListener('click', click);
  container.addEventListener('keydown', keydown);
  render();
  if (initialViewId && !snapshot) void load();
  return () => {
    alive = false;
    ++generation;
    container.removeEventListener('click', click);
    container.removeEventListener('keydown', keydown);
  };
}
