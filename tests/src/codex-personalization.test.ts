import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readCodexUserInstructions,
  restoreCodexUserInstructionsFromOplFlowDefault,
  writeCodexUserInstructions,
} from '../../src/modules/console/codex-personalization.ts';
import { readOplFlowDefaultUserInstructions } from '../../src/modules/connect/index.ts';
import { runCli } from './cli/helpers.ts';
import { writeManagedRuntimeSourceFixture } from './cli/cases/packages-cases/managed-runtime-source-fixture.ts';

function sha256(content: string) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function writeOplFlowPackage(root: string) {
  const files = {
    '.codex-plugin/plugin.json': `${JSON.stringify({ name: 'opl-flow', version: '0.1.16', skills: './skills/' })}\n`,
    'skills/opl-flow/SKILL.md': '# OPL Flow\n',
    'templates/AGENTS.md': 'OPL Flow default instructions.\n',
  };
  return writeManagedRuntimeSourceFixture({
    root,
    moduleId: 'opl-flow',
    repoName: 'opl-flow',
    version: '0.1.16',
    sourceHeadSha: 'f'.repeat(40),
    packageManifest: {
      surface_kind: 'opl_agent_package_manifest.v1',
      agent_id: 'opl-flow',
      package_id: 'opl-flow',
      display_name: 'OPL Flow',
      publisher: 'one-person-lab',
      version: '0.1.16',
      source: 'first_party',
      carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
      codex_surface: {
        plugin_id: 'opl-flow',
        required_skill_ids: ['opl-flow'],
      },
      capability_dependencies: [],
    },
    payloadManifest: {
      surface_kind: 'opl_agent_package_payload_manifest',
      files: Object.entries(files).map(([relativePath, content]) => ({
        path: relativePath,
        source_path: relativePath,
        sha256: sha256(content),
      })),
    },
    sourceFiles: Object.entries(files).map(([sourcePath, content]) => ({ sourcePath, content })),
  });
}

test('Codex user instructions use SHA preconditions, backup, and atomic readback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-personalization-'));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = path.join(root, 'opl-state');
  process.env.HOME = path.join(root, 'home');

  try {
    assert.equal(readOplFlowDefaultUserInstructions().reason, 'opl_flow_package_not_installed');
    runCli(['packages', 'install', 'opl-flow'], {
      HOME: process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME,
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      ...writeOplFlowPackage(root),
    });

    const missing = readCodexUserInstructions();
    assert.equal(missing.status, 'missing');
    assert.equal(missing.sha256, null);

    const first = writeCodexUserInstructions({
      content: 'Always answer directly.',
      expectedSha256: null,
    }).codex_user_instructions_write;
    assert.equal(first.status, 'saved');
    assert.equal(first.backup_path, null);
    assert.equal(first.readback.content, 'Always answer directly.\n');

    const second = writeCodexUserInstructions({
      content: 'Always answer in Chinese.\n',
      expectedSha256: first.next_sha256,
    }).codex_user_instructions_write;
    assert.equal(second.status, 'saved');
    assert.ok(second.backup_path);
    assert.equal(fs.readFileSync(second.backup_path!, 'utf8'), 'Always answer directly.\n');
    assert.equal(second.readback.content, 'Always answer in Chinese.\n');

    const oplFlowDefault = readOplFlowDefaultUserInstructions();
    assert.equal(oplFlowDefault.status, 'available');
    assert.equal(oplFlowDefault.package_version, '0.1.16');
    assert.match(oplFlowDefault.package_lock_ref!, /^opl:\/\/agent-package-lock\/opl-flow\/0\.1\.16\//);
    assert.equal(oplFlowDefault.content, 'OPL Flow default instructions.\n');
    assert.ok(oplFlowDefault.plugin_payload_manifest_sha256);

    const restored = restoreCodexUserInstructionsFromOplFlowDefault({
      expectedSha256: second.next_sha256,
    }).codex_user_instructions_restore;
    assert.equal(restored.status, 'restored');
    assert.ok(restored.write.readback);
    assert.equal(restored.write.readback!.content, 'OPL Flow default instructions.\n');
    assert.ok(restored.write.backup_path);

    const customized = writeCodexUserInstructions({
      content: 'A second local customization.\n',
      expectedSha256: restored.write.next_sha256,
    }).codex_user_instructions_write;
    const actionRestore = runCli([
      'app', 'action', 'execute',
      '--action', 'codex_user_instructions_restore_opl_flow_default',
      '--payload', JSON.stringify({ expected_sha256: customized.next_sha256 }),
    ], {
      HOME: process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME,
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    }) as any;
    assert.equal(
      actionRestore.app_action_execution.result.codex_user_instructions_restore.status,
      'restored',
    );
    assert.equal(readCodexUserInstructions().content, 'OPL Flow default instructions.\n');

    assert.throws(
      () => writeCodexUserInstructions({ content: 'stale', expectedSha256: first.next_sha256 }),
      /changed after they were loaded/,
    );
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
