import { escape, renderSources, renderFields as sharedFields } from './presentation.ts';
import type {
  TrajectoryEdge,
  TrajectoryNode,
  TrajectoryRenderOptions,
  TrajectorySnapshot,
} from './types.ts';

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const empty = (text: string): string => `<p class="workbench-empty">${escape(text)}</p>`;

export const DEFAULT_TRAJECTORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  proposed: '已提出',
  planned: '已计划',
  active: '进行中',
  completed: '已完成',
  execution_failed: '执行失败',
  not_assessed: '尚未评估',
  supported: '证据支持',
  does_not_support: '证据不支持',
  inconclusive: '证据尚不确定',
  design_invalid: '设计无效',
  refined: '已修订',
  superseded: '已被替代',
  continued: '继续',
  narrowed: '缩小范围',
  pivoted: '转向',
  stopped: '已停止',
  human_review_required: '需要人工评审',
  produced: '已产出',
  tests: '检验',
  supports: '支持',
  revises: '修订',
  supersedes: '替代',
  routes_to: '转向',
  requires: '依赖',
  produces: '产出',
  pending: '待处理',
  running: '运行中',
  blocked: '已阻塞',
  waiting: '等待',
  failed: '失败',
  queued: '排队中',
  skipped: '已跳过',
  unknown: '未知',
  artifact: '产物',
  decision: '决定',
  route: '路线',
  human_gate: '待人评审',
  title: '标题',
  summary: '摘要',
  label: '名称',
  status: '状态',
  reason: '原因',
  action_type: '动作类型',
  owner: '负责人',
  message: '说明',
  conditions: '条件',
  business_status: '业务状态',
  stage_id: '当前阶段',
  stage_status: '阶段状态',
  review_refs: '评审引用',
  source_refs: '来源',
  evidence_refs: '证据引用',
  interpretation: '解释',
  limitations: '局限',
  next_action: '下一步',
});

const DEFAULT_EVIDENCE_NODE_KINDS = ['artifact', 'finding', 'test', 'evidence'];
const DEFAULT_DECISION_NODE_KINDS = ['human_gate', 'decision'];

function resolveLabels(options?: TrajectoryRenderOptions): Readonly<Record<string, string>> {
  return options?.labels
    ? { ...DEFAULT_TRAJECTORY_LABELS, ...options.labels }
    : DEFAULT_TRAJECTORY_LABELS;
}

export function renderTrajectoryFields(
  value: unknown,
  depth = 0,
  labels: Readonly<Record<string, string>> = DEFAULT_TRAJECTORY_LABELS,
): string {
  return sharedFields(value, depth, labels);
}

export function parseTrajectorySnapshot(
  value: unknown,
  workItemId?: string,
  options: TrajectoryRenderOptions = {},
): TrajectorySnapshot {
  const snapshot = obj(value);
  const declaredWorkItemId = snapshot.work_item_id || snapshot.study_id;
  if (workItemId && declaredWorkItemId && declaredWorkItemId !== workItemId) {
    throw new Error('详情数据与当前任务不匹配');
  }
  if (options.expected_surface_kind && snapshot.surface_kind !== options.expected_surface_kind) {
    throw new Error('视图格式与声明不匹配');
  }
  if (
    !Number.isSafeInteger(snapshot.revision)
    || (snapshot.revision as number) < 1
    || !snapshot.summary
    || !Array.isArray(snapshot.nodes)
    || !Array.isArray(snapshot.edges)
  ) {
    throw new Error('结构视图数据不完整');
  }

  const ids = new Set<string>();
  for (const rawNode of snapshot.nodes) {
    const node = rawNode as Partial<TrajectoryNode> | null | undefined;
    if (
      typeof node?.id !== 'string'
      || !node.id
      || typeof node.label !== 'string'
      || !node.label
      || ids.has(node.id)
      || !Array.isArray(node.source_refs)
    ) {
      throw new Error('结构节点无效');
    }
    ids.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const rawEdge of snapshot.edges) {
    const edge = rawEdge as Partial<TrajectoryEdge> | null | undefined;
    if (
      typeof edge?.id !== 'string'
      || !edge.id
      || edgeIds.has(edge.id)
      || !edge.source
      || !ids.has(edge.source)
      || !edge.target
      || !ids.has(edge.target)
      || !Array.isArray(edge.source_refs)
    ) {
      throw new Error('节点关系无效');
    }
    edgeIds.add(edge.id);
  }

  return snapshot as unknown as TrajectorySnapshot;
}

export function parseContributionTrajectory(
  result: { readonly identity?: unknown; readonly trajectory?: unknown } | null | undefined,
  selectedIdentity: unknown,
  options: TrajectoryRenderOptions = {},
): TrajectorySnapshot {
  const expected = obj(selectedIdentity);
  const actual = obj(result?.identity);
  const actualDomainWorkItemId =
    actual.domain_work_item_id || actual.work_item_id || actual.study_id;
  if (
    expected.identity_state !== 'resolved'
    || actual.identity_state !== 'resolved'
    || ['agent_id', 'domain_id', 'work_item_id'].some(
      (key) => !expected[key] || expected[key] !== actual[key],
    )
    || !expected.domain_work_item_id
    || expected.domain_work_item_id !== actualDomainWorkItemId
  ) {
    throw new Error('任务视图与所选任务不匹配');
  }
  return parseTrajectorySnapshot(
    result?.trajectory,
    String(expected.domain_work_item_id),
    options,
  );
}

function renderGraphSvg(
  snapshot: TrajectorySnapshot,
  selectedId: string | undefined,
  labels: Readonly<Record<string, string>>,
): string {
  const label = (key: string): string => labels[key] || String(key).replaceAll('_', ' ');
  const width = 760;
  const cellWidth = 250;
  const rowHeight = 110;
  const positions = new Map(
    snapshot.nodes.map((node, index) => [
      node.id,
      { x: 10 + (index % 3) * cellWidth, y: 12 + Math.floor(index / 3) * rowHeight },
    ]),
  );
  const height = Math.max(120, Math.ceil(snapshot.nodes.length / 3) * rowHeight + 20);
  return `<svg class="trajectory-graph research-graph" viewBox="0 0 ${width} ${height}" role="group" aria-label="任务路径关系图">
    <defs><marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
    ${snapshot.edges
      .map((edge) => {
        const a = positions.get(edge.source) ?? { x: 0, y: 0 };
        const b = positions.get(edge.target) ?? { x: 0, y: 0 };
        return `<path class="trajectory-edge research-edge" data-kind="${escape(edge.kind)}" d="M${a.x + 110},${a.y + 66} C${a.x + 110},${a.y + 100} ${b.x + 110},${b.y - 30} ${b.x + 110},${b.y}" marker-end="url(#route-arrow)"><title>${escape(edge.label || label(edge.kind))}</title></path>`;
      })
      .join('')}
    ${snapshot.nodes
      .map((node) => {
        const p = positions.get(node.id) ?? { x: 0, y: 0 };
        return `<g class="trajectory-node research-node" role="button" tabindex="0" aria-label="${escape(node.label)}" aria-pressed="${node.id === selectedId}" data-node-id="${escape(node.id)}" transform="translate(${p.x} ${p.y})"><title>${escape(node.label)}</title><rect width="220" height="66" rx="10"/><text x="10" y="22">${escape(node.label.length > 15 ? `${node.label.slice(0, 15)}…` : node.label)}</text><text class="node-status" x="10" y="47">${escape(label(node.kind))} · ${escape(label(node.status))}</text></g>`;
      })
      .join('')}</svg>`;
}

export function renderTrajectory(
  snapshot: TrajectorySnapshot,
  selectedId?: string,
  section = 'trajectory',
  options: TrajectoryRenderOptions = {},
): string {
  const labels = resolveLabels(options);
  const label = (key: string): string => labels[key] || String(key).replaceAll('_', ' ');
  const selected = snapshot.nodes.find((node) => node.id === selectedId) || snapshot.nodes[0];
  const evidenceKinds = new Set(options.evidence_node_kinds || DEFAULT_EVIDENCE_NODE_KINDS);
  const decisionKinds = new Set(options.decision_node_kinds || DEFAULT_DECISION_NODE_KINDS);

  if (section === 'evidence') {
    const evidence = snapshot.nodes.filter((node) => evidenceKinds.has(node.kind));
    return `<section class="card"><h2>证据与产物</h2>${
      evidence
        .map(
          (node) =>
            `<article><button class="dsh-button action" data-node-id="${escape(node.id)}">${escape(node.label)}</button><p>${escape(node.summary)}</p>${renderSources(node.source_refs)}</article>`,
        )
        .join('') || empty('尚未提供证据节点')
    }${renderSources(snapshot.source_refs)}</section>`;
  }

  if (section === 'decisions') {
    const gates = snapshot.nodes.filter((node) => decisionKinds.has(node.kind));
    return `<section class="card"><h2>待人决定</h2>${
      gates
        .map(
          (node) =>
            `<article><h3>${escape(node.label)}</h3><span class="badge">${escape(label(node.status))}</span><p>${escape(node.summary)}</p>${renderTrajectoryFields(node.details, 0, labels)}${renderSources(node.source_refs)}</article>`,
        )
        .join('') || empty('未声明人工评审节点')
    }${renderTrajectoryFields(snapshot.conditions || [], 0, labels)}</section>`;
  }

  const summaryObj = obj(snapshot.summary);
  const summaryKeys =
    Array.isArray(options.summary_keys) && options.summary_keys.length
      ? options.summary_keys
      : Object.keys(summaryObj).filter((key) => typeof summaryObj[key] === 'string');
  const title = options.title || '任务路径';
  const relations = snapshot.edges.filter(
    (edge) => edge.source === selected?.id || edge.target === selected?.id,
  );

  return `<section class="card trajectory-summary research-summary"><h2>${escape(title)}</h2>${summaryKeys
    .map(
      (key) =>
        `<div><h3>${escape(label(key))}</h3><p>${escape(summaryObj[key] || '尚未提供')}</p></div>`,
    )
    .join('')}<p>当前分支：${escape(snapshot.active_branch?.label || '尚未提供')}</p></section>
    ${renderGraphSvg(snapshot, selected?.id, labels)}
    <nav class="node-list" aria-label="路径节点">${snapshot.nodes
      .map(
        (node) =>
          `<button class="dsh-button action" data-node-id="${escape(node.id)}" aria-pressed="${node.id === selected?.id}">${escape(node.label)}</button>`,
      )
      .join('')}</nav>
    ${
      selected
        ? `<article class="card node-detail"><h2>${escape(selected.label)}</h2><p><span class="badge">${escape(label(selected.kind))} · ${escape(label(selected.status))}</span> ${escape(selected.occurred_at || '')}</p><p>${escape(selected.summary)}</p>${renderTrajectoryFields(selected.details, 0, labels)}${renderSources(selected.source_refs)}<h3>相关证据与路线</h3>${
            relations
              .map((edge) => {
                const otherId = edge.source === selected.id ? edge.target : edge.source;
                const other = snapshot.nodes.find((node) => node.id === otherId);
                const sourceLabel =
                  snapshot.nodes.find((node) => node.id === edge.source)?.label ?? edge.source;
                const targetLabel =
                  snapshot.nodes.find((node) => node.id === edge.target)?.label ?? edge.target;
                return `<div class="trajectory-relation research-relation" data-kind="${escape(edge.kind)}"><span>${escape(sourceLabel)} → ${escape(label(edge.kind))} → ${escape(targetLabel)}</span><p>${escape(edge.label)}</p>${other ? `<button class="dsh-button action" data-node-id="${escape(other.id)}">查看 ${escape(other.label)}</button>` : ''}${renderSources(edge.source_refs)}</div>`;
              })
              .join('') || empty('尚未声明相关关系')
          }</article>`
        : ''
    }`;
}
