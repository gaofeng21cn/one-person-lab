import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';
import {
  optionalString,
  parseJsonText,
} from './json-file.ts';
import {
  discoverFamilyRepoInputs,
  hasStandardDomainAgentSurface,
  type StandardDomainAgentRepoInput,
} from './standard-domain-agent-family-repos.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from './standard-agent-registry.ts';
import { resolveContainedRepoJsonFile } from './repo-contained-json-file.ts';

type JsonRecord = Record<string, unknown>;

export type DomainOwnerAnswerProjectionProfile = {
  profileId: string;
  profileRole: 'registry' | 'compatibility';
  domainId: string;
  bindingProjectId: string;
  sourceOwner: string;
  workspaceRootProfileRef?: {
    profileDirName: string;
    domainDirName: string;
    opsDirName: string;
  };
  studiesDirName: string;
  projectionRelativePath: string[];
  stageNativeOwnerAnswer?: {
    canonicalProjection: 'domain_stage_native_owner_answer';
    dispatchTaskKind: string;
    actionType: string;
    workUnitId: string;
    nextExecutableOwner: string;
    closeoutSurfaceKind: string;
    stageId: string;
    stageOutputsFragment: string;
    ownerReceiptRef: string;
    typedBlockerRef: string;
    relativeOwnerReceiptRef: string;
    relativeTypedBlockerRef: string;
  };
  sourceRef?: string;
};

const PROFILE_REF = 'domain_owner_answer_projection_profile';
const PROFILE_SURFACE_KIND = 'opl_domain_owner_answer_projection_profile';
const PROFILE_VERSION = 'domain-owner-answer-projection-profile.v1';
const REQUIRED_FALSE_AUTHORITY_FIELDS = [
  'can_write_domain_truth',
  'can_create_owner_receipt',
  'can_create_typed_blocker',
  'can_claim_domain_ready',
  'can_claim_production_ready',
] as const;

function contractError(message: string, details: JsonRecord) {
  return new FrameworkContractError('contract_shape_invalid', message, details);
}

function requireString(value: unknown, field: string, sourceRef: string) {
  const text = optionalString(value);
  if (!text) {
    throw contractError(`Domain owner-answer projection profile requires ${field}.`, {
      source_ref: sourceRef,
      field,
    });
  }
  return text;
}

function requireStringList(value: unknown, field: string, sourceRef: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw contractError(`Domain owner-answer projection profile requires a non-empty ${field}.`, {
      source_ref: sourceRef,
      field,
    });
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`, sourceRef));
}

function normalizeWorkspaceRootProfileRef(value: unknown, sourceRef: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw contractError('Domain owner-answer projection profile workspace_root_profile_ref must be an object.', {
      source_ref: sourceRef,
      field: 'workspace_root_profile_ref',
    });
  }
  return {
    profileDirName: requireString(value.profile_dir_name, 'workspace_root_profile_ref.profile_dir_name', sourceRef),
    domainDirName: requireString(value.domain_dir_name, 'workspace_root_profile_ref.domain_dir_name', sourceRef),
    opsDirName: requireString(value.ops_dir_name, 'workspace_root_profile_ref.ops_dir_name', sourceRef),
  };
}

function normalizeStageNativeOwnerAnswer(value: unknown, sourceRef: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw contractError('Domain owner-answer projection profile stage_native_owner_answer must be an object.', {
      source_ref: sourceRef,
      field: 'stage_native_owner_answer',
    });
  }
  if (value.canonical_projection !== 'domain_stage_native_owner_answer') {
    throw contractError('Domain owner-answer projection profile stage_native_owner_answer has an invalid canonical_projection.', {
      source_ref: sourceRef,
      field: 'stage_native_owner_answer.canonical_projection',
    });
  }
  return {
    canonicalProjection: 'domain_stage_native_owner_answer' as const,
    dispatchTaskKind: requireString(value.dispatch_task_kind, 'stage_native_owner_answer.dispatch_task_kind', sourceRef),
    actionType: requireString(value.action_type, 'stage_native_owner_answer.action_type', sourceRef),
    workUnitId: requireString(value.work_unit_id, 'stage_native_owner_answer.work_unit_id', sourceRef),
    nextExecutableOwner: requireString(value.next_executable_owner, 'stage_native_owner_answer.next_executable_owner', sourceRef),
    closeoutSurfaceKind: requireString(value.closeout_surface_kind, 'stage_native_owner_answer.closeout_surface_kind', sourceRef),
    stageId: requireString(value.stage_id, 'stage_native_owner_answer.stage_id', sourceRef),
    stageOutputsFragment: requireString(value.stage_outputs_fragment, 'stage_native_owner_answer.stage_outputs_fragment', sourceRef),
    ownerReceiptRef: requireString(value.owner_receipt_ref, 'stage_native_owner_answer.owner_receipt_ref', sourceRef),
    typedBlockerRef: requireString(value.typed_blocker_ref, 'stage_native_owner_answer.typed_blocker_ref', sourceRef),
    relativeOwnerReceiptRef: requireString(value.relative_owner_receipt_ref, 'stage_native_owner_answer.relative_owner_receipt_ref', sourceRef),
    relativeTypedBlockerRef: requireString(value.relative_typed_blocker_ref, 'stage_native_owner_answer.relative_typed_blocker_ref', sourceRef),
  };
}

export function normalizeDomainOwnerAnswerProjectionProfile(
  value: unknown,
  sourceRef: string,
): DomainOwnerAnswerProjectionProfile {
  if (!isRecord(value)
    || value.surface_kind !== PROFILE_SURFACE_KIND
    || value.version !== PROFILE_VERSION) {
    throw contractError('Domain owner-answer projection profile has an invalid surface contract.', {
      source_ref: sourceRef,
    });
  }
  const profileRole = requireString(value.profile_role, 'profile_role', sourceRef);
  if (profileRole !== 'registry' && profileRole !== 'compatibility') {
    throw contractError('Domain owner-answer projection profile has an invalid profile_role.', {
      source_ref: sourceRef,
      profile_role: profileRole,
    });
  }
  if (!isRecord(value.authority_boundary) || value.authority_boundary.refs_only !== true) {
    throw contractError('Domain owner-answer projection profile must be refs-only.', {
      source_ref: sourceRef,
    });
  }
  for (const field of REQUIRED_FALSE_AUTHORITY_FIELDS) {
    if (value.authority_boundary[field] !== false) {
      throw contractError(`Domain owner-answer projection profile authority_boundary.${field} must be false.`, {
        source_ref: sourceRef,
        field,
      });
    }
  }
  const forbiddenAuthority = Object.entries(value.authority_boundary)
    .filter(([field, enabled]) => field.startsWith('can_') && enabled === true)
    .map(([field]) => field);
  if (forbiddenAuthority.length > 0) {
    throw contractError('Domain owner-answer projection profile grants forbidden authority.', {
      source_ref: sourceRef,
      forbidden_authority_fields: forbiddenAuthority,
    });
  }
  const stageNativeOwnerAnswer = normalizeStageNativeOwnerAnswer(
    value.stage_native_owner_answer,
    sourceRef,
  );
  const domainId = requireString(value.domain_id, 'domain_id', sourceRef);
  if (stageNativeOwnerAnswer && stageNativeOwnerAnswer.nextExecutableOwner !== domainId) {
    throw contractError('Domain owner-answer projection profile stage-native next owner must match domain_id.', {
      source_ref: sourceRef,
      domain_id: domainId,
      next_executable_owner: stageNativeOwnerAnswer.nextExecutableOwner,
    });
  }
  return {
    profileId: requireString(value.profile_id, 'profile_id', sourceRef),
    profileRole,
    domainId,
    bindingProjectId: requireString(value.binding_project_id, 'binding_project_id', sourceRef),
    sourceOwner: requireString(value.source_owner, 'source_owner', sourceRef),
    workspaceRootProfileRef: normalizeWorkspaceRootProfileRef(value.workspace_root_profile_ref, sourceRef),
    studiesDirName: requireString(value.studies_dir_name, 'studies_dir_name', sourceRef),
    projectionRelativePath: requireStringList(
      value.projection_relative_path,
      'projection_relative_path',
      sourceRef,
    ),
    stageNativeOwnerAnswer,
    sourceRef,
  };
}

function defaultRepoInputs() {
  return discoverFamilyRepoInputs(
    STANDARD_AGENT_REGISTRY
      .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
      .map((entry) => ({
        requested_agent_id: entry.agent_id,
        directory: entry.project,
      })),
    hasStandardDomainAgentSurface,
  );
}

function profileRefFromDescriptor(repoDir: string) {
  const descriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  if (!fs.existsSync(descriptorPath)) {
    return null;
  }
  const descriptor = resolveContainedRepoJsonFile(
    repoDir,
    'contracts/domain_descriptor.json',
    'Domain descriptor',
    'domain repo',
  );
  let payload: unknown;
  try {
    payload = parseJsonText(fs.readFileSync(descriptor.real_path, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Domain descriptor is invalid JSON.', {
      repo_dir: repoDir,
      source_ref: descriptor.repo_relative_ref,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(payload) || !isRecord(payload.standard_contract_refs)) {
    return null;
  }
  return optionalString(payload.standard_contract_refs[PROFILE_REF]);
}

function profileFromRepo(repo: StandardDomainAgentRepoInput) {
  const profileRef = profileRefFromDescriptor(repo.repo_dir);
  if (!profileRef) {
    return null;
  }
  const resolved = resolveContainedRepoJsonFile(
    repo.repo_dir,
    profileRef,
    'Domain owner-answer projection profile',
    'domain repo',
  );
  let payload: unknown;
  try {
    payload = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Domain owner-answer projection profile is invalid JSON.', {
      repo_dir: repo.repo_dir,
      source_ref: resolved.repo_relative_ref,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return normalizeDomainOwnerAnswerProjectionProfile(payload, resolved.repo_relative_ref);
}

export function resolveDomainOwnerAnswerProjectionProfiles(
  repoInputs: readonly StandardDomainAgentRepoInput[] = defaultRepoInputs(),
) {
  const profiles = repoInputs.flatMap((repo) => {
    const profile = profileFromRepo(repo);
    return profile ? [profile] : [];
  });
  const duplicates = profiles.filter((profile, index) =>
    profiles.some((other, otherIndex) => otherIndex !== index && other.domainId === profile.domainId),
  );
  if (duplicates.length > 0) {
    throw contractError('Domain owner-answer projection profiles contain ambiguous domain IDs.', {
      domain_ids: [...new Set(duplicates.map((profile) => profile.domainId))],
    });
  }
  return profiles;
}

export function resolveDomainOwnerAnswerProjectionProfile(
  domainId: string,
  repoInputs?: readonly StandardDomainAgentRepoInput[],
) {
  return resolveDomainOwnerAnswerProjectionProfiles(repoInputs)
    .find((profile) => profile.domainId === domainId) ?? null;
}
