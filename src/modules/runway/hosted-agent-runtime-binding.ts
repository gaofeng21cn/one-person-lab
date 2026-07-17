import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';
import {
  foundryContentDigest,
  type ActivationPointer,
  type ActivationTransaction,
  type AgentVersion,
  type VersionRegistry,
} from '../foundry/index.ts';
import { foundryStoragePaths, LedgerVersionRegistry } from '../ledger/index.ts';
import { packageLaunchHardStopReason } from './family-runtime-package-readiness.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';

const PROVENANCE_VERSION = 'opl-hosted-agent-runtime-binding-provenance.v1' as const;
const VERSION_REGISTRY_EPOCH_VERSION = 'opl-foundry-version-registry.v1' as const;
const VERSION_REGISTRY_EPOCH_DIRECTORY = 'epoch-v1';
const VERSION_REGISTRY_EPOCH_MARKER = 'registry-epoch.json';

type ManagedCheckout = Awaited<ReturnType<typeof resolveStandardAgentManagedCheckout>>;
type ManagedCheckoutResolver = typeof resolveStandardAgentManagedCheckout;

export type FoundryHostedAgentRuntimeBindingProvenance = {
  surface_kind: 'opl_hosted_agent_runtime_binding_provenance';
  version: typeof PROVENANCE_VERSION;
  source_kind: 'foundry_active_agent_version';
  target_agent_id: string;
  target_domain_id: string;
  active_version_id: string;
  active_version_digest: string;
  candidate_digest: string;
  candidate_ref: string;
  package_closure_digest: string;
  activation_revision: number;
  activation_updated_at: string;
  activation_transaction_kind: ActivationTransaction['transaction_kind'];
  prepared_runtime_binding_ref: string;
};

export type PackageHostedAgentRuntimeBindingProvenance = {
  surface_kind: 'opl_hosted_agent_runtime_binding_provenance';
  version: typeof PROVENANCE_VERSION;
  source_kind: 'managed_package_checkout';
  target_agent_id: string;
  target_domain_id: string;
  package_id: string;
  package_use_boundary_id: string;
  package_use_receipt_ref?: string;
  package_version: string;
  package_lock_ref: string;
  package_manifest_sha256?: string;
  package_content_digest: string;
  package_artifact_digest: string | null;
  package_dependency_closure_digest?: string;
  package_source_kind?: string;
};

export type HostedAgentRuntimeBindingProvenance =
  | FoundryHostedAgentRuntimeBindingProvenance
  | PackageHostedAgentRuntimeBindingProvenance;

export type HostedAgentRuntimeBindingSnapshot = Readonly<{
  source_kind: HostedAgentRuntimeBindingProvenance['source_kind'];
  checkout_root: string;
  workspace_root: string;
  agent_id: string;
  runtime_domain_id: string;
  target_domain_id: string;
  catalog_target_domain_ids: readonly string[];
  package_use_binding: unknown;
  provenance: Readonly<HostedAgentRuntimeBindingProvenance>;
  provenance_ref: string;
}>;

export type FoundryHostedAgentPackageUseBinding = Readonly<{
  surface_kind: 'opl_agent_package_use_binding.v1';
  binding_origin: 'foundry_active_agent_version';
  use_boundary_id: string;
  use_receipt_ref: string;
  root_package: Readonly<{
    package_id: string;
    package_version: string;
    owner_language_version: null;
    package_lock_ref: string;
    manifest_sha256: string;
    content_digest: string;
    source_artifact_ref: string;
    artifact_digest: string;
    owner_source_commit: null;
    carrier_authority: null;
  }>;
  provider_packages: readonly [];
  dependency_closure_digest: string;
  core_skill_tree_digest: null;
  skill_tree_digest: null;
}>;

export type FoundryHostedAgentCandidatePreflight = Readonly<{
  surface_kind: 'opl_foundry_hosted_agent_candidate_preflight';
  version: 'opl-foundry-hosted-agent-candidate-preflight.v1';
  status: 'ready';
  target_agent_id: string;
  target_domain_id: string;
  version_id: string;
  version_digest: string;
  candidate_digest: string;
  candidate_ref: string;
  checkout_root: string;
  workspace_root: string;
  catalog_target_domain_id: string;
  action_ids: readonly string[];
  package_use_binding: FoundryHostedAgentPackageUseBinding;
}>;

export interface HostedAgentRuntimeBindingResolver {
  resolve(input: { domainId: string; workspaceRoot: string }): Promise<HostedAgentRuntimeBindingSnapshot>;
  resolvePinned(input: {
    provenance: HostedAgentRuntimeBindingProvenance;
    provenance_ref: string;
    workspaceRoot: string;
  }): Promise<HostedAgentRuntimeBindingSnapshot>;
  preflightFoundryCandidate(input: {
    target_agent_id: string;
    target_domain_id: string;
    version: AgentVersion;
    candidate_directory: string;
    workspaceRoot: string;
  }): Promise<FoundryHostedAgentCandidatePreflight>;
}

type FoundryTargetLocator = {
  target_agent_id: string;
  target_domain_id: string;
  activation: ActivationPointer | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a non-empty string.`, { field });
  return value;
}

function requireDigest(value: unknown, field: string) {
  const digest = requireString(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a sha256 digest.`, { field });
  return digest;
}
function requirePackageDigest(value: unknown, field: string) {
  const digest = requireString(value, field);
  if (!/^(?:sha256:)?[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a package sha256 digest.`, { field });
  return digest;
}
function existingWorkspaceRoot(input: string) {
  if (!path.isAbsolute(input)) {
    fail('Hosted Agent action requires an absolute workspace root.', { workspace_root: input });
  }
  const workspaceRoot = path.resolve(input);
  if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    fail('Hosted Agent action requires an existing workspace root.', { workspace_root: input });
  }
  return fs.realpathSync.native(workspaceRoot);
}

function physicalDirectory(directory: string, label: string) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a physical directory.`);
  return fs.realpathSync.native(directory);
}

function readCanonicalRecord(file: string, label: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical JSON file.`);
  const bytes = fs.readFileSync(file);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!isRecord(value) || !bytes.equals(canonicalJsonBytes(value))) {
    fail(`${label} must contain one canonical JSON object.`);
  }
  return value;
}

function readRuntimePackJson(checkoutRoot: string, ref: string, label: string) {
  try {
    const resolved = resolveContainedRepoJsonFile(checkoutRoot, ref, label, 'hosted Agent runtime pack');
    const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
    if (!isRecord(parsed)) fail(`${label} must contain an object.`, { ref });
    return parsed;
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail(`${label} could not be resolved from the hosted Agent runtime pack.`, {
      ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function readHostedAgentRuntimeActionContracts(
  checkoutRoot: string,
  acceptedTargetDomainIds?: readonly string[],
) {
  let catalog: FamilyActionCatalog | null;
  let registry: DomainHandlerRegistry | null;
  try {
    catalog = normalizeFamilyActionCatalog(
      readRuntimePackJson(checkoutRoot, 'contracts/action_catalog.json', 'Hosted Agent action catalog'),
    );
    registry = fs.existsSync(path.join(checkoutRoot, 'contracts/domain_handler_registry.json'))
      ? normalizeDomainHandlerRegistry(
          readRuntimePackJson(
            checkoutRoot,
            'contracts/domain_handler_registry.json',
            'Hosted Agent handler registry',
          ),
        )
      : null;
    if (!catalog) fail('Hosted Agent action catalog is missing.');
    assertFamilyActionHandlerRefsResolve(catalog, registry);
    for (const action of catalog.actions) {
      if (!action.input_schema_ref.startsWith('opl://')) {
        readRuntimePackJson(checkoutRoot, action.input_schema_ref, `Hosted Agent action ${action.action_id} input schema`);
      }
      if (!action.output_schema_ref.startsWith('opl://')) {
        readRuntimePackJson(checkoutRoot, action.output_schema_ref, `Hosted Agent action ${action.action_id} output schema`);
      }
    }
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('Hosted Agent action contracts are invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (acceptedTargetDomainIds && !acceptedTargetDomainIds.includes(catalog!.target_domain_id)) {
    fail('Hosted Agent action catalog target does not match the runtime binding.', {
      accepted_target_domain_ids: acceptedTargetDomainIds,
      catalog_target_domain_id: catalog!.target_domain_id,
    });
  }
  return { catalog: catalog!, registry };
}

function targetStorageKey(agentId: string, domainId: string) {
  return sha256(`${agentId}\0${domainId}`);
}

function locatorIdentity(value: Record<string, unknown>, label: string) {
  const targetAgentId = requireString(value.target_agent_id, `${label}.target_agent_id`);
  const targetDomainId = requireString(value.target_domain_id, `${label}.target_domain_id`);
  return { target_agent_id: targetAgentId, target_domain_id: targetDomainId };
}

function readRegistryEpochLocator(directory: string) {
  const markerFile = path.join(directory, VERSION_REGISTRY_EPOCH_MARKER);
  if (!fs.existsSync(markerFile)) {
    fail('Foundry version registry epoch marker is missing.', { registry_directory: directory });
  }
  const value = readCanonicalRecord(markerFile, 'Foundry version registry epoch marker');
  const expectedFields = ['surface_kind', 'target_agent_id', 'target_domain_id', 'version'];
  if (
    canonicalJsonText(Object.keys(value).sort()) !== canonicalJsonText(expectedFields)
    || value.surface_kind !== 'opl_foundry_version_registry_epoch'
    || value.version !== VERSION_REGISTRY_EPOCH_VERSION
  ) {
    fail('Foundry version registry epoch marker is invalid.', { registry_directory: directory });
  }
  return locatorIdentity(value, 'Foundry version registry epoch marker');
}

function readActivationLocator(file: string) {
  const value = readCanonicalRecord(file, 'Foundry ActivationPointer locator');
  const identity = locatorIdentity(value, 'ActivationPointer');
  const activeVersionDigest = value.active_version_digest === null
    ? null
    : requireDigest(value.active_version_digest, 'ActivationPointer.active_version_digest');
  if (
    value.surface_kind !== 'opl_foundry_activation_pointer'
    || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0
    || (value.updated_at !== null && (typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))))
  ) {
    fail('Foundry ActivationPointer locator is invalid.');
  }
  return {
    ...identity,
    activation: {
      surface_kind: 'opl_foundry_activation_pointer' as const,
      ...identity,
      active_version_digest: activeVersionDigest,
      revision: value.revision as number,
      updated_at: value.updated_at as string | null,
    },
  };
}

function readVersionLocator(directory: string) {
  if (!fs.existsSync(directory)) return [];
  const realDirectory = physicalDirectory(directory, 'Foundry AgentVersion locator');
  return fs.readdirSync(realDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) {
        fail('Foundry AgentVersion locator contains a forbidden entry.', { entry: entry.name });
      }
      const value = readCanonicalRecord(path.join(realDirectory, entry.name), 'Foundry AgentVersion locator');
      if (value.surface_kind !== 'opl_foundry_agent_version') fail('Foundry AgentVersion locator surface is invalid.');
      return locatorIdentity(value, 'AgentVersion');
    });
}

function scanFoundryTargetLocators(rootOverride?: string) {
  const registryRoot = foundryStoragePaths(rootOverride).registry;
  if (!fs.existsSync(registryRoot)) return [];
  const realRegistryRoot = physicalDirectory(registryRoot, 'Foundry version registry locator');
  return fs.readdirSync(realRegistryRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry): FoundryTargetLocator => {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(entry.name)) {
        fail('Foundry version registry locator contains a forbidden entry.', { entry: entry.name });
      }
      const targetDirectory = physicalDirectory(
        path.join(realRegistryRoot, entry.name),
        'Foundry version registry target locator',
      );
      const targetEntries = fs.readdirSync(targetDirectory, { withFileTypes: true });
      if (
        targetEntries.length !== 1
        || targetEntries[0]?.name !== VERSION_REGISTRY_EPOCH_DIRECTORY
        || !targetEntries[0].isDirectory()
        || targetEntries[0].isSymbolicLink()
      ) {
        fail('Foundry version registry target locator must contain only the current epoch.', {
          registry_key: entry.name,
          entries: targetEntries.map((candidate) => candidate.name).sort(),
        });
      }
      const directory = physicalDirectory(
        path.join(targetDirectory, VERSION_REGISTRY_EPOCH_DIRECTORY),
        'Foundry version registry epoch locator',
      );
      const allowedEpochEntries = new Set([
        VERSION_REGISTRY_EPOCH_MARKER,
        'activation.json',
        'agent-versions',
        'qualifications',
        'activation-transactions',
      ]);
      const forbiddenEpochEntries = fs.readdirSync(directory)
        .filter((candidate) => !allowedEpochEntries.has(candidate))
        .sort();
      if (forbiddenEpochEntries.length > 0) {
        fail('Foundry version registry epoch locator contains forbidden entries.', {
          registry_key: entry.name,
          entries: forbiddenEpochEntries,
        });
      }
      const epochLocator = readRegistryEpochLocator(directory);
      const activationFile = path.join(directory, 'activation.json');
      const activationLocator = fs.existsSync(activationFile) ? readActivationLocator(activationFile) : null;
      const versionLocators = readVersionLocator(path.join(directory, 'agent-versions'));
      const identities = [
        epochLocator,
        ...(activationLocator ? [activationLocator] : []),
        ...versionLocators,
      ];
      const identity = identities[0]!;
      if (identities.some((candidate) => (
        candidate.target_agent_id !== identity.target_agent_id
        || candidate.target_domain_id !== identity.target_domain_id
      ))) {
        fail('Foundry version registry locator contains mixed target identities.', { registry_key: entry.name });
      }
      if (entry.name !== targetStorageKey(identity.target_agent_id, identity.target_domain_id)) {
        fail('Foundry version registry locator address does not match its target identity.', {
          registry_key: entry.name,
          target_agent_id: identity.target_agent_id,
          target_domain_id: identity.target_domain_id,
        });
      }
      return {
        ...identity,
        activation: activationLocator?.activation ?? null,
      };
    });
}

function provenanceRef(provenance: HostedAgentRuntimeBindingProvenance) {
  return `opl://hosted-agent-runtime-binding/sha256/${sha256(canonicalJsonText(provenance))}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

function freezeSnapshot(input: Omit<HostedAgentRuntimeBindingSnapshot, 'provenance' | 'catalog_target_domain_ids'> & {
  provenance: HostedAgentRuntimeBindingProvenance;
  catalog_target_domain_ids: string[];
}) {
  const provenance = Object.freeze({ ...input.provenance });
  return Object.freeze({
    ...input,
    catalog_target_domain_ids: Object.freeze([...input.catalog_target_domain_ids]),
    package_use_binding: input.package_use_binding === null || input.package_use_binding === undefined
      ? input.package_use_binding
      : deepFreeze(structuredClone(input.package_use_binding)),
    provenance,
  }) as HostedAgentRuntimeBindingSnapshot;
}

function exactCandidateDirectory(rootOverride: string | undefined, version: AgentVersion) {
  requireDigest(version.candidate_digest, 'AgentVersion.candidate_digest');
  const candidates = foundryStoragePaths(rootOverride).candidates;
  const realCandidateRoot = physicalDirectory(candidates, 'Foundry candidate root');
  const directory = path.join(realCandidateRoot, version.candidate_digest.slice('sha256:'.length));
  if (!fs.existsSync(directory)) {
    fail('Active Foundry AgentVersion candidate bytes are missing.', { candidate_digest: version.candidate_digest });
  }
  const realDirectory = physicalDirectory(directory, 'Active Foundry candidate directory');
  if (!realDirectory.startsWith(`${realCandidateRoot}${path.sep}`)) {
    fail('Active Foundry candidate directory escapes immutable storage.', { candidate_digest: version.candidate_digest });
  }
  return realDirectory;
}

function foundryPackageUseBinding(
  version: AgentVersion,
  candidateDirectory: string,
): FoundryHostedAgentPackageUseBinding {
  const manifestFile = path.join(candidateDirectory, 'agent/agent-pack.json');
  const manifest = readCanonicalRecord(manifestFile, 'Foundry hosted Agent Pack manifest');
  if (
    manifest.surface_kind !== 'opl_foundry_agent_pack'
    || manifest.target_agent_id !== version.target_agent_id
    || manifest.target_domain_id !== version.target_domain_id
    || manifest.blueprint_digest !== version.blueprint_digest
  ) {
    fail('Foundry hosted Agent Pack manifest identity does not match AgentVersion.', {
      version_digest: version.version_digest,
    });
  }
  const manifestSha256 = `sha256:${sha256(fs.readFileSync(manifestFile))}`;
  const closureIdentity = {
    surface_kind: 'opl_foundry_hosted_agent_package_closure',
    version: 'opl-foundry-hosted-agent-package-closure.v1',
    target_agent_id: version.target_agent_id,
    target_domain_id: version.target_domain_id,
    version_id: version.version_id,
    version_digest: version.version_digest,
    candidate_digest: version.candidate_digest,
    candidate_ref: version.candidate_ref,
    manifest_sha256: manifestSha256,
  };
  const closureDigest = `sha256:${sha256(canonicalJsonText(closureIdentity))}`;
  const versionHash = version.version_digest.slice('sha256:'.length);
  return deepFreeze({
    surface_kind: 'opl_agent_package_use_binding.v1' as const,
    binding_origin: 'foundry_active_agent_version' as const,
    use_boundary_id: `foundry-package-use:${versionHash}`,
    use_receipt_ref: `opl://foundry/runtime-binding/sha256/${versionHash}`,
    root_package: {
      package_id: version.target_agent_id,
      package_version: version.version_id,
      owner_language_version: null,
      package_lock_ref: `opl://foundry/agent-version/sha256/${versionHash}`,
      manifest_sha256: manifestSha256,
      content_digest: version.candidate_digest,
      source_artifact_ref: version.candidate_ref,
      artifact_digest: version.candidate_digest,
      owner_source_commit: null,
      carrier_authority: null,
    },
    provider_packages: [] as const,
    dependency_closure_digest: closureDigest,
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  });
}

export function foundryPreparedRuntimeBindingRef(input: {
  transaction_kind: ActivationTransaction['transaction_kind'];
  expected_activation_revision: number;
  target_agent_id: string;
  target_domain_id: string;
  version_id: string;
  version_digest: string;
  candidate_digest: string;
  candidate_ref: string;
  catalog_target_domain_id: string;
  action_ids: readonly string[];
  package_use_binding: FoundryHostedAgentPackageUseBinding;
}) {
  const identity = {
    surface_kind: 'opl_foundry_prepared_runtime_binding' as const,
    version: 'opl-foundry-prepared-runtime-binding.v1' as const,
    transaction_kind: input.transaction_kind,
    expected_activation_revision: input.expected_activation_revision,
    target_agent_id: input.target_agent_id,
    target_domain_id: input.target_domain_id,
    version_id: input.version_id,
    version_digest: input.version_digest,
    candidate_digest: input.candidate_digest,
    candidate_ref: input.candidate_ref,
    catalog_target_domain_id: input.catalog_target_domain_id,
    action_ids: [...input.action_ids],
    package_use_binding: input.package_use_binding,
  };
  return `opl://foundry/prepared-runtime-bindings/${foundryContentDigest(identity)}`;
}

function activationTransactionForRevision(input: {
  history: ActivationTransaction[];
  target_agent_id: string;
  target_domain_id: string;
  version_digest: string;
  revision: number;
  updated_at: string;
}) {
  const transaction = input.history.find((entry) => entry.next_revision === input.revision);
  if (
    !transaction
    || transaction.target_agent_id !== input.target_agent_id
    || transaction.target_domain_id !== input.target_domain_id
    || transaction.previous_revision !== input.revision - 1
    || transaction.to_version_digest !== input.version_digest
    || transaction.occurred_at !== input.updated_at
  ) {
    fail('Foundry serving activation history does not match the requested runtime binding.', {
      target_agent_id: input.target_agent_id,
      target_domain_id: input.target_domain_id,
      activation_revision: input.revision,
      version_digest: input.version_digest,
    });
  }
  return transaction;
}

function durablePreparedRuntimeBindingRef(input: {
  transaction: ActivationTransaction;
  version: AgentVersion;
  recomputed_ref: string;
}) {
  const verification = input.transaction.runtime_binding_verification;
  if (
    !verification
    || verification.surface_kind !== 'opl_foundry_activation_runtime_binding_verification'
    || verification.version !== 'opl-foundry-activation-runtime-binding-verification.v1'
    || verification.verification_phase !== 'pre_commit'
    || verification.transaction_kind !== input.transaction.transaction_kind
    || verification.target_agent_id !== input.transaction.target_agent_id
    || verification.target_domain_id !== input.transaction.target_domain_id
    || verification.version_id !== input.version.version_id
    || verification.version_digest !== input.transaction.to_version_digest
    || verification.version_digest !== input.version.version_digest
    || verification.candidate_digest !== input.version.candidate_digest
    || verification.candidate_ref !== input.version.candidate_ref
    || verification.expected_activation_revision !== input.transaction.previous_revision
    || typeof verification.preflight_ref !== 'string'
    || verification.preflight_ref.length === 0
    || typeof verification.runtime_binding_ref !== 'string'
    || !verification.runtime_binding_ref.startsWith('opl://foundry/prepared-runtime-bindings/')
    || verification.runtime_binding_ref !== input.recomputed_ref
  ) {
    fail('Durable activation runtime binding verification does not match the exact serving AgentVersion.', {
      transaction_id: input.transaction.transaction_id,
      version_digest: input.version.version_digest,
    });
  }
  return verification.runtime_binding_ref;
}

function requiredRecord(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be an object.`, { field });
  return value;
}
function managedPackageProvenance(managed: ManagedCheckout): PackageHostedAgentRuntimeBindingProvenance {
  const packageStatus = requiredRecord(managed.package_status, 'package_status');
  const sourceReadiness = requiredRecord(packageStatus.runtime_source_readiness, 'runtime_source_readiness');
  const useBinding = requiredRecord(managed.package_use_binding, 'package_use_binding');
  const rootPackage = requiredRecord(useBinding.root_package, 'package_use_binding.root_package');
  const launchHardStop = packageLaunchHardStopReason(packageStatus);
  const readinessCheckoutRoot = fs.realpathSync.native(requireString(sourceReadiness.checkout_path, 'checkout_path'));
  if (
    managed.package_id !== managed.agent.agent_id
    || launchHardStop !== null
    || sourceReadiness?.operational_ready !== true
    || readinessCheckoutRoot !== managed.checkout_root
    || useBinding.surface_kind !== 'opl_agent_package_use_binding.v1'
    || requireString(useBinding.use_boundary_id, 'package_use_binding.use_boundary_id')
      !== managed.use_boundary_id
    || requireString(rootPackage.package_id, 'package_use_binding.root_package.package_id')
      !== managed.package_id
  ) {
    fail('Managed checkout, readiness, and package-use identities must resolve as one launchable binding.', {
      package_id: managed.package_id,
      agent_id: managed.agent.agent_id,
      launch_blocked_reason: launchHardStop,
      use_boundary_id: managed.use_boundary_id,
    });
  }
  const packageSourceKind = requireString(rootPackage.source_kind, 'root_package.source_kind');
  if (!['first_party_managed_cohort', 'bundled_full_runtime_modules', 'local_manifest_file',
    'manifest_url', 'manifest_import', 'developer_checkout_override',
  ].includes(packageSourceKind)) fail('root_package.source_kind is not supported.', { package_source_kind: packageSourceKind });
  const artifactDigest = rootPackage.artifact_digest === null && packageSourceKind === 'developer_checkout_override'
    ? null
    : requirePackageDigest(rootPackage.artifact_digest, 'root_package.artifact_digest');
  return {
    surface_kind: 'opl_hosted_agent_runtime_binding_provenance',
    version: PROVENANCE_VERSION,
    source_kind: 'managed_package_checkout',
    target_agent_id: managed.agent.agent_id,
    target_domain_id: managed.agent.target_domain_id,
    package_id: managed.package_id,
    package_use_boundary_id: managed.use_boundary_id,
    package_use_receipt_ref: requireString(useBinding.use_receipt_ref, 'package_use_binding.use_receipt_ref'),
    package_version: requireString(rootPackage.package_version, 'package_use_binding.root_package.package_version'),
    package_lock_ref: requireString(rootPackage.package_lock_ref, 'package_use_binding.root_package.package_lock_ref'),
    package_manifest_sha256: requirePackageDigest(rootPackage.manifest_sha256, 'root_package.manifest_sha256'),
    package_content_digest: requirePackageDigest(rootPackage.content_digest, 'root_package.content_digest'),
    package_artifact_digest: artifactDigest,
    package_dependency_closure_digest: requirePackageDigest(useBinding.dependency_closure_digest, 'dependency_closure_digest'),
    package_source_kind: packageSourceKind,
  };
}

export function hostedRuntimeExecutionBindingRef(
  binding: Pick<HostedAgentRuntimeBindingSnapshot, 'provenance_ref'>,
  executionBindingRef: string,
) {
  return `${binding.provenance_ref}?execution_binding=${encodeURIComponent(executionBindingRef)}`;
}

export class DefaultHostedAgentRuntimeBindingResolver implements HostedAgentRuntimeBindingResolver {
  readonly #rootOverride: string | undefined;
  readonly #resolveManagedCheckout: ManagedCheckoutResolver;
  readonly #registryFactory: (rootOverride?: string) => VersionRegistry;

  constructor(input: {
    root_override?: string;
    resolve_managed_checkout?: ManagedCheckoutResolver;
    registry_factory?: (rootOverride?: string) => VersionRegistry;
  } = {}) {
    this.#rootOverride = input.root_override;
    this.#resolveManagedCheckout = input.resolve_managed_checkout ?? resolveStandardAgentManagedCheckout;
    this.#registryFactory = input.registry_factory ?? ((rootOverride) => new LedgerVersionRegistry(rootOverride));
  }

  async preflightFoundryCandidate(input: {
    target_agent_id: string;
    target_domain_id: string;
    version: AgentVersion;
    candidate_directory: string;
    workspaceRoot: string;
  }) {
    const targetAgentId = requireString(input.target_agent_id, 'target_agent_id');
    const targetDomainId = requireString(input.target_domain_id, 'target_domain_id');
    if (!path.isAbsolute(input.workspaceRoot) || !path.isAbsolute(input.candidate_directory)) {
      fail('Foundry hosted candidate preflight requires absolute workspace and candidate directories.');
    }
    const workspaceRoot = path.resolve(input.workspaceRoot);
    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      fail('Foundry hosted candidate preflight requires an existing workspace root.', {
        workspace_root: input.workspaceRoot,
      });
    }
    if (
      input.version.target_agent_id !== targetAgentId
      || input.version.target_domain_id !== targetDomainId
    ) {
      fail('Foundry hosted candidate preflight AgentVersion target identity is inconsistent.');
    }
    const registry = this.#registryFactory(this.#rootOverride);
    const version = await registry.resolveVersion(input.version.version_digest, targetAgentId, targetDomainId);
    if (!version || canonicalJsonText(version) !== canonicalJsonText(input.version)) {
      fail('Foundry hosted candidate preflight requires the exact registered AgentVersion.', {
        version_digest: input.version.version_digest,
      });
    }
    const exactDirectory = exactCandidateDirectory(this.#rootOverride, version);
    const suppliedDirectory = physicalDirectory(input.candidate_directory, 'Foundry hosted candidate preflight directory');
    if (suppliedDirectory !== exactDirectory) {
      fail('Foundry hosted candidate preflight directory does not match the exact AgentVersion.', {
        version_digest: version.version_digest,
      });
    }
    const { catalog } = readHostedAgentRuntimeActionContracts(exactDirectory, [targetDomainId]);
    const packageUseBinding = foundryPackageUseBinding(version, exactDirectory);
    return Object.freeze({
      surface_kind: 'opl_foundry_hosted_agent_candidate_preflight' as const,
      version: 'opl-foundry-hosted-agent-candidate-preflight.v1' as const,
      status: 'ready' as const,
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      version_id: version.version_id,
      version_digest: version.version_digest,
      candidate_digest: version.candidate_digest,
      candidate_ref: version.candidate_ref,
      checkout_root: exactDirectory,
      workspace_root: fs.realpathSync.native(workspaceRoot),
      catalog_target_domain_id: catalog.target_domain_id,
      action_ids: Object.freeze(catalog.actions.map((action) => action.action_id)),
      package_use_binding: packageUseBinding,
    });
  }

  async resolvePinned(input: {
    provenance: HostedAgentRuntimeBindingProvenance;
    provenance_ref: string;
    workspaceRoot: string;
  }) {
    const workspaceRoot = existingWorkspaceRoot(input.workspaceRoot);
    const provenance = input.provenance;
    if (
      provenance.surface_kind !== 'opl_hosted_agent_runtime_binding_provenance'
      || provenance.version !== PROVENANCE_VERSION
      || input.provenance_ref !== provenanceRef(provenance)
    ) {
      fail('Pinned hosted Agent runtime provenance is invalid.', {
        provenance_ref: input.provenance_ref,
      });
    }

    if (provenance.source_kind === 'foundry_active_agent_version') {
      const targetAgentId = requireString(provenance.target_agent_id, 'provenance.target_agent_id');
      const targetDomainId = requireString(provenance.target_domain_id, 'provenance.target_domain_id');
      requireDigest(provenance.active_version_digest, 'provenance.active_version_digest');
      requireDigest(provenance.candidate_digest, 'provenance.candidate_digest');
      requireDigest(provenance.package_closure_digest, 'provenance.package_closure_digest');
      if (
        !Number.isSafeInteger(provenance.activation_revision)
        || provenance.activation_revision < 1
        || !Number.isFinite(Date.parse(provenance.activation_updated_at))
        || !['activate', 'rollback'].includes(provenance.activation_transaction_kind)
        || typeof provenance.prepared_runtime_binding_ref !== 'string'
        || !provenance.prepared_runtime_binding_ref.startsWith('opl://foundry/prepared-runtime-bindings/')
      ) {
        fail('Pinned Foundry runtime activation provenance is invalid.');
      }
      const registry = this.#registryFactory(this.#rootOverride);
      const version = await registry.resolveVersion(
        provenance.active_version_digest,
        targetAgentId,
        targetDomainId,
      );
      if (
        !version
        || version.version_id !== provenance.active_version_id
        || version.version_digest !== provenance.active_version_digest
        || version.candidate_digest !== provenance.candidate_digest
        || version.candidate_ref !== provenance.candidate_ref
      ) {
        fail('Pinned Foundry AgentVersion cannot be resolved exactly.', {
          active_version_digest: provenance.active_version_digest,
        });
      }
      const checkoutRoot = exactCandidateDirectory(this.#rootOverride, version);
      const packageUseBinding = foundryPackageUseBinding(version, checkoutRoot);
      if (packageUseBinding.dependency_closure_digest !== provenance.package_closure_digest) {
        fail('Pinned Foundry package closure no longer matches its runtime provenance.', {
          active_version_digest: provenance.active_version_digest,
        });
      }
      const { catalog } = readHostedAgentRuntimeActionContracts(checkoutRoot, [targetDomainId]);
      const transaction = activationTransactionForRevision({
        history: await registry.activationHistory(targetAgentId, targetDomainId),
        target_agent_id: targetAgentId,
        target_domain_id: targetDomainId,
        version_digest: version.version_digest,
        revision: provenance.activation_revision,
        updated_at: provenance.activation_updated_at,
      });
      const preparedRuntimeBindingRef = foundryPreparedRuntimeBindingRef({
        transaction_kind: transaction.transaction_kind,
        expected_activation_revision: transaction.previous_revision,
        target_agent_id: targetAgentId,
        target_domain_id: targetDomainId,
        version_id: version.version_id,
        version_digest: version.version_digest,
        candidate_digest: version.candidate_digest,
        candidate_ref: version.candidate_ref,
        catalog_target_domain_id: catalog.target_domain_id,
        action_ids: catalog.actions.map((action) => action.action_id),
        package_use_binding: packageUseBinding,
      });
      const durablePreparedBindingRef = durablePreparedRuntimeBindingRef({
        transaction,
        version,
        recomputed_ref: preparedRuntimeBindingRef,
      });
      if (
        transaction.transaction_kind !== provenance.activation_transaction_kind
        || durablePreparedBindingRef !== provenance.prepared_runtime_binding_ref
      ) {
        fail('Pinned Foundry prepared runtime binding provenance does not verify.', {
          active_version_digest: provenance.active_version_digest,
          prepared_runtime_binding_ref: provenance.prepared_runtime_binding_ref,
        });
      }
      return freezeSnapshot({
        source_kind: provenance.source_kind,
        checkout_root: checkoutRoot,
        workspace_root: workspaceRoot,
        agent_id: targetAgentId,
        runtime_domain_id: targetDomainId,
        target_domain_id: targetDomainId,
        catalog_target_domain_ids: [targetDomainId],
        package_use_binding: packageUseBinding,
        provenance,
        provenance_ref: input.provenance_ref,
      });
    }

    const targetAgentId = requireString(provenance.target_agent_id, 'provenance.target_agent_id');
    if (provenance.package_id !== targetAgentId) {
      fail('Pinned managed package provenance does not match its Standard Agent identity.', {
        target_agent_id: targetAgentId,
        package_id: provenance.package_id,
      });
    }
    const packageUseBoundaryId = requireString(provenance.package_use_boundary_id, 'provenance.package_use_boundary_id');
    const managed = await this.#resolveManagedCheckout({
      domainId: targetAgentId,
      workspaceRoot,
      useBoundaryId: packageUseBoundaryId,
    });
    const resolvedProvenance = managedPackageProvenance(managed);
    if (canonicalJsonText(resolvedProvenance) !== canonicalJsonText(provenance)) {
      fail('Pinned managed package runtime binding is no longer resolvable exactly.', {
        package_id: provenance.package_id,
        pinned_provenance_ref: input.provenance_ref,
      });
    }
    return freezeSnapshot({
      source_kind: provenance.source_kind,
      checkout_root: managed.checkout_root,
      workspace_root: managed.workspace_root,
      agent_id: managed.agent.agent_id,
      runtime_domain_id: managed.agent.domain_id,
      target_domain_id: managed.agent.target_domain_id,
      catalog_target_domain_ids: [
        managed.agent.target_domain_id,
        managed.agent.domain_id,
        managed.agent.agent_id,
        ...managed.agent.aliases,
      ],
      package_use_binding: managed.package_use_binding,
      provenance,
      provenance_ref: input.provenance_ref,
    });
  }

  async resolve(input: { domainId: string; workspaceRoot: string }) {
    const workspaceRoot = existingWorkspaceRoot(input.workspaceRoot);
    const requestedTarget = requireString(input.domainId.trim(), 'domain_id');
    const matches = scanFoundryTargetLocators(this.#rootOverride).filter((locator) => (
      locator.target_agent_id === requestedTarget || locator.target_domain_id === requestedTarget
    ));
    if (matches.length > 1) {
      fail('Hosted Agent target is ambiguous across Foundry registry identities.', {
        requested_target: requestedTarget,
        matching_targets: matches.map(({ target_agent_id, target_domain_id }) => ({ target_agent_id, target_domain_id })),
      });
    }
    const located = matches[0];
    if (located) {
      const registry = this.#registryFactory(this.#rootOverride);
      const activation = await registry.activation(located.target_agent_id, located.target_domain_id);
      if (
        activation.target_agent_id !== located.target_agent_id
        || activation.target_domain_id !== located.target_domain_id
      ) {
        fail('Foundry ActivationPointer identity changed during hosted binding resolution.', {
          requested_target: requestedTarget,
        });
      }
      if (activation.active_version_digest !== null) {
        const version = await registry.resolveVersion(
          activation.active_version_digest,
          located.target_agent_id,
          located.target_domain_id,
        );
        if (!version || version.version_digest !== activation.active_version_digest) {
          fail('Active Foundry AgentVersion cannot be resolved exactly.', {
            active_version_digest: activation.active_version_digest,
          });
        }
        if (
          version.target_agent_id !== located.target_agent_id
          || version.target_domain_id !== located.target_domain_id
          || version.candidate_ref !== `opl://foundry/candidate/${version.candidate_digest}`
        ) {
          fail('Active Foundry AgentVersion identity is inconsistent with its ActivationPointer.', {
            active_version_digest: activation.active_version_digest,
          });
        }
        if (activation.updated_at === null) {
          fail('Active Foundry ActivationPointer is missing its update timestamp.');
        }
        const checkoutRoot = exactCandidateDirectory(this.#rootOverride, version);
        const packageUseBinding = foundryPackageUseBinding(version, checkoutRoot);
        const { catalog } = readHostedAgentRuntimeActionContracts(checkoutRoot, [version.target_domain_id]);
        const transaction = activationTransactionForRevision({
          history: await registry.activationHistory(located.target_agent_id, located.target_domain_id),
          target_agent_id: located.target_agent_id,
          target_domain_id: located.target_domain_id,
          version_digest: version.version_digest,
          revision: activation.revision,
          updated_at: activation.updated_at,
        });
        const preparedRuntimeBindingRef = foundryPreparedRuntimeBindingRef({
          transaction_kind: transaction.transaction_kind,
          expected_activation_revision: transaction.previous_revision,
          target_agent_id: version.target_agent_id,
          target_domain_id: version.target_domain_id,
          version_id: version.version_id,
          version_digest: version.version_digest,
          candidate_digest: version.candidate_digest,
          candidate_ref: version.candidate_ref,
          catalog_target_domain_id: catalog.target_domain_id,
          action_ids: catalog.actions.map((action) => action.action_id),
          package_use_binding: packageUseBinding,
        });
        const durablePreparedBindingRef = durablePreparedRuntimeBindingRef({
          transaction,
          version,
          recomputed_ref: preparedRuntimeBindingRef,
        });
        const provenance: FoundryHostedAgentRuntimeBindingProvenance = {
          surface_kind: 'opl_hosted_agent_runtime_binding_provenance',
          version: PROVENANCE_VERSION,
          source_kind: 'foundry_active_agent_version',
          target_agent_id: version.target_agent_id,
          target_domain_id: version.target_domain_id,
          active_version_id: version.version_id,
          active_version_digest: version.version_digest,
          candidate_digest: version.candidate_digest,
          candidate_ref: version.candidate_ref,
          package_closure_digest: packageUseBinding.dependency_closure_digest,
          activation_revision: activation.revision,
          activation_updated_at: activation.updated_at,
          activation_transaction_kind: transaction.transaction_kind,
          prepared_runtime_binding_ref: durablePreparedBindingRef,
        };
        return freezeSnapshot({
          source_kind: provenance.source_kind,
          checkout_root: checkoutRoot,
          workspace_root: workspaceRoot,
          agent_id: version.target_agent_id,
          runtime_domain_id: version.target_domain_id,
          target_domain_id: version.target_domain_id,
          catalog_target_domain_ids: [version.target_domain_id],
          package_use_binding: packageUseBinding,
          provenance,
          provenance_ref: provenanceRef(provenance),
        });
      }
    }

    const managed = await this.#resolveManagedCheckout({
      domainId: input.domainId,
      workspaceRoot,
    });
    const provenance = managedPackageProvenance(managed);
    return freezeSnapshot({
      source_kind: provenance.source_kind,
      checkout_root: managed.checkout_root,
      workspace_root: managed.workspace_root,
      agent_id: managed.agent.agent_id,
      runtime_domain_id: managed.agent.domain_id,
      target_domain_id: managed.agent.target_domain_id,
      catalog_target_domain_ids: [
        managed.agent.target_domain_id,
        managed.agent.domain_id,
        managed.agent.agent_id,
        ...managed.agent.aliases,
      ],
      package_use_binding: managed.package_use_binding,
      provenance,
      provenance_ref: provenanceRef(provenance),
    });
  }
}
