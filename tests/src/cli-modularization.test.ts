import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('CLI modularization keeps stable entry files while extracting modules and cases', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'main.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'modules', 'types.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'modules', 'runtime-helpers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'modules', 'request-parsers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'modules', 'system-action-parsers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'entrypoints', 'cli', 'modules', 'help-output.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli.test.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli', 'cases')), true);
});

test('family-runtime command parser keeps a thin public entrypoint and semantic parser parts', () => {
  const entryPath = path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-command.ts');
  const partsRoot = path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-command-parts');
  const entryLines = fs.readFileSync(entryPath, 'utf8').trimEnd().split('\n').length;
  const expectedParserParts = [
    'attempt.ts',
    'evidence-worklist.ts',
    'lifecycle.ts',
    'provider.ts',
    'registry.ts',
    'scheduler.ts',
    'service-worker.ts',
    'shared.ts',
    'stage-artifact.ts',
    'stage-run.ts',
  ];

  assert.equal(fs.existsSync(partsRoot), true);
  assert.ok(entryLines <= 240, `family-runtime-command.ts should stay thin after parser extraction, got ${entryLines}`);
  assert.deepEqual(
    fs.readdirSync(partsRoot).filter((fileName) => fileName.endsWith('.ts')).sort(),
    expectedParserParts,
  );
  for (const fileName of expectedParserParts) {
    assert.equal(fs.existsSync(path.join(partsRoot, fileName)), true, `${fileName} parser part is missing`);
  }
  assert.equal(fs.existsSync(path.join(partsRoot, 'queue.ts')), false);
});

test('standard domain-agent conformance keeps physical morphology in scoped modules', () => {
  const entryPath = path.join(repoRoot, 'src', 'modules', 'workspace', 'standard-domain-agent-conformance.ts');
  const morphologyPath = path.join(repoRoot, 'src', 'modules', 'workspace', 'standard-domain-agent-conformance-physical-morphology.ts');
  const utilsPath = path.join(repoRoot, 'src', 'modules', 'pack', 'standard-domain-agent-conformance-utils.ts');
  const entrySource = fs.readFileSync(entryPath, 'utf8');
  const morphologySource = fs.readFileSync(morphologyPath, 'utf8');
  const entryLines = entrySource.trimEnd().split('\n').length;
  const morphologyLines = morphologySource.trimEnd().split('\n').length;

  assert.equal(fs.existsSync(morphologyPath), true);
  assert.equal(fs.existsSync(utilsPath), true);
  assert.ok(entryLines <= 600, `standard-domain-agent-conformance.ts should stay as a thin aggregator, got ${entryLines}`);
  assert.ok(morphologyLines <= 700, `physical morphology checks should remain reviewable, got ${morphologyLines}`);
  assert.match(entrySource, /buildPhysicalMorphologyChecks/);
  assert.equal(entrySource.includes('ACTIVE_MORPHOLOGY_SCAN_ROOTS'), false);
  assert.equal(morphologySource.includes('readStandardAgentConformanceProfile'), true);
  assert.equal(morphologySource.includes('med-autogrant'), false);
  assert.equal(morphologySource.includes('redcube-ai'), false);
});
