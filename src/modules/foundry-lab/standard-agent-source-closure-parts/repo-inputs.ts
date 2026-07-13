import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileResult } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
  resolveStandardAgent,
} from '../../atlas/index.ts';
import type { SourceClosureEffectContract } from './types.ts';

export type SourceClosureRepoInput = {
  requested_agent_id: string | null;
  repo_dir: string;
};

export function parseSourceClosureArgs(args: string[]): SourceClosureRepoInput[] {
  const repos: SourceClosureRepoInput[] = [];
  const usage = 'opl agents source-closure [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--repo-dir' && args[index + 1]) {
      repos.push({ requested_agent_id: null, repo_dir: args[index + 1] });
      index += 1;
      continue;
    }
    if (token === '--agent' && args[index + 1]) {
      const value = args[index + 1];
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new FrameworkContractError('cli_usage_error', 'agents source-closure --agent expects <agent_id>=<repo_dir>.', { usage });
      }
      repos.push({
        requested_agent_id: value.slice(0, separator),
        repo_dir: value.slice(separator + 1),
      });
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown agents source-closure option: ${token}.`, { usage });
  }
  const selected = repos.length > 0 ? repos : defaultStandardDomainAgentRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents source-closure could not discover standard Agent repos.', {
      usage,
      default_repo_directories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

export function readSourceClosureDomainId(repoDir: string, fallback: string | null) {
  const descriptor = readJsonFileResult(path.join(repoDir, 'contracts', 'domain_descriptor.json')).payload;
  const raw = isRecord(descriptor)
    ? stringValue(descriptor.domain_id) ?? stringValue(descriptor.domain_label)
    : null;
  const selected = raw ?? fallback ?? path.basename(repoDir);
  return resolveStandardAgent(selected)?.domain_id ?? selected;
}

function walkedFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      return [];
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      return walkedFiles(root, absolutePath);
    }
    return entry.isFile() ? [path.relative(root, absolutePath).split(path.sep).join('/')] : [];
  });
}

export function repoFiles(repoDir: string) {
  const result = spawnSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ], {
    cwd: repoDir,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status === 0) {
    return result.stdout.toString('utf8')
      .split('\0')
      .filter(Boolean)
      .filter((file) => {
        try {
          return fs.lstatSync(path.join(repoDir, file)).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  }
  return walkedFiles(repoDir).sort();
}

export function activeSourceFiles(files: string[], contract: SourceClosureEffectContract) {
  const extensions = new Set(contract.active_source.extensions);
  const excludedSegments = new Set(contract.active_source.excluded_path_segments);
  const excludedPatterns = contract.active_source.excluded_file_patterns.map((pattern) => new RegExp(pattern));
  return files.filter((file) => {
    const normalized = file.split(path.sep).join('/');
    const segments = normalized.split('/');
    if (segments.some((segment) => excludedSegments.has(segment))) {
      return false;
    }
    if (excludedPatterns.some((pattern) => pattern.test(normalized))) {
      return false;
    }
    return extensions.has(path.extname(normalized).toLowerCase());
  });
}
