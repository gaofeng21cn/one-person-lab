import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { resolveContainedRepoPath } from '../../kernel/repo-contained-json-file.ts';
import { FileFoundryContentStore } from '../../authority/evidence/index.ts';

function fail(message: string): never {
  throw new FrameworkContractError('contract_shape_invalid', message);
}

function materialDigest(ref: string) {
  const match = /^source-material:sha256:([a-f0-9]{64})$/.exec(ref);
  if (!match && ref.startsWith('source-material:')) fail('Foundry source material ref is invalid.');
  return match?.[1] ?? null;
}

function readWorkspaceFile(root: string, ref: string) {
  const { real_path: file } = resolveContainedRepoPath(root, ref, 'Foundry source material', 'workspace');
  const declared = path.resolve(root, ref);
  if (!fs.lstatSync(declared).isFile() || fs.lstatSync(declared).isSymbolicLink()) {
    fail('Foundry source material must be a regular physical file.');
  }
  if (fs.statSync(file).size > 16 * 1024 * 1024) fail('Foundry source material exceeds the content limit.');
  return fs.readFileSync(file);
}

export function admitFoundrySourceMaterials(input: {
  workspaceRoot: string;
  sourceRefs: string[];
  storageRoot?: string;
}) {
  for (const ref of input.sourceRefs) {
    const digest = materialDigest(ref);
    if (!digest) continue;
    const receipt = JSON.parse(readWorkspaceFile(
      input.workspaceRoot, `control/opl/source_materials/${digest}.json`,
    ).toString('utf8'));
    if (!isRecord(receipt)
      || receipt.surface_kind !== 'opl_workspace_source_material_receipt'
      || receipt.version !== 'workspace-source-material.v3'
      || receipt.source_material_ref !== ref
      || receipt.source_fingerprint_ref !== `sha256:${digest}`
      || !isRecord(receipt.stored_file) || receipt.stored_file.copied !== true
      || typeof receipt.stored_file.ref !== 'string'
      || !isRecord(receipt.original_file) || receipt.original_file.sha256 !== digest
      || !Number.isSafeInteger(receipt.original_file.bytes)) {
      fail('Foundry source material requires a matching applied workspace intake receipt.');
    }
    const bytes = readWorkspaceFile(input.workspaceRoot, receipt.stored_file.ref);
    if (bytes.byteLength !== receipt.original_file.bytes) fail('Foundry source material receipt size mismatch.');
    new FileFoundryContentStore(input.storageRoot).put(bytes, `opl-content://sha256/${digest}`);
  }
}

export function materializeFoundrySourceArtifacts(input: {
  sourceRefs: string[];
  storageRoot: string;
}) {
  const artifacts: Array<{ source_ref: string; ref: string; sha256: string }> = [];
  for (const sourceRef of input.sourceRefs) {
    const digest = materialDigest(sourceRef)
      ?? /^opl-content:\/\/sha256\/([a-f0-9]{64})$/.exec(sourceRef)?.[1];
    if (!digest) continue;
    const bytes = new FileFoundryContentStore(input.storageRoot).readExact(`opl-content://sha256/${digest}`);
    const directory = path.join(input.storageRoot, 'provider-inputs');
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) {
      fail('Foundry source artifact directory must be physical.');
    }
    const file = path.join(directory, `${digest}.blob`);
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()
      || !fs.realpathSync.native(file).startsWith(`${fs.realpathSync.native(input.storageRoot)}${path.sep}`)
      || !fs.readFileSync(file).equals(bytes)) {
      fail('Foundry source artifact content address is occupied by invalid bytes.');
    }
    artifacts.push({ source_ref: sourceRef, ref: pathToFileURL(file).href, sha256: digest });
  }
  return artifacts;
}
