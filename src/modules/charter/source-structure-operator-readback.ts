import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readJsonFileResult } from '../../kernel/json-file.ts';

const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.py',
  '.sh',
  '.bash',
  '.zsh',
  '.rs',
  '.go',
]);
const IGNORED_PARTS = new Set(['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__']);
const IGNORED_SUFFIXES = ['.min.js'];

type SourceStructureContract = {
  contract_kind?: string;
  surface_kind?: string;
  owner?: string;
  purpose?: string;
  state?: string;
  machine_boundary?: string;
  default_limit?: number;
  advisory_near_limit?: number;
  baseline_policy?: {
    mode?: string;
    default_developer_behavior?: string;
    strict_entrypoints?: string[];
  };
  reasonable_refactor_policy?: Record<string, unknown>;
  reviewed_baselines?: Array<{
    path?: string;
    limit?: number;
    owner?: string;
    reason?: string;
    intended_boundary?: string;
  }>;
};

type BaselineEntry = {
  path: string;
  limit: number;
  owner: string;
  reason: string;
  intended_boundary: string;
};

type SourceFileCount = {
  path: string;
  line_count: number;
  over_default_limit: boolean;
  near_limit: boolean;
  reviewed_baseline_limit: number | null;
  reviewed_baseline_status:
    | 'not_reviewed_baseline'
    | 'within_reviewed_baseline'
    | 'exceeds_reviewed_baseline'
    | 'retired_reviewed_baseline';
};

type SourceStructureFinding = {
  finding_kind:
    | 'contract_invalid'
    | 'new_oversized_file'
    | 'reviewed_baseline_growth'
    | 'stale_reviewed_baseline'
    | 'retired_reviewed_baseline';
  path: string;
  line_count: number | null;
  limit: number | null;
  strict_blocks: boolean;
  message: string;
};

type SourceStructureReadbackOptions = {
  repoRoot?: string;
  contractPath?: string;
  strict?: boolean;
};

function currentSourceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedRelativePath(value: unknown) {
  if (!nonEmptyString(value)) {
    return null;
  }
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (normalized.startsWith('/') || normalized.includes('../') || normalized === '..') {
    return null;
  }
  return normalized;
}

function countLines(content: string) {
  if (content.length === 0) {
    return 0;
  }
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
}

function isCodeFile(relativePath: string) {
  const parts = relativePath.split('/');
  if (parts.some((part) => IGNORED_PARTS.has(part))) {
    return false;
  }
  if (IGNORED_SUFFIXES.some((suffix) => relativePath.endsWith(suffix))) {
    return false;
  }
  return CODE_EXTENSIONS.has(path.extname(relativePath));
}

function readJsonContract(contractPath: string) {
  const failures: SourceStructureFinding[] = [];
  const result = readJsonFileResult(contractPath);
  if (result.status === 'missing') {
    failures.push({
      finding_kind: 'contract_invalid',
      path: path.basename(contractPath),
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: 'source structure budget contract is missing',
    });
    return { contract: null, failures };
  }

  if (result.status === 'invalid_json') {
    failures.push({
      finding_kind: 'contract_invalid',
      path: path.basename(contractPath),
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: `source structure budget contract is not valid JSON: ${result.error}`,
    });
    return { contract: null, failures };
  }

  return {
    contract: result.payload as SourceStructureContract,
    failures,
  };
}

function loadContract(contractPath: string) {
  const { contract, failures } = readJsonContract(contractPath);
  const defaultLimit = positiveInteger(contract?.default_limit) ?? 1000;
  const advisoryNearLimit = positiveInteger(contract?.advisory_near_limit) ?? Math.max(1, defaultLimit - 150);
  const baselineEntries: BaselineEntry[] = [];
  const baseline = new Map<string, BaselineEntry>();

  if (!contract) {
    return {
      contract,
      defaultLimit,
      advisoryNearLimit,
      baseline,
      baselineEntries,
      failures,
    };
  }

  if (contract.contract_kind !== 'opl_source_structure_budget.v1') {
    failures.push({
      finding_kind: 'contract_invalid',
      path: contractPath,
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: 'contract_kind must be opl_source_structure_budget.v1',
    });
  }
  if (positiveInteger(contract.default_limit) === null) {
    failures.push({
      finding_kind: 'contract_invalid',
      path: contractPath,
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: 'default_limit must be a positive integer',
    });
  }
  const acceptedModes = new Set([
    'scheduled_advisory_with_explicit_strict_ratchet',
    'ratchet_no_growth',
  ]);
  if (!acceptedModes.has(contract.baseline_policy?.mode ?? '')) {
    failures.push({
      finding_kind: 'contract_invalid',
      path: contractPath,
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: 'baseline_policy.mode must be scheduled_advisory_with_explicit_strict_ratchet',
    });
  }

  const entries = Array.isArray(contract.reviewed_baselines) ? contract.reviewed_baselines : [];
  if (!Array.isArray(contract.reviewed_baselines)) {
    failures.push({
      finding_kind: 'contract_invalid',
      path: contractPath,
      line_count: null,
      limit: null,
      strict_blocks: true,
      message: 'reviewed_baselines must be an array',
    });
  }

  for (const entry of entries) {
    const relativePath = normalizedRelativePath(entry?.path);
    const limit = positiveInteger(entry?.limit);
    const label = relativePath ?? '<missing-path>';
    if (!relativePath) {
      failures.push({
        finding_kind: 'contract_invalid',
        path: contractPath,
        line_count: null,
        limit: null,
        strict_blocks: true,
        message: 'baseline entry is missing path',
      });
    }
    if (limit === null) {
      failures.push({
        finding_kind: 'contract_invalid',
        path: contractPath,
        line_count: null,
        limit: null,
        strict_blocks: true,
        message: `baseline entry for ${label} is missing positive integer limit`,
      });
    }
    for (const field of ['owner', 'reason', 'intended_boundary'] as const) {
      if (!nonEmptyString(entry?.[field])) {
        failures.push({
          finding_kind: 'contract_invalid',
          path: contractPath,
          line_count: null,
          limit,
          strict_blocks: true,
          message: `baseline entry for ${label} is missing ${field}`,
        });
      }
    }
    if (relativePath && baseline.has(relativePath)) {
      failures.push({
        finding_kind: 'contract_invalid',
        path: contractPath,
        line_count: null,
        limit,
        strict_blocks: true,
        message: `duplicate baseline entry for ${relativePath}`,
      });
    }
    if (relativePath && limit !== null) {
      const baselineEntry = {
        path: relativePath,
        limit,
        owner: String(entry.owner ?? ''),
        reason: String(entry.reason ?? ''),
        intended_boundary: String(entry.intended_boundary ?? ''),
      };
      baseline.set(relativePath, baselineEntry);
      baselineEntries.push(baselineEntry);
    }
  }

  return {
    contract,
    defaultLimit,
    advisoryNearLimit,
    baseline,
    baselineEntries,
    failures,
  };
}

function listTrackedFiles(repoRoot: string) {
  const result = spawnSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'source structure readback: git ls-files failed');
  }
  return result.stdout.split('\n').filter(Boolean);
}

function readHeadSha(repoRoot: string) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function sourceFileCount(
  repoRoot: string,
  relativePath: string,
  defaultLimit: number,
  advisoryNearLimit: number,
  baseline: Map<string, BaselineEntry>,
): SourceFileCount | null {
  if (!isCodeFile(relativePath)) {
    return null;
  }
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  const lineCount = countLines(fs.readFileSync(absolutePath, 'utf8'));
  const baselineLimit = baseline.get(relativePath)?.limit ?? null;
  let reviewedBaselineStatus: SourceFileCount['reviewed_baseline_status'] = 'not_reviewed_baseline';
  if (baselineLimit !== null && lineCount <= defaultLimit) {
    reviewedBaselineStatus = 'retired_reviewed_baseline';
  } else if (baselineLimit !== null && lineCount <= baselineLimit) {
    reviewedBaselineStatus = 'within_reviewed_baseline';
  } else if (baselineLimit !== null) {
    reviewedBaselineStatus = 'exceeds_reviewed_baseline';
  }

  return {
    path: relativePath,
    line_count: lineCount,
    over_default_limit: lineCount > defaultLimit,
    near_limit: lineCount >= advisoryNearLimit,
    reviewed_baseline_limit: baselineLimit,
    reviewed_baseline_status: reviewedBaselineStatus,
  };
}

export function buildSourceStructureOperatorReadback(
  options: SourceStructureReadbackOptions = {},
) {
  const repoRoot = path.resolve(options.repoRoot ?? currentSourceRoot());
  const contractPath = path.resolve(
    options.contractPath
      ?? path.join(repoRoot, 'contracts', 'opl-framework', 'source-structure-budget.json'),
  );
  const contractModel = loadContract(contractPath);
  const trackedFiles = listTrackedFiles(repoRoot);
  const sourceFiles = trackedFiles
    .map((relativePath) =>
      sourceFileCount(
        repoRoot,
        relativePath,
        contractModel.defaultLimit,
        contractModel.advisoryNearLimit,
        contractModel.baseline,
      ))
    .filter((entry): entry is SourceFileCount => entry !== null);
  const oversizedFiles = sourceFiles
    .filter((entry) => entry.over_default_limit)
    .sort((left, right) => right.line_count - left.line_count || left.path.localeCompare(right.path));
  const nearLimitFiles = sourceFiles
    .filter((entry) => entry.near_limit && !entry.over_default_limit)
    .sort((left, right) => right.line_count - left.line_count || left.path.localeCompare(right.path));
  const findings: SourceStructureFinding[] = [...contractModel.failures];

  for (const file of oversizedFiles) {
    if (file.reviewed_baseline_limit === null) {
      findings.push({
        finding_kind: 'new_oversized_file',
        path: file.path,
        line_count: file.line_count,
        limit: contractModel.defaultLimit,
        strict_blocks: true,
        message:
          `${file.path}: ${file.line_count} lines exceeds ${contractModel.defaultLimit} line budget; split along a semantic boundary or add a reviewed baseline contract entry`,
      });
    } else if (file.line_count > file.reviewed_baseline_limit) {
      findings.push({
        finding_kind: 'reviewed_baseline_growth',
        path: file.path,
        line_count: file.line_count,
        limit: file.reviewed_baseline_limit,
        strict_blocks: true,
        message:
          `${file.path}: ${file.line_count} lines exceeds locked baseline ${file.reviewed_baseline_limit}; ratchet baseline blocks growth until this file is split or the reviewed contract is intentionally updated`,
      });
    }
  }

  for (const baselineEntry of contractModel.baselineEntries) {
    const absolutePath = path.join(repoRoot, baselineEntry.path);
    if (!fs.existsSync(absolutePath)) {
      findings.push({
        finding_kind: 'stale_reviewed_baseline',
        path: baselineEntry.path,
        line_count: null,
        limit: baselineEntry.limit,
        strict_blocks: true,
        message: `${baselineEntry.path}: stale line-budget baseline entry; remove it after deleting or renaming the file`,
      });
      continue;
    }
    const lineCount = countLines(fs.readFileSync(absolutePath, 'utf8'));
    if (lineCount <= contractModel.defaultLimit) {
      findings.push({
        finding_kind: 'retired_reviewed_baseline',
        path: baselineEntry.path,
        line_count: lineCount,
        limit: contractModel.defaultLimit,
        strict_blocks: true,
        message:
          `${baselineEntry.path}: retired line-budget baseline entry; remove it because the file is back under ${contractModel.defaultLimit} lines`,
      });
    }
  }

  const strictBlockingFindings = findings.filter((finding) => finding.strict_blocks);
  return {
    version: 'g2',
    source_structure_operator_readback: {
      surface_kind: 'opl_source_structure_operator_readback',
      readback_role:
        'operator_source_structure_guard_not_completion_audit_not_readiness_or_quality_verdict',
      owner: 'one-person-lab',
      repo_root: repoRoot,
      head_sha: readHeadSha(repoRoot),
      contract_ref:
        `contracts/opl-framework/source-structure-budget.json#${contractModel.contract?.contract_kind ?? 'missing'}`,
      contract_surface_kind: contractModel.contract?.surface_kind ?? 'opl_source_structure_budget',
      validator_refs: [
        'scripts/line-budget.mjs',
        'npm run line-budget',
        'npm run line-budget:strict',
        './scripts/verify.sh line-budget:strict',
        './scripts/verify.sh structure:strict',
      ],
      mode: options.strict ? 'strict_readback' : 'advisory_readback',
      default_limit: contractModel.defaultLimit,
      advisory_near_limit: contractModel.advisoryNearLimit,
      baseline_policy: contractModel.contract?.baseline_policy ?? {
        mode: 'missing_contract',
      },
      reviewed_baseline_count: contractModel.baselineEntries.length,
      tracked_source_file_count: sourceFiles.length,
      oversized_file_count: oversizedFiles.length,
      near_limit_file_count: nearLimitFiles.length,
      strict_blocking_finding_count: strictBlockingFindings.length,
      strict_ratchet_passed: strictBlockingFindings.length === 0,
      advisory_passed: true,
      status: strictBlockingFindings.length === 0
        ? 'source_structure_guard_clean'
        : 'source_structure_guard_findings_require_maintenance',
      oversized_files: oversizedFiles,
      near_limit_files: nearLimitFiles,
      findings,
      strict_entrypoints: contractModel.contract?.baseline_policy?.strict_entrypoints ?? [
        'scripts/line-budget.mjs --strict',
        'OPL_LINE_BUDGET_STRICT=1 node scripts/line-budget.mjs',
        'npm run line-budget:strict',
        './scripts/verify.sh line-budget:strict',
        './scripts/verify.sh structure:strict',
      ],
      authority_boundary: {
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        can_claim_production_ready: false,
        can_claim_quality_verdict: false,
        can_claim_plan_completion: false,
        can_authorize_physical_delete: false,
        can_write_owner_receipt: false,
        can_create_second_source_truth: false,
      },
      false_ready_guard: {
        line_budget_clean_can_claim_ready: false,
        strict_ratchet_passed_can_claim_ready: false,
        source_structure_readback_can_claim_goal_complete: false,
        docs_or_tests_can_replace_live_evidence: false,
        findings_are_maintenance_signal_not_domain_blocker: true,
      },
    },
  };
}
