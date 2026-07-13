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

function sha256Content(content: Buffer | string) {
  return crypto.createHash('sha256').update(content).digest('hex');
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
  try {
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
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

function profileBackupRoot(codexHome: string, packageId: string) {
  return path.join(profileStateRoot(codexHome, packageId), 'profile-backups');
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

type ProfileMutationAction = AgentPackageProfileMigration['mutation_actions'][number];

function writeProfileMutation(input: {
  targetPath: string;
  content: Buffer;
  surfaceKind: ProfileMutationAction['surface_kind'];
  backupRoot: string;
}): ProfileMutationAction {
  const targetExists = fs.existsSync(input.targetPath);
  const backupRef = targetExists
    ? path.join(
        input.backupRoot,
        `${input.surfaceKind}-${crypto.randomUUID()}-${path.basename(input.targetPath)}`,
      )
    : null;
  const backupSha256 = targetExists ? sha256File(input.targetPath) : null;
  if (backupRef) {
    fs.mkdirSync(path.dirname(backupRef), { recursive: true });
    fs.copyFileSync(input.targetPath, backupRef);
  }
  try {
    writeFileAtomic(input.targetPath, input.content);
  } catch (error) {
    if (backupRef) fs.rmSync(backupRef, { force: true });
    throw error;
  }
  return {
    surface_kind: input.surfaceKind,
    operation: targetExists ? 'overwritten' : 'created',
    target_path: input.targetPath,
    backup_ref: backupRef,
    backup_sha256: backupSha256,
    written_sha256: sha256Content(input.content),
  };
}

function rollbackRecordedProfileMutations(actions: ProfileMutationAction[]) {
  for (const action of [...actions].reverse()) {
    if (action.operation === 'created') {
      fs.rmSync(action.target_path, { force: true });
      continue;
    }
    if (action.backup_ref && fs.existsSync(action.backup_ref)) {
      writeFileAtomic(action.target_path, fs.readFileSync(action.backup_ref));
      fs.rmSync(action.backup_ref, { force: true });
    }
  }
}

function recordProfileReceipt(input: {
  packageId: string;
  packageVersion: string;
  sourcePath: string;
  targetPath: string;
  status: AgentPackageProfileMigration['status'];
  receiptPath: string;
  backupRoot: string;
}) {
  const sourceSha256 = sha256File(input.sourcePath);
  const targetSha256 = sha256File(input.targetPath);
  const payload = {
    surface_kind: 'opl_package_profile_install_receipt',
    recorded_at: nowIso(),
    package_id: input.packageId,
    package_version: input.packageVersion,
    status: input.status,
    source_path: input.sourcePath,
    target_path: input.targetPath,
    source_sha256: sourceSha256,
    target_sha256: targetSha256,
  };
  const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    sourceSha256,
    targetSha256,
    mutation: writeProfileMutation({
      targetPath: input.receiptPath,
      content,
      surfaceKind: 'profile_receipt',
      backupRoot: input.backupRoot,
    }),
  };
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
    mutation_actions: [],
    rollback_backups_retained: false,
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
  const backupRoot = profileBackupRoot(input.codexHome, input.manifest.package_id);
  const previousReceipt = readProfileReceipt(receiptPath);
  const targetExists = fs.existsSync(targetPath);
  const targetSha256 = targetExists ? sha256File(targetPath) : null;
  const authoringSourcePaths: string[] = [];
  const mutationActions: ProfileMutationAction[] = [];

  try {
    for (const authoringSource of config.authoring_sources) {
      const source = requireProfileSource(input.sourceRoot, authoringSource.source_path, 'profile_surface.authoring_sources[].source_path');
      const target = profileTargetPath(input.codexHome, authoringSource.target_id);
      authoringSourcePaths.push(target);
      if (!fs.existsSync(target)) {
        if (!input.dryRun) {
          mutationActions.push(writeProfileMutation({
            targetPath: target,
            content: fs.readFileSync(source),
            surfaceKind: 'authoring_source',
            backupRoot,
          }));
        }
      }
    }

    let status: AgentPackageProfileMigration['status'];
    let writesPerformed = mutationActions.length > 0;
    let mergePacketPath: string | null = null;
    let applyCommand: string | null = null;
    let note: string;

    if (!targetExists) {
      status = input.dryRun ? 'validated_no_write' : 'installed';
      note = input.dryRun ? 'Runtime profile can be installed without overwriting user content.' : 'Runtime profile installed on a previously empty target.';
      if (!input.dryRun) {
        mutationActions.push(writeProfileMutation({
          targetPath,
          content: fs.readFileSync(sourcePath),
          surfaceKind: 'runtime_profile',
          backupRoot,
        }));
        const receipt = recordProfileReceipt({
          packageId: input.manifest.package_id,
          packageVersion: input.manifest.version,
          sourcePath,
          targetPath,
          status,
          receiptPath,
          backupRoot,
        });
        mutationActions.push(receipt.mutation);
        writesPerformed = true;
      }
    } else if (targetSha256 === sourceSha256) {
      status = input.dryRun ? 'validated_no_write' : 'current';
      note = 'Runtime profile already matches the package candidate.';
      if (!input.dryRun) {
        const receipt = recordProfileReceipt({
          packageId: input.manifest.package_id,
          packageVersion: input.manifest.version,
          sourcePath,
          targetPath,
          status,
          receiptPath,
          backupRoot,
        });
        mutationActions.push(receipt.mutation);
        writesPerformed = true;
      }
    } else if (
      previousReceipt
      && previousReceipt.source_sha256 === previousReceipt.target_sha256
      && previousReceipt.target_sha256 === targetSha256
    ) {
      status = input.dryRun ? 'validated_no_write' : 'updated';
      note = input.dryRun ? 'A previously package-owned runtime profile can be updated without overwriting local edits.' : 'Previously package-owned runtime profile updated.';
      if (!input.dryRun) {
        mutationActions.push(writeProfileMutation({
          targetPath,
          content: fs.readFileSync(sourcePath),
          surfaceKind: 'runtime_profile',
          backupRoot,
        }));
        const receipt = recordProfileReceipt({
          packageId: input.manifest.package_id,
          packageVersion: input.manifest.version,
          sourcePath,
          targetPath,
          status,
          receiptPath,
          backupRoot,
        });
        mutationActions.push(receipt.mutation);
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
      mutation_actions: mutationActions,
      rollback_backups_retained: false,
      writes_performed: writesPerformed,
      note,
    };
  } catch (error) {
    if (!input.dryRun) {
      rollbackRecordedProfileMutations(mutationActions);
      fs.rmSync(path.join(profileStateRoot(input.codexHome, input.manifest.package_id), 'profile-merge'), {
        recursive: true,
        force: true,
      });
    }
    throw error;
  }
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
  const backupRoot = profileBackupRoot(codexHome, input.lock.package_id);
  const mutationActions = [...current.mutation_actions];
  if (!input.dryRun) {
    mutationActions.push(writeProfileMutation({
      targetPath,
      content: mergedContent,
      surfaceKind: 'runtime_profile',
      backupRoot,
    }));
    const receipt = recordProfileReceipt({
      packageId: input.lock.package_id,
      packageVersion: input.lock.package_version,
      sourcePath: current.source_path,
      targetPath,
      status: 'semantic_merge_applied',
      receiptPath: actualReceiptPath,
      backupRoot,
    });
    mutationActions.push(receipt.mutation);
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
    mutation_actions: mutationActions,
    writes_performed: !input.dryRun,
    note: input.dryRun
      ? 'Reviewed semantic merge validates without writing.'
      : 'Reviewed semantic merge applied with a rollback-verified profile backup.',
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

function profileRollbackConflict(message: string, action: ProfileMutationAction, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    target_path: action.target_path,
    surface_kind: action.surface_kind,
    operation: action.operation,
    ...details,
    failure_code: 'agent_package_profile_rollback_conflict',
  });
}

function removeEmptyParents(startPath: string, stopPath: string) {
  let current = path.resolve(startPath);
  const stop = path.resolve(stopPath);
  while (current.startsWith(`${stop}${path.sep}`) && current !== stop) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory() || fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

export function assertPackageProfileRollbackReady(
  migration: AgentPackageProfileMigration | undefined,
) {
  if (!migration || migration.status === 'not_requested' || migration.status === 'rolled_back') {
    return;
  }

  const actions = [...migration.mutation_actions].reverse();
  const virtualTargetSha256 = new Map<string, string | null>();
  for (const action of actions) {
    if (!virtualTargetSha256.has(action.target_path)) {
      virtualTargetSha256.set(
        action.target_path,
        fs.existsSync(action.target_path) && fs.statSync(action.target_path).isFile()
          ? sha256File(action.target_path)
          : null,
      );
    }
    const actualSha256 = virtualTargetSha256.get(action.target_path);
    if (actualSha256 !== action.written_sha256) {
      profileRollbackConflict('Package profile rollback target changed after the package write.', action, {
        expected_sha256: action.written_sha256,
        actual_sha256: actualSha256,
      });
    }
    if (action.operation === 'overwritten') {
      if (!action.backup_ref || !action.backup_sha256 || !fs.existsSync(action.backup_ref)) {
        profileRollbackConflict('Package profile rollback backup is missing.', action, {
          backup_ref: action.backup_ref,
        });
      }
      const actualBackupSha256 = sha256File(action.backup_ref);
      if (actualBackupSha256 !== action.backup_sha256) {
        profileRollbackConflict('Package profile rollback backup digest changed.', action, {
          backup_ref: action.backup_ref,
          expected_backup_sha256: action.backup_sha256,
          actual_backup_sha256: actualBackupSha256,
        });
      }
      virtualTargetSha256.set(action.target_path, action.backup_sha256);
    } else {
      virtualTargetSha256.set(action.target_path, null);
    }
  }
}

export function rollbackPackageProfileMigration(
  migration: AgentPackageProfileMigration | undefined,
  options: { retainBackups?: boolean } = {},
): AgentPackageProfileMigration {
  if (!migration || migration.status === 'not_requested' || migration.status === 'rolled_back') {
    return migration ?? noPackageProfileMigration('No package profile migration required rollback.');
  }
  assertPackageProfileRollbackReady(migration);
  const actions = [...migration.mutation_actions].reverse();

  for (const action of actions) {
    if (action.operation === 'created') {
      fs.rmSync(action.target_path, { force: true });
    } else {
      writeFileAtomic(action.target_path, fs.readFileSync(action.backup_ref!));
      if (!options.retainBackups) fs.rmSync(action.backup_ref!, { force: true });
    }
  }
  if (migration.merge_packet_path) fs.rmSync(migration.merge_packet_path, { recursive: true, force: true });
  const rolledBack = {
    ...migration,
    status: 'rolled_back' as const,
    receipt_path: null,
    merge_packet_path: null,
    apply_command: null,
    rollback_backups_retained: options.retainBackups === true,
    writes_performed: true,
    note: options.retainBackups
      ? 'Package profile changes were rolled back; backups remain retained until state commit.'
      : 'Package profile changes from the transaction were rolled back.',
  };
  return options.retainBackups ? rolledBack : finalizePackageProfileRollback(rolledBack);
}

export function finalizePackageProfileRollback(
  migration: AgentPackageProfileMigration | undefined,
): AgentPackageProfileMigration {
  if (!migration) return noPackageProfileMigration('No package profile rollback required finalization.');
  if (migration.status !== 'rolled_back') {
    throw new FrameworkContractError('contract_shape_invalid', 'Package profile rollback must complete before backup finalization.', {
      status: migration.status,
      failure_code: 'agent_package_profile_rollback_not_completed',
    });
  }
  for (const action of migration.mutation_actions) {
    if (action.backup_ref) {
      fs.rmSync(action.backup_ref, { force: true });
      const backupRoot = path.dirname(action.backup_ref);
      const stateRoot = path.dirname(backupRoot);
      removeEmptyParents(backupRoot, path.dirname(stateRoot));
    }
    removeEmptyParents(path.dirname(action.target_path), path.dirname(path.dirname(action.target_path)));
  }
  return {
    ...migration,
    rollback_backups_retained: false,
    note: 'Package profile rollback committed and retained backups were finalized.',
  };
}
