import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildGeneratedAgentInterfaces } from '../pack/index.ts';
import { resolveStandardAgent } from '../charter/index.ts';
import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
} from '../atlas/index.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileResult } from '../../kernel/json-file.ts';
import { QUEUE_PROJECTION_VOCABULARY } from '../../kernel/queue-projection-vocabulary.ts';
import {
  record,
  recordList,
  stringList,
  stringValue as optionalString,
  uniqueStringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { buildDefaultCallerPhysicalDeleteAuthorityReadModel } from './agent-default-caller-delete-read-model.ts';
import { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
import { buildPrivatePlatformResidueDeletionGate } from './private-platform-residue-deletion-gate.ts';
import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
  defaultCallerOwnerDecisionCloseoutReadout,
} from './default-caller-retirement-guard.ts';
import {
  DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS,
  DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS,
  defaultCallerSurfaceGates,
} from './default-caller-surface-gates.ts';
import { buildDomainPrivatePlatformTailMatrixReadback } from './domain-private-platform-tail-matrix.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

const OPL_OWNED_GENERIC_SUBDOMAINS = [
  {
    subdomain_id: 'generated_cli_mcp_skill_product_shell',
    opl_primitive: 'opl_generated_interface_bundle',
    surface_aliases: ['cli', 'mcp', 'skill', 'product_entry', 'product_entry_manifest'],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_domain_handler_dispatch_shell',
    opl_primitive: 'opl_generated_domain_handler_descriptor',
    surface_aliases: [
      'domain_handler',
      'stage_attempt_dispatch_intent',
    ],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_action_metadata_command_registration_shell',
    opl_primitive: 'opl_generated_action_metadata_registry',
    surface_aliases: [
      'action_catalog',
      'action_metadata',
      'domain_action_metadata',
      'guarded_action',
      'guarded_actions',
      'guarded_action_catalog',
      'command_registration',
      'mcp_action_scaffold',
    ],
    domain_allowed_role: 'domain_action_ids_handler_refs_or_refs_only_metadata_source',
  },
  {
    subdomain_id: 'status_read_model_and_workbench_shell',
    opl_primitive: 'opl_generated_status_and_hosted_workbench_projection',
    surface_aliases: ['status', 'status_read_model', 'workbench', 'workbench_drilldown', 'portal', 'cockpit'],
    domain_allowed_role: 'refs_only_projection_adapter',
  },
  {
    subdomain_id: 'workspace_source_artifact_memory_locator',
    opl_primitive: 'opl_generic_substrate_projection',
    surface_aliases: ['workspace', 'source', 'artifact', 'memory', 'locator', 'lifecycle'],
    domain_allowed_role: 'opaque_ref_provider',
  },
  {
    subdomain_id: 'stage_attempt_retry_dead_letter',
    opl_primitive: 'opl_provider_backed_family_runtime',
    surface_aliases: ['runtime', 'queue', 'attempt', 'attempt_ledger', 'retry', QUEUE_PROJECTION_VOCABULARY.deadLetter, 'scheduler', 'watch'],
    domain_allowed_role: 'domain_authority_receipt_or_typed_blocker_target',
  },
  {
    subdomain_id: 'generic_transition_runner',
    opl_primitive: 'family_transition_runner',
    surface_aliases: ['transition', 'state_machine', 'runner', 'harness'],
    domain_allowed_role: 'domain_transition_spec_or_oracle_ref',
  },
] as const;

const RETAINED_DOMAIN_AUTHORITY = [
  'domain_truth',
  'quality_or_export_or_publication_or_visual_verdict',
  'artifact_body_and_mutation_authority',
  'source_readiness_verdict',
  'memory_body_accept_reject',
  'owner_receipt_signing',
  'typed_blocker_materialization',
  'domain_specific_policy_rubric_or_quality_gate',
] as const;

function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  const result = readJsonFileResult(absolutePath);
  return {
    path: relativePath,
    status: result.status,
    payload: result.payload,
    error: result.error,
  };
}

function normalizeDomainSelection(value: string) {
  return resolveStandardAgent(value)?.domain_id ?? value.trim().toLowerCase();
}

function readDomainId(repoDir: string, fallback: string | null) {
  const descriptor = readJsonFile(repoDir, 'contracts/domain_descriptor.json').payload;
  if (!isRecord(descriptor)) {
    return fallback ?? path.basename(repoDir);
  }
  return optionalString(descriptor.domain_id)
    ?? optionalString(descriptor.domain_label)
    ?? fallback
    ?? path.basename(repoDir);
}

function parseRepoArgs(args: string[], commandName: string): RepoInput[] {
  const repos: RepoInput[] = [];
  const usage = `${commandName} [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]`;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--repo-dir' && args[index + 1]) {
      repos.push({
        requested_agent_id: null,
        repo_dir: args[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--agent' && args[index + 1]) {
      const value = args[index + 1];
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new FrameworkContractError('cli_usage_error', `${commandName} --agent expects <agent_id>=<repo_dir>.`, {
          usage,
        });
      }
      repos.push({
        requested_agent_id: value.slice(0, separator),
        repo_dir: value.slice(separator + 1),
      });
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown ${commandName} option: ${token}.`, {
      usage,
    });
  }

  const selected = repos.length > 0 ? repos : defaultStandardDomainAgentRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', `${commandName} could not discover family agent repos.`, {
      usage,
      default_repo_directories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

function gitTrackedOrWalkedFiles(repoDir: string) {
  const gitResult = spawnSync('git', ['ls-files'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  if (gitResult.status === 0 && gitResult.stdout.trim()) {
    return gitResult.stdout.split('\n').filter(Boolean).sort();
  }
  return walkFiles(repoDir).sort();
}

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'dist') {
      return [];
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(root, absolutePath);
    }
    if (!entry.isFile()) {
      return [];
    }
    return [path.relative(root, absolutePath).split(path.sep).join('/')];
  });
}

function codeFile(pathname: string) {
  return /\.(py|ts|tsx|js|mjs|cjs|json)$/i.test(pathname)
    || pathname === 'Makefile'
    || pathname === 'package.json'
    || pathname === 'pyproject.toml';
}

function activeProgramFiles(repoDir: string) {
  return gitTrackedOrWalkedFiles(repoDir).filter((relativePath) => (
    codeFile(relativePath)
    && !relativePath.startsWith('docs/')
    && !relativePath.startsWith('tests/fixtures/')
    && !relativePath.startsWith('node_modules/')
    && !relativePath.startsWith('dist/')
  ));
}

function proseFile(pathname: string) {
  return /^README(?:\.[\w-]+)?\.md$/i.test(pathname) || (
    pathname.startsWith('docs/')
    && /\.md$/i.test(pathname)
  );
}

function searchableRecords(value: unknown, currentPath = '$'): Array<{ path: string; text: string }> {
  if (typeof value === 'string') {
    return [{ path: currentPath, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => searchableRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    searchableRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

function scalarRecords(value: unknown, currentPath = '$'): Array<{ path: string; value: unknown }> {
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    || value === null
  ) {
    return [{ path: currentPath, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scalarRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    scalarRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

function surfaceTextFromContracts(repoDir: string) {
  const paths = [
    'contracts/functional_privatization_audit.json',
    'contracts/generated_surface_handoff.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/physical_source_morphology_policy.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  return paths.flatMap((relativePath) => {
    const file = readJsonFile(repoDir, relativePath);
    return searchableRecords(file.payload).map((entry) => ({
      source_path: relativePath,
      json_path: entry.path,
      text: entry.text,
    }));
  });
}

function diagnosticRefsForSubdomain(repoDir: string, aliases: readonly string[]) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  const filenameRefs = activeProgramFiles(repoDir)
    .filter((relativePath) => normalizedAliases.some((alias) => (
      relativePath.toLowerCase().includes(alias.replace(/_/g, '-'))
      || relativePath.toLowerCase().includes(alias)
    )))
    .slice(0, 12);
  const contractRefs = surfaceTextFromContracts(repoDir)
    .filter((entry) => normalizedAliases.some((alias) => entry.text.toLowerCase().includes(alias)))
    .map((entry) => `${entry.source_path}${entry.json_path === '$' ? '' : `#${entry.json_path}`}`);
  const proseRefs = gitTrackedOrWalkedFiles(repoDir)
    .filter(proseFile)
    .filter((relativePath) => {
      try {
        const text = fs.readFileSync(path.join(repoDir, relativePath), 'utf8').toLowerCase();
        return normalizedAliases.some((alias) => text.includes(alias.replace(/_/g, ' '))
          || text.includes(alias.replace(/_/g, '-'))
          || text.includes(alias));
      } catch {
        return false;
      }
    })
    .slice(0, 12);
  return uniqueStringList([
    ...filenameRefs.slice(0, 8),
    ...contractRefs.slice(0, 8),
    ...proseRefs.slice(0, 8),
  ]);
}

function hardGateEvidenceRefs(repoDir: string) {
  return [
    'contracts/functional_privatization_audit.json#authority_boundary',
    'contracts/private_functional_surface_policy.json#authority_boundary',
    'contracts/physical_source_morphology_policy.json#authority_boundary',
  ].filter((ref) => fs.existsSync(path.join(repoDir, ref.split('#')[0])));
}

function explicitForbiddenOwnerClaims(repoDir: string) {
  const files = [
    readJsonFile(repoDir, 'contracts/functional_privatization_audit.json'),
    readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json'),
    readJsonFile(repoDir, 'contracts/physical_source_morphology_policy.json'),
  ];
  return files.flatMap((file) => {
    const values = scalarRecords(file.payload);
    return values.flatMap((entry) => {
      const field = entry.path.toLowerCase();
      const text = String(entry.value).toLowerCase();
      const fieldClaimsGeneric =
        field.includes('domain_can_claim_generic_runtime_owner')
        || field.includes('domain_repo_can_own_generated_surface')
        || field.includes('can_own_generic_runtime')
        || field.includes('can_own_generated_wrapper')
        || field.includes('generated_surface_owner_in_domain_repo')
        || field.includes('generic_runtime_owner');
      const textClaimsGeneric = [
        'generic_runtime_owner:true',
        'generated_surface_owner_in_domain_repo:true',
        'domain repo owns generated wrapper',
        'domain_repo_can_own_generated_surface:true',
        'can own generic runtime:true',
      ].some((token) => text.includes(token));
      if (!fieldClaimsGeneric && !textClaimsGeneric) {
        return [];
      }
      if (entry.value === false || entry.value === 0 || entry.value === null) {
        return [];
      }
      const rawValue = String(entry.value).trim();
      if (!rawValue || rawValue === 'false' || rawValue === '0') {
        return [];
      }
      return [{
        source_path: file.path,
        json_path: entry.path,
        value: rawValue,
      }];
    });
  });
}

function readDeclaredAuthorityBoundary(repoDir: string) {
  const audit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const auditAuthority = isRecord(audit.payload) && isRecord(audit.payload.authority_boundary)
    ? audit.payload.authority_boundary
    : {};
  const workspacePolicy = readJsonFile(repoDir, 'contracts/workspace_lifecycle_policy.json');
  const workspaceAuthority = isRecord(workspacePolicy.payload) && isRecord(workspacePolicy.payload.authority_boundary)
    ? workspacePolicy.payload.authority_boundary
    : {};
  return {
    domain_can_claim_generic_runtime_owner:
      auditAuthority.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface:
      auditAuthority.domain_repo_can_own_generated_surface ?? null,
    opl_can_write_domain_truth:
      auditAuthority.opl_can_write_domain_truth ?? workspaceAuthority.opl_can_write_domain_truth ?? null,
    opl_can_write_memory_body:
      auditAuthority.opl_can_write_memory_body ?? workspaceAuthority.opl_can_write_memory_body ?? null,
    opl_can_authorize_quality_or_export:
      auditAuthority.opl_can_authorize_quality_or_export ?? workspaceAuthority.opl_can_authorize_quality_or_export ?? null,
    opl_can_mutate_domain_artifact_body:
      workspaceAuthority.opl_can_mutate_domain_artifact_body ?? null,
  };
}

export function buildAgentPlatformSurfaceOwnershipForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const explicitClaims = explicitForbiddenOwnerClaims(resolvedRepoDir);
  const hardEvidenceRefs = hardGateEvidenceRefs(resolvedRepoDir);
  const genericSubdomains = OPL_OWNED_GENERIC_SUBDOMAINS.map((subdomain) => {
    const diagnosticRefs = diagnosticRefsForSubdomain(resolvedRepoDir, subdomain.surface_aliases);
    return {
      subdomain_id: subdomain.subdomain_id,
      owner: 'one-person-lab',
      opl_primitive: subdomain.opl_primitive,
      domain_allowed_role: subdomain.domain_allowed_role,
      status: diagnosticRefs.length > 0
        ? 'advisory_diagnostic_observed'
        : 'available_without_repo_local_declaration',
      hard_gate_evidence_refs: hardEvidenceRefs,
      advisory_diagnostic_refs: diagnosticRefs,
      advisory_diagnostic_policy:
        'filename_contract_text_and_prose_refs_are_diagnostic_only_not_admission_blockers',
      observed_source_refs: diagnosticRefs,
      observed_source_refs_role: 'compatibility_alias_for_advisory_diagnostic_refs',
    };
  });
  const blockers = explicitClaims.map((claim) => (
    `domain_declares_generic_platform_owner:${claim.source_path}:${claim.json_path}`
  ));
  return {
    surface_kind: 'opl_agent_platform_surface_ownership_projection',
    version: 'v1',
    owner: 'one-person-lab',
    repo_dir: resolvedRepoDir,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    generic_subdomain_count: genericSubdomains.length,
    generic_subdomains: genericSubdomains,
    explicit_forbidden_owner_claims: explicitClaims,
    blockers,
    hard_gate: {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      source_policy: 'machine_contracts_receipts_and_proofs_only',
      evidence_refs: hardEvidenceRefs,
      blocker_count: blockers.length,
      explicit_forbidden_owner_claims: explicitClaims,
    },
    advisory_diagnostics: {
      status: 'reported_not_blocking',
      source_policy:
        'filename_markdown_prose_and_contract_text_scans_are_for_operator_diagnosis_only',
      can_block_standard_agent_admission: false,
      diagnostic_ref_count: genericSubdomains.reduce(
        (total, subdomain) => total + subdomain.advisory_diagnostic_refs.length,
        0,
      ),
    },
    retained_domain_authority: RETAINED_DOMAIN_AUTHORITY,
    migration_gate: {
      replacement_parity_required: true,
      active_caller_cutover_required: true,
      domain_owner_receipt_or_typed_blocker_required: true,
      no_forbidden_write_proof_required: true,
      descriptor_ready_is_not_production_ready: true,
    },
    declared_authority_boundary: readDeclaredAuthorityBoundary(resolvedRepoDir),
    authority_boundary: {
      opl_owns_generic_platform_surfaces: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_domain_artifacts: false,
      domain_repos_keep_truth_verdict_artifact_memory_and_receipt_authority: true,
      report_can_claim_domain_ready: false,
      report_can_claim_production_ready: false,
    },
  };
}

function generatedInterfaceBundleForRepo(repoDir: string) {
  const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
  return result.generated_agent_interfaces as JsonRecord;
}

export function buildAgentDefaultCallerReadinessForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const platformSurfaceOwnership = buildAgentPlatformSurfaceOwnershipForRepo(resolvedRepoDir, requestedAgentId);
  const functionalAudit = readJsonFile(resolvedRepoDir, 'contracts/functional_privatization_audit.json');
  const normalizedFunctionalAudit = buildFunctionalPrivatizationAudit(isRecord(functionalAudit.payload)
    ? {
        target_domain_id: domainId,
        functional_privatization_audit: functionalAudit.payload,
      }
    : null);
  const declaredFunctionalAudit = isRecord(functionalAudit.payload) ? functionalAudit.payload : {};
  const defaultSurfaceBoundary = record(declaredFunctionalAudit.default_surface_boundary);
  const retiredDefaultSurfaceIds = new Set(
    optionalString(defaultSurfaceBoundary.state) === 'physically_absent'
      ? stringList(declaredFunctionalAudit.retired_default_surface_ids)
      : [],
  );
  const privatePlatformResidueDeletionGate =
    buildPrivatePlatformResidueDeletionGate(normalizedFunctionalAudit.modules);
  try {
    const bundle = generatedInterfaceBundleForRepo(resolvedRepoDir);
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : {};
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : {};
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : {};
    const surfaceGates = defaultCallerSurfaceGates(bundle);
    const surfaceBlockers = surfaceGates
      .filter((gate) => gate.status !== 'ready_for_default_caller_cutover')
      .map((gate) => `default_caller_surface_blocked:${gate.surface_id}`);
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.generated_surface_owner) === 'one-person-lab'
        ? null
        : `generated_surface_owner_not_opl:${optionalString(bundle.generated_surface_owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle.status) ?? 'missing'}`,
      optionalString(targetProof.status) === 'ready'
        ? null
        : `active_caller_target_proof_not_ready:${optionalString(targetProof.status) ?? 'missing'}`,
      optionalString(cutoverProof.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_not_ready:${optionalString(cutoverProof.status) ?? 'missing'}`,
      cutoverProof.claims_live_soak_complete === true
        ? 'cutover_proof_must_not_claim_live_soak_complete'
        : null,
      cutoverProof.claims_domain_ready === true
        ? 'cutover_proof_must_not_claim_domain_ready'
        : null,
      platformSurfaceOwnership.status === 'passed'
        ? null
        : 'platform_surface_ownership_blocked',
      ...surfaceBlockers,
    ].filter((entry): entry is string => Boolean(entry));
    const replacementReady = blockers.length === 0;
    const surfaceRetirementGates = surfaceGates.map((gate) => gate.deletion_evidence_worklist);
    const applicableSurfaceRetirementGates = surfaceRetirementGates.filter((worklist) => (
      !retiredDefaultSurfaceIds.has(optionalString(worklist.surface_id) ?? '')
    ));
    const deletionEvidenceWorklists = applicableSurfaceRetirementGates.filter((worklist) =>
      worklist.active_deletion_worklist_item !== false
    );
    const missingDomainEvidenceCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.domain_owner_receipt_or_typed_blocker)
      && optionalString(worklist.domain_owner_receipt_or_typed_blocker.status) !== 'observed'
    )).length;
    const missingNoActiveCallerProofCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.no_active_caller_proof)
      && optionalString(worklist.no_active_caller_proof.status) !== 'observed'
    )).length;
    const missingNoForbiddenWriteCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.no_forbidden_write_proof)
      && optionalString(worklist.no_forbidden_write_proof.status) !== 'observed'
    )).length;
    const missingTombstoneOrProvenanceCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.tombstone_or_provenance_ref)
      && optionalString(worklist.tombstone_or_provenance_ref.status) !== 'observed'
    )).length;
    const allDeletionEvidenceRequirementsObserved = applicableSurfaceRetirementGates.length > 0
      && missingDomainEvidenceCount === 0
      && missingNoActiveCallerProofCount === 0
      && missingNoForbiddenWriteCount === 0
      && missingTombstoneOrProvenanceCount === 0;
    const deleteOrKeepPrerequisitesObserved = applicableSurfaceRetirementGates.length > 0
      && missingNoActiveCallerProofCount === 0
      && missingNoForbiddenWriteCount === 0
      && missingTombstoneOrProvenanceCount === 0;
    const physicalDeleteAuthorized = applicableSurfaceRetirementGates.length > 0
      && applicableSurfaceRetirementGates.every((worklist) => worklist.physical_delete_authorized === true);
    const physicalDeleteBlockedBy = physicalDeleteAuthorized
      ? []
      : [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS];
    const notAuthorizedClaims = physicalDeleteAuthorized
      ? []
      : [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS];
    const physicalDeleteAuthorizationStatus = physicalDeleteAuthorized
      ? 'authorized_by_domain_owner_physical_delete_ref'
      : 'not_authorized_by_opl_projection';
    const ownerDecisionResultShapes = uniqueStringList(
      surfaceRetirementGates
        .map((worklist) => optionalString(worklist.owner_decision_result_shape))
        .filter((entry): entry is string => Boolean(entry)),
    );
    const ownerDecisionResultShape = physicalDeleteAuthorized
        ? 'physical_delete_authorization_ref'
      : ownerDecisionResultShapes.includes('keep_as_authority_adapter_ref')
        ? 'keep_as_authority_adapter_ref'
      : ownerDecisionResultShapes.includes('typed_blocker_ref')
        ? 'typed_blocker_ref'
      : ownerDecisionResultShapes.includes('owner_receipt_ref')
        ? 'owner_receipt_ref'
      : null;
    const ownerDecisionCloseoutReadout = defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: deleteOrKeepPrerequisitesObserved,
      ownerDecisionObserved: allDeletionEvidenceRequirementsObserved,
      physicalDeleteAuthorized,
      ownerDecisionResultShape,
    });
    const nextRequiredOwnerAction = deleteOrKeepPrerequisitesObserved
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
      : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review';
    const acceptedRefsOnlyResultShapes = deleteOrKeepPrerequisitesObserved
      ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
      : ['typed_blocker_ref'];
    const report: JsonRecord = {
      surface_kind: 'opl_agent_generated_default_caller_readiness_projection',
      version: 'v1',
      owner: 'one-person-lab',
      repo_dir: resolvedRepoDir,
      requested_agent_id: requestedAgentId ?? null,
      domain_id: domainId,
      status: replacementReady ? 'ready_domain_evidence_required' : 'blocked',
      summary: {
        generated_default_caller_surface_count: surfaceGates.length,
        ready_surface_count: surfaceGates.length - surfaceBlockers.length,
        blocked_surface_count: surfaceBlockers.length,
        blocker_count: blockers.length,
        deletion_evidence_worklist_count: deletionEvidenceWorklists.length,
        surface_retirement_gate_count: surfaceRetirementGates.length,
        closed_surface_retirement_gate_count:
          surfaceRetirementGates.length - deletionEvidenceWorklists.length,
        retired_default_surface_count: retiredDefaultSurfaceIds.size,
        retired_default_surface_source_ref:
          'contracts/functional_privatization_audit.json#retired_default_surface_ids',
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceCount,
        retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        default_caller_delete_ready: physicalDeleteAuthorized,
        physical_delete_authorized: physicalDeleteAuthorized,
        owner_decision_result_shape: ownerDecisionResultShape,
        owner_decision_result_shapes: ownerDecisionResultShapes,
        ...ownerDecisionCloseoutReadout,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
      },
      default_caller_owner: 'one-person-lab',
      source_commands: {
        generated_interfaces: `opl agents interfaces --repo-dir ${resolvedRepoDir} --json`,
        platform_surfaces: `opl agents platform-surfaces --repo-dir ${resolvedRepoDir} --json`,
      },
      generated_interface_status: optionalString(bundle.status),
      generated_wrapper_bundle_status: optionalString(wrapperBundle.status),
      active_caller_target_proof_status: optionalString(targetProof.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof.status),
      deletion_evidence_worklists: deletionEvidenceWorklists,
      private_platform_residue_deletion_gate: privatePlatformResidueDeletionGate,
      blockers,
      deletion_gate: {
        replacement_parity: replacementReady ? 'ready' : 'blocked',
        active_caller_cutover: replacementReady ? 'ready' : 'blocked',
        no_active_caller_proof: 'required_before_physical_delete',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        retirement_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        physical_delete_authorized: physicalDeleteAuthorized,
        all_deletion_evidence_requirements_observed: allDeletionEvidenceRequirementsObserved,
        delete_or_keep_prerequisites_observed: deleteOrKeepPrerequisitesObserved,
        default_caller_delete_ready: physicalDeleteAuthorized,
        owner_decision_result_shape: ownerDecisionResultShape,
        owner_decision_result_shapes: ownerDecisionResultShapes,
        ...ownerDecisionCloseoutReadout,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_blocked_by: physicalDeleteBlockedBy,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
        owner_decision_required_after_prerequisites_observed:
          deleteOrKeepPrerequisitesObserved,
        next_required_owner_action: nextRequiredOwnerAction,
        accepted_refs_only_result_shapes: acceptedRefsOnlyResultShapes,
        owner_decision_required_after_all_refs_observed:
          allDeletionEvidenceRequirementsObserved,
        deletion_evidence_requirements_are_completion_claims: false,
        not_authorized_claims: notAuthorizedClaims,
        physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
        evidence_worklist_count: deletionEvidenceWorklists.length,
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceCount,
      },
      authority_boundary: {
        projection_can_claim_domain_ready: false,
        projection_can_claim_quality_verdict: false,
        projection_can_claim_artifact_authority: false,
        projection_can_claim_production_ready: false,
        projection_can_authorize_domain_repo_physical_delete: false,
        opl_default_caller_can_route_to_domain_handler_or_refs_adapter: true,
        domain_truth_verdict_artifact_and_owner_receipt_stay_in_domain: true,
      },
    };
    if (deletionEvidenceWorklists.length > 0) {
      report.surface_gates = surfaceGates;
      report.surface_retirement_gates = surfaceRetirementGates;
    } else if (surfaceRetirementGates.length > 0) {
      report.closed_surface_detail_policy =
        'closed_retirement_gate_details_omitted_from_default_payload';
    }
    return report;
  } catch (error) {
    return {
      surface_kind: 'opl_agent_generated_default_caller_readiness_projection',
      version: 'v1',
      owner: 'one-person-lab',
      repo_dir: resolvedRepoDir,
      requested_agent_id: requestedAgentId ?? null,
      domain_id: domainId,
      status: 'blocked',
      summary: {
        generated_default_caller_surface_count: 0,
        ready_surface_count: 0,
        blocked_surface_count: 0,
        blocker_count: 1,
      },
      blockers: [
        `generated_default_caller_projection_error:${error instanceof FrameworkContractError ? error.code : 'unknown'}`,
      ],
      error: error instanceof Error ? error.message : String(error),
      private_platform_residue_deletion_gate: privatePlatformResidueDeletionGate,
      deletion_gate: {
        replacement_parity: 'blocked',
        active_caller_cutover: 'blocked',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        physical_delete_authorized: false,
        all_deletion_evidence_requirements_observed: false,
        delete_or_keep_prerequisites_observed: false,
        default_caller_delete_ready: false,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_blocked_by: [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS],
        physical_delete_authorization_status: 'not_authorized_by_opl_projection',
        next_required_owner_action:
          'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
        accepted_refs_only_result_shapes: ['typed_blocker_ref'],
        owner_decision_required_after_prerequisites_observed: false,
        owner_decision_required_after_all_refs_observed: false,
        deletion_evidence_requirements_are_completion_claims: false,
        not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
        physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
      },
      authority_boundary: {
        projection_can_claim_domain_ready: false,
        projection_can_claim_quality_verdict: false,
        projection_can_claim_artifact_authority: false,
        projection_can_claim_production_ready: false,
        projection_can_authorize_domain_repo_physical_delete: false,
      },
    };
  }
}

export function buildAgentDefaultCallerReadinessReport(args: string[]) {
  const repos = parseRepoArgs(args, 'opl agents default-callers');
  const reports = repos.map((repo) => (
    buildAgentDefaultCallerReadinessForRepo(repo.repo_dir, repo.requested_agent_id)
  ));
  const domainPrivatePlatformTailMatrix = buildDomainPrivatePlatformTailMatrixReadback();
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  const generatedDefaultCallerSurfaceCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).generated_default_caller_surface_count || 0),
    0,
  );
  const blockedSurfaceCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).blocked_surface_count || 0),
    0,
  );
  const deletionEvidenceWorklistCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).deletion_evidence_worklist_count || 0),
    0,
  );
  const surfaceRetirementGateCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).surface_retirement_gate_count || 0),
    0,
  );
  const closedSurfaceRetirementGateCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).closed_surface_retirement_gate_count || 0),
    0,
  );
  const missingDomainOwnerReceiptOrTypedBlockerCount = reports.reduce(
    (total, report) => (
      total + Number(record(report.summary).missing_domain_owner_receipt_or_typed_blocker_count || 0)
    ),
    0,
  );
  const missingNoActiveCallerProofCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_no_active_caller_proof_count || 0),
    0,
  );
  const missingNoForbiddenWriteProofCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_no_forbidden_write_proof_count || 0),
    0,
  );
  const missingTombstoneOrProvenanceRefCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_tombstone_or_provenance_ref_count || 0),
    0,
  );
  const physicalDeleteAuthorityReadModel =
    buildDefaultCallerPhysicalDeleteAuthorityReadModel(reports, {
      physical_delete_blocked_by: [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS],
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    });
  const ownerDecisionStatus = optionalString(
    physicalDeleteAuthorityReadModel.owner_decision_status,
  );
  const physicalDeleteAuthorized =
    physicalDeleteAuthorityReadModel.physical_delete_authorized === true;
  const physicalDeleteAuthorizationStatus =
    optionalString(physicalDeleteAuthorityReadModel.physical_delete_authorization_status)
    ?? 'not_authorized_by_opl_projection';
  const ownerDecisionResultShape =
    optionalString(physicalDeleteAuthorityReadModel.owner_decision_result_shape);
  const ownerDecisionCloseoutStatus =
    optionalString(physicalDeleteAuthorityReadModel.owner_decision_closeout_status);
  const noFurtherOplDefaultCallerDeleteWork =
    physicalDeleteAuthorityReadModel.no_further_opl_default_caller_delete_work === true;
  const nextOplDefaultCallerDeleteAction =
    optionalString(physicalDeleteAuthorityReadModel.next_opl_default_caller_delete_action);
  const physicalDeleteBlockedBy = physicalDeleteAuthorized
    ? []
    : [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS];
  const notAuthorizedClaims = physicalDeleteAuthorized
    ? []
    : [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS];
  const structuralOwnerDecisionMissingCount = Number(
    physicalDeleteAuthorityReadModel
      .structural_prerequisites_observed_but_domain_owner_decision_missing_count || 0,
  );
  return {
    version: 'g1',
    blocked_count: blockedCount,
    deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    surface_retirement_gate_count: surfaceRetirementGateCount,
    closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    retirement_guard_readout: {
      target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: physicalDeleteAuthorized,
      refs_only_receipt_can_authorize_physical_delete: false,
      conformance_can_authorize_physical_delete: false,
      readiness_can_authorize_physical_delete: false,
    },
    default_caller_delete_ready: physicalDeleteAuthorized,
    physical_delete_authorized: physicalDeleteAuthorized,
    physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
    owner_decision_status: ownerDecisionStatus,
    owner_decision_result_shape: ownerDecisionResultShape,
    owner_decision_closeout_status: ownerDecisionCloseoutStatus,
    no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
    next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      structuralOwnerDecisionMissingCount,
    active_legacy_caller_deletion_gate:
      physicalDeleteAuthorityReadModel.active_legacy_caller_deletion_gate,
    domain_private_platform_tail_matrix: domainPrivatePlatformTailMatrix,
    physical_delete_authority_read_model: physicalDeleteAuthorityReadModel,
    repo_deletion_gate_summary:
      physicalDeleteAuthorityReadModel.repo_deletion_gate_summary,
    agent_default_caller_readiness: {
      surface_kind: 'opl_agent_generated_default_caller_readiness_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'ready_domain_evidence_required' : 'blocked',
      total_repo_count: reports.length,
      ready_domain_evidence_required_count: reports.length - blockedCount,
      blocked_count: blockedCount,
      generated_default_caller_surface_count: generatedDefaultCallerSurfaceCount,
      blocked_surface_count: blockedSurfaceCount,
      deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
      active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
      surface_retirement_gate_count: surfaceRetirementGateCount,
      closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
      missing_domain_owner_receipt_or_typed_blocker_count:
        missingDomainOwnerReceiptOrTypedBlockerCount,
      missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
      missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
      missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
      retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      retirement_guard_readout: {
        target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        physical_delete_authorized: physicalDeleteAuthorized,
        refs_only_receipt_can_authorize_physical_delete: false,
        conformance_can_authorize_physical_delete: false,
        readiness_can_authorize_physical_delete: false,
      },
      default_caller_delete_ready: physicalDeleteAuthorized,
      physical_delete_authorized: physicalDeleteAuthorized,
      generated_default_caller_readiness_can_authorize_physical_delete: false,
      physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
      owner_decision_status: ownerDecisionStatus,
      owner_decision_result_shape: ownerDecisionResultShape,
      owner_decision_closeout_status: ownerDecisionCloseoutStatus,
      no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
      next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
      structural_prerequisites_observed_but_domain_owner_decision_missing_count:
        structuralOwnerDecisionMissingCount,
      active_legacy_caller_deletion_gate:
        physicalDeleteAuthorityReadModel.active_legacy_caller_deletion_gate,
      domain_private_platform_tail_matrix: domainPrivatePlatformTailMatrix,
      physical_delete_blocked_by: physicalDeleteBlockedBy,
      physical_delete_authority_read_model: physicalDeleteAuthorityReadModel,
      repo_deletion_gate_summary:
        physicalDeleteAuthorityReadModel.repo_deletion_gate_summary,
      summary: {
        total_repo_count: reports.length,
        ready_domain_evidence_required_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        generated_default_caller_surface_count: generatedDefaultCallerSurfaceCount,
        blocked_surface_count: blockedSurfaceCount,
        deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
        active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
        surface_retirement_gate_count: surfaceRetirementGateCount,
        closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
        missing_domain_owner_receipt_or_typed_blocker_count:
          missingDomainOwnerReceiptOrTypedBlockerCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
        retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        default_caller_delete_ready: physicalDeleteAuthorized,
        physical_delete_authorized: physicalDeleteAuthorized,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
        owner_decision_status: ownerDecisionStatus,
        owner_decision_result_shape: ownerDecisionResultShape,
        owner_decision_closeout_status: ownerDecisionCloseoutStatus,
        no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
        next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
        structural_prerequisites_observed_but_domain_owner_decision_missing_count:
          structuralOwnerDecisionMissingCount,
      },
      migration_gate_policy: {
        opl_generated_default_caller_readiness_is_structural_replacement_evidence: true,
        domain_owner_receipt_or_typed_blocker_still_required: true,
        no_active_caller_proof_still_required: true,
        no_forbidden_write_proof_still_required: true,
        zero_missing_deletion_evidence_is_not_delete_ready: true,
        observed_deletion_evidence_refs_are_refs_only_inputs: !physicalDeleteAuthorized,
        retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorized_by_this_report: physicalDeleteAuthorized,
        physical_delete_blocked_by: physicalDeleteBlockedBy,
        not_authorized_claims: notAuthorizedClaims,
        owner_decision_after_structural_prerequisites_observed_required: true,
        next_required_owner_action_after_structural_prerequisites_observed:
          DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
        accepted_refs_only_result_shapes_after_structural_prerequisites_observed: [
          ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
        ],
      },
      reports,
      authority_boundary: {
        report_can_claim_domain_ready: false,
        report_can_claim_quality_verdict: false,
        report_can_claim_artifact_authority: false,
        report_can_claim_production_ready: false,
        report_can_authorize_domain_repo_physical_delete: false,
      },
    },
  };
}

export function buildAgentPlatformSurfaceOwnershipReport(args: string[]) {
  const repos = parseRepoArgs(args, 'opl agents platform-surfaces');
  const reports = repos.map((repo) => (
    buildAgentPlatformSurfaceOwnershipForRepo(repo.repo_dir, repo.requested_agent_id)
  ));
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  return {
    version: 'g1',
    agent_platform_surface_ownership: {
      surface_kind: 'opl_agent_platform_surface_ownership_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        passed_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        generic_subdomain_count: OPL_OWNED_GENERIC_SUBDOMAINS.length,
        explicit_forbidden_owner_claim_count: reports.reduce(
          (total, report) => total + report.explicit_forbidden_owner_claims.length,
          0,
        ),
        hard_gate_source_policy: 'machine_contracts_receipts_and_proofs_only',
        advisory_diagnostic_source_policy:
          'filename_markdown_prose_and_contract_text_scans_reported_not_blocking',
        advisory_diagnostics_can_block_standard_agent_admission: false,
      },
      reports,
      authority_boundary: {
        report_can_claim_domain_ready: false,
        report_can_claim_quality_verdict: false,
        report_can_claim_artifact_authority: false,
        report_can_claim_production_ready: false,
      },
    },
  };
}
