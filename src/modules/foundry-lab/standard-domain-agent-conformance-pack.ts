import { validateStandardAgentImplementationProfileRefs } from '../pack/public/standard-agent-implementation-profile.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  unique,
} from './standard-domain-agent-conformance-utils.ts';

function directLegacyPackRootFields(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) return [];
  return [
    'canonical_repo_source_semantic_pack_root',
    'domain_pack_root',
    'canonical_repo_source_semantic_pack',
  ].filter((field) => packCompilerInput[field] !== undefined && packCompilerInput[field] !== null);
}

function requiredPackPaths(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) return [];
  const sourceRefs = isRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return unique([
    ...stringList(packCompilerInput.required_domain_pack_paths),
    ...stringList(sourceRefs.required_domain_pack_paths),
  ]);
}

export function buildPackCompilerChecks(repoDir: string, canonicalAgentId?: string) {
  const packCompilerInput = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const payload = packCompilerInput.payload;
  const implementationProfileValidation = validateStandardAgentImplementationProfileRefs(
    isRecord(payload) ? payload.implementation_profile : undefined,
    repoDir,
  );
  const canonicalPackRoot = isRecord(payload) ? optionalString(payload.canonical_semantic_pack_root) : null;
  const listedPaths = requiredPackPaths(payload);
  const readmeRequiredPaths = listedPaths.filter((entry) => entry === 'README.md' || entry.endsWith('/README.md'));
  const legacyFields = directLegacyPackRootFields(payload);
  const blockers = [
    packCompilerInput.status === 'resolved' ? null : `pack_compiler_input_${packCompilerInput.status}`,
    canonicalPackRoot === 'agent/' ? null : 'pack_compiler_canonical_semantic_pack_root_must_be_agent_slash',
    ...legacyFields.map((field) => `pack_compiler_legacy_pack_root_field:${field}`),
    ...readmeRequiredPaths.map((entry) => `required_domain_pack_path_must_not_be_readme:${entry}`),
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
    ...(implementationProfileValidation.status === 'blocked'
      ? implementationProfileValidation.blockers
      : []),
    canonicalAgentId === 'mas-scholar-skills' && implementationProfileValidation.status !== 'missing'
      ? 'framework_capability_package_must_not_declare_standard_agent_implementation_profile'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: packCompilerInput.status,
    canonical_semantic_pack_root: canonicalPackRoot,
    legacy_pack_root_fields: legacyFields,
    required_domain_pack_paths: listedPaths,
    readme_required_paths: readmeRequiredPaths,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    implementation_profile: isRecord(payload) ? payload.implementation_profile ?? null : null,
    implementation_profile_status: implementationProfileValidation.status,
    implementation_profile_blockers: implementationProfileValidation.blockers,
    blockers,
  };
}
