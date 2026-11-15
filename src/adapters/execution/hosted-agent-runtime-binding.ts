import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  type AgentVersion,
  type VersionRegistry,
} from '../../authority/evolution/index.ts';
import { LedgerVersionRegistry } from '../../authority/evidence/index.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';
import {
  existingWorkspaceRoot,
  fail,
  freezeSnapshot,
  physicalDirectory,
  provenanceRef,
  requireDigest,
  requireString,
  PROVENANCE_VERSION,
  type FoundryHostedAgentCandidatePreflight,
  type FoundryHostedAgentPackageUseBinding,
  type FoundryHostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingResolver,
  type HostedAgentRuntimeBindingSnapshot,
  type InstalledNativeHostedAgentRuntimeBindingProvenance,
} from './hosted-agent-runtime-binding-contract.ts';
import { readHostedAgentRuntimeActionContracts } from './hosted-agent-runtime-binding-action-contracts.ts';
import { exactCandidateDirectory, scanFoundryTargetLocators } from './hosted-agent-runtime-binding-locators.ts';
import {
  activationTransactionForRevision,
  durablePreparedRuntimeBindingRef,
  foundryPackageUseBinding,
  foundryPreparedRuntimeBindingRef,
  installedNativeProvenance,
} from './hosted-agent-runtime-binding-provenance.ts';

type ManagedCheckoutResolver = typeof resolveStandardAgentManagedCheckout;

export type {
  FoundryHostedAgentCandidatePreflight,
  FoundryHostedAgentPackageUseBinding,
  FoundryHostedAgentRuntimeBindingProvenance,
  HostedAgentRuntimeBindingProvenance,
  HostedAgentRuntimeBindingResolver,
  HostedAgentRuntimeBindingSnapshot,
  InstalledNativeHostedAgentRuntimeBindingProvenance,
};
export { readHostedAgentRuntimeActionContracts, foundryPreparedRuntimeBindingRef };

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
  }): Promise<FoundryHostedAgentCandidatePreflight> {
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
  }): Promise<HostedAgentRuntimeBindingSnapshot> {
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
      fail('Pinned Package provenance does not match its Standard Agent identity.', {
        target_agent_id: targetAgentId,
        package_id: provenance.package_id,
      });
    }
    const managed = await this.#resolveManagedCheckout({
      domainId: targetAgentId,
      workspaceRoot,
    });
    const resolvedProvenance = installedNativeProvenance(managed);
    if (canonicalJsonText(resolvedProvenance) !== canonicalJsonText(provenance)) {
      fail('Pinned Package runtime binding is no longer resolvable exactly.', {
        package_id: provenance.package_id,
        pinned_provenance_ref: input.provenance_ref,
      });
    }
    return freezeSnapshot({
      source_kind: provenance.source_kind,
      checkout_root: managed.checkout_root,
      workspace_root: managed.workspace_root,
      agent_id: managed.agent.agent_id,
      runtime_domain_id: managed.agent.target_domain_id,
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

  async resolve(input: { domainId: string; workspaceRoot: string }): Promise<HostedAgentRuntimeBindingSnapshot> {
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
    const provenance = installedNativeProvenance(managed);
    return freezeSnapshot({
      source_kind: provenance.source_kind,
      checkout_root: managed.checkout_root,
      workspace_root: managed.workspace_root,
      agent_id: managed.agent.agent_id,
      runtime_domain_id: managed.agent.target_domain_id,
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
