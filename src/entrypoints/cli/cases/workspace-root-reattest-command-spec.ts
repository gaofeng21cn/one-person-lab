import fs from 'node:fs';

import { reattestWorkItemRootIdentity, requireWorkItemRootIdentity } from '../../../authority/workspace/work-item-file-boundary.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseRegisteredCommandOptions, type CommandSpec } from '../modules/support.ts';

export function buildWorkspaceRootReattestCommandSpec(): CommandSpec {
  const spec: CommandSpec = {
    usage: 'opl workspace root reattest --input <request.json> [--apply --confirm-same-volume-and-directory]',
    summary: 'Preview or explicitly attest one legacy root for the current boot without rewriting historical artifacts.',
    examples: ['opl workspace root reattest --input /tmp/root-identity-request.json --json'],
    handler: (args) => {
      const parsed = parseRegisteredCommandOptions('workspace root reattest', args, spec);
      const request: unknown = JSON.parse(fs.readFileSync(parsed.input as string, 'utf8'));
      const keys = ['workspace_root', 'canonical_work_item_root', 'original_root_identity',
        'current_root_identity', 'operator', 'evidence_ref'];
      if (!isRecord(request) || Object.keys(request).some(key => !keys.includes(key))
        || typeof request.workspace_root !== 'string' || !request.workspace_root.trim()
        || typeof request.canonical_work_item_root !== 'string' || !request.canonical_work_item_root.trim()
        || (request.operator !== undefined && typeof request.operator !== 'string')
        || (request.evidence_ref !== undefined && typeof request.evidence_ref !== 'string')) {
        throw new FrameworkContractError('contract_shape_invalid', 'Root re-attestation request has invalid fields.');
      }
      return reattestWorkItemRootIdentity({
        workspaceRoot: request.workspace_root,
        canonicalWorkItemRoot: request.canonical_work_item_root,
        expectedRootIdentity: requireWorkItemRootIdentity(request.original_root_identity),
        expectedCurrentRootIdentity: request.current_root_identity === undefined
          ? undefined : requireWorkItemRootIdentity(request.current_root_identity),
        operator: request.operator as string | undefined,
        evidenceRef: request.evidence_ref as string | undefined,
        apply: parsed.apply === true,
        confirm: parsed['confirm-same-volume-and-directory'] === true,
      });
    },
  };
  return spec;
}
