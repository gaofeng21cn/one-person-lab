import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../../kernel/json-file.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageRuntimeDiscoveryOptions } from '../agent-package-registry-parts/installed-runtime-module.ts';

export type ReferenceVerificationInput = {
  referencesFile?: string;
  references?: unknown[];
  providers: string[];
  cacheRoot?: string;
  maxRetries: number;
  timeoutMs?: number;
  installedPackage?: InstalledPackageRuntimeDiscoveryOptions;
};

export type ReferenceRecord = {
  id: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  title: string | null;
};

export type ResolvedReferenceInput = {
  references: ReferenceRecord[];
  sourceKind: 'inline_references' | 'references_file';
  referencesFile: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeDoi(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim()
    .toLowerCase() || null;
}

export function normalizePmcid(value: string | null) {
  const normalized = value?.trim().toUpperCase() || null;
  if (!normalized) return null;
  return normalized.startsWith('PMC') ? normalized : `PMC${normalized}`;
}

export function loadReferencesFile(filePath: string): ReferenceRecord[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new FrameworkContractError('codex_command_failed', 'Reference verification requires an existing --references-file.', {
      references_file: resolved,
    });
  }
  const parsed = parseJsonText(fs.readFileSync(resolved, 'utf8')) as unknown;
  const rawReferences = Array.isArray(parsed) ? parsed : asRecord(parsed).references;
  if (!Array.isArray(rawReferences)) {
    throw new FrameworkContractError('codex_command_failed', 'References file must be an array or an object with a references array.', {
      references_file: resolved,
    });
  }
  return rawReferences.map((entry, index) => normalizeReference(entry, index));
}

export function resolveReferences(input: ReferenceVerificationInput): ResolvedReferenceInput {
  const hasFile = typeof input.referencesFile === 'string' && input.referencesFile.trim().length > 0;
  const hasInline = Array.isArray(input.references);
  if (hasFile === hasInline) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference verification requires exactly one references file or inline references array.',
      { input_modes: ['references_file', 'inline_references'] },
    );
  }
  if (hasInline) {
    return {
      references: input.references!.map((entry, index) => normalizeReference(entry, index)),
      sourceKind: 'inline_references' as const,
      referencesFile: null,
    };
  }
  const referencesFile = path.resolve(input.referencesFile!);
  return {
    references: loadReferencesFile(referencesFile),
    sourceKind: 'references_file' as const,
    referencesFile,
  };
}

export function normalizeReference(value: unknown, index: number): ReferenceRecord {
  const record = asRecord(value);
  const doi = normalizeDoi(asString(record.doi) ?? asString(record.DOI));
  const pmid = asString(record.pmid) ?? asString(record.PMID) ?? asString(record.PubMed);
  const pmcid = normalizePmcid(
    asString(record.pmcid) ?? asString(record.PMCID) ?? asString(record.PMC),
  );
  const title = asString(record.title);
  const fallbackId = crypto.createHash('sha256').update(JSON.stringify({ doi, pmid, pmcid, title, index })).digest('hex').slice(0, 12);
  return {
    id: asString(record.id) ?? asString(record.reference_id) ?? fallbackId,
    doi,
    pmid,
    pmcid,
    title,
  };
}
