import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  parseTomlDocument,
  renderTomlDocument,
  type TomlTableBlock,
} from '../agent-package-registry-parts/managed-policy-surface.ts';
import { resolveCodexConfigPath } from '../agent-package-registry-parts/shared.ts';

type HygieneReason = 'stale_temporary_marketplace' | 'global_mas_scholar_discovery';

type HygieneDelta = {
  header: string;
  content_sha256: string;
  reason: HygieneReason;
  related_marketplace_id: string | null;
};

type HygieneReceipt = {
  surface_kind: 'opl_codex_config_hygiene_receipt.v1';
  receipt_ref: string;
  action: 'reconcile' | 'rollback';
  status: 'current' | 'validated_no_write' | 'completed' | 'rolled_back';
  recorded_at: string;
  config_path: string;
  before_sha256: string | null;
  after_sha256: string | null;
  backup_path: string | null;
  backup_sha256: string | null;
  delta_path: string | null;
  removed_tables: HygieneDelta[];
  restored_receipt_ref: string | null;
  writes_performed: boolean;
  workspace_local_mas_discovery_preserved: true;
  rollback_command: string | null;
};

export type CodexConfigHygieneRuntime = {
  configPath?: string;
  stateDir?: string;
  beforeConfigReplace?: () => void;
};

function sha256Bytes(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeFileAtomic(filePath: string, content: Buffer | string, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporaryPath, content, { mode });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function writeJson(filePath: string, payload: unknown) {
  writeFileAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function unescapeTomlString(value: string) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function tableStringValue(table: TomlTableBlock, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = table.content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"\\s*$`, 'm'));
  return match ? unescapeTomlString(match[1]) : null;
}

function marketplaceId(header: string) {
  return header.startsWith('marketplaces.') ? header.slice('marketplaces.'.length) : null;
}

function pluginMarketplaceId(header: string) {
  if (!header.startsWith('plugins.')) return null;
  const identity = header.slice('plugins.'.length);
  const separator = identity.lastIndexOf('@');
  return separator >= 0 ? identity.slice(separator + 1) : null;
}

function isMissingOplTemporaryMarketplace(table: TomlTableBlock) {
  const id = marketplaceId(table.header);
  const source = tableStringValue(table, 'source');
  if (!id || !source || !source.split(/[\\/]/).some((segment) => segment.startsWith('opl-repo-temp'))) {
    return false;
  }
  const sourceType = tableStringValue(table, 'source_type');
  if (sourceType && sourceType !== 'local') return false;
  return !fs.existsSync(path.resolve(source));
}

function classifyRemovals(tables: TomlTableBlock[]) {
  const staleMarketplaceIds = new Set(
    tables.filter(isMissingOplTemporaryMarketplace)
      .map((table) => marketplaceId(table.header)!)
  );
  const removeReason = new Map<string, HygieneReason>();
  for (const table of tables) {
    const marketId = marketplaceId(table.header);
    const pluginMarketId = pluginMarketplaceId(table.header);
    if (
      marketId === 'mas-scholar-skills-local'
      || pluginMarketId === 'mas-scholar-skills-local'
    ) {
      removeReason.set(table.header, 'global_mas_scholar_discovery');
      continue;
    }
    if (
      (marketId && staleMarketplaceIds.has(marketId))
      || (pluginMarketId && staleMarketplaceIds.has(pluginMarketId))
    ) {
      removeReason.set(table.header, 'stale_temporary_marketplace');
    }
  }
  return removeReason;
}

function buildDelta(table: TomlTableBlock, reason: HygieneReason): HygieneDelta {
  return {
    header: table.header,
    content_sha256: sha256Bytes(table.content),
    reason,
    related_marketplace_id: marketplaceId(table.header) ?? pluginMarketplaceId(table.header),
  };
}

function hygieneRoot(runtime: CodexConfigHygieneRuntime) {
  return path.join(runtime.stateDir ?? resolveOplStatePaths().state_dir, 'codex-config-hygiene');
}

function assertReceiptPath(receiptPath: string, rootPath: string) {
  const root = path.resolve(rootPath, 'receipts');
  const resolved = path.resolve(receiptPath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Codex config hygiene rollback receipt must come from the Framework hygiene receipt directory.',
      {
        receipt_path: resolved,
        receipt_root: root,
        failure_code: 'codex_config_hygiene_receipt_outside_state',
      },
    );
  }
  return resolved;
}

function readReceipt(receiptPath: string, rootPath: string) {
  const resolved = assertReceiptPath(receiptPath, rootPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene rollback receipt is missing.', {
      receipt_path: resolved,
      failure_code: 'codex_config_hygiene_receipt_missing',
    });
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.surface_kind !== 'opl_codex_config_hygiene_receipt.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene rollback receipt is invalid.', {
      receipt_path: resolved,
      failure_code: 'codex_config_hygiene_receipt_invalid',
    });
  }
  const receipt = parsed as HygieneReceipt;
  const receiptFile = path.basename(resolved);
  const receiptId = receiptFile.endsWith('.json') ? receiptFile.slice(0, -'.json'.length) : '';
  const expectedReceiptRef = `opl://codex-config-hygiene/${receiptId}`;
  if (!receiptId || receipt.receipt_ref !== expectedReceiptRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene receipt identity is invalid.', {
      receipt_path: resolved,
      receipt_ref: receipt.receipt_ref,
      expected_receipt_ref: expectedReceiptRef,
      failure_code: 'codex_config_hygiene_receipt_identity_mismatch',
    });
  }
  return {
    receipt,
    transactionRoot: path.resolve(rootPath, 'transactions', receiptId),
  };
}

function assertTransactionArtifactPath(
  artifactPath: string,
  transactionRoot: string,
  fileName: 'config.toml.before' | 'toml-delta.json',
) {
  const expected = path.join(transactionRoot, fileName);
  const resolved = path.resolve(artifactPath);
  if (resolved !== expected) {
    const artifactKind = fileName === 'config.toml.before' ? 'backup' : 'delta';
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Codex config hygiene ${artifactKind} must belong to its receipt transaction.`,
      {
        [`${artifactKind}_path`]: resolved,
        transaction_root: transactionRoot,
        expected_path: expected,
        failure_code: `codex_config_hygiene_${artifactKind}_outside_transaction`,
      },
    );
  }
  return resolved;
}

function readOptionalFile(filePath: string) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function assertConfigSha(configPath: string, expectedSha256: string | null, failureCode: string) {
  const current = readOptionalFile(configPath);
  const actualSha256 = current ? sha256Bytes(current) : null;
  if (actualSha256 !== expectedSha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config changed during hygiene transaction.', {
      config_path: configPath,
      expected_sha256: expectedSha256,
      actual_sha256: actualSha256,
      failure_code: failureCode,
    });
  }
  return current;
}

function authorityBoundary() {
  return {
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    owner: 'OPL Base',
    surface: 'codex_config_hygiene',
  } as const;
}

function runRollback(receiptPath: string, runtime: CodexConfigHygieneRuntime) {
  const rootPath = hygieneRoot(runtime);
  const { receipt: source, transactionRoot } = readReceipt(receiptPath, rootPath);
  const configPath = runtime.configPath ?? resolveCodexConfigPath();
  if (source.action !== 'reconcile' || source.status !== 'completed'
    || source.config_path !== configPath || !source.backup_path || !source.backup_sha256
    || !source.delta_path) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene receipt cannot be rolled back.', {
      receipt_ref: source.receipt_ref,
      config_path: configPath,
      failure_code: 'codex_config_hygiene_receipt_not_rollbackable',
    });
  }
  const backupPath = assertTransactionArtifactPath(
    source.backup_path,
    transactionRoot,
    'config.toml.before',
  );
  const deltaPath = assertTransactionArtifactPath(
    source.delta_path,
    transactionRoot,
    'toml-delta.json',
  );
  if (!fs.existsSync(deltaPath) || !fs.statSync(deltaPath).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene delta is missing.', {
      receipt_ref: source.receipt_ref,
      delta_path: deltaPath,
      failure_code: 'codex_config_hygiene_delta_missing',
    });
  }
  const current = readOptionalFile(configPath);
  const currentSha256 = current ? sha256Bytes(current) : null;
  if (currentSha256 !== source.after_sha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config changed after hygiene reconciliation.', {
      receipt_ref: source.receipt_ref,
      expected_sha256: source.after_sha256,
      actual_sha256: currentSha256,
      failure_code: 'codex_config_hygiene_rollback_conflict',
    });
  }
  if (!fs.existsSync(backupPath)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene backup is missing.', {
      receipt_ref: source.receipt_ref,
      backup_path: backupPath,
      failure_code: 'codex_config_hygiene_backup_missing',
    });
  }
  const backup = fs.readFileSync(backupPath);
  const backupSha256 = sha256Bytes(backup);
  if (backupSha256 !== source.backup_sha256 || backupSha256 !== source.before_sha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Codex config hygiene backup digest changed.', {
      receipt_ref: source.receipt_ref,
      backup_path: backupPath,
      expected_sha256: source.backup_sha256,
      actual_sha256: backupSha256,
      failure_code: 'codex_config_hygiene_backup_digest_mismatch',
    });
  }
  const receiptId = crypto.randomUUID();
  const rollbackReceiptPath = path.join(rootPath, 'receipts', `${receiptId}.json`);
  const receipt: HygieneReceipt = {
    surface_kind: 'opl_codex_config_hygiene_receipt.v1',
    receipt_ref: `opl://codex-config-hygiene/${receiptId}`,
    action: 'rollback',
    status: 'rolled_back',
    recorded_at: new Date().toISOString(),
    config_path: configPath,
    before_sha256: currentSha256,
    after_sha256: backupSha256,
    backup_path: null,
    backup_sha256: null,
    delta_path: null,
    removed_tables: source.removed_tables,
    restored_receipt_ref: source.receipt_ref,
    writes_performed: true,
    workspace_local_mas_discovery_preserved: true,
    rollback_command: null,
  };
  try {
    writeFileAtomic(configPath, backup);
    writeJson(rollbackReceiptPath, receipt);
  } catch (error) {
    if (current) writeFileAtomic(configPath, current);
    else fs.rmSync(configPath, { force: true });
    throw error;
  }
  return { receipt, receiptPath: rollbackReceiptPath };
}

export function runCodexConfigHygiene(input: {
  dryRun?: boolean;
  rollbackReceipt?: string | null;
} = {}, runtime: CodexConfigHygieneRuntime = {}) {
  if (input.rollbackReceipt) {
    const result = runRollback(input.rollbackReceipt, runtime);
    return {
      version: 'g2',
      codex_config_hygiene: {
        surface_kind: 'opl_codex_config_hygiene',
        status: 'rolled_back',
        dry_run: false,
        receipt: result.receipt,
        receipt_path: result.receiptPath,
        authority_boundary: authorityBoundary(),
      },
    };
  }

  const dryRun = input.dryRun === true;
  const rootPath = hygieneRoot(runtime);
  const configPath = runtime.configPath ?? resolveCodexConfigPath();
  const before = readOptionalFile(configPath);
  const beforeText = before?.toString('utf8') ?? '';
  const document = parseTomlDocument(beforeText);
  const removeReason = classifyRemovals(document.tables);
  const removedTables = document.tables
    .filter((table) => removeReason.has(table.header))
    .map((table) => buildDelta(table, removeReason.get(table.header)!));
  const keptTables = document.tables.filter((table) => !removeReason.has(table.header));
  const afterText = removedTables.length > 0
    ? renderTomlDocument(document.preamble, keptTables)
    : beforeText;
  const beforeSha256 = before ? sha256Bytes(before) : null;
  const afterSha256 = before ? sha256Bytes(afterText) : null;
  const receiptId = crypto.randomUUID();
  const transactionRoot = path.join(rootPath, 'transactions', receiptId);
  const backupPath = path.join(transactionRoot, 'config.toml.before');
  const deltaPath = path.join(transactionRoot, 'toml-delta.json');
  const receiptPath = path.join(rootPath, 'receipts', `${receiptId}.json`);
  const writesPerformed = !dryRun && removedTables.length > 0;
  const receipt: HygieneReceipt = {
    surface_kind: 'opl_codex_config_hygiene_receipt.v1',
    receipt_ref: `opl://codex-config-hygiene/${receiptId}`,
    action: 'reconcile',
    status: dryRun
      ? 'validated_no_write'
      : removedTables.length > 0 ? 'completed' : 'current',
    recorded_at: new Date().toISOString(),
    config_path: configPath,
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    backup_path: writesPerformed ? backupPath : null,
    backup_sha256: writesPerformed ? beforeSha256 : null,
    delta_path: writesPerformed ? deltaPath : null,
    removed_tables: removedTables,
    restored_receipt_ref: null,
    writes_performed: writesPerformed,
    workspace_local_mas_discovery_preserved: true,
    rollback_command: writesPerformed
      ? `opl system codex-config-hygiene --rollback-receipt ${receiptPath}`
      : null,
  };

  if (writesPerformed && before) {
    let configReplaced = false;
    try {
      writeFileAtomic(backupPath, before);
      writeJson(deltaPath, {
        surface_kind: 'opl_codex_config_hygiene_toml_delta.v1',
        config_path: configPath,
        before_sha256: beforeSha256,
        after_sha256: afterSha256,
        removed_tables: removedTables,
      });
      runtime.beforeConfigReplace?.();
      assertConfigSha(configPath, beforeSha256, 'codex_config_hygiene_apply_conflict');
      writeFileAtomic(configPath, afterText);
      configReplaced = true;
      writeJson(receiptPath, receipt);
    } catch (error) {
      if (configReplaced) {
        const current = readOptionalFile(configPath);
        if ((current ? sha256Bytes(current) : null) === afterSha256) {
          writeFileAtomic(configPath, before);
        }
      }
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(receiptPath, { force: true });
      throw error;
    }
  }

  return {
    version: 'g2',
    codex_config_hygiene: {
      surface_kind: 'opl_codex_config_hygiene',
      status: receipt.status,
      dry_run: dryRun,
      receipt,
      receipt_path: writesPerformed ? receiptPath : null,
      authority_boundary: authorityBoundary(),
    },
  };
}
