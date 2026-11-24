import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError } from '../contract-validation.ts';
import { isRecord } from '../contract-validation.ts';
import { normalizeFamilyActionCatalog } from '../family-action-catalog-contract.ts';
import { parseJsonText } from '../json-file.ts';
import { resolveContainedRepoJsonFile } from '../repo-contained-json-file.ts';
import type { StandardAgentSourceMaterialConsumerResolution } from '../standard-agent-interface-types.ts';
import { STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH } from './constants.ts';
import { invalid } from './validation-values.ts';

function sourceMaterialConsumerUnavailable(): StandardAgentSourceMaterialConsumerResolution {
  return {
    applicability: 'not_applicable',
    consumer_projection_ref: null,
    consumer_route: null,
    reason: 'consumer_descriptor_unavailable',
  };
}

function sourceMaterialRoleNotDeclared(
  consumerProjectionRef: string | null,
): StandardAgentSourceMaterialConsumerResolution {
  return {
    applicability: 'not_applicable',
    consumer_projection_ref: consumerProjectionRef,
    consumer_route: null,
    reason: 'source_material_role_not_declared',
  };
}

function sourceMaterialConsumerInvalid(
  message: string,
  repoDir: string,
  details: Record<string, unknown> = {},
): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    repo_dir: path.resolve(repoDir),
    ...details,
  });
}

function sourceMaterialLinkedJson(
  repoDir: string,
  relativeRef: string,
  field: string,
): Record<string, unknown> {
  if (
    path.isAbsolute(relativeRef)
    || relativeRef.includes('#')
    || relativeRef.includes('\\')
    || relativeRef.split(/[\\/]+/).includes('..')
  ) {
    sourceMaterialConsumerInvalid('Source material consumer linkage must use a repository-relative JSON file ref.', repoDir, {
      field,
      ref: relativeRef,
    });
  }
  let filePath: string;
  try {
    filePath = resolveContainedRepoJsonFile(repoDir, relativeRef, field).real_path;
  } catch (error) {
    sourceMaterialConsumerInvalid('Source material consumer linkage does not resolve to a repository JSON file.', repoDir, {
      field,
      ref: relativeRef,
      cause: error instanceof Error ? error.message : 'Unknown repository path failure.',
    });
  }
  try {
    const payload = parseJsonText(fs.readFileSync(filePath, 'utf8'));
    if (!isRecord(payload)) {
      sourceMaterialConsumerInvalid('Source material consumer linkage must resolve to a JSON object.', repoDir, {
        field,
        ref: relativeRef,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    sourceMaterialConsumerInvalid('Source material consumer linkage is not valid JSON.', repoDir, {
      field,
      ref: relativeRef,
      cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
    });
  }
}

function sourceMaterialString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveStandardAgentSourceMaterialConsumerRoute(
  repoDir: string | null,
  sourceMaterialRole: string,
): StandardAgentSourceMaterialConsumerResolution {
  if (!repoDir) return sourceMaterialConsumerUnavailable();
  const descriptorPath = path.join(repoDir, STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH);
  let descriptor: unknown;
  try {
    descriptor = parseJsonText(fs.readFileSync(descriptorPath, 'utf8'));
  } catch {
    return sourceMaterialConsumerUnavailable();
  }
  if (!isRecord(descriptor)) return sourceMaterialConsumerUnavailable();

  const declared = descriptor.source_material_consumer;
  if (declared === undefined || declared === null) {
    return sourceMaterialRoleNotDeclared(null);
  }
  if (
    !isRecord(declared)
    || declared.version !== 'opl_source_material_consumer_projection.v1'
    || !isRecord(declared.role_bindings)
  ) {
    sourceMaterialConsumerInvalid('Source material consumer declaration is invalid.', repoDir);
  }
  if (declared.provider_execution_at_ingest !== 'not_applicable') {
    sourceMaterialConsumerInvalid(
      'Source material consumer provider execution at ingest must remain not_applicable.',
      repoDir,
      { actual: declared.provider_execution_at_ingest ?? null },
    );
  }

  const projectionRef = `${STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH}#/source_material_consumer`;
  const role = sourceMaterialRole.trim();
  const rawBinding = declared.role_bindings[role];
  if (rawBinding === undefined) {
    return sourceMaterialRoleNotDeclared(projectionRef);
  }
  if (!isRecord(rawBinding)) {
    sourceMaterialConsumerInvalid('Source material consumer role binding is invalid.', repoDir, { role });
  }
  const publicActionId = sourceMaterialString(rawBinding.public_action_id);
  const requestRefField = sourceMaterialString(rawBinding.request_ref_field);
  if (rawBinding.applicability !== 'required' || !publicActionId || !requestRefField) {
    sourceMaterialConsumerInvalid('Source material consumer role binding is inconsistent.', repoDir, { role });
  }

  const consumerAgentId = sourceMaterialString(descriptor.agent_id);
  const packageId = sourceMaterialString(descriptor.package_id);
  const domainId = sourceMaterialString(descriptor.domain_id);
  const actionCatalogRef = sourceMaterialString(descriptor.action_catalog_ref);
  if (!consumerAgentId || !packageId || !domainId || !actionCatalogRef) {
    sourceMaterialConsumerInvalid('Source material consumer declaration requires descriptor identity and action catalog linkage.', repoDir, {
      public_action_id: publicActionId,
    });
  }
  const publicActionIds = Array.isArray(descriptor.public_action_ids)
    ? descriptor.public_action_ids.map(sourceMaterialString).filter((entry): entry is string => entry !== null)
    : [];
  if (!publicActionIds.includes(publicActionId)) {
    sourceMaterialConsumerInvalid('Source material consumer action is not declared as a public descriptor action.', repoDir, {
      public_action_id: publicActionId,
      public_action_ids: publicActionIds,
    });
  }
  const standardContractRefs = isRecord(descriptor.standard_contract_refs)
    ? descriptor.standard_contract_refs
    : null;
  const declaredActionCatalogRef = sourceMaterialString(standardContractRefs?.action_catalog);
  if (declaredActionCatalogRef && declaredActionCatalogRef !== actionCatalogRef) {
    sourceMaterialConsumerInvalid('Source material consumer descriptor action catalog refs disagree.', repoDir, {
      action_catalog_ref: actionCatalogRef,
      standard_contract_action_catalog_ref: declaredActionCatalogRef,
    });
  }

  const rawCatalog = sourceMaterialLinkedJson(repoDir, actionCatalogRef, 'action_catalog_ref');
  let catalog;
  try {
    catalog = normalizeFamilyActionCatalog(rawCatalog, actionCatalogRef);
  } catch (error) {
    sourceMaterialConsumerInvalid('Source material consumer action catalog is invalid.', repoDir, {
      action_catalog_ref: actionCatalogRef,
      cause: error instanceof Error ? error.message : 'Unknown action catalog error.',
    });
  }
  if (!catalog) {
    sourceMaterialConsumerInvalid('Source material consumer action catalog is unavailable.', repoDir, {
      action_catalog_ref: actionCatalogRef,
    });
  }
  if (catalog.target_domain_id !== domainId || catalog.owner !== consumerAgentId) {
    sourceMaterialConsumerInvalid('Source material consumer action catalog identity does not match the descriptor.', repoDir, {
      descriptor_agent_id: consumerAgentId,
      descriptor_domain_id: domainId,
      catalog_owner: catalog.owner,
      catalog_target_domain_id: catalog.target_domain_id,
    });
  }
  const action = catalog.actions.find((entry) => entry.action_id === publicActionId);
  if (!action || action.owner !== consumerAgentId) {
    sourceMaterialConsumerInvalid('Source material consumer action binding does not resolve to the descriptor owner.', repoDir, {
      public_action_id: publicActionId,
    });
  }
  if (![...action.required_fields, ...action.optional_fields].includes(requestRefField)) {
    sourceMaterialConsumerInvalid('Source material consumer request ref field is not declared by the public action.', repoDir, {
      public_action_id: publicActionId,
      request_ref_field: requestRefField,
    });
  }
  if (action.execution_binding.kind !== 'foundry_binding') {
    sourceMaterialConsumerInvalid('Source material consumer action must derive a Foundry provider binding.', repoDir, {
      public_action_id: publicActionId,
      execution_binding_kind: action.execution_binding.kind,
    });
  }
  const providerManifestRef = action.execution_binding.provider_manifest_ref;
  const declaredProviderRef = sourceMaterialString(standardContractRefs?.foundry_provider);
  if (declaredProviderRef && declaredProviderRef !== providerManifestRef) {
    sourceMaterialConsumerInvalid('Source material consumer provider refs disagree.', repoDir, {
      action_provider_manifest_ref: providerManifestRef,
      standard_contract_provider_ref: declaredProviderRef,
    });
  }
  const provider = sourceMaterialLinkedJson(repoDir, providerManifestRef, 'provider_manifest_ref');
  const providerId = sourceMaterialString(provider.provider_id);
  if (
    !providerId
    || sourceMaterialString(provider.agent_id) !== consumerAgentId
    || sourceMaterialString(provider.package_id) !== packageId
    || sourceMaterialString(provider.domain_id) !== domainId
  ) {
    sourceMaterialConsumerInvalid('Source material consumer provider identity does not match the descriptor.', repoDir, {
      provider_manifest_ref: providerManifestRef,
      provider_id: providerId,
      provider_agent_id: sourceMaterialString(provider.agent_id),
      provider_package_id: sourceMaterialString(provider.package_id),
      provider_domain_id: sourceMaterialString(provider.domain_id),
    });
  }

  return {
    applicability: 'required',
    consumer_projection_ref: `${projectionRef}/role_bindings/${role.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    consumer_route: {
      consumer_agent_id: consumerAgentId,
      public_action_id: publicActionId,
      action_catalog_ref: actionCatalogRef,
      input_schema_ref: action.input_schema_ref,
      request_ref_field: requestRefField,
      provider_manifest_ref: providerManifestRef,
      provider_id: providerId,
    },
    reason: null,
  };
}
