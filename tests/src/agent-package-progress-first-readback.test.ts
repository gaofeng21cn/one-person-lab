import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  agentPackageSkillProjectionFromUnknown,
  assertAgentPackageSkillProjection,
  projectionFiles,
} from '../../src/adapters/integration/agent-package-registry/skill-projection.ts';
import { sha256Text } from '../../src/adapters/integration/agent-package-registry/shared.ts';
import type { AgentPackageSkillProjection } from '../../src/adapters/integration/agent-package-registry/types.ts';
import { hostAttemptSkillRuntime } from '../../src/adapters/execution/family-runtime-attempt-skill-projection.ts';

function buildProjection(stateRoot: string): AgentPackageSkillProjection {
  const generationId = sha256Text('progress-first-readback-immutable-generation');
  const projectionRoot = path.join(stateRoot, 'agent-package-skill-projections', generationId);
  const skillRoot = path.join(projectionRoot, '.agents', 'skills', 'fixture-agent');
  fs.mkdirSync(skillRoot, { recursive: true });
  const skillBytes = Buffer.from([
    '---',
    'name: fixture-agent',
    'description: Reader-only immutable projection fixture.',
    '---',
    '',
    'Use this fixture only to verify historical Attempt projection reads.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), skillBytes, { mode: 0o555 });
  const skillDigest = `sha256:${sha256Text(`fixture-agent/SKILL.md\0${skillBytes.toString('base64')}`)}`;
  const closureDigest = `sha256:${sha256Text(JSON.stringify([['fixture-agent', skillDigest]]))}`;
  return {
    surface_kind: 'opl_agent_package_skill_projection.v1',
    status: 'materialized',
    generation_id: generationId,
    projection_root: projectionRoot,
    skills_root: path.join(projectionRoot, '.agents', 'skills'),
    root_package_id: 'fixture-agent-package',
    root_skill_ids: ['fixture-agent'],
    core_skill_ids: ['fixture-agent'],
    specialty_skill_ids: [],
    skill_ids: ['fixture-agent'],
    skill_digests: { 'fixture-agent': skillDigest },
    core_digest: closureDigest,
    full_export_digest: closureDigest,
  };
}

test('historical Skill projection reader verifies immutable bytes without a writer', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-projection-reader-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const projection = buildProjection(stateRoot);
    const parsed = agentPackageSkillProjectionFromUnknown(JSON.parse(JSON.stringify(projection)));
    assert.ok(parsed);
    assert.equal(assertAgentPackageSkillProjection(parsed), parsed);
    assert.deepEqual(projectionFiles(parsed).map((file) => file.relative_path), ['fixture-agent/SKILL.md']);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-locks.json')), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('host Attempt projection consumption remains read-only and rejects planned writer state', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-projection-host-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.HOME = path.join(fixtureRoot, 'home');
  process.env.CODEX_HOME = path.join(fixtureRoot, 'codex');
  try {
    const projection = buildProjection(stateRoot);
    const runtime = hostAttemptSkillRuntime({
      workspace_locator: { package_use_binding: { skill_projection: projection } },
    });
    assert.ok(runtime);
    assert.equal(runtime.env.HOME, projection.projection_root);
    assert.equal(runtime.shellHome, process.env.HOME);
    assert.deepEqual(runtime.packageSkillBindings.map((entry) => entry.name), ['fixture-agent']);
    assert.throws(
      () => agentPackageSkillProjectionFromUnknown({ ...projection, status: 'planned_no_write' }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'agent_package_skill_projection_binding_invalid',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
