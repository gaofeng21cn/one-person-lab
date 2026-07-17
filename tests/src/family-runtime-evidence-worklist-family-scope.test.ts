import assert from 'node:assert/strict';
import test from 'node:test';

import { familyDefaultCallerFallbackDomains } from '../../src/modules/runway/family-runtime-evidence-worklist-parts/default-caller-family-scope.ts';

function familyReport() {
  return {
    agent_default_caller_readiness: {
      reports: [{
        domain_id: 'registry-declared-agent',
        repo_dir: '/workspace/registry-declared-agent',
        status: 'ready_domain_evidence_required',
        deletion_evidence_worklists: [],
        summary: {},
      }],
    },
  };
}

test('default-caller fallback is registry-backed and never supplements an existing projection', () => {
  let readCount = 0;
  const input = {
    familyDefaults: true,
    defaultCallerReadinessReportBuilder: () => {
      readCount += 1;
      return familyReport();
    },
  };

  assert.deepEqual(
    familyDefaultCallerFallbackDomains(input, {}),
    [{
      ref: 'opl://agents/registry-declared-agent/default-caller-deletion-evidence',
      role: 'default_caller_deletion_evidence_domain_refs',
      domain_id: 'registry-declared-agent',
      project_id: 'registry-declared-agent',
      workspace_path: '/workspace/registry-declared-agent',
      status: 'ready_domain_evidence_required',
      source: 'agents_default_callers_family_defaults_repo_projection',
      source_command: 'opl agents default-callers --family-defaults --json',
      generated_interface_status: null,
      active_caller_cutover_proof_status: null,
      active_caller_target_proof_status: null,
      generated_wrapper_bundle_status: null,
      deletion_evidence_worklists: [],
      summary: {
        deletion_evidence_worklist_count: 0,
        ready_domain_evidence_worklist_count: 0,
        open_deletion_evidence_requirement_count: 0,
        missing_domain_owner_receipt_or_typed_blocker_count: 0,
        missing_no_active_caller_proof_count: 0,
        missing_no_forbidden_write_proof_count: 0,
        missing_tombstone_or_provenance_ref_count: 0,
        physical_delete_authorized: false,
        default_caller_delete_ready: false,
      },
    }],
  );
  assert.equal(readCount, 1);

  for (const domains of [
    [],
    [
      { domain_id: 'med-autoscience' },
      { domain_id: 'med-autogrant' },
      { domain_id: 'redcube-ai' },
    ],
  ]) {
    assert.deepEqual(familyDefaultCallerFallbackDomains(input, {
      default_caller_deletion_evidence_refs: { domains },
    }), []);
  }
  assert.equal(readCount, 1);
});
