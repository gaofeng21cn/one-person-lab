import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  bootstrapLocalCodexDefaults,
  OPL_GATEWAY_BASE_URL,
  parseTomlTablePath,
  readBundledCodexDefaultProfile,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
} from '../../../kernel/local-codex-defaults.ts';
import { writeCodexConfigAtomically } from '../../../kernel/local-codex-defaults-parts/management-receipt.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import type { GatewayCodexBinding } from './types.ts';

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function gatewayKeyFingerprint(value: string) {
  return hash(value);
}

type FileSnapshot = {
  existed: boolean;
  contents: string | null;
};

function snapshotFile(filePath: string): FileSnapshot {
  const existed = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  return {
    existed,
    contents: existed ? fs.readFileSync(filePath, 'utf8') : null,
  };
}

function restoreFileSnapshot(filePath: string, snapshot: FileSnapshot) {
  if (!snapshot.existed) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeCodexConfigAtomically(filePath, snapshot.contents ?? '');
}

export function bindGatewayKeyToCodex(
  apiKey: string,
  options: { readback?: typeof readLocalCodexAccessState } = {},
) {
  const before = readLocalCodexAccessState();
  const beforeDefaults = readLocalCodexDefaultsIfAvailable();
  const configExisted = fs.existsSync(before.config_path);
  const previousConfig = configExisted ? fs.readFileSync(before.config_path, 'utf8') : null;
  const receiptPath = path.join(resolveOplStatePaths().state_dir, 'codex-config-management-receipt.json');
  const configSnapshot = snapshotFile(before.config_path);
  const receiptSnapshot = snapshotFile(receiptPath);
  const profile = readBundledCodexDefaultProfile();
  try {
    const result = bootstrapLocalCodexDefaults({
      model_provider: profile.model_provider,
      model: profile.model,
      reasoning_effort: profile.model_reasoning_effort ?? undefined,
      provider_name: profile.provider_name,
      provider_base_url: OPL_GATEWAY_BASE_URL,
      provider_api_key: apiKey,
      activate_provider: true,
    });
    if (result.status !== 'completed' || !result.management_receipt) {
      throw new Error('gateway_codex_binding_failed');
    }
    const after = (options.readback ?? readLocalCodexAccessState)();
    if (!after.model_access_ready || after.model_access_source !== 'opl_gateway') {
      throw new Error('gateway_codex_binding_failed');
    }
    const binding: GatewayCodexBinding = {
      config_path: before.config_path,
      provider_id: result.management_receipt.provider_id,
      previous_provider_id: beforeDefaults?.model_provider ?? null,
      managed_key_fingerprint: gatewayKeyFingerprint(apiKey),
      managed_root_values: {
        model_provider: result.management_receipt.provider_id,
        model: result.management_receipt.last_applied_values.model,
        model_reasoning_effort: result.management_receipt.last_applied_values.model_reasoning_effort,
      },
      activated: true,
    };
    return {
      binding,
      previous_config: previousConfig,
      previous_config_existed: configExisted,
    };
  } catch (error) {
    restoreFileSnapshot(before.config_path, configSnapshot);
    restoreFileSnapshot(receiptPath, receiptSnapshot);
    throw error;
  }
}

export function restoreCodexBinding(
  binding: GatewayCodexBinding | null,
  previousConfig: string | null,
  previousConfigExisted: boolean,
) {
  if (!binding?.activated || !fs.existsSync(binding.config_path)) return 'not_managed' as const;
  const current = fs.readFileSync(binding.config_path, 'utf8');
  const currentDefaults = readLocalCodexDefaultsIfAvailable();
  if (
    currentDefaults?.model_provider !== binding.provider_id
    || !currentDefaults.provider_api_key
    || gatewayKeyFingerprint(currentDefaults.provider_api_key) !== binding.managed_key_fingerprint
  ) return 'manual_override_preserved' as const;
  const managedRootValues = binding.managed_root_values ?? {
    model_provider: binding.provider_id,
  };
  const currentRootValues = {
    model_provider: currentDefaults.model_provider,
    model: currentDefaults.model,
    model_reasoning_effort: currentDefaults.reasoning_effort,
  };
  const rootKeys = new Set(
    Object.entries(managedRootValues)
      .filter(([key, value]) => currentRootValues[key as keyof typeof currentRootValues] === value)
      .map(([key]) => key),
  );
  const providerSectionKey = JSON.stringify(['model_providers', binding.provider_id]);
  const splitBlocks = (text: string) => {
    const lines = text.split(/\r?\n/);
    const root: string[] = [];
    const sections = new Map<string, string[]>();
    let section = '';
    for (const line of lines) {
      const tablePath = parseTomlTablePath(line);
      if (tablePath) {
        section = JSON.stringify(tablePath);
        sections.set(section, [line]);
      } else if (section) {
        sections.get(section)!.push(line);
      } else {
        root.push(line);
      }
    }
    return { root, sections };
  };
  const currentBlocks = splitBlocks(current);
  const previousBlocks = splitBlocks(previousConfig ?? '');
  const keepRoot = currentBlocks.root.filter((line) => {
    const key = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    return !key || !rootKeys.has(key);
  });
  const previousOwnedRoot = previousBlocks.root.filter((line) => {
    const key = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    return Boolean(key && rootKeys.has(key));
  });
  currentBlocks.sections.delete(providerSectionKey);
  const previousProvider = previousBlocks.sections.get(providerSectionKey);
  if (previousProvider) currentBlocks.sections.set(providerSectionKey, previousProvider);
  const merged = [...previousOwnedRoot, ...keepRoot]
    .concat([...currentBlocks.sections.values()].flat())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
  if (!previousConfigExisted && merged.trim().length === 0) {
    fs.rmSync(binding.config_path, { force: true });
    return 'removed_managed_config' as const;
  }
  writeCodexConfigAtomically(binding.config_path, `${merged.replace(/\n+$/, '')}\n`);
  return previousConfigExisted ? 'restored_owned_fields' as const : 'removed_managed_fields' as const;
}
