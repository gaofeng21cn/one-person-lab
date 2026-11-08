import { escape, renderSources, renderFields as sharedFields, renderProgress, renderArtifacts, rawRecord } from './presentation.js';
export { escape, renderSources, renderProgress };
// Host-neutral projections. Owners supply scientific judgments and receipts.
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const labels = {
  hypothesis: '科研假设', test: '验证', finding: '发现', decision: '研究决定', route: '研究路线', artifact: '产物', human_gate: '待人评审',
  proposed: '已提出', planned: '已计划', active: '进行中', completed: '已完成', execution_failed: '执行失败', not_assessed: '尚未评估',
  supported: '证据支持', does_not_support: '证据不支持', inconclusive: '证据尚不确定', design_invalid: '设计无效', refined: '已修订',
  superseded: '已被替代', continued: '继续', narrowed: '缩小范围', pivoted: '转向', stopped: '已停止', human_review_required: '需要人工评审', produced: '已产出',
  tests: '检验', supports: '支持', revises: '修订', supersedes: '替代', routes_to: '转向', requires: '依赖', produces: '产出',
  pending: '待处理', running: '运行中', blocked: '已阻塞', waiting: '等待', failed: '失败', queued: '排队中', skipped: '已跳过', unknown: '未知',
  primary_hypothesis: '主要假设', latest_finding: '最新发现', current_judgment: '当前科学判断', next_research_step: '下一步研究',
  title: '标题', research_question: '研究问题', current_hypothesis: '当前假设', validation_method: '验证方法', main_findings: '主要发现', route_adjustment: '路线调整', sources_and_basis: '来源与依据',
  rationale: '提出依据', evidence_judgment: '证据判断', supporting_evidence: '支持证据', opposing_evidence: '反对证据',
  failure_route: '失败路线', review_refs: '评审引用', source_refs: '来源', evidence_refs: '证据引用', medical_question: '医学问题',
  interpretation: '解释', limitations: '局限', next_action: '下一步', summary: '摘要', label: '名称', status: '状态', reason: '原因',
  action_type: '动作类型', owner: '负责人', message: '说明', conditions: '条件', business_status: '业务状态', stage_id: '当前阶段', stage_status: '阶段状态',
};
const label = key => labels[key] || key;
const empty = text => `<p class="workbench-empty">${escape(text)}</p>`;

export const renderFields = (value, depth = 0) => sharedFields(value, depth, labels);

export function parseResearchSnapshot(value, studyId) {
  const snapshot = obj(value);
  if (snapshot.surface_kind !== 'mas_research_trajectory_snapshot' || snapshot.version !== 'mas-research-trajectory-snapshot.v2') throw new Error('研究路径格式不兼容');
  if (!snapshot.study_id || snapshot.study_id !== studyId || obj(snapshot.study_ref).ref !== `mas-study:${studyId}`) throw new Error('研究路径与当前任务不匹配');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 || !snapshot.summary || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new Error('研究路径数据不完整');
  const ids = new Set();
  for (const node of snapshot.nodes) {
    if (typeof node?.id !== 'string' || !node.id || typeof node.label !== 'string' || !node.label || ids.has(node.id) || !Array.isArray(node.source_refs)) throw new Error('研究节点无效');
    ids.add(node.id);
  }
  const edges = new Set();
  for (const edge of snapshot.edges) {
    if (typeof edge?.id !== 'string' || !edge.id || edges.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target) || !Array.isArray(edge.source_refs)) throw new Error('研究关系无效');
    edges.add(edge.id);
  }
  return snapshot;
}

export function parseContributionResearch(result, selectedIdentity) {
  const expected = obj(selectedIdentity), actual = obj(result.identity);
  if (expected.identity_state !== 'resolved' || actual.identity_state !== 'resolved'
    || ['agent_id', 'domain_id', 'work_item_id'].some(key => !expected[key] || expected[key] !== actual[key])
    || !expected.domain_work_item_id || expected.domain_work_item_id !== actual.study_id) throw new Error('研究路径与所选任务不匹配');
  return parseResearchSnapshot(result.trajectory, expected.domain_work_item_id);
}

export function acceptDomainRead(readback, item, descriptor, previous) {
  const r = obj(readback);
  if (r.schema_version !== 'opl_domain_detail_view.v1' || r.surface_kind !== 'opl_domain_detail_view'
    || r.item_id !== item.item_id || r.view_id !== descriptor.view_id || r.view_kind !== descriptor.view_kind
    || !Number.isSafeInteger(r.revision) || r.revision < 0 || typeof r.not_modified !== 'boolean') throw new Error('详情与当前任务或视图不匹配');
  if (r.availability !== 'available') throw new Error('此视图暂不可用');
  const renderer = Object.hasOwn(domainViewRenderers, descriptor.view_kind) ? domainViewRenderers[descriptor.view_kind] : undefined;
  if (!renderer || !renderer.schema_compatibility.includes(r.payload_schema_ref)
    || (descriptor.schema_ref && descriptor.schema_ref !== r.payload_schema_ref)
    || (descriptor.schema_version && descriptor.schema_version !== r.payload_schema)) throw new Error('此视图格式尚不受支持');
  if (previous && r.revision < previous.revision) throw new Error('详情版本已回退');
  if (r.not_modified) {
    if (!previous || r.revision !== previous.revision || r.payload != null) throw new Error('缺少对应的有效详情');
    return previous;
  }
  const snapshot = renderer.parse(r.payload, item.identity.domain_work_item_id);
  if (snapshot.revision !== r.revision) throw new Error('详情版本与数据不匹配');
  return { revision: r.revision, snapshot };
}

function graph(snapshot, selectedId) {
  const width = 760, cellWidth = 250, rowHeight = 110;
  const positions = new Map(snapshot.nodes.map((node, i) => [node.id, { x: 10 + (i % 3) * cellWidth, y: 12 + Math.floor(i / 3) * rowHeight }]));
  const height = Math.max(120, Math.ceil(snapshot.nodes.length / 3) * rowHeight + 20);
  return `<svg class="research-graph" viewBox="0 0 ${width} ${height}" role="group" aria-label="研究节点关系图">
    <defs><marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
    ${snapshot.edges.map(edge => { const a = positions.get(edge.source), b = positions.get(edge.target); return `<path class="research-edge" data-kind="${escape(edge.kind)}" d="M${a.x + 110},${a.y + 66} C${a.x + 110},${a.y + 100} ${b.x + 110},${b.y - 30} ${b.x + 110},${b.y}" marker-end="url(#route-arrow)"><title>${escape(edge.label || label(edge.kind))}</title></path>`; }).join('')}
    ${snapshot.nodes.map(node => { const p = positions.get(node.id); return `<g class="research-node" role="button" tabindex="0" aria-label="${escape(node.label)}" aria-pressed="${node.id === selectedId}" data-node-id="${escape(node.id)}" transform="translate(${p.x} ${p.y})"><title>${escape(node.label)}</title><rect width="220" height="66" rx="10"/><text x="10" y="22">${escape(node.label.length > 15 ? node.label.slice(0, 15) + '…' : node.label)}</text><text class="node-status" x="10" y="47">${escape(label(node.kind))} · ${escape(label(node.status))}</text></g>`; }).join('')}</svg>`;
}

export function renderResearch(snapshot, selectedId, section = 'research') {
  const selected = snapshot.nodes.find(node => node.id === selectedId) || snapshot.nodes[0];
  const summaries = ['primary_hypothesis', 'latest_finding', 'current_judgment', 'next_research_step'];
  if (section === 'evidence') {
    const evidence = snapshot.nodes.filter(node => ['artifact', 'finding', 'test'].includes(node.kind));
    return `<section class="card"><h2>证据与产物</h2>${evidence.map(node => `<article><button class="action" data-node-id="${escape(node.id)}">${escape(node.label)}</button><p>${escape(node.summary)}</p>${renderSources(node.source_refs)}</article>`).join('') || empty('尚未提供证据节点')}${renderSources(snapshot.source_refs)}</section>`;
  }
  if (section === 'decisions') {
    const gates = snapshot.nodes.filter(node => node.kind === 'human_gate');
    return `<section class="card"><h2>待人决定</h2>${gates.map(node => `<article><h3>${escape(node.label)}</h3><span class="badge">${escape(label(node.status))}</span><p>${escape(node.summary)}</p>${renderFields(node.details)}${renderSources(node.source_refs)}</article>`).join('') || empty('未声明人工评审节点')}${renderFields(snapshot.conditions || [])}</section>`;
  }
  const relations = snapshot.edges.filter(edge => edge.source === selected?.id || edge.target === selected?.id);
  return `<section class="card research-summary"><h2>研究路径</h2>${summaries.map(key => `<div><h3>${escape(label(key))}</h3><p>${escape(snapshot.summary[key] || '尚未提供')}</p></div>`).join('')}<p>当前分支：${escape(snapshot.active_branch?.label || '尚未提供')}</p></section>
    ${graph(snapshot, selected?.id)}
    <nav class="node-list" aria-label="研究节点">${snapshot.nodes.map(node => `<button class="action" data-node-id="${escape(node.id)}" aria-pressed="${node.id === selected?.id}">${escape(node.label)}</button>`).join('')}</nav>
    ${selected ? `<article class="card node-detail"><h2>${escape(selected.label)}</h2><p><span class="badge">${escape(label(selected.kind))} · ${escape(label(selected.status))}</span> ${escape(selected.occurred_at || '')}</p><p>${escape(selected.summary)}</p>${renderFields(selected.details)}${renderSources(selected.source_refs)}<h3>相关证据与路线</h3>${relations.map(edge => {
      const other = snapshot.nodes.find(node => node.id === (edge.source === selected.id ? edge.target : edge.source));
      return `<div class="research-relation" data-kind="${escape(edge.kind)}"><span>${escape(snapshot.nodes.find(node => node.id === edge.source)?.label)} → ${escape(label(edge.kind))} → ${escape(snapshot.nodes.find(node => node.id === edge.target)?.label)}</span><p>${escape(edge.label)}</p><button class="action" data-node-id="${escape(other.id)}">查看 ${escape(other.label)}</button>${renderSources(edge.source_refs)}</div>`;
    }).join('') || empty('尚未声明相关关系')}</article>` : ''}`;
}

export const domainViewRenderers = Object.freeze({
  'research-roadmap': {
    view_kind: 'research-roadmap', owner_package_id: 'mas', renderer_id: 'research-roadmap',
    schema_compatibility: ['contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json'],
    parse: parseResearchSnapshot, component: renderResearch,
  },
});

export function mountTaskWorkbench({ container, item, snapshot: initialSnapshot, initialViewId, read, onContext, relatedViews = [], onOpenView, ownerDetails, actions = [], onAction, onOpenLink }) {
  const descriptors = list(item.domain_detail_views);
  const cache = new Map();
  let section = initialViewId ? 'research' : 'progress';
  let viewId = initialViewId || descriptors[0]?.view_id;
  let snapshot = initialSnapshot;
  let selectedId = snapshot?.current_focus?.node_id;
  let error = '', busy = false, alive = true, generation = 0;
  const emit = extra => onContext({ item_id: item.item_id, work_item_identity: item.identity, section, view_id: viewId,
    node: snapshot?.nodes.find(node => node.id === selectedId) || null, ...extra });
  function render() {
    if (!alive) return;
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? ['data-section', 'data-domain-view', 'data-refresh-domain', 'data-node-id'].find(key => focused.hasAttribute(key)) : null;
    const focusValue = focusKey ? focused.getAttribute(focusKey) : null;
    const hasResearch = descriptors.length || snapshot;
    const runtimeActions = actions.length ? `<div class="detail-actions" aria-label="当前可用操作">${actions.map((action, index) => `<button type="button" class="action" data-runtime-action="${index}">${escape(action.label_i18n?.['zh-CN'] || action.label_i18n?.['en-US'] || action.command_id)}${action.confirmation_required ? '…' : ''}</button>`).join('')}</div>` : '';
    const tabs = [['progress', '执行进度'], ...(hasResearch ? [['research', '研究路径']] : []), ['evidence', '证据与产物'], ['decisions', '待人决定']];
    container.innerHTML = `<div class="task-workbench"><h2>${escape(item.identity?.work_item_display_name || item.identity?.work_item_id || '任务详情')}</h2><nav class="workbench-tabs" aria-label="任务详情">${tabs.map(([id, title]) => `<button class="action" data-section="${id}" aria-current="${id === section ? 'page' : 'false'}">${title}</button>`).join('')}</nav>
      ${hasResearch && section !== 'progress' && descriptors.length ? `<div class="toolbar-row">${descriptors.map(view => `<button class="action" data-domain-view="${escape(view.view_id)}" aria-pressed="${viewId === view.view_id}">${escape(view.title || view.view_id)}</button>`).join('')}<button class="action" data-refresh-domain ${busy ? 'disabled' : ''}>刷新视图</button></div>` : ''}
      ${item.runtime_actions_unavailable ? '<p role="status">操作暂时无法读取，可刷新任务后重试。</p>' : ''}${busy ? '<p role="status">正在读取视图…</p>' : ''}${error ? `<p role="alert">${escape(error)}${snapshot ? '；保留上次有效视图' : ''}</p>` : ''}
      ${section === 'progress' ? `${runtimeActions}${renderProgress(item, ownerDetails)}${rawRecord(item)}` : section === 'evidence' ? `${snapshot ? renderResearch(snapshot, selectedId, section) : ''}${item.artifacts?.length ? renderArtifacts(item.artifacts) : ''}<section class="card"><h3>任务来源</h3>${renderSources(item.source_refs)}</section>`
        : section === 'decisions' ? `<section class="card"><h3>当前待办</h3>${ownerDetails ? renderFields(ownerDetails.work?.pending || []) : item.attention?.kind === 'user' || item.action?.owner_kind === 'user' ? `<p>${escape(item.action?.title)}</p><p>${escape(item.action?.summary)}</p>${item.attention?.issue ? `<p>${escape(item.attention.issue)}</p>` : ''}` : empty('当前没有投影到此处的人工待办')}</section>${snapshot ? renderResearch(snapshot, selectedId, section) : ''}`
          : snapshot ? renderResearch(snapshot, selectedId) : empty('此任务的研究路径暂不可用')}
      ${relatedViews.length ? `<nav class="detail-actions" aria-label="任务能力">${relatedViews.map((view, index) => `<button class="action" data-related-view="${index}">${escape(view.title_i18n?.['zh-CN'] || view.title_i18n?.['en-US'] || view.view_id)}</button>`).join('')}</nav>` : ''}
      </div>`;
    if (focusKey) [...container.querySelectorAll(`[${focusKey}]`)].find(element => element.getAttribute(focusKey) === focusValue)?.focus({ preventScroll: true });
  }
  async function load() {
    const descriptor = descriptors.find(view => view.view_id === viewId);
    if (!descriptor || !read) { error = '此视图暂不可用'; render(); return; }
    const ticket = ++generation;
    busy = true; error = ''; render();
    try {
      const previous = cache.get(viewId);
      const response = await read({ item_id: item.item_id, view_id: viewId, ...(previous ? { if_revision: previous.revision } : {}) });
      if (!alive || ticket !== generation) return;
      const accepted = acceptDomainRead(response, item, descriptor, previous);
      cache.set(viewId, accepted); snapshot = accepted.snapshot;
      if (!snapshot.nodes.some(node => node.id === selectedId)) selectedId = snapshot.current_focus?.node_id || snapshot.nodes[0]?.id;
    } catch (reason) { if (alive && ticket === generation) error = reason.message || '此视图暂不可用'; }
    finally { if (alive && ticket === generation) { busy = false; render(); emit({}); } }
  }
  function click(event) {
    const button = event.target.closest('[data-section],[data-domain-view],[data-refresh-domain],[data-node-id],[data-source-ref],[data-related-view],[data-runtime-action],[data-open-link]');
    if (!button || !container.contains(button)) return;
    if (button.hasAttribute('data-section')) {
      section = button.dataset.section; render(); emit({});
      if (section !== 'progress' && !snapshot && descriptors.length && !busy) void load();
    } else if (button.hasAttribute('data-domain-view')) {
      ++generation; viewId = button.dataset.domainView; snapshot = cache.get(viewId)?.snapshot; selectedId = undefined;
      render(); void load();
    } else if (button.hasAttribute('data-refresh-domain')) void load();
    else if (button.hasAttribute('data-node-id')) {
      selectedId = button.dataset.nodeId; section = 'research'; render(); emit({});
      container.querySelector('.node-detail')?.scrollIntoView({ block: 'nearest' });
    } else if (button.hasAttribute('data-runtime-action')) onAction?.(actions[Number(button.dataset.runtimeAction)]);
    else if (button.hasAttribute('data-open-link')) onOpenLink?.(button.dataset.openLink);
    else if (button.hasAttribute('data-related-view')) onOpenView?.(relatedViews[Number(button.dataset.relatedView)]);
    else emit({ source_ref: button.dataset.sourceRef });
  }
  function keydown(event) { if (event.target.matches('.research-node') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); click(event); } }
  container.addEventListener('click', click); container.addEventListener('keydown', keydown);
  render();
  if (initialViewId && !snapshot) void load();
  return () => { alive = false; ++generation; container.removeEventListener('click', click); container.removeEventListener('keydown', keydown); };
}
