import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

const MAX_USER_INSTRUCTIONS_BYTES = 256 * 1024;

function resolveCodexHome() {
  return process.env.CODEX_HOME?.trim() || path.join(process.env.HOME?.trim() || os.homedir(), '.codex');
}

function resolveUserInstructionsPath() {
  return path.join(resolveCodexHome(), 'AGENTS.md');
}

function sha256(content: Buffer | string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
}

function normalizedContent(content: string) {
  if (content.includes('\0')) {
    throw new FrameworkContractError('contract_shape_invalid', 'User AGENTS.md content must not contain null bytes.');
  }
  const normalized = content.replaceAll('\r\n', '\n');
  const bytes = Buffer.byteLength(normalized, 'utf8');
  if (bytes > MAX_USER_INSTRUCTIONS_BYTES) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `User AGENTS.md content exceeds the ${MAX_USER_INSTRUCTIONS_BYTES} byte App editing limit.`,
      { bytes, max_bytes: MAX_USER_INSTRUCTIONS_BYTES },
    );
  }
  return normalized.length === 0 || normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function readCodexUserInstructions() {
  const targetPath = resolveUserInstructionsPath();
  if (!fs.existsSync(targetPath)) {
    return {
      surface_kind: 'opl_codex_user_instructions.v1',
      status: 'missing',
      path: targetPath,
      exists: false,
      content: '',
      sha256: null,
      size_bytes: 0,
      max_editable_bytes: MAX_USER_INSTRUCTIONS_BYTES,
      source: 'codex_home_agents_md',
    };
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex user instructions path is not a regular file.', {
      path: targetPath,
    });
  }
  if (stat.size > MAX_USER_INSTRUCTIONS_BYTES) {
    return {
      surface_kind: 'opl_codex_user_instructions.v1',
      status: 'too_large',
      path: targetPath,
      exists: true,
      content: null,
      sha256: null,
      size_bytes: stat.size,
      max_editable_bytes: MAX_USER_INSTRUCTIONS_BYTES,
      source: 'codex_home_agents_md',
    };
  }

  const bytes = fs.readFileSync(targetPath);
  return {
    surface_kind: 'opl_codex_user_instructions.v1',
    status: 'available',
    path: targetPath,
    exists: true,
    content: bytes.toString('utf8'),
    sha256: sha256(bytes),
    size_bytes: bytes.byteLength,
    max_editable_bytes: MAX_USER_INSTRUCTIONS_BYTES,
    source: 'codex_home_agents_md',
  };
}

export function writeCodexUserInstructions(input: {
  content: string;
  expectedSha256: string | null;
  dryRun?: boolean;
}) {
  const content = normalizedContent(input.content);
  const current = readCodexUserInstructions();
  if (current.status === 'too_large') {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex user instructions exceed the App editing limit.', {
      path: current.path,
      size_bytes: current.size_bytes,
      max_editable_bytes: current.max_editable_bytes,
    });
  }
  if (current.sha256 !== input.expectedSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Codex user instructions changed after they were loaded. Reload before saving.',
      {
        path: current.path,
        expected_sha256: input.expectedSha256,
        actual_sha256: current.sha256,
      },
    );
  }

  const nextSha256 = sha256(content);
  if (input.dryRun) {
    return {
      codex_user_instructions_write: {
        surface_kind: 'opl_codex_user_instructions_write.v1',
        status: 'dry_run',
        path: current.path,
        previous_sha256: current.sha256,
        next_sha256: nextSha256,
        size_bytes: Buffer.byteLength(content, 'utf8'),
      },
    };
  }

  const targetPath = current.path;
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  let backupPath: string | null = null;
  if (current.exists) {
    const backupDir = path.join(
      resolveOplStatePaths().state_dir,
      'codex-personalization',
      'backups',
      timestamp(),
    );
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    backupPath = path.join(backupDir, 'AGENTS.md');
    fs.copyFileSync(targetPath, backupPath);
  }

  const temporaryPath = path.join(targetDir, `.AGENTS.md.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, targetPath);
    fs.chmodSync(targetPath, 0o600);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }

  return {
    codex_user_instructions_write: {
      surface_kind: 'opl_codex_user_instructions_write.v1',
      status: 'saved',
      path: targetPath,
      previous_sha256: current.sha256,
      next_sha256: nextSha256,
      backup_path: backupPath,
      readback: readCodexUserInstructions(),
    },
  };
}
