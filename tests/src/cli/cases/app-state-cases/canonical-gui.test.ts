import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import {
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaProjection,
  assertCurrentOwnerDeltaToplineNextAction,
} from '../owner-payload-workorder-assertions.ts';
import { collectObjectKeys } from './fixtures.ts';

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
      'opl runtime app-operator-drilldown --detail full --json', // reuse-first: allow diagnostic drilldown command projection.
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
      'opl runtime app-operator-drilldown --detail full --json', // reuse-first: allow diagnostic drilldown command projection.
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
      'opl runtime app-operator-drilldown --detail full --json', // reuse-first: allow diagnostic drilldown command projection.
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
          && entry.surface === 'opl runtime app-operator-drilldown --detail full --json', // reuse-first: allow diagnostic drilldown command projection.
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
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
