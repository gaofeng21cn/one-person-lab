import crypto from 'node:crypto';

import { KernelError } from './errors.ts';
import { nowIso } from './ids.ts';

export type ClientKind = 'opl_app' | 'opl_cli' | 'sdk_python' | 'external';

const CLIENT_KINDS: ReadonlySet<string> = new Set([
  'opl_app',
  'opl_cli',
  'sdk_python',
  'external',
]);

export interface ClientContext {
  readonly session_id: string;
  readonly client_kind: ClientKind;
  readonly trusted_host: boolean;
  readonly consumer_package_id?: string;
  readonly authenticated_at: string;
}

export function isClientKind(value: unknown): value is ClientKind {
  return typeof value === 'string' && CLIENT_KINDS.has(value);
}

export function parseClientKind(value: unknown): ClientKind {
  return isClientKind(value) ? value : 'external';
}

export function isTrustedHost(kind: ClientKind): boolean {
  return kind === 'opl_app' || kind === 'opl_cli';
}

export function createClientContext(input: {
  session_id: string;
  client_kind: unknown;
  consumer_package_id?: string;
  authenticated_at?: string;
}): ClientContext {
  const clientKind = parseClientKind(input.client_kind);
  const base: ClientContext = {
    session_id: input.session_id,
    client_kind: clientKind,
    trusted_host: isTrustedHost(clientKind),
    authenticated_at: input.authenticated_at ?? nowIso(),
  };
  if (input.consumer_package_id !== undefined && input.consumer_package_id.trim().length > 0) {
    return { ...base, consumer_package_id: input.consumer_package_id.trim() };
  }
  return base;
}

export function assertTrustedHost(
  contextOrKind: ClientContext | ClientKind,
  action = 'privileged operation',
): void {
  const trusted = typeof contextOrKind === 'string'
    ? isTrustedHost(contextOrKind)
    : contextOrKind.trusted_host && isTrustedHost(contextOrKind.client_kind);
  if (!trusted) {
    const clientKind = typeof contextOrKind === 'string' ? contextOrKind : contextOrKind.client_kind;
    throw new KernelError(
      'UNAUTHORIZED_CLIENT',
      `Trusted interactive host required for ${action}; got client_kind='${clientKind}'.`,
      { action, client_kind: clientKind },
    );
  }
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || a.length !== b.length || a.length % 2 !== 0) return false;
  if (!/^[0-9a-fA-F]+$/.test(a) || !/^[0-9a-fA-F]+$/.test(b)) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
