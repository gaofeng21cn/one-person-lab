import { preflightGitCheckoutCurrentness } from './family-runtime-domain-handler-process.ts';

type JsonRecord = Record<string, unknown>;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizedDomainId(value: unknown) {
  const raw = optionalString(value);
  const normalized = raw?.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'mas' || normalized === 'medautoscience' ? 'medautoscience' : raw;
}

export function preflightMasWorkspaceCheckoutCurrentness(input: {
  domainId?: unknown;
  workspaceLocator?: JsonRecord | null;
}) {
  const locator = input.workspaceLocator ?? {};
  const domainId = normalizedDomainId(input.domainId) ?? normalizedDomainId(locator.domain_id);
  if (domainId !== 'medautoscience') {
    return null;
  }
  const workspaceRoot = optionalString(locator.workspace_root) ?? optionalString(locator.repo_root);
  if (!workspaceRoot) {
    return null;
  }
  return preflightGitCheckoutCurrentness(workspaceRoot);
}
