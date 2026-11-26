export type SecretBackendKind = 'macos_keychain' | 'encrypted_file' | 'memory' | (string & {});

export interface SecretMetadata {
  readonly handle: string;
  readonly backend: SecretBackendKind;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PutSecretInput {
  readonly namespace?: string;
  readonly secret: string;
}

export interface SecretVault {
  readonly backend: SecretBackendKind;
  putSecret(input: PutSecretInput): Promise<SecretMetadata>;
  getSecret(handle: string): Promise<string | null>;
  hasSecret(handle: string): Promise<boolean>;
  deleteSecret(handle: string): Promise<boolean>;
  rotateSecret(oldHandle: string, nextSecret: string): Promise<SecretMetadata>;
  listHandles?(): readonly SecretMetadata[];
}
