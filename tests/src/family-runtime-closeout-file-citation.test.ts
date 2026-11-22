import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const { hydrateReferencedStageAttemptCloseout } = await import(
  '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/referenced-closeout-hydration.ts'
);

// A producer that writes a large closeout packet to the workspace can return a minimal
// packet that cites that file instead of re-emitting 16KB of JSON as its final message.
// This is the supported transport path; the prompt simply never told producers about it,
// so they tried to paste the packet inline and produced no final message at all.
test('a minimal packet citing a workspace packet hydrates the full closeout', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-'));
  const attempt = {
    stage_attempt_id: 'sat_producer_1',
    stage_run_id: 'sr_1',
    stage_id: 'design-basis-admission',
    attempt_role: 'producer',
  };

  const fullPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_producer_1',
    stage_run_id: 'sr_1',
    stage_id: 'design-basis-admission',
    role: 'producer',
    closeout_refs: ['file:///tmp/design-basis.json'],
    route_impact: { stage_route_decision: { decision_kind: 'advance', target_stage_id: 'stage-architecture' } },
    domain_output: {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'agent_engineering',
      output_ref: 'file:///tmp/design-basis.json',
    },
  };
  const packetPath = path.join(workspaceRoot, 'artifacts', 'design-basis-admission-closeout-packet.json');
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(fullPacket, null, 2));
  fs.writeFileSync(packetPath, bytes);

  const minimalPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_producer_1',
    stage_run_id: 'sr_1',
    stage_id: 'design-basis-admission',
    role: 'producer',
    closeout_refs: ['file:///tmp/design-basis.json'],
    closeout_ref_metadata: [{
      kind: 'stage_attempt_closeout_packet',
      ref: `file://${packetPath}`,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      size_bytes: bytes.length,
    }],
  };

  const hydrated = hydrateReferencedStageAttemptCloseout({
    resumedCloseout: minimalPacket as never,
    resumedCandidate: minimalPacket as never,
    attempt,
    workspaceRoot,
  });

  assert.equal(hydrated.status, 'hydrated');
  assert.deepEqual(
    hydrated.closeoutPacket?.route_impact,
    fullPacket.route_impact,
    'the route decision must come from the cited file, not the minimal packet',
  );
});
