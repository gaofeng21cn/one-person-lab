import assert from 'node:assert/strict';
import test from 'node:test';
import type { OplPackageManifestV2 } from '@opl/pack';
import { projectUiContributions } from '../src/state/ui-projection.ts';

test('enabled v2 declarations bind to the App slots and owner requests', () => {
  const title = { 'en-US': 'Review', 'zh-CN': '审阅' };
  const manifest: OplPackageManifestV2 = {
    schema_version: 'opl.package.v2',
    identity: { id: 'sample', version: '1.0.0', intent: 'app', publisher: 'sample', name: title, summary: title },
    ui: { declarative: {
      views: [
        { id: 'sample.panel', slot: 'workbench.panel', view_type: 'approval_diff', title, data_ref: 'panel' },
        { id: 'sample.detail', slot: 'runtime.detail', view_type: 'list_detail', title, data_ref: 'detail',
          actions: [{ id: 'sample.approve', label: title, action_ref: 'review.approve', confirm: true }], sort_order: 2 },
      ],
      settings_forms: [{ id: 'sample.form', destination: 'workspace', title, data_ref: 'settings', submit_action_ref: 'settings.save' }],
    } },
  };
  const rows = projectUiContributions([
    { package_id: 'sample', enabled: true, manifest },
    { package_id: 'disabled', enabled: false, manifest },
  ]);
  assert.equal(rows.surface_kind, 'opl_app_ui_contributions_projection.v1');
  assert.deepEqual(rows.entries.map(entry => entry.contribution_key), ['sample:sample.form', 'sample:sample.detail']);
  const [form] = rows.slots['settings.section'];
  assert.equal(form?.view.view_type, 'settings_form');
  assert.equal(form?.view.settings_destination, 'workspace');
  assert.equal(form?.commands[0]?.action_ref, 'settings.save');
  const [detail] = rows.slots['runtime.detail'];
  assert.deepEqual(detail?.commands, [{ command_id: 'sample.approve', action_ref: 'review.approve', label_i18n: title, confirmation_required: true }]);
  assert.equal(detail?.view.data_ref, 'detail');
  assert.deepEqual(rows.slots['composer.palette'], []);
});
