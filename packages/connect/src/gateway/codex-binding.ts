import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { readConfig, removeEmptyProviderTable, setConfigValue } from './codex-toml.ts';
import { OPL_GATEWAY_INFERENCE_BASE_URL, type GatewayCodexBinding } from './types.ts';

function configFile() {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(process.env.HOME?.trim() || os.homedir(), '.codex');
  return path.resolve(codexHome, 'config.toml');
}

function readFile(file: string) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function atomicWrite(file: string, text: string, expected: string | null) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Preserve a user-managed symlink to their configuration.
  const destination = fs.existsSync(file) ? fs.realpathSync(file) : file;
  const temporary = path.join(path.dirname(destination), '.opl-config-' + randomUUID());
  try {
    fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    if (readFile(file) !== expected) throw new Error('Codex configuration changed during update.');
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function gatewayUrl(url: unknown) {
  const normalized = typeof url === 'string' && url.trim().replace(/\/+$/, '');
  return normalized === OPL_GATEWAY_INFERENCE_BASE_URL || normalized === 'https://gflabtoken.cn/v1';
}

function providers(config: Record<string, unknown>): Record<string, unknown> {
  return isRecord(config.model_providers) ? config.model_providers : {};
}

function provider(config: Record<string, unknown>, id: unknown): Record<string, unknown> {
  const all = providers(config);
  const found = typeof id === 'string' && Object.hasOwn(all, id) && all[id];
  return isRecord(found) ? found : {};
}

function optional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readLocalCodexDefaultsIfAvailable() {
  try {
    const text = readFile(configFile());
    if (text === null) return null;
    const config = readConfig(text);
    const selected = provider(config, config.model_provider);
    return {
      model_provider: optional(config.model_provider),
      model: optional(config.model),
      reasoning_effort: optional(config.model_reasoning_effort),
      provider_api_key: optional(selected.experimental_bearer_token),
      provider_base_url: optional(selected.base_url),
      opl_gateway_configured: Object.values(providers(config)).some(p => isRecord(p)
        && gatewayUrl(p.base_url) && Boolean(optional(p.experimental_bearer_token))),
    };
  } catch { return null; }
}

function readAuth(file: string) {
  try {
    const value = JSON.parse(readFile(file) ?? '{}');
    return {
      signedIn: value?.auth_mode === 'chatgpt' && Boolean(value.tokens),
      hasKey: Boolean(optional(value?.OPENAI_API_KEY)),
    };
  } catch { return { signedIn: false, hasKey: false }; }
}

export function readLocalCodexAccessState() {
  const file = configFile();
  const authFile = path.join(path.dirname(file), 'auth.json');
  const defaults = readLocalCodexDefaultsIfAvailable();
  const auth = readAuth(authFile);
  const hasKey = Boolean(defaults?.provider_api_key);
  const envKey = Boolean(process.env.OPL_CODEX_API_KEY?.trim() || process.env.CODEX_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
  let source = 'missing';
  if (hasKey && gatewayUrl(defaults?.provider_base_url)) source = 'opl_gateway';
  else if (auth.signedIn) source = 'codex_login';
  else if (hasKey || auth.hasKey) source = 'custom_provider';
  else if (envKey) source = 'env_api_key';
  return {
    config_path: file,
    auth_path: authFile,
    config_found: defaults !== null,
    auth_found: fs.existsSync(authFile),
    api_key_present: hasKey,
    env_api_key_present: envKey,
    codex_login_present: auth.signedIn,
    model_access_ready: source !== 'missing',
    model_access_source: source,
    opl_gateway_configured: defaults?.opl_gateway_configured === true,
    provider_base_url: defaults?.provider_base_url ?? null,
    model: defaults?.model ?? null,
    reasoning_effort: defaults?.reasoning_effort ?? null,
  };
}

export function gatewayKeyFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function providerId(config: Record<string, unknown>) {
  const selected = optional(config.model_provider);
  if (selected && gatewayUrl(provider(config, selected).base_url)) return selected;
  const entries = providers(config);
  for (const [id, entry] of Object.entries(entries)) {
    if (isRecord(entry) && gatewayUrl(entry.base_url)) return id;
  }
  let id = 'oplgateway';
  for (let i = 2; Object.hasOwn(entries, id); i++) id = 'oplgateway_' + i;
  return id;
}

function renderProvider(before: string, apiKey: string, activate: boolean) {
  const config = readConfig(before);
  const id = providerId(config);
  const previous = provider(config, id);
  const prefix = ['model_providers', id];
  let text = before;
  // Preserve the active model and reasoning settings independently of key choice.
  if (activate && config.model_provider !== id) text = setConfigValue(text, ['model_provider'], id);
  if (typeof previous.name !== 'string') text = setConfigValue(text, [...prefix, 'name'], 'OPL Gateway');
  if (!gatewayUrl(previous.base_url)) text = setConfigValue(text, [...prefix, 'base_url'], OPL_GATEWAY_INFERENCE_BASE_URL);
  text = setConfigValue(text, [...prefix, 'experimental_bearer_token'], apiKey);
  return { id, text };
}

export function configureGatewayCodexProvider(apiKey: string, options: { activate: boolean }) {
  if (!apiKey.trim()) throw new Error('A Codex API key is required.');
  const file = configFile();
  const before = readFile(file);
  const config = readConfig(before ?? '');
  const activate = options.activate || (!config.model_provider && !readLocalCodexAccessState().model_access_ready);
  const { id, text } = renderProvider(before ?? '', apiKey, activate);
  const after = readConfig(text);
  const selected = after.model_provider === id;
  const updated = provider(after, id);
  if (!gatewayUrl(updated.base_url) || updated.experimental_bearer_token !== apiKey || (activate && !selected)) {
    throw new Error('Failed to configure the Gateway provider.');
  }
  if (text !== before) atomicWrite(file, text, before);
  return { providerId: id, selected, configPath: file };
}

export function bindGatewayKeyToCodex(apiKey: string) {
  const file = configFile();
  const previous = readFile(file);
  const config = readConfig(previous ?? '');
  const { providerId } = configureGatewayCodexProvider(apiKey, { activate: true });
  const binding: GatewayCodexBinding = {
    config_path: file,
    provider_id: providerId,
    previous_provider_id: optional(config.model_provider),
    managed_key_fingerprint: gatewayKeyFingerprint(apiKey),
    activated: true,
  };
  return { binding, previous_config: previous, previous_config_existed: previous !== null };
}

export function restoreCodexBinding(binding: GatewayCodexBinding | null, previous: string | null, existed: boolean) {
  if (!binding?.activated) return 'not_managed';
  const file = binding.config_path;
  const text = readFile(file);
  if (text === null) return 'not_managed';
  const current = readConfig(text);
  const id = binding.provider_id;
  const active = provider(current, id);
  const token = optional(active.experimental_bearer_token);
  if (!token || !gatewayUrl(active.base_url) || gatewayKeyFingerprint(token) !== binding.managed_key_fingerprint) {
    return 'manual_override_preserved';
  }
  const old = readConfig(previous ?? '');
  let next = text;
  // With no subsequent edits, restore the original document exactly.
  if (text === renderProvider(previous ?? '', token, true).text) {
    next = previous ?? '';
  } else {
    const oldProvider = provider(old, id);
    const prefix = ['model_providers', id];
    for (const field of ['name', 'base_url', 'experimental_bearer_token']) {
      if (field === 'name' && active.name !== 'OPL Gateway') continue;
      next = setConfigValue(next, [...prefix, field], optional(oldProvider[field]) ?? undefined);
    }
    if (!Object.hasOwn(providers(old), id)) next = removeEmptyProviderTable(next, id);
    // Prior versions also managed model/effort. Preserve subsequent user edits.
    const owned = binding.managed_root_values ?? { model_provider: id };
    for (const [key, value] of Object.entries(owned)) {
      if ((current[key] ?? null) === value) next = setConfigValue(next, [key], optional(old[key]) ?? undefined);
    }
  }
  readConfig(next);
  if (!existed && !next.trim()) {
    fs.unlinkSync(file);
    return 'removed_managed_config';
  }
  atomicWrite(file, next, text);
  return existed ? 'restored_owned_fields' : 'removed_managed_fields';
}
