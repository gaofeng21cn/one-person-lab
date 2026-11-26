import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PKG_ROOT = path.join(REPO_ROOT, 'packages', 'mcp-app-shared');

test('v2:guard passes for @opl/mcp-app-shared with DAG strictly [core]', () => {
  const report = runV2ImportGuard({ rootDir: REPO_ROOT });
  assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
  assert.ok(report.packagesChecked.includes('mcp-app-shared'));
  assert.ok(report.dagEdges.includes('mcp-app-shared -> core'));
});

test('packages/mcp-app-shared contains zero child_process, spawn("opl"), cordis-profiles, @temporalio, or legacy src/ refs', () => {
  const forbidden = [
    /node:child_process/,
    /['"]child_process['"]/,
    /spawn\(["']opl["']\)/,
    /execFile\(["']opl["']\)/,
    /cordis-profiles/,
    /@temporalio\//,
    /@modelcontextprotocol\/ext-apps/,
  ];

  const scanDirs = [path.join(PKG_ROOT, 'src'), path.join(PKG_ROOT, 'assets')];
  for (const root of scanDirs) {
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && /\.(ts|js|mjs|html|css)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          for (const pattern of forbidden) {
            assert.equal(
              pattern.test(content),
              false,
              `Forbidden pattern ${pattern} found in ${full}`,
            );
          }
        }
      }
    }
  }
});

test('compiled dist/ subpath exports resolve cleanly in plain Node ESM and match E2E contract', async () => {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'),
  ) as {
    exports: Record<string, { 'opl-source': string; types: string; default: string }>;
  };

  const requiredSubpaths = [
    '.',
    './types',
    './presentation',
    './forms',
    './handoff',
    './trajectory-renderer',
    './task-workbench',
    './view',
    './bridge',
    './node-transport',
  ];

  for (const subpath of requiredSubpaths) {
    const entry = pkgJson.exports[subpath];
    assert.ok(entry, `Missing export subpath ${subpath}`);
    assert.equal(fs.existsSync(path.join(PKG_ROOT, entry.default)), true, `Missing ${entry.default}`);
    assert.equal(fs.existsSync(path.join(PKG_ROOT, entry.types)), true, `Missing ${entry.types}`);
  }

  const rootMod = (await import('@opl/mcp-app-shared')) as Record<string, unknown>;
  const presMod = (await import('@opl/mcp-app-shared/presentation')) as Record<string, unknown>;
  const formsMod = (await import('@opl/mcp-app-shared/forms')) as Record<string, unknown>;
  const handoffMod = (await import('@opl/mcp-app-shared/handoff')) as Record<string, unknown>;
  const trajMod = (await import('@opl/mcp-app-shared/trajectory-renderer')) as Record<string, unknown>;
  const workbenchMod = (await import('@opl/mcp-app-shared/task-workbench')) as Record<string, unknown>;
  const viewMod = (await import('@opl/mcp-app-shared/view')) as Record<string, unknown>;
  const bridgeMod = (await import('@opl/mcp-app-shared/bridge')) as Record<string, unknown>;
  const transportMod = (await import('@opl/mcp-app-shared/node-transport')) as Record<string, unknown>;

  assert.equal(typeof rootMod.renderOwnerView, 'function');
  assert.equal(typeof presMod.renderOwnerView, 'function');
  assert.equal(typeof formsMod.renderInputFields, 'function');
  assert.equal(typeof handoffMod.resolveViewHandoff, 'function');
  assert.equal(typeof trajMod.parseTrajectorySnapshot, 'function');
  assert.equal(typeof workbenchMod.mountTaskWorkbench, 'function');
  assert.equal(typeof viewMod.createOplMcpAppViewController, 'function');
  assert.equal(typeof bridgeMod.OpldContributionBridge, 'function');
  assert.equal(typeof transportMod.connectOpldRpcSession, 'function');
});
