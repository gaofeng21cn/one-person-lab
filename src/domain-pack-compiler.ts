import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { buildFamilyAgentDescriptorList } from './family-domain-agent-descriptor.ts';
import {
  normalizeFamilyActionCatalog,
} from './family-action-catalog-contract.ts';
import {
  normalizeFamilyStageControlPlane,
} from './family-stage-control-plane-contract.ts';
import {
  buildFunctionalPrivatizationAudit,
} from './functional-privatization-audit.ts';
import {
  buildGeneratedInterfaceBundle,
  GENERATED_INTERFACE_SOURCE_REFS,
  GENERATED_SURFACES,
  selectGeneratedInterfaceBundleFormat,
} from './domain-pack-compiler/generated-interface-read-model.ts';
import type { GeneratedInterfaceFormat } from './domain-pack-compiler/generated-interface-read-model.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
}

function parseInspectArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain' && args[index + 1]) {
      domain = args[index + 1];
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler option: ${token}.`, {
      usage: 'opl agents pack-compiler inspect --domain <domain>',
    });
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'pack compiler inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

function parseInterfaceArgs(args: string[]) {
  let domain = '';
  let repoDir = '';
  let format: GeneratedInterfaceFormat | 'all' = 'all';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain' && args[index + 1]) {
      domain = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--repo-dir' && args[index + 1]) {
      repoDir = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--format' && args[index + 1]) {
      format = normalizeInterfaceFormat(args[index + 1]);
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown generated interface option: ${token}.`, {
      usage:
        'opl agents interfaces (--domain <domain> | --repo-dir <path>) [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
    });
  }
  if (!domain && !repoDir) {
    throw new FrameworkContractError('cli_usage_error', 'generated interfaces require --domain or --repo-dir.', {
      required_one_of: ['--domain', '--repo-dir'],
    });
  }
  if (domain && repoDir) {
    throw new FrameworkContractError('cli_usage_error', 'generated interfaces accept either --domain or --repo-dir, not both.', {
      mutually_exclusive: ['--domain', '--repo-dir'],
    });
  }
  return { domain, repoDir, format };
}

function normalizeInterfaceFormat(value: string): GeneratedInterfaceFormat | 'all' {
  if (value === 'all') {
    return 'all';
  }
  if (value === 'cli' || value === 'mcp' || value === 'skill' || value === 'openai' || value === 'ai-sdk') {
    return value;
  }
  if (value === 'product-entry' || value === 'product_entry') {
    return 'product-entry';
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported generated interface format: ${value}.`, {
    format: value,
    allowed_formats: ['all', 'cli', 'mcp', 'skill', 'product-entry', 'openai', 'ai-sdk'],
  });
}

function statusOf(value: unknown) {
  return isRecord(value) ? optionalString(value.status) : null;
}

function runtimeSurfaceResolvedCount(runtimeSurfaces: JsonRecord | null) {
  if (!runtimeSurfaces) {
    return 0;
  }
  return Object.values(runtimeSurfaces).filter((surface) => statusOf(surface) === 'resolved').length;
}

function transitionSurfaceStatus(descriptor: JsonRecord) {
  const transitionStatus = statusOf(descriptor.family_transition);
  if (transitionStatus === 'matrix_evaluated' || transitionStatus === 'descriptor_only') {
    return transitionStatus;
  }
  if (transitionStatus === 'blocked') {
    return 'blocked';
  }
  const oracle = isRecord(descriptor.grant_transition_oracle)
    ? descriptor.grant_transition_oracle
    : null;
  const oracleIngestion = isRecord(oracle?.ingestion) ? oracle.ingestion : null;
  if (
    statusOf(oracle) === 'resolved'
    && optionalString(oracleIngestion?.status) === 'matrix_oracle_passed'
  ) {
    return 'oracle_evidence_gate';
  }
  return transitionStatus ?? 'missing';
}

function descriptorSurfaceResolved(descriptor: JsonRecord, surface: string) {
  switch (surface) {
    case 'entry':
      return statusOf(descriptor.entry) === 'resolved';
    case 'family_action_catalog':
      return statusOf(descriptor.family_action_catalog) === 'resolved';
    case 'family_stage_control_plane':
      return statusOf(descriptor.family_stage_control_plane) === 'resolved';
    case 'domain_memory_descriptor':
      return statusOf(descriptor.domain_memory_descriptor) === 'resolved';
    case 'family_transition': {
      const transitionStatus = transitionSurfaceStatus(descriptor);
      return transitionStatus === 'matrix_evaluated'
        || transitionStatus === 'descriptor_only'
        || transitionStatus === 'oracle_evidence_gate';
    }
    case 'functional_privatization_audit':
      return statusOf(descriptor.functional_privatization_audit) === 'resolved';
    case 'runtime_surfaces':
      return runtimeSurfaceResolvedCount(isRecord(descriptor.runtime_surfaces) ? descriptor.runtime_surfaces : null) > 0;
    default:
      return false;
  }
}

function functionalAuditSummary(descriptor: JsonRecord) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  return isRecord(audit?.summary) ? audit.summary : {};
}

function numberField(record: JsonRecord, field: string) {
  const value = record[field];
  return typeof value === 'number' ? value : 0;
}

function genericResidueBlocked(summary: JsonRecord) {
  return numberField(summary, 'opl_owned_replacement_count') > 0
    || numberField(summary, 'temporary_migration_bridge_count') > 0
    || numberField(summary, 'retire_tombstone_count') > 0
    || numberField(summary, 'active_private_generic_residue_count') > 0
    || numberField(summary, 'blocker_count') > 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256Fingerprint(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function observedDriftManifest(descriptor: JsonRecord) {
  const direct = isRecord(descriptor.generated_artifact_drift_manifest)
    ? descriptor.generated_artifact_drift_manifest
    : null;
  const packCompilerInput = isRecord(descriptor.pack_compiler_input_contract)
    ? descriptor.pack_compiler_input_contract
    : null;
  const handoff = isRecord(descriptor.generated_surface_handoff_contract)
    ? descriptor.generated_surface_handoff_contract
    : null;
  return {
    manifest:
      direct
      ?? (isRecord(packCompilerInput?.generated_artifact_drift_manifest)
        ? packCompilerInput.generated_artifact_drift_manifest
        : null)
      ?? (isRecord(handoff?.generated_artifact_drift_manifest)
        ? handoff.generated_artifact_drift_manifest
        : null),
    refs: [
      direct ? 'family_agent_descriptor.generated_artifact_drift_manifest' : null,
      isRecord(packCompilerInput?.generated_artifact_drift_manifest)
        ? 'pack_compiler_input_contract.generated_artifact_drift_manifest'
        : null,
      isRecord(handoff?.generated_artifact_drift_manifest)
        ? 'generated_surface_handoff_contract.generated_artifact_drift_manifest'
        : null,
    ].filter((ref): ref is string => Boolean(ref)),
  };
}

function buildGeneratedArtifactSourceInputs(descriptor: JsonRecord) {
  return {
    project_id: optionalString(descriptor.project_id),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    generated_from: GENERATED_INTERFACE_SOURCE_REFS,
    source_descriptor_surfaces: {
      family_action_catalog: descriptor.family_action_catalog,
      family_stage_control_plane: descriptor.family_stage_control_plane,
      domain_memory_descriptor: descriptor.domain_memory_descriptor,
      family_transition: descriptor.family_transition,
      grant_transition_oracle: descriptor.grant_transition_oracle,
      runtime_surfaces: descriptor.runtime_surfaces,
      functional_privatization_audit: descriptor.functional_privatization_audit,
      generated_surface_handoff: descriptor.generated_surface_handoff_contract,
      pack_compiler_input: descriptor.pack_compiler_input_contract,
      product_entry_manifest_descriptor: descriptor.product_entry_manifest_descriptor,
      sidecar_descriptor: descriptor.sidecar_descriptor,
      session_continuity: descriptor.session_continuity_contract,
      source_contract_consumption: descriptor.source_contract_consumption,
    },
  };
}

function buildGeneratedArtifactDriftManifest(
  descriptor: JsonRecord,
  generatedInterfaceBundle: JsonRecord,
  compilerStatus: string,
  blockerReasons: string[],
) {
  const sourceInputs = buildGeneratedArtifactSourceInputs(descriptor);
  const domainPackSourceInputsFingerprint = sha256Fingerprint(sourceInputs);
  const generatedBundleFingerprint = sha256Fingerprint(generatedInterfaceBundle);
  const observed = observedDriftManifest(descriptor);
  const observedSourceFingerprint =
    optionalString(observed.manifest?.domain_pack_source_inputs_fingerprint)
    ?? optionalString(observed.manifest?.source_inputs_fingerprint);
  const observedBundleFingerprint =
    optionalString(observed.manifest?.generated_bundle_fingerprint)
    ?? optionalString(observed.manifest?.generated_artifact_bundle_fingerprint);
  const driftFindings = [
    ...blockerReasons.map((reason) => `compiler_blocker:${reason}`),
    observedSourceFingerprint && observedSourceFingerprint !== domainPackSourceInputsFingerprint
      ? 'domain_pack_source_inputs_fingerprint_changed'
      : null,
    observedBundleFingerprint && observedBundleFingerprint !== generatedBundleFingerprint
      ? 'generated_bundle_fingerprint_changed'
      : null,
  ].filter((finding): finding is string => Boolean(finding));

  return {
    surface_kind: 'opl_generated_artifact_drift_manifest',
    version: 'opl-generated-artifact-drift-manifest.v1',
    owner: 'one-person-lab',
    status: compilerStatus === 'ready' && driftFindings.length === 0 ? 'aligned' : 'drift_detected',
    target_domain_id: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
    agent_id: optionalString(descriptor.agent_id),
    generated_surface_owner: 'one-person-lab',
    domain_pack_source_inputs_fingerprint: domainPackSourceInputsFingerprint,
    generated_bundle_fingerprint: generatedBundleFingerprint,
    fingerprint_algorithm: 'sha256:stable-json',
    generated_from: GENERATED_INTERFACE_SOURCE_REFS,
    source_input_refs: [
      'family_agent_descriptor.family_action_catalog',
      'family_agent_descriptor.family_stage_control_plane',
      'family_agent_descriptor.domain_memory_descriptor',
      'family_agent_descriptor.runtime_surfaces',
      'family_agent_descriptor.functional_privatization_audit',
      'family_agent_descriptor.generated_surface_handoff_contract',
      'family_agent_descriptor.product_entry_manifest_descriptor',
      'family_agent_descriptor.sidecar_descriptor',
    ],
    observed_manifest_refs: observed.refs,
    observed_domain_pack_source_inputs_fingerprint: observedSourceFingerprint,
    observed_generated_bundle_fingerprint: observedBundleFingerprint,
    drift_findings: driftFindings,
    authority_boundary: {
      opl_owns_generated_surfaces: true,
      opl_owns_domain_truth: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_domain_artifacts: false,
      domain_truth_owner: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
    },
  };
}

function minimalAuthorityFunctionRefs(descriptor: JsonRecord) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  const modules = Array.isArray(audit?.modules) ? audit.modules : [];
  return modules
    .filter((module): module is JsonRecord =>
      isRecord(module) && optionalString(module.migration_class) === 'minimal_authority_function'
    )
    .map((module) => ({
      module_id: optionalString(module.module_id),
      code_paths: Array.isArray(module.code_paths) ? module.code_paths.filter((item) => typeof item === 'string') : [],
      active_callers: Array.isArray(module.active_callers)
        ? module.active_callers.filter((item) => typeof item === 'string')
        : [],
      cannot_absorb_reason: optionalString(module.cannot_absorb_reason),
    }));
}

function readRepoJson(repoDir: string, relativePath: string) {
  const filePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Invalid JSON in ${relativePath}.`, {
      repo_dir: repoDir,
      relative_path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeRepoActionCatalog(repoDir: string, value: unknown) {
  if (!value) {
    return null;
  }
  try {
    return normalizeFamilyActionCatalog(value);
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'contracts/action_catalog.json is not a valid family-action-catalog.v1 contract.', {
      repo_dir: repoDir,
      relative_path: 'contracts/action_catalog.json',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeRepoStageControlPlane(repoDir: string, value: unknown) {
  if (!value) {
    return null;
  }
  try {
    return normalizeFamilyStageControlPlane(value);
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'contracts/stage_control_plane.json is not a valid family-stage-control-plane.v1 contract.', {
      repo_dir: repoDir,
      relative_path: 'contracts/stage_control_plane.json',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildRepoContractDescriptor(repoDirInput: string) {
  const repoDir = path.resolve(repoDirInput);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    throw new FrameworkContractError('cli_usage_error', `Generated interface repo dir does not exist: ${repoDir}`, {
      repo_dir: repoDir,
    });
  }

  const domainDescriptor = readRepoJson(repoDir, 'contracts/domain_descriptor.json') ?? {};
  const actionCatalog = normalizeRepoActionCatalog(repoDir, readRepoJson(repoDir, 'contracts/action_catalog.json'));
  const stageControlPlane = normalizeRepoStageControlPlane(
    repoDir,
    readRepoJson(repoDir, 'contracts/stage_control_plane.json'),
  );
  const functionalAuditRaw = readRepoJson(repoDir, 'contracts/functional_privatization_audit.json');
  const generatedSurfaceHandoffRaw = readRepoJson(repoDir, 'contracts/generated_surface_handoff.json');
  const packCompilerInput = readRepoJson(repoDir, 'contracts/pack_compiler_input.json');
  const memoryDescriptor = readRepoJson(repoDir, 'contracts/memory_descriptor.json');
  const functionalBoundary = isRecord(functionalAuditRaw) && isRecord(functionalAuditRaw.functional_consumer_boundary)
    ? functionalAuditRaw.functional_consumer_boundary
    : null;
  const boundaryGeneratedHandoff = isRecord(functionalBoundary?.generated_surface_handoff)
    ? functionalBoundary.generated_surface_handoff
    : null;
  const generatedSurfaceHandoff =
    generatedSurfaceHandoffRaw || boundaryGeneratedHandoff
      ? {
          ...(isRecord(generatedSurfaceHandoffRaw) ? generatedSurfaceHandoffRaw : {}),
          ...(isRecord(boundaryGeneratedHandoff) ? {
            mas_functional_consumer_handoff_status: boundaryGeneratedHandoff.status,
            active_caller_cutover_status: boundaryGeneratedHandoff.active_caller_cutover_status,
            production_consumption_status: boundaryGeneratedHandoff.production_consumption_status,
            handoff_surfaces: recordList(boundaryGeneratedHandoff.handoff_surfaces),
          } : {}),
        }
      : null;
  const targetDomainId =
    actionCatalog?.target_domain_id
    ?? stageControlPlane?.target_domain_id
    ?? optionalString((domainDescriptor as JsonRecord).domain_id)
    ?? path.basename(repoDir);
  const functionalAuditManifest =
    functionalBoundary
      ? {
          target_domain_id: targetDomainId,
          functional_consumer_boundary: functionalBoundary,
        }
      : {
          target_domain_id: targetDomainId,
          functional_privatization_audit: functionalAuditRaw ?? undefined,
        };
  const functionalAudit = buildFunctionalPrivatizationAudit(functionalAuditManifest);
  const blockerReasons = [
    actionCatalog ? null : 'missing_contract:contracts/action_catalog.json',
    stageControlPlane ? null : 'missing_or_invalid_contract:contracts/stage_control_plane.json',
    genericResidueBlocked(functionalAudit.summary)
      ? 'functional_privatization_audit_has_generic_residue_or_blocker'
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';

  return {
    descriptor: {
      project_id: targetDomainId,
      project: optionalString((domainDescriptor as JsonRecord).domain_label) ?? targetDomainId,
      target_domain_id: targetDomainId,
      agent_id: optionalString((domainDescriptor as JsonRecord).domain_id) ?? targetDomainId,
      source_contract_consumption: {
        surface_kind: 'opl_repo_contract_consumption_projection',
        repo_dir: repoDir,
        status: status,
        consumed_contracts: [
          {
            contract_id: 'domain_descriptor',
            path: 'contracts/domain_descriptor.json',
            status: Object.keys(domainDescriptor as JsonRecord).length > 0 ? 'resolved' : 'missing',
          },
          {
            contract_id: 'action_catalog',
            path: 'contracts/action_catalog.json',
            status: actionCatalog ? 'resolved' : 'missing',
          },
          {
            contract_id: 'stage_control_plane',
            path: 'contracts/stage_control_plane.json',
            status: stageControlPlane ? 'resolved' : 'missing',
          },
          {
            contract_id: 'generated_surface_handoff',
            path: 'contracts/generated_surface_handoff.json',
            status: generatedSurfaceHandoff ? 'resolved' : 'missing',
          },
          {
            contract_id: 'product_entry_manifest_descriptor',
            path: 'contracts/action_catalog.json',
            status: actionCatalog ? 'resolved_from_family_action_catalog' : 'missing',
          },
          {
            contract_id: 'sidecar_descriptor',
            path: 'contracts/generated_surface_handoff.json',
            status: generatedSurfaceHandoff ? 'resolved_from_generated_surface_handoff' : 'missing',
          },
          {
            contract_id: 'pack_compiler_input',
            path: 'contracts/pack_compiler_input.json',
            status: packCompilerInput ? 'resolved' : 'missing',
          },
          {
            contract_id: 'functional_privatization_audit',
            path: 'contracts/functional_privatization_audit.json',
            status: functionalAudit.status,
          },
        ],
      },
      family_action_catalog: {
        status: actionCatalog ? 'resolved' : 'missing',
        raw_descriptor: actionCatalog,
      },
      family_stage_control_plane: {
        status: stageControlPlane ? 'resolved' : 'missing',
        raw_descriptor: stageControlPlane,
      },
      generated_surface_handoff_contract: generatedSurfaceHandoff,
      pack_compiler_input_contract: packCompilerInput,
      product_entry_manifest_descriptor: {
        status: actionCatalog && stageControlPlane ? 'resolved_from_repo_contracts' : 'missing_required_repo_contract',
        source_refs: [
          'contracts/domain_descriptor.json',
          'contracts/action_catalog.json',
          'contracts/stage_control_plane.json',
          'contracts/functional_privatization_audit.json',
        ],
        product_entry_manifest_contract_ref: 'contracts/schemas/v1/product-entry-manifest.schema.json',
      },
      sidecar_descriptor: {
        status: generatedSurfaceHandoff ? 'resolved_from_generated_surface_handoff' : 'missing_generated_surface_handoff',
        source_refs: [
          'contracts/generated_surface_handoff.json',
          'contracts/action_catalog.json',
          'contracts/functional_privatization_audit.json',
        ],
      },
      session_continuity_contract: packCompilerInput
        ? {
            status: 'resolved_from_pack_compiler_input',
            surface_kind: 'session_continuity',
            source_ref: 'contracts/pack_compiler_input.json',
          }
        : null,
      domain_memory_descriptor: {
        status: memoryDescriptor ? 'resolved' : 'missing',
        raw_descriptor: memoryDescriptor,
      },
      functional_privatization_audit: {
        status: functionalAudit.status,
        summary: functionalAudit.summary,
        modules: functionalAudit.modules,
      },
    },
    repoDir,
    status,
    blockerReasons,
  };
}

function surfaceProjection(descriptor: JsonRecord, surface: typeof GENERATED_SURFACES[number]) {
  const missing = surface.required_descriptor_surfaces.filter((required) =>
    !descriptorSurfaceResolved(descriptor, required)
  );
  return {
    surface_id: surface.surface_id,
    owner: 'one-person-lab',
    status: missing.length === 0 ? 'ready_from_descriptor' : 'blocked_missing_descriptor_surface',
    source_descriptor_surfaces: surface.required_descriptor_surfaces,
    missing_descriptor_surfaces: missing,
    domain_repo_can_own_generated_surface: false,
  };
}

function buildPackCompilerProjection(descriptor: JsonRecord) {
  const summary = functionalAuditSummary(descriptor);
  const generatedSurfaces = GENERATED_SURFACES.map((surface) => surfaceProjection(descriptor, surface));
  const missingRequired = generatedSurfaces.flatMap((surface) => surface.missing_descriptor_surfaces);
  const blockerReasons = [
    optionalString(descriptor.manifest_status) === 'resolved' ? null : 'domain_manifest_not_resolved',
    genericResidueBlocked(summary) ? 'functional_privatization_audit_has_generic_residue_or_blocker' : null,
    ...missingRequired.map((surface) => `missing_descriptor_surface:${surface}`),
  ].filter((reason): reason is string => reason !== null);
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';
  const generatedInterfaceBundle = buildGeneratedInterfaceBundle(descriptor, status);

  return {
    surface_kind: 'opl_domain_pack_compiler_projection',
    compiler_version: 'opl-domain-pack-compiler.v1',
    project_id: optionalString(descriptor.project_id),
    project: optionalString(descriptor.project),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    compiler_status: status,
    blocker_reasons: [...new Set(blockerReasons)],
    pack_compiler_input_projection: {
      surface_kind: 'opl_domain_pack_compiler_input_projection',
      source_descriptor_ref: `opl agents descriptor --domain ${optionalString(descriptor.agent_id) ?? optionalString(descriptor.project_id) ?? 'unknown'}`,
      domain_pack_owner: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      declarative_pack_refs: {
        stage_control_plane_status: statusOf(descriptor.family_stage_control_plane),
        action_catalog_status: statusOf(descriptor.family_action_catalog),
        domain_memory_descriptor_status: statusOf(descriptor.domain_memory_descriptor),
        transition_status: transitionSurfaceStatus(descriptor),
        transition_evidence_gate_status:
          transitionSurfaceStatus(descriptor) === 'oracle_evidence_gate'
            ? 'grant_transition_oracle_matrix_passed'
            : null,
        skill_catalog_status: statusOf(descriptor.skill_catalog),
      },
      minimal_authority_function_refs: minimalAuthorityFunctionRefs(descriptor),
      functional_privatization_summary: summary,
    },
    generated_surface_handoff: {
      surface_kind: 'opl_generated_surface_handoff_projection',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: generatedSurfaces,
      generated_surface_ready_count: generatedSurfaces.filter((surface) => surface.status === 'ready_from_descriptor').length,
      generated_surface_blocked_count: generatedSurfaces.filter((surface) =>
        surface.status === 'blocked_missing_descriptor_surface'
      ).length,
    },
    generated_interface_bundle: generatedInterfaceBundle,
    generated_artifact_drift_manifest: buildGeneratedArtifactDriftManifest(
      descriptor,
      generatedInterfaceBundle as JsonRecord,
      status,
      [...new Set(blockerReasons)],
    ),
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      generated_surface_can_call_minimal_authority_function_with_receipt_contract: true,
      provider_completion_is_domain_ready: false,
    },
  };
}

function buildCompilerDomains(contracts: FrameworkContracts) {
  const descriptorList = buildFamilyAgentDescriptorList(contracts);
  const familyAgentDescriptors = descriptorList.family_agent_descriptors;
  return familyAgentDescriptors.descriptors.map((descriptor) =>
    buildPackCompilerProjection(descriptor as JsonRecord)
  );
}

export function buildDomainPackCompilerList(contracts: FrameworkContracts) {
  const domains = buildCompilerDomains(contracts);
  return {
    version: 'g2',
    domain_pack_compiler: {
      surface_kind: 'opl_domain_pack_compiler_index',
      owner: 'one-person-lab',
      summary: {
        total_domain_count: domains.length,
        ready_domain_count: domains.filter((domain) => domain.compiler_status === 'ready').length,
        blocked_domain_count: domains.filter((domain) => domain.compiler_status === 'blocked').length,
        generated_surface_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surfaces.length,
          0,
        ),
        generated_surface_ready_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surface_ready_count,
          0,
        ),
        generated_surface_blocked_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surface_blocked_count,
          0,
        ),
        domain_generated_surface_owner_claim_count: domains.filter((domain) =>
          domain.generated_surface_handoff.domain_repo_can_own_generated_surface
        ).length,
        generated_artifact_drift_aligned_count: domains.filter((domain) =>
          domain.generated_artifact_drift_manifest.status === 'aligned'
        ).length,
        generated_artifact_drift_detected_count: domains.filter((domain) =>
          domain.generated_artifact_drift_manifest.status === 'drift_detected'
        ).length,
      },
      domains,
      authority_boundary: {
        opl_owns_generated_surfaces: true,
        domain_repo_can_own_generated_surface: false,
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    },
  };
}

export function buildDomainPackCompilerInspect(contracts: FrameworkContracts, args: string[]) {
  const { domain } = parseInspectArgs(args);
  const normalized = normalizeDomainSelection(domain);
  const domains = buildCompilerDomains(contracts);
  const selected = domains.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || candidate.target_domain_id === domain
    || candidate.target_domain_id === normalized
    || candidate.agent_id === domain
    || candidate.agent_id === normalized
  );
  if (!selected) {
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler domain: ${domain}.`, {
      domain,
      allowed_domains: domains.map((candidate) => candidate.project_id),
    });
  }
  return {
    version: 'g2',
    domain_pack_compiler: {
      ...selected,
      surface_kind: 'opl_domain_pack_compiler_inspection',
    },
  };
}

export function buildGeneratedAgentInterfaces(contracts: FrameworkContracts, args: string[]) {
  const { domain, repoDir, format } = parseInterfaceArgs(args);
  if (repoDir) {
    const repoProjection = buildRepoContractDescriptor(repoDir);
    const bundle = {
      ...buildGeneratedInterfaceBundle(repoProjection.descriptor, repoProjection.status, format),
      source_kind: 'standard_agent_repo_contracts',
      repo_dir: repoProjection.repoDir,
      blocker_reasons: repoProjection.blockerReasons,
    };
    return {
      version: 'g2',
      generated_agent_interfaces: selectGeneratedInterfaceBundleFormat(bundle as JsonRecord, format),
    };
  }

  const normalized = normalizeDomainSelection(domain);
  const domains = buildCompilerDomains(contracts);
  const selected = domains.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || candidate.target_domain_id === domain
    || candidate.target_domain_id === normalized
    || candidate.agent_id === domain
    || candidate.agent_id === normalized
  );
  if (!selected) {
    throw new FrameworkContractError('cli_usage_error', `Unknown generated interface domain: ${domain}.`, {
      domain,
      allowed_domains: domains.map((candidate) => candidate.project_id),
    });
  }

  return {
    version: 'g2',
    generated_agent_interfaces: selectGeneratedInterfaceBundleFormat(
      selected.generated_interface_bundle as unknown as JsonRecord,
      format,
    ),
  };
}
