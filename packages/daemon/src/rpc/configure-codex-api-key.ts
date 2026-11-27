import { configureGatewayCodexProvider } from '@opl/connect';
import { DaemonRpcError } from '../errors.ts';

export function configureCodexApiKey(params: Record<string, unknown>) {
  const key = typeof params.api_key === 'string' ? params.api_key.trim() : '';
  if (Object.keys(params).length !== 1 || !key || Buffer.byteLength(key) > 65_536) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A bounded API key is required.');
  }
  try {
    // An explicitly selected custom provider stays active when a key is saved.
    configureGatewayCodexProvider(key, { activate: false });
  } catch {
    // Parser and filesystem errors may include the input configuration text.
    throw new DaemonRpcError(-32000, 'codex_configuration_failed', 'Could not save the Codex provider configuration.');
  }
  return { ok: true };
}
