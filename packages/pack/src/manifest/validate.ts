import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import {
  OplPackageManifestV2Schema,
  isSafeRelativePosixPath,
  type OplPackageManifestV2,
} from './schema.ts';

export function parsePackageManifestV2(input: unknown): OplPackageManifestV2 {
  const result = OplPackageManifestV2Schema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const issuePath = firstIssue?.path?.length ? firstIssue.path.join('.') : 'root';
    throw new PackError(
      'INVALID_MANIFEST',
      `Invalid opl-package.json v2 manifest at '${issuePath}': ${firstIssue?.message ?? result.error.message}`,
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    );
  }
  return result.data;
}

export function safeParsePackageManifestV2(
  input: unknown,
): { ok: true; data: OplPackageManifestV2 } | { ok: false; error: PackError } {
  try {
    return { ok: true, data: parsePackageManifestV2(input) };
  } catch (error) {
    if (error instanceof PackError) {
      return { ok: false, error };
    }
    return {
      ok: false,
      error: new PackError('INVALID_MANIFEST', error instanceof Error ? error.message : String(error)),
    };
  }
}

export function normalizeRelativePosixPath(relativePath: string): string {
  if (!isSafeRelativePosixPath(relativePath)) {
    throw new PackError('INVALID_INPUT', `Unsafe relative package path: '${relativePath}'.`, {
      path: relativePath,
    });
  }
  return relativePath.startsWith('./') ? relativePath.slice(2) : relativePath;
}

export function isWithinDirectory(parentRealPath: string, targetPath: string): boolean {
  const rel = path.relative(parentRealPath, targetPath);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export function resolveSafePackagePath(
  packageRoot: string,
  relativePath: string,
  options: { allowSymlinks?: boolean } = {},
): string {
  const cleanRel = normalizeRelativePosixPath(relativePath);
  const realRoot = fs.realpathSync(packageRoot);
  const resolved = path.resolve(realRoot, cleanRel);
  if (!isWithinDirectory(realRoot, resolved)) {
    throw new PackError('PACK_SYMLINK_ESCAPE', `Path '${relativePath}' escapes package root.`, {
      package_root: realRoot,
      path: relativePath,
    });
  }

  const segments = cleanRel.split('/');
  let current = realRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const lstat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!lstat) {
      throw new PackError('PACK_MISSING_PATH', `Manifest-referenced path '${relativePath}' does not exist.`, {
        package_root: realRoot,
        path: relativePath,
      });
    }
    if (lstat.isSymbolicLink()) {
      let targetReal: string;
      try {
        targetReal = fs.realpathSync(current);
      } catch {
        throw new PackError(
          'PACK_SYMLINK_ESCAPE',
          `Dangling symlink at '${relativePath}' inside package root.`,
          { package_root: realRoot, path: relativePath },
        );
      }
      if (!isWithinDirectory(realRoot, targetReal)) {
        throw new PackError(
          'PACK_SYMLINK_ESCAPE',
          `Symlink '${relativePath}' escapes package root (${targetReal}).`,
          { package_root: realRoot, path: relativePath, target: targetReal },
        );
      }
      if (!options.allowSymlinks) {
        throw new PackError(
          'PACK_SYMLINK_ESCAPE',
          `Symlink '${relativePath}' is not allowed inside physical package payloads.`,
          { package_root: realRoot, path: relativePath },
        );
      }
    }
  }
  return fs.realpathSync(resolved);
}
