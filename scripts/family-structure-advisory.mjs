import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const workspaceRoot = path.dirname(repoRoot.includes(`${path.sep}.worktrees${path.sep}`) ? path.dirname(path.dirname(repoRoot)) : repoRoot);

const CODE_EXTENSIONS = new Set([
  '.bash',
  '.cjs',
  '.cts',
  '.go',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.py',
  '.rs',
  '.sh',
  '.ts',
  '.tsx',
  '.zsh',
]);
const PUBLIC_EXTENSIONS = new Set(['.json', '.md', '.toml', '.yaml', '.yml']);
const IGNORED_SEGMENTS = new Set(['.git', '.venv', 'build', 'coverage', 'dist', 'node_modules', '__pycache__']);
const NEAR_PART_LINE_LIMIT = 850;
const SOURCE_LINE_LIMIT = 1000;
const LARGE_SHARED_BUCKET_LIMIT = 600;
const PUBLIC_SURFACE_LINE_LIMIT = 1000;

const DEFAULT_REPOS = [
  ['one-person-lab', repoRoot],
  ['med-autogrant', path.join(workspaceRoot, 'med-autogrant')],
  ['med-deepscientist', path.join(workspaceRoot, 'med-deepscientist')],
  ['opl-aion-shell', path.join(workspaceRoot, 'opl-aion-shell')],
];

const args = parseArgs(process.argv.slice(2));
const repos = args.repos.length > 0 ? args.repos : DEFAULT_REPOS;
const report = buildReport(repos);

if (args.format === 'markdown') {
  process.stdout.write(renderMarkdown(report));
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {
    format: 'json',
    repos: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--format') {
      parsed.format = readValue(argv, index, '--format');
      index += 1;
    } else if (value.startsWith('--format=')) {
      parsed.format = value.slice('--format='.length);
    } else if (value === '--repo') {
      parsed.repos.push(parseRepoArg(readValue(argv, index, '--repo')));
      index += 1;
    } else if (value.startsWith('--repo=')) {
      parsed.repos.push(parseRepoArg(value.slice('--repo='.length)));
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }

  if (!['json', 'markdown'].includes(parsed.format)) {
    fail(`Unsupported --format value: ${parsed.format}`);
  }

  return parsed;
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) {
    fail(`${flag} requires a value`);
  }
  return value;
}

function parseRepoArg(value) {
  const separator = value.indexOf('=');
  if (separator === -1) {
    const root = path.resolve(value);
    return [path.basename(root), root];
  }
  return [value.slice(0, separator), path.resolve(value.slice(separator + 1))];
}

function buildReport(repoEntries) {
  const generatedAt = new Date().toISOString();
  const repositories = repoEntries.map(([name, root]) => scanRepository(name, root));
  return {
    report_kind: 'opl_family_structure_advisory',
    generated_at: generatedAt,
    advisory_only: true,
    thresholds: {
      near_part_line_limit: NEAR_PART_LINE_LIMIT,
      source_line_limit: SOURCE_LINE_LIMIT,
      large_shared_bucket_limit: LARGE_SHARED_BUCKET_LIMIT,
      public_surface_line_limit: PUBLIC_SURFACE_LINE_LIMIT,
    },
    repositories,
  };
}

function scanRepository(name, root) {
  const repo = {
    repo: name,
    root,
    status: 'scanned',
    categories: {
      safe_to_keep: [],
      needs_design_pass: [],
      mechanical_residue: [],
      public_surface_risk: [],
    },
    summary: {
      tracked_files: 0,
      code_files: 0,
      part_like_files: 0,
      shared_like_files: 0,
      missing_verify_entry: false,
    },
  };

  if (!fs.existsSync(root)) {
    repo.status = 'missing';
    return repo;
  }

  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  if (tracked.status !== 0) {
    repo.status = 'git_ls_files_failed';
    repo.error = tracked.stderr.trim();
    return repo;
  }

  const files = tracked.stdout.split('\n').filter(Boolean);
  repo.summary.tracked_files = files.length;
  repo.summary.missing_verify_entry = !fs.existsSync(path.join(root, 'scripts', 'verify.sh'));

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath) || shouldIgnore(relativePath)) {
      continue;
    }

    const extension = path.extname(relativePath);
    const isCode = CODE_EXTENSIONS.has(extension);
    const isPublicSurface = isPublicSurfaceFile(relativePath, extension);
    if (!isCode && !isPublicSurface) {
      continue;
    }

    const lineCount = countLines(fs.readFileSync(absolutePath, 'utf8'));
    const signals = classifyPath(relativePath, lineCount, {
      isCode,
      isGeneratedOrVendorSource: isGeneratedOrVendorSource(relativePath),
      isPublicSurface,
    });
    if (isCode) {
      repo.summary.code_files += 1;
    }
    if (signals.isPartLike) {
      repo.summary.part_like_files += 1;
    }
    if (signals.isSharedLike) {
      repo.summary.shared_like_files += 1;
    }

    for (const finding of signals.findings) {
      repo.categories[finding.category].push({
        path: relativePath,
        lines: lineCount,
        reason: finding.reason,
      });
    }
  }

  for (const category of Object.values(repo.categories)) {
    category.sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
  }

  return repo;
}

function shouldIgnore(relativePath) {
  return relativePath.split('/').some((segment) => IGNORED_SEGMENTS.has(segment));
}

function isPublicSurfaceFile(relativePath, extension) {
  if (!PUBLIC_EXTENSIONS.has(extension)) {
    return false;
  }
  return (
    relativePath.startsWith('contracts/') ||
    relativePath.startsWith('schemas/') ||
    relativePath === 'package.json' ||
    relativePath === 'pyproject.toml' ||
    relativePath === 'Makefile'
  );
}

function classifyPath(relativePath, lineCount, { isCode, isGeneratedOrVendorSource, isPublicSurface }) {
  const segments = relativePath.split('/');
  const basename = segments.at(-1) ?? relativePath;
  const basenameWithoutExtension = basename.slice(0, basename.length - path.extname(basename).length);
  const partSegments = segments.filter((segment) => isPartSegment(segment));
  const isPartLike = partSegments.length > 0 || /(?:^|[-_])(part|parts)(?:[-_.]|$)/i.test(relativePath);
  const isSharedLike = isGenericSharedSurface(segments, basenameWithoutExtension);
  const findings = [];

  if (isGeneratedOrVendorSource) {
    findings.push({ category: 'safe_to_keep', reason: 'generated_or_vendor_source' });
    return { findings, isPartLike, isSharedLike };
  }

  if (hasMechanicalResidue(relativePath, basenameWithoutExtension)) {
    findings.push({ category: 'mechanical_residue', reason: 'mechanical_chunk_part_split_name' });
  }

  if (partSegments.length > 1) {
    findings.push({ category: 'mechanical_residue', reason: 'nested_parts_directory' });
  }

  if (isCode && lineCount >= SOURCE_LINE_LIMIT) {
    findings.push({ category: 'needs_design_pass', reason: 'source_file_over_1000_lines' });
  } else if (isPartLike && lineCount >= NEAR_PART_LINE_LIMIT) {
    findings.push({ category: 'needs_design_pass', reason: 'part_file_near_1000_lines' });
  } else if (isPartLike && findings.length === 0) {
    findings.push({ category: 'safe_to_keep', reason: 'semantic_part_under_advisory_budget' });
  }

  if (isSharedLike && isCode && lineCount >= LARGE_SHARED_BUCKET_LIMIT) {
    findings.push({ category: 'public_surface_risk', reason: 'large_shared_bucket' });
  } else if (isSharedLike && findings.length === 0) {
    findings.push({ category: 'safe_to_keep', reason: 'small_shared_surface' });
  }

  if (isPublicSurface && lineCount >= PUBLIC_SURFACE_LINE_LIMIT) {
    findings.push({ category: 'public_surface_risk', reason: 'large_machine_readable_public_surface' });
  }

  return { findings: dedupeFindings(findings), isPartLike, isSharedLike };
}

function isPartSegment(segment) {
  return /(?:^|[-_])(part|parts)(?:[-_]|$)/i.test(segment);
}

function hasMechanicalResidue(relativePath, basenameWithoutExtension) {
  const pathResidue = /(?:^|\/)(chunk|part|split)[-_]?\d+(?:\/|[-_.]|$)/i.test(relativePath);
  const nameResidue = /(?:^|[-_])(chunk|part|split)[-_]?\d+(?:[-_]|$)/i.test(basenameWithoutExtension);
  return pathResidue || nameResidue;
}

function isGenericSharedSurface(segments, basenameWithoutExtension) {
  return (
    segments.includes('shared') ||
    basenameWithoutExtension === 'shared' ||
    basenameWithoutExtension.endsWith('_shared') ||
    basenameWithoutExtension.endsWith('-shared')
  );
}

function isGeneratedOrVendorSource(relativePath) {
  const segments = relativePath.split('/');
  return (
    relativePath.endsWith('.d.ts') ||
    segments.includes('vendor') ||
    (segments.includes('public') && (segments.includes('assets') || segments.includes('monaco')))
  );
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.category}:${finding.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function countLines(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
}

function renderMarkdown(report) {
  const lines = [
    '# OPL Family Structure Advisory',
    '',
    `Generated: ${report.generated_at}`,
    '',
    'This report is advisory only. It classifies tracked files that look like semantic parts, mechanical split residue, large shared buckets, near-budget source files, or large public machine-readable surfaces.',
    '',
  ];

  for (const repo of report.repositories) {
    lines.push(`## ${repo.repo}`, '');
    lines.push(`- root: \`${repo.root}\``);
    lines.push(`- status: \`${repo.status}\``);
    lines.push(`- tracked files: ${repo.summary.tracked_files}`);
    lines.push(`- code files scanned: ${repo.summary.code_files}`);
    lines.push(`- missing verify entry: ${repo.summary.missing_verify_entry ? 'yes' : 'no'}`);
    lines.push('');

    for (const categoryName of ['safe_to_keep', 'needs_design_pass', 'mechanical_residue', 'public_surface_risk']) {
      const findings = repo.categories[categoryName];
      lines.push(`### ${categoryName}`, '');
      if (findings.length === 0) {
        lines.push('- none', '');
        continue;
      }
      for (const finding of findings.slice(0, 40)) {
        lines.push(`- \`${finding.path}\` (${finding.lines} lines): ${finding.reason}`);
      }
      if (findings.length > 40) {
        lines.push(`- ... ${findings.length - 40} additional finding(s) omitted from markdown view`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
