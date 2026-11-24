import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

export type DisclosurePolicy = {
  reviewed_binary_paths?: string[];
  ignore_paths?: string[];
  extra_private_path_patterns?: string[];
  allowed_rule_paths?: Record<string, string[]>;
};

export type DisclosureFinding = {
  path: string;
  line: number | null;
  rule: string;
  commit: string | null;
};

const TEXT_DISCLOSURE_RULES: Array<[string, RegExp]> = [
  ['GitHub credential', /gh[pousr]_[\w-]{20,}|github_pat_[\w-]{20,}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  [
    'secret value in configuration',
    /["']?(?:password|client_secret|access_token|api_key)["']?\s*[:=]\s*["'][^"'\s<>]{12,}["']/i,
  ],
  [
    'private IPv4 address',
    /\b(?:10\.(?:\d{1,3}\.){2}|192\.168\.\d{1,3}\.|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.)\d{1,3}\b/,
  ],
  ['personal workspace path', /\/Users\/[\w.-]+\/workspace\//],
  ['private package reference', /ghcr\.io\/[^/\s]+\/[^/\s]+-private-packages\//i],
];

const DEFAULT_PRIVATE_PATH_PATTERN =
  /(?:^|\/)(?:\.env(?:\.[^/]+)?|credentials|secrets|patients?|captures|logs|site-local|site-profiles-local|private-site|site-evidence|ui-qualification|site-profile[^/]*\.json|[^/]+-site-profile\.json)(?:\/|$)|\.(?:local\.json|sqlite3?|db|p12|pfx|key)$/i;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function gitStdout(repoRoot: string, args: string[]): Buffer {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Disclosure check requires a readable Git repository.', {
      source_root: repoRoot,
      git_args: args,
      cause: result.error?.message ?? result.stderr?.toString('utf8') ?? null,
    });
  }
  return result.stdout ?? Buffer.alloc(0);
}

export function loadDisclosurePolicy(sourceRoot: string, policyPath?: string | null): DisclosurePolicy {
  if (!policyPath) return {};
  const resolved = path.isAbsolute(policyPath)
    ? path.resolve(policyPath)
    : path.resolve(sourceRoot, policyPath);
  if (!fs.existsSync(resolved) || fs.lstatSync(resolved).isSymbolicLink() || !fs.lstatSync(resolved).isFile()) {
    throw new FrameworkContractError('contract_file_missing', `Disclosure policy file is unavailable: ${policyPath}.`, {
      policy_path: resolved,
    });
  }
  const parsed = parseJsonText(fs.readFileSync(resolved, 'utf8'));
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Disclosure policy file must be a JSON object.', {
      policy_path: resolved,
    });
  }
  const stringList = (value: unknown, field: string): string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new FrameworkContractError('contract_shape_invalid', `Disclosure policy ${field} must be a non-empty string array.`, {
        policy_path: resolved,
        field,
      });
    }
    return value;
  };
  let allowedRulePaths: Record<string, string[]> | undefined;
  if (parsed.allowed_rule_paths !== undefined) {
    if (!isRecord(parsed.allowed_rule_paths)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Disclosure policy allowed_rule_paths must be an object.', {
        policy_path: resolved,
      });
    }
    allowedRulePaths = {};
    for (const [rule, paths] of Object.entries(parsed.allowed_rule_paths)) {
      allowedRulePaths[rule] = stringList(paths, `allowed_rule_paths.${rule}`) ?? [];
    }
  }
  return {
    reviewed_binary_paths: stringList(parsed.reviewed_binary_paths, 'reviewed_binary_paths'),
    ignore_paths: stringList(parsed.ignore_paths, 'ignore_paths'),
    extra_private_path_patterns: stringList(parsed.extra_private_path_patterns, 'extra_private_path_patterns'),
    allowed_rule_paths: allowedRulePaths,
  };
}

function isValidUtf8Text(data: Buffer): string | null {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = decoder.decode(data);
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

function inspectBlobBytes(
  relativePath: string,
  data: Buffer,
  commit: string | null,
  policy: DisclosurePolicy,
  extraPrivatePatterns: RegExp[],
): DisclosureFinding[] {
  if ((policy.ignore_paths ?? []).includes(relativePath)) {
    return [];
  }
  if (
    DEFAULT_PRIVATE_PATH_PATTERN.test(relativePath)
    || extraPrivatePatterns.some((pattern) => pattern.test(relativePath))
  ) {
    return [{ path: relativePath, line: null, rule: 'private file path', commit }];
  }
  if ((policy.reviewed_binary_paths ?? []).includes(relativePath)) {
    if (data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return [];
    }
  }
  const source = isValidUtf8Text(data);
  if (source === null) {
    return [{ path: relativePath, line: null, rule: 'binary asset requires review', commit }];
  }
  const findings: DisclosureFinding[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index]!;
    for (const [ruleName, pattern] of TEXT_DISCLOSURE_RULES) {
      if ((policy.allowed_rule_paths?.[ruleName] ?? []).includes(relativePath)) {
        continue;
      }
      if (pattern.test(lineText)) {
        findings.push({ path: relativePath, line: index + 1, rule: ruleName, commit });
      }
    }
  }
  return findings;
}

export function inspectRepoDisclosure(input: {
  sourceRoot: string;
  history?: boolean;
  policyPath?: string | null;
}) {
  const sourceRoot = fs.realpathSync.native(path.resolve(input.sourceRoot));
  const scanHistory = input.history === true;
  const policy = loadDisclosurePolicy(sourceRoot, input.policyPath);
  const extraPrivatePatterns = (policy.extra_private_path_patterns ?? []).map((raw) => {
    try {
      return new RegExp(raw, 'i');
    } catch (error) {
      throw new FrameworkContractError('contract_shape_invalid', `Invalid disclosure policy regex: ${raw}.`, {
        pattern: raw,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const findings: DisclosureFinding[] = [];
  const trackedRaw = gitStdout(sourceRoot, ['ls-files', '-z']).toString('utf8');
  const trackedPaths = trackedRaw.split('\0').filter(Boolean);
  for (const relativePath of trackedPaths) {
    if ((policy.ignore_paths ?? []).includes(relativePath)) continue;
    const absPath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(absPath)) {
      findings.push({ path: relativePath, line: null, rule: 'expected a regular source file', commit: null });
      continue;
    }
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      findings.push({ path: relativePath, line: null, rule: 'expected a regular source file', commit: null });
      continue;
    }
    findings.push(
      ...inspectBlobBytes(relativePath, fs.readFileSync(absPath), null, policy, extraPrivatePatterns),
    );
  }

  let scannedBlobs = 0;
  if (scanHistory) {
    const commitsRaw = gitStdout(sourceRoot, ['rev-list', '--all']).toString('utf8');
    const seen = new Set<string>();
    for (const commit of commitsRaw.split(/\r?\n/).filter(Boolean)) {
      const treeRaw = gitStdout(sourceRoot, ['ls-tree', '-rz', commit]).toString('utf8');
      for (const entry of treeRaw.split('\0').filter(Boolean)) {
        const tabIndex = entry.indexOf('\t');
        if (tabIndex === -1) continue;
        const meta = entry.slice(0, tabIndex).split(' ');
        const mode = meta[0];
        const objectId = meta[2];
        const relativePath = entry.slice(tabIndex + 1);
        if ((policy.ignore_paths ?? []).includes(relativePath)) continue;
        const key = `${objectId}:${relativePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scannedBlobs += 1;
        if (mode === '100644' || mode === '100755') {
          const blob = gitStdout(sourceRoot, ['cat-file', 'blob', objectId]);
          findings.push(
            ...inspectBlobBytes(relativePath, blob, commit.slice(0, 12), policy, extraPrivatePatterns),
          );
        } else {
          findings.push({
            path: relativePath,
            line: null,
            rule: 'expected a regular source file',
            commit: commit.slice(0, 12),
          });
        }
      }
    }
  }

  findings.sort((left, right) => (
    (left.commit ?? '').localeCompare(right.commit ?? '')
    || left.path.localeCompare(right.path)
    || (left.line ?? 0) - (right.line ?? 0)
    || left.rule.localeCompare(right.rule)
  ));

  return {
    surface_kind: 'opl_repo_disclosure_guard' as const,
    version: 'repo-disclosure-guard.v1' as const,
    owner: 'OPL Workspace',
    source_root: sourceRoot,
    history: scanHistory,
    scanned_files: trackedPaths.length,
    scanned_blobs: scannedBlobs,
    finding_count: findings.length,
    status: findings.length === 0 ? 'passed' as const : 'blocked' as const,
    findings,
    authority_boundary: {
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}
