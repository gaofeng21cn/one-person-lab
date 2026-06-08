import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDefaultSelectedSafeActions,
  defaultSelectedSafeActionCandidates,
} from '../../src/runtime-tray-app-operator-drilldown-parts/selected-safe-action-candidates.ts';

test('default selected safe action keeps App release user path ahead of OMA production consumption', () => {
  const appReleaseRecord = {
    action_id: 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
    action_kind: 'app_release_user_path_evidence_receipt_record',
    route_status: 'record_route_available',
    can_submit_to_safe_action_shell: true,
  };
  const omaProductionConsumptionRecord = {
    action_id: 'oma_production_consumption:opl-meta-agent:record',
    action_kind: 'oma_production_consumption_receipt_record',
    route_status: 'record_route_available',
    can_submit_to_safe_action_shell: true,
  };

  const candidates = defaultSelectedSafeActionCandidates(
    [omaProductionConsumptionRecord, appReleaseRecord],
    {},
  ).sort(compareDefaultSelectedSafeActions);

  assert.deepEqual(candidates.map((candidate) => candidate.action_kind), [
    'app_release_user_path_evidence_receipt_record',
    'oma_production_consumption_receipt_record',
  ]);
});
