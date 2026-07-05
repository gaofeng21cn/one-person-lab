import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  materializeFindings,
} from '../../src/modules/workspace/index.ts';

test('workspace diagnostics keep hard blockers fail-closed when policy lists overlap', () => {
  const findings = materializeFindings(
    {
      ...DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
      repairable_finding_codes: [
        ...DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY.repairable_finding_codes,
        'workspace_index_missing',
      ],
    },
    '/tmp/opl-workspace',
    [{
      code: 'workspace_index_missing',
      message: 'workspace_index.json is missing.',
    }],
  );

  assert.equal(findings[0].severity, 'hard_blocker');
  assert.equal(findings[0].default_blocks_execution, true);
  assert.equal(findings[0].repair_command, undefined);
});
