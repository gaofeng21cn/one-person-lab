import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const actionPath = process.env.GITHUB_ACTION_PATH;
if (!actionPath) {
  throw new Error('GITHUB_ACTION_PATH is required.');
}

const rootInput = process.env.OPL_QUALITY_DETAILS_ROOT ?? '.';
const qualityRoot = fs.realpathSync(rootInput);
const outputDir = process.env.OPL_QUALITY_DETAILS_OUTPUT_DIR ?? 'artifacts/opl-quality-details';
const outputPath = path.join(outputDir, 'quality-details.json');
const focus = process.env.OPL_QUALITY_DETAILS_FOCUS ?? 'auto';
const markdownLimit = process.env.OPL_QUALITY_DETAILS_LIMIT ?? '20';
const jsonLimit = process.env.OPL_QUALITY_DETAILS_JSON_LIMIT ?? '50';
const compareRef = process.env.OPL_QUALITY_DETAILS_COMPARE_REF ?? '';
const timeoutSeconds = Number(process.env.OPL_QUALITY_DETAILS_TIMEOUT_SECONDS ?? '240');
const oplBin = path.resolve(actionPath, '../../..', 'bin/opl');

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  throw new Error(`Invalid OPL_QUALITY_DETAILS_TIMEOUT_SECONDS: ${process.env.OPL_QUALITY_DETAILS_TIMEOUT_SECONDS}`);
}

fs.mkdirSync(outputDir, { recursive: true });

const compareArgs = [];
if (compareRef) {
  if (compareRef.startsWith('origin/')) {
    const compareBranch = compareRef.slice('origin/'.length);
    execFileSync('git', ['-C', qualityRoot, 'fetch', '--no-tags', 'origin', `+${compareBranch}:refs/remotes/origin/${compareBranch}`], {
      stdio: 'inherit',
    });
  }
  execFileSync('git', ['-C', qualityRoot, 'rev-parse', '--verify', `${compareRef}^{commit}`], {
    stdio: 'ignore',
  });
  compareArgs.push('--compare-ref', compareRef);
}

function runOplQualityDetails(args, outputFile) {
  return new Promise((resolve) => {
    const stdio = ['ignore', outputFile ? 'pipe' : 'inherit', 'inherit'];
    const child = spawn(oplBin, args, { stdio });
    const outputStream = outputFile ? fs.createWriteStream(outputFile, { flags: 'a' }) : undefined;
    let timedOut = false;
    let killTimer;

    if (child.stdout && outputStream) {
      child.stdout.pipe(outputStream);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      killTimer.unref();
    }, timeoutSeconds * 1000);

    child.on('error', (error) => {
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      outputStream?.end();
      console.error(error.message);
      resolve({ status: 127, timedOut: false });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      outputStream?.end();
      if (timedOut) {
        resolve({ status: 124, timedOut: true });
        return;
      }
      if (signal) {
        console.error(`OPL quality details terminated by signal: ${signal}`);
        resolve({ status: 1, timedOut: false });
        return;
      }
      resolve({ status: code ?? 0, timedOut: false });
    });
  });
}

function qualityDetailsArgs(format, limit) {
  return [
    'quality',
    'details',
    '--root',
    qualityRoot,
    '--format',
    format,
    '--limit',
    limit,
    '--focus',
    focus,
    ...compareArgs,
  ];
}

function writeDiagnostic(status, reason) {
  const limit = Number(jsonLimit);
  const report = {
    version: 'g2',
    quality_details: {
      surface_kind: 'opl_code_quality_details.v1',
      root: qualityRoot,
      generated_at: new Date().toISOString(),
      focus,
      limit: Number.isFinite(limit) ? limit : 0,
      diagnostic: {
        status: status === 124 ? 'timeout' : 'failed',
        exit_status: status,
        reason,
      },
      repo_summary: {
        files: 0,
        source_files: 0,
        test_files: 0,
        functions: 0,
        import_edges: 0,
        max_depth: 0,
        untested_source_files: 0,
        rules_findings: 0,
      },
      function_change_findings: [],
      function_findings: [],
      file_findings: [],
      dependency_findings: [],
      test_gap_findings: [],
      rules_findings: [],
      agent_triage_targets: [],
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const markdown = await runOplQualityDetails(qualityDetailsArgs('markdown', markdownLimit), summaryPath);
if (markdown.status === 124) {
  console.warn(`::warning::OPL quality details markdown exceeded ${timeoutSeconds}s; attempting JSON sidecar.`);
} else if (markdown.status !== 0) {
  console.warn(`::warning::OPL quality details markdown failed with exit status ${markdown.status}; attempting JSON sidecar.`);
}

fs.rmSync(outputPath, { force: true });
const json = await runOplQualityDetails(qualityDetailsArgs('json', jsonLimit), outputPath);
if (json.status === 124) {
  console.warn(`::warning::OPL quality details JSON exceeded ${timeoutSeconds}s; emitting diagnostic sidecar.`);
  writeDiagnostic(json.status, 'quality details JSON timed out');
} else if (json.status !== 0) {
  console.warn(`::warning::OPL quality details JSON failed with exit status ${json.status}; emitting diagnostic sidecar.`);
  writeDiagnostic(json.status, 'quality details JSON failed');
}
