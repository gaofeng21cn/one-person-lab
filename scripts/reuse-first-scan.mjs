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
const historicalWorklistPath = args.historicalWorklist
  ? path.resolve(args.historicalWorklist)
  : path.join(root, 'contracts', 'opl-framework', 'reuse-first-historical-worklist.json');
const contract = readContract(contractPath);
const historicalWorklist = args.mode === 'full'
  ? readHistoricalWorklist(historicalWorklistPath)
  : null;
const patterns = contract.patterns.map((entry) => ({
  ...entry,
  compiled: new RegExp(entry.regex),
}));
const allowMarkers = contract.allow_markers ?? [];
const strictHardCategories = new Set(contract.strict_mode?.hard_categories ?? []);

const rawFindings = args.mode === 'diff'
  ? scanDiffAddedLines()
  : scanFiles();
const findings = historicalWorklist
  ? rawFindings.map((finding) => attachHistoricalDecision(finding, historicalWorklist))
  : rawFindings;
const visibleFindings = findings.slice(0, args.maxFindings);
const hardGateFindingCount = findings.filter((finding) => finding.gate_mode === 'hard').length;
const advisoryFindingCount = findings.length - hardGateFindingCount;
const gateStatus = findings.length === 0
  ? 'ok'
  : hardGateFindingCount > 0
    ? 'hard_fail'
    : 'advisory_attention';

const summary = {
  surface_kind: 'opl_reuse_first_scan',
  status: findings.length === 0 ? 'ok' : 'attention',
  gate_status: gateStatus,
  mode: args.mode,
  strict: args.strict,
  diff_ref: args.mode === 'diff' ? args.diffRef : null,
  contract: path.relative(root, contractPath),
  finding_count: findings.length,
  hard_gate_finding_count: hardGateFindingCount,
  advisory_finding_count: advisoryFindingCount,
  returned_finding_count: visibleFindings.length,
  omitted_finding_count: findings.length - visibleFindings.length,
  findings: visibleFindings,
  historical_decision_summary: historicalWorklist
    ? summarizeHistoricalDecisions(findings, historicalWorklist, historicalWorklistPath)
    : {
        surface_kind: 'opl_reuse_first_historical_worklist_readback',
        applied: false,
        reason: args.mode === 'diff'
          ? 'diff gate ignores historical worklist decisions so new hard findings cannot be waived'
          : 'historical worklist contract not found',
      },
  false_ready_guard: [
    'reuse-first scan findings are implementation candidates, not proof of readiness failure',
    'clean scan does not prove release-ready, production-ready, domain-ready, or owner acceptance',
    'historical worklist decisions classify risk; they do not mean risk eliminated',
  ],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (args.strict && hardGateFindingCount > 0) {
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
    } else if (value === '--historical-worklist') {
      parsed.historicalWorklist = readArgValue(argv, index, '--historical-worklist');
      index += 1;
    } else if (value.startsWith('--historical-worklist=')) {
      parsed.historicalWorklist = value.slice('--historical-worklist='.length);
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

function readHistoricalWorklist(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`reuse-first scan: failed to read ${file}: ${error.message}`);
  }
  if (parsed.contract_kind !== 'opl_reuse_first_historical_worklist.v1') {
    fail(`reuse-first scan: ${file} must be opl_reuse_first_historical_worklist.v1`);
  }
  if (!Array.isArray(parsed.items)) {
    fail(`reuse-first scan: ${file} items must be an array`);
  }
  const allowedStatuses = new Set(parsed.decision_statuses ?? []);
  if (allowedStatuses.size === 0) {
    fail(`reuse-first scan: ${file} decision_statuses must be a non-empty array`);
  }
  for (const item of parsed.items) {
    if (!item.id || !allowedStatuses.has(item.status)) {
      fail(`reuse-first scan: ${file} item ${item.id ?? '<missing id>'} has invalid status`);
    }
  }
  return parsed;
}

function attachHistoricalDecision(finding, worklist) {
  const item = worklist.items.find((candidate) => matchesWorklistItem(finding, candidate));
  const decision = item
    ? {
        status: item.status,
        item_id: item.id,
        owner: item.owner,
        phase: item.phase,
        action: item.action,
        expiry: item.expiry,
        path_prefix: matchedPathPrefix(finding.path, item.path_prefixes),
        decision_ref: item.decision_ref,
        false_ready_guard: item.false_ready_guard ?? worklist.false_ready_guard,
      }
    : {
        status: 'undecisioned',
        item_id: null,
        owner: worklist.default_owner ?? contract.owner,
        phase: 'unassigned',
        action: 'classify_or_migrate',
        expiry: null,
        path_prefix: defaultPathPrefix(finding.path),
        decision_ref: path.relative(root, historicalWorklistPath),
        false_ready_guard: worklist.false_ready_guard,
      };
  return {
    ...finding,
    historical_decision: decision,
    historical_decision_status: decision.status,
    worklist_action: decision.action,
    worklist_expiry: decision.expiry,
  };
}

function matchesWorklistItem(finding, item) {
  if (Array.isArray(item.categories) && !item.categories.includes(finding.category)) {
    return false;
  }
  if (Array.isArray(item.gate_modes) && !item.gate_modes.includes(finding.gate_mode)) {
    return false;
  }
  if (Array.isArray(item.risk_categories)) {
    const findingCategories = finding.risk_categories ?? [];
    if (!item.risk_categories.some((category) => findingCategories.includes(category))) {
      return false;
    }
  }
  if (Array.isArray(item.path_prefixes) && item.path_prefixes.length > 0) {
    return item.path_prefixes.some((prefix) => pathMatchesPrefix(finding.path, prefix));
  }
  return true;
}

function pathMatchesPrefix(relativePath, prefix) {
  const normalized = prefix.replaceAll('\\', '/');
  return relativePath === normalized || relativePath.startsWith(normalized.endsWith('/') ? normalized : `${normalized}/`);
}

function matchedPathPrefix(relativePath, prefixes) {
  if (!Array.isArray(prefixes)) {
    return defaultPathPrefix(relativePath);
  }
  return prefixes.find((prefix) => pathMatchesPrefix(relativePath, prefix)) ?? defaultPathPrefix(relativePath);
}

function defaultPathPrefix(relativePath) {
  const parts = relativePath.split('/');
  if (parts[0] === 'scripts') {
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts.slice(0, 2).join('/');
}

function summarizeHistoricalDecisions(findings, worklist, worklistPath) {
  const decisionedCount = findings.filter((finding) => finding.historical_decision_status !== 'undecisioned').length;
  return {
    surface_kind: 'opl_reuse_first_historical_worklist_readback',
    applied: true,
    source: path.relative(root, worklistPath),
    mode: 'full_scan_only',
    finding_count: findings.length,
    decisioned_finding_count: decisionedCount,
    undecisioned_finding_count: findings.length - decisionedCount,
    false_ready_guard: worklist.false_ready_guard,
    by_decision_status: groupFindings(findings, (finding) => finding.historical_decision.status),
    by_category: groupFindings(findings, (finding) => finding.category),
    by_path_prefix: groupFindings(findings, (finding) => finding.historical_decision.path_prefix),
    by_owner: groupFindings(findings, (finding) => finding.historical_decision.owner),
    by_phase: groupFindings(findings, (finding) => finding.historical_decision.phase),
    by_action: groupFindings(findings, (finding) => finding.historical_decision.action),
    by_expiry: groupFindings(findings, (finding) => finding.historical_decision.expiry ?? 'none'),
    worklist_items: worklist.items.map((item) => summarizeWorklistItem(findings, item)),
  };
}

function summarizeWorklistItem(findings, item) {
  const itemFindings = findings.filter((finding) => finding.historical_decision.item_id === item.id);
  return {
    id: item.id,
    status: item.status,
    owner: item.owner,
    phase: item.phase,
    action: item.action,
    expiry: item.expiry,
    finding_count: itemFindings.length,
    hard_gate_finding_count: itemFindings.filter((finding) => finding.gate_mode === 'hard').length,
    advisory_finding_count: itemFindings.filter((finding) => finding.gate_mode === 'advisory').length,
  };
}

function groupFindings(findings, keyOf) {
  const groups = new Map();
  for (const finding of findings) {
    const key = keyOf(finding) ?? 'unknown';
    const current = groups.get(key) ?? {
      key,
      finding_count: 0,
      hard_gate_finding_count: 0,
      advisory_finding_count: 0,
    };
    current.finding_count += 1;
    if (finding.gate_mode === 'hard') {
      current.hard_gate_finding_count += 1;
    } else {
      current.advisory_finding_count += 1;
    }
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => {
    if (right.finding_count !== left.finding_count) {
      return right.finding_count - left.finding_count;
    }
    return String(left.key).localeCompare(String(right.key));
  });
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

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
