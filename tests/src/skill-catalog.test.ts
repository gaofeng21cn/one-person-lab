import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSkillCatalog,
  buildSkillDescriptor,
} from '../../src/skill-catalog.ts';

test('skill catalog helpers normalize shared command and skill descriptors', () => {
  const masSkill = buildSkillDescriptor({
    skill_id: 'medautoscience_workspace_cockpit',
    title: 'MAS workspace cockpit',
    owner: 'medautoscience',
    distribution_mode: 'repo_tracked',
    surface_kind: 'workspace_cockpit',
    description: 'Continue study runtime through the canonical cockpit shell.',
    command: 'uv run python -m med_autoscience.cli workspace-cockpit --profile <profile>',
    readiness: 'landed',
    tags: ['study', 'runtime', 'workspace'],
  });
  assert.equal(masSkill.skill_id, 'medautoscience_workspace_cockpit');

  const magSkill = buildSkillDescriptor({
    skill_id: 'medautogrant_grant_user_loop',
    title: 'MAG grant user loop',
    owner: 'medautogrant',
    distribution_mode: 'repo_tracked',
    surface_kind: 'grant_user_loop',
    description: 'Continue the current grant authoring loop.',
    command: 'uv run python -m med_autogrant grant-user-loop --input <workspace>',
    readiness: 'landed',
    tags: ['grant', 'authoring', 'checkpoint'],
  });

  const catalog = buildSkillCatalog({
    summary: 'Family-shared skill catalog for current domain entry surfaces.',
    skills: [masSkill, magSkill],
    supported_commands: [
      'workspace-cockpit',
      'grant-user-loop',
    ],
    command_contracts: [
      { command: 'workspace-cockpit', owner: 'medautoscience' },
      { command: 'grant-user-loop', owner: 'medautogrant' },
    ],
  });

  assert.equal(catalog.surface_kind, 'skill_catalog');
  assert.equal(catalog.skills.length, 2);
  assert.deepEqual(catalog.supported_commands, ['workspace-cockpit', 'grant-user-loop']);
});
