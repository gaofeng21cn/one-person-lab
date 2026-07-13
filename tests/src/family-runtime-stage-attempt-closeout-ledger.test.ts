import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttempts,
  listStageAttemptCloseouts,
  queryStageAttempt,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { setStageAttemptArchived } from '../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';

function withAttempt(fn: (db: DatabaseSync, attemptId: string) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const attempt = createStageAttempt(db, {
      domainId: 'redcube', stageId: 'artifact_handoff', providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: 'sha256:handoff',
    }).attempt;
    fn(db, attempt.stage_attempt_id);
  } finally {
    db.close();
  }
}

function closeoutPacket(closeoutRef = 'receipt:artifact-handoff') {
  return {
    surface_kind: 'stage_attempt_closeout_packet', closeout_id: 'closeout:artifact-handoff',
    closeout_refs: [closeoutRef], consumed_refs: ['evidence:handoff-ledger'],
    next_owner: 'redcube', domain_ready_verdict: 'domain_gate_pending',
  };
}

test('stage attempt closeout replay is idempotent and conflicting receipts fail closed', () => {
  withAttempt((db, attemptId) => {
    const accepted = ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet: closeoutPacket() });
    const replay = ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet: closeoutPacket() });

    assert.equal(accepted.closeout.idempotent_noop, false);
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
    assert.throws(
      () => ingestStageAttemptCloseout(db,
        { stageAttemptId: attemptId, packet: closeoutPacket('receipt:conflicting') }),
      (error) => error instanceof FrameworkContractError
        && error.details?.receipt_conflict instanceof Object
        && (error.details.receipt_conflict as Record<string, unknown>).fail_closed === true,
    );
    assert.deepEqual(inspectStageAttempt(db, attemptId).closeout_refs, ['receipt:artifact-handoff']);
  });
});

test('terminal stage attempts can be archived without deleting their audit record', () => {
  withAttempt((db, attemptId) => {
    db.prepare("UPDATE stage_attempts SET status = 'failed' WHERE stage_attempt_id = ?").run(attemptId);

    const archived = setStageAttemptArchived(db, {
      stageAttemptId: attemptId,
      archived: true,
      reason: 'no longer needed',
      source: 'test',
    });

    assert.equal(archived.archived, true);
    assert.equal(archived.archived_reason, 'no longer needed');
    assert.equal(listStageAttempts(db).length, 0);
    assert.equal(listStageAttempts(db, { archived: 'only' })[0]?.stage_attempt_id, attemptId);
    assert.equal(inspectStageAttempt(db, attemptId).stage_attempt_id, attemptId);

    const restored = setStageAttemptArchived(db, {
      stageAttemptId: attemptId,
      archived: false,
      reason: 'restore',
      source: 'test',
    });
    assert.equal(restored.archived, false);
    assert.equal(listStageAttempts(db)[0]?.stage_attempt_id, attemptId);
  });
});

test('stage attempt closeout replay repairs a persisted attempt missing closeout refs', () => {
  withAttempt((db, attemptId) => {
    ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet: closeoutPacket() });
    db.prepare("UPDATE stage_attempts SET closeout_refs_json = '[]' WHERE stage_attempt_id = ?").run(attemptId);

    const replay = ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet: closeoutPacket() });

    assert.equal(replay.closeout.idempotent_noop, true);
    assert.deepEqual(replay.attempt.closeout_refs, ['receipt:artifact-handoff']);
    assert.equal(replay.attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
  });
});

test('stage attempt closeout replay backfills token usage projection', () => {
  withAttempt((db, attemptId) => {
    const packet = closeoutPacket('receipt:artifact-token-backfill');
    ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet });

    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet,
      costSummary: {
        cost_status: 'observed',
        usage_ref: 'codex_session_usage:backfill#sha256:usage',
        token_usage: { input_tokens: 300, output_tokens: 90, total_tokens: 390 },
      },
    });

    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal((replay.attempt.provider_run.cost_summary as { token_usage: { total_tokens: number } }).token_usage.total_tokens, 390);
    assert.equal(replay.attempt.usage_projection.telemetry_status, 'observed');
    assert.equal(replay.attempt.usage_projection.token.total_tokens_observed, 390);
  });
});

test('stage attempt closeout preserves OPL-selected action route and ignores forged selection fields', () => {
  const db = new DatabaseSync(':memory:');
  const selectedRoute = {
    entry_stage_ref: 'intent-intake',
    required_stage_refs: ['intent-intake', 'build'],
    optional_stage_refs: [],
    terminal_stage_refs: ['build'],
    route_policy: 'ai_selected_progress_route',
  };
  try {
    createStageAttemptTable(db);
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'intent-intake',
      actionId: 'build-agent-baseline',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: 'sha256:selected-route',
      routeImpact: {
        selected_action_id: 'build-agent-baseline',
        selected_stage_route: selectedRoute,
      },
    }).attempt;

    const accepted = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: closeoutPacket('receipt:selected-route'),
    }).attempt;
    assert.equal(accepted.route_impact.selected_action_id, 'build-agent-baseline');
    assert.deepEqual(accepted.route_impact.selected_stage_route, selectedRoute);

    const forged = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        ...closeoutPacket('receipt:forged-route'),
        closeout_id: 'closeout:forged-route',
        route_impact: {
          selected_action_id: 'forged-action',
          selected_stage_route: { entry_stage_ref: 'forged-stage' },
          domain_progress: 'observed',
        },
      },
    }).attempt;
    assert.equal(forged.route_impact.selected_action_id, 'build-agent-baseline');
    assert.deepEqual(forged.route_impact.selected_stage_route, selectedRoute);
    assert.equal(forged.route_impact.domain_progress, 'observed');
  } finally {
    db.close();
  }
});

test('stage attempt closeout rejects non-refs-only object metadata without ledger writes', () => {
  withAttempt((db, attemptId) => {
    for (const metadata of [
      { payload: { artifact_body: 'must-not-enter-ledger' } },
      { label: 'unknown-field' },
      { sha256: ['sha256:nested-array'] },
      { size_bytes: -1 },
    ]) {
      assert.throws(
        () => ingestStageAttemptCloseout(db, {
          stageAttemptId: attemptId,
          packet: {
            ...closeoutPacket(),
            closeout_refs: [{
              ...metadata,
              ref_kind: 'stage_attempt_closeout_packet_ref',
              uri: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
            }],
          },
        }),
        (error) => error instanceof FrameworkContractError
          && /unsupported field or value/.test(error.message),
      );
    }

    const query = queryStageAttempt(db, attemptId).stage_attempt_query;
    assert.deepEqual(query.closeouts, []);
    assert.deepEqual(query.attempt.closeout_refs, []);
    assert.equal(query.attempt.closeout_receipt_status, null);
  });
});

test('stage attempt closeout rejects string entries in explicit ref metadata', () => {
  const injectedRef = 'file:///tmp/redcube-runtime/injected-output.json';
  const cases = [
    {
      name: 'metadata_string_ref',
      packet: {
        ...closeoutPacket(),
        closeout_ref_metadata: [injectedRef],
      },
    },
    {
      name: 'domain_output_metadata_string_binding',
      packet: {
        ...closeoutPacket(),
        closeout_ref_metadata: [injectedRef],
        domain_output: {
          surface_kind: 'domain_owned_stage_output_ref',
          version: 'domain-owned-stage-output-ref.v1',
          domain_id: 'redcube',
          output_ref: injectedRef,
        },
      },
    },
  ];
  const acceptedCases = cases.flatMap(({ name, packet }) => {
    try {
      normalizeTypedStageCloseoutPacket(packet);
      return [name];
    } catch (error) {
      assert.match(String(error), /closeout_ref_metadata must contain refs-only metadata objects/);
      return [];
    }
  });

  assert.deepEqual(acceptedCases, []);
});

test('stage attempt closeout preserves canonical object-ref metadata through query', () => {
  withAttempt((db, attemptId) => {
    const ref = {
      ref_kind: 'stage_attempt_closeout_packet_ref',
      uri: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
      sha256: 'sha256:closeout',
      size_bytes: 2048,
    };
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: {
        ...closeoutPacket(),
        closeout_refs: [ref],
      },
    });

    assert.deepEqual(
      queryStageAttempt(db, attemptId).stage_attempt_query.closeouts[0].packet.closeout_ref_metadata,
      [{ ...ref, ref: ref.uri }],
    );
  });
});

test('stage attempt closeout rejects inline domain output bodies before ledger writes', () => {
  withAttempt((db, attemptId) => {
    const outputRef = 'file:///tmp/redcube-runtime/artifacts/closeout.json';
    const packet = {
      ...closeoutPacket(),
      closeout_refs: ['receipt:artifact-handoff', outputRef],
      domain_output: {
        surface_kind: 'domain_owned_stage_output_ref',
        version: 'domain-owned-stage-output-ref.v1',
        domain_id: 'redcube',
        output_ref: outputRef,
        owner_verdict: 'forged-ready',
        payload: { artifact_body: 'must-not-enter-ledger' },
      },
    };

    for (const run of [
      () => normalizeTypedStageCloseoutPacket(packet),
      () => ingestStageAttemptCloseout(db, { stageAttemptId: attemptId, packet }),
    ]) {
      assert.throws(
        run,
        (error) => error instanceof FrameworkContractError
          && /domain_output contains unsupported fields/.test(error.message),
      );
    }
    const query = queryStageAttempt(db, attemptId).stage_attempt_query;
    assert.deepEqual(query.closeouts, []);
    assert.deepEqual(query.attempt.closeout_refs, []);
  });
});
