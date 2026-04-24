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
    domain_projection: {
      runtime_continuity: {
        surface_kind: 'skill_runtime_continuity',
        runtime_owner: 'codex_cli',
        domain_owner: 'medautoscience',
        executor_owner: 'mas_controller',
        session_locator_field: 'study_id',
        session_surface_ref: '/session_continuity',
        progress_surface_ref: '/progress_projection',
        artifact_surface_ref: '/artifact_inventory',
        restore_point_surface_ref: '/runtime_control/restore_point',
        recommended_resume_command: 'uv run python -m med_autoscience.cli workspace-cockpit --profile <profile>',
        recommended_progress_command: 'uv run python -m med_autoscience.cli study-progress --profile <profile> --study-id <study_id>',
        recommended_artifact_command: 'uv run python -m med_autoscience.cli workspace-cockpit --profile <profile> --artifacts',
      },
    },
  });
  assert.equal(masSkill.skill_id, 'medautoscience_workspace_cockpit');
  assert.equal(
    (masSkill.domain_projection as { runtime_continuity: { surface_kind: string } }).runtime_continuity.surface_kind,
    'skill_runtime_continuity',
  );

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
