import fs from 'node:fs';
import path from 'node:path';

import { buildWorkspaceCatalog } from '../workspace-registry.ts';
import {
  humanizeProgressCode,
  readStatusNarrationContract,
  statusNarrationLatestUpdate,
  statusNarrationNextStep,
  statusNarrationStageSummary,
  statusNarrationSummary,
} from '../status-narration.ts';

import {
  extractFrontMatterTitle,
  extractMarkedField,
  isRecord,
  normalizeInlineText,
  optionalNumber,
  optionalString,
  optionalStringList,
  readOptionalJsonRecord,
  readOptionalText,
  runJsonShellCommand,
  summarizeFigureCounts,
  summarizeTableCounts,
  uniqueStrings,
} from './shared.ts';
import {
  buildDomainManifestCatalog,
  type DomainManifestCatalogEntry,
  type NormalizedDomainManifest,
} from './domain-manifest-catalog.ts';

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

export type ProjectProgressDecision = {
  gate_id: string;
  label: string;
  reason: string;
};

export function describeHumanGate(gateId: string): ProjectProgressDecision {
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

export function explainManifestFailure(error: DomainManifestCatalogEntry['error']) {
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

export function pickCurrentProjectEntry(
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

export function buildStudyProgressSurface(options: {
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
