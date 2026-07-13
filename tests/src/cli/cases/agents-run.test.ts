import { assert, fs, os, path, test } from '../helpers.ts';
import { parseAgentsRunArgs } from '../../../../src/entrypoints/cli/cases/private-command-specs-parts/agents-run.ts';

const spec = {
  usage: 'opl agents run --domain <agent> --action <action_id> --workspace <absolute_path>',
  examples: ['opl agents run --domain mas --action study-progress --workspace /tmp/workspace'],
};

test('agents run parses a strict hosted action request', () => {
  const parsed = parseAgentsRunArgs([
    '--domain', 'mas',
    '--action', 'study-progress',
    '--workspace', '/tmp/workspace',
    '--payload', '{"study_id":"study-1"}',
    '--run-id', 'run-1',
    '--timeout-ms', '2500',
  ], spec);
  assert.deepEqual(parsed, {
    domainId: 'mas',
    actionId: 'study-progress',
    workspaceRoot: '/tmp/workspace',
    payload: { study_id: 'study-1' },
    runId: 'run-1',
    timeoutMs: 2500,
  });
});

test('agents run accepts one payload file and rejects ambiguous or malformed input', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-run-parser-'));
  const payloadFile = path.join(fixture, 'request.json');
  fs.writeFileSync(payloadFile, '{"value":1}\n');
  try {
    assert.deepEqual(parseAgentsRunArgs([
      '--domain', 'obf',
      '--action', 'shape-storyline',
      '--workspace', fixture,
      '--payload-file', payloadFile,
    ], spec).payload, { value: 1 });
    assert.throws(() => parseAgentsRunArgs([
      '--domain', 'obf',
      '--action', 'shape-storyline',
      '--workspace', fixture,
      '--payload', '{}',
      '--payload-file', payloadFile,
    ], spec), /either --payload or --payload-file/);
    assert.throws(() => parseAgentsRunArgs([
      '--domain', 'obf',
      '--action', 'shape-storyline',
      '--workspace', fixture,
      '--payload', '[]',
    ], spec), /must be a JSON object/);
    assert.throws(() => parseAgentsRunArgs([
      '--domain', 'obf',
      '--action', 'shape-storyline',
      '--workspace', fixture,
      '--timeout-ms', '0',
    ], spec), /between 1 and 3600000/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
