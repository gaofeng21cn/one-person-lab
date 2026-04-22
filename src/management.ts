import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { findDomainOrThrow, GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEndpoints,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from './frontdesk-paths.ts';
import { getFrontDeskServiceStatus } from './frontdesk-service.ts';
import {
  buildDomainManifestCatalog,
  type DomainManifestCatalogEntry,
} from './domain-manifest.ts';
import type { NormalizedDomainManifest } from './domain-manifest.ts';
import {
  buildDomainEntryParity,
  buildRecommendedEntrySurfaces,
} from './family-domain-catalog.ts';
import {
  buildHermesSessionsListArgs,
  inspectHermesRuntime,
  parseHermesSessionsTable,
  runHermesCommand,
} from './hermes.ts';
import { buildFrontDeskShellMcpWiring } from './frontdesk-shell-identity.ts';
import { readFrontDeskRuntimeModes } from './frontdesk-runtime-modes.ts';
import { buildSessionLedger } from './session-ledger.ts';
import { buildOplApiCatalog } from './opl-api-paths.ts';
import {
  collectHermesProcessUsage,
  normalizeCommandOutput,
  parseHermesStatusOutput,
} from './runtime-observer.ts';
import { buildWorkspaceCatalog, getActiveWorkspaceBinding } from './workspace-registry.ts';
import {
  humanizeProgressCode,
  readStatusNarrationContract,
  statusNarrationLatestUpdate,
  statusNarrationNextStep,
  statusNarrationStageSummary,
  statusNarrationSummary,
} from './status-narration.ts';
import type { GatewayContracts } from './types.ts';

export interface WorkspaceStatusOptions {
  workspacePath?: string;
}

export interface RuntimeStatusOptions {
  sessionsLimit?: number;
  ledgerLimit?: number;
}

export interface DashboardOptions extends WorkspaceStatusOptions, RuntimeStatusOptions {
  basePath?: string;
}

export interface StartSurfaceOptions {
  projectId: string;
  modeId?: string;
}

export interface HostedPilotBundleOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type GitCommandResult = CommandResult & {
  ok: boolean;
  text: string;
};

function runCommand(command: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = runCommand('git', ['-C', cwd, ...args]);

  return {
    ...result,
    ok: result.exitCode === 0,
    text: normalizeCommandOutput(result.stdout, result.stderr),
  };
}

function parseStatusLine(statusLine: string) {
  const branchMatch = statusLine.match(/^##\s+([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(.+)\])?$/);

  return {
    raw: statusLine,
    branch: branchMatch?.[1] ?? null,
    upstream: branchMatch?.[2] ?? null,
    upstream_state: branchMatch?.[3] ?? null,
  };
}

function buildWorkspaceEntriesSummary(absolutePath: string) {
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).length;
  const files = entries.filter((entry) => entry.isFile()).length;
  const others = entries.length - directories - files;

  return {
    total: entries.length,
    directories,
    files,
    others,
    sample: entries
      .slice(0, 12)
      .map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      })),
  };
}

function buildGitWorkspaceStatus(absolutePath: string) {
  const inside = runGit(absolutePath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.text !== 'true') {
    return {
      inside_work_tree: false,
    };
  }

  const root = runGit(absolutePath, ['rev-parse', '--show-toplevel']);
  const gitDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const commonDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const status = runGit(absolutePath, ['status', '--short', '--branch']);
  const lines = status.ok
    ? status.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
    : [];
  const statusLine = lines[0] ?? null;
  const fileLines = lines.slice(statusLine ? 1 : 0);

  const stagedCount = fileLines.filter((line) => {
    const indexStatus = line[0];
    return indexStatus && indexStatus !== ' ' && indexStatus !== '?';
  }).length;
  const modifiedCount = fileLines.filter((line) => {
    const worktreeStatus = line[1];
    return worktreeStatus && worktreeStatus !== ' ';
  }).length;
  const untrackedCount = fileLines.filter((line) => line.startsWith('??')).length;

  return {
    inside_work_tree: true,
    root: root.ok ? root.text : absolutePath,
    git_dir: gitDir.ok ? gitDir.text : null,
    git_common_dir: commonDir.ok ? commonDir.text : null,
    linked_worktree: Boolean(gitDir.ok && commonDir.ok && gitDir.text !== commonDir.text),
    status_line: statusLine,
    branch: statusLine ? parseStatusLine(statusLine).branch : null,
    upstream: statusLine ? parseStatusLine(statusLine).upstream : null,
    upstream_state: statusLine ? parseStatusLine(statusLine).upstream_state : null,
    modified_count: modifiedCount,
    staged_count: stagedCount,
    untracked_count: untrackedCount,
    is_clean: fileLines.length === 0,
  };
}

function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());

  if (!fs.existsSync(resolved)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace-status requires an existing path.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readOptionalJsonRecord(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function runJsonShellCommand(command: string | null, cwd: string) {
  if (!command) {
    return {
      payload: null,
      error: null,
    };
  }

  const result = spawnSync('/bin/bash', ['-lc', command], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error || (result.status ?? 1) !== 0) {
    const failure = normalizeCommandOutput(result.stdout ?? '', result.stderr ?? result.error?.message ?? '');
    return {
      payload: null,
      error: failure || 'Command execution failed.',
    };
  }

  try {
    const parsed = JSON.parse(result.stdout ?? '');
    if (!isRecord(parsed)) {
      return {
        payload: null,
        error: 'Command returned a JSON payload that is not an object.',
      };
    }

    return {
      payload: parsed,
      error: null,
    };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : 'Command did not return valid JSON.',
    };
  }
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalText(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeInlineText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/\r?\n+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\\$/g, '')
    .trim();

  return normalized ? normalized : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkedField(markdown: string | null, label: string) {
  if (!markdown) {
    return null;
  }

  const pattern = new RegExp(
    `\\*\\*${escapeRegex(label)}:\\*\\*\\s*([\\s\\S]*?)(?:\\\\\\s*$|\\n\\*\\*|\\n##|\\n#|$)`,
    'im',
  );
  const match = markdown.match(pattern);
  return normalizeInlineText(match?.[1] ?? null);
}

function extractFrontMatterTitle(markdown: string | null) {
  if (!markdown) {
    return null;
  }

  const match = markdown.match(/^title:\s*"(.+)"$/m);
  return normalizeInlineText(match?.[1] ?? null);
}

function summarizeFigureCounts(figureCatalog: Record<string, unknown> | null) {
  const figures = Array.isArray(figureCatalog?.figures)
    ? figureCatalog.figures.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  let main = 0;
  let supplementary = 0;

  for (const figure of figures) {
    const figureId = optionalString(figure.figure_id);
    const paperRole = optionalString(figure.paper_role);
    const isSupplementary = (figureId && /^S/i.test(figureId)) || paperRole === 'supplementary';
    if (isSupplementary) {
      supplementary += 1;
    } else {
      main += 1;
    }
  }

  return {
    main: figures.length > 0 ? main : null,
    supplementary: figures.length > 0 ? supplementary : null,
  };
}

function summarizeTableCounts(tableCatalog: Record<string, unknown> | null) {
  const tables = Array.isArray(tableCatalog?.tables)
    ? tableCatalog.tables.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  let main = 0;
  let supplementary = 0;

  for (const table of tables) {
    const tableId = optionalString(table.table_id);
    const paperRole = optionalString(table.paper_role);
    const isSupplementary = (tableId && /^TA/i.test(tableId)) || paperRole === 'supplementary';
    if (isSupplementary) {
      supplementary += 1;
    } else {
      main += 1;
    }
  }

  return {
    main: tables.length > 0 ? main : null,
    supplementary: tables.length > 0 ? supplementary : null,
  };
}

function buildPaperFacingSnapshot(options: {
  studyRoot: string | null;
  questRoot: string | null;
  publicationObjective: string | null;
  paperFramingSummary: string | null;
}) {
  const studyMatrixPath = options.studyRoot
    ? path.join(options.studyRoot, 'paper', 'paper_experiment_matrix.json')
    : null;
  const reviewManuscriptPath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'build', 'review_manuscript.md')
    : null;
  const figureCatalogPath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'figures', 'figure_catalog.json')
    : null;
  const tableCatalogPath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'tables', 'table_catalog.json')
    : null;
  const referenceCoveragePath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'reference_coverage_report.json')
    : null;
  const compileReportPath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'build', 'compile_report.json')
    : null;
  const bundleManifestPath = options.questRoot
    ? path.join(options.questRoot, 'paper', 'paper_bundle_manifest.json')
    : null;

  const matrix = readOptionalJsonRecord(studyMatrixPath);
  const reviewManuscript = readOptionalText(reviewManuscriptPath);
  const figureCatalog = readOptionalJsonRecord(figureCatalogPath);
  const tableCatalog = readOptionalJsonRecord(tableCatalogPath);
  const referenceCoverage = readOptionalJsonRecord(referenceCoveragePath);
  const compileReport = readOptionalJsonRecord(compileReportPath);
  const bundleManifest = readOptionalJsonRecord(bundleManifestPath);

  const figureCounts = summarizeFigureCounts(figureCatalog);
  const tableCounts = summarizeTableCounts(tableCatalog);
  const referenceCount =
    optionalNumber(referenceCoverage?.record_count)
    ?? optionalNumber(referenceCoverage?.records_total)
    ?? null;
  const pageCount = optionalNumber(compileReport?.page_count);
  const matrixJudgment = isRecord(matrix?.current_judgment) ? matrix.current_judgment : null;
  const manuscriptObjective = extractMarkedField(reviewManuscript, 'Objective');
  const manuscriptResults = extractMarkedField(reviewManuscript, 'Results');
  const currentEffectSummary =
    manuscriptResults
    ?? normalizeInlineText(optionalString(matrixJudgment?.current_judgment))
    ?? null;
  const proofingSummary =
    normalizeInlineText(optionalString(compileReport?.proofing_summary))
    ?? normalizeInlineText(optionalString(bundleManifest?.summary))
    ?? null;
  const clinicalQuestion = manuscriptObjective ?? options.publicationObjective ?? null;
  const innovationSummary = options.paperFramingSummary ?? null;
  const materializedBits = [
    figureCounts.main !== null ? `${figureCounts.main} 张主图` : null,
    figureCounts.supplementary ? `${figureCounts.supplementary} 张补充图` : null,
    tableCounts.main !== null ? `${tableCounts.main} 张主表` : null,
    tableCounts.supplementary ? `${tableCounts.supplementary} 张附表` : null,
    referenceCount !== null ? `${referenceCount} 篇参考文献` : null,
    pageCount !== null ? `${pageCount} 页 PDF` : null,
  ].filter((entry): entry is string => Boolean(entry));
  const humanSummary = normalizeInlineText([
    clinicalQuestion ? `临床问题：${clinicalQuestion}` : null,
    currentEffectSummary ? `当前结果：${currentEffectSummary}` : null,
    materializedBits.length > 0 ? `稿件已物化 ${materializedBits.join('，')}` : proofingSummary,
  ].filter(Boolean).join(' '));
  const keyFiles = [
    reviewManuscriptPath
      ? {
          file_id: 'review_manuscript',
          label: 'Reviewer manuscript',
          kind: 'deliverable',
          path: reviewManuscriptPath,
          summary: '当前 reviewer-facing 主稿。',
        }
      : null,
    compileReportPath
      ? {
          file_id: 'compile_report',
          label: 'Compile report',
          kind: 'deliverable',
          path: compileReportPath,
          summary: '最近一次编译与 proofing 摘要。',
        }
      : null,
    bundleManifestPath
      ? {
          file_id: 'paper_bundle_manifest',
          label: 'Paper bundle manifest',
          kind: 'deliverable',
          path: bundleManifestPath,
          summary: '当前论文 bundle 的交付清单。',
        }
      : null,
    studyMatrixPath
      ? {
          file_id: 'paper_experiment_matrix',
          label: 'Experiment matrix',
          kind: 'supporting',
          path: studyMatrixPath,
          summary: '当前实验矩阵与 judgment。',
        }
      : null,
    figureCatalogPath
      ? {
          file_id: 'figure_catalog',
          label: 'Figure catalog',
          kind: 'supporting',
          path: figureCatalogPath,
          summary: '图目录与主图/补充图分层。',
        }
      : null,
    tableCatalogPath
      ? {
          file_id: 'table_catalog',
          label: 'Table catalog',
          kind: 'supporting',
          path: tableCatalogPath,
          summary: '表目录与主表/附表分层。',
        }
      : null,
    referenceCoveragePath
      ? {
          file_id: 'reference_coverage_report',
          label: 'Reference coverage report',
          kind: 'supporting',
          path: referenceCoveragePath,
          summary: '当前文献覆盖计数。',
        }
      : null,
  ].filter((entry): entry is {
    file_id: string;
    label: string;
    kind: 'deliverable' | 'supporting';
    path: string;
    summary: string;
  } => Boolean(entry && fs.existsSync(entry.path)));

  if (
    !clinicalQuestion
    && !innovationSummary
    && !currentEffectSummary
    && materializedBits.length === 0
    && !proofingSummary
    && !bundleManifest
  ) {
    return null;
  }

  return {
    title:
      normalizeInlineText(optionalString(bundleManifest?.title))
      ?? extractFrontMatterTitle(reviewManuscript),
    clinical_question: clinicalQuestion,
    innovation_summary: innovationSummary,
    current_effect_summary: currentEffectSummary,
    main_figure_count: figureCounts.main,
    supplementary_figure_count: figureCounts.supplementary,
    main_table_count: tableCounts.main,
    supplementary_table_count: tableCounts.supplementary,
    reference_count: referenceCount,
    page_count: pageCount,
    proofing_summary: proofingSummary,
    bundle_summary: normalizeInlineText(optionalString(bundleManifest?.summary)),
    human_summary: humanSummary,
    key_files: keyFiles,
    inspect_paths: uniqueStrings([
      studyMatrixPath,
      reviewManuscriptPath,
      figureCatalogPath,
      tableCatalogPath,
      referenceCoveragePath,
      compileReportPath,
      bundleManifestPath,
    ]),
  };
}

function buildCurrentStudyUserOptions(hasCurrentStudy: boolean, hasPaperSnapshot = false) {
  if (hasCurrentStudy) {
    return [
      '展开当前论文的详细进度',
      ...(hasPaperSnapshot ? ['列出当前稿件的图表与参考文献计数', '打开当前论文的可审阅目录'] : []),
      '切换到另一篇论文继续查看',
    ];
  }

  return [
    '列出当前 workspace 的全部论文',
    '检查哪篇论文现在还在 live',
    '指定一个 study 让我读取详细进度',
  ];
}

function inferWorkspaceLabel(workspacePath?: string | null) {
  const normalized = workspacePath?.trim();
  if (!normalized) {
    return 'Unbound workspace';
  }

  const cleanPath = normalized.replace(/[\\/]+$/, '');
  const segments = cleanPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? cleanPath;
}

type ProjectProgressDecision = {
  gate_id: string;
  label: string;
  reason: string;
};

function describeHumanGate(gateId: string): ProjectProgressDecision {
  if (gateId === 'publication_release_gate') {
    return {
      gate_id: gateId,
      label: '确认是否进入收尾/发布',
      reason: '用于决定当前研究产出是否已经可以作为收尾或发布版本继续推进。',
    };
  }

  if (gateId === 'study_physician_decision_gate') {
    return {
      gate_id: gateId,
      label: '确认研究分叉或医学判断',
      reason: '用于需要医生或研究负责人明确判断时的人工分叉口。',
    };
  }

  if (gateId === 'redcube_operator_review_gate') {
    return {
      gate_id: gateId,
      label: '确认是否接受当前产出',
      reason: '用于决定是否接受当前轮产出并继续下一步执行。',
    };
  }

  return {
    gate_id: gateId,
    label: '存在一个域侧人工判断口',
    reason: `当前域定义了人工判断口 ${gateId}，但 OPL 控制面还没有拿到更细的自然语言解释。`,
  };
}

function explainManifestFailure(error: DomainManifestCatalogEntry['error']) {
  if (!error) {
    return null;
  }

  const stderrLines = (error.stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const usefulLine =
    stderrLines.find((line) => !line.includes('parameter not set'))
    ?? stderrLines[0]
    ?? error.message;

  if (!usefulLine) {
    return error.message;
  }

  if (usefulLine === error.message) {
    return usefulLine;
  }

  return `${error.message} ${usefulLine}`;
}

function pickCurrentProjectEntry(
  domainManifests: ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'],
  workspaceCatalog: ReturnType<typeof buildWorkspaceCatalog>['workspace_catalog'],
  workspacePath: string,
) {
  const activeBindingEntry =
    workspaceCatalog.projects.find((entry) => entry.active_binding?.workspace_path === workspacePath)
    ?? workspaceCatalog.projects.find((entry) => entry.active_binding?.status === 'active')
    ?? null;

  const manifestEntry =
    (activeBindingEntry
      ? domainManifests.projects.find((entry) => entry.project_id === activeBindingEntry.project_id)
      : null)
    ?? domainManifests.projects.find((entry) => entry.workspace_path === workspacePath)
    ?? null;

  return {
    activeBindingEntry,
    manifestEntry,
    projectId: activeBindingEntry?.project_id ?? manifestEntry?.project_id ?? null,
    projectLabel:
      activeBindingEntry?.project
      ?? manifestEntry?.project
      ?? inferWorkspaceLabel(workspacePath),
  };
}

function parseStudyTimestamp(value: unknown) {
  const timestamp = optionalString(value);
  if (!timestamp) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function scoreStudyEntry(entry: Record<string, unknown>) {
  const monitoring = isRecord(entry.monitoring) ? entry.monitoring : null;
  const freshness = isRecord(entry.progress_freshness) ? entry.progress_freshness : null;
  const healthStatus = optionalString(monitoring?.health_status);
  const freshnessStatus = optionalString(freshness?.status);
  const activeRunId = optionalString(monitoring?.active_run_id);
  const currentStage = optionalString(entry.current_stage);

  let score = 0;
  if (healthStatus === 'live') {
    score += 1000;
  } else if (healthStatus === 'recovering') {
    score += 700;
  }

  if (activeRunId) {
    score += 250;
  }

  if (freshnessStatus === 'fresh') {
    score += 120;
  } else if (freshnessStatus === 'stale') {
    score += 40;
  }

  if (currentStage && currentStage !== 'runtime_blocked') {
    score += 40;
  }

  return score + parseStudyTimestamp(freshness?.latest_progress_at) / 1_000_000_000_000;
}

function pickCurrentStudyEntry(studies: unknown) {
  if (!Array.isArray(studies)) {
    return null;
  }

  const entries = studies.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => scoreStudyEntry(right) - scoreStudyEntry(left))[0] ?? null;
}

function classifyStudyInboxLane(entry: Record<string, unknown>) {
  const monitoring = isRecord(entry.monitoring) ? entry.monitoring : null;
  const commands = isRecord(entry.commands) ? entry.commands : null;
  const blockers = uniqueStrings(optionalStringList(entry.current_blockers));
  const needsPhysicianDecision = entry.needs_physician_decision === true;
  const currentStage = optionalString(entry.current_stage);
  const healthStatus = optionalString(monitoring?.health_status);
  const resumeCommand = optionalString(commands?.launch);
  const progressCommand = optionalString(commands?.progress);

  if (healthStatus === 'live') {
    return 'running' as const;
  }

  if (blockers.length > 0 || needsPhysicianDecision || currentStage === 'runtime_blocked') {
    return 'waiting' as const;
  }

  if (healthStatus === 'recovering') {
    return 'running' as const;
  }

  if (resumeCommand || progressCommand) {
    return 'ready' as const;
  }

  return 'ready' as const;
}

function buildStudyQueueCards(studies: unknown, workspacePath: string) {
  if (!Array.isArray(studies)) {
    return [];
  }

  const entries = studies.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  if (entries.length === 0) {
    return [];
  }

  return [...entries]
    .sort((left, right) => scoreStudyEntry(right) - scoreStudyEntry(left))
    .map((entry) => {
      const monitoring = isRecord(entry.monitoring) ? entry.monitoring : null;
      const freshness = isRecord(entry.progress_freshness) ? entry.progress_freshness : null;
      const blockers = uniqueStrings(optionalStringList(entry.current_blockers));
      const narrationContract = readStatusNarrationContract(entry.status_narration_contract);
      const currentStage = optionalString(entry.current_stage);
      const currentStageSummary =
        statusNarrationLatestUpdate(narrationContract)
        ?? optionalString(entry.current_stage_summary)
        ?? statusNarrationStageSummary(narrationContract)
        ?? humanizeProgressCode(currentStage)
        ?? '当前任务状态待确认。';
      const latestProgressTimeLabel = optionalString(freshness?.latest_progress_time_label);
      const latestProgressSummary = optionalString(freshness?.latest_progress_summary);
      const latestUpdate =
        normalizeInlineText([
          latestProgressTimeLabel,
          latestProgressSummary ?? currentStageSummary,
        ].filter(Boolean).join(' · '))
        ?? '当前还没有新的进度更新时间。';
      const nextStep =
        normalizeInlineText(
          statusNarrationNextStep(narrationContract)
          ?? optionalString(entry.next_system_action)
          ?? '继续查看这个研究任务的详细进度。',
        )
        ?? '继续查看这个研究任务的详细进度。';
      const summaryFromContract = statusNarrationSummary(narrationContract);
      const summary =
        summaryFromContract
        ?? normalizeInlineText([
          currentStageSummary,
          blockers.length > 0 ? `当前卡点：${blockers.join('；')}` : null,
        ].filter(Boolean).join(' '))
        ?? currentStageSummary;

      return {
        task_id: optionalString(entry.study_id) ?? 'unnamed-study',
        title: optionalString(entry.study_id) ?? 'Unnamed study',
        lane: classifyStudyInboxLane(entry),
        status_label: humanizeProgressCode(currentStage) ?? currentStageSummary,
        summary,
        latest_update: latestUpdate,
        next_step: nextStep,
        inspect_path: optionalString(entry.study_root) ?? workspacePath,
        deliverable_count: 0,
        source_surface: 'workspace_cockpit',
      };
    });
}

function readStudyCharter(studyRoot: string | null) {
  if (!studyRoot) {
    return null;
  }

  const charterPath = path.join(studyRoot, 'artifacts', 'controller', 'study_charter.json');
  const charter = readOptionalJsonRecord(charterPath);
  if (!charter) {
    return null;
  }

  return {
    charter_path: charterPath,
    title: optionalString(charter.title),
    publication_objective:
      optionalString(charter.publication_objective)
      ?? optionalString(charter.primary_question),
    paper_framing_summary: optionalString(charter.paper_framing_summary),
  };
}

function buildManifestContinuitySurface(options: {
  workspacePath: string;
  overview: NormalizedDomainManifest['product_entry_overview'] | null;
  manifest: NormalizedDomainManifest | null;
}) {
  const control = options.manifest?.runtime_control ?? null;
  const session = options.manifest?.session_continuity ?? null;
  const progress = options.manifest?.progress_projection ?? null;
  const artifacts = options.manifest?.artifact_inventory ?? null;

  if (!control && !session && !progress && !artifacts) {
    return null;
  }

  const workspaceFiles = [
    ...(artifacts?.deliverable_files ?? []).map((entry) => ({
      file_id: entry.file_id,
      label: entry.label,
      kind: entry.kind,
      path: entry.path,
      summary: entry.summary,
    })),
    ...(artifacts?.supporting_files ?? []).map((entry) => ({
      file_id: entry.file_id,
      label: entry.label,
      kind: entry.kind,
      path: entry.path,
      summary: entry.summary,
    })),
  ];
  const progressCommand =
    control?.control_surfaces.progress?.command
    ?? progress?.progress_surface?.command
    ?? session?.progress_surface?.command
    ?? options.overview?.progress_surface?.command
    ?? null;
  const resumeCommand =
    control?.control_surfaces.resume?.command
    ?? session?.restore_surface?.command
    ?? options.manifest?.task_lifecycle?.resume_surface?.command
    ?? options.overview?.resume_surface?.command
    ?? null;
  const approvalCommand = control?.control_surfaces.approval?.command ?? null;
  const interruptCommand = control?.control_surfaces.interrupt?.command ?? null;
  const artifactCommand =
    control?.control_surfaces.artifact_pickup?.command
    ?? artifacts?.artifact_surface?.command
    ?? session?.artifact_surface?.command
    ?? null;
  const inspectPaths = uniqueStrings([
    artifacts?.workspace_path ?? null,
    ...(progress?.inspect_paths ?? []),
    ...(artifacts?.inspect_paths ?? []),
  ]);
  const recentActivity =
    progress || session
      ? {
          session_id: progress?.session_id ?? session?.session_id ?? 'domain-runtime-session',
          last_active: progress?.latest_update ?? session?.summary ?? '当前 session 仍可恢复',
          source:
            progress?.progress_surface?.surface_kind
            ?? session?.progress_surface?.surface_kind
            ?? 'domain_runtime_continuity',
          preview: progress?.headline ?? session?.summary ?? '当前 runtime continuity 已暴露',
        }
      : null;

  return {
    currentStudy: null,
    progressSummary: progress?.headline ?? session?.summary ?? null,
    nextFocus:
      progress?.next_step
      ?? session?.restore_surface?.summary
      ?? options.overview?.next_focus[0]
      ?? null,
    attentionItems: progress?.attention_items ?? [],
    inspectPaths,
    recentActivity,
    studyQueue: [],
    workspaceFiles,
    recommendedCommands: {
      progress: progressCommand,
      resume: resumeCommand,
      approval: approvalCommand,
      interrupt: interruptCommand,
      artifacts: artifactCommand,
    },
    userOptions: [
      '展开当前 runtime continuity 详情',
      ...(workspaceFiles.length > 0 ? ['列出当前 deliverable 与 supporting files'] : []),
      ...(resumeCommand ? ['按当前 restore surface 继续推进'] : []),
      ...(approvalCommand ? ['查看当前 domain approval/control gate'] : []),
    ],
    continuity: {
      control,
      session,
      progress,
      artifacts,
    },
  };
}

function buildStudyProgressSurface(options: {
  workspacePath: string;
  overview: NormalizedDomainManifest['product_entry_overview'] | null;
  manifest: NormalizedDomainManifest | null;
}) {
  const continuitySurface = buildManifestContinuitySurface(options);
  if (
    continuitySurface
    && options.manifest?.operator_loop_surface?.surface_kind !== 'workspace_cockpit'
  ) {
    return continuitySurface;
  }

  const operatorLoopCommand =
    options.overview?.operator_loop_command
    ?? options.manifest?.operator_loop_surface?.command
    ?? options.manifest?.recommended_command
    ?? null;
  const operatorLoop = runJsonShellCommand(operatorLoopCommand, options.workspacePath);
  const attentionItems: string[] = [];

  if (operatorLoop.error) {
    attentionItems.push(`当前只能确认到项目级，因为 study 队列摘要暂时不可读：${operatorLoop.error}`);
    return {
      currentStudy: null,
      progressSummary: null,
      nextFocus: null,
      attentionItems,
      inspectPaths: [],
      recentActivity: null,
      studyQueue: [],
      workspaceFiles: [],
      recommendedCommands: {
        progress: options.overview?.progress_surface?.command ?? null,
        resume: options.overview?.resume_surface?.command ?? null,
        approval: options.manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        interrupt: options.manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        artifacts:
          options.manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
          ?? options.manifest?.artifact_inventory?.artifact_surface?.command
          ?? null,
      },
      userOptions: buildCurrentStudyUserOptions(false),
      continuity: continuitySurface?.continuity ?? {
        control: options.manifest?.runtime_control ?? null,
        session: options.manifest?.session_continuity ?? null,
        progress: options.manifest?.progress_projection ?? null,
        artifacts: options.manifest?.artifact_inventory ?? null,
      },
    };
  }

  const operatorLoopPayload = operatorLoop.payload;
  const studyQueue = buildStudyQueueCards(operatorLoopPayload?.studies, options.workspacePath);
  const currentStudySummary = pickCurrentStudyEntry(operatorLoopPayload?.studies);
  if (!currentStudySummary) {
    return {
      currentStudy: null,
      progressSummary: null,
      nextFocus: null,
      attentionItems,
      inspectPaths: [],
      recentActivity: null,
      studyQueue,
      workspaceFiles: [],
      recommendedCommands: {
        progress: options.overview?.progress_surface?.command ?? null,
        resume: options.overview?.resume_surface?.command ?? null,
        approval: options.manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        interrupt: options.manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        artifacts:
          options.manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
          ?? options.manifest?.artifact_inventory?.artifact_surface?.command
          ?? null,
      },
      userOptions: buildCurrentStudyUserOptions(false),
      continuity: continuitySurface?.continuity ?? {
        control: options.manifest?.runtime_control ?? null,
        session: options.manifest?.session_continuity ?? null,
        progress: options.manifest?.progress_projection ?? null,
        artifacts: options.manifest?.artifact_inventory ?? null,
      },
    };
  }

  const studyCommands = isRecord(currentStudySummary.commands) ? currentStudySummary.commands : null;
  const studyId = optionalString(currentStudySummary.study_id);
  const machineProgressCommand =
    optionalString(options.overview?.progress_surface?.command)?.replace(/<study_id>/g, studyId ?? '')
    ?? optionalString((options.manifest?.product_entry_shell.study_progress as Record<string, unknown> | undefined)?.command)?.replace(/<study_id>/g, studyId ?? '')
    ?? null;
  const progressCommand =
    optionalString(studyCommands?.progress)
    ?? machineProgressCommand;
  const resumeCommand =
    optionalString(studyCommands?.launch)
    ?? optionalString(options.overview?.resume_surface?.command)?.replace(/<study_id>/g, studyId ?? '')
    ?? null;
  const progressPayloadResult = runJsonShellCommand(machineProgressCommand, options.workspacePath);

  if (machineProgressCommand && progressPayloadResult.error) {
    attentionItems.push(`当前论文已定位，但详细 study 进度面暂时不可读：${progressPayloadResult.error}`);
  }

  const progressPayload = progressPayloadResult.payload;
  const narrationContract = readStatusNarrationContract(progressPayload?.status_narration_contract);
  const studyRoot =
    optionalString(progressPayload?.study_root)
    ?? optionalString(currentStudySummary.study_root)
    ?? null;
  const questId = optionalString(progressPayload?.quest_id);
  const questRoot = optionalString(progressPayload?.quest_root);
  const currentStage = optionalString(progressPayload?.current_stage) ?? optionalString(currentStudySummary.current_stage);
  const currentStageSummary =
    optionalString(progressPayload?.current_stage_summary)
    ?? optionalString(currentStudySummary.current_stage_summary);
  const paperStage = optionalString(progressPayload?.paper_stage);
  const paperStageSummary = optionalString(progressPayload?.paper_stage_summary);
  const nextSystemAction =
    optionalString(progressPayload?.next_system_action)
    ?? optionalString(currentStudySummary.next_system_action);
  const blockers = uniqueStrings([
    ...optionalStringList(progressPayload?.current_blockers),
    ...optionalStringList(currentStudySummary.current_blockers),
  ]);
  const supervision =
    (isRecord(progressPayload?.supervision) ? progressPayload.supervision : null)
    ?? (isRecord(currentStudySummary.monitoring) ? currentStudySummary.monitoring : null);
  const freshness =
    (isRecord(progressPayload?.progress_freshness) ? progressPayload.progress_freshness : null)
    ?? (isRecord(currentStudySummary.progress_freshness) ? currentStudySummary.progress_freshness : null);
  const latestEvents = Array.isArray(progressPayload?.latest_events)
    ? progressPayload.latest_events.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const latestEvent = latestEvents[0] ?? null;
  const studyCharter = readStudyCharter(studyRoot);
  const paperSnapshot = buildPaperFacingSnapshot({
    studyRoot,
    questRoot,
    publicationObjective: studyCharter?.publication_objective ?? null,
    paperFramingSummary: studyCharter?.paper_framing_summary ?? null,
  });
  const refs = isRecord(progressPayload?.refs) ? progressPayload.refs : null;
  const inspectPaths = uniqueStrings([
    studyRoot,
    studyCharter?.charter_path ?? null,
    optionalString(refs?.publication_eval_path),
    optionalString(refs?.launch_report_path),
    studyRoot && fs.existsSync(path.join(studyRoot, 'manuscript', 'current_package'))
      ? path.join(studyRoot, 'manuscript', 'current_package')
      : null,
    ...(paperSnapshot?.inspect_paths ?? []),
  ]);
  const storySummary =
    studyCharter?.publication_objective
    ?? studyCharter?.paper_framing_summary
    ?? optionalString(currentStudySummary.current_stage_summary);
  const progressSummary = normalizeInlineText([
    studyId
      ? `${studyId} 当前阶段：${currentStageSummary ?? '待确认'}`
      : currentStageSummary,
    paperSnapshot?.human_summary ?? null,
  ].filter(Boolean).join(' '));
  const latestProgressTimeLabel = optionalString(freshness?.latest_progress_time_label);
  const latestProgressSummary = optionalString(freshness?.latest_progress_summary);
  const latestProgressSource = optionalString(freshness?.latest_progress_source);
  const recentActivity =
    latestProgressTimeLabel || latestProgressSummary
      ? {
          session_id: optionalString(supervision?.active_run_id) ?? optionalString(currentStudySummary.study_id),
          last_active: latestProgressTimeLabel ?? '未知时间',
          source: latestProgressSource ?? 'study_progress',
          preview: latestProgressSummary ?? currentStageSummary,
        }
      : null;

  return {
    currentStudy: {
      study_id: optionalString(currentStudySummary.study_id),
      title:
        studyCharter?.title
        ?? paperSnapshot?.title
        ?? optionalString(currentStudySummary.study_id),
      story_summary: storySummary,
      paper_framing_summary: studyCharter?.paper_framing_summary ?? null,
      clinical_question: paperSnapshot?.clinical_question ?? studyCharter?.publication_objective ?? null,
      innovation_summary: paperSnapshot?.innovation_summary ?? studyCharter?.paper_framing_summary ?? null,
      current_effect_summary: paperSnapshot?.current_effect_summary ?? null,
      paper_snapshot: paperSnapshot
        ? {
            main_figure_count: paperSnapshot.main_figure_count,
            supplementary_figure_count: paperSnapshot.supplementary_figure_count,
            main_table_count: paperSnapshot.main_table_count,
            supplementary_table_count: paperSnapshot.supplementary_table_count,
            reference_count: paperSnapshot.reference_count,
            page_count: paperSnapshot.page_count,
            proofing_summary: paperSnapshot.proofing_summary,
            bundle_summary: paperSnapshot.bundle_summary,
            human_summary: paperSnapshot.human_summary,
            current_effect_summary: paperSnapshot.current_effect_summary,
          }
        : null,
      study_root: studyRoot,
      quest_id: questId,
      quest_root: questRoot,
      current_stage: currentStage,
      current_stage_summary: currentStageSummary,
      status_narration_contract: narrationContract,
      paper_stage: paperStage,
      paper_stage_summary: paperStageSummary,
      next_system_action: nextSystemAction,
      current_blockers: blockers,
      monitoring: {
        browser_url: optionalString(supervision?.browser_url),
        quest_session_api_url: optionalString(supervision?.quest_session_api_url),
        active_run_id: optionalString(supervision?.active_run_id),
        health_status: optionalString(supervision?.health_status),
        supervisor_tick_status: optionalString(supervision?.supervisor_tick_status),
      },
      latest_progress: {
        time_label: latestProgressTimeLabel,
        summary: latestProgressSummary,
        source: latestProgressSource,
      },
      latest_event: latestEvent
        ? {
            time_label: optionalString(latestEvent.time_label),
            title: optionalString(latestEvent.title),
            summary: optionalString(latestEvent.summary),
          }
        : null,
    },
    progressSummary,
    nextFocus: nextSystemAction,
    attentionItems: blockers,
    inspectPaths,
    recentActivity,
    studyQueue,
    workspaceFiles: paperSnapshot?.key_files ?? [],
    recommendedCommands: {
      progress: progressCommand,
      resume: resumeCommand,
      approval: options.manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
      interrupt: options.manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
      artifacts:
        options.manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
        ?? options.manifest?.artifact_inventory?.artifact_surface?.command
        ?? null,
    },
    userOptions: buildCurrentStudyUserOptions(true, Boolean(paperSnapshot)),
    continuity: {
      control: options.manifest?.runtime_control ?? null,
      session: options.manifest?.session_continuity ?? null,
      progress: options.manifest?.progress_projection ?? null,
      artifacts: options.manifest?.artifact_inventory ?? null,
    },
  };
}

function buildProgressFeedback(options: {
  studySurface: ReturnType<typeof buildStudyProgressSurface>;
  progressSummary: string;
  nextFocus: string | null;
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
}) {
  const currentStudy = options.studySurface.currentStudy;
  const continuitySession = isRecord(options.studySurface.continuity?.session)
    ? options.studySurface.continuity.session
    : null;
  const continuityProgress = isRecord(options.studySurface.continuity?.progress)
    ? options.studySurface.continuity.progress
    : null;
  const preferContinuity = !currentStudy;
  const monitoring = isRecord(currentStudy?.monitoring) ? currentStudy.monitoring : null;
  const latestProgress = isRecord(currentStudy?.latest_progress) ? currentStudy.latest_progress : null;
  const latestEvent = isRecord(currentStudy?.latest_event) ? currentStudy.latest_event : null;
  const narrationContract = readStatusNarrationContract(currentStudy?.status_narration_contract);
  const recentActivity = options.studySurface.recentActivity;
  const currentStatus =
    optionalString(currentStudy?.current_stage)
    ?? optionalString(continuityProgress?.current_status)
    ?? optionalString(continuitySession?.status);
  const runtimeStatus =
    optionalString(monitoring?.health_status)
    ?? optionalString(continuityProgress?.runtime_status);
  const headline =
    normalizeInlineText(
      (preferContinuity ? optionalString(continuityProgress?.headline) : null)
      ?? (preferContinuity ? optionalString(continuitySession?.summary) : null)
      ?? statusNarrationLatestUpdate(narrationContract)
      ?? statusNarrationStageSummary(narrationContract)
      ?? optionalString(currentStudy?.current_stage_summary)
      ?? optionalString(latestProgress?.summary)
      ?? optionalString(latestEvent?.summary)
      ?? options.progressSummary,
    )
    ?? '当前还没有读到结构化的研究推进摘要。';
  const latestUpdate =
    normalizeInlineText([
      (preferContinuity ? optionalString(continuityProgress?.latest_update) : null)
      ?? optionalString(latestProgress?.time_label)
      ?? optionalString(latestEvent?.time_label)
      ?? recentActivity?.last_active
      ?? options.recentSession?.last_active
      ?? null,
      (preferContinuity ? optionalString(continuityProgress?.headline) : null)
      ?? statusNarrationLatestUpdate(narrationContract)
      ?? optionalString(latestProgress?.summary)
      ?? optionalString(latestEvent?.summary)
      ?? recentActivity?.preview
      ?? options.recentSession?.preview
      ?? optionalString(currentStudy?.current_stage_summary)
      ?? (preferContinuity ? optionalString(continuitySession?.summary) : null)
      ?? null,
    ].filter(Boolean).join(' · '))
    ?? '当前还没有读到新的进度更新时间。';
  const nextStep =
    normalizeInlineText(
      (preferContinuity ? optionalString(continuityProgress?.next_step) : null)
      ?? (preferContinuity
        ? optionalString((continuitySession?.restore_surface as Record<string, unknown> | undefined)?.summary)
        : null)
      ?? statusNarrationNextStep(narrationContract)
      ?? optionalString(currentStudy?.next_system_action)
      ?? options.nextFocus
      ?? '继续展开当前任务的详细进度。',
    )
    ?? '继续展开当前任务的详细进度。';
  const statusSummary =
    normalizeInlineText([
      preferContinuity ? optionalString(continuityProgress?.status_summary) : null,
      statusNarrationSummary(narrationContract),
      currentStatus ? `当前状态：${humanizeProgressCode(currentStatus) ?? currentStatus}` : null,
      runtimeStatus ? `运行态：${humanizeProgressCode(runtimeStatus) ?? runtimeStatus}` : null,
    ].filter(Boolean).join('；'))
    ?? '当前还没有读到结构化状态。';

  return {
    headline,
    current_status: currentStatus,
    runtime_status: runtimeStatus,
    latest_update: latestUpdate,
    next_step: nextStep,
    status_summary: statusSummary,
  };
}

function buildTaskLifecycleInboxCard(options: {
  taskLifecycle: NormalizedDomainManifest['task_lifecycle'];
  workspacePath: string;
}) {
  const taskLifecycle = options.taskLifecycle;
  if (!taskLifecycle) {
    return null;
  }

  const lane =
    taskLifecycle.human_gate_ids.length > 0
      ? 'waiting'
      : (
          ['running', 'active', 'in_progress', 'recovering'].includes(taskLifecycle.status)
            ? 'running'
            : taskLifecycle.resume_surface
              ? 'ready'
              : 'ready'
        );
  const latestUpdate =
    normalizeInlineText([
      taskLifecycle.checkpoint_summary?.recorded_at,
      taskLifecycle.checkpoint_summary?.summary,
    ].filter(Boolean).join(' · '))
    ?? taskLifecycle.checkpoint_summary?.summary
    ?? '当前还没有新的 checkpoint 更新时间。';
  const nextStep =
    taskLifecycle.resume_surface
      ? `从 ${taskLifecycle.resume_surface.surface_kind} 继续这个任务。`
      : '继续查看这个任务的详细进度。';

  return {
    task_id: taskLifecycle.task_id,
    title: taskLifecycle.task_kind,
    lane: lane as 'running' | 'waiting' | 'ready',
    status_label: humanizeProgressCode(taskLifecycle.status) ?? taskLifecycle.status,
    summary: taskLifecycle.summary,
    latest_update: latestUpdate,
    next_step: nextStep,
    inspect_path: options.workspacePath,
    deliverable_count: 0,
    source_surface: 'task_lifecycle',
  };
}

function buildRecentSessionInboxCard(options: {
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
  workspacePath: string;
}) {
  if (!options.recentSession) {
    return null;
  }

  return {
    task_id: options.recentSession.session_id,
    title: 'Recent agent session',
    lane: 'running' as const,
    status_label: '后台会话活跃',
    summary: options.recentSession.preview || '当前有后台会话仍在持续推进。',
    latest_update: normalizeInlineText([
      options.recentSession.last_active,
      options.recentSession.preview,
    ].filter(Boolean).join(' · ')) ?? options.recentSession.last_active,
    next_step: '继续查看这条后台会话的最新输出。',
    inspect_path: options.workspacePath,
    deliverable_count: 0,
    source_surface: 'recent_sessions',
  };
}

function buildDeliverableInboxCard(options: {
  currentStudy: ReturnType<typeof buildStudyProgressSurface>['currentStudy'];
  deliverableFiles: Array<{
    file_id: string;
    label: string;
    kind: 'deliverable' | 'supporting';
    path: string;
    summary: string;
  }>;
  progressFeedback: ReturnType<typeof buildProgressFeedback>;
  workspacePath: string;
}) {
  if (options.deliverableFiles.length === 0) {
    return null;
  }

  const firstDeliverable = options.deliverableFiles[0];
  const title =
    optionalString(options.currentStudy?.title)
    ?? optionalString(options.currentStudy?.study_id)
    ?? 'Workspace deliverables';
  const studyId = optionalString(options.currentStudy?.study_id);

  return {
    task_id: studyId
      ? `${studyId}:deliverables`
      : 'workspace-deliverables',
    title,
    lane: 'delivered' as const,
    status_label: '已形成交付',
    summary: `已产出 ${options.deliverableFiles.length} 个 deliverable 文件，当前最值得先看的文件是 ${firstDeliverable.label}。`,
    latest_update: options.progressFeedback.latest_update,
    next_step: `优先检查 ${firstDeliverable.label}，确认交付面和当前进度保持一致。`,
    inspect_path: firstDeliverable.path ?? optionalString(options.currentStudy?.study_root) ?? options.workspacePath,
    deliverable_count: options.deliverableFiles.length,
    source_surface: 'workspace_files',
  };
}

function buildWorkspaceInbox(options: {
  studySurface: ReturnType<typeof buildStudyProgressSurface>;
  manifest: NormalizedDomainManifest | null;
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
  deliverableFiles: Array<{
    file_id: string;
    label: string;
    kind: 'deliverable' | 'supporting';
    path: string;
    summary: string;
  }>;
  progressFeedback: ReturnType<typeof buildProgressFeedback>;
  workspacePath: string;
}) {
  const cards: Array<{
    task_id: string;
    title: string;
    lane: 'running' | 'waiting' | 'ready' | 'delivered';
    status_label: string;
    summary: string;
    latest_update: string;
    next_step: string;
    inspect_path: string;
    deliverable_count: number;
    source_surface: string;
  }> = [];
  const studyQueue = options.studySurface.studyQueue ?? [];

  if (studyQueue.length > 0) {
    cards.push(...studyQueue);
  } else {
    const taskLifecycleCard = buildTaskLifecycleInboxCard({
      taskLifecycle: options.manifest?.task_lifecycle ?? null,
      workspacePath: options.workspacePath,
    });
    if (taskLifecycleCard) {
      cards.push(taskLifecycleCard);
    }

    const recentSessionCard = buildRecentSessionInboxCard({
      recentSession: options.recentSession,
      workspacePath: options.workspacePath,
    });
    if (recentSessionCard) {
      cards.push(recentSessionCard);
    }
  }

  const deliverableCard = buildDeliverableInboxCard({
    currentStudy: options.studySurface.currentStudy,
    deliverableFiles: options.deliverableFiles,
    progressFeedback: options.progressFeedback,
    workspacePath: options.workspacePath,
  });
  if (deliverableCard) {
    cards.push(deliverableCard);
  }

  const sections = {
    running: cards.filter((entry) => entry.lane === 'running'),
    waiting: cards.filter((entry) => entry.lane === 'waiting'),
    ready: cards.filter((entry) => entry.lane === 'ready'),
    delivered: cards.filter((entry) => entry.lane === 'delivered'),
  };
  const activeTaskId =
    sections.running[0]?.task_id
    ?? sections.waiting[0]?.task_id
    ?? sections.ready[0]?.task_id
    ?? sections.delivered[0]?.task_id
    ?? null;

  return {
    summary: {
      known_task_count: cards.length,
      running_count: sections.running.length,
      waiting_count: sections.waiting.length,
      ready_count: sections.ready.length,
      delivered_count: sections.delivered.length,
      active_task_id: activeTaskId,
    },
    sections,
  };
}

export function buildHostedRuntimeReadiness() {
  return {
    surface_kind: 'opl_hosted_runtime_readiness',
    status: 'pilot_ready_not_managed',
    shell_integration_target: 'external_gui_overlay',
    managed_hosted_runtime_landed: false,
    local_web_api_landed: true,
    hosted_friendly_contract_landed: true,
    web_bundle_landed: true,
    self_hostable_web_package_landed: true,
    desktop_shell_landed: false,
    service_safe_local_packaging_landed: true,
    hosted_shell_mcp_wiring_landed: true,
    workspace_binding_tooling_landed: true,
    session_attribution_tooling_landed: true,
    blocking_gaps: [
      'managed hosted runtime ownership 仍未 landed。',
      'multi-tenant hosted platform orchestration 仍未 landed。',
    ],
    recommended_next_actions: [
      '把 managed hosted runtime 的 service orchestration、tenant boundary 与 policy surface 单独冻结。',
      '保持 Hermes 作为外部 runtime substrate，不在 OPL 仓内虚构托管完成度。',
      '把独立 GUI 壳接到这些 API truth 上，当前主线按 AionUI 推进；OPL 主仓不在仓内继续长自研 GUI。',
    ],
  };
}

export { buildDomainEntryParity } from './family-domain-catalog.ts';

function buildDomainBindingParity(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainProjects = workspaceCatalog.projects.filter((entry) => entry.project_id !== 'opl');
  const projects = domainProjects.map((entry) => ({
    project_id: entry.project_id,
    project: entry.project,
    active_binding: entry.active_binding,
    bindings_count: entry.bindings_count,
    last_updated_at: entry.last_updated_at,
    available_actions: entry.available_actions,
    direct_entry_ready: entry.bindings_count.direct_entry_ready > 0,
    manifest_ready: entry.bindings_count.manifest_ready > 0,
    launch_ready: entry.available_actions.includes('launch'),
  }));

  return {
    surface_kind: 'opl_domain_binding_parity',
    summary: {
      total_projects_count: projects.length,
      active_projects_count: projects.filter((entry) => entry.active_binding !== null).length,
      direct_entry_ready_projects_count: projects.filter((entry) => entry.direct_entry_ready).length,
      manifest_ready_projects_count: projects.filter((entry) => entry.manifest_ready).length,
      launch_ready_projects_count: projects.filter((entry) => entry.launch_ready).length,
      last_binding_change_at: workspaceCatalog.summary.last_binding_change_at,
    },
    projects,
    endpoints: {
      workspace_catalog: endpoints.workspace_catalog,
      workspace_bind: endpoints.workspace_bind,
      workspace_activate: endpoints.workspace_activate,
      workspace_archive: endpoints.workspace_archive,
      launch_domain: endpoints.launch_domain,
    },
    notes: [
      'This surface mirrors the domain-scoped binding state from `opl workspace list` so hosted shells do not need to reconstruct it from `opl status dashboard`.',
      'It stays derived from the writable workspace registry rather than inventing a second binding store.',
      'direct_entry_ready means the current project already has a bound command or URL; manifest_ready means the active binding already carries a manifest_command.',
    ],
  };
}

function buildFrontDeskDomainWiringSurfaceRef(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const wiring = buildFrontDeskDomainWiring(contracts, options).frontdesk_domain_wiring;

  return {
    surface_id: wiring.surface_id,
    endpoint: wiring.endpoints.frontdesk_domain_wiring,
    summary: wiring.summary,
  };
}

function buildFrontDeskReadinessSurfaceRef(options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    surface_id: 'opl_frontdesk_readiness',
    endpoint: endpoints.frontdesk_readiness,
  };
}

function buildFrontDeskDashboardSurfaceRef(options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    surface_id: 'opl_frontdesk_dashboard',
    endpoint: endpoints.dashboard,
  };
}

function buildFrontDeskShellBootstrap(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const frontdeskEntryGuideSurface = buildFrontDeskEntryGuideSurfaceRef(contracts, options);
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef(options);
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, options);
  const dashboardSurface = buildFrontDeskDashboardSurfaceRef(options);

  return {
    primary_surface: frontdeskEntryGuideSurface,
    follow_on_surfaces: [
      frontdeskReadinessSurface,
      domainWiringSurface,
      dashboardSurface,
    ],
    operator_debug_surface: dashboardSurface,
  };
}

type DomainWorkspaceGuide = {
  domain_workspace_kind: string;
  domain_workspace_label: string;
  domain_workspace_role: string;
  summary: string;
};

function buildDomainWorkspaceGuide(entry: DomainManifestCatalogEntry): DomainWorkspaceGuide {
  const surfaceKind = entry.manifest?.operator_loop_surface?.surface_kind;

  if (surfaceKind === 'workspace_cockpit' || entry.project_id === 'medautoscience') {
    return {
      domain_workspace_kind: 'research_workspace',
      domain_workspace_label: 'study queue',
      domain_workspace_role: 'research_runtime_workspace',
      summary:
        'OPL workspace 是 family-level task container；进入 MedAutoScience 后，domain workspace 会收紧为 research workspace / study queue，用来承接具体 study runtime 与研究闭环。',
    };
  }

  if (surfaceKind === 'grant_user_loop' || entry.project_id === 'medautogrant') {
    return {
      domain_workspace_kind: 'grant_workspace',
      domain_workspace_label: 'draft lane',
      domain_workspace_role: 'grant_draft_workspace',
      summary:
        'OPL workspace 只负责 family-level 路由；进入 MedAutoGrant 后，domain workspace 会收紧为 grant workspace / draft lane，用来推进 critique、revision 与导出链路。',
    };
  }

  if (surfaceKind === 'product_entry' || entry.project_id === 'redcube') {
    return {
      domain_workspace_kind: 'deliverable_workspace',
      domain_workspace_label: 'entry session',
      domain_workspace_role: 'deliverable_runtime_workspace',
      summary:
        'OPL workspace 仍是 family-level task container；进入 RedCube 后，domain workspace 会收紧为 deliverable workspace / entry session，用来持续推进某个交付物的 runtime loop。',
    };
  }

  return {
    domain_workspace_kind: 'domain_workspace',
    domain_workspace_label: 'domain workspace',
    domain_workspace_role: 'domain_runtime_workspace',
    summary:
      'OPL workspace 负责 family-level task routing；一旦 handoff 到具体 domain，后续执行会落到该 domain 自己定义的 workspace / runtime container。',
  };
}

function buildFrontDeskEntryGuideSurfaceRef(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const guide = buildFrontDeskEntryGuide(contracts, options).frontdesk_entry_guide;

  return {
    surface_id: guide.surface_id,
    endpoint: guide.endpoints.frontdesk_entry_guide,
    summary: guide.summary,
  };
}

export function buildFrontDeskEntryGuide(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const projects = domainManifests.projects.map((entry) => {
    const workspaceGuide = buildDomainWorkspaceGuide(entry);
    const manifest = entry.manifest;
    const startSurface = manifest?.product_entry_start;
    const preflightSurface = manifest?.product_entry_preflight;
    const readinessSurface = manifest?.product_entry_readiness;
    const orchestration = manifest?.family_orchestration;

    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      manifest_status: entry.status,
      target_domain_id: manifest?.target_domain_id ?? null,
      domain_workspace_kind: workspaceGuide.domain_workspace_kind,
      domain_workspace_label: workspaceGuide.domain_workspace_label,
      workspace_mapping: {
        family_workspace_kind: 'opl_family_workspace',
        family_workspace_role: 'family_task_container',
        domain_workspace_role: workspaceGuide.domain_workspace_role,
        summary: workspaceGuide.summary,
      },
      frontdesk: manifest?.frontdesk_surface
        ? {
            shell_key: manifest.frontdesk_surface.shell_key,
            command: manifest.frontdesk_surface.command,
            surface_kind: manifest.frontdesk_surface.surface_kind,
            summary: manifest.frontdesk_surface.summary,
          }
        : null,
      operator_loop: manifest?.operator_loop_surface
        ? {
            shell_key: manifest.operator_loop_surface.shell_key,
            command: manifest.operator_loop_surface.command,
            surface_kind: manifest.operator_loop_surface.surface_kind,
            summary: manifest.operator_loop_surface.summary,
            continuation_command: manifest.operator_loop_surface.continuation_command,
          }
        : null,
      start: startSurface
        ? {
            summary: startSurface.summary,
            recommended_mode_id: startSurface.recommended_mode_id,
            mode_count: startSurface.modes.length,
            mode_ids: startSurface.modes.map((mode) => mode.mode_id),
            modes: startSurface.modes,
            resume_surface: startSurface.resume_surface,
            human_gate_ids: startSurface.human_gate_ids,
          }
        : null,
      preflight: preflightSurface
        ? {
            summary: preflightSurface.summary,
            ready_to_try_now: preflightSurface.ready_to_try_now,
            recommended_check_command: preflightSurface.recommended_check_command,
            recommended_start_command: preflightSurface.recommended_start_command,
            blocking_check_ids: preflightSurface.blocking_check_ids,
          }
        : null,
      readiness: readinessSurface
        ? {
            verdict: readinessSurface.verdict,
            usable_now: readinessSurface.usable_now,
            good_to_use_now: readinessSurface.good_to_use_now,
            fully_automatic: readinessSurface.fully_automatic,
            summary: readinessSurface.summary,
            recommended_start_command: readinessSurface.recommended_start_command,
            recommended_loop_command: readinessSurface.recommended_loop_command,
            blocking_gaps: readinessSurface.blocking_gaps,
          }
        : null,
      orchestration: orchestration
        ? {
            action_graph_ref: orchestration.action_graph_ref,
            human_gate_ids: orchestration.human_gates
              .map((gate) => gate.gate_id)
              .filter((gateId): gateId is string => typeof gateId === 'string' && gateId.length > 0),
            resume_contract: orchestration.resume_contract,
          }
        : null,
      shared_handoff: manifest?.shared_handoff ?? {},
      recommended_start_command:
        readinessSurface?.recommended_start_command
        ?? preflightSurface?.recommended_start_command
        ?? manifest?.frontdesk_surface?.command
        ?? null,
      recommended_check_command: preflightSurface?.recommended_check_command ?? null,
    };
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_entry_guide: {
      surface_id: 'opl_frontdesk_entry_guide',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      workspace_taxonomy: {
        family_workspace_kind: 'opl_family_workspace',
        family_workspace_role: 'family_task_container',
        summary:
          'OPL workspace 是 family-level task container：先承接用户目标，再把任务 handoff 到具体 domain 的 workspace / runtime container。',
      },
      starter_prompts: projects.map((entry) => ({
        prompt_id: `start_${entry.project_id}`,
        project_id: entry.project_id,
        title: `Start ${entry.project}`,
        prompt: `从 ${entry.project} 开始，并告诉我当前推荐的 direct entry / start mode。`,
      })),
      summary: {
        total_projects_count: projects.length,
        resolved_projects_count: projects.filter((entry) => entry.manifest_status === 'resolved').length,
        ready_to_try_now_projects_count:
          projects.filter((entry) => entry.preflight?.ready_to_try_now === true).length,
        usable_now_projects_count: projects.filter((entry) => entry.readiness?.usable_now === true).length,
      },
      projects,
      endpoints: {
        frontdesk_entry_guide: endpoints.frontdesk_entry_guide,
        frontdesk_manifest: endpoints.manifest,
        frontdesk_readiness: endpoints.frontdesk_readiness,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
      },
      notes: [
        'This surface is machine-readable entry guidance for AI shells and higher-level GUI hosts; it stays derived from admitted domain manifests instead of inventing a second truth source.',
        'User-facing product naming can move to OPL Cortex at the GUI layer, while repo-internal surface ids remain frontdesk_* until a separate rename tranche is frozen.',
      ],
    },
  };
}

export function buildFrontDeskDomainWiring(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_domain_wiring: {
      surface_id: 'opl_frontdesk_domain_wiring',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_entry_parity: domainEntryParity,
      domain_binding_parity: domainBindingParity,
      recommended_entry_surfaces: recommendedEntrySurfaces,
      summary: {
        total_projects_count: domainEntryParity.summary.total_projects_count,
        aligned_projects_count: domainEntryParity.summary.aligned_projects_count,
        ready_for_opl_start_count: domainEntryParity.summary.ready_for_opl_start_count,
        ready_for_domain_handoff_count: domainEntryParity.summary.ready_for_domain_handoff_count,
        domain_entry_contract_ready_count: domainEntryParity.summary.domain_entry_contract_ready_count,
        domain_agent_entry_spec_ready_count: domainEntryParity.summary.domain_agent_entry_spec_ready_count,
        gateway_interaction_contract_ready_count:
          domainEntryParity.summary.gateway_interaction_contract_ready_count,
        active_binding_projects_count: domainBindingParity.summary.active_projects_count,
        manifest_ready_projects_count: domainBindingParity.summary.manifest_ready_projects_count,
        launch_ready_projects_count: domainBindingParity.summary.launch_ready_projects_count,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
      },
      endpoints: {
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        dashboard: endpoints.dashboard,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
      },
      notes: [
        'This surface hardens the family-level domain wiring truth for hosted shells and local front-desk consumers.',
        'It stays derived from active domain manifests and workspace bindings; it does not create a second truth source.',
      ],
    },
  };
}

function buildFrontDeskReadinessProjects(
  projects: DomainManifestCatalogEntry[],
  domainEntryParity: ReturnType<typeof buildDomainEntryParity>,
  domainBindingParity: ReturnType<typeof buildDomainBindingParity>,
) {
  const entryParityByProject = new Map(
    domainEntryParity.projects.map((entry) => [entry.project_id, entry]),
  );
  const bindingParityByProject = new Map(
    domainBindingParity.projects.map((entry) => [entry.project_id, entry]),
  );

  return projects.map((entry) => {
    const manifest = entry.manifest;
    const entryParity = entryParityByProject.get(entry.project_id);
    const bindingParity = bindingParityByProject.get(entry.project_id);
    const readiness = manifest?.product_entry_readiness;
    const preflight = manifest?.product_entry_preflight;
    const overview = manifest?.product_entry_overview;
    const quickstart = manifest?.product_entry_quickstart;

    return {
      project_id: entry.project_id,
      project: entry.project,
      manifest_status: entry.status,
      entry_parity_status: entryParity?.entry_parity_status ?? 'blocked',
      binding_active: bindingParity?.active_binding !== null,
      binding_direct_entry_ready: bindingParity?.direct_entry_ready ?? false,
      binding_manifest_ready: bindingParity?.manifest_ready ?? false,
      binding_launch_ready: bindingParity?.launch_ready ?? false,
      usable_now: readiness?.usable_now === true,
      good_to_use_now: readiness?.good_to_use_now === true,
      fully_automatic: readiness?.fully_automatic === true,
      ready_to_try_now: preflight?.ready_to_try_now === true,
      ready_for_opl_start: entryParity?.ready_for_opl_start ?? false,
      ready_for_domain_handoff: entryParity?.ready_for_domain_handoff ?? false,
      verdict: readiness?.verdict ?? null,
      summary: readiness?.summary ?? manifest?.product_entry_status?.summary ?? null,
      frontdesk_command:
        manifest?.frontdesk_surface?.command
        ?? manifest?.recommended_command
        ?? null,
      recommended_start_command:
        readiness?.recommended_start_command
        ?? entryParity?.recommended_start_command
        ?? preflight?.recommended_start_command
        ?? null,
      recommended_loop_command: readiness?.recommended_loop_command ?? null,
      recommended_check_command:
        preflight?.recommended_check_command
        ?? entryParity?.recommended_check_command
        ?? null,
      blocking_gaps_count: readiness?.blocking_gaps.length ?? 0,
      blocking_gaps: readiness?.blocking_gaps ?? [],
      blocking_check_ids: preflight?.blocking_check_ids ?? [],
      preflight_checks_count: preflight?.checks.length ?? 0,
      quickstart_steps_count: quickstart?.steps.length ?? 0,
      overview_progress_command: overview?.progress_surface?.command ?? null,
      overview_resume_command: overview?.resume_surface?.command ?? null,
      recommended_next_actions: entryParity?.recommended_next_actions ?? [],
    };
  });
}

export async function buildFrontDeskReadiness(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);
  const localService = (await getFrontDeskServiceStatus(contracts)).frontdesk_service;
  const projects = buildFrontDeskReadinessProjects(
    domainManifests.projects,
    domainEntryParity,
    domainBindingParity,
  );

  const summary = {
    total_projects_count: projects.length,
    resolved_manifests_count: domainManifests.summary.resolved_count,
    blocked_projects_count: domainEntryParity.summary.blocked_projects_count,
    usable_now_projects_count: projects.filter((entry) => entry.usable_now).length,
    good_to_use_now_projects_count: projects.filter((entry) => entry.good_to_use_now).length,
    fully_automatic_projects_count: projects.filter((entry) => entry.fully_automatic).length,
    ready_to_try_now_projects_count: projects.filter((entry) => entry.ready_to_try_now).length,
    direct_entry_ready_projects_count: domainBindingParity.summary.direct_entry_ready_projects_count,
    manifest_ready_projects_count: domainBindingParity.summary.manifest_ready_projects_count,
    launch_ready_projects_count: domainBindingParity.summary.launch_ready_projects_count,
    ready_for_opl_start_count: domainEntryParity.summary.ready_for_opl_start_count,
    ready_for_domain_handoff_count: domainEntryParity.summary.ready_for_domain_handoff_count,
    recommended_entry_projects_count: recommendedEntrySurfaces.length,
  };

  const recommendedNextActions: string[] = [];
  if (!localService.installed) {
    recommendedNextActions.push('如需长期本地产品入口，先执行 `opl frontdesk service install`。');
  } else if (!localService.loaded) {
    recommendedNextActions.push('frontdesk service 已安装但未加载，执行 `opl frontdesk service start`。');
  } else if (localService.health.status === 'unreachable') {
    recommendedNextActions.push('frontdesk service 已加载但健康检查失败，先执行 `opl frontdesk service status` 与 `opl session logs`。');
  }
  recommendedNextActions.push('GUI 壳应通过独立 GUI shell repo 接入这些 API；当前优先基于 AionUI，Onyx 只保留备线参考。');
  if (summary.manifest_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('给仍缺 manifest 的 active binding 补 `manifest_command`。');
  }
  if (summary.direct_entry_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('给仍缺 direct-entry locator 的项目补 `entry_command` 或 `entry_url`。');
  }
  if (summary.ready_for_domain_handoff_count < summary.total_projects_count) {
    recommendedNextActions.push('继续补齐 `product_entry_start` 与 `shared_handoff`，让 OPL start/handoff 口径完全对齐。');
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_readiness: {
      surface_id: 'opl_frontdesk_readiness',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      overall_status:
        summary.usable_now_projects_count > 0
          ? localService.health.status === 'ok'
            ? 'usable_with_known_gaps'
            : 'domain_ready_local_service_optional'
          : 'setup_incomplete',
      local_shell: {
        direct_entry_command: 'opl',
        quick_ask_command: 'opl <request...>',
        web_command: 'opl web',
      },
      local_service: localService,
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_entry_parity: domainEntryParity,
      domain_binding_parity: domainBindingParity,
      summary,
      projects,
      recommended_entry_surfaces: recommendedEntrySurfaces,
      recommended_next_actions: recommendedNextActions,
      endpoints: {
        frontdesk_readiness: endpoints.frontdesk_readiness,
        frontdesk_manifest: endpoints.manifest,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        dashboard: endpoints.dashboard,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        runtime_status: endpoints.runtime_status,
        session_ledger: endpoints.session_ledger,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
        health: endpoints.health,
      },
      notes: [
        'This surface is an operator-facing derived board: it reuses service status, hosted readiness, manifest truth, and workspace bindings without creating a second source of truth.',
        'usable_now / good_to_use_now / fully_automatic come from the domain-owned product_entry_readiness companion, not from OPL invention.',
        'Local service readiness remains optional for direct CLI use, but it is the shortest path to a persistent local front desk.',
      ],
    },
  };
}

function buildRecentSessions(limit = 5) {
  const result = runHermesCommand(buildHermesSessionsListArgs({ limit }));

  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Hermes sessions list failed inside OPL runtime-status.',
      {
        args: buildHermesSessionsListArgs({ limit }),
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return {
    command_preview: ['hermes', ...buildHermesSessionsListArgs({ limit })],
    sessions: parseHermesSessionsTable(result.stdout),
  };
}

export function buildProjectsOverview(contracts: GatewayContracts) {
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    projects: [
      {
        project_id: 'opl',
        project: 'one-person-lab',
        scope: 'family_gateway',
        direct_entry_surface: 'opl',
        active_binding: getActiveWorkspaceBinding('opl'),
        owned_workstreams: contracts.workstreams.workstreams.map((workstream) => workstream.workstream_id),
      },
      ...contracts.domains.domains.map((domain) => ({
        project_id: domain.domain_id,
        project: domain.project,
        scope: 'domain_gateway',
        gateway_surface: domain.gateway_surface,
        harness_surface: domain.harness_surface,
        standalone_allowed: domain.standalone_allowed,
        active_binding: getActiveWorkspaceBinding(domain.domain_id),
        owned_workstreams: domain.owned_workstreams,
      })),
    ],
  };
}

export function buildFrontDeskManifest(contracts: GatewayContracts, options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const hostedShellMcpWiring = buildFrontDeskShellMcpWiring();
  const frontdeskEntryGuideSurface = buildFrontDeskEntryGuideSurfaceRef(contracts, options);
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, options);
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef(options);
  const shellBootstrap = buildFrontDeskShellBootstrap(contracts, options);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_manifest: {
      surface_id: 'opl_hosted_friendly_frontdesk_manifest',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      readiness: 'hosted_friendly_shell_pilot_landed',
      hosted_packaging_status: 'frontdesk_package_landed',
      pilot_bundle_status: 'landed',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
      hosted_shell_mcp_wiring: hostedShellMcpWiring,
      frontdesk_entry_guide_surface: frontdeskEntryGuideSurface,
      frontdesk_readiness_surface: frontdeskReadinessSurface,
      domain_wiring_surface: domainWiringSurface,
      shell_bootstrap: shellBootstrap,
      handoff_envelope_fields: [
        'target_domain_id',
        'task_intent',
        'entry_mode',
        'workspace_locator',
        'runtime_session_contract',
        'return_surface_contract',
      ],
      endpoints,
      notes: [
        'This manifest freezes the hosted-friendly adapter contract now consumed by external GUI overlays.',
        'It still does not claim managed hosted runtime ownership or multi-tenant platform readiness.',
      ],
    },
  };
}

export function buildHostedPilotBundle(
  contracts: GatewayContracts,
  options: HostedPilotBundleOptions = {},
) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const sessionsLimit = options.sessionsLimit ?? 5;
  const normalizedBasePath = normalizeBasePath(options.basePath);
  const baseUrl = `http://${normalizeBaseUrlHost(host)}:${port}`;
  const oplApi = buildOplApiCatalog(normalizedBasePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const hostedShellMcpWiring = buildFrontDeskShellMcpWiring();

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    web_bundle: {
      surface_id: 'opl_web_bundle',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      bundle_status: 'landed',
      hosted_runtime_status: 'not_landed',
      base_path: normalizedBasePath,
      hosted_runtime_readiness: hostedRuntimeReadiness,
      hosted_shell_mcp_wiring: hostedShellMcpWiring,
      entry_url: buildFrontDeskEntryUrl(baseUrl, normalizedBasePath),
      api_base_url: buildFrontDeskApiBaseUrl(baseUrl, normalizedBasePath),
      opl_api: oplApi,
      defaults: {
        workspace_path: workspacePath,
        sessions_limit: sessionsLimit,
      },
      notes: [
        'This bundle packages the current OPL web entry with base-path-aware product API wiring.',
        'It now feeds external GUI overlays, but it is still not a managed hosted runtime or multi-tenant platform deployment.',
      ],
    },
  };
}

export function buildWorkspaceStatus(options: WorkspaceStatusOptions = {}) {
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const stats = fs.statSync(absolutePath);

  if (!stats.isDirectory()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace-status currently supports directories only.',
      {
        workspace_path: absolutePath,
      },
    );
  }

  return {
    version: 'g2',
    workspace: {
      requested_path: options.workspacePath ?? process.cwd(),
      absolute_path: absolutePath,
      kind: 'directory',
      entries: buildWorkspaceEntriesSummary(absolutePath),
      git: buildGitWorkspaceStatus(absolutePath),
    },
  };
}

export function buildRuntimeStatus(options: RuntimeStatusOptions = {}) {
  const hermes = inspectHermesRuntime();
  const statusResult = hermes.binary ? runHermesCommand(['status']) : null;
  const statusOutput = statusResult ? normalizeCommandOutput(statusResult.stdout, statusResult.stderr) : '';
  const parsedStatus = statusOutput ? parseHermesStatusOutput(statusOutput) : null;
  const processUsage = collectHermesProcessUsage();
  const recentSessions = hermes.binary ? buildRecentSessions(options.sessionsLimit ?? 5) : {
    command_preview: ['hermes', 'sessions', 'list', '--limit', String(options.sessionsLimit ?? 5)],
    sessions: [],
  };
  const ledger = buildSessionLedger(options.ledgerLimit ?? options.sessionsLimit ?? 5).session_ledger;

  return {
    version: 'g2',
    runtime_status: {
      runtime_substrate: 'external_hermes_kernel',
      hermes,
      status_report: {
        command_preview: ['hermes', 'status'],
        raw_output: statusOutput,
        parsed: parsedStatus,
      },
      recent_sessions: recentSessions,
      process_usage: processUsage,
      managed_session_ledger: ledger,
      notes: [
        'Process usage remains runtime-level visibility.',
        'The managed session ledger adds OPL-owned event attribution, but does not claim kernel-global exact per-session billing.',
        'Workspace and project orchestration still sit above the external Hermes kernel.',
      ],
    },
  };
}

export function buildFrontDeskHealth(contracts: GatewayContracts, options: { basePath?: string } = {}) {
  const hermes = inspectHermesRuntime();
  const status = !hermes.binary
    ? 'blocked'
    : hermes.gateway_service.loaded
      ? 'ok'
      : 'degraded';

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    health: {
      surface_id: 'opl_web_health_surface',
      entry_surface: 'opl_local_web_product_api',
      runtime_substrate: 'external_hermes_kernel',
      base_path: normalizeBasePath(options.basePath),
      status,
      web_package_status: 'landed',
      web_bundle_status: 'landed',
      checks: {
        hermes_binary: {
          found: Boolean(hermes.binary),
          path: hermes.binary?.path ?? null,
          source: hermes.binary?.source ?? null,
        },
        gateway_service: {
          loaded: hermes.gateway_service.loaded,
          raw_output: hermes.gateway_service.raw_output,
        },
        issues: hermes.issues,
      },
      notes: [
        'Health here means the current OPL web entry can truthfully expose the Hermes-backed runtime status.',
        'The repo-tracked web entry is API-first, while actual hosted runtime ownership is still not landed.',
      ],
    },
  };
}

export async function buildProjectProgressBrief(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const readiness = (await buildFrontDeskReadiness(contracts, {
    workspacePath,
    sessionsLimit: options.sessionsLimit,
    basePath: options.basePath,
  })).frontdesk_readiness;
  const runtimeStatus = buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  }).runtime_status;
  const currentProject = pickCurrentProjectEntry(domainManifests, workspaceCatalog, workspacePath);
  const readinessEntry = currentProject.projectId
    ? readiness.projects.find((entry) => entry.project_id === currentProject.projectId) ?? null
    : null;
  const manifestEntry = currentProject.manifestEntry;
  const manifest = manifestEntry?.manifest ?? null;
  const overview = manifest?.product_entry_overview ?? null;
  const productStatus = manifest?.product_entry_status ?? null;
  const repoMainline = manifest?.repo_mainline ?? null;
  const studySurface = buildStudyProgressSurface({
    workspacePath,
    overview,
    manifest,
  });
  const recentSession = runtimeStatus.recent_sessions.sessions[0] ?? null;
  const projectState =
    manifestEntry === null
      ? 'unbound'
      : manifestEntry.status !== 'resolved'
        ? 'attention_needed'
        : readinessEntry?.usable_now === false
          ? 'attention_needed'
          : 'active';
  const progressSummary =
    studySurface.progressSummary
    ?? studySurface.currentStudy?.story_summary
    ?? overview?.summary
    ?? productStatus?.summary
    ?? readinessEntry?.summary
    ?? (
      manifestEntry === null
        ? '当前 workspace 还没有绑定到可直接汇报进度的项目。'
        : '当前还没有读到结构化的项目进度摘要。'
    );
  const nextFocus =
    [
      studySurface.nextFocus,
      ...(overview?.next_focus ?? []),
      ...(productStatus?.next_focus ?? []),
      ...(Array.isArray(repoMainline?.next_focus)
        ? repoMainline.next_focus.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
      ...(readinessEntry?.recommended_next_actions ?? []),
    ][0] ?? null;
  const attentionItems = uniqueStrings([
    ...studySurface.attentionItems,
    ...(readinessEntry?.usable_now === false ? readinessEntry.blocking_gaps : []),
    explainManifestFailure(manifestEntry?.error ?? null),
  ]);
  const inspectPaths = uniqueStrings([
    workspacePath,
    currentProject.activeBindingEntry?.active_binding?.workspace_path ?? null,
    manifestEntry?.workspace_path ?? null,
    typeof manifest?.workspace_locator?.workspace_root === 'string' ? manifest.workspace_locator.workspace_root : null,
    typeof manifest?.workspace_locator?.profile_ref === 'string' ? manifest.workspace_locator.profile_ref : null,
    ...studySurface.inspectPaths,
  ]);
  const configuredHumanGates = uniqueStrings([
    ...(overview?.human_gate_ids ?? []),
    ...(manifest?.product_entry_start?.human_gate_ids ?? []),
  ]).map((gateId) => describeHumanGate(gateId));
  const workspaceFiles = studySurface.workspaceFiles;
  const deliverableFiles = workspaceFiles.filter((entry) => entry.kind === 'deliverable');
  const supportingFiles = workspaceFiles.filter((entry) => entry.kind === 'supporting');
  const progressFeedback = buildProgressFeedback({
    studySurface,
    progressSummary,
    nextFocus,
    recentSession,
  });
  const workspaceInbox = buildWorkspaceInbox({
    studySurface,
    manifest,
    recentSession,
    deliverableFiles,
    progressFeedback,
    workspacePath,
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    project_progress: {
      surface_id: 'opl_project_progress_brief',
      project_state: projectState,
      current_project: {
        project_id: currentProject.projectId,
        label: currentProject.projectLabel,
        workspace_path: workspacePath,
        active_binding_status: currentProject.activeBindingEntry?.active_binding?.status ?? null,
      },
      progress_summary: progressSummary,
      current_study: studySurface.currentStudy,
      next_focus: nextFocus,
      progress_feedback: progressFeedback,
      workspace_inbox: workspaceInbox,
      recent_activity: recentSession
        ? {
            session_id: recentSession.session_id,
            last_active: recentSession.last_active,
            source: recentSession.source,
            preview: recentSession.preview,
          }
        : studySurface.recentActivity,
      workspace_files: {
        deliverable_files: deliverableFiles,
        supporting_files: supportingFiles,
      },
      runtime_continuity: {
        control: manifest?.runtime_control ?? null,
        session: manifest?.session_continuity ?? null,
        progress: manifest?.progress_projection ?? null,
        artifacts: manifest?.artifact_inventory ?? null,
        runtime_inventory: manifest?.runtime_inventory ?? null,
        task_lifecycle: manifest?.task_lifecycle ?? null,
      },
      inspect_paths: inspectPaths,
      attention_items: attentionItems,
      user_options: studySurface.userOptions,
      configured_human_gates: configuredHumanGates,
      recommended_commands: {
        progress: studySurface.recommendedCommands.progress ?? overview?.progress_surface?.command ?? null,
        resume: studySurface.recommendedCommands.resume ?? overview?.resume_surface?.command ?? null,
        approval: studySurface.recommendedCommands.approval ?? manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        interrupt: studySurface.recommendedCommands.interrupt ?? manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        artifacts:
          studySurface.recommendedCommands.artifacts
          ?? manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
          ?? manifest?.artifact_inventory?.artifact_surface?.command
          ?? null,
        start: readinessEntry?.recommended_start_command ?? null,
      },
      notes: [
        'This brief is a user-facing summary derived from workspace binding, domain manifest, product readiness, and runtime visibility.',
        'When the current domain exposes study-level truth, this brief promotes the most active study into a paper-facing summary instead of stopping at project-level wording.',
        'Configured human gates are capability hints from the domain manifest; they do not by themselves mean the system is currently waiting for user input.',
      ],
    },
  };
}

export function buildFrontDeskStart(
  contracts: GatewayContracts,
  options: StartSurfaceOptions,
) {
  if (!options.projectId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'start requires a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  findDomainOrThrow(contracts, options.projectId);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const entry = domainManifests.projects.find((candidate) => candidate.project_id === options.projectId);

  if (!entry) {
    throw new GatewayContractError(
      'domain_not_found',
      'Requested project is not part of the admitted domain set.',
      {
        project_id: options.projectId,
      },
    );
  }

  if (entry.status !== 'resolved' || !entry.manifest?.product_entry_start) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested project does not currently expose a resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        status: entry.status,
        manifest_command: entry.manifest_command,
        workspace_path: entry.workspace_path,
      },
    );
  }

  const startSurface = entry.manifest.product_entry_start;
  const selectedModeId = options.modeId ?? startSurface.recommended_mode_id;
  const selectedMode = startSurface.modes.find((mode) => mode.mode_id === selectedModeId) ?? null;

  if (!selectedModeId || !selectedMode) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested start mode is not available on the resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        mode_id: options.modeId ?? null,
        available_modes: startSurface.modes.map((mode) => mode.mode_id),
      },
    );
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    product_entry_start: {
      surface_kind: 'opl_product_entry_start',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      target_domain_id: entry.manifest.target_domain_id,
      summary: startSurface.summary,
      recommended_mode_id: startSurface.recommended_mode_id,
      selected_mode_id: selectedModeId,
      selected_mode: selectedMode,
      available_modes: startSurface.modes,
      resume_surface: startSurface.resume_surface,
      human_gate_ids: startSurface.human_gate_ids,
    },
  };
}

export function buildFrontDeskDashboard(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const runtimeModes = readFrontDeskRuntimeModes();
  const projects = buildProjectsOverview(contracts).projects;
  const workspace = buildWorkspaceStatus({ workspacePath: options.workspacePath }).workspace;
  const runtimeStatus = buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  }).runtime_status;
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);
  const frontdeskEntryGuideSurface = buildFrontDeskEntryGuideSurfaceRef(contracts, options);
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef(options);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    dashboard: {
      product_api: {
        direct_entry_command: 'opl',
        local_shell_status: 'landed',
        local_web_command: 'opl web',
        local_web_status: 'pilot_landed',
        desktop_shell_status: 'not_repo_tracked',
        desktop_default_entry_status: 'external_overlay_required',
        interaction_mode: runtimeModes.interaction_mode,
        execution_mode: runtimeModes.execution_mode,
        hosted_friendly_surface_status: 'landed',
        web_bundle_status: 'landed',
        hosted_runtime_readiness: hostedRuntimeReadiness,
        entry_guide_surface: frontdeskEntryGuideSurface,
        readiness_surface: frontdeskReadinessSurface,
        workspace_registry_status: 'landed',
        session_ledger_status: 'landed',
        handoff_bundle_status: 'landed',
        domain_entry_parity: domainEntryParity,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
        recommended_entry_surfaces: recommendedEntrySurfaces,
        next_major_target: 'opl_hosted_runtime_hardening',
        hosted_friendly_endpoints: endpoints,
        rollout_board_refs: [
          'docs/references/opl-frontdesk-delivery-board.md',
          'docs/references/opl-hosted-web-frontdesk-benchmark.md',
          'docs/references/family-lightweight-direct-entry-rollout-board.md',
          'docs/references/mas-top-level-cutover-board.md',
        ],
        notes: [
          'OPL now exposes adapter/API truth together with the local web entry and web bundle exports.',
          'Workspace registry, managed session ledger, handoff bundle, and current Codex/Hermes mode selection are all visible from the same top-level board.',
          '`opl workspace list` keeps `manifest_command` as non-executing registry state, while `opl domain manifests` resolves the active bound machine-readable product-entry manifests.',
          'Resolved domain manifests now also feed domain entry surface plus operator-loop actions and recommended shell/command hints back into dashboard and handoff surfaces.',
          'Resolved domain manifests now also surface family-orchestration companion previews so the top-level product API board can show human-gate and resume semantics instead of hiding them in domain docs.',
          'The GUI mainline should live in an external GUI shell repo, currently aligned around AionUI, while this repo stays headless and contract-first.',
        ],
      },
      projects,
      workspace,
      workspace_catalog: workspaceCatalog,
      domain_manifests: domainManifests,
      runtime_status: runtimeStatus,
    },
  };
}
