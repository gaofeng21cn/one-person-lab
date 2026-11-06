import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildScaffoldFiles } from '../../src/authority/packages/standard-domain-agent-scaffold-template.ts';
import { compileStandardAgentStageManifest, resolveStandardAgentStageQualityRuntimeBinding } from '../../src/authority/packages/standard-agent-stage-manifest.ts';

test('a newly scaffolded stage action can bind the quality runtime required for hosted input artifacts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of buildScaffoldFiles('novel-hosted-agent', 'Novel Hosted Agent')) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  const compilation = compileStandardAgentStageManifest(root);
  const stage = compilation.stage_control_plane.stages[0];
  const binding = resolveStandardAgentStageQualityRuntimeBinding(root, stage.stage_id);
  assert.ok(binding, 'hosted stage_binding must not reach attempt-create with a null quality runtime');
  assert.equal(binding.enabled, true);
  assert.equal(binding.quality_policy.formal_review.required, false);
});
