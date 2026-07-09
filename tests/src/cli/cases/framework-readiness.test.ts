import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { assertCurrentOwnerDeltaToplineNextAction } from './owner-payload-workorder-assertions.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('framework readiness emits attention-first summary without readiness authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-state-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-family-'));
  try {
    const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
    }).framework_readiness;

    assert.equal(readiness.surface_kind, 'opl_framework_readiness_summary');
    assert.equal(readiness.family_defaults, true);
    assert.equal(readiness.projection_detail_policy, 'attention_first_kernel_floor_default_with_drilldown_refs');
    assert.equal(readiness.readiness_model.ai_executor_internal_strategy_is_contract, false);
    assert.equal(readiness.authority_boundary.can_claim_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_claim_production_ready, false);
    assertCurrentOwnerDeltaToplineNextAction(readiness);
    assert.equal(
      readiness.attention_first_payload.summary.hard_blocker_count,
      readiness.summary.framework_kernel_hard_blocker_count,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});
