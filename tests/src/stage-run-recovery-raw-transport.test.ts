import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { parseRawOutputForCloseoutRecovery } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery.ts';

test('recovery does not promote persisted raw transport into domain evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-raw-recovery-'));
  try {
    const rawPath = path.join(root, 'raw-executor-output.txt');
    const rawRef = pathToFileURL(rawPath).href;
    fs.writeFileSync(rawPath, 'Package repair progress only.');
    const packet = {
      surface_kind: 'stage_attempt_closeout_packet',
      stage_attempt_id: 'sat_raw_repairer',
      closeout_refs: [rawRef],
      closeout_ref_metadata: [{ ref: rawRef, ref_kind: 'raw_executor_output', sha256: '1'.repeat(64) }],
      authority_boundary: { opl: 'temporal_closeout_transport_projection_only', domain: 'truth_quality_artifact_gate_owner' },
    };
    const input = {
      attempt: { stage_attempt_id: 'sat_raw_repairer', domain_id: 'example', execution_scope: { workspace_root: root } },
      latestCloseoutPacket: packet,
    };
    for (const raw of ['Package repair progress only.', JSON.stringify(packet)]) {
      fs.writeFileSync(rawPath, raw);
      assert.throws(() => parseRawOutputForCloseoutRecovery(rawRef, input), (error: any) => {
        assert.equal(error.details.failure_code, 'stage_run_recovery_domain_closeout_required');
        assert.equal(error.details.next_owner, 'example');
        assert.equal(error.details.raw_artifact_is_domain_evidence, false);
        return true;
      });
    }
    const domainPacket = { ...packet, closeout_refs: ['artifact:domain-result'], closeout_ref_metadata: [] };
    fs.writeFileSync(rawPath, JSON.stringify(domainPacket));
    assert.deepEqual(parseRawOutputForCloseoutRecovery(rawRef, input).closeout_refs, ['artifact:domain-result']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
