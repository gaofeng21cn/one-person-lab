import { spawnSync } from 'node:child_process';

import type { FunctionFinding, SourceFileInfo } from './types.ts';

type PythonFunctionMetric = {
  function_name: string;
  start_line: number;
  end_line: number;
  lines: number;
  parameters: number;
  cyclomatic_complexity: number;
};

type PythonFileMetric = {
  file: string;
  imports: string[];
  functions: PythonFunctionMetric[];
};

const PYTHON_ANALYZER = String.raw`
import ast
import json
import sys

def complexity(node):
    value = 1
    for child in ast.walk(node):
        if child is node:
            continue
        if isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.IfExp, ast.Assert)):
            value += 1
        elif isinstance(child, ast.BoolOp):
            value += max(1, len(child.values) - 1)
        elif isinstance(child, ast.comprehension):
            value += 1
        elif isinstance(child, ast.Match):
            value += max(1, len(child.cases))
    return value

def imports_for(tree):
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            prefix = "." * node.level
            module = node.module or ""
            imports.add(prefix + module)
            if node.level > 0:
                for alias in node.names:
                    imports.add(prefix + ".".join(part for part in [module, alias.name] if part))
    return sorted(imports)

payload = json.load(sys.stdin)
result = []
for item in payload:
    text = open(item["absolutePath"], "r", encoding="utf-8").read()
    tree = ast.parse(text, filename=item["relativePath"])
    functions = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = getattr(node, "lineno", 1)
            end = getattr(node, "end_lineno", start)
            args = node.args
            parameter_count = len(args.posonlyargs) + len(args.args) + len(args.kwonlyargs)
            if args.vararg:
                parameter_count += 1
            if args.kwarg:
                parameter_count += 1
            functions.append({
                "function_name": node.name,
                "start_line": start,
                "end_line": end,
                "lines": max(1, end - start + 1),
                "parameters": parameter_count,
                "cyclomatic_complexity": complexity(node),
            })
    result.append({
        "file": item["relativePath"],
        "imports": imports_for(tree),
        "functions": sorted(functions, key=lambda entry: (entry["start_line"], entry["function_name"])),
    })
print(json.dumps(result))
`;

function scoreFunction(lines: number, parameters: number, complexity: number) {
  return (complexity * 6) + (parameters * 3) + Math.min(lines, 200);
}

function reasonsFor(lines: number, parameters: number, complexity: number) {
  const reasons: string[] = [];
  if (complexity >= 8) {
    reasons.push(`complexity ${complexity}`);
  }
  if (parameters >= 5) {
    reasons.push(`parameters ${parameters}`);
  }
  if (lines >= 80) {
    reasons.push(`lines ${lines}`);
  }
  if (reasons.length === 0) {
    reasons.push(`score ${scoreFunction(lines, parameters, complexity)}`);
  }
  return reasons;
}

function analyzePythonFiles(files: SourceFileInfo[]) {
  if (files.length === 0) {
    return { files, functions: [] as FunctionFinding[] };
  }

  const result = spawnSync('python3', ['-c', PYTHON_ANALYZER], {
    input: JSON.stringify(files.map((file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
    }))),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`Python AST analyzer failed: ${result.stderr || result.stdout}`);
  }

  const parsed = JSON.parse(result.stdout) as PythonFileMetric[];
  const metricsByFile = new Map(parsed.map((entry) => [entry.file, entry]));
  const functions: FunctionFinding[] = [];

  for (const file of files) {
    const metric = metricsByFile.get(file.relativePath);
    if (!metric) {
      continue;
    }
    for (const item of metric.functions) {
      functions.push({
        kind: 'function_metric',
        file: file.relativePath,
        function_name: item.function_name,
        start_line: item.start_line,
        end_line: item.end_line,
        lines: item.lines,
        parameters: item.parameters,
        cyclomatic_complexity: item.cyclomatic_complexity,
        score: scoreFunction(item.lines, item.parameters, item.cyclomatic_complexity),
        reasons: reasonsFor(item.lines, item.parameters, item.cyclomatic_complexity),
      });
    }
  }

  return {
    files: files.map((file) => ({
      ...file,
      importTargets: metricsByFile.get(file.relativePath)?.imports ?? [],
    })),
    functions,
  };
}

export { analyzePythonFiles };
