import type { AgentTriageTarget, FunctionFinding, QualityDetailsReport } from './types.ts';
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
  return `${finding.function_name} has ${finding.lines} lines, ${finding.parameters} params, complexity ${finding.cyclomatic_complexity}`;
}

function buildTriageTargets(report: Omit<QualityDetailsReport, 'agent_triage_targets'>) {
  const targets: AgentTriageTarget[] = [
    ...report.function_findings.map((finding): AgentTriageTarget => ({
      priority: 0,
      target_kind: 'function',
      file: finding.file,
      function_name: finding.function_name,
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

async function buildQualityDetails(options: {
  root: string;
  limit: number;
  focus: QualityDetailsReport['focus'];
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
