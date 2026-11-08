import { FrameworkContractError } from "../../../kernel/contract-validation.ts";

export function nonEmptyStrings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

// Evidence and citation ref lists are authored by Codex Attempts, and the Stage contract
// points those Attempts at locators the framework itself publishes as objects: the reviewer
// is told to read review content from `opl_reviewer_input_snapshot_manifest.members[].immutable_ref`,
// whose schema shape is an exact ref (`{kind, ref, size_bytes, sha256}`). A faithful citation of
// that locator is therefore either the locator string itself or that exact ref object. This
// normalization accepts both, keeps the normalized contract a `string[]`, and stays fail-closed
// for anything else so a genuinely malformed ref list is still rejected with the same error.
export function evidenceRefStrings(value: unknown, field: string, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  }
  const refs = value.map((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return entry;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const ref = (entry as Record<string, unknown>).ref;
      if (typeof ref === 'string' && ref.trim()) {
        return ref;
      }
    }
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  });
  return [...new Set(refs.map((entry) => entry.trim()))];
}

export function nonEmptyStringSequence(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty strings.`, {
      field,
    });
  }
  return value.map((entry) => entry.trim());
}

export function normalizeStageQualityArtifactIdentity(input: {
  artifactRefs: unknown;
  artifactHashes: unknown;
  allowEmpty?: boolean;
}) {
  const artifactRefs = nonEmptyStringSequence(input.artifactRefs, 'artifact_refs');
  const artifactHashes = nonEmptyStringSequence(input.artifactHashes, 'artifact_hashes');
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  if (!input.allowEmpty && artifactRefs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Artifact identity requires at least one exact ref and hash pair.',
    );
  }
  uniqueIds(artifactRefs, 'artifact_refs');
  return { artifact_refs: artifactRefs, artifact_hashes: artifactHashes } as const;
}

export function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

export function requiredRefs(value: unknown, field: string) {
  const normalized = nonEmptyStrings(value, field);
  if (normalized.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} requires at least one ref.`, { field });
  }
  return normalized;
}

export function uniqueIds(values: string[], field: string) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} contains a duplicate id.`, {
      field,
      duplicate_id: duplicate,
    });
  }
}
