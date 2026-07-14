import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileResult } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import type { StandardAgentStageCatalogDeclaration } from '../../../kernel/standard-agent-interface.ts';
import type { WorkItemProjectionDiagnostic } from './types.ts';

export type StageCatalogPresentationEntry = {
  stage_id: string;
  display_name: string | null;
  display_names: Record<string, string>;
};

export type StageCatalogReadResult = {
  entries: StageCatalogPresentationEntry[] | null;
  source_ref: string | null;
  diagnostics: WorkItemProjectionDiagnostic[];
};

function descendant(root: string, relativePath: string) {
  if (path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function jsonPointer(value: unknown, pointer: string) {
  let current = value;
  for (const rawSegment of pointer.replace(/^\//, '').split('/').filter(Boolean)) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }
  return current;
}

export function readStageDisplayNames(value: unknown) {
  if (value === undefined || value === null) {
    return { displayNames: {}, invalidEntryCount: 0 };
  }
  if (!isRecord(value)) {
    return { displayNames: {}, invalidEntryCount: 1 };
  }
  const validEntries = Object.entries(value).flatMap(([locale, candidate]) => {
    const displayName = stringValue(candidate);
    return locale.length > 0 && !/\s/.test(locale) && displayName
      ? [[locale, displayName] as const]
      : [];
  });
  return {
    displayNames: Object.fromEntries(validEntries),
    invalidEntryCount: Object.keys(value).length - validEntries.length,
  };
}

export function readAgentStageCatalog(input: {
  agentRepoDir: string;
  declaration: StandardAgentStageCatalogDeclaration | null;
}): StageCatalogReadResult {
  if (!input.declaration) {
    return { entries: null, source_ref: null, diagnostics: [] };
  }
  const catalogPath = descendant(input.agentRepoDir, input.declaration.relative_path);
  if (!catalogPath) {
    return {
      entries: null,
      source_ref: null,
      diagnostics: [{
        reason: 'stage_catalog_ref_escapes_agent_repo',
        ref: input.declaration.relative_path,
      }],
    };
  }
  const readResult = readJsonFileResult(catalogPath);
  if (readResult.status === 'missing') {
    return {
      entries: null,
      source_ref: null,
      diagnostics: [{ reason: 'stage_catalog_source_missing', ref: catalogPath }],
    };
  }
  if (readResult.status === 'invalid_json') {
    return {
      entries: null,
      source_ref: catalogPath,
      diagnostics: [{
        reason: 'stage_catalog_json_invalid',
        ref: catalogPath,
        details: { error: readResult.error },
      }],
    };
  }
  const sourceRef = `${catalogPath}#${input.declaration.items_pointer}`;
  const sourceItems = jsonPointer(readResult.payload, input.declaration.items_pointer);
  if (!Array.isArray(sourceItems)) {
    return {
      entries: null,
      source_ref: sourceRef,
      diagnostics: [{ reason: 'stage_catalog_items_pointer_invalid', ref: sourceRef }],
    };
  }
  if (sourceItems.length === 0) {
    return {
      entries: null,
      source_ref: sourceRef,
      diagnostics: [{ reason: 'stage_catalog_items_empty', ref: sourceRef }],
    };
  }

  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const entries: StageCatalogPresentationEntry[] = [];
  let invalidStageCount = 0;
  for (const rawItem of sourceItems) {
    if (!isRecord(rawItem)) {
      invalidStageCount += 1;
      continue;
    }
    const stageId = stringValue(rawItem[input.declaration.field_map.stage_id]);
    if (!stageId) {
      invalidStageCount += 1;
      continue;
    }
    const rawDisplayName = rawItem[input.declaration.field_map.display_name];
    const displayName = stringValue(rawDisplayName);
    const localized = readStageDisplayNames(rawItem[input.declaration.field_map.display_names]);
    const invalidPresentationFieldCount = localized.invalidEntryCount
      + Number(rawDisplayName !== undefined && rawDisplayName !== null && !displayName);
    if (invalidPresentationFieldCount > 0) {
      diagnostics.push({
        reason: 'stage_catalog_stage_presentation_invalid',
        ref: sourceRef,
        details: {
          stage_id: stageId,
          invalid_field_count: invalidPresentationFieldCount,
        },
      });
    }
    entries.push({
      stage_id: stageId,
      display_name: displayName,
      display_names: localized.displayNames,
    });
  }
  if (invalidStageCount > 0) {
    return {
      entries: null,
      source_ref: sourceRef,
      diagnostics: [{
        reason: 'stage_catalog_stage_entries_invalid',
        ref: sourceRef,
        details: { invalid_stage_count: invalidStageCount },
      }],
    };
  }
  const duplicateStageIds = [...new Set(entries
    .map((entry) => entry.stage_id)
    .filter((stageId, index, all) => all.indexOf(stageId) !== index))];
  if (duplicateStageIds.length > 0) {
    return {
      entries: null,
      source_ref: sourceRef,
      diagnostics: [{
        reason: 'stage_catalog_stage_ids_duplicate',
        ref: sourceRef,
        details: { stage_ids: duplicateStageIds },
      }],
    };
  }
  return { entries, source_ref: sourceRef, diagnostics };
}
