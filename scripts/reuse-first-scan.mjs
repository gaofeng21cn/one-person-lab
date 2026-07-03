#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const root = args.root ? path.resolve(args.root) : repoRoot;
const contractPath = args.contract
  ? path.resolve(args.contract)
  : path.join(root, 'contracts', 'opl-framework', 'reuse-first-governance.json');
const contract = readContract(contractPath);
const patterns = contract.patterns.map((entry) => ({
  ...entry,
  compiled: new RegExp(entry.regex),
}));
const allowMarkers = contract.allow_markers ?? [];

const findings = args.mode === 'diff'
  ? scanDiffAddedLines()
  : scanFiles();
const visibleFindings = findings.slice(0, args.maxFindings);

const summary = {
  surface_kind: 'opl_reuse_first_scan',
  status: findings.length === 0 ? 'ok' : 'attention',
  mode: args.mode,
  strict: args.strict,
  diff_ref: args.mode === 'diff' ? args.diffRef : null,
  contract: path.relative(root, contractPath),
  finding_count: findings.length,
  returned_finding_count: visibleFindings.length,
  omitted_finding_count: findings.length - visibleFindings.length,
  findings: visibleFindings,
  false_ready_guard: [
    'reuse-first scan findings are implementation candidates, not proof of readiness failure',
    'clean scan does not prove release-ready, production-ready, domain-ready, or owner acceptance',
  ],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (args.strict && findings.length > 0) {
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    root: null,
    contract: null,
    mode: 'full',
    diffRef: 'origin/main',
    strict: false,
    maxFindings: 200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root') {
      parsed.root = readArgValue(argv, index, '--root');
      index += 1;
    } else if (value.startsWith('--root=')) {
      parsed.root = value.slice('--root='.length);
    } else if (value === '--contract') {
      parsed.contract = readArgValue(argv, index, '--contract');
      index += 1;
    } else if (value.startsWith('--contract=')) {
      parsed.contract = value.slice('--contract='.length);
    } else if (value === '--mode') {
      parsed.mode = readArgValue(argv, index, '--mode');
      index += 1;
    } else if (value.startsWith('--mode=')) {
      parsed.mode = value.slice('--mode='.length);
    } else if (value === '--diff-ref') {
      parsed.diffRef = readArgValue(argv, index, '--diff-ref');
      index += 1;
    } else if (value.startsWith('--diff-ref=')) {
      parsed.diffRef = value.slice('--diff-ref='.length);
    } else if (value === '--max-findings') {
      parsed.maxFindings = readPositiveInteger(readArgValue(argv, index, '--max-findings'), '--max-findings');
      index += 1;
    } else if (value.startsWith('--max-findings=')) {
      parsed.maxFindings = readPositiveInteger(value.slice('--max-findings='.length), '--max-findings');
    } else if (value === '--strict') {
      parsed.strict = true;
    } else {
      fail(`reuse-first scan: unknown argument ${value}`);
    }
  }
  if (!['full', 'diff'].includes(parsed.mode)) {
    fail('reuse-first scan: --mode must be full or diff');
  }
  return parsed;
}

function readPositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`reuse-first scan: ${flag} must be a non-negative integer`);
  }
  return parsed;
}

function readArgValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) {
    fail(`reuse-first scan: ${flag} requires a value`);
  }
  return value;
}

function readContract(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`reuse-first scan: failed to read ${file}: ${error.message}`);
  }
  if (parsed.contract_kind !== 'opl_reuse_first_governance.v1') {
    fail(`reuse-first scan: ${file} must be opl_reuse_first_governance.v1`);
  }
  if (!Array.isArray(parsed.patterns)) {
    fail(`reuse-first scan: ${file} patterns must be an array`);
  }
  return parsed;
}

function scanFiles() {
  const findings = [];
  for (const relativePath of listScanFiles()) {
    const lines = fs.readFileSync(path.join(root, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      findings.push(...findLineMatches(relativePath, index + 1, line));
    });
  }
  return findings;
}

function listScanFiles() {
  const files = [];
  for (const scanRoot of contract.scan.roots) {
    walk(scanRoot, files);
  }
  return files.sort();
}

function walk(relativeRoot, files) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (contract.scan.ignored_parts.includes(entry.name)) {
      continue;
    }
    const relativePath = path.join(relativeRoot, entry.name).replaceAll('\\', '/');
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      walk(relativePath, files);
    } else if (entry.isFile() && shouldScanPath(relativePath)) {
      files.push(relativePath);
    }
  }
}

function scanDiffAddedLines() {
  const diff = spawnSync(
    'git',
    ['diff', '--unified=0', args.diffRef, '--', ...contract.scan.roots],
    { cwd: root, encoding: 'utf8' },
  );
  if (diff.status !== 0) {
    fail(diff.stderr || `reuse-first scan: git diff ${args.diffRef} failed`);
  }
  return [
    ...scanDiffText(diff.stdout),
    ...scanUntrackedFiles(),
  ];
}

function scanDiffText(diffText) {
  const findings = [];
  let currentFile = null;
  let newLine = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length);
      if (!shouldScanPath(currentFile)) {
        currentFile = null;
      }
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!currentFile || line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }
    if (line.startsWith('+')) {
      findings.push(...findLineMatches(currentFile, newLine, line.slice(1)));
      newLine += 1;
    } else if (!line.startsWith('-') && line.length > 0) {
      newLine += 1;
    }
  }
  return findings;
}

function scanUntrackedFiles() {
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', ...contract.scan.roots],
    { cwd: root, encoding: 'utf8' },
  );
  if (untracked.status !== 0) {
    fail(untracked.stderr || 'reuse-first scan: git ls-files --others failed');
  }
  const findings = [];
  for (const relativePath of untracked.stdout.split('\n').filter(Boolean)) {
    if (!shouldScanPath(relativePath)) {
      continue;
    }
    const lines = fs.readFileSync(path.join(root, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      findings.push(...findLineMatches(relativePath, index + 1, line));
    });
  }
  return findings;
}

function shouldScanPath(relativePath) {
  const parts = relativePath.split('/');
  return !(contract.scan.ignored_paths ?? []).includes(relativePath)
    && !parts.some((part) => contract.scan.ignored_parts.includes(part))
    && contract.scan.extensions.includes(path.extname(relativePath));
}

function findLineMatches(relativePath, lineNumber, line) {
  if (allowMarkers.some((marker) => line.includes(marker))) {
    return [];
  }
  const findings = [];
  for (const pattern of patterns) {
    const match = line.match(pattern.compiled);
    if (!match) {
      continue;
    }
    findings.push({
      path: relativePath,
      line: lineNumber,
      category: pattern.id,
      severity: pattern.severity,
      match: match[0],
      reason: pattern.reason,
      preferred_reuse: pattern.preferred_reuse,
    });
  }
  return findings;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
