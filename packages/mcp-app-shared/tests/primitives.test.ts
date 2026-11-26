import assert from 'node:assert/strict';
import test from 'node:test';

import * as rootExports from '../src/index.ts';
import {
  artifactPresentationUrl,
  escape,
  presentationUrl,
  renderOwnerView,
} from '../src/presentation.ts';
import { readInputFields, renderInputFields } from '../src/forms.ts';
import {
  focusedViewInput,
  ownerReadbackRequest,
  resolveViewHandoff,
} from '../src/handoff.ts';
import {
  parseContributionTrajectory,
  parseTrajectorySnapshot,
  renderTrajectory,
} from '../src/trajectory-renderer.ts';
import {
  acceptDomainRead,
  domainViewRenderers,
  mountTaskWorkbench,
  registerDomainViewRenderer,
} from '../src/task-workbench.ts';
import type { ElementLike, FormElementLike } from '../src/types.ts';

test('all @opl/mcp-app-shared subpaths import cleanly in Node without DOM globals', () => {
  assert.equal(typeof rootExports.renderOwnerView, 'function');
  assert.equal(typeof rootExports.renderInputFields, 'function');
  assert.equal(typeof rootExports.resolveViewHandoff, 'function');
  assert.equal(typeof rootExports.parseTrajectorySnapshot, 'function');
  assert.equal(typeof rootExports.mountTaskWorkbench, 'function');
  assert.equal(typeof rootExports.createOplMcpAppViewController, 'function');
  assert.equal(typeof rootExports.OpldContributionBridge, 'function');
  assert.equal(typeof rootExports.connectOpldRpcSession, 'function');
});

test('presentation escapes XSS and renders both v1 and v2 declarative owner views', () => {
  const escaped = escape('<script>alert("xss")</script>');
  assert.equal(escaped.includes('<script>'), false);
  assert.ok(escaped.includes('&lt;script&gt;'));

  assert.equal(presentationUrl('https://user:pass@example.com'), null);
  assert.equal(presentationUrl('javascript:alert(1)'), null);
  assert.equal(presentationUrl('opl-workspace://artifact?ref=/tmp/a.md&bad=1'), null);
  assert.equal(presentationUrl('opl-workspace://artifact?ref=/tmp/a.md&start=5&end=2'), null);
  assert.equal(
    artifactPresentationUrl('/Users/demo/notes/report.md', 1, 10),
    'opl-workspace://artifact?ref=%2FUsers%2Fdemo%2Fnotes%2Freport.md&start=1&end=10',
  );

  const artifactHtml = renderOwnerView(
    { view_type: 'artifact_view' },
    { title: 'Report', path: '/tmp/report.md', status: 'ready' },
  );
  assert.ok(artifactHtml.includes('Report'));
  assert.ok(artifactHtml.includes('data-open-link='));

  const diffHtml = renderOwnerView(
    { view_type: 'approval_diff' },
    { title: 'Draft', preview: { target: 'notes/a.md', before: 'old', after: 'new' } },
  );
  assert.ok(diffHtml.includes('data-change="removed"'));
  assert.ok(diffHtml.includes('data-change="added"'));

  const activityHtml = renderOwnerView(
    { view_type: 'activity_log' },
    {
      title: 'Mail Log',
      events: [{ timestamp: '2026-11-25T10:00:00Z', title: 'Sent', summary: 'OK', source_refs: ['msg:1'] }],
    },
  );
  assert.ok(activityHtml.includes('activity-timeline'));
  assert.ok(activityHtml.includes('data-source-ref="msg:1"'));

  for (const v2Type of ['channel_access', 'service_status', 'list_detail', 'remote_companion_access', 'settings_form']) {
    const html = renderOwnerView({ view_type: v2Type }, { title: `View ${v2Type}`, status: 'active' });
    assert.ok(html.includes(`View ${v2Type}`));
  }
});

test('forms renderInputFields and readInputFields parse nested paths, JSON, line arrays, numbers, and booleans', () => {
  const schema = {
    type: 'object',
    required: ['title'],
    properties: {
      item_id: { type: 'string', title: 'Task ID' },
      title: { type: 'string', title: 'Title' },
      count: { type: 'integer', title: 'Count' },
      enabled: { type: 'boolean', title: 'Enabled' },
      tags: { type: 'array', items: { type: 'string' }, title: 'Tags' },
      nested: {
        type: 'object',
        title: 'Nested',
        properties: {
          mode: { type: 'string', enum: ['fast', 'full'] },
        },
      },
      meta: { type: 'object', title: 'Meta JSON' },
    },
  };
  const html = renderInputFields(schema, { item_id: 'task-1', title: 'Alpha', count: 3, enabled: true });
  assert.ok(html.includes('bound-input'));
  assert.ok(html.includes('required'));
  assert.ok(html.includes('data-line-array="true"'));
  assert.ok(html.includes('data-json="true"'));

  const mockForm: FormElementLike = {
    querySelectorAll: () => [
      { getAttribute: () => JSON.stringify(['title']), value: 'Beta', dataset: { valueType: 'string' } },
      { getAttribute: () => JSON.stringify(['count']), value: '42', dataset: { valueType: 'integer' } },
      { getAttribute: () => JSON.stringify(['enabled']), value: 'on', type: 'checkbox', checked: false, dataset: { valueType: 'boolean' } },
      { getAttribute: () => JSON.stringify(['tags']), value: 'one\n two \n', dataset: { lineArray: 'true' } },
      { getAttribute: () => JSON.stringify(['nested', 'mode']), value: 'full', dataset: { valueType: 'string' } },
      { getAttribute: () => JSON.stringify(['meta']), value: '{"ok":true}', dataset: { json: 'true' } },
    ],
  };

  const parsed = readInputFields(mockForm, { item_id: 'task-1' });
  assert.deepEqual(parsed, {
    item_id: 'task-1',
    title: 'Beta',
    count: 42,
    enabled: false,
    tags: ['one', 'two'],
    nested: { mode: 'full' },
    meta: { ok: true },
  });

  // Prototype pollution path segments are ignored safely without mutating prototypes
  const evilForm: FormElementLike = {
    querySelectorAll: () => [
      { getAttribute: () => JSON.stringify(['__proto__', 'isAdmin']), value: 'true', dataset: { valueType: 'boolean' } },
      { getAttribute: () => JSON.stringify(['constructor', 'prototype', 'polluted']), value: 'yes', dataset: { valueType: 'string' } },
      { getAttribute: () => JSON.stringify(['prototype', 'x']), value: '1', dataset: { valueType: 'string' } },
      { getAttribute: () => JSON.stringify(['safe']), value: 'ok', dataset: { valueType: 'string' } },
    ],
  };
  const safeOut = readInputFields(evilForm);
  assert.deepEqual(safeOut, { safe: 'ok' });
  assert.equal((safeOut as { isAdmin?: unknown }).isAdmin, undefined);
  assert.equal((Object.getPrototypeOf(safeOut) as { isAdmin?: unknown }).isAdmin, undefined);
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
});

test('handoff helpers enforce view scoping and deep-clone inputs', () => {
  const view = { package_id: 'relay', view_id: 'inbox', data_ref: 'relay.v1#inbox' };
  const input = { nested: { rev: 1 } };
  const focused = focusedViewInput(view, 'relay:inbox', input);
  input.nested.rev = 99;
  assert.equal((focused.nested as { rev: number }).rev, 1);
  assert.deepEqual(focusedViewInput({ ...view, id: 'drafts', view_id: 'drafts' }, 'relay:inbox', input), {});

  const statusView = { package_id: 'relay', view_id: 'status', data_ref: 'relay.v1#status' };
  const rb = ownerReadbackRequest(
    view,
    { id: 'x' },
    { readback: { data_ref: 'relay.v1#status', input: { id: 'y' } } },
    [view, statusView],
  );
  assert.deepEqual(rb, { package_id: 'relay', ref: 'relay.v1#status', input: { id: 'y' } });

  const resolved = resolveViewHandoff({ package_id: 'relay', view_id: 'status', input: { a: 1 } }, [view, statusView]);
  assert.equal(resolved?.view.view_id, 'status');
  assert.deepEqual(resolved?.input, { a: 1 });
  assert.equal(resolveViewHandoff({ package_id: 'relay', view_id: 'unknown', input: { a: 1 } }, [view]), null);
});

test('trajectory renderer and mountTaskWorkbench run safely in Node without global document', () => {
  const snapshot = parseTrajectorySnapshot(
    {
      work_item_id: 'wi-1',
      revision: 1,
      summary: { goal: 'Verify trajectory' },
      nodes: [
        { id: 'n1', label: 'Analysis', kind: 'route', status: 'completed', source_refs: ['ref:1'] },
        { id: 'n2', label: 'Review', kind: 'human_gate', status: 'waiting', source_refs: ['ref:2'] },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', kind: 'routes_to', label: 'next', source_refs: ['ref:3'] },
      ],
    },
    'wi-1',
  );
  const svgHtml = renderTrajectory(snapshot, 'n1', 'trajectory');
  assert.ok(svgHtml.includes('trajectory-graph'));
  assert.ok(svgHtml.includes('Analysis'));

  const accepted = acceptDomainRead(
    {
      schema_version: 'opl_domain_detail_view.v1',
      surface_kind: 'opl_domain_detail_view',
      item_id: 'item-1',
      view_id: 'traj',
      view_kind: 'trajectory',
      revision: 1,
      not_modified: false,
      availability: 'available',
      payload_schema_ref: 'traj.schema.json',
      payload: snapshot,
    },
    { item_id: 'item-1', identity: { domain_work_item_id: 'wi-1' } },
    { view_id: 'traj', view_kind: 'trajectory' },
  );
  assert.equal(accepted.revision, 1);

  registerDomainViewRenderer('custom_kind', {
    parse: () => snapshot,
    component: () => '<div>custom</div>',
  });
  assert.ok(domainViewRenderers.custom_kind);

  for (const badKind of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(
      () =>
        registerDomainViewRenderer(badKind, {
          parse: () => snapshot,
          component: () => '<div>bad</div>',
        }),
      /Invalid viewKind/,
    );
  }

  const parsedContribution = parseContributionTrajectory(
    {
      identity: {
        identity_state: 'resolved',
        agent_id: 'mas',
        domain_id: 'mas',
        work_item_id: 'wi-1',
        domain_work_item_id: 'wi-1',
      },
      trajectory: snapshot,
    },
    {
      identity_state: 'resolved',
      agent_id: 'mas',
      domain_id: 'mas',
      work_item_id: 'wi-1',
      domain_work_item_id: 'wi-1',
    },
  );
  assert.equal(parsedContribution.revision, 1);

  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const container: ElementLike = {
    textContent: '',
    innerHTML: '',
    className: '',
    hidden: false,
    dataset: {},
    hasAttribute: () => false,
    getAttribute: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    append: () => {},
    addEventListener: (type, fn) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: (type, fn) => {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((f) => f !== fn));
    },
  };

  const contexts: Record<string, unknown>[] = [];
  const dispose = mountTaskWorkbench({
    container,
    item: { item_id: 'item-1', identity: { work_item_display_name: 'Study 1' } },
    snapshot,
    initialViewId: 'traj',
    onContext: (ctx) => contexts.push(ctx),
  });
  assert.ok(container.innerHTML.includes('Study 1'));
  assert.ok(container.innerHTML.includes('trajectory-graph'));
  dispose();
  assert.equal((listeners.get('click') ?? []).length, 0);
});
