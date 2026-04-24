import type {
  NormalizedArtifactFileDescriptor,
  NormalizedArtifactInventory,
  NormalizedAutomationCatalog,
  NormalizedProgressProjection,
  NormalizedSessionContinuity,
  NormalizedSkillCatalog,
} from './types.ts';
import {
  isRecord,
  normalizeRecordList,
  optionalString,
  readStringList,
  requireString,
  requireSurfaceKind,
} from './shared-utils.ts';
import {
  normalizeSurfaceRef,
  normalizeTaskSurfaceDescriptor,
} from './surface-normalizers.ts';

function normalizeArtifactFileDescriptor(
  value: unknown,
  field: string,
): NormalizedArtifactFileDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = requireString(value.kind, `${field}.kind`);
  if (kind !== 'deliverable' && kind !== 'supporting') {
    throw new Error(`${field}.kind must be deliverable or supporting.`);
  }

  return {
    file_id: requireString(value.file_id, `${field}.file_id`),
    label: requireString(value.label, `${field}.label`),
    kind,
    path: requireString(value.path, `${field}.path`),
    summary: requireString(value.summary, `${field}.summary`),
    ref: normalizeSurfaceRef(value.ref, `${field}.ref`),
  };
}

export function normalizeArtifactInventory(
  value: unknown,
  options: {
    progressProjection: NormalizedProgressProjection | null;
    sessionContinuity: NormalizedSessionContinuity | null;
  },
): NormalizedArtifactInventory | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'artifact_inventory', 'artifact_inventory');
  const deliverableFiles = normalizeRecordList(value.deliverable_files, 'artifact_inventory.deliverable_files')
    .map((entry, index) => normalizeArtifactFileDescriptor(entry, `artifact_inventory.deliverable_files[${index}]`))
    .filter((entry): entry is NormalizedArtifactFileDescriptor => entry !== null);
  const supportingFileCandidates: Array<NormalizedArtifactFileDescriptor | null> = [
    ...normalizeRecordList(value.supporting_files, 'artifact_inventory.supporting_files').map(
      (entry, index) =>
        normalizeArtifactFileDescriptor(entry, `artifact_inventory.supporting_files[${index}]`),
    ),
    ...normalizeRecordList(value.artifacts, 'artifact_inventory.artifacts').map((entry, index) => {
      if (!isRecord(entry)) {
        return null;
      }
      const ref = isRecord(entry.ref) ? entry.ref : null;
      return {
        file_id: requireString(entry.artifact_kind, `artifact_inventory.artifacts[${index}].artifact_kind`),
        label: requireString(entry.label, `artifact_inventory.artifacts[${index}].label`),
        kind: 'supporting' as const,
        path: optionalString(ref?.ref) ?? `artifact_inventory:${index}`,
        summary: requireString(entry.label, `artifact_inventory.artifacts[${index}].label`),
        ref: normalizeSurfaceRef(ref, `artifact_inventory.artifacts[${index}].ref`),
      };
    }),
  ];
  const supportingFiles = supportingFileCandidates.filter(
    (entry): entry is NormalizedArtifactFileDescriptor => entry !== null,
  );
  const summary = isRecord(value.summary) ? value.summary : {};
  const inspectPaths = readStringList(value.inspect_paths, 'artifact_inventory.inspect_paths');
  if (inspectPaths.length === 0) {
    for (const entry of [...deliverableFiles, ...supportingFiles]) {
      if (entry.path) {
        inspectPaths.push(entry.path);
      }
    }
  }
  const artifactSurface =
    normalizeTaskSurfaceDescriptor(value.artifact_surface, 'artifact_inventory.artifact_surface')
    ?? options.sessionContinuity?.artifact_surface
    ?? options.sessionContinuity?.restore_surface
    ?? null;

  return {
    surface_kind: 'artifact_inventory',
    session_id: optionalString(value.session_id),
    workspace_path: optionalString(value.workspace_path),
    summary: {
      deliverable_files_count:
        typeof summary.deliverable_files_count === 'number'
          ? summary.deliverable_files_count
          : deliverableFiles.length,
      supporting_files_count:
        typeof summary.supporting_files_count === 'number'
          ? summary.supporting_files_count
          : supportingFiles.length,
      total_files_count:
        typeof summary.total_files_count === 'number'
          ? summary.total_files_count
          : deliverableFiles.length + supportingFiles.length,
    },
    deliverable_files: deliverableFiles,
    supporting_files: supportingFiles,
    progress_headline:
      optionalString(value.progress_headline)
      ?? options.progressProjection?.headline
      ?? optionalString(value.summary)
      ?? null,
    artifact_surface: artifactSurface,
    inspect_paths: inspectPaths,
    domain_projection:
      isRecord(value.domain_projection)
      ? value.domain_projection
      : isRecord(value.repo_owned_truth)
        ? value.repo_owned_truth
        : null,
  };
}

export function normalizeSkillCatalog(value: unknown): NormalizedSkillCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'skill_catalog', 'skill_catalog');

  return {
    surface_kind: 'skill_catalog',
    summary: requireString(value.summary, 'skill_catalog.summary'),
    skills: normalizeRecordList(value.skills, 'skill_catalog.skills').map((skill, index) => {
      requireSurfaceKind(skill.surface_kind, `skill_catalog.skills[${index}]`, 'skill_descriptor');
      return {
        surface_kind: 'skill_descriptor',
        skill_id: requireString(skill.skill_id, `skill_catalog.skills[${index}].skill_id`),
        title: requireString(skill.title, `skill_catalog.skills[${index}].title`),
        owner: requireString(skill.owner, `skill_catalog.skills[${index}].owner`),
        distribution_mode: requireString(
          skill.distribution_mode,
          `skill_catalog.skills[${index}].distribution_mode`,
        ),
        target_surface_kind: requireString(
          skill.target_surface_kind,
          `skill_catalog.skills[${index}].target_surface_kind`,
        ),
        description: requireString(skill.description, `skill_catalog.skills[${index}].description`),
        command: optionalString(skill.command),
        readiness: requireString(skill.readiness, `skill_catalog.skills[${index}].readiness`),
        tags: readStringList(skill.tags, `skill_catalog.skills[${index}].tags`),
        domain_projection: isRecord(skill.domain_projection) ? skill.domain_projection : null,
      };
    }),
    supported_commands: readStringList(value.supported_commands, 'skill_catalog.supported_commands'),
    command_contracts: normalizeRecordList(value.command_contracts, 'skill_catalog.command_contracts'),
  };
}

export function normalizeAutomationCatalog(value: unknown): NormalizedAutomationCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'automation', 'automation');

  return {
    surface_kind: 'automation',
    summary: requireString(value.summary, 'automation.summary'),
    automations: normalizeRecordList(value.automations, 'automation.automations').map((entry, index) => {
      requireSurfaceKind(entry.surface_kind, `automation.automations[${index}]`, 'automation_descriptor');
      return {
        surface_kind: 'automation_descriptor',
        automation_id: requireString(entry.automation_id, `automation.automations[${index}].automation_id`),
        title: requireString(entry.title, `automation.automations[${index}].title`),
        owner: requireString(entry.owner, `automation.automations[${index}].owner`),
        trigger_kind: requireString(entry.trigger_kind, `automation.automations[${index}].trigger_kind`),
        target_surface_kind: requireString(
          entry.target_surface_kind,
          `automation.automations[${index}].target_surface_kind`,
        ),
        summary: requireString(entry.summary, `automation.automations[${index}].summary`),
        readiness_status: requireString(
          entry.readiness_status,
          `automation.automations[${index}].readiness_status`,
        ),
        gate_policy: requireString(entry.gate_policy, `automation.automations[${index}].gate_policy`),
        output_expectation: readStringList(
          entry.output_expectation,
          `automation.automations[${index}].output_expectation`,
        ),
        target_command: optionalString(entry.target_command),
        domain_projection: isRecord(entry.domain_projection) ? entry.domain_projection : null,
      };
    }),
    readiness_summary: optionalString(value.readiness_summary),
  };
}
