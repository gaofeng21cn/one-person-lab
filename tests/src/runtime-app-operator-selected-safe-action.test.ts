import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDefaultSelectedSafeActions,
  defaultSelectedSafeActionCandidates,
} from '../../src/modules/console/runtime-tray-app-operator-drilldown-parts/selected-safe-action-candidates.ts';

test('default selected safe action excludes unsupported domain-specific action kinds', () => {
  const appReleaseRecord = {
    action_id: 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
    action_kind: 'app_release_user_path_evidence_receipt_record',
    route_status: 'record_route_available',
    can_submit_to_safe_action_shell: true,
  };
  const domainSpecificRecord = {
    action_id: 'domain-specific:record',
    action_kind: 'domain_specific_receipt_record',
    route_status: 'record_route_available',
    can_submit_to_safe_action_shell: true,
  };

  const candidates = defaultSelectedSafeActionCandidates(
    [domainSpecificRecord, appReleaseRecord],
    {},
  ).sort(compareDefaultSelectedSafeActions);

  assert.deepEqual(candidates.map((candidate) => candidate.action_kind), [
    'app_release_user_path_evidence_receipt_record',
  ]);
});
