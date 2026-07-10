import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, readJsonFileResult } from '../../kernel/json-file.ts';
import { recordList, stringList, type JsonRecord } from '../../kernel/json-record.ts';

export type { JsonRecord };
export { isRecord, optionalString, recordList, stringList };

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  const result = readJsonFileResult(absolutePath);
  return {
    path: relativePath,
    status: result.status,
    payload: result.payload,
    error: result.error,
  };
}

export function gitTrackedOrWalkedFiles(repoDir: string) {
  const gitResult = spawnSync('git', ['ls-files'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  if (gitResult.status === 0 && gitResult.stdout.trim()) {
    return gitResult.stdout.split('\n').filter(Boolean).sort();
  }
  return walkFiles(repoDir).sort();
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.globSync(['**/*', '**/.*', '**/.*/**/*'], {
    cwd: root,
    withFileTypes: true,
    exclude: (entry) => entry.isSymbolicLink()
      || entry.name.startsWith('.git')
      || entry.name === 'node_modules'
      || entry.name === 'dist',
  })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

export function collectFieldValues(
  value: unknown,
  targetField: string,
  currentPath = '$',
): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectFieldValues(entry, targetField, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => {
    const fieldPath = `${currentPath}.${field}`;
    const direct = field === targetField ? [{ path: fieldPath, value: fieldValue }] : [];
    return [...direct, ...collectFieldValues(fieldValue, targetField, fieldPath)];
  });
}

export function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
