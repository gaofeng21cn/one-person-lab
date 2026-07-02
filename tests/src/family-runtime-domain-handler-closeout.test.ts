import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalCloseoutPacketFromDomainHandlerOutput,
} from '../../src/modules/runway/family-runtime-domain-handler-closeout.ts';

test('domain-handler ordinary closeout accepts only canonical domain_stage_closeout_packet', () => {
  const canonical = {
    closeout_packet: {
      surface_kind: 'domain_stage_closeout_packet',
      closeout_refs: ['receipt:canonical-domain-closeout'],
    },
  };
  const nonDomainTypedPacket = {
    closeout_packet: {
      surface_kind: 'stage_attempt_closeout_packet',
      closeout_refs: ['receipt:stage-attempt-closeout'],
    },
  };
  const legacyMasReceipt = {
    surface_kind: 'mas_family_domain_handler_dispatch_receipt',
    task_id: 'frt_legacy_mas',
    receipt_ref: 'mas-runtime/legacy-dispatch-receipt.json',
    dispatch: {
      result: {
        surface: 'real_paper_autonomy_provider_hosted_guarded_apply_receipt',
        status: 'typed_blocker',
      },
    },
  };

  assert.equal(canonicalCloseoutPacketFromDomainHandlerOutput(canonical), canonical.closeout_packet);
  assert.equal(canonicalCloseoutPacketFromDomainHandlerOutput(nonDomainTypedPacket), null);
  assert.equal(canonicalCloseoutPacketFromDomainHandlerOutput(legacyMasReceipt), null);
});
