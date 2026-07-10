import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildSkillCatalog, buildSkillDescriptor } from '../../src/modules/pack/skill-catalog.ts';

test('skill catalog public export normalizes descriptors without taking domain authority', () => {
  const skill = buildSkillDescriptor({
    skill_id: 'domain_workspace',
    title: 'Domain workspace',
    owner: 'example-domain',
    distribution_mode: 'repo_tracked',
    surface_kind: 'workspace',
    description: 'Continue through the domain-owned workspace entry.',
    command: 'example-domain workspace',
    readiness: 'landed',
    tags: ['workspace'],
  });
  const catalog = buildSkillCatalog({
    summary: 'Family skill refs.',
    skills: [skill],
    supported_commands: ['workspace'],
    command_contracts: [{ command: 'workspace', owner: 'example-domain' }],
  });

  assert.equal(catalog.surface_kind, 'skill_catalog');
  assert.deepEqual(catalog.skills.map((entry) => entry.skill_id), ['domain_workspace']);
  assert.deepEqual(catalog.command_contracts, [{ command: 'workspace', owner: 'example-domain' }]);

  const packageJson = JSON.parse(
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { exports?: Record<string, string> };
  assert.equal(packageJson.exports?.['./skill-catalog'], './dist/modules/pack/skill-catalog.js');
});
