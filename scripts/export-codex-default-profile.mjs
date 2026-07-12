#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowSourcePrefix = 'gaofeng21cn/opl-flow:contracts/workflow-policy.json';

function parseCliOptions(argv) {
  const parsed = {
    workflowPolicy: null,
    out: path.join(repoRoot, 'contracts', 'opl-framework', 'codex-default-profile.json'),
  };

  parseRequiredValueOptions(argv, {
    '--workflow-policy': (value) => {
      parsed.workflowPolicy = path.resolve(value);
    },
    '--out': (value) => {
      parsed.out = path.resolve(value);
    },
  });

  if (!parsed.workflowPolicy) {
    throw new Error('--workflow-policy is required.');
  }
  return parsed;
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`App product profile is missing object ${field}.`);
  }
  return value;
}

function requiredString(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`App product profile is missing ${field}.`);
  }
  return normalized;
}

function assertEqual(actual, expected, field, expectedField) {
  if (actual !== expected) {
    throw new Error(`App product profile ${field} must match ${expectedField}.`);
  }
}

function buildProfile(workflowPolicy) {
  const root = record(workflowPolicy, 'root');
  assertEqual(
    requiredString(root.schema, 'schema'),
    'opl_flow_workflow_policy.v1',
    'schema',
    'opl_flow_workflow_policy.v1',
  );
  const packageProfile = record(root.package, 'package');
  assertEqual(
    requiredString(packageProfile.id, 'package.id'),
    'opl-flow',
    'package.id',
    'opl-flow',
  );
  const autoPolicy = record(root.codex_model_policy, 'codex_model_policy');
  const configuredDefault = record(
    autoPolicy?.configured_default,
    'codex_model_policy.configured_default',
  );
  const model = requiredString(
    configuredDefault.model,
    'codex_model_policy.configured_default.model',
  );
  const reasoningEffort = requiredString(
    configuredDefault.reasoning_effort,
    'codex_model_policy.configured_default.reasoning_effort',
  );
  const modelSource = `${workflowSourcePrefix}#codex_model_policy.configured_default.model`;
  const reasoningSource = `${workflowSourcePrefix}#codex_model_policy.configured_default.reasoning_effort`;

  return {
    surface_id: 'opl_codex_default_profile',
    version: 'g2',
    owner: 'one-person-lab',
    purpose: 'workflow_owned_codex_install_default_projection',
    state: 'generated_projection',
    machine_boundary: 'OPL Flow owns the recommendation; OPL Base writes config, the fresh Codex catalog resolves auto mode, and explicit user overrides remain highest priority.',
    generated_projection: {
      source_owner: 'opl-flow',
      source_repo: 'gaofeng21cn/opl-flow',
      source_ref: `${workflowSourcePrefix}#codex_model_policy`,
      source_field_refs: {
        model: modelSource,
        reasoning_effort: reasoningSource,
      },
      generator: 'scripts/export-codex-default-profile.mjs',
      generation_stage: 'development_or_release_sync',
      runtime_source_checkout_required: false,
    },
    model_provider: 'gflab',
    model,
    model_reasoning_effort: reasoningEffort,
    provider_name: 'gflab',
    base_url: 'https://gflabtoken.cn/v1',
    base_url_role: 'opl_base_default_provider_endpoint',
    model_profile_role: 'opl_flow_recommendation_projection',
  };
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const profile = buildProfile(readJsonFile(options.workflowPolicy));
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'completed',
    source: options.workflowPolicy,
    output: options.out,
    profile: {
      model_provider: profile.model_provider,
      model: profile.model,
      model_reasoning_effort: profile.model_reasoning_effort,
      base_url: profile.base_url,
      source_ref: profile.generated_projection.source_ref,
      api_key_present: false,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
