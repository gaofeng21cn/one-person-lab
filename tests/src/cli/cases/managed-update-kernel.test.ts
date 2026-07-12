import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { assert, createFakeCodexFixture, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import { computePackageChannelTreeSha256 } from '../../../../src/modules/connect/system-installation/module-package-channel.ts';
import { writeFakeBookForgeGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';

import './managed-update-kernel-cases/lock-contention.ts';
import './managed-update-kernel-cases/base-runtime-maintenance.ts';

const MODULE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.module.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJsonFile(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8'));
}

function readModuleHeadSha(filePath: string) {
  return (readJsonFile(filePath) as { source_git: { head_sha: string } }).source_git.head_sha;
}

function writePackagedModuleFixture(input: {
  root: string;
  moduleId: string;
  repoName: string;
  pluginName: string;
  skillName: string;
  headSha: string;
  previousHeadSha?: string | null;
}) {
  fs.mkdirSync(input.root, { recursive: true });
  fs.writeFileSync(path.join(input.root, 'README.md'), `${input.repoName} fixture\n`, 'utf8');

  if (input.moduleId === 'oplbookforge') {
    writeFakeBookForgeGeneratedSurfacePack(input.root);
  } else if (input.moduleId === 'oplmetaagent') {
    fs.mkdirSync(path.join(input.root, 'agent', 'interfaces'), { recursive: true });
    fs.writeFileSync(
      path.join(input.root, 'agent', 'interfaces', 'generated-interface-bundle.json'),
      JSON.stringify({
        generated_interface_bundle_version: 1,
        plugin_manifest: {
          name: input.pluginName,
          skills: './skills/',
        },
        skill: {
          id: input.skillName,
          frontmatter: {
            name: input.skillName,
            description: `${input.skillName} fixture.`,
          },
          body_markdown: `# ${input.skillName}\n`,
        },
      }, null, 2),
      'utf8',
    );
  } else if (input.moduleId === 'scholarskills') {
    fs.mkdirSync(path.join(input.root, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(input.root, 'skills', 'mas-scholar-skills'), { recursive: true });
    fs.writeFileSync(
      path.join(input.root, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'mas-scholar-skills', skills: './skills/' }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(input.root, 'skills', 'mas-scholar-skills', 'SKILL.md'),
      `---\nname: mas-scholar-skills\ndescription: mas-scholar-skills fixture.\n---\n\n# mas-scholar-skills\n`,
      'utf8',
    );
    fs.mkdirSync(path.join(input.root, 'contracts'), { recursive: true });
    fs.writeFileSync(
      path.join(input.root, 'contracts', 'scholar-skills-capability-modules.json'),
      JSON.stringify({ fixture: 'managed-update-packaged-module' }, null, 2),
      'utf8',
    );
  } else {
    fs.mkdirSync(path.join(input.root, 'plugins', input.pluginName, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(input.root, 'plugins', input.pluginName, 'skills', input.skillName), { recursive: true });
    fs.writeFileSync(
      path.join(input.root, 'plugins', input.pluginName, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: input.pluginName, skills: './skills/' }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(input.root, 'plugins', input.pluginName, 'skills', input.skillName, 'SKILL.md'),
      `---\nname: ${input.skillName}\ndescription: ${input.skillName} fixture.\n---\n\n# ${input.skillName}\n`,
      'utf8',
    );
  }

  const activatedAt = new Date().toISOString();
  const previousRoot = `${input.root}.previous`;
  const previous = input.previousHeadSha
    ? {
      root: previousRoot,
      channel_version: 'previous-fixture',
      artifact_ref: `ghcr.io/owner/one-person-lab-modules/${input.repoName}:previous-fixture`,
      layer_digest: `sha256:${input.previousHeadSha}`,
      source_archive_sha256: input.previousHeadSha,
      source_git_head_sha: input.previousHeadSha,
      tree_sha256: input.previousHeadSha,
      activated_at: activatedAt,
    }
    : null;
  fs.writeFileSync(
    path.join(input.root, 'opl-runtime-module.json'),
    JSON.stringify({
      marker_version: 1,
      package_channel: true,
      module_id: input.moduleId,
      repo_name: input.repoName,
      source_git: {
        head_sha: input.headSha,
      },
      package_channel_lifecycle: {
        schema_version: 1,
        staged: {
          root: `${input.root}.stage`,
          status: 'activated',
          activated_at: activatedAt,
        },
        current: {
          root: input.root,
          channel_version: 'fixture',
          artifact_ref: `ghcr.io/owner/one-person-lab-modules/${input.repoName}:fixture`,
          layer_digest: `sha256:${input.headSha}`,
          source_archive_sha256: input.headSha,
          source_git_head_sha: input.headSha,
          tree_sha256: computePackageChannelTreeSha256(input.root),
          activated_at: activatedAt,
        },
        previous,
        rollback_ref: previous
          ? `opl://managed-module-package-channel/${input.moduleId}/rollback/${input.previousHeadSha}`
          : null,
      },
    }, null, 2),
    'utf8',
  );
  if (previous) {
    fs.cpSync(input.root, previousRoot, { recursive: true });
    fs.writeFileSync(path.join(previousRoot, 'README.md'), `${input.repoName} previous fixture\n`, 'utf8');
    const previousTreeSha = computePackageChannelTreeSha256(previousRoot);
    const previousMarker = readJsonFile(path.join(input.root, 'opl-runtime-module.json')) as Record<string, unknown>;
    const lifecycle = previousMarker.package_channel_lifecycle as {
      previous: { tree_sha256: string };
    };
    lifecycle.previous.tree_sha256 = previousTreeSha;
    fs.writeFileSync(path.join(input.root, 'opl-runtime-module.json'), JSON.stringify(previousMarker, null, 2), 'utf8');
    fs.writeFileSync(path.join(previousRoot, 'opl-runtime-module.json'), JSON.stringify({
      ...previousMarker,
      source_git: { head_sha: input.previousHeadSha },
      package_channel_lifecycle: {
        schema_version: 1,
        staged: {
          root: `${input.root}.stage`,
          status: 'previous',
          activated_at: activatedAt,
        },
        current: {
          ...previous,
          tree_sha256: previousTreeSha,
        },
        previous: {
          ...((previousMarker.package_channel_lifecycle as { current: Record<string, unknown> }).current),
          root: input.root,
          tree_sha256: computePackageChannelTreeSha256(input.root),
        },
        rollback_ref: `opl://managed-module-package-channel/${input.moduleId}/rollback/${input.headSha}`,
      },
    }, null, 2), 'utf8');
  }
}

function writeManagedUpdateModuleFixtures(homeRoot: string) {
  const modulesRoot = path.join(homeRoot, 'modules');
  const modules = [
    {
      moduleId: 'medautoscience',
      repoName: 'med-autoscience',
      pluginName: 'mas',
      skillName: 'mas',
      headSha: 'mas-head-sha',
      previousHeadSha: 'mas-previous-head-sha',
    },
    {
      moduleId: 'medautogrant',
      repoName: 'med-autogrant',
      pluginName: 'mag',
      skillName: 'mag',
      headSha: 'mag-head-sha',
      previousHeadSha: 'mag-previous-head-sha',
    },
    {
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      pluginName: 'rca',
      skillName: 'rca',
      headSha: 'rca-head-sha',
      previousHeadSha: 'rca-previous-head-sha',
    },
    {
      moduleId: 'oplmetaagent',
      repoName: 'opl-meta-agent',
      pluginName: 'opl-meta-agent',
      skillName: 'opl-meta-agent',
      headSha: 'oma-head-sha',
      previousHeadSha: 'oma-previous-head-sha',
    },
    {
      moduleId: 'oplbookforge',
      repoName: 'opl-bookforge',
      pluginName: 'opl-bookforge',
      skillName: 'opl-bookforge',
      headSha: 'bookforge-head-sha',
      previousHeadSha: 'bookforge-previous-head-sha',
    },
    {
      moduleId: 'scholarskills',
      repoName: 'mas-scholar-skills',
      pluginName: 'mas-scholar-skills',
      skillName: 'mas-scholar-skills',
      headSha: 'scholarskills-head-sha',
      previousHeadSha: 'scholarskills-previous-head-sha',
    },
  ] as const;
  const env: Record<string, string> = {
    OPL_MODULES_ROOT: modulesRoot,
  };
  for (const module of modules) {
    const root = path.join(modulesRoot, module.repoName);
    writePackagedModuleFixture({ root, ...module });
  }
  return env;
}

type ManagedUpdateModuleFixture = {
  moduleId: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent' | 'oplbookforge' | 'scholarskills';
  repoName: 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | 'opl-meta-agent' | 'opl-bookforge' | 'mas-scholar-skills';
  pluginName: 'mas' | 'mag' | 'rca' | 'opl-meta-agent' | 'opl-bookforge' | 'mas-scholar-skills';
  skillName: 'mas' | 'mag' | 'rca' | 'opl-meta-agent' | 'opl-bookforge' | 'mas-scholar-skills';
  sourceHeadSha: string;
};

const CAPABILITY_PACKAGE_MODULES = [
  ['medautoscience', 'med-autoscience', 'mas', 'mas', 'mas'],
  ['medautogrant', 'med-autogrant', 'mag', 'mag', 'mag'],
  ['redcube', 'redcube-ai', 'rca', 'rca', 'rca'],
  ['oplmetaagent', 'opl-meta-agent', 'opl-meta-agent', 'opl-meta-agent', 'oma'],
  ['oplbookforge', 'opl-bookforge', 'opl-bookforge', 'opl-bookforge', 'bookforge'],
  ['scholarskills', 'mas-scholar-skills', 'mas-scholar-skills', 'mas-scholar-skills', 'scholarskills'],
] as const;

function managedUpdateModules(sourceShaLabel: string): ManagedUpdateModuleFixture[] {
  return CAPABILITY_PACKAGE_MODULES.map(([moduleId, repoName, pluginName, skillName, shaPrefix]) => ({
    moduleId,
    repoName,
    pluginName,
    skillName,
    sourceHeadSha: `${shaPrefix}-${sourceShaLabel}-sha`,
  }));
}

function writeModuleSourceFiles(root: string, module: ManagedUpdateModuleFixture, label: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), `${module.repoName} ${label}\n`, 'utf8');
  if (module.moduleId === 'oplbookforge') {
    writeFakeBookForgeGeneratedSurfacePack(root);
    return;
  }
  if (module.moduleId === 'oplmetaagent') {
    fs.mkdirSync(path.join(root, 'agent', 'interfaces'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'agent', 'interfaces', 'generated-interface-bundle.json'),
      JSON.stringify({
        generated_interface_bundle_version: 1,
        plugin_manifest: {
          name: 'opl-meta-agent',
          skills: './skills/',
        },
        skill: {
          id: 'opl-meta-agent',
          frontmatter: {
            name: 'opl-meta-agent',
            description: `OMA ${label}.`,
          },
          body_markdown: `# OMA ${label}\n`,
        },
      }, null, 2),
      'utf8',
    );
    return;
  }
  if (module.moduleId === 'scholarskills') {
    fs.mkdirSync(path.join(root, 'skills', 'mas-scholar-skills'), { recursive: true });
    fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'mas-scholar-skills', skills: './skills/' }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'skills', 'mas-scholar-skills', 'SKILL.md'),
      `---\nname: mas-scholar-skills\ndescription: ScholarSkills ${label}.\n---\n\n# ScholarSkills ${label}\n`,
      'utf8',
    );
    fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'contracts', 'scholar-skills-capability-modules.json'),
      JSON.stringify({ fixture: label }, null, 2),
      'utf8',
    );
    return;
  }

  fs.mkdirSync(path.join(root, 'plugins', module.pluginName, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins', module.pluginName, 'skills', module.skillName), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'plugins', module.pluginName, '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: module.pluginName, skills: './skills/' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'plugins', module.pluginName, 'skills', module.skillName, 'SKILL.md'),
    `---\nname: ${module.skillName}\ndescription: ${module.skillName} ${label}.\n---\n\n# ${module.skillName} ${label}\n`,
    'utf8',
  );
}

function writeManagedUpdatePackageChannelFixture(input: {
  root: string;
  version: string;
  modules: ManagedUpdateModuleFixture[];
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceRoot = path.join(input.root, 'source');
  const curlLogPath = path.join(input.root, 'curl.jsonl');
  const manifests: Record<string, Record<string, unknown>> = {};
  const blobsByDigest: Record<string, string> = {};
  const moduleEntries: Record<string, Record<string, unknown>> = {};
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const module of input.modules) {
    const moduleSourceRoot = path.join(sourceRoot, module.repoName);
    writeModuleSourceFiles(moduleSourceRoot, module, input.version);
    const archivePath = path.join(input.root, `${module.repoName}-${input.version}.tar.gz`);
    execFileSync('tar', ['-czf', archivePath, module.repoName], { cwd: sourceRoot });
    const archiveDigest = sha256(archivePath);
    moduleEntries[module.moduleId] = {
      module_id: module.moduleId,
      repo_name: module.repoName,
      artifact: `ghcr.io/owner/one-person-lab-modules/${module.repoName}:${input.version}`,
      source_archive: {
        sha256: archiveDigest,
      },
      source_git: {
        head_sha: module.sourceHeadSha,
      },
    };
    manifests[`owner/one-person-lab-modules/${module.repoName}`] = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [
        {
          mediaType: MODULE_LAYER_MEDIA_TYPE,
          digest: `sha256:${archiveDigest}`,
          annotations: {
            'org.opencontainers.image.title': `dist/opl-packages/modules/${module.repoName}-${input.version}.tar.gz`,
          },
        },
      ],
    };
    blobsByDigest[`sha256:${archiveDigest}`] = archivePath;
  }

  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  fs.writeFileSync(
    channelManifestPath,
    JSON.stringify({
      manifest_version: 1,
      opl_version: input.version,
      packages: {
        modules: moduleEntries,
      },
    }),
    'utf8',
  );
  const channelDigest = sha256(channelManifestPath);
  manifests['owner/one-person-lab-manifest'] = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    layers: [
      {
        mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE,
        digest: `sha256:${channelDigest}`,
        annotations: {
          'org.opencontainers.image.title': 'dist/opl-packages/opl-channel-manifest.json',
        },
      },
    ],
  };
  blobsByDigest[`sha256:${channelDigest}`] = channelManifestPath;

  fs.writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      `fs.appendFileSync(${JSON.stringify(curlLogPath)}, JSON.stringify(args) + '\\n');`,
      "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
      "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture-token' })); process.exit(0); }",
      `const manifests = ${JSON.stringify(manifests)};`,
      `const blobsByDigest = ${JSON.stringify(blobsByDigest)};`,
      "if (url.includes('/manifests/')) {",
      "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\//);",
      "  const repo = match ? match[1] : '';",
      "  if (!manifests[repo]) process.exit(22);",
      "  process.stdout.write(JSON.stringify(manifests[repo]));",
      "  process.exit(0);",
      "}",
      "if (url.includes('/blobs/')) {",
      "  const outIndex = args.indexOf('-o');",
      "  if (outIndex < 0) process.exit(2);",
      "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
      "  if (!blobsByDigest[digest]) process.exit(22);",
      "  fs.copyFileSync(blobsByDigest[digest], args[outIndex + 1]);",
      "  process.exit(0);",
      "}",
      "process.exit(22);",
    ].join('\n'),
    { mode: 0o755 },
  );

  return {
    fakeBin,
    curlLogPath,
  };
}

function withCliTimeout<T>(timeoutMs: string, fn: () => T): T {
  const previous = process.env.OPL_CLI_TEST_TIMEOUT_MS;
  process.env.OPL_CLI_TEST_TIMEOUT_MS = timeoutMs;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_CLI_TEST_TIMEOUT_MS;
    } else {
      process.env.OPL_CLI_TEST_TIMEOUT_MS = previous;
    }
  }
}

test('packages update executes the existing managed adapter and records one package transaction receipt', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-apply-agent-'));
  const stateRoot = path.join(homeRoot, 'state');
  const moduleEnv = writeManagedUpdateModuleFixtures(homeRoot);
  const packageChannel = writeManagedUpdatePackageChannelFixture({
    root: path.join(homeRoot, 'channel-update'),
    version: '26.6.99-nightly',
    modules: managedUpdateModules('updated-head'),
  });
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = withCliTimeout('120000', () => runCli(['packages', 'update'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateRoot,
      ...moduleEnv,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      OPL_PACKAGES_OWNER: 'owner',
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.99-nightly',
      PATH: `${codexFixture.fixtureRoot}${path.delimiter}${packageChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    })) as any;

    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.idempotency_lock.status, 'released');
    assert.equal(output.managed_update.idempotency_lock.lock_file, path.join(stateRoot, 'managed-update-kernel.lock'));
    assert.equal(output.managed_update.receipts.write_policy, 'recorded_component_receipt');
    assert.equal(
      output.managed_update.receipts.component_receipt_ledger_file,
      path.join(stateRoot, 'managed-update-component-receipts.json'),
    );
    assert.equal(output.managed_update.execution.status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].adapter_id, 'capability_packages_adapter');
    assert.equal(output.managed_update.execution.adapter_results[0].status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].reason, 'managed_modules_reconciled_and_codex_surface_synced');
    assert.equal(output.managed_update.execution.adapter_results[0].owner_route.apply_owner, 'opl_connect_managed_module_reconciler');
    assert.equal(output.managed_update.execution.adapter_results[0].owner_route.package_manager_claim, false);
    assert.equal(output.managed_update.execution.adapter_results[0].owner_execution_boundary.owner_executor_id, 'opl_connect_managed_module_reconciler');
    assert.equal(output.managed_update.execution.adapter_results[0].owner_execution_boundary.runner_can_execute, true);
    assert.equal(output.managed_update.execution.adapter_results[0].owner_execution_boundary.package_manager_claim, false);
    assert.equal(output.managed_update.execution.adapter_results[0].apply_mode, 'auto_apply');
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.auto_apply_eligible, true);
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.app_background_safe, true);
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.clean_managed_targets_count, 6);
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.manual_required_targets_count, 0);
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.post_apply_status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.reload_status, 'recommended');
    assert.equal(output.managed_update.execution.adapter_results[0].reload_guidance.reload_recommended, true);
    assert.deepEqual(output.managed_update.execution.adapter_results[0].reload_guidance.reload_targets, [
      'one_person_lab_app',
      'codex_plugin_cache',
    ]);
    assert.equal(output.managed_update.execution.adapter_results[0].result.apply_mode, 'auto_apply');
    assert.equal(output.managed_update.execution.adapter_results[0].result.app_background_safe, true);
    assert.equal(output.managed_update.execution.adapter_results[0].result.auto_apply_scope, 'clean_opl_managed_module_roots_only');
    assert.equal(output.managed_update.execution.adapter_results[0].result.read_model_guidance.status_plane, 'opl packages status --json');
    assert.equal(
      output.managed_update.execution.adapter_results[0].result.read_model_guidance.component_receipt_ledger,
      path.join(stateRoot, 'managed-update-component-receipts.json'),
    );
    assert.deepEqual(
      output.managed_update.execution.adapter_results[0].post_apply_actions.map((entry: any) => entry.action_id),
      ['reconcile_modules', 'sync_skills', 'sync_codex_skill_plugin_projection'],
    );
    assert.deepEqual(
      output.managed_update.execution.adapter_results[0].post_apply_actions.map((entry: any) => entry.status),
      ['completed', 'completed', 'completed'],
    );
    const capabilityExposure = output.managed_update.execution.adapter_results[0].post_apply_actions.find((entry: any) => (
      entry.action_id === 'sync_codex_skill_plugin_projection'
    ));
    assert.deepEqual(
      (capabilityExposure?.result?.target_bound_package_scope_activation as Record<string, unknown> | undefined),
      {
        status: 'automatic_on_workspace_or_quest_activation',
        lifecycle_owner: 'opl_packages',
        status_command_ref: 'opl packages status --package-id mas --scope <workspace|quest> --json',
        repair_command_ref: 'opl packages repair mas --scope <workspace|quest> --json',
      },
    );
    assert.equal(output.managed_update.execution.receipt_record.status, 'recorded');
    assert.equal(output.managed_update.execution.receipt_record.recorded_receipt_count, 1);
    assert.equal(output.managed_update.execution.receipt_record.receipt_refs[0].startsWith('opl://managed-update/opl_packages/apply/'), true);
    assert.equal(fs.existsSync(path.join(stateRoot, 'managed-update-kernel.lock')), false);
    const receiptLedger = readJsonFile(path.join(stateRoot, 'managed-update-component-receipts.json')) as any;
    assert.equal(receiptLedger.receipts.length, 1);
    assert.equal(receiptLedger.receipts[0].component_id, 'opl_packages');
    assert.equal(receiptLedger.receipts[0].operation, 'apply');
    assert.equal(receiptLedger.receipts[0].verify_result, 'passed');
    assert.equal(typeof receiptLedger.receipts[0].activated_at, 'string');
    assert.equal(receiptLedger.receipts[0].post_apply_hooks.includes('sync_skills'), true);
    assert.equal(receiptLedger.receipts[0].apply_mode, 'auto_apply');
    assert.equal(receiptLedger.receipts[0].owner_projection.owner, 'one-person-lab-managed-modules');
    assert.equal(receiptLedger.receipts[0].owner_projection.apply_owner, 'opl_connect_managed_module_reconciler');
    assert.equal(receiptLedger.receipts[0].owner_projection.package_manager_claim, false);
    assert.equal(receiptLedger.receipts[0].status_detail.auto_apply_eligible, true);
    assert.equal(receiptLedger.receipts[0].status_detail.app_background_safe, true);
    assert.equal(receiptLedger.receipts[0].status_detail.clean_managed_targets_count, 6);
    assert.equal(receiptLedger.receipts[0].status_detail.manual_required_targets_count, 0);
    assert.equal(receiptLedger.receipts[0].status_detail.post_apply_status, 'completed');
    assert.equal(receiptLedger.receipts[0].status_detail.reload_status, 'recommended');
    assert.deepEqual(
      receiptLedger.receipts[0].post_apply_action_statuses.map((entry: any) => entry.action_id),
      ['reconcile_modules', 'sync_skills', 'sync_codex_skill_plugin_projection'],
    );
    assert.equal(receiptLedger.receipts[0].reload_guidance.reload_recommended, true);
    assert.deepEqual(receiptLedger.receipts[0].reload_guidance.reload_targets, [
      'one_person_lab_app',
      'codex_plugin_cache',
    ]);
    assert.equal(receiptLedger.receipts[0].authority_boundary.can_write_domain_truth, false);
    assert.equal(typeof receiptLedger.receipts[0].adapter_result_ref, 'string');
    const agents = output.managed_update.components[0];
    assert.equal(agents.component_id, 'opl_packages');
    assert.equal(agents.auto_apply.eligible, true);
    assert.equal(agents.auto_apply.app_background_safe, true);
    assert.equal(agents.receipt.last_receipt_ref, receiptLedger.receipts[0].receipt_ref);
    assert.equal(agents.receipt.verify_result, 'passed');
    assert.equal(typeof agents.receipt.activated_at, 'string');
    assert.equal(agents.receipt.post_apply_hooks.includes('sync_plugin_registry'), true);
    assert.equal(agents.receipt.apply_mode, 'auto_apply');
    assert.equal(agents.receipt.status_detail.post_apply_status, 'completed');
    assert.equal(agents.receipt.status_detail.reload_status, 'recommended');
    assert.equal(agents.receipt.reload_guidance.reload_recommended, true);
    assert.equal(agents.status_detail.post_apply_status, 'completed');
    assert.equal(agents.post_apply_guidance.reload_guidance.reload_recommended, true);
    assert.equal(output.managed_update.authority_boundary.can_silently_update_clean_managed_modules, true);
    assert.equal(output.managed_update.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      readModuleHeadSha(path.join(moduleEnv.OPL_MODULES_ROOT, 'med-autoscience', 'opl-runtime-module.json')),
      'mas-updated-head-sha',
    );
    assert.equal(
      readModuleHeadSha(path.join(moduleEnv.OPL_MODULES_ROOT, 'mas-scholar-skills', 'opl-runtime-module.json')),
      'scholarskills-updated-head-sha',
    );
    assert.equal(
      readModuleHeadSha(path.join(`${moduleEnv.OPL_MODULES_ROOT}/med-autoscience.previous`, 'opl-runtime-module.json')),
      'mas-head-sha',
    );

    const status = withCliTimeout('120000', () => runCli(['packages', 'update', '--dry-run'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateRoot,
      ...moduleEnv,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_PACKAGES_OWNER: 'owner',
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.99-nightly',
      PATH: `${codexFixture.fixtureRoot}${path.delimiter}${packageChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    })) as any;
    assert.equal(status.managed_update.components[0].receipt.last_receipt_ref, receiptLedger.receipts[0].receipt_ref);
    assert.equal(status.managed_update.components[0].receipt.verify_result, 'passed');
    assert.equal(typeof status.managed_update.components[0].receipt.activated_at, 'string');
    assert.equal(status.managed_update.components[0].receipt.apply_mode, 'auto_apply');
    assert.equal(status.managed_update.components[0].receipt.status_detail.post_apply_status, 'completed');
    assert.equal(status.managed_update.components[0].receipt.status_detail.reload_status, 'recommended');
    assert.equal(status.managed_update.components[0].receipt.reload_guidance.reload_recommended, true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
