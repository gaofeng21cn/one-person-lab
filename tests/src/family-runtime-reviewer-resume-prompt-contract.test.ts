import test from 'node:test';
import assert from 'node:assert/strict';
import { protocolCloseoutResumePrompt } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';

test('reviewer resume prompt requires the stage_quality_cycle outcome envelope', () => {
  const prompt = protocolCloseoutResumePrompt({
    stage_attempt_id: 'sat-review-resume',
    stage_id: 'agent-blueprint-authoring',
    attempt_role: 'reviewer',
  });
  assert.match(prompt, /route_impact\.stage_quality_cycle with outcome/);
  assert.match(prompt, /pass, repair_required, quality_debt, blocked, human_gate/);
  assert.match(prompt, /outcome=blocked/);
});

test('re_reviewer resume prompt requires the stage_quality_cycle outcome envelope', () => {
  const prompt = protocolCloseoutResumePrompt({
    stage_attempt_id: 'sat-rereview-resume',
    stage_id: 'agent-blueprint-authoring',
    attempt_role: 're_reviewer',
  });
  assert.match(prompt, /route_impact\.stage_quality_cycle with outcome/);
});

test('producer resume prompt must not demand the reviewer outcome envelope', () => {
  const prompt = protocolCloseoutResumePrompt({
    stage_attempt_id: 'sat-producer-resume',
    stage_id: 'design-basis-admission',
    attempt_role: 'producer',
  });
  assert.doesNotMatch(prompt, /route_impact\.stage_quality_cycle with outcome/);
});
