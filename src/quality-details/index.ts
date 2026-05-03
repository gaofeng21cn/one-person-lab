import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AgentTriageTarget, FunctionChangeFinding, FunctionFinding, QualityDetailsReport } from './types.ts';
import { listRepoFiles, listSourceFiles } from './filesystem.ts';
import { analyzeGraph } from './graph.ts';
import { renderQualityDetailsMarkdown } from './markdown.ts';
import { parseQualityDetailsArgs } from './options.ts';
import { analyzePythonFiles } from './python.ts';
import { analyzeRules } from './rules.ts';
import { analyzeTypescriptFiles } from './typescript.ts';
import { resolveImports } from './resolve.ts';

function byScore<T extends { score: number }>(items: T[]) {
  return [...items].sort((left, right) => right.score - left.score);
}

const SENTRUX_COMPLEX_FUNCTION_THRESHOLD = 15;

function focusMatches(report: QualityDetailsReport, target: AgentTriageTarget) {
  if (report.focus === 'auto') {
    return true;
  }
  if (report.focus === 'depth') {
    return target.target_kind === 'dependency';
  }
  if (report.focus === 'test_gaps') {
    return target.target_kind === 'test_gap';
  }
  if (report.focus === 'rules') {
    return target.target_kind === 'rules';
  }
  if (report.focus === 'modularity') {
    return target.target_kind === 'file' || target.target_kind === 'dependency';
  }
  if (report.focus === 'redundancy') {
    return target.target_kind === 'file';
  }
  if (report.focus === 'equality') {
    return target.target_kind === 'function' || target.target_kind === 'test_gap';
  }
  return true;
}

function functionReason(finding: FunctionFinding) {
  return `${finding.qualified_name} has ${finding.lines} lines, ${finding.parameters} params, complexity ${finding.cyclomatic_complexity}`;
}

function buildTriageTargets(report: Omit<QualityDetailsReport, 'agent_triage_targets'>) {
  const targets: AgentTriageTarget[] = [
    ...report.function_change_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'function',
      file: finding.file,
      function_name: finding.function_name,
      qualified_name: finding.qualified_name,
      reason: finding.reason,
      score: finding.score,
    })),
    ...report.function_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'function',
      file: finding.file,
      function_name: finding.function_name,
      qualified_name: finding.qualified_name,
      reason: functionReason(finding),
      score: finding.score,
    })),
    ...report.file_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'file',
      file: finding.file,
      reason: finding.reasons.join(', '),
      score: finding.score,
    })),
    ...report.dependency_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'dependency',
      file: finding.file,
      reason: finding.reason,
      score: finding.score,
    })),
    ...report.test_gap_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'test_gap',
      file: finding.file,
      reason: finding.reason,
      score: finding.score,
    })),
    ...report.rules_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'rules',
      file: finding.file,
      reason: finding.reason,
      score: finding.value ?? 100,
    })),
  ];

  const filtered = targets
    .filter((target) => focusMatches(report as QualityDetailsReport, target))
    .sort((left, right) => right.score - left.score)
    .slice(0, report.limit);

  return filtered.map((target, index) => ({
    ...target,
    priority: index + 1,
  }));
}

function functionKey(finding: FunctionFinding) {
  return `${finding.file}\0${finding.qualified_name}`;
}

function buildFunctionChangeFindings({
  baselineFunctions,
  currentFunctions,
  limit,
}: {
  baselineFunctions: FunctionFinding[];
  currentFunctions: FunctionFinding[];
  limit: number;
}) {
  const baselineByKey = new Map<string, FunctionFinding>();
  for (const finding of baselineFunctions) {
    baselineByKey.set(functionKey(finding), finding);
  }

  const changes: FunctionChangeFinding[] = [];
  for (const current of currentFunctions) {
    const baseline = baselineByKey.get(functionKey(current));
    const baselineComplexity = baseline?.cyclomatic_complexity ?? 0;
    if (current.cyclomatic_complexity <= SENTRUX_COMPLEX_FUNCTION_THRESHOLD) {
      continue;
    }
    if (baseline && baselineComplexity > SENTRUX_COMPLEX_FUNCTION_THRESHOLD && current.cyclomatic_complexity <= baselineComplexity) {
      continue;
    }

    const delta = current.cyclomatic_complexity - baselineComplexity;
    const kind = baselineComplexity > SENTRUX_COMPLEX_FUNCTION_THRESHOLD
      ? 'worsened_complex_function'
      : 'new_complex_function';
    const reason = `${current.qualified_name} complexity ${baseline ? baselineComplexity : 'new'} -> ${current.cyclomatic_complexity}`;
    changes.push({
      kind,
      file: current.file,
      function_name: current.function_name,
      qualified_name: current.qualified_name,
      start_line: current.start_line,
      end_line: current.end_line,
      lines: current.lines,
      parameters: current.parameters,
      baseline_start_line: baseline?.start_line,
      baseline_end_line: baseline?.end_line,
      baseline_lines: baseline?.lines,
      baseline_parameters: baseline?.parameters,
      baseline_cyclomatic_complexity: baseline?.cyclomatic_complexity,
      cyclomatic_complexity: current.cyclomatic_complexity,
      delta_complexity: delta,
      complex_function_threshold: SENTRUX_COMPLEX_FUNCTION_THRESHOLD,
      score: (Math.max(delta, 1) * 100) + current.score,
      reason,
    });
  }

  return byScore(changes).slice(0, limit);
}

function analyzeFunctionsForRoot(root: string) {
  const listedSourceFiles = listSourceFiles(root);
  const tsLikeFiles = listedSourceFiles.filter((file) => file.language === 'typescript' || file.language === 'javascript');
  const pythonFiles = listedSourceFiles.filter((file) => file.language === 'python');
  const tsAnalysis = analyzeTypescriptFiles(tsLikeFiles);
  const pythonAnalysis = analyzePythonFiles(pythonFiles);
  return [...tsAnalysis.functions, ...pythonAnalysis.functions];
}

function createBaselineWorktree(root: string, compareRef: string) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-details-baseline-'));
  const worktreePath = path.join(tempRoot, 'repo');
  const result = spawnSync('git', ['worktree', 'add', '--detach', worktreePath, compareRef], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`Unable to create baseline worktree for ${compareRef}: ${result.stderr || result.stdout}`);
  }
  return { tempRoot, worktreePath };
}

function removeBaselineWorktree(root: string, worktreePath: string, tempRoot: string) {
  spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function buildBaselineDiff(root: string, compareRef: string, currentFunctions: FunctionFinding[], limit: number) {
  const { tempRoot, worktreePath } = createBaselineWorktree(root, compareRef);
  try {
    const baselineFunctions = analyzeFunctionsForRoot(worktreePath);
    const functionChangeFindings = buildFunctionChangeFindings({
      baselineFunctions,
      currentFunctions,
      limit,
    });
    const baselineComplexFunctions = baselineFunctions.filter(
      (finding) => finding.cyclomatic_complexity > SENTRUX_COMPLEX_FUNCTION_THRESHOLD,
    ).length;
    const currentComplexFunctions = currentFunctions.filter(
      (finding) => finding.cyclomatic_complexity > SENTRUX_COMPLEX_FUNCTION_THRESHOLD,
    ).length;
    return {
      summary: {
        compare_ref: compareRef,
        complex_function_threshold: SENTRUX_COMPLEX_FUNCTION_THRESHOLD,
        baseline_complex_functions: baselineComplexFunctions,
        current_complex_functions: currentComplexFunctions,
        new_complex_functions: functionChangeFindings.filter((finding) => finding.kind === 'new_complex_function').length,
        worsened_functions: functionChangeFindings.filter((finding) => finding.kind === 'worsened_complex_function').length,
      },
      functionChangeFindings,
    };
  } finally {
    removeBaselineWorktree(root, worktreePath, tempRoot);
  }
}

async function buildQualityDetails(options: {
  root: string;
  limit: number;
  focus: QualityDetailsReport['focus'];
  compareRef?: string;
}): Promise<QualityDetailsReport> {
  const allRepoFiles = listRepoFiles(options.root);
  const listedSourceFiles = listSourceFiles(options.root);
  const tsLikeFiles = listedSourceFiles.filter((file) => file.language === 'typescript' || file.language === 'javascript');
  const pythonFiles = listedSourceFiles.filter((file) => file.language === 'python');

  const tsAnalysis = analyzeTypescriptFiles(tsLikeFiles);
  const pythonAnalysis = analyzePythonFiles(pythonFiles);
  const sourceFiles = resolveImports(options.root, [...tsAnalysis.files, ...pythonAnalysis.files])
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const functionFindings = byScore([...tsAnalysis.functions, ...pythonAnalysis.functions]).slice(0, options.limit);
  const allFunctions = [...tsAnalysis.functions, ...pythonAnalysis.functions];
  const baselineDiff = options.compareRef
    ? buildBaselineDiff(options.root, options.compareRef, allFunctions, options.limit)
    : undefined;
  const graph = analyzeGraph(sourceFiles, allFunctions, options.limit);
  const rulesFindings = analyzeRules(options.root, sourceFiles, graph.maxDepth).slice(0, options.limit);

  const reportBase = {
    surface_kind: 'opl_code_quality_details.v1' as const,
    root: options.root,
    generated_at: new Date().toISOString(),
    focus: options.focus,
    limit: options.limit,
    repo_summary: {
      files: allRepoFiles.length,
      source_files: sourceFiles.filter((file) => !file.isTest).length,
      test_files: sourceFiles.filter((file) => file.isTest).length,
      functions: allFunctions.length,
      import_edges: sourceFiles.reduce((total, file) => total + file.resolvedImports.length, 0),
      max_depth: graph.maxDepth,
      untested_source_files: graph.testGapFindings.length,
      rules_findings: rulesFindings.length,
    },
    baseline_diff: baselineDiff?.summary,
    function_change_findings: baselineDiff?.functionChangeFindings ?? [],
    function_findings: functionFindings,
    file_findings: graph.fileFindings,
    dependency_findings: graph.dependencyFindings,
    test_gap_findings: graph.testGapFindings,
    rules_findings: rulesFindings,
  };

  const report: QualityDetailsReport = {
    ...reportBase,
    agent_triage_targets: [],
  };
  report.agent_triage_targets = buildTriageTargets(reportBase);
  return report;
}

export {
  buildQualityDetails,
  parseQualityDetailsArgs,
  renderQualityDetailsMarkdown,
};
