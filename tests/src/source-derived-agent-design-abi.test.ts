import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS } from '../../src/modules/foundry-lab/source-derived-agent-design-abi.ts';

test('source-derived design runtime identities match the canonical contract', () => {
  const contract = JSON.parse(fs.readFileSync(
    path.resolve('contracts/opl-framework/source-derived-agent-design-abi.json'),
    'utf8',
  ));
  assert.deepEqual(SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS, contract.typed_objects);
});
