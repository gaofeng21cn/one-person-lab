import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { assertProjectionBytes } from '../../../../kernel/agent-package-skill-projection.ts';
import { ensureOplStateDir } from '../../../../kernel/runtime-state-paths.ts';
import {
  buildProjectionPlan,
  projectionFromPlan,
  type CapabilityProviderSource,
} from './plan.ts';

export function copySkillTree(sourceRoot: string, targetRoot: string) {
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o755 });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection does not accept symbolic links.',
        { source_path: source, failure_code: 'agent_package_skill_projection_symlink_forbidden' },
      );
    }
    if (stat.isDirectory()) copySkillTree(source, target);
    else if (stat.isFile()) {
      fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(target, stat.mode & 0o111
        ? 0o755
        : 0o644);
    } else {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection accepts only regular files and directories.',
        { source_path: source, failure_code: 'agent_package_skill_projection_entry_unsupported' },
      );
    }
  }
  fs.chmodSync(targetRoot, 0o755);
}

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
}

export function removeTree(root: string) {
  if (!fs.existsSync(root)) return;
  makeTreeWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}

export function materializeAgentPackageWorkspaceSkillProjection(input: {
  rootPackageId: string;
  rootSkillIds: string[];
  rootSourceRoot: string;
  rootSourceRef: string;
  providers?: CapabilityProviderSource[];
  selectedSkillIds?: string[];
  dryRun?: boolean;
}) {
  const plan = buildProjectionPlan({
    ...input,
    providers: input.providers ?? [],
  });
  if (input.dryRun) {
    return {
      status: 'planned_no_write' as const,
      writes_performed: false,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: null,
    };
  }
  const projectionParent = path.join(
    ensureOplStateDir().state_dir,
    'agent-package-skill-projections',
  );
  fs.mkdirSync(projectionParent, { recursive: true });
  const projectionRoot = path.join(projectionParent, plan.generationId);
  const projection = projectionFromPlan(input.rootPackageId, projectionRoot, plan);
  if (fs.existsSync(projectionRoot)) {
    return {
      status: 'unchanged' as const,
      writes_performed: false,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: assertProjectionBytes(projection),
    };
  }
  const stageRoot = fs.mkdtempSync(path.join(projectionParent, '.staging-'));
  try {
    const stageSkillsRoot = path.join(stageRoot, '.agents', 'skills');
    for (const skillId of plan.skillIds) {
      copySkillTree(
        plan.sourceBySkillId.get(skillId)!.sourceRoot,
        path.join(stageSkillsRoot, skillId),
      );
    }
    const stagedProjection = {
      ...projection,
      projection_root: stageRoot,
      skills_root: stageSkillsRoot,
    };
    assertProjectionBytes(stagedProjection, false);
    fs.writeFileSync(
      path.join(stageRoot, 'projection.json'),
      `${JSON.stringify(projection, null, 2)}\n`,
      { mode: 0o644 },
    );
    try {
      fs.renameSync(stageRoot, projectionRoot);
    } catch (error) {
      if (!fs.existsSync(projectionRoot)) throw error;
      removeTree(stageRoot);
    }
    return {
      status: 'materialized' as const,
      writes_performed: true,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: assertProjectionBytes(projection),
    };
  } catch (error) {
    removeTree(stageRoot);
    throw error;
  }
}

export function realDirectory(candidate: string | null) {
  if (!candidate || !path.isAbsolute(candidate)) return null;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink() ? fs.realpathSync(candidate) : null;
  } catch {
    return null;
  }
}

function invalidWorkspaceProjectionPath(workspaceRoot: string, candidate: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Workspace Skill projection refuses symbolic links or paths outside the Workspace.',
    {
      target_workspace: workspaceRoot,
      projection_path: candidate,
      failure_code: 'agent_package_workspace_skill_projection_path_invalid',
    },
  );
}

export function assertWorkspaceProjectionPath(workspaceRoot: string, candidate: string) {
  const resolved = path.resolve(candidate);
  if (resolved === workspaceRoot || !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    invalidWorkspaceProjectionPath(workspaceRoot, candidate);
  }
  let current = resolved;
  while (current !== workspaceRoot) {
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) invalidWorkspaceProjectionPath(workspaceRoot, candidate);
      const real = fs.realpathSync(current);
      if (real !== workspaceRoot && !real.startsWith(`${workspaceRoot}${path.sep}`)) {
        invalidWorkspaceProjectionPath(workspaceRoot, candidate);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    current = path.dirname(current);
  }
}

export function writeAtomicJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  fs.renameSync(temporary, filePath);
}
