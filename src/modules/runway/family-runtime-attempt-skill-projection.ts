import os from 'node:os';
import path from 'node:path';

import {
  agentPackageSkillProjectionFromUnknown,
  assertAgentPackageSkillProjection,
} from '../connect/agent-package-registry-parts/skill-projection.ts';
import type { AgentPackageSkillProjection } from '../connect/agent-package-registry-parts/types.ts';
import { isRecord, type JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';

function projectionFromAttempt(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const binding = isRecord(locator.package_use_binding) ? locator.package_use_binding : null;
  return agentPackageSkillProjectionFromUnknown(binding?.skill_projection);
}

function bindingsForRoot(projection: AgentPackageSkillProjection, skillsRoot: string) {
  return projection.skill_ids.map((skillId) => ({
    name: skillId,
    path: path.join(skillsRoot, skillId, 'SKILL.md'),
  }));
}

export function packageSkillPromptPrefix(projection: AgentPackageSkillProjection | null) {
  if (!projection || projection.root_skill_ids.length === 0) return '';
  return [
    `Use the package-bound root Skill for this Attempt: ${projection.root_skill_ids.map((id) => `$${id}`).join(' ')}.`,
    `The complete package-bound Skill generation is ${projection.generation_id}; use its routed specialist Skills when their descriptions match the task.`,
  ].join('\n');
}

export function hostAttemptSkillRuntime(attempt: JsonRecord) {
  const projection = projectionFromAttempt(attempt);
  if (!projection) return null;
  assertAgentPackageSkillProjection(projection);
  const realHome = process.env.HOME?.trim() || os.homedir();
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(realHome, '.codex');
  return {
    projection,
    env: {
      HOME: projection.projection_root,
      CODEX_HOME: codexHome,
    },
    packageSkillBindings: bindingsForRoot(projection, projection.skills_root),
    shellHome: realHome,
  };
}

export function sandboxAttemptSkillRuntime(attempt: JsonRecord, workspaceRoot: string) {
  const projection = projectionFromAttempt(attempt);
  if (!projection) return null;
  assertAgentPackageSkillProjection(projection);
  const skillsRoot = path.posix.join(workspaceRoot, '.agents', 'skills');
  return {
    projection,
    skillsRoot,
    packageSkillBindings: bindingsForRoot(projection, skillsRoot),
  };
}
