import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { hydrateReferencedStageAttemptCloseout } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/referenced-closeout-hydration.ts';

test('verified outer closeout ref supplies omitted inner refs without replacing domain fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-outer-closeout-'));
  try {
    const file = path.join(root, 'closeout.json');
    const ref = pathToFileURL(file).href;
    const packet = { surface_kind: 'stage_attempt_closeout_packet', stage_attempt_id: 'sat_outer',
      route_impact: { stage_quality_cycle: { outcome: 'quality_debt', optional_observations: [] } } };
    function input(value: unknown) {
      const bytes = JSON.stringify(value);
      fs.writeFileSync(file, bytes);
      const pointer = { surface_kind: 'stage_attempt_closeout_packet', stage_attempt_id: 'sat_outer',
        closeout_refs: [ref], closeout_ref_metadata: [{ kind: 'stage_attempt_closeout_packet', ref,
          sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, size_bytes: Buffer.byteLength(bytes) }] };
      return { resumedCandidate: pointer, resumedCloseout: normalizeTypedStageCloseoutPacket(pointer),
        attempt: { stage_attempt_id: 'sat_outer' }, workspaceRoot: root };
    }
    const valid = input(packet);
    const result = hydrateReferencedStageAttemptCloseout(valid);
    assert.equal(result.status, 'hydrated');
    assert.deepEqual(result.closeoutPacket?.closeout_refs, [ref]);
    assert.deepEqual(result.closeoutPacket?.route_impact, packet.route_impact);
    fs.appendFileSync(file, ' ');
    assert.throws(() => hydrateReferencedStageAttemptCloseout(valid));
    assert.throws(() => hydrateReferencedStageAttemptCloseout(input({ ...packet, stage_attempt_id: 'sat_other' })));
    assert.throws(() => hydrateReferencedStageAttemptCloseout(input({ ...packet, closeout_refs: [] })));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
