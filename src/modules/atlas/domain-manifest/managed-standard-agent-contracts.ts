import fs from 'node:fs';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  normalizeFamilyActionCatalog,
  type FamilyActionCatalog,
} from '../../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveContainedRepoJsonFile } from '../../../kernel/repo-contained-json-file.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import { compileStandardAgentStageManifest } from '../../pack/index.ts';

export const STANDARD_AGENT_ACTION_CATALOG_REF = 'contracts/action_catalog.json';
export const STANDARD_AGENT_STAGE_CATALOG_REF = 'agent/stages/manifest.json';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'standard_agent_managed_contract_catalog_invalid',
  });
}

function readActionCatalog(checkoutRoot: string): FamilyActionCatalog {
  const resolved = resolveContainedRepoJsonFile(
    checkoutRoot,
    STANDARD_AGENT_ACTION_CATALOG_REF,
    'Standard Agent action catalog',
    'OPL selected managed source checkout',
  );
  const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
  if (!isRecord(parsed)) {
    fail('Standard Agent action catalog must contain a JSON object.', {
      checkout_root: checkoutRoot,
      catalog_ref: STANDARD_AGENT_ACTION_CATALOG_REF,
    });
  }
  const catalog = normalizeFamilyActionCatalog(parsed);
  if (!catalog) {
    fail('Standard Agent managed source does not expose a family action catalog.', {
      checkout_root: checkoutRoot,
      catalog_ref: STANDARD_AGENT_ACTION_CATALOG_REF,
    });
  }
  return catalog;
}

function assertMatchingAgentIdentity(input: {
  requestedDomainId: string;
  checkoutAgentId: string;
  catalogTargetDomainId: string;
  stageTargetDomainId: string;
}) {
  const requested = resolveStandardAgent(input.requestedDomainId);
  const checkout = resolveStandardAgent(input.checkoutAgentId);
  const catalog = resolveStandardAgent(input.catalogTargetDomainId);
  const stage = resolveStandardAgent(input.stageTargetDomainId);
  if (
    !requested
    || requested.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP
    || !checkout
    || !catalog
    || !stage
    || requested.agent_id !== checkout.agent_id
    || requested.agent_id !== catalog.agent_id
    || requested.agent_id !== stage.agent_id
  ) {
    fail('Standard Agent managed action and Stage contracts do not match the selected package identity.', {
      requested_domain_id: input.requestedDomainId,
      checkout_agent_id: input.checkoutAgentId,
      catalog_target_domain_id: input.catalogTargetDomainId,
      stage_target_domain_id: input.stageTargetDomainId,
    });
  }
  return requested;
}

export function loadManagedStandardAgentContractCatalog(input: {
  requested_domain_id: string;
  checkout_agent_id: string;
  checkout_path: string;
}) {
  const catalog = readActionCatalog(input.checkout_path);
  const stageCompilation = compileStandardAgentStageManifest(input.checkout_path);
  const agent = assertMatchingAgentIdentity({
    requestedDomainId: input.requested_domain_id,
    checkoutAgentId: input.checkout_agent_id,
    catalogTargetDomainId: catalog.target_domain_id,
    stageTargetDomainId: stageCompilation.stage_control_plane.target_domain_id,
  });

  return {
    agent,
    catalog,
    stage_control_plane: stageCompilation.stage_control_plane,
    source_binding: stageCompilation.source_binding,
    action_catalog_ref: STANDARD_AGENT_ACTION_CATALOG_REF,
    stage_catalog_ref: STANDARD_AGENT_STAGE_CATALOG_REF,
    authority_boundary: {
      source_owner: 'domain_agent_managed_checkout',
      discovery_owner: 'opl_atlas',
      projection_owner: 'opl_console',
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
      opl_can_claim_domain_ready: false,
      opl_can_claim_quality_or_export_ready: false,
    },
  };
}
