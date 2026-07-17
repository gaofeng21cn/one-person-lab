import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FOUNDRY_AGENT_SERIES_CONTRACT_REF,
  STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
  canonicalFoundryAgentSeriesPolicy,
} from '../../src/modules/pack/public/foundry-agent-series-policy.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (ref: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, ref), 'utf8'));

test('Foundry series policy consumer projects canonical contracts without changing authority', () => {
  const policy = canonicalFoundryAgentSeriesPolicy();
  const series = readJson(FOUNDRY_AGENT_SERIES_CONTRACT_REF);
  const scaffold = readJson(STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF).new_agent_scaffold;

  assert.deepEqual(policy.shared_policy_release, series.shared_policy_release);
  assert.deepEqual(policy.agent_membership_projection_policy, series.agent_membership_projection_policy);
  assert.deepEqual(policy.standard_public_projection_policy, series.standard_public_projection_policy);
  assert.deepEqual(policy.series_design_profile, series.series_design_profile);
  assert.deepEqual(policy.workspace_topology_profile, series.workspace_topology_profile);
  assert.deepEqual(policy.user_stage_log_contract, scaffold.user_stage_log_contract);
  assert.deepEqual(policy.stage_progress_delta_policy, scaffold.progress_delta_policy);
  assert.deepEqual(policy.typed_blocker_lineage_policy, scaffold.typed_blocker_lineage_policy);
  assert.deepEqual(policy.stage_completion_policy, scaffold.stage_completion_policy);
  assert.deepEqual(policy.forbidden_generic_owner_roles, scaffold.forbidden_domain_generic_owner_roles);
  assert.equal(
    (policy.stage_completion_policy.authority_boundary as Record<string, boolean>).opl_can_decide_domain_completion,
    false,
  );
  assert.equal(
    (policy.series_design_profile.authority_invariants as Record<string, boolean>).opl_can_write_domain_truth,
    false,
  );
});
