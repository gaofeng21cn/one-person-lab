import { mountTaskWorkbench, parseContributionResearch } from './task-workbench.js';
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { renderOwnerView, renderFields, rawRecord, escape, statusLabel, presentationUrl } from './presentation.js';
import { renderInputFields, readInputFields } from './forms.js';
import { viewKey, focusedViewInput, ownerReadbackRequest, resolveViewHandoff } from './handoff.js';

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
  lastAction: null,
  selectedWorkItemIdentity: stored('opl-apps-selected-work-item', null),
  selectedWorkspace: stored('opl-apps-selected-workspace', null),
  selectedCanonicalItemId: stored('opl-apps-selected-item-id', ''),
  query: '',
  itemId: '',
  executing: false,
  focusKey: '',
  focusInput: {},
};
let readGeneration = 0;
let disposeWorkbench = () => {};

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function localized(value, fallback = '') {
  const labels = record(value) || {};
  const locale = document.documentElement.lang || navigator.language || 'zh-CN';
  return labels[locale]
    || labels[locale.split('-')[0]]
    || labels['zh-CN']
    || labels.en
    || labels['en-US']
    || Object.values(labels).find((entry) => typeof entry === 'string' && entry.trim())
    || fallback;
}

function key(view) {
  return viewKey(view);
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
  const focused = focusedViewInput(view, state.focusKey, state.focusInput);
  if (focused.workspace_path || focused.work_item_identity) return { ...focused };
  const collection = collectionFrom(state.result);
  const items = collection.state === 'ready' ? collection.items : [];
  const selected = items.find((item, index) => itemIdentity(item, index) === state.itemId) || items[0];
  if (selected?.work_item_identity) rememberWorkspaceSelection(selected);
  const selectedIdentity = selected?.work_item_identity
    || (collection.state === 'ready' ? state.selectedWorkItemIdentity : null);
  const selectedWorkspace = selected?.workspace_path
    ? { workspace_path: selected.workspace_path, work_item_root: selected.work_item_root }
    : collection.state === 'ready' ? state.selectedWorkspace : null;
  return {
    ...(['opl.runtime.v1#item', 'opl.runtime.v1#knowledge'].includes(view.data_ref) && state.selectedCanonicalItemId ? { item_id: state.selectedCanonicalItemId } : {}),
    ...(view.scope === 'work_item' && selectedIdentity ? { work_item_identity: selectedIdentity } : {}),
    ...(selectedWorkspace?.workspace_path ? { workspace_path: selectedWorkspace.workspace_path } : {}),
    ...(selectedWorkspace?.work_item_root ? { work_item_root: selectedWorkspace.work_item_root } : {}),
    ...focused,
  };
}

function rememberWorkspaceSelection(item) {
  if (!item?.work_item_identity || !item?.workspace_path) return;
  state.selectedCanonicalItemId = item.id;
  remember('opl-apps-selected-item-id', item.id);
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
  if (!Object.keys(record(schema?.properties) || {}).length) return '';
  const input = { ...collection.inputDefaults, ...currentViewInput(state.selected) };
  return `<form class="form-grid" id="read-input-form" data-base-input="${escape(JSON.stringify(input))}">${renderInputFields(schema, input, [], 'data-read-field')}
    <div><button class="dsh-button action" type="button" data-submit>读取</button></div></form>`;
}

function bindFormSubmit(form, submit) {
  form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) submit(event); });
  form.querySelector('[data-submit]')?.addEventListener('click', event => { if (form.reportValidity()) submit(event); });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') {
      event.preventDefault(); if (form.reportValidity()) submit(event);
    }
  });
}

function bindReadInputForm() {
  const form = $('read-input-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  bindFormSubmit(form, event => {
    event.preventDefault();
    void run(async () => {
      state.focusKey = key(state.selected);
      state.focusInput = readInputFields(form, JSON.parse(form.dataset.baseInput || '{}'), 'data-read-field');
      await loadSelected();
    });
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

function renderCatalog() {
  const views = state.catalog?.views || [];
  const products = state.catalog?.products || [];
  const query = state.query.trim().toLocaleLowerCase();
  const selectedPackage = views.find(view => key(view) === state.selectedKey)?.package_id || views[0]?.package_id;
  const filtered = views.filter((view) => {
    if (!query) return view.package_id === selectedPackage;
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
  const picker = $('view-select');
  const pickerGroups = new Map();
  for (const view of filtered) {
    if (!pickerGroups.has(view.package_id)) pickerGroups.set(view.package_id, { name: view.package_name, views: [] });
    pickerGroups.get(view.package_id).views.push(view);
  }
  picker.innerHTML = [...pickerGroups.values()].map(group => `
    <optgroup label="${escape(group.name)}">${group.views.map(view => `
      <option value="${escape(key(view))}" ${key(view) === state.selectedKey ? 'selected' : ''}>${escape(localized(view.title_i18n, view.view_id))}</option>
    `).join('')}</optgroup>
  `).join('') || '<option value="">没有匹配的功能</option>';
  picker.disabled = !filtered.length;
  function selectView(selectedKey) {
    $('catalog-search').open = false;
    state.selectedKey = selectedKey;
    remember('opl-apps-selected', state.selectedKey);
    state.itemId = '';
    renderCatalog();
    void loadSelected();
  }
  picker.onchange = () => selectView(picker.value);
  // Older catalogs may not include products; the declared views still provide navigation.
  const entries = products.length ? products : [...new Map(views.map(view => [view.package_id, {
    package_id: view.package_id, package_name: view.package_name,
  }])).values()];
  const productPicker = $('product-select');
  productPicker.innerHTML = entries.map(product => `<option value="${escape(product.package_id)}" ${product.package_id === selectedPackage ? 'selected' : ''}>${escape(product.package_name)}</option>`).join('') || '<option value="">暂无可用应用</option>';
  productPicker.disabled = !entries.length;
  productPicker.onchange = () => {
    const product = entries.find(entry => entry.package_id === productPicker.value);
    const entry = views.find(view => view.package_id === productPicker.value && view.view_id === product?.entry_view_id)
      || views.find(view => view.package_id === productPicker.value);
    if (!entry) return;
    state.query = ''; $('search').value = '';
    selectView(key(entry));
  };
  const selectedProduct = entries.find(product => product.package_id === selectedPackage);
  $('product-summary').textContent = localized(selectedProduct?.package_summary_i18n || selectedProduct?.package_description_i18n);
  $('views-label').textContent = query ? '搜索结果 · 所有应用' : '应用功能';
  $('views').innerHTML = [...groups.entries()].map(([packageId, group]) => {
    const product = products.find((entry) => entry.package_id === packageId);
    const heading = product?.entry_kind === 'runtime_view' ? '任务与进度' : group.name;
    return `<section class="package-group" aria-label="${escape(heading)}">
      <h2>${escape(heading)}<small>${escape(String(group.views.length))}</small></h2>
      ${group.views.map((view) => `
        <button class="view-button" type="button" data-key="${escape(key(view))}" aria-current="${key(view) === state.selectedKey ? 'page' : 'false'}">
          <span>${escape(localized(view.title_i18n, view.view_id))}</span>
        </button>
      `).join('')}
    </section>`;
  }).join('') || '<div class="catalog-empty">没有匹配的功能</div>';
  $('product-count').textContent = entries.length ? `${entries.length} 个` : '';
  $('view-count').textContent = filtered.length ? `${filtered.length} 项` : '';
  for (const button of $('views').querySelectorAll('[data-key]')) {
    button.addEventListener('click', () => {
      selectView(button.dataset.key);
    });
  }
}

function renderHeader() {
  $('notice').hidden = true;
  const view = state.selected;
  $('title').textContent = view ? localized(view.title_i18n, view.view_id) : 'OPL 能力';
  const guidance = view?.presentation_mode === 'dedicated_app'
    ? '共享概览 · 可进入专用界面继续操作。'
    : view?.presentation_mode === 'professional_app' ? '共享概览 · 编辑操作请进入该应用的专业界面。' : '';
  $('subtitle').textContent = view ? [view.package_name, guidance || localized(view.package_summary_i18n || view.package_description_i18n)].filter(Boolean).join(' · ') : '';
  $('dedicated').hidden = !view?.dedicated_resource_uri;
  $('dedicated').onclick = () => void run(async () => {
    const collection = collectionFrom(state.result);
    const selected = collection.items.find((item, index) => itemIdentity(item, index) === state.itemId) || collection.items[0] || {};
    const navigation = { ...currentViewInput(view), ...selected };
    // Only reference fields are offered. The target host filters again against
    // its live read-only launcher schema; business content never enters a URL.
    const refs = Object.fromEntries(['workspace_path', 'account_id', 'storage_ref', 'draft_id', 'revision', 'request_id', 'series_id', 'episode_id', 'shot_id']
      .filter(name => typeof navigation[name] === 'string' || typeof navigation[name] === 'number').map(name => [name, navigation[name]]));
    const result = await app.openLink({ url: `${view.dedicated_resource_uri}#${encodeURIComponent(JSON.stringify(refs))}` });
    if (result?.isError) throw new Error('专用界面尚未连接，请刷新应用目录或在应用管理中检查连接。');
  });

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
    <button class="dsh-button action" type="button"
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
  const values = { ...defaults, ...currentViewInput(view), ...input };
  if (!Object.keys(fields).length) return null;
  return `<form class="form-grid" data-command-form="${escape(command.command_id)}" data-action-ref="${escape(command.action_ref)}" data-base-input="${escape(JSON.stringify(values))}">
    ${renderInputFields(schema, values)}<div><button class="dsh-button action" type="button" data-submit>执行 ${escape(localized(command.label_i18n, command.command_id))}</button></div></form>`;
}

function bindActionButtons(view, collection) {
  for (const button of $('body').querySelectorAll('[data-action-ref]')) {
    if (button.tagName === 'FORM') continue;
    button.addEventListener('click', async () => {
      const command = view.commands.find((entry) => entry.action_ref === button.dataset.actionRef);
      if (!command) return;
      const input = { ...currentViewInput(view), ...JSON.parse(button.dataset.input || '{}') };
      const { schema } = commandInputsFor(collection, command);
      const fields = record(schema?.properties) || {};
      if (Object.keys(fields).length) {
        const existing = [...$('body').querySelectorAll('[data-command-form]')].find(form => form.dataset.commandForm === command.command_id);
        if (existing) { existing.querySelector('input, textarea, select')?.focus(); return; }
        const form = renderCommandForm(view, collection, command, input);
        button.insertAdjacentHTML('afterend', form || '');
        bindForms(view);
        return;
      }
      await executeCommand(command, input, view);
    });
  }
}

function bindForms(view) {
  for (const form of $('body').querySelectorAll('[data-command-form]')) {
    if (form.dataset.bound === 'true') continue;
    form.dataset.bound = 'true';
    bindFormSubmit(form, async (event) => {
      event.preventDefault();
      const command = view.commands.find((entry) => entry.action_ref === form.dataset.actionRef);
      if (!command) return;
      let input;
      try { input = readInputFields(form, JSON.parse(form.dataset.baseInput || '{}')); }
      catch (error) { notice(error.message, true); return; }
      await executeCommand(command, input, view);
    });
  }
}

function applyHostContext(context) {
  if (context.theme) applyDocumentTheme(context.theme);
  document.body.toggleAttribute('data-ds-dark-theme', document.documentElement.dataset.theme === 'dark');
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  if (context.locale) document.documentElement.lang = context.locale;
  if (context.displayMode) document.documentElement.dataset.displayMode = context.displayMode;
  $('fullscreen').hidden = Array.isArray(context.availableDisplayModes) && !context.availableDisplayModes.includes('fullscreen');
  $('fullscreen').textContent = context.displayMode === 'fullscreen' ? '收起' : '展开';
}

async function openLink(url) {
  const safeUrl = presentationUrl(url);
  if (safeUrl) await run(async () => {
    const result = await app.openLink({ url: safeUrl });
    if (result?.isError) throw new Error('宿主无法打开此产物，请在所属工作区查看。');
  });
}

function bindPresentationLinks() {
  for (const button of $('body').querySelectorAll('[data-open-link]')) {
    if (!button.closest('.task-workbench')) button.addEventListener('click', () => void openLink(button.dataset.openLink));
  }
  for (const button of $('body').querySelectorAll('[data-media-selection]')) {
    button.addEventListener('click', () => {
      app.updateModelContext({ structuredContent: { package_id: state.selected.package_id, view_id: state.selected.view_id, ...currentViewInput(state.selected), media_selection: JSON.parse(button.dataset.mediaSelection) } }).catch(() => {});
      notice('已将此镜头与时码加入当前对话上下文');
    });
  }
  for (const button of $('body').querySelectorAll('[data-source-ref]')) {
    // Workbench handles its own selection context, including exact task identity.
    if (button.closest('.task-workbench')) continue;
    button.addEventListener('click', () => {
      app.updateModelContext({ structuredContent: { package_id: state.selected.package_id,
        view_id: state.selected.view_id, ...currentViewInput(state.selected), source_ref: button.dataset.sourceRef } }).catch(() => {});
      notice('已将此引用加入当前对话上下文');
    });
  }
}

async function executeRuntimeAction(command) {
  if (!command || state.executing) return;
  const view = state.selected;
  const input = { ...command.input };
  const review = record(currentViewInput(view).review_context);
  const defaults = { ...(record(command.defaults) || {}), ...(review ? { review_context: review } : {}) };
  const needsPayload = command.input_schema?.additionalProperties === true && !command.input_schema?.properties;
  const schema = needsPayload ? { type: 'object', properties: { payload: { type: 'object', title: '操作参数' } } } : command.input_schema;
  if (needsPayload || Object.keys(schema?.properties || {}).length) {
    const previous = $('body').querySelector('[data-runtime-form]');
    previous?.remove();
    const host = document.createElement('form');
    host.className = 'form-grid'; host.dataset.runtimeForm = command.command_id;
    host.innerHTML = `<h3>${escape(localized(command.label_i18n, command.command_id))}</h3>${command.summary ? `<p>${escape(command.summary)}</p>` : ''}${renderInputFields(schema, needsPayload ? { payload: defaults } : defaults)}<div><button type="button" data-submit class="dsh-button action">继续</button></div>`;
    $('body').append(host);
    bindFormSubmit(host, event => {
      event.preventDefault();
      void run(async () => { const values = readInputFields(host, needsPayload ? { payload: defaults } : defaults); await executeCommand(command, { ...input, payload: needsPayload ? values.payload : values }, view); });
    });
    host.querySelector('input,textarea,select')?.focus();
    return;
  }
  await executeCommand(command, { ...input, ...(Object.keys(defaults).length ? { payload: defaults } : {}) }, view);
}

async function executeCommand(command, input, view = state.selected) {
  if (!view || state.executing) return;
  const targetInput = structuredClone(input);
  const targetReadInput = structuredClone(currentViewInput(view));
  const generation = readGeneration;
  const selectedItemId = state.itemId;
  const stillSelected = () => state.selected === view && generation === readGeneration && selectedItemId === state.itemId;
  state.executing = true;
  let dispatched = false;
  let outcomeUnknown = false;
  try {
    if (command.confirmation_required && !await confirmCommand(command, view, targetInput)) return;
    if (!stillSelected()) throw new Error('当前视图已改变，请在目标任务中重新选择操作。');
    $('status').textContent = '正在执行';
    $('body').setAttribute('aria-busy', 'true');
    dispatched = true;
    const payload = await callTool(EXECUTE_TOOL, {
      package_id: view.package_id, ref: command.action_ref,
      input: targetInput, confirmed: command.confirmation_required === true,
    });
    const envelope = extractEnvelope(payload);
    if (envelope?.confirmation_required && !envelope?.response) throw new Error('该操作需要明确确认');
    if (envelope?.response?.ok === false) throw new Error(envelope.response.error?.message || '操作未完成');
    const result = ownerResult(envelope);
    const execution = result?.execution || result?.runtime_operator_action_execution?.execution;
    const ownerState = result?.state || execution?.execution_status;
    const readbackRequest = ownerReadbackRequest(view, targetInput, result, state.catalog?.views || []);
    state.lastAction = {
      package_id: view.package_id, view_id: view.view_id, action_ref: command.action_ref,
      input: targetInput, result, readback: readbackRequest,
    };
    app.updateModelContext({ structuredContent: { last_action: state.lastAction } }).catch(() => {});
    if (stillSelected()) {
      await loadSelected();
      notice(['running', 'queued', 'started', 'accepted'].includes(ownerState)
        ? '工作已提交，请查看当前进度' : '已收到操作结果，请核对当前状态');
    }
  } catch (error) {
    // A transport error can occur after dispatch. Read the original owner/target without retrying the mutation.
    outcomeUnknown = dispatched;
    if (dispatched) {
      state.lastAction = {
        package_id: view.package_id, view_id: view.view_id, action_ref: command.action_ref,
        input: targetInput, outcome: 'unknown',
        readback: { package_id: view.package_id, ref: view.data_ref, input: { ...targetReadInput, ...(targetInput.request_id ? { request_id: targetInput.request_id } : {}) } },
      };
      app.updateModelContext({ structuredContent: { last_action: state.lastAction } }).catch(() => {});
      try {
        const readback = await callTool(READ_TOOL, { package_id: view.package_id, ref: view.data_ref,
          input: { ...targetReadInput, ...(targetInput.request_id ? { request_id: targetInput.request_id } : {}) } });
        if (stillSelected()) { state.result = readback; renderResult(); updateContext(); }
      } catch { /* Keep the original owner error; a failed read cannot establish the write outcome. */ }
    }
    if (stillSelected()) notice(`${error.message || '操作结果尚未确认'}${dispatched ? '；已尝试读取原目标状态，请核对后再操作。' : ''}`, true);
  } finally {
    state.executing = false;
    $('body').removeAttribute('aria-busy');
    if (stillSelected()) $('status').textContent = outcomeUnknown ? '操作结果待核对' : '已连接';
  }
}

function confirmCommand(command, view, input) {
  const dialog = $('confirmation');
  $('confirmation-title').textContent = `确认执行“${localized(command.label_i18n, command.command_id)}”`;
  $('confirmation-target').innerHTML = `<p>${escape(view.package_name)} · ${escape(localized(command.label_i18n, command.command_id))}</p>${renderFields(input)}${rawRecord({ package_id: view.package_id, action: command.action_ref, input })}`;
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
      <div class="card detail">${renderOwnerView(view, current)}${view.data_ref === 'opl.runtime.v1#work-items' ? `<button class="dsh-button action" data-open-task="${escape(current.id)}">打开任务工作台</button>` : ''}</div>
    </div>
    <div class="detail-actions">${renderActionButtons(view, collection, current)}</div>
  `;
}

function renderResult() {
  disposeWorkbench(); disposeWorkbench = () => {};
  const view = state.selected;
  if (!view) {
    $('body').innerHTML = '<div class="empty">这里还没有可查看的应用。请到应用管理安装或启用应用，再刷新目录。</div>';
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
      ${collection.items.length ? `<div class="card detail">${collection.items.map(item => renderOwnerView(view, item)).join('')}</div>` : ''}`;
  } else if (view.data_ref === 'opl.runtime.v1#item' && collection.data.detail?.item_id) {
    const item = collection.data.detail;
    if (collection.items[0]) rememberWorkspaceSelection(collection.items[0]);
    disposeWorkbench = mountTaskWorkbench({ container: $('body'), item,
      initialViewId: currentViewInput(view).domain_view_id,
      actions: item.runtime_actions || [], onAction: executeRuntimeAction, onOpenLink: openLink,
      relatedViews: (state.catalog?.views || []).filter(entry => entry.scope === 'work_item' && entry.agent_id === item.identity.agent_id),
      onOpenView: target => { state.selectedKey = key(target); state.focusKey = key(target);
        state.focusInput = { work_item_identity: collection.items[0].work_item_identity, workspace_path: item.identity.workspace_path, work_item_root: item.identity.work_item_root }; void loadSelected(); },
      read: async input => collectionFrom(await callTool(READ_TOOL, { package_id: 'opl-runtime', ref: 'opl.runtime.v1#domain-detail', input })).data.detail,
      onContext: selection => { app.updateModelContext({ content: [{ type: 'text', text: `正在查看任务 ${item.identity.work_item_display_name}` }], structuredContent: selection }).catch(() => {}); },
    });
  } else if (collection.root.trajectory) {
    try {
      const snapshot = parseContributionResearch(collection.root, currentViewInput(view).work_item_identity);
      disposeWorkbench = mountTaskWorkbench({ container: $('body'), snapshot, ownerDetails: collection.root,
        item: { identity: collection.root.identity, lifecycle: { primary_state_label: collection.root.phase?.business_status },
          stage_map: collection.root.phase?.stage_id ? [{ stage_id: collection.root.phase.stage_id, state: collection.root.phase.stage_status }] : [],
          source_refs: collection.root.source_refs },
        onContext: selection => { app.updateModelContext({ structuredContent: selection }).catch(() => {}); },
      });
    } catch { $('body').innerHTML = '<p role="alert">研究路径不可用，请核对任务与数据格式。</p>'; }
  } else if (collection.items.length) {
    $('body').innerHTML = renderCollection(view, collection);
  } else if (collection.itemsPresent) {
    $('body').innerHTML = `<div class="empty">${escape(localized(view.empty_state_i18n, '当前没有条目'))}</div>
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  } else {
    $('body').innerHTML = `<div class="card detail">${renderOwnerView(view, collection.root)}</div>
      <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
  }
  if (typeof collection.root.summary === 'string') $('body').insertAdjacentHTML('afterbegin', `<p>${escape(collection.root.summary)}</p>`);
  const current = collection.items.find((item, index) => itemIdentity(item, index) === state.itemId) || collection.items[0];
  const handoff = resolveViewHandoff(current?.runtime_handoff || collection.data.runtime_handoff || collection.root.runtime_handoff, state.catalog?.views || []);
  if (handoff) {
    const button = document.createElement('button');
    button.className = 'action'; button.type = 'button'; button.textContent = '返回原任务继续';
    button.addEventListener('click', () => {
      state.selectedKey = key(handoff.view); state.focusKey = state.selectedKey;
      state.focusInput = handoff.input; state.itemId = ''; void loadSelected();
    });
    $('body').append(button);
  }
  for (const button of $('body').querySelectorAll('[data-item-id]')) {
    button.addEventListener('click', () => {
      state.itemId = button.dataset.itemId;
      const items = collectionFrom(state.result).items;
      const selected = items.find((item, index) => itemIdentity(item, index) === state.itemId);
      if (selected) rememberWorkspaceSelection(selected);
      if (selected && view.data_ref === 'opl.runtime.v1#work-items') { state.focusKey = 'opl-runtime:opl.runtime.item'; state.focusInput = { item_id: selected.id }; }
      renderResult();
      updateContext();
    });
  }
  for (const button of $('body').querySelectorAll('[data-open-task]')) {
    button.addEventListener('click', () => {
      state.selectedKey = 'opl-runtime:opl.runtime.item';
      state.focusKey = 'opl-runtime:opl.runtime.item'; state.focusInput = { item_id: button.dataset.openTask };
      void loadSelected();
    });
  }
  bindPresentationLinks();
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
  const input = currentViewInput(view);
  state.result = null;
  renderResult();
  await run(async () => {
    $('status').textContent = '正在读取';
    const result = await callTool(READ_TOOL, {
      package_id: view.package_id,
      ref: view.data_ref,
      input,
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
  const items = collection.state === 'ready' ? collection.items : [];
  const selected = items.find((item, index) => itemIdentity(item, index) === state.itemId) || items[0];
  const context = `正在查看 ${view.package_name} 的 ${localized(view.title_i18n, view.view_id)}`;
  app.updateModelContext({
    content: [{ type: 'text', text: context }],
    structuredContent: { navigation: { package_id: view.package_id, view_id: view.view_id, input: currentViewInput(view) }, package_id: view.package_id, view_id: view.view_id, input: currentViewInput(view), selection: selected || collection.root, ...(state.lastAction ? { last_action: state.lastAction } : {}) },
  }).catch(() => {});
  document.body.setAttribute('data-llm', context);
}

app.ontoolresult = (params) => {
  const payload = record(params?.structuredContent);
  if (params?.isError) {
    ++readGeneration;
    disposeWorkbench(); disposeWorkbench = () => {};
    $('status').textContent = '读取失败';
    $('body').textContent = payload?.error?.message || '当前视图读取失败，请重新选择目标';
    return;
  }
  const catalog = record(payload?.opl_mcp_app_catalog);
  if (catalog) {
    ++readGeneration;
    state.catalog = catalog;
    const focus = record(catalog.focus) || {};
    state.focusKey = focus.package_id && focus.view_id ? `${focus.package_id}:${focus.view_id}` : '';
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

$('confirmation-cancel').addEventListener('click', () => $('confirmation').close('cancel'));
$('confirmation-submit').addEventListener('click', () => $('confirmation').close('confirm'));

$('search').addEventListener('input', (event) => {
  state.query = event.currentTarget.value;
  renderCatalog();
});
$('refresh').addEventListener('click', () => void loadSelected());
$('fullscreen').addEventListener('click', () => {
  const current = document.documentElement.dataset.displayMode;
  void app.requestDisplayMode({ mode: current === 'fullscreen' ? 'inline' : 'fullscreen' }).catch((error) => notice(error.message, true));
});

app.onhostcontextchanged = applyHostContext;
await app.connect();
applyHostContext(app.getHostContext?.() || {});
