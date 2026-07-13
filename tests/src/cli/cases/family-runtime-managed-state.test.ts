import { assert, buildManifestCommand, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
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
