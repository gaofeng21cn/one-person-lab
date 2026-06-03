import fs from 'node:fs';
import path from 'node:path';

import {
  countBy,
  escapeRegex,
  gitTrackedOrWalkedFiles,
  isRecord,
  optionalString,
  readJsonFile,
  recordList,
  stringList,
  unique,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

const ACTIVE_MORPHOLOGY_SCAN_ROOTS = [
  'agent/',
  'src/',
  'packages/',
  'apps/',
  'scripts/',
  'runtime/',
  'contracts/',
  'tests/',
  'Makefile',
  'package.json',
  'pyproject.toml',
  'docs/active/',
  'docs/status.md',
];

const DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES = [
  'docs/history/',
  'docs/references/',
  'docs/specs/',
  'tests/legacy',
  'tests/fixtures/legacy',
];

const REQUIRED_MAG_PHYSICAL_SURFACES = [
  'domain_runtime',
  'product_entry',
  'status',
  'user_loop',
  'domain_handler',
  'runtime_registration',
  'control_plane',
  'lifecycle',
  'memory',
  'package',
  'autonomy_controller',
  'legacy_runtime_residue',
];

const NO_PHYSICAL_SURFACE_ALIASES: Record<string, readonly string[]> = {};

const REQUIRED_RCA_PHYSICAL_SURFACES = [
  'mcp_product_entry_domain_entry',
  'product_entry_continuity_refs_adapter',
  'runtime_watch_projection',
  'domain_action_adapter_guarded_actions',
  'operator_evidence_stability_projection',
  'visual_authority_functions',
];

const RCA_PHYSICAL_SURFACE_ALIASES: Record<string, readonly string[]> = {
  product_entry_continuity_refs_adapter: ['product_entry_session_snapshot_refs_adapter'],
};

const REQUIRED_RCA_FORBIDDEN_LEGACY_SURFACE_IDS = [
  'legacy_managed_runtime_gateway_names',
];

const REQUIRED_META_SCRIPT_CLASSES = [
  'authority_function_implementation_ref',
  'smoke_helper',
  'fixture_or_proof_helper',
  'developer_work_order_materializer',
];

const REQUIRED_META_FORBIDDEN_SCRIPT_ROLES = [
  'generic_runtime_owner',
  'generic_registry_owner',
  'app_shell_owner',
  'agent_lab_execution_owner',
  'promotion_gate_owner',
  'target_domain_truth_writer',
];

const MAS_FORBIDDEN_ACTIVE_RESIDUE = [
  'runtime_supervisor',
  'supervision_scheduler',
  'mas_supervision_scheduler',
  'BRANCH_NAME',
  'OWNED_FILES',
  'VERIFICATION_COMMANDS',
];

const MAG_FORBIDDEN_ACTIVE_RESIDUE = [
  'local_journal',
  'attempt_ledger',
  'repo_owned_scheduler',
  ['hermes', 'gateway', 'local', 'manager', 'probe'].join('_'),
  'compat_facade_active_alias',
];

const MAG_REQUIRED_FORBIDDEN_RESIDUE_CLASSES = [
  'legacy_local_persistence_surface',
  'legacy_attempt_record_surface',
  'legacy_repo_cadence_owner',
  'legacy_executor_runtime_probe',
  'legacy_compat_alias_surface',
];

const RCA_FORBIDDEN_ACTIVE_RESIDUE = [
  'GatewayActionMap',
  'getCliGatewayActions',
  'callGatewayTool',
  'listGatewayTools',
  'run_managed_deliverable',
  'supervise_managed_run',
  'compatibility_script',
  'compatibilityScript',
];

const META_FORBIDDEN_ACTIVE_RESIDUE = [
  'generic_runtime_owner',
  'generic_registry_owner',
  'app_shell_owner',
  'agent_lab_execution_owner',
  'promotion_gate_owner',
  'target_domain_truth_writer',
];

export function buildPhysicalMorphologyChecks(repoDir: string, domainId: string) {
  const policyChecks = physicalMorphologyPolicyChecks(repoDir, domainId);
  const forbiddenTokens = forbiddenPhysicalMorphologyTokens(domainId);
  const forbiddenNameResidue = scanForbiddenNameResidue(repoDir, forbiddenTokens, policyChecks.allowed_residue_prefixes);
  const residueClassification = classifyForbiddenNameResidue(forbiddenNameResidue);
  const blockers = unique([
    ...policyChecks.blockers,
    ...residueClassification.active_forbidden_name_residue
      .map((entry) => `active_forbidden_name_residue:${entry.token}:${entry.path}`),
  ]);
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: policyChecks.status,
    policy_sources: policyChecks.policy_sources,
    required_parity_gates: policyChecks.required_parity_gates,
    allowed_tombstone_provenance_locations: policyChecks.allowed_residue_prefixes,
    residue_classification_summary: residueClassification.summary,
    active_forbidden_name_residue: residueClassification.active_forbidden_name_residue,
    allowed_name_residue: residueClassification.allowed_name_residue,
    forbidden_name_residue: forbiddenNameResidue,
    blockers,
  };
}

function physicalMorphologyPolicyChecks(repoDir: string, domainId: string) {
  if (domainId.includes('med-autogrant') || domainId === 'mag') {
    return magPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('redcube') || domainId === 'rca' || domainId === 'redcube_ai') {
    return rcaPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('opl-meta-agent')) {
    return metaAgentPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('med-autoscience') || domainId === 'mas') {
    return masPhysicalMorphologyPolicyChecks(repoDir);
  }
  return genericPhysicalMorphologyPolicyChecks(repoDir);
}

function genericPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const privatePolicy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const policy = isRecord(privatePolicy?.physical_source_morphology_policy)
    ? privatePolicy.physical_source_morphology_policy
    : null;
  const requiredSurfaceIds = stringList(policy?.required_surface_ids);
  const classifications = recordList(policy?.surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const blockers = [
    policyFile.status === 'resolved' ? null : `generic_private_surface_policy_${policyFile.status}`,
    policy ? null : 'physical_morphology_policy_not_declared',
    requiredSurfaceIds.length > 0 ? null : 'physical_morphology_required_surface_ids_missing',
    classifications.length > 0 ? null : 'physical_morphology_surface_classifications_missing',
    ...requiredSurfaceIds
      .filter((surfaceId) => !classifiedSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `physical_morphology_surface_unclassified:${surfaceId}`),
    authority.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'physical_morphology_domain_can_claim_generic_runtime_owner_must_be_false',
    authority.domain_repo_can_own_generated_surface === false
      ? null
      : 'physical_morphology_domain_repo_can_own_generated_surface_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/private_functional_surface_policy.json#physical_source_morphology_policy'],
    required_parity_gates: [
      'agent_semantic_pack_declared',
      'generated_surfaces_owned_by_opl',
      'minimal_authority_functions_or_refs_only_adapters_only',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'contracts/private_functional_surface_policy.json',
    ],
    blockers,
  };
}

function magPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const policy = isRecord(policyFile.payload) && isRecord(policyFile.payload.physical_source_morphology_policy)
    ? policyFile.payload.physical_source_morphology_policy
    : null;
  const requiredSurfaceIds = stringList(policy?.required_surface_ids);
  const classifications = recordList(policy?.surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const forbiddenClasses = stringList(policy?.forbidden_residue_classes);
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const blockers = [
    policyFile.status === 'resolved' ? null : `mag_private_surface_policy_${policyFile.status}`,
    policy ? null : 'mag_physical_source_morphology_policy_missing',
    ...REQUIRED_MAG_PHYSICAL_SURFACES
      .filter((surfaceId) => !hasPhysicalSurface(requiredSurfaceIds, surfaceId, NO_PHYSICAL_SURFACE_ALIASES))
      .map((surfaceId) => `mag_physical_surface_missing:${surfaceId}`),
    ...REQUIRED_MAG_PHYSICAL_SURFACES
      .filter((surfaceId) => !hasPhysicalSurface(classifiedSurfaceIds, surfaceId, NO_PHYSICAL_SURFACE_ALIASES))
      .map((surfaceId) => `mag_physical_surface_unclassified:${surfaceId}`),
    ...MAG_REQUIRED_FORBIDDEN_RESIDUE_CLASSES
      .filter((token) => !forbiddenClasses.includes(token))
      .map((token) => `mag_forbidden_residue_class_missing:${token}`),
    authority.mag_can_own_generic_runtime === false ? null : 'mag_can_own_generic_runtime_must_be_false',
    authority.mag_can_own_generated_wrapper === false ? null : 'mag_can_own_generated_wrapper_must_be_false',
    authority.mag_can_restore_legacy_compat_alias === false
      ? null
      : 'mag_can_restore_legacy_compat_alias_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/private_functional_surface_policy.json#physical_source_morphology_policy'],
    required_parity_gates: [
      'all_required_mag_surfaces_classified',
      'forbidden_generic_runtime_reflow_false',
      'grant_truth_and_export_verdict_remain_mag_owned',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/private_functional_surface_policy.json',
      'src/med_autogrant/opl_standard_pack.py',
      'tests/test_opl_standard_pack.py',
    ],
    blockers,
  };
}

function rcaPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/physical_source_morphology_policy.json');
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const classifications = recordList(policy?.active_surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const legacyNamePolicy = isRecord(policy?.legacy_name_policy) ? policy.legacy_name_policy : null;
  const forbiddenActiveSurfaceIds = stringList(legacyNamePolicy?.forbidden_active_surface_ids);
  const ownerFlagViolations = classifications.flatMap((entry) => {
    const flags = isRecord(entry.forbidden_generic_owner_flags) ? entry.forbidden_generic_owner_flags : {};
    return Object.entries(flags)
      .filter(([, value]) => value !== false)
      .map(([flag]) => `rca_forbidden_owner_flag_true:${optionalString(entry.surface_id) ?? 'unknown'}:${flag}`);
  });
  const legacyFlagViolations = [
    legacyNamePolicy?.compatibility_alias_allowed === false
      ? null
      : 'rca_legacy_callable_old_name_must_be_false',
    legacyNamePolicy?.active_generic_runtime_owner_allowed === false
      ? null
      : 'rca_legacy_active_generic_runtime_owner_must_be_false',
    legacyNamePolicy?.active_generic_gateway_owner_allowed === false
      ? null
      : 'rca_legacy_active_generic_gateway_owner_must_be_false',
    legacyNamePolicy?.active_generic_session_runtime_owner_allowed === false
      ? null
      : 'rca_legacy_active_generic_session_runtime_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  const blockers = [
    policyFile.status === 'resolved' ? null : `rca_physical_source_morphology_policy_${policyFile.status}`,
    optionalString(policy?.canonical_pack_root) === 'agent/' ? null : 'rca_canonical_pack_root_must_be_agent_slash',
    optionalString(policy?.status) === 'active_source_classification_policy_landed'
      ? null
      : 'rca_physical_source_morphology_policy_status_not_landed',
    ...REQUIRED_RCA_PHYSICAL_SURFACES
      .filter((surfaceId) => !hasPhysicalSurface(classifiedSurfaceIds, surfaceId, RCA_PHYSICAL_SURFACE_ALIASES))
      .map((surfaceId) => `rca_physical_surface_unclassified:${surfaceId}`),
    ...REQUIRED_RCA_FORBIDDEN_LEGACY_SURFACE_IDS
      .filter((surfaceId) => !forbiddenActiveSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `rca_forbidden_legacy_surface_id_missing:${surfaceId}`),
    ...ownerFlagViolations,
    ...legacyFlagViolations,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/physical_source_morphology_policy.json'],
    required_parity_gates: [
      'mcp_product_entry_continuity_refs_adapter_runtime_watch_domain_action_operator_evidence_classified',
      'visual_authority_functions_not_generic_runtime',
      'legacy_managed_runtime_gateway_names_tombstoned',
    ],
    forbidden_legacy_surface_ids: forbiddenActiveSurfaceIds,
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/functional_privatization_audit.json',
      'contracts/runtime-program/',
      'packages/redcube-domain-entry/src/actions/guarded-domain-actions.ts',
      'tests/',
      'contracts/physical_source_morphology_policy.json',
    ],
    blockers,
  };
}

function hasPhysicalSurface(
  surfaceIds: readonly string[],
  canonicalSurfaceId: string,
  aliasesByCanonicalSurfaceId: Record<string, readonly string[]>,
) {
  return [canonicalSurfaceId, ...(aliasesByCanonicalSurfaceId[canonicalSurfaceId] ?? [])]
    .some((surfaceId) => surfaceIds.includes(surfaceId));
}

function metaAgentPhysicalMorphologyPolicyChecks(repoDir: string) {
  const privatePolicyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const authorityFile = readJsonFile(repoDir, 'runtime/authority_functions/meta-agent-authority-functions.json');
  const privatePolicy = isRecord(privatePolicyFile.payload) ? privatePolicyFile.payload : null;
  const authority = isRecord(authorityFile.payload) ? authorityFile.payload : null;
  const scriptPolicy = isRecord(authority?.script_morphology_policy)
    ? authority.script_morphology_policy
    : null;
  const allowedClasses = stringList(scriptPolicy?.allowed_classes);
  const forbiddenRoles = stringList(scriptPolicy?.forbidden_roles);
  const classifications = recordList(scriptPolicy?.script_classifications);
  const scripts = gitTrackedOrWalkedFiles(repoDir).filter((file) => (
    file.startsWith('scripts/') && file.endsWith('.mjs')
  ));
  const classifiedScripts = stringList(classifications.map((entry) => entry.script_ref));
  const privateForbiddenRoles = stringList(privatePolicy?.forbidden_script_roles);
  const blockers = [
    privatePolicyFile.status === 'resolved' ? null : `meta_private_surface_policy_${privatePolicyFile.status}`,
    authorityFile.status === 'resolved' ? null : `meta_authority_functions_${authorityFile.status}`,
    scriptPolicy ? null : 'meta_script_morphology_policy_missing',
    ...REQUIRED_META_SCRIPT_CLASSES
      .filter((classId) => !allowedClasses.includes(classId))
      .map((classId) => `meta_allowed_script_class_missing:${classId}`),
    ...REQUIRED_META_FORBIDDEN_SCRIPT_ROLES
      .filter((role) => !forbiddenRoles.includes(role) || !privateForbiddenRoles.includes(role))
      .map((role) => `meta_forbidden_script_role_missing:${role}`),
    ...scripts
      .filter((script) => !classifiedScripts.includes(script))
      .map((script) => `meta_script_unclassified:${script}`),
    ...classifications.flatMap((entry) => (
      stringList(entry.forbidden_roles).map((role) => (
        `meta_script_declares_forbidden_role:${optionalString(entry.script_ref) ?? 'unknown'}:${role}`
      ))
    )),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: [
      'contracts/private_functional_surface_policy.json#allowed_script_morphology_classes',
      'runtime/authority_functions/meta-agent-authority-functions.json#script_morphology_policy',
    ],
    required_parity_gates: [
      'all_scripts_classified_by_authority_manifest',
      'scripts_only_emit_refs_or_work_orders',
      'target_domain_truth_writer_forbidden',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/app_workbench_projection.json',
      'contracts/functional_privatization_audit.json',
      'contracts/opl_domain_manifest_registration.json',
      'contracts/private_functional_surface_policy.json',
      'contracts/real_target_agent_scaleout_evidence.json',
      'runtime/authority_functions/meta-agent-authority-functions.json',
      'tests/contracts.test.ts',
      'tests/contracts.test.mjs',
      'tests/source-purity.test.ts',
    ],
    blockers,
  };
}

function masPhysicalMorphologyPolicyChecks(repoDir: string) {
  const auditFile = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const audit = isRecord(auditFile.payload) ? auditFile.payload : null;
  const authority = isRecord(audit?.authority_boundary) ? audit.authority_boundary : {};
  const blockers = [
    auditFile.status === 'resolved' ? null : `mas_functional_privatization_audit_${auditFile.status}`,
    authority.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'mas_domain_can_claim_generic_runtime_owner_must_be_false',
    authority.domain_repo_can_own_generated_surface === false
      ? null
      : 'mas_domain_repo_can_own_generated_surface_must_be_false',
    authority.opl_can_write_domain_truth === false ? null : 'mas_opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'mas_opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false
      ? null
      : 'mas_opl_can_authorize_quality_or_export_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/functional_privatization_audit.json#authority_boundary'],
    required_parity_gates: [
      'domain_route_active_api_cutover',
      'old_supervisor_scheduler_names_absent_from_active_source',
      'mas_truth_quality_artifact_authority_remains_domain_owned',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/runtime/legacy-active-path-tombstones.json',
      'tests/legacy_negative',
    ],
    blockers,
  };
}

function forbiddenPhysicalMorphologyTokens(domainId: string) {
  if (domainId.includes('med-autogrant') || domainId === 'mag') {
    return MAG_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('redcube') || domainId === 'rca' || domainId === 'redcube_ai') {
    return RCA_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('opl-meta-agent')) {
    return META_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('med-autoscience') || domainId === 'mas') {
    return MAS_FORBIDDEN_ACTIVE_RESIDUE;
  }
  return [];
}

function scanForbiddenNameResidue(
  repoDir: string,
  tokens: string[],
  allowedPrefixes: string[],
) {
  if (tokens.length === 0) {
    return [];
  }
  const activeFiles = gitTrackedOrWalkedFiles(repoDir).filter((relativePath) => (
    ACTIVE_MORPHOLOGY_SCAN_ROOTS.some((root) => (
      root.endsWith('/') ? relativePath.startsWith(root) : relativePath === root
    ))
  ));
  return activeFiles.flatMap((relativePath) => {
    const absolutePath = path.join(repoDir, relativePath);
    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      return [];
    }
    return tokens.flatMap((token) => {
      const tokenPattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(token)}(?![A-Za-z0-9_])`);
      if (!tokenPattern.test(content)) {
        return [];
      }
      return [{
        token,
        path: relativePath,
        allowed: allowedPrefixes.some((prefix) => (
          prefix.endsWith('/') ? relativePath.startsWith(prefix) : relativePath === prefix
        )),
      }];
    });
  });
}

function classifyForbiddenNameResidue(entries: JsonRecord[]) {
  const activeForbiddenNameResidue = entries.filter((entry) => entry.allowed !== true);
  const allowedNameResidue = entries.filter((entry) => entry.allowed === true).map((entry) => ({
    ...entry,
    allowance_classification: allowedResidueClassification(optionalString(entry.path)),
  }));
  const allowedByClassification = countBy(allowedNameResidue.map((entry) => (
    optionalString(entry.allowance_classification) ?? 'allowed_other'
  )));
  return {
    summary: {
      status: activeForbiddenNameResidue.length === 0
        ? 'no_active_forbidden_name_residue'
        : 'active_forbidden_name_residue_present',
      total_match_count: entries.length,
      active_forbidden_name_residue_count: activeForbiddenNameResidue.length,
      allowed_name_residue_count: allowedNameResidue.length,
      allowed_name_residue_by_classification: allowedByClassification,
      allowed_name_residue_note: 'Allowed entries are policy, contract, test, history, tombstone, or provenance guard references and do not make the physical morphology gate fail.',
      legacy_field_note: 'forbidden_name_residue keeps the raw compatible scan; use active_forbidden_name_residue_count for blocker count.',
    },
    active_forbidden_name_residue: activeForbiddenNameResidue,
    allowed_name_residue: allowedNameResidue,
  };
}

function allowedResidueClassification(relativePath: string | null) {
  if (!relativePath) {
    return 'allowed_other';
  }
  if (
    relativePath.startsWith('docs/history/')
    || relativePath.startsWith('docs/references/')
    || relativePath.startsWith('docs/specs/')
  ) {
    return 'history_tombstone_or_provenance';
  }
  if (relativePath.startsWith('tests/')) {
    return 'contract_or_legacy_guard_test';
  }
  if (relativePath.startsWith('contracts/')) {
    return 'machine_contract_policy_or_projection';
  }
  if (relativePath.startsWith('runtime/authority_functions/')) {
    return 'authority_function_policy_manifest';
  }
  return 'allowed_other';
}
