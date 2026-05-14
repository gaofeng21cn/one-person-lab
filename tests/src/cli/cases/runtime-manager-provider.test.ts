import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('runtime manager reports OPL control plane over provider-backed family runtime', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: path.join(stateRoot, 'missing-hermes'),
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_manager.surface_id, 'opl_runtime_manager');
    assert.equal(output.runtime_manager.layer_role, 'product_control_plane_over_provider_backed_family_runtime');
    assert.equal(output.runtime_manager.status, 'ready');
    assert.equal(output.runtime_manager.owner_split.online_runtime_substrate_owner, 'provider_backed_family_runtime');
    assert.equal(output.runtime_manager.owner_split.product_control_plane_owner, 'one-person-lab');
    assert.equal(output.runtime_manager.family_runtime_queue.provider_model, 'provider_backed_stage_attempt_runtime');
    assert.deepEqual(output.runtime_manager.family_runtime_queue.allowed_providers, [
      'local_sqlite',
      'temporal',
    ]);
    assert.equal(output.runtime_manager.provider_runtime.selected_provider, 'local_sqlite');
    assert.equal(output.runtime_manager.non_goals.includes('not_a_domain_runtime_truth_owner'), true);
    assert.equal(output.runtime_manager.registration_registry.surface_kind, 'opl_stage_runtime_registration_registry');
    assert.equal(output.runtime_manager.registration_registry.domains.length, 3);
    assert.equal(
      output.runtime_manager.registration_registry.domains[0].expected_registration_surface.ref,
      '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
    );
    assert.deepEqual(
      output.runtime_manager.registration_registry.domains[2].consumable_projection_refs.slice(-2),
      ['/review_state', '/publication_projection'],
    );
    assert.equal(
      output.runtime_manager.registration_registry.required_domain_registration_fields.includes('state_index_inputs'),
      true,
    );
    assert.equal(output.runtime_manager.native_helper_target.status, 'contracted_optional_rust_helpers');
    assert.equal(output.runtime_manager.native_helper_target.language, 'rust');
    assert.equal(output.runtime_manager.native_helper_target.protocol.transport, 'cli_stdio');
    assert.deepEqual(
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      ['opl-sysprobe', 'opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer'],
    );
    assert.equal(output.runtime_manager.state_index_target.status, 'rust_helper_backed_contract_first');
    assert.equal(
      output.runtime_manager.state_index_target.index_catalog.artifact_projection_index.backing_helper_id,
      'opl-artifact-indexer',
    );
    const nativeHelperContract = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-framework/native-helper-contract.json'), 'utf8'),
    );
    assert.deepEqual(
      nativeHelperContract.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
    );
    assert.equal(output.runtime_manager.future_sidecar_migration.enabled_now, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
