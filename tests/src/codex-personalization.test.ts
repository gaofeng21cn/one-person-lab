import { nodeFixtureShebang } from './cli/helpers-parts/node-executable.ts';
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
} from '../../src/read-models/operator/codex-personalization.ts';
import { readOplFlowDefaultUserInstructions } from '../../src/adapters/integration/index.ts';
import { createFakeCodexPluginManagerFixture, runCli } from './cli/helpers.ts';
import { writeManagedRuntimeSourceFixture } from './cli/cases/packages-cases/managed-runtime-source-fixture.ts';
import { agentPackageManifest, formatJsonPayload } from './cli/cases/packages-cases/helpers.ts';

function sha256(content: string) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function writeOplFlowPackage(root: string) {
  const version = '0.1.42';
  const ownerSourceCommit = 'bd9e5a9b23e5e843bf2f0d33e094b1de11244542';
  const sourceRoot = path.join(root, 'source', 'opl-flow');
  const requiredSkillIds = [
    'opl-flow',
    'software-development',
    'manage-codex-tasks',
  ];
  const files = {
    '.codex-plugin/plugin.json': `${JSON.stringify({ name: 'opl-flow', version, skills: './skills/' })}\n`,
    '.agents/plugins/marketplace.json': `${JSON.stringify({
      name: 'opl-flow-local',
      plugins: [{ name: 'opl-flow', source: { source: 'local', path: './' } }],
    })}\n`,
    ...Object.fromEntries(requiredSkillIds.map((skillId) => [
      `skills/${skillId}/SKILL.md`,
      `# ${skillId}\n`,
    ])),
    'templates/AGENTS.md': 'OPL Flow default instructions.\n',
  };
  const codexHome = path.join(root, 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      '[marketplaces."opl-flow-local"]',
      `source = ${JSON.stringify(sourceRoot)}`,
      '',
    ].join('\n'),
  );
  const runtimeFixture = writeManagedRuntimeSourceFixture({
      root,
      moduleId: 'opl-flow',
      repoName: 'opl-flow',
      version,
      sourceHeadSha: ownerSourceCommit,
      packageManifest: {
        surface_kind: 'opl_agent_package_manifest.v1',
        agent_id: 'opl-flow',
        package_id: 'opl-flow',
        display_name: 'OPL Flow',
        publisher: 'one-person-lab',
        version,
        source: 'first_party',
        carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
        codex_surface: {
          plugin_id: 'opl-flow',
          configured_codex_plugin_carrier: {
            kind: 'codex_plugin_manager',
            plugin_selector: 'opl-flow@opl-flow-local',
            executor_route: 'codex_cli',
            marketplace_source: sourceRoot,
            publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-flow:latest-stable',
          },
          required_skill_ids: requiredSkillIds,
        },
        capability_dependencies: [],
      },
      payloadManifest: {
        surface_kind: 'opl_package_payload_manifest.v2',
        files: Object.entries(files).map(([relativePath, content]) => ({
          path: relativePath,
          source_path: relativePath,
          sha256: sha256(content),
        })),
      },
      sourceFiles: Object.entries(files).map(([sourcePath, content]) => ({ sourcePath, content })),
    });
  fs.copyFileSync(
    path.join(root, 'blobs', 'package-manifest.json'),
    path.join(sourceRoot, 'opl-package.json'),
  );
  return {
    ...runtimeFixture,
    OPL_CODEX_PLUGIN_BIN: createFakeCodexPluginManagerFixture(
      path.join(root, 'fake-codex-plugin-manager'),
    ).codexPath,
  };
}

function writeInstalledOwnerProfileFixture(root: string) {
  const sourceRoot = path.join(root, 'installed-owner-profile');
  const profilePath = path.join(sourceRoot, 'profiles', 'default', 'AGENTS.md');
  const manifest = agentPackageManifest({
    packageId: 'fixture.profile.owner',
    agentId: 'fixture-profile-owner',
    pluginId: 'fixture-profile-owner',
    distributionPayload: null,
    profileSurface: {
      runtime_profile: { source_path: 'profiles/default/AGENTS.md', target_id: 'user_agents_profile' },
      authoring_sources: [],
      merge_context_paths: [],
      existing_profile_policy: 'semantic_merge_required',
    },
  });
  manifest.source = 'first_party';
  manifest.publisher = 'one-person-lab';
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(manifest));
  fs.writeFileSync(profilePath, 'Descriptor-owned default instructions.\n');
  return {
    codexPath: writeFakeCodexPluginList(root, [{
      pluginId: 'fixture-profile-owner@fixture-marketplace',
      version: '1.2.3',
      installed: true,
      enabled: true,
      source: { source: 'local', path: sourceRoot },
      marketplaceSource: { sourceType: 'local', source: sourceRoot },
    }]),
    sourceRoot,
    profilePath,
  };
}

function writeFakeCodexPluginList(root: string, installed: unknown[]) {
  const codexPath = path.join(root, 'fake-codex');
  fs.writeFileSync(codexPath, `${nodeFixtureShebang}
import readline from 'node:readline';
const args = process.argv.slice(2).join(' ');
const installed = ${JSON.stringify(installed)};
const marketplaces = installed.map((entry) => ({
  name: String(entry.pluginId).split('@').slice(1).join('@'),
  plugins: [{ id: entry.pluginId, localVersion: entry.version ?? null, installed: true,
    enabled: entry.enabled === true, source: { type: entry.source?.source ?? 'local', path: entry.source?.path ?? null } }],
}));
if (args === 'app-server --stdio') {
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const frame = JSON.parse(line);
    if (frame.method === 'initialize') process.stdout.write(JSON.stringify({ id: frame.id, result: {} }) + '\\n');
    if (frame.method === 'plugin/list') process.stdout.write(JSON.stringify({ id: frame.id, result: { marketplaces, marketplaceLoadErrors: [] } }) + '\\n');
  });
} else if (args === 'plugin marketplace list --json') {
  process.stdout.write(JSON.stringify({ marketplaces: marketplaces.map((entry, index) => ({ name: entry.name, marketplaceSource: installed[index].marketplaceSource })) }));
} else {
  process.stdout.write(JSON.stringify({ installed, available: [] }));
}
`, { mode: 0o755 });
  return codexPath;
}

test('Codex user instructions restore from one installed owner descriptor without lifecycle state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-owner-profile-'));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousPluginBin = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = path.join(root, 'opl-state');
  const fixture = writeInstalledOwnerProfileFixture(root);
  process.env.OPL_CODEX_PLUGIN_BIN = fixture.codexPath;

  try {
    const defaultInstructions = readOplFlowDefaultUserInstructions();
    assert.equal(defaultInstructions.status, 'available');
    assert.equal(defaultInstructions.source, 'installed_owner_descriptor');
    assert.equal(defaultInstructions.source_root, fs.realpathSync(fixture.sourceRoot));
    assert.equal(defaultInstructions.source_path, fs.realpathSync(fixture.profilePath));
    assert.equal(defaultInstructions.package_version, '1.2.3');
    assert.equal(defaultInstructions.content, 'Descriptor-owned default instructions.\n');
    assert.equal(
      defaultInstructions.sha256,
      crypto.createHash('sha256').update(defaultInstructions.content).digest('hex'),
    );
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);

    const restored = restoreCodexUserInstructionsFromOplFlowDefault({ expectedSha256: null })
      .codex_user_instructions_restore;
    assert.equal(restored.status, 'restored');
    assert.equal(readCodexUserInstructions().content, 'Descriptor-owned default instructions.\n');
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousPluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousPluginBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex user instructions reject a bare plugin manifest as a first-party profile owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-plugin-profile-'));
  const sourceRoot = path.join(root, 'bare-plugin');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousPluginBin = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.OPL_STATE_DIR = path.join(root, 'opl-state');
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({ name: 'opl-flow', version: '1.2.3' }),
  );
  fs.mkdirSync(path.join(sourceRoot, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'AGENTS.md'), 'Untrusted plugin default.\n');
  process.env.OPL_CODEX_PLUGIN_BIN = writeFakeCodexPluginList(root, [{
    pluginId: 'opl-flow@fixture-marketplace',
    version: '1.2.3',
    installed: true,
    enabled: true,
    source: { source: 'local', path: sourceRoot },
    marketplaceSource: { sourceType: 'local', source: sourceRoot },
  }]);

  try {
    const defaultInstructions = readOplFlowDefaultUserInstructions();
    assert.equal(defaultInstructions.status, 'unavailable');
    assert.equal(defaultInstructions.reason, 'opl_flow_package_not_installed');
    assert.equal(defaultInstructions.content, null);
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousPluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousPluginBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex user instructions use SHA preconditions, backup, and atomic readback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-personalization-'));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  const previousPluginBin = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = path.join(root, 'opl-state');
  process.env.HOME = path.join(root, 'home');
  process.env.OPL_CODEX_PLUGIN_BIN = writeFakeCodexPluginList(root, []);

  try {
    assert.equal(readOplFlowDefaultUserInstructions().reason, 'opl_flow_package_not_installed');
    runCli(['packages', 'install', 'opl-flow'], {
      HOME: process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME,
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      ...writeOplFlowPackage(root),
    });
    const lockOnlyDefault = readOplFlowDefaultUserInstructions();
    assert.equal(lockOnlyDefault.status, 'unavailable');
    assert.equal(lockOnlyDefault.source, 'installed_owner_descriptor');
    assert.equal(lockOnlyDefault.content, null);

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

    const ownerProfile = writeInstalledOwnerProfileFixture(root);
    process.env.OPL_CODEX_PLUGIN_BIN = ownerProfile.codexPath;
    const oplFlowDefault = readOplFlowDefaultUserInstructions();
    assert.equal(oplFlowDefault.status, 'available');
    assert.equal(oplFlowDefault.source, 'installed_owner_descriptor');
    assert.equal(oplFlowDefault.package_version, '1.2.3');
    assert.equal(oplFlowDefault.content, 'Descriptor-owned default instructions.\n');

    const restored = restoreCodexUserInstructionsFromOplFlowDefault({
      expectedSha256: second.next_sha256,
    }).codex_user_instructions_restore;
    assert.equal(restored.status, 'restored');
    assert.ok(restored.write.readback);
    assert.equal(restored.write.readback!.content, 'Descriptor-owned default instructions.\n');
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
    assert.equal(readCodexUserInstructions().content, 'Descriptor-owned default instructions.\n');

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
    if (previousPluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousPluginBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
