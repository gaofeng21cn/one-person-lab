import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { record, recordList, stringList, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';

export type StandardAgentActionStageRunCloseout = {
  stage_id: string;
  stage_attempt_ref: string;
  closeout_id: string;
  closeout_packet_ref: string;
  canonical_closeout_packet: JsonRecord;
  domain_output_packet: JsonRecord;
  domain_output_metadata: JsonRecord | null;
  readback_path: string;
};

export type StandardAgentActionStageRunProgress = {
  action_id: string;
  route: {
    entry_stage_ref: string;
    required_stage_refs: string[];
    optional_stage_refs: string[];
    terminal_stage_refs: string[];
    route_policy: 'ordered_stage_attempts_no_skip';
  };
  completed_stage_refs: string[];
  next_stage_ref: string | null;
  complete: boolean;
  stage_closeouts: StandardAgentActionStageRunCloseout[];
};

function invalid(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredString(value: unknown, field: string) {
  return stringValue(value) ?? invalid(`${field} must be a non-empty string.`, { field });
}

function requiredStrings(value: unknown, field: string) {
  const result = stringList(value);
  if (!Array.isArray(value) || result.length !== value.length || result.length === 0) {
    invalid(`${field} must be a non-empty string array.`, { field });
  }
  return result;
}

function readJson(filePath: string) {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(value) ? value : invalid(`JSON file must contain an object: ${filePath}`, { file: filePath });
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    invalid(`Unable to read JSON file: ${filePath}`, { file: filePath, cause: String(error) });
  }
}

function readRepoJson(repoDir: string, ref: string, label: string) {
  const resolved = resolveContainedRepoJsonFile(repoDir, ref, label, 'domain repo');
  return readJson(resolved.real_path);
}

function routeFromRepo(repoDir: string, actionId: string) {
  const catalog = readRepoJson(repoDir, 'contracts/action_catalog.json', 'family_action_catalog_ref');
  const targetDomainId = requiredString(catalog.target_domain_id, 'action_catalog.target_domain_id');
  const action = recordList(catalog.actions).find((entry) => entry.action_id === actionId);
  const rawRoute = record(action?.stage_route);
  if (!action || Object.keys(rawRoute).length === 0) {
    invalid(`Action ${actionId} is missing stage_route.`, { action_id: actionId });
  }
  const requiredStageRefs = requiredStrings(rawRoute.required_stage_refs, `${actionId}.stage_route.required_stage_refs`);
  const optionalStageRefs = stringList(rawRoute.optional_stage_refs);
  if (!Array.isArray(rawRoute.optional_stage_refs) || optionalStageRefs.length !== rawRoute.optional_stage_refs.length) {
    invalid(`${actionId}.stage_route.optional_stage_refs must be a string array.`);
  }
  const route = {
    entry_stage_ref: requiredString(rawRoute.entry_stage_ref, `${actionId}.stage_route.entry_stage_ref`),
    required_stage_refs: requiredStageRefs,
    optional_stage_refs: optionalStageRefs,
    terminal_stage_refs: requiredStrings(rawRoute.terminal_stage_refs, `${actionId}.stage_route.terminal_stage_refs`),
    route_policy: rawRoute.route_policy,
  };
  if (route.entry_stage_ref !== route.required_stage_refs[0]) {
    invalid(`${actionId}.stage_route.entry_stage_ref must equal required_stage_refs[0].`);
  }
  if (route.route_policy !== 'ordered_stage_attempts_no_skip') {
    invalid(`${actionId}.stage_route.route_policy must be ordered_stage_attempts_no_skip.`);
  }
  return {
    targetDomainId,
    route: { ...route, route_policy: 'ordered_stage_attempts_no_skip' as const },
  };
}

function stageGraph(repoDir: string) {
  const manifest = readRepoJson(repoDir, 'agent/stages/manifest.json', 'family_stage_control_plane_ref.source_ref');
  return new Map(recordList(manifest.stages).map((stage) => [
    requiredString(stage.stage_id, 'agent/stages/manifest.json stages[].stage_id'),
    stringList(stage.next_stage_refs),
  ]));
}

function canReach(from: string, to: string, allowed: Set<string>, graph: Map<string, string[]>) {
  if (from === to) return true;
  const pending = [from];
  const seen = new Set(pending);
  while (pending.length > 0) {
    for (const next of graph.get(pending.shift()!) ?? []) {
      if (!allowed.has(next) || seen.has(next)) continue;
      if (next === to) return true;
      seen.add(next);
      pending.push(next);
    }
  }
  return false;
}

function domainOutputPacket(input: {
  packet: JsonRecord;
  attempt: JsonRecord;
  targetDomainId: string;
  readbackPath: string;
}) {
  const output = record(input.packet.domain_output);
  if (Object.keys(output).length === 0) {
    return { packet: input.packet, metadata: null };
  }
  if (
    output.surface_kind !== 'domain_owned_stage_output_ref'
    || output.version !== 'domain-owned-stage-output-ref.v1'
  ) {
    invalid('StageRun domain_output uses an unsupported refs-only shape.');
  }
  if (requiredString(output.domain_id, 'closeout_packet.domain_output.domain_id') !== input.targetDomainId) {
    invalid('StageRun domain_output domain mismatch.');
  }
  const outputRef = requiredString(output.output_ref, 'closeout_packet.domain_output.output_ref');
  if (!stringList(input.packet.closeout_refs).includes(outputRef)) {
    invalid('StageRun domain_output ref is missing from closeout_refs.');
  }
  const metadata = recordList(input.packet.closeout_ref_metadata).find((entry) => entry.ref === outputRef) ?? null;
  if (!metadata) invalid('StageRun domain_output requires SHA-bound metadata.');
  const expectedSha = requiredString(metadata.sha256, 'closeout_ref_metadata.sha256');
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) invalid('StageRun domain_output metadata sha256 is invalid.');

  const workspaceRoot = requiredString(record(input.attempt.workspace_locator).workspace_root, 'attempt.workspace_locator.workspace_root');
  if (!path.isAbsolute(workspaceRoot)) invalid('StageRun workspace_root must be absolute.');
  let outputPath: string;
  try {
    const outputUrl = new URL(outputRef);
    if (outputUrl.protocol !== 'file:') invalid('StageRun domain_output currently requires a file URL.');
    outputPath = fileURLToPath(outputUrl);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    invalid('StageRun domain_output ref must be a valid file URL.');
  }
  const relativePath = path.relative(path.resolve(workspaceRoot), path.resolve(outputPath));
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    invalid('StageRun domain_output ref escapes workspace_root.');
  }
  const realRoot = fs.realpathSync(workspaceRoot);
  const realOutput = fs.realpathSync(outputPath);
  const realRelativePath = path.relative(realRoot, realOutput);
  if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    invalid('StageRun domain_output file resolves outside workspace_root.');
  }
  const actualSha = createHash('sha256').update(fs.readFileSync(realOutput)).digest('hex');
  if (actualSha !== expectedSha) invalid('StageRun domain_output sha256 mismatch.');
  return { packet: readJson(realOutput), metadata };
}

function closeoutFromReadback(
  readbackPath: string,
  targetDomainId: string,
): StandardAgentActionStageRunCloseout {
  const readback = readJson(readbackPath);
  const envelope = isRecord(readback.family_runtime_stage_attempt_query)
    ? readback.family_runtime_stage_attempt_query
    : readback;
  const query = record(envelope.stage_attempt_query);
  const attempt = record(query.attempt);
  if (Object.keys(query).length === 0 || Object.keys(attempt).length === 0) {
    invalid('OPL StageRun readback is missing stage_attempt_query.', { readback_path: readbackPath });
  }
  const stageId = requiredString(attempt.stage_id, 'attempt.stage_id');
  const attemptId = requiredString(attempt.stage_attempt_id, 'attempt.stage_attempt_id');
  if (requiredString(attempt.domain_id, 'attempt.domain_id') !== targetDomainId) {
    invalid(`OPL StageRun ${stageId} domain mismatch.`);
  }
  const attemptRef = requiredString(envelope.attempt_ref, 'attempt_ref');
  if (attemptRef !== `opl://stage_attempts/${attemptId}`) invalid(`OPL StageRun ${stageId} attempt_ref mismatch.`);
  if (attempt.status !== 'completed' || attempt.closeout_receipt_status !== 'accepted_typed_closeout') {
    invalid(`OPL StageRun ${stageId} closeout is not an accepted completed attempt.`);
  }
  if (query.canonical_outcome !== 'completed_with_receipt') {
    invalid(`OPL StageRun ${stageId} canonical outcome is not completed_with_receipt.`);
  }
  if (!Array.isArray(query.conflict_or_blocker_envelopes) || query.conflict_or_blocker_envelopes.length > 0) {
    invalid(`OPL StageRun ${stageId} query contains a conflict or malformed blocker envelope.`);
  }
  const latest = recordList(query.closeouts).at(-1);
  const packet = record(latest?.packet);
  if (!latest || Object.keys(packet).length === 0) invalid(`OPL StageRun ${stageId} has no typed closeout packet.`);
  const closeoutId = requiredString(latest.closeout_id, 'closeouts[].closeout_id');
  if (latest.stage_attempt_id !== attemptId) invalid(`OPL StageRun ${stageId} closeout ledger attempt mismatch.`);
  if (packet.surface_kind !== 'stage_attempt_closeout_packet') invalid(`OPL StageRun ${stageId} closeout packet kind mismatch.`);
  if (packet.stage_id !== undefined && packet.stage_id !== stageId) invalid(`OPL StageRun ${stageId} closeout stage mismatch.`);
  if (packet.stage_attempt_id !== undefined && packet.stage_attempt_id !== attemptId) invalid(`OPL StageRun ${stageId} closeout attempt mismatch.`);
  if (packet.closeout_id !== undefined && packet.closeout_id !== closeoutId) invalid(`OPL StageRun ${stageId} closeout id mismatch.`);
  if (Array.isArray(packet.rejected_writes) && packet.rejected_writes.length > 0) {
    invalid(`OPL StageRun ${stageId} closeout contains rejected writes.`);
  }
  if (!Array.isArray(packet.closeout_refs)) invalid(`OPL StageRun ${stageId} closeout_refs must be an array.`);
  const domainOutput = domainOutputPacket({ packet, attempt, targetDomainId, readbackPath });
  return {
    stage_id: stageId,
    stage_attempt_ref: attemptRef,
    closeout_id: closeoutId,
    closeout_packet_ref: `${attemptRef}/closeouts/${encodeURIComponent(closeoutId)}`,
    canonical_closeout_packet: packet,
    domain_output_packet: domainOutput.packet,
    domain_output_metadata: domainOutput.metadata,
    readback_path: readbackPath,
  };
}

export function evaluateStandardAgentActionStageRun(input: {
  repoDir: string;
  actionId: string;
  stageRunReadbackPaths: string[];
}): StandardAgentActionStageRunProgress {
  const repoDir = path.resolve(input.repoDir);
  const { targetDomainId, route } = routeFromRepo(repoDir, input.actionId);
  const graph = stageGraph(repoDir);
  const allowed = new Set([...route.required_stage_refs, ...route.optional_stage_refs]);
  const stageCloseouts = input.stageRunReadbackPaths.map((file) => closeoutFromReadback(path.resolve(file), targetDomainId));
  const completed = stageCloseouts.map((entry) => entry.stage_id);
  if (new Set(completed).size !== completed.length) invalid(`${input.actionId}: duplicate StageRun closeout in route evidence.`);
  const unknown = completed.filter((stageId) => !allowed.has(stageId));
  if (unknown.length > 0) invalid(`${input.actionId}: StageRun closeout is outside stage_route: ${unknown.join(', ')}.`);
  if (completed.length > 0 && completed[0] !== route.entry_stage_ref) {
    invalid(`${input.actionId}: route skip rejected; first closeout must be ${route.entry_stage_ref}.`);
  }
  for (let index = 1; index < completed.length; index += 1) {
    if (!canReach(completed[index - 1]!, completed[index]!, allowed, graph)) {
      invalid(`${input.actionId}: StageRun closeout order is unreachable: ${completed[index - 1]} -> ${completed[index]}.`);
    }
  }
  const completedRequired = completed.filter((stageId) => route.required_stage_refs.includes(stageId));
  completedRequired.forEach((stageId, index) => {
    if (stageId !== route.required_stage_refs[index]) {
      invalid(`${input.actionId}: route skip rejected; expected ${route.required_stage_refs[index]} before ${stageId}.`);
    }
  });
  const nextStageRef = route.required_stage_refs[completedRequired.length] ?? null;
  const complete = nextStageRef === null;
  if (complete && !route.terminal_stage_refs.includes(completed.at(-1) ?? '')) {
    invalid(`${input.actionId}: complete route must end at a declared terminal stage.`);
  }
  for (let index = 1; index < stageCloseouts.length; index += 1) {
    const previous = stageCloseouts[index - 1]!;
    const current = stageCloseouts[index]!;
    if (!stringList(current.canonical_closeout_packet.consumed_refs).includes(previous.closeout_packet_ref)) {
      invalid(`${input.actionId}: StageRun ${current.stage_id} must consume preceding accepted closeout ref ${previous.closeout_packet_ref}.`);
    }
  }
  return {
    action_id: input.actionId,
    route,
    completed_stage_refs: completed,
    next_stage_ref: nextStageRef,
    complete,
    stage_closeouts: stageCloseouts,
  };
}
