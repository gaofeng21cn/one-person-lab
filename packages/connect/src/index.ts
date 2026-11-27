export {
  ConnectError,
  ConnectProviderError,
  redactSensitiveText,
  type ConnectErrorCode,
  type ConnectErrorDisposition,
  type InvocationDisposition,
} from './errors.ts';

export {
  MIGRATION_0002_CONNECT,
  MIGRATION_0002_CONNECT_CHANNELS,
  ensureConnectSchema,
} from './migrations.ts';

export {
  ID_PATTERN,
  MAX_CAPABILITIES_PER_CONNECTION,
  MAX_CONNECT_DEPTH,
  MAX_CONNECT_JSON_BYTES,
  assertCredentialHandleOnlyPayload,
  assertNoSecretPayload,
  assertNoSecretValue,
  isForbiddenSecretKey,
  isProviderOwnedHandle,
  isVaultOwnedHandle,
  normalizeCapabilities,
  normalizeCredentialHandle,
  resolveCapabilityTitle,
  safeLabel,
  validateHttpEndpoint,
} from './sanitize.ts';

export {
  recordConnectAudit,
  requireTrustedHost,
} from './audit.ts';

export {
  InMemorySecretVault,
} from './vault/in-memory.ts';

export {
  EncryptedFileSecretVault,
  type EncryptedFileSecretVaultOptions,
} from './vault/encrypted-file.ts';

export {
  MacOsKeychainSecretVault,
  type KeychainCommandResult,
  type KeychainCommandRunner,
  type MacOsKeychainSecretVaultOptions,
} from './vault/macos-keychain.ts';

export {
  createDefaultSecretVault,
  type CreateDefaultSecretVaultOptions,
} from './vault/factory.ts';

export type {
  PutSecretInput,
  SecretBackendKind,
  SecretMetadata,
  SecretVault,
} from './vault/types.ts';

export {
  ConnectionRegistry,
  toProviderRef,
  type ConnectionRegistryOptions,
  type RawConnectionRow,
} from './registry/connection-registry.ts';

export {
  ConsumerBindTokenAuthority,
  loadVerifiedInstalledPackage,
  type ConsumerBindTokenAuthorityOptions,
  type RawInstalledPackageRow,
} from './auth/bind-token.ts';

export {
  ConnectAuthorizationService,
  type ConnectAuthorizationOptions,
} from './auth/authorization.ts';

export {
  createConnectService,
  type ConnectService,
  type CreateConnectServiceOptions,
} from './service.ts';

export type {
  AccessRequestResult,
  AddConnectionInput,
  ApproveRequestInput,
  CapabilityDescriptor,
  CapabilityInput,
  CapabilityRisk,
  CapabilityTitleI18n,
  CheckGrantInput,
  CheckGrantResult,
  ConnectAuditContext,
  ConnectAuditInput,
  ConnectAuditKind,
  ConnectChangeKind,
  ConnectChangedEvent,
  ConnectEventBus,
  ConnectEvents,
  ConnectProjection,
  ConnectionCheckResult,
  ConnectionProvider,
  ConnectionProviderRef,
  ConnectionStatus,
  ConnectionSummary,
  ConsumerBindTokenClaims,
  DenyRequestInput,
  GrantStatus,
  GrantSummary,
  InstalledPackageSnapshot,
  InvocationRecord,
  InvokeInput,
  InvokeResult,
  IssueBindTokenInput,
  IssuedConsumerBindToken,
  PackageConnectPort,
  RequestAccessInput,
  RevokeConnectionInput,
  RevokeInput,
  RotateCredentialInput,
  RuntimeDigestVerifier,
  UpdateCapabilitiesInput,
} from './types.ts';

export * from './channels/index.ts';

export {
  authorizeOplLinkCompanion,
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  useOplGatewayForModelAccess,
  withGatewayStateDirectory,
} from './gateway/account.ts';

export { configureGatewayCodexProvider, readLocalCodexAccessState, resolveCodexHome, withClientCodexHome } from './gateway/codex-binding.ts';
