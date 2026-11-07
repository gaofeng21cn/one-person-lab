import { App } from '@modelcontextprotocol/ext-apps';

const READ_TOOL = 'opl_app_contribution_read';
const EXECUTE_TOOL = 'opl_app_contribution_execute';
const $ = (id) => document.getElementById(id);
const app = new App({ name: 'opl-apps', version: '1.0.0' }, { tools: { listChanged: false } }, { strict: true });

function stored(name, fallback) {
  try { return JSON.parse(sessionStorage.getItem(name) ?? 'null') ?? fallback; } catch { return fallback; }
}

function remember(name, value) {
  try { sessionStorage.setItem(name, JSON.stringify(value)); } catch { /* Opaque sandboxes have no storage. */ }
}

const state = {
  catalog: null,
  selectedKey: stored('opl-apps-selected', ''),
  selected: null,
  result: null,
  selectedWorkItemIdentity: stored('opl-apps-selected-work-item', null),
  selectedWorkspace: stored('opl-apps-selected-workspace', null),
  query: '',
  itemId: '',
  executing: false,
  focusPackageId: '',
  focusInput: {},
};
let readGeneration = 0;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function localized(value, fallback = '') {
  const labels = record(value) || {};
  const locale = navigator.language || 'zh-CN';
  return labels[locale]
    || labels[locale.split('-')[0]]
    || labels['zh-CN']
    || labels.en
    || labels['en-US']
    || Object.values(labels).find((entry) => typeof entry === 'string' && entry.trim())
    || fallback;
}

function key(view) {
  return `${view.package_id}:${view.view_id}`;
}

function notice(text, error = false) {
  $('notice').textContent = text;
  $('notice').className = `notice${error ? ' error' : ''}`;
  $('notice').hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('notice').hidden = true; }, error ? 16000 : 5000);
}

async function run(action, onError) {
  try {
    return await action();
  } catch (error) {
    onError?.(error);
    notice(error?.message || '操作未完成，请先核对当前状态', true);
  }
}

async function callTool(name, args) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(result.structuredContent?.error?.message || result.content?.find((part) => part.type === 'text')?.text || '操作未完成');
  }
  return result.structuredContent || {};
}

function extractEnvelope(payload) {
  const root = record(payload) || {};
  return record(root.opl_app_contribution) || record(root.opl_app_contribution_preflight) || root;
}

function ownerResult(envelope) {
  const response = record(envelope?.response);
  return record(response?.result) || response || envelope?.result || envelope;
}

function collectionFrom(payload) {
  if (!record(payload)) {
    return {
      envelope: null,
      owner: null,
      root: {},
      data: {},
      items: [],
      itemsPresent: false,
      commandInputs: {},
      inputSchema: null,
      inputDefaults: {},
      state: 'unavailable',
      reason: '',
      pagination: null,
    };
  }
  const envelope = extractEnvelope(payload);
  const response = record(envelope?.response);
  const owner = ownerResult(envelope);
  const root = record(owner?.result) || owner;
  const data = record(root?.data) || root;
  const itemsPresent = Array.isArray(data?.items);
  const items = itemsPresent ? data.items.filter(record) : [];
  const commandInputs = record(data?.command_inputs) || record(root?.command_inputs) || {};
  return {
    envelope,
    owner,
    root,
    data,
    items,
    itemsPresent,
    commandInputs,
    inputSchema: record(root?.input_schema)
      || record(response?.input_schema)
      || record(envelope?.input_schema),
    inputDefaults: record(root?.input_defaults) || {},
    state: typeof root?.state === 'string' ? root.state : items.length || !root?.reason ? 'ready' : 'unavailable',
    reason: String(root?.reason || ''),
    pagination: record(data?.pagination),
  };
}

function currentViewInput(view) {
  const focused = state.focusPackageId === view.package_id ? state.focusInput : {};
  if (focused.workspace_path || focused.work_item_identity) return { ...focused };
  const collection = collectionFrom(state.result);
  const items = collection.items;
  const selected = items.find((item, index) => itemIdentity(item, index) === state.itemId) || items[0];
  if (selected?.work_item_identity) rememberWorkspaceSelection(selected);
  const selectedIdentity = selected?.work_item_identity || state.selectedWorkItemIdentity;
  const selectedWorkspace = selected?.workspace_path
    ? { workspace_path: selected.workspace_path, work_item_root: selected.work_item_root }
    : state.selectedWorkspace;
  return {
    ...(view.scope === 'work_item' && selectedIdentity ? { work_item_identity: selectedIdentity } : {}),
    ...(selectedWorkspace?.workspace_path ? { workspace_path: selectedWorkspace.workspace_path } : {}),
    ...(selectedWorkspace?.work_item_root ? { work_item_root: selectedWorkspace.work_item_root } : {}),
    ...focused,
  };
}

function rememberWorkspaceSelection(item) {
  if (!item?.work_item_identity || !item?.workspace_path) return;
  state.selectedWorkItemIdentity = item.work_item_identity;
  state.selectedWorkspace = {
    workspace_path: item.workspace_path,
    work_item_root: item.work_item_root || null,
  };
  remember('opl-apps-selected-work-item', state.selectedWorkItemIdentity);
  remember('opl-apps-selected-workspace', state.selectedWorkspace);
}

function renderReadInputForm(collection) {
  const schema = record(collection.inputSchema);
  const fields = record(schema?.properties) || {};
  if (!Object.keys(fields).length) return '';
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const controls = Object.entries(fields).map(([name, raw]) => {
    const field = record(raw) || {};
    const title = String(field.title || name);
    const common = `data-read-field="${escape(name)}" ${required.has(name) ? 'required' : ''}`;
    if (field.type === 'boolean') {
      return `<label>${escape(title)}<input ${common} type="checkbox"></label>`;
    }
    if (field.type === 'integer' || field.type === 'number') {
      return `<label>${escape(title)}<input ${common} type="number" step="${field.type === 'integer' ? '1' : 'any'}"></label>`;
    }
    return `<label>${escape(title)}<input ${common} type="text"></label>`;
  }).join('');
  return `<form class="form-grid" id="read-input-form">${controls}
    <div><button class="action" type="submit">读取</button></div>
  </form>`;
}

function bindReadInputForm() {
  const form = $('read-input-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const view = state.selected;
    if (!view) return;
    const input = { ...currentViewInput(view) };
    for (const control of form.querySelectorAll('[data-read-field]')) {
      const name = control.dataset.readField;
      if (control.type === 'checkbox') input[name] = control.checked;
      else if (control.value !== '') {
        input[name] = control.type === 'number' ? Number(control.value) : control.value;
      }
    }
    state.focusPackageId = view.package_id;
    state.focusInput = input;
    await loadSelected();
  });
}

function itemIdentity(item, index) {
  return String(item.id ?? item.proposal_id ?? item.item_id ?? item.memory_id ?? item.entity_id ?? item.context_id ?? item.draft_ref ?? item.source_ref ?? index);
}

function itemTitle(item, index) {
  return localized(item.label_i18n || item.title_i18n, String(item.title ?? item.display_name ?? item.name ?? item.summary ?? itemIdentity(item, index)));
}

function itemSummary(item) {
  return localized(item.summary_i18n, String(item.summary ?? ''));
}

function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function statusLabel(value) {
  const labels = {
    pending: '待审核',
    approved: '已批准',
    rejected: '已拒绝',
    applied: '已应用',
    candidate: '候选',
    forgotten: '已忘记',
    active: '当前',
    ready: '就绪',
    unavailable: '不可用',
    attention: '需要处理',
    completed: '已完成',
    failed: '失败',
    blocked: '已阻塞',
  };
  return labels[value] || value || '';
}

function renderCatalog() {
  const views = state.catalog?.views || [];
  const query = state.query.trim().toLocaleLowerCase();
  const filtered = views.filter((view) => {
    if (!query) return true;
    return `${view.package_id} ${view.package_name} ${view.view_id} ${localized(view.title_i18n)} ${view.view_type}`
      .toLocaleLowerCase()
      .includes(query);
  });
  const groups = new Map();
  for (const view of filtered) {
    const packageId = view.package_id;
    if (!groups.has(packageId)) groups.set(packageId, { name: view.package_name, views: [] });
    groups.get(packageId).views.push(view);
  }
  $('views').innerHTML = [...groups.entries()].map(([packageId, group]) => `
    <section class="package-group" aria-label="${escape(group.name)}">
      <h2>${escape(group.name)}</h2>
      ${group.views.map((view) => `
        <button class="view-button" type="button" data-key="${escape(key(view))}" aria-current="${key(view) === state.selectedKey ? 'page' : 'false'}">
          ${escape(localized(view.title_i18n, view.view_id))}
        </button>
      `).join('')}
    </section>
  `).join('') || '<div class="empty">没有匹配的 OPL 视图</div>';
  for (const button of $('views').querySelectorAll('[data-key]')) {
    button.addEventListener('click', () => {
      state.selectedKey = button.dataset.key;
      remember('opl-apps-selected', state.selectedKey);
      state.itemId = '';
      renderCatalog();
      void loadSelected();
    });
  }
}

function renderHeader() {
  const view = state.selected;
  $('title').textContent = view ? localized(view.title_i18n, view.view_id) : 'OPL 能力';
  $('subtitle').textContent = view?.package_name || '';
  $('eyebrow').textContent = '协作审阅';
}

function renderMeta(value) {
  const entries = Object.entries({ ...(record(value) || {}), ...(record(value?.payload) || {}) })
    .filter(([name, item]) => item !== null && typeof item !== 'object'
      && !['id', 'schema', 'schema_version', 'surface_kind', 'package_id', 'agent_id', 'domain_id', 'project_id', 'work_item_id', 'item_id', 'workspace_path', 'work_item_root', 'access', 'authority', 'operation', 'read_ref'].includes(name))
    .slice(0, 24);
  if (!entries.length) return '';
  return `<dl class="meta-grid">${entries.map(([name, item]) => `
    <div class="meta-row">
      <dt>${escape(name.replaceAll('_', ' '))}</dt>
      <dd>${escape(typeof item === 'object' ? JSON.stringify(item) : valueText(item))}</dd>
    </div>
  `).join('')}</dl>`;
}

function renderReview(item) {
  const preview = record(item.preview) || item;
  const payload = record(item.payload) || {};
  const reviewTarget = record(item.review_target) || {};
  const before = preview.before;
  const after = typeof preview.after === 'string'
    ? preview.after
    : preview.body ?? payload.body ?? item.body_text ?? item.body ?? item.content ?? item.statement ?? item.summary;
  const target = preview.target
    ?? item.target_path
    ?? payload.target_path
    ?? reviewTarget.to
    ?? reviewTarget.source_ref
    ?? item.to
    ?? item.display_name
    ?? item.title
    ?? item.proposal_id
    ?? item.source_ref;
  const evidence = preview.evidence_refs ?? item.evidence_refs ?? item.source_refs;
  return `
    <div class="card detail">
      <h2>${escape(itemTitle(item, 0))}</h2>
      ${target ? `<p class="subtitle"><strong>目标：</strong>${escape(typeof target === 'object' ? JSON.stringify(target) : target)}</p>` : ''}
      ${before !== undefined && after !== undefined
        ? `<pre class="review" data-change="removed">${escape(valueText(before))}</pre><pre class="review" data-change="added">${escape(valueText(after))}</pre>`
        : after !== undefined
          ? `<pre class="review">${escape(valueText(after))}</pre>`
          : ''}
      ${evidence ? `<details><summary>来源证据</summary><pre class="json">${escape(valueText(evidence))}</pre></details>` : ''}
      ${renderMeta(item)}
      <details><summary>完整记录</summary><pre class="json">${escape(JSON.stringify(item, null, 2))}</pre></details>
    </div>
  `;
}

function commandForAction(view, action) {
  const actionRef = action?.action_ref;
  return view.commands.find((command) => command.action_ref === actionRef) || null;
}

function commandInputsFor(collection, command) {
  const spec = record(collection.commandInputs?.[command.action_ref]);
  return {
    schema: record(spec?.input_schema),
    defaults: { ...(record(spec?.defaults) || {}) },
  };
}

function renderActionButtons(view, collection, item = null) {
  const commands = [];
  if (item) {
    for (const action of Array.isArray(item.actions) ? item.actions : []) {
      const command = commandForAction(view, record(action));
      if (command) commands.push({ command, input: record(action.input) || {} });
    }
  }
  for (const command of view.commands) {
    if ((!item || command.confirmation_required)
      && !commands.some((entry) => entry.command.action_ref === command.action_ref)) {
      commands.push({ command, input: {} });
    }
  }
  const unique = new Map(commands.map((entry) => [`${entry.command.command_id}:${JSON.stringify(entry.input)}`, entry]));
  return [...unique.values()].map(({ command, input }) => `
    <button class="action" type="button"
      data-action-ref="${escape(command.action_ref)}"
      data-input="${escape(JSON.stringify(input))}"
      data-confirm="${command.confirmation_required ? 'true' : 'false'}">
      ${escape(localized(command.label_i18n, command.command_id))}${command.confirmation_required ? '…' : ''}
    </button>
  `).join('');
}

function renderCommandForm(view, collection, command, input) {
  const { schema, defaults } = commandInputsFor(collection, command);
  const fields = record(schema?.properties) || {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const values = { ...defaults, ...input };
  if (!Object.keys(fields).length) return null;
  const controls = Object.entries(fields).map(([name, raw]) => {
    const field = record(raw) || {};
    const value = values[name] ?? field.default ?? '';
    const common = `data-field="${escape(name)}" ${required.has(name) ? 'required' : ''}`;
    if (field.enum) {
      return `<label>${escape(name)}<select ${common}><option value="">请选择</option>${field.enum.map((option) => `<option value="${escape(option)}" ${option === value ? 'selected' : ''}>${escape(option)}</option>`).join('')}</select></label>`;
    }
    if (field.type === 'boolean') {
      return `<label>${escape(name)}<input ${common} type="checkbox" ${value === true ? 'checked' : ''}></label>`;
    }
    if (field.type === 'object' || field.type === 'array' || ['body', 'content', 'summary', 'statement'].includes(name)) {
      return `<label>${escape(name)}<textarea ${common}>${escape(typeof value === 'object' ? JSON.stringify(value, null, 2) : value)}</textarea></label>`;
    }
    return `<label>${escape(name)}<input ${common} type="${['number', 'integer'].includes(field.type) ? 'number' : 'text'}" value="${escape(value)}"></label>`;
  }).join('');
  return `
    <form class="form-grid" data-command-form="${escape(command.command_id)}" data-action-ref="${escape(command.action_ref)}" data-base-input="${escape(JSON.stringify(values))}">
      ${controls}
      <div><button class="action" type="submit">执行 ${escape(localized(command.label_i18n, command.command_id))}</button></div>
    </form>
  `;
}

function bindActionButtons(view, collection) {
  for (const button of $('body').querySelectorAll('[data-action-ref]')) {
    if (button.tagName === 'FORM') continue;
    button.addEventListener('click', async () => {
      const command = view.commands.find((entry) => entry.action_ref === button.dataset.actionRef);
      if (!command) return;
      const input = JSON.parse(button.dataset.input || '{}');
      const { schema } = commandInputsFor(collection, command);
      const fields = record(schema?.properties) || {};
      if (Object.keys(fields).length) {
        const form = renderCommandForm(view, collection, command, input);
        button.insertAdjacentHTML('afterend', form || '');
        bindForms(view);
        return;
      }
      await executeCommand(command, input);
    });
  }
}

function bindForms(view) {
  for (const form of $('body').querySelectorAll('[data-command-form]')) {
    if (form.dataset.bound === 'true') continue;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const command = view.commands.find((entry) => entry.action_ref === form.dataset.actionRef);
      if (!command) return;
      const input = JSON.parse(form.dataset.baseInput || '{}');
      for (const control of form.querySelectorAll('[data-field]')) {
        const name = control.dataset.field;
        if (control.type === 'checkbox') input[name] = control.checked;
        else if (control.value !== '') {
          if (control.tagName === 'TEXTAREA' && (control.value.trim().startsWith('{') || control.value.trim().startsWith('['))) {
            try { input[name] = JSON.parse(control.value); } catch { input[name] = control.value; }
          } else if (control.type === 'number') input[name] = Number(control.value);
          else input[name] = control.value;
        }
      }
      await executeCommand(command, input);
    });
  }
}

async function executeCommand(command, input) {
  const view = state.selected;
  if (!view || state.executing) return;
  const targetInput = { ...currentViewInput(view), ...input };
  state.executing = true;
  try {
    await run(async () => {
      if (command.confirmation_required && !await confirmCommand(command, view, targetInput)) return;
      $('status').textContent = '正在执行';
      const payload = await callTool(EXECUTE_TOOL, {
        package_id: view.package_id,
        ref: command.action_ref,
        input: targetInput,
        confirmed: command.confirmation_required,
      });
      const envelope = extractEnvelope(payload);
      if (envelope?.confirmation_required && !envelope?.response) throw new Error('该操作需要明确确认');
      if (envelope?.response?.ok === false) throw new Error(envelope.response.error?.message || '操作未完成');
      notice('操作已完成，正在刷新');
      await loadSelected();
    });
  } finally {
    state.executing = false;
  }
}

function confirmCommand(command, view, input) {
  const dialog = $('confirmation');
  $('confirmation-title').textContent = `确认执行“${localized(command.label_i18n, command.command_id)}”`;
  $('confirmation-target').textContent = JSON.stringify({ package: view.package_name, action: command.action_ref, input }, null, 2);
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function renderCollection(view, collection) {
  const items = collection.items;
  if (!items.length) {
    return `<div class="empty">${escape(localized(view.empty_state_i18n, collection.reason || '当前没有条目'))}</div>
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  }
  const selectedId = state.itemId || itemIdentity(items[0], 0);
  const current = items.find((item, index) => itemIdentity(item, index) === selectedId) || items[0];
  return `
    <div class="collection">
      <div class="items" role="list">
        ${items.map((item, index) => {
          const id = itemIdentity(item, index);
          return `<button class="item-button" type="button" data-item-id="${escape(id)}" aria-current="${id === itemIdentity(current, 0) ? 'true' : 'false'}">
            <strong>${escape(itemTitle(item, index))}</strong>
            ${itemSummary(item) ? `<small>${escape(itemSummary(item))}</small>` : ''}
            ${item.status ? `<small>${escape(statusLabel(item.status))}</small>` : ''}
          </button>`;
        }).join('')}
      </div>
      ${renderReview(current)}
    </div>
    <div class="detail-actions">${renderActionButtons(view, collection, current)}</div>
  `;
}

function renderResult() {
  const view = state.selected;
  if (!view) {
    $('body').innerHTML = '<div class="empty">请选择一个已安装 Package 的视图</div>';
    return;
  }
  if (!state.result) {
    $('body').innerHTML = '<div class="loading">正在读取数据…</div>';
    return;
  }
  const collection = collectionFrom(state.result);
  if (collection.state !== 'ready') {
    $('body').innerHTML = `<div class="empty">${escape(collection.reason || '当前视图不可用')}</div>
      ${collection.state === 'input_required' ? renderReadInputForm(collection) : ''}
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  } else if (collection.items.length) {
    $('body').innerHTML = renderCollection(view, collection);
  } else if (collection.itemsPresent) {
    $('body').innerHTML = `<div class="empty">${escape(localized(view.empty_state_i18n, '当前没有条目'))}</div>
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  } else {
    $('body').innerHTML = `<div class="card detail">${renderMeta(collection.root)}<details><summary>完整记录</summary><pre class="json">${escape(JSON.stringify(collection.root, null, 2))}</pre></details></div>
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  }
  for (const button of $('body').querySelectorAll('[data-item-id]')) {
    button.addEventListener('click', () => {
      state.itemId = button.dataset.itemId;
      const items = collectionFrom(state.result).items;
      const selected = items.find((item, index) => itemIdentity(item, index) === state.itemId);
      if (selected) rememberWorkspaceSelection(selected);
      renderResult();
      updateContext();
    });
  }
  bindActionButtons(view, collection);
  bindForms(view);
  bindReadInputForm();
}

async function loadSelected() {
  const generation = ++readGeneration;
  const previousItems = collectionFrom(state.result).items;
  const previous = previousItems.find((item, index) => itemIdentity(item, index) === state.itemId)
    || previousItems[0];
  if (previous) rememberWorkspaceSelection(previous);
  const view = (state.catalog?.views || []).find((entry) => key(entry) === state.selectedKey)
    || state.catalog?.views?.[0]
    || null;
  state.selected = view;
  state.selectedKey = view ? key(view) : '';
  renderHeader();
  renderCatalog();
  if (!view) {
    state.result = null;
    renderResult();
    return;
  }
  state.result = null;
  renderResult();
  await run(async () => {
    $('status').textContent = '正在读取';
    const result = await callTool(READ_TOOL, {
      package_id: view.package_id,
      ref: view.data_ref,
      input: currentViewInput(view),
    });
    if (generation !== readGeneration) return;
    state.result = result;
    $('status').textContent = '已连接';
    renderResult();
    updateContext();
  }, (error) => {
    if (generation !== readGeneration) return;
    state.result = { result: { state: 'unavailable', reason: error.message } };
    $('status').textContent = '读取失败';
    renderResult();
    updateContext();
  });
}

function updateContext() {
  const view = state.selected;
  if (!view) return;
  const collection = collectionFrom(state.result);
  const selected = collection.items.find((item, index) => itemIdentity(item, index) === state.itemId) || collection.items[0];
  const context = `正在查看 ${view.package_name} 的 ${localized(view.title_i18n, view.view_id)}`;
  app.updateModelContext({
    content: [{ type: 'text', text: context }],
    structuredContent: { package_id: view.package_id, view_id: view.view_id, selection: selected || collection.root },
  }).catch(() => {});
  document.body.setAttribute('data-llm', context);
}

app.ontoolresult = (params) => {
  const payload = record(params?.structuredContent);
  if (params?.isError) {
    ++readGeneration;
    $('status').textContent = '读取失败';
    $('body').textContent = payload?.error?.message || '当前视图读取失败，请重新选择目标';
    return;
  }
  const catalog = record(payload?.opl_mcp_app_catalog);
  if (catalog) {
    ++readGeneration;
    state.catalog = catalog;
    const focus = record(catalog.focus) || {};
    state.focusPackageId = focus.package_id || '';
    state.focusInput = record(focus.input) || {};
    state.selected = catalog.views.find((view) => view.package_id === focus.package_id && view.view_id === focus.view_id)
      || catalog.views[0] || null;
    state.selectedKey = state.selected ? key(state.selected) : '';
    state.itemId = '';
    state.result = payload.opl_app_contribution ? payload : null;
    renderHeader();
    renderCatalog();
    renderResult();
    $('status').textContent = state.selected ? '已连接' : '没有可用视图';
    if (state.result) updateContext();
    else if (state.selected) void loadSelected();
  }
};

$('search').addEventListener('input', (event) => {
  state.query = event.currentTarget.value;
  renderCatalog();
});
$('refresh').addEventListener('click', () => void loadSelected());
$('fullscreen').addEventListener('click', () => {
  const current = document.documentElement.dataset.displayMode;
  void app.requestDisplayMode({ mode: current === 'fullscreen' ? 'inline' : 'fullscreen' }).catch((error) => notice(error.message, true));
});

await app.connect();
const context = app.getHostContext?.() || {};
if (context.theme === 'dark') document.documentElement.dataset.theme = 'dark';
if (context.theme === 'light') document.documentElement.dataset.theme = 'light';
