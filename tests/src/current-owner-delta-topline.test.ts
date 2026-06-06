import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = 'src/current-owner-delta-topline.ts';

test('current owner delta topline uses OPL runtime owner when StageRun execution authorization is blocked', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const topline = module.buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: {
      surface_kind: 'opl_current_owner_delta_read_model',
      current_owner_delta: {
        surface_kind: 'opl_current_owner_delta',
        delta_id: 'current-owner-delta:med-autoscience:paper-closeout:owner-answer',
        domain: 'med-autoscience',
        domain_id: 'med-autoscience',
        current_owner: 'med-autoscience',
        owner: 'med-autoscience',
        stage_ref: 'paper_closeout',
        desired_delta_kind: 'owner_answer',
        desired_delta_description: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
        payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
        accepted_answer_shape: [
          'domain_owner_receipt_ref',
          'quality_gate_receipt_ref',
          'typed_blocker_ref',
        ],
        hard_gate: {
          state: 'owner_delta_open',
          human_or_domain_owner_required: true,
        },
        source_fingerprint: 'sha256:owner-delta-topline-test',
        audit_refs: {},
      },
      next_safe_action_or_none: {
        surface_kind: 'opl_current_owner_delta_default_next_action',
        action_kind: 'current_owner_delta_owner_answer_or_typed_blocker_required',
        derivation_source: 'current_owner_delta',
        default_planning_root: 'current_owner_delta_or_provider_human_hard_gate',
        current_owner: 'med-autoscience',
        owner: 'med-autoscience',
        route_requires_domain_or_app_payload: true,
      },
    },
  });

  assert.equal(topline.operator_current_owner_delta_owner, 'med-autoscience');
  assert.equal(topline.operator_next_owner, 'one-person-lab');
  assert.equal(topline.operator_next_action_owner, 'one-person-lab');
  assert.equal(
    topline.operator_next_required_action,
    'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(
    topline.operator_next_action_authority_boundary.derivation_source,
    'stage_run_execution_authorization',
  );
  assert.equal(topline.stage_run_cockpit_summary.current_owner_delta_owner, 'med-autoscience');
  assert.equal(topline.stage_run_cockpit_summary.current_owner, 'one-person-lab');
  assert.equal(topline.stage_run_cockpit_summary.next_required_owner, 'one-person-lab');
});
