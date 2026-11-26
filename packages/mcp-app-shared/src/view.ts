import { readInputFields, renderInputFields } from './forms.ts';
import {
  focusedViewInput,
  ownerReadbackRequest,
  resolveViewHandoff,
  viewKey,
} from './handoff.ts';
import {
  escape,
  presentationUrl,
  rawRecord,
  renderFields,
  renderOwnerView,
  statusLabel,
} from './presentation.ts';
import {
  mountTaskWorkbench,
  parseContributionTrajectory,
  type TaskWorkbenchItem,
} from './task-workbench.ts';
import type {
  CatalogCommandDescriptor,
  CatalogProductSummary,
  CatalogViewDescriptor,
  DocumentLike,
  ElementLike,
  FormElementLike,
  I18nText,
  InputFieldSchema,
  McpAppCatalog,
  McpAppHostContext,
  McpAppHostLike,
  McpAppToolCallResult,
  StorageLike,
} from './types.ts';

export const READ_TOOL = 'opl_app_contribution_read';
export const EXECUTE_TOOL = 'opl_app_contribution_execute';

const DEDICATED_REF_FIELDS = [
  'workspace_path',
  'account_id',
  'storage_ref',
  'draft_id',
  'revision',
  'request_id',
  'series_id',
  'episode_id',
  'shot_id',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function dedicatedResourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === 'ui:' || url.protocol === 'https:' || url.protocol === 'http:') {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function createSafeStorage(backing?: StorageLike | null): StorageLike {
  const memory = new Map<string, string>();
  const target: StorageLike | null =
    backing !== undefined
      ? backing
      : typeof globalThis.sessionStorage !== 'undefined'
        ? (globalThis.sessionStorage as unknown as StorageLike)
        : null;

  return {
    getItem(key: string): string | null {
      if (target) {
        try {
          return target.getItem(key);
        } catch {
          // Opaque sandboxed iframes can throw SecurityError on sessionStorage.
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      if (target) {
        try {
          target.setItem(key, value);
        } catch {
          // Keep memory fallback intact when sessionStorage is blocked.
        }
      }
    },
  };
}

function readStoredJson<T>(storage: StorageLike, name: string, fallback: T): T {
  try {
    const raw = storage.getItem(name);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T | null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(storage: StorageLike, name: string, value: unknown): void {
  try {
    storage.setItem(name, JSON.stringify(value));
  } catch {
    // Ignore storage failure
  }
}

export function localized(
  value: I18nText | Record<string, unknown> | unknown,
  fallback = '',
  locale = 'zh-CN',
): string {
  const labels = asRecord(value) || {};
  const baseLocale = locale.split('-')[0] || '';
  const candidates = [
    labels[locale],
    baseLocale ? labels[baseLocale] : undefined,
    labels['zh-CN'],
    labels.en,
    labels['en-US'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  const anyString = Object.values(labels).find(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  return anyString ?? fallback;
}

export function isRuntimeView(view: CatalogViewDescriptor | null | undefined): boolean {
  return view?.entry_kind === 'runtime_view' || view?.package_id === 'opl-runtime';
}

export function defaultCatalogView(
  catalog: McpAppCatalog | null | undefined,
): CatalogViewDescriptor | null {
  const views = Array.isArray(catalog?.views) ? catalog.views : [];
  return views.find((view) => view.entry_kind === 'product_entry') || views[0] || null;
}

export function normalizeCommandDescriptor(raw: unknown): CatalogCommandDescriptor {
  const cmd = asRecord(raw) ?? {};
  const actionRef = typeof cmd.action_ref === 'string' ? cmd.action_ref : '';
  const commandId =
    typeof cmd.command_id === 'string' && cmd.command_id
      ? cmd.command_id
      : typeof cmd.id === 'string' && cmd.id
        ? cmd.id
        : actionRef;
  const labelI18n = asRecord(cmd.label_i18n ?? cmd.label) as I18nText | undefined;
  const confirm = Boolean(cmd.confirmation_required ?? cmd.confirm);
  return {
    command_id: commandId,
    action_ref: actionRef,
    label_i18n: labelI18n,
    label: labelI18n,
    confirmation_required: confirm,
    confirm,
    ...(typeof cmd.effect_timing === 'string'
      ? { effect_timing: cmd.effect_timing as CatalogCommandDescriptor['effect_timing'] }
      : {}),
    ...(asRecord(cmd.input) ? { input: asRecord(cmd.input)! } : {}),
    ...(asRecord(cmd.defaults) ? { defaults: asRecord(cmd.defaults)! } : {}),
    ...(typeof cmd.summary === 'string' ? { summary: cmd.summary } : {}),
    ...(asRecord(cmd.input_schema) ? { input_schema: asRecord(cmd.input_schema) as InputFieldSchema } : {}),
  };
}

export function normalizeViewDescriptor(raw: unknown): CatalogViewDescriptor {
  const v = asRecord(raw) ?? {};
  const viewId =
    typeof v.view_id === 'string' && v.view_id
      ? v.view_id
      : typeof v.id === 'string'
        ? v.id
        : '';
  const rawCommands = Array.isArray(v.commands)
    ? v.commands
    : Array.isArray(v.actions)
      ? v.actions
      : [];
  const titleI18n = asRecord(v.title_i18n ?? v.title) as I18nText | undefined;
  const emptyI18n = asRecord(v.empty_state_i18n ?? v.empty_state) as I18nText | undefined;

  return {
    package_id: typeof v.package_id === 'string' ? v.package_id : '',
    ...(typeof v.package_name === 'string' ? { package_name: v.package_name } : {}),
    ...(asRecord(v.package_summary_i18n)
      ? { package_summary_i18n: asRecord(v.package_summary_i18n) as I18nText }
      : {}),
    ...(asRecord(v.package_description_i18n)
      ? { package_description_i18n: asRecord(v.package_description_i18n) as I18nText }
      : {}),
    view_id: viewId,
    id: viewId,
    ...(typeof v.view_type === 'string' ? { view_type: v.view_type } : {}),
    ...(typeof v.slot === 'string' ? { slot: v.slot } : {}),
    ...(typeof v.settings_destination === 'string'
      ? { settings_destination: v.settings_destination }
      : {}),
    title_i18n: titleI18n,
    title: titleI18n,
    empty_state_i18n: emptyI18n,
    empty_state: emptyI18n,
    data_ref: typeof v.data_ref === 'string' ? v.data_ref : '',
    commands: rawCommands.map(normalizeCommandDescriptor),
    ...(typeof v.entry_kind === 'string' ? { entry_kind: v.entry_kind } : {}),
    ...(typeof v.scope === 'string' ? { scope: v.scope } : {}),
    ...(typeof v.agent_id === 'string' ? { agent_id: v.agent_id } : {}),
    ...(typeof v.presentation_mode === 'string' ? { presentation_mode: v.presentation_mode } : {}),
    ...(typeof v.dedicated_resource_uri === 'string'
      ? { dedicated_resource_uri: v.dedicated_resource_uri }
      : {}),
    ...(typeof v.mcp_server_id === 'string' ? { mcp_server_id: v.mcp_server_id } : {}),
    ...(Array.isArray(v.host_capabilities)
      ? { host_capabilities: v.host_capabilities as CatalogViewDescriptor['host_capabilities'] }
      : {}),
    ...(typeof v.sort_order === 'number' ? { sort_order: v.sort_order } : {}),
  };
}

export function normalizeCatalog(rawCatalog: unknown): McpAppCatalog {
  const c = asRecord(rawCatalog) ?? {};
  const views = Array.isArray(c.views) ? c.views.map(normalizeViewDescriptor) : [];
  const products = Array.isArray(c.products)
    ? (c.products.map(asRecord).filter((p): p is Record<string, unknown> => Boolean(p)) as unknown as McpAppCatalog['products'])
    : [];
  return {
    products,
    views,
    ...(typeof c.product_count === 'number' ? { product_count: c.product_count } : {}),
    ...(typeof c.view_count === 'number' ? { view_count: c.view_count } : {}),
    ...(asRecord(c.focus) ? { focus: asRecord(c.focus) as McpAppCatalog['focus'] } : {}),
  };
}

export function extractEnvelope(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload) || {};
  return (
    asRecord(root.opl_app_contribution)
    || asRecord(root.opl_app_contribution_preflight)
    || root
  );
}

export function ownerResult(envelope: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const response = asRecord(envelope?.response);
  return (
    asRecord(response?.result)
    || response
    || asRecord(envelope?.result)
    || envelope
    || {}
  );
}

export interface ExtractedCollection {
  readonly envelope: Record<string, unknown> | null;
  readonly owner: Record<string, unknown> | null;
  readonly root: Record<string, unknown>;
  readonly data: Record<string, unknown>;
  readonly items: readonly Record<string, unknown>[];
  readonly itemsPresent: boolean;
  readonly commandInputs: Record<string, unknown>;
  readonly inputSchema: Record<string, unknown> | null;
  readonly inputDefaults: Record<string, unknown>;
  readonly state: string;
  readonly reason: string;
  readonly pagination: Record<string, unknown> | null;
}

export function collectionFrom(payload: unknown): ExtractedCollection {
  if (!asRecord(payload)) {
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
  const response = asRecord(envelope?.response);
  const owner = ownerResult(envelope);
  const root = asRecord(owner?.result) || owner;
  const data = asRecord(root?.data) || root;
  const itemsPresent = Array.isArray(data?.items);
  const items = itemsPresent
    ? (data.items as unknown[]).map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  const commandInputs =
    asRecord(data?.command_inputs) || asRecord(root?.command_inputs) || {};
  return {
    envelope,
    owner,
    root,
    data,
    items,
    itemsPresent,
    commandInputs,
    inputSchema:
      asRecord(root?.input_schema)
      || asRecord(response?.input_schema)
      || asRecord(envelope?.input_schema),
    inputDefaults: asRecord(root?.input_defaults) || {},
    state:
      typeof root?.state === 'string'
        ? root.state
        : items.length || !root?.reason
          ? 'ready'
          : 'unavailable',
    reason: String(root?.reason || ''),
    pagination: asRecord(data?.pagination),
  };
}

export function itemIdentity(item: Record<string, unknown>, index: number): string {
  return String(
    item.id
      ?? item.proposal_id
      ?? item.item_id
      ?? item.memory_id
      ?? item.entity_id
      ?? item.context_id
      ?? item.draft_ref
      ?? item.source_ref
      ?? index,
  );
}

export function itemTitle(
  item: Record<string, unknown>,
  index: number,
  locale = 'zh-CN',
): string {
  return localized(
    item.label_i18n || item.title_i18n || item.title,
    String(
      item.title
        ?? item.display_name
        ?? item.name
        ?? item.summary
        ?? itemIdentity(item, index),
    ),
    locale,
  );
}

export function itemSummary(item: Record<string, unknown>, locale = 'zh-CN'): string {
  return localized(item.summary_i18n, String(item.summary ?? ''), locale);
}

export function buildDedicatedNavigationRefs(
  navigation: Readonly<Record<string, unknown>>,
): Record<string, string | number> {
  return Object.fromEntries(
    DEDICATED_REF_FIELDS.filter(
      (name) => typeof navigation[name] === 'string' || typeof navigation[name] === 'number',
    ).map((name) => [name, navigation[name] as string | number]),
  );
}

export interface OplMcpAppViewState {
  catalog: McpAppCatalog | null;
  selectedKey: string;
  selected: CatalogViewDescriptor | null;
  result: unknown;
  lastAction: Record<string, unknown> | null;
  selectedWorkItemIdentity: Record<string, unknown> | null;
  selectedWorkspace: {
    readonly workspace_path: string;
    readonly work_item_root: string | null;
  } | null;
  selectedCanonicalItemId: string;
  query: string;
  itemId: string;
  executing: boolean;
  focusKey: string;
  focusInput: Record<string, unknown>;
}

export interface CreateViewControllerOptions {
  readonly host: McpAppHostLike;
  readonly doc?: DocumentLike;
  readonly storage?: StorageLike | null;
  readonly locale?: string;
  readonly applyTheme?: (theme: string) => void;
  readonly applyStyleVariables?: (vars: Record<string, string>) => void;
  readonly applyFonts?: (fonts: unknown) => void;
}

export interface OplMcpAppViewController {
  readonly state: OplMcpAppViewState;
  getLocale(): string;
  applyHostContext(context: McpAppHostContext): void;
  handleToolResult(params: McpAppToolCallResult): void;
  loadSelected(): Promise<void>;
  executeCommand(
    command: CatalogCommandDescriptor,
    input: Record<string, unknown>,
    view?: CatalogViewDescriptor | null,
  ): Promise<void>;
  currentViewInput(view: CatalogViewDescriptor): Record<string, unknown>;
  destroy(): void;
}

interface DomEventLike {
  readonly target?: {
    readonly tagName?: string;
    readonly type?: string;
    readonly value?: string;
    readonly dataset?: Record<string, string | undefined>;
  } | null;
  readonly currentTarget?: {
    readonly value?: string;
  } | null;
  readonly key?: string;
  preventDefault?(): void;
}

export function createOplMcpAppViewController(
  options: CreateViewControllerOptions,
): OplMcpAppViewController {
  const { host } = options;
  const doc =
    options.doc
    ?? (typeof globalThis.document !== 'undefined'
      ? (globalThis.document as unknown as DocumentLike)
      : undefined);
  const storage = createSafeStorage(options.storage);

  const el = (id: string): ElementLike | null => doc?.getElementById(id) ?? null;

  const state: OplMcpAppViewState = {
    catalog: null,
    selectedKey: readStoredJson(storage, 'opl-apps-selected', ''),
    selected: null,
    result: null,
    lastAction: null,
    selectedWorkItemIdentity: readStoredJson(storage, 'opl-apps-selected-work-item', null),
    selectedWorkspace: readStoredJson(storage, 'opl-apps-selected-workspace', null),
    selectedCanonicalItemId: readStoredJson(storage, 'opl-apps-selected-item-id', ''),
    query: '',
    itemId: '',
    executing: false,
    focusKey: '',
    focusInput: {},
  };

  let readGeneration = 0;
  let activeExecution: { readonly token: symbol; readonly view: CatalogViewDescriptor } | null = null;
  let disposeWorkbench: () => void = () => {};
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const getLocale = (): string =>
    doc?.documentElement.lang
    || options.locale
    || (typeof globalThis.navigator !== 'undefined' ? globalThis.navigator.language : '')
    || 'zh-CN';

  const textLoc = (value: unknown, fallback = ''): string =>
    localized(value, fallback, getLocale());

  function notice(text: string, isError = false): void {
    const node = el('notice');
    if (!node) return;
    node.textContent = text;
    node.className = `notice${isError ? ' error' : ''}`;
    node.hidden = false;
    if (noticeTimer !== undefined) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      const target = el('notice');
      if (target) target.hidden = true;
    }, isError ? 16_000 : 5_000);
  }

  async function run<T>(
    action: () => Promise<T>,
    onError?: (error: unknown) => void,
  ): Promise<T | undefined> {
    try {
      return await action();
    } catch (error) {
      onError?.(error);
      const msg = error instanceof Error && error.message ? error.message : '操作未完成，请先核对当前状态';
      notice(msg, true);
      return undefined;
    }
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await host.callServerTool({ name, arguments: args });
    if (result.isError) {
      const errObj = asRecord(result.structuredContent?.error);
      const textPart = result.content?.find((part) => part.type === 'text')?.text;
      throw new Error(
        (typeof errObj?.message === 'string' && errObj.message) || textPart || '操作未完成',
      );
    }
    return result.structuredContent || {};
  }

  function rememberWorkspaceSelection(item: Record<string, unknown>): void {
    if (!item?.work_item_identity || !item?.workspace_path) return;
    state.selectedCanonicalItemId = String(item.id ?? '');
    writeStoredJson(storage, 'opl-apps-selected-item-id', state.selectedCanonicalItemId);
    state.selectedWorkItemIdentity = asRecord(item.work_item_identity);
    state.selectedWorkspace = {
      workspace_path: String(item.workspace_path),
      work_item_root: typeof item.work_item_root === 'string' ? item.work_item_root : null,
    };
    writeStoredJson(storage, 'opl-apps-selected-work-item', state.selectedWorkItemIdentity);
    writeStoredJson(storage, 'opl-apps-selected-workspace', state.selectedWorkspace);
  }

  function currentViewInput(view: CatalogViewDescriptor): Record<string, unknown> {
    const focused = focusedViewInput(view, state.focusKey, state.focusInput);
    if (focused.workspace_path || focused.work_item_identity) {
      return { ...focused };
    }
    const collection = collectionFrom(state.result);
    const items = collection.state === 'ready' ? collection.items : [];
    const selected =
      items.find((item, index) => itemIdentity(item, index) === state.itemId) || items[0];
    if (selected?.work_item_identity) rememberWorkspaceSelection(selected);
    const selectedIdentity =
      selected?.work_item_identity
      || (collection.state === 'ready' ? state.selectedWorkItemIdentity : null);
    const selectedWorkspace = selected?.workspace_path
      ? {
          workspace_path: String(selected.workspace_path),
          work_item_root:
            typeof selected.work_item_root === 'string' ? selected.work_item_root : null,
        }
      : collection.state === 'ready'
        ? state.selectedWorkspace
        : null;

    return {
      ...(['opl.runtime.v1#item', 'opl.runtime.v1#knowledge'].includes(view.data_ref)
      && state.selectedCanonicalItemId
        ? { item_id: state.selectedCanonicalItemId }
        : {}),
      ...(view.scope === 'work_item' && selectedIdentity
        ? { work_item_identity: selectedIdentity }
        : {}),
      ...(selectedWorkspace?.workspace_path
        ? { workspace_path: selectedWorkspace.workspace_path }
        : {}),
      ...(selectedWorkspace?.work_item_root
        ? { work_item_root: selectedWorkspace.work_item_root }
        : {}),
      ...focused,
    };
  }

  function bindFormSubmit(form: ElementLike, submit: (event: unknown) => void): void {
    form.addEventListener('submit', (rawEvent) => {
      const event = rawEvent as DomEventLike;
      event.preventDefault?.();
      if (form.reportValidity?.() !== false) submit(rawEvent);
    });
    form.querySelector('[data-submit]')?.addEventListener('click', (rawEvent) => {
      if (form.reportValidity?.() !== false) submit(rawEvent);
    });
    form.addEventListener('keydown', (rawEvent) => {
      const event = rawEvent as DomEventLike;
      if (
        event.key === 'Enter'
        && event.target?.tagName === 'INPUT'
        && event.target?.type !== 'checkbox'
      ) {
        event.preventDefault?.();
        if (form.reportValidity?.() !== false) submit(rawEvent);
      }
    });
  }

  function renderReadInputForm(collection: ExtractedCollection): string {
    const schema = asRecord(collection.inputSchema) as InputFieldSchema | null;
    if (!schema || !Object.keys(asRecord(schema.properties) || {}).length || !state.selected) {
      return '';
    }
    const input = { ...collection.inputDefaults, ...currentViewInput(state.selected) };
    return `<form class="form-grid" id="read-input-form" data-base-input="${escape(JSON.stringify(input))}">${renderInputFields(schema, input, [], 'data-read-field')}
      <div><button class="dsh-button action" type="button" data-submit>读取</button></div></form>`;
  }

  function bindReadInputForm(): void {
    const form = el('read-input-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    bindFormSubmit(form, () => {
      void run(async () => {
        state.focusKey = viewKey(state.selected);
        state.focusInput = readInputFields(
          form as unknown as FormElementLike,
          JSON.parse(form.dataset.baseInput || '{}') as Record<string, unknown>,
          'data-read-field',
        );
        await loadSelected();
      });
    });
  }

  function commandInputsFor(
    collection: ExtractedCollection,
    command: CatalogCommandDescriptor,
  ): { readonly schema: InputFieldSchema | null; readonly defaults: Record<string, unknown> } {
    const spec = asRecord(collection.commandInputs?.[command.action_ref]);
    return {
      schema: (asRecord(spec?.input_schema) as InputFieldSchema | null) ?? null,
      defaults: { ...(asRecord(spec?.defaults) || {}) },
    };
  }

  function renderActionButtons(
    view: CatalogViewDescriptor,
    _collection: ExtractedCollection,
    item: Record<string, unknown> | null = null,
  ): string {
    const commands: Array<{
      readonly command: CatalogCommandDescriptor;
      readonly input: Record<string, unknown>;
    }> = [];
    if (item) {
      for (const rawAction of Array.isArray(item.actions) ? item.actions : []) {
        const action = asRecord(rawAction);
        const actionRef = action?.action_ref;
        const command = view.commands.find((entry) => entry.action_ref === actionRef);
        if (command) {
          commands.push({ command, input: asRecord(action?.input) || {} });
        }
      }
    }
    for (const command of view.commands) {
      const confirmReq = Boolean(command.confirmation_required ?? command.confirm);
      if (
        (!item || confirmReq)
        && !commands.some((entry) => entry.command.action_ref === command.action_ref)
      ) {
        commands.push({ command, input: {} });
      }
    }
    const unique = new Map(
      commands.map((entry) => [
        `${entry.command.command_id}:${JSON.stringify(entry.input)}`,
        entry,
      ]),
    );
    return [...unique.values()]
      .map(({ command, input }) => {
        const confirmReq = Boolean(command.confirmation_required ?? command.confirm);
        const label = textLoc(command.label_i18n ?? command.label, command.command_id);
        return `
      <button class="dsh-button action" type="button"
        data-action-ref="${escape(command.action_ref)}"
        data-input="${escape(JSON.stringify(input))}"
        data-confirm="${confirmReq ? 'true' : 'false'}">
        ${escape(label)}${confirmReq ? '…' : ''}
      </button>
    `;
      })
      .join('');
  }

  function renderCommandForm(
    view: CatalogViewDescriptor,
    collection: ExtractedCollection,
    command: CatalogCommandDescriptor,
    input: Record<string, unknown>,
  ): string | null {
    const { schema, defaults } = commandInputsFor(collection, command);
    const fields = asRecord(schema?.properties) || {};
    const values = { ...defaults, ...currentViewInput(view), ...input };
    if (!Object.keys(fields).length) return null;
    const label = textLoc(command.label_i18n ?? command.label, command.command_id);
    return `<form class="form-grid" data-command-form="${escape(command.command_id)}" data-action-ref="${escape(command.action_ref)}" data-base-input="${escape(JSON.stringify(values))}">
      ${renderInputFields(schema, values)}<div><button class="dsh-button action" type="button" data-submit>执行 ${escape(label)}</button></div></form>`;
  }

  function bindForms(view: CatalogViewDescriptor): void {
    const body = el('body');
    if (!body) return;
    for (const form of body.querySelectorAll('[data-command-form]')) {
      if (form.dataset.bound === 'true') continue;
      form.dataset.bound = 'true';
      bindFormSubmit(form, async () => {
        const command = view.commands.find(
          (entry) => entry.action_ref === form.dataset.actionRef,
        );
        if (!command) return;
        let input: Record<string, unknown>;
        try {
          input = readInputFields(
            form as unknown as FormElementLike,
            JSON.parse(form.dataset.baseInput || '{}') as Record<string, unknown>,
          );
        } catch (error) {
          notice(error instanceof Error ? error.message : '输入格式错误', true);
          return;
        }
        await executeCommand(command, input, view);
      });
    }
  }

  function bindActionButtons(
    view: CatalogViewDescriptor,
    collection: ExtractedCollection,
  ): void {
    const body = el('body');
    if (!body) return;
    for (const button of body.querySelectorAll('[data-action-ref]')) {
      if (button.tagName === 'FORM') continue;
      button.addEventListener('click', async () => {
        const command = view.commands.find(
          (entry) => entry.action_ref === button.dataset.actionRef,
        );
        if (!command) return;
        const input = {
          ...currentViewInput(view),
          ...(JSON.parse(button.dataset.input || '{}') as Record<string, unknown>),
        };
        const { schema } = commandInputsFor(collection, command);
        const fields = asRecord(schema?.properties) || {};
        if (Object.keys(fields).length) {
          const existing = [...body.querySelectorAll('[data-command-form]')].find(
            (form) => form.dataset.commandForm === command.command_id,
          );
          if (existing) {
            existing.querySelector('input, textarea, select')?.focus?.();
            return;
          }
          const formHtml = renderCommandForm(view, collection, command, input);
          button.insertAdjacentHTML?.('afterend', formHtml || '');
          bindForms(view);
          return;
        }
        await executeCommand(command, input, view);
      });
    }
  }

  function confirmCommand(
    command: CatalogCommandDescriptor,
    view: CatalogViewDescriptor,
    input: Record<string, unknown>,
  ): Promise<boolean> {
    const dialog = el('confirmation');
    if (!dialog || !dialog.showModal) return Promise.resolve(false);
    const titleEl = el('confirmation-title');
    const targetEl = el('confirmation-target');
    const label = textLoc(command.label_i18n ?? command.label, command.command_id);
    if (titleEl) titleEl.textContent = `确认执行“${label}”`;
    if (targetEl) {
      targetEl.innerHTML = `<p>${escape(view.package_name || view.package_id)} · ${escape(label)}</p>${renderFields(input)}${rawRecord({ package_id: view.package_id, action: command.action_ref, input })}`;
    }
    dialog.returnValue = '';
    return new Promise((resolve) => {
      dialog.addEventListener(
        'close',
        () => resolve(dialog.returnValue === 'confirm'),
        { once: true },
      );
      dialog.showModal?.();
    });
  }

  async function openLink(url: string): Promise<void> {
    const safeUrl = presentationUrl(url);
    if (!safeUrl || !host.openLink) return;
    await run(async () => {
      const result = await host.openLink?.({ url: safeUrl });
      if (result?.isError) {
        throw new Error('宿主无法打开此产物，请在所属工作区查看。');
      }
    });
  }

  function bindPresentationLinks(): void {
    const body = el('body');
    if (!body || !state.selected) return;
    const selectedView = state.selected;
    for (const button of body.querySelectorAll('[data-open-link]')) {
      if (!button.closest?.('.task-workbench')) {
        button.addEventListener('click', () => {
          if (button.dataset.openLink) void openLink(button.dataset.openLink);
        });
      }
    }
    for (const button of body.querySelectorAll('[data-media-selection]')) {
      button.addEventListener('click', () => {
        void host.updateModelContext?.({
          structuredContent: {
            package_id: selectedView.package_id,
            view_id: selectedView.view_id ?? selectedView.id,
            ...currentViewInput(selectedView),
            media_selection: JSON.parse(button.dataset.mediaSelection || '{}'),
          },
        }).catch(() => {});
        notice('已将此镜头与时码加入当前对话上下文');
      });
    }
    for (const button of body.querySelectorAll('[data-source-ref]')) {
      if (button.closest?.('.task-workbench')) continue;
      button.addEventListener('click', () => {
        void host.updateModelContext?.({
          structuredContent: {
            package_id: selectedView.package_id,
            view_id: selectedView.view_id ?? selectedView.id,
            ...currentViewInput(selectedView),
            source_ref: button.dataset.sourceRef,
          },
        }).catch(() => {});
        notice('已将此引用加入当前对话上下文');
      });
    }
  }

  function renderCatalog(): void {
    const views = state.catalog?.views || [];
    const products = state.catalog?.products || [];
    const query = state.query.trim().toLocaleLowerCase();
    const selectedView =
      views.find((view) => viewKey(view) === state.selectedKey) || state.selected;
    const runtimeContext = isRuntimeView(selectedView);
    const productViews = views.filter((view) => !isRuntimeView(view));
    const navigationViews = runtimeContext ? views.filter(isRuntimeView) : productViews;
    const selectedPackage = selectedView?.package_id || navigationViews[0]?.package_id;
    const filtered = navigationViews.filter((view) => {
      if (!query) return view.package_id === selectedPackage;
      const vid = view.view_id ?? view.id ?? '';
      return `${view.package_id} ${view.package_name ?? ''} ${vid} ${textLoc(view.title_i18n ?? view.title)} ${view.view_type ?? ''}`
        .toLocaleLowerCase()
        .includes(query);
    });

    const groups = new Map<string, { name: string; views: CatalogViewDescriptor[] }>();
    for (const view of filtered) {
      const packageId = view.package_id;
      if (!groups.has(packageId)) {
        groups.set(packageId, { name: view.package_name || packageId, views: [] });
      }
      groups.get(packageId)!.views.push(view);
    }

    const picker = el('view-select');
    if (picker) {
      picker.innerHTML =
        [...groups.values()]
          .map(
            (group) => `
        <optgroup label="${escape(group.name)}">${group.views
          .map(
            (view) => `
          <option value="${escape(viewKey(view))}" ${viewKey(view) === state.selectedKey ? 'selected' : ''}>${escape(textLoc(view.title_i18n ?? view.title, view.view_id ?? view.id ?? ''))}</option>
        `,
          )
          .join('')}</optgroup>
      `,
          )
          .join('') || '<option value="">没有匹配的功能</option>';
      picker.disabled = !filtered.length;
      picker.onchange = () => selectView(picker.value || '');
    }

    const selectView = (nextKey: string): void => {
      const searchDetails = el('catalog-search');
      if (searchDetails) searchDetails.open = false;
      state.selectedKey = nextKey;
      writeStoredJson(storage, 'opl-apps-selected', state.selectedKey);
      state.itemId = '';
      renderCatalog();
      void loadSelected();
    };

    const entries: readonly CatalogProductSummary[] = products.length
      ? products
      : [
          ...new Map(
            productViews.map((view) => [
              view.package_id,
              {
                package_id: view.package_id,
                package_name: view.package_name || view.package_id,
              },
            ]),
          ).values(),
        ];

    const productPickerWrap = el('product-picker');
    if (productPickerWrap) productPickerWrap.hidden = runtimeContext;
    const runtimeBadge = el('runtime-context');
    if (runtimeBadge) runtimeBadge.hidden = !runtimeContext;
    const catalogSearch = el('catalog-search');
    if (catalogSearch) catalogSearch.hidden = runtimeContext;
    const viewPickerSpan = el('view-picker')?.querySelector('span');
    if (viewPickerSpan) viewPickerSpan.textContent = runtimeContext ? '任务视图' : '功能';

    const productPicker = el('product-select');
    if (productPicker) {
      productPicker.innerHTML =
        entries
          .map(
            (product) =>
              `<option value="${escape(product.package_id)}" ${product.package_id === selectedPackage ? 'selected' : ''}>${escape(product.package_name)}</option>`,
          )
          .join('') || '<option value="">暂无可用应用</option>';
      productPicker.disabled = !entries.length;
      productPicker.onchange = () => {
        const chosenId = productPicker.value || '';
        const product = entries.find((entry) => entry.package_id === chosenId);
        const entry =
          views.find(
            (view) =>
              view.package_id === chosenId
              && (view.view_id ?? view.id) === product?.entry_view_id,
          ) || views.find((view) => view.package_id === chosenId);
        if (!entry) return;
        state.query = '';
        const searchEl = el('search');
        if (searchEl) searchEl.value = '';
        selectView(viewKey(entry));
      };
    }

    const selectedProduct = entries.find((product) => product.package_id === selectedPackage);
    const productSummaryEl = el('product-summary');
    if (productSummaryEl) {
      productSummaryEl.textContent = runtimeContext
        ? '由首页“运行状态”打开的任务工作台。'
        : textLoc(
            selectedProduct?.package_summary_i18n
              || selectedProduct?.package_description_i18n,
          );
    }
    const viewsLabelEl = el('views-label');
    if (viewsLabelEl) {
      viewsLabelEl.textContent = runtimeContext
        ? '任务工作台'
        : query
          ? '搜索结果 · 所有应用'
          : '应用功能';
    }
    const viewsContainer = el('views');
    if (viewsContainer) {
      viewsContainer.innerHTML =
        [...groups.entries()]
          .map(([packageId, group]) => {
            const product = entries.find((entry) => entry.package_id === packageId);
            const heading = runtimeContext
              ? '任务工作台'
              : product?.entry_kind === 'runtime_view'
                ? '任务与进度'
                : group.name;
            return `<section class="package-group" aria-label="${escape(heading)}">
        <h2>${escape(heading)}<small>${escape(String(group.views.length))}</small></h2>
        ${group.views
          .map(
            (view) => `
          <button class="view-button" type="button" data-key="${escape(viewKey(view))}" aria-current="${viewKey(view) === state.selectedKey ? 'page' : 'false'}">
            <span>${escape(textLoc(view.title_i18n ?? view.title, view.view_id ?? view.id ?? ''))}</span>
          </button>
        `,
          )
          .join('')}
      </section>`;
          })
          .join('') || '<div class="catalog-empty">没有匹配的功能</div>';

      for (const button of viewsContainer.querySelectorAll('[data-key]')) {
        button.addEventListener('click', () => {
          if (button.dataset.key) selectView(button.dataset.key);
        });
      }
    }

    const productCountEl = el('product-count');
    if (productCountEl) {
      productCountEl.textContent = entries.length ? `${entries.length} 个` : '';
    }
    const viewCountEl = el('view-count');
    if (viewCountEl) {
      viewCountEl.textContent = filtered.length ? `${filtered.length} 项` : '';
    }
  }

  function renderHeader(): void {
    const noticeEl = el('notice');
    if (noticeEl) noticeEl.hidden = true;
    const view = state.selected;
    const runtimeContext = isRuntimeView(view);
    const toolbarActions = el('toolbar-actions');
    const hostContainer = el(runtimeContext ? 'app-navigation' : 'view-toolbar');
    if (toolbarActions && hostContainer) hostContainer.append(toolbarActions);
    const viewToolbar = el('view-toolbar');
    if (viewToolbar) viewToolbar.hidden = runtimeContext;

    const titleEl = el('title');
    if (titleEl) {
      titleEl.textContent = runtimeContext
        ? view?.data_ref === 'opl.runtime.v1#item'
          ? '任务工作台'
          : '任务与进度'
        : view
          ? textLoc(view.title_i18n ?? view.title, view.view_id ?? view.id ?? '')
          : 'OPL 能力';
    }

    const guidance = runtimeContext
      ? view?.data_ref === 'opl.runtime.v1#item'
        ? '首页运行状态 → 当前任务详情；查看进度、证据和待人决定。'
        : '全局任务总览请从首页“运行状态”进入。'
      : view?.presentation_mode === 'dedicated_app'
        ? '共享概览 · 可进入专用界面继续操作。'
        : view?.presentation_mode === 'professional_app'
          ? '共享概览 · 编辑操作请进入该应用的专业界面。'
          : '';

    const subtitleEl = el('subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = view
        ? [
            view.package_name || view.package_id,
            guidance || textLoc(view.package_summary_i18n || view.package_description_i18n),
          ]
            .filter(Boolean)
            .join(' · ')
        : '';
    }

    const dedicatedBtn = el('dedicated');
    if (dedicatedBtn) {
      const safeDedicatedUri = dedicatedResourceUrl(view?.dedicated_resource_uri);
      dedicatedBtn.hidden = !safeDedicatedUri;
      dedicatedBtn.onclick = () =>
        void run(async () => {
          const baseUri = dedicatedResourceUrl(view?.dedicated_resource_uri);
          if (!baseUri) {
            throw new Error('专用界面链接无效或不受支持。');
          }
          const collection = collectionFrom(state.result);
          const selected =
            collection.items.find((item, index) => itemIdentity(item, index) === state.itemId)
            || collection.items[0]
            || {};
          const navigation = { ...currentViewInput(view!), ...selected };
          const refs = buildDedicatedNavigationRefs(navigation);
          const targetUrl = new URL(baseUri);
          targetUrl.hash = encodeURIComponent(JSON.stringify(refs));
          const res = await host.openLink?.({
            url: targetUrl.href,
          });
          if (res?.isError) {
            throw new Error('专用界面尚未连接，请刷新应用目录或在应用管理中检查连接。');
          }
        });
    }
  }

  function renderCollection(
    view: CatalogViewDescriptor,
    collection: ExtractedCollection,
  ): string {
    const items = collection.items;
    if (!items.length) {
      return `<div class="empty">${escape(textLoc(view.empty_state_i18n ?? view.empty_state, collection.reason || '当前没有条目'))}</div>
        <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
    }
    const selectedId = state.itemId || itemIdentity(items[0]!, 0);
    const current =
      items.find((item, index) => itemIdentity(item, index) === selectedId) || items[0]!;
    const currentId = itemIdentity(current, 0);
    return `
      <div class="collection">
        <div class="items" role="list">
          ${items
            .map((item, index) => {
              const id = itemIdentity(item, index);
              return `<button class="item-button" type="button" data-item-id="${escape(id)}" aria-current="${id === currentId ? 'true' : 'false'}">
              <strong>${escape(itemTitle(item, index, getLocale()))}</strong>
              ${itemSummary(item, getLocale()) ? `<small>${escape(itemSummary(item, getLocale()))}</small>` : ''}
              ${item.status ? `<small>${escape(statusLabel(item.status))}</small>` : ''}
            </button>`;
            })
            .join('')}
        </div>
        <div class="card detail">${renderOwnerView(view, current)}${view.data_ref === 'opl.runtime.v1#work-items' ? `<button class="dsh-button action" data-open-task="${escape(current.id)}">打开任务工作台</button>` : ''}</div>
      </div>
      <div class="detail-actions">${renderActionButtons(view, collection, current)}</div>
    `;
  }

  async function executeRuntimeAction(
    command: CatalogCommandDescriptor | undefined,
  ): Promise<void> {
    if (!command || state.executing || !state.selected) return;
    const view = state.selected;
    const input = { ...(command.input ?? {}) };
    const review = asRecord(currentViewInput(view).review_context);
    const defaults = {
      ...(command.defaults || {}),
      ...(review ? { review_context: review } : {}),
    };
    const needsPayload =
      command.input_schema?.additionalProperties === true
      && !command.input_schema?.properties;
    const schema: InputFieldSchema | undefined = needsPayload
      ? {
          type: 'object',
          properties: { payload: { type: 'object', title: '操作参数' } },
        }
      : command.input_schema;
    const body = el('body');
    if (body && (needsPayload || Object.keys(schema?.properties || {}).length)) {
      const previous = body.querySelector('[data-runtime-form]');
      previous?.remove?.();
      if (doc) {
        const formHost = doc.createElement('form');
        formHost.className = 'form-grid';
        formHost.dataset.runtimeForm = command.command_id;
        formHost.innerHTML = `<h3>${escape(textLoc(command.label_i18n ?? command.label, command.command_id))}</h3>${command.summary ? `<p>${escape(command.summary)}</p>` : ''}${renderInputFields(schema, needsPayload ? { payload: defaults } : defaults)}<div><button type="button" data-submit class="dsh-button action">继续</button></div>`;
        body.append(formHost);
        bindFormSubmit(formHost, () => {
          void run(async () => {
            const values = readInputFields(
              formHost as unknown as FormElementLike,
              needsPayload ? { payload: defaults } : defaults,
            );
            await executeCommand(
              command,
              { ...input, payload: needsPayload ? values.payload : values },
              view,
            );
          });
        });
        formHost.querySelector('input,textarea,select')?.focus?.();
        return;
      }
    }
    await executeCommand(
      command,
      { ...input, ...(Object.keys(defaults).length ? { payload: defaults } : {}) },
      view,
    );
  }

  function updateContext(): void {
    const view = state.selected;
    if (!view) return;
    const collection = collectionFrom(state.result);
    const items = collection.state === 'ready' ? collection.items : [];
    const selected =
      items.find((item, index) => itemIdentity(item, index) === state.itemId) || items[0];
    const viewTitle = textLoc(view.title_i18n ?? view.title, view.view_id ?? view.id ?? '');
    const context = `正在查看 ${view.package_name || view.package_id} 的 ${viewTitle}`;
    void host.updateModelContext?.({
      content: [{ type: 'text', text: context }],
      structuredContent: {
        navigation: {
          package_id: view.package_id,
          view_id: view.view_id ?? view.id,
          input: currentViewInput(view),
        },
        package_id: view.package_id,
        view_id: view.view_id ?? view.id,
        input: currentViewInput(view),
        selection: selected || collection.root,
        ...(state.lastAction ? { last_action: state.lastAction } : {}),
      },
    }).catch(() => {});
    doc?.body.setAttribute('data-llm', context);
  }

  function renderResult(): void {
    disposeWorkbench();
    disposeWorkbench = () => {};
    const body = el('body');
    if (!body) return;

    const view = state.selected;
    if (!view) {
      body.innerHTML =
        '<div class="empty">这里还没有可查看的应用。请到应用管理安装或启用应用，再刷新目录。</div>';
      return;
    }
    if (!state.result) {
      body.innerHTML = '<div class="loading">正在读取数据…</div>';
      return;
    }
    const collection = collectionFrom(state.result);
    if (collection.state !== 'ready') {
      body.innerHTML = `<div class="empty">${escape(collection.reason || '当前视图不可用')}</div>
        ${collection.state === 'input_required' ? renderReadInputForm(collection) : ''}
        ${collection.items.length ? `<div class="card detail">${collection.items.map((item) => renderOwnerView(view, item)).join('')}</div>` : ''}`;
    } else if (
      view.data_ref === 'opl.runtime.v1#item'
      && asRecord(collection.data.detail)?.item_id
    ) {
      const item = asRecord(collection.data.detail) as unknown as TaskWorkbenchItem;
      if (collection.items[0]) rememberWorkspaceSelection(collection.items[0]);
      disposeWorkbench = mountTaskWorkbench({
        container: body,
        doc,
        item,
        initialViewId:
          typeof currentViewInput(view).domain_view_id === 'string'
            ? (currentViewInput(view).domain_view_id as string)
            : undefined,
        actions: item.runtime_actions || [],
        onAction: (cmd) => void executeRuntimeAction(cmd),
        onOpenLink: (url) => void openLink(url),
        readActions: async () => {
          const res = collectionFrom(
            await callTool(READ_TOOL, {
              package_id: 'opl-runtime',
              ref: 'opl.runtime.v1#item',
              input: { item_id: item.item_id, include_runtime_actions: true },
            }),
          );
          const detail = asRecord(res.data.detail);
          if (
            res.state !== 'ready'
            || detail?.item_id !== item.item_id
            || detail?.runtime_actions_unavailable
          ) {
            throw new Error('操作暂时无法读取，请重试。');
          }
          return Array.isArray(detail.runtime_actions)
            ? (detail.runtime_actions as unknown[]).map(normalizeCommandDescriptor)
            : [];
        },
        relatedViews: (state.catalog?.views || []).filter(
          (entry) =>
            entry.scope === 'work_item' && entry.agent_id === item.identity?.agent_id,
        ),
        onOpenView: (target) => {
          state.selectedKey = viewKey(target);
          state.focusKey = viewKey(target);
          state.focusInput = {
            work_item_identity: collection.items[0]?.work_item_identity,
            workspace_path: item.identity?.workspace_path,
            work_item_root: item.identity?.work_item_root,
          };
          void loadSelected();
        },
        read: async (input) =>
          asRecord(
            collectionFrom(
              await callTool(READ_TOOL, {
                package_id: 'opl-runtime',
                ref: 'opl.runtime.v1#domain-detail',
                input,
              }),
            ).data.detail,
          ),
        onContext: (selection) => {
          void host.updateModelContext?.({
            content: [
              {
                type: 'text',
                text: `正在查看任务 ${item.identity?.work_item_display_name ?? item.item_id}`,
              },
            ],
            structuredContent: selection,
          }).catch(() => {});
        },
      });
    } else if (collection.root.trajectory) {
      try {
        const snapshot = parseContributionTrajectory(
          collection.root,
          currentViewInput(view).work_item_identity,
        );
        const phase = asRecord(collection.root.phase);
        disposeWorkbench = mountTaskWorkbench({
          container: body,
          doc,
          snapshot,
          ownerDetails: collection.root,
          item: {
            item_id: String(collection.root.item_id ?? ''),
            identity: asRecord(collection.root.identity) ?? undefined,
            lifecycle: { primary_state_label: phase?.business_status },
            stage_map: phase?.stage_id
              ? [{ stage_id: phase.stage_id, state: phase.stage_status }]
              : [],
            source_refs: Array.isArray(collection.root.source_refs)
              ? collection.root.source_refs
              : [],
          },
          onContext: (selection) => {
            void host.updateModelContext?.({ structuredContent: selection }).catch(() => {});
          },
        });
      } catch {
        body.innerHTML =
          '<p role="alert">任务路径视图不可用，请核对任务与数据格式。</p>';
      }
    } else if (collection.items.length) {
      body.innerHTML = renderCollection(view, collection);
    } else if (collection.itemsPresent) {
      body.innerHTML = `<div class="empty">${escape(textLoc(view.empty_state_i18n ?? view.empty_state, '当前没有条目'))}</div>
        <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
    } else {
      body.innerHTML = `<div class="card detail">${renderOwnerView(view, collection.root)}</div>
        <div class="detail-actions">${renderActionButtons(view, collection)}</div>`;
    }

    if (typeof collection.root.summary === 'string') {
      body.insertAdjacentHTML?.('afterbegin', `<p>${escape(collection.root.summary)}</p>`);
    }

    const current =
      collection.items.find((item, index) => itemIdentity(item, index) === state.itemId)
      || collection.items[0];
    const handoff = resolveViewHandoff(
      (current?.runtime_handoff
        || collection.data.runtime_handoff
        || collection.root.runtime_handoff) as Parameters<typeof resolveViewHandoff>[0],
      state.catalog?.views || [],
    );
    if (handoff && doc) {
      const button = doc.createElement('button');
      button.className = 'action';
      button.setAttribute('type', 'button');
      button.textContent = '返回原任务继续';
      button.addEventListener('click', () => {
        state.selectedKey = viewKey(handoff.view);
        state.focusKey = state.selectedKey;
        state.focusInput = handoff.input;
        state.itemId = '';
        void loadSelected();
      });
      body.append(button);
    }

    for (const button of body.querySelectorAll('[data-item-id]')) {
      button.addEventListener('click', () => {
        state.itemId = button.dataset.itemId || '';
        const items = collectionFrom(state.result).items;
        const selected = items.find(
          (item, index) => itemIdentity(item, index) === state.itemId,
        );
        if (selected) rememberWorkspaceSelection(selected);
        if (selected && view.data_ref === 'opl.runtime.v1#work-items') {
          state.focusKey = 'opl-runtime:opl.runtime.item';
          state.focusInput = { item_id: selected.id };
        }
        renderResult();
        updateContext();
      });
    }

    for (const button of body.querySelectorAll('[data-open-task]')) {
      button.addEventListener('click', () => {
        state.selectedKey = 'opl-runtime:opl.runtime.item';
        state.focusKey = 'opl-runtime:opl.runtime.item';
        state.focusInput = { item_id: button.dataset.openTask };
        void loadSelected();
      });
    }

    bindPresentationLinks();
    bindActionButtons(view, collection);
    bindForms(view);
    bindReadInputForm();
  }

  async function loadSelectedInternal(fromExecute = false): Promise<void> {
    if (destroyed) return;
    if (!fromExecute) {
      state.executing = false;
      activeExecution = null;
      el('body')?.removeAttribute('aria-busy');
    }
    const generation = ++readGeneration;
    const previousItems = collectionFrom(state.result).items;
    const previous =
      previousItems.find((item, index) => itemIdentity(item, index) === state.itemId)
      || previousItems[0];
    if (previous) rememberWorkspaceSelection(previous);

    const view =
      (state.catalog?.views || []).find((entry) => viewKey(entry) === state.selectedKey)
      || defaultCatalogView(state.catalog)
      || null;
    state.selected = view;
    state.selectedKey = view ? viewKey(view) : '';
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

    await run(
      async () => {
        const statusEl = el('status');
        if (statusEl) statusEl.textContent = '正在读取';
        const result = await callTool(READ_TOOL, {
          package_id: view.package_id,
          ref: view.data_ref,
          input,
        });
        if (generation !== readGeneration || destroyed) return;
        state.result = result;
        if (statusEl) statusEl.textContent = '已连接';
        renderResult();
        updateContext();
      },
      (error) => {
        if (generation !== readGeneration || destroyed) return;
        const msg = error instanceof Error ? error.message : String(error);
        state.result = { result: { state: 'unavailable', reason: msg } };
        const statusEl = el('status');
        if (statusEl) statusEl.textContent = '读取失败';
        renderResult();
        updateContext();
      },
    );
  }

  async function loadSelected(): Promise<void> {
    return loadSelectedInternal(false);
  }

  async function executeCommand(
    command: CatalogCommandDescriptor,
    input: Record<string, unknown>,
    view: CatalogViewDescriptor | null = state.selected,
  ): Promise<void> {
    if (!view || state.executing) return;
    const targetInput = structuredClone(input);
    const targetReadInput = structuredClone(currentViewInput(view));
    const generation = readGeneration;
    const selectedItemId = state.itemId;
    const stillSelected = (): boolean =>
      state.selected === view
      && generation === readGeneration
      && selectedItemId === state.itemId;

    const token = Symbol('executeCommand');
    activeExecution = { token, view };
    state.executing = true;
    let dispatched = false;
    let outcomeUnknown = false;
    const confirmReq = Boolean(command.confirmation_required ?? command.confirm);

    try {
      if (confirmReq && !(await confirmCommand(command, view, targetInput))) {
        return;
      }
      if (!stillSelected()) {
        throw new Error('当前视图已改变，请在目标任务中重新选择操作。');
      }
      const statusEl = el('status');
      const bodyEl = el('body');
      if (statusEl) statusEl.textContent = '正在执行';
      bodyEl?.setAttribute('aria-busy', 'true');
      dispatched = true;

      const payload = await callTool(EXECUTE_TOOL, {
        package_id: view.package_id,
        ref: command.action_ref,
        input: targetInput,
        confirmed: confirmReq,
      });
      const envelope = extractEnvelope(payload);
      if (envelope?.confirmation_required && !envelope?.response) {
        throw new Error('该操作需要明确确认');
      }
      const responseObj = asRecord(envelope?.response);
      if (responseObj?.ok === false) {
        const errObj = asRecord(responseObj.error);
        throw new Error(
          (typeof errObj?.message === 'string' && errObj.message) || '操作未完成',
        );
      }
      const result = ownerResult(envelope);
      const execution =
        asRecord(result?.execution)
        || asRecord(asRecord(result?.runtime_operator_action_execution)?.execution);
      const ownerState =
        typeof result?.state === 'string'
          ? result.state
          : typeof execution?.execution_status === 'string'
            ? execution.execution_status
            : undefined;
      const readbackRequest = ownerReadbackRequest(
        view,
        targetInput,
        result as { readback?: { data_ref?: string; input?: unknown } },
        state.catalog?.views || [],
      );
      if (stillSelected()) {
        state.lastAction = {
          package_id: view.package_id,
          view_id: view.view_id ?? view.id,
          action_ref: command.action_ref,
          input: targetInput,
          result,
          readback: readbackRequest,
        };
        void host.updateModelContext?.({
          structuredContent: { last_action: state.lastAction },
        }).catch(() => {});
        await loadSelectedInternal(true);
        if (state.selected === view && selectedItemId === state.itemId) {
          notice(
            ownerState && ['running', 'queued', 'started', 'accepted'].includes(ownerState)
              ? '工作已提交，请查看当前进度'
              : '已收到操作结果，请核对当前状态',
          );
        }
      }
    } catch (error) {
      outcomeUnknown = dispatched;
      if (dispatched) {
        const reqId =
          typeof targetInput.request_id === 'string' || typeof targetInput.request_id === 'number'
            ? { request_id: targetInput.request_id }
            : {};
        if (stillSelected()) {
          state.lastAction = {
            package_id: view.package_id,
            view_id: view.view_id ?? view.id,
            action_ref: command.action_ref,
            input: targetInput,
            outcome: 'unknown',
            readback: {
              package_id: view.package_id,
              ref: view.data_ref,
              input: { ...targetReadInput, ...reqId },
            },
          };
          void host.updateModelContext?.({
            structuredContent: { last_action: state.lastAction },
          }).catch(() => {});
        }

        try {
          const readback = await callTool(READ_TOOL, {
            package_id: view.package_id,
            ref: view.data_ref,
            input: { ...targetReadInput, ...reqId },
          });
          if (stillSelected()) {
            state.result = readback;
            renderResult();
            updateContext();
          }
        } catch {
          // Keep original owner error; failed read cannot establish write outcome.
        }
      }
      if (stillSelected()) {
        const msg =
          error instanceof Error && error.message ? error.message : '操作结果尚未确认';
        notice(
          `${msg}${dispatched ? '；已尝试读取原目标状态，请核对后再操作。' : ''}`,
          true,
        );
      }
    } finally {
      if (activeExecution?.token === token) {
        state.executing = false;
        activeExecution = null;
        el('body')?.removeAttribute('aria-busy');
      }
      if (stillSelected()) {
        const statusEl = el('status');
        if (statusEl) {
          statusEl.textContent = outcomeUnknown ? '操作结果待核对' : '已连接';
        }
      }
    }
  }

  function applyHostContext(context: McpAppHostContext): void {
    if (context.theme) options.applyTheme?.(context.theme);
    if (doc) {
      doc.body.toggleAttribute?.(
        'data-ds-dark-theme',
        doc.documentElement.dataset.theme === 'dark',
      );
      if (context.locale) doc.documentElement.lang = context.locale;
      if (context.displayMode) doc.documentElement.dataset.displayMode = context.displayMode;
    }
    if (context.styles?.variables) {
      options.applyStyleVariables?.(context.styles.variables);
    }
    if (context.styles?.css?.fonts) {
      options.applyFonts?.(context.styles.css.fonts);
    }
    const fullscreenBtn = el('fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.hidden =
        Array.isArray(context.availableDisplayModes)
        && !context.availableDisplayModes.includes('fullscreen');
      fullscreenBtn.textContent =
        context.displayMode === 'fullscreen' ? '收起' : '展开';
    }
  }

  function handleToolResult(params: McpAppToolCallResult): void {
    const payload = asRecord(params?.structuredContent);
    if (params?.isError) {
      ++readGeneration;
      state.executing = false;
      activeExecution = null;
      el('body')?.removeAttribute('aria-busy');
      disposeWorkbench();
      disposeWorkbench = () => {};
      const statusEl = el('status');
      const bodyEl = el('body');
      const errObj = asRecord(payload?.error);
      if (statusEl) statusEl.textContent = '读取失败';
      if (bodyEl) {
        bodyEl.textContent =
          (typeof errObj?.message === 'string' && errObj.message)
          || '当前视图读取失败，请重新选择目标';
      }
      return;
    }

    const rawCatalog = asRecord(payload?.opl_mcp_app_catalog);
    if (rawCatalog) {
      ++readGeneration;
      state.executing = false;
      activeExecution = null;
      el('body')?.removeAttribute('aria-busy');
      const catalog = normalizeCatalog(rawCatalog);
      state.catalog = catalog;
      const focus = asRecord(catalog.focus) || {};
      const focusPkgId = typeof focus.package_id === 'string' ? focus.package_id : '';
      const focusViewId = typeof focus.view_id === 'string' ? focus.view_id : '';
      const focusedView = focusPkgId
        ? focusViewId
          ? catalog.views.find(
              (view) =>
                view.package_id === focusPkgId
                && (view.view_id ?? view.id) === focusViewId,
            )
          : catalog.views.find(
              (view) =>
                view.package_id === focusPkgId && view.entry_kind === 'product_entry',
            ) || catalog.views.find((view) => view.package_id === focusPkgId)
        : undefined;
      state.focusKey = focusedView
        ? viewKey(focusedView)
        : focusPkgId && focusViewId
          ? `${focusPkgId}:${focusViewId}`
          : '';
      state.focusInput = asRecord(focus.input) || {};
      state.selected = focusedView || defaultCatalogView(catalog);
      state.selectedKey = state.selected ? viewKey(state.selected) : '';
      state.itemId = '';
      state.result = payload?.opl_app_contribution ? payload : null;
      renderHeader();
      renderCatalog();
      renderResult();
      const statusEl = el('status');
      if (statusEl) {
        statusEl.textContent = state.selected ? '已连接' : '没有可用视图';
      }
      if (state.result) {
        updateContext();
      } else if (state.selected) {
        void loadSelected();
      }
    }
  }

  const onConfirmCancel = () => el('confirmation')?.close?.('cancel');
  const onConfirmSubmit = () => el('confirmation')?.close?.('confirm');
  const onSearchInput = (rawEvent: unknown) => {
    const event = rawEvent as DomEventLike;
    state.query = event.currentTarget?.value ?? '';
    renderCatalog();
  };
  const onRefresh = () => void loadSelected();
  const onFullscreen = () => {
    const current = doc?.documentElement.dataset.displayMode;
    void host
      .requestDisplayMode?.({ mode: current === 'fullscreen' ? 'inline' : 'fullscreen' })
      .catch((error: unknown) => {
        notice(error instanceof Error ? error.message : String(error), true);
      });
  };

  el('confirmation-cancel')?.addEventListener('click', onConfirmCancel);
  el('confirmation-submit')?.addEventListener('click', onConfirmSubmit);
  el('search')?.addEventListener('input', onSearchInput);
  el('refresh')?.addEventListener('click', onRefresh);
  el('fullscreen')?.addEventListener('click', onFullscreen);

  host.ontoolresult = handleToolResult;
  host.onhostcontextchanged = applyHostContext;

  return {
    state,
    getLocale,
    applyHostContext,
    handleToolResult,
    loadSelected,
    executeCommand,
    currentViewInput,
    destroy: () => {
      destroyed = true;
      disposeWorkbench();
      disposeWorkbench = () => {};
      if (noticeTimer !== undefined) clearTimeout(noticeTimer);
      el('confirmation-cancel')?.removeEventListener('click', onConfirmCancel);
      el('confirmation-submit')?.removeEventListener('click', onConfirmSubmit);
      el('search')?.removeEventListener('input', onSearchInput);
      el('refresh')?.removeEventListener('click', onRefresh);
      el('fullscreen')?.removeEventListener('click', onFullscreen);
      if (host.ontoolresult === handleToolResult) host.ontoolresult = null;
      if (host.onhostcontextchanged === applyHostContext) host.onhostcontextchanged = null;
    },
  };
}

export async function mountOplMcpAppView(
  options: CreateViewControllerOptions,
): Promise<OplMcpAppViewController> {
  const controller = createOplMcpAppViewController(options);
  await options.host.connect?.();
  controller.applyHostContext(options.host.getHostContext?.() || {});
  return controller;
}
