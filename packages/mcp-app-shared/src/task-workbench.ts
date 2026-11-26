import {
  escape,
  rawRecord,
  renderArtifacts,
  renderProgress,
  renderSources,
} from './presentation.ts';
import {
  DEFAULT_TRAJECTORY_LABELS,
  parseContributionTrajectory,
  parseTrajectorySnapshot,
  renderTrajectory,
  renderTrajectoryFields,
} from './trajectory-renderer.ts';
import type {
  CatalogCommandDescriptor,
  CatalogViewDescriptor,
  DocumentLike,
  DomainViewRenderer,
  ElementLike,
  TrajectoryRenderOptions,
  TrajectorySnapshot,
} from './types.ts';

export {
  escape,
  renderSources,
  renderProgress,
  parseTrajectorySnapshot,
  parseContributionTrajectory,
  renderTrajectory,
};

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const list = <T = unknown>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const empty = (text: string): string => `<p class="workbench-empty">${escape(text)}</p>`;

export const renderFields = (
  value: unknown,
  depth = 0,
  labels: Readonly<Record<string, string>> = DEFAULT_TRAJECTORY_LABELS,
): string => renderTrajectoryFields(value, depth, labels);

// Host-neutral exports plus neutral compatibility aliases for callers using earlier names.
export const parseResearchSnapshot = parseTrajectorySnapshot;
export const parseContributionResearch = parseContributionTrajectory;
export const renderResearch = renderTrajectory;

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const domainViewRenderers: Record<string, DomainViewRenderer> =
  Object.create(null) as Record<string, DomainViewRenderer>;

export function registerDomainViewRenderer(
  viewKind: string,
  renderer: DomainViewRenderer,
): void {
  if (typeof viewKind !== 'string' || !viewKind.trim()) {
    throw new Error('viewKind is required when registering a domain view renderer');
  }
  if (UNSAFE_OBJECT_KEYS.has(viewKind) || UNSAFE_OBJECT_KEYS.has(viewKind.trim())) {
    throw new Error(`Invalid viewKind '${viewKind}'`);
  }
  domainViewRenderers[viewKind] = renderer;
}

export interface DomainDetailDescriptor {
  readonly view_id: string;
  readonly view_kind: string;
  readonly title?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly summary_keys?: readonly string[];
  readonly evidence_node_kinds?: readonly string[];
  readonly decision_node_kinds?: readonly string[];
  readonly schema_ref?: string;
  readonly schema_version?: string;
}

export interface DomainDetailReadback {
  readonly schema_version?: string;
  readonly surface_kind?: string;
  readonly item_id?: string;
  readonly view_id?: string;
  readonly view_kind?: string;
  readonly revision?: number;
  readonly not_modified?: boolean;
  readonly availability?: string;
  readonly payload_schema_ref?: string;
  readonly payload_schema?: string;
  readonly payload?: unknown;
}

export interface TaskWorkbenchItem {
  readonly item_id: string;
  readonly identity?: {
    readonly work_item_id?: string;
    readonly work_item_display_name?: string;
    readonly domain_work_item_id?: string;
    readonly agent_id?: string;
    readonly domain_id?: string;
    readonly workspace_path?: string;
    readonly work_item_root?: string;
  };
  readonly domain_detail_views?: readonly DomainDetailDescriptor[];
  readonly runtime_actions_deferred?: boolean;
  readonly runtime_actions_unavailable?: boolean;
  readonly runtime_actions?: readonly CatalogCommandDescriptor[];
  readonly artifacts?: readonly unknown[];
  readonly source_refs?: readonly unknown[];
  readonly attention?: { readonly kind?: string; readonly issue?: string };
  readonly action?: {
    readonly owner_kind?: string;
    readonly title?: string;
    readonly summary?: string;
  };
  readonly [key: string]: unknown;
}

export interface AcceptedDomainRead {
  readonly revision: number;
  readonly snapshot: TrajectorySnapshot;
  readonly renderer: DomainViewRenderer;
}

function resolveRenderer(
  descriptor: DomainDetailDescriptor,
  payloadSchemaRef?: string,
): DomainViewRenderer {
  const registered = Object.hasOwn(domainViewRenderers, descriptor?.view_kind)
    ? domainViewRenderers[descriptor.view_kind]
    : undefined;
  if (registered) {
    if (
      Array.isArray(registered.schema_compatibility)
      && (!payloadSchemaRef || !registered.schema_compatibility.includes(payloadSchemaRef))
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
    parse: (payload: unknown, workItemId?: string) => parseTrajectorySnapshot(payload, workItemId),
    component: (
      snapshot: TrajectorySnapshot,
      selectedId: string | undefined,
      section: string,
      options: TrajectoryRenderOptions,
    ) => renderTrajectory(snapshot, selectedId, section, options),
  };
}

export function acceptDomainRead(
  readback: DomainDetailReadback | unknown,
  item: TaskWorkbenchItem,
  descriptor: DomainDetailDescriptor,
  previous?: AcceptedDomainRead,
): AcceptedDomainRead {
  const r = obj(readback) as DomainDetailReadback;
  if (
    r.schema_version !== 'opl_domain_detail_view.v1'
    || r.surface_kind !== 'opl_domain_detail_view'
    || r.item_id !== item.item_id
    || r.view_id !== descriptor.view_id
    || r.view_kind !== descriptor.view_kind
    || typeof r.revision !== 'number'
    || !Number.isSafeInteger(r.revision)
    || r.revision < 0
    || typeof r.not_modified !== 'boolean'
  ) {
    throw new Error('详情与当前任务或视图不匹配');
  }
  if (r.availability !== 'available') {
    throw new Error('此视图暂不可用');
  }
  if (
    (descriptor.schema_ref && descriptor.schema_ref !== r.payload_schema_ref)
    || (descriptor.schema_version && descriptor.schema_version !== r.payload_schema)
  ) {
    throw new Error('此视图格式尚不受支持');
  }
  const renderer = resolveRenderer(descriptor, r.payload_schema_ref);
  if (previous && r.revision < previous.revision) {
    throw new Error('详情版本已回退');
  }
  if (r.not_modified) {
    if (!previous || r.revision !== previous.revision || r.payload != null) {
      throw new Error('缺少对应的有效详情');
    }
    return previous;
  }
  const snapshot = renderer.parse(r.payload, item.identity?.domain_work_item_id);
  if (snapshot.revision !== r.revision) {
    throw new Error('详情版本与数据不匹配');
  }
  return { revision: r.revision, snapshot, renderer };
}

export interface MountTaskWorkbenchOptions {
  readonly container: ElementLike;
  readonly doc?: DocumentLike;
  readonly item: TaskWorkbenchItem;
  readonly snapshot?: TrajectorySnapshot;
  readonly initialViewId?: string;
  readonly read?: (input: {
    readonly item_id: string;
    readonly view_id: string;
    readonly if_revision?: number;
  }) => Promise<unknown>;
  readonly onContext: (context: Record<string, unknown>) => void;
  readonly relatedViews?: readonly CatalogViewDescriptor[];
  readonly onOpenView?: (view: CatalogViewDescriptor) => void;
  readonly ownerDetails?: Record<string, unknown>;
  readonly actions?: readonly CatalogCommandDescriptor[];
  readonly readActions?: () => Promise<readonly CatalogCommandDescriptor[]>;
  readonly onAction?: (action: CatalogCommandDescriptor | undefined) => void;
  readonly onOpenLink?: (url: string) => void;
}

interface EventLike {
  readonly target?: {
    closest?(selector: string): ElementLike | null;
    matches?(selector: string): boolean;
  } | null;
  readonly key?: string;
  preventDefault?(): void;
}

export function mountTaskWorkbench(options: MountTaskWorkbenchOptions): () => void {
  const {
    container,
    item,
    snapshot: initialSnapshot,
    initialViewId,
    read,
    onContext,
    relatedViews = [],
    onOpenView,
    ownerDetails,
    readActions,
    onAction,
    onOpenLink,
  } = options;

  const doc =
    options.doc
    ?? container.ownerDocument
    ?? (typeof globalThis.document !== 'undefined'
      ? (globalThis.document as unknown as DocumentLike)
      : undefined);

  let actions: readonly CatalogCommandDescriptor[] = options.actions ?? [];
  const descriptors = list<DomainDetailDescriptor>(item.domain_detail_views);
  const cache = new Map<string, AcceptedDomainRead>();
  let section = initialViewId ? 'trajectory' : 'progress';
  let viewId: string | undefined = initialViewId || descriptors[0]?.view_id;
  let snapshot: TrajectorySnapshot | undefined = initialSnapshot;
  let activeRenderer: DomainViewRenderer | null = null;
  let selectedId: string | undefined = snapshot?.current_focus?.node_id;
  let error = '';
  let busy = false;
  let alive = true;
  let generation = 0;
  let actionsBusy = false;
  let actionsError = '';
  let actionsLoaded = !item.runtime_actions_deferred;

  const emit = (extra: Record<string, unknown>): void => {
    onContext({
      item_id: item.item_id,
      work_item_identity: item.identity,
      section,
      view_id: viewId,
      node: snapshot?.nodes?.find((node) => node.id === selectedId) || null,
      ...extra,
    });
  };

  function renderViewBody(targetSection: string): string {
    if (!snapshot) return '';
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    const renderComponent = activeRenderer?.component || renderTrajectory;
    const renderOptions: TrajectoryRenderOptions = {
      title: descriptor?.title,
      labels: descriptor?.labels,
      summary_keys: descriptor?.summary_keys,
      evidence_node_kinds: descriptor?.evidence_node_kinds,
      decision_node_kinds: descriptor?.decision_node_kinds,
    };
    return renderComponent(snapshot, selectedId, targetSection, renderOptions);
  }

  function render(): void {
    if (!alive) return;
    const activeEl = doc?.activeElement;
    const focused =
      activeEl && container.contains?.(activeEl) ? (activeEl as ElementLike) : null;
    const focusKey = focused
      ? [
          'data-section',
          'data-domain-view',
          'data-refresh-domain',
          'data-node-id',
          'data-load-actions',
        ].find((key) => focused.hasAttribute(key)) ?? null
      : null;
    const focusValue = focusKey ? focused?.getAttribute(focusKey) ?? null : null;
    const hasDetailView = descriptors.length || snapshot;
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    const trajectoryTabTitle = descriptor?.title || '任务路径';
    const runtimeActions = `<div class="detail-actions" aria-label="当前可用操作">${actions
      .map((action, index) => {
        const labelText =
          action.label_i18n?.['zh-CN']
          || action.label?.['zh-CN']
          || action.label_i18n?.['en-US']
          || action.label?.['en-US']
          || action.command_id;
        const needsConfirm = Boolean(action.confirmation_required ?? action.confirm);
        return `<button type="button" class="dsh-button action" data-runtime-action="${index}">${escape(labelText)}${needsConfirm ? '…' : ''}</button>`;
      })
      .join('')}${
      readActions && (!actionsLoaded || actionsError)
        ? `<button type="button" class="dsh-button action" data-load-actions ${actionsBusy ? 'disabled' : ''}>${actionsBusy ? '正在读取可用操作…' : actionsError ? '重试读取操作' : '查看可用操作'}</button>`
        : ''
    }${
      actionsError
        ? `<p role="alert">${escape(actionsError)}</p>`
        : actionsLoaded && item.runtime_actions_deferred && !actions.length
          ? '<p role="status">当前没有可用操作。</p>'
          : ''
    }</div>`;
    const tabs: Array<[string, string]> = [
      ['progress', '执行进度'],
      ...(hasDetailView ? [['trajectory', trajectoryTabTitle] as [string, string]] : []),
      ['evidence', '证据与产物'],
      ['decisions', '待人决定'],
    ];
    const ownerWork = obj(ownerDetails?.work);

    container.innerHTML = `<div class="task-workbench"><h2>${escape(
      item.identity?.work_item_display_name || item.identity?.work_item_id || '任务详情',
    )}</h2><nav class="workbench-tabs" aria-label="任务详情">${tabs
      .map(
        ([id, title]) =>
          `<button class="dsh-button action" data-section="${id}" aria-current="${id === section ? 'page' : 'false'}">${escape(title)}</button>`,
      )
      .join('')}</nav>
      ${
        hasDetailView && section !== 'progress' && descriptors.length
          ? `<div class="toolbar-row">${descriptors
              .map(
                (view) =>
                  `<button class="dsh-button action" data-domain-view="${escape(view.view_id)}" aria-pressed="${viewId === view.view_id}">${escape(view.title || view.view_id)}</button>`,
              )
              .join('')}<button class="dsh-button action" data-refresh-domain ${busy ? 'disabled' : ''}>刷新视图</button></div>`
          : ''
      }
      ${item.runtime_actions_unavailable ? '<p role="status">操作暂时无法读取，可刷新任务后重试。</p>' : ''}${busy ? '<p role="status">正在读取视图…</p>' : ''}${error ? `<p role="alert">${escape(error)}${snapshot ? '；保留上次有效视图' : ''}</p>` : ''}
      ${
        section === 'progress'
          ? `${runtimeActions}${renderProgress(item, ownerDetails)}${rawRecord(item)}`
          : section === 'evidence'
            ? `${snapshot ? renderViewBody(section) : ''}${item.artifacts?.length ? renderArtifacts(item.artifacts) : ''}<section class="card"><h3>任务来源</h3>${renderSources(item.source_refs)}</section>`
            : section === 'decisions'
              ? `<section class="card"><h3>当前待办</h3>${
                  ownerDetails
                    ? renderFields(ownerWork.pending || [])
                    : item.attention?.kind === 'user' || item.action?.owner_kind === 'user'
                      ? `<p>${escape(item.action?.title)}</p><p>${escape(item.action?.summary)}</p>${item.attention?.issue ? `<p>${escape(item.attention.issue)}</p>` : ''}`
                      : empty('当前没有投影到此处的人工待办')
                }</section>${snapshot ? renderViewBody(section) : ''}`
              : snapshot
                ? renderViewBody(section)
                : empty('此任务的结构视图暂不可用')
      }
      ${
        relatedViews.length
          ? `<nav class="detail-actions" aria-label="任务能力">${relatedViews
              .map(
                (view, index) =>
                  `<button class="dsh-button action" data-related-view="${index}">${escape(
                    view.title_i18n?.['zh-CN']
                      || view.title?.['zh-CN']
                      || view.title_i18n?.['en-US']
                      || view.title?.['en-US']
                      || view.view_id
                      || view.id,
                  )}</button>`,
              )
              .join('')}</nav>`
          : ''
      }
      </div>`;

    if (focusKey) {
      for (const element of container.querySelectorAll(`[${focusKey}]`)) {
        if (element.getAttribute(focusKey) === focusValue) {
          element.focus?.({ preventScroll: true });
          break;
        }
      }
    }
  }

  async function load(): Promise<void> {
    const descriptor = descriptors.find((view) => view.view_id === viewId);
    if (!descriptor || !read || !viewId) {
      error = '此视图暂不可用';
      render();
      return;
    }
    const currentViewId = viewId;
    const ticket = ++generation;
    busy = true;
    error = '';
    render();
    try {
      const previous = cache.get(currentViewId);
      const response = await read({
        item_id: item.item_id,
        view_id: currentViewId,
        ...(previous ? { if_revision: previous.revision } : {}),
      });
      if (!alive || ticket !== generation) return;
      const accepted = acceptDomainRead(response, item, descriptor, previous);
      cache.set(currentViewId, accepted);
      snapshot = accepted.snapshot;
      activeRenderer = accepted.renderer;
      if (!snapshot.nodes?.some((node) => node.id === selectedId)) {
        selectedId = snapshot.current_focus?.node_id || snapshot.nodes?.[0]?.id;
      }
    } catch (reason) {
      if (alive && ticket === generation) {
        error = reason instanceof Error && reason.message ? reason.message : '此视图暂不可用';
      }
    } finally {
      if (alive && ticket === generation) {
        busy = false;
        render();
        emit({});
      }
    }
  }

  async function loadActions(): Promise<void> {
    if (!readActions || actionsBusy) return;
    actionsBusy = true;
    actionsError = '';
    render();
    try {
      const result = await readActions();
      if (!alive) return;
      actions = result;
      actionsLoaded = true;
    } catch {
      if (alive) actionsError = '操作暂时无法读取，请重试。';
    } finally {
      if (alive) {
        actionsBusy = false;
        render();
      }
    }
  }

  function click(rawEvent: unknown): void {
    const event = rawEvent as EventLike;
    const button = event.target?.closest?.(
      '[data-section],[data-domain-view],[data-refresh-domain],[data-node-id],[data-source-ref],[data-related-view],[data-runtime-action],[data-open-link],[data-load-actions]',
    );
    if (!button || (container.contains && !container.contains(button))) return;

    if (button.hasAttribute('data-section')) {
      section = button.dataset.section || 'progress';
      render();
      emit({});
      if (section !== 'progress' && !snapshot && descriptors.length && !busy) {
        void load();
      }
    } else if (button.hasAttribute('data-domain-view')) {
      ++generation;
      viewId = button.dataset.domainView;
      const cached = viewId ? cache.get(viewId) : undefined;
      snapshot = cached?.snapshot;
      activeRenderer = cached?.renderer || null;
      selectedId = undefined;
      render();
      void load();
    } else if (button.hasAttribute('data-refresh-domain')) {
      void load();
    } else if (button.hasAttribute('data-node-id')) {
      selectedId = button.dataset.nodeId;
      section = 'trajectory';
      render();
      emit({});
      container.querySelector('.node-detail')?.scrollIntoView?.({ block: 'nearest' });
    } else if (button.hasAttribute('data-load-actions')) {
      void loadActions();
    } else if (button.hasAttribute('data-runtime-action')) {
      onAction?.(actions[Number(button.dataset.runtimeAction)]);
    } else if (button.hasAttribute('data-open-link')) {
      if (button.dataset.openLink) onOpenLink?.(button.dataset.openLink);
    } else if (button.hasAttribute('data-related-view')) {
      const targetView = relatedViews[Number(button.dataset.relatedView)];
      if (targetView) onOpenView?.(targetView);
    } else {
      emit({ source_ref: button.dataset.sourceRef });
    }
  }

  function keydown(rawEvent: unknown): void {
    const event = rawEvent as EventLike;
    if (
      event.target?.matches?.('.trajectory-node, .research-node')
      && event.key
      && (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault?.();
      click(rawEvent);
    }
  }

  container.addEventListener('click', click);
  container.addEventListener('keydown', keydown);
  render();
  if (initialViewId && !snapshot) {
    void load();
  }

  return () => {
    alive = false;
    ++generation;
    container.removeEventListener('click', click);
    container.removeEventListener('keydown', keydown);
  };
}
