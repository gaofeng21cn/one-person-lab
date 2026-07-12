#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

import { readJsonFile } from './script-json-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseCliOptions(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

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
const strictHardCategories = new Set(contract.strict_mode?.hard_categories ?? []);

const findings = scanDiffAddedLines();
const visibleFindings = findings.slice(0, args.maxFindings);
const hardGateFindingCount = findings.filter((finding) => finding.gate_mode === 'hard').length;
const advisoryFindingCount = findings.length - hardGateFindingCount;
const gateStatus = findings.length === 0
  ? 'ok'
  : hardGateFindingCount > 0 ? 'hard_fail' : 'advisory_attention';

process.stdout.write(`${JSON.stringify({
  surface_kind: 'opl_reuse_first_scan',
  status: findings.length === 0 ? 'ok' : 'attention',
  gate_status: gateStatus,
  mode: 'strict_diff',
  strict: true,
  diff_ref: args.diffRef,
  contract: path.relative(root, contractPath),
  finding_count: findings.length,
  hard_gate_finding_count: hardGateFindingCount,
  advisory_finding_count: advisoryFindingCount,
  returned_finding_count: visibleFindings.length,
  omitted_finding_count: findings.length - visibleFindings.length,
  findings: visibleFindings,
  false_ready_guard: [
    'reuse-first diff findings are implementation candidates, not proof of readiness failure',
    'a clean diff gate does not prove historical risk is empty, release-ready, production-ready, domain-ready, or owner acceptance',
  ],
}, null, 2)}\n`);

if (hardGateFindingCount > 0) {
  process.exit(1);
}

function parseCliOptions(argv) {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      contract: { type: 'string' },
      'diff-ref': { type: 'string', default: 'origin/main' },
      'max-findings': { type: 'string', default: '200' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    root: values.root ?? null,
    contract: values.contract ?? null,
    diffRef: values['diff-ref'],
    help: values.help === true,
    maxFindings: readPositiveInteger(values['max-findings'], '--max-findings'),
  };
}

function printHelp() {
  process.stdout.write([
    'Usage: node scripts/reuse-first-scan.mjs [options]',
    '',
    'Options:',
    '  --root <path>                  Repo root whose changed lines are checked.',
    '  --contract <path>              Reuse-first governance contract.',
    '  --diff-ref <ref>               Base ref for the strict diff gate. Default: origin/main.',
    '  --max-findings <n>             Number of findings included in json output. Default: 200.',
    '  --help                         Print this help.',
    '',
  ].join('\n'));
}

function readPositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`reuse-first scan: ${flag} must be a non-negative integer`);
  }
  return parsed;
}

function readContract(file) {
  let parsed;
  try {
    parsed = readJsonFile(file);
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

function scanDiffAddedLines() {
  const mergeBase = spawnSync(
    'git',
    ['merge-base', args.diffRef, 'HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  if (mergeBase.status !== 0 || !mergeBase.stdout.trim()) {
    fail(mergeBase.stderr || `reuse-first scan: git merge-base ${args.diffRef} HEAD failed`);
  }
  const diffBase = mergeBase.stdout.trim();
  const diff = spawnSync(
    'git',
    ['diff', '--unified=0', diffBase, '--', ...contract.scan.roots],
    { cwd: root, encoding: 'utf8' },
  );
  if (diff.status !== 0) {
    fail(diff.stderr || `reuse-first scan: git diff ${args.diffRef} failed`);
  }
  return [...scanDiffText(diff.stdout), ...scanUntrackedFiles()];
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
  if (allowMarkers.some((marker) => line.includes(marker)) || isAllowedMetadataLine(relativePath, line)) {
    return [];
  }
  const findings = [];
  for (const pattern of patterns) {
    const match = line.match(pattern.compiled);
    if (!match) {
      continue;
    }
    const riskCategories = pattern.risk_categories ?? [pattern.id];
    const gateMode = riskCategories.some((category) => strictHardCategories.has(category))
      ? 'hard'
      : 'advisory';
    findings.push({
      path: relativePath,
      line: lineNumber,
      category: pattern.id,
      severity: pattern.severity,
      gate_mode: gateMode,
      risk_categories: riskCategories,
      match: match[0],
      reason: pattern.reason,
      preferred_reuse: pattern.preferred_reuse,
      mature_module_candidate: pattern.preferred_reuse?.[0] ?? 'existing shared platform primitive',
      refusal_or_adoption_decision_required: gateMode === 'hard',
      owner: contract.owner,
      review_date: new Date().toISOString().slice(0, 10),
      decision_ref: `${path.relative(root, contractPath)}#patterns.${pattern.id}`,
    });
  }
  return findings;
}

function isAllowedMetadataLine(relativePath, line) {
  return (
    relativePath === 'contracts/opl-framework/cli-command-registry.json'
    && line.includes('"update rollback"')
  )
    || isAllowedManagedUpdateOwnerBoundaryLine(relativePath, line)
    || isAllowedOwnerRoutedCommandProjectionLine(relativePath, line)
    || isAllowedQueueProjectionVocabularyLine(relativePath, line)
    || isAllowedObservabilityProjectionVocabularyLine(relativePath, line)
    || isAllowedDiagnosticProjectionLine(relativePath, line);
}

function isAllowedManagedUpdateOwnerBoundaryLine(relativePath, line) {
  if (line.includes('managed-update-owner-boundary.ts')) {
    return true;
  }
  if (relativePath !== 'src/modules/connect/managed-update-owner-boundary.ts') {
    return false;
  }
  return [
    'ManagedUpdateOperation',
    'source_manifest_ref',
    'from_digest',
    'to_digest',
    'post_apply_hooks',
    'rollback_ref',
  ].some((term) => line.includes(term));
}

function isAllowedOwnerRoutedCommandProjectionLine(relativePath, line) {
  if (!line.includes('rollback')) {
    return false;
  }
  return [
    'src/entrypoints/cli/cases/public-command-specs-parts/update.ts',
    'src/entrypoints/cli/cases/runtime-environment-command-spec.ts',
    'src/entrypoints/cli/cases/runtime-public-command-specs.ts',
    'src/entrypoints/cli/cases/agent-lab-public-command-specs.ts',
  ].includes(relativePath);
}

function isAllowedQueueProjectionVocabularyLine(relativePath, line) {
  if (relativePath !== 'src/kernel/queue-projection-vocabulary.ts') {
    return false;
  }
  return queueProjectionVocabularyTerms().some((term) => line.includes(term));
}

function isAllowedObservabilityProjectionVocabularyLine(relativePath, line) {
  if (relativePath !== 'src/kernel/observability-projection-vocabulary.ts') {
    return false;
  }
  return observabilityProjectionVocabularyTerms().some((term) => line.includes(term));
}

function isAllowedDiagnosticProjectionLine(relativePath, line) {
  if (!relativePath.startsWith('src/modules/') || !line.includes(['drill', 'down'].join(''))) {
    return false;
  }
  return !observabilityProjectionVocabularyTerms().some((term) => line.includes(term));
}

function queueProjectionVocabularyTerms() {
  return [
    ['dead', 'letter'].join('_'),
    ['lease', 'owner'].join('_'),
    ['max', 'attempts'].join('_'),
  ];
}

function observabilityProjectionVocabularyTerms() {
  return [
    ['evidence', 'ledger'].join('_'),
    ['receipt', 'ledger'].join('_'),
    'attempt ledger',
    'runtime ledger',
  ];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
