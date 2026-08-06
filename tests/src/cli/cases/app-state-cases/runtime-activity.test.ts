import { DatabaseSync } from 'node:sqlite';

import { buildOplRuntimeAppState } from '../../../../../src/modules/console/app-runtime-state.ts';
import { buildAppRuntimeWorkItemProjection } from '../../../../../src/modules/console/app-runtime-work-item-projection.ts';
import { createStageAttemptTable } from '../../../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { assert, fs, os, path, runCli, test } from '../../helpers.ts';

function runtimeDescriptor(packageId: string, input: { aliases?: string[] } = {}) {
  return {
    repo_dir: `/fixture/${packageId}`,
    kind: 'agent',
    agent_id: packageId,
    package_id: packageId,
    domain_id: `${packageId}-domain`,
    display_name: `${packageId} agent`,
    interface: {
      version: 'opl.standard_agent_interface.v1',
      inventory_projection: null,
      stage_catalog: null,
      domain_detail_views: [],
      workspace_binding: {
        locator_surface_kind: 'fixture_locator',
        default_profile_id: 'fixture',
        workspace_kind: 'fixture_workspace',
        project_kind: 'fixture_project',
        project_collection_label: 'projects',
        default_workspace_id: 'workspace',
        default_project_id: 'project',
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
      },
      runtime: { runtime_domain_id: `${packageId}-domain`, registration_ref: null },
      progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
      routing: {
        explicit_aliases: input.aliases ?? [packageId],
        workstream_ids: [],
        intent_signals: [],
        ambiguity_policy: 'require_explicit_domain_selection',
      },
    },
  } as const;
}

function runtimeDirectoryEntry(input: {
  packageId: string;
  installed?: boolean;
  packageRole?: 'standard_agent' | 'workflow_profile';
  statusReadError?: { code: string; message: string } | null;
  verificationDeferred?: boolean;
}) {
  const installed = input.installed ?? true;
  const verificationDeferred = input.verificationDeferred ?? false;
  return {
    package_id: input.packageId,
    package_role: input.packageRole ?? 'standard_agent',
    installed,
    activated: false,
    manifest_url: `file:///fixture/${input.packageId}/manifest.json`,
    version_currentness: { source_ref: `fixture:${input.packageId}` },
    source_explanation: { kind: 'installed_package_lock' },
    readiness: {
      status: input.statusReadError
        ? 'repair_required'
        : verificationDeferred
          ? 'verification_deferred'
          : installed
            ? 'ready'
            : 'not_installed',
      operational_ready: installed && !input.statusReadError && !verificationDeferred,
      launch_allowed: installed && !input.statusReadError && !verificationDeferred,
      verification_deferred: verificationDeferred,
      reason: input.statusReadError
        ? 'package_status_read_failed'
        : verificationDeferred
          ? 'live_verification_deferred'
          : installed
            ? null
            : 'package_not_installed',
      status_read_error: input.statusReadError ?? null,
    },
  } as const;
}

function writeRuntimeDescriptor(repoDir: string, packageId: string) {
  const descriptor = runtimeDescriptor(packageId);
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'contracts', 'domain_descriptor.json'),
    `${JSON.stringify({
      domain_id: descriptor.domain_id,
      kind: descriptor.kind,
      agent_id: descriptor.agent_id,
      package_id: descriptor.package_id,
      standard_agent_interface: {
        ...descriptor.interface,
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          ...descriptor.interface.workspace_binding,
          locator_surface_kind: 'fixture_workspace_locator',
          default_profile_id: 'one_off',
          required_locator_fields: ['profile_ref'],
          optional_locator_fields: ['workspace_root'],
        },
      },
    }, null, 2)}\n`,
  );
}

function writeStageAttemptFixture(input: {
  stateDir: string;
  workspaceRoot: string;
  status: string;
}) {
  const queueDb = path.join(input.stateDir, 'family-runtime', 'queue.sqlite');
  fs.mkdirSync(path.dirname(queueDb), { recursive: true });
  const db = new DatabaseSync(queueDb);
  const now = '2026-07-10T00:00:00.000Z';
  try {
    createStageAttemptTable(db);
    db.prepare(`
      INSERT INTO stage_attempts(
        stage_attempt_id,
        idempotency_key,
        provider_kind,
        workflow_id,
        domain_id,
        stage_id,
        workspace_locator_json,
        source_fingerprint,
        executor_kind,
        stage_attempt_executor_policy_json,
        status,
        checkpoint_refs_json,
        closeout_refs_json,
        human_gate_refs_json,
        retry_budget_json,
        attempt_count,
        task_id,
        blocked_reason,
        provider_receipt_json,
        provider_run_json,
        activity_events_json,
        route_impact_json,
        closeout_receipt_status,
        created_at,
        updated_at
      ) VALUES (
        @stage_attempt_id,
        @idempotency_key,
        @provider_kind,
        @workflow_id,
        @domain_id,
        @stage_id,
        @workspace_locator_json,
        @source_fingerprint,
        @executor_kind,
        @stage_attempt_executor_policy_json,
        @status,
        @checkpoint_refs_json,
        @closeout_refs_json,
        @human_gate_refs_json,
        @retry_budget_json,
        @attempt_count,
        @task_id,
        @blocked_reason,
        @provider_receipt_json,
        @provider_run_json,
        @activity_events_json,
        @route_impact_json,
        @closeout_receipt_status,
        @created_at,
        @updated_at
      )
    `).run({
      stage_attempt_id: 'sat_redcube_deck_42',
      idempotency_key: 'redcube:deck-42:render',
      provider_kind: 'temporal',
      workflow_id: 'wf_redcube_deck_42',
      domain_id: 'redcube',
      stage_id: 'render',
      workspace_locator_json: JSON.stringify({
        surface_kind: 'opl_domain_route_workspace_locator',
        domain_id: 'redcube',
        work_unit_id: 'deck-42',
        workspace_root: input.workspaceRoot,
        command_cwd: input.workspaceRoot,
      }),
      source_fingerprint: 'sha256:redcube-deck-42',
      executor_kind: 'codex_cli',
      stage_attempt_executor_policy_json: null,
      status: input.status,
      checkpoint_refs_json: '[]',
      closeout_refs_json: '[]',
      human_gate_refs_json: '[]',
      retry_budget_json: '{}',
      attempt_count: 1,
      task_id: 'redcube-render-deck-42',
      blocked_reason: input.status === 'failed' ? 'renderer_dependency_missing' : null,
      provider_receipt_json: '{}',
      provider_run_json: JSON.stringify({
        provider_status: input.status,
        last_heartbeat_at: now,
      }),
      activity_events_json: '[]',
      route_impact_json: JSON.stringify({ decision: 'stop_with_typed_blocker' }),
      closeout_receipt_status: null,
      created_at: now,
      updated_at: now,
    });
  } finally {
    db.close();
  }
}

test('app state keeps fast as the default and exposes runtime as an explicit capability', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-runtime-profile-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const env = {
    HOME: homeRoot,
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
    OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
    PATH: '/usr/bin:/bin',
  };

  try {
    const defaultOutput = runCli(['app', 'state'], env) as any;
    assert.equal(defaultOutput.app_state.meta.profile, 'fast');

    const runtimeOutput = runCli(['app', 'state', '--profile', 'runtime'], env) as any;
    assert.equal(runtimeOutput.app_state.meta.profile, 'runtime');
    assert.equal(runtimeOutput.app_state.meta.projection_detail_profile, 'fast');
    assert.deepEqual(runtimeOutput.app_state.meta.capabilities, [
      'opl_app.runtime_state_profile.v1',
    ]);
    assert.equal(runtimeOutput.app_state.meta.network_access_allowed, false);
    assert.equal(runtimeOutput.app_state.meta.mutation_allowed, false);
    assert.equal(
      runtimeOutput.app_state.operator.workbench.work_item_projection_v2.profile,
      'fast',
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('runtime membership follows one installed standard-Agent directory cohort', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-membership-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  const statusReader = ((input: { packageId?: string }) => {
    if (input.packageId === 'status-failed-agent') {
      throw new Error('synthetic status reader failure');
    }
    throw new Error('The synthetic directory owns status projection for this test.');
  }) as any;
  const descriptorReads: string[] = [];
  let directoryReads = 0;
  try {
    const output = buildOplRuntimeAppState({
      generatedAt: '2026-07-25T00:00:00.000Z',
      listBindings: () => [],
      createPackageStatusReader: () => statusReader,
      listPackages: ((input: { detail?: string }) => {
        directoryReads += 1;
        assert.equal(input.detail, 'fast');
        return {
          opl_agent_packages: {
            directory: {
              entries: [
                runtimeDirectoryEntry({ packageId: 'third-party-agent' }),
                runtimeDirectoryEntry({ packageId: 'catalog-only-agent', installed: false }),
                runtimeDirectoryEntry({ packageId: 'installed-workflow', packageRole: 'workflow_profile' }),
                runtimeDirectoryEntry({
                  packageId: 'status-failed-agent',
                  statusReadError: { code: 'synthetic_error', message: 'status reader failed' },
                }),
                runtimeDirectoryEntry({ packageId: 'descriptor-failed-agent' }),
                runtimeDirectoryEntry({ packageId: 'deferred-agent', verificationDeferred: true }),
                runtimeDirectoryEntry({ packageId: 'healthy-agent' }),
              ],
            },
          },
        };
      }) as any,
      readDescriptor: ((packageId: string, reader: unknown) => {
        assert.equal(reader, statusReader);
        descriptorReads.push(packageId);
        if (packageId === 'status-failed-agent') return (reader as any)({ packageId });
        if (packageId === 'descriptor-failed-agent') throw new Error('synthetic descriptor failure');
        return runtimeDescriptor(packageId);
      }) as any,
    }) as any;

    const projection = output.app_state.operator.workbench.work_item_projection_v2;
    assert.equal(directoryReads, 1);
    assert.deepEqual(descriptorReads.sort(), [
      'deferred-agent',
      'descriptor-failed-agent',
      'healthy-agent',
      'status-failed-agent',
      'third-party-agent',
    ]);
    assert.deepEqual(
      projection.agent_catalog.map((entry: any) => entry.package_id).sort(),
      ['deferred-agent', 'healthy-agent', 'third-party-agent'],
    );
    assert.equal(
      projection.agent_catalog.some((entry: any) => entry.package_id === 'status-failed-agent'),
      false,
    );
    assert.equal(
      projection.agent_availability.find((entry: any) => entry.package_id === 'healthy-agent')?.availability,
      'available',
    );
    assert.equal(
      projection.agent_availability.find((entry: any) => entry.package_id === 'deferred-agent')?.availability,
      'available',
    );
    assert.equal(
      projection.agent_availability.find((entry: any) => entry.package_id === 'deferred-agent')?.reason,
      'package_installed_and_visible',
    );
    assert.equal(
      projection.agent_catalog.some((entry: any) => entry.package_id === 'deferred-agent'),
      true,
    );
    assert.equal(
      projection.agent_catalog.some((entry: any) => entry.package_id === 'descriptor-failed-agent'),
      false,
    );
    assert.equal(projection.diagnostics.count, 3);
    assert.deepEqual(projection.diagnostics.items, []);
    assert.equal(projection.agent_catalog.some((entry: any) => entry.package_id === 'catalog-only-agent'), false);
    assert.equal(projection.agent_catalog.some((entry: any) => entry.package_id === 'installed-workflow'), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('runtime discovers an unknown Agent from its installed carrier source', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-carrier-agent-state-'));
  const carrierRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-carrier-agent-source-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  writeRuntimeDescriptor(carrierRepo, 'future-carrier-agent');
  try {
    const statusReader = ((input: { packageId?: string }) => ({
      opl_agent_package_status: {
        installed_package_count: 1,
        installed_packages: [],
        installed_carrier_readback: {
          kind: 'codex_plugin_manager',
          identity: input.packageId,
          source_ref: input.packageId === 'future-carrier-agent'
            ? carrierRepo
            : path.join(carrierRepo, 'missing'),
          version: '1.0.0',
          enabled: true,
          lifecycle_authority: 'carrier_owned',
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        runtime_source_readiness: {
          status: 'not_required',
          operational_ready: true,
          checkout_path: null,
        },
      },
    })) as any;
    const output = buildOplRuntimeAppState({
      generatedAt: '2026-07-31T00:00:00.000Z',
      listBindings: () => [],
      createPackageStatusReader: () => statusReader,
      listPackages: (() => ({
        opl_agent_packages: {
          directory: {
            entries: [
              runtimeDirectoryEntry({ packageId: 'future-carrier-agent' }),
              runtimeDirectoryEntry({ packageId: 'broken-carrier-agent' }),
            ],
          },
        },
      })) as any,
    }) as any;

    const projection = output.app_state.operator.workbench.work_item_projection_v2;
    assert.deepEqual(
      projection.agent_catalog.map((entry: any) => entry.package_id),
      ['future-carrier-agent'],
    );
    assert.equal(
      projection.agent_availability.find(
        (entry: any) => entry.package_id === 'future-carrier-agent',
      )?.availability,
      'available',
    );
    assert.equal(
      projection.agent_catalog.some((entry: any) => entry.package_id === 'broken-carrier-agent'),
      false,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(carrierRepo, { recursive: true, force: true });
  }
});

test('runtime Package identity outranks another Agent descriptor alias', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-alias-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  const projectionProbe: {
    resolveDescriptor?: (identity: string) => ReturnType<typeof runtimeDescriptor> | null;
  } = {};
  try {
    const output = buildOplRuntimeAppState({
      generatedAt: '2026-07-25T00:00:00.000Z',
      listBindings: () => [],
      createPackageStatusReader: (() => () => ({})) as any,
      listPackages: (() => ({
        opl_agent_packages: {
          directory: {
            entries: [
              runtimeDirectoryEntry({ packageId: 'alias-owner-agent' }),
              runtimeDirectoryEntry({ packageId: 'exact-package-agent' }),
              runtimeDirectoryEntry({ packageId: 'second-alias-owner-agent' }),
              runtimeDirectoryEntry({ packageId: 'foo-bar' }),
              runtimeDirectoryEntry({ packageId: 'foobar' }),
            ],
          },
        },
      })) as any,
      readDescriptor: ((packageId: string) => packageId === 'alias-owner-agent'
        ? runtimeDescriptor(packageId, {
            aliases: ['exact-package-agent', 'alias-only', 'unique-alias'],
          })
        : packageId === 'second-alias-owner-agent'
          ? runtimeDescriptor(packageId, { aliases: ['alias-only'] })
          : runtimeDescriptor(packageId)) as any,
      buildProjection: ((options: any) => {
        projectionProbe.resolveDescriptor = options.resolveDescriptor;
        return buildAppRuntimeWorkItemProjection(options);
      }) as any,
    }) as any;

    const projection = output.app_state.operator.workbench.work_item_projection_v2;
    assert.deepEqual(
      projection.agent_catalog.map((entry: any) => [entry.agent_id, entry.package_id]).sort(),
      [
        ['alias-owner-agent', 'alias-owner-agent'],
        ['exact-package-agent', 'exact-package-agent'],
        ['second-alias-owner-agent', 'second-alias-owner-agent'],
      ],
    );
    assert.equal(
      projection.agent_availability.find((entry: any) => entry.package_id === 'exact-package-agent')?.agent_id,
      'exact-package-agent',
    );
    assert.equal(
      projectionProbe.resolveDescriptor?.('exact-package-agent')?.package_id,
      'exact-package-agent',
    );
    assert.equal(projectionProbe.resolveDescriptor?.('alias-only'), null);
    assert.equal(
      projectionProbe.resolveDescriptor?.('unique-alias')?.package_id,
      'alias-owner-agent',
    );
    assert.equal(projection.diagnostics.count, 2);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('app state does not turn an unregistered failed attempt into a phantom work item', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-runtime-activity-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = path.join(homeRoot, 'redcube-workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    writeStageAttemptFixture({ stateDir, workspaceRoot, status: 'failed' });
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const workbench = output.app_state.operator.workbench;
    const task = workbench.task_drilldowns.find((entry: any) =>
      entry.task_id === 'redcube:work-unit:deck-42'
    );
    assert.equal(task, undefined);
    assert.equal(workbench.work_item_projection_v2.items.length, 0);
    assert.equal(workbench.work_item_projection_v2.summary.system_attention_count, 0);
    assert.equal(workbench.work_item_projection_v2.identity_health.non_work_item_execution_count, 0);
    assert.deepEqual(workbench.work_item_projection_v2.diagnostics.items, []);
    assert.equal(workbench.work_item_projection_v2.diagnostics.detail_policy, 'summary_only');
    assert.equal(workbench.work_item_projection_v2.detail_policy.inventory_detail, 'included');
    assert.equal(workbench.work_item_projection_v2.detail_policy.all_work_item_summaries_included, true);
    assert.equal(
      workbench.activity_center.needs_attention.some(
        (entry: any) => entry.task_id === 'redcube:work-unit:deck-42',
      ),
      false,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
