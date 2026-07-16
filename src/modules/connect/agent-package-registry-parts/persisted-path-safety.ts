import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

type PersistedPathInput = {
  candidatePath: string;
  allowedRoots: string[];
  pathKind: string;
};

type PersistedPathRemovalInput = PersistedPathInput & {
  recursive?: boolean;
};

function strictlyInside(candidate: string, root: string) {
  return candidate !== root && candidate.startsWith(`${root}${path.sep}`);
}

function unsafePersistedPath(input: PersistedPathInput, reason: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Persisted agent package path is outside its managed removal boundary.',
    {
      candidate_path: input.candidatePath,
      allowed_roots: input.allowedRoots,
      path_kind: input.pathKind,
      reason,
      failure_code: 'agent_package_persisted_path_unsafe',
    },
  );
}

function existingAncestor(candidate: string) {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function assertNoSymlinkBelowRoot(root: string, candidate: string, input: PersistedPathInput) {
  const relative = path.relative(root, candidate);
  if (!relative) return;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    unsafePersistedPath(input, 'candidate_not_strictly_below_allowed_root');
  }
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) unsafePersistedPath(input, 'symlink_component');
  }
}

function safeAgainstRoot(candidate: string, root: string, input: PersistedPathInput) {
  const normalizedRoot = path.resolve(root);
  if (!strictlyInside(candidate, normalizedRoot)) return false;

  const rootAncestor = existingAncestor(normalizedRoot);
  const candidateAncestor = existingAncestor(candidate);
  if (!rootAncestor || !candidateAncestor) return false;

  if (fs.existsSync(normalizedRoot)) {
    const rootStat = fs.lstatSync(normalizedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return false;
    const rootReal = fs.realpathSync(normalizedRoot);
    const candidateAncestorReal = fs.realpathSync(candidateAncestor);
    if (candidateAncestor !== normalizedRoot
      && !strictlyInside(candidateAncestorReal, rootReal)) return false;
    if (candidateAncestor === normalizedRoot && candidateAncestorReal !== rootReal) return false;
    assertNoSymlinkBelowRoot(normalizedRoot, candidateAncestor, input);
    if (fs.existsSync(candidate)) {
      const candidateReal = fs.realpathSync(candidate);
      if (!strictlyInside(candidateReal, rootReal)) return false;
    }
    return true;
  }

  const rootAncestorReal = fs.realpathSync(rootAncestor);
  const candidateAncestorReal = fs.realpathSync(candidateAncestor);
  return candidateAncestorReal === rootAncestorReal;
}

export function assertSafePersistedPackagePath(input: PersistedPathInput) {
  if (!path.isAbsolute(input.candidatePath)) unsafePersistedPath(input, 'candidate_not_absolute');
  if (input.allowedRoots.length === 0 || input.allowedRoots.some((root) => !path.isAbsolute(root))) {
    unsafePersistedPath(input, 'allowed_root_invalid');
  }
  const candidate = path.resolve(input.candidatePath);
  if (!input.allowedRoots.some((root) => safeAgainstRoot(candidate, root, input))) {
    unsafePersistedPath(input, 'candidate_outside_allowed_roots');
  }
  return candidate;
}

export function removeSafePersistedPackagePath(input: PersistedPathRemovalInput) {
  const candidate = assertSafePersistedPackagePath(input);
  if (!fs.existsSync(candidate)) return false;
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink()) unsafePersistedPath(input, 'symlink_at_removal_boundary');
  fs.rmSync(candidate, { recursive: input.recursive === true, force: true });
  return true;
}
