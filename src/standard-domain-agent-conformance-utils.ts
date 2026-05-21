import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function recordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
      payload: null,
      error: null,
    };
  }
  try {
    return {
      path: relativePath,
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      path: relativePath,
      status: 'invalid_json',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'dist') {
      return [];
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(root, absolutePath);
    }
    if (!entry.isFile()) {
      return [];
    }
    return [path.relative(root, absolutePath).split(path.sep).join('/')];
  });
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
