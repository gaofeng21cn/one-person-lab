import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActivationTransaction, AgentVersion } from '../../src/modules/foundry/ports.ts';
import { HostedFoundryActivationRuntime } from '../../src/modules/runway/foundry-activation-runtime.ts';
import type { HostedAgentRuntimeBindingResolver } from '../../src/modules/runway/hosted-agent-runtime-binding.ts';

const version: AgentVersion = {
  surface_kind: 'opl_foundry_agent_version',
  version_id: 'version:generated-agent:candidate',
  version_digest: `sha256:${'1'.repeat(64)}`,
  target_agent_id: 'generated-agent',
  target_domain_id: 'generated-domain',
  blueprint_digest: `sha256:${'2'.repeat(64)}`,
  candidate_digest: `sha256:${'3'.repeat(64)}`,
  candidate_ref: `opl://foundry/candidate/sha256:${'3'.repeat(64)}`,
  qualification_digest: `sha256:${'4'.repeat(64)}`,
  created_at: '2026-07-16T00:00:00.000Z',
};

const transaction: ActivationTransaction = {
  surface_kind: 'opl_foundry_activation_transaction',
  transaction_id: 'activation:generated-agent:4',
  transaction_kind: 'activate',
  target_agent_id: version.target_agent_id,
  target_domain_id: version.target_domain_id,
  from_version_digest: null,
  to_version_digest: version.version_digest,
  previous_revision: 3,
  next_revision: 4,
  authority_receipt_ref: null,
  occurred_at: '2026-07-16T00:01:00.000Z',
  runtime_binding_verification: {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: 'activate',
    target_agent_id: version.target_agent_id,
    target_domain_id: version.target_domain_id,
    version_id: version.version_id,
    version_digest: version.version_digest,
    candidate_digest: version.candidate_digest,
    candidate_ref: version.candidate_ref,
    expected_activation_revision: 3,
    preflight_ref: 'opl://foundry/activation-runtime-preflights/test-fixture',
    runtime_binding_ref: 'opl://foundry/prepared-runtime-bindings/test-fixture',
  },
};

test('HostedFoundryActivationRuntime prepares an exact runtime binding before activation CAS', async () => {
  const calls: string[] = [];
  let preparedRuntimeBindingRef = '';
  const resolver: HostedAgentRuntimeBindingResolver = {
    async preflightFoundryCandidate(input) {
      calls.push(`preflight:${input.version.version_digest}:${input.candidate_directory}`);
      return {
        surface_kind: 'opl_foundry_hosted_agent_candidate_preflight',
        version: 'opl-foundry-hosted-agent-candidate-preflight.v1',
        status: 'ready',
        target_agent_id: version.target_agent_id,
        target_domain_id: version.target_domain_id,
        version_id: version.version_id,
        version_digest: version.version_digest,
        candidate_digest: version.candidate_digest,
        candidate_ref: version.candidate_ref,
        checkout_root: '/tmp/foundry-candidate',
        workspace_root: '/tmp/foundry-workspace',
        catalog_target_domain_id: version.target_domain_id,
        action_ids: ['run'],
        package_use_binding: {
          surface_kind: 'opl_agent_package_use_binding.v1',
          binding_origin: 'foundry_active_agent_version',
          use_boundary_id: 'foundry:generated-agent',
          use_receipt_ref: 'opl://foundry/package-use/generated-agent',
          root_package: {
            package_id: version.target_agent_id,
            package_version: version.version_id,
            owner_language_version: null,
            package_lock_ref: version.candidate_ref,
            manifest_sha256: version.candidate_digest,
            content_digest: version.candidate_digest,
            source_artifact_ref: version.candidate_ref,
            artifact_digest: version.candidate_digest,
            owner_source_commit: null,
            carrier_authority: null,
          },
          provider_packages: [],
          dependency_closure_digest: version.candidate_digest,
          core_skill_tree_digest: null,
          skill_tree_digest: null,
        },
      };
    },
    async resolve(input) {
      calls.push(`resolve:${input.domainId}:${input.workspaceRoot}`);
      const provenance = {
        surface_kind: 'opl_hosted_agent_runtime_binding_provenance' as const,
        version: 'opl-hosted-agent-runtime-binding-provenance.v1' as const,
        source_kind: 'foundry_active_agent_version' as const,
        target_agent_id: version.target_agent_id,
        target_domain_id: version.target_domain_id,
        active_version_id: version.version_id,
        active_version_digest: version.version_digest,
        candidate_digest: version.candidate_digest,
        candidate_ref: version.candidate_ref,
        package_closure_digest: version.candidate_digest,
        activation_revision: transaction.next_revision,
        activation_updated_at: transaction.occurred_at,
        activation_transaction_kind: transaction.transaction_kind,
        prepared_runtime_binding_ref: preparedRuntimeBindingRef,
      };
      return {
        source_kind: provenance.source_kind,
        checkout_root: '/tmp/foundry-candidate',
        workspace_root: '/tmp/foundry-workspace',
        agent_id: version.target_agent_id,
        runtime_domain_id: version.target_domain_id,
        target_domain_id: version.target_domain_id,
        catalog_target_domain_ids: [version.target_domain_id],
        package_use_binding: null,
        provenance,
        provenance_ref: 'opl://hosted-agent-runtime-binding/exact-active',
      };
    },
    async resolvePinned() {
      throw new Error('resolvePinned is not exercised by activation runtime diagnostics.');
    },
  };
  const runtime = new HostedFoundryActivationRuntime({
    resolver,
    candidate_directory: (candidateDigest) => `/tmp/foundry-candidates/${candidateDigest.slice('sha256:'.length)}`,
    workspace_root: '/tmp/foundry-workspace',
  });

  const preflight = await runtime.preflight({
    transaction_kind: 'activate',
    version,
    expected_activation_revision: transaction.previous_revision,
  });

  assert.deepEqual(calls, [
    `preflight:${version.version_digest}:/tmp/foundry-candidates/${version.candidate_digest.slice('sha256:'.length)}`,
  ]);
  assert.equal(preflight.version_digest, version.version_digest);
  assert.equal(preflight.candidate_digest, version.candidate_digest);
  assert.match(preflight.preflight_ref, /^opl:\/\/foundry\/activation-runtime-preflights\/sha256:/);
  assert.match(preflight.runtime_binding_ref!, /^opl:\/\/foundry\/prepared-runtime-bindings\/sha256:/);
  preparedRuntimeBindingRef = preflight.runtime_binding_ref!;

  const nextRevision = await runtime.preflight({
    transaction_kind: 'activate',
    version,
    expected_activation_revision: transaction.previous_revision + 1,
  });
  assert.notEqual(nextRevision.runtime_binding_ref, preflight.runtime_binding_ref);

  const readback = await runtime.readback({ transaction, version });
  assert.deepEqual(calls, [
    `preflight:${version.version_digest}:/tmp/foundry-candidates/${version.candidate_digest.slice('sha256:'.length)}`,
    `preflight:${version.version_digest}:/tmp/foundry-candidates/${version.candidate_digest.slice('sha256:'.length)}`,
    `resolve:${version.target_domain_id}:/tmp/foundry-workspace`,
  ]);
  assert.equal(readback.active_version_id, version.version_id);
  assert.equal(readback.active_version_digest, version.version_digest);
  assert.equal(readback.candidate_digest, version.candidate_digest);
  assert.equal(readback.activation_revision, transaction.next_revision);
  assert.equal(readback.runtime_binding_ref, 'opl://hosted-agent-runtime-binding/exact-active');
});
