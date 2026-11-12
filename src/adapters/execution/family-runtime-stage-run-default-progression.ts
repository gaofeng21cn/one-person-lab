import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { normalizeFamilyActionCatalog } from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveStandardAgentRepoFile } from '../../authority/packages/index.ts';
import { observeStableFile } from './family-runtime-stage-run-identity-parts/content-binding-observation.ts';

export type StageRunDefaultProgression = {
  decision_kind: 'advance' | 'complete';
  target_stage_id?: string;
  source_ref: string;
  source_sha256: string;
};

function invalid(message: string): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'stage_run_default_progression_identity_invalid',
  });
}

function readDeclaration(root: string, ref: string) {
  const filePath = resolveStandardAgentRepoFile(root, ref, 'Stage default progression declaration');
  const observed = observeStableFile({ filePath, ref, captureBytes: true, maxBytes: 1024 * 1024 });
  const value: unknown = parseJsonText(observed.bytes!.toString('utf8'));
  if (!isRecord(value)) invalid('Stage default progression declaration must contain a JSON object.');
  return { value, sha256: observed.sha256 };
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) return null;
  const entries = value as string[];
  return new Set(entries).size === entries.length ? entries : null;
}

/** Resolve only an explicit pack default. Neither catalog nor manifest file order is a route. */
export function resolveStageRunDefaultProgression(input: {
  domainPackRoot: string;
  domainId: string;
  stageId: string;
  actionId?: string | null;
  manifestRef: string;
  manifestSha256: string;
  declaredStageIds: string[];
}): StageRunDefaultProgression | null {
  const manifest = readDeclaration(input.domainPackRoot, input.manifestRef);
  const expectedDigest = input.manifestSha256.replace(/^sha256:/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedDigest) || manifest.sha256 !== `sha256:${expectedDigest}`) {
    invalid('Stage default progression manifest does not match the execution content binding.');
  }
  if (
    manifest.value.surface_kind !== 'opl_standard_agent_declarative_stage_manifest'
    || manifest.value.version !== 'opl-standard-agent-declarative-stage-manifest.v1'
    || manifest.value.target_domain_id !== input.domainId
    || manifest.value.owner !== input.domainId
    || !Array.isArray(manifest.value.stages)
    || manifest.value.stages.some((entry) => !isRecord(entry))
  ) invalid('Stage default progression manifest identity is invalid.');
  const stages = manifest.value.stages as Record<string, unknown>[];
  const manifestIds = strings(stages.map((stage) => stage.stage_id));
  const declaredIds = strings(input.declaredStageIds);
  if (!manifestIds || !declaredIds
    || JSON.stringify([...manifestIds].sort()) !== JSON.stringify([...declaredIds].sort())) {
    invalid('Stage default progression catalog does not match the execution content binding.');
  }
  const currentStage = stages.find((stage) => stage.stage_id === input.stageId);
  if (!currentStage) return null;

  const catalogRef = 'contracts/action_catalog.json';
  if (input.actionId && fs.existsSync(path.join(input.domainPackRoot, catalogRef))) {
    const declaration = readDeclaration(input.domainPackRoot, catalogRef);
    const catalog = normalizeFamilyActionCatalog(declaration.value);
    if (!catalog || catalog.target_domain_id !== input.domainId) {
      invalid('Stage default progression action catalog target does not match the execution domain.');
    }
    const action = catalog.actions.find((entry) => entry.action_id === input.actionId);
    if (!action) return null;
    const route = action.stage_route;
    if (route) {
      if (action.execution_binding.kind !== 'stage_binding'
        || action.execution_binding.stage_manifest_ref !== input.manifestRef) return null;
      if ([...route.required_stage_refs, ...route.optional_stage_refs]
        .some((stageId) => !declaredIds.includes(stageId))) {
        invalid('Stage default progression action route references an undeclared Stage.');
      }
      const currentIndex = route.required_stage_refs.indexOf(input.stageId);
      if (currentIndex < 0) return null;
      const target = route.required_stage_refs[currentIndex + 1];
      const source = {
        source_ref: `${catalogRef}#action=${encodeURIComponent(input.actionId)}`,
        source_sha256: declaration.sha256,
      };
      if (target) return { decision_kind: 'advance', target_stage_id: target, ...source };
      return route.terminal_stage_refs.includes(input.stageId)
        ? { decision_kind: 'complete', ...source }
        : null;
    }
  }

  const nextStages = strings(currentStage.next_stage_refs);
  if (!nextStages || nextStages.length !== 1) return null;
  if (!declaredIds.includes(nextStages[0]!)) {
    invalid('Stage default progression successor is not declared by the execution content binding.');
  }
  return {
    decision_kind: 'advance',
    target_stage_id: nextStages[0]!,
    source_ref: `${input.manifestRef}#stage=${encodeURIComponent(input.stageId)}`,
    source_sha256: manifest.sha256,
  };
}
