import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(repoRoot);

const DEFAULT_LIMIT = 1000;
const BASELINE = new Map(Object.entries({
  "python/opl-harness-shared/src/opl_harness_shared/product_entry_companions.py": 1221,
  "python/opl-harness-shared/tests/test_product_entry_companions.py": 1111,
  "src/product-entry-companions.ts": 1796,
  "src/product-entry.ts": 1079,
  "src/web-frontdesk/payload-builders.ts": 1023,
  "tests/built/cli.test.mjs": 1745,
  "tests/src/cli/cases/frontdesk-system.test.ts": 1868,
  "tests/src/cli/cases/workspace-domain.test.ts": 1908,
  "tests/src/cli/helpers.ts": 1390,
  "tests/src/product-entry-companions.test.ts": 1415,
}));
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py', '.sh', '.bash', '.zsh', '.rs', '.go']);
const IGNORED_PARTS = new Set(['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__']);
const IGNORED_SUFFIXES = ['.min.js'];

const mode = process.argv.includes('--list') ? 'list' : 'check';

const trackedFiles = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (trackedFiles.status !== 0) {
  process.stderr.write(trackedFiles.stderr || 'line budget: git ls-files failed\n');
  process.exit(trackedFiles.status ?? 1);
}

const oversize = [];
const failures = [];
for (const relativePath of trackedFiles.stdout.split('\n').filter(Boolean)) {
  if (!isCodeFile(relativePath)) {
    continue;
  }
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }
  const lineCount = countLines(fs.readFileSync(absolutePath, 'utf8'));
  if (lineCount <= DEFAULT_LIMIT) {
    continue;
  }
  oversize.push([relativePath, lineCount]);
  const allowed = BASELINE.get(relativePath);
  if (allowed === undefined) {
    failures.push(`${relativePath}: ${lineCount} lines exceeds ${DEFAULT_LIMIT} line budget; split into focused modules or add an explicit reviewed baseline`);
  } else if (lineCount > allowed) {
    failures.push(`${relativePath}: ${lineCount} lines exceeds locked baseline ${allowed}; split before growing this file`);
  }
}

oversize.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

if (mode === 'list') {
  for (const [relativePath, lineCount] of oversize) {
    process.stdout.write(`${String(lineCount).padStart(6, ' ')} ${relativePath}\n`);
  }
  process.exit(0);
}

const staleBaseline = [...BASELINE.keys()].filter((relativePath) => !fs.existsSync(path.join(repoRoot, relativePath)));
for (const relativePath of staleBaseline) {
  failures.push(`${relativePath}: stale line-budget baseline entry; remove it after deleting or renaming the file`);
}

if (failures.length > 0) {
  process.stderr.write(`line budget check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):\n`);
  process.stderr.write(failures.map((failure) => `- ${failure}`).join('\n'));
  process.stderr.write('\n');
  process.exit(1);
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

function countLines(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
}
