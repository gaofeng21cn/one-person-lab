import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { inspectBaseManagedDependencies } from '../../src/adapters/integration/base-managed-dependencies.ts';
import { activatePendingCodexRuntimeGeneration } from '../../src/adapters/integration/system-installation/engine-helpers.ts';
import {
  activatePendingOplFrameworkRuntime,
  runOplFrameworkSelfRollback,
  runOplFrameworkSelfUpdate,
} from '../../src/adapters/integration/system-installation/framework-self-update.ts';
import { syncOplCompanionSkills } from '../../src/adapters/integration/install-companions.ts';
import {
  reconcileManagedCompanionTools,
  resolveFfmpegTool,
  resolveOfficeCliTool,
} from '../../src/adapters/integration/install-companions-parts/tools.ts';
import {
  inspectExternalCodexInstallation,
  inspectExternalTemporalInstallation,
  runExternalOwnerDelegatedUpdate,
} from '../../src/adapters/integration/external-dependency-currentness.ts';
import { buildRuntimeSubstrateComponent } from '../../src/adapters/integration/managed-update-kernel-parts/runtime-substrate.ts';
import {
  readTemporalStableCohort,
  TEMPORAL_SDK_PACKAGE_NAMES,
  validateTemporalStableCohort,
} from '../../src/adapters/integration/temporal-stable-cohort.ts';
import { agentPackageManifest, formatJsonPayload } from './cli/cases/packages-cases/helpers.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function executable(filePath: string, output: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `#!/usr/bin/env bash\necho ${JSON.stringify(output)}\n`, { mode: 0o755 });
}

// Exercise the official release resolver without local credentials or live network.
function githubReleaseFixture(root: string, repository: string, version: string, assetName: string, marker?: string) {
  const binary = path.join(root, 'bin', 'gh');
  const release = JSON.stringify({
    tag_name: `v${version}`, prerelease: false, draft: false,
    html_url: `https://github.com/${repository}/releases/tag/v${version}`,
    assets: [{ name: assetName, browser_download_url: `https://github.com/${repository}/releases/download/v${version}/${assetName}`,
      digest: `sha256:${'a'.repeat(64)}`, size: 1 }],
  });
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env bash',
    // OfficeCLI resolves the release tag to an exact source commit before the
    // latest-version readback is accepted. Keep this entirely in the fixture.
    `if [ "$*" = "api repos/${repository}/commits/v${version}" ]; then`,
    `  printf '%s\\n' '{"sha":"${'a'.repeat(40)}"}'`,
    '  exit 0',
    'fi',
    `if [ "$*" != "api repos/${repository}/releases/latest" ]; then exit 1; fi`,
    ...(marker ? [`echo called >> '${marker.replaceAll("'", "'\\''")}'`] : []),
    `cat <<'OPL_RELEASE_FIXTURE'`, release, 'OPL_RELEASE_FIXTURE', '',
  ].join('\n'), { mode: 0o755 });
  return path.dirname(binary);
}

function toolInstaller(filePath: string, binaryName: string, versionCommand: string, versionOutput: string) {
  fs.writeFileSync(filePath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'mkdir -p "$HOME/.local/bin"',
    `cat > "$HOME/.local/bin/${binaryName}" <<'EOS'`,
    '#!/usr/bin/env bash',
    `if [ "\${1:-}" = ${JSON.stringify(versionCommand)} ]; then echo ${JSON.stringify(versionOutput)}; else echo ${binaryName}; fi`,
    'EOS',
    `chmod +x "$HOME/.local/bin/${binaryName}"`,
    '',
  ].join('\n'), { mode: 0o755 });
}

function writeFlowDependencyDescriptor(root: string, dependencyIds: string[]) {
  const sourceRoot = path.join(root, 'opl-flow');
  const policyPath = path.join(sourceRoot, 'contracts', 'workflow-policy.json');
  const schemaPath = path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json');
  const manifest = agentPackageManifest({
    packageId: 'opl-flow',
    agentId: 'opl-flow',
    pluginId: 'opl-flow',
    distributionPayload: null,
    profileSurface: {
      runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
      authoring_sources: [],
      merge_context_paths: [],
      existing_profile_policy: 'semantic_merge_required',
    },
  }) as unknown as Record<string, unknown>;
  manifest.source = 'first_party';
  manifest.publisher = 'one-person-lab';
  manifest.managed_policy_surface = {
    policy_kind: 'opl_flow_workflow_policy',
    source_path: 'contracts/workflow-policy.json',
    schema_path: 'contracts/workflow-policy.schema.json',
  };
  const binary = path.join(root, 'fake-codex');
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(manifest));
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'AGENTS.md'), 'fixture\n');
  fs.writeFileSync(policyPath, formatJsonPayload({
    schema: 'opl_flow_workflow_policy.v3',
    package: { id: 'opl-flow', version: '1.2.3', owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'fixture-generation',
    provides: [
      {
        id: 'opl-flow',
        kind: 'codex_plugin',
        online_install_default: true,
        activation: 'always',
      },
      {
        id: 'opl-flow',
        kind: 'codex_skill',
        online_install_default: true,
        activation: 'always',
      },
    ],
    requires: dependencyIds.map((id) => ({
      id,
      kind: id === 'opl-base' ? 'base' : 'cli',
      activation: 'always',
      online_install_default: true,
      source: id,
    })),
    recommends: [],
    compatible_optional: [],
    capability_bundles: [],
    conflicts: [],
    retires: [],
    migration_policy: {
      trigger: 'explicit_opl_flow_install_update_optimize_or_generic_app_post_update_reconcile',
      default_action: 'backup_disable_and_remove_from_discovery',
      physical_delete: false,
      receipt_owner: 'opl-framework',
      rollback_required: true,
      keep_override_supported: true,
      fresh_discovery_required: true,
    },
    historical_fingerprints: {
      plugin_ids: ['opl-flow'],
      skill_ids: ['opl-flow'],
      service_ids: ['opl-flow-service'],
      config_markers: ['opl-flow-config'],
      legacy_prompt_ids: ['opl-flow-prompt'],
    },
    codex_model_policy: {
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['local_codex_config'],
      catalog_policy: {},
    },
  }));
  fs.writeFileSync(schemaPath, formatJsonPayload({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['workflow_generation'],
    properties: {
      workflow_generation: { type: 'string', minLength: 1 },
    },
  }));
  fs.writeFileSync(binary, `#!${process.execPath}
process.stdout.write(${JSON.stringify(JSON.stringify({
  installed: [{
    pluginId: 'opl-flow@fixture-marketplace',
    version: '0.1.28',
    enabled: true,
    source: { source: 'local', path: sourceRoot },
    marketplaceSource: { sourceType: 'local', source: sourceRoot },
  }],
}))});
`, { mode: 0o755 });
  return binary;
}

function writeLegacyFlowDependencyLock(stateRoot: string) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'agent-package-locks.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'opl-flow',
      lock_ref: 'opl://agent-package-lock/opl-flow/legacy',
      physical_surface: {
        workflow_policy_migration: {
          dependency_ids: ['opl-base', 'officecli', 'officecli-docx', 'mineru-open-api'],
          dependency_sync: {
            items: [
              { skill_id: 'officecli', source_path: '/skills/officecli/SKILL.md', status: 'synced' },
              { skill_id: 'officecli-docx', source_path: '/skills/officecli-docx/SKILL.md', status: 'synced' },
            ],
            tools: [
              { tool_id: 'officecli', binary_path: '/bin/officecli', status: 'ready' },
              { tool_id: 'mineru-open-api', binary_path: '/bin/mineru-open-api', status: 'ready' },
            ],
          },
        },
      },
    }],
  }, null, 2)}\n`, 'utf8');
}

function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Base dependency catalog identifies the App-owned runtime Codex by owner path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-codex-'));
  const runtimeRoot = path.join(root, 'runtime');
  const codexPath = path.join(runtimeRoot, 'current', 'bin', 'codex');
  executable(codexPath, 'codex-cli 0.134.0');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_RUNTIME_ROOT: runtimeRoot,
      OPL_CODEX_BIN: codexPath,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
    }, () => {
      const catalog = inspectBaseManagedDependencies(root);
      const codex = catalog.dependencies.find((entry) => entry.dependency_id === 'codex-cli');
      const temporal = catalog.dependencies.find((entry) => entry.dependency_id === 'temporal-runtime');
      assert.equal(codex?.ownership, 'opl_managed');
      assert.equal(codex?.binary_path, codexPath);
      assert.equal(codex?.activation_policy, 'app_restart_generation_switch');
      assert.equal(temporal?.ownership, 'opl_managed_runtime_generation');
      assert.equal(temporal?.update_policy, 'updated_with_opl_base_framework_generation');
      assert.equal(temporal?.activation_policy, 'app_launch_reconcile_generation_switch');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('Temporal stable cohort reports exact installed SDK package drift against its SSOT', () => {
  const cohort = readTemporalStableCohort();
  const catalog = inspectBaseManagedDependencies(os.homedir());
  const temporal = catalog.dependencies.find((entry) => entry.dependency_id === 'temporal-runtime') as {
    version: Record<string, string | null>;
    latest_version: Record<string, string>;
    currentness: string;
    status: string;
    stable_cohort_ref: string;
    drifted_packages: string[];
  } | undefined;
  assert.ok(temporal);
  const installedVersions = temporal.version;
  const expectedVersions = Object.fromEntries(TEMPORAL_SDK_PACKAGE_NAMES.map((packageName) => [
    packageName.slice('@temporalio/'.length),
    cohort.sdk.packages[packageName],
  ]));
  const expectedDriftedPackages = TEMPORAL_SDK_PACKAGE_NAMES.filter((packageName) => (
    installedVersions[packageName.slice('@temporalio/'.length)] !== cohort.sdk.packages[packageName]
  ));
  const completeInstallation = TEMPORAL_SDK_PACKAGE_NAMES.every((packageName) => (
    Boolean(installedVersions[packageName.slice('@temporalio/'.length)])
  ));
  const expectedCurrentness = !completeInstallation
    ? 'missing'
    : expectedDriftedPackages.length === 0
      ? 'current'
      : 'update_available';

  assert.equal(cohort.server.version, '1.31.2');
  assert.equal(cohort.cli.version, '1.8.1');
  assert.equal(cohort.sdk.version, '1.20.3');
  assert.deepEqual(Object.keys(cohort.sdk.packages).sort(), [...TEMPORAL_SDK_PACKAGE_NAMES].sort());
  assert.deepEqual(temporal.latest_version, expectedVersions);
  assert.equal(temporal.currentness, expectedCurrentness);
  assert.equal(temporal.status, expectedCurrentness === 'current' ? 'ready' : 'attention_needed');
  assert.equal(temporal.stable_cohort_ref, cohort.contract_ref);
  assert.deepEqual(temporal.drifted_packages, expectedDriftedPackages);

  for (const fixture of cohort.replay.fixtures) {
    const bytes = fs.readFileSync(path.join(repoRoot, fixture.path));
    const history = JSON.parse(bytes.toString('utf8')) as { events?: Array<Record<string, any>> };
    const recordedSdkVersions = (history.events ?? []).flatMap((event) => {
      const sdkVersion = event.workflowTaskCompletedEventAttributes?.sdkMetadata?.sdkVersion;
      return typeof sdkVersion === 'string' ? [sdkVersion] : [];
    });
    assert.equal(bytes.byteLength, fixture.bytes, fixture.path);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), fixture.sha256, fixture.path);
    assert.ok(recordedSdkVersions.includes(fixture.recorded_sdk_version), fixture.path);
  }
});

test('Temporal stable cohort rejects prerelease versions and split SDK package versions', () => {
  const prerelease = structuredClone(readTemporalStableCohort()) as any;
  prerelease.sdk.version = '1.20.4-rc.1';
  assert.throws(
    () => validateTemporalStableCohort(prerelease, 'fixture:prerelease'),
    /must be an exact stable x\.y\.z version/,
  );

  const splitCohort = structuredClone(readTemporalStableCohort()) as any;
  splitCohort.sdk.packages['@temporalio/worker'] = '1.20.2';
  assert.throws(
    () => validateTemporalStableCohort(splitCohort, 'fixture:split-sdk'),
    /sdk\.packages\.@temporalio\/worker must equal "1\.20\.3"/,
  );
});

test('App Full tool bytes seed the Base managed root and then lose source priority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-seed-'));
  const bundledRoot = path.join(root, 'full-runtime');
  executable(path.join(bundledRoot, 'bin', 'officecli'), 'officecli 1.2.3');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_FULL_RUNTIME_HOME: bundledRoot,
      OPL_OFFICECLI_BIN: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const result = reconcileManagedCompanionTools(root, ['officecli'])[0];
      assert.equal(result.ownership, 'opl_managed');
      assert.equal(result.status, 'installed');
      assert.match(result.note ?? '', /offline seed/);
      const resolved = resolveOfficeCliTool(root);
      assert.equal(resolved?.ownership, 'opl_managed');
      assert.match(resolved?.binary_path ?? '', /base-dependencies/);
      assert.equal(fs.existsSync(path.join(root, 'state', 'base-dependencies', 'receipts', 'officecli.json')), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit or PATH tools remain detect-only and are not copied into the managed root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-external-'));
  const external = path.join(root, 'external', 'officecli');
  executable(external, 'officecli 9.9.9');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_OFFICECLI_BIN: external,
      OPL_FULL_RUNTIME_HOME: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const result = reconcileManagedCompanionTools(root, ['officecli'])[0];
      assert.equal(result.ownership, 'global_path');
      assert.equal(result.action, 'none');
      assert.match(result.note ?? '', /not overwritten/);
      assert.equal(fs.existsSync(path.join(root, 'state', 'base-dependencies', '.local', 'bin', 'officecli')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OPL-managed OfficeCLI and MinerU refresh latest currentness and silently upgrade only outdated managed bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-currentness-'));
  const stateRoot = path.join(root, 'state');
  const managedBin = path.join(stateRoot, 'base-dependencies', '.local', 'bin');
  const officeInstaller = path.join(root, 'office-installer.sh');
  const mineruInstaller = path.join(root, 'mineru-installer.sh');
  executable(path.join(managedBin, 'officecli'), 'officecli 1.0.1');
  executable(path.join(managedBin, 'mineru-open-api'), 'mineru-open-api version v0.1.0');
  toolInstaller(officeInstaller, 'officecli', '--version', 'officecli 1.0.2');
  toolInstaller(mineruInstaller, 'mineru-open-api', 'version', 'mineru-open-api version v0.2.0');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      OPL_OFFICECLI_LATEST_VERSION: '1.0.2',
      OPL_MINERU_OPEN_API_LATEST_VERSION: '0.2.0',
      OPL_OFFICECLI_INSTALL_COMMAND: officeInstaller,
      OPL_MINERU_OPEN_API_INSTALL_COMMAND: mineruInstaller,
      PATH: '/usr/bin:/bin',
    }, () => {
      const results = reconcileManagedCompanionTools(root);
      assert.deepEqual(results.map((entry) => entry.status), ['updated', 'updated']);
      assert.deepEqual(results.map((entry) => entry.action), ['update', 'update']);
      assert.deepEqual(results.map((entry) => entry.currentness), ['current', 'current']);
      assert.deepEqual(results.map((entry) => entry.latest_version), ['1.0.2', '0.2.0']);
      const second = reconcileManagedCompanionTools(root);
      assert.deepEqual(second.map((entry) => entry.action), ['none', 'none']);
      assert.deepEqual(second.map((entry) => entry.currentness), ['current', 'current']);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('official gh-stack extension installs through GitHub CLI and remains callable on readback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gh-stack-adapter-'));
  const gh = path.join(root, 'bin', 'gh');
  const ambientHome = path.join(root, 'ambient-home');
  const calls = path.join(root, 'gh.calls');
  fs.mkdirSync(path.dirname(gh), { recursive: true });
  fs.writeFileSync(gh, [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const marker = path.join(process.env.HOME, 'gh-stack.installed');",
    `const calls = ${JSON.stringify(calls)};`,
    "const args = process.argv.slice(2).join(' ');",
    "fs.appendFileSync(calls, `${args}\\n`);",
    "if (args === 'extension exec stack --version') { console.error('gh auth login'); process.exit(4); }",
    "if (args === 'extension install github/gh-stack') { fs.writeFileSync(marker, 'v0.1.0'); process.exit(0); }",
    "if (args === 'extension upgrade github/gh-stack') { fs.writeFileSync(marker, 'v0.1.0'); process.exit(0); }",
    "if (args === 'stack --version') { console.log(fs.existsSync(marker) ? 'gh stack version 0.1.0' : 'install the official extension'); process.exit(0); }",
    "process.exit(2);",
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      HOME: ambientHome,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_GH_BIN: gh,
      OPL_GH_STACK_LATEST_VERSION: '0.1.0',
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const managed = syncOplCompanionSkills(root, {
        mode: 'managed',
        skillIds: [],
        toolIds: ['gh-stack'],
        networkAccess: 'allowed',
      });
      assert.equal(managed.tools[0]?.status, 'installed');
      assert.equal(managed.tools[0]?.currentness, 'current');
      assert.deepEqual(managed.tools[0]?.entrypoint, ['gh', 'stack']);
      assert.equal(fs.existsSync(path.join(root, 'gh-stack.installed')), true);
      assert.equal(fs.existsSync(path.join(ambientHome, 'gh-stack.installed')), false);
      assert.equal(fs.existsSync(path.join(root, 'state', 'base-dependencies', 'receipts', 'gh-stack.json')), true);

      const observed = syncOplCompanionSkills(root, {
        mode: 'observe', skillIds: [], toolIds: ['gh-stack'], networkAccess: 'forbidden',
      });
      assert.equal(observed.tools[0]?.status, 'ready');
      assert.match(observed.tools[0]?.version ?? '', /0\.1\.0/);
      const recordedCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
      assert.equal(recordedCalls.includes('extension install github/gh-stack'), true);
      assert.equal(recordedCalls.includes('extension exec stack --version'), false);
      assert.equal(recordedCalls.includes('stack --version'), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('FFmpeg companion readiness requires callable ffmpeg and ffprobe binaries as one pair', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ffmpeg-adapter-'));
  const installer = path.join(root, 'install-ffmpeg.sh');
  fs.writeFileSync(installer, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'mkdir -p "$OPL_COMPANION_TOOL_BIN_DIR"',
    'for tool in ffmpeg ffprobe; do',
    '  cat > "$OPL_COMPANION_TOOL_BIN_DIR/$tool" <<EOS',
    '#!/usr/bin/env bash',
    'echo "$tool version 8.1.2"',
    'EOS',
    '  chmod +x "$OPL_COMPANION_TOOL_BIN_DIR/$tool"',
    'done',
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_FFMPEG_BIN: undefined,
      OPL_FFPROBE_BIN: undefined,
      OPL_FFMPEG_INSTALL_COMMAND: installer,
      OPL_HOMEBREW_BIN: undefined,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const managed = syncOplCompanionSkills(root, {
        mode: 'managed',
        skillIds: [],
        toolIds: ['ffmpeg'],
        networkAccess: 'allowed',
      });
      assert.equal(managed.tools[0]?.status, 'installed');
      assert.equal(managed.tools[0]?.ownership, 'opl_managed');
      assert.deepEqual(Object.keys(managed.tools[0]?.binary_paths ?? {}).sort(), ['ffmpeg', 'ffprobe']);
      assert.match(managed.tools[0]?.version ?? '', /ffmpeg version 8\.1\.2/);
      assert.match(managed.tools[0]?.version ?? '', /ffprobe version 8\.1\.2/);

      assert.equal(resolveFfmpegTool(root)?.ownership, 'opl_managed');

      const ffprobe = managed.tools[0]?.binary_paths?.ffprobe;
      assert.ok(ffprobe);
      fs.rmSync(ffprobe);
      assert.equal(resolveFfmpegTool(root), null);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing PATH FFmpeg stays external and is never overwritten by the managed repair adapter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ffmpeg-external-'));
  const bin = path.join(root, 'bin');
  const installerMarker = path.join(root, 'installer-called');
  executable(path.join(bin, 'ffmpeg'), 'ffmpeg version 7.1.0');
  executable(path.join(bin, 'ffprobe'), 'ffprobe version 7.1.0');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_FFMPEG_BIN: undefined,
      OPL_FFPROBE_BIN: undefined,
      OPL_FFMPEG_INSTALL_COMMAND: `touch ${JSON.stringify(installerMarker)}`,
      OPL_HOMEBREW_BIN: undefined,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      PATH: `${bin}:/usr/bin:/bin`,
    }, () => {
      const managed = syncOplCompanionSkills(root, {
        mode: 'managed', skillIds: [], toolIds: ['ffmpeg'], networkAccess: 'allowed',
      });
      assert.equal(managed.tools[0]?.status, 'ready');
      assert.equal(managed.tools[0]?.ownership, 'global_path');
      assert.equal(fs.existsSync(installerMarker), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew external dependencies expose confirmation-only owner actions and never enter Base auto-apply', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-homebrew-'));
  const brew = path.join(root, 'bin', 'brew');
  const codex = path.join(root, 'Cellar', 'codex', '0.1.0', 'bin', 'codex');
  const log = path.join(root, 'brew.log');
  executable(codex, 'codex-cli 0.1.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    `echo "$*" >> ${JSON.stringify(log)}`,
    'if [ "$*" = "list --formula --versions codex" ]; then echo "codex 0.1.0"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_HOMEBREW_BIN: brew,
      OPL_CODEX_BIN: codex,
      OPL_CODEX_CLI_LATEST_VERSION: '0.2.0',
      PATH: `${path.dirname(codex)}:/usr/bin:/bin`,
    }, () => {
      const installation = inspectExternalCodexInstallation({
        binaryPath: codex,
        version: 'codex-cli 0.1.0',
        latestVersion: '0.2.0',
      });
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_mode, 'explicit_owner_delegated');
      assert.equal(installation.update_action?.action_id, 'external_codex_update_homebrew');
      assert.equal(installation.update_action?.confirmation_required, true);
      assert.equal(installation.update_action?.auto_apply_allowed, false);
      const catalog = inspectBaseManagedDependencies(root, { refreshManagedLatest: true });
      const catalogCodex = catalog.dependencies.find((entry) => entry.dependency_id === 'codex-cli');
      assert.equal(catalogCodex?.ownership, 'homebrew_formula');
      assert.equal(catalogCodex?.update_mode, 'explicit_owner_delegated');
      assert.equal(catalogCodex?.update_action?.action_id, 'external_codex_update_homebrew');
      assert.equal(
        catalogCodex?.external_installations?.some((entry) => path.resolve(entry.binary_path ?? '') === codex),
        false,
      );
      const component = buildRuntimeSubstrateComponent({ core_engines: { codex: {
        installed: true,
        update_available: true,
        latest_version_status: 'outdated',
        binary_path: codex,
        version: 'codex-cli 0.1.0',
      } } }, 'stable', { allowFrameworkChannelLookup: false, refreshManagedDependencyLatest: true });
      const managedUpdateAvailable = catalog.dependencies.some((entry) => (
        entry.update_mode === 'silent_managed' && entry.currentness === 'update_available'
      ));
      assert.equal(component.state, managedUpdateAvailable ? 'update_available' : 'current');
      assert.equal(component.auto_apply.eligible, managedUpdateAvailable);
      assert.equal(
        catalog.dependencies.some((entry) => (
          entry.dependency_id === 'codex-cli' && entry.update_mode === 'silent_managed'
        )),
        false,
      );
      const delegated = runExternalOwnerDelegatedUpdate('external_codex_update_homebrew', false);
      assert.equal(delegated.external_dependency_update.status, 'completed');
      assert.match(fs.readFileSync(log, 'utf8'), /upgrade codex/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unverified PATH Codex stays detect-only without an executable update action', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-path-'));
  const codex = path.join(root, 'custom', 'codex');
  executable(codex, 'codex-cli 0.1.0');
  try {
    withEnvironment({ OPL_HOMEBREW_BIN: undefined, OPL_NPM_BIN: undefined, PATH: '/usr/bin:/bin' }, () => {
      const installation = inspectExternalCodexInstallation({ binaryPath: codex, version: '0.1.0', latestVersion: '0.2.0' });
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_mode, 'detect_only_guidance');
      assert.equal(installation.update_action, null);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew cask and global npm Codex owners receive their exact delegated routes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-codex-owners-'));
  const brew = path.join(root, 'bin', 'brew');
  const npm = path.join(root, 'bin', 'npm');
  const caskCodex = path.join(root, 'Caskroom', 'codex', '0.2.0', 'Codex.app', 'Contents', 'Resources', 'codex');
  const npmPackage = path.join(root, 'lib', 'node_modules', '@openai', 'codex');
  const npmCodex = path.join(npmPackage, 'bin', 'codex');
  executable(caskCodex, 'codex-cli 0.2.0');
  executable(npmCodex, 'codex-cli 0.2.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --cask --versions codex" ]; then echo "codex 0.2.0"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  executable(npm, 'npm fixture');
  fs.writeFileSync(path.join(npmPackage, 'package.json'), '{"name":"@openai/codex","version":"0.2.0"}\n', 'utf8');
  try {
    withEnvironment({ OPL_HOMEBREW_BIN: brew, OPL_NPM_BIN: npm, PATH: '/usr/bin:/bin' }, () => {
      const cask = inspectExternalCodexInstallation({ binaryPath: caskCodex, version: '0.2.0', latestVersion: '0.3.0' });
      const globalNpm = inspectExternalCodexInstallation({ binaryPath: npmCodex, version: '0.2.0', latestVersion: '0.3.0' });
      assert.equal(cask.ownership, 'homebrew_cask');
      assert.equal(cask.update_action?.action_id, 'external_codex_update_homebrew_cask');
      assert.equal(cask.update_action?.delegated_surface, 'brew upgrade --cask codex');
      assert.equal(globalNpm.ownership, 'global_npm');
      assert.equal(globalNpm.update_action?.action_id, 'external_codex_update_global_npm');
      assert.equal(globalNpm.update_action?.delegated_surface, 'npm install --global @openai/codex@latest');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew Temporal CLI reports currentness without inferring Temporal Server state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-temporal-owner-'));
  const brew = path.join(root, 'bin', 'brew');
  const temporal = path.join(root, 'Cellar', 'temporal', '1.0.0', 'bin', 'temporal');
  executable(temporal, 'temporal version 1.0.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --formula --versions temporal" ]; then echo "temporal 1.0.0"; fi',
    'if [ "$*" = "info --json=v2 temporal" ]; then echo \"{\\\"formulae\\\":[{\\\"versions\\\":{\\\"stable\\\":\\\"1.1.0\\\"}}]}\"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  const fixturePath = githubReleaseFixture(root, 'temporalio/cli', '1.8.1', `temporal_cli_1.8.1_${process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}.tar.gz`);
  try {
    withEnvironment({
      OPL_HOMEBREW_BIN: brew,
      OPL_TEMPORAL_BIN: temporal,
      OPL_TEMPORAL_CLI_LATEST_VERSION: undefined,
      PATH: `${fixturePath}:/usr/bin:/bin`,
    }, () => {
      const installation = inspectExternalTemporalInstallation({ refreshLatest: true });
      assert.equal(installation.ownership, 'homebrew_formula');
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_action?.action_id, 'external_temporal_update_homebrew');
      assert.match(installation.guidance, /Temporal CLI/);
      assert.equal(JSON.stringify(installation).includes('server_version'), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Temporal CLI official release outranks stale Homebrew metadata and ignores prerelease hints', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-temporal-stable-cohort-'));
  const brew = path.join(root, 'bin', 'brew');
  const temporal = path.join(root, 'Cellar', 'temporal', '1.8.0', 'bin', 'temporal');
  executable(temporal, 'temporal version 1.8.0 (Server 1.31.2, UI 2.50.1)');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --formula --versions temporal" ]; then echo "temporal 1.8.0"; fi',
    'if [ "$*" = "info --json=v2 temporal" ]; then echo \'{"formulae":[{"versions":{"stable":"1.8.0"}}]}\'; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  const fixturePath = githubReleaseFixture(root, 'temporalio/cli', '1.8.1', `temporal_cli_1.8.1_${process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}.tar.gz`);
  try {
    withEnvironment({
      OPL_HOMEBREW_BIN: brew,
      OPL_TEMPORAL_BIN: temporal,
      OPL_TEMPORAL_CLI_LATEST_VERSION: '1.9.0-rc.1',
      PATH: `${fixturePath}:/usr/bin:/bin`,
    }, () => {
      const installation = inspectExternalTemporalInstallation({ refreshLatest: true });
      assert.equal(installation.version, '1.8.0');
      assert.equal(installation.latest_version, '1.8.1');
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.ownership, 'homebrew_formula');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed companion currentness makes OPL Base background apply eligible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-companion-plan-'));
  const stateRoot = path.join(root, 'state');
  const office = path.join(stateRoot, 'base-dependencies', '.local', 'bin', 'officecli');
  const runtimeRoot = path.join(root, 'runtime');
  const codex = path.join(runtimeRoot, 'current', 'bin', 'codex');
  executable(office, 'officecli 1.0.1');
  executable(codex, 'codex-cli 0.2.0');
  const pluginBin = writeFlowDependencyDescriptor(root, ['opl-base', 'officecli']);
  try {
    withEnvironment({
      CODEX_HOME: path.join(root, 'codex-home'),
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_RUNTIME_ROOT: runtimeRoot,
      OPL_CODEX_BIN: codex,
      OPL_CODEX_PLUGIN_BIN: pluginBin,
      OPL_CODEX_CLI_LATEST_VERSION: '0.2.0',
      OPL_OFFICECLI_LATEST_VERSION: '1.0.2',
      OPL_COMPANION_SKIP_LATEST_LOOKUP: '1',
      PATH: '/usr/bin:/bin',
    }, () => {
      const component = buildRuntimeSubstrateComponent({ core_engines: { codex: {
        installed: true,
        update_available: false,
        latest_version_status: 'current',
        binary_path: codex,
        version: 'codex-cli 0.2.0',
        runtime_substrate_updater: { current_binary_path: codex, latest_version_status: 'current' },
      } } }, 'stable', { allowFrameworkChannelLookup: false, refreshManagedDependencyLatest: true });
      assert.equal(component.state, 'update_available');
      assert.equal(component.auto_apply.eligible, true);
      const catalog = component.current.dependency_catalog as ReturnType<typeof inspectBaseManagedDependencies>;
      assert.equal(Object.hasOwn(catalog, 'flow_dependency_ids'), false);
      assert.deepEqual(catalog.flow_dependencies.map((entry) => [entry.dependency_id, entry.dependency_kind]), [
        ['opl-base', 'base'],
        ['officecli', 'cli'],
      ]);
      assert.equal(catalog.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'update_available');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy OPL Flow locks do not project managed dependency authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-legacy-dependency-lock-'));
  const stateRoot = path.join(root, 'state');
  writeLegacyFlowDependencyLock(stateRoot);
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_CODEX_BIN: undefined,
      OPL_OFFICECLI_BIN: undefined,
      OPL_MINERU_OPEN_API_BIN: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const catalog = inspectBaseManagedDependencies(root);
      assert.deepEqual(catalog.flow_dependencies, []);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cached Base status skips companion latest network lookup while explicit refresh performs it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-companion-cached-status-'));
  const stateRoot = path.join(root, 'state');
  const office = path.join(stateRoot, 'base-dependencies', '.local', 'bin', 'officecli');
  const marker = path.join(root, 'release-called');
  executable(office, 'officecli 1.0.1');
  const pluginBin = writeFlowDependencyDescriptor(root, ['opl-base', 'officecli']);
  const fixturePath = githubReleaseFixture(root, 'iOfficeAI/OfficeCLI', '1.0.2', `officecli-${process.platform === 'darwin' ? 'mac' : process.platform}-${process.arch}`, marker);
  try {
    withEnvironment({
      CODEX_HOME: path.join(root, 'codex-home'),
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_COMPANION_SKIP_LATEST_LOOKUP: undefined,
      OPL_OFFICECLI_LATEST_VERSION: undefined,
      OPL_CODEX_PLUGIN_BIN: pluginBin,
      PATH: `${fixturePath}:/usr/bin:/bin`,
    }, () => {
      const cached = inspectBaseManagedDependencies(root);
      assert.equal(cached.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'unknown');
      assert.equal(fs.existsSync(marker), false);
      const refreshed = inspectBaseManagedDependencies(root, { refreshManagedLatest: true });
      assert.equal(refreshed.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'update_available');
      assert.equal(fs.existsSync(marker), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt pending runtime metadata becomes attention instead of aborting startup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-pending-corrupt-'));
  const runtimeRoot = path.join(root, 'runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'pending-codex-generation.json'), '{broken', 'utf8');
  try {
    withEnvironment({ HOME: root, OPL_RUNTIME_ROOT: runtimeRoot }, () => {
      const result = activatePendingCodexRuntimeGeneration();
      assert.equal(result.status, 'manual_required');
      assert.equal(result.reason, 'pending_generation_metadata_invalid');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dirty OPL-managed skill source is reported and never materialized as a successful update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-skill-dirty-'));
  const codexHome = path.join(root, '.codex');
  const sourceRoot = path.join(root, 'OfficeCLI');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), [
    '---',
    'name: officecli',
    'description: OfficeCLI test fixture.',
    '---',
    '',
    '# OfficeCLI',
    '',
  ].join('\n'), 'utf8');
  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: sourceRoot, stdio: 'ignore' });
  execFileSync('git', ['add', 'SKILL.md'], { cwd: sourceRoot });
  execFileSync('git', ['-c', 'user.name=OPL Test', '-c', 'user.email=opl@example.test', 'commit', '-m', 'seed'], { cwd: sourceRoot, stdio: 'ignore' });
  const managedSkillDependency = {
    id: 'officecli',
    sourceMode: 'github' as const,
    repositoryUrl: sourceRoot,
    repositorySourcePath: '.',
    owner: 'iofficeai',
    requiredTools: [],
    installSource: 'framework_git_projection',
    required: false,
  };
  try {
    withEnvironment({
      HOME: root,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      OPL_COMPANION_SOURCES_ROOT: undefined,
      OPL_OFFICECLI_SOURCE_ROOT: undefined,
    }, () => {
      const options = {
        mode: 'managed' as const,
        skillIds: ['officecli'],
        toolIds: [],
        managedSkillDependencies: [managedSkillDependency],
      };
      const initial = syncOplCompanionSkills(root, options);
      assert.equal(initial.items[0]?.status, 'synced');
      assert.ok(initial.items[0]?.source_path);
      fs.rmSync(path.join(codexHome, 'skills', 'officecli'), { recursive: true, force: true });
      fs.appendFileSync(path.join(initial.items[0].source_path, 'SKILL.md'), 'dirty\n', 'utf8');

      const result = syncOplCompanionSkills(root, options);
      assert.equal(result.items[0]?.status, 'failed');
      assert.equal(result.items[0]?.action, 'update_and_symlink');
      assert.match(result.items[0]?.note ?? '', /dirty/);
      assert.equal(fs.existsSync(path.join(codexHome, 'skills', 'officecli')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function frameworkFixture(root: string, version: string) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'entrypoints'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'opl-framework-fixture', version })}\n`, 'utf8');
  executable(path.join(root, 'bin', 'opl'), version);
  fs.writeFileSync(path.join(root, 'src', 'entrypoints', 'cli.ts'), `export const version = ${JSON.stringify(version)};\n`, 'utf8');
}

function runtimeFrameworkFixture(root: string, marker: string) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist', 'entrypoints'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'opl-framework-fixture',
    version: '0.3.5',
    dependencies: { fixture: '1.0.0' },
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify({
    name: 'opl-framework-fixture',
    version: '0.3.5',
    lockfileVersion: 3,
    packages: {},
  })}\n`, 'utf8');
  executable(path.join(root, 'bin', 'opl'), marker);
  fs.writeFileSync(path.join(root, 'dist', 'entrypoints', 'cli.js'), `export const marker = ${JSON.stringify(marker)};\n`, 'utf8');
}

test('Framework runtime archive installs dependencies into the incoming generation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-archive-dependencies-'));
  const targetRoot = path.join(root, 'framework');
  const archiveParent = path.join(root, 'archive-source');
  const archiveRoot = path.join(archiveParent, 'one-person-lab');
  const archivePath = path.join(root, 'framework.tar.gz');
  const fakeBin = path.join(root, 'fake-bin');
  runtimeFrameworkFixture(targetRoot, 'old');
  runtimeFrameworkFixture(archiveRoot, 'new');
  fs.mkdirSync(path.join(targetRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'node_modules', '.existing'), 'old generation\n', 'utf8');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'npm'), [
    '#!/bin/sh',
    'set -eu',
    'mkdir -p node_modules',
    "printf 'incoming generation\\n' > node_modules/.installed",
    '',
  ].join('\n'), { mode: 0o755 });
  execFileSync('tar', ['-czf', archivePath, '-C', archiveParent, 'one-person-lab']);
  const archiveSha256 = execFileSync('shasum', ['-a', '256', archivePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];

  try {
    const result = withEnvironment({
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      OPL_APP_PROCESS_INSTANCE_ID: 'framework-runtime-archive-dependencies',
      OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: undefined,
    }, () => runOplFrameworkSelfUpdate({
      targetRoot,
      sourceArchive: archivePath,
      sourceArchiveSha256: archiveSha256,
      allowChannelArtifact: false,
    }));
    assert.equal(result.status, 'completed');
    assert.equal(result.reason, 'framework_runtime_artifact_staged_for_restart');
    assert.equal(result.result?.dependency_install.required, true);
    assert.equal(result.result?.dependency_install.status, 'completed');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.pending`, 'node_modules', '.installed'), 'utf8'), 'incoming generation\n');
    assert.equal(fs.existsSync(path.join(`${targetRoot}.pending`, 'node_modules', '.existing')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Framework and Temporal generation stages, activates on startup, and rolls back through the existing owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-pending-'));
  const targetRoot = path.join(root, 'framework');
  const archiveParent = path.join(root, 'archive-source');
  const archiveRoot = path.join(archiveParent, 'one-person-lab');
  const archivePath = path.join(root, 'framework.tar.gz');
  frameworkFixture(targetRoot, 'old');
  frameworkFixture(archiveRoot, 'new');
  execFileSync('tar', ['-czf', archivePath, '-C', archiveParent, 'one-person-lab']);
  const archiveSha256 = execFileSync('shasum', ['-a', '256', archivePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  try {
    withEnvironment({ OPL_APP_PROCESS_INSTANCE_ID: 'framework-app-before-restart' }, () => {
      const staged = runOplFrameworkSelfUpdate({
        targetRoot,
        sourceArchive: archivePath,
        sourceArchiveSha256: archiveSha256,
        allowChannelArtifact: false,
        skipDependencyInstall: true,
      });
      assert.equal(staged.status, 'completed');
      assert.equal(staged.reason, 'framework_runtime_artifact_staged_for_restart');
      assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'old');
      assert.equal(fs.existsSync(`${targetRoot}.pending.json`), true);
      assert.equal(activatePendingOplFrameworkRuntime(targetRoot).status, 'deferred_same_app_instance');
      const pendingBefore = fs.readFileSync(`${targetRoot}.pending.json`, 'utf8');
      const repeated = runOplFrameworkSelfUpdate({
        targetRoot,
        sourceArchive: archivePath,
        sourceArchiveSha256: archiveSha256,
        allowChannelArtifact: false,
        skipDependencyInstall: true,
      });
      assert.equal(repeated.status, 'skipped');
      assert.equal(repeated.reason, 'framework_runtime_artifact_pending_restart');
      assert.equal(fs.readFileSync(`${targetRoot}.pending.json`, 'utf8'), pendingBefore);
    });
    const activated = withEnvironment(
      { OPL_APP_PROCESS_INSTANCE_ID: 'framework-app-after-restart' },
      () => activatePendingOplFrameworkRuntime(targetRoot),
    );
    assert.equal(activated.status, 'activated');
    assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'new');
    assert.equal(fs.existsSync(`${targetRoot}.previous`), true);

    const rollback = runOplFrameworkSelfRollback({ targetRoot });
    assert.equal(rollback.status, 'completed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'old');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
