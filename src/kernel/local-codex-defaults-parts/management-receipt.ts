import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../contract-validation.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';

export type CodexConfigSelectionMode = 'auto' | 'local_override' | 'inactive_provider';

export type CodexConfigManagementReceipt = {
  surface_kind: 'opl_codex_config_management_receipt.v1';
  config_path: string;
  provider_id: string;
  selection_mode: CodexConfigSelectionMode;
  provider_route: 'direct_gateway' | 'opl_custom_route' | 'inactive_provider';
  owned_keys: string[];
  last_applied_values: {
    model_provider: string | null;
    model: string | null;
    model_reasoning_effort: string | null;
    provider_base_url: string;
  };
  backup_path: string | null;
  updated_at: string;
};

function receiptPath() {
  return path.join(ensureOplStateDir(resolveOplStatePaths()).state_dir, 'codex-config-management-receipt.json');
}

export function readCodexConfigManagementReceipt(): CodexConfigManagementReceipt | null {
  const filePath = receiptPath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CodexConfigManagementReceipt;
    if (
      value.surface_kind !== 'opl_codex_config_management_receipt.v1'
      || typeof value.config_path !== 'string'
      || typeof value.provider_id !== 'string'
      || !['auto', 'local_override', 'inactive_provider'].includes(value.selection_mode)
      || !value.last_applied_values
    ) {
      throw new Error('receipt shape is invalid');
    }
    return value;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL Codex config management receipt is invalid; refusing to overwrite local Codex preferences.',
      {
        receipt_path: filePath,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export function backupCodexConfig(configPath: string, timestamp = new Date()) {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return null;
  const suffix = timestamp.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.opl-backup-${suffix}`;
  fs.copyFileSync(configPath, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

export function writeCodexConfigAtomically(configPath: string, contents: string) {
  const tempPath = `${configPath}.opl-write-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, contents, { mode: 0o600 });
    fs.renameSync(tempPath, configPath);
    fs.chmodSync(configPath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function writeCodexConfigManagementReceipt(receipt: CodexConfigManagementReceipt) {
  const filePath = receiptPath();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return filePath;
}
