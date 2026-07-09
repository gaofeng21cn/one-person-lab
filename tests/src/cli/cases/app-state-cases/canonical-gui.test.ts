import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { collectObjectKeys } from './fixtures.ts';

test('app state fast exposes the canonical GUI read model without retired MDS defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const stateDir = path.join(homeRoot, 'opl-state');
  fs.mkdirSync(stateDir, { recursive: true });

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.app_state.schema_version, 'opl_app_state.v1');
    assert.equal(output.app_state.surface_kind, 'opl_app_state.v1');
    assert.equal(output.app_state.meta.profile, 'fast');
    assert.equal(output.app_state.runtime_source.producer_role, 'gui_ready_state_action_producer_only');
    assert.equal(output.app_state.runtime_source.normal_gui_state_surface, 'opl app state --profile fast --json');
    assert.equal(output.app_state.runtime_source.full_gui_state_surface, 'opl app state --profile full --json');
    assert.equal(output.app_state.runtime_source.action_boundary_surface, 'opl app action execute --json');
    assert.equal(
      output.app_state.runtime_source.full_drilldown_exception_surface,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.equal(output.app_state.runtime_source.shell_must_not_use_full_drilldown_as_normal_state, true);
    assert.equal('runtime_tray_snapshot' in output.app_state, false);
    assert.equal('app_operator_drilldown' in output.app_state, false);
    assert.equal('evidence_envelope' in output.app_state, false);

    assert.equal(output.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(output.app_state.core.executor.visible_executors.length, 1);
    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.provider.temporal.required_for, 'full_opl_family_runtime_readiness');
    assert.equal(output.app_state.release.repo, 'gaofeng21cn/one-person-lab-app');
    assert.equal(output.app_state.modules.items.some((entry: any) => entry.module_id === 'meddeepscientist'), false);

    assert.equal(output.app_state.settings_control_center.surface_kind, 'opl_settings_control_center.v2');
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_sync_capabilities'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_check_app_update'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_rollback_runtime_substrate'),
      true,
    );
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_typed_blocker, false);

    assert.equal(output.app_state.operator.default_read_surface_policy.profile, 'fast');
    assert.equal(
      output.app_state.operator.default_read_surface_policy.default_planning_root,
      'current_owner_delta',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.shell_contract
        .shell_must_not_derive_layout_from_raw_runtime_projection,
      true,
    );
    assert.equal(output.app_state.operator.default_read_surface_policy.shell_contract.full_detail_auto_poll, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_production_ready, false);
    assert.equal(
      output.app_state.operator.default_read_surface_policy.authority_boundary
        .raw_worklist_can_generate_default_next_action,
      false,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.authority_boundary
        .raw_evidence_can_generate_default_next_action,
      false,
    );
    assert.deepEqual(
      Object.keys(output.app_state.operator.ordinary_cockpit.display_payload),
      [
        'purpose',
        'task',
        'current_owner',
        'next_action',
        'artifact_or_blocker',
      ],
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.authority_boundary.default_next_action_derives_from,
      'derive_default_next_action_only_from_current_owner_delta',
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.refs_only, true);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.read_model_counts_as_closeout, false);

    const fastPayloadKeys = collectObjectKeys(output.app_state);
    for (const field of output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields) {
      assert.equal(fastPayloadKeys.has(field), false, `fast app state must not expose ${field}`);
    }
    assert.equal(
      output.app_state.operator.workbench.sections.some(
        (entry: any) => entry.section_id === 'settings_control_center'
          && entry.source_ref === 'app_state.settings_control_center'
          && entry.lazy === false,
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.every((entry: any) =>
        entry.route.startsWith('opl app action execute --action ')
      ),
      true,
    );
    assert.equal(output.app_state.paths.state_dir, stateDir);
    assert.equal(output.app_state.paths.modules_root, path.join(stateDir, 'modules'));
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
