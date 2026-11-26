import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCatalogFromAppState } from '../src/opld-bridge.ts';
import type { DocumentLike, ElementLike, McpAppHostLike } from '../src/types.ts';
import {
  collectionFrom,
  createOplMcpAppViewController,
  createSafeStorage,
  extractEnvelope,
  localized,
  ownerResult,
} from '../src/view.ts';

function createMockElement(tagName = 'DIV'): ElementLike {
  const attrs = new Map<string, string>();
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  return {
    tagName,
    textContent: '',
    innerHTML: '',
    className: '',
    hidden: false,
    disabled: false,
    open: false,
    value: '',
    returnValue: '',
    dataset: {},
    hasAttribute: (name) => attrs.has(name),
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => {
      attrs.set(name, value);
    },
    removeAttribute: (name) => {
      attrs.delete(name);
    },
    toggleAttribute: (name, force) => {
      const next = force ?? !attrs.has(name);
      if (next) attrs.set(name, '');
      else attrs.delete(name);
      return next;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    append: () => {},
    addEventListener: (type, fn) => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener: (type, fn) => {
      const arr = listeners.get(type) ?? [];
      listeners.set(type, arr.filter((f) => f !== fn));
    },
  };
}

function createMockDoc(): DocumentLike {
  const elements = new Map<string, ElementLike>();
  for (const id of [
    'notice',
    'status',
    'body',
    'title',
    'subtitle',
    'dedicated',
    'fullscreen',
    'product-picker',
    'runtime-context',
    'catalog-search',
    'view-picker',
    'product-select',
    'view-select',
    'product-summary',
    'views-label',
    'views',
    'product-count',
    'view-count',
    'search',
    'refresh',
    'confirmation',
    'confirmation-title',
    'confirmation-target',
    'confirmation-cancel',
    'confirmation-submit',
    'toolbar-actions',
    'app-navigation',
    'view-toolbar',
  ]) {
    elements.set(id, createMockElement());
  }
  return {
    documentElement: { lang: 'zh-CN', dataset: {} },
    body: createMockElement('BODY'),
    getElementById: (id) => elements.get(id) ?? null,
    createElement: (tag) => createMockElement(tag.toUpperCase()),
  };
}

function deferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('pure view helpers handle envelope extraction, localization, and storage fallback', () => {
  const throwingStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  };
  const safe = createSafeStorage(throwingStorage);
  safe.setItem('k', 'v');
  assert.equal(safe.getItem('k'), 'v');

  assert.equal(localized({ 'zh-CN': '中文', 'en-US': 'English' }, 'fallback', 'en-US'), 'English');
  assert.equal(localized({ 'zh-CN': '中文', 'en-US': 'English' }, 'fallback', 'zh-CN'), '中文');
  assert.equal(localized({}, 'fallback', 'zh-CN'), 'fallback');

  const env = extractEnvelope({
    opl_app_contribution: {
      response: {
        result: {
          state: 'ready',
          data: { items: [{ id: 'a', title: 'Item A' }] },
        },
      },
    },
  });
  assert.ok(ownerResult(env));
  const col = collectionFrom({
    opl_app_contribution: {
      response: {
        result: {
          state: 'ready',
          data: { items: [{ id: 'a', title: 'Item A' }] },
        },
      },
    },
  });
  assert.equal(col.state, 'ready');
  assert.equal(col.items.length, 1);
});

test('buildCatalogFromAppState converts v2 ui.declarative and ui.mcp_apps into catalog', () => {
  const catalog = buildCatalogFromAppState({
    packages: [
      {
        package_id: 'opl-relay',
        name: 'OPL Relay',
        version: '0.3.0',
        intent: 'app',
        enabled: true,
        identity: {
          id: 'opl-relay',
          version: '0.3.0',
          intent: 'app',
          name: { 'zh-CN': 'OPL Relay', 'en-US': 'OPL Relay' },
          summary: { 'zh-CN': '邮件中继', 'en-US': 'Mail relay' },
        },
        ui: {
          declarative: {
            views: [
              {
                id: 'inbox',
                view_type: 'list_detail',
                slot: 'workbench.panel',
                title: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
                data_ref: 'relay.v1#inbox',
                actions: [
                  {
                    id: 'send',
                    label: { 'zh-CN': '发送', 'en-US': 'Send' },
                    action_ref: 'relay.send',
                    confirm: true,
                  },
                ],
              },
            ],
            settings_forms: [
              {
                id: 'relay-settings',
                destination: 'services',
                title: { 'zh-CN': '通道设置', 'en-US': 'Channel Settings' },
                data_ref: 'relay.v1#settings',
                submit_action_ref: 'relay.settings.save',
              },
            ],
          },
          mcp_apps: [
            {
              id: 'workbench',
              title: { 'zh-CN': '协作工作台', 'en-US': 'Workbench' },
              mcp_server_id: 'relay-mcp',
              resource_uri: 'ui://opl-relay/workbench',
              host_capabilities: ['workspace_read', 'connect_package_grant'],
            },
          ],
        },
      },
      {
        package_id: 'disabled-pkg',
        name: 'Disabled',
        version: '0.1.0',
        intent: 'app',
        enabled: false,
      },
    ],
  });

  assert.equal(catalog.product_count, 1);
  assert.equal(catalog.view_count, 3);
  assert.equal(catalog.views[0]?.view_id, 'inbox');
  assert.equal(catalog.views[0]?.commands[0]?.confirmation_required, true);
  assert.equal(catalog.views[1]?.view_type, 'settings_form');
  assert.equal(catalog.views[2]?.dedicated_resource_uri, 'ui://opl-relay/workbench');
  assert.deepEqual(catalog.views[2]?.host_capabilities, ['workspace_read', 'connect_package_grant']);
});

test('createOplMcpAppViewController preserves executeCommand unknown-outcome readback isolation across selection changes', async () => {
  const doc = createMockDoc();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const write = deferred<{ isError?: boolean; structuredContent?: Record<string, unknown> }>();
  const read = deferred<{ isError?: boolean; structuredContent?: Record<string, unknown> }>();

  const host: McpAppHostLike = {
    callServerTool: async ({ name, arguments: args }) => {
      calls.push({ name, args });
      if (name === 'opl_app_contribution_execute') return write.promise;
      return read.promise;
    },
    updateModelContext: async () => {},
  };

  const controller = createOplMcpAppViewController({
    host,
    doc,
    storage: createSafeStorage(null),
  });

  const view = {
    package_id: 'domain-owner',
    view_id: 'review',
    data_ref: 'domain-owner.v1#review',
    commands: [],
  };
  controller.state.catalog = {
    products: [{ package_id: 'domain-owner', package_name: 'Domain Owner' }],
    views: [view],
  };
  controller.state.selected = view;
  controller.state.selectedKey = 'domain-owner:review';
  controller.state.itemId = 'A';
  controller.state.focusKey = 'domain-owner:review';
  controller.state.focusInput = { item_id: 'A' };
  controller.state.result = { item_id: 'A', state: 'ready' };

  const pending = controller.executeCommand(
    { command_id: 'save', action_ref: 'save', confirmation_required: false },
    { item_id: 'A', request_id: 'request-a' },
    view,
  );

  // Transport lost after dispatch; meanwhile user switches selection to item B
  write.reject(new Error('transport lost after dispatch'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.name, 'opl_app_contribution_execute');
  assert.equal(calls[1]?.name, 'opl_app_contribution_read');
  assert.deepEqual(calls[1]?.args.input, { item_id: 'A', request_id: 'request-a' });

  controller.state.itemId = 'B';
  controller.state.focusInput = { item_id: 'B' };
  controller.state.result = { item_id: 'B', state: 'ready' };

  read.resolve({ isError: false, structuredContent: { item_id: 'A', state: 'ready' } });
  await pending;

  // Selection B must NOT be overwritten by readback for A
  assert.equal((controller.state.result as { item_id: string }).item_id, 'B');
  assert.equal(controller.state.lastAction?.outcome, 'unknown');
  controller.destroy();
});

test('createOplMcpAppViewController rejects unsafe dedicated_resource_uri schemes and isolates executeCommand across view switches', async () => {
  const doc = createMockDoc();
  const openedLinks: string[] = [];
  const contextUpdates: Array<Record<string, unknown>> = [];
  const writeA = deferred<{ isError?: boolean; structuredContent?: Record<string, unknown> }>();

  const host: McpAppHostLike = {
    callServerTool: async ({ name, arguments: args }) => {
      if (name === 'opl_app_contribution_execute' && args.package_id === 'pkg-a') {
        return writeA.promise;
      }
      if (name === 'opl_app_contribution_execute' && args.package_id === 'pkg-b') {
        return { isError: false, structuredContent: { state: 'completed', from: 'pkg-b' } };
      }
      return { isError: false, structuredContent: { state: 'ready', data: { items: [] } } };
    },
    openLink: async ({ url }) => {
      openedLinks.push(url);
      return { isError: false };
    },
    updateModelContext: async (ctx) => {
      if (ctx.structuredContent) contextUpdates.push(ctx.structuredContent);
    },
  };

  const controller = createOplMcpAppViewController({
    host,
    doc,
    storage: createSafeStorage(null),
  });

  const viewEvilUri = {
    package_id: 'pkg-a',
    view_id: 'view-a',
    data_ref: 'pkg-a.v1#a',
    dedicated_resource_uri: 'javascript:alert(1)',
    commands: [{ command_id: 'run-a', action_ref: 'a.run', confirmation_required: false }],
  };
  const viewSafeUri = {
    package_id: 'pkg-b',
    view_id: 'view-b',
    data_ref: 'pkg-b.v1#b',
    dedicated_resource_uri: 'ui://pkg-b/workbench',
    commands: [{ command_id: 'run-b', action_ref: 'b.run', confirmation_required: false }],
  };

  controller.state.catalog = {
    products: [
      { package_id: 'pkg-a', package_name: 'Pkg A', entry_view_id: 'view-a' },
      { package_id: 'pkg-b', package_name: 'Pkg B', entry_view_id: 'view-b' },
    ],
    views: [viewEvilUri, viewSafeUri],
  };

  // 1. javascript: dedicated_resource_uri is hidden and blocked even if onclick invoked
  controller.state.selectedKey = 'pkg-a:view-a';
  await controller.loadSelected();
  const dedicatedBtn = doc.getElementById('dedicated')!;
  assert.equal(dedicatedBtn.hidden, true);
  dedicatedBtn.onclick?.({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(openedLinks.length, 0);

  // 2. Start command on viewA, switch to viewB while in-flight, verify viewB is unblocked and viewA cannot overwrite lastAction
  const pendingA = controller.executeCommand(viewEvilUri.commands[0]!, { step: 1 }, viewEvilUri);
  assert.equal(controller.state.executing, true);

  controller.state.selectedKey = 'pkg-b:view-b';
  await controller.loadSelected();
  assert.equal(controller.state.executing, false);
  assert.equal(dedicatedBtn.hidden, false);
  dedicatedBtn.onclick?.({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(openedLinks.length, 1);
  assert.ok(openedLinks[0]?.startsWith('ui://pkg-b/workbench#'));

  await controller.executeCommand(viewSafeUri.commands[0]!, { step: 2 }, viewSafeUri);
  assert.equal(controller.state.lastAction?.package_id, 'pkg-b');
  assert.equal(controller.state.lastAction?.action_ref, 'b.run');

  // Now viewA completes late; must NOT overwrite viewB's lastAction or push viewA's last_action context
  writeA.resolve({ isError: false, structuredContent: { state: 'completed', from: 'pkg-a' } });
  await pendingA;
  assert.equal(controller.state.lastAction?.package_id, 'pkg-b');
  assert.equal(controller.state.lastAction?.action_ref, 'b.run');
  assert.equal(
    contextUpdates.some(
      (ctx) => (ctx.last_action as { package_id?: string } | undefined)?.package_id === 'pkg-a',
    ),
    false,
  );
  controller.destroy();
});

test('createOplMcpAppViewController selects target package entry view for package-only open_opl_apps focus', async () => {
  const doc = createMockDoc();
  const readInputs: Array<{ package_id: unknown; ref: unknown; input: unknown }> = [];

  const host: McpAppHostLike = {
    callServerTool: async ({ name, arguments: args }) => {
      if (name === 'opl_app_contribution_read') {
        readInputs.push({
          package_id: args.package_id,
          ref: args.ref,
          input: args.input,
        });
      }
      return { isError: false, structuredContent: { state: 'ready', data: { items: [] } } };
    },
    updateModelContext: async () => {},
  };

  const controller = createOplMcpAppViewController({
    host,
    doc,
    storage: createSafeStorage(null),
  });

  // 1. package_id without view_id picks that package's product_entry view (even if another package or non-entry view precedes it)
  controller.handleToolResult({
    isError: false,
    structuredContent: {
      opl_mcp_app_catalog: {
        products: [
          { package_id: 'pkg-first', package_name: 'First Package', entry_view_id: 'first-entry' },
          { package_id: 'opl-relay', package_name: 'OPL Relay', entry_view_id: 'inbox' },
        ],
        views: [
          {
            package_id: 'pkg-first',
            view_id: 'first-entry',
            entry_kind: 'product_entry',
            data_ref: 'first.v1#entry',
            commands: [],
          },
          {
            package_id: 'opl-relay',
            view_id: 'relay-settings',
            entry_kind: 'settings_form',
            data_ref: 'relay.v1#settings',
            commands: [],
          },
          {
            package_id: 'opl-relay',
            view_id: 'inbox',
            entry_kind: 'product_entry',
            data_ref: 'relay.v1#inbox',
            commands: [],
          },
        ],
        focus: {
          package_id: 'opl-relay',
          input: { scope: 'pkg_only' },
        },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.state.selected?.package_id, 'opl-relay');
  assert.equal(controller.state.selected?.view_id, 'inbox');
  assert.equal(controller.state.selectedKey, 'opl-relay:inbox');
  assert.equal(controller.state.focusKey, 'opl-relay:inbox');
  assert.equal(readInputs.length, 1);
  assert.equal(readInputs[0]?.package_id, 'opl-relay');
  assert.equal(readInputs[0]?.ref, 'relay.v1#inbox');
  assert.deepEqual(readInputs[0]?.input, { scope: 'pkg_only' });

  // 2. When target package has no product_entry view, selects its first matching view rather than defaultCatalogView
  controller.handleToolResult({
    isError: false,
    structuredContent: {
      opl_mcp_app_catalog: {
        products: [
          { package_id: 'pkg-first', package_name: 'First Package', entry_view_id: 'first-entry' },
          { package_id: 'pkg-aux', package_name: 'Aux Package' },
        ],
        views: [
          {
            package_id: 'pkg-first',
            view_id: 'first-entry',
            entry_kind: 'product_entry',
            data_ref: 'first.v1#entry',
            commands: [],
          },
          {
            package_id: 'pkg-aux',
            view_id: 'aux-detail',
            entry_kind: 'declarative_view',
            data_ref: 'aux.v1#detail',
            commands: [],
          },
        ],
        focus: {
          package_id: 'pkg-aux',
          input: { tab: 'overview' },
        },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.state.selected?.package_id, 'pkg-aux');
  assert.equal(controller.state.selected?.view_id, 'aux-detail');
  assert.equal(controller.state.selectedKey, 'pkg-aux:aux-detail');
  assert.equal(controller.state.focusKey, 'pkg-aux:aux-detail');
  assert.equal(readInputs.length, 2);
  assert.deepEqual(readInputs[1]?.input, { tab: 'overview' });

  controller.destroy();
});
