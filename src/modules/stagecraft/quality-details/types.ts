type QualityDetailsFormat = 'json' | 'markdown';
type QualityDetailsFocus =
  | 'auto'
  | 'depth'
  | 'equality'
  | 'modularity'
  | 'redundancy'
  | 'test_gaps'
  | 'rules';

type QualityDetailsOptions = {
  root: string;
  format: QualityDetailsFormat;
  limit: number;
  focus: QualityDetailsFocus;
  compareRef?: string;
};

type SourceLanguage = 'typescript' | 'javascript' | 'python';

type SourceFileInfo = {
  absolutePath: string;
  relativePath: string;
  language: SourceLanguage;
  lineCount: number;
  importTargets: string[];
  resolvedImports: string[];
  isTest: boolean;
};

type FunctionFinding = {
  kind: 'function_metric';
  file: string;
  function_name: string;
  qualified_name: string;
  start_line: number;
  end_line: number;
  lines: number;
  parameters: number;
  cyclomatic_complexity: number;
  score: number;
  reasons: string[];
};

type FunctionChangeFinding = {
  kind: 'new_complex_function' | 'worsened_complex_function';
  file: string;
  function_name: string;
  qualified_name: string;
  start_line: number;
  end_line: number;
  lines: number;
  parameters: number;
  baseline_start_line?: number;
  baseline_end_line?: number;
  baseline_lines?: number;
  baseline_parameters?: number;
  baseline_cyclomatic_complexity?: number;
  cyclomatic_complexity: number;
  delta_complexity: number;
  complex_function_threshold: number;
  score: number;
  reason: string;
};

type BaselineDiffSummary = {
  compare_ref: string;
  complex_function_threshold: number;
  baseline_complex_functions: number;
  current_complex_functions: number;
  new_complex_functions: number;
  worsened_functions: number;
};

type FileFinding = {
  kind: 'file_metric';
  file: string;
  lines: number;
  functions: number;
  fan_in: number;
  fan_out: number;
  score: number;
  reasons: string[];
};

type DependencyFinding = {
  kind: 'deep_dependency_path' | 'high_fan_out' | 'high_fan_in';
  file?: string;
  path: string[];
  depth: number;
  fan_in?: number;
  fan_out?: number;
  score: number;
  reason: string;
};

type TestGapFinding = {
  kind: 'untested_source';
  file: string;
  language: SourceLanguage;
  functions: number;
  fan_in: number;
  fan_out: number;
  score: number;
  reason: string;
};

type RulesFinding = {
  kind: 'rule_violation';
  rule_kind:
    | 'max_depth'
    | 'max_file_lines'
    | 'max_cycles'
    | 'layer_boundary'
    | 'layer_unmatched'
    | 'rules_parse_error';
  file?: string;
  from?: string;
  to?: string;
  path?: string[];
  value?: number;
  limit?: number;
  reason: string;
};

type AgentTriageTarget = {
  priority: number;
  target_kind: 'function' | 'file' | 'dependency' | 'test_gap' | 'rules';
  file?: string;
  function_name?: string;
  qualified_name?: string;
  reason: string;
  score: number;
};

type QualityDetailsReport = {
  surface_kind: 'opl_code_quality_details.v1';
  root: string;
  generated_at: string;
  focus: QualityDetailsFocus;
  limit: number;
  repo_summary: {
    files: number;
    source_files: number;
    test_files: number;
    functions: number;
    import_edges: number;
    max_depth: number;
    untested_source_files: number;
    rules_findings: number;
  };
  baseline_diff?: BaselineDiffSummary;
  function_change_findings: FunctionChangeFinding[];
  function_findings: FunctionFinding[];
  file_findings: FileFinding[];
  dependency_findings: DependencyFinding[];
  test_gap_findings: TestGapFinding[];
  rules_findings: RulesFinding[];
  agent_triage_targets: AgentTriageTarget[];
};

export type {
  AgentTriageTarget,
  DependencyFinding,
  FileFinding,
  BaselineDiffSummary,
  FunctionChangeFinding,
  FunctionFinding,
  QualityDetailsFocus,
  QualityDetailsFormat,
  QualityDetailsOptions,
  QualityDetailsReport,
  RulesFinding,
  SourceFileInfo,
  SourceLanguage,
  TestGapFinding,
};
