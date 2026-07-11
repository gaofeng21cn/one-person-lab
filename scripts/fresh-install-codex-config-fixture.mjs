export function renderCodexConfigFixture(profile) {
  return [
    `model_provider = ${JSON.stringify(profile.model_provider)}`,
    `model = ${JSON.stringify(profile.model)}`,
    `model_reasoning_effort = ${JSON.stringify(profile.model_reasoning_effort)}`,
    '',
    `[model_providers.${profile.model_provider}]`,
    `name = ${JSON.stringify(profile.provider_name)}`,
    `base_url = ${JSON.stringify(profile.base_url)}`,
    'experimental_bearer_token = "test-fresh-install-key"',
    '',
  ].join('\n');
}
