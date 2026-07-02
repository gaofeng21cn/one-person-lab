import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../charter/contracts.ts';

const PROFILE_ID = 'bookforge-publication-proof';

type DependencyKind = 'executable' | 'latex_package';
type DependencyRequiredLevel = 'required' | 'optional' | 'legacy_not_required';
type DependencyStatus = 'available' | 'missing' | 'not_checked';

type DependencyCheck = {
  dependency_id: string;
  kind: DependencyKind;
  required_level: DependencyRequiredLevel;
  status: DependencyStatus;
  check_command: string[];
  resolved_path: string | null;
  purpose: string;
  blocker_when_missing: boolean;
};

type RepairAction = {
  action_id: 'repair_bookforge_publication_proof_dependencies';
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
  profile_id: typeof PROFILE_ID;
  profile_owner: 'opl_system';
  domain_scope: 'opl-bookforge';
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
    writes_domain_truth: false;
    writes_manuscript: false;
    authorizes_publication_ready: false;
    authorizes_final_export: false;
    ordinary_writing_progress_blocked_by_this_surface: false;
    publication_proof_claim_requires_required_dependencies_ready: true;
  };
  integration_refs: {
    domain_agent: 'opl-bookforge';
    domain_helper: 'runtime/native_helpers/bookforge_pdf_export.py';
    proof_profile: 'bookforge-zh-publication-proof';
    command: 'opl system dependency-doctor --profile bookforge-publication-proof --json';
    maintenance_command: 'opl system dependency-maintenance --profile bookforge-publication-proof --json';
  };
};

type MaintenanceInput = {
  profile?: string;
  apply?: boolean;
};

const REQUIRED_EXECUTABLES = [
  {
    dependency_id: 'pandoc',
    purpose: 'Markdown to standalone TeX/PDF conversion for Book Forge proof exports.',
  },
  {
    dependency_id: 'xelatex',
    purpose: 'XeLaTeX engine used by the bundled Chinese publication proof profile.',
  },
  {
    dependency_id: 'pdftoppm',
    purpose: 'Poppler page rendering for proof page inspection and nonblank checks.',
  },
] as const;

const OPTIONAL_EXECUTABLES = [
  {
    dependency_id: 'quarto',
    purpose: 'Optional future book-rendering backend for richer projects.',
  },
  {
    dependency_id: 'typst',
    purpose: 'Optional future typesetting backend for proof/export experiments.',
  },
] as const;

const REQUIRED_LATEX_PACKAGES = [
  { dependency_id: 'xcolor.sty', install_target: 'xcolor', purpose: 'Book Forge color palette.' },
  { dependency_id: 'fancyhdr.sty', install_target: 'fancyhdr', purpose: 'Running headers and page numbers.' },
  { dependency_id: 'titlesec.sty', install_target: 'titlesec', purpose: 'Chapter and section hierarchy.' },
  { dependency_id: 'caption.sty', install_target: 'caption', purpose: 'Caption style and spacing.' },
  { dependency_id: 'booktabs.sty', install_target: 'booktabs', purpose: 'Publication-grade table rules.' },
  { dependency_id: 'colortbl.sty', install_target: 'colortbl', purpose: 'Table rule color support.' },
  { dependency_id: 'etoolbox.sty', install_target: 'etoolbox', purpose: 'Environment hooks used by the proof profile.' },
  { dependency_id: 'ctexbook.cls', install_target: 'ctex', purpose: 'Chinese book document class.' },
] as const;

const LEGACY_LATEX_PACKAGES = [
  {
    dependency_id: 'titling.sty',
    purpose: 'Previously used title-page helper; no longer required by the Book Forge proof profile.',
  },
  {
    dependency_id: 'tocloft.sty',
    purpose: 'Previously used TOC style helper; no longer required by the Book Forge proof profile.',
  },
] as const;

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
  dependency: { dependency_id: string; purpose: string },
  requiredLevel: DependencyRequiredLevel,
): DependencyCheck {
  const resolvedPath = findCommand(dependency.dependency_id);
  return {
    dependency_id: dependency.dependency_id,
    kind: 'executable',
    required_level: requiredLevel,
    status: resolvedPath ? 'available' : 'missing',
    check_command: ['command', '-v', dependency.dependency_id],
    resolved_path: resolvedPath,
    purpose: dependency.purpose,
    blocker_when_missing: requiredLevel === 'required',
  };
}

function checkLatexPackage(
  dependency: { dependency_id: string; purpose: string },
  requiredLevel: DependencyRequiredLevel,
): DependencyCheck {
  const kpsewhichPath = findCommand('kpsewhich');
  const resolvedPath = kpsewhichPath ? kpsewhich(dependency.dependency_id) : null;
  return {
    dependency_id: dependency.dependency_id,
    kind: 'latex_package',
    required_level: requiredLevel,
    status: kpsewhichPath ? (resolvedPath ? 'available' : 'missing') : 'not_checked',
    check_command: ['kpsewhich', dependency.dependency_id],
    resolved_path: resolvedPath,
    purpose: dependency.purpose,
    blocker_when_missing: requiredLevel === 'required',
  };
}

function assertKnownProfile(profile: string) {
  if (profile === PROFILE_ID) {
    return;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Unknown OPL system dependency profile.',
    {
      profile,
      available_profiles: [PROFILE_ID],
    },
    2,
  );
}

function buildRepairAction(
  dependencies: DependencyCheck[],
  apply: boolean,
): RepairAction {
  const missingRequired = dependencies.filter((entry) =>
    entry.required_level === 'required' && entry.status !== 'available'
  );
  if (missingRequired.length === 0) {
    return {
      action_id: 'repair_bookforge_publication_proof_dependencies',
      mutation: false,
      status: 'not_needed',
      command_preview: ['opl', 'system', 'dependency-doctor', '--profile', PROFILE_ID, '--json'],
      apply_command: ['opl', 'system', 'dependency-maintenance', '--profile', PROFILE_ID, '--apply', '--json'],
      package_manager: 'manual',
      install_targets: [],
      note: 'All required dependencies for this profile are currently discoverable.',
      stdout: '',
      stderr: '',
    };
  }

  const missingLatexTargets = REQUIRED_LATEX_PACKAGES
    .filter((entry) =>
      missingRequired.some((dependency) => dependency.dependency_id === entry.dependency_id)
    )
    .map((entry) => entry.install_target);
  const tlmgr = findCommand('tlmgr');
  const commandPreview = tlmgr && missingLatexTargets.length > 0
    ? ['tlmgr', 'install', ...missingLatexTargets]
    : ['opl', 'system', 'dependency-maintenance', '--profile', PROFILE_ID, '--apply', '--json'];
  const baseAction: RepairAction = {
    action_id: 'repair_bookforge_publication_proof_dependencies',
    mutation: apply,
    status: apply ? 'planned' : 'manual_required',
    command_preview: commandPreview,
    apply_command: ['opl', 'system', 'dependency-maintenance', '--profile', PROFILE_ID, '--apply', '--json'],
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
  const profile = input.profile ?? PROFILE_ID;
  assertKnownProfile(profile);

  const dependencies: DependencyCheck[] = [
    ...REQUIRED_EXECUTABLES.map((entry) => checkExecutable(entry, 'required')),
    ...OPTIONAL_EXECUTABLES.map((entry) => checkExecutable(entry, 'optional')),
    ...REQUIRED_LATEX_PACKAGES.map((entry) => checkLatexPackage(entry, 'required')),
    ...LEGACY_LATEX_PACKAGES.map((entry) => checkLatexPackage(entry, 'legacy_not_required')),
  ];
  const requiredDependencies = dependencies.filter((entry) => entry.required_level === 'required');
  const optionalDependencies = dependencies.filter((entry) => entry.required_level === 'optional');
  const legacyDependencies = dependencies.filter((entry) => entry.required_level === 'legacy_not_required');
  const missingRequired = requiredDependencies.filter((entry) => entry.status !== 'available');
  const missingOptional = optionalDependencies.filter((entry) => entry.status !== 'available');

  return {
    version: 'g2',
    system_dependency_doctor: {
      surface_kind: 'opl_system_dependency_doctor',
      profile_id: PROFILE_ID,
      profile_owner: 'opl_system',
      domain_scope: 'opl-bookforge',
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
      repair_action: buildRepairAction(dependencies, false),
      authority_boundary: {
        writes_domain_truth: false,
        writes_manuscript: false,
        authorizes_publication_ready: false,
        authorizes_final_export: false,
        ordinary_writing_progress_blocked_by_this_surface: false,
        publication_proof_claim_requires_required_dependencies_ready: true,
      },
      integration_refs: {
        domain_agent: 'opl-bookforge',
        domain_helper: 'runtime/native_helpers/bookforge_pdf_export.py',
        proof_profile: 'bookforge-zh-publication-proof',
        command: 'opl system dependency-doctor --profile bookforge-publication-proof --json',
        maintenance_command: 'opl system dependency-maintenance --profile bookforge-publication-proof --json',
      },
    },
  };
}

export async function runOplSystemDependencyMaintenance(input: MaintenanceInput = {}) {
  const profile = input.profile ?? PROFILE_ID;
  assertKnownProfile(profile);
  const before = buildOplSystemDependencyDoctor({ profile }).system_dependency_doctor;
  const repairAction = buildRepairAction(before.dependencies, Boolean(input.apply));
  const after = input.apply
    ? buildOplSystemDependencyDoctor({ profile }).system_dependency_doctor
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
        profile_id: PROFILE_ID,
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
