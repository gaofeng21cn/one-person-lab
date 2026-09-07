import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readStandardAgentQualityRolePromptFile,
} from '../../src/authority/packages/standard-agent-stage-prompt.ts';
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import contract from '../../contracts/opl-framework/stage-quality-cycle-contract.json' with { type: 'json' };

function promptFixture(t: test.TestContext, content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-role-prompt-'));
  const ref = 'agent/prompts/stage-quality-cycle-roles.md';
  fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
  fs.writeFileSync(path.join(root, ref), content, 'utf8');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ref };
}

const rolePrompt = `# Stage Quality Roles

Shared orientation must not leak into a selected role overlay.

## Producer

Produce the artifact.

### Producer Detail

Keep this nested guidance.

## Reviewer

Review without editing.

\`\`\`
## Repairer
This fenced heading is not a role section.
\`\`\`

## Repairer

Repair required findings.

## Re Reviewer

Close findings independently.
`;

test('quality role prompt fragments select only the requested Markdown section', (t) => {
  const fixture = promptFixture(t, rolePrompt);
  const expected = new Map([
    ['producer', '## Producer\n\nProduce the artifact.\n\n### Producer Detail\n\nKeep this nested guidance.'],
    ['reviewer', '## Reviewer\n\nReview without editing.\n\n```\n## Repairer\nThis fenced heading is not a role section.\n```'],
    ['repairer', '## Repairer\n\nRepair required findings.'],
    ['re-reviewer', '## Re Reviewer\n\nClose findings independently.'],
  ]);
  for (const [fragment, content] of expected) {
    const prompt = readStandardAgentQualityRolePromptFile(fixture.root, `${fixture.ref}#${fragment}`);
    assert.equal(prompt.content, content);
    assert.equal(prompt.size_bytes, Buffer.byteLength(content, 'utf8'));
    assert.equal(prompt.sha256, crypto.createHash('sha256').update(content).digest('hex'));
  }
});

test('quality role prompt without a fragment keeps the complete file', (t) => {
  const fixture = promptFixture(t, rolePrompt);
  const prompt = readStandardAgentQualityRolePromptFile(fixture.root, fixture.ref);
  assert.equal(prompt.content, rolePrompt);
});

test('quality role prompt fragment fails closed when the section is missing or ambiguous', (t) => {
  const fixture = promptFixture(t, `${rolePrompt}\n## Reviewer\n\nDuplicate reviewer.\n`);
  assert.throws(
    () => readStandardAgentQualityRolePromptFile(fixture.root, `${fixture.ref}#missing`),
    /does not resolve to a Markdown section/,
  );
  assert.throws(
    () => readStandardAgentQualityRolePromptFile(fixture.root, `${fixture.ref}#reviewer`),
    /resolves to multiple Markdown sections/,
  );
});

test('runner injects the common protocol for every professional role fragment', (t) => {
  const fixture = promptFixture(t, rolePrompt);
  for (const role of ['producer', 'reviewer', 'repairer', 're_reviewer']) {
    const ref = `${fixture.ref}#${role.replace('_', '-')}`;
    const boundRole = readStandardAgentQualityRolePromptFile(fixture.root, ref);
    const prompt = runnerPromptFor({
      attempt: {
        stage_attempt_id: `sat_protocol_${role}`, stage_id: 'clinical_review',
        stage_run_id: 'sr_protocol', quality_cycle_id: 'qc_protocol',
        attempt_role: role, quality_role_prompt_ref: ref,
        quality_context: { context_manifest: { cross_stage_route_selection: {
          declared_stage_ids: ['clinical_review', 'evidence'], max_repair_rounds: 0,
        } } },
      },
      effectiveQualityRolePrompt: boundRole,
    });
    assert.equal(prompt.split('OPL Stage quality-cycle role contract follows.').length - 1, 1);
    assert.equal(prompt.split(boundRole.content).length - 1, 1);
    assert.ok(prompt.includes(`Quality role prompt SHA-256: ${boundRole.sha256}`));
    assert.ok(prompt.includes('hard_boundary_or_zero_artifact'));
    assert.ok(prompt.includes('fresh StageAttempt and provider thread'));
    if (role !== 'producer') {
      const projected = prompt.match(/<opl_finding_closure_contract>\n([^\n]+)\n<\/opl_finding_closure_contract>/);
      assert.ok(projected);
      assert.deepEqual(JSON.parse(projected[1]!), contract.finding_closure_contract);
      assert.equal(prompt.split('<opl_finding_closure_contract>').length - 1, 1);
    }
    if (role === 'reviewer' || role === 're_reviewer') {
      for (const branch of ['same_stage_repair_required', 'cross_stage_route_back_before_budget_exhaustion', 'final_budget_consumable']) {
        assert.ok(prompt.includes(branch));
      }
      assert.ok(prompt.includes('max_repair_rounds=0'));
      assert.ok(prompt.includes('Do not edit the reviewed artifact'));
    }
  }
});

test('runner keeps bound historical role bytes and digest after the live supplement changes', (t) => {
  const fixture = promptFixture(t, rolePrompt);
  const ref = `${fixture.ref}#reviewer`;
  const frozen = readStandardAgentQualityRolePromptFile(fixture.root, ref);
  fs.writeFileSync(path.join(fixture.root, fixture.ref), rolePrompt.replace('Review without editing.', 'Inspect current medical evidence.'), 'utf8');
  const current = readStandardAgentQualityRolePromptFile(fixture.root, ref);
  assert.notEqual(current.sha256, frozen.sha256);
  const prompt = runnerPromptFor({
    attempt: { stage_attempt_id: 'sat_frozen_protocol', stage_id: 'review', attempt_role: 'reviewer', quality_role_prompt_ref: ref },
    effectiveQualityRolePrompt: frozen,
  });
  assert.ok(prompt.includes(frozen.content));
  assert.ok(prompt.includes(`Quality role prompt SHA-256: ${frozen.sha256}`));
  assert.equal(prompt.includes(current.content), false);
});
