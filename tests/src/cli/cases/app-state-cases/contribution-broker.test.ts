import { pathToFileURL } from 'node:url';

import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';
import {
  parseAppContributionArgs,
  runAppContribution,
} from '../../../../../src/read-models/operator/app-contribution-broker.ts';
import type { InstalledPackageDescriptor } from '../../../../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import { formatJsonPayload } from '../../../../../src/kernel/json-file.ts';
import { createFakeCodexFixture } from '../../helpers-parts/fixtures.ts';

const requestSchema = 'opl-package-app-contribution-request.v1';
const responseSchema = 'opl-package-app-contribution-response.v1';

function writeContributionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-package-'));
  const command = path.join(root, 'bin', 'contribution');
  fs.mkdirSync(path.dirname(command), { recursive: true });
  fs.writeFileSync(
    command,
    `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify({
    schema_version: '${responseSchema}',
    ok: true,
    ref: request.ref,
    operation: request.operation,
    result: {
      owner_echo: request.input,
      source: 'fixture-owner',
      workspace_root: process.env.OPL_PROFILE_WORKSPACE ?? null,
    },
  }));
});
`,
    { encoding: 'utf8', mode: 0o755 },
  );
  const manifest = {
    surface_kind: 'opl_agent_package_manifest.v1',
    package_id: 'future.contribution.package',
    agent_id: 'future-contribution-package',
    display_name: 'Future Contribution Package',
    publisher: 'fixture-owner',
    version: '1.0.0',
    source: 'third_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'future-contribution-package',
      required_skill_ids: ['future-contribution-package'],
      app_contribution_abi: {
        schema_version: 'opl-package-app-contribution-cli.v1',
        transport: 'stdin_json_stdout_json',
        argv: ['./bin/contribution'],
        request_schema: requestSchema,
        response_schema: responseSchema,
      },
    },
    capability_dependencies: [],
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    update_channel: 'manifest_url',
    rollback_ref: 'native-carrier-owned',
    app_contributions: {
      schema_version: 'opl-app-contributions.v1',
      navigation: [{
        navigation_id: 'future.home',
        label_i18n: { 'en-US': 'Future' },
        view_id: 'future.view',
      }],
      views: [{
        view_id: 'future.view',
        view_type: 'activity_log',
        title_i18n: { 'en-US': 'Future data' },
        data_ref: 'future.data.v1#current',
        command_ids: ['future.write'],
        badge_ids: [],
      }],
      commands: [{
        command_id: 'future.write',
        label_i18n: { 'en-US': 'Write future data' },
        action_ref: 'future.data.v1#write',
        confirmation_required: false,
      }, {
        command_id: 'future.write.alias',
        label_i18n: { 'en-US': 'Write future data alias' },
        action_ref: 'future.data.v1#write',
        confirmation_required: true,
      }],
      badges: [],
    },
  };
  fs.writeFileSync(path.join(root, 'opl-package.json'), formatJsonPayload(manifest));
  const descriptor = {
    manifest,
    manifestPath: path.join(root, 'opl-package.json'),
    sourcePath: root,
    pluginId: 'future-contribution-package@fixture-marketplace',
    marketplaceSource: root,
    enabled: true,
    carrier: {
      packageId: manifest.package_id,
      carrier: {
        kind: 'codex_plugin_manager',
        pluginId: 'future-contribution-package@fixture-marketplace',
        marketplaceSource: root,
      },
      executor: { route: 'codex_cli', requiredSkillIds: ['future-contribution-package'] },
      publicationRef: null,
    },
    carrier_readback: {
      kind: 'local',
      identity: 'future-contribution-package@fixture-marketplace',
      source_ref: root,
      version: '1.0.0',
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  } as unknown as InstalledPackageDescriptor;
  return { root, descriptor, manifest };
}

function fakeCodexList(sourcePath: string) {
  return createFakeCodexFixture(`
if [[ "$1" == "plugin" && "$2" == "list" && "$3" == "--json" ]]; then
  cat <<'JSON'
${JSON.stringify({
  installed: [{
    pluginId: 'future-contribution-package@fixture-marketplace',
    version: '1.0.0',
    installed: true,
    enabled: true,
    source: { source: 'local', path: sourcePath },
    marketplaceSource: { sourceType: 'local', source: sourcePath },
  }],
})}
JSON
  exit 0
fi
exit 2
`);
}

test('generic broker reads a dynamically installed descriptor contribution without lifecycle state', () => {
  const fixture = writeContributionFixture();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-state-'));
  try {
    const output = runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#current',
      operation: 'read',
      input: { cursor: 'before-now' },
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
      },
    }) as any;
    assert.equal(output.opl_app_contribution.package_id, fixture.manifest.package_id);
    assert.equal(output.opl_app_contribution.response.result.owner_echo.cursor, 'before-now');
    assert.equal(output.opl_app_contribution.carrier_readback.lifecycle_authority, 'carrier_owned');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('generic broker preserves a matching owner rejection instead of reporting a ref mismatch', () => {
  const fixture = writeContributionFixture();
  try {
    const command = path.join(fixture.root, 'bin', 'contribution');
    fs.writeFileSync(command, fs.readFileSync(command, 'utf8').replace('ok: true,',
      "ok: false, error: { code: 'plan_missing', message: 'Select an existing plan.' },"));
    assert.throws(() => runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#current',
      operation: 'read',
      input: {},
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
      },
    }), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.message, 'Select an existing plan.');
      assert.equal(error.details?.failure_code, 'agent_package_app_contribution_owner_rejected');
      assert.equal((error.details?.owner_error as any).code, 'plan_missing');
      return true;
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('generic broker executes a headless internal contribution without enabling Codex exposure', () => {
  const fixture = writeContributionFixture();
  const descriptor = {
    ...fixture.descriptor,
    enabled: false,
    carrier_readback: { ...fixture.descriptor.carrier_readback, enabled: false },
    readiness: {
      ...fixture.descriptor.readiness,
      callability: 'disabled' as const,
      projection_callability: 'callable' as const,
    },
    manifest: {
      ...fixture.descriptor.manifest,
      codex_interaction_mode: 'headless_internal' as const,
    },
  };
  try {
    const output = runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#current',
      operation: 'read',
      input: { source: 'headless' },
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([[fixture.manifest.package_id, descriptor]]),
      },
    }) as any;
    assert.equal(output.opl_app_contribution.response.result.owner_echo.source, 'headless');
    assert.equal(output.opl_app_contribution.readiness.callability, 'callable');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('work-item contribution resolves its workspace from exact Host identity before owner invocation', () => {
  const fixture = writeContributionFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-workspace-'));
  const identity = {
    agent_id: 'mas',
    domain_id: 'medautoscience',
    work_item_id: 'study-001',
    domain_work_item_id: 'study-001',
    work_item_scope_id: 'work-item:study-001',
    identity_state: 'resolved' as const,
  };
  const observed: unknown[] = [];
  try {
    const output = runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#current',
      operation: 'read',
      input: { work_item_identity: identity },
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
      },
      resolveWorkItemWorkspace: (candidate) => {
        observed.push(candidate);
        return workspace;
      },
      workspaceBindings: [{
        binding_id: 'binding-mas',
        project_scope_id: 'project-mas',
        project_id: 'mas',
        project: 'MAS',
        workspace_path: workspace,
        label: null,
        status: 'active',
        direct_entry: {
          command: null,
          manifest_command: null,
          url: null,
          workspace_locator: null,
        },
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
        archived_at: null,
      }],
    }) as any;
    assert.deepEqual(observed, [identity]);
    assert.equal(
      output.opl_app_contribution.response.result.workspace_root,
      fs.realpathSync.native(workspace),
    );

    assert.throws(
      () => runAppContribution({
        packageId: fixture.manifest.package_id,
        ref: 'future.data.v1#current',
        operation: 'read',
        input: { work_item_identity: identity },
        confirmed: false,
      }, {
        descriptorDiscovery: {
          discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
        },
        resolveWorkItemWorkspace: () => null,
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_app_contribution_work_item_identity_unresolved',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('root contribution accepts one registered workspace and rejects unregistered or conflicting paths', () => {
  const fixture = writeContributionFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-root-'));
  const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-other-'));
  const binding = {
    binding_id: 'binding-root',
    project_scope_id: 'project-root',
    project_id: 'rca',
    project: 'RCA',
    workspace_path: workspace,
    label: null,
    status: 'active' as const,
    direct_entry: {
      command: null,
      manifest_command: null,
      url: null,
      workspace_locator: null,
    },
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    archived_at: null,
  };
  try {
    const output = runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#current',
      operation: 'read',
      input: { workspace_path: workspace },
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
      },
      workspaceBindings: [binding],
    }) as any;
    assert.equal(output.opl_app_contribution.response.result.workspace_root, fs.realpathSync.native(workspace));

    assert.throws(
      () => runAppContribution({
        packageId: fixture.manifest.package_id,
        ref: 'future.data.v1#current',
        operation: 'read',
        input: { workspace_path: otherWorkspace },
        confirmed: false,
      }, {
        descriptorDiscovery: {
          discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
        },
        workspaceBindings: [binding],
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_app_contribution_workspace_unregistered',
    );

    const identity = {
      agent_id: 'rca',
      domain_id: 'redcube_ai',
      work_item_id: 'visual-001',
      domain_work_item_id: 'visual-001',
      work_item_scope_id: 'work-item:visual-001',
      identity_state: 'resolved' as const,
    };
    assert.throws(
      () => runAppContribution({
        packageId: fixture.manifest.package_id,
        ref: 'future.data.v1#current',
        operation: 'read',
        input: { work_item_identity: identity, workspace_path: otherWorkspace },
        confirmed: false,
      }, {
        descriptorDiscovery: {
          discover: () => new Map([[fixture.manifest.package_id, fixture.descriptor]]),
        },
        resolveWorkItemWorkspace: () => workspace,
        workspaceBindings: [binding],
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_app_contribution_workspace_conflict',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(otherWorkspace, { recursive: true, force: true });
  }
});

test('generic broker requires an explicitly composed Connect discovery service', () => {
  assert.throws(
    () => runAppContribution({
      packageId: 'future-contribution-package',
      ref: 'future.data.v1#current',
      operation: 'read',
      input: {},
      confirmed: false,
    }),
    (error: unknown) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'cordis_connect_descriptor_discovery_service_required',
  );
});

test('generic broker rejects undeclared refs and confirmation-gates owner actions before invocation', () => {
  const fixture = writeContributionFixture();
  let discoveries = 0;
  const descriptorDiscovery = {
    discover() {
      discoveries += 1;
      return new Map([[fixture.manifest.package_id, fixture.descriptor]]);
    },
  };
  try {
    assert.throws(
      () => runAppContribution({
        packageId: fixture.manifest.package_id,
        ref: 'future.data.v1#unknown',
        operation: 'read',
        input: {},
        confirmed: false,
      }, {
        descriptorDiscovery,
      }),
      /not declared/,
    );
    assert.throws(
      () => runAppContribution({
        packageId: fixture.manifest.package_id,
        ref: 'future.data.v1#write',
        operation: 'execute',
        input: { value: 'new' },
        confirmed: false,
      }, {
        descriptorDiscovery,
      }),
      /requires explicit --confirm/,
    );
    const executed = runAppContribution({
      packageId: fixture.manifest.package_id,
      ref: 'future.data.v1#write',
      operation: 'execute',
      input: { value: 'new' },
      confirmed: true,
    }, {
      descriptorDiscovery,
    }) as any;
    assert.equal(discoveries, 3);
    assert.equal(executed.opl_app_contribution.confirmation_required, true);
    assert.equal(executed.opl_app_contribution.response.result.owner_echo.value, 'new');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('CLI contribution routes discover arbitrary installed Package ids without a registry cache', () => {
  const fixture = writeContributionFixture();
  const codex = fakeCodexList(fixture.root);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-cli-state-'));
  try {
    const output = runCli([
      'app', 'contribution', 'read',
      '--package-id', fixture.manifest.package_id,
      '--ref', 'future.data.v1#current',
      '--input', '{"source":"cli"}',
    ], {
      OPL_CODEX_PLUGIN_BIN: codex.codexPath,
      OPL_STATE_DIR: stateDir,
    }) as any;
    assert.equal(output.opl_app_contribution.package_id, fixture.manifest.package_id);
    assert.equal(output.opl_app_contribution.response.result.owner_echo.source, 'cli');

    const confirmation = runCliFailure([
      'app', 'contribution', 'execute',
      '--package-id', fixture.manifest.package_id,
      '--ref', 'future.data.v1#write',
      '--input', '{"source":"cli"}',
    ], {
      OPL_CODEX_PLUGIN_BIN: codex.codexPath,
      OPL_STATE_DIR: stateDir,
    });
    assert.equal(confirmation.payload.error.code, 'cli_usage_error');
    assert.equal(confirmation.payload.error.details.failure_code, 'agent_package_app_contribution_confirmation_required');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-registry-cache.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('canonical App action exposes and executes dynamically discovered Package contributions', () => {
  const fixture = writeContributionFixture();
  const codex = fakeCodexList(fixture.root);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-action-state-'));
  const env = {
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
    OPL_STATE_DIR: stateDir,
  };
  const payload = {
    package_id: fixture.manifest.package_id,
    ref: 'future.data.v1#write',
    input: { source: 'canonical-action' },
    confirmed: true,
  };
  try {
    const state = runCli(['app', 'state', '--profile', 'fast'], env) as any;
    const action = state.app_state.actions.find((entry: any) => entry.action_id === 'package_contribution_execute');
    assert.ok(action);
    assert.deepEqual(action.payload_fields, ['package_id', 'ref', 'input', 'confirmed']);
    assert.equal(action.dry_run_supported, true);

    const preflight = runCli([
      'app', 'action', 'execute',
      '--action', 'package_contribution_execute',
      '--payload', JSON.stringify(payload),
      '--dry-run',
    ], env) as any;
    assert.equal(preflight.app_action_execution.dry_run, true);
    assert.equal(preflight.app_action_execution.result.opl_app_contribution_preflight.execution_status, 'dry_run');
    assert.equal(preflight.app_action_execution.result.opl_app_contribution_preflight.package_command_invoked, false);
    assert.equal(preflight.app_action_execution.result.opl_app_contribution_preflight.package_id, fixture.manifest.package_id);

    const output = runCli([
      'app', 'action', 'execute',
      '--action', 'package_contribution_execute',
      '--payload', JSON.stringify(payload),
    ], env) as any;
    assert.equal(output.app_action_execution.action_id, 'package_contribution_execute');
    assert.equal(output.app_action_execution.result.opl_app_contribution.package_id, fixture.manifest.package_id);
    assert.equal(output.app_action_execution.result.opl_app_contribution.response.result.owner_echo.source, 'canonical-action');

    const malformed = runCliFailure([
      'app', 'action', 'execute',
      '--action', 'package_contribution_execute',
      '--payload', JSON.stringify({ ...payload, unexpected: true }),
    ], env);
    assert.equal(malformed.payload.error.code, 'cli_usage_error');
    assert.deepEqual(malformed.payload.error.details.unexpected_fields, ['unexpected']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('contribution parser only accepts the Package-owned request shape', () => {
  assert.deepEqual(
    parseAppContributionArgs([
      '--package-id', 'future.contribution.package',
      '--ref', 'future.data.v1#current',
      '--input', '{}',
    ], 'read'),
    {
      packageId: 'future.contribution.package',
      ref: 'future.data.v1#current',
      operation: 'read',
      input: {},
      confirmed: false,
    },
  );
  assert.throws(
    () => parseAppContributionArgs([
      '--package-id', 'future.contribution.package',
      '--ref', 'future.data.v1#current',
      '--confirm',
    ], 'read'),
    /Unknown app contribution read option/,
  );
});
