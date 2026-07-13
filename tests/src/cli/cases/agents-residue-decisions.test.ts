import { assert, fs, parseJsonText, path, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

test('agents residue-decisions verifies zero only after source closure passes', () => {
  const repoDir = buildReadyAgentRepo();
  const ledger = runCli([
    'agents',
    'residue-decisions',
    '--agent',
    `sample=${repoDir}`,
  ]).private_platform_residue_owner_decisions;

  assert.equal(ledger.state, 'verified_zero');
  assert.equal(ledger.summary.residue_verification_status, 'verified_zero');
  assert.equal(ledger.summary.source_closure_verified_repo_count, 1);
  assert.equal(ledger.reports[0].status, 'verified_zero');
  assert.equal(ledger.reports[0].source_closure_verified_zero, true);
});

test('agents residue-decisions projects private platform owner-decision ledger', () => {
  const repoDir = buildReadyAgentRepo();
  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as any;
  const baseBridgeExitGate = {
    no_active_caller_refs: ['no-active-caller:sample/private-platform-residue'],
    no_forbidden_write_refs: ['no-forbidden-write:sample/private-platform-residue'],
    tombstone_refs: ['tombstone:sample/private-platform-residue'],
    physical_delete_authorized: false,
    authority_boundary: {
      can_authorize_domain_repo_physical_delete: false,
    },
  };
  functionalAudit.modules.push(
    {
      module_id: 'sample_brief_legacy_scheduler',
      classification: 'generic_scheduler_or_daemon',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/legacy-scheduler.ts'],
      active_callers: [],
      active_caller_status: 'no_active_caller_observed_after_opl_runway_cutover',
      migration_action: 'delete_after_no_active_caller_gate',
      private_platform_residue_gate: {
        residue_kind: 'scheduler',
        disposition: 'no_active_caller_delete',
        bridge_exit_gate: {
          ...baseBridgeExitGate,
          physical_delete_authorized: true,
        },
      },
    },
    {
      module_id: 'sample_brief_queue',
      classification: 'generic_queue_owner',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/queue.ts'],
      active_callers: ['legacy queue replay'],
      active_caller_status: 'raise_to_opl_runway_queue_primitive_required',
      migration_action: 'raise_to_opl_provider_queue',
      private_platform_residue_gate: {
        residue_kind: 'queue',
        disposition: 'absorb_opl_primitive',
        bridge_exit_gate: baseBridgeExitGate,
      },
    },
    {
      module_id: 'sample_brief_authority_helper',
      classification: 'minimal_authority_function',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/authority_functions/decision.ts'],
      active_callers: ['domain handler target'],
      active_caller_status: 'retained_as_domain_authority_function',
      migration_action: 'retain_authority_function_behind_opl_abi',
      private_platform_residue_gate: {
        residue_kind: 'domain_wrapper',
        disposition: 'retain_authority_function',
        bridge_exit_gate: baseBridgeExitGate,
      },
    },
    {
      module_id: 'sample_brief_workbench_shell',
      classification: 'generic_status_workbench_shell',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/workbench-shell.ts'],
      active_callers: [],
      active_caller_status: 'tombstone_after_opl_console_cutover',
      migration_action: 'write_history_tombstone',
      private_platform_residue_gate: {
        residue_kind: 'workbench',
        disposition: 'tombstone',
        bridge_exit_gate: baseBridgeExitGate,
      },
    },
    {
      module_id: 'sample_brief_status_shell',
      classification: 'generic_status_workbench_shell',
      owner: 'SampleBriefAgent',
      code_paths: ['runtime/status-shell.ts'],
      active_callers: ['domain owner status review'],
      active_caller_status: 'owner_typed_blocker_required_before_status_shell_cleanup',
      migration_action: 'return_owner_typed_blocker_or_keep_authority_ref',
      private_platform_residue_gate: {
        residue_kind: 'status_shell',
        disposition: 'owner_typed_blocker',
        bridge_exit_gate: {
          ...baseBridgeExitGate,
          typed_blocker_refs: ['typed-blocker:sample/status-shell-owner-needed'],
        },
      },
    },
  );
  writeJson(functionalAuditPath, functionalAudit);

  const result = runCli([
    'agents',
    'residue-decisions',
    '--agent',
    `sample=${repoDir}`,
  ]);
  assert.deepEqual(Object.keys(result), ['private_platform_residue_owner_decisions']);
  assert.equal(result.physical_delete_authorized, undefined);

  const ledger = result.private_platform_residue_owner_decisions;
  const allowedDecisions = [
    'retain_authority_function',
    'raise_to_opl_primitive',
    'no_active_caller_delete_gate',
    'tombstone_gate',
    'typed_blocker_gate',
  ];
  const items = ledger.reports[0].items;

  assert.equal(
    ledger.contract_ref,
    'contracts/opl-framework/private-platform-residue-owner-decisions.json',
  );
  assert.deepEqual(ledger.allowed_owner_decisions, allowedDecisions);
  assert.equal(ledger.summary.decision_item_count, 5);
  assert.equal(ledger.summary.invalid_owner_decision_count, 0);
  assert.equal(ledger.summary.by_owner_decision.retain_authority_function, 1);
  assert.equal(ledger.summary.by_owner_decision.raise_to_opl_primitive, 1);
  assert.equal(ledger.summary.by_owner_decision.no_active_caller_delete_gate, 1);
  assert.equal(ledger.summary.by_owner_decision.tombstone_gate, 1);
  assert.equal(ledger.summary.by_owner_decision.typed_blocker_gate, 1);
  assert.equal(ledger.physical_delete_authorized, false);
  assert.equal(ledger.authority_boundary.ledger_can_authorize_domain_repo_physical_delete, false);
  assert.equal(items.every((item: { owner_decision: string }) =>
    allowedDecisions.includes(item.owner_decision)
  ), true);
  assert.equal(items.every((item: { physical_delete_authorized: boolean }) =>
    item.physical_delete_authorized === false
  ), true);
  const schedulerItem = items.find((item: { module_id: string }) =>
    item.module_id === 'sample_brief_legacy_scheduler'
  ) as { physical_delete_authorization_status: string } | undefined;
  const statusShellItem = items.find((item: { module_id: string }) =>
    item.module_id === 'sample_brief_status_shell'
  ) as { owner_decision_ref_status: string } | undefined;
  assert.ok(schedulerItem);
  assert.ok(statusShellItem);
  assert.equal(
    schedulerItem.physical_delete_authorization_status,
    'blocked_missing_owner_receipt_or_typed_blocker_ref',
  );
  assert.equal(
    statusShellItem.owner_decision_ref_status,
    'owner_receipt_or_typed_blocker_ref_observed',
  );
});
