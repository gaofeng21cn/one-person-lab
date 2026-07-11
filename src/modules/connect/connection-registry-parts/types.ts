export const OPL_CONNECTION_STATUSES = [
  'untested',
  'ready',
  'attention_needed',
  'disabled',
] as const;

export type OplConnectionStatus = typeof OPL_CONNECTION_STATUSES[number];

export type OplConnection = {
  connection_id: string;
  name: string;
  connection_type: string;
  endpoint: string | null;
  credential_handle: string;
  status: OplConnectionStatus;
  status_code: string | null;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
};

export type OplConnectionRegistryStore = {
  surface_kind: 'opl_connection_registry_store.v1';
  version: 'g1';
  default_connection_id: string | null;
  connections: OplConnection[];
  updated_at: string;
};

export type CreateOplConnectionInput = {
  connection_id: string;
  name: string;
  connection_type: string;
  endpoint?: string | null;
  credential_handle: string;
  disabled?: boolean;
};

export type UpdateOplConnectionInput = Partial<
  Omit<CreateOplConnectionInput, 'connection_id'>
>;

export type OplConnectionCheck = {
  check_id: 'credential_handle' | 'endpoint';
  status: 'passed' | 'failed';
  code: string;
};
