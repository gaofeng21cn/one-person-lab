import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  bootstrapLocalCodexDefaults,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
} from '../../../kernel/local-codex-defaults.ts';
import { writeCodexConfigAtomically } from '../../../kernel/local-codex-defaults-parts/management-receipt.ts';
import type { GatewayCodexBinding } from './types.ts';

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function gatewayKeyFingerprint(value: string) {
  return hash(value);
}

export function bindGatewayKeyToCodex(apiKey: string) {
  const before = readLocalCodexAccessState();
  const beforeDefaults = readLocalCodexDefaultsIfAvailable();
  const configExisted = fs.existsSync(before.config_path);
  const previousConfig = configExisted ? fs.readFileSync(before.config_path, 'utf8') : null;
  const shouldActivate = before.model_access_source === 'missing' || before.model_access_source === 'opl_gateway';
  if (!shouldActivate) {
    return {
      binding: null,
      previous_config: previousConfig,
      previous_config_existed: configExisted,
    };
  }
  const result = bootstrapLocalCodexDefaults({ provider_api_key: apiKey });
  if (result.status !== 'completed') {
    throw new Error('gateway_codex_binding_failed');
  }
  const binding: GatewayCodexBinding = {
    config_path: before.config_path,
    provider_id: result.management_receipt?.provider_id ?? 'opl_gateway',
    previous_provider_id: beforeDefaults?.model_provider ?? null,
    managed_key_fingerprint: gatewayKeyFingerprint(apiKey),
    activated: true,
  };
  return {
    binding,
    previous_config: previousConfig,
    previous_config_existed: configExisted,
  };
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
  const rootKeys = new Set(['model_provider']);
  const providerHeader = `[model_providers.${binding.provider_id}]`;
  const splitBlocks = (text: string) => {
    const lines = text.split(/\r?\n/);
    const root: string[] = [];
    const sections = new Map<string, string[]>();
    let section = '';
    for (const line of lines) {
      const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)?.[1] ?? null;
      if (header) {
        section = `[${header}]`;
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
  currentBlocks.sections.delete(providerHeader);
  const previousProvider = previousBlocks.sections.get(providerHeader);
  if (previousProvider) currentBlocks.sections.set(providerHeader, previousProvider);
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
