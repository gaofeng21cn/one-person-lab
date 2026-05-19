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
  'docs/public/roadmap.md',
  'docs/public/operating-model.md',
  'docs/public/task-map.md',
  'docs/active/current-development-lines.md',
  'docs/product/opl-public-surface-index.md',
  'docs/references/operating-governance/family-domain-memory-governance.md',
  'docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md',
  'docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md',
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

function* walk(relativeRoot: string): Generator<string> {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      yield* walk(relativePath);
      continue;
    }
    if (entry.isFile() && ['.ts', '.mjs', '.js', '.json', '.sh'].includes(path.extname(entry.name))) {
      yield relativePath;
    }
  }
}

function scannedTextFiles(relativeRoots: string[]) {
  return relativeRoots.flatMap((relativeRoot) => [...walk(relativeRoot)]);
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
    'docs/active/current-development-lines.md',
    'docs/product/opl-public-surface-index.md',
    'docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md',
  ].forEach(assertCurrentBoundary);
});

test('active gap docs do not freeze stale checkout or compatibility-audit baselines', () => {
  const scannedActiveDocs = [
    'docs/active/current-development-lines.md',
    'docs/active/current-state-vs-ideal-gap.md',
    'docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md',
  ];
  const forbiddenPatterns = [
    /四仓根 checkout 都在 `main\.\.\.origin\/main` 且 clean/,
    /path compatibility audit/i,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedActiveDocs) {
    const content = read(relativePath);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('root help fast-start examples stay on the current Codex-default path', () => {
  const helpOutput = read('src/cli/modules/help-output.ts');

  assert.match(helpOutput, /default Codex engine/);
  assert.match(helpOutput, /default Codex runtime/);
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyHermes}.*default`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyGateway}.*cron`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${['front', 'door'].join('')}.*${legacyLocalManager}`, 'i'));
});

test('production source does not retain retired Hermes provider or gateway environment surfaces', () => {
  const forbiddenProductionPatterns = [
    /OPL_HERMES_BIN/,
    /inspectHermesRuntime/,
    /collectHermesProcessUsage/,
    /hermes_diagnostics/,
    /hermes_runtime/,
    /hermes_legacy_runtime/,
    /messaging_gateway_ready/,
  ];
  const violations: string[] = [];

  for (const relativeRoot of ['src', 'scripts']) {
    for (const relativePath of walk(relativeRoot)) {
      const content = read(relativePath);
      for (const pattern of forbiddenProductionPatterns) {
        if (pattern.test(content)) {
          violations.push(`${relativePath}: ${pattern}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('default runtime and CLI source do not leak retired vocabulary on active paths', () => {
  const forbiddenActivePathPatterns = [
    /\bfront(?:door|desk)\b/i,
    /product[-_]?front(?:door|desk)/i,
    /open[-_]?front(?:door|desk)/i,
    /domain[-_]?gateway/i,
    /gateway[-_]interaction[-_]contract/i,
    /compatibility[-_]?alias(?:es)?/i,
    /legacy[-_]?alias(?:es)?/i,
    /runtime[-_]?run/i,
    /runtime[-_]?resume/i,
    new RegExp(['mcp', 'stdio'].join('-'), 'i'),
    /session[-_]journal[-_]root/i,
    /local[-_]run[-_]journal/i,
  ];
  const allowedSourceLines = [
    /hermes_agent_not_provider_or_gateway_surface/i,
    /openai_compatible_gateway_backend_forbidden/i,
    /compatibility_alias_allowed/i,
    /familyRuntimeRuntimePaths/i,
  ];
  const violations: string[] = [];

  for (const relativeRoot of ['src', 'scripts', 'contracts']) {
    for (const relativePath of walk(relativeRoot)) {
      const lines = read(relativePath).split('\n');
      lines.forEach((line, index) => {
        if (allowedSourceLines.some((pattern) => pattern.test(line))) {
          return;
        }
        for (const pattern of forbiddenActivePathPatterns) {
          if (pattern.test(line)) {
            violations.push(`${relativePath}:${index + 1}: ${pattern}`);
          }
        }
      });
    }
  }

  assert.deepEqual(violations, []);
});
