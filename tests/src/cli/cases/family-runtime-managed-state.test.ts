import { assert, buildManifestCommand, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_DISABLE_HERMES_ONLINE: '1',
    ...extra,
  };
}

function createExportFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath };
}

test('family-runtime status consumes MAS manifest managed Temporal projection without claiming paper closure', () => {
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

    assert.equal(output.family_runtime.readiness.provider_ready, true);
    assert.equal(output.family_runtime.readiness.full_online_ready, true);
    assert.equal(provider.status, 'ready');
    assert.equal(provider.ready, true);
    assert.equal(provider.degraded_reason, null);
    assert.equal(provider.details.adapter_mode, 'mas_managed_temporal_projection_ready');
    assert.equal(provider.details.address, 'mas-managed-temporal.example.test:7233');
    assert.equal(provider.details.address_source, 'mas_managed_temporal_state_consistency_projection');
    assert.equal(provider.details.worker_readiness.readiness_status, 'ready');
    assert.equal(provider.details.worker_readiness.worker_ready, true);
    assert.deepEqual(provider.details.worker_readiness.blockers, []);
    assert.equal(managedProjection.projection_status, 'ready');
    assert.equal(managedProjection.source_manifest.project_id, 'medautoscience');
    assert.equal(managedProjection.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(managedProjection.authority_boundary.paper_closure_authority, 'mas_only');
    assert.equal(output.family_runtime.opl_owner.forbidden_authority.includes('domain_artifact_or_publication_gate'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('family-runtime status consumes MAS sidecar managed Temporal projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-sidecar-managed-state-'));
  const exportFixture = createExportFixture(`
cat <<'JSON'
{
  "surface_kind": "mas_family_sidecar_export",
  "managed_temporal_state_consistency": {
    "surface_kind": "managed_temporal_state_consistency",
    "projection_status": "ready",
    "provider_kind": "temporal",
    "service_ready": true,
    "managed_worker_ready": true,
    "address": "sidecar-managed-temporal.example.test:7233",
    "namespace": "default",
    "task_queue": "opl-stage-attempts",
    "source_refs": ["mas://sidecar/managed_temporal_state_consistency/latest.json"],
    "authority_boundary": {
      "opl_role": "projection_consumer_only",
      "paper_closure_authority": "mas_only"
    }
  }
}
JSON
`);
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

    assert.equal(output.family_runtime.readiness.provider_ready, true);
    assert.equal(provider.details.address, 'sidecar-managed-temporal.example.test:7233');
    assert.equal(provider.details.address_source, 'mas_managed_temporal_state_consistency_projection');
    assert.equal(managedProjection.source_manifest.surface_kind, 'mas_family_sidecar_export_projection_ref');
    assert.equal(managedProjection.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(output.family_runtime.opl_owner.forbidden_authority.includes('domain_quality_verdict'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
  }
});
