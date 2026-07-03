import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import { preflightGitCheckoutCurrentness } from './family-runtime-domain-handler-process.ts';

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
