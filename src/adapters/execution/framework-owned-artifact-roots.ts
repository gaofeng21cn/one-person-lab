import fs from 'node:fs';
import path from 'node:path';

import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

// Artifacts the framework itself produced live under the OPL state directory, not under the
// domain workspace root. A producer that closes out with a raw artifact leaves its bytes in
// <state_dir>/runtime-state/stage-attempt-artifacts/<attempt>/, and every Attempt identity
// receipt lands in <state_dir>/runtime-state/stage-artifact-identities/<attempt>/.
//
// Those bytes are framework-owned rather than model-claimed, so a containment check that
// only admits the workspace root refuses exactly the artifacts the Stage needs to hand on:
// design-basis-admission died with reviewer_input_snapshot_source_path_escape and
// stage-architecture died with referenced_closeout_ref_outside_workspace before either
// could finish. Admit the framework subtrees in addition to the workspace root.
const FRAMEWORK_ARTIFACT_SUBTREES = [
  ['runtime-state', 'stage-attempt-artifacts'],
  ['runtime-state', 'stage-artifact-identities'],
] as const;

export function frameworkOwnedArtifactRoots() {
  let stateDir: string;
  try {
    stateDir = resolveOplStatePaths().state_dir;
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const segments of FRAMEWORK_ARTIFACT_SUBTREES) {
    const candidate = path.join(stateDir, ...segments);
    try {
      if (fs.existsSync(candidate)) roots.push(fs.realpathSync.native(candidate));
    } catch {
      // A missing or unreadable subtree simply contributes no allowed root.
    }
  }
  return roots;
}

export function pathInsideRoots(candidate: string, roots: readonly string[]) {
  let realCandidate: string;
  try {
    realCandidate = fs.realpathSync.native(candidate);
  } catch {
    return false;
  }
  return roots.some((root) => {
    let realRoot: string;
    try {
      realRoot = fs.realpathSync.native(root);
    } catch {
      return false;
    }
    const relative = path.relative(realRoot, realCandidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
}
