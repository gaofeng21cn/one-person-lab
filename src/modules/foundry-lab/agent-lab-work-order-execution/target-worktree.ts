import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../../kernel/json-record.ts';
import {
  gitRawOutput,
  runCommand,
  writeJson,
  type CommandResult,
} from '../agent-lab-work-order-execution-parts/io.ts';

export function assertWorktreeDirIgnored(targetAgentDir: string): void {
  const result = spawnSync('git', ['check-ignore', '-q', '.worktrees/agent-lab-ignore-probe'], {
    cwd: targetAgentDir,
    encoding: 'utf8',
  });
  if ((result.status ?? 1) !== 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Target agent .worktrees directory must be gitignored before Agent Lab creates a target worktree.',
      {
        target_agent_dir: targetAgentDir,
        required_ignore: '.worktrees',
      },
    );
  }
}

export function changedFiles(cwd: string): string[] {
  return gitRawOutput(['status', '--porcelain', '-uall'], cwd)
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^[A-Z? ][A-Z? ]\s+/, ''))
    .flatMap((entry) => entry.includes(' -> ') ? entry.split(' -> ') : [entry])
    .filter(Boolean);
}

export function statusEntries(cwd: string): string[] {
  return gitRawOutput(['status', '--porcelain'], cwd)
    .split(/\r?\n/)
    .filter(Boolean);
}

export function dirtyFiles(cwd: string): string[] {
  return statusEntries(cwd)
    .map((entry) => entry.replace(/^[A-Z? ][A-Z? ]\s+/, ''))
    .flatMap((entry) => entry.includes(' -> ') ? entry.split(' -> ') : [entry])
    .filter(Boolean);
}

export function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((entry) => rightSet.has(entry)))].sort();
}

export function writeAbsorptionTypedBlocker(
  outputDir: string,
  payload: JsonRecord,
): string {
  const typedBlockerPath = path.join(outputDir, 'typed-blocker.json');
  writeJson(typedBlockerPath, {
    surface_kind: 'opl_work_order_typed_blocker',
    version: 'opl.work-order-execution.typed-blocker.v1',
    status: 'blocked_before_absorption',
    can_absorb_without_overwriting_external_changes: false,
    ...payload,
  });
  return typedBlockerPath;
}

export function cleanupTargetWorktree(input: {
  targetAgentDir: string;
  worktreePath: string;
  branchName: string;
}): CommandResult[] {
  const cleanupResults: CommandResult[] = [];
  if (fs.existsSync(input.worktreePath)) {
    cleanupResults.push(runCommand('git', ['worktree', 'remove', '--force', input.worktreePath], input.targetAgentDir, {
      allowFailure: true,
    }));
  }
  cleanupResults.push(runCommand('git', ['branch', '-D', input.branchName], input.targetAgentDir, {
    allowFailure: true,
  }));
  cleanupResults.push(runCommand('git', ['worktree', 'prune'], input.targetAgentDir, {
    allowFailure: true,
  }));
  return cleanupResults;
}
