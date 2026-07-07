import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

type AppStateListEntry = Record<string, any>;

test('app state fast exposes settings control center GUI read model', () => {
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
  fs.writeFileSync(
    path.join(stateDir, 'agent-lab-feedbackops-events.json'),
    `${JSON.stringify([
      {
        surface_kind: 'opl_delivery_feedback_event',
        version: 'opl-feedbackops.v1',
        event_id: 'feedback_event_app_state_fixture',
        idempotency_key: 'app-state-feedbackops-fixture',
        target_agent_id: 'mas',
        delivery_ref: 'paper:obesity/current-package',
        feedback_ref: 'user-feedback:obesity/high-quality-sci',
        feedback_kind: 'quality_gap',
        external_suite_ref: 'domain-feedback-external-suite-ref:mas/obesity-feedbackops',
        developer_work_order_candidate_ref: 'developer-work-order-candidate-ref:mas/obesity-feedbackops',
        completion_ref: null,
        blocker_ref: null,
        authority_boundary: {
          can_write_target_domain_truth: false,
          can_create_owner_receipt: false,
          can_create_typed_blocker: false,
          can_create_human_gate: false,
        },
      },
    ], null, 2)}\n`,
    'utf8',
  );

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.app_state.settings_control_center.surface_kind, 'opl_settings_control_center.v2');
    assert.equal(output.app_state.settings_control_center.schema_version, 'settings-control-center.v2');
    assert.deepEqual(output.app_state.settings_control_center.compatibility_schema_versions, [
      'settings-control-center.v1',
    ]);
    assert.equal(
      output.app_state.settings_control_center.contract_ref,
      'contracts/opl-framework/settings-control-center-action-read-model-contract.json',
    );
      assert.deepEqual(output.app_state.settings_control_center.allowed_action_ids, [
        'settings_repair_model_access',
        'settings_verify_workspace',
        'settings_sync_capabilities',
        'settings_apply_opl_packages',
        'refresh_registry',
        'install_from_manifest_url',
        'agent_package_update',
        'agent_package_repair',
        'agent_package_uninstall',
        'agent_package_preferences_set',
        'settings_reload_codex_surface',
        'settings_check_app_update',
      'settings_prune_runtime_roots_dry_run',
      'settings_rollback_runtime_substrate',
      'settings_install_docker_webui',
      'settings_configure_webui_api_key',
      'settings_select_webui_seed',
      'settings_run_webui_startup_maintenance',
      'settings_open_docker_webui',
      'settings_diagnose_docker_webui',
    ]);
    assert.equal(output.app_state.settings_control_center.settings_ia.ordinary_entry, 'settings_control_center');
    assert.deepEqual(output.app_state.settings_control_center.settings_ia.ordinary_route_ids, [
      'general',
      'access',
      'capabilities',
      'environment',
      'storage',
      'appearance',
      'advanced',
    ]);
    assert.deepEqual(output.app_state.settings_control_center.settings_ia.secondary_or_deep_link_route_ids, [
      'workspace',
      'local-services',
      'about',
      'update',
      'theme',
    ]);
    assert.deepEqual(
      output.app_state.settings_control_center.settings_ia.secondary_or_deep_link_routes.map((entry: AppStateListEntry) => [
        entry.route_id,
        entry.group_id,
        entry.parent_route_id,
        entry.app_shell_must_not_promote_to_top_level_tab,
      ]),
      [
        ['workspace', 'overview', 'general', true],
        ['local-services', 'maintenance_updates', 'environment', true],
        ['about', 'advanced', 'advanced', true],
        ['update', 'maintenance_updates', 'environment', true],
        ['theme', 'preferences', 'appearance', true],
      ],
    );
    assert.equal(
      output.app_state.settings_control_center.settings_ia.app_shell_contract.shell_must_not_execute_unlisted_actions,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.surface_kind,
      'opl_settings_capability_task_awareness_refs.v1',
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.content_policy,
      'refs_only_no_skill_body_no_workflow_body',
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.capability_health_refs.length > 0,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.capability_health_refs.every(
        (entry: AppStateListEntry) =>
          typeof entry.id === 'string'
          && typeof entry.title === 'string'
          && typeof entry.status === 'string'
          && typeof entry.ref === 'string'
          && typeof entry.owner === 'string'
          && typeof entry.next_action === 'string',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.connector_readiness_refs.some(
        (entry: AppStateListEntry) => entry.id === 'temporal_provider'
          && entry.ref === 'app_state.provider.temporal',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.capability_task_awareness_refs.workflow_refs.some(
        (entry: AppStateListEntry) => entry.id === 'task_export_bundle_preview'
          && entry.ref === 'app_state.actions#task_export_bundle_preview',
      ),
      true,
    );
    assert.equal(
      'body' in output.app_state.settings_control_center.capability_task_awareness_refs.workflow_refs[0],
      false,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.surface_kind,
      'opl_app_settings_read_model.v1',
    );
    const settingsProjection = output.app_state.settings_control_center.settings_projection;
    assert.equal(settingsProjection.surface_kind, 'opl_settings_projection.v1');
    assert.deepEqual(settingsProjection.ordinary_sections, [
      'summary',
      'access',
      'workspace',
      'capabilities',
      'resources',
      'maintenance',
      'storage',
      'diagnostics',
    ]);
    assert.deepEqual(
      Object.keys(settingsProjection.sections),
      settingsProjection.ordinary_sections,
    );
    const requiredProjectionItemFields = [
      'scope',
      'owner',
      'risk',
      'normal_summary',
      'next_action',
      'details_ref',
      'editable_reason',
    ];
    assert.deepEqual(settingsProjection.item_required_fields, requiredProjectionItemFields);
    assert.equal(
      Object.values(settingsProjection.sections).every((section: any) =>
        Array.isArray(section.items)
          && section.items.length > 0
          && section.items.every((item: AppStateListEntry) =>
            requiredProjectionItemFields.every((field) => typeof item[field] === 'string' && item[field].length > 0)
          )
      ),
      true,
    );
    assert.equal(
      settingsProjection.sections.resources.items.some(
        (entry: AppStateListEntry) => entry.item_id === 'connect_fabric_external_resources'
          && entry.scope === 'resources'
          && entry.risk === 'read_only',
      ),
      true,
    );
    assert.equal(
      settingsProjection.sections.storage.items.some(
        (entry: AppStateListEntry) => entry.item_id === 'runtime_roots_cleanup_plan'
          && entry.next_action === 'settings_prune_runtime_roots_dry_run',
      ),
      true,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.capability_task_awareness_refs,
      output.app_state.settings_control_center.capability_task_awareness_refs,
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.surface_kind,
      'opl_app_aion_consumer_only_readback.v1',
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.validation_status,
      'attention_required',
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.consumer_only_readback,
      output.app_state.settings_control_center.app_aion_consumer_only_readback,
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.truth_surfaces.every(
        (entry: AppStateListEntry) => entry.local_truth_allowed === false
          && typeof entry.owner === 'string'
          && typeof entry.current_source_ref === 'string',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.truth_surfaces.find(
        (entry: AppStateListEntry) => entry.surface === 'settings_policy',
      )?.delegated_action_id,
      'app_state.settings_control_center.allowed_action_ids',
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.truth_surfaces.find(
        (entry: AppStateListEntry) => entry.surface === 'app_release_and_installer',
      )?.blocked_reason,
      'app_owner_receipt_or_typed_blocker_required_before_release_currentness_claim',
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.local_scheduler_policy
        .observed_local_scheduler_roles,
      [
        'refresh_trigger',
        'ui_maintenance',
        'poll_existing_read_model',
      ],
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.local_scheduler_policy
        .forbidden_roles_enabled,
      [],
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.forbidden_truth_only_paths.includes(
        'aion_local_scheduler_as_update_truth',
      ),
      true,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.validator_findings.map(
        (entry: AppStateListEntry) => [entry.surface, entry.missing_field],
      ),
      [
        ['app_release_and_installer', 'app_owner_receipt_ref_or_typed_blocker_ref'],
        ['managed_module_and_capability_packages', 'receipt_ref_or_typed_blocker_ref'],
        ['domain_private_platform_residue', 'domain_owner_decision_ref_or_typed_blocker_ref'],
      ],
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.authority_boundary
        .app_aion_can_write_release_truth,
      false,
    );
    assert.equal(
      output.app_state.settings_control_center.app_aion_consumer_only_readback.authority_boundary
        .app_aion_can_create_owner_receipt,
      false,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.shell_policy
        .shell_must_not_rewrite_model_or_reasoning_policy,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.shell_policy
        .shell_must_not_infer_api_key_or_workspace_service_truth,
      true,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.page_structure.ordinary_route_ids,
      output.app_state.settings_control_center.settings_ia.ordinary_route_ids,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.codex_model_policy.model,
      output.app_state.core.codex.default_model,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.codex_model_policy.reasoning_effort,
      output.app_state.core.codex.default_reasoning_effort,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.codex_model_policy.shell_must_not_rewrite_policy,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.access_api_key.api_key_present,
      output.app_state.core.codex.api_key_present,
    );
    assert.equal(
      output.app_state.settings_control_center.status_summary.model_access,
      output.app_state.core.codex.model_access_ready ? 'ready' : 'attention_needed',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.codex_model_policy.model_access_ready,
      output.app_state.core.codex.model_access_ready,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.access_api_key.model_access_source,
      output.app_state.core.codex.model_access_source,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.access_api_key.repair_action_id,
      'settings_repair_model_access',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.workspace_services.workspace_root.selected_path,
      output.app_state.paths.workspace_root_path,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.workspace_services.workspace_root.verify_action_id,
      'settings_verify_workspace',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.workspace_services.modules.health,
      output.app_state.settings_control_center.status_summary.module_health,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.workspace_services.local_services.service_action_ids,
      [
        'settings_sync_capabilities',
        'settings_apply_opl_packages',
        'settings_reload_codex_surface',
      ],
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.surface_kind,
      'opl_settings_docker_webui_read_model.v1',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.doctor_surface,
      'opl system docker-webui doctor --json',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.api_key_configuration.status,
      'attention_needed',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.api_key_configuration.model_access_ready,
      output.app_state.core.codex.model_access_ready,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.api_key_configuration.model_access_source,
      output.app_state.core.codex.model_access_source,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.api_key_configuration.secret_payload_policy,
      'stdin_only_never_json_or_logs',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.seed_image_selection.image_manifest_path_env,
      'OPL_IMAGE_MANIFEST_PATH',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.runtime_proxy.browser_url_ref,
      'docker_webui_doctor.browser.url',
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.runtime_proxy.can_claim_runtime_ready,
      false,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.ordinary_next_actions.map(
        (entry: AppStateListEntry) => entry.action_id,
      ),
      [
        'settings_configure_webui_api_key',
        'settings_install_docker_webui',
        'settings_select_webui_seed',
        'settings_run_webui_startup_maintenance',
        'settings_diagnose_docker_webui',
      ],
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.authority_boundary
        .aion_shell_is_adapter_view_model_consumer_only,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.docker_webui.authority_boundary
        .shell_must_not_copy_webui_policy,
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.local_environment.state_dir,
      output.app_state.paths.state_dir,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.local_environment.app_update_action_id,
      'settings_check_app_update',
    );
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.action_policy.allowed_action_ids,
      output.app_state.settings_control_center.allowed_action_ids,
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.action_policy.authority_flags
        .can_write_domain_truth,
      false,
    );
    assert.deepEqual(
      output.app_state.settings_control_center.sections.map((entry: AppStateListEntry) => entry.section_id),
      ['overview', 'setup_access', 'capabilities', 'maintenance_updates', 'data_storage', 'preferences', 'advanced'],
    );
    assert.deepEqual(
      output.app_state.settings_control_center.control_center_groups.map((entry: AppStateListEntry) => entry.group_id),
      ['overview', 'setup_access', 'capabilities', 'maintenance_updates', 'data_storage', 'preferences', 'advanced'],
    );
    assert.deepEqual(
      output.app_state.settings_control_center.action_sections.map((entry: AppStateListEntry) => entry.section_id),
      ['model_access', 'workspace', 'capabilities', 'packages', 'codex_surface', 'docker_webui', 'updates', 'runtime_roots'],
    );
    assert.equal(
      output.app_state.settings_control_center.control_center_groups.find(
        (entry: AppStateListEntry) => entry.group_id === 'data_storage',
      )?.route_id,
      'storage',
    );
    assert.equal(
      output.app_state.settings_control_center.task_entries.every((entry: AppStateListEntry) =>
        entry.route === `opl app action execute --action ${entry.action_id}`
        && output.app_state.settings_control_center.allowed_action_ids.includes(entry.action_id)
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.task_entries.find(
        (entry: AppStateListEntry) => entry.action_id === 'settings_prune_runtime_roots_dry_run',
      )?.mutates,
      'none_read_only',
    );
      assert.equal(
        output.app_state.settings_control_center.action_catalog.find(
          (entry: AppStateListEntry) => entry.action_id === 'settings_rollback_runtime_substrate',
        )?.danger_level,
        'high',
      );
      assert.deepEqual(
        [
          'refresh_registry',
          'install_from_manifest_url',
          'agent_package_update',
          'agent_package_repair',
          'agent_package_uninstall',
          'agent_package_preferences_set',
        ].map((actionId) => {
          const action = output.app_state.settings_control_center.action_catalog.find(
            (entry: AppStateListEntry) => entry.action_id === actionId,
          );
          return [action?.action_id, action?.delegated_surface, action?.section_id];
        }),
        [
          ['refresh_registry', 'opl connect agent-packages registry refresh --registry-url <registry_url>', 'capabilities'],
          ['install_from_manifest_url', 'opl connect agent-packages install --manifest-url <manifest_url>', 'capabilities'],
          ['agent_package_update', 'opl connect agent-packages update --manifest-url <manifest_url>', 'capabilities'],
          ['agent_package_repair', 'opl connect agent-packages repair --package-id <package_id>', 'capabilities'],
          ['agent_package_uninstall', 'opl connect agent-packages uninstall --package-id <package_id>', 'capabilities'],
          ['agent_package_preferences_set', 'opl app action execute --action agent_package_preferences_set', 'capabilities'],
        ],
      );
      assert.equal(
        output.app_state.settings_control_center.action_catalog.every(
          (entry: AppStateListEntry) => entry.authority_flags.can_write_domain_truth === false,
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.issue_catalog.some(
        (entry: AppStateListEntry) => entry.status_code === 'dirty_checkout'
          && entry.recommended_action_id === 'settings_sync_capabilities',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.issue_queue.some(
        (entry: AppStateListEntry) => entry.status_code === 'manual_required'
          && entry.issue_id === 'model_access_manual_required',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.issue_queue.some(
        (entry: AppStateListEntry) => entry.issue_id === 'model_access_manual_required'
          && entry.recommended_action_id === 'settings_configure_webui_api_key',
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.issue_queue.every(
        (entry: AppStateListEntry) => entry.authority_flags.can_create_typed_blocker === false,
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.task_entries.find(
        (entry: AppStateListEntry) => entry.action_id === 'settings_reload_codex_surface',
      )?.payload_required,
      true,
    );
    const dockerWebuiActions = output.app_state.settings_control_center.task_entries.filter(
      (entry: AppStateListEntry) => entry.section_id === 'docker_webui',
    );
    assert.deepEqual(
      dockerWebuiActions.map((entry: AppStateListEntry) => entry.action_id),
      [
        'settings_install_docker_webui',
        'settings_configure_webui_api_key',
        'settings_select_webui_seed',
        'settings_run_webui_startup_maintenance',
        'settings_open_docker_webui',
        'settings_diagnose_docker_webui',
      ],
    );
    assert.equal(
      dockerWebuiActions.every((entry: AppStateListEntry) =>
        entry.authority_flags.can_claim_app_release_ready === false
          && entry.authority_flags.can_claim_production_ready === false
      ),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.action_catalog.find(
        (entry: AppStateListEntry) => entry.action_id === 'settings_diagnose_docker_webui',
      )?.delegated_surface,
      'opl system docker-webui doctor',
    );
    assert.equal(
      output.app_state.settings_control_center.dry_run_apply_verify_boundary.runtime_roots_cleanup,
      'dry_run_plan_only_no_delete',
    );
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      output.app_state.operator.workbench.settings_control_center.source_ref,
      'app_state.settings_control_center',
    );
    assert.equal(
      output.app_state.operator.workbench.settings_control_center.settings_projection_ref,
      'app_state.settings_control_center.settings_projection',
    );
    assert.equal(output.app_state.opl_agent_codex_context.source, 'one-person-lab-app/product_profile');
    assert.equal(output.app_state.opl_agent_codex_context.policy, 'app_repo_owns_gui_context_text');
    assert.equal(output.app_state.modules.source.mode, 'managed_runtime');
    assert.deepEqual(
      output.app_state.modules.items.map((entry: AppStateListEntry) => [entry.module_id, entry.label, entry.default_install]),
      [
        ['medautoscience', 'Med Auto Science', true],
        ['medautogrant', 'Med Auto Grant', true],
        ['redcube', 'RedCube AI', true],
        ['oplmetaagent', 'OPL Meta Agent', true],
        ['oplbookforge', 'OPL Book Forge', true],
      ],
    );
    assert.equal(
      output.app_state.modules.items.some((entry: AppStateListEntry) => entry.module_id === 'meddeepscientist'),
      false,
    );
    assert.deepEqual(
      output.app_state.assistants.items.map((entry: AppStateListEntry) => [entry.assistant_id, entry.label, entry.launch_hint]),
      [
        ['medautoscience', 'Med Auto Science', 'direct_click'],
        ['medautogrant', 'Med Auto Grant', 'direct_click'],
        ['redcube', 'RedCube AI', 'direct_click'],
        ['oplmetaagent', 'OPL Meta Agent', 'direct_click'],
        ['oplbookforge', 'OPL Book Forge', 'direct_click'],
      ],
    );
    assert.equal(
      output.app_state.actions.some((entry: AppStateListEntry) => entry.action_id === 'developer_supervisor' && entry.surface === 'opl app action execute'),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
