import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { isRecord } from '../../../kernel/contract-validation.ts';

/** Observed independent installations; never a Codex plugin lifecycle claim. */
export type PackageInstallationReadback = {
  installation_id: string;
  kind: 'owner_managed' | 'uv_tool';
  version: string;
  mode: 'installed' | 'development';
  manager: 'package_owner' | 'uv';
  management_scope: 'owner_only';
  location_ref: string;
  evidence_ref: string;
  entrypoint_verified: true;
  source_revision?: string;
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function read(file: string) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 262_144) throw new Error('Unsupported installation evidence');
  return fs.readFileSync(file, 'utf8');
}

function json(file: string) {
  const value: unknown = JSON.parse(read(file));
  return isRecord(value) ? value : {};
}

function toml(file: string) {
  const value: unknown = parseToml(read(file));
  return isRecord(value) ? value : {};
}

function samePath(left: string, right: string) {
  return fs.realpathSync(left) === fs.realpathSync(right);
}

function nested(candidate: string, root: string) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function ownerManaged(packageId: string, dataRoot: string, home: string): PackageInstallationReadback | null {
  const root = path.join(dataRoot, packageId, 'app');
  const receipt = json(path.join(root, 'install.json'));
  const version = text(receipt.version);
  const current = path.join(root, 'current');
  if (receipt.product !== packageId || receipt.root !== root || !version
    || typeof receipt.current !== 'string' || !samePath(receipt.current, current)
    || !nested(current, path.join(root, 'releases'))) return null;
  const manifest = json(path.join(current, 'package.json'));
  if (manifest.name !== packageId || manifest.version !== version || !isRecord(manifest.bin)) return null;
  const wrappers = Array.isArray(receipt.wrappers) ? receipt.wrappers.filter(isRecord) : [];
  const binRoot = path.join(home, '.local', 'bin');
  if (receipt.bin !== binRoot) return null;
  const verified = Object.entries(manifest.bin).some(([name, entry]) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || typeof entry !== 'string') return false;
    const target = path.join(binRoot, name);
    const wrapper = wrappers.find(row => row.path === target && typeof row.sha256 === 'string');
    if (!wrapper || !/^[a-f0-9]{64}$/.test(String(wrapper.sha256))) return false;
    try {
      const executable = path.resolve(current, entry);
      if (!nested(executable, current) || !fs.statSync(executable).isFile()) return false;
      fs.accessSync(target, fs.constants.X_OK);
      return crypto.createHash('sha256').update(read(target)).digest('hex') === wrapper.sha256;
    } catch { return false; }
  });
  if (!verified) return null;
  return {
    installation_id: `owner-managed:${packageId}`,
    kind: 'owner_managed', version, mode: 'installed', manager: 'package_owner',
    management_scope: 'owner_only', location_ref: `local-data:${packageId}/app/current`,
    evidence_ref: `local-data:${packageId}/app/install.json`, entrypoint_verified: true,
    ...(typeof receipt.sourceRevision === 'string' && /^[a-f0-9]{40}$/.test(receipt.sourceRevision)
      ? { source_revision: receipt.sourceRevision } : {}),
  };
}

function normalizedPythonName(value: string) {
  return value.toLowerCase().replace(/[-_.]+/g, '-');
}

function uvTool(packageId: string, toolsRoot: string): PackageInstallationReadback | null {
  const root = path.join(toolsRoot, normalizedPythonName(packageId));
  const receipt = toml(path.join(root, 'uv-receipt.toml'));
  const tool = isRecord(receipt.tool) ? receipt.tool : {};
  const requirements = Array.isArray(tool.requirements) ? tool.requirements.filter(isRecord) : [];
  const requirement = requirements.find(row => typeof row.name === 'string'
    && normalizedPythonName(row.name) === normalizedPythonName(packageId));
  if (!requirement) return null;
  const entries = Array.isArray(tool.entrypoints) ? tool.entrypoints.filter(isRecord) : [];
  const linked = entries.some(row => {
    const name = text(row.name);
    const target = text(row['install-path']);
    if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || !target
      || typeof row.from !== 'string' || normalizedPythonName(row.from) !== normalizedPythonName(packageId)) return false;
    try {
      const executable = path.join(root, 'bin', name);
      fs.accessSync(target, fs.constants.X_OK);
      return samePath(target, executable) && nested(executable, root);
    } catch { return false; }
  });
  if (!linked) return null;
  const libraries = fs.readdirSync(path.join(root, 'lib'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^python\d+\.\d+$/.test(entry.name));
  for (const library of libraries) {
    const site = path.join(root, 'lib', library.name, 'site-packages');
    const distributions = fs.readdirSync(site, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.endsWith('.dist-info')
        && normalizedPythonName(entry.name).startsWith(`${normalizedPythonName(packageId)}-`));
    for (const distribution of distributions) {
      const dist = path.join(site, distribution.name);
      const metadata = read(path.join(dist, 'METADATA'));
      const name = /^Name:\s*(.+)$/m.exec(metadata)?.[1]?.trim();
      const version = /^Version:\s*(.+)$/m.exec(metadata)?.[1]?.trim();
      if (!name || normalizedPythonName(name) !== normalizedPythonName(packageId) || !version) continue;
      const originPath = path.join(dist, 'direct_url.json');
      const origin = fs.existsSync(originPath) ? json(originPath) : {};
      const editable = isRecord(origin.dir_info) && origin.dir_info.editable === true;
      if (Boolean(text(requirement.editable)) !== editable) continue;
      if (editable) {
        if (typeof origin.url !== 'string' || !origin.url.startsWith('file:') || typeof requirement.editable !== 'string') continue;
        const project = fileURLToPath(origin.url);
        if (!fs.statSync(project).isDirectory() || !samePath(project, requirement.editable)) continue;
        const projectManifest = toml(path.join(project, 'pyproject.toml'));
        const projectMetadata = isRecord(projectManifest.project) ? projectManifest.project : {};
        if (typeof projectMetadata.name !== 'string'
          || normalizedPythonName(projectMetadata.name) !== normalizedPythonName(packageId)) continue;
      }
      return {
        installation_id: `uv-tool:${packageId}`, kind: 'uv_tool', version,
        mode: editable ? 'development' : 'installed', manager: 'uv', management_scope: 'owner_only',
        location_ref: `uv-tool:${packageId}`, evidence_ref: `uv-tool:${packageId}/uv-receipt.toml`,
        entrypoint_verified: true,
      };
    }
  }
  return null;
}

/** Bounded reads of existing installer receipts. No commands, discovery scan, or new registry. */
export function readPackageInstallationReadback(
  packageId: string, env: NodeJS.ProcessEnv = process.env,
): PackageInstallationReadback[] {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(packageId) || packageId.includes('..')) return [];
  const home = env.HOME?.trim() || os.homedir();
  const dataRoot = env.XDG_DATA_HOME?.trim() || path.join(home, '.local', 'share');
  const toolsRoot = env.UV_TOOL_DIR?.trim() || path.join(dataRoot, 'uv', 'tools');
  const results: PackageInstallationReadback[] = [];
  for (const probe of [() => ownerManaged(packageId, dataRoot, home), () => uvTool(packageId, toolsRoot)]) {
    try { const result = probe(); if (result) results.push(result); } catch { /* Absent or inconsistent owner evidence is not an installation. */ }
  }
  return results;
}
