import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { TopologyProfile, WorkspaceProjectIndexEntry } from '../workspace-topology.ts';
import {
  GENERATED_WORKSPACE_HEALTH_REF, GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF, GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF, PROJECT_CONFIG_BASENAME,
  PROJECT_INDEX_BASENAME, WORKSPACE_HEALTH_REF, WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF, WORKSPACE_REPORT_REF, WORKSPACE_RESOURCE_INVENTORY_REF,
  currentStagePointerRef, sharedResourceManifestRef, stageOutputsIndexRef,
} from '../workspace-artifacts-parts/refs.ts';
import { ARTIFACT_LIFECYCLE_PROFILE_REF } from '../workspace-artifact-lifecycle-profile.ts';

function reject(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('cli_usage_error', message, details);
}

function assertProjectMetadataOwnership(workspacePath: string, projectRoot: string) {
  const markers = [
    [PROJECT_CONFIG_BASENAME, 'surface_kind: opl_workspace_project_config\nversion: workspace-project-config.v1\n'],
    [PROJECT_INDEX_BASENAME, 'opl_workspace_project_index'],
  ] as const;
  for (const [name, marker] of markers) {
    const target = path.join(projectRoot, name);
    assertContainedPath(workspacePath, target, 'file');
    if (!fs.existsSync(target)) continue;
    const text = fs.readFileSync(target, 'utf8');
    let owned = name === PROJECT_CONFIG_BASENAME && text.startsWith(marker);
    if (name === PROJECT_INDEX_BASENAME) {
      try { owned = JSON.parse(text)?.surface_kind === marker; } catch { owned = false; }
    }
    if (!owned) reject('Workspace initialization would overwrite non-OPL project metadata.', { path: target });
  }
}

/** Check every existing component, including dangling symlinks, before any workspace mutation. */
function assertContainedPath(workspacePath: string, target: string, kind: 'directory' | 'file') {
  const relative = path.relative(workspacePath, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    reject('Workspace project or metadata path escapes the workspace.', { workspace_path: workspacePath, path: target });
  }
  const parts = relative ? relative.split(path.sep) : [];
  let current = workspacePath;
  for (let index = 0; index <= parts.length; index += 1) {
    if (index > 0) current = path.join(current, parts[index - 1]!);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      reject('Workspace project and metadata paths must not traverse symlinks.', { path: current });
    }
    const expectedDirectory = index < parts.length || kind === 'directory';
    if (expectedDirectory ? !stat.isDirectory() : !stat.isFile()) {
      reject('Workspace project or metadata path has an incompatible file type.', { path: current, expected: expectedDirectory ? 'directory' : 'file' });
    }
  }
}

export function resolveWorkspaceProjectRoot(input: {
  workspacePath: string;
  projectId: string;
  projectRoot?: string;
  projectCollectionPath: string;
  projects: WorkspaceProjectIndexEntry[];
}) {
  const rootsById = new Map<string, string>();
  const idsByRoot = new Map<string, string>();
  const register = (id: string, root: string) => {
    assertContainedPath(input.workspacePath, root, 'directory');
    if (root === input.workspacePath) reject('A project root must be a strict child of its workspace.', { project_id: id, project_root: root });
    const stat = fs.statSync(root, { throwIfNoEntry: false });
    const rootIdentity = stat ? `${stat.dev}:${stat.ino}` : root;
    const previousRoot = rootsById.get(id);
    const previousId = idsByRoot.get(rootIdentity);
    if (previousRoot && previousRoot !== root) {
      reject('Project ID is already registered at another root.', { project_id: id, registered_root: previousRoot, requested_root: root });
    }
    if (previousId && previousId !== id) {
      reject('Project root is already registered to another project ID.', { project_root: root, registered_project_id: previousId, requested_project_id: id });
    }
    rootsById.set(id, root);
    idsByRoot.set(rootIdentity, id);
  };
  for (const project of input.projects) {
    if (!project.project_root || path.isAbsolute(project.project_root)) {
      reject('Indexed project roots must be workspace-relative paths.', { project_id: project.project_id, project_root: project.project_root });
    }
    register(project.project_id, path.resolve(input.workspacePath, project.project_root));
  }
  if (input.projectRoot !== undefined && (!input.projectRoot.trim() || !path.isAbsolute(input.projectRoot))) {
    reject('--project-root must be an absolute existing directory.', { project_root: input.projectRoot });
  }
  const root = input.projectRoot !== undefined
    ? path.resolve(input.projectRoot)
    : rootsById.get(input.projectId) ?? path.join(input.workspacePath, input.projectCollectionPath, input.projectId);
  register(input.projectId, root);
  if (input.projectRoot !== undefined && !fs.existsSync(root)) {
    reject('--project-root must be an absolute existing directory.', { project_root: root });
  }
  if (input.projectRoot !== undefined) assertProjectMetadataOwnership(input.workspacePath, root);
  return root;
}

export function assertWorkspaceInitializationPaths(input: {
  workspacePath: string;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
}) {
  const { workspacePath, profile, projects } = input;
  const directories = [profile.project_collection_path, ...profile.shared_resource_roots];
  const files = [
    'workspace.yaml', 'workspace_index.json',
    GENERATED_WORKSPACE_HEALTH_REF, GENERATED_WORKSPACE_INSPECTION_REF,
    GENERATED_WORKSPACE_MAP_REF, GENERATED_WORKSPACE_REPORT_REF,
    GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF, WORKSPACE_HEALTH_REF,
    WORKSPACE_INSPECTION_REF, WORKSPACE_MAP_REF, WORKSPACE_REPORT_REF,
    WORKSPACE_RESOURCE_INVENTORY_REF,
    ...profile.shared_resource_roots.map(sharedResourceManifestRef),
  ];
  for (const project of projects) {
    directories.push(project.project_root, project.control_root, project.inputs_root,
      `${project.project_root}/memory`, `${project.project_root}/state`, project.stage_outputs_root,
      project.exports_root, project.packages_root, project.review_root, project.handoff_root, project.archive_root);
    files.push(`${project.project_root}/${PROJECT_CONFIG_BASENAME}`, `${project.project_root}/${PROJECT_INDEX_BASENAME}`,
      `${project.project_root}/${ARTIFACT_LIFECYCLE_PROFILE_REF}`, project.stage_outputs_manifest_ref,
      stageOutputsIndexRef(project.stage_outputs_root), currentStagePointerRef(project.stage_outputs_root));
  }
  for (const ref of directories) assertContainedPath(workspacePath, path.resolve(workspacePath, ref), 'directory');
  for (const ref of files) assertContainedPath(workspacePath, path.resolve(workspacePath, ref), 'file');
}
