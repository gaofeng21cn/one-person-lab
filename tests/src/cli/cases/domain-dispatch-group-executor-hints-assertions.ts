import { assert } from '../helpers.ts';

export function assertDomainDispatchGroupExecutorHints(group: any) {
  assert.equal(group.sample_record_action_ids.length <= 3, true);
  assert.equal(group.sample_record_action_ids.length > 0, true);
  assert.equal(
    group.sample_record_action_ids.every(
      (actionId: string) => actionId.startsWith('domain_dispatch:') && actionId.endsWith(':record'),
    ),
    true,
  );
  assert.equal(group.sample_record_command_refs.length <= 3, true);
  assert.equal(group.sample_record_command_refs.length > 0, true);
  assert.equal(
    group.sample_record_command_refs.every(
      (commandRef: string) => commandRef.startsWith('opl runtime action execute --action domain_dispatch:'),
    ),
    true,
  );
  assert.equal(group.can_submit_record_to_safe_action_shell, true);
  assert.deepEqual(group.payload_template, {
    domain_receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_refs: [],
    owner_chain_refs: [],
    evidence_refs: [],
  });
  assert.equal(group.payload_ref_hints.required_any_payload_refs.includes('domain_receipt_refs'), true);
  assert.equal(
    group.payload_template_policy,
    'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
  );
  assert.equal(group.empty_payload_template_is_success_evidence, false);
}

export function assertSameDomainDispatchGroupExecutorHints(actual: any, expected: any) {
  assert.deepEqual(actual.sample_record_action_ids, expected.sample_record_action_ids);
  assert.deepEqual(actual.sample_record_command_refs, expected.sample_record_command_refs);
  assert.equal(
    actual.copyable_runtime_action_execute_commands.record_with_payload_file,
    `opl runtime action execute --action ${expected.sample_record_action_ids[0]} --payload-file <payload.json>`,
  );
  assert.equal(actual.can_submit_record_to_safe_action_shell, true);
  assert.deepEqual(actual.payload_template, expected.payload_template);
  assert.deepEqual(actual.payload_ref_hints, expected.payload_ref_hints);
  assert.equal(actual.payload_template_policy, expected.payload_template_policy);
  assert.equal(actual.empty_payload_template_is_success_evidence, false);
}
