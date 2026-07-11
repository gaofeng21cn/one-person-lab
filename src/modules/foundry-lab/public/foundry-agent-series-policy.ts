import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from '../../stagecraft/standard-stage-pack-identity.ts';

type JsonRecord = Record<string, unknown>;

export const FOUNDRY_AGENT_SERIES_CONTRACT_REF =
  'contracts/opl-framework/foundry-agent-series-contract.json';
export const STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF =
  'contracts/opl-framework/standard-domain-agent-skeleton-contract.json';

function contractRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
}

function readContract(ref: string): JsonRecord {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(contractRoot(), ref), 'utf8'));
  if (!isRecord(value)) throw new Error(`OPL Foundry policy contract must be a JSON object: ${ref}`);
  return value;
}

function requiredRecord(parent: JsonRecord, field: string, ref: string): JsonRecord {
  const value = parent[field];
  if (!isRecord(value)) throw new Error(`OPL Foundry policy contract missing ${ref}#/${field}`);
  return value;
}

function requiredStringArray(parent: JsonRecord, field: string, ref: string): string[] {
  const value = parent[field];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim())) {
    throw new Error(`OPL Foundry policy contract missing ${ref}#/${field}`);
  }
  return value;
}

export function canonicalFoundryAgentSeriesPolicy() {
  const series = readContract(FOUNDRY_AGENT_SERIES_CONTRACT_REF);
  const skeleton = readContract(STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF);
  const scaffold = requiredRecord(skeleton, 'new_agent_scaffold', STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF);
  const userStageLogContract = requiredRecord(
    scaffold,
    'user_stage_log_contract',
    STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
  );

  return structuredClone({
    series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    standard_domain_agent_skeleton_contract_ref: STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    shared_policy_release: requiredRecord(series, 'shared_policy_release', FOUNDRY_AGENT_SERIES_CONTRACT_REF),
    agent_membership_projection_policy: requiredRecord(
      series,
      'agent_membership_projection_policy',
      FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    ),
    standard_public_projection_policy: requiredRecord(
      series,
      'standard_public_projection_policy',
      FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    ),
    series_design_profile: requiredRecord(series, 'series_design_profile', FOUNDRY_AGENT_SERIES_CONTRACT_REF),
    workspace_topology_profile: requiredRecord(
      series,
      'workspace_topology_profile',
      FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    ),
    stage_pack_defaults: {
      stage_pack_conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
      default_stage_executor_binding_ref: DEFAULT_STAGE_EXECUTOR_BINDING_REF,
    },
    user_stage_log_required_fields: requiredStringArray(
      userStageLogContract,
      'required_domain_semantic_fields',
      STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    ),
    user_stage_log_contract: userStageLogContract,
    stage_progress_delta_policy: requiredRecord(
      scaffold,
      'progress_delta_policy',
      STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    ),
    typed_blocker_lineage_policy: requiredRecord(
      scaffold,
      'typed_blocker_lineage_policy',
      STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    ),
    stage_completion_policy: requiredRecord(
      scaffold,
      'stage_completion_policy',
      STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    ),
    forbidden_generic_owner_roles: requiredStringArray(
      scaffold,
      'forbidden_domain_generic_owner_roles',
      STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    ),
  });
}
