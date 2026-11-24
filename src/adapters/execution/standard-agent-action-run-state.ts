import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { fail } from './standard-agent-action-run-state/fields.ts';
import {
  ACTION_RUN_STATE_RELATIVE_ROOT,
  assertContained,
  ensureDirectory,
  fsyncDirectory,
  readCanonicalRecord,
  readStablePhysicalFile,
  stateDirectory,
  workspaceRoot,
  writeExactFile,
} from './standard-agent-action-run-state/physical-files.ts';
import { bindingRecord } from './standard-agent-action-run-state/binding.ts';
import { planRecord, assertPlanRuntimeIdentity } from './standard-agent-action-run-state/plan.ts';
import { completionRecord, assertCompletionMatchesRunState } from './standard-agent-action-run-state/completion.ts';
import type {
  StandardAgentActionRunBinding,
  StandardAgentActionRunPlan,
  StandardAgentActionRunCompletion,
} from './standard-agent-action-run-state/types.ts';

export type {
  StandardAgentActionRunBindingV1,
  StandardAgentActionRunBindingV2,
  StandardAgentActionRunBinding,
  StandardAgentActionRunPlan,
  StandardAgentCompletedHandlerReplay,
  StandardAgentActionRunCompletion,
} from './standard-agent-action-run-state/types.ts';

function readRunStateFromDirectory(root: string, directory: string, runId: string) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('Standard Agent action run state must be a physical directory.', { run_id: runId });
  }
  const binding = bindingRecord(readCanonicalRecord(path.join(directory, 'binding.json'), 'Action run binding'));
  if (binding.run_id !== runId) fail('Action run binding identity does not match its directory.', { run_id: runId });
  const planFile = path.join(directory, 'plan.json');
  if (binding.version === 'opl-standard-agent-action-run-binding.v1') {
    if (fs.existsSync(planFile)) {
      fail('Legacy Standard Agent action run binding cannot claim an unbound plan.', { run_id: runId });
    }
    return { binding, plan: null };
  }
  if (!fs.existsSync(planFile)) {
    fail('Standard Agent action run binding is missing its durable plan.', { run_id: runId });
  }
  const { bytes: planBytes } = readStablePhysicalFile(planFile, 'Action run plan');
  const planValue = parseJsonText(planBytes.toString('utf8'));
  if (!isRecord(planValue) || !planBytes.equals(canonicalJsonBytes(planValue))) {
    fail('Action run plan must contain one canonical JSON object.', { file: planFile });
  }
  const plan = planRecord(planValue);
  const actualPlanSha256 = crypto.createHash('sha256').update(planBytes).digest('hex');
  if (
    binding.plan_sha256 !== actualPlanSha256
    || binding.plan_byte_size !== planBytes.byteLength
    || plan.run_id !== binding.run_id
    || plan.canonical_domain_id !== binding.canonical_domain_id
    || plan.action_id !== binding.action_id
    || plan.hosted_runtime_binding_ref !== binding.hosted_runtime_binding_ref
    || plan.workspace_root !== root
  ) {
    fail('Standard Agent action run plan conflicts with its frozen binding.', {
      run_id: runId,
      expected_plan_sha256: binding.plan_sha256,
      actual_plan_sha256: actualPlanSha256,
      expected_plan_byte_size: binding.plan_byte_size,
      actual_plan_byte_size: planBytes.byteLength,
    });
  }
  assertPlanRuntimeIdentity(plan, binding);
  return { binding, plan };
}

export function inspectStandardAgentActionRunState(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  const realDirectory = fs.realpathSync.native(directory);
  assertContained(root, realDirectory);
  return readRunStateFromDirectory(root, realDirectory, input.runId);
}

export function inspectStandardAgentActionRunBinding(input: { workspaceRoot: string; runId: string }) {
  return inspectStandardAgentActionRunState(input)?.binding ?? null;
}

export function inspectStandardAgentActionRunPlan(input: { workspaceRoot: string; runId: string }) {
  return inspectStandardAgentActionRunState(input)?.plan ?? null;
}

export function reserveStandardAgentActionRunBinding(input: {
  workspaceRoot: string;
  binding: StandardAgentActionRunBinding;
  plan?: StandardAgentActionRunPlan;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const expected = bindingRecord(input.binding as unknown as Record<string, unknown>);
  const expectedPlan = input.plan
    ? planRecord(input.plan as unknown as Record<string, unknown>)
    : null;
  const planBytes = expectedPlan ? canonicalJsonBytes(expectedPlan) : null;
  if (
    (expected.version === 'opl-standard-agent-action-run-binding.v2' && (
      !expectedPlan
      || expected.plan_sha256 !== crypto.createHash('sha256').update(planBytes!).digest('hex')
      || expected.plan_byte_size !== planBytes!.byteLength
      || expectedPlan.run_id !== expected.run_id
      || expectedPlan.canonical_domain_id !== expected.canonical_domain_id
      || expectedPlan.action_id !== expected.action_id
      || expectedPlan.hosted_runtime_binding_ref !== expected.hosted_runtime_binding_ref
      || expectedPlan.workspace_root !== root
    ))
    || (expected.version === 'opl-standard-agent-action-run-binding.v1' && expectedPlan !== null)
  ) {
    fail('Standard Agent action run binding and durable plan are inconsistent.', {
      run_id: expected.run_id,
    });
  }
  if (expectedPlan) assertPlanRuntimeIdentity(expectedPlan, expected);
  const parent = ensureDirectory(root, ACTION_RUN_STATE_RELATIVE_ROOT.split('/'));
  const directory = stateDirectory(root, expected.run_id);
  if (fs.existsSync(directory)) {
    return {
      status: 'existing' as const,
      ...readRunStateFromDirectory(root, directory, expected.run_id),
    };
  }
  const staging = path.join(parent, `.${expected.run_id}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    writeExactFile(path.join(staging, 'binding.json'), canonicalJsonBytes(expected));
    if (planBytes) writeExactFile(path.join(staging, 'plan.json'), planBytes);
    fsyncDirectory(staging);
    try {
      fs.renameSync(staging, directory);
      fsyncDirectory(parent);
      return { status: 'reserved' as const, binding: expected, plan: expectedPlan };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'ENOTEMPTY'].includes(code ?? '') || !fs.existsSync(directory)) throw error;
      return {
        status: 'existing' as const,
        ...readRunStateFromDirectory(root, directory, expected.run_id),
      };
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function inspectStandardAgentActionRunCompletion(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  const state = readRunStateFromDirectory(root, directory, input.runId);
  const file = path.join(directory, 'completion.json');
  if (!fs.existsSync(file)) return null;
  const completion = completionRecord(readCanonicalRecord(file, 'Action run completion'));
  if (completion.run_id !== input.runId) fail('Action run completion identity does not match its directory.');
  assertCompletionMatchesRunState({ ...state, completion });
  return completion;
}

export function commitStandardAgentActionRunCompletion(input: {
  workspaceRoot: string;
  completion: StandardAgentActionRunCompletion;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const completion = completionRecord(input.completion as unknown as Record<string, unknown>);
  const directory = stateDirectory(root, completion.run_id);
  const { binding, plan } = readRunStateFromDirectory(root, directory, completion.run_id);
  assertCompletionMatchesRunState({ binding, plan, completion });
  const file = path.join(directory, 'completion.json');
  const bytes = canonicalJsonBytes(completion);
  if (fs.existsSync(file)) {
    const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
    if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
      fail('Action run completion conflicts with the existing run identity.', { run_id: completion.run_id });
    }
    return { status: 'already_completed' as const, completion: existing };
  }
  const staging = path.join(directory, `.completion.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    writeExactFile(staging, bytes);
    try {
      fs.linkSync(staging, file);
      fsyncDirectory(directory);
      return { status: 'completed' as const, completion };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !fs.existsSync(file)) throw error;
      const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
      if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
        fail('Action run completion conflicts with a concurrent writer.', { run_id: completion.run_id });
      }
      return { status: 'already_completed' as const, completion: existing };
    }
  } finally {
    fs.rmSync(staging, { force: true });
  }
}
