#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSourcePrefix = 'gaofeng21cn/one-person-lab-app:contracts/app-product-profile.json';

function parseCliOptions(argv) {
  const parsed = {
    appProductProfile: null,
    out: path.join(repoRoot, 'contracts', 'opl-framework', 'codex-default-profile.json'),
  };

  parseRequiredValueOptions(argv, {
    '--app-product-profile': (value) => {
      parsed.appProductProfile = path.resolve(value);
    },
    '--out': (value) => {
      parsed.out = path.resolve(value);
    },
  });

  if (!parsed.appProductProfile) {
    throw new Error('--app-product-profile is required.');
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

function buildProfile(appProfile) {
  const root = record(appProfile, 'root');
  assertEqual(
    requiredString(root.owner, 'owner'),
    'one-person-lab-app',
    'owner',
    'one-person-lab-app',
  );
  assertEqual(
    requiredString(root.purpose, 'purpose'),
    'app_owned_product_profile',
    'purpose',
    'app_owned_product_profile',
  );
  const session = record(root.default_session_profile, 'default_session_profile');
  const codex = record(root.codex, 'codex');
  const autoPolicy = codex.auto_model_policy == null
    ? null
    : record(codex.auto_model_policy, 'codex.auto_model_policy');
  const configuredDefault = record(
    autoPolicy?.configured_default,
    'codex.auto_model_policy.configured_default',
  );
  const fallback = autoPolicy?.catalog_unavailable_fallback == null
    ? null
    : record(
      autoPolicy.catalog_unavailable_fallback,
      'codex.auto_model_policy.catalog_unavailable_fallback',
    );
  const defaultModel = requiredString(codex.default_model, 'codex.default_model');
  const defaultReasoningEffort = requiredString(
    codex.default_reasoning_effort,
    'codex.default_reasoning_effort',
  );
  const model = requiredString(
    configuredDefault.model,
    'codex.auto_model_policy.configured_default.model',
  );
  const reasoningEffort = requiredString(
    configuredDefault.reasoning_effort,
    'codex.auto_model_policy.configured_default.reasoning_effort',
  );
  const provider = requiredString(session.provider, 'default_session_profile.provider');
  const baseUrl = requiredString(session.base_url, 'default_session_profile.base_url');

  assertEqual(model, defaultModel, 'fallback model', 'codex.default_model');
  assertEqual(reasoningEffort, defaultReasoningEffort, 'fallback reasoning effort', 'codex.default_reasoning_effort');
  assertEqual(
    requiredString(fallback?.model, 'codex.auto_model_policy.catalog_unavailable_fallback.model'),
    model,
    'catalog fallback model',
    'configured default model',
  );
  assertEqual(
    requiredString(fallback?.reasoning_effort, 'codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort'),
    reasoningEffort,
    'catalog fallback reasoning effort',
    'configured default reasoning effort',
  );
  assertEqual(
    requiredString(session.model, 'default_session_profile.model'),
    model,
    'default_session_profile.model',
    'Codex fallback model',
  );
  assertEqual(
    requiredString(session.reasoning_effort, 'default_session_profile.reasoning_effort'),
    reasoningEffort,
    'default_session_profile.reasoning_effort',
    'Codex fallback reasoning effort',
  );

  const modelSource = `${appSourcePrefix}#codex.auto_model_policy.configured_default.model`;
  const reasoningSource = `${appSourcePrefix}#codex.auto_model_policy.configured_default.reasoning_effort`;

  return {
    surface_id: 'opl_codex_default_profile',
    version: 'g2',
    owner: 'one-person-lab',
    purpose: 'app_owned_codex_install_default_projection',
    state: 'generated_projection',
    machine_boundary: 'Bundled install fallback only; App auto mode and Codex CLI model catalog remain the runtime selection owners.',
    generated_projection: {
      source_owner: 'one-person-lab-app',
      source_repo: 'gaofeng21cn/one-person-lab-app',
      source_ref: `${appSourcePrefix}#${autoPolicy ? 'codex.auto_model_policy' : 'codex'}`,
      source_field_refs: {
        model: modelSource,
        model_consistency: `${appSourcePrefix}#codex.default_model`,
        reasoning_effort: reasoningSource,
        reasoning_effort_consistency: `${appSourcePrefix}#codex.default_reasoning_effort`,
        session_model_consistency: `${appSourcePrefix}#default_session_profile.model`,
        session_reasoning_effort_consistency: `${appSourcePrefix}#default_session_profile.reasoning_effort`,
        provider: `${appSourcePrefix}#default_session_profile.provider`,
        base_url: `${appSourcePrefix}#default_session_profile.base_url`,
      },
      generator: 'scripts/export-codex-default-profile.mjs',
      generation_stage: 'development_or_release_sync',
      runtime_source_checkout_required: false,
    },
    model_provider: provider,
    model,
    model_reasoning_effort: reasoningEffort,
    provider_name: provider,
    base_url: baseUrl,
    base_url_role: 'product_default_provider_endpoint',
    model_profile_role: 'app_catalog_unavailable_fallback_projection',
  };
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const profile = buildProfile(readJsonFile(options.appProductProfile));
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'completed',
    source: options.appProductProfile,
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
