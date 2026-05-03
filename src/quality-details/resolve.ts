import fs from 'node:fs';
import path from 'node:path';

import type { SourceFileInfo } from './types.ts';

const JS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const PY_EXTENSIONS = ['.py'];

function normalize(relativePath: string) {
  return relativePath.split(path.sep).join('/');
}

function candidateFiles(basePath: string, extensions: string[]) {
  const extension = path.extname(basePath);
  const candidates = extension ? [basePath] : extensions.map((item) => `${basePath}${item}`);
  return [
    ...candidates,
    ...extensions.map((item) => path.join(basePath, `index${item}`)),
    ...extensions.map((item) => path.join(basePath, `__init__${item}`)),
  ];
}

function firstExisting(root: string, candidates: string[], fileSet: Set<string>) {
  for (const candidate of candidates) {
    const relativePath = normalize(path.relative(root, candidate));
    if (fileSet.has(relativePath) && fs.existsSync(candidate)) {
      return relativePath;
    }
  }
  return null;
}

function resolveJsImport(root: string, fromRelativePath: string, specifier: string, fileSet: Set<string>) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const fromDirectory = path.dirname(path.join(root, fromRelativePath));
  const basePath = path.resolve(fromDirectory, specifier);
  return firstExisting(root, candidateFiles(basePath, JS_EXTENSIONS), fileSet);
}

function resolvePythonImport(root: string, fromRelativePath: string, specifier: string, fileSet: Set<string>) {
  const fromDirectory = path.dirname(path.join(root, fromRelativePath));

  if (specifier.startsWith('.')) {
    const dotMatch = specifier.match(/^(\.+)(.*)$/);
    const dots = dotMatch?.[1].length ?? 1;
    const moduleTail = dotMatch?.[2] ?? '';
    let baseDirectory = fromDirectory;
    for (let index = 1; index < dots; index += 1) {
      baseDirectory = path.dirname(baseDirectory);
    }
    const basePath = moduleTail
      ? path.join(baseDirectory, ...moduleTail.split('.').filter(Boolean))
      : baseDirectory;
    return firstExisting(root, candidateFiles(basePath, PY_EXTENSIONS), fileSet);
  }

  const modulePath = specifier.split('.').filter(Boolean).join(path.sep);
  const roots = [root, path.join(root, 'src')];
  for (const candidateRoot of roots) {
    const resolved = firstExisting(root, candidateFiles(path.join(candidateRoot, modulePath), PY_EXTENSIONS), fileSet);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveImports(root: string, files: SourceFileInfo[]) {
  const fileSet = new Set(files.map((file) => file.relativePath));

  return files.map((file) => {
    const resolvedImports = file.importTargets
      .map((specifier) => {
        if (file.language === 'python') {
          return resolvePythonImport(root, file.relativePath, specifier, fileSet);
        }
        return resolveJsImport(root, file.relativePath, specifier, fileSet);
      })
      .filter((entry): entry is string => entry !== null);

    return {
      ...file,
      resolvedImports: [...new Set(resolvedImports)].sort((left, right) => left.localeCompare(right)),
    };
  });
}

export { resolveImports };
