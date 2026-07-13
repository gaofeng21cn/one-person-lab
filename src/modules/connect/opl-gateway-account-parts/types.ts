export const OPL_GATEWAY_CONTROL_BASE_URL = 'https://gflabtoken.cn/api/v1';
export const OPL_GATEWAY_INFERENCE_BASE_URL = 'https://gflabtoken.cn/v1';
export const OPL_GATEWAY_CONNECTION_ID = 'opl-gateway-account';
export const OPL_GATEWAY_CREDENTIAL_HANDLE = 'credential-store:opl-gateway-account';
export const OPL_GATEWAY_CACHE_TTL_MS = 15 * 60 * 1000;

export type GatewayAccountStatus =
  | 'disconnected'
  | 'connected'
  | 'setup_required'
  | 'reauth_required'
  | 'managed_key_missing'
  | 'managed_key_conflict'
  | 'managed_key_identity_drift'
  | 'disconnect_pending'
  | 'attention_needed';

export type GatewayInstallationState = {
  surface_kind: 'opl_gateway_installation.v1';
  installation_id: string;
  device_slug: string;
  short_id: string;
  canonical_key_name: string;
};

export type GatewayAccountSnapshot = {
  display_name: string | null;
  email: string | null;
  account_status: string;
  balance_amount: number | null;
  balance_currency: string;
  today_tokens: number | null;
  total_tokens: number | null;
  today_actual_cost: number | null;
  total_actual_cost: number | null;
  cost_currency: string;
  day_timezone: string;
};

export type GatewayAccountState = {
  surface_kind: 'opl_gateway_account_state.v1';
  status: GatewayAccountStatus;
  account_user_id: string | null;
  canonical_key_name: string;
  key_id: string | null;
  key_status: string | null;
  key_group_id: string | null;
  available_groups: Array<{ group_id: string; label: string }>;
  snapshot: GatewayAccountSnapshot | null;
  observed_at: string | null;
  stale_after: string | null;
  last_error_code: string | null;
  codex_binding: GatewayCodexBinding | null;
  transaction_stage: string | null;
};

export type GatewayCredentialState = {
  surface_kind: 'opl_gateway_credentials.v1';
  refresh_token: string;
  previous_codex_config: string | null;
  previous_codex_config_existed: boolean;
};

export type GatewayCodexBinding = {
  config_path: string;
  provider_id: string;
  previous_provider_id: string | null;
  managed_key_fingerprint: string;
  activated: boolean;
};

export type GatewayManagedKey = {
  id: string;
  name: string;
  key: string;
  status: string;
  group_id: string | null;
  ip_whitelist: unknown[];
  ip_blacklist: unknown[];
  raw: Record<string, unknown>;
};

export type GatewayLoginCredentials = {
  email: string;
  password: string;
  device_label?: string;
};

export type GatewayAccountReadModel = {
  surface_kind: 'opl_gateway_account_read_model.v1';
  status: 'not_connected' | 'setup_required' | 'connected' | 'reauth_required' | 'attention_needed' | 'disconnect_pending';
  connection_mode: 'none' | 'manual_key' | 'account';
  account_card_visible: boolean;
  account: {
    display_name: string | null;
    email: string | null;
    status: string;
    balance: { amount: number | null; currency: string };
  } | null;
  usage: {
    today_tokens: number | null;
    total_tokens: number | null;
    today_actual_cost: number | null;
    total_actual_cost: number | null;
    currency: string;
    day_timezone: string;
  } | null;
  managed_key: { name: string; status: string | null; ownership: 'opl_app_managed' } | null;
  installation: { device_label: string; short_id: string } | null;
  available_groups: Array<{ group_id: string; label: string }>;
  freshness: {
    observed_at: string | null;
    stale_after: string | null;
    stale: boolean;
    last_error_code: string | null;
  };
  capabilities: { account_login_supported: true; manual_key_supported: true };
  actions: {
    complete_setup: 'gateway_account_complete_setup';
    refresh: 'gateway_account_refresh';
    repair: 'gateway_account_repair';
    use_for_model_access: 'gateway_account_use_for_model_access';
    disconnect: 'gateway_account_disconnect';
  };
};
