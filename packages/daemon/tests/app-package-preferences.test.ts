import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openSqliteStore } from '@opl/core';
import { OplPackageManifestV2Schema } from '@opl/pack';
import {
  initializeAppPackagePreferences, isAppPackageEnabled, readAppPackagePreferences,
  setAppPackageEnabled, setAppShortcutPreference,
} from '../src/state/app-package-preferences.ts';

test('App preferences preserve legacy settings, allow partial shortcut edits and survive restart', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pref-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const id = 'book-tool';
  const label = { 'en-US': 'Books', 'zh-CN': '书稿' };
  const pkg = {
    package_id: id,
    manifest: OplPackageManifestV2Schema.parse({
      schema_version: 'opl.package.v2', identity: { id, name: label, summary: label, version: '1.0.0',
        intent: 'app', publisher: 'Publisher', home_shortcuts: [{ id: 'editor', label, target: { kind: 'command', ref: 'edit' } }] },
    }),
  };
  fs.writeFileSync(path.join(root, 'app-package-preferences.json'), JSON.stringify({ version: 'g1', packages: { [id]: false } }));
  fs.writeFileSync(path.join(root, 'agent-package-home-shortcut-preferences.json'), JSON.stringify({
    version: 'g1', preferences: [{ package_id: id, shortcut_id: 'editor', visible: false, sort_order: 13 }],
  }));
  const file = path.join(root, 'state.sqlite');
  const db = openSqliteStore(file);
  try {
    initializeAppPackagePreferences(db, root);
    assert.equal(isAppPackageEnabled(db, id), false);
    assert.equal(isAppPackageEnabled(db, 'other'), true);
    const toggle = { package_id: id, enabled: true };
    setAppPackageEnabled(db, pkg, toggle, { dryRun: true });
    assert.equal(isAppPackageEnabled(db, id), false);
    setAppPackageEnabled(db, pkg, toggle, { dryRun: false });
    assert.equal(isAppPackageEnabled(db, id), true);
    const shortcut = { package_id: id, shortcut_id: 'editor' };
    setAppShortcutPreference(db, pkg, { ...shortcut, visible: true }, { dryRun: false });
    assert.deepEqual(readAppPackagePreferences(db).shortcuts.get(id)?.get('editor'), { visible: true, sort_order: 13 });
    setAppShortcutPreference(db, pkg, { ...shortcut, sort_order: 1 }, { dryRun: true });
    assert.deepEqual(readAppPackagePreferences(db).shortcuts.get(id)?.get('editor'), { visible: true, sort_order: 13 });
    setAppShortcutPreference(db, pkg, { ...shortcut, sort_order: 1 }, { dryRun: false });
    assert.throws(() => setAppShortcutPreference(db, pkg, { ...shortcut, shortcut_id: 'missing', visible: true }, { dryRun: false }));
    assert.throws(() => setAppShortcutPreference(db, pkg, { ...shortcut, exposure_action: 'disable', visible: true }, { dryRun: false }));
  } finally {
    db.close();
  }
  const reopened = openSqliteStore(file);
  try {
    initializeAppPackagePreferences(reopened, root);
    const state = readAppPackagePreferences(reopened);
    assert.equal(state.enabled.get(id), true);
    assert.deepEqual(state.shortcuts.get(id)?.get('editor'), { visible: true, sort_order: 1 });
  } finally {
    reopened.close();
  }
});
