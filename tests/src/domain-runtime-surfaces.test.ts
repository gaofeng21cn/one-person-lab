import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appendDomainRunEvent, createDomainRunRecord, dispatchDomainAction, readDomainRunEvents } from '../../src/modules/runway/domain-task-runtime.ts';
import { resolveDomainPythonCommand } from '../../src/modules/runway/domain-helper-runtime.ts';
import { buildDirectoryArtifactIndex, buildDomainArtifactIndex, readDomainArtifact, writeDomainArtifact } from '../../src/modules/stagecraft/domain-artifact-runtime.ts';
import {
  ensureDomainWorkspaceGitBoundary,
  materializeDomainSources,
} from '../../src/modules/workspace/domain-source-runtime.ts';

const identity = {
  domain_id: 'rca',
  program_id: 'program-1',
  topic_id: 'topic-1',
  deliverable_id: 'deliverable-1',
  run_id: 'run-1',
};

test('domain task runtime owns generic run records, events, and action dispatch only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-task-'));
  try {
    const record = createDomainRunRecord(identity, { now: () => new Date('2026-07-11T00:00:00Z') });
    assert.equal(record.surface_kind, 'opl_domain_run_record');
    assert.equal(record.authority_boundary.framework_owns_domain_verdict, false);
    const eventsFile = path.join(root, 'events.jsonl');
    appendDomainRunEvent({ events_file: eventsFile, identity, event_kind: 'started' });
    assert.equal(readDomainRunEvents(eventsFile)[0]?.surface_kind, 'opl_domain_run_event');
    assert.deepEqual(await dispatchDomainAction('inspect', { value: 2 }, {
      inspect: (options) => ({ value: Number(options.value) * 2 }),
    }), { value: 4 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('domain helper runtime accepts explicit command arrays without installing a domain-local runtime', () => {
  const command = resolveDomainPythonCommand({
    command_env: 'TEST_DOMAIN_PYTHON',
    env: { ...process.env, TEST_DOMAIN_PYTHON: JSON.stringify(['node', '--experimental-strip-types']) },
    required_modules: ['module-that-explicit-carrier-does-not-need'],
  });
  assert.equal(command.source, 'explicit_env');
  assert.deepEqual(command.args, ['--experimental-strip-types']);
  assert.equal(command.runtime_env.PYTHONDONTWRITEBYTECODE, '1');
});

test('domain helper runtime accepts a deterministic Python probe for managed runtime resolution', () => {
  const probes: string[] = [];
  const command = resolveDomainPythonCommand({
    env: { OPL_MANAGED_PYTHON: '/managed/python', PATH: '' },
    required_modules: ['playwright'],
    file_exists: () => true,
    probe_python: (candidate) => {
      probes.push(candidate);
      return { status: candidate === '/managed/python' ? 0 : 1 };
    },
  });
  assert.equal(command.command, '/managed/python');
  assert.equal(command.source, 'managed_runtime');
  assert.deepEqual(probes, ['/managed/python']);
});

test('domain artifact runtime writes, reads, and indexes generic stage bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-artifact-'));
  const locator = {
    root,
    domain_id: 'rca',
    program_id: 'program-1',
    topic_id: 'topic-1',
    deliverable_id: 'deliverable-1',
    stage_id: 'draft',
    attempt_id: 'attempt-1',
  };
  try {
    writeDomainArtifact({ ...locator, role: 'output', relative_path: 'deck.pptx', body: 'fixture' });
    assert.equal(readDomainArtifact({ ...locator, role: 'output', relative_path: 'deck.pptx' }).body, 'fixture');
    const index = buildDomainArtifactIndex(locator);
    assert.equal(index.entries.length, 1);
    assert.equal(index.authority_boundary.index_is_not_domain_verdict, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('domain source runtime materializes refs without deciding source readiness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-source-'));
  try {
    const result = materializeDomainSources({
      material_root: root,
      sources: [{ kind: 'text', text: 'brief body', role: 'operator_context', label: 'brief' }],
    });
    assert.equal(result.entries.length, 1);
    assert.equal(fs.readFileSync(result.entries[0]!.path, 'utf8'), 'brief body');
    assert.equal(result.authority_boundary.framework_can_decide_source_readiness, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('domain source runtime owns generic workspace Git bootstrap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-workspace-'));
  try {
    const result = ensureDomainWorkspaceGitBoundary({
      workspace_root: root,
      gitignore_entries: ['runtime/', '.domain-cache/'],
      gitignore_header: '# Domain workspace.',
    });
    assert.equal(result.initialized, true);
    assert.equal(fs.existsSync(path.join(root, '.git')), true);
    assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), [
      '# Domain workspace.',
      'runtime/',
      '.domain-cache/',
      '',
    ].join('\n'));
    assert.equal(result.authority_boundary.framework_owns_domain_truth, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('directory artifact index hashes files and reports missing required paths without a quality verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-directory-index-'));
  try {
    fs.writeFileSync(path.join(root, 'proof.json'), '{}');
    const index = buildDirectoryArtifactIndex({ root, required_paths: ['proof.json', 'missing.pdf'] });
    assert.equal(index.entries[0]?.sha256.length, 64);
    assert.deepEqual(index.missing_required_paths, ['missing.pdf']);
    assert.equal(index.authority_boundary.index_is_not_quality_verdict, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
