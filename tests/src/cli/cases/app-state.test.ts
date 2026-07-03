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
    assert.equal(output.app_state.release.version, '26.6.27');
    assert.equal(output.app_state.release.tag, 'v26.6.27');
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
      output.app_state.operator.workbench.sections.some(
        (entry: AppStateListEntry) => entry.section_id === 'settings_control_center'
          && entry.source_ref === 'app_state.settings_control_center'
          && entry.lazy === false,
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
    assert.equal(
      output.app_state.agent_lab_feedback_self_evolution.surface_kind,
      'opl_agent_lab_domain_feedback_self_evolution_read_model',
    );
    assert.equal(
      output.app_state.operator.workbench.agent_lab_feedback_self_evolution.read_model_id,
      output.app_state.agent_lab_feedback_self_evolution.read_model_id,
    );
    assert.deepEqual(
      output.app_state.operator.workbench.agent_lab_feedback_self_evolution.status_shape,
      ['queued', 'runnable', 'completed_or_blocker'],
    );
    assert.equal(
      output.app_state.operator.workbench.agent_lab_feedback_self_evolution.summary.runnable_count,
      1,
    );
    assert.equal(output.app_state.feedbackops.surface_kind, 'opl_feedbackops_read_model');
    assert.equal(
      output.app_state.operator.workbench.feedbackops.read_model_id,
      output.app_state.feedbackops.read_model_id,
    );
    assert.equal(output.app_state.operator.workbench.feedbackops.intake_event_count, 1);
    assert.equal(
      output.app_state.operator.workbench.feedbackops.summary.queued_requires_developer_mode_count,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.sections.some(
        (entry: AppStateListEntry) => entry.section_id === 'feedbackops'
          && entry.source_ref === 'app_state.operator.workbench.feedbackops',
      ),
      true,
    );
    const agentLabFeedbackQueueItems = output.app_state.operator.workbench.action_queue.items
      .filter((entry: AppStateListEntry) => entry.item_id.startsWith('agent_lab_feedback:'));
    assert.deepEqual(
      agentLabFeedbackQueueItems.map((entry: AppStateListEntry) => entry.state),
      ['queued', 'runnable', 'completed_or_blocker'],
    );
    assert.equal(
      agentLabFeedbackQueueItems.find((entry: AppStateListEntry) => entry.state === 'runnable')
        ?.execution_surface,
      'opl work-order execute',
    );
    const feedbackOpsQueueItems = output.app_state.operator.workbench.action_queue.items
      .filter((entry: AppStateListEntry) => entry.item_id.startsWith('feedbackops:'));
    assert.deepEqual(
      feedbackOpsQueueItems.map((entry: AppStateListEntry) => entry.state),
      ['queued_requires_developer_mode'],
    );
    assert.equal(feedbackOpsQueueItems[0].priority_bucket, 'requires_developer_mode');
    assert.equal(feedbackOpsQueueItems[0].execution_surface, null);
    assert.equal(feedbackOpsQueueItems[0].authority_boundary.can_write_target_domain_truth, false);
    assert.equal(
      agentLabFeedbackQueueItems.every((entry: AppStateListEntry) =>
        entry.authority_boundary.can_write_domain_truth === false
          && entry.authority_boundary.can_write_owner_receipt === false
      ),
      true,
    );
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
    assert.deepEqual(
      output.app_state.settings_control_center.app_settings_read_model.capability_task_awareness_refs,
      output.app_state.settings_control_center.capability_task_awareness_refs,
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
        entry.route.startsWith('opl app action execute --action settings_')
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
    assert.deepEqual(
      output.app_state.operator.workbench.settings_control_center,
      output.app_state.settings_control_center,
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
            task_drilldowns: Array<{
              study_id?: string;
              state: string;
              source_ref_count: number;
              stage: Record<string, any>;
              progress: Record<string, any>;
              next_owner: Record<string, any>;
              artifact_or_blocker: Record<string, any>;
              review_receipt: Record<string, any>;
              action_receipt: Record<string, any>;
              workflow_refs: Record<string, any>;
            }>;
            task_run_projection_v2: {
              surface_kind: string;
              schema_version: string;
              refs_only: boolean;
              source_ref: string;
              summary: Record<string, number>;
              tasks: Array<{
                task_identity: Record<string, any>;
                status: Record<string, any>;
                progress: Record<string, any>;
                conditions: Array<Record<string, any>>;
                evidence_cards: Array<Record<string, any>>;
                action_cards: Array<Record<string, any>>;
                resource_cards: Array<Record<string, any>>;
                diagnostics_ref: string;
                authority_boundary?: Record<string, any>;
              }>;
              authority_boundary: Record<string, any>;
            };
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
    const runningTask = output.app_state.operator.workbench.task_drilldowns.find(
      (entry) => entry.study_id === '002-dm-china-us-mortality-attribution',
    );
    assert.ok(runningTask);
    assert.equal(runningTask.stage.stage_id, 'live');
    assert.equal(runningTask.stage.current_ref.includes('task_drilldowns'), true);
    assert.equal(runningTask.progress.status, 'running');
    assert.equal(runningTask.next_owner.owner, 'medautoscience');
    assert.equal(runningTask.artifact_or_blocker.content_policy, 'refs_only_no_artifact_body');
    assert.equal(runningTask.artifact_or_blocker.canonical_ref.includes('/tasks/'), true);
    assert.equal(Array.isArray(runningTask.artifact_or_blocker.export_bundle_refs), true);
    assert.equal(runningTask.artifact_or_blocker.export_bundle_refs[0].includes('/export-bundles/latest'), true);
    assert.equal(runningTask.artifact_or_blocker.export_bundle_action_ref, 'app_state.actions#task_export_bundle_preview');
    assert.equal(runningTask.review_receipt.authority_policy, 'receipt_summary_refs_only_no_quality_verdict_authority');
    assert.equal(runningTask.review_receipt.receipt_ref.includes('/reviewer-receipt'), true);
    assert.equal(runningTask.action_receipt.action_id, 'task_action_receipt_preview');
    assert.equal(runningTask.action_receipt.dry_run_required, true);
    assert.equal(runningTask.action_receipt.export_bundle_action_id, 'task_export_bundle_preview');
    assert.equal(runningTask.action_receipt.export_bundle_route, 'opl app action execute --action task_export_bundle_preview --dry-run');
    assert.equal(runningTask.workflow_refs.content_policy, 'refs_only_no_workflow_body');
    assert.equal(runningTask.workflow_refs.current_workflow_ref.includes('/workflows/current'), true);
    assert.equal('artifact_body' in runningTask.artifact_or_blocker, false);
    assert.equal('body' in runningTask.artifact_or_blocker, false);
    assert.equal('body' in runningTask.review_receipt, false);
    assert.equal('body' in runningTask.workflow_refs, false);

    const taskRunProjection = output.app_state.operator.workbench.task_run_projection_v2;
    assert.equal(taskRunProjection.surface_kind, 'task_run_projection_v2');
    assert.equal(taskRunProjection.schema_version, 'task-run-projection.v2');
    assert.equal(taskRunProjection.refs_only, true);
    assert.equal(taskRunProjection.source_ref, 'app_state.operator.workbench.task_drilldowns');
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 1,
      attention_task_count: 1,
      recent_task_count: 1,
    });
    assert.equal(taskRunProjection.authority_boundary.can_write_domain_truth, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_artifact_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_memory_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_owner_receipt, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_typed_blocker, false);
    assert.equal(taskRunProjection.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal('provider_completion_is_domain_ready' in taskRunProjection.authority_boundary, false);

    const runningProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '002-dm-china-us-mortality-attribution',
    );
    assert.ok(runningProjection);
    assert.equal(runningProjection.task_identity.task_id, 'medautoscience:study:002-dm-china-us-mortality-attribution');
    assert.equal(runningProjection.status.state, 'running');
    assert.equal(runningProjection.status.active_run_ref?.endsWith('.active_run_id'), true);
    assert.equal(runningProjection.progress.progress_ref.endsWith('.progress'), true);
    assert.equal(runningProjection.progress.stage_ref.endsWith('.stage'), true);
    assert.deepEqual(
      runningProjection.conditions.map((condition) => condition.type),
      ['task_status', 'owner_route', 'evidence_refs'],
    );
    for (const condition of runningProjection.conditions) {
      assert.deepEqual(
        Object.keys(condition),
        ['type', 'status', 'reason', 'message', 'severity', 'owner', 'last_transition_time', 'ref'],
      );
      assert.equal(typeof condition.ref, 'string');
    }
    const attentionProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.ok(attentionProjection);
    assert.equal(
      attentionProjection.conditions.find((condition) => condition.type === 'task_status')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      attentionProjection.conditions.find((condition) => condition.type === 'owner_route')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      runningProjection.evidence_cards.every((card) =>
        typeof card.kind === 'string'
          && typeof card.owner === 'string'
          && 'updated_at' in card
          && typeof card.title === 'string'
          && typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && typeof card.why_it_matters === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && typeof card.content_policy === 'string'
          && !('body' in card)
          && !('artifact_body' in card)
          && !('receipt_body' in card)
          && !('verdict' in card)
          && !('quality_verdict' in card)
          && !('domain_verdict' in card)
      ),
      true,
    );
    assert.equal(
      runningProjection.action_cards.every((card) =>
        typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && card.risk?.mutation_policy === 'no_writes_preview_only'
          && Array.isArray(card.write_targets)
          && card.write_targets.length === 0
          && card.expected_output?.content_policy === 'refs_only_no_action_receipt_body'
          && typeof card.rollback_ref === 'string'
          && typeof card.verify_ref === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && !('body' in card)
          && !('receipt_body' in card)
          && !('verdict' in card)
          && !('quality_verdict' in card)
      ),
      true,
    );
    assert.equal(
      runningProjection.resource_cards.every((card) =>
        typeof card.resource_kind === 'string'
          && typeof card.owner === 'string'
          && typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && typeof card.status_ref === 'string'
          && typeof card.usage_ref === 'string'
          && typeof card.quota_ref === 'string'
          && typeof card.permission_ref === 'string'
          && typeof card.cost_estimate_ref === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && !('body' in card)
          && !('resource_body' in card)
          && !('verdict' in card)
      ),
      true,
    );
    assert.deepEqual(
      runningProjection.evidence_cards.map((card) => card.kind),
      ['source_refs', 'artifact_or_blocker_refs', 'review_receipt_refs'],
    );
    assert.deepEqual(
      runningProjection.resource_cards.map((card) => card.resource_kind),
      ['workspace', 'workflow'],
    );
    assert.equal(runningProjection.diagnostics_ref, 'app_state.provider.temporal');
    const projectionWithoutDiagnostics = JSON.stringify({
      ...runningProjection,
      diagnostics_ref: undefined,
    });
    assert.equal(projectionWithoutDiagnostics.includes('provider'), false);
    assert.equal(projectionWithoutDiagnostics.includes('Temporal'), false);
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
