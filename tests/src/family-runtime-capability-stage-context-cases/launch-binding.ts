import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createStageAttempt, createStageAttemptTable } from '../../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { persistStageAttemptLaunchBinding } from '../../../src/adapters/execution/family-runtime.ts';
import { createFamilyRuntimeQueueTables } from '../../../src/adapters/execution/family-runtime-store.ts';

export function registerLaunchBindingTest() {
test('StageAttempt launch binding reservation replaces a preliminary observation once', () => {
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  try {
    const preliminaryBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:preliminary',
      root_package: { package_id: 'mas', content_digest: 'sha256:preliminary' },
    };
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/attempt-binding-reservation',
        domain_pack_root: '/tmp/generation-preliminary',
        package_use_binding: preliminaryBinding,
      },
    }).attempt;
    const firstBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:first',
      root_package: { package_id: 'mas', content_digest: 'sha256:first' },
    };
    const laterBinding = {
      surface_kind: 'opl_agent_package_use_binding.v1',
      use_boundary_id: 'package-use:later',
      root_package: { package_id: 'mas', content_digest: 'sha256:later' },
    };
    const reserved = persistStageAttemptLaunchBinding(db, attempt, {
      workspaceLocator: {
        ...attempt.workspace_locator,
        domain_pack_root: '/tmp/generation-first',
        package_use_binding: firstBinding,
      },
      packageUseBinding: firstBinding,
      domainPackRoot: '/tmp/generation-first',
    });
    const replay = persistStageAttemptLaunchBinding(db, attempt, {
      workspaceLocator: {
        ...attempt.workspace_locator,
        domain_pack_root: '/tmp/generation-later',
        package_use_binding: laterBinding,
      },
      packageUseBinding: laterBinding,
      domainPackRoot: '/tmp/generation-later',
    });

    assert.notDeepEqual(reserved.workspace_locator.package_use_binding, preliminaryBinding);
    assert.deepEqual(reserved.workspace_locator.package_use_binding, firstBinding);
    assert.equal(
      (reserved.provider_run.execution_package_use_context as { status: string }).status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(replay.workspace_locator, reserved.workspace_locator);
    assert.deepEqual(
      replay.provider_run.execution_package_use_context,
      reserved.provider_run.execution_package_use_context,
    );
  } finally {
    db.close();
  }
});
}
