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
import { getFrontDeskLibreChatServiceStatus } from './frontdesk-librechat-service.ts';
import { getFrontDeskServiceStatus } from './frontdesk-service.ts';
import {
  buildDomainManifestCatalog,
  type DomainManifestCatalogEntry,
  type NormalizedDomainManifest,
} from './domain-manifest.ts';
import {
  buildHermesSessionsListArgs,
  inspectHermesRuntime,
  parseHermesSessionsTable,
  runHermesCommand,
} from './hermes.ts';
import { buildSessionLedger } from './session-ledger.ts';
import {
  collectHermesProcessUsage,
  normalizeCommandOutput,
  parseHermesStatusOutput,
} from './runtime-observer.ts';
import { buildWorkspaceCatalog, getActiveWorkspaceBinding } from './workspace-registry.ts';
import { buildPaperclipControlPlaneSummary } from './paperclip-control-plane.ts';
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

function pickManifestPhaseId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.phase_id,
    repoMainline.current_program_phase_id,
    repoMainline.active_phase,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function pickManifestTrancheId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.tranche_id,
    repoMainline.current_stage_id,
    repoMainline.active_tranche,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
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

function buildStudyProgressSurface(options: {
  workspacePath: string;
  overview: NormalizedDomainManifest['product_entry_overview'] | null;
  manifest: NormalizedDomainManifest | null;
}) {
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
      recommendedCommands: {
        progress: options.overview?.progress_surface?.command ?? null,
        resume: options.overview?.resume_surface?.command ?? null,
      },
      userOptions: buildCurrentStudyUserOptions(false),
    };
  }

  const operatorLoopPayload = operatorLoop.payload;
  const currentStudySummary = pickCurrentStudyEntry(operatorLoopPayload?.studies);
  if (!currentStudySummary) {
    return {
      currentStudy: null,
      progressSummary: null,
      nextFocus: null,
      attentionItems,
      inspectPaths: [],
      recentActivity: null,
      recommendedCommands: {
        progress: options.overview?.progress_surface?.command ?? null,
        resume: options.overview?.resume_surface?.command ?? null,
      },
      userOptions: buildCurrentStudyUserOptions(false),
    };
  }

  const studyCommands = isRecord(currentStudySummary.commands) ? currentStudySummary.commands : null;
  const progressCommand =
    optionalString(studyCommands?.progress)
    ?? optionalString(options.overview?.progress_surface?.command)?.replace(/<study_id>/g, optionalString(currentStudySummary.study_id) ?? '')
    ?? null;
  const resumeCommand =
    optionalString(studyCommands?.launch)
    ?? optionalString(options.overview?.resume_surface?.command)?.replace(/<study_id>/g, optionalString(currentStudySummary.study_id) ?? '')
    ?? null;
  const progressPayloadResult = runJsonShellCommand(progressCommand, options.workspacePath);

  if (progressPayloadResult.error) {
    attentionItems.push(`当前论文已定位，但详细 study 进度面暂时不可读：${progressPayloadResult.error}`);
  }

  const progressPayload = progressPayloadResult.payload;
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
    optionalString(currentStudySummary.study_id)
      ? `${optionalString(currentStudySummary.study_id)} 当前阶段：${currentStageSummary ?? '待确认'}`
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
    recommendedCommands: {
      progress: progressCommand,
      resume: resumeCommand,
    },
    userOptions: buildCurrentStudyUserOptions(true, Boolean(paperSnapshot)),
  };
}

export function buildHostedRuntimeReadiness() {
  return {
    surface_kind: 'opl_hosted_runtime_readiness',
    status: 'pilot_ready_not_managed',
    shell_integration_target: 'librechat_first',
    managed_hosted_runtime_landed: false,
    local_web_frontdesk_landed: true,
    hosted_friendly_contract_landed: true,
    hosted_pilot_bundle_landed: true,
    self_hostable_pilot_package_landed: true,
    librechat_pilot_package_landed: true,
    service_safe_local_packaging_landed: true,
    blocking_gaps: [
      'managed hosted runtime ownership 仍未 landed。',
      'multi-tenant hosted platform orchestration 仍未 landed。',
      'frontdesk 与 hosted shell 的深层 tool wiring 仍未 landed。',
    ],
    recommended_next_actions: [
      '继续把 hosted shell 入口收紧到同一份 frontdesk contract 上。',
      '把 managed hosted runtime 的 service orchestration、tenant boundary 与 policy surface 单独冻结。',
      '保持 Hermes 作为外部 runtime substrate，不在 OPL 仓内虚构托管完成度。',
    ],
  };
}

function hasResolvedCommand(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildDomainEntryParity(projects: DomainManifestCatalogEntry[]) {
  const normalizedProjects = projects.map((entry) => {
    const manifest = entry.manifest;
    const binding = getActiveWorkspaceBinding(entry.project_id);
    const manifestResolved = entry.status === 'resolved' && manifest !== null;
    const directEntryLocatorReady = Boolean(binding?.direct_entry.command || binding?.direct_entry.url);
    const frontdeskSurfaceReady = Boolean(
      manifest?.frontdesk_surface?.surface_kind
      && hasResolvedCommand(manifest?.frontdesk_surface?.command),
    );
    const startSurfaceReady = Boolean(
      manifest?.product_entry_start?.surface_kind
      && Array.isArray(manifest?.product_entry_start?.modes)
      && manifest.product_entry_start.modes.length > 0,
    );
    const sharedHandoffReady = Boolean(
      manifest?.shared_handoff && Object.keys(manifest.shared_handoff).length > 0,
    );
    const readyForOplStart = Boolean(manifestResolved && startSurfaceReady);
    const readyForDomainHandoff = Boolean(manifestResolved && sharedHandoffReady);

    const gaps: string[] = [];
    if (!manifestResolved) {
      gaps.push('当前 active binding 尚未暴露 resolved product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      gaps.push('当前 active binding 缺少 direct-entry locator（entry command 或 entry URL）。');
    }
    if (manifestResolved && !frontdeskSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 frontdesk surface。');
    }
    if (manifestResolved && !startSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 start surface。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      gaps.push('manifest 尚未暴露 shared handoff surface。');
    }

    let entryParityStatus: 'aligned' | 'partial' | 'blocked' = 'blocked';
    if (manifestResolved && frontdeskSurfaceReady && startSurfaceReady && sharedHandoffReady) {
      entryParityStatus = directEntryLocatorReady ? 'aligned' : 'partial';
    } else if (manifestResolved) {
      entryParityStatus = 'partial';
    }

    const recommendedNextActions: string[] = [];
    if (!manifestResolved) {
      recommendedNextActions.push('先冻结并绑定 repo-tracked product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      recommendedNextActions.push('给 active binding 补 entry_command 或 entry_url，让 OPL 可直接定位 domain frontdesk。');
    }
    if (manifestResolved && !frontdeskSurfaceReady) {
      recommendedNextActions.push('补齐 manifest.frontdesk_surface.command，让 frontdesk locator 与 manifest 一致。');
    }
    if (manifestResolved && !startSurfaceReady) {
      recommendedNextActions.push('补齐 product_entry_start surface，保持 OPL start 与 domain start 同口径。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      recommendedNextActions.push('补齐 shared_handoff surface，让 OPL handoff 不再靠隐式约定。');
    }

    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: binding?.binding_id ?? entry.binding_id,
      workspace_path: binding?.workspace_path ?? entry.workspace_path,
      entry_parity_status: entryParityStatus,
      manifest_status: entry.status,
      direct_entry_locator_status: directEntryLocatorReady ? 'ready' : 'missing',
      frontdesk_surface_status: frontdeskSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      start_surface_status: startSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      shared_handoff_status: sharedHandoffReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      ready_for_opl_start: readyForOplStart,
      ready_for_domain_handoff: readyForDomainHandoff,
      product_entry_readiness_verdict: manifest?.product_entry_readiness?.verdict ?? null,
      recommended_start_command:
        manifest?.frontdesk_surface?.command
        ?? manifest?.recommended_command
        ?? manifest?.product_entry_preflight?.recommended_start_command
        ?? null,
      recommended_check_command: manifest?.product_entry_preflight?.recommended_check_command ?? null,
      gaps,
      recommended_next_actions: recommendedNextActions,
    };
  });

  return {
    surface_kind: 'opl_domain_entry_parity',
    summary: {
      total_projects_count: normalizedProjects.length,
      aligned_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'aligned').length,
      partial_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'partial').length,
      blocked_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'blocked').length,
      direct_entry_locator_ready_projects_count:
        normalizedProjects.filter((entry) => entry.direct_entry_locator_status === 'ready').length,
      ready_for_opl_start_count:
        normalizedProjects.filter((entry) => entry.ready_for_opl_start).length,
      ready_for_domain_handoff_count:
        normalizedProjects.filter((entry) => entry.ready_for_domain_handoff).length,
    },
    projects: normalizedProjects,
    notes: [
      'Domain entry parity is a family-level derived surface, not a second manifest system.',
      'A project can be start-ready and handoff-ready before it has a direct-entry locator bound into the active workspace.',
      'aligned means frontdesk/start/shared-handoff are resolved and the active binding already carries a direct-entry locator.',
    ],
  };
}

function buildRecommendedEntrySurfaces(projects: DomainManifestCatalogEntry[]) {
  return projects
    .filter((entry) => entry.status === 'resolved' && entry.manifest?.recommended_command)
    .map((entry) => {
      const activeBinding = getActiveWorkspaceBinding(entry.project_id);

      return {
        project_id: entry.project_id,
        project: entry.project,
        binding_id: entry.binding_id,
        manifest_target_domain_id: entry.manifest?.target_domain_id ?? null,
        frontdesk_surface: entry.manifest?.frontdesk_surface ?? null,
        operator_loop_shell_key: entry.manifest?.operator_loop_surface?.shell_key ?? null,
        operator_loop_command: entry.manifest?.operator_loop_surface?.command ?? null,
        operator_loop_surface_kind: entry.manifest?.operator_loop_surface?.surface_kind ?? null,
        operator_loop_summary: entry.manifest?.operator_loop_surface?.summary ?? null,
        operator_loop_continuation_command: entry.manifest?.operator_loop_surface?.continuation_command ?? null,
        operator_loop_actions: entry.manifest?.operator_loop_actions ?? {},
        product_entry_start: entry.manifest?.product_entry_start ?? null,
        product_entry_start_resume_surface_kind:
          entry.manifest?.product_entry_start?.resume_surface?.surface_kind ?? null,
        product_entry_start_mode_ids:
          entry.manifest?.product_entry_start?.modes.map((mode) => mode.mode_id) ?? [],
        product_entry_overview: entry.manifest?.product_entry_overview ?? null,
        product_entry_preflight: entry.manifest?.product_entry_preflight ?? null,
        product_entry_quickstart: entry.manifest?.product_entry_quickstart ?? null,
        manifest_version: entry.manifest?.manifest_version ?? null,
        recommended_shell: entry.manifest?.recommended_shell ?? null,
        recommended_command: entry.manifest?.recommended_command ?? null,
        product_entry_shell: entry.manifest?.product_entry_shell ?? {},
        shared_handoff: entry.manifest?.shared_handoff ?? {},
        family_orchestration: entry.manifest?.family_orchestration ?? null,
        product_entry_readiness: entry.manifest?.product_entry_readiness ?? null,
        manifest_command: entry.manifest_command,
        workspace_path: entry.workspace_path,
        active_binding_locator_status:
          activeBinding?.direct_entry.command || activeBinding?.direct_entry.url ? 'ready' : 'missing',
        active_binding_locator: {
          binding_id: activeBinding?.binding_id ?? null,
          workspace_path: activeBinding?.workspace_path ?? null,
          status: activeBinding?.status ?? null,
          command: activeBinding?.direct_entry.command ?? null,
          url: activeBinding?.direct_entry.url ?? null,
          manifest_command: activeBinding?.direct_entry.manifest_command ?? null,
        },
        mainline_phase_id: pickManifestPhaseId(entry.manifest?.repo_mainline ?? null),
        mainline_tranche_id: pickManifestTrancheId(entry.manifest?.repo_mainline ?? null),
        product_entry_status_summary: entry.manifest?.product_entry_status?.summary ?? null,
        product_entry_next_focus: entry.manifest?.product_entry_status?.next_focus ?? [],
        product_entry_remaining_gaps_count:
          entry.manifest?.product_entry_status?.remaining_gaps_count
          ?? entry.manifest?.remaining_gaps.length
          ?? null,
        product_entry_overview_summary: entry.manifest?.product_entry_overview?.summary ?? null,
        product_entry_overview_progress_command:
          entry.manifest?.product_entry_overview?.progress_surface?.command ?? null,
        product_entry_overview_resume_command:
          entry.manifest?.product_entry_overview?.resume_surface?.command ?? null,
        product_entry_overview_human_gate_ids: entry.manifest?.product_entry_overview?.human_gate_ids ?? [],
        product_entry_preflight_summary: entry.manifest?.product_entry_preflight?.summary ?? null,
        product_entry_preflight_ready_to_try_now:
          entry.manifest?.product_entry_preflight?.ready_to_try_now ?? null,
        product_entry_preflight_recommended_check_command:
          entry.manifest?.product_entry_preflight?.recommended_check_command ?? null,
        product_entry_preflight_recommended_start_command:
          entry.manifest?.product_entry_preflight?.recommended_start_command ?? null,
        product_entry_preflight_blocking_check_ids:
          entry.manifest?.product_entry_preflight?.blocking_check_ids ?? [],
        product_entry_preflight_checks_count:
          entry.manifest?.product_entry_preflight?.checks.length ?? 0,
        product_entry_readiness_verdict: entry.manifest?.product_entry_readiness?.verdict ?? null,
        product_entry_readiness_summary: entry.manifest?.product_entry_readiness?.summary ?? null,
        product_entry_readiness_usable_now: entry.manifest?.product_entry_readiness?.usable_now ?? null,
        product_entry_readiness_good_to_use_now:
          entry.manifest?.product_entry_readiness?.good_to_use_now ?? null,
        product_entry_readiness_fully_automatic:
          entry.manifest?.product_entry_readiness?.fully_automatic ?? null,
        product_entry_readiness_start_command:
          entry.manifest?.product_entry_readiness?.recommended_start_command ?? null,
        product_entry_readiness_loop_command:
          entry.manifest?.product_entry_readiness?.recommended_loop_command ?? null,
        product_entry_readiness_blocking_gaps:
          entry.manifest?.product_entry_readiness?.blocking_gaps ?? [],
        family_human_gate_count: entry.manifest?.family_orchestration?.human_gates.length ?? 0,
        family_human_gate_ids:
          entry.manifest?.family_orchestration?.human_gates.map((gate) => String(gate.gate_id)) ?? [],
        family_resume_surface_kind: entry.manifest?.family_orchestration?.resume_contract?.surface_kind ?? null,
        family_action_graph_ref: entry.manifest?.family_orchestration?.action_graph_ref?.ref ?? null,
        family_action_graph_node_count:
          Array.isArray(entry.manifest?.family_orchestration?.action_graph?.nodes)
            ? entry.manifest.family_orchestration.action_graph.nodes.length
            : 0,
        family_action_graph_edge_count:
          Array.isArray(entry.manifest?.family_orchestration?.action_graph?.edges)
            ? entry.manifest.family_orchestration.action_graph.edges.length
            : 0,
        family_event_envelope_ref: entry.manifest?.family_orchestration?.event_envelope_surface?.ref ?? null,
        family_checkpoint_lineage_ref:
          entry.manifest?.family_orchestration?.checkpoint_lineage_surface?.ref ?? null,
        quickstart_step_count: entry.manifest?.product_entry_quickstart?.steps.length ?? 0,
        quickstart_step_ids: entry.manifest?.product_entry_quickstart?.steps.map((step) => step.step_id) ?? [],
      };
    });
}

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
      'This surface mirrors the domain-scoped binding state from workspace-catalog so hosted shells do not need to reconstruct it from dashboard.',
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

function buildFrontDeskLibreChatStatusSurfaceRef(options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    surface_id: 'opl_frontdesk_librechat_status',
    endpoint: endpoints.frontdesk_librechat_status,
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
      shell_integration_target: 'librechat_first',
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
      shell_integration_target: 'librechat_first',
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
  const localHostedShell = (await getFrontDeskLibreChatServiceStatus(contracts)).frontdesk_librechat;
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
    recommendedNextActions.push('如需长期本地产品入口，先执行 `opl frontdesk-service-install`。');
  } else if (!localService.loaded) {
    recommendedNextActions.push('frontdesk service 已安装但未加载，执行 `opl frontdesk-service-start`。');
  } else if (localService.health.status === 'unreachable') {
    recommendedNextActions.push('frontdesk service 已加载但健康检查失败，先执行 `opl frontdesk-service-status` 与 `opl logs`。');
  }
  if (!localHostedShell.installed) {
    recommendedNextActions.push('如需本地 hosted shell，执行 `opl frontdesk-bootstrap` 或 `opl frontdesk-librechat-install`。');
  } else if (!localHostedShell.running) {
    recommendedNextActions.push('local LibreChat front door 已安装但未运行，执行 `opl frontdesk-librechat-start`。');
  } else if (localHostedShell.identity.sync_status === 'drifted') {
    recommendedNextActions.push('local LibreChat front door 与当前 Codex 默认配置已漂移，执行 `opl frontdesk-librechat-start` 重新同步。');
  }
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
      shell_integration_target: 'librechat_first',
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
      local_hosted_shell: {
        surface_id: 'opl_frontdesk_librechat_status',
        ...localHostedShell,
      },
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
        frontdesk_librechat_status: endpoints.frontdesk_librechat_status,
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
      shell_integration_target: 'librechat_first',
      readiness: 'hosted_friendly_shell_pilot_landed',
      hosted_packaging_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
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
        'This manifest freezes the local hosted-friendly shell contract now consumed by the landed LibreChat-first pilot package.',
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
  const endpoints = buildFrontDeskEndpoints(normalizedBasePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef({
    basePath: normalizedBasePath,
  });
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, {
    basePath: normalizedBasePath,
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    hosted_pilot_bundle: {
      surface_id: 'opl_hosted_frontdesk_pilot_bundle',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'librechat_first',
      pilot_bundle_status: 'landed',
      actual_hosted_runtime_status: 'not_landed',
      base_path: normalizedBasePath,
      hosted_runtime_readiness: hostedRuntimeReadiness,
      frontdesk_readiness_surface: frontdeskReadinessSurface,
      domain_wiring_surface: domainWiringSurface,
      entry_url: buildFrontDeskEntryUrl(baseUrl, normalizedBasePath),
      api_base_url: buildFrontDeskApiBaseUrl(baseUrl, normalizedBasePath),
      endpoints,
      defaults: {
        workspace_path: workspacePath,
        sessions_limit: sessionsLimit,
      },
      notes: [
        'This bundle makes the current front desk hosted-pilot-ready through base-path-aware shell packaging.',
        'It now feeds the landed LibreChat-first hosted shell pilot package, but it is still not a managed hosted runtime or multi-tenant platform deployment.',
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
      surface_id: 'opl_frontdesk_health_surface',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      base_path: normalizeBasePath(options.basePath),
      status,
      hosted_packaging_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
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
        'Health here means the current front-desk shell can truthfully expose the Hermes-backed runtime status.',
        'LibreChat-first hosted shell export is landed, but actual hosted runtime ownership is still not landed.',
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
      recent_activity: recentSession
        ? {
            session_id: recentSession.session_id,
            last_active: recentSession.last_active,
            source: recentSession.source,
            preview: recentSession.preview,
          }
        : studySurface.recentActivity,
      inspect_paths: inspectPaths,
      attention_items: attentionItems,
      user_options: studySurface.userOptions,
      configured_human_gates: configuredHumanGates,
      recommended_commands: {
        progress: studySurface.recommendedCommands.progress ?? overview?.progress_surface?.command ?? null,
        resume: studySurface.recommendedCommands.resume ?? overview?.resume_surface?.command ?? null,
        start: readinessEntry?.recommended_start_command ?? null,
      },
      notes: [
        'This brief is a user-facing summary derived from workspace binding, domain manifest, frontdesk readiness, and runtime visibility.',
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
  const paperclipControlPlane = buildPaperclipControlPlaneSummary(contracts);
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
  const frontdeskLibreChatStatusSurface = buildFrontDeskLibreChatStatusSurfaceRef(options);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    dashboard: {
      front_desk: {
        direct_entry_command: 'opl',
        local_shell_status: 'landed',
        local_web_frontdesk_command: 'opl web',
        local_web_frontdesk_status: 'pilot_landed',
        hosted_friendly_surface_status: 'landed',
        hosted_pilot_bundle_status: 'landed',
        hosted_web_status: 'librechat_pilot_landed',
        librechat_pilot_package_status: 'landed',
        hosted_runtime_readiness: hostedRuntimeReadiness,
        frontdesk_entry_guide_surface: frontdeskEntryGuideSurface,
        frontdesk_readiness_surface: frontdeskReadinessSurface,
        frontdesk_librechat_status_surface: frontdeskLibreChatStatusSurface,
        workspace_registry_status: 'landed',
        session_ledger_status: 'landed',
        handoff_bundle_status: 'landed',
        domain_entry_parity: domainEntryParity,
        paperclip_control_plane_status: paperclipControlPlane.readiness,
        paperclip_control_plane_endpoint: endpoints.paperclip_control_plane,
        paperclip_bound_projects_count: paperclipControlPlane.summary.project_bindings_count,
        paperclip_control_company_id: paperclipControlPlane.connection.control_company_id,
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
        'OPL now exposes a base-path-aware hosted pilot bundle in addition to the local web front-desk pilot.',
        'Workspace registry, managed session ledger, and handoff bundle surfaces are now part of the top-level control room.',
        'Paperclip can now sit downstream as an external control plane through a file-backed OPL bridge instead of becoming a replacement runtime.',
        'workspace-catalog keeps manifest_command as non-executing registry state, while domain-manifests resolves the active bound machine-readable product-entry manifests.',
        'Resolved domain manifests now also feed frontdesk surface plus operator-loop actions and recommended shell/command hints back into dashboard and handoff surfaces.',
        'Resolved domain manifests now also surface family-orchestration companion previews so the top-level front desk can show human-gate and resume semantics instead of hiding them in domain docs.',
        'The LibreChat-first hosted shell pilot is now landed through the export package, while managed hosted runtime readiness remains a separate follow-up track.',
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

export function buildPaperclipControlPlaneStatus(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const paperclipControlPlane = buildPaperclipControlPlaneSummary(contracts);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    paperclip_control_plane: {
      action: 'status',
      ...paperclipControlPlane,
      gateway: {
        surface: {
          surface_id: 'opl_paperclip_control_plane_bridge_surface',
          endpoints: {
            control_plane: endpoints.paperclip_control_plane,
            bootstrap: endpoints.paperclip_bootstrap,
            sync: endpoints.paperclip_sync,
            dashboard: endpoints.dashboard,
            domain_manifests: endpoints.domain_manifests,
            handoff_envelope: endpoints.handoff_envelope,
          },
          contract_refs: {
            handoff: 'contracts/opl-gateway/handoff.schema.json',
            family_human_gate: 'contracts/family-orchestration/family-human-gate.schema.json',
            governance_audit: 'contracts/opl-gateway/governance-audit.schema.json',
          },
        },
        dashboard: buildFrontDeskDashboard(contracts, options).dashboard,
      },
    },
  };
}
