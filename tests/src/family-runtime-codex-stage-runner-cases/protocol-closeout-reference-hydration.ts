import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { normalizeTypedStageCloseoutPacket } from '../../../src/modules/runway/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import {
  hydrateReferencedStageAttemptCloseout,
  resolveProtocolCloseoutResumePacket,
} from '../../../src/modules/runway/family-runtime-codex-stage-runner-parts/referenced-closeout-hydration.ts';
import { compactCloseoutPacketForTemporalResult } from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import { createFakeCodexFixture } from '../cli/helpers.ts';
import { runPublicCodexStageRunner } from '../family-runtime-codex-stage-runner-helpers.ts';

function sha256(bytes: Buffer | string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function writeJson(filePath: string, value: unknown) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return bytes;
}

function attempt(workspaceRoot: string) {
  return {
    stage_attempt_id: 'sat-referenced-closeout-hydration',
    stage_run_id: 'sr-referenced-closeout-hydration',
    quality_cycle_id: 'quality-cycle:sr-referenced-closeout-hydration',
    attempt_role: 'producer',
    quality_round_index: 0,
    stage_id: 'bounded_analysis_campaign',
    domain_id: 'medautoscience',
    workspace_locator: { workspace_root: workspaceRoot },
    checkpoint_refs: ['packet:bounded-analysis'],
  };
}

function resumedReference(input: {
  attemptId: string;
  ref: string;
  sha256: string;
  sizeBytes?: number;
  routeImpact?: Record<string, unknown>;
}) {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: input.attemptId,
    closeout_refs: [input.ref],
    closeout_ref_metadata: [{
      kind: 'stage_attempt_closeout_packet',
      ref: input.ref,
      sha256: input.sha256,
      ...(input.sizeBytes === undefined ? {} : { size_bytes: input.sizeBytes }),
    }],
    ...(input.routeImpact ? { route_impact: input.routeImpact } : {}),
  };
}

test('protocol closeout resume hydrates one exact local packet and preserves reviewer scheduling inputs', async () => {
  const fixture = createFakeCodexFixture('exit 64');
  const runAttempt = attempt(fixture.fixtureRoot);
  const artifactRoot = path.join(fixture.fixtureRoot, 'artifacts');
  const resultPath = path.join(artifactRoot, 'bounded-result.json');
  const requestPath = path.join(artifactRoot, 'review-request.json');
  const resultBytes = writeJson(resultPath, { estimate: 0.734, status: 'current' });
  const requestBytes = writeJson(requestPath, {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    producer_attempt_ref: `opl://stage_attempts/${runAttempt.stage_attempt_id}`,
  });
  const resultRef = pathToFileURL(resultPath).href;
  const requestRef = pathToFileURL(requestPath).href;
  const closeoutPath = path.join(artifactRoot, 'stage-attempt-closeout.json');
  const routeImpact = {
    stage_quality_cycle: {
      artifact_refs: [resultRef, requestRef],
      artifact_hashes: [sha256(resultBytes), sha256(requestBytes)],
      review_input_snapshot_materialization_request: {
        surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
        producer_attempt_ref: `opl://stage_attempts/${runAttempt.stage_attempt_id}`,
      },
    },
    stage_route_recommendation: {
      decision_kind: 'advance',
      target_stage_id: 'manuscript_authoring',
      evidence_refs: [resultRef, requestRef],
      reason: 'Advance only after formal independent Review.',
    },
  };
  const closeoutBytes = writeJson(closeoutPath, {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: runAttempt.stage_attempt_id,
    stage_run_id: runAttempt.stage_run_id,
    quality_cycle_id: runAttempt.quality_cycle_id,
    attempt_role: runAttempt.attempt_role,
    stage_id: runAttempt.stage_id,
    closeout_ref_metadata: [
      {
        kind: 'bounded_analysis_result',
        ref: resultRef,
        sha256: sha256(resultBytes),
        size_bytes: resultBytes.length,
      },
      {
        kind: 'review_input_snapshot_materialization_request',
        ref: requestRef,
        sha256: sha256(requestBytes),
        size_bytes: requestBytes.length,
      },
    ],
    route_impact: routeImpact,
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  });
  const closeoutRef = pathToFileURL(closeoutPath).href;
  const resume = resumedReference({
    attemptId: runAttempt.stage_attempt_id,
    ref: closeoutRef,
    sha256: sha256(closeoutBytes),
    sizeBytes: closeoutBytes.length,
  });
  const initialEvent = JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      id: 'initial-prose',
      text: `Bounded analysis is ready. Complete closeout: ${closeoutRef}`,
    },
  });
  const resumeEvent = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'resume-closeout', text: JSON.stringify(resume) },
  });
  fs.writeFileSync(fixture.codexPath, `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "exec" ] && [ "${'${2:-}'}" = "resume" ]; then
  printf '{"type":"thread.started","thread_id":"thread-reference-hydration"}\\n'
  printf "%s\\n" ${JSON.stringify(resumeEvent)}
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-reference-hydration"}\\n'
  printf "%s\\n" ${JSON.stringify(initialEvent)}
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
exit 64
`, { mode: 0o755 });

  const previousBin = process.env.OPL_CODEX_BIN;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  try {
    process.env.OPL_CODEX_BIN = fixture.codexPath;
    process.env.OPL_STATE_DIR = path.join(fixture.fixtureRoot, 'opl-state');
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: runAttempt,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    const protocol = receipt.process_output_summary?.protocol_closeout_resume as Record<string, any>;
    assert.equal(protocol.status, 'completed');
    assert.equal(protocol.initial_route_impact_candidate_observed, false);
    assert.equal(protocol.initial_route_impact_preserved, true);
    assert.equal(protocol.referenced_closeout_hydration_status, 'hydrated');
    assert.deepEqual(protocol.referenced_closeout_observation, {
      ref: closeoutRef,
      sha256: sha256(closeoutBytes),
      size_bytes: closeoutBytes.length,
    });
    const transportedStageQuality = {
      ...routeImpact.stage_quality_cycle,
      artifact_hashes: routeImpact.stage_quality_cycle.artifact_hashes.map(
        (digest) => digest.slice('sha256:'.length),
      ),
    };
    assert.deepEqual(
      receipt.closeout_packet?.route_impact?.stage_quality_cycle,
      transportedStageQuality,
    );
    assert.deepEqual(
      receipt.closeout_packet?.route_impact?.stage_route_recommendation,
      routeImpact.stage_route_recommendation,
    );
    assert.ok(receipt.closeout_packet?.closeout_refs.includes(closeoutRef));
    const artifactMetadata = receipt.closeout_packet?.closeout_ref_metadata?.filter(
      (entry) => entry.ref === resultRef || entry.ref === requestRef,
    ) ?? [];
    assert.equal(artifactMetadata.length, 2);
    assert.ok(artifactMetadata.every((entry) => typeof entry.artifact_identity_receipt_ref === 'string'));

    const compacted = compactCloseoutPacketForTemporalResult(receipt.closeout_packet);
    assert.deepEqual(compacted?.route_impact?.stage_quality_cycle, transportedStageQuality);
    assert.equal(compacted?.closeout_ref_metadata?.length, 3);
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS', previousRecoveryTimeout);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS', previousRecoveryInterval);
    fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('referenced closeout hydration fails closed on digest, size, workspace, and route conflicts', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-hydration-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const runAttempt = attempt(workspaceRoot);
  const closeoutPath = path.join(workspaceRoot, 'closeout.json');
  const closeoutRoute = { stage_quality_cycle: { artifact_refs: ['artifact:one'], artifact_hashes: ['sha256:one'] } };
  const closeoutBytes = writeJson(closeoutPath, {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: runAttempt.stage_attempt_id,
    closeout_refs: ['artifact:one'],
    route_impact: closeoutRoute,
  });
  const closeoutRef = pathToFileURL(closeoutPath).href;
  const hydrate = (resume: ReturnType<typeof resumedReference>, root = workspaceRoot) =>
    hydrateReferencedStageAttemptCloseout({
      resumedCloseout: normalizeTypedStageCloseoutPacket(resume),
      resumedCandidate: resume,
      attempt: runAttempt,
      workspaceRoot: root,
    });
  const expectedFailure = (blockedReason: string) => (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.blocked_reason, blockedReason);
    return true;
  };

  try {
    assert.throws(() => hydrate(resumedReference({
      attemptId: runAttempt.stage_attempt_id,
      ref: closeoutRef,
      sha256: `sha256:${'0'.repeat(64)}`,
      sizeBytes: closeoutBytes.length,
    })), expectedFailure('referenced_closeout_sha256_mismatch'));

    assert.throws(() => hydrate(resumedReference({
      attemptId: runAttempt.stage_attempt_id,
      ref: closeoutRef,
      sha256: sha256(closeoutBytes),
      sizeBytes: closeoutBytes.length + 1,
    })), expectedFailure('referenced_closeout_size_mismatch'));

    assert.throws(() => hydrate(resumedReference({
      attemptId: runAttempt.stage_attempt_id,
      ref: pathToFileURL(path.join(fixtureRoot, 'outside.json')).href,
      sha256: sha256(writeJson(path.join(fixtureRoot, 'outside.json'), { outside: true })),
    })), expectedFailure('referenced_closeout_ref_outside_workspace'));

    assert.throws(() => hydrate(resumedReference({
      attemptId: runAttempt.stage_attempt_id,
      ref: closeoutRef,
      sha256: sha256(closeoutBytes),
      sizeBytes: closeoutBytes.length,
      routeImpact: { stage_quality_cycle: { artifact_refs: ['artifact:other'] } },
    })), expectedFailure('referenced_closeout_packet_conflict'));

    const referenceOnlyResume = resumedReference({
      attemptId: runAttempt.stage_attempt_id,
      ref: closeoutRef,
      sha256: sha256(closeoutBytes),
      sizeBytes: closeoutBytes.length,
    });
    assert.throws(() => resolveProtocolCloseoutResumePacket({
      initialCandidate: {
        surface_kind: 'opl_stage_attempt_closeout',
        stage_attempt_id: runAttempt.stage_attempt_id,
        route_impact: { stage_quality_cycle: { artifact_refs: ['artifact:initial'] } },
      },
      resumedCandidate: referenceOnlyResume,
      resumedCloseout: normalizeTypedStageCloseoutPacket(referenceOnlyResume),
      attempt: runAttempt,
      workspaceRoot,
      protocolViolation: false,
    }), expectedFailure('referenced_closeout_packet_conflict'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
