import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveStageRunDefaultProgression } from '../../src/adapters/execution/family-runtime-stage-run-default-progression.ts';
import { action, writeContracts } from './standard-agent-action-runtime-shared.ts';

function fixture(t: test.TestContext, options: {
  stages?: Array<Record<string, unknown>>;
  domainId?: string;
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-default-progression-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: options.domainId ?? 'medautoscience',
    owner: options.domainId ?? 'medautoscience',
    stages: options.stages ?? [
      { stage_id: 'evaluation', next_stage_refs: [] },
      { stage_id: 'intake', next_stage_refs: ['design'] },
      { stage_id: 'design', next_stage_refs: ['evaluation'] },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  fs.mkdirSync(path.join(root, 'agent/stages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent/stages/manifest.json'), bytes);
  const input = {
    domainPackRoot: root,
    domainId: 'medautoscience',
    stageId: 'intake',
    manifestRef: 'agent/stages/manifest.json',
    manifestSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    declaredStageIds: manifest.stages.map((stage) => String(stage.stage_id)).sort(),
  };
  return { root, input };
}

function writeRoute(root: string, required: string[], terminal: string[]) {
  writeContracts(root, [action({
    actionId: 'design-agent',
    executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
    stageRoute: {
      entry_stage_ref: required[0],
      required_stage_refs: required,
      optional_stage_refs: [],
      terminal_stage_refs: terminal,
      route_policy: 'ai_selected_progress_route',
    },
  })]);
}

test('unique declared successor wins over manifest and canonical catalog order', (t) => {
  const { input } = fixture(t);
  assert.deepEqual(resolveStageRunDefaultProgression(input), {
    decision_kind: 'advance', target_stage_id: 'design',
    source_ref: 'agent/stages/manifest.json#stage=intake',
    source_sha256: `sha256:${input.manifestSha256}`,
  });
});

test('ambiguous successors and a missing current Stage never choose by file order', (t) => {
  const { input } = fixture(t, { stages: [
    { stage_id: 'intake', next_stage_refs: ['design', 'evaluation'] },
    { stage_id: 'design', next_stage_refs: [] },
    { stage_id: 'evaluation', next_stage_refs: [] },
  ] });
  assert.equal(resolveStageRunDefaultProgression(input), null);
  assert.equal(resolveStageRunDefaultProgression({ ...input, stageId: 'absent' }), null);
});

test('a successor outside the declared execution catalog is rejected', (t) => {
  const { input } = fixture(t, { stages: [{ stage_id: 'intake', next_stage_refs: ['foreign'] }] });
  assert.throws(() => resolveStageRunDefaultProgression(input), /successor is not declared/);
});

test('manifest byte drift cannot authorize fallback from a different bound package', (t) => {
  const { root, input } = fixture(t);
  fs.appendFileSync(path.join(root, input.manifestRef), '\n');
  assert.throws(() => resolveStageRunDefaultProgression(input), /does not match the execution content binding/);
});

test('a foreign domain and duplicate Stage identities are rejected', (t) => {
  const foreign = fixture(t, { domainId: 'foreign' });
  assert.throws(() => resolveStageRunDefaultProgression(foreign.input), /manifest identity is invalid/);
  const duplicate = fixture(t, { stages: [
    { stage_id: 'intake', next_stage_refs: ['design'] },
    { stage_id: 'intake', next_stage_refs: ['design'] },
    { stage_id: 'design', next_stage_refs: [] },
  ] });
  assert.throws(() => resolveStageRunDefaultProgression(duplicate.input), /catalog does not match/);
});

test('ordered action progression takes precedence over a conflicting unique Stage successor', (t) => {
  const { root, input } = fixture(t);
  writeRoute(root, ['intake', 'evaluation', 'design'], ['design']);
  const resolved = resolveStageRunDefaultProgression({ ...input, actionId: 'design-agent' });
  assert.equal(resolved?.target_stage_id, 'evaluation');
  assert.equal(resolved?.source_ref, 'contracts/action_catalog.json#action=design-agent');
  const catalogBytes = fs.readFileSync(path.join(root, 'contracts/action_catalog.json'));
  assert.equal(resolved?.source_sha256, `sha256:${crypto.createHash('sha256').update(catalogBytes).digest('hex')}`);
});

test('only an explicitly terminal last action Stage resolves complete', (t) => {
  const { root, input } = fixture(t);
  assert.equal(resolveStageRunDefaultProgression({ ...input, stageId: 'evaluation' }), null);
  writeRoute(root, ['intake', 'design', 'evaluation'], ['evaluation']);
  assert.equal(resolveStageRunDefaultProgression({ ...input, actionId: 'design-agent', stageId: 'evaluation' })?.decision_kind, 'complete');
  writeRoute(root, ['intake', 'design', 'evaluation'], ['design']);
  assert.equal(resolveStageRunDefaultProgression({ ...input, actionId: 'design-agent', stageId: 'evaluation' }), null);
});

test('missing action, absent current action membership and undeclared action target cannot fall through', (t) => {
  const { root, input } = fixture(t);
  writeRoute(root, ['design', 'evaluation'], ['evaluation']);
  assert.equal(resolveStageRunDefaultProgression({ ...input, actionId: 'missing' }), null);
  assert.equal(resolveStageRunDefaultProgression({ ...input, actionId: 'design-agent' }), null);
  writeRoute(root, ['intake', 'foreign'], ['foreign']);
  assert.throws(() => resolveStageRunDefaultProgression({ ...input, actionId: 'design-agent' }), /undeclared Stage/);
});
