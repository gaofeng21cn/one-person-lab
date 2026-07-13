import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readStandardAgentQualityRolePromptFile,
} from '../../src/modules/pack/standard-agent-stage-prompt.ts';

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
