import type { QualityDetailsReport } from './types.ts';

function table(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    return '_No findings._\n';
  }
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`),
  ].join('\n') + '\n';
}

function renderQualityDetailsMarkdown(report: QualityDetailsReport) {
  const summary = report.repo_summary;
  const lines = [
    '# OPL Quality Details',
    '',
    `Root: \`${report.root}\``,
    `Focus: \`${report.focus}\``,
    `Files: ${summary.source_files} source / ${summary.test_files} test; functions: ${summary.functions}; import edges: ${summary.import_edges}; max depth: ${summary.max_depth}; untested sources: ${summary.untested_source_files}; rules findings: ${summary.rules_findings}.`,
    '',
    '## Agent Triage Targets',
    '',
    table(
      ['Priority', 'Kind', 'Target', 'Reason', 'Score'],
      report.agent_triage_targets.map((target) => [
        String(target.priority),
        target.target_kind,
        [target.file, target.function_name].filter(Boolean).join(' :: '),
        target.reason,
        String(Math.round(target.score)),
      ]),
    ),
    '## Function Findings',
    '',
    table(
      ['File', 'Function', 'Lines', 'Params', 'Complexity', 'Reasons'],
      report.function_findings.map((finding) => [
        `${finding.file}:${finding.start_line}`,
        finding.function_name,
        String(finding.lines),
        String(finding.parameters),
        String(finding.cyclomatic_complexity),
        finding.reasons.join(', '),
      ]),
    ),
    '## Dependency Findings',
    '',
    table(
      ['Kind', 'File/Path', 'Depth', 'Reason'],
      report.dependency_findings.map((finding) => [
        finding.kind,
        finding.file ?? finding.path.join(' -> '),
        String(finding.depth),
        finding.reason,
      ]),
    ),
    '## Test Gap Findings',
    '',
    table(
      ['File', 'Language', 'Functions', 'Fan In', 'Fan Out', 'Reason'],
      report.test_gap_findings.map((finding) => [
        finding.file,
        finding.language,
        String(finding.functions),
        String(finding.fan_in),
        String(finding.fan_out),
        finding.reason,
      ]),
    ),
    '## Rules Findings',
    '',
    table(
      ['Rule', 'File', 'Value', 'Limit', 'Reason'],
      report.rules_findings.map((finding) => [
        finding.rule_kind,
        finding.file ?? finding.path?.join(' -> ') ?? '',
        finding.value === undefined ? '' : String(finding.value),
        finding.limit === undefined ? '' : String(finding.limit),
        finding.reason,
      ]),
    ),
  ];

  return lines.join('\n');
}

export { renderQualityDetailsMarkdown };
