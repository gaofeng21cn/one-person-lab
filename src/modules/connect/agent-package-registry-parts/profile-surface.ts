import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { nowIso, safePathSegment } from './shared.ts';
import type {
  AgentPackageLock,
  AgentPackageManifest,
  AgentPackageProfileMigration,
} from './types.ts';

function sha256File(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveInside(root: string, relativePath: string, field: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} escapes its declared root.`, {
      field,
      relative_path: relativePath,
      root: resolvedRoot,
      failure_code: 'agent_package_profile_path_invalid',
    });
  }
  return resolved;
}

function requireProfileSource(root: string, relativePath: string, field: string) {
  const sourcePath = resolveInside(root, relativePath, field);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package profile source file is missing.', {
      field,
      source_path: sourcePath,
      failure_code: 'agent_package_profile_source_missing',
    });
  }
  return sourcePath;
}

function writeJson(filePath: string, payload: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeFileAtomic(targetPath: string, content: Buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.opl-tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, targetPath);
}

function profileStateRoot(codexHome: string, packageId: string) {
  return path.join(codexHome, 'state', safePathSegment(packageId));
}

function profileTargetPath(codexHome: string, targetId: 'user_agents_profile' | 'user_taste_source') {
  return path.join(codexHome, targetId === 'user_agents_profile' ? 'AGENTS.md' : 'TASTE.md');
}

function profileReceiptPath(codexHome: string, packageId: string) {
  return path.join(profileStateRoot(codexHome, packageId), 'profile-install-receipt.json');
}

function readProfileReceipt(receiptPath: string) {
  if (!fs.existsSync(receiptPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
    return isRecord(payload) && payload.surface_kind === 'opl_package_profile_install_receipt'
      ? payload
      : null;
  } catch {
    return null;
  }
}

function recordProfileReceipt(input: {
  packageId: string;
  packageVersion: string;
  sourcePath: string;
  targetPath: string;
  status: AgentPackageProfileMigration['status'];
  receiptPath: string;
}) {
  const sourceSha256 = sha256File(input.sourcePath);
  const targetSha256 = sha256File(input.targetPath);
  writeJson(input.receiptPath, {
    surface_kind: 'opl_package_profile_install_receipt',
    recorded_at: nowIso(),
    package_id: input.packageId,
    package_version: input.packageVersion,
    status: input.status,
    source_path: input.sourcePath,
    target_path: input.targetPath,
    source_sha256: sourceSha256,
    target_sha256: targetSha256,
  });
  return { sourceSha256, targetSha256 };
}

function writeMergePacket(input: {
  packageId: string;
  packageVersion: string;
  sourceRoot: string;
  sourcePath: string;
  targetPath: string;
  contextPaths: string[];
  codexHome: string;
}) {
  const packetId = `${sha256File(input.targetPath).slice(0, 16)}-${sha256File(input.sourcePath).slice(0, 16)}`;
  const mergeRoot = path.join(profileStateRoot(input.codexHome, input.packageId), 'profile-merge');
  const packetRoot = path.join(mergeRoot, packetId);
  const existingPath = path.join(packetRoot, 'existing', path.basename(input.targetPath));
  const candidatePath = path.join(packetRoot, 'candidate', path.basename(input.targetPath));
  const mergedPath = path.join(packetRoot, 'merged', path.basename(input.targetPath));
  fs.rmSync(mergeRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(existingPath), { recursive: true });
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.mkdirSync(path.dirname(mergedPath), { recursive: true });
  fs.copyFileSync(input.targetPath, existingPath);
  fs.copyFileSync(input.sourcePath, candidatePath);

  const copiedContextPaths = input.contextPaths.map((relativePath) => {
    const source = requireProfileSource(input.sourceRoot, relativePath, 'profile_surface.merge_context_paths[]');
    const target = resolveInside(path.join(packetRoot, 'context'), relativePath, 'merge packet context path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return target;
  });
  const applyCommand = `opl packages profile apply ${input.packageId} --merged-file ${JSON.stringify(mergedPath)}`;
  fs.writeFileSync(
    path.join(packetRoot, 'MERGE.md'),
    [
      `Merge ${existingPath} with ${candidatePath}.`,
      'Preserve user-owned instructions and incorporate the candidate OPL package profile semantics.',
      `Write the reviewed result to ${mergedPath}, then run:`,
      applyCommand,
      '',
    ].join('\n'),
    'utf8',
  );
  writeJson(path.join(packetRoot, 'packet.json'), {
    surface_kind: 'opl_package_profile_merge_packet',
    created_at: nowIso(),
    package_id: input.packageId,
    package_version: input.packageVersion,
    existing_profile_path: existingPath,
    candidate_profile_path: candidatePath,
    merged_profile_path: mergedPath,
    context_paths: copiedContextPaths,
    target_path: input.targetPath,
    existing_sha256: sha256File(existingPath),
    candidate_sha256: sha256File(candidatePath),
    apply_command: applyCommand,
  });
  return { packetRoot, applyCommand };
}

export function noPackageProfileMigration(note: string): AgentPackageProfileMigration {
  return {
    surface_kind: 'opl_package_profile_migration',
    status: 'not_requested',
    source_path: null,
    target_path: null,
    source_sha256: null,
    target_sha256: null,
    receipt_path: null,
    merge_packet_path: null,
    apply_command: null,
    authoring_source_paths: [],
    installed_authoring_source_paths: [],
    writes_performed: false,
    note,
  };
}

export function materializePackageProfile(input: {
  manifest: AgentPackageManifest;
  sourceRoot: string;
  codexHome: string;
  dryRun: boolean;
}): AgentPackageProfileMigration {
  const config = input.manifest.profile_surface;
  if (!config) return noPackageProfileMigration('Package manifest does not request a user profile surface.');

  const sourcePath = requireProfileSource(
    input.sourceRoot,
    config.runtime_profile.source_path,
    'profile_surface.runtime_profile.source_path',
  );
  const targetPath = profileTargetPath(input.codexHome, config.runtime_profile.target_id);
  const sourceSha256 = sha256File(sourcePath);
  const receiptPath = profileReceiptPath(input.codexHome, input.manifest.package_id);
  const previousReceipt = readProfileReceipt(receiptPath);
  const targetExists = fs.existsSync(targetPath);
  const targetSha256 = targetExists ? sha256File(targetPath) : null;
  const authoringSourcePaths: string[] = [];
  const installedAuthoringSourcePaths: string[] = [];

  for (const authoringSource of config.authoring_sources) {
    const source = requireProfileSource(input.sourceRoot, authoringSource.source_path, 'profile_surface.authoring_sources[].source_path');
    const target = profileTargetPath(input.codexHome, authoringSource.target_id);
    authoringSourcePaths.push(target);
    if (!fs.existsSync(target)) {
      installedAuthoringSourcePaths.push(target);
      if (!input.dryRun) writeFileAtomic(target, fs.readFileSync(source));
    }
  }

  let status: AgentPackageProfileMigration['status'];
  let writesPerformed = installedAuthoringSourcePaths.length > 0 && !input.dryRun;
  let mergePacketPath: string | null = null;
  let applyCommand: string | null = null;
  let note: string;

  if (!targetExists) {
    status = input.dryRun ? 'validated_no_write' : 'installed';
    note = input.dryRun ? 'Runtime profile can be installed without overwriting user content.' : 'Runtime profile installed on a previously empty target.';
    if (!input.dryRun) {
      writeFileAtomic(targetPath, fs.readFileSync(sourcePath));
      recordProfileReceipt({
        packageId: input.manifest.package_id,
        packageVersion: input.manifest.version,
        sourcePath,
        targetPath,
        status,
        receiptPath,
      });
      writesPerformed = true;
    }
  } else if (targetSha256 === sourceSha256) {
    status = input.dryRun ? 'validated_no_write' : 'current';
    note = 'Runtime profile already matches the package candidate.';
    if (!input.dryRun) {
      recordProfileReceipt({
        packageId: input.manifest.package_id,
        packageVersion: input.manifest.version,
        sourcePath,
        targetPath,
        status,
        receiptPath,
      });
    }
  } else if (
    previousReceipt
    && previousReceipt.source_sha256 === previousReceipt.target_sha256
    && previousReceipt.target_sha256 === targetSha256
  ) {
    status = input.dryRun ? 'validated_no_write' : 'updated';
    note = input.dryRun ? 'A previously package-owned runtime profile can be updated without overwriting local edits.' : 'Previously package-owned runtime profile updated.';
    if (!input.dryRun) {
      writeFileAtomic(targetPath, fs.readFileSync(sourcePath));
      recordProfileReceipt({
        packageId: input.manifest.package_id,
        packageVersion: input.manifest.version,
        sourcePath,
        targetPath,
        status,
        receiptPath,
      });
      writesPerformed = true;
    }
  } else {
    status = 'semantic_merge_required';
    note = 'Existing user profile was preserved; semantic merge and explicit package apply are required.';
    if (!input.dryRun) {
      const packet = writeMergePacket({
        packageId: input.manifest.package_id,
        packageVersion: input.manifest.version,
        sourceRoot: input.sourceRoot,
        sourcePath,
        targetPath,
        contextPaths: config.merge_context_paths,
        codexHome: input.codexHome,
      });
      mergePacketPath = packet.packetRoot;
      applyCommand = packet.applyCommand;
      writesPerformed = true;
    }
  }

  return {
    surface_kind: 'opl_package_profile_migration',
    status,
    source_path: sourcePath,
    target_path: targetPath,
    source_sha256: sourceSha256,
    target_sha256: fs.existsSync(targetPath) ? sha256File(targetPath) : null,
    receipt_path: fs.existsSync(receiptPath) ? receiptPath : null,
    merge_packet_path: mergePacketPath,
    apply_command: applyCommand,
    authoring_source_paths: authoringSourcePaths,
    installed_authoring_source_paths: installedAuthoringSourcePaths,
    writes_performed: writesPerformed,
    note,
  };
}

export function applyPackageProfile(input: {
  lock: AgentPackageLock;
  mergedFile: string;
  dryRun: boolean;
}): AgentPackageProfileMigration {
  const current = input.lock.physical_surface?.profile_migration;
  if (!current?.source_path || !current.target_path) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package does not declare an installed runtime profile.', {
      package_id: input.lock.package_id,
      failure_code: 'agent_package_profile_not_requested',
    });
  }
  if (current.status !== 'semantic_merge_required' || !current.merge_packet_path) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package profile apply requires a pending semantic merge packet.', {
      package_id: input.lock.package_id,
      profile_status: current.status,
      failure_code: 'agent_package_profile_merge_not_pending',
    });
  }
  const codexHome = input.lock.physical_surface?.codex_home;
  if (!codexHome) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package profile apply requires the installed Codex home.', {
      package_id: input.lock.package_id,
      failure_code: 'agent_package_profile_state_missing',
    });
  }
  const targetPath = path.resolve(current.target_path);
  const resolvedCodexHome = path.resolve(codexHome);
  if (!targetPath.startsWith(`${resolvedCodexHome}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Installed package profile target escapes the Codex home.', {
      package_id: input.lock.package_id,
      target_path: targetPath,
      codex_home: resolvedCodexHome,
      failure_code: 'agent_package_profile_path_invalid',
    });
  }
  const mergedFile = path.resolve(input.mergedFile);
  if (!fs.existsSync(mergedFile) || !fs.statSync(mergedFile).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Merged package profile file does not exist.', {
      package_id: input.lock.package_id,
      merged_file: mergedFile,
      failure_code: 'agent_package_merged_profile_missing',
    });
  }
  const mergedContent = fs.readFileSync(mergedFile);
  if (mergedContent.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Merged package profile file must not be empty.', {
      package_id: input.lock.package_id,
      merged_file: mergedFile,
      failure_code: 'agent_package_merged_profile_empty',
    });
  }
  const resolvedPacketRoot = path.resolve(current.merge_packet_path);
  if (!mergedFile.startsWith(`${resolvedPacketRoot}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Merged profile file must come from the pending package merge packet.', {
      package_id: input.lock.package_id,
      merged_file: mergedFile,
      merge_packet_path: resolvedPacketRoot,
      failure_code: 'agent_package_merged_profile_outside_packet',
    });
  }
  const actualReceiptPath = current.receipt_path ?? profileReceiptPath(codexHome, input.lock.package_id);
  let backupPath: string | null = null;
  if (!input.dryRun) {
    if (fs.existsSync(targetPath)) {
      const backupRoot = path.join(path.dirname(actualReceiptPath), 'profile-backups');
      fs.rmSync(backupRoot, { recursive: true, force: true });
      backupPath = path.join(backupRoot, `${nowIso().replace(/[:.]/g, '-')}-${path.basename(targetPath)}`);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(targetPath, backupPath);
    }
    writeFileAtomic(targetPath, mergedContent);
    recordProfileReceipt({
      packageId: input.lock.package_id,
      packageVersion: input.lock.package_version,
      sourcePath: current.source_path,
      targetPath,
      status: 'semantic_merge_applied',
      receiptPath: actualReceiptPath,
    });
    fs.rmSync(current.merge_packet_path, { recursive: true, force: true });
  }
  return {
    ...current,
    status: input.dryRun ? 'validated_no_write' : 'semantic_merge_applied',
    target_sha256: input.dryRun
      ? crypto.createHash('sha256').update(mergedContent).digest('hex')
      : sha256File(targetPath),
    receipt_path: input.dryRun ? current.receipt_path : actualReceiptPath,
    merge_packet_path: input.dryRun ? current.merge_packet_path : null,
    apply_command: null,
    writes_performed: !input.dryRun,
    note: backupPath
      ? `Reviewed semantic merge applied; previous profile backed up at ${backupPath}.`
      : input.dryRun
        ? 'Reviewed semantic merge validates without writing.'
        : 'Reviewed semantic merge applied.',
  };
}

export function retainedPackageProfile(previous: AgentPackageProfileMigration | undefined) {
  if (!previous || previous.status === 'not_requested') return noPackageProfileMigration('Package did not own a user profile surface.');
  return {
    ...previous,
    status: 'retained_on_uninstall' as const,
    writes_performed: false,
    apply_command: null,
    note: 'User profile and profile history were retained during package uninstall.',
  };
}
