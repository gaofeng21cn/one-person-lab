import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  parseJsonText,
  optionalString,
  writeJsonPayloadFile,
} from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';

const RHO_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  backend: 'rho',
  apply_mode: 'no_apply',
  can_direct_apply: false,
  can_call_external_rho_cli: false,
  can_mutate_artifact_body: false,
  can_promote_default_agent: false,
  can_define_runtime_substrate: false,
};

type AgentLabRhoBackendRunInput = {
  projectDir: string;
  sessionsDir?: string | null;
  outputDir?: string | null;
  maxTrajectories?: number | null;
};

type ParsedTrajectory = {
  file: string;
  cwd: string | null;
  userMessages: string[];
  assistantMessages: string[];
  commandCount: number;
  failureCount: number;
  lineCount: number;
  rawText: string;
};

function projectSlug(projectDir: string) {
  return projectDir
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'project';
}

function assertDirectory(value: string, field: string) {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Agent Lab RHO ${field} is missing: ${value}.`, {
        [field]: value,
      });
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent Lab RHO ${field} must be a directory.`, {
      [field]: value,
    });
  }
}

function defaultCodexSessionsDir() {
  return path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
}

function walkSessionFiles(root: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(root)) {
    return files;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSessionFiles(fullPath));
    } else if (
      entry.isFile()
      && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.txt') || entry.name.endsWith('.md'))
    ) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = parseJsonText(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractMessage(payload: Record<string, unknown>): string | null {
  const message = optionalString(payload.message)
    ?? optionalString(payload.last_agent_message)
    ?? optionalString(payload.text);
  if (message) {
    return message;
  }
  const item = nestedRecord(payload.item);
  return optionalString(item.text);
}

function parseSessionFile(file: string): ParsedTrajectory {
  const rawText = fs.readFileSync(file, 'utf8');
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const parsed: ParsedTrajectory = {
    file,
    cwd: null,
    userMessages: [],
    assistantMessages: [],
    commandCount: 0,
    failureCount: 0,
    lineCount: lines.length,
    rawText,
  };

  for (const line of lines) {
    const event = safeJsonParse(line);
    if (!event) {
      continue;
    }
    const type = optionalString(event.type);
    const payload = nestedRecord(event.payload);
    if (type === 'session_meta') {
      const cwd = optionalString(payload.cwd);
      if (cwd) {
        parsed.cwd = cwd;
      }
      continue;
    }

    const payloadType = optionalString(payload.type);
    const message = extractMessage(payload);
    if (payloadType === 'user_message' && message) {
      parsed.userMessages.push(message);
    } else if ((payloadType === 'agent_message' || type === 'task_complete') && message) {
      parsed.assistantMessages.push(message);
    }

    if (type === 'response_item' || type === 'function_call' || payloadType === 'function_call') {
      parsed.commandCount += 1;
    }
    const text = `${line}\n${message ?? ''}`.toLowerCase();
    if (text.includes('"exit_code":1') || text.includes('"exit_code": 1') || text.includes('error')
      || text.includes('failed') || text.includes('exception')) {
      parsed.failureCount += 1;
    }
  }

  if (parsed.userMessages.length === 0 && !file.endsWith('.jsonl')) {
    parsed.userMessages.push(rawText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? 'text session');
  }
  return parsed;
}

function belongsToProject(trajectory: ParsedTrajectory, projectDir: string) {
  if (!trajectory.cwd) {
    return true;
  }
  const cwd = path.resolve(trajectory.cwd);
  return cwd === projectDir || cwd.startsWith(`${projectDir}${path.sep}`);
}

function fingerprintFor(text: string) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'you', 'are', 'was', 'were',
    'have', 'has', 'had', 'into', 'your', 'about', 'agent', 'codex', 'please',
  ]);
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !stopWords.has(word)),
  )].slice(0, 10);
}

function sha(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function writeJsonArtifact(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonPayloadFile(file, value);
}

function buildTrajectoryDigest(trajectory: ParsedTrajectory, index: number, runRefPrefix: string) {
  const prompt = trajectory.userMessages[0] ?? 'unknown task';
  const assistantTail = trajectory.assistantMessages.at(-1) ?? '';
  const difficulty = Math.min(10, Math.max(1, Math.ceil(
    trajectory.lineCount / 50 + trajectory.commandCount / 3 + trajectory.failureCount,
  )));
  const outcome = trajectory.failureCount > 0
    ? 'partial'
    : assistantTail.toLowerCase().includes('blocked')
      ? 'blocked'
      : 'success_or_unclear';
  const fingerprint = fingerprintFor(`${prompt}\n${assistantTail}`);
  return {
    trajectory_digest_ref: `${runRefPrefix}/trajectory-digest/${index}-${sha(trajectory.file)}`,
    source_file: trajectory.file,
    source_cwd: trajectory.cwd,
    task_summary: prompt.slice(0, 240),
    difficulty,
    fingerprint,
    outcome,
    replayable: trajectory.userMessages.length > 0,
    command_count: trajectory.commandCount,
    failure_count: trajectory.failureCount,
    line_count: trajectory.lineCount,
  };
}

function buildDiagnosis(digests: ReturnType<typeof buildTrajectoryDigest>[], runRefPrefix: string) {
  const highDifficulty = digests.filter((digest) => digest.difficulty >= 6);
  const failures = digests.filter((digest) => digest.failure_count > 0);
  const commonTerms = [...new Set(digests.flatMap((digest) => digest.fingerprint))].slice(0, 12);
  return {
    diagnosis_ref: `${runRefPrefix}/diagnosis/self-validation-self-consistency`,
    diagnosis_kind: 'rho_label_free_self_validation_self_consistency',
    trajectory_count: digests.length,
    high_difficulty_count: highDifficulty.length,
    failure_or_partial_count: failures.length,
    recurring_fingerprint_terms: commonTerms,
    failure_modes: failures.length > 0
      ? [
          'verification_or_command_failures_observed_in_past_trajectories',
          'candidate_harness_should_tighten_preflight_and_no_forbidden_write_checks',
        ]
      : ['no_explicit_failures_observed_candidate_should_preserve_current_harness'],
    improvement_directions: [
      'codify repeatable project preflight before implementation',
      'materialize verifier checklist before owner-facing readiness claims',
      'route candidate changes through work-order draft and no-apply proof',
    ],
  };
}

function buildCandidateHarnesses(input: {
  runRefPrefix: string;
  runId: string;
  projectDir: string;
  diagnosis: ReturnType<typeof buildDiagnosis>;
}) {
  const directions = input.diagnosis.improvement_directions;
  return directions.slice(0, 3).map((direction, index) => {
    const candidateId = `${input.runRefPrefix}/candidate-harness/${index + 1}`;
    const score = Math.max(1, 8 - index * 2);
    return {
      candidate_harness_ref: candidateId,
      candidate_index: index,
      harness_surface: 'AGENTS.md + skills + helper scripts',
      proposed_change_summary: direction,
      materialization_mode: 'staged_artifact_only_no_target_write',
      candidate_diff_ref: `${input.runRefPrefix}/candidate-diff/${index + 1}`,
      self_preference_score_ref: `${input.runRefPrefix}/self-preference/${index + 1}`,
      self_preference_score: score,
      rationale:
        `Candidate ${index + 1} addresses RHO diagnosis ${input.diagnosis.diagnosis_ref} without mutating ${input.projectDir}.`,
    };
  });
}

function buildWorkOrderDraft(input: {
  runRefPrefix: string;
  runId: string;
  projectDir: string;
  winner: ReturnType<typeof buildCandidateHarnesses>[number];
  diagnosis: ReturnType<typeof buildDiagnosis>;
}) {
  return {
    surface_kind: 'opl_agent_lab_rho_work_order_draft',
    version: 'opl-agent-lab.rho-work-order-draft.v1',
    work_order_id: `rho-work-order:${input.runId}`,
    status: 'ready_for_target_agent_source_patch',
    executor_lease_ref: `executor-lease:codex-cli/rho/${input.runId}`,
    target_agent_dir: input.projectDir,
    source_rho_run_ref: input.runRefPrefix,
    allowed_editable_surfaces: ['AGENTS.md', '.agents/skills/**/SKILL.md', 'scripts/**'],
    target_repo_file_hints: ['AGENTS.md', '.agents/skills', 'scripts'],
    required_verification_refs: ['verification-ref:git-diff-check', 'verification-ref:repo-smoke-or-focused-test'],
    candidate_harness_ref: input.winner.candidate_harness_ref,
    candidate_diff_ref: input.winner.candidate_diff_ref,
    diagnosis_ref: input.diagnosis.diagnosis_ref,
    implementation_controls: {
      apply_mode: 'work_order_execute_only',
      forbidden_target_paths_or_surfaces: [
        'domain truth',
        'owner receipt',
        'artifact body',
        'quality verdict',
        'default promotion',
      ],
    },
    authority_boundary: {
      can_write_target_domain_truth: false,
      can_authorize_target_domain_quality_or_export: false,
      can_write_owner_receipt: false,
      can_promote_default_agent_without_gate: false,
    },
  };
}

export function buildAgentLabRhoBackendPlan(input: { projectDir: string }) {
  const projectRef = `project-ref:${input.projectDir}`;
  const slug = projectSlug(input.projectDir);
  const planId = stableId('oalrho', [projectRef, 'rho', 'no_apply']);
  const candidateRef = `rho-candidate-ref:${slug}/${planId}`;
  const trajectoryDigestRef = `rho-trajectory-digest-ref:${slug}/${planId}`;
  const diagnosisRef = `rho-diagnosis-ref:${slug}/${planId}`;
  const candidateHarnessRef = `rho-candidate-harness-ref:${slug}/${planId}`;
  const selfPreferenceScoreRef = `rho-self-preference-score-ref:${slug}/${planId}`;
  const winnerRef = `rho-winner-ref:${slug}/${planId}`;
  const candidateDiffRef = `rho-candidate-diff-ref:${slug}/${planId}`;
  const workOrderDraftRef = `rho-work-order-draft-ref:${slug}/${planId}`;
  const promotionEvidenceRef = `rho-promotion-evidence-ref:${slug}/${planId}`;

  return {
    surface_kind: 'opl_agent_lab_rho_backend_plan',
    version: 'opl-agent-lab.v1.rho-backend',
    plan_id: planId,
    backend: 'rho',
    backend_role: 'no_apply_sidecar_candidate_generator',
    apply_mode: 'no_apply',
    refs_only: true,
    project_ref: projectRef,
    project_dir: input.projectDir,
    trajectory_digest_refs: [trajectoryDigestRef],
    diagnosis_refs: [diagnosisRef],
    candidate_harness_refs: [candidateHarnessRef],
    self_preference_score_refs: [selfPreferenceScoreRef],
    candidate_refs: [candidateRef],
    winner_ref: winnerRef,
    candidate_diff_refs: [candidateDiffRef],
    work_order_draft_refs: [workOrderDraftRef],
    promotion_evidence_refs: [promotionEvidenceRef],
    no_apply_boundary_refs: [
      `no-apply-boundary-ref:agent-lab/rho/${planId}`,
      `no-forbidden-write-ref:agent-lab/rho/${planId}`,
    ],
    typed_blocker_refs: [],
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_mutate_artifact_body: false,
    can_write_owner_receipt: false,
    can_direct_apply: false,
    can_promote_default_agent: false,
    can_promote_default_agent_without_gate: false,
    authority_boundary: RHO_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabRhoBackendRun(input: AgentLabRhoBackendRunInput) {
  const projectDir = path.resolve(input.projectDir);
  assertDirectory(projectDir, 'project_dir');
  const sessionsDir = path.resolve(input.sessionsDir ?? defaultCodexSessionsDir());
  assertDirectory(sessionsDir, 'sessions_dir');
  const maxTrajectories = Math.max(1, Math.floor(input.maxTrajectories ?? 8));
  const outputDir = path.resolve(input.outputDir ?? path.join(projectDir, '.opl-agent-lab-rho-runs'));
  fs.mkdirSync(outputDir, { recursive: true });

  const plan = buildAgentLabRhoBackendPlan({ projectDir });
  const runId = stableId('oalrhorun', [projectDir, sessionsDir, outputDir, maxTrajectories]);
  const runRefPrefix = `rho-run-ref:agent-lab/${projectSlug(projectDir)}/${runId}`;
  const sessionFiles = walkSessionFiles(sessionsDir);
  const trajectories = sessionFiles
    .map(parseSessionFile)
    .filter((trajectory) => belongsToProject(trajectory, projectDir))
    .slice(0, maxTrajectories);
  const digests = trajectories.map((trajectory, index) =>
    buildTrajectoryDigest(trajectory, index, runRefPrefix));
  const diagnosis = buildDiagnosis(digests, runRefPrefix);
  const candidates = buildCandidateHarnesses({ runRefPrefix, runId, projectDir, diagnosis });
  const winner = candidates.slice().sort((left, right) =>
    right.self_preference_score - left.self_preference_score)[0] ?? null;
  const status = digests.length > 0 && winner ? 'executable_no_apply_receipt_emitted' : 'blocked_no_trajectories';
  const typedBlockerRefs = status === 'blocked_no_trajectories'
    ? [`${runRefPrefix}/typed-blocker/no-project-trajectories`]
    : [];
  const workOrderDraft = winner
    ? buildWorkOrderDraft({ runRefPrefix, runId, projectDir, winner, diagnosis })
    : null;
  const promotionEvidence = {
    promotion_evidence_ref: `${runRefPrefix}/promotion-evidence/no-apply`,
    evidence_kind: 'rho_no_apply_candidate_evidence',
    candidate_count: candidates.length,
    winner_ref: winner?.candidate_harness_ref ?? null,
    ready_for_work_order_execute: Boolean(workOrderDraft),
    promotes_default_agent: false,
  };
  const noForbiddenWrite = {
    no_forbidden_write_ref: `${runRefPrefix}/no-forbidden-write`,
    project_dir: projectDir,
    checked_surfaces: ['domain truth', 'artifact body', 'memory body', 'owner receipt', 'default promotion'],
    target_repo_mutated: false,
    apply_mode: 'no_apply',
  };

  const artifactFiles = {
    backend_plan: path.join(outputDir, 'rho-backend-plan.json'),
    trajectory_digests: path.join(outputDir, 'trajectory-digests.json'),
    diagnosis: path.join(outputDir, 'diagnosis.json'),
    candidate_harnesses: path.join(outputDir, 'candidate-harnesses.json'),
    self_preference_scores: path.join(outputDir, 'self-preference-scores.json'),
    winner: path.join(outputDir, 'winner.json'),
    candidate_diff: path.join(outputDir, 'candidate-diff.patch'),
    work_order_draft: path.join(outputDir, 'work-order-draft.json'),
    promotion_evidence: path.join(outputDir, 'promotion-evidence.json'),
    no_forbidden_write: path.join(outputDir, 'no-forbidden-write.json'),
    execution_receipt: path.join(outputDir, 'execution-receipt.json'),
  };

  const candidateDiff = winner
    ? [
        'diff --git a/AGENTS.md b/AGENTS.md',
        '--- a/AGENTS.md',
        '+++ b/AGENTS.md',
        '@@',
        `+RHO candidate note: ${winner.proposed_change_summary}`,
        '+Before claiming completion, materialize verifier evidence and no-forbidden-write proof.',
        '',
      ].join('\n')
    : '(no candidate diff; no project trajectories were available)\n';

  const receipt = {
    surface_kind: 'opl_agent_lab_rho_execution_receipt',
    version: 'opl-agent-lab.rho-run.v1',
    run_id: runId,
    run_ref: runRefPrefix,
    status,
    backend: 'rho',
    apply_mode: 'no_apply',
    refs_only: true,
    project_dir: projectDir,
    sessions_dir: sessionsDir,
    output_dir: outputDir,
    trajectory_digest_refs: digests.map((digest) => digest.trajectory_digest_ref),
    diagnosis_refs: [diagnosis.diagnosis_ref],
    candidate_harness_refs: candidates.map((candidate) => candidate.candidate_harness_ref),
    self_preference_score_refs: candidates.map((candidate) => candidate.self_preference_score_ref),
    winner_ref: winner?.candidate_harness_ref ?? null,
    candidate_diff_refs: winner ? [winner.candidate_diff_ref] : [],
    work_order_draft_refs: workOrderDraft ? [workOrderDraft.work_order_id] : [],
    promotion_evidence_refs: [promotionEvidence.promotion_evidence_ref],
    no_forbidden_write_refs: [noForbiddenWrite.no_forbidden_write_ref],
    typed_blocker_refs: typedBlockerRefs,
    artifact_files: artifactFiles,
    required_artifact_status: {
      trajectory_digest_ref: digests.length > 0,
      diagnosis_ref: true,
      candidate_harness_ref: candidates.length > 0,
      self_preference_score_ref: candidates.length > 0,
      winner_ref: Boolean(winner),
      candidate_diff_ref: Boolean(winner),
      work_order_draft_ref: Boolean(workOrderDraft),
      promotion_evidence_ref: true,
      no_forbidden_write_ref: true,
      execution_receipt_ref: true,
    },
    no_apply_proof: {
      target_repo_mutated: false,
      direct_apply_executed: false,
      external_rho_cli_required: false,
      worktree_probe_executed: false,
      reason: 'OPL native deterministic runner materializes RHO artifacts and routes changes through work-order draft only.',
    },
    authority_boundary: RHO_AUTHORITY_BOUNDARY,
  };

  writeJsonArtifact(artifactFiles.backend_plan, plan);
  writeJsonArtifact(artifactFiles.trajectory_digests, digests);
  writeJsonArtifact(artifactFiles.diagnosis, diagnosis);
  writeJsonArtifact(artifactFiles.candidate_harnesses, candidates);
  writeJsonArtifact(artifactFiles.self_preference_scores, candidates.map((candidate) => ({
    self_preference_score_ref: candidate.self_preference_score_ref,
    candidate_harness_ref: candidate.candidate_harness_ref,
    value: candidate.self_preference_score,
    rationale: candidate.rationale,
  })));
  writeJsonArtifact(artifactFiles.winner, winner ?? { winner_ref: null, reason: 'no_project_trajectories' });
  fs.writeFileSync(artifactFiles.candidate_diff, candidateDiff, 'utf8');
  writeJsonArtifact(artifactFiles.work_order_draft, workOrderDraft ?? {
    status: 'blocked_no_trajectories',
    typed_blocker_refs: typedBlockerRefs,
  });
  writeJsonArtifact(artifactFiles.promotion_evidence, promotionEvidence);
  writeJsonArtifact(artifactFiles.no_forbidden_write, noForbiddenWrite);
  writeJsonArtifact(artifactFiles.execution_receipt, receipt);

  return {
    surface_kind: 'opl_agent_lab_rho_backend_run',
    version: 'opl-agent-lab.rho-run.v1',
    run_id: runId,
    run_ref: runRefPrefix,
    status,
    backend_plan: plan,
    execution_receipt: receipt,
    work_order_draft: workOrderDraft,
    artifact_files: artifactFiles,
    authority_boundary: RHO_AUTHORITY_BOUNDARY,
  };
}
