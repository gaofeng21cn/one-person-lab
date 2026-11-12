import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hydrateContentRefTransport } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/content-ref-transport-hydration.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { qualityArtifactIdentity } from '../../src/adapters/execution/family-runtime-temporal-workflow-artifacts.ts';

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fixture() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-content-refs-'));
  const artifactDir = path.join(workspaceRoot, 'artifacts');
  const contentDir = path.join(artifactDir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  const transported = Buffer.from('# evidence protocol\n');
  const absent = Buffer.from('# never written\n');
  fs.writeFileSync(path.join(contentDir, `${sha256(transported)}.md`), transported);
  const blueprint = {
    surface_kind: 'opl_foundry_agent_blueprint',
    content_refs: [
      { content_ref: `opl-content://sha256/${sha256(transported)}` },
      { content_ref: `opl-content://sha256/${sha256(absent)}` },
    ],
  };
  const blueprintPath = path.join(artifactDir, 'agent-blueprint-final.json');
  fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
  const blueprintRef = pathToFileURL(blueprintPath).href;
  const packet = normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-content',
    stage_run_id: 'sr-content',
    closeout_refs: [{
      ref: blueprintRef,
      ref_kind: 'stage_artifact',
      sha256: sha256(fs.readFileSync(blueprintPath)),
      size_bytes: fs.statSync(blueprintPath).size,
    }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'oma',
    domain_ready_verdict: 'completed',
    route_impact: {
      stage_quality_cycle: {
        artifact_refs: [blueprintRef],
        artifact_hashes: [`sha256:${sha256(fs.readFileSync(blueprintPath))}`],
      },
    },
  });
  return { workspaceRoot, packet, transported, blueprintRef };
}

test('declares the content bytes a blueprint references so transport can carry them', () => {
  const { workspaceRoot, packet, transported } = fixture();
  const hydrated = hydrateContentRefTransport({
    closeoutPacket: packet,
    attempt: { attempt_role: 'producer' },
    workspaceRoot,
  });
  assert.ok(hydrated);
  const cycle = hydrated.route_impact?.stage_quality_cycle as {
    artifact_refs: string[];
    artifact_hashes: string[];
  };
  assert.equal(cycle.artifact_refs.length, 2);
  assert.equal(cycle.artifact_hashes.length, 2);
  const digest = sha256(transported);
  assert.ok(cycle.artifact_hashes.some((hash: string) => hash === `sha256:${digest}`));
  assert.ok(cycle.artifact_refs.some((ref: string) => ref.endsWith(`${digest}.md`)));
  assert.equal(hydrated.closeout_refs.length, 2);
  assert.ok((hydrated.closeout_ref_metadata ?? []).some((entry: Record<string, unknown>) => (
    entry.sha256 === digest
  )));
});

test('leaves the closeout untouched when the referenced bytes are not on disk', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-content-refs-empty-'));
  const blueprintPath = path.join(workspaceRoot, 'blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    surface_kind: 'opl_foundry_agent_blueprint',
    content_refs: [`opl-content://sha256/${sha256(Buffer.from('missing'))}`],
  }));
  const ref = pathToFileURL(blueprintPath).href;
  const packet = normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-content-missing',
    stage_run_id: 'sr-content-missing',
    closeout_refs: [{ ref, ref_kind: 'stage_artifact', sha256: sha256(fs.readFileSync(blueprintPath)), size_bytes: 1 }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'oma',
    domain_ready_verdict: 'completed',
    route_impact: {
      stage_quality_cycle: { artifact_refs: [ref], artifact_hashes: [`sha256:${sha256(fs.readFileSync(blueprintPath))}`] },
    },
  });
  const hydrated = hydrateContentRefTransport({
    closeoutPacket: packet,
    attempt: { attempt_role: 'producer' },
    workspaceRoot,
  });
  assert.ok(hydrated);
  const cycle = hydrated.route_impact?.stage_quality_cycle as { artifact_refs: string[] };
  assert.deepEqual(cycle.artifact_refs, [ref]);
});

test('hydrated content keeps one verified metadata entry after StageAttempt normalization', (t) => {
  const { workspaceRoot, packet } = fixture();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const hydrated = hydrateContentRefTransport({
    closeoutPacket: packet, attempt: { attempt_role: 'producer' }, workspaceRoot,
  })!;
  // The runner transport verifier adds these receipt refs before the packet
  // crosses the Activity wire and StageAttempt normalizes it again.
  hydrated.closeout_ref_metadata = hydrated.closeout_ref_metadata!.map((entry, index) => ({
    ...entry, sha256: `sha256:${entry.sha256}`,
    artifact_identity_receipt_ref: `artifact-identity:verified-${index}`,
  }));
  const roundTrip = normalizeTypedStageCloseoutPacket(JSON.parse(JSON.stringify(hydrated)));
  const cycle = roundTrip.route_impact!.stage_quality_cycle as Record<string, unknown>;
  const identity = qualityArtifactIdentity({
    stage_attempt_id: 'sat-content', closeout_packet: roundTrip,
  } as never, cycle, true, undefined, false, true);
  assert.equal(roundTrip.closeout_ref_metadata!.length, 2);
  assert.deepEqual(identity.artifactIdentityReceiptRefs, [
    'artifact-identity:verified-0', 'artifact-identity:verified-1',
  ]);
});

test('reviewers never gain transported content members', () => {
  const { workspaceRoot, packet } = fixture();
  const hydrated = hydrateContentRefTransport({
    closeoutPacket: packet,
    attempt: { attempt_role: 'reviewer' },
    workspaceRoot,
  });
  assert.ok(hydrated);
  const cycle = hydrated.route_impact?.stage_quality_cycle as { artifact_refs: string[] };
  assert.equal(cycle.artifact_refs.length, 1);
});

test('a Stage report that merely quotes content refs is not treated as a blueprint', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-content-refs-report-'));
  const reportPath = path.join(workspaceRoot, 'design-basis-admission.json');
  const quoted = Buffer.from('# referenced but owned by another Stage\n');
  fs.mkdirSync(path.join(workspaceRoot, 'content'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'content', `${sha256(quoted)}.md`), quoted);
  fs.writeFileSync(reportPath, JSON.stringify({
    surface_kind: 'opl_stage_report',
    planned_content_refs: [`opl-content://sha256/${sha256(quoted)}`],
  }));
  const ref = pathToFileURL(reportPath).href;
  const packet = normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-content-report',
    stage_run_id: 'sr-content-report',
    closeout_refs: [{ ref, ref_kind: 'stage_artifact', sha256: sha256(fs.readFileSync(reportPath)), size_bytes: 1 }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'oma',
    domain_ready_verdict: 'completed',
    route_impact: {
      stage_quality_cycle: { artifact_refs: [ref], artifact_hashes: [`sha256:${sha256(fs.readFileSync(reportPath))}`] },
    },
  });
  const hydrated = hydrateContentRefTransport({
    closeoutPacket: packet,
    attempt: { attempt_role: 'producer' },
    workspaceRoot,
  });
  assert.deepEqual((hydrated as any).route_impact.stage_quality_cycle.artifact_refs, [ref]);
});
