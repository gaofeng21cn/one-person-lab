import crypto from 'node:crypto';

import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import {
  normalizeFamilyActionCatalog,
  type FamilyActionCatalog,
} from '../../kernel/family-action-catalog-contract.ts';
import {
  readFoundryProviderManifest,
  type FoundryProviderManifest,
} from '../foundry/index.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  unique,
} from './standard-domain-agent-conformance-utils.ts';

export const STANDARD_DOMAIN_AGENT_REPO_LOCAL_RUNTIME_PROFILE_ID =
  'standard_domain_agent_repo_local_runtime';
export const OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID =
  'opl_hosted_foundry_semantic_provider';

const DESIGN_REQUEST_REF = 'opl://foundry-protocol/DesignRequest';
const FOUNDRY_RUN_REF = 'opl://foundry-control/FoundryRun';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length
    && [...left].sort().every((entry, index) => entry === [...right].sort()[index]);
}

function profileApplicability(profileId: string | null) {
  if (profileId === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID) {
    return {
      repo_local_runtime_scaffold: 'opl_hosted',
      repo_local_artifact_and_receipt_contracts: 'opl_hosted',
      repo_local_workspace_lifecycle: 'opl_hosted',
      repo_local_stage_run_profile: 'opl_hosted',
      repo_local_controlled_canary_contract: 'opl_hosted',
      repo_local_state_index: 'opl_hosted',
      repo_local_physical_morphology: 'opl_hosted',
      semantic_stage_pack: 'required_from_agent_repo',
      foundry_provider_manifest: 'required_from_agent_repo',
      foundry_agent_series: 'required_from_agent_repo',
      capability_map: 'required_from_agent_repo',
      source_closure: 'required_from_agent_repo',
      managed_runtime_identity_and_currentness: 'required_from_opl_managed_package_gate',
      live_qualification_and_canary_evidence: 'required_from_opl_foundry_kernel',
    } as const;
  }
  const state = profileId === null ? 'profile_resolution_blocked' : 'required_from_agent_repo';
  return {
    repo_local_runtime_scaffold: state,
    repo_local_artifact_and_receipt_contracts: state,
    repo_local_workspace_lifecycle: state,
    repo_local_stage_run_profile: state,
    repo_local_controlled_canary_contract: state,
    repo_local_state_index: state,
    repo_local_physical_morphology: state,
    semantic_stage_pack: 'required_from_agent_repo',
    foundry_provider_manifest: 'not_applicable',
    foundry_agent_series: 'required_from_agent_repo',
    capability_map: 'required_from_agent_repo',
    source_closure: 'required_from_agent_repo',
    managed_runtime_identity_and_currentness: 'not_applicable',
    live_qualification_and_canary_evidence: 'required_from_domain_owner',
  } as const;
}

export function resolveStandardAgentExecutionProfile(repoDir: string) {
  const descriptorFile = readJsonFile(repoDir, 'contracts/domain_descriptor.json');
  const actionCatalogFile = readJsonFile(repoDir, 'contracts/action_catalog.json');
  const packCompilerInputFile = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const descriptor = isRecord(descriptorFile.payload) ? descriptorFile.payload : null;
  const actionCatalogPayload = isRecord(actionCatalogFile.payload) ? actionCatalogFile.payload : null;
  const rawActions = Array.isArray(actionCatalogPayload?.actions)
    ? actionCatalogPayload.actions
    : [];
  const bindingKinds = unique(rawActions.map((action) =>
    isRecord(action) && isRecord(action.execution_binding)
      ? optionalString(action.execution_binding.kind)
      : null
  ).filter((entry): entry is string => Boolean(entry)));
  const agentRole = optionalString(descriptor?.agent_role);
  const roleMatches = agentRole === 'foundry_semantic_provider';
  const bindingMatches = rawActions.length > 0 && rawActions.every((action) =>
    isRecord(action)
      && isRecord(action.execution_binding)
      && action.execution_binding.kind === 'foundry_binding'
  );
  const selectionMismatch = roleMatches !== bindingMatches;
  const selectedProfileId = selectionMismatch
    ? null
    : roleMatches && bindingMatches
      ? OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID
      : STANDARD_DOMAIN_AGENT_REPO_LOCAL_RUNTIME_PROFILE_ID;
  const blockers = [
    roleMatches && !bindingMatches
      ? 'execution_profile_foundry_binding_required_for_foundry_semantic_provider'
      : null,
    bindingMatches && !roleMatches
      ? 'execution_profile_foundry_semantic_provider_role_required_for_foundry_binding'
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  let normalizedCatalog: FamilyActionCatalog | null = null;
  let actionCatalogValidationError: string | null = null;
  let providerManifest: FoundryProviderManifest | null = null;
  let providerManifestRef: string | null = null;
  let providerManifestValidationError: string | null = null;
  let normalizedManifestSha256: string | null = null;

  if (selectedProfileId === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID) {
    try {
      normalizedCatalog = normalizeFamilyActionCatalog(
        actionCatalogFile.payload,
        'contracts/action_catalog.json',
      );
      if (!normalizedCatalog) {
        throw new Error('contracts/action_catalog.json is not an object');
      }
    } catch (error) {
      actionCatalogValidationError = errorMessage(error);
      blockers.push('hosted_foundry_action_catalog_invalid');
    }

    if (normalizedCatalog) {
      const manifestRefs = unique(normalizedCatalog.actions.flatMap((action) =>
        action.execution_binding.kind === 'foundry_binding'
          ? [action.execution_binding.provider_manifest_ref]
          : []
      ));
      providerManifestRef = manifestRefs.length === 1 ? manifestRefs[0]! : null;
      if (!providerManifestRef) {
        blockers.push('hosted_foundry_provider_manifest_ref_must_be_unique');
      } else {
        try {
          providerManifest = readFoundryProviderManifest(repoDir, providerManifestRef);
          normalizedManifestSha256 = `sha256:${crypto
            .createHash('sha256')
            .update(canonicalJsonBytes(providerManifest))
            .digest('hex')}`;
        } catch (error) {
          providerManifestValidationError = errorMessage(error);
          blockers.push('hosted_foundry_provider_manifest_invalid');
        }
      }
    }

    const descriptorDomainId = optionalString(descriptor?.domain_id);
    const descriptorAgentId = optionalString(descriptor?.agent_id)
      ?? optionalString(descriptor?.canonical_agent_id);
    const descriptorPackageId = optionalString(descriptor?.package_id);
    const packCompilerInput = isRecord(packCompilerInputFile.payload)
      ? packCompilerInputFile.payload
      : null;
    const packAuthority = isRecord(packCompilerInput?.authority_boundary)
      ? packCompilerInput.authority_boundary
      : null;
    blockers.push(...[
      descriptorDomainId ? null : 'hosted_foundry_descriptor_domain_id_missing',
      descriptorAgentId ? null : 'hosted_foundry_descriptor_agent_id_missing',
      descriptorPackageId ? null : 'hosted_foundry_descriptor_package_id_missing',
      normalizedCatalog && normalizedCatalog.target_domain_id !== descriptorDomainId
        ? 'hosted_foundry_action_catalog_domain_identity_mismatch'
        : null,
      normalizedCatalog?.actions.some((action) => action.input_schema_ref !== DESIGN_REQUEST_REF)
        ? 'hosted_foundry_action_input_schema_must_be_design_request'
        : null,
      normalizedCatalog?.actions.some((action) => action.output_schema_ref !== FOUNDRY_RUN_REF)
        ? 'hosted_foundry_action_output_schema_must_be_foundry_run'
        : null,
      providerManifest && providerManifest.domain_id !== descriptorDomainId
        ? 'hosted_foundry_provider_domain_identity_mismatch'
        : null,
      providerManifest && providerManifest.agent_id !== descriptorAgentId
        ? 'hosted_foundry_provider_agent_identity_mismatch'
        : null,
      providerManifest && providerManifest.package_id !== descriptorPackageId
        ? 'hosted_foundry_provider_package_identity_mismatch'
        : null,
      providerManifest && normalizedCatalog && providerManifest.agent_id !== normalizedCatalog.owner
        ? 'hosted_foundry_provider_catalog_owner_identity_mismatch'
        : null,
      providerManifest && normalizedCatalog && !sameStringSet(
        providerManifest.projection_policy.public_action_ids,
        normalizedCatalog.actions.map((action) => action.action_id),
      )
        ? 'hosted_foundry_provider_public_action_identity_mismatch'
        : null,
      packAuthority?.domain_repo_can_own_generated_surface === false
        ? null
        : 'hosted_foundry_pack_authority_domain_repo_generated_surface_owner_must_be_false',
    ].filter((entry): entry is string => Boolean(entry)));
  }

  const hosted = selectedProfileId === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID;
  const uniqueBlockers = unique(blockers);
  return {
    surface_kind: 'opl_standard_agent_execution_profile_resolution',
    version: 'opl-standard-agent-execution-profile-resolution.v1',
    status: uniqueBlockers.length === 0 ? 'passed' : 'blocked',
    selection_status: selectedProfileId === null ? 'blocked' : 'selected',
    selected_profile_id: selectedProfileId,
    selection_evidence: {
      domain_descriptor_status: descriptorFile.status,
      action_catalog_status: actionCatalogFile.status,
      agent_role: agentRole,
      action_execution_binding_kinds: bindingKinds,
      agent_role_matches_foundry_semantic_provider: roleMatches,
      every_action_uses_foundry_binding: bindingMatches,
      selection_requires_role_and_binding: true,
      selection_uses_agent_id_special_case: false,
    },
    applicability: profileApplicability(selectedProfileId),
    action_catalog_validation: {
      status: hosted
        ? actionCatalogValidationError
          ? 'blocked'
          : 'passed'
        : 'not_applicable',
      error: actionCatalogValidationError,
    },
    provider_manifest_validation: {
      status: hosted
        ? providerManifestValidationError || !providerManifest
          ? 'blocked'
          : 'passed'
        : 'not_applicable',
      manifest_ref: providerManifestRef,
      normalized_manifest_sha256: normalizedManifestSha256,
      provider_id: providerManifest?.provider_id ?? null,
      agent_id: providerManifest?.agent_id ?? null,
      package_id: providerManifest?.package_id ?? null,
      domain_id: providerManifest?.domain_id ?? null,
      error: providerManifestValidationError,
      runtime_source_currentness_owner: hosted ? 'opl_managed_package_gate' : null,
      repo_manifest_observation_is_launch_currentness_proof: false,
    },
    opl_hosted_evidence: hosted
      ? {
          owner: 'one-person-lab',
          runtime_owner: 'opl_foundry_kernel',
          managed_runtime_identity_owner: 'opl_managed_package_gate',
          structural_contract_ref:
            'contracts/opl-framework/standard-agent-hosted-action-runtime-contract.json#foundry_execution',
          live_evidence_status: 'required_from_opl_foundry_kernel',
          provider_completion_is_qualification_or_closeout: false,
          repo_local_runtime_placeholder_contracts_required: false,
        }
      : null,
    blockers: uniqueBlockers,
  };
}
