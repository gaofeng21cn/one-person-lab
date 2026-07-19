import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { listFirstPartyAgentPackageDependencyProfiles } from '../agent-package-manifests.ts';

type DependencyKind = 'executable' | 'latex_package';
type DependencyRequiredLevel = 'required' | 'optional' | 'legacy_not_required';
type DependencyStatus = 'available' | 'missing' | 'not_checked';

type DomainDependencyProfile = {
  profile_id: string;
  profile_kind: 'domain_dependency_profile';
  profile_owner: string;
  domain_id: string;
  domain_truth_owner: string;
  source: {
    source_kind: 'domain_profile_ref';
    profile_ref: string;
    helper_ref: string;
  };
  opl_role: 'dependency_environment_check';
  source_descriptor_ref?: string;
  source_profile_sha256: string;
  dependencies: DependencyProfileCheckSpec[];
  authority_boundary?: {
    can_write_domain_truth?: false;
    can_write_artifact_body?: false;
    can_authorize_domain_readiness?: false;
    can_authorize_artifact_or_export_readiness?: false;
    can_issue_owner_receipt?: false;
  };
};

type DependencyProfileCheckSpec = {
  dependency_id: string;
  kind: DependencyKind;
  required_level: DependencyRequiredLevel;
  purpose: string;
  install_target?: string;
};

type DependencyCheck = {
  dependency_id: string;
  kind: DependencyKind;
  required_level: DependencyRequiredLevel;
  status: DependencyStatus;
  check_command: string[];
  resolved_path: string | null;
  purpose: string;
  blocker_when_missing: boolean;
  install_target?: string;
};

type RepairAction = {
  action_id: 'repair_dependency_profile_dependencies';
  mutation: boolean;
  status: 'not_needed' | 'manual_required' | 'planned' | 'completed' | 'failed';
  command_preview: string[];
  apply_command: string[];
  package_manager: 'tlmgr' | 'manual';
  install_targets: string[];
  note: string;
  stdout: string;
  stderr: string;
};

type DependencyDoctor = {
  surface_kind: 'opl_system_dependency_doctor';
  envelope_kind: 'opl_generic_dependency_doctor';
  profile_id: string;
  profile: DomainDependencyProfile;
  profile_owner: string;
  domain_scope: string;
  opl_role: DomainDependencyProfile['opl_role'];
  status: 'ready' | 'blocked';
  checked_at: string;
  dependencies: DependencyCheck[];
  summary: {
    required_dependency_count: number;
    missing_required_dependency_count: number;
    optional_dependency_count: number;
    missing_optional_dependency_count: number;
    legacy_not_required_dependency_count: number;
  };
  repair_action: RepairAction;
  authority_boundary: {
    can_write_domain_truth: false;
    can_write_artifact_body: false;
    can_authorize_domain_readiness: false;
    can_authorize_artifact_or_export_readiness: false;
    can_issue_owner_receipt: false;
    ordinary_domain_progress_blocked_by_this_surface: false;
    dependency_profile_ready_is_domain_ready: false;
    profile_required_dependencies_ready: true;
  };
  integration_refs: {
    domain_agent: string;
    domain_helper: string;
    source_profile_ref: string;
    source_profile_sha256: string;
    command: string;
    maintenance_command: string;
  };
};

type MaintenanceInput = {
  profile?: string;
  apply?: boolean;
};

function findCommand(command: string) {
  if (command.includes(path.sep)) {
    const resolved = path.resolve(command);
    try {
      fs.accessSync(resolved, fs.constants.X_OK);
      return resolved;
    } catch {
      return null;
    }
  }

  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH candidate.
      }
    }
  }
  return null;
}

function kpsewhich(target: string) {
  const result = spawnSync('kpsewhich', [target], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function checkExecutable(
  dependency: DependencyProfileCheckSpec,
): DependencyCheck {
  const resolvedPath = findCommand(dependency.dependency_id);
  return {
    dependency_id: dependency.dependency_id,
    kind: 'executable',
    required_level: dependency.required_level,
    status: resolvedPath ? 'available' : 'missing',
    check_command: ['command', '-v', dependency.dependency_id],
    resolved_path: resolvedPath,
    purpose: dependency.purpose,
    blocker_when_missing: dependency.required_level === 'required',
  };
}

function checkLatexPackage(
  dependency: DependencyProfileCheckSpec,
): DependencyCheck {
  const kpsewhichPath = findCommand('kpsewhich');
  const resolvedPath = kpsewhichPath ? kpsewhich(dependency.dependency_id) : null;
  return {
    dependency_id: dependency.dependency_id,
    kind: 'latex_package',
    required_level: dependency.required_level,
    status: kpsewhichPath ? (resolvedPath ? 'available' : 'missing') : 'not_checked',
    check_command: ['kpsewhich', dependency.dependency_id],
    resolved_path: resolvedPath,
    purpose: dependency.purpose,
    blocker_when_missing: dependency.required_level === 'required',
    install_target: dependency.install_target,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeDependencyCheckSpec(value: unknown): DependencyProfileCheckSpec | null {
  if (!isRecord(value)) return null;
  const dependencyId = asString(value.dependency_id);
  const purpose = asString(value.purpose);
  if (
    !dependencyId ||
    !purpose ||
    (value.kind !== 'executable' && value.kind !== 'latex_package') ||
    (
      value.required_level !== 'required' &&
      value.required_level !== 'optional' &&
      value.required_level !== 'legacy_not_required'
    )
  ) {
    return null;
  }
  return {
    dependency_id: dependencyId,
    kind: value.kind,
    required_level: value.required_level,
    purpose,
    install_target: asString(value.install_target) ?? undefined,
  };
}

function dependencyProfiles() {
  return listFirstPartyAgentPackageDependencyProfiles();
}

function dependencyProfileIds() {
  return dependencyProfiles()
    .map((entry) => isRecord(entry) ? asString(entry.profile_id) : null)
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeDependencyProfile(value: unknown): DomainDependencyProfile | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.source) ? value.source : null;
  const profileId = asString(value.profile_id);
  const profileOwner = asString(value.profile_owner);
  const domainId = asString(value.domain_id);
  const domainTruthOwner = asString(value.domain_truth_owner);
  const profileRef = source ? asString(source.profile_ref) : null;
  const helperRef = source ? asString(source.helper_ref) : null;
  const sourceProfileSha256 = asString(value.source_profile_sha256);
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.map((entry) => normalizeDependencyCheckSpec(entry))
    : [];
  const authorityBoundary = isRecord(value.authority_boundary) ? value.authority_boundary : null;
  if (
    !profileId ||
    value.profile_kind !== 'domain_dependency_profile' ||
    !profileOwner ||
    !domainId ||
    !domainTruthOwner ||
    !source ||
    source.source_kind !== 'domain_profile_ref' ||
    !profileRef ||
    !helperRef ||
    !sourceProfileSha256 ||
    !/^sha256:[0-9a-f]{64}$/.test(sourceProfileSha256) ||
    value.opl_role !== 'dependency_environment_check' ||
    !authorityBoundary ||
    authorityBoundary.can_write_domain_truth !== false ||
    authorityBoundary.can_write_artifact_body !== false ||
    authorityBoundary.can_authorize_domain_readiness !== false ||
    authorityBoundary.can_authorize_artifact_or_export_readiness !== false ||
    authorityBoundary.can_issue_owner_receipt !== false ||
    dependencies.length === 0 ||
    dependencies.some((entry) => !entry)
  ) {
    return null;
  }
  return {
    profile_id: profileId,
    profile_kind: 'domain_dependency_profile',
    profile_owner: profileOwner,
    domain_id: domainId,
    domain_truth_owner: domainTruthOwner,
    source: {
      source_kind: 'domain_profile_ref',
      profile_ref: profileRef,
      helper_ref: helperRef,
    },
    opl_role: 'dependency_environment_check',
    source_descriptor_ref: asString(value.source_descriptor_ref) ?? undefined,
    source_profile_sha256: sourceProfileSha256,
    dependencies: dependencies as DependencyProfileCheckSpec[],
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_artifact_body: false,
      can_authorize_domain_readiness: false,
      can_authorize_artifact_or_export_readiness: false,
      can_issue_owner_receipt: false,
    },
  };
}

function assertKnownProfile(profile: string) {
  const normalized = dependencyProfiles()
    .map((entry) => normalizeDependencyProfile(entry))
    .find((entry): entry is DomainDependencyProfile => entry?.profile_id === profile);
  if (normalized) return normalized;
  throw new FrameworkContractError(
    'cli_usage_error',
    'Unknown OPL system dependency profile.',
    {
      profile,
      available_profiles: dependencyProfileIds(),
    },
    2,
  );
}

function buildRepairAction(
  profile: DomainDependencyProfile,
  dependencies: DependencyCheck[],
  apply: boolean,
): RepairAction {
  const doctorCommand = ['opl', 'system', 'dependency-doctor', '--profile', profile.profile_id, '--json'];
  const maintenanceCommand = [
    'opl',
    'system',
    'dependency-maintenance',
    '--profile',
    profile.profile_id,
    '--apply',
    '--json',
  ];
  const missingRequired = dependencies.filter((entry) =>
    entry.required_level === 'required' && entry.status !== 'available'
  );
  if (missingRequired.length === 0) {
    return {
      action_id: 'repair_dependency_profile_dependencies',
      mutation: false,
      status: 'not_needed',
      command_preview: doctorCommand,
      apply_command: maintenanceCommand,
      package_manager: 'manual',
      install_targets: [],
      note: 'All required dependencies for this profile are currently discoverable.',
      stdout: '',
      stderr: '',
    };
  }

  const missingLatexTargets = missingRequired
    .filter((entry) => entry.kind === 'latex_package' && entry.install_target)
    .map((entry) => entry.install_target as string);
  const tlmgr = findCommand('tlmgr');
  const commandPreview = tlmgr && missingLatexTargets.length > 0
    ? ['tlmgr', 'install', ...missingLatexTargets]
    : maintenanceCommand;
  const baseAction: RepairAction = {
    action_id: 'repair_dependency_profile_dependencies',
    mutation: apply,
    status: apply ? 'planned' : 'manual_required',
    command_preview: commandPreview,
    apply_command: maintenanceCommand,
    package_manager: tlmgr ? 'tlmgr' : 'manual',
    install_targets: [...new Set(missingLatexTargets)],
    note: tlmgr
      ? 'OPL can install missing TeX Live packages only through an explicit maintenance apply.'
      : 'Install missing executables or TeX packages with the local OS/TeX package manager, then rerun dependency-doctor.',
    stdout: '',
    stderr: '',
  };

  if (!apply) {
    return baseAction;
  }
  if (!tlmgr || missingLatexTargets.length === 0) {
    return {
      ...baseAction,
      status: 'manual_required',
      mutation: false,
      note: 'Automatic apply is unavailable because no tlmgr-backed missing LaTeX package target was detected.',
    };
  }

  const result = spawnSync(tlmgr, ['install', ...new Set(missingLatexTargets)], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    ...baseAction,
    status: result.status === 0 ? 'completed' : 'failed',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function buildOplSystemDependencyDoctor(input: { profile?: string } = {}): {
  version: 'g2';
  system_dependency_doctor: DependencyDoctor;
} {
  const profile = assertKnownProfile(input.profile ?? '');

  const dependencies = profile.dependencies.map((entry) =>
    entry.kind === 'executable' ? checkExecutable(entry) : checkLatexPackage(entry)
  );
  const requiredDependencies = dependencies.filter((entry) => entry.required_level === 'required');
  const optionalDependencies = dependencies.filter((entry) => entry.required_level === 'optional');
  const legacyDependencies = dependencies.filter((entry) => entry.required_level === 'legacy_not_required');
  const missingRequired = requiredDependencies.filter((entry) => entry.status !== 'available');
  const missingOptional = optionalDependencies.filter((entry) => entry.status !== 'available');

  return {
    version: 'g2',
    system_dependency_doctor: {
      surface_kind: 'opl_system_dependency_doctor',
      envelope_kind: 'opl_generic_dependency_doctor',
      profile_id: profile.profile_id,
      profile,
      profile_owner: profile.profile_owner,
      domain_scope: profile.domain_id,
      opl_role: profile.opl_role,
      status: missingRequired.length === 0 ? 'ready' : 'blocked',
      checked_at: new Date().toISOString(),
      dependencies,
      summary: {
        required_dependency_count: requiredDependencies.length,
        missing_required_dependency_count: missingRequired.length,
        optional_dependency_count: optionalDependencies.length,
        missing_optional_dependency_count: missingOptional.length,
        legacy_not_required_dependency_count: legacyDependencies.length,
      },
      repair_action: buildRepairAction(profile, dependencies, false),
      authority_boundary: {
        can_write_domain_truth: false,
        can_write_artifact_body: false,
        can_authorize_domain_readiness: false,
        can_authorize_artifact_or_export_readiness: false,
        can_issue_owner_receipt: false,
        ordinary_domain_progress_blocked_by_this_surface: false,
        dependency_profile_ready_is_domain_ready: false,
        profile_required_dependencies_ready: true,
      },
      integration_refs: {
        domain_agent: profile.domain_id,
        domain_helper: profile.source.helper_ref,
        source_profile_ref: profile.source.profile_ref,
        source_profile_sha256: profile.source_profile_sha256,
        command: `opl system dependency-doctor --profile ${profile.profile_id} --json`,
        maintenance_command: `opl system dependency-maintenance --profile ${profile.profile_id} --json`,
      },
    },
  };
}

export async function runOplSystemDependencyMaintenance(input: MaintenanceInput = {}) {
  const profile = assertKnownProfile(input.profile ?? '');
  const before = buildOplSystemDependencyDoctor({ profile: profile.profile_id }).system_dependency_doctor;
  const repairAction = buildRepairAction(profile, before.dependencies, Boolean(input.apply));
  const after = input.apply
    ? buildOplSystemDependencyDoctor({ profile: profile.profile_id }).system_dependency_doctor
    : before;

  return {
    version: 'g2',
    system_action: {
      action: 'dependency_maintenance' as const,
      status: repairAction.status === 'completed' || repairAction.status === 'not_needed'
        ? 'completed'
        : 'manual_required',
      details: {
        surface_kind: 'opl_system_dependency_maintenance',
        profile_id: profile.profile_id,
        mutation_requested: Boolean(input.apply),
        mutation_performed: repairAction.status === 'completed',
        before,
        repair_action: repairAction,
        after,
        authority_boundary: before.authority_boundary,
        working_directory: path.resolve('.'),
      },
    },
  };
}
