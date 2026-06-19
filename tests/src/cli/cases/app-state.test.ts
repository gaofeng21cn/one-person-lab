import { assert, createFakeCodexFixture, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import {
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaProjection,
  assertCurrentOwnerDeltaToplineNextAction,
} from './owner-payload-workorder-assertions.ts';
import {
  bindMasWorkspaceForAppState,
  collectObjectKeys,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasProgressPortalFixture,
} from './app-state-cases/fixtures.ts';
import './app-state-cases/public-surface.ts';

type AppStateListEntry = Record<string, any>;

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
    assert.equal(output.app_state.meta.elapsed_ms >= 0, true);
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
    assert.equal(output.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(output.app_state.core.executor.visible_executors.length, 1);
    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.provider.temporal.required_for, 'full_opl_family_runtime_readiness');
    assert.equal(output.app_state.release.channel, 'stable');
    assert.equal(output.app_state.release.version, '26.6.3');
    assert.equal(output.app_state.release.tag, 'v26.6.3');
    assert.equal(output.app_state.release.prerelease_included, false);
    assert.equal(output.app_state.release.repo, 'gaofeng21cn/one-person-lab-app');
    assert.equal(output.app_state.release.opl_framework_version, '0.1.0');
    assert.equal(output.app_state.release.framework_version, '0.1.0');
    assert.match(output.app_state.release.opl_framework_revision, /^[0-9a-f]{12}$|^\d{4}-\d{2}-\d{2}$/);
    assert.equal(output.app_state.release.framework_revision, output.app_state.release.opl_framework_revision);
    assert.match(
      output.app_state.release.framework_revision_source,
      /^(OPL_FRAMEWORK_REVISION|full_package_manifest|git_head|build_date|package_json_mtime)$/,
    );
    assert.equal(output.app_state.operator.status, 'attention_needed');
    assert.equal(output.app_state.operator.summary.profile, 'fast');
    assert.equal(output.app_state.operator.summary.visible_action_count, output.app_state.actions.length);
    assert.equal(
      output.app_state.operator.default_read_surface_policy.surface_kind,
      'opl_app_default_read_surface_policy',
    );
    assert.equal(output.app_state.operator.default_read_surface_policy.profile, 'fast');
    assert.equal(
      output.app_state.operator.default_read_surface_policy.default_operator_payload,
      'ordinary_cockpit',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.default_planning_root,
      'current_owner_delta',
    );
    assert.equal(
      'compatibility_operator_payload' in output.app_state.operator.default_read_surface_policy,
      false,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.normal_state_surface,
      'opl app state --profile fast --json',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.full_runtime_drilldown_surface,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.raw_runtime_projection_policy,
      'explicit_full_detail_or_lazy_diagnostic_only',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.runtime_tray_projection_policy,
      'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.worklist_projection_policy,
      'secondary_drilldown_never_default_planning_root',
    );
    assert.equal(
      'compatibility_payload_policy' in output.app_state.operator.default_read_surface_policy,
      false,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.first_screen_answers,
      [
        'purpose',
        'task',
        'current_owner',
        'next_action',
        'artifact_or_blocker',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.first_screen_answers.includes('count_summary'),
      false,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.diagnostic_only_answers,
      [
        'current_owner_delta',
        'current_owner_delta_read_model',
        'count_summary',
        'audit_next_safe_action_or_none',
        'full_detail_refs',
        'provider',
        'ledger',
        'worklist',
        'mcp_tool_catalog',
        'raw_receipts',
        'release_evidence',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.display_payload_policy,
      'purpose_task_current_owner_next_action_artifact_or_blocker_only',
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.display_payload_fields,
      [
        'purpose',
        'task',
        'current_owner',
        'next_action',
        'artifact_or_blocker',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.ordinary_progress_spine_ref,
      'app_state.operator.ordinary_cockpit.ordinary_progress_spine',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.progress_delta_receipt_ref,
      'app_state.operator.ordinary_cockpit.progress_delta_receipt',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.artifact_tier_policy_ref,
      'app_state.operator.ordinary_cockpit.artifact_tier_policy',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.audit_sidecar_policy_ref,
      'app_state.operator.ordinary_cockpit.audit_sidecar_policy',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.brand_experience_profile_ref,
      'app_state.operator.brand_experience_profile',
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.ordinary_cockpit.developer_full_drilldown_only,
      [
        'provider',
        'ledger',
        'worklist',
        'mcp_tool_catalog',
        'raw_receipts',
        'release_evidence',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.fast_profile_excludes.includes('runtime_tray_snapshot'),
      true,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.fast_profile_excludes.includes('raw_evidence_envelope'),
      true,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields,
      [
        'runtime_tray_snapshot',
        'raw_evidence_envelope',
        'raw_evidence_browser',
        'raw_ledger_browser',
        'ledger_browser',
        'stage_replay_packet_body',
        'private_residue_inventory_body',
        'provider_internal_ledger_body',
        'provider_internal_trace',
        'route_variant_menu',
      ],
    );
    const fastPayloadKeys = collectObjectKeys(output.app_state);
    for (const field of output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields) {
      assert.equal(
        fastPayloadKeys.has(field),
        false,
        `fast app state must not expose raw ledger/browser field ${field}`,
      );
    }
    assert.equal(
      output.app_state.operator.default_read_surface_policy.shell_contract
        .shell_must_not_use_full_drilldown_as_normal_state,
      true,
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
    assert.equal(
      output.app_state.operator.default_read_surface_policy.authority_boundary
        .audit_sidecar_can_generate_default_next_action,
      false,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.ordinary_progress_spine,
      output.app_state.operator.current_owner_delta_read_model.ordinary_progress_spine,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.progress_delta_receipt,
      output.app_state.operator.current_owner_delta_read_model.progress_delta_receipt,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.artifact_tier_policy,
      output.app_state.operator.current_owner_delta_read_model.artifact_tier_policy,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.audit_sidecar_policy,
      output.app_state.operator.current_owner_delta_read_model.audit_sidecar_policy,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.ordinary_progress_spine
        .default_next_action_derives_from,
      'current_owner_delta',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.audit_sidecar_policy
        .blocked_refs_only_can_generate_default_next_action,
      false,
    );
    assert.equal(output.app_state.operator.workbench.view_model_schema, 'opl_app_operator_workbench.v1');
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy,
      output.app_state.operator.workbench.default_read_surface_policy,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit,
      output.app_state.operator.workbench.ordinary_cockpit,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit.ordinary_progress_spine,
      output.app_state.operator.current_owner_delta.ordinary_progress_spine,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit.progress_delta_receipt,
      output.app_state.operator.current_owner_delta.progress_delta_receipt,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit.artifact_tier_policy,
      output.app_state.operator.current_owner_delta.artifact_tier_policy,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit.audit_sidecar_policy,
      output.app_state.operator.current_owner_delta.audit_sidecar_policy,
    );
    assert.deepEqual(
      output.app_state.operator.brand_experience_profile,
      output.app_state.operator.workbench.brand_experience_profile,
    );
    assert.deepEqual(
      output.app_state.operator.one_shot_plan_landing,
      output.app_state.operator.workbench.one_shot_plan_landing,
    );
    assert.equal(
      output.app_state.operator.one_shot_plan_landing.surface_kind,
      'opl_app_one_shot_plan_landing_profile',
    );
    assert.equal(
      output.app_state.operator.one_shot_plan_landing.status,
      'opl_surfaces_landed_external_owner_evidence_required',
    );
    assert.deepEqual(output.app_state.operator.one_shot_plan_landing.summary, {
      total_plan_count: 9,
      opl_landed_count: 2,
      opl_landed_owner_gated_count: 6,
      external_owner_gated_count: 1,
      all_opl_controlled_surfaces_landed: true,
      external_owner_evidence_still_required: true,
      ready_claim_authorized: false,
    });
    assert.deepEqual(
      output.app_state.operator.one_shot_plan_landing.owner_gated_plan_ids,
      ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
    );
    assert.equal(
      output.app_state.operator.one_shot_plan_landing.authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(
      output.app_state.operator.one_shot_plan_landing.authority_boundary.can_sign_owner_receipt,
      false,
    );
    assert.equal(
      output.app_state.operator.brand_experience_profile.surface_kind,
      'opl_app_brand_experience_profile',
    );
    assert.deepEqual(
      output.app_state.operator.brand_experience_profile.experience_axes.map((entry: AppStateListEntry) =>
        entry.axis_id
      ),
      ['running_fluency', 'output_quality', 'brand_feel'],
    );
    assert.equal(
      output.app_state.operator.brand_experience_profile.default_read_surface_ref,
      'app_state.operator.ordinary_cockpit',
    );
    assert.equal(
      output.app_state.operator.brand_experience_profile.contract_refs.includes(
        'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
      ),
      true,
    );
    assert.equal(output.app_state.operator.brand_experience_profile.l5_evidence_refs_only, true);
    assert.equal(output.app_state.operator.brand_experience_profile.authority_boundary.can_claim_l5, false);
    assert.equal(
      output.app_state.operator.brand_experience_profile.authority_boundary.can_claim_app_release_ready,
      false,
    );
    assert.equal(
      output.app_state.operator.brand_experience_profile.authority_boundary.can_authorize_quality_verdict,
      false,
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.authority_boundary.default_next_action_derives_from,
      'derive_default_next_action_only_from_current_owner_delta',
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.authority_boundary.default_planning_root,
      'current_owner_delta',
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
      output.app_state.operator.ordinary_cockpit.display_payload.current_owner,
      output.app_state.operator.current_owner_delta.current_owner,
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.next_action.owner,
      output.app_state.operator.current_owner_delta_next_action?.owner
        ?? output.app_state.operator.current_owner_delta.current_owner,
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.artifact_or_blocker.content_policy,
      'refs_only_no_artifact_or_receipt_body',
    );
    const ordinaryCockpitPayload = JSON.stringify(output.app_state.operator.ordinary_cockpit.display_payload);
    for (const developerOnlyTerm of [
      'provider',
      'ledger',
      'worklist',
      'mcp',
      'raw_receipt',
      'release_evidence',
    ]) {
      assert.equal(
        ordinaryCockpitPayload.includes(developerOnlyTerm),
        false,
        `ordinary cockpit display payload must not expose ${developerOnlyTerm}`,
      );
    }
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.workbench.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.current_owner_delta_read_model.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta_read_model,
      output.app_state.operator.workbench.current_owner_delta_read_model,
    );
    assert.deepEqual(
      output.app_state.operator.stage_run_cockpit,
      output.app_state.operator.workbench.stage_run_cockpit,
    );
    assert.deepEqual(
      output.app_state.operator.stage_run_cockpit_summary,
      output.app_state.operator.workbench.stage_run_cockpit_summary,
    );
    assertCurrentOwnerDeltaToplineNextAction(output.app_state.operator);
    assertCurrentOwnerDeltaToplineNextAction(output.app_state.operator.workbench);
    assert.equal(output.app_state.operator.stage_run_cockpit.surface_kind, 'opl_app_stage_run_cockpit_projection');
    assert.equal(
      output.app_state.operator.stage_run_cockpit.projection_role,
      'app_consumes_stage_run_current_owner_delta',
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.default_read_surface, 'stage_run_current_owner_delta');
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.current_owner,
      'one-person-lab',
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.current_owner_delta_owner,
      output.app_state.operator.current_owner_delta.current_owner,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.required_delta,
      output.app_state.operator.current_owner_delta.desired_delta_description,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.accepted_return_shapes
        .includes('framework_readiness_ref'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.accepted_return_shapes
        .includes('family_runtime_evidence_worklist_ref'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta.accepted_return_shapes
        .includes('app_operator_drilldown_ref'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.stage_run_current_owner_delta
        .missing_role_or_answer_summary.owner_receipt_or_typed_blocker_missing,
      true,
    );
    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'one-person-lab',
      requiredDelta: 'refresh_current_owner_delta_read_model_required',
      acceptedAnswerShapeIncludes: [
        'framework_readiness_ref',
        'family_runtime_evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
    });
    assertCurrentOwnerDeltaReadModel(output.app_state.operator.workbench.current_owner_delta_read_model, {
      currentOwner: 'one-person-lab',
      requiredDelta: 'refresh_current_owner_delta_read_model_required',
      acceptedReturnShapes: [
        'framework_readiness_ref',
        'family_runtime_evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
      acceptedAnswerShapeIncludes: [
        'framework_readiness_ref',
        'family_runtime_evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      fullDetailRefKeys: [
        'framework_readiness_ref',
        'evidence_worklist_ref',
        'app_operator_drilldown_ref',
        'cache_refresh_policy',
      ],
    });
    assert.equal(
      output.app_state.operator.current_owner_delta_read_model.owner_delta_audit_tail.full_detail_refs
        .cache_refresh_policy,
      'fast_profile_cache_miss_requires_authoritative_owner_delta_refresh_before_claiming_no_action',
    );
    assert.equal(
      output.app_state.operator.current_owner_delta.desired_delta_description,
      'refresh_current_owner_delta_read_model_required',
    );
    assert.equal(output.app_state.operator.operator_next_action_kind, 'current_owner_delta_followthrough_required');
    assert.equal(output.app_state.operator.operator_next_action_owner, 'one-person-lab');
    assert.equal(output.app_state.operator.operator_next_action_source, 'current_owner_delta');
    assert.equal(output.app_state.operator.operator_next_action_authority_boundary.route_requires_opl_runtime_refs, false);
    assert.equal(output.app_state.operator.operator_next_action_authority_boundary.route_requires_domain_or_app_payload, false);
    assert.equal(output.app_state.operator.operator_next_action_authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.operator_next_action_authority_boundary.can_create_owner_receipt, false);
    assert.equal(
      output.app_state.operator.stage_run_next_required_owner_action.action_kind,
      'stage_run_execution_authorization_or_closeout_binding_required',
    );
    assert.equal(
      output.app_state.operator.stage_run_next_required_owner_action.next_required_owner,
      'one-person-lab',
    );
    assert.equal(
      output.app_state.operator.stage_run_execution_authorization_next_action_authority_boundary
        .route_requires_opl_runtime_refs,
      true,
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.launch_admission.default_blocked, false);
    assert.deepEqual(output.app_state.operator.stage_run_cockpit.launch_admission.launch_blockers, []);
    assert.equal(
      output.app_state.operator.stage_run_cockpit.launch_admission.advisory_warnings
        .includes('strategy_ref_missing:prompt_refs'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.closeout_admission.closeout_blockers
        .includes('owner_receipt_or_typed_blocker_missing'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.closeout_admission.forbidden_authority_flags
        .includes('provider_completed_cannot_close_stage'),
      true,
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.execution_authorization.status, 'blocked');
    assert.equal(output.app_state.operator.stage_run_cockpit.execution_authorization.execution_authorized, false);
    assert.equal(
      output.app_state.operator.stage_run_cockpit.execution_authorization.launch_blockers
        .includes('provider_attempt_ref_missing'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.execution_authorization.closeout_binding_blockers
        .includes('closeout_receipt_ref_missing'),
      true,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.execution_authorization.opl_runtime_blocker.owner,
      'one-person-lab',
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.execution_authorization.opl_runtime_blocker.blocker_code,
      'stage_run_execution_authorization_blocked',
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.refs_only, true);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      output.app_state.operator.stage_run_cockpit.authority_boundary.provider_completion_counts_as_closeout,
      false,
    );
    assert.equal(
      output.app_state.operator.stage_run_cockpit.authority_boundary.read_model_counts_as_closeout,
      false,
    );
    assert.equal(
      output.app_state.operator.workbench.current_owner_delta_read_model.owner_delta_audit_tail.full_detail_refs
        .app_operator_drilldown_ref,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.deepEqual(
      output.app_state.operator.workbench.summary_cards.map((entry: AppStateListEntry) => entry.card_id),
      ['active_projects', 'runtime_status', 'codex_cli', 'temporal_provider', 'runtime_modules', 'release_channel'],
    );
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry: AppStateListEntry) => entry.card_id === 'active_projects')?.value,
      0,
    );
    assert.equal(
      output.app_state.operator.workbench.sections.some(
        (entry: AppStateListEntry) => entry.section_id === 'full_runtime_drilldown' && entry.lazy === true,
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.navigation.replacement_policy,
      'app_repo_owns_navigation_truth_shell_renders_typed_items',
    );
    assert.equal(output.app_state.operator.workbench.action_queue.item_limit, 16);
    assert.equal(output.app_state.operator.workbench.action_queue.items.length > 0, true);
    assert.equal(output.app_state.operator.workbench.action_queue.items[0].item_id.startsWith('action:'), true);
    assert.equal(output.app_state.operator.workbench.domain_lane_map.lanes.length, 5);
    assert.equal(output.app_state.operator.workbench.task_drilldowns.length, 5);
    assert.equal(output.app_state.operator.workbench.safe_action_routes.length > 0, true);
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.every((entry: AppStateListEntry) =>
        entry.route.startsWith('opl app action execute --action ')
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.refresh_policy.failure_policy,
      'section_level_status_with_last_good_display_cache_allowed',
    );
    assert.equal(output.app_state.operator.workbench.refresh_policy.full_detail_auto_poll, false);
    assert.equal(output.app_state.operator.workbench.performance_policy.fast_json_max_bytes, 500000);
    assert.equal(
      output.app_state.operator.workbench.performance_policy.shell_must_not_derive_layout_from_raw_runtime_projection,
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.performance_policy.shell_must_not_use_full_drilldown_as_normal_state,
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.lazy_refs.some(
        (entry: AppStateListEntry) => entry.ref_id === 'full_runtime_drilldown'
          && entry.surface === 'opl runtime app-operator-drilldown --detail full --json',
      ),
      true,
    );
    assert.equal('app_operator_drilldown' in output.app_state, false);
    assert.equal('evidence_envelope' in output.app_state, false);
    assert.equal(output.app_state.operator.dynamic_vertical_map.nodes.length > 0, true);
    assert.equal(output.app_state.operator.owner_boundary.shell, 'thin_renderer_and_ipc_adapter');
    assert.equal(output.app_state.operator.owner_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.paths.state_dir, stateDir);
    assert.equal(output.app_state.paths.modules_root, path.join(stateDir, 'modules'));
    assert.equal(output.app_state.paths.workspace_root_path, homeRoot);
    assert.equal(output.app_state.paths.logs_dir, path.join(stateDir, 'logs'));
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
        ['oplbookforge', 'OPL BookForge', true],
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
        ['oplbookforge', 'OPL BookForge', 'direct_click'],
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

test('app state fast exposes MAS study-level running activity refs for the GUI', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          ordinary_cockpit: {
            display_payload: Record<string, any>;
          };
          operator_next_action_owner: string | null;
          current_owner_delta: Record<string, any>;
          current_owner_delta_next_action: Record<string, any> | null;
          current_owner_delta_read_model: Record<string, any>;
          workbench: {
            ordinary_cockpit: {
              display_payload: Record<string, any>;
            };
            current_owner_delta: Record<string, any>;
            current_owner_delta_read_model: Record<string, any>;
            summary_cards: Array<{ card_id: string; value: number | string }>;
            activity_center: {
              active_projects: Array<{ study_id?: string; state: string; active_run_id?: string | null }>;
              needs_attention: Array<{ study_id?: string; state: string }>;
              recent_projects: Array<{ study_id?: string; state: string }>;
            };
            domain_lane_map: { lanes: Array<{ domain_id: string; active_task_count: number; tasks: Array<{ study_id?: string; state: string }> }> };
            task_drilldowns: Array<{ study_id?: string; state: string; source_ref_count: number }>;
          };
          visual_ref_groups: {
            active_project_refs: Array<{ study_id?: string; state: string }>;
            recent_project_refs: Array<{ study_id?: string; state: string }>;
          };
        };
      };
    };

    const activeStudyIds = output.app_state.operator.workbench.activity_center.active_projects.map((entry) => entry.study_id);
    assert.deepEqual(activeStudyIds, [
      '002-dm-china-us-mortality-attribution',
    ]);
    assert.deepEqual(
        output.app_state.operator.workbench.activity_center.needs_attention.map((entry) => entry.study_id),
      ['003-dpcc-primary-care-phenotype-treatment-gap'],
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta_read_model,
      output.app_state.operator.workbench.current_owner_delta_read_model,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.workbench.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit,
      output.app_state.operator.workbench.ordinary_cockpit,
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
      output.app_state.operator.ordinary_cockpit.display_payload.task.task_ref,
      'medautoscience:study:003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.current_owner,
      'med-autoscience',
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.next_action.owner,
      output.app_state.operator.current_owner_delta_next_action?.owner
        ?? output.app_state.operator.current_owner_delta.current_owner,
    );
    assert.equal(
      JSON.stringify(output.app_state.operator.ordinary_cockpit.display_payload).includes('worklist'),
      false,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.current_owner_delta_read_model.current_owner_delta,
    );
    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
    });
    assertCurrentOwnerDeltaReadModel(output.app_state.operator.current_owner_delta_read_model, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
      acceptedReturnShapes: [
        'domain_owner_receipt_ref',
        'domain_typed_blocker_ref',
        'typed_blocker_ref',
      ],
      openSafeActionCount: 1,
      payloadRequiredCount: 0,
      fullDetailRefKeys: [
        'owner_delta_first_ref',
        'evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
    });
    assert.notEqual(
      output.app_state.operator.current_owner_delta.stage_id,
      'domain_owner/default-executor-dispatch',
    );
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      1,
    );
    assert.deepEqual(
      output.app_state.operator.visual_ref_groups.active_project_refs.map((entry) => entry.study_id),
      activeStudyIds,
    );
    assert.equal(
      output.app_state.operator.workbench.activity_center.recent_projects.length,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.domain_lane_map.lanes.find((entry) => entry.domain_id === 'medautoscience')?.active_task_count,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.filter((entry) => entry.study_id).length,
      3,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.every((entry) => !entry.study_id || entry.source_ref_count > 0),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast ignores non-framework owner-delta cache as default cockpit source', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-cache-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-cache-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-cache-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          current_owner_delta: Record<string, any>;
          current_owner_delta_read_model: Record<string, any>;
          workbench: {
            current_owner_delta: Record<string, any>;
            summary_cards: Array<{ card_id: string; value: number | string }>;
          };
        };
      };
    };

    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
    });
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      1,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast does not perform network latest-version lookup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-fast-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const npmMarker = path.join(codexFixture.fixtureRoot, 'npm-called.marker');
  fs.writeFileSync(
    path.join(codexFixture.fixtureRoot, 'npm'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${JSON.stringify(npmMarker)}`,
      'echo "unexpected npm network lookup" >&2',
      'exit 42',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        core: {
          codex: {
            parsed_version: string | null;
            latest_version: string | null;
            latest_version_status: string;
            diagnostics: string[];
          };
        };
      };
    };

    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.core.codex.latest_version, null);
    assert.equal(output.app_state.core.codex.latest_version_status, 'unknown');
    assert.equal(output.app_state.core.codex.diagnostics.includes('codex_cli_latest_lookup_skipped_fast_profile'), true);
    assert.equal(fs.existsSync(npmMarker), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast stays bounded for GUI rendering', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-size-home-'));
  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    });
    const byteLength = Buffer.byteLength(JSON.stringify(output), 'utf8');
    assert.equal(byteLength < 500000, true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app command parsers reject invalid state profiles and non-object action payloads', () => {
  const invalidProfile = runCliFailure(['app', 'state', '--profile', 'slow']);
  assert.equal(invalidProfile.payload.error.code, 'cli_usage_error');
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('fast'), true);
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('full'), true);

  const invalidPayload = runCliFailure([
    'app',
    'action',
    'execute',
    '--action',
    'developer_supervisor',
    '--payload',
    '[]',
    '--dry-run',
  ]);
  assert.equal(invalidPayload.payload.error.code, 'cli_usage_error');
  assert.equal(invalidPayload.payload.error.message, '--payload must be a JSON object.');
});
