import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { isRecord } from '../../kernel/contract-validation.ts';
import { OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID } from './standard-agent-execution-profile.ts';

export const STANDARD_AGENT_IMPLEMENTATION_PROFILE_SCHEMA_REF =
  'contracts/opl-framework/standard-agent-implementation-profile.schema.json';
export const STANDARD_AGENT_IMPLEMENTATION_PROFILE_BASE_REF =
  STANDARD_AGENT_IMPLEMENTATION_PROFILE_SCHEMA_REF;

export type StandardAgentHelperRole = 'authority_function' | 'domain_helper' | 'native_helper';

export type StandardAgentImplementationHelper = {
  language: string;
  role: StandardAgentHelperRole;
  source_roots: string[];
};

export type StandardAgentImplementationProfile = {
  profile_id: 'opl.standard_domain_agent.v1';
  agent_identity: 'declarative_standard_agent_pack';
  pack_formats: ['markdown', 'json'];
  helpers: {
    optional: true;
    entries: StandardAgentImplementationHelper[];
    language_is_identity: false;
    rust_policy: 'framework_hot_path_only';
  };
  generated_surfaces_owner: 'one-person-lab';
};

export const STANDARD_AGENT_IMPLEMENTATION_PROFILE = {
  profile_id: 'opl.standard_domain_agent.v1',
  agent_identity: 'declarative_standard_agent_pack',
  pack_formats: ['markdown', 'json'],
  helpers: {
    optional: true,
    entries: [],
    language_is_identity: false,
    rust_policy: 'framework_hot_path_only',
  },
  generated_surfaces_owner: 'one-person-lab',
} as const satisfies StandardAgentImplementationProfile;

export type StandardAgentImplementationProfileDeclaration = {
  base_profile_ref: typeof STANDARD_AGENT_IMPLEMENTATION_PROFILE_BASE_REF;
  helpers: {
    entries: StandardAgentImplementationHelper[];
  };
};

export const STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION = {
  base_profile_ref: STANDARD_AGENT_IMPLEMENTATION_PROFILE_BASE_REF,
  helpers: {
    entries: [],
  },
} as const satisfies StandardAgentImplementationProfileDeclaration;

const HELPER_ROLES = new Set([
  'authority_function',
  'domain_helper',
  'native_helper',
]);

export type StandardAgentImplementationProfileValidation = {
  status: 'passed' | 'missing' | 'blocked';
  profile: StandardAgentImplementationProfile | null;
  blockers: string[];
};

export type StandardAgentImplementationProfileDeclarationValidation =
  StandardAgentImplementationProfileValidation & {
    declaration_kind: 'canonical_ref_delta' | 'legacy_full_profile' | null;
  };

export type StandardAgentImplementationProfileResolution = {
  status: 'passed' | 'missing' | 'blocked' | 'not_applicable';
  applicability: 'repo_local' | 'opl_hosted' | 'profile_resolution_blocked';
  selected_execution_profile_id: string | null;
  declaration_kind?: 'canonical_ref_delta' | 'legacy_full_profile' | null;
  declaration?: unknown;
  effective_profile: StandardAgentImplementationProfile | null;
  blockers: string[];
};

function isCanonicalRelativePath(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return false;
  if (path.posix.isAbsolute(value) || value.includes('\0')) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && !value.split('/').some((segment) => segment === '..' || segment === '.');
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function validateStandardAgentImplementationProfile(
  value: unknown,
  options: { required?: boolean; repoDir?: string } = {},
): StandardAgentImplementationProfileValidation {
  if (value === undefined || value === null) {
    return options.required
      ? { status: 'blocked', profile: null, blockers: ['implementation_profile_missing'] }
      : { status: 'missing', profile: null, blockers: [] };
  }

  const profile = isRecord(value) ? value : null;
  if (!profile) {
    return {
      status: 'blocked',
      profile: null,
      blockers: ['implementation_profile_must_be_object'],
    };
  }

  const blockers: string[] = [];
  if (!hasOnlyKeys(profile, [
    'profile_id',
    'agent_identity',
    'pack_formats',
    'helpers',
    'generated_surfaces_owner',
  ])) {
    blockers.push('implementation_profile_unknown_field');
  }
  if (profile.profile_id !== STANDARD_AGENT_IMPLEMENTATION_PROFILE.profile_id) {
    blockers.push('implementation_profile_profile_id_invalid');
  }
  if (profile.agent_identity !== STANDARD_AGENT_IMPLEMENTATION_PROFILE.agent_identity) {
    blockers.push('implementation_profile_agent_identity_invalid');
  }
  if (!isDeepStrictEqual(profile.pack_formats, STANDARD_AGENT_IMPLEMENTATION_PROFILE.pack_formats)) {
    blockers.push('implementation_profile_pack_formats_invalid');
  }
  if (profile.generated_surfaces_owner !== STANDARD_AGENT_IMPLEMENTATION_PROFILE.generated_surfaces_owner) {
    blockers.push('implementation_profile_generated_surfaces_owner_must_be_opl');
  }

  const helpers = isRecord(profile.helpers) ? profile.helpers : null;
  if (!helpers) {
    blockers.push('implementation_profile_helpers_must_be_object');
  } else {
    if (!hasOnlyKeys(helpers, ['optional', 'entries', 'language_is_identity', 'rust_policy'])) {
      blockers.push('implementation_profile_helpers_unknown_field');
    }
    if (helpers.optional !== true) {
      blockers.push('implementation_profile_helpers_optional_must_be_true');
    }
    if (helpers.language_is_identity !== false) {
      blockers.push('implementation_profile_helper_language_is_identity_must_be_false');
    }
    if (helpers.rust_policy !== 'framework_hot_path_only') {
      blockers.push('implementation_profile_rust_policy_invalid');
    }
    if (!Array.isArray(helpers.entries)) {
      blockers.push('implementation_profile_helper_entries_must_be_array');
    } else {
      helpers.entries.forEach((entry, index) => {
        const field = `implementation_profile.helpers.entries[${index}]`;
        if (!isRecord(entry)) {
          blockers.push(`${field}_must_be_object`);
          return;
        }
        if (!hasOnlyKeys(entry, ['language', 'role', 'source_roots'])) {
          blockers.push(`${field}_unknown_field`);
        }
        if (typeof entry.language !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(entry.language)) {
          blockers.push(`${field}_language_invalid`);
        } else if (entry.language === 'rust') {
          blockers.push(`${field}_rust_forbidden_in_domain_agent_profile`);
        }
        if (typeof entry.role !== 'string' || !HELPER_ROLES.has(entry.role)) {
          blockers.push(`${field}_role_invalid`);
        }
        if (!Array.isArray(entry.source_roots) || entry.source_roots.length === 0) {
          blockers.push(`${field}_source_roots_invalid`);
        } else {
          entry.source_roots.forEach((sourceRoot, rootIndex) => {
            if (!isCanonicalRelativePath(sourceRoot) || !String(sourceRoot).endsWith('/')) {
              blockers.push(`${field}.source_roots[${rootIndex}]_invalid`);
            }
          });
        }
      });
    }
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      profile: null,
      blockers: [...new Set(blockers)],
    };
  }

  return {
    status: 'passed',
    profile: value as StandardAgentImplementationProfile,
    blockers: [],
  };
}

export function validateStandardAgentImplementationProfileRefs(
  value: unknown,
  repoDir?: string,
  options: { required?: boolean } = {},
) {
  const validation = validateStandardAgentImplementationProfile(value, { required: options.required ?? false });
  if (validation.status !== 'passed' || !validation.profile) {
    return validation;
  }
  const blockers = [...validation.blockers];
  const entries = validation.profile.helpers.entries;
  if (!repoDir) return validation;
  entries.forEach((entry, index) => {
    entry.source_roots.forEach((sourceRoot, rootIndex) => {
      const resolved = path.resolve(repoDir, sourceRoot);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        blockers.push(`implementation_profile.helpers.entries[${index}].source_roots[${rootIndex}]_missing`);
      }
    });
  });
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    profile: blockers.length === 0 ? validation.profile : null,
    blockers: [...new Set(blockers)],
  } satisfies StandardAgentImplementationProfileValidation;
}

export function validateStandardAgentImplementationProfileDeclaration(
  value: unknown,
  options: { required?: boolean } = {},
): StandardAgentImplementationProfileDeclarationValidation {
  if (value === undefined || value === null) {
    return {
      status: options.required ? 'blocked' : 'missing',
      declaration_kind: null,
      profile: null,
      blockers: options.required ? ['implementation_profile_missing'] : [],
    };
  }

  if (isRecord(value) && Object.hasOwn(value, 'profile_id')) {
    const validation = validateStandardAgentImplementationProfile(value, { required: true });
    return {
      ...validation,
      declaration_kind: 'legacy_full_profile',
    };
  }

  if (!isRecord(value)) {
    return {
      status: 'blocked',
      declaration_kind: null,
      profile: null,
      blockers: ['implementation_profile_declaration_must_be_object'],
    };
  }

  const blockers: string[] = [];
  if (!hasOnlyKeys(value, ['base_profile_ref', 'helpers'])) {
    blockers.push('implementation_profile_declaration_unknown_field');
  }
  if (value.base_profile_ref !== STANDARD_AGENT_IMPLEMENTATION_PROFILE_BASE_REF) {
    blockers.push('implementation_profile_base_profile_ref_invalid');
  }
  const helpers = isRecord(value.helpers) ? value.helpers : null;
  if (!helpers) {
    blockers.push('implementation_profile_declaration_helpers_must_be_object');
  } else if (!hasOnlyKeys(helpers, ['entries'])) {
    blockers.push('implementation_profile_declaration_helpers_unknown_field');
  }
  const entries = helpers?.entries;
  if (!Array.isArray(entries)) {
    blockers.push('implementation_profile_helper_entries_must_be_array');
  }
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      declaration_kind: 'canonical_ref_delta',
      profile: null,
      blockers: [...new Set(blockers)],
    };
  }

  const effectiveProfile = {
    ...STANDARD_AGENT_IMPLEMENTATION_PROFILE,
    helpers: {
      ...STANDARD_AGENT_IMPLEMENTATION_PROFILE.helpers,
      entries,
    },
  };
  const validation = validateStandardAgentImplementationProfile(effectiveProfile, { required: true });
  return {
    ...validation,
    declaration_kind: 'canonical_ref_delta',
  };
}

export function resolveStandardAgentImplementationProfile(
  value: unknown,
  options: {
    repoDir?: string;
    selectedExecutionProfileId: string | null;
    required?: boolean;
  },
): StandardAgentImplementationProfileResolution {
  if (options.selectedExecutionProfileId === null) {
    return {
      status: 'blocked',
      applicability: 'profile_resolution_blocked',
      selected_execution_profile_id: null,
      declaration: value ?? null,
      effective_profile: null,
      blockers: ['implementation_profile_execution_profile_selection_blocked'],
    };
  }
  if (options.selectedExecutionProfileId === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID) {
    return value === undefined || value === null
      ? {
          status: 'not_applicable',
          applicability: 'opl_hosted',
          selected_execution_profile_id: options.selectedExecutionProfileId,
          effective_profile: null,
          blockers: [],
        }
      : {
          status: 'blocked',
          applicability: 'opl_hosted',
          selected_execution_profile_id: options.selectedExecutionProfileId,
          declaration: value,
          effective_profile: null,
          blockers: ['hosted_execution_profile_must_not_declare_repo_local_implementation_profile'],
        };
  }

  const validation = validateStandardAgentImplementationProfileDeclaration(value, {
    required: options.required ?? false,
  });
  if (validation.status !== 'passed' || !validation.profile) {
    return {
      status: validation.status,
      applicability: 'repo_local',
      selected_execution_profile_id: options.selectedExecutionProfileId,
      declaration_kind: validation.declaration_kind,
      declaration: value ?? null,
      effective_profile: null,
      blockers: validation.blockers,
    };
  }
  const refsValidation = validateStandardAgentImplementationProfileRefs(
    validation.profile,
    options.repoDir,
    { required: true },
  );
  return {
    status: refsValidation.status,
    applicability: 'repo_local',
    selected_execution_profile_id: options.selectedExecutionProfileId,
    declaration_kind: validation.declaration_kind,
    declaration: value,
    effective_profile: refsValidation.profile,
    blockers: refsValidation.blockers,
  };
}
