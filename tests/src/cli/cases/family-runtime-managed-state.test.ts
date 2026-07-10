import { assert, buildManifestCommand, createGitModuleRemoteFixture, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { runReadOnlyFamilyRuntimeDomainHandlerCommand } from '../../../../src/modules/runway/family-runtime-domain-handler-process.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function createJsonExportFixture(payload: Record<string, unknown>) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export.mjs');
  fs.writeFileSync(
    exportPath,
    `process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});\n`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath: `${process.execPath} ${exportPath}` };
}

test('family-runtime status consumes a domain manifest managed Temporal projection without claiming provider readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-managed-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-managed-workspace-'));
  const fixtures = loadFamilyManifestFixtures();
  const manifest = {
    ...fixtures.medautoscience,
    progress_projection: {
      ...fixtures.medautoscience.progress_projection as Record<string, unknown>,
      surface_kind: 'progress_projection',
      domain_projection: {
        ...((fixtures.medautoscience.progress_projection as Record<string, unknown>)?.domain_projection as Record<string, unknown> ?? {}),
        managed_temporal_state_consistency: {
          surface_kind: 'managed_temporal_state_consistency',
          projection_status: 'ready',
          provider_kind: 'temporal',
          service_status: 'ready',
          worker_status: 'ready',
          address: 'mas-managed-temporal.example.test:7233',
          namespace: 'default',
          task_queue: 'opl-stage-attempts',
          source_refs: ['mas://runtime/managed_temporal_state_consistency/latest.json'],
          provider_proof_ref: 'mas://runtime/provider-proof/latest.json',
          authority_boundary: {
            opl_role: 'projection_consumer_only',
            mas_authority: 'study_truth_publication_quality_and_artifact_gate_owner',
            paper_closure_authority: 'mas_only',
          },
        },
      },
    },
  };
  const registryPath = path.join(stateRoot, 'workspace-registry.json');
  const now = new Date().toISOString();
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-managed-projection',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspacePath,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: buildManifestCommand(manifest),
            url: null,
            workspace_locator: null,
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;
    const managedProjection = provider.details.managed_temporal_state_consistency;

    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(provider.status, 'provider_code_landed_unconfigured');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(provider.details.adapter_mode, 'provider_code_landed_unconfigured');
    assert.equal(provider.details.address, null);
    assert.equal(provider.details.address_source, 'not_configured');
    assert.equal(provider.details.worker_readiness.readiness_status, 'not_configured');
    assert.equal(provider.details.worker_readiness.worker_ready, false);
    assert.deepEqual(provider.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
    assert.equal(managedProjection.projection_status, 'ready');
    assert.equal(provider.details.managed_temporal_projection_readiness.address, 'mas-managed-temporal.example.test:7233');
    assert.equal(provider.details.managed_temporal_projection_readiness.address_source, 'managed_domain_temporal_state_consistency_projection');
    assert.equal(provider.details.managed_temporal_projection_readiness.worker_ready, false);
    assert.equal(
      provider.details.managed_temporal_projection_readiness.provider_ready_effect,
      'none_projection_only_requires_opl_local_lifecycle_proof',
    );
    assert.equal(
      provider.details.managed_temporal_projection_readiness.authority_boundary.can_authorize_opl_provider_ready,
      false,
    );
    assert.equal(provider.details.managed_domain_projection_summary.managed_temporal_state_consistency_declared, true);
    assert.equal(
      provider.details.managed_domain_projection_summary.managed_temporal_projection_authorizes_opl_provider_ready,
      false,
    );
    assert.equal(provider.details.managed_domain_projection_summary.status, 'available');
    assert.equal(provider.details.managed_domain_projection_summary.domain_count, 1);
    assert.equal(provider.details.managed_domain_projection_summary.conflict_count, 0);
    assert.equal(managedProjection.source_manifest.project_id, 'medautoscience');
    assert.equal(managedProjection.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(managedProjection.authority_boundary.paper_closure_authority, 'mas_only');
    assert.equal(output.family_runtime.opl_owner.forbidden_authority.includes('domain_artifact_or_publication_gate'), true);
    assert.equal(fs.existsSync(path.join(stateRoot, 'domain-manifest-projection-cache.json')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('family-runtime status consumes a registry-derived domain-handler managed Temporal projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-domain-handler-managed-state-'));
  const exportFixture = createJsonExportFixture({
    surface_kind: 'mas_family_domain_handler_export',
    managed_temporal_state_consistency: {
      surface_kind: 'managed_temporal_state_consistency',
      projection_status: 'ready',
      provider_kind: 'temporal',
      service_ready: true,
      managed_worker_ready: true,
      address: 'domain-handler-managed-temporal.example.test:7233',
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      source_refs: ['mas://domain-handler/managed_temporal_state_consistency/latest.json'],
      authority_boundary: {
        opl_role: 'projection_consumer_only',
        paper_closure_authority: 'mas_only',
      },
    },
  });
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportFixture.exportPath,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;
    const managedProjection = provider.details.managed_temporal_state_consistency;

    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(provider.details.address, null);
    assert.equal(provider.details.address_source, 'not_configured');
    assert.equal(provider.details.managed_temporal_projection_readiness.address, 'domain-handler-managed-temporal.example.test:7233');
    assert.equal(
      provider.details.managed_temporal_projection_readiness.provider_ready_effect,
      'none_projection_only_requires_opl_local_lifecycle_proof',
    );
    assert.equal(managedProjection.source_manifest.surface_kind, 'domain_handler_export_projection_ref');
    assert.equal(provider.details.managed_domain_projection_summary.managed_temporal_state_consistency_declared, true);
    assert.equal(
      provider.details.managed_domain_projection_summary.managed_temporal_projection_authorizes_opl_provider_ready,
      false,
    );
    assert.equal(provider.details.managed_domain_projection_summary.status, 'available');
    assert.equal(provider.details.managed_domain_projection_summary.domain_count, 1);
    assert.equal(provider.details.managed_domain_projection_summary.conflict_count, 0);
    assert.equal(managedProjection.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(output.family_runtime.opl_owner.forbidden_authority.includes('domain_quality_verdict'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider rejects conflicting managed Temporal domain projections', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-managed-conflict-'));
  const masExport = createJsonExportFixture({
    managed_temporal_state_consistency: {
      projection_status: 'ready',
      service_status: 'ready',
      worker_status: 'ready',
      address: 'mas-temporal.example.test:7233',
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
    },
  });
  const rcaExport = createJsonExportFixture({
    managed_temporal_state_consistency: {
      projection_status: 'ready',
      service_status: 'ready',
      worker_status: 'ready',
      address: 'rca-temporal.example.test:7233',
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
    },
  });
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: masExport.exportPath,
        OPL_FAMILY_RUNTIME_REDCUBE_EXPORT: rcaExport.exportPath,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    const details = output.family_runtime.provider_runtime.providers.temporal.details;

    assert.equal(details.managed_temporal_state_consistency, null);
    assert.equal(details.managed_temporal_projection_readiness, null);
    assert.equal(details.managed_domain_projection_summary.status, 'conflicted');
    assert.equal(details.managed_domain_projection_summary.domain_count, 2);
    assert.equal(details.managed_domain_projection_summary.conflict_count, 1);
    assert.equal(details.managed_domain_projection_summary.managed_temporal_projection_authorizes_opl_provider_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masExport.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaExport.fixtureRoot, { recursive: true, force: true });
  }
});

test('managed provider status export is bounded and does not mutate checkout or recovery state', () => {
  const exportScript = `#!/bin/sh
case "\${OPL_DOMAIN_COMMAND_TMP_ROOT:-}" in
  */recovery/*) printf '%s\\n' '{"managed_temporal_state_consistency":{"projection_status":"ready","service_status":"ready","worker_status":"ready"}}' ;;
  *) printf '%s\\n' 'Failed to install: archive-v0 METADATA No such file or directory' >&2; exit 1 ;;
esac
`;
  const remote = createGitModuleRemoteFixture('managed-provider-read-only', {
    extraFiles: { 'export.sh': exportScript },
    executableFiles: ['export.sh'],
  });
  const checkout = path.join(remote.fixtureRoot, 'checkout');
  const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-provider-recovery-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-provider-timeout-'));
  const slowExport = path.join(stateRoot, 'slow-export.mjs');
  runGitFixtureCommand(remote.fixtureRoot, ['clone', remote.remoteRoot, checkout]);
  const initialHead = runGitFixtureCommand(checkout, ['rev-parse', 'HEAD']).stdout.trim();
  const upstreamHead = remote.advance('upstream.txt', 'new upstream commit\n', 'Advance upstream');
  fs.writeFileSync(
    slowExport,
    `setTimeout(() => process.stdout.write('{}\\n'), 10_000);\n`,
  );

  try {
    const readOnlyResult = runReadOnlyFamilyRuntimeDomainHandlerCommand(
      [path.join(checkout, 'export.sh')],
      {
        cwd: checkout,
        env: { ...process.env, OPL_DOMAIN_COMMAND_TMP_ROOT: recoveryRoot },
      },
    );
    assert.equal(readOnlyResult.exit_code, 1);
    assert.equal(readOnlyResult.checkout_currentness_preflight, undefined);
    assert.equal(readOnlyResult.recovery, undefined);
    assert.notEqual(initialHead, upstreamHead);
    assert.equal(runGitFixtureCommand(checkout, ['rev-parse', 'HEAD']).stdout.trim(), initialHead);
    assert.equal(runGitFixtureCommand(checkout, ['status', '--porcelain']).stdout, '');
    assert.deepEqual(fs.readdirSync(recoveryRoot, { recursive: true }), []);

    const startedAt = Date.now();
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `${process.execPath} ${slowExport}`,
        OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS: '600000',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    assert.equal(output.family_runtime.provider_runtime.providers.temporal.details.managed_domain_projection_summary, null);
    assert.ok(Date.now() - startedAt < 5_000);
  } finally {
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(recoveryRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
