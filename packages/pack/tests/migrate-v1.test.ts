import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { PackError, buildPackage, createPackService, migrateV1Package } from '../src/index.ts';

test('migrated Settings forms preserve the owner command identifier, ref and confirmation', (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-settings-migration-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repoDir, 'bin'));
  fs.writeFileSync(path.join(repoDir, 'bin', 'sample'), '#!/bin/sh\n');
  const label = { 'en-US': 'Save settings', 'zh-CN': '保存配置' };
  fs.writeFileSync(path.join(repoDir, 'opl-package.json'), JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1', package_id: 'sample', version: '1.0.0',
    app_contributions: {
      views: [{
        view_id: 'settings', view_type: 'settings_form', settings_destination: 'capabilities',
        title_i18n: label, data_ref: 'sample.settings#state', command_ids: ['save-settings'],
      }],
      commands: [{
        command_id: 'save-settings', action_ref: 'sample.settings#save', label_i18n: label, confirmation_required: true,
      }],
    },
  }));
  const form = migrateV1Package({ repoDir, apply: false }).manifest.ui?.declarative?.settings_forms?.[0];
  assert.equal(form?.submit_action_ref, 'sample.settings#save');
  assert.deepEqual(form?.actions?.map(command => [command.id, command.confirm]), [['save-settings', true]]);
});

test('migrateV1Package handles all E2E-M2 cases: string[] requires, blank extra_entrypoints, cli->cli_bin, declarative.navigation, nested plugins/<name>/', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-mig-'));
  const repoDir = path.join(tmpDir, 'synthetic-repo');
  const nestedDir = path.join(repoDir, 'plugins', 'synthetic-repo');

  try {
    fs.mkdirSync(path.join(nestedDir, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(nestedDir, 'skills', 'synthetic-repo'), { recursive: true });
    fs.mkdirSync(path.join(nestedDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(nestedDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'skills', 'synthetic-repo', 'SKILL.md'), '# Skill\n');
    fs.writeFileSync(path.join(nestedDir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(nestedDir, 'bin', 'run-tool'), '#!/usr/bin/env bash\necho ok\n');

    fs.writeFileSync(
      path.join(nestedDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'syn-mcp': {
            command: 'node',
            args: ['${PLUGIN_ROOT}/workbench/server.mjs'],
          },
        },
      }),
    );

    fs.writeFileSync(
      path.join(nestedDir, '.codex-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'synthetic-repo',
        version: '0.5.0',
        description: 'Synthetic v1 nested plugin',
        interface: {
          displayName: 'Synthetic Tool',
          shortDescription: 'Short summary',
          category: 'Productivity',
          logo: './assets/icon.png',
          brandColor: '#1260E8',
        },
      }),
    );

    fs.writeFileSync(
      path.join(nestedDir, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_agent_package_manifest.v1',
        package_id: 'synthetic-repo',
        version: '0.5.0a2',
        requires: ['dep-alpha', { package_id: 'dep-beta', presence: 'optional' }],
        capability_dependencies: [
          { package_id: 'dep-gamma', required: true, required_export_ids: ['cap.one'] },
        ],
        permissions: [
          { permission_id: 'artifact_mutation', scope: 'workspace', access: 'read_write' },
        ],
        entrypoints: [
          { entrypoint_id: 'syn.cli', kind: 'cli', argv: ['python3', 'scripts/tool.py'] },
          { entrypoint_id: 'syn.blank', entrypoint_kind: '   ' },
          { entrypoint_id: 'syn.rca', entrypoint_kind: 'codex_skill' },
        ],
        codex_surface: {
          plugin_id: 'synthetic-repo',
          required_skill_ids: ['synthetic-repo'],
          required_capability_package_ids: ['dep-alpha'],
        },
        presentation: {
          software_type: 'application',
          display_name_i18n: { en: 'Synthetic Tool' },
          description_i18n: { en: 'Synthetic summary' },
          miniapp: { dedicated_resource_uri: 'ui://synthetic-repo/workbench' },
        },
        declarative: {
          navigation: [
            { id: 'tab-timeline', label: { en: 'Timeline', 'zh-CN': '时间线' }, view_id: 'v.timeline' },
          ],
          views: [
            {
              id: 'v.timeline',
              view_type: 'timeline',
              slot: 'settings.section',
              title: { en: 'Activity', 'zh-CN': '活动' },
              data_ref: 'syn#activity',
            },
            {
              id: 'v.board',
              view_type: 'task_board',
              title: { en: 'Tasks', 'zh-CN': '任务' },
              data_ref: 'syn#tasks',
            },
          ],
        },
      }),
    );

    // Dry run preview first
    const preview = migrateV1Package({ repoDir, apply: false });
    assert.equal(preview.applied, false);
    assert.equal(preview.nested_layout_detected, true);
    assert.equal(preview.extra_entrypoints.length, 0);
    assert.equal(preview.manifest.identity.version, '0.5.0-alpha.2');
    assert.deepEqual(
      preview.manifest.dependencies?.packages?.map((p) => p.id),
      ['dep-alpha', 'dep-beta', 'dep-gamma'],
    );
    assert.equal(preview.manifest.provides?.cli_bin?.[0]?.path, 'scripts/tool.py');
    assert.equal(preview.manifest.provides?.skills?.[0]?.path, './skills/synthetic-repo');
    assert.equal(preview.manifest.provides?.mcp_servers?.[0]?.id, 'syn-mcp');
    assert.equal(preview.manifest.ui?.mcp_apps?.[0]?.mcp_server_id, 'syn-mcp');
    assert.equal(preview.manifest.ui?.declarative?.navigation?.[0]?.view_id, 'v.timeline');
    // View referenced by navigation was forced out of settings.section and normalized timeline->activity_log
    const timelineView = preview.manifest.ui?.declarative?.views?.find((v) => v.id === 'v.timeline');
    assert.equal(timelineView?.view_type, 'activity_log');
    assert.equal(timelineView?.slot, 'workbench.panel');
    assert.equal(fs.existsSync(path.join(repoDir, 'opl-package.json')), false);

    // Apply + clean
    const applied = migrateV1Package({ repoDir, apply: true, clean: true });
    assert.equal(applied.applied, true);
    assert.equal(applied.cleaned, true);
    assert.equal(fs.existsSync(path.join(repoDir, 'opl-package.json')), true);
    assert.equal(fs.existsSync(path.join(repoDir, 'skills', 'synthetic-repo', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(repoDir, 'assets', 'icon.png')), true);
    assert.equal(fs.existsSync(path.join(repoDir, 'plugins', 'synthetic-repo')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('capability migration preserves exported specialties and the provider materialization policy', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-mig-skills-'));
  try {
    const allSkills = ['router', 'editing', 'specialty', 'extra'];
    for (const id of allSkills) {
      const dir = path.join(repoDir, 'skills', id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), id);
    }
    const manifestPath = path.join(repoDir, 'opl-package.json');
    const manifest = {
      surface_kind: 'opl_capability_package_manifest.v2',
      package_id: 'skill-provider',
      version: '1.0.0',
      exports: {
        core_skill_ids: ['router', 'editing'],
        specialty_skill_ids: ['specialty'],
        all_skill_ids: allSkills,
        default_materialization_policy: 'core_skills_only',
        default_materialized_skill_ids: ['router'],
      },
      codex_surface: { codex_default_exposure: false, interaction_mode: 'headless_internal' },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const { manifest: migrated } = migrateV1Package({ repoDir, apply: false });
    assert.deepEqual(migrated.provides?.skills, allSkills.map((id) => ({
      id, path: `./skills/${id}`, exposure: id === 'router' ? 'default' : 'opt_in',
    })));
    assert.equal(migrated.host_hints?.codex?.sync_enabled, false);

    manifest.exports.default_materialized_skill_ids = [];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const { manifest: fallback } = migrateV1Package({ repoDir, apply: false });
    assert.deepEqual(fallback.provides?.skills?.filter(skill => skill.exposure === 'default').map(skill => skill.id), ['router', 'editing']);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('read-only smoke migration of real external OPL domain repos if present on disk', (t) => {
  const candidates = [
    '/Users/gaofeng/workspace/med-autoscience',
    '/Users/gaofeng/workspace/opl-relay',
    '/Users/gaofeng/workspace/opl-persona',
  ];
  const existing = candidates.filter((dir) => fs.existsSync(dir));
  if (existing.length === 0) {
    t.skip('External OPL domain repos not present in workspace');
    return;
  }

  for (const repoDir of existing) {
    const res = migrateV1Package({ repoDir, apply: false });
    assert.equal(res.applied, false);
    assert.equal(res.manifest.schema_version, 'opl.package.v2');
    assert.ok(res.manifest.identity.id.length > 0);
  }
});

test('migrateV1Package rewrites nested ${PLUGIN_ROOT} for post-relocation buildPackage, relocates runtime/, removes empty plugins/, handles missing icons, and avoids alphabetical plugins/assets mis-selection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-mig-r2-'));

  try {
    // Case 1: Nested relay-like layout with ${PLUGIN_ROOT}/workbench/server.mjs, runtime/, and missing icon
    const relayRepo = path.join(tmpDir, 'nested-relay');
    const nestedRelay = path.join(relayRepo, 'plugins', 'nested-relay');
    fs.mkdirSync(path.join(nestedRelay, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(nestedRelay, 'skills', 'nested-relay'), { recursive: true });
    fs.mkdirSync(path.join(nestedRelay, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(nestedRelay, 'workbench'), { recursive: true });
    fs.mkdirSync(path.join(nestedRelay, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(nestedRelay, 'skills', 'nested-relay', 'SKILL.md'), '# Relay Skill\n');
    fs.writeFileSync(path.join(nestedRelay, 'bin', 'nested-relay'), '#!/usr/bin/env sh\necho ok\n');
    fs.writeFileSync(path.join(nestedRelay, 'workbench', 'server.mjs'), 'console.log("mcp");\n');
    fs.writeFileSync(path.join(nestedRelay, 'runtime', 'engine.py'), 'print("ok")\n');
    fs.writeFileSync(
      path.join(nestedRelay, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'relay-wb': {
            command: 'node',
            args: ['${PLUGIN_ROOT}/workbench/server.mjs'],
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(nestedRelay, '.codex-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'nested-relay',
        version: '0.7.0',
        interface: {
          displayName: 'Nested Relay',
          shortDescription: 'Relay summary',
          logo: './assets/missing-icon.png',
        },
      }),
    );
    fs.writeFileSync(
      path.join(nestedRelay, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_capability_package_manifest.v2',
        package_id: 'nested-relay',
        version: '0.7.0',
        presentation: {
          icon_ref: 'assets/missing-icon.png',
        },
        codex_surface: {
          plugin_id: 'nested-relay',
          required_skill_ids: ['nested-relay'],
        },
      }),
    );

    const migRelay = migrateV1Package({ repoDir: relayRepo, apply: true, clean: true });
    assert.deepEqual(migRelay.manifest.provides?.mcp_servers?.[0]?.args, ['./workbench/server.mjs']);
    assert.equal(migRelay.manifest.identity.icon, undefined);
    assert.ok(migRelay.cleanup_report.warnings.some((w) => w.includes('omitted identity.icon')));
    assert.equal(fs.existsSync(path.join(relayRepo, 'runtime', 'engine.py')), true);
    assert.equal(fs.existsSync(path.join(relayRepo, 'workbench', 'server.mjs')), true);
    assert.equal(fs.existsSync(path.join(relayRepo, 'plugins')), false);
    const builtRelay = buildPackage(relayRepo);
    assert.match(builtRelay.digest, /^sha256:[0-9a-f]{64}$/);

    // Case 2: plugins/assets (empty) alongside plugins/occ (actual plugin) + carrier_projection array file_aliases
    const occRepo = path.join(tmpDir, 'occ-like');
    fs.mkdirSync(path.join(occRepo, 'plugins', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(occRepo, 'plugins', 'occ', '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(occRepo, 'plugins', 'occ', 'skills', 'occ'), { recursive: true });
    fs.mkdirSync(path.join(occRepo, 'assets', 'branding'), { recursive: true });
    fs.mkdirSync(path.join(occRepo, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(occRepo, 'plugins', 'occ', 'skills', 'occ', 'SKILL.md'), '# OCC Skill\n');
    fs.writeFileSync(
      path.join(occRepo, 'assets', 'branding', 'occ-logo.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    fs.writeFileSync(
      path.join(occRepo, 'contracts', 'carrier_projection.json'),
      JSON.stringify({
        file_aliases: [{ from: 'assets/branding/occ-logo.png', to: 'assets/icon.png' }],
      }),
    );
    fs.writeFileSync(
      path.join(occRepo, 'plugins', 'occ', '.codex-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'occ',
        version: '0.2.2',
        interface: {
          displayName: 'OCC',
          shortDescription: 'Capital Compass',
          category: 'Finance',
          brandColor: '#1F6F5C',
          defaultPrompt: ['Diagnose portfolio'],
        },
      }),
    );
    fs.writeFileSync(
      path.join(occRepo, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_agent_package_manifest.v1',
        package_id: 'occ',
        version: '0.2.2',
        presentation: {
          icon_ref: 'plugins/occ/assets/nonexistent.png',
        },
        codex_surface: {
          plugin_id: 'occ',
          required_skill_ids: ['occ'],
        },
      }),
    );

    const migOcc = migrateV1Package({ repoDir: occRepo, apply: true, clean: true });
    assert.equal(migOcc.nested_plugin_dir, 'plugins/occ');
    assert.equal(migOcc.manifest.identity.icon, 'assets/branding/occ-logo.png');
    assert.deepEqual(migOcc.manifest.identity.default_prompts, ['Diagnose portfolio']);
    assert.equal(migOcc.manifest.host_hints?.codex?.brand_color, '#1F6F5C');
    assert.equal(fs.existsSync(path.join(occRepo, 'skills', 'occ', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(occRepo, 'plugins')), false);
    const builtOcc = buildPackage(occRepo);
    assert.match(builtOcc.digest, /^sha256:[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('migrateV1Package avoids synthesizing missing ./bin/<id> for JS channel packages with declarative views and passes buildPackage + link', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-mig-js-'));
  const stateDir = path.join(tmpDir, 'state');

  try {
    // Case A: JS channel package with dist/src/index.js, declarative views, and no bin/
    const chRepo = path.join(tmpDir, 'js-channel');
    fs.mkdirSync(path.join(chRepo, 'dist', 'src'), { recursive: true });
    fs.writeFileSync(path.join(chRepo, 'dist', 'src', 'index.js'), 'export function createChannel() { return {}; }\n');
    fs.writeFileSync(
      path.join(chRepo, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_capability_package_manifest.v2',
        package_id: 'opl-channel-sample',
        display_name: 'Sample Channel',
        publisher: 'one-person-lab',
        version: '0.2.0',
        entrypoints: [
          {
            entrypoint_id: 'sample-channel',
            kind: 'channel_provider',
            module_ref: 'dist/src/index.js',
            export_name: 'createChannel',
          },
        ],
        app_contributions: {
          views: [
            {
              view_id: 'sample-access',
              view_type: 'channel_access',
              title_i18n: { en: 'Sample', 'zh-CN': '示例' },
              data_ref: 'sample#state',
            },
          ],
          ui: [
            {
              view_id: 'sample-access',
              slot: 'settings.section',
            },
          ],
        },
      }),
    );

    const migCh = migrateV1Package({ repoDir: chRepo, apply: true, clean: true });
    assert.deepEqual(migCh.manifest.provides?.contribution_handler, {
      kind: 'esm_module',
      module: './dist/src/index.js',
      export: 'createChannel',
    });
    const builtCh = buildPackage(chRepo, { writeLock: true });
    assert.match(builtCh.digest, /^sha256:[0-9a-f]{64}$/);

    // Case B: JS package with declarative views, no bin/, and no channels -> omits dead opl app fallback with warning
    const uiRepo = path.join(tmpDir, 'js-ui-only');
    fs.mkdirSync(path.join(uiRepo, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(uiRepo, 'dist', 'index.js'), 'export const ok = true;\n');
    fs.writeFileSync(
      path.join(uiRepo, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_capability_package_manifest.v2',
        package_id: 'js-ui-only',
        publisher: 'one-person-lab',
        version: '0.1.0',
        app_contributions: {
          views: [
            {
              view_id: 'panel',
              view_type: 'service_status',
              title_i18n: { en: 'Status', 'zh-CN': '状态' },
              data_ref: 'js-ui#status',
            },
          ],
        },
      }),
    );

    const migUi = migrateV1Package({ repoDir: uiRepo, apply: true, clean: true });
    assert.equal(migUi.manifest.provides?.contribution_handler, undefined);
    assert.equal(migUi.manifest.ui?.declarative, undefined);
    assert.ok(
      migUi.cleanup_report.warnings.some((w) => /Omitted ui\.declarative/i.test(w)),
      `Expected warning about omitted ui.declarative, got ${JSON.stringify(migUi.cleanup_report.warnings)}`,
    );
    const builtUi = buildPackage(uiRepo, { writeLock: true });
    assert.match(builtUi.digest, /^sha256:[0-9a-f]{64}$/);

    const db = openSqliteStore(path.join(stateDir, 'opl.db'));
    try {
      const pack = createPackService({ db, stateDir });
      const linkedCh = await pack.link({ dir: chRepo, syncCodex: false });
      assert.equal(linkedCh.package.package_id, 'opl-channel-sample');
      const linkedUi = await pack.link({ dir: uiRepo, syncCodex: false });
      assert.equal(linkedUi.package.package_id, 'js-ui-only');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Regression (E2E-M4/M6 2b): migrateV1Package aborts atomically with PACK_MIGRATION_FAILED on corrupt companion JSON', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-mig-corrupt-'));
  try {
    const repoDir = path.join(tmpDir, 'corrupt-repo');
    const nestedDir = path.join(repoDir, 'plugins', 'corrupt-repo');
    fs.mkdirSync(path.join(nestedDir, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_agent_package_manifest.v1',
        package_id: 'corrupt-repo',
        version: '0.1.0',
      }),
    );
    const corruptPluginPath = path.join(nestedDir, '.codex-plugin', 'plugin.json');
    fs.writeFileSync(corruptPluginPath, '{corrupt json', 'utf8');

    assert.throws(
      () => migrateV1Package({ repoDir, apply: true, clean: true }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_MIGRATION_FAILED',
    );
    assert.equal(fs.existsSync(path.join(repoDir, 'opl-package.json')), false);
    assert.equal(fs.readFileSync(corruptPluginPath, 'utf8'), '{corrupt json');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
