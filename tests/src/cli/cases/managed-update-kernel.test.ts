import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  parseJsonText,
  path,
  removeFixtureTree,
  runCli,
  test,
} from '../helpers.ts';
import { computePackageChannelTreeSha256 } from '../../../../src/modules/connect/system-installation/module-package-channel.ts';
import {
  createFakeFamilySkillWorkspace,
  writeFakeBookForgeGeneratedSurfacePack,
} from '../../cli-codex-default-shell-helpers.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from '../../../../src/modules/connect/agent-package-registry-parts/payload-content-lock.ts';
import {
  reconcileBundledFullRuntimePackagesIfAvailable,
} from '../../../../src/modules/connect/system-installation/full-runtime-package-reconciliation.ts';
import {
  createFakeCompanionInstallEnv,
  writeFakeCompanionToolBinaries,
} from './system-install-fixtures.ts';

import './managed-update-kernel-cases/lock-contention.ts';
import './managed-update-kernel-cases/base-runtime-maintenance.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
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

function packageIdForModule(moduleId: string) {
  return ({
    medautoscience: 'mas',
    medautogrant: 'mag',
    redcube: 'rca',
    oplmetaagent: 'oma',
    oplbookforge: 'obf',
    scholarskills: 'mas-scholar-skills',
  } as Record<string, string>)[moduleId] ?? moduleId;
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
      artifact_ref: `ghcr.io/owner/one-person-lab-packages/${packageIdForModule(input.moduleId)}:previous-fixture`,
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
          artifact_ref: `ghcr.io/owner/one-person-lab-packages/${packageIdForModule(input.moduleId)}:fixture`,
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
  const packageEntries: Record<string, Record<string, unknown>> = {};
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const module of input.modules) {
    const moduleSourceRoot = path.join(sourceRoot, module.repoName);
    writeModuleSourceFiles(moduleSourceRoot, module, input.version);
    const archivePath = path.join(input.root, `${module.repoName}-${input.version}.tar.gz`);
    execFileSync('tar', ['-czf', archivePath, module.repoName], { cwd: sourceRoot });
    const archiveDigest = sha256(archivePath);
    const packageId = packageIdForModule(module.moduleId);
    const packageArtifactManifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [
        {
          mediaType: PACKAGE_LAYER_MEDIA_TYPE,
          digest: `sha256:${archiveDigest}`,
          annotations: {
            'org.opencontainers.image.title': `dist/opl-packages/packages/${packageId}/${packageId}-${input.version}.tar.gz`,
          },
        },
      ],
    };
    const packageArtifactDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(packageArtifactManifest))
      .digest('hex');
    packageEntries[packageId] = {
      package_id: packageId,
      selected_version: input.version,
      versions: [{
        package_version: input.version,
        selection_status: 'selected_for_release_set',
        source_artifact_ref: `ghcr.io/owner/one-person-lab-packages/${packageId}:${input.version}`,
        artifact_digest: `sha256:${packageArtifactDigest}`,
        artifact_status: 'published_immutable',
        package_content_digest: `sha256:${archiveDigest}`,
        owner_source_commit: module.sourceHeadSha,
      }],
    };
    manifests[`owner/one-person-lab-packages/${packageId}`] = packageArtifactManifest;
    blobsByDigest[`sha256:${archiveDigest}`] = archivePath;
  }

  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  fs.writeFileSync(
    channelManifestPath,
    JSON.stringify({
      manifest_version: 1,
      release_set_generation: input.version,
      package_catalog_surface_kind: 'opl_package_catalog.v1',
      packages: {
        package_catalog: packageEntries,
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
    assert.equal(output.managed_update.execution.adapter_results[0].status_detail.clean_managed_targets_count, 5);
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
    assert.equal(output.managed_update.execution.adapter_results[0].result.auto_apply_scope, 'legacy_explicit_channel_roots_only');
    assert.equal(output.managed_update.execution.adapter_results[0].result.read_model_guidance.status_plane, 'opl packages status --json');
    assert.equal(
      output.managed_update.execution.adapter_results[0].result.read_model_guidance.component_receipt_ledger,
      path.join(stateRoot, 'managed-update-component-receipts.json'),
    );
    assert.deepEqual(
      output.managed_update.execution.adapter_results[0].post_apply_actions.map((entry: any) => entry.action_id),
      ['reconcile_packages', 'sync_skills', 'sync_codex_skill_plugin_projection'],
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
        status: 'not_applicable',
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
    assert.equal(receiptLedger.receipts[0].status_detail.clean_managed_targets_count, 5);
    assert.equal(receiptLedger.receipts[0].status_detail.manual_required_targets_count, 0);
    assert.equal(receiptLedger.receipts[0].status_detail.post_apply_status, 'completed');
    assert.equal(receiptLedger.receipts[0].status_detail.reload_status, 'recommended');
    assert.deepEqual(
      receiptLedger.receipts[0].post_apply_action_statuses.map((entry: any) => entry.action_id),
      ['reconcile_packages', 'sync_skills', 'sync_codex_skill_plugin_projection'],
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
    assert.equal(agents.current.channel_manifest, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable');
    assert.equal(agents.current.oci_distribution.channel_ref, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable');
    assert.equal(agents.receipt.source_manifest_ref, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable');
    assert.doesNotMatch(JSON.stringify(agents), /one-person-lab-manifest:latest(?:"|\/)/);
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
      'scholarskills-head-sha',
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

const MANAGED_BUNDLED_PACKAGE_FIXTURES = [
  { packageId: 'mag', project: 'med-autogrant', moduleId: 'medautogrant', pathEnv: 'OPL_MODULE_PATH_MEDAUTOGRANT' },
  { packageId: 'mas', project: 'med-autoscience', moduleId: 'medautoscience', pathEnv: 'OPL_MODULE_PATH_MEDAUTOSCIENCE' },
  { packageId: 'mas-scholar-skills', project: 'mas-scholar-skills', moduleId: 'scholarskills', pathEnv: 'OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS' },
  { packageId: 'obf', project: 'opl-bookforge', moduleId: 'oplbookforge', pathEnv: 'OPL_MODULE_PATH_OPLBOOKFORGE' },
  { packageId: 'oma', project: 'opl-meta-agent', moduleId: 'oplmetaagent', pathEnv: 'OPL_MODULE_PATH_OPLMETAAGENT' },
  { packageId: 'opl-flow', project: 'opl-flow', moduleId: 'oplflow', pathEnv: 'OPL_MODULE_PATH_OPLFLOW' },
  { packageId: 'rca', project: 'redcube-ai', moduleId: 'redcube', pathEnv: 'OPL_MODULE_PATH_REDCUBE' },
] as const;

function sha256Value(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function writeJsonPayload(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(filePath, json, 'utf8');
  return json;
}

function filesUnder(root: string, relativeRoot = ''): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  return fs.readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) return filesUnder(root, relativePath);
    return entry.isFile() ? [relativePath.replaceAll(path.sep, '/')] : [];
  }).sort();
}

function writeManagedBundledScholarSource(root: string, manifest: Record<string, any>, revision: string) {
  for (const relativePath of manifest.content_lock.paths as string[]) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const skillId = path.basename(path.dirname(relativePath));
    const content = relativePath === '.codex-plugin/plugin.json'
      ? `${JSON.stringify({ name: 'mas-scholar-skills', skills: './skills/' }, null, 2)}\n`
      : path.basename(relativePath) === 'SKILL.md'
        ? `---\nname: ${skillId}\ndescription: Managed bundled ${revision} fixture.\n---\n\n# ${skillId}\n`
        : relativePath.endsWith('.json')
          ? `${JSON.stringify({ fixture_revision: revision }, null, 2)}\n`
          : `Managed bundled ${revision} fixture for ${relativePath}.\n`;
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function writeManagedBundledFlowSource(root: string, version: string, revision: string) {
  const capability = (input: {
    id: string;
    kind: string;
    source: string;
    installSource: string;
    lifecycleOwner: string;
    offlineBundle: 'none' | 'full';
    onlineInstallDefault: boolean;
    activation: string;
    conflictPolicy: string;
    credentialPolicy?: string;
  }) => ({
    id: input.id,
    kind: input.kind,
    owner: input.id === 'opl-base' ? 'one-person-lab' : input.id === 'officecli' ? 'iofficeai' : 'opl-flow',
    version_requirement: input.id === 'opl-flow' || input.id === 'coordinate-concurrent-tasks'
      ? `=${version}`
      : 'release_lock_exact',
    source: input.source,
    install_source: input.installSource,
    lifecycle_owner: input.lifecycleOwner,
    offline_bundle: input.offlineBundle,
    online_install_default: input.onlineInstallDefault,
    activation: input.activation,
    conflict_policy: input.conflictPolicy,
    credential_policy: input.credentialPolicy ?? 'none',
  });
  const policy = {
    schema: 'opl_flow_workflow_policy.v2',
    package: { id: 'opl-flow', version, owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: revision,
    provides: [
      capability({
        id: 'opl-flow', kind: 'codex_plugin', source: 'package:opl-flow',
        installSource: 'package_payload', lifecycleOwner: 'opl-framework', offlineBundle: 'full',
        onlineInstallDefault: true, activation: 'always', conflictPolicy: 'fail_closed_on_collision',
      }),
      capability({
        id: 'opl-flow', kind: 'codex_skill', source: 'package:opl-flow/skills/opl-flow',
        installSource: 'package_payload', lifecycleOwner: 'opl-framework', offlineBundle: 'full',
        onlineInstallDefault: true, activation: 'task_routed', conflictPolicy: 'fail_closed_on_collision',
      }),
      capability({
        id: 'coordinate-concurrent-tasks', kind: 'codex_skill',
        source: 'package:opl-flow/skills/coordinate-concurrent-tasks', installSource: 'package_payload',
        lifecycleOwner: 'opl-framework', offlineBundle: 'full', onlineInstallDefault: true,
        activation: 'task_routed', conflictPolicy: 'fail_closed_on_collision',
      }),
    ],
    requires: [capability({
      id: 'opl-base', kind: 'base', source: 'gaofeng21cn/one-person-lab',
      installSource: 'framework_managed_release_lock', lifecycleOwner: 'opl-framework',
      offlineBundle: 'full', onlineInstallDefault: true, activation: 'always',
      conflictPolicy: 'managed_reconcile',
    })],
    recommends: [
      capability({
        id: 'officecli', kind: 'codex_skill', source: 'skills-manager:officecli',
        installSource: 'framework_managed_release_lock', lifecycleOwner: 'opl-framework',
        offlineBundle: 'full', onlineInstallDefault: true, activation: 'task_routed',
        conflictPolicy: 'managed_reconcile',
      }),
      capability({
        id: 'officecli', kind: 'cli', source: 'officecli',
        installSource: 'framework_managed_release_lock', lifecycleOwner: 'opl-framework',
        offlineBundle: 'full', onlineInstallDefault: true, activation: 'task_routed',
        conflictPolicy: 'managed_reconcile',
      }),
    ],
    compatible_optional: [capability({
      id: 'openai-primary-runtime-office-pdf', kind: 'runtime_capability', source: 'openai-primary-runtime',
      installSource: 'codex_builtin', lifecycleOwner: 'codex', offlineBundle: 'none',
      onlineInstallDefault: false, activation: 'task_routed', conflictPolicy: 'preserve_user_surface',
    })],
    installation_convergence: {
      standard_target_closure: 'workflow_policy_release_lock',
      full_target_closure: 'workflow_policy_release_lock',
      standard_source: 'online_exact_release_lock',
      full_source: 'embedded_exact_release_lock',
      final_projection_equivalence_required: true,
      default_dependencies_require_full_bundle: true,
      secrets_bundled: false,
      user_third_party_surfaces_policy: 'preserve',
    },
    conflicts: [{
      id: 'codexcont-intelligence-enhancement',
      discovery_ids: ['codexcont', 'intelligence_enhancement'],
      auto_retire_on_optimize: true,
      reason: 'Managed bundled fixture legacy service.',
    }],
    retires: [{
      id: 'superpowers-local-method-profile',
      discovery_ids: ['superpowers-lite', 'planner'],
      auto_retire_on_optimize: true,
      reason: 'Managed bundled fixture legacy Skill and prompt.',
    }],
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
      skill_ids: ['superpowers-lite'],
      service_ids: ['codexcont'],
      config_markers: ['codexcont'],
      legacy_prompt_ids: ['planner'],
    },
    codex_model_policy: {
      authority: 'opl-flow',
      configured_default: { model: 'gpt-fixture', reasoning_effort: revision },
      override_precedence: ['explicit_user_override', 'opl_flow_recommendation', 'app_fallback'],
    },
  };
  writeJsonPayload(path.join(root, '.codex-plugin', 'plugin.json'), {
    name: 'opl-flow',
    version,
    skills: './skills/',
  });
  for (const skillId of ['coordinate-concurrent-tasks', 'opl-flow']) {
    fs.mkdirSync(path.join(root, 'skills', skillId), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'skills', skillId, 'SKILL.md'),
      `---\nname: ${skillId}\ndescription: Managed bundled ${revision} fixture.\n---\n\n# ${skillId}\n`,
      'utf8',
    );
  }
  writeJsonPayload(path.join(root, 'contracts', 'workflow-policy.json'), policy);
  writeJsonPayload(path.join(root, 'contracts', 'workflow-policy.schema.json'), { type: 'object' });
  writeJsonPayload(path.join(root, 'profile', 'manifest.json'), { fixture_revision: revision });
  fs.mkdirSync(path.join(root, 'profile', 'modules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'profile', 'modules', '01-user-preferences.md'), `# ${revision}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'templates', 'AGENTS.md'), `# AGENTS ${revision}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'templates', 'TASTE.md'), `# TASTE ${revision}\n`, 'utf8');
}

function managedBundledSourceCommit(packageId: string, revision: string) {
  return crypto.createHash('sha256').update(`${packageId}\n${revision}`).digest('hex').slice(0, 40);
}

function managedBundledRawSourceUrl(
  sourceRepo: string,
  sourceCommit: string,
  sourceRoot: string,
  relativePath: string,
) {
  const coordinates = new URL(sourceRepo).pathname.replace(/^\//, '').replace(/\.git$/, '');
  const treePath = sourceRoot === '.' ? relativePath : `${sourceRoot}/${relativePath}`;
  return `https://raw.githubusercontent.com/${coordinates}/${sourceCommit}/${treePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function writeManagedBundledCatalogFixture(input: {
  workspaceRoot: string;
  outputRoot: string;
  revision: string;
}) {
  const packages: Record<string, unknown> = {};
  const roots = Object.fromEntries(MANAGED_BUNDLED_PACKAGE_FIXTURES.map((entry) => [
    entry.packageId,
    path.join(input.workspaceRoot, entry.project),
  ])) as Record<string, string>;
  const scholarManifest = readJsonFile(
    path.resolve('contracts', 'opl-framework', 'packages', 'mas-scholar-skills.json'),
  ) as Record<string, any>;
  writeManagedBundledScholarSource(roots['mas-scholar-skills'], scholarManifest, input.revision);
  const flowManifest = readJsonFile(
    path.resolve('contracts', 'opl-framework', 'packages', 'opl-flow.json'),
  ) as Record<string, any>;
  writeManagedBundledFlowSource(roots['opl-flow'], flowManifest.version, input.revision);

  for (const fixture of MANAGED_BUNDLED_PACKAGE_FIXTURES) {
    const root = roots[fixture.packageId];
    const canonicalManifestPath = path.resolve(
      'contracts',
      'opl-framework',
      'packages',
      `${fixture.packageId}.json`,
    );
    const manifest = structuredClone(readJsonFile(canonicalManifestPath)) as Record<string, any>;
    const canonicalPayloadPath = path.resolve(
      path.dirname(canonicalManifestPath),
      manifest.codex_surface.plugin_payload_manifest_url,
    );
    const canonicalPayload = readJsonFile(canonicalPayloadPath) as Record<string, any>;
    const sourceRoot = canonicalPayload.source_root as string;
    const sourcePath = sourceRoot === '.' ? root : path.join(root, sourceRoot);
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, '.opl-managed-bundled-revision'), `${input.revision}\n`, 'utf8');
    for (const skillPath of filesUnder(sourcePath).filter((entry) => entry.endsWith('/SKILL.md'))) {
      const current = fs.readFileSync(path.join(sourcePath, skillPath), 'utf8')
        .replace(/\nManaged bundled revision: .*\n$/, '\n');
      fs.writeFileSync(
        path.join(sourcePath, skillPath),
        `${current.trimEnd()}\n\nManaged bundled revision: ${input.revision}\n`,
        'utf8',
      );
    }
    const sourceCommit = managedBundledSourceCommit(fixture.packageId, input.revision);
    writeJsonPayload(path.join(root, 'opl-runtime-module.json'), {
      marker_version: 1,
      module_id: fixture.moduleId,
      repo_name: fixture.project,
      packaged_runtime: true,
      source_git: { head_sha: sourceCommit },
    });
    const files = filesUnder(sourcePath).map((relativePath) => {
      const filePath = path.join(sourcePath, relativePath);
      const bytes = fs.readFileSync(filePath);
      return {
        path: relativePath,
        mode: (fs.statSync(filePath).mode & 0o111) !== 0 ? '100755' : '100644',
        source_url: managedBundledRawSourceUrl(
          manifest.source_repo,
          sourceCommit,
          sourceRoot,
          relativePath,
        ),
        sha256: sha256Value(bytes),
      };
    });
    const contentDigest = packageContentLockDigest(
      CANONICAL_PACKAGE_CONTENT_LOCK,
      files.map((entry) => ({
        path: entry.path,
        content: fs.readFileSync(path.join(sourcePath, entry.path)),
      })),
    );
    manifest.codex_surface = {
      ...manifest.codex_surface,
      carrier_source_commit: sourceCommit,
      plugin_payload_manifest_url: `payloads/${fixture.packageId}.json`,
    };
    if (fixture.packageId === 'mas-scholar-skills') {
      manifest.content_lock = {
        ...manifest.content_lock,
        paths: files.map((entry) => entry.path),
        digest: contentDigest,
      };
    }
    const manifestRef = `packages/${fixture.packageId}.json`;
    const payloadRef = `packages/payloads/${fixture.packageId}.json`;
    const payload = {
      surface_kind: 'opl_package_payload_manifest.v2',
      schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
      package_id: fixture.packageId,
      plugin_id: manifest.codex_surface.plugin_id,
      package_version: manifest.version,
      source_repo: manifest.source_repo,
      source_commit: sourceCommit,
      source_root: sourceRoot,
      content_lock: {
        algorithm: 'sha256',
        canonicalization: CANONICAL_PACKAGE_CONTENT_LOCK,
        digest: contentDigest,
      },
      files,
    };
    const manifestJson = writeJsonPayload(path.join(input.outputRoot, manifestRef), manifest);
    const payloadJson = writeJsonPayload(path.join(input.outputRoot, payloadRef), payload);
    packages[fixture.packageId] = {
      package_id: fixture.packageId,
      package_role: manifest.surface_kind === 'opl_capability_package_manifest.v2'
        ? 'framework_capability_package'
        : manifest.surface_kind === 'opl_workflow_profile_package_manifest.v1'
          ? 'workflow_profile'
          : 'standard_agent',
      package_version: manifest.version,
      owner_source_commit: sourceCommit,
      manifest_ref: manifestRef,
      manifest_sha256: sha256Value(manifestJson),
      payload_manifest_ref: payloadRef,
      payload_manifest_sha256: sha256Value(payloadJson),
      runtime_module_relative_path: `modules/${fixture.packageId}`,
    };
  }
  const catalogPath = path.join(input.outputRoot, 'catalog.json');
  writeJsonPayload(catalogPath, {
    surface_kind: 'opl_bundled_full_runtime_package_catalog.v1',
    schema_ref: 'contracts/opl-framework/bundled-full-runtime-package-catalog.schema.json',
    catalog_id: 'opl-framework-bundled-full-runtime-packages',
    packages,
  });
  return {
    catalogPath,
    roots,
    sourceCommits: Object.fromEntries(MANAGED_BUNDLED_PACKAGE_FIXTURES.map((entry) => [
      entry.packageId,
      managedBundledSourceCommit(entry.packageId, input.revision),
    ])) as Record<string, string>,
  };
}

async function withProcessEnvironment<T>(
  env: Record<string, string>,
  operation: () => Promise<T>,
) {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    return await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function pathBytesDigest(targetPath: string) {
  if (!fs.existsSync(targetPath)) return 'absent';
  const digest = crypto.createHash('sha256');
  const visit = (currentPath: string, relativePath: string) => {
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      digest.update(`link\0${relativePath}\0${fs.readlinkSync(currentPath)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      digest.update(`dir\0${relativePath}\0`);
      for (const entry of fs.readdirSync(currentPath).sort()) {
        visit(path.join(currentPath, entry), path.join(relativePath, entry));
      }
      return;
    }
    digest.update(`file\0${relativePath}\0`);
    digest.update(fs.readFileSync(currentPath));
  };
  visit(targetPath, '.');
  return digest.digest('hex');
}

function managedBundledStateFingerprint(input: {
  homeRoot: string;
  stateRoot: string;
  codexHome: string;
  scopeRoot: string;
  baseSentinelRoot: string;
  appSentinelRoot: string;
}) {
  const paths = {
    package_lock: path.join(input.stateRoot, 'agent-package-locks.json'),
    lifecycle_ledger: path.join(input.stateRoot, 'agent-package-lifecycle-ledger.json'),
    payload_cache: path.join(input.stateRoot, 'agent-package-payloads'),
    marketplace_cache: path.join(input.stateRoot, 'codex-plugin-marketplaces'),
    plugin_carriers: path.join(input.stateRoot, 'codex-plugin-carriers'),
    package_transactions: path.join(input.stateRoot, 'agent-package-transactions'),
    skill_projections: path.join(input.stateRoot, 'agent-package-skill-projections'),
    base_dependencies: path.join(input.stateRoot, 'base-dependencies'),
    codex_config: path.join(input.codexHome, 'config.toml'),
    codex_agents: path.join(input.codexHome, 'AGENTS.md'),
    codex_taste: path.join(input.codexHome, 'TASTE.md'),
    codex_state: path.join(input.codexHome, 'state'),
    codex_plugins: path.join(input.codexHome, 'plugins'),
    codex_skills: path.join(input.codexHome, 'skills'),
    codex_prompts: path.join(input.codexHome, 'prompts'),
    codex_prompt_agents: path.join(input.codexHome, 'agents'),
    codex_staged_plugins: path.join(input.codexHome, '.tmp', 'plugins', 'plugins'),
    companion_sources: path.join(input.codexHome, 'opl-companion-sources'),
    agents_skills: path.join(input.homeRoot, '.agents', 'skills'),
    skills_manager_skills: path.join(input.homeRoot, '.skills-manager', 'skills'),
    launch_agents: path.join(input.homeRoot, 'Library', 'LaunchAgents'),
    systemd_user_services: path.join(input.homeRoot, '.config', 'systemd', 'user'),
    legacy_home_service: path.join(input.homeRoot, '.codexcont'),
    user_tool_root: path.join(input.homeRoot, '.local', 'bin'),
    scope_skills: path.join(input.scopeRoot, '.codex', 'skills'),
    scope_transactions: path.join(input.scopeRoot, '.codex', '.opl-package-transactions'),
    base_sentinel: input.baseSentinelRoot,
    app_sentinel: input.appSentinelRoot,
  };
  return Object.fromEntries(Object.entries(paths).map(([key, targetPath]) => [
    key,
    pathBytesDigest(targetPath),
  ]));
}

function packageMutationUnitFingerprint(input: {
  stateRoot: string;
  packageIds: string[];
  rootPackageId: string;
}) {
  const packageIds = new Set(input.packageIds);
  const lockIndex = readJsonFile(path.join(input.stateRoot, 'agent-package-locks.json')) as any;
  const lifecycle = readJsonFile(path.join(input.stateRoot, 'agent-package-lifecycle-ledger.json')) as any;
  const locks = lockIndex.packages
    .filter((entry: any) => packageIds.has(entry.package_id))
    .sort((left: any, right: any) => left.package_id.localeCompare(right.package_id));
  const ownedPaths = new Set<string>();
  const addPath = (candidate: unknown) => {
    if (typeof candidate === 'string' && path.isAbsolute(candidate)) ownedPaths.add(candidate);
  };
  for (const lock of locks) {
    const surface = lock.physical_surface ?? {};
    for (const key of [
      'codex_plugin_cache_path',
      'marketplace_path',
      'marketplace_plugin_path',
      'plugin_payload_cache_path',
    ]) addPath(surface[key]);
    for (const candidate of surface.materialized_required_skill_paths ?? []) addPath(candidate);
    for (const candidate of surface.removed_paths ?? []) addPath(candidate);
    const profile = surface.profile_migration ?? {};
    for (const key of ['target_path', 'receipt_path', 'merge_packet_path']) addPath(profile[key]);
    for (const action of profile.mutation_actions ?? []) {
      addPath(action.target_path);
      addPath(action.backup_ref);
    }
    const managedPolicy = surface.workflow_policy_migration ?? {};
    addPath(managedPolicy.backup_root);
    for (const action of managedPolicy.actions ?? []) {
      addPath(action.source_ref);
      addPath(action.backup_ref);
    }
    for (const scope of lock.scope_materializations ?? []) {
      for (const skillId of [...(scope.managed_skill_ids ?? []), ...(scope.retired_skill_ids ?? [])]) {
        addPath(path.join(scope.target_root, '.codex', 'skills', skillId));
      }
      addPath(path.join(
        scope.target_root,
        '.codex',
        '.opl-package-transactions',
        scope.transaction_id,
      ));
    }
    addPath(path.join(input.stateRoot, 'agent-package-transactions', lock.package_id));
  }
  return {
    package_locks: locks,
    last_known_good_transactions: (lockIndex.last_known_good_transactions ?? [])
      .filter((entry: any) => entry.root_package_id === input.rootPackageId),
    lifecycle_receipts: (lifecycle.receipts ?? [])
      .filter((entry: any) => packageIds.has(entry.package_id)),
    owned_path_digests: Object.fromEntries([...ownedPaths]
      .sort()
      .map((targetPath) => [targetPath, pathBytesDigest(targetPath)])),
  };
}

test('public update apply retains successful bundled roots when another root restores its local prestate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-bundled-public-apply-'));
  const captureRoot = path.join(root, 'capture');
  const homeRoot = path.join(root, 'home');
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(homeRoot, 'codex-home');
  const runtimeHome = path.join(root, 'full-runtime');
  const scopeRoot = path.join(root, 'workspace-scope');
  const baseSentinelRoot = path.join(root, 'base-sentinel');
  const appSentinelRoot = path.join(root, 'app-sentinel');
  fs.mkdirSync(captureRoot, { recursive: true });
  fs.mkdirSync(runtimeHome, { recursive: true });
  fs.mkdirSync(scopeRoot, { recursive: true });
  fs.mkdirSync(baseSentinelRoot, { recursive: true });
  fs.mkdirSync(appSentinelRoot, { recursive: true });
  fs.writeFileSync(path.join(baseSentinelRoot, 'authority.bin'), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(appSentinelRoot, 'authority.bin'), Buffer.from([4, 5, 6, 7]));
    const family = createFakeFamilySkillWorkspace(captureRoot);
    const companionEnv = createFakeCompanionInstallEnv(homeRoot);
    const companionToolBin = writeFakeCompanionToolBinaries(homeRoot);
    const managedOfficeCliSkillRoot = path.join(homeRoot, '.skills-manager', 'skills', 'officecli');
    fs.mkdirSync(path.dirname(managedOfficeCliSkillRoot), { recursive: true });
    fs.cpSync(companionEnv.OPL_OFFICECLI_SOURCE_ROOT, managedOfficeCliSkillRoot, { recursive: true });
    fs.mkdirSync(stateRoot, { recursive: true });
    writeJsonPayload(path.join(stateRoot, 'developer-supervisor.json'), {
      version: 'g1',
      enabled: 'on',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'fixture-user',
      updated_at: new Date(0).toISOString(),
      source: 'user_config',
    });
    const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
exit 0
`);
    const baseRuntimeRoot = path.join(root, 'base-runtime');
    const baseRuntimeBin = path.join(baseRuntimeRoot, 'current', 'bin');
    const baseRuntimeCodex = path.join(baseRuntimeBin, 'codex');
    const baseFixtureBin = path.join(root, 'base-fixture-bin');
    fs.mkdirSync(baseRuntimeBin, { recursive: true });
    fs.mkdirSync(baseFixtureBin, { recursive: true });
    fs.writeFileSync(
      baseRuntimeCodex,
      '#!/bin/sh\necho "codex-cli 0.130.0"\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(baseFixtureBin, 'npm'),
      '#!/bin/sh\nexit 91\n',
      { mode: 0o755 },
    );
    const launchctlLog = path.join(root, 'launchctl-invocations.log');
    fs.writeFileSync(
      path.join(codexFixture.fixtureRoot, 'launchctl'),
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$OPL_TEST_LAUNCHCTL_LOG"\nexit 91\n',
      { mode: 0o755 },
    );
  try {
    const oldCatalog = writeManagedBundledCatalogFixture({
      workspaceRoot: family.workspaceRoot,
      outputRoot: path.join(root, 'catalog-old'),
      revision: 'old',
    });
    const rootEnv = Object.fromEntries(MANAGED_BUNDLED_PACKAGE_FIXTURES.flatMap((entry) => {
      const packageRoot = oldCatalog.roots[entry.packageId];
      return entry.packageId === 'opl-flow'
        ? [[entry.pathEnv, packageRoot], ['OPL_FLOW_REPO_ROOT', packageRoot]]
        : [[entry.pathEnv, packageRoot]];
    }));
    const commonEnv = {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateRoot,
      OPL_FULL_RUNTIME_HOME: runtimeHome,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG: oldCatalog.catalogPath,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_FRAMEWORK_UPDATE_SOURCE: path.resolve('.'),
      OPL_CLI_TEST_TIMEOUT_MS: '120000',
      OPL_TEST_LAUNCHCTL_LOG: launchctlLog,
      ...companionEnv,
      PATH: `${companionToolBin}${path.delimiter}${codexFixture.fixtureRoot}${path.delimiter}${process.env.PATH ?? ''}`,
      ...rootEnv,
    };
    const installed = await withProcessEnvironment(commonEnv, async () =>
      await reconcileBundledFullRuntimePackagesIfAvailable(process.env, { lifecycleAction: 'install' })
    );
    assert.equal(installed?.status, 'completed', JSON.stringify(installed, null, 2));
    assert.deepEqual(installed?.root_package_ids, ['mag', 'mas', 'obf', 'oma', 'opl-flow', 'rca']);
    assert.equal(installed?.summary.installed_package_count, 7);

    const bound = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      scopeRoot,
    ], commonEnv) as any;
    assert.equal(bound.workspace_catalog.binding.status, 'active');
    assert.equal(bound.workspace_catalog.binding.workspace_path, scopeRoot);

    const activated = runCli([
      'packages',
      'activate',
      'mas',
      '--scope',
      'workspace',
      '--target-workspace',
      scopeRoot,
    ], commonEnv) as any;
    const activatedScopes = activated.opl_agent_package_activation.package_lock.scope_materializations
      .filter((entry: any) => entry.target_root === scopeRoot);
    assert.equal(activatedScopes.length, 1);
    assert.equal(activatedScopes[0].provider_package_id, 'mas-scholar-skills');

    const oldLockIndex = readJsonFile(path.join(stateRoot, 'agent-package-locks.json')) as any;
    const oldMasLock = oldLockIndex.packages.find((entry: any) => entry.package_id === 'mas');
    const oldScholarLock = oldLockIndex.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills');
    assert.equal(typeof oldMasLock.dependency_transaction_id, 'string');
    assert.equal(typeof oldMasLock.dependency_closure_digest, 'string');
    assert.equal(oldMasLock.dependency_transaction_id, oldScholarLock.dependency_transaction_id);
    assert.equal(oldMasLock.dependency_closure_digest, oldScholarLock.dependency_closure_digest);

    const newCatalog = writeManagedBundledCatalogFixture({
      workspaceRoot: family.workspaceRoot,
      outputRoot: path.join(root, 'catalog-new'),
      revision: 'new',
    });
    const updateEnv = {
      ...commonEnv,
      OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG: newCatalog.catalogPath,
    };
    const packageOwnedProfiles = new Map(['AGENTS.md', 'TASTE.md'].map((fileName) => {
      const filePath = path.join(codexHome, fileName);
      return [filePath, fs.readFileSync(filePath)];
    }));
    const userOwnedProfiles = new Map<string, Buffer>();
    for (const [filePath] of packageOwnedProfiles) {
      const content = Buffer.from(`# User-owned ${path.basename(filePath)}\n`);
      userOwnedProfiles.set(filePath, content);
      fs.writeFileSync(filePath, content);
    }
    const profileBlocked = runCli(['update', 'apply'], {
      ...updateEnv,
      OPL_RUNTIME_ROOT: baseRuntimeRoot,
      OPL_CODEX_BIN: baseRuntimeCodex,
      OPL_FRAMEWORK_UPDATE_SOURCE: '',
      PATH: `${baseFixtureBin}${path.delimiter}${updateEnv.PATH}`,
    }) as any;
    assert.deepEqual(
      profileBlocked.managed_update.execution.adapter_results.map((entry: any) => entry.component_id),
      ['opl_base', 'opl_packages'],
    );
    assert.deepEqual(
      profileBlocked.managed_update.components.map((entry: any) => entry.component_id),
      ['opl_base', 'opl_packages'],
    );
    const profileBaseAdapter = profileBlocked.managed_update.execution.adapter_results.find(
      (entry: any) => entry.component_id === 'opl_base',
    );
    const profileAdapter = profileBlocked.managed_update.execution.adapter_results.find(
      (entry: any) => entry.component_id === 'opl_packages',
    );
    assert.equal(profileBaseAdapter.adapter_id, 'runtime_substrate_adapter');
    assert.equal(profileAdapter.adapter_id, 'capability_packages_adapter');
    const profileReconciliation = profileAdapter.result.bundled_full_runtime_reconciliation;
    const profileFailure = profileReconciliation.failures.find((entry: any) => (
      entry.package_id === 'opl-flow'
    ));
    assert.equal(profileBlocked.managed_update.execution.status, 'partial_success');
    assert.equal(profileAdapter.status, 'partial_success');
    assert.equal(profileReconciliation.status, 'partial');
    assert.deepEqual(
      profileReconciliation.root_installs.map((entry: any) => entry.status),
      ['completed', 'completed', 'completed', 'completed', 'manual_required', 'completed'],
    );
    assert.equal(profileFailure.failure_code, 'agent_package_bundled_managed_surface_manual_required');
    assert.equal(profileFailure.details.profile_migration_status, 'semantic_merge_required');
    assert.equal(profileFailure.details.mutation_started, false);
    for (const [filePath, content] of userOwnedProfiles) {
      assert.deepEqual(fs.readFileSync(filePath), content);
    }
    assert.equal(fs.existsSync(launchctlLog), false);
    const profileLocks = readJsonFile(path.join(stateRoot, 'agent-package-locks.json')) as any;
    assert.equal(
      profileLocks.packages.find((entry: any) => entry.package_id === 'opl-flow').owner_source_commit,
      oldCatalog.sourceCommits['opl-flow'],
    );
    assert.equal(
      profileLocks.packages.find((entry: any) => entry.package_id === 'mag').owner_source_commit,
      newCatalog.sourceCommits.mag,
    );
    for (const [filePath, content] of packageOwnedProfiles) fs.writeFileSync(filePath, content);

    const servicePath = path.join(homeRoot, 'Library', 'LaunchAgents', 'codexcont.plist');
    const serviceStateSentinel = path.join(root, 'codexcont-runtime-state.sentinel');
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, '<plist><string>managed-service-sentinel</string></plist>\n', 'utf8');
    fs.writeFileSync(serviceStateSentinel, 'enabled-and-running\n', 'utf8');
    const serviceDefinitionDigest = pathBytesDigest(servicePath);
    const serviceStateDigest = pathBytesDigest(serviceStateSentinel);
    const serviceConflictPrestate = managedBundledStateFingerprint({
      homeRoot,
      stateRoot,
      codexHome,
      scopeRoot,
      baseSentinelRoot,
      appSentinelRoot,
    });
    const serviceBlocked = runCli(['update', 'apply'], updateEnv) as any;
    const serviceAdapter = serviceBlocked.managed_update.execution.adapter_results[0];
    const serviceReconciliation = serviceAdapter.result.bundled_full_runtime_reconciliation;
    const serviceFailure = serviceReconciliation.failures.find((entry: any) => (
      entry.package_id === 'opl-flow'
    ));
    assert.equal(serviceBlocked.managed_update.execution.status, 'manual_required');
    assert.equal(serviceAdapter.status, 'manual_required');
    assert.equal(serviceReconciliation.status, 'partial');
    assert.deepEqual(
      serviceReconciliation.root_installs.map((entry: any) => entry.status),
      ['skipped', 'skipped', 'skipped', 'skipped', 'manual_required', 'skipped'],
    );
    assert.equal(serviceFailure.failure_code, 'agent_package_bundled_managed_surface_manual_required');
    assert.equal(serviceFailure.details.profile_migration_status, 'validated_no_write');
    assert.equal(serviceFailure.details.service_conflicts.length, 1);
    assert.equal(serviceFailure.details.service_conflicts[0].physical_ref, servicePath);
    assert.equal(serviceFailure.details.mutation_started, false);
    assert.equal(fs.existsSync(launchctlLog), false);
    assert.equal(pathBytesDigest(servicePath), serviceDefinitionDigest);
    assert.equal(pathBytesDigest(serviceStateSentinel), serviceStateDigest);
    assert.deepEqual(managedBundledStateFingerprint({
      homeRoot,
      stateRoot,
      codexHome,
      scopeRoot,
      baseSentinelRoot,
      appSentinelRoot,
    }), serviceConflictPrestate);
    assert.equal(fs.existsSync(path.join(stateRoot, 'managed-update-kernel.lock')), false);
    fs.rmSync(servicePath);
    fs.rmSync(serviceStateSentinel);

    const faultCatalog = writeManagedBundledCatalogFixture({
      workspaceRoot: family.workspaceRoot,
      outputRoot: path.join(root, 'catalog-fault'),
      revision: 'fault',
    });
    const faultEnv = {
      ...commonEnv,
      OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG: faultCatalog.catalogPath,
    };
    const unrelatedSurfacePaths = {
      family_carrier: path.join(stateRoot, 'codex-plugin-carriers', 'unrelated-family', 'sentinel.bin'),
      plugin_registry: path.join(codexHome, 'plugins', 'unrelated-family', 'sentinel.bin'),
      codex_state: path.join(codexHome, 'state', 'unrelated-family', 'sentinel.bin'),
      companion_source: path.join(codexHome, 'opl-companion-sources', 'unrelated-family', 'sentinel.bin'),
    };
    for (const [indexValue, filePath] of Object.values(unrelatedSurfacePaths).entries()) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from([9, 8, 7, indexValue]));
    }
    const unrelatedSurfacePrestate = Object.fromEntries(Object.entries(unrelatedSurfacePaths).map(
      ([key, filePath]) => [key, pathBytesDigest(filePath)],
    ));
    const authoritySentinels = {
      base: pathBytesDigest(baseSentinelRoot),
      app: pathBytesDigest(appSentinelRoot),
    };
    const packageUnitPrestate = packageMutationUnitFingerprint({
      stateRoot,
      packageIds: ['mas'],
      rootPackageId: 'mas',
    });
    const preFaultLocks = readJsonFile(path.join(stateRoot, 'agent-package-locks.json')) as any;
    const preFaultMasLock = preFaultLocks.packages.find((entry: any) => entry.package_id === 'mas');
    const scopeSkillsPreFault = pathBytesDigest(path.join(scopeRoot, '.codex', 'skills'));
    const componentLedgerPath = path.join(stateRoot, 'managed-update-component-receipts.json');
    const componentReceiptCountBeforeFault = (readJsonFile(componentLedgerPath) as any).receipts.length;

    const partial = runCli(['update', 'apply'], {
      ...faultEnv,
      OPL_TEST_MANAGED_BUNDLED_UPDATE_POST_VERIFY_FAIL_PACKAGE_ID: 'mas',
    }) as any;
    assert.deepEqual(partial.managed_update.components.map((entry: any) => entry.component_id), ['opl_packages']);
    assert.deepEqual(
      partial.managed_update.execution.adapter_results.map((entry: any) => entry.component_id),
      ['opl_packages'],
    );
    const partialAdapter = partial.managed_update.execution.adapter_results[0];
    const partialReconciliation = partialAdapter.result.bundled_full_runtime_reconciliation;
    assert.equal(partial.managed_update.execution.status, 'partial_failure');
    assert.equal(partialAdapter.status, 'partial_failure');
    assert.equal(partialAdapter.apply_mode, 'auto_apply');
    assert.equal(partialAdapter.result.app_background_safe, false);
    assert.equal(partialReconciliation.status, 'partial');
    assert.equal(partialReconciliation.orchestration_policy, 'fail_open_per_root_package');
    assert.equal(
      partialReconciliation.package_mutation_policy,
      'fail_closed_per_required_dependency_closure',
    );
    assert.deepEqual(
      partialReconciliation.root_installs.map((entry: any) => entry.status),
      ['completed', 'failed', 'completed', 'completed', 'completed', 'completed'],
    );
    const failedMas = partialAdapter.result.targets.find((entry: any) => entry.target_id === 'mas');
    assert.equal(failedMas.result.failure.failure_code, 'agent_package_bundled_full_runtime_package_rolled_back');
    assert.equal(
      failedMas.result.failure.details.original_error.error.details.failure_code,
      'test_managed_bundled_update_post_verify_interrupted',
    );
    assert.equal(failedMas.result.package_mutation_unit.status, 'rolled_back');
    assert.equal(failedMas.result.package_mutation_unit.local_prestate_restored, true);
    assert.deepEqual(packageMutationUnitFingerprint({
      stateRoot,
      packageIds: ['mas'],
      rootPackageId: 'mas',
    }), packageUnitPrestate);
    assert.equal(pathBytesDigest(path.join(scopeRoot, '.codex', 'skills')), scopeSkillsPreFault);
    const locksAfterPartial = readJsonFile(path.join(stateRoot, 'agent-package-locks.json')) as any;
    for (const packageId of ['mag', 'obf', 'oma', 'opl-flow', 'rca']) {
      assert.equal(
        locksAfterPartial.packages.find((entry: any) => entry.package_id === packageId).owner_source_commit,
        faultCatalog.sourceCommits[packageId],
      );
    }
    assert.deepEqual(
      locksAfterPartial.packages.find((entry: any) => entry.package_id === 'mas'),
      preFaultMasLock,
    );
    const updatedScholarLock = locksAfterPartial.packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(
      updatedScholarLock.owner_source_commit,
      faultCatalog.sourceCommits['mas-scholar-skills'],
    );
    assert.equal(
      locksAfterPartial.packages.find((entry: any) => entry.package_id === 'mag')
        .resolved_dependencies.find((entry: any) => entry.package_id === 'mas-scholar-skills')
        .manifest_sha256,
      updatedScholarLock.manifest_sha256,
    );
    assert.equal((readJsonFile(componentLedgerPath) as any).receipts.length, componentReceiptCountBeforeFault + 1);
    assert.equal(partial.managed_update.execution.receipt_record.recorded_receipt_count, 1);
    const partialReceiptRef = partial.managed_update.execution.receipt_record.receipt_refs[0];
    const partialComponentReceipt = (readJsonFile(componentLedgerPath) as any).receipts
      .find((entry: any) => entry.receipt_ref === partialReceiptRef);
    assert.equal(partialComponentReceipt.adapter_result_ref, partialAdapter.result_ref);
    assert.equal(partialComponentReceipt.verify_result, 'failed');
    assert.equal(partialComponentReceipt.status_detail.changed_targets_count, 5);
    assert.equal(partialComponentReceipt.status_detail.failed_targets_count, 1);
    assert.equal(partialAdapter.post_apply_actions.every((entry: any) => entry.status === 'manual_required'), true);
    assert.deepEqual(
      partialAdapter.post_apply_actions.map((entry: any) => entry.command_ref),
      Array(3).fill('opl packages status --json'),
    );
    assert.equal(
      partialAdapter.post_apply_actions
        .filter((entry: any) => entry.action_id !== 'reconcile_packages')
        .every((entry: any) => entry.result.writes_performed === false),
      true,
    );
    assert.equal(
      partialAdapter.post_apply_actions.some((entry: any) => (
        /packages update|configure-codex/.test(entry.command_ref)
      )),
      false,
    );
    assert.equal(fs.existsSync(path.join(stateRoot, 'managed-update-kernel.lock')), false);

    const isolatedFaultPrestate = managedBundledStateFingerprint({
      homeRoot,
      stateRoot,
      codexHome,
      scopeRoot,
      baseSentinelRoot,
      appSentinelRoot,
    });
    const isolatedReceiptCount = (readJsonFile(componentLedgerPath) as any).receipts.length;
    const isolatedFault = runCli(['update', 'apply'], {
      ...faultEnv,
      OPL_TEST_MANAGED_BUNDLED_UPDATE_POST_VERIFY_FAIL_PACKAGE_ID: 'mas',
    }) as any;
    const isolatedAdapter = isolatedFault.managed_update.execution.adapter_results[0];
    assert.equal(isolatedFault.managed_update.execution.status, 'failed_with_repair');
    assert.equal(isolatedAdapter.status, 'failed');
    assert.deepEqual(
      isolatedAdapter.result.targets.map((entry: any) => entry.status),
      ['skipped', 'failed', 'skipped', 'skipped', 'skipped', 'skipped'],
    );
    assert.equal(
      isolatedAdapter.result.targets.find((entry: any) => entry.target_id === 'mas')
        .result.package_mutation_unit.local_prestate_restored,
      true,
    );
    assert.deepEqual(managedBundledStateFingerprint({
      homeRoot,
      stateRoot,
      codexHome,
      scopeRoot,
      baseSentinelRoot,
      appSentinelRoot,
    }), isolatedFaultPrestate);
    assert.equal((readJsonFile(componentLedgerPath) as any).receipts.length, isolatedReceiptCount + 1);
    assert.equal(fs.existsSync(path.join(stateRoot, 'managed-update-kernel.lock')), false);

    const output = runCli(['update', 'apply'], faultEnv) as any;
    assert.deepEqual(
      output.managed_update.components.map((entry: any) => entry.component_id),
      ['opl_packages'],
    );
    assert.deepEqual(
      output.managed_update.execution.adapter_results.map((entry: any) => entry.component_id),
      ['opl_packages'],
    );
    const adapter = output.managed_update.execution.adapter_results[0];
    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.execution.status, 'completed');
    assert.equal(output.managed_update.authority_boundary.can_mutate_app_owned_runtime_root, false);
    assert.equal(output.managed_update.authority_boundary.can_mutate_installation_carrier, false);
    assert.equal(output.managed_update.authority_boundary.can_silently_update_clean_managed_modules, true);
    assert.equal(adapter.status, 'completed');
    assert.equal(adapter.apply_mode, 'auto_apply');
    assert.equal(adapter.result.app_background_safe, true);
    assert.equal(
      adapter.result.framework_commit,
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve('.'), encoding: 'utf8' }).trim(),
    );
    assert.equal(adapter.result.catalog_ref, `file://${faultCatalog.catalogPath}`);
    assert.equal(adapter.result.catalog_sha256, sha256Value(fs.readFileSync(faultCatalog.catalogPath)));
    assert.equal(adapter.result.summary.manual_required_targets_count, 0);
    assert.equal(adapter.result.summary.failed_targets_count, 0);
    assert.deepEqual(
      adapter.result.targets.map((entry: any) => entry.target_id),
      ['mag', 'mas', 'obf', 'oma', 'opl-flow', 'rca'],
    );
    assert.deepEqual(
      adapter.result.targets.map((entry: any) => entry.status),
      ['skipped', 'completed', 'skipped', 'skipped', 'skipped', 'skipped'],
    );
    const updatedTargets = adapter.result.targets.filter((entry: any) => entry.status === 'completed');
    assert.equal(updatedTargets.length, 1);
    assert.equal(updatedTargets[0].target_id, 'mas');
    assert.equal(updatedTargets[0].action, 'update');
    assert.equal(updatedTargets.every((entry: any) => (
      entry.result.lifecycle_receipt.action === 'update'
      && entry.result.lifecycle_receipt.trigger === 'managed_update_kernel_apply'
      && entry.result.lifecycle_receipt.initiator === 'opl_managed_update_kernel'
      && entry.result.lifecycle_receipt.writes_performed === true
      && entry.result.lifecycle_receipt.network_accessed === false
      && entry.result.lifecycle_receipt.remote_dependency_policy === 'forbidden'
      && typeof entry.result.lifecycle_receipt.dependency_transaction_id === 'string'
      && typeof entry.result.lifecycle_receipt.dependency_closure_digest === 'string'
      && typeof entry.result.lifecycle_receipt.rollback_ref === 'string'
    )), true);
    const reconciliation = adapter.result.bundled_full_runtime_reconciliation;
    assert.equal(reconciliation.status, 'completed');
    assert.deepEqual(reconciliation.root_package_ids, ['mag', 'mas', 'obf', 'oma', 'opl-flow', 'rca']);
    assert.deepEqual(reconciliation.items.map((entry: any) => entry.package_id).sort(), [
      'mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca',
    ]);
    assert.deepEqual(reconciliation.failures, []);
    assert.equal(reconciliation.summary.installed_package_count, 7);
    assert.equal(Object.hasOwn(adapter.result, 'component_transaction'), false);
    assert.equal(adapter.post_apply_actions.every((entry: any) => entry.status === 'completed'), true);
    assert.deepEqual(
      adapter.post_apply_actions.map((entry: any) => entry.command_ref),
      Array(3).fill('opl packages status --json'),
    );
    assert.equal(
      adapter.post_apply_actions.some((entry: any) => /packages update|configure-codex/.test(entry.command_ref)),
      false,
    );
    assert.equal(
      adapter.post_apply_actions
        .filter((entry: any) => entry.action_id !== 'reconcile_packages')
        .every((entry: any) => entry.result.writes_performed === false),
      true,
    );
    const masResult = adapter.result.targets.find((entry: any) => entry.target_id === 'mas').result;
    assert.deepEqual(
      masResult.dependency_package_locks.map((entry: any) => entry.package_id),
      ['mas-scholar-skills', 'mas'],
    );
    assert.equal(
      new Set(masResult.dependency_package_locks.map((entry: any) => entry.dependency_transaction_id)).size,
      1,
    );
    const newCatalogPayload = readJsonFile(faultCatalog.catalogPath) as any;
    const expectedCatalogDigest = sha256Value(fs.readFileSync(faultCatalog.catalogPath));
    const masTarget = adapter.result.targets.find((entry: any) => entry.target_id === 'mas');
    const expectedMas = newCatalogPayload.packages.mas;
    assert.equal(masTarget.target_version, expectedMas.package_version);
    assert.equal(masTarget.target_manifest_sha256, expectedMas.manifest_sha256.replace(/^sha256:/, ''));
    assert.equal(masTarget.release_catalog_digest, expectedCatalogDigest);
    assert.equal(output.managed_update.execution.receipt_record.recorded_receipt_count, 1);
    const receiptRef = output.managed_update.execution.receipt_record.receipt_refs[0];
    assert.equal(output.managed_update.components[0].receipt.last_receipt_ref, receiptRef);
    assert.equal(output.managed_update.components[0].receipt.verify_result, 'passed');
    assert.equal(output.managed_update.components[0].receipt.apply_mode, 'auto_apply');
    assert.equal(output.managed_update.idempotency_lock.status, 'released');
    assert.equal(fs.existsSync(path.join(stateRoot, 'managed-update-kernel.lock')), false);
    assert.equal(pathBytesDigest(baseSentinelRoot), authoritySentinels.base);
    assert.equal(pathBytesDigest(appSentinelRoot), authoritySentinels.app);
    assert.deepEqual(Object.fromEntries(Object.entries(unrelatedSurfacePaths).map(
      ([key, filePath]) => [key, pathBytesDigest(filePath)],
    )), unrelatedSurfacePrestate);
    assert.equal(fs.existsSync(launchctlLog), false);
    assert.notEqual(pathBytesDigest(path.join(scopeRoot, '.codex', 'skills')), scopeSkillsPreFault);
    const scopeTransactionRoot = path.join(scopeRoot, '.codex', '.opl-package-transactions');
    assert.equal(
      fs.existsSync(scopeTransactionRoot) ? fs.readdirSync(scopeTransactionRoot).length : 0,
      0,
    );

    const finalLocks = readJsonFile(path.join(stateRoot, 'agent-package-locks.json')) as any;
    assert.deepEqual(finalLocks.packages.map((entry: any) => entry.package_id).sort(), [
      'mag',
      'mas',
      'mas-scholar-skills',
      'obf',
      'oma',
      'opl-flow',
      'rca',
    ]);
    for (const lock of finalLocks.packages) {
      assert.equal(lock.source_kind, 'bundled_full_runtime_modules');
      assert.equal(lock.owner_source_commit, faultCatalog.sourceCommits[lock.package_id]);
      assert.equal(lock.carrier_authority.catalog_ref, `file://${faultCatalog.catalogPath}`);
      assert.equal(lock.carrier_authority.catalog_sha256, expectedCatalogDigest);
    }
    const finalMasLock = finalLocks.packages.find((entry: any) => entry.package_id === 'mas');
    const finalScholarLock = finalLocks.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills');
    const expectedScholar = newCatalogPayload.packages['mas-scholar-skills'];
    const expectedScholarManifest = readJsonFile(path.join(
      path.dirname(faultCatalog.catalogPath),
      expectedScholar.manifest_ref,
    )) as any;
    const expectedScholarPayload = readJsonFile(path.join(
      path.dirname(faultCatalog.catalogPath),
      expectedScholar.payload_manifest_ref,
    )) as any;
    assert.equal(finalMasLock.dependency_transaction_id, finalScholarLock.dependency_transaction_id);
    assert.equal(finalMasLock.dependency_closure_digest, finalScholarLock.dependency_closure_digest);
    assert.equal(finalScholarLock.package_version, expectedScholar.package_version);
    assert.equal(finalScholarLock.owner_source_commit, expectedScholar.owner_source_commit);
    assert.equal(
      finalScholarLock.manifest_sha256,
      expectedScholar.manifest_sha256.replace(/^sha256:/, ''),
    );
    assert.equal(finalScholarLock.content_digest, expectedScholarPayload.content_lock.digest);
    assert.equal(finalScholarLock.source_kind, 'bundled_full_runtime_modules');
    assert.equal(finalScholarLock.physical_surface.status, 'materialized');
    assert.equal(finalScholarLock.physical_surface.plugin_id, expectedScholarManifest.codex_surface.plugin_id);
    assert.equal(fs.existsSync(finalScholarLock.physical_surface.codex_plugin_cache_path), true);
    const finalMasLkg = finalLocks.last_known_good_transactions.find((entry: any) => (
      entry.root_package_id === 'mas'
    ));
    assert.deepEqual(
      finalMasLkg.package_locks.map((entry: any) => entry.package_id),
      ['mas-scholar-skills', 'mas'],
    );
    const finalMasLkgScholar = finalMasLkg.package_locks[0];
    const finalMasLkgRoot = finalMasLkg.package_locks[1];
    assert.deepEqual(finalMasLkgRoot, preFaultMasLock);
    assert.equal(
      finalMasLkgScholar.owner_source_commit,
      faultCatalog.sourceCommits['mas-scholar-skills'],
    );
    assert.equal(
      new Set(finalMasLkg.package_locks.map((entry: any) => entry.dependency_transaction_id)).size,
      2,
    );
    assert.equal(finalMasLkgRoot.dependency_transaction_id, preFaultMasLock.dependency_transaction_id);
    const lifecycle = readJsonFile(path.join(stateRoot, 'agent-package-lifecycle-ledger.json')) as any;
    const managedReceipts = lifecycle.receipts.filter((entry: any) => (
      entry.action === 'update'
      && entry.trigger === 'managed_update_kernel_apply'
      && entry.operation_id === masResult.lifecycle_receipt.operation_id
    ));
    assert.equal(managedReceipts.length, 2);
    assert.equal(managedReceipts.every((entry: any) => entry.initiator === 'opl_managed_update_kernel'), true);
    assert.equal(new Set(managedReceipts.map((entry: any) => entry.operation_id)).size, 1);
    const componentLedger = readJsonFile(path.join(stateRoot, 'managed-update-component-receipts.json')) as any;
    const finalComponentReceipt = componentLedger.receipts.find((entry: any) => (
      entry.receipt_ref === receiptRef
    ));
    assert.equal(finalComponentReceipt.surface_kind, 'opl_managed_update_component_receipt');
    assert.equal(finalComponentReceipt.schema_version, 'opl_managed_update_component_receipt.v1');
    assert.equal(finalComponentReceipt.receipt_ref, receiptRef);
    assert.equal(finalComponentReceipt.operation, 'apply');
    assert.equal(finalComponentReceipt.apply_mode, 'auto_apply');
    assert.equal(finalComponentReceipt.verify_result, 'passed');
    assert.equal(typeof finalComponentReceipt.rollback_ref, 'string');
    assert.equal(finalComponentReceipt.adapter_result_ref, adapter.result_ref);
    assert.equal(output.managed_update.execution.receipt_record.receipts[0].receipt_ref, receiptRef);
  } finally {
    removeFixtureTree(root);
    removeFixtureTree(family.workspaceRoot);
    removeFixtureTree(codexFixture.fixtureRoot);
  }
});
