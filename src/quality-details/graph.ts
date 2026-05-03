import path from 'node:path';

import type {
  DependencyFinding,
  FileFinding,
  FunctionFinding,
  SourceFileInfo,
  TestGapFinding,
} from './types.ts';

type GraphAnalysis = {
  fileFindings: FileFinding[];
  dependencyFindings: DependencyFinding[];
  testGapFindings: TestGapFinding[];
  maxDepth: number;
};

function buildIncoming(files: SourceFileInfo[]) {
  const incoming = new Map<string, Set<string>>();
  for (const file of files) {
    incoming.set(file.relativePath, incoming.get(file.relativePath) ?? new Set<string>());
  }
  for (const file of files) {
    for (const target of file.resolvedImports) {
      incoming.set(target, incoming.get(target) ?? new Set<string>());
      incoming.get(target)!.add(file.relativePath);
    }
  }
  return incoming;
}

function longestPathFrom(file: string, adjacency: Map<string, string[]>, visiting = new Set<string>()) {
  if (visiting.has(file)) {
    return [file];
  }
  const nextFiles = adjacency.get(file) ?? [];
  if (nextFiles.length === 0) {
    return [file];
  }

  visiting.add(file);
  let longest = [file];
  for (const nextFile of nextFiles) {
    const candidate = [file, ...longestPathFrom(nextFile, adjacency, visiting)];
    if (candidate.length > longest.length) {
      longest = candidate;
    }
  }
  visiting.delete(file);
  return longest;
}

function moduleTokens(relativePath: string) {
  const extension = path.extname(relativePath);
  const withoutExtension = relativePath.slice(0, relativePath.length - extension.length);
  const basename = path.basename(withoutExtension);
  return new Set([
    relativePath,
    withoutExtension,
    basename,
    basename.replace(/[-.]/g, '_'),
  ].filter(Boolean));
}

function testReferencesSource(source: SourceFileInfo, tests: SourceFileInfo[]) {
  const tokens = moduleTokens(source.relativePath);
  return tests.some((test) => {
    const imports = [...test.importTargets, ...test.resolvedImports];
    return imports.some((entry) => {
      const normalized = entry.replace(/\\/g, '/');
      for (const token of tokens) {
        if (normalized.includes(token)) {
          return true;
        }
      }
      return false;
    });
  });
}

function analyzeGraph(files: SourceFileInfo[], functions: FunctionFinding[], limit: number): GraphAnalysis {
  const sourceFiles = files.filter((file) => !file.isTest);
  const testFiles = files.filter((file) => file.isTest);
  const functionsByFile = new Map<string, FunctionFinding[]>();
  for (const item of functions) {
    const entries = functionsByFile.get(item.file) ?? [];
    entries.push(item);
    functionsByFile.set(item.file, entries);
  }

  const incoming = buildIncoming(files);
  const adjacency = new Map(sourceFiles.map((file) => [
    file.relativePath,
    file.resolvedImports.filter((target) => sourceFiles.some((source) => source.relativePath === target)),
  ]));

  const paths = sourceFiles
    .map((file) => longestPathFrom(file.relativePath, adjacency))
    .sort((left, right) => right.length - left.length);
  const maxPath = paths[0] ?? [];
  const maxDepth = Math.max(0, maxPath.length - 1);

  const fileFindings = sourceFiles
    .map((file) => {
      const functionCount = functionsByFile.get(file.relativePath)?.length ?? 0;
      const fanIn = incoming.get(file.relativePath)?.size ?? 0;
      const fanOut = file.resolvedImports.length;
      const reasons: string[] = [];
      if (file.lineCount >= 400) {
        reasons.push(`lines ${file.lineCount}`);
      }
      if (fanOut >= 8) {
        reasons.push(`fan-out ${fanOut}`);
      }
      if (fanIn >= 8) {
        reasons.push(`fan-in ${fanIn}`);
      }
      if (functionCount >= 20) {
        reasons.push(`functions ${functionCount}`);
      }
      const score = file.lineCount + (fanOut * 15) + (fanIn * 10) + (functionCount * 4);
      return {
        kind: 'file_metric' as const,
        file: file.relativePath,
        lines: file.lineCount,
        functions: functionCount,
        fan_in: fanIn,
        fan_out: fanOut,
        score,
        reasons: reasons.length > 0 ? reasons : [`score ${score}`],
      };
    })
    .filter((finding) => finding.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  const dependencyFindings: DependencyFinding[] = [];
  for (const path of paths.filter((item) => item.length > 1).slice(0, Math.min(limit, 10))) {
    dependencyFindings.push({
      kind: 'deep_dependency_path',
      path,
      depth: path.length - 1,
      score: path.length * 25,
      reason: `source import path has depth ${path.length - 1}`,
    });
  }

  for (const file of sourceFiles) {
    const fanOut = file.resolvedImports.length;
    const fanIn = incoming.get(file.relativePath)?.size ?? 0;
    if (fanOut >= 8) {
      dependencyFindings.push({
        kind: 'high_fan_out',
        file: file.relativePath,
        path: [file.relativePath, ...file.resolvedImports],
        depth: 1,
        fan_out: fanOut,
        score: fanOut * 20,
        reason: `source file imports ${fanOut} local files`,
      });
    }
    if (fanIn >= 8) {
      dependencyFindings.push({
        kind: 'high_fan_in',
        file: file.relativePath,
        path: [file.relativePath],
        depth: 0,
        fan_in: fanIn,
        score: fanIn * 16,
        reason: `source file is imported by ${fanIn} local files`,
      });
    }
  }

  const testGapFindings = sourceFiles
    .filter((file) => !testReferencesSource(file, testFiles))
    .map((file): TestGapFinding => ({
      kind: 'untested_source',
      file: file.relativePath,
      language: file.language,
      functions: functionsByFile.get(file.relativePath)?.length ?? 0,
      fan_in: incoming.get(file.relativePath)?.size ?? 0,
      fan_out: file.resolvedImports.length,
      score: file.lineCount + ((incoming.get(file.relativePath)?.size ?? 0) * 12) + (file.resolvedImports.length * 10),
      reason: 'no local test import/reference matched this source file',
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return {
    fileFindings,
    dependencyFindings: dependencyFindings.sort((left, right) => right.score - left.score).slice(0, limit),
    testGapFindings,
    maxDepth,
  };
}

export { analyzeGraph };
