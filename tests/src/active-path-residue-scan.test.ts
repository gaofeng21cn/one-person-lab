import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const scannedSourceExtensions = new Set(['.ts', '.mjs', '.js', '.json', '.sh']);

const legacyGateway = ['Gate', 'way'].join('');
const legacyHermes = ['Her', 'mes'].join('');
const legacyLocalManager = ['local', '-', 'manager'].join('');

const scannedSourceRoots = ['src', 'scripts', 'contracts'] as const;

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function* walk(relativeRoot: string, extensions = scannedSourceExtensions): Generator<string> {
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
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      yield relativePath;
    }
  }
}

function scannedTextFiles(relativeRoots: string[]) {
  return relativeRoots.flatMap((relativeRoot) => [...walk(relativeRoot)]);
}

test('root help fast-start examples stay on the current Codex-default path', () => {
  const helpOutput = read('src/entrypoints/cli/modules/help-output.ts');

  assert.match(helpOutput, /default Codex engine/);
  assert.match(helpOutput, /default Codex runtime/);
  assert.match(helpOutput, /opl workspace bind --project redcube --path \/Users\/gaofeng\/workspace\/redcube-ai/);
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyHermes}.*default`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${legacyGateway}.*cron`, 'i'));
  assert.doesNotMatch(helpOutput, new RegExp(`${['front', 'door'].join('')}.*${legacyLocalManager}`, 'i'));
  assert.doesNotMatch(helpOutput, /--entry-command "redcube product invoke/);
  assert.doesNotMatch(helpOutput, /--manifest-command "redcube product manifest/);
});

test('production source does not expose Hermes as a provider/runtime surface', () => {
  const forbiddenProductionPatterns = [
    /\bHermes(?:Runtime|Provider|Gateway)\b/,
    /\bhermes_(?:runtime|online|provider|gateway)\b/i,
    /\bOPL_HERMES_(?:RUNTIME|PROVIDER|GATEWAY)/,
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

test('default runtime and CLI source do not advertise compatibility aliases as active paths', () => {
  const forbiddenActivePathPatterns = [
    /\bcompatibility_alias(?:es)?_allowed\b\s*[:=]\s*true/i,
    /\bclaims_compatibility_alias_owner\b\s*[:=]\s*true/i,
    /\bcompatibility_alias_owner\b\s*[:=]\s*true/i,
    /\blegacy_alias(?:es)?_allowed\b\s*[:=]\s*true/i,
    /\b(?:default|active|live|normal)[_-]?(?:compatibility|legacy)[_-]?alias(?:es)?\b/i,
    /\b(?:compatibility|legacy)[_-]?alias(?:es)?[_-]?(?:default|active|live|normal)\b/i,
  ];
  const allowedSourceLines = [
    /compatibility_alias_allowed/i,
  ];
  const violations: string[] = [];

  for (const relativePath of scannedTextFiles([...scannedSourceRoots])) {
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

  assert.deepEqual(violations, []);
});
