import path from 'node:path';
import { ConnectError } from '../errors.ts';
import {
  getGatewayKey,
  getGatewayProfile,
  getGatewayUsage,
  inspectGatewayPublicSettings,
  listGatewayGroups,
  loginGateway,
  logoutGateway,
  refreshGatewaySession,
} from './client.ts';
import {
  bindGatewayKeyToCodex,
  gatewayKeyFingerprint,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
  restoreCodexBinding,
  resolveCodexHome,
  withClientCodexHome,
} from './codex-binding.ts';
import { exchangeCompanionCredentials, writeCompanionAuthorization } from './companion-authorization.ts';
import { disableGatewayManagedKey, reconcileGatewayManagedKey } from './key-reconcile.ts';
import {
  readGatewayAccountState,
  readGatewayCredentials,
  readGatewayInstallation,
  readOrCreateGatewayInstallation,
  removeGatewayAccountPrivateState,
  withGatewayAccountLock,
  writeGatewayAccountState,
  writeGatewayCredentials,
} from './private-store.ts';
import {
  OPL_GATEWAY_CACHE_TTL_MS,
  type GatewayAccountReadModel,
  type GatewayAccountState,
  type GatewayLoginCredentials,
  type GatewayManagedKey,
} from './types.ts';

export { withGatewayStateDirectory } from './state-directory.ts';

function gatewayError(code: string, message: string) {
  return new ConnectError('PROVIDER_INVOCATION_FAILED', message, { reason_code: code });
}

function reasonCode(error: unknown) {
  if (error instanceof ConnectError) return error.reason_code;
  return 'gateway_operation_failed';
}

export function selectOplGatewayManagedGroup(
  groups: Array<{ group_id: string; label: string }>,
): string | null {
  const codexGroups = groups.filter((group) => group.label.trim().toLowerCase().includes('codex'));
  if (codexGroups.length === 1) return codexGroups[0].group_id;
  return groups.length === 1 ? groups[0].group_id : null;
}

function emptyAccountState(canonicalKeyName: string): GatewayAccountState {
  return {
    surface_kind: 'opl_gateway_account_state.v1',
    status: 'attention_needed',
    account_user_id: null,
    canonical_key_name: canonicalKeyName,
    key_id: null,
    key_status: null,
    key_group_id: null,
    available_groups: [],
    snapshot: null,
    observed_at: null,
    stale_after: null,
    last_error_code: null,
    codex_binding: null,
    transaction_stage: null,
  };
}

function freshness() {
  const observedAt = new Date();
  return {
    observed_at: observedAt.toISOString(),
    stale_after: new Date(observedAt.getTime() + OPL_GATEWAY_CACHE_TTL_MS).toISOString(),
  };
}

async function accountSnapshot(accessToken: string) {
  const [profile, usage, availableGroups, publicSettings] = await Promise.all([
    getGatewayProfile(accessToken),
    getGatewayUsage(accessToken),
    listGatewayGroups(accessToken),
    inspectGatewayPublicSettings(),
  ]);
  if (!profile.account_user_id) throw gatewayError('gateway_profile_invalid', 'OPL Gateway profile has no account identity.');
  return {
    accountUserId: profile.account_user_id,
    availableGroups,
    snapshot: {
      display_name: profile.display_name,
      email: profile.email,
      account_status: profile.status,
      balance_amount: profile.balance_amount,
      balance_currency: profile.balance_currency,
      ...usage,
      day_timezone: publicSettings.server_timezone,
      cost_currency: usage.currency,
    },
  };
}

function stateWithSnapshot(
  current: GatewayAccountState,
  remote: Awaited<ReturnType<typeof accountSnapshot>>,
  key: GatewayManagedKey | null,
  status: GatewayAccountState['status'],
) {
  const currentFreshness = freshness();
  return {
    ...current,
    status,
    account_user_id: remote.accountUserId,
    key_id: key?.id ?? current.key_id,
    key_status: key?.status ?? current.key_status,
    key_group_id: key?.group_id ?? current.key_group_id,
    available_groups: remote.availableGroups,
    snapshot: remote.snapshot,
    ...currentFreshness,
    last_error_code: null,
    transaction_stage: null,
  } satisfies GatewayAccountState;
}

async function rotateSession() {
  const credentials = readGatewayCredentials();
  if (!credentials) throw gatewayError('reauth_required', 'OPL Gateway account must be signed in again.');
  try {
    const session = await refreshGatewaySession(credentials.refresh_token);
    writeGatewayCredentials({ ...credentials, refresh_token: session.refresh_token });
    return { session, credentials: { ...credentials, refresh_token: session.refresh_token } };
  } catch (error) {
    const code = reasonCode(error);
    const state = readGatewayAccountState();
    const sessionOutcomeUnknown = code === 'network_timeout';
    const authenticationRejected = code === 'auth_expired' || code === 'reauth_required';
    if (state) {
      writeGatewayAccountState(authenticationRejected || sessionOutcomeUnknown
        ? { ...state, status: 'reauth_required', last_error_code: 'reauth_required' }
        : { ...state, last_error_code: code, stale_after: new Date().toISOString() });
    }
    if (authenticationRejected || sessionOutcomeUnknown) {
      throw gatewayError('reauth_required', 'OPL Gateway account must be signed in again.');
    }
    throw error;
  }
}

async function reconcileAndCommit(input: {
  accessToken: string;
  refreshToken: string;
  deviceLabel?: string;
  groupId?: string | null;
  preserveCredentials?: ReturnType<typeof readGatewayCredentials>;
}) {
  const installation = readOrCreateGatewayInstallation(input.deviceLabel);
  const current = readGatewayAccountState() ?? emptyAccountState(installation.canonical_key_name);
  const remote = await accountSnapshot(input.accessToken);
  if (current.account_user_id && current.account_user_id !== remote.accountUserId) {
    throw gatewayError('account_switch_requires_disconnect', 'Disconnect the current OPL Gateway account before signing in to another account.');
  }
  const selectedGroup = input.groupId ?? selectOplGatewayManagedGroup(remote.availableGroups);
  if (remote.availableGroups.length > 1 && !selectedGroup) {
    writeGatewayCredentials({
      surface_kind: 'opl_gateway_credentials.v1',
      refresh_token: input.refreshToken,
      previous_codex_config: input.preserveCredentials?.previous_codex_config ?? null,
      previous_codex_config_existed: input.preserveCredentials?.previous_codex_config_existed ?? false,
    });
    const pending = {
      ...stateWithSnapshot(current, remote, null, 'setup_required'),
      last_error_code: 'group_selection_required',
    };
    writeGatewayAccountState(pending);
    return pending;
  }
  if (selectedGroup && remote.availableGroups.length > 0
    && !remote.availableGroups.some((group) => group.group_id === selectedGroup)) {
    throw gatewayError('group_selection_required', 'Select an available OPL Gateway group.');
  }
  const baseCredentials = {
    surface_kind: 'opl_gateway_credentials.v1' as const,
    refresh_token: input.refreshToken,
    previous_codex_config: input.preserveCredentials?.previous_codex_config ?? null,
    previous_codex_config_existed: input.preserveCredentials?.previous_codex_config_existed ?? false,
  };
  writeGatewayCredentials(baseCredentials);
  writeGatewayAccountState({
    ...stateWithSnapshot(current, remote, null, 'attention_needed'),
    transaction_stage: 'authenticated',
  });
  const resolved = await reconcileGatewayManagedKey({
    accessToken: input.accessToken,
    accountUserId: remote.accountUserId,
    installation,
    accountState: current,
    groupId: selectedGroup,
  });
  const key = resolved.key;
  const keyResolvedState = {
    ...stateWithSnapshot(current, remote, key, 'attention_needed'),
    transaction_stage: 'key_resolved',
  };
  writeGatewayAccountState(keyResolvedState);
  if (current.codex_binding?.activated !== true) {
    const connected = {
      ...stateWithSnapshot(current, remote, key, 'connected'),
      codex_binding: current.codex_binding,
    };
    writeGatewayAccountState(connected);
    return connected;
  }
  let bindingResult: ReturnType<typeof bindGatewayKeyToCodex>;
  try {
    const needsRebind = !current.codex_binding
      || current.codex_binding.managed_key_fingerprint !== gatewayKeyFingerprint(key.key);
    bindingResult = needsRebind
      ? withClientCodexHome(path.dirname(current.codex_binding.config_path), () => bindGatewayKeyToCodex(key.key))
      : {
          binding: current.codex_binding,
          previous_config: baseCredentials.previous_codex_config,
          previous_config_existed: baseCredentials.previous_codex_config_existed,
        };
  } catch (error) {
    if (resolved.mutation !== 'none') {
      try {
        await disableGatewayManagedKey({ accessToken: input.accessToken, expectedName: key.name, keyId: key.id });
      } catch {
        // The recoverable transaction state remains available for explicit repair.
      }
    }
    writeGatewayAccountState({ ...keyResolvedState, status: 'attention_needed', last_error_code: 'gateway_codex_binding_failed' });
    throw gatewayError('gateway_codex_binding_failed', 'The managed key could not be bound to Codex safely.');
  }
  writeGatewayCredentials({
    ...baseCredentials,
    previous_codex_config: input.preserveCredentials?.previous_codex_config ?? bindingResult.previous_config,
    previous_codex_config_existed: input.preserveCredentials?.previous_codex_config_existed
      ?? bindingResult.previous_config_existed,
  });
  writeGatewayAccountState({ ...keyResolvedState, codex_binding: bindingResult.binding, transaction_stage: 'codex_bound' });
  const connected = {
    ...stateWithSnapshot(current, remote, key, 'connected'),
    codex_binding: bindingResult.binding,
  };
  writeGatewayAccountState(connected);
  return connected;
}

export async function loginOplGatewayAccount(credentials: GatewayLoginCredentials) {
  return withGatewayAccountLock(async () => {
    const email = credentials.email.trim();
    if (!email || !credentials.password) throw gatewayError('invalid_credentials', 'OPL Gateway email and password are required.');
    const publicSettings = await inspectGatewayPublicSettings();
    if (publicSettings.turnstile_enabled) {
      throw gatewayError('mfa_or_challenge_required', 'OPL Gateway requires an interactive verification challenge.');
    }
    const session = await loginGateway(email, credentials.password);
    await reconcileAndCommit({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      deviceLabel: credentials.device_label,
      preserveCredentials: readGatewayCredentials(),
    });
    return { gateway_account: readOplGatewayAccount() };
  });
}

export async function completeOplGatewaySetup(groupId: string) {
  return withGatewayAccountLock(async () => {
    const rotated = await rotateSession();
    await reconcileAndCommit({
      accessToken: rotated.session.access_token,
      refreshToken: rotated.session.refresh_token,
      groupId: groupId.trim(),
      preserveCredentials: rotated.credentials,
    });
    return { gateway_account: readOplGatewayAccount() };
  });
}

export async function refreshOplGatewayAccount() {
  const requestedRefreshToken = readGatewayCredentials()?.refresh_token ?? null;
  return withGatewayAccountLock(async () => {
    const state = readGatewayAccountState();
    if (!state) throw gatewayError('reauth_required', 'OPL Gateway account is not connected.');
    const currentRefreshToken = readGatewayCredentials()?.refresh_token ?? null;
    if (requestedRefreshToken && currentRefreshToken && requestedRefreshToken !== currentRefreshToken) {
      return { gateway_account: readOplGatewayAccount() };
    }
    const rotated = await rotateSession();
    try {
      const remote = await accountSnapshot(rotated.session.access_token);
      const key = state.key_id ? await getGatewayKey(rotated.session.access_token, state.key_id) : null;
      if (key && key.name !== state.canonical_key_name) {
        throw gatewayError('managed_key_identity_drift', 'The OPL App managed key was renamed in OPL Gateway.');
      }
      const nextStatus = state.status === 'disconnect_pending' || state.status === 'setup_required'
        ? state.status : !key && state.key_id ? 'managed_key_missing' : 'connected';
      const next = stateWithSnapshot(state, remote, key, nextStatus);
      writeGatewayAccountState(next);
      return { gateway_account: readOplGatewayAccount() };
    } catch (error) {
      const code = reasonCode(error);
      writeGatewayAccountState({
        ...state,
        status: code === 'managed_key_identity_drift' ? 'managed_key_identity_drift' : state.status,
        last_error_code: code,
        stale_after: new Date().toISOString(),
      });
      throw error;
    }
  });
}

export async function withOplGatewayAccessToken<T>(
  fn: (accessToken: string, account: GatewayAccountState) => Promise<T>,
): Promise<T> {
  return withGatewayAccountLock(async () => {
    const account = readGatewayAccountState();
    if (!account || account.status === 'reauth_required' || account.status === 'disconnect_pending') {
      throw gatewayError('reauth_required', 'Sign in to your OPL account in the App first.');
    }
    const rotated = await rotateSession();
    return fn(rotated.session.access_token, account);
  });
}

export function readGatewayAccountUserId(): string | null {
  return readGatewayAccountState()?.account_user_id ?? null;
}

export async function authorizeOplLinkCompanion(request: unknown, credentialFile: string) {
  return writeCompanionAuthorization(request, credentialFile, (device) =>
    withOplGatewayAccessToken((accessToken) => exchangeCompanionCredentials(device, accessToken)),
  );
}

export async function repairOplGatewayAccount(groupId?: string) {
  return withGatewayAccountLock(async () => {
    const rotated = await rotateSession();
    await reconcileAndCommit({
      accessToken: rotated.session.access_token,
      refreshToken: rotated.session.refresh_token,
      groupId,
      preserveCredentials: rotated.credentials,
    });
    return { gateway_account: readOplGatewayAccount() };
  });
}

export async function useOplGatewayForModelAccess() {
  return withGatewayAccountLock(async () => {
    const state = readGatewayAccountState();
    if (!state) throw gatewayError('reauth_required', 'OPL Gateway account is not connected.');
    // Each installation retains one restore snapshot for its managed model key.
    if (state.codex_binding?.activated
        && path.resolve(state.codex_binding.config_path) !== path.join(resolveCodexHome(), 'config.toml')) {
      throw gatewayError('account_switch_requires_disconnect', 'Disconnect the Gateway account before activating it in another Codex home.');
    }
    const rotated = await rotateSession();
    const remote = await accountSnapshot(rotated.session.access_token);
    const installation = readOrCreateGatewayInstallation();
    const resolved = await reconcileGatewayManagedKey({
      accessToken: rotated.session.access_token,
      accountUserId: remote.accountUserId,
      installation,
      accountState: state,
      groupId: state.key_group_id,
    });
    const key = resolved.key;
    let binding: ReturnType<typeof bindGatewayKeyToCodex>;
    try {
      const activeAccess = readLocalCodexAccessState();
      const activeDefaults = readLocalCodexDefaultsIfAvailable();
      const existingBinding = state.codex_binding;
      if (
        existingBinding?.activated === true
        && existingBinding.managed_key_fingerprint === gatewayKeyFingerprint(key.key)
        && activeAccess.model_access_ready
        && activeAccess.model_access_source === 'opl_gateway'
        && activeDefaults?.model_provider === existingBinding.provider_id
        && Boolean(activeDefaults.provider_api_key)
        && gatewayKeyFingerprint(activeDefaults.provider_api_key ?? '') === existingBinding.managed_key_fingerprint
      ) {
        binding = {
          binding: existingBinding,
          previous_config: rotated.credentials.previous_codex_config,
          previous_config_existed: rotated.credentials.previous_codex_config_existed,
        };
      } else {
        binding = bindGatewayKeyToCodex(key.key);
      }
    } catch {
      if (resolved.mutation !== 'none') {
        try {
          await disableGatewayManagedKey({
            accessToken: rotated.session.access_token,
            expectedName: key.name,
            keyId: key.id,
          });
        } catch {
          // The recoverable account state remains available for another explicit attempt.
        }
      }
      writeGatewayAccountState({
        ...stateWithSnapshot(state, remote, key, 'attention_needed'),
        last_error_code: 'gateway_codex_binding_failed',
      });
      throw gatewayError('gateway_codex_binding_failed', 'The managed key could not be bound to Codex safely.');
    }
    const preserveActivationBaseline = state.codex_binding?.activated === true;
    writeGatewayCredentials({
      ...rotated.credentials,
      previous_codex_config: preserveActivationBaseline
        ? rotated.credentials.previous_codex_config
        : binding.previous_config,
      previous_codex_config_existed: preserveActivationBaseline
        ? rotated.credentials.previous_codex_config_existed
        : binding.previous_config_existed,
    });
    const next = { ...stateWithSnapshot(state, remote, key, 'connected'), codex_binding: binding.binding };
    writeGatewayAccountState(next);
    return { gateway_account: readOplGatewayAccount() };
  });
}

export async function disconnectOplGatewayAccount() {
  return withGatewayAccountLock(async () => {
    const state = readGatewayAccountState();
    const credentials = readGatewayCredentials();
    if (!state || !credentials) {
      removeGatewayAccountPrivateState();
      return { gateway_account: readOplGatewayAccount() };
    }
    try {
      const session = await refreshGatewaySession(credentials.refresh_token);
      writeGatewayCredentials({ ...credentials, refresh_token: session.refresh_token });
      if (state.key_id) {
        await disableGatewayManagedKey({
          accessToken: session.access_token,
          expectedName: state.canonical_key_name,
          keyId: state.key_id,
        });
      }
      const codex_restore = restoreCodexBinding(
        state.codex_binding,
        credentials.previous_codex_config,
        credentials.previous_codex_config_existed,
      );
      await logoutGateway(session.access_token, session.refresh_token);
      removeGatewayAccountPrivateState();
      return { gateway_account: readOplGatewayAccount(), codex_restore };
    } catch (error) {
      writeGatewayAccountState({ ...state, status: 'disconnect_pending', last_error_code: reasonCode(error) });
      throw gatewayError('disconnect_pending', 'OPL Gateway disconnect is pending because the managed key was not safely disabled.');
    }
  });
}

export function readOplGatewayAccount(): GatewayAccountReadModel {
  const state = readGatewayAccountState();
  const installation = readGatewayInstallation();
  const codex = readLocalCodexAccessState();
  const accountConnected = Boolean(state);
  const now = Date.now();
  const stale = Boolean(state?.stale_after && Date.parse(state.stale_after) <= now);
  const publicStatus = !state
    ? 'not_connected' as const
    : state.status === 'connected'
      ? 'connected' as const
      : state.status === 'setup_required'
        ? 'setup_required' as const
        : state.status === 'reauth_required'
          ? 'reauth_required' as const
          : state.status === 'disconnect_pending'
            ? 'disconnect_pending' as const
            : 'attention_needed' as const;
  return {
    surface_kind: 'opl_gateway_account_read_model.v1',
    status: publicStatus,
    connection_mode: accountConnected ? 'account' : codex.opl_gateway_configured ? 'manual_key' : 'none',
    account_card_visible: accountConnected,
    account: state?.snapshot ? {
      display_name: state.snapshot.display_name,
      email: state.snapshot.email,
      status: state.snapshot.account_status,
      balance: { amount: state.snapshot.balance_amount, currency: state.snapshot.balance_currency },
    } : null,
    usage: state?.snapshot ? {
      today_tokens: state.snapshot.today_tokens,
      total_tokens: state.snapshot.total_tokens,
      today_actual_cost: state.snapshot.today_actual_cost,
      total_actual_cost: state.snapshot.total_actual_cost,
      currency: state.snapshot.cost_currency,
      day_timezone: state.snapshot.day_timezone,
    } : null,
    managed_key: state?.key_id ? {
      name: state.canonical_key_name,
      status: state.key_status,
      ownership: 'opl_app_managed',
    } : null,
    installation: installation ? { device_label: installation.device_slug, short_id: installation.short_id } : null,
    available_groups: state?.available_groups ?? [],
    resolved_group_id: selectOplGatewayManagedGroup(state?.available_groups ?? []),
    freshness: {
      observed_at: state?.observed_at ?? null,
      stale_after: state?.stale_after ?? null,
      stale,
      last_error_code: state?.last_error_code ?? null,
    },
    capabilities: { account_login_supported: true, manual_key_supported: true },
    actions: {
      complete_setup: 'gateway_account_complete_setup',
      refresh: 'gateway_account_refresh',
      repair: 'gateway_account_repair',
      use_for_model_access: 'gateway_account_use_for_model_access',
      disconnect: 'gateway_account_disconnect',
    },
  };
}
