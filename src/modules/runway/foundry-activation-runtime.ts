import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  foundryContentDigest,
  type ActivationRuntime,
  type AgentVersion,
} from '../foundry/index.ts';
import type {
  FoundryHostedAgentCandidatePreflight,
  FoundryHostedAgentRuntimeBindingProvenance,
  HostedAgentRuntimeBindingResolver,
} from './hosted-agent-runtime-binding.ts';
import { foundryPreparedRuntimeBindingRef } from './hosted-agent-runtime-binding.ts';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function assertPreflightIdentity(preflight: FoundryHostedAgentCandidatePreflight, version: AgentVersion) {
  const packageBinding = preflight.package_use_binding;
  const rootPackage = packageBinding.root_package;
  if (
    preflight.status !== 'ready'
    || preflight.target_agent_id !== version.target_agent_id
    || preflight.target_domain_id !== version.target_domain_id
    || preflight.version_id !== version.version_id
    || preflight.version_digest !== version.version_digest
    || preflight.candidate_digest !== version.candidate_digest
    || preflight.candidate_ref !== version.candidate_ref
    || preflight.catalog_target_domain_id !== version.target_domain_id
    || preflight.action_ids.length === 0
    || new Set(preflight.action_ids).size !== preflight.action_ids.length
    || packageBinding.binding_origin !== 'foundry_active_agent_version'
    || packageBinding.provider_packages.length !== 0
    || !/^sha256:[a-f0-9]{64}$/.test(packageBinding.dependency_closure_digest)
    || rootPackage.package_id !== version.target_agent_id
    || rootPackage.package_version !== version.version_id
    || rootPackage.content_digest !== version.candidate_digest
    || rootPackage.source_artifact_ref !== version.candidate_ref
    || rootPackage.artifact_digest !== version.candidate_digest
    || !rootPackage.package_lock_ref.trim()
    || !/^sha256:[a-f0-9]{64}$/.test(rootPackage.manifest_sha256)
  ) {
    fail('Hosted Agent candidate preflight does not verify the exact runtime binding.', {
      expected_version_digest: version.version_digest,
      expected_candidate_digest: version.candidate_digest,
    });
  }
}

function assertReadbackIdentity(
  provenance: FoundryHostedAgentRuntimeBindingProvenance,
  version: AgentVersion,
  activationRevision: number,
) {
  if (
    provenance.target_agent_id !== version.target_agent_id
    || provenance.target_domain_id !== version.target_domain_id
    || provenance.active_version_id !== version.version_id
    || provenance.active_version_digest !== version.version_digest
    || provenance.candidate_digest !== version.candidate_digest
    || provenance.candidate_ref !== version.candidate_ref
    || provenance.activation_revision !== activationRevision
  ) {
    fail('Hosted Agent runtime binding readback does not match the committed AgentVersion.', {
      expected_version_digest: version.version_digest,
      actual_version_digest: provenance.active_version_digest,
      expected_candidate_digest: version.candidate_digest,
      actual_candidate_digest: provenance.candidate_digest,
      expected_activation_revision: activationRevision,
      actual_activation_revision: provenance.activation_revision,
    });
  }
}

export class HostedFoundryActivationRuntime implements ActivationRuntime {
  readonly #resolver: HostedAgentRuntimeBindingResolver;
  readonly #candidateDirectory: (candidateDigest: string) => string;
  readonly #workspaceRoot: string;

  constructor(input: {
    resolver: HostedAgentRuntimeBindingResolver;
    candidate_directory: (candidateDigest: string) => string;
    workspace_root: string;
  }) {
    this.#resolver = input.resolver;
    this.#candidateDirectory = input.candidate_directory;
    this.#workspaceRoot = input.workspace_root;
  }

  async preflight(input: Parameters<ActivationRuntime['preflight']>[0]) {
    const hosted = await this.#resolver.preflightFoundryCandidate({
      target_agent_id: input.version.target_agent_id,
      target_domain_id: input.version.target_domain_id,
      version: input.version,
      candidate_directory: this.#candidateDirectory(input.version.candidate_digest),
      workspaceRoot: this.#workspaceRoot,
    });
    assertPreflightIdentity(hosted, input.version);
    const runtimeBindingRef = foundryPreparedRuntimeBindingRef({
      transaction_kind: input.transaction_kind,
      expected_activation_revision: input.expected_activation_revision,
      target_agent_id: hosted.target_agent_id,
      target_domain_id: hosted.target_domain_id,
      version_id: hosted.version_id,
      version_digest: hosted.version_digest,
      candidate_digest: hosted.candidate_digest,
      candidate_ref: hosted.candidate_ref,
      catalog_target_domain_id: hosted.catalog_target_domain_id,
      action_ids: [...hosted.action_ids],
      package_use_binding: hosted.package_use_binding,
    });
    const preflightIdentity = {
      surface_kind: hosted.surface_kind,
      version: hosted.version,
      status: hosted.status,
      target_agent_id: hosted.target_agent_id,
      target_domain_id: hosted.target_domain_id,
      version_id: hosted.version_id,
      version_digest: hosted.version_digest,
      candidate_digest: hosted.candidate_digest,
      candidate_ref: hosted.candidate_ref,
      catalog_target_domain_id: hosted.catalog_target_domain_id,
      action_ids: [...hosted.action_ids],
      package_closure_digest: hosted.package_use_binding.dependency_closure_digest,
      transaction_kind: input.transaction_kind,
      expected_activation_revision: input.expected_activation_revision,
      runtime_binding_ref: runtimeBindingRef,
    };
    return {
      surface_kind: 'opl_foundry_activation_runtime_preflight' as const,
      version: 'opl-foundry-activation-runtime-preflight.v1' as const,
      transaction_kind: input.transaction_kind,
      target_agent_id: input.version.target_agent_id,
      target_domain_id: input.version.target_domain_id,
      version_id: input.version.version_id,
      version_digest: input.version.version_digest,
      candidate_digest: input.version.candidate_digest,
      candidate_ref: input.version.candidate_ref,
      expected_activation_revision: input.expected_activation_revision,
      preflight_ref: `opl://foundry/activation-runtime-preflights/${foundryContentDigest(preflightIdentity)}`,
      runtime_binding_ref: runtimeBindingRef,
    };
  }

  async readback(input: Parameters<ActivationRuntime['readback']>[0]) {
    const binding = await this.#resolver.resolve({
      domainId: input.version.target_domain_id,
      workspaceRoot: this.#workspaceRoot,
    });
    if (binding.source_kind !== 'foundry_active_agent_version'
      || binding.provenance.source_kind !== 'foundry_active_agent_version') {
      fail('Activation runtime readback resolved a package fallback instead of the active Foundry AgentVersion.', {
        target_agent_id: input.version.target_agent_id,
        target_domain_id: input.version.target_domain_id,
        source_kind: binding.source_kind,
      });
    }
    const provenance = binding.provenance as FoundryHostedAgentRuntimeBindingProvenance;
    assertReadbackIdentity(provenance, input.version, input.transaction.next_revision);
    return {
      surface_kind: 'opl_foundry_activation_runtime_readback' as const,
      version: 'opl-foundry-activation-runtime-readback.v1' as const,
      transaction_kind: input.transaction.transaction_kind,
      target_agent_id: input.version.target_agent_id,
      target_domain_id: input.version.target_domain_id,
      active_version_id: input.version.version_id,
      active_version_digest: input.version.version_digest,
      candidate_digest: input.version.candidate_digest,
      candidate_ref: input.version.candidate_ref,
      activation_revision: input.transaction.next_revision,
      runtime_binding_ref: binding.provenance_ref,
    };
  }
}
