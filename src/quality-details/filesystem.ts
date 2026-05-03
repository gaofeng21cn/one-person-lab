import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { SourceFileInfo, SourceLanguage } from './types.ts';

const SOURCE_EXTENSIONS = new Map<string, SourceLanguage>([
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.py', 'python'],
]);

const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'target',
]);

function toRepoPath(filePath: string) {
  return filePath.split(path.sep).join('/');
}

function isIgnoredPath(relativePath: string) {
  return relativePath.split('/').some((part) => IGNORED_DIRS.has(part));
}

function isTestPath(relativePath: string) {
  return /(^|\/)(tests?|__tests__|spec)(\/|$)/.test(relativePath)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
    || /_test\.py$/.test(relativePath)
    || /(^|\/)test_[^/]+\.py$/.test(relativePath);
}

function sourceLanguageFor(relativePath: string): SourceLanguage | null {
  const extension = path.extname(relativePath);
  return SOURCE_EXTENSIONS.get(extension) ?? null;
}

function walkFiles(root: string) {
  const files: string[] = [];

  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRepoPath(path.relative(root, absolutePath));
      if (isIgnoredPath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  walk(root);
  return files;
}

function gitFiles(root: string) {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function lineCount(text: string) {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function listRepoFiles(root: string) {
  const gitListed = gitFiles(root);
  const files = gitListed ?? walkFiles(root);
  return [...new Set(files)]
    .map((entry) => toRepoPath(entry))
    .filter((entry) => !path.isAbsolute(entry))
    .filter((entry) => !entry.startsWith('../'))
    .filter((entry) => !isIgnoredPath(entry))
    .sort((left, right) => left.localeCompare(right));
}

function listSourceFiles(root: string): SourceFileInfo[] {
  return listRepoFiles(root)
    .map((relativePath) => {
      const language = sourceLanguageFor(relativePath);
      if (!language) {
        return null;
      }
      const absolutePath = path.join(root, relativePath);
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        return null;
      }
      const text = fs.readFileSync(absolutePath, 'utf8');
      const info: SourceFileInfo = {
        absolutePath,
        relativePath,
        language,
        lineCount: lineCount(text),
        importTargets: [],
        resolvedImports: [],
        isTest: isTestPath(relativePath),
      };
      return info;
    })
    .filter((entry): entry is SourceFileInfo => entry !== null);
}

export {
  listRepoFiles,
  listSourceFiles,
  sourceLanguageFor,
  toRepoPath,
};
