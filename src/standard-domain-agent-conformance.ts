import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contracts.ts';
import { buildGeneratedAgentInterfaces } from './domain-pack-compiler.ts';
import { validateStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

const DEFAULT_FAMILY_REPOS = [
  { requested_agent_id: 'mas', directory: 'med-autoscience' },
  { requested_agent_id: 'mag', directory: 'med-autogrant' },
  { requested_agent_id: 'rca', directory: 'redcube-ai' },
  { requested_agent_id: 'opl-meta-agent', directory: 'opl-meta-agent' },
] as const;

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '..');

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

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
      payload: null,
      error: null,
    };
  }
  try {
    return {
      path: relativePath,
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      path: relativePath,
      status: 'invalid_json',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

function directLegacyPackRootFields(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  return [
    'canonical_repo_source_semantic_pack_root',
    'domain_pack_root',
    'canonical_repo_source_semantic_pack',
  ].filter((field) => packCompilerInput[field] !== undefined && packCompilerInput[field] !== null);
}

function requiredPackPaths(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  const sourceRefs = isRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return unique([
    ...stringList(packCompilerInput.required_domain_pack_paths),
    ...stringList(sourceRefs.required_domain_pack_paths),
  ]);
}

function collectFieldValues(value: unknown, targetField: string, currentPath = '$'): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectFieldValues(entry, targetField, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => {
    const fieldPath = `${currentPath}.${field}`;
    const direct = field === targetField ? [{ path: fieldPath, value: fieldValue }] : [];
    return [...direct, ...collectFieldValues(fieldValue, targetField, fieldPath)];
  });
}

function workspaceCandidatesFrom(seed: string) {
  const candidates = [seed, path.dirname(seed)];
  let current = path.resolve(seed);
  while (current !== path.dirname(current)) {
    if (path.basename(current) === '.worktrees') {
      candidates.push(path.dirname(path.dirname(current)));
    }
    current = path.dirname(current);
  }
  return candidates;
}

function defaultFamilyRepoInputs(): RepoInput[] {
  const workspaceRoots = unique([
    ...(process.env.OPL_FAMILY_WORKSPACE_ROOT ? [process.env.OPL_FAMILY_WORKSPACE_ROOT] : []),
    ...workspaceCandidatesFrom(process.cwd()),
    ...workspaceCandidatesFrom(OPL_REPO_ROOT),
  ].map((entry) => path.resolve(entry)));

  const repos: RepoInput[] = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const repo of DEFAULT_FAMILY_REPOS) {
      const repoDir = path.join(workspaceRoot, repo.directory);
      if (
        fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'))
        && !repos.some((entry) => path.resolve(entry.repo_dir) === path.resolve(repoDir))
      ) {
        repos.push({
          requested_agent_id: repo.requested_agent_id,
          repo_dir: repoDir,
        });
      }
    }
  }
  return repos;
}

function parseConformanceArgs(args: string[]): RepoInput[] {
  const repos: RepoInput[] = [];
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
        throw new FrameworkContractError('cli_usage_error', 'agents conformance --agent expects <agent_id>=<repo_dir>.', {
          usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
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
    throw new FrameworkContractError('cli_usage_error', `Unknown agents conformance option: ${token}.`, {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
    });
  }

  const selected = repos.length > 0 ? repos : defaultFamilyRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents conformance could not discover family agent repos.', {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
      default_repo_directories: DEFAULT_FAMILY_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

function buildGeneratedInterfaceCheck(repoDir: string) {
  try {
    const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
    const bundle = result.generated_agent_interfaces;
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : null;
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : null;
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : null;
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.owner) === 'one-person-lab'
        ? null
        : `generated_interfaces_owner_not_opl:${optionalString(bundle.owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'generated_interfaces_domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle?.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle?.status) ?? 'missing'}`,
      optionalString(targetProof?.status) === 'ready'
        ? null
        : `active_caller_target_proof_status_not_ready:${optionalString(targetProof?.status) ?? 'missing'}`,
      optionalString(cutoverProof?.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_proof_status_not_ready:${optionalString(cutoverProof?.status) ?? 'missing'}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      generated_interfaces_status: optionalString(bundle.status),
      generated_surface_owner: optionalString(bundle.generated_surface_owner),
      domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
      generated_wrapper_bundle_status: optionalString(wrapperBundle?.status),
      active_caller_target_proof_status: optionalString(targetProof?.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof?.status),
      claims_live_soak_complete: cutoverProof?.claims_live_soak_complete === true,
      claims_domain_ready: cutoverProof?.claims_domain_ready === true,
      blocker_reasons: Array.isArray(bundle.blocker_reasons)
        ? bundle.blocker_reasons.filter((entry): entry is string => typeof entry === 'string')
        : [],
      blockers,
    };
  } catch (error) {
    const code = error instanceof FrameworkContractError ? error.code : 'generated_interfaces_error';
    return {
      status: 'blocked',
      generated_interfaces_status: 'error',
      generated_surface_owner: null,
      domain_repo_can_own_generated_surface: null,
      generated_wrapper_bundle_status: null,
      active_caller_target_proof_status: null,
      active_caller_cutover_proof_status: null,
      claims_live_soak_complete: false,
      claims_domain_ready: false,
      blocker_reasons: [],
      blockers: [`generated_interfaces_error:${code}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPackCompilerChecks(repoDir: string) {
  const packCompilerInput = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const payload = packCompilerInput.payload;
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
    blockers,
  };
}

function buildGeneratedSurfaceHandoffChecks(repoDir: string) {
  const generatedSurfaceHandoff = readJsonFile(repoDir, 'contracts/generated_surface_handoff.json');
  const payload = generatedSurfaceHandoff.payload;
  const blockers = [
    generatedSurfaceHandoff.status === 'resolved' ? null : `generated_surface_handoff_${generatedSurfaceHandoff.status}`,
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: generatedSurfaceHandoff.status,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    blockers,
  };
}

function buildPrivateSurfaceChecks(repoDir: string) {
  const functionalAudit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const payload = functionalAudit.payload;
  const authority = isRecord(payload) && isRecord(payload.authority_boundary) ? payload.authority_boundary : null;
  const activePathScanStates = collectFieldValues(payload, 'active_path_scan_state')
    .map((entry) => ({
      path: entry.path,
      state: optionalString(entry.value) ?? String(entry.value),
    }));
  const unavailableScans = activePathScanStates.filter((entry) => entry.state === 'not_available');
  const blockers = [
    functionalAudit.status === 'resolved' ? null : `functional_privatization_audit_${functionalAudit.status}`,
    authority?.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'functional_audit_domain_can_claim_generic_runtime_owner_must_be_false',
    authority?.domain_repo_can_own_generated_surface === true
      ? 'functional_audit_domain_repo_can_own_generated_surface_must_not_be_true'
      : null,
    ...unavailableScans.map((entry) => `active_path_scan_state_not_available:${entry.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: functionalAudit.status,
    domain_can_claim_generic_runtime_owner: authority?.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface: authority?.domain_repo_can_own_generated_surface ?? null,
    active_path_scan_states: activePathScanStates,
    blockers,
  };
}

function buildEvidenceTailClassification(generatedInterfaceCheck: ReturnType<typeof buildGeneratedInterfaceCheck>) {
  const tail_items = [
    generatedInterfaceCheck.claims_live_soak_complete
      ? null
      : 'production_live_soak_not_claimed_by_conformance',
    generatedInterfaceCheck.claims_domain_ready
      ? null
      : 'domain_ready_not_claimed_by_conformance',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: tail_items.length === 0 ? 'no_tail_detected' : 'production_evidence_tail_present',
    tail_items,
    structural_gate_policy: 'tail_items_are_not_structural_conformance_blockers',
  };
}

function buildRepoConformance(input: RepoInput) {
  const repoDir = path.resolve(input.repo_dir);
  const domainId = readDomainId(repoDir, input.requested_agent_id);
  const scaffoldValidation = validateStandardDomainAgentScaffold({ repoDir }).standard_domain_agent_scaffold_validation;
  const packCompilerChecks = buildPackCompilerChecks(repoDir);
  const generatedSurfaceHandoffChecks = buildGeneratedSurfaceHandoffChecks(repoDir);
  const privateSurfaceChecks = buildPrivateSurfaceChecks(repoDir);
  const generatedInterfaceChecks = buildGeneratedInterfaceCheck(repoDir);
  const evidenceTailClassification = buildEvidenceTailClassification(generatedInterfaceChecks);
  const blockers = unique([
    ...scaffoldValidation.blockers,
    ...packCompilerChecks.blockers,
    ...generatedSurfaceHandoffChecks.blockers,
    ...privateSurfaceChecks.blockers,
    ...generatedInterfaceChecks.blockers,
  ]);

  return {
    repo_dir: repoDir,
    requested_agent_id: input.requested_agent_id,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    blockers,
    scaffold_validation: {
      status: scaffoldValidation.status,
      blockers: scaffoldValidation.blockers,
      agent_pack_validation: scaffoldValidation.agent_pack_validation,
      stage_ref_validation: scaffoldValidation.stage_ref_validation,
    },
    pack_compiler_checks: packCompilerChecks,
    generated_surface_handoff_checks: generatedSurfaceHandoffChecks,
    private_surface_checks: privateSurfaceChecks,
    generated_interface_checks: generatedInterfaceChecks,
    evidence_tail_classification: evidenceTailClassification,
  };
}

export function buildStandardDomainAgentConformanceReport(args: string[]) {
  const repos = parseConformanceArgs(args);
  const reports = repos.map(buildRepoConformance);
  const passedCount = reports.filter((report) => report.status === 'passed').length;
  const blockedCount = reports.length - passedCount;
  const productionEvidenceTailCount = reports.reduce(
    (total, report) => total + report.evidence_tail_classification.tail_items.length,
    0,
  );
  return {
    version: 'g2',
    standard_domain_agent_conformance: {
      surface_kind: 'opl_standard_domain_agent_conformance_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        passed_count: passedCount,
        blocked_count: blockedCount,
        structural_conformance_status: blockedCount === 0 ? 'passed' : 'blocked',
        production_evidence_tail_count: productionEvidenceTailCount,
        production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
      },
      reports,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        conformance_report_can_claim_domain_ready: false,
      },
    },
  };
}
