import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { projectCarrier, trackedCarrierBlobPaths } from '../../src/authority/packages/carrier-projection.ts';

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function initGitRepo(root: string) {
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const add = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);
}

test('projectCarrier handles plugin_root git_tracked layout, preserves carrier icons, and detects drift', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-proj-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-outside-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  writeJson(path.join(root, 'contracts/opl_agent_package_manifest.json'), {
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'demo-agent',
    package_id: 'demo-agent',
    display_name: 'Demo Agent',
    version: '1.2.3',
    schema_ref: 'omit-me',
    machine_boundary: 'omit-me',
    codex_surface: { plugin_id: 'demo-agent' },
  });
  writeJson(path.join(root, 'contracts/carrier_projection.json'), {
    schema_version: 'opl_carrier_projection.v1',
    carrier_root: 'plugins/demo-agent',
    resource_source_mode: 'git_tracked',
    preserve_exec_mode: true,
    resource_roots: ['agent', 'contracts', 'docs'],
    exclude_prefixes: ['docs/site/'],
    preserve_carrier_files: ['assets/icon.png'],
    file_aliases: [
      { from: 'agent/primary_skill/SKILL.md', to: 'skills/demo-agent/SKILL.md' },
    ],
    package_manifest_projection: {
      mode: 'strip_keys',
      strip_keys: ['schema_ref', 'machine_boundary'],
      sync_root_opl_package: { target: 'opl-package.json' },
    },
    plugin_manifests: [
      { path: 'plugins/demo-agent/plugin.json', sync_version: true },
    ],
  });
  fs.mkdirSync(path.join(root, 'agent/primary_skill'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent/primary_skill/SKILL.md'), '# Demo Skill\n');
  fs.mkdirSync(path.join(root, 'agent/bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent/bin/tool'), '#!/bin/sh\necho ok\n', { mode: 0o755 });
  fs.mkdirSync(path.join(root, 'docs/site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(root, 'docs/site/index.html'), '<html/>');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, 'src/opl_framework'));
  writeJson(path.join(root, 'plugins/demo-agent/plugin.json'), { name: 'demo-agent', version: '0.0.1' });
  fs.mkdirSync(path.join(root, 'plugins/demo-agent/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugins/demo-agent/assets/icon.png'), 'PNG');
  fs.mkdirSync(path.join(root, 'plugins/demo-agent/docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugins/demo-agent/docs/stale.md'), 'stale');

  initGitRepo(root);
  fs.writeFileSync(path.join(root, 'docs/untracked.md'), 'untracked');

  assert.throws(() => projectCarrier({ repoRoot: root, check: true }), /out of sync/);

  const projected = projectCarrier({ repoRoot: root, check: false }).pack_carrier_projection;
  assert.equal(projected.status, 'projected');
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/docs/guide.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/docs/site/index.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/docs/untracked.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/docs/stale.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/assets/icon.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'plugins/demo-agent/src/opl_framework')), false);
  assert.equal(
    (fs.statSync(path.join(root, 'plugins/demo-agent/agent/bin/tool')).mode & 0o777) === 0o755,
    true,
  );
  const carrierPkg = JSON.parse(fs.readFileSync(path.join(root, 'plugins/demo-agent/opl-package.json'), 'utf8'));
  assert.equal(carrierPkg.schema_ref, undefined);
  assert.equal(carrierPkg.version, '1.2.3');
  const checked = projectCarrier({ repoRoot: root, check: true }).pack_carrier_projection;
  assert.equal(checked.status, 'passed');

  fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Modified\n');
  assert.throws(() => projectCarrier({ repoRoot: root, check: true }), /out of sync/);
});

test('projectCarrier handles skill_bundle layout with argv rewrites and symlink skipping', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-proj-bundle-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-bundle-out-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  writeJson(path.join(root, 'contracts/opl_agent_package_manifest.json'), {
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'bundle-agent',
    package_id: 'bundle-agent',
    display_name: 'Bundle Agent',
    version: '2.0.0',
    presentation: { icon_ref: 'assets/branding/logo.png' },
    codex_surface: { plugin_id: 'bundle-agent' },
  });
  writeJson(path.join(root, 'contracts/carrier_projection.json'), {
    schema_version: 'opl_carrier_projection.v1',
    carrier_root: 'plugins/bundle-agent',
    resource_target_prefix: 'skills/bundle-agent',
    resource_source_mode: 'filesystem',
    resource_roots: ['agent', 'runtime'],
    exclude_path_segments: ['__pycache__', 'evidence'],
    preserve_carrier_files: ['mcp.json', 'media-review/**'],
    file_aliases: [
      { from: 'agent/primary_skill/SKILL.md', to: 'skills/bundle-agent/SKILL.md' },
    ],
    copy_presentation_icon: true,
    package_manifest_projection: { mode: 'clone_with_plugin_source_dot' },
    plugin_manifests: [
      {
        path: 'plugins/bundle-agent/.codex-plugin/plugin.json',
        sync_version: true,
        set_fields: { mcpServers: './mcp.json' },
        sync_interface: { target_pointer: 'interface', logo_prefix: './' },
      },
    ],
    adapter_projection: {
      source: 'app-contribution-adapter.json',
      target: 'app-contribution-adapter.json',
      argv_rewrites: [
        { from: 'runtime/app_contribution.py', to: 'skills/bundle-agent/runtime/app_contribution.py' },
      ],
    },
    prune_roots: ['skills/bundle-agent/agent', 'skills/bundle-agent/runtime'],
  });
  fs.mkdirSync(path.join(root, 'agent/primary_skill'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent/primary_skill/SKILL.md'), '# Skill\n');
  fs.mkdirSync(path.join(root, 'runtime/evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runtime/app_contribution.py'), 'print(1)\n');
  fs.writeFileSync(path.join(root, 'runtime/evidence/ignore.json'), '{}');
  fs.symlinkSync(outside, path.join(root, 'runtime/opl_framework'));
  fs.mkdirSync(path.join(root, 'assets/branding'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/branding/logo.png'), 'PNGDATA');
  writeJson(path.join(root, 'app-contribution-adapter.json'), {
    reads: { 'bundle.v1#s': { kind: 'command', argv: ['python3', 'runtime/app_contribution.py', 'status'] } },
    actions: {},
  });
  writeJson(path.join(root, 'plugins/bundle-agent/.codex-plugin/plugin.json'), { name: 'bundle-agent', version: '0.1.0' });
  fs.mkdirSync(path.join(root, 'plugins/bundle-agent/media-review'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugins/bundle-agent/mcp.json'), '{}');
  fs.writeFileSync(path.join(root, 'plugins/bundle-agent/media-review/app.js'), '// keep\n');

  projectCarrier({ repoRoot: root, check: false });
  assert.equal(fs.existsSync(path.join(root, 'plugins/bundle-agent/skills/bundle-agent/runtime/app_contribution.py')), true);
  assert.equal(fs.existsSync(path.join(root, 'plugins/bundle-agent/skills/bundle-agent/runtime/evidence/ignore.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins/bundle-agent/skills/bundle-agent/runtime/opl_framework')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins/bundle-agent/mcp.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'plugins/bundle-agent/media-review/app.js')), true);

  const projectedAdapter = JSON.parse(
    fs.readFileSync(path.join(root, 'plugins/bundle-agent/app-contribution-adapter.json'), 'utf8'),
  );
  assert.deepEqual(
    projectedAdapter.reads['bundle.v1#s'].argv,
    ['python3', 'skills/bundle-agent/runtime/app_contribution.py', 'status'],
  );
  const plugin = JSON.parse(
    fs.readFileSync(path.join(root, 'plugins/bundle-agent/.codex-plugin/plugin.json'), 'utf8'),
  );
  assert.equal(plugin.version, '2.0.0');
  assert.equal(plugin.mcpServers, './mcp.json');
  assert.equal(plugin.interface.logo, './assets/branding/logo.png');
  assert.equal(projectCarrier({ repoRoot: root, check: true }).pack_carrier_projection.status, 'passed');
});

test('trackedCarrierBlobPaths accepts thin carriers with committed manifests and copy_presentation_icon and fails closed on missing shell manifests', () => {
  const projection = {
    schema_version: 'opl_carrier_projection.v1',
    carrier_root: 'plugins/bundle-agent',
    resource_target_prefix: 'skills/bundle-agent',
    resource_source_mode: 'filesystem',
    resource_roots: ['agent/', 'runtime/'],
    exclude_path_segments: ['evidence'],
    include_extensions: ['.md', '.py', '.json'],
    file_aliases: [
      { from: 'agent/primary_skill/SKILL.md', to: 'skills/bundle-agent/SKILL.md' },
    ],
    copy_presentation_icon: true,
    package_manifest_projection: { mode: 'clone_with_plugin_source_dot' },
    plugin_manifests: [
      { path: 'plugins/bundle-agent/.codex-plugin/plugin.json', sync_version: true },
    ],
    adapter_projection: {
      source: 'app-contribution-adapter.json',
      target: 'app-contribution-adapter.json',
      argv_rewrites: [{ from: 'runtime/app.py', to: 'skills/bundle-agent/runtime/app.py' }],
    },
  };
  const ownerManifest = {
    presentation: { icon_ref: 'assets/branding/logo.png' },
  };
  const trackedPaths = new Set([
    'agent/primary_skill/SKILL.md',
    'runtime/app.py',
    'runtime/evidence/skip.json',
    'assets/branding/logo.png',
    'plugins/bundle-agent/.codex-plugin/plugin.json',
    'plugins/bundle-agent/opl-package.json',
    'plugins/bundle-agent/app-contribution-adapter.json',
  ]);
  const mapped = trackedCarrierBlobPaths({
    projection,
    projectionRef: 'contracts/carrier_projection.json',
    carrierRoot: 'plugins/bundle-agent',
    trackedPaths,
    carrierPaths: ['.codex-plugin/plugin.json', 'opl-package.json', 'app-contribution-adapter.json'],
    ownerManifest,
  });
  assert.equal(mapped.get('.codex-plugin/plugin.json'), 'plugins/bundle-agent/.codex-plugin/plugin.json');
  assert.equal(mapped.get('opl-package.json'), 'plugins/bundle-agent/opl-package.json');
  assert.equal(mapped.get('app-contribution-adapter.json'), 'plugins/bundle-agent/app-contribution-adapter.json');
  assert.equal(mapped.get('assets/branding/logo.png'), 'assets/branding/logo.png');
  assert.equal(mapped.get('skills/bundle-agent/runtime/app.py'), 'runtime/app.py');
  assert.equal(mapped.has('skills/bundle-agent/runtime/evidence/skip.json'), false);

  const missingAdapter = new Set(trackedPaths);
  missingAdapter.delete('plugins/bundle-agent/app-contribution-adapter.json');
  assert.throws(
    () => trackedCarrierBlobPaths({
      projection,
      projectionRef: 'contracts/carrier_projection.json',
      carrierRoot: 'plugins/bundle-agent',
      trackedPaths: missingAdapter,
      carrierPaths: ['.codex-plugin/plugin.json', 'opl-package.json'],
      ownerManifest,
    }),
    /projected adapter manifest/,
  );

  const missingDescriptor = new Set(trackedPaths);
  missingDescriptor.delete('plugins/bundle-agent/opl-package.json');
  assert.throws(
    () => trackedCarrierBlobPaths({
      projection,
      projectionRef: 'contracts/carrier_projection.json',
      carrierRoot: 'plugins/bundle-agent',
      trackedPaths: missingDescriptor,
      carrierPaths: ['.codex-plugin/plugin.json', 'app-contribution-adapter.json'],
      ownerManifest,
    }),
    /projected opl-package\.json/,
  );
});
