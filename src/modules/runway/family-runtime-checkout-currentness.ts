import { isRecord } from '../../kernel/contract-validation.ts';
import {
  resolveDomainOwnerAnswerProjectionProfiles,
  type DomainOwnerAnswerProjectionProfile,
} from '../../kernel/domain-owner-answer-projection-profile.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import type { StandardDomainAgentRepoInput } from '../../kernel/standard-domain-agent-family-repos.ts';
import { preflightGitCheckoutCurrentness } from './family-runtime-domain-handler-process.ts';

export function preflightDomainWorkspaceCheckoutCurrentness(input: {
  domainId?: unknown;
  workspaceLocator?: JsonRecord | null;
  profiles?: readonly DomainOwnerAnswerProjectionProfile[];
  repoInputs?: readonly StandardDomainAgentRepoInput[];
}) {
  const locator = input.workspaceLocator ?? {};
  const domainId = optionalString(input.domainId) ?? optionalString(locator.domain_id);
  if (!domainId) {
    return null;
  }
  const profile = (input.profiles ?? resolveDomainOwnerAnswerProjectionProfiles(input.repoInputs))
    .find((entry) => entry.domainId === domainId);
  if (!profile?.checkoutCurrentnessRequired) {
    return null;
  }
  const workspaceRoot = optionalString(locator.workspace_root) ?? optionalString(locator.repo_root);
  if (!workspaceRoot) {
    return null;
  }
  return preflightGitCheckoutCurrentness(workspaceRoot);
}
