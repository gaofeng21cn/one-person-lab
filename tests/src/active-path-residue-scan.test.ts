import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const scannedFiles = [
  'README.md',
  'README.zh-CN.md',
  'docs/public/README.md',
  'docs/public/README.zh-CN.md',
  'docs/public/roadmap.md',
  'docs/public/roadmap.zh-CN.md',
  'docs/public/operating-model.md',
  'docs/public/operating-model.zh-CN.md',
  'docs/public/task-map.md',
  'docs/public/task-map.zh-CN.md',
  'docs/active/current-development-lines.md',
  'docs/active/current-development-lines.zh-CN.md',
  'docs/active/opl-public-surface-index.md',
  'docs/active/opl-public-surface-index.zh-CN.md',
  'docs/references/operating-governance/family-domain-memory-governance.zh-CN.md',
  'docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md',
  'docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md',
  'src/cli/modules/help-output.ts',
];

const legacyGateway = ['Gate', 'way'].join('');
const legacyHermes = ['Her', 'mes'].join('');
const legacyLocalManager = ['local', '-', 'manager'].join('');

const forbiddenDefaultPatterns = [
  /default\s+Hermes/i,
  /Hermes\s+default/i,
  /Hermes-first\s+(?:current|default|target|active)\s+(?:online|runtime|session|substrate)/i,
  /Gateway-first/i,
  /default\s+Gateway/i,
  /Gateway\s+cron\s+(?:is|as|as the|remains|stays)\s+(?:the\s+)?(?:default|normal|active)/i,
  new RegExp(`${['front', 'door'].join('')}\\/${legacyLocalManager}\\s+(?:is|as|as the|remains|stays)\\s+(?:the\\s+)?(?:default|normal|active)`, 'i'),
  /local-manager\s+(?:default|path|route|runtime|manager)/i,
  /compatibility\s+alias(?:es)?\s+(?:as|as the|is|are)\s+(?:a\s+)?(?:default|normal|active)/i,
];

const allowedRetainedContext =
  /no longer|not |retire|retired|legacy|provenance|diagnostic|history|fixture|reference|explicit|optional|superseded|旧|历史|诊断|来源|证据|保留|退役|降级|不是|不再|不得|不能|只作为|只保留|必须标为/i;

const requiredCurrentPatterns = [
  /Codex(?:-| )default/i,
  /provider-backed/i,
  /legacy|provenance|diagnostic|history|fixture/i,
];

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertCurrentBoundary(relativePath: string) {
  const content = read(relativePath);
  for (const pattern of requiredCurrentPatterns) {
    assert.match(content, pattern, `${relativePath} must retain current runtime/residue boundary wording`);
  }
}

test('active docs and root help do not advertise legacy operator paths as defaults', () => {
  const violations: string[] = [];

  for (const relativePath of scannedFiles) {
    const lines = read(relativePath).split('\n');
    lines.forEach((line, index) => {
      if (allowedRetainedContext.test(line)) {
        return;
      }
      for (const pattern of forbiddenDefaultPatterns) {
        if (pattern.test(line)) {
          violations.push(`${relativePath}:${index + 1}: ${pattern}`);
        }
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('active operator closeout surfaces keep the current provider-backed boundary explicit', () => {
  [
    'docs/public/roadmap.md',
    'docs/public/roadmap.zh-CN.md',
    'docs/active/current-development-lines.md',
    'docs/active/current-development-lines.zh-CN.md',
    'docs/active/opl-public-surface-index.md',
    'docs/active/opl-public-surface-index.zh-CN.md',
    'docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md',
  ].forEach(assertCurrentBoundary);
});

test('root help fast-start examples stay on the current Codex-default path', () => {
  const helpOutput = read('src/cli/modules/help-output.ts');

  assert.match(helpOutput, /default Codex engine/);
  assert.match(helpOutput, /default Codex runtime/);
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyHermes}.*default`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyGateway}.*cron`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${['front', 'door'].join('')}.*${legacyLocalManager}`, 'i'));
});
