import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { countLines } from './source-line-count.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py', '.sh', '.bash', '.zsh', '.rs', '.go']);
const IGNORED_PARTS = new Set(['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__']);
const IGNORED_SUFFIXES = ['.min.js'];

const args = parseArgs(process.argv.slice(2));
const strictMode = args.strict || strictEnvEnabled(process.env.OPL_LINE_BUDGET_STRICT);
const targetRoot = args.root ? path.resolve(args.root) : repoRoot;
const baselinePath = args.baseline
  ? path.resolve(args.baseline)
  : path.join(targetRoot, 'contracts', 'opl-framework', 'source-structure-budget.json');
const contract = loadContract(baselinePath);
const defaultLimit = contract.defaultLimit;
const baseline = contract.baseline;

process.chdir(targetRoot);

const trackedFiles = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (trackedFiles.status !== 0) {
  process.stderr.write(trackedFiles.stderr || 'line budget: git ls-files failed\n');
  process.exit(trackedFiles.status ?? 1);
}

const oversize = [];
const failures = [];
failures.push(...contract.failures);
for (const relativePath of trackedFiles.stdout.split('\n').filter(Boolean)) {
  if (!isCodeFile(relativePath)) {
    continue;
  }
  const absolutePath = path.join(targetRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }
  const lineCount = countLines(fs.readFileSync(absolutePath, 'utf8'));
  if (lineCount <= defaultLimit) {
    continue;
  }
  oversize.push([relativePath, lineCount]);
  const allowed = baseline.get(relativePath)?.limit;
  if (allowed === undefined) {
    failures.push(`${relativePath}: ${lineCount} lines exceeds ${defaultLimit} line budget; split along a semantic boundary or add a reviewed baseline contract entry`);
  } else if (lineCount > allowed) {
    failures.push(`${relativePath}: ${lineCount} lines exceeds locked baseline ${allowed}; ratchet baseline blocks growth until this file is split or the reviewed contract is intentionally updated`);
  }
}

oversize.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

if (args.mode === 'list') {
  for (const [relativePath, lineCount] of oversize) {
    process.stdout.write(`${String(lineCount).padStart(6, ' ')} ${relativePath}\n`);
  }
  process.exit(0);
}

const staleBaseline = [...baseline.keys()].filter((relativePath) => !fs.existsSync(path.join(targetRoot, relativePath)));
for (const relativePath of staleBaseline) {
  failures.push(`${relativePath}: stale line-budget baseline entry; remove it after deleting or renaming the file`);
}

const retiredBaseline = [...baseline.keys()].filter((relativePath) => {
  const absolutePath = path.join(targetRoot, relativePath);
  return fs.existsSync(absolutePath) && countLines(fs.readFileSync(absolutePath, 'utf8')) <= defaultLimit;
});
for (const relativePath of retiredBaseline) {
  failures.push(`${relativePath}: retired line-budget baseline entry; remove it because the file is back under ${defaultLimit} lines`);
}

if (failures.length > 0) {
  const label = strictMode ? 'strict line budget check failed' : 'line budget advisory';
  process.stderr.write(`${label} (${failures.length} issue${failures.length === 1 ? '' : 's'}):\n`);
  process.stderr.write(failures.map((failure) => `- ${failure}`).join('\n'));
  process.stderr.write('\n');
  if (strictMode) {
    process.exit(1);
  }
}

function isCodeFile(relativePath) {
  const parts = relativePath.split('/');
  if (parts.some((part) => IGNORED_PARTS.has(part))) {
    return false;
  }
  if (IGNORED_SUFFIXES.some((suffix) => relativePath.endsWith(suffix))) {
    return false;
  }
  return CODE_EXTENSIONS.has(path.extname(relativePath));
}

function parseArgs(argv) {
  const parsed = {
    mode: 'check',
    root: null,
    baseline: null,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--list') {
      parsed.mode = 'list';
    } else if (value === '--strict') {
      parsed.strict = true;
    } else if (value === '--root') {
      parsed.root = readArgValue(argv, index, '--root');
      index += 1;
    } else if (value.startsWith('--root=')) {
      parsed.root = value.slice('--root='.length);
    } else if (value === '--baseline') {
      parsed.baseline = readArgValue(argv, index, '--baseline');
      index += 1;
    } else if (value.startsWith('--baseline=')) {
      parsed.baseline = value.slice('--baseline='.length);
    } else {
      process.stderr.write(`line budget: unknown argument ${value}\n`);
      process.exit(1);
    }
  }
  return parsed;
}

function strictEnvEnabled(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

function readArgValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) {
    process.stderr.write(`line budget: ${flag} requires a value\n`);
    process.exit(1);
  }
  return value;
}

function loadContract(file) {
  const failures = [];
  if (!fs.existsSync(file)) {
    failures.push(`${path.relative(targetRoot, file)}: source structure budget contract is missing`);
    return { defaultLimit: 1000, baseline: new Map(), failures };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${path.relative(targetRoot, file)}: source structure budget contract is not valid JSON: ${error.message}`);
    return { defaultLimit: 1000, baseline: new Map(), failures };
  }

  const defaultLimit = positiveInteger(parsed.default_limit) ?? 1000;
  if (positiveInteger(parsed.default_limit) === null) {
    failures.push(`${path.relative(targetRoot, file)}: default_limit must be a positive integer`);
  }
  if (parsed.contract_kind !== 'opl_source_structure_budget.v1') {
    failures.push(`${path.relative(targetRoot, file)}: contract_kind must be opl_source_structure_budget.v1`);
  }
  const acceptedModes = new Set([
    'scheduled_advisory_with_explicit_strict_ratchet',
    'ratchet_no_growth',
  ]);
  if (!acceptedModes.has(parsed.baseline_policy?.mode)) {
    failures.push(`${path.relative(targetRoot, file)}: baseline_policy.mode must be scheduled_advisory_with_explicit_strict_ratchet`);
  }

  const baseline = new Map();
  const entries = Array.isArray(parsed.reviewed_baselines) ? parsed.reviewed_baselines : [];
  if (!Array.isArray(parsed.reviewed_baselines)) {
    failures.push(`${path.relative(targetRoot, file)}: reviewed_baselines must be an array`);
  }
  for (const entry of entries) {
    const relativePath = normalizedRelativePath(entry?.path);
    const limit = positiveInteger(entry?.limit);
    const label = relativePath ?? '<missing-path>';
    if (!relativePath) {
      failures.push(`${path.relative(targetRoot, file)}: baseline entry is missing path`);
    }
    if (limit === null) {
      failures.push(`${path.relative(targetRoot, file)}: baseline entry for ${label} is missing positive integer limit`);
    }
    for (const field of ['owner', 'reason', 'intended_boundary']) {
      if (!nonEmptyString(entry?.[field])) {
        failures.push(`${path.relative(targetRoot, file)}: baseline entry for ${label} is missing ${field}`);
      }
    }
    if (relativePath && baseline.has(relativePath)) {
      failures.push(`${path.relative(targetRoot, file)}: duplicate baseline entry for ${relativePath}`);
    }
    if (relativePath && limit !== null) {
      baseline.set(relativePath, { limit });
    }
  }

  return { defaultLimit, baseline, failures };
}

function normalizedRelativePath(value) {
  if (!nonEmptyString(value)) {
    return null;
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (normalized.startsWith('/') || normalized.includes('../') || normalized === '..') {
    return null;
  }
  return normalized;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
