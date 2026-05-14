import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type ArtifactGalleryAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  closeout_refs: string[];
  consumed_refs: string[];
  writeback_receipt_refs: string[];
  controlled_apply_contract: JsonRecord;
  lifecycle_primitives: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function galleryRefs(attempt: ArtifactGalleryAttempt) {
  const locatorIndex = isRecord(attempt.lifecycle_primitives.artifact_locator_index)
    ? attempt.lifecycle_primitives.artifact_locator_index
    : {};
  const controlledApplyRefs = [
    ...stringList(attempt.controlled_apply_contract.owner_receipt_refs),
    ...stringList(attempt.controlled_apply_contract.no_regression_evidence_refs),
  ];
  return uniqueStrings([
    ...attempt.closeout_refs,
    ...attempt.consumed_refs,
    ...attempt.writeback_receipt_refs,
    ...stringList(locatorIndex.indexed_refs),
    ...controlledApplyRefs,
  ]);
}

function galleryItems(attempt: ArtifactGalleryAttempt) {
  return galleryRefs(attempt).map((ref, index) => ({
    item_id: `artifact:${attempt.stage_attempt_id}:${index}`,
    item_kind: 'artifact_or_receipt_ref',
    ref,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    handoff_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
    content_policy: 'locator_only_no_artifact_content',
  }));
}

export function buildAttemptArtifactGallery(attempt: ArtifactGalleryAttempt) {
  const locatorIndex = isRecord(attempt.lifecycle_primitives.artifact_locator_index)
    ? attempt.lifecycle_primitives.artifact_locator_index
    : {};
  const items = galleryItems(attempt);
  return {
    surface_kind: 'opl_artifact_gallery_projection',
    gallery_scope: 'stage_attempt',
    renderer_role: 'generic_artifact_gallery_handoff_shell',
    availability: items.length > 0 ? 'artifact_refs_observed' : 'no_artifact_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_root: typeof locatorIndex.workspace_root === 'string' ? locatorIndex.workspace_root : null,
    artifact_root: typeof locatorIndex.artifact_root === 'string' ? locatorIndex.artifact_root : null,
    items,
    summary: {
      item_count: items.length,
      closeout_ref_count: attempt.closeout_refs.length,
      consumed_ref_count: attempt.consumed_refs.length,
      writeback_receipt_ref_count: attempt.writeback_receipt_refs.length,
      content_policy: 'locator_only_no_artifact_content',
    },
    authority_boundary: {
      opl: 'artifact_locator_gallery_and_handoff_only',
      domain: 'artifact_content_package_export_authority',
      can_read_artifact_body: false,
      can_mutate_artifact: false,
      can_authorize_export_verdict: false,
    },
  };
}

export function buildWorkbenchArtifactGallery(attempts: ArtifactGalleryAttempt[]) {
  const perAttempt = attempts.map(buildAttemptArtifactGallery);
  const items = perAttempt.flatMap((gallery) => gallery.items);
  return {
    surface_kind: 'opl_artifact_gallery_projection',
    gallery_scope: 'stage_attempt_workbench',
    renderer_role: 'generic_artifact_gallery_handoff_shell',
    availability: items.length > 0 ? 'artifact_refs_observed' : 'no_artifact_refs',
    items,
    attempts: perAttempt,
    summary: {
      attempt_count: attempts.length,
      attempt_with_artifact_ref_count: perAttempt.filter((gallery) => gallery.items.length > 0).length,
      item_count: items.length,
      content_policy: 'locator_only_no_artifact_content',
    },
    authority_boundary: {
      opl: 'artifact_locator_gallery_and_handoff_only',
      domain: 'artifact_content_package_export_authority',
      can_read_artifact_body: false,
      can_mutate_artifact: false,
      can_authorize_export_verdict: false,
    },
  };
}
