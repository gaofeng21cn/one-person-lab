import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  parseJsonText,
  writeJsonPayloadFile,
} from '../../../kernel/json-file.ts';
import type { JsonRecord } from '../../../kernel/json-record.ts';

export type CommandResult = {
  command: string;
  cwd: string;
  exit_code: number;
  stdout_tail: string[];
  stderr_tail: string[];
};

export function readJson(filePath: string): JsonRecord {
  try {
    return parseJsonText(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_json_invalid',
      `JSON file could not be read: ${filePath}`,
      {
        file: filePath,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonPayloadFile(filePath, payload);
}

export function writeMarkdown(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`);
}

export function runCommand(command: string, args: string[], cwd: string, options: {
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
} = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'OPL Agent Lab',
      GIT_AUTHOR_EMAIL: 'agent-lab@example.invalid',
      GIT_COMMITTER_NAME: 'OPL Agent Lab',
      GIT_COMMITTER_EMAIL: 'agent-lab@example.invalid',
      ...options.env,
    },
  });
  const commandString = [command, ...args].join(' ');
  const output = {
    command: commandString,
    cwd,
    exit_code: result.status ?? 1,
    stdout_tail: (result.stdout ?? '').split(/\r?\n/).filter(Boolean).slice(-20),
    stderr_tail: (result.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-20),
  };
  if (!options.allowFailure && output.exit_code !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Agent Lab work order command failed: ${commandString}`,
      output,
    );
  }
  return output;
}

export function runShellVerification(command: string, cwd: string): CommandResult {
  return {
    ...runCommand('/bin/bash', ['-lc', command], cwd, { allowFailure: true }),
    command,
  };
}

export function buildCommandResult(command: string, cwd: string, result: ReturnType<typeof spawnSync>): CommandResult {
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString('utf8') ?? '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString('utf8') ?? '';
  return {
    command,
    cwd,
    exit_code: result.status ?? 1,
    stdout_tail: stdout.split(/\r?\n/).filter(Boolean).slice(-20),
    stderr_tail: stderr.split(/\r?\n/).filter(Boolean).slice(-20),
  };
}

export function gitRawOutput(args: string[], cwd: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Agent Lab work order git command failed: git ${args.join(' ')}`,
      {
        command: `git ${args.join(' ')}`,
        cwd,
        exit_code: result.status ?? 1,
        stderr_tail: (result.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-20),
      },
    );
  }
  return result.stdout ?? '';
}
