import fs from 'node:fs';
import path from 'node:path';

import {
  FORBIDDEN_AGENT_PACK_TEXT,
  FOUNDRY_AGENT_SERIES_POLICY_BUNDLE_FINGERPRINT,
  FOUNDRY_AGENT_SERIES_POLICY_RELEASE_REF,
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  REQUIRED_AGENT_PACK_SECTIONS,
  REQUIRED_REPO_SOURCE_DIRS,
  STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT,
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  STANDARD_USER_STAGE_LOG_CONTRACT,
} from './standard-domain-agent-scaffold-constants.ts';
import {
  requiresStagePackV2,
  validateStagePackV2,
} from './standard-domain-agent-stage-pack-v2.ts';

interface ScaffoldValidateInput {
  repoDir: string;
}

function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function refValues(refs: unknown) {
  return readRecordArray(refs).flatMap((ref) => {
    const raw = ref.ref;
    if (Array.isArray(raw)) {
      return readStringArray(raw);
    }
    return readOptionalString(raw) ? [readOptionalString(raw)!] : [];
  });
}

function resolvePackRoot(value: unknown) {
  const rawRoot =
    readOptionalString(value)
    ?? (isPlainRecord(value) ? readOptionalString(value.path) : null)
    ?? 'agent/';
  const withSlash = rawRoot.endsWith('/') ? rawRoot : `${rawRoot}/`;
  return withSlash.replace(/^\.?\//, '');
}

function isInsideRepo(relativePath: string) {
  return relativePath
    && !path.isAbsolute(relativePath)
    && !relativePath.split(/[\\/]+/).includes('..');
}

function readPackFileStatus(repoDir: string, relativePath: string) {
  if (!isInsideRepo(relativePath)) {
    return {
      path: relativePath,
      status: 'blocked_path_outside_repo',
    };
  }
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
    };
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return {
      path: relativePath,
      status: 'not_file',
    };
  }
  const text = fs.readFileSync(absolutePath, 'utf8').trim();
  if (!text) {
    return {
      path: relativePath,
      status: 'empty',
    };
  }
  if (FORBIDDEN_AGENT_PACK_TEXT.test(text)) {
    return {
      path: relativePath,
      status: 'blocked_placeholder_marker',
    };
  }
  return {
    path: relativePath,
    status: 'ok',
  };
}

function readStageAgentRefStatus(repoDir: string, relativePath: string) {
  if (!isInsideRepo(relativePath)) {
    return {
      path: relativePath,
      status: 'blocked_path_outside_repo',
    };
  }
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
    };
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    const normalized = relativePath.endsWith('/') ? relativePath : `${relativePath}/`;
    return normalized === 'agent/'
      ? {
        path: relativePath,
        status: 'ok',
        ref_kind: 'pack_root_directory',
      }
      : {
        path: relativePath,
        status: 'not_file',
      };
  }
  return readPackFileStatus(repoDir, relativePath);
}

function listedPackPaths(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return [];
  }
  const direct = readStringArray(packCompilerInput.required_domain_pack_paths);
  const sourceRefs = isPlainRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return [...new Set([
    ...direct,
    ...readStringArray(sourceRefs.required_domain_pack_paths),
  ])];
}

function readCanonicalPackRoot(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return null;
  }
  return readOptionalString(packCompilerInput.canonical_semantic_pack_root);
}

function legacyPackRootFields(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return [];
  }
  return [
    ['canonical_repo_source_semantic_pack_root', packCompilerInput.canonical_repo_source_semantic_pack_root],
    ['domain_pack_root', packCompilerInput.domain_pack_root],
    ['canonical_repo_source_semantic_pack', packCompilerInput.canonical_repo_source_semantic_pack],
  ]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([field]) => field);
}

function discoverPackFiles(repoDir: string, packRoot: string) {
  const rootPath = path.join(repoDir, packRoot);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [];
  }
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(path.relative(repoDir, absolutePath).split(path.sep).join('/'));
      }
    }
  };
  visit(rootPath);
  return files.sort();
}

function validateAgentPackFiles(repoDir: string, packCompilerInput: unknown, enforceToolAffordanceBoundary: boolean) {
  const canonicalPackRoot = readCanonicalPackRoot(packCompilerInput);
  const packRoot = resolvePackRoot(canonicalPackRoot);
  const listedPaths = listedPackPaths(packCompilerInput);
  const discoveredPaths = discoverPackFiles(repoDir, packRoot);
  const semanticListedPaths = listedPaths.filter((item) => item.startsWith(packRoot) && !item.endsWith('/README.md'));
  const readmeListedPaths = listedPaths.filter((item) => item.endsWith('/README.md') || item === 'README.md');
  const packFileStatus = listedPaths.map((item) => readPackFileStatus(repoDir, item));
  const sectionStatus = REQUIRED_AGENT_PACK_SECTIONS.map(({ section, prefix }) => {
    const semanticFiles = discoveredPaths.filter((file) => file.startsWith(prefix) && !file.endsWith('/README.md'));
    return {
      section,
      prefix,
      semantic_file_count: semanticFiles.length,
      status: semanticFiles.length > 0 ? 'ok' : 'missing_semantic_file',
    };
  });
  const sectionFindings = sectionStatus
    .filter((item) => item.status !== 'ok')
    .map((item) => `missing_agent_pack_section:${item.section}`);
  const toolSectionFindings = sectionFindings.filter((item) => item === 'missing_agent_pack_section:tools');
  const nonToolSectionFindings = sectionFindings.filter((item) => item !== 'missing_agent_pack_section:tools');
  return {
    pack_root: packRoot,
    listed_paths: listedPaths,
    semantic_listed_path_count: semanticListedPaths.length,
    readme_listed_path_count: readmeListedPaths.length,
    discovered_path_count: discoveredPaths.length,
    pack_file_status: packFileStatus,
    section_status: sectionStatus,
    blockers: [
      canonicalPackRoot === 'agent/' ? null : 'pack_compiler_canonical_semantic_pack_root_must_be_agent_slash',
      ...legacyPackRootFields(packCompilerInput).map((field) => `pack_compiler_legacy_pack_root_field:${field}`),
      ...readmeListedPaths.map((item) => `required_domain_pack_path_must_not_be_readme:${item}`),
      fs.existsSync(path.join(repoDir, packRoot)) ? null : `missing_agent_pack_root:${packRoot}`,
      semanticListedPaths.length > 0 ? null : 'missing_required_domain_pack_paths',
      ...packFileStatus
        .filter((item) => item.status !== 'ok')
        .map((item) => `invalid_domain_pack_path:${item.path}:${item.status}`),
      ...nonToolSectionFindings,
      ...(enforceToolAffordanceBoundary ? toolSectionFindings : []),
    ].filter((entry): entry is string => Boolean(entry)),
    advisory_findings: enforceToolAffordanceBoundary ? [] : toolSectionFindings,
  };
}

function refIncludesRepoPack(refs: unknown, prefix: string) {
  return refValues(refs).some((value) => value.startsWith(prefix));
}

function validateStageRefs(repoDir: string, stageControlPlane: unknown, enforceToolAffordanceBoundary: boolean) {
  const stages = isPlainRecord(stageControlPlane) ? readRecordArray(stageControlPlane.stages) : [];
  const stageStatuses = stages.map((stage) => {
    const stageId = readOptionalString(stage.stage_id) ?? 'unknown_stage';
    const checks = [
      {
        field: 'prompt_refs',
        status: refIncludesRepoPack(stage.prompt_refs, 'agent/prompts/') ? 'ok' : 'missing_agent_prompt_ref',
      },
      {
        field: 'skills',
        status: refValues(stage.skills).length > 0 ? 'ok' : 'missing_skill_ref',
      },
      {
        field: 'tool_refs',
        status: refIncludesRepoPack(stage.tool_refs, 'agent/tools/') ? 'ok' : 'missing_agent_tool_ref',
      },
      {
        field: 'knowledge_refs',
        status: refIncludesRepoPack(stage.knowledge_refs, 'agent/knowledge/') ? 'ok' : 'missing_agent_knowledge_ref',
      },
      {
        field: 'evaluation',
        status: refIncludesRepoPack(stage.evaluation, 'agent/quality_gates/') ? 'ok' : 'missing_agent_quality_gate_ref',
      },
    ];
    const referencedAgentFiles = [
      ...refValues(stage.prompt_refs),
      ...refValues(stage.skills),
      ...refValues(stage.tool_refs),
      ...refValues(stage.knowledge_refs),
      ...refValues(stage.evaluation),
      ...refValues(stage.source_refs),
    ].filter((value) => value.startsWith('agent/'));
    const fileStatuses = [...new Set(referencedAgentFiles)]
      .map((item) => readStageAgentRefStatus(repoDir, item));
    const checkFindings = checks
      .filter((check) => check.status !== 'ok')
      .map((check) => `stage_missing_${check.field}:${stageId}:${check.status}`);
    const toolCheckFindings = checkFindings.filter((item) =>
      item.startsWith(`stage_missing_tool_refs:${stageId}:`)
    );
    const nonToolCheckFindings = checkFindings.filter((item) =>
      !item.startsWith(`stage_missing_tool_refs:${stageId}:`)
    );
    const fileFindings = fileStatuses
      .filter((item) => item.status !== 'ok')
      .map((item) => `stage_invalid_agent_ref:${stageId}:${item.path}:${item.status}`);
    return {
      stage_id: stageId,
      checks,
      referenced_agent_files: referencedAgentFiles,
      file_status: fileStatuses,
      blockers: [
        ...nonToolCheckFindings,
        ...(enforceToolAffordanceBoundary ? toolCheckFindings : []),
        ...fileFindings,
      ],
      advisory_findings: enforceToolAffordanceBoundary ? [] : toolCheckFindings,
    };
  });
  return {
    stage_count: stages.length,
    stage_statuses: stageStatuses,
    blockers: [
      stages.length > 0 ? null : 'missing_stage_control_plane_stages',
      ...stageStatuses.flatMap((stage) => stage.blockers),
    ].filter((entry): entry is string => Boolean(entry)),
    advisory_findings: stageStatuses.flatMap((stage) => stage.advisory_findings),
  };
}

function validateUserStageLogContracts(stageControlPlane: unknown) {
  const stages = isPlainRecord(stageControlPlane) ? readRecordArray(stageControlPlane.stages) : [];
  const stageStatuses = stages.map((stage) => {
    const stageId = readOptionalString(stage.stage_id) ?? 'unknown_stage';
    const stageContract = isPlainRecord(stage.stage_contract) ? stage.stage_contract : null;
    const userStageLogContract = isPlainRecord(stageContract?.user_stage_log_contract)
      ? stageContract.user_stage_log_contract
      : null;
    const progressDeltaPolicy = isPlainRecord(stageContract?.progress_delta_policy)
      ? stageContract.progress_delta_policy
      : null;
    const typedBlockerLineagePolicy = isPlainRecord(stageContract?.typed_blocker_lineage_policy)
      ? stageContract.typed_blocker_lineage_policy
      : null;
    const fields = readStringArray(userStageLogContract?.required_domain_semantic_fields);
    const observabilityFields = readStringArray(userStageLogContract?.required_observability_fields);
    const progressFields = readStringArray(progressDeltaPolicy?.required_fields);
    const blockerFields = readStringArray(typedBlockerLineagePolicy?.required_fields);
    const findings = [
      userStageLogContract ? null : `stage_user_stage_log_contract_missing:${stageId}`,
      readOptionalString(userStageLogContract?.surface_kind) === STANDARD_USER_STAGE_LOG_CONTRACT.surface_kind
        ? null
        : `stage_user_stage_log_contract_surface_kind_invalid:${stageId}`,
      readOptionalString(userStageLogContract?.standard_agent_requirement)
        === STANDARD_USER_STAGE_LOG_CONTRACT.standard_agent_requirement
        ? null
        : `stage_user_stage_log_requirement_invalid:${stageId}`,
      fields.includes('problem_summary') ? null : `stage_user_stage_log_missing_problem_summary:${stageId}`,
      fields.includes('stage_work_done') ? null : `stage_user_stage_log_missing_stage_work_done:${stageId}`,
      fields.includes('changed_stage_surfaces') ? null : `stage_user_stage_log_missing_changed_stage_surfaces:${stageId}`,
      fields.includes('remaining_blockers') ? null : `stage_user_stage_log_missing_remaining_blockers:${stageId}`,
      observabilityFields.includes('duration') ? null : `stage_user_stage_log_missing_duration:${stageId}`,
      observabilityFields.includes('token_usage') ? null : `stage_user_stage_log_missing_token_usage:${stageId}`,
      progressDeltaPolicy ? null : `stage_progress_delta_policy_missing:${stageId}`,
      readOptionalString(progressDeltaPolicy?.surface_kind) === STANDARD_PROGRESS_DELTA_POLICY.surface_kind
        ? null
        : `stage_progress_delta_policy_surface_kind_invalid:${stageId}`,
      progressFields.includes('progress_delta_classification')
        ? null
        : `stage_progress_delta_policy_missing_classification:${stageId}`,
      progressFields.includes('deliverable_progress_delta')
        ? null
        : `stage_progress_delta_policy_missing_deliverable_delta:${stageId}`,
      progressFields.includes('platform_repair_delta')
        ? null
        : `stage_progress_delta_policy_missing_platform_delta:${stageId}`,
      progressFields.includes('next_forced_delta')
        ? null
        : `stage_progress_delta_policy_missing_next_forced_delta:${stageId}`,
      typedBlockerLineagePolicy ? null : `stage_typed_blocker_lineage_policy_missing:${stageId}`,
      readOptionalString(typedBlockerLineagePolicy?.surface_kind) === STANDARD_TYPED_BLOCKER_LINEAGE_POLICY.surface_kind
        ? null
        : `stage_typed_blocker_lineage_policy_surface_kind_invalid:${stageId}`,
      blockerFields.includes('blocker_family')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_blocker_family:${stageId}`,
      blockerFields.includes('repeat_count')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_repeat_count:${stageId}`,
      blockerFields.includes('next_forced_delta')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_next_forced_delta:${stageId}`,
      blockerFields.includes('escalation_owner')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_escalation_owner:${stageId}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      stage_id: stageId,
      status: findings.length === 0 ? 'passed' : 'blocked',
      required_domain_semantic_fields: fields,
      required_observability_fields: observabilityFields,
      progress_delta_policy_fields: progressFields,
      typed_blocker_lineage_policy_fields: blockerFields,
      blockers: findings,
    };
  });
  const blockers = [
    stages.length > 0 ? null : 'missing_stage_control_plane_stages',
    ...stageStatuses.flatMap((stage) => stage.blockers),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_standard_agent_user_stage_log_validation',
    contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/new_agent_scaffold/user_stage_log_contract',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    required_for_standard_agent: true,
    stage_statuses: stageStatuses,
    blockers,
    authority_boundary: STANDARD_USER_STAGE_LOG_CONTRACT.authority_boundary,
  };
}

function validateFoundryAgentSeriesContract(foundryAgentSeries: unknown, enforceToolAffordanceBoundary: boolean) {
  const contract = isPlainRecord(foundryAgentSeries) ? foundryAgentSeries : null;
  const requiredIdentityFields = readStringArray(contract?.required_identity_fields);
  const requiredStagePackets = readStringArray(contract?.required_stage_packets);
  const sharedProgressProjectionFields = readStringArray(contract?.shared_progress_projection_fields);
  const contractVersionPolicy = isPlainRecord(contract?.contract_version_policy)
    ? contract.contract_version_policy
    : null;
  const compatibleVersionRange = readStringArray(contractVersionPolicy?.compatible_version_range);
  const sharedReleasePinStrategy = isPlainRecord(contract?.shared_release_pin_strategy)
    ? contract.shared_release_pin_strategy
    : null;
  const supportedPinSources = readStringArray(sharedReleasePinStrategy?.supported_pin_sources);
  const sharedPolicyRelease = isPlainRecord(contract?.shared_policy_release)
    ? contract.shared_policy_release
    : null;
  const seriesDesignProfile = isPlainRecord(contract?.series_design_profile)
    ? contract.series_design_profile
    : null;
  const workspaceTopologyProfile = isPlainRecord(contract?.workspace_topology_profile)
    ? contract.workspace_topology_profile
    : null;
  const defaultWorkspace = isPlainRecord(workspaceTopologyProfile?.default_workspace)
    ? workspaceTopologyProfile.default_workspace
    : null;
  const domainProfiles = isPlainRecord(workspaceTopologyProfile?.domain_profiles)
    ? workspaceTopologyProfile.domain_profiles
    : null;
  const masWorkspaceProfile = isPlainRecord(domainProfiles?.mas)
    ? domainProfiles.mas
    : null;
  const rcaWorkspaceProfile = isPlainRecord(domainProfiles?.rca)
    ? domainProfiles.rca
    : null;
  const allowedWorkspaceModes = readStringArray(workspaceTopologyProfile?.allowed_workspace_modes);
  const sharedLifecyclePipeline = readStringArray(seriesDesignProfile?.shared_lifecycle_pipeline);
  const stagePackSections = readStringArray(seriesDesignProfile?.stage_pack_sections);
  const domainIoProfile = isPlainRecord(seriesDesignProfile?.domain_io_profile)
    ? seriesDesignProfile.domain_io_profile
    : null;
  const sharedCloseoutContract = isPlainRecord(seriesDesignProfile?.shared_closeout_contract)
    ? seriesDesignProfile.shared_closeout_contract
    : null;
  const profileAuthorityInvariants = isPlainRecord(seriesDesignProfile?.authority_invariants)
    ? seriesDesignProfile.authority_invariants
    : null;
  const domainAdapterPolicy = isPlainRecord(contract?.domain_adapter_policy)
    ? contract.domain_adapter_policy
    : null;
  const appProjectionPolicy = isPlainRecord(contract?.app_projection_policy)
    ? contract.app_projection_policy
    : null;
  const authorityBoundary = isPlainRecord(contract?.authority_boundary)
    ? contract.authority_boundary
    : null;
  const toolSectionFinding = stagePackSections.includes('tools')
    ? null
    : 'foundry_agent_series_design_profile_missing_tools_section';
  const blockers = [
    contract ? null : 'foundry_agent_series_contract_missing_or_invalid',
    readOptionalString(contract?.surface_kind) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.surface_kind
      ? null
      : 'foundry_agent_series_surface_kind_invalid',
    readOptionalString(contract?.version) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version
      ? null
      : 'foundry_agent_series_version_invalid',
    readOptionalString(contractVersionPolicy?.current_version) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version
      ? null
      : 'foundry_agent_series_current_version_pin_invalid',
    contractVersionPolicy?.exact_version_pin_required === true
      ? null
      : 'foundry_agent_series_exact_version_pin_required',
    compatibleVersionRange.includes(STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.version)
      ? null
      : 'foundry_agent_series_compatible_version_range_missing_current',
    readOptionalString(contractVersionPolicy?.domain_contract_ref) === 'contracts/foundry_agent_series.json'
      ? null
      : 'foundry_agent_series_domain_contract_ref_invalid',
    readOptionalString(sharedReleasePinStrategy?.owner_release_contract_ref)
      === 'contracts/family-release/shared-owner-release.json'
      ? null
      : 'foundry_agent_series_owner_release_contract_ref_invalid',
    sharedReleasePinStrategy?.owner_commit_pin_required === true
      ? null
      : 'foundry_agent_series_owner_commit_pin_required',
    sharedReleasePinStrategy?.domain_dependency_pin_required === true
      ? null
      : 'foundry_agent_series_domain_dependency_pin_required',
    readOptionalString(sharedReleasePinStrategy?.consumer_alignment_check) === 'family:shared-release'
      ? null
      : 'foundry_agent_series_consumer_alignment_check_invalid',
    readOptionalString(sharedPolicyRelease?.policy_release_contract_ref) === FOUNDRY_AGENT_SERIES_POLICY_RELEASE_REF
      ? null
      : 'foundry_agent_series_policy_release_contract_ref_invalid',
    readOptionalString(sharedPolicyRelease?.policy_bundle_fingerprint) === FOUNDRY_AGENT_SERIES_POLICY_BUNDLE_FINGERPRINT
      ? null
      : 'foundry_agent_series_policy_bundle_fingerprint_invalid',
    readOptionalString(sharedPolicyRelease?.fingerprint_algorithm) === 'sha256:stable-json'
      ? null
      : 'foundry_agent_series_policy_fingerprint_algorithm_invalid',
    sharedPolicyRelease?.domain_contract_policy_release_pin_required === true
      ? null
      : 'foundry_agent_series_policy_release_pin_required',
    sharedPolicyRelease?.domain_adapter_must_not_copy_policy_body_as_authority === true
      ? null
      : 'foundry_agent_series_policy_body_copy_authority_forbidden',
    readOptionalString(sharedPolicyRelease?.consumer_alignment_check) === 'foundry:policy-release'
      ? null
      : 'foundry_agent_series_policy_consumer_alignment_check_invalid',
    seriesDesignProfile ? null : 'foundry_agent_series_design_profile_missing_or_invalid',
    readOptionalString(seriesDesignProfile?.surface_kind) === 'opl_foundry_agent_series_design_profile'
      ? null
      : 'foundry_agent_series_design_profile_surface_kind_invalid',
    readOptionalString(seriesDesignProfile?.profile_id) === 'opl_foundry_agent_series_design_profile.v1'
      ? null
      : 'foundry_agent_series_design_profile_id_invalid',
    sharedLifecyclePipeline.includes('domain_material_intake')
      ? null
      : 'foundry_agent_series_design_profile_missing_intake_step',
    sharedLifecyclePipeline.includes('stage_led_agent_execution')
      ? null
      : 'foundry_agent_series_design_profile_missing_stage_execution_step',
    sharedLifecyclePipeline.includes('owner_receipt_or_typed_blocker_closeout')
      ? null
      : 'foundry_agent_series_design_profile_missing_closeout_step',
    sharedLifecyclePipeline.includes('opl_refs_only_projection_and_recovery')
      ? null
      : 'foundry_agent_series_design_profile_missing_projection_step',
    readOptionalString(domainIoProfile?.input_slot) === 'domain_materials_or_task_request'
      ? null
      : 'foundry_agent_series_design_profile_input_slot_invalid',
    readOptionalString(domainIoProfile?.output_slot) === 'domain_deliverable_or_owner_handoff'
      ? null
      : 'foundry_agent_series_design_profile_output_slot_invalid',
    stagePackSections.includes('prompts')
      ? null
      : 'foundry_agent_series_design_profile_missing_prompts_section',
    stagePackSections.includes('stages')
      ? null
      : 'foundry_agent_series_design_profile_missing_stages_section',
    stagePackSections.includes('skills')
      ? null
      : 'foundry_agent_series_design_profile_missing_skills_section',
    enforceToolAffordanceBoundary ? toolSectionFinding : null,
    stagePackSections.includes('knowledge')
      ? null
      : 'foundry_agent_series_design_profile_missing_knowledge_section',
    stagePackSections.includes('quality_gates')
      ? null
      : 'foundry_agent_series_design_profile_missing_quality_gates_section',
    readOptionalString(sharedCloseoutContract?.success_shape) === 'domain_owner_receipt_ref'
      ? null
      : 'foundry_agent_series_design_profile_success_shape_invalid',
    readOptionalString(sharedCloseoutContract?.blocked_shape) === 'domain_owned_typed_blocker_ref'
      ? null
      : 'foundry_agent_series_design_profile_blocked_shape_invalid',
    sharedCloseoutContract?.provider_completion_is_closeout === false
      ? null
      : 'foundry_agent_series_design_profile_provider_completion_must_not_closeout',
    profileAuthorityInvariants?.opl_can_infer_domain_output === false
      ? null
      : 'foundry_agent_series_design_profile_opl_output_inference_forbidden',
    profileAuthorityInvariants?.domain_owns_input_truth_and_output_authority === true
      ? null
      : 'foundry_agent_series_design_profile_domain_authority_required',
    workspaceTopologyProfile ? null : 'foundry_agent_series_workspace_topology_profile_missing_or_invalid',
    readOptionalString(workspaceTopologyProfile?.surface_kind) === 'opl_workspace_topology_profile'
      ? null
      : 'foundry_agent_series_workspace_topology_surface_kind_invalid',
    readOptionalString(workspaceTopologyProfile?.profile_id) === 'opl.workspace_topology_profile.v1'
      ? null
      : 'foundry_agent_series_workspace_topology_profile_id_invalid',
    readOptionalString(workspaceTopologyProfile?.stage_outputs_root) === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_stage_outputs_root_invalid',
    readOptionalString(defaultWorkspace?.workspace_mode) === 'one_off'
      ? null
      : 'foundry_agent_series_workspace_topology_default_mode_invalid',
    defaultWorkspace?.series_capable === true
      ? null
      : 'foundry_agent_series_workspace_topology_default_must_be_series_capable',
    readOptionalString(defaultWorkspace?.project_collection_path) === 'deliverables/studies'
      ? null
      : 'foundry_agent_series_workspace_topology_default_collection_path_invalid',
    readOptionalString(masWorkspaceProfile?.workspace_mode) === 'portfolio'
      ? null
      : 'foundry_agent_series_workspace_topology_mas_mode_invalid',
    readOptionalString(masWorkspaceProfile?.project_collection_path) === 'studies'
      ? null
      : 'foundry_agent_series_workspace_topology_mas_collection_path_invalid',
    readOptionalString(masWorkspaceProfile?.stage_outputs_root) === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_mas_stage_outputs_root_invalid',
    readOptionalString(rcaWorkspaceProfile?.workspace_mode) === 'series'
      ? null
      : 'foundry_agent_series_workspace_topology_rca_mode_invalid',
    readOptionalString(rcaWorkspaceProfile?.project_collection_path) === 'deliverables'
      ? null
      : 'foundry_agent_series_workspace_topology_rca_collection_path_invalid',
    readOptionalString(rcaWorkspaceProfile?.stage_outputs_root) === 'artifacts/stage_outputs'
      ? null
      : 'foundry_agent_series_workspace_topology_rca_stage_outputs_root_invalid',
    allowedWorkspaceModes.includes('one_off')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_one_off_mode',
    allowedWorkspaceModes.includes('series')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_series_mode',
    allowedWorkspaceModes.includes('portfolio')
      ? null
      : 'foundry_agent_series_workspace_topology_missing_portfolio_mode',
    supportedPinSources.includes('pyproject.toml')
      ? null
      : 'foundry_agent_series_missing_python_pin_source',
    supportedPinSources.includes('uv.lock')
      ? null
      : 'foundry_agent_series_missing_python_lock_pin_source',
    readOptionalString(contract?.owner) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.owner
      ? null
      : 'foundry_agent_series_owner_must_be_opl',
    readOptionalString(contract?.product_layer) === STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.product_layer
      ? null
      : 'foundry_agent_series_product_layer_invalid',
    readOptionalString(contract?.domain_id) ? null : 'foundry_agent_series_missing_domain_id',
    readOptionalString(contract?.foundry_agent_id) ? null : 'foundry_agent_series_missing_foundry_agent_id',
    readOptionalString(contract?.authority_owner) ? null : 'foundry_agent_series_missing_authority_owner',
    readOptionalString(contract?.stage_control_plane_ref) === 'contracts/stage_control_plane.json'
      ? null
      : 'foundry_agent_series_stage_control_plane_ref_invalid',
    requiredIdentityFields.includes('domain_id')
      ? null
      : 'foundry_agent_series_missing_identity_domain_id',
    requiredIdentityFields.includes('foundry_agent_id')
      ? null
      : 'foundry_agent_series_missing_identity_foundry_agent_id',
    requiredIdentityFields.includes('authority_owner')
      ? null
      : 'foundry_agent_series_missing_identity_authority_owner',
    requiredStagePackets.includes('progress_delta_policy')
      ? null
      : 'foundry_agent_series_missing_stage_packet_progress_delta_policy',
    requiredStagePackets.includes('typed_blocker_lineage_policy')
      ? null
      : 'foundry_agent_series_missing_stage_packet_typed_blocker_lineage_policy',
    requiredStagePackets.includes('effective_current_context')
      ? null
      : 'foundry_agent_series_missing_stage_packet_effective_current_context',
    requiredStagePackets.includes('owner_receipt_or_typed_blocker_closeout')
      ? null
      : 'foundry_agent_series_missing_stage_packet_closeout',
    sharedProgressProjectionFields.includes('progress_delta_classification')
      ? null
      : 'foundry_agent_series_missing_projection_classification',
    sharedProgressProjectionFields.includes('deliverable_progress_delta')
      ? null
      : 'foundry_agent_series_missing_projection_deliverable_delta',
    sharedProgressProjectionFields.includes('platform_repair_delta')
      ? null
      : 'foundry_agent_series_missing_projection_platform_delta',
    sharedProgressProjectionFields.includes('next_forced_delta')
      ? null
      : 'foundry_agent_series_missing_projection_next_forced_delta',
    domainAdapterPolicy?.no_parallel_progress_schema === true
      ? null
      : 'foundry_agent_series_parallel_progress_schema_must_be_forbidden',
    domainAdapterPolicy?.no_parallel_blocker_lineage_schema === true
      ? null
      : 'foundry_agent_series_parallel_blocker_schema_must_be_forbidden',
    appProjectionPolicy?.app_consumes_shared_progress_projection_only === true
      ? null
      : 'foundry_agent_series_app_shared_projection_required',
    appProjectionPolicy?.app_can_read_domain_body === false
      ? null
      : 'foundry_agent_series_app_domain_body_read_must_be_false',
    authorityBoundary?.opl_owns_series_contract === true
      ? null
      : 'foundry_agent_series_opl_owner_boundary_missing',
    authorityBoundary?.domain_owns_truth_quality_artifact_memory_and_receipts === true
      ? null
      : 'foundry_agent_series_domain_authority_boundary_missing',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_foundry_agent_series_contract_validation',
    contract_ref: 'contracts/opl-framework/foundry-agent-series-contract.json',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    required_for_standard_agent: true,
    required_identity_fields: requiredIdentityFields,
    required_stage_packets: requiredStagePackets,
    shared_progress_projection_fields: sharedProgressProjectionFields,
    series_design_profile: seriesDesignProfile,
    workspace_topology_profile: workspaceTopologyProfile,
    contract_version_policy: contractVersionPolicy,
    shared_release_pin_strategy: sharedReleasePinStrategy,
    shared_policy_release: sharedPolicyRelease,
    blockers,
    advisory_findings: enforceToolAffordanceBoundary || !toolSectionFinding ? [] : [toolSectionFinding],
  };
}

export function validateStandardDomainAgentScaffold(input: ScaffoldValidateInput) {
  const repoDir = path.resolve(input.repoDir);
  const missingRequiredDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !fs.existsSync(path.join(repoDir, dir)));
  const forbiddenPresentDirs = ['artifacts'].filter((dir) => fs.existsSync(path.join(repoDir, dir)));
  const requiredContractFiles = [
    'contracts/domain_descriptor.json',
    'contracts/pack_compiler_input.json',
    'contracts/generated_surface_handoff.json',
    'contracts/stage_control_plane.json',
    'contracts/action_catalog.json',
    'contracts/memory_descriptor.json',
    'contracts/artifact_locator_contract.json',
    'contracts/owner_receipt_contract.json',
    'contracts/foundry_agent_series.json',
    'contracts/functional_privatization_audit.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  const missingContractFiles = requiredContractFiles.filter((file) => !fs.existsSync(path.join(repoDir, file)));
  const actionCatalog = readJsonFile(path.join(repoDir, 'contracts/action_catalog.json'));
  const forbiddenRoles = Array.isArray(actionCatalog?.forbidden_generic_owner_roles)
    ? actionCatalog.forbidden_generic_owner_roles
    : [];
  const missingForbiddenRoleGuards = FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES.filter((role) => !forbiddenRoles.includes(role));
  const descriptor = readJsonFile(path.join(repoDir, 'contracts/domain_descriptor.json'));
  const authority = descriptor?.authority_boundary || {};
  const packCompilerInput = readJsonFile(path.join(repoDir, 'contracts/pack_compiler_input.json'));
  const generatedSurfaceHandoff = readJsonFile(path.join(repoDir, 'contracts/generated_surface_handoff.json'));
  const foundryAgentSeries = readJsonFile(path.join(repoDir, 'contracts/foundry_agent_series.json'));
  const stageControlPlane = readJsonFile(path.join(repoDir, 'contracts/stage_control_plane.json'));
  const stagePackV2Required = requiresStagePackV2(packCompilerInput, stageControlPlane);
  const agentPackValidation = validateAgentPackFiles(repoDir, packCompilerInput, stagePackV2Required);
  const stageRefValidation = validateStageRefs(repoDir, stageControlPlane, stagePackV2Required);
  const userStageLogValidation = validateUserStageLogContracts(stageControlPlane);
  const foundryAgentSeriesValidation = validateFoundryAgentSeriesContract(foundryAgentSeries, stagePackV2Required);
  const stagePackV2Validation = validateStagePackV2(stageControlPlane, packCompilerInput, stagePackV2Required);
  const authorityViolations = [
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false ? null : 'opl_can_authorize_quality_or_export_must_be_false',
    packCompilerInput?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    packCompilerInput?.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
    generatedSurfaceHandoff?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    generatedSurfaceHandoff?.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter(Boolean);
  const blockers = [
    ...missingRequiredDirs.map((item) => `missing_required_dir:${item}`),
    ...forbiddenPresentDirs.map((item) => `forbidden_source_dir_present:${item}`),
    ...missingContractFiles.map((item) => `missing_contract:${item}`),
    ...missingForbiddenRoleGuards.map((item) => `missing_forbidden_role_guard:${item}`),
    ...authorityViolations,
    ...agentPackValidation.blockers,
    ...stageRefValidation.blockers,
    ...userStageLogValidation.blockers,
    ...foundryAgentSeriesValidation.blockers,
    ...stagePackV2Validation.blockers,
  ];
  const advisoryFindings = [
    ...agentPackValidation.advisory_findings,
    ...stageRefValidation.advisory_findings,
    ...foundryAgentSeriesValidation.advisory_findings,
    ...stagePackV2Validation.advisory_findings,
  ];
  return {
    version: 'g2',
    standard_domain_agent_scaffold_validation: {
      surface_kind: 'opl_standard_domain_agent_scaffold_validation',
      repo_dir: repoDir,
      status: blockers.length === 0 ? 'passed' : 'blocked',
      scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      required_dirs: REQUIRED_REPO_SOURCE_DIRS,
      missing_required_dirs: missingRequiredDirs,
      forbidden_dirs_present: forbiddenPresentDirs,
      required_contract_files: requiredContractFiles,
      missing_contract_files: missingContractFiles,
      missing_forbidden_role_guards: missingForbiddenRoleGuards,
      authority_violations: authorityViolations,
      agent_pack_validation: agentPackValidation,
      stage_ref_validation: stageRefValidation,
      user_stage_log_validation: userStageLogValidation,
      foundry_agent_series_validation: foundryAgentSeriesValidation,
      stage_pack_v2_validation: stagePackV2Validation,
      functional_privatization_audit_required: true,
      blockers,
      advisory_findings: advisoryFindings,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        opl_can_execute_domain_repo_delete: false,
      },
    },
  };
}

export function buildStandardDomainAgentScaffoldValidation(input: ScaffoldValidateInput) {
  const validation = validateStandardDomainAgentScaffold(input).standard_domain_agent_scaffold_validation;
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      command: 'opl agents scaffold',
      state: validation.status === 'passed' ? 'validated' : 'validation_blocked',
      mode: 'validate',
      validation,
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}
