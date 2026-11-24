import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { HostedAgentRuntimeBindingProvenance } from '../hosted-agent-runtime-binding.ts';
import { DIGEST_PATTERN, exactKeys, fail, sha256Digest, text, validateRunId } from './fields.ts';
import type { StandardAgentActionRunBinding } from './types.ts';

function hostedRuntimeProvenanceRecord(value: Record<string, unknown>): HostedAgentRuntimeBindingProvenance {
  const sourceKind = value.source_kind;
  const commonKeys = ['surface_kind', 'version', 'source_kind', 'target_agent_id', 'target_domain_id'];
  const sourceKeys = sourceKind === 'foundry_active_agent_version'
    ? [
        'active_version_id',
        'active_version_digest',
        'candidate_digest',
        'candidate_ref',
        'package_closure_digest',
        'activation_revision',
        'activation_updated_at',
        'activation_transaction_kind',
        'prepared_runtime_binding_ref',
      ]
    : sourceKind === 'installed_native_carrier'
      ? [
          'package_id',
          'package_version',
          'carrier_installed_version',
          'owner_manifest_sha256',
          'plugin_selector',
          'marketplace_source',
          'plugin_source_path',
          'source_tree_sha256',
          'action_contracts_sha256',
        ]
      : fail('Hosted runtime provenance has an unsupported source_kind.');
  exactKeys(value, [...commonKeys, ...sourceKeys], 'Hosted runtime provenance');
  const targetAgentId = text(value.target_agent_id, 'provenance.target_agent_id');
  const targetDomainId = text(value.target_domain_id, 'provenance.target_domain_id');
  if (
    value.surface_kind !== 'opl_hosted_agent_runtime_binding_provenance'
    || value.version !== 'opl-hosted-agent-runtime-binding-provenance.v1'
  ) {
    fail('Hosted runtime provenance has an unsupported identity or version.');
  }
  if (sourceKind === 'installed_native_carrier') {
    const packageId = text(value.package_id, 'provenance.package_id');
    const pluginSelector = text(value.plugin_selector, 'provenance.plugin_selector');
    const pluginSourcePath = text(value.plugin_source_path, 'provenance.plugin_source_path');
    if (
      packageId !== targetAgentId
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pluginSelector)
      || !path.isAbsolute(pluginSourcePath)
    ) {
      fail('Installed native carrier provenance identity is invalid.', {
        package_id: packageId,
        target_agent_id: targetAgentId,
        plugin_selector: pluginSelector,
        plugin_source_path: pluginSourcePath,
      });
    }
    return {
      surface_kind: value.surface_kind,
      version: value.version,
      source_kind: 'installed_native_carrier',
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      package_id: packageId,
      package_version: text(value.package_version, 'provenance.package_version'),
      carrier_installed_version: text(
        value.carrier_installed_version,
        'provenance.carrier_installed_version',
      ),
      owner_manifest_sha256: sha256Digest(
        value.owner_manifest_sha256,
        'provenance.owner_manifest_sha256',
      ),
      plugin_selector: pluginSelector,
      marketplace_source: text(value.marketplace_source, 'provenance.marketplace_source'),
      plugin_source_path: pluginSourcePath,
      source_tree_sha256: sha256Digest(
        value.source_tree_sha256,
        'provenance.source_tree_sha256',
      ),
      action_contracts_sha256: sha256Digest(
        value.action_contracts_sha256,
        'provenance.action_contracts_sha256',
      ),
    };
  }
  if (
    !Number.isSafeInteger(value.activation_revision)
    || Number(value.activation_revision) < 1
    || !Number.isFinite(Date.parse(String(value.activation_updated_at)))
    || !['activate', 'rollback'].includes(String(value.activation_transaction_kind))
  ) {
    fail('Hosted Foundry runtime provenance has invalid activation metadata.');
  }
  const candidateDigest = sha256Digest(value.candidate_digest, 'provenance.candidate_digest');
  const candidateRef = text(value.candidate_ref, 'provenance.candidate_ref');
  if (candidateRef !== `opl://foundry/candidate/${candidateDigest}`) {
    fail('Hosted Foundry runtime provenance candidate ref does not match its digest.');
  }
  const preparedRuntimeBindingRef = text(
    value.prepared_runtime_binding_ref,
    'provenance.prepared_runtime_binding_ref',
  );
  if (!preparedRuntimeBindingRef.startsWith('opl://foundry/prepared-runtime-bindings/')) {
    fail('Hosted Foundry runtime provenance prepared binding ref is invalid.');
  }
  return {
    surface_kind: value.surface_kind,
    version: value.version,
    source_kind: 'foundry_active_agent_version',
    target_agent_id: targetAgentId,
    target_domain_id: targetDomainId,
    active_version_id: text(value.active_version_id, 'provenance.active_version_id'),
    active_version_digest: sha256Digest(
      value.active_version_digest,
      'provenance.active_version_digest',
    ),
    candidate_digest: candidateDigest,
    candidate_ref: candidateRef,
    package_closure_digest: sha256Digest(
      value.package_closure_digest,
      'provenance.package_closure_digest',
    ),
    activation_revision: Number(value.activation_revision),
    activation_updated_at: text(value.activation_updated_at, 'provenance.activation_updated_at'),
    activation_transaction_kind: value.activation_transaction_kind as 'activate' | 'rollback',
    prepared_runtime_binding_ref: preparedRuntimeBindingRef,
  };
}

export function bindingRecord(value: Record<string, unknown>): StandardAgentActionRunBinding {
  const v2 = value.version === 'opl-standard-agent-action-run-binding.v2';
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'hosted_runtime_binding_ref',
    'hosted_runtime_binding',
    ...(v2 ? ['plan_sha256', 'plan_byte_size'] : []),
  ], 'Standard Agent action run binding');
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_binding'
    || ![
      'opl-standard-agent-action-run-binding.v1',
      'opl-standard-agent-action-run-binding.v2',
    ].includes(String(value.version))
    || !isRecord(value.hosted_runtime_binding)
    || (v2 && (
      typeof value.plan_sha256 !== 'string'
      || !DIGEST_PATTERN.test(value.plan_sha256)
      || !Number.isSafeInteger(value.plan_byte_size)
      || Number(value.plan_byte_size) < 1
    ))
  ) {
    fail('Standard Agent action run binding is invalid.');
  }
  const runId = text(value.run_id, 'binding.run_id');
  validateRunId(runId);
  const hostedRuntimeBinding = hostedRuntimeProvenanceRecord(value.hosted_runtime_binding);
  const hostedRuntimeBindingRef = text(
    value.hosted_runtime_binding_ref,
    'binding.hosted_runtime_binding_ref',
  );
  const expectedHostedRuntimeBindingRef = `opl://hosted-agent-runtime-binding/sha256/${crypto
    .createHash('sha256')
    .update(canonicalJsonText(hostedRuntimeBinding))
    .digest('hex')}`;
  if (hostedRuntimeBindingRef !== expectedHostedRuntimeBindingRef) {
    fail('Standard Agent action run binding provenance ref is not content-addressed.', {
      hosted_runtime_binding_ref: hostedRuntimeBindingRef,
      expected_hosted_runtime_binding_ref: expectedHostedRuntimeBindingRef,
    });
  }
  const canonicalDomainId = text(value.canonical_domain_id, 'binding.canonical_domain_id');
  if (hostedRuntimeBinding.target_agent_id !== canonicalDomainId) {
    fail('Standard Agent action run binding target does not match its hosted runtime provenance.', {
      canonical_domain_id: canonicalDomainId,
      provenance_target_agent_id: hostedRuntimeBinding.target_agent_id,
    });
  }
  const common = {
    surface_kind: 'opl_standard_agent_action_run_binding' as const,
    run_id: runId,
    canonical_domain_id: canonicalDomainId,
    action_id: text(value.action_id, 'binding.action_id'),
    hosted_runtime_binding_ref: hostedRuntimeBindingRef,
    hosted_runtime_binding: hostedRuntimeBinding,
  };
  return v2
    ? {
        ...common,
        version: 'opl-standard-agent-action-run-binding.v2',
        plan_sha256: value.plan_sha256 as string,
        plan_byte_size: Number(value.plan_byte_size),
      }
    : {
        ...common,
        version: 'opl-standard-agent-action-run-binding.v1',
      };
}
