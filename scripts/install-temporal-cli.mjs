import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cohortPath = fileURLToPath(new URL('../contracts/opl-framework/temporal-stable-cohort.json', import.meta.url));

export function installTemporalCli({
  homeDir = os.homedir(), platform = process.platform, arch = process.arch,
  searchPath = process.env.PATH ?? '',
  cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8')),
  run = execFileSync,
} = {}) {
  if (platform !== 'linux' || arch !== 'x64') return { status: 'not_applicable' };
  const destination = path.join(homeDir, '.local/bin/temporal');
  // Reuse an existing owner. Do not replace user-managed files or symlinks.
  for (const candidate of [...searchPath.split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'temporal')), destination]) {
    try { fs.accessSync(candidate, fs.constants.X_OK); return { status: 'reused', path: candidate }; } catch {}
  }
  let destinationExists = false;
  try { fs.lstatSync(destination); destinationExists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (destinationExists) {
    throw new Error('The Temporal CLI destination exists and is not executable; preserve it for its owner.');
  }
  const artifact = cohort.cli?.linux_amd64_artifact;
  if (!/^\d+\.\d+\.\d+$/.test(cohort.cli?.version)
    || cohort.cli?.release_tag !== `v${cohort.cli.version}`
    || artifact?.file_name !== `temporal_cli_${cohort.cli.version}_linux_amd64.tar.gz`
    || !/^[0-9a-f]{64}$/.test(artifact.sha256)) throw new Error('Invalid Linux Temporal CLI cohort');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.temporal-install-'));
  try {
    const archive = path.join(staging, 'download.tar.gz');
    const url = `https://github.com/temporalio/cli/releases/download/${cohort.cli.release_tag}/${artifact.file_name}`;
    run('curl', ['-q', '--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '180', '--silent', '--show-error', '--output', archive, url], { timeout: 190000, stdio: 'pipe' });
    const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (digest !== artifact.sha256) throw new Error('Temporal CLI archive digest mismatch');
    run('tar', ['-xzf', archive, '-C', staging, 'temporal'], { timeout: 30000, stdio: 'pipe' });
    const executable = path.join(staging, 'temporal');
    if (!fs.lstatSync(executable).isFile()) throw new Error('Temporal CLI archive entry is not a regular file');
    fs.chmodSync(executable, 0o755);
    const version = String(run(executable, ['--version'], { timeout: 10000, encoding: 'utf8' }));
    if (!version.includes(` ${cohort.cli.version} `) && !version.includes(` ${cohort.cli.version}\n`)) throw new Error('Temporal CLI version mismatch');
    // link() is atomic and refuses a destination created concurrently.
    fs.linkSync(executable, destination);
    return { status: 'installed', path: destination, version: cohort.cli.version, archive_sha256: digest };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(installTemporalCli()));
}
