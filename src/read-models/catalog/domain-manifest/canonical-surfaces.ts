import fs from 'node:fs';

import { normalizeFamilyStageControlPlane } from '../../../authority/stages/index.ts';
import {
  compileStandardAgentStageManifest,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from '../../../authority/packages/index.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveContainedRepoJsonFile } from '../../../kernel/repo-contained-json-file.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { NormalizedDomainManifest, NormalizedSurfaceRef } from './types.ts';
import { isRecord, requireRecord, requireString } from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

type CanonicalManifestSurface<T> = {
  value: T | null;
  sourceRef: NormalizedSurfaceRef | null;
};

const GENERATED_STAGE_CONTROL_PLANE_REF = 'opl-generated:family_stage_control_plane';
const GENERATED_STAGE_CONTROL_PLANE_REF_FIELDS = new Set([
  'ref_kind',
  'ref',
  'source_ref',
  'label',
]);
const REPO_CONTRACT_REF_FIELDS = new Set(['ref_kind', 'ref', 'label']);

function hasOwn(record: JsonRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

export function resolveCanonicalManifestSurface<T>(
  manifest: JsonRecord,
  bodyField: string,
  refField: string,
  expectedRef: string,
  repoDir: string | undefined,
  normalize: (value: unknown, field?: string) => T | null,
): CanonicalManifestSurface<T> {
  if (hasOwn(manifest, bodyField) && hasOwn(manifest, refField)) {
    throw new Error(`${bodyField} must provide either an inline body or ${refField}, not both.`);
  }
  if (!hasOwn(manifest, refField)) {
    return { value: normalize(manifest[bodyField], bodyField), sourceRef: null };
  }
  if (!repoDir) {
    throw new Error(`${refField} requires a bound domain repository path.`);
  }

  const ref = requireRecord(manifest[refField], refField);
  const unsupportedFields = Object.keys(ref)
    .filter((field) => !REPO_CONTRACT_REF_FIELDS.has(field))
    .sort();
  if (unsupportedFields.length > 0) {
    throw new Error(`${refField} contains unsupported fields: ${unsupportedFields.join(', ')}.`);
  }
  if (requireString(ref.ref_kind, `${refField}.ref_kind`) !== 'repo_path') {
    throw new Error(`${refField}.ref_kind must be repo_path.`);
  }
  if (requireString(ref.ref, `${refField}.ref`) !== expectedRef) {
    throw new Error(`${refField}.ref must be ${expectedRef}.`);
  }

  const resolved = resolveContainedRepoJsonFile(repoDir, expectedRef, refField, 'domain repo');
  const payload = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
  if (!isRecord(payload)) {
    throw new Error(`${refField} must resolve to a JSON object.`);
  }
  return {
    value: normalize(payload, refField),
    sourceRef: {
      ref_kind: 'repo_path',
      ref: resolved.repo_relative_ref,
      label: optionalString(ref.label) ?? bodyField,
    },
  };
}

export function resolveGeneratedStageControlPlaneSurface(
  manifest: JsonRecord,
  repoDir: string | undefined,
): CanonicalManifestSurface<NonNullable<NormalizedDomainManifest['family_stage_control_plane']>> {
  const bodyField = 'family_stage_control_plane';
  const refField = 'family_stage_control_plane_ref';
  if (hasOwn(manifest, bodyField)) {
    throw new Error(`${bodyField} must not be supplied; use ${refField}.`);
  }
  if (!hasOwn(manifest, refField)) {
    return { value: null, sourceRef: null };
  }
  if (!repoDir) {
    throw new Error(`${refField} requires a bound domain repository path.`);
  }

  const ref = requireRecord(manifest[refField], refField);
  const unsupportedFields = Object.keys(ref)
    .filter((field) => !GENERATED_STAGE_CONTROL_PLANE_REF_FIELDS.has(field))
    .sort();
  if (unsupportedFields.length > 0) {
    throw new Error(`${refField} contains unsupported fields: ${unsupportedFields.join(', ')}.`);
  }
  if (requireString(ref.ref_kind, `${refField}.ref_kind`) !== 'generated_surface') {
    throw new Error(`${refField}.ref_kind must be generated_surface.`);
  }
  if (requireString(ref.ref, `${refField}.ref`) !== GENERATED_STAGE_CONTROL_PLANE_REF) {
    throw new Error(`${refField}.ref must be ${GENERATED_STAGE_CONTROL_PLANE_REF}.`);
  }
  if (requireString(ref.source_ref, `${refField}.source_ref`) !== STANDARD_AGENT_STAGE_MANIFEST_REF) {
    throw new Error(`${refField}.source_ref must be ${STANDARD_AGENT_STAGE_MANIFEST_REF}.`);
  }
  const label = hasOwn(ref, 'label')
    ? requireString(ref.label, `${refField}.label`)
    : bodyField;
  const compiled = compileStandardAgentStageManifest(repoDir);

  return {
    value: normalizeFamilyStageControlPlane(compiled.stage_control_plane, refField),
    sourceRef: {
      ref_kind: 'generated_surface',
      ref: GENERATED_STAGE_CONTROL_PLANE_REF,
      source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
      label,
    },
  };
}

