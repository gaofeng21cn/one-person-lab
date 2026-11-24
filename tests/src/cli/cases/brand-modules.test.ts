import fs from 'node:fs';
import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { assert, loadFrameworkContracts, repoRoot, runCliInProcess, test } from '../helpers.ts';
import './brand-modules-cases/agent-and-foundry-surfaces.ts';
import './brand-modules-cases/l5-evidence-gate.ts';
import './brand-modules-cases/module-command-surfaces.ts';
import './brand-modules-cases/runway-control-loop.ts';
import { expectedModuleIds } from './brand-modules-cases/shared.ts';

type FamilyCapabilityPortfolio = {
  version: string;
  portfolio: {
    portfolio_id: string;
    cardinality_policy: string;
    framework_projection_ref: string;
    framework_source_topology_ref: string;
  };
  display_groups: Array<{ group_id: string; order: number }>;
  domains: Array<{
    domain_id: string;
    brand_name: string;
    display: { short_name: string; group_id: string; order: number; tagline: string };
    name_assessment: { verdict: string; rationale: string };
    contributions: Array<{ host: string; owner: string }>;
  }>;
  rules: {
    portfolio_is_brand_ssot: boolean;
    framework_registry_is_projection: boolean;
    brand_tracks_real_capability_boundary: boolean;
  };
};

type FrameworkBrandProjection = {
  version: string;
  scope: string;
  portfolio_ref: string;
  projection_kind: string;
  modules: Array<{ module_id: string; portfolio_domain_id: string; brand_name: string }>;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('family capability portfolio is the schema-valid brand SSOT', () => {
  const portfolio = readJson<FamilyCapabilityPortfolio>(
    'contracts/opl-framework/family-capability-domain-registry.json',
  );
  const schema = readJson<Record<string, unknown>>(
    'contracts/opl-framework/family-capability-domain-registry.schema.json',
  );
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

  assert.equal(validate(portfolio), true, JSON.stringify(validate.errors));
  assert.equal(portfolio.version, 'family-capability-domain-registry.v2');
  assert.equal(portfolio.portfolio.portfolio_id, 'opl-family-capability-portfolio');
  assert.equal(portfolio.portfolio.cardinality_policy, 'evidence_driven_not_fixed');
  assert.equal(portfolio.rules.portfolio_is_brand_ssot, true);
  assert.equal(portfolio.rules.framework_registry_is_projection, true);
  assert.equal(portfolio.rules.brand_tracks_real_capability_boundary, true);
  assert.equal(
    portfolio.portfolio.framework_source_topology_ref,
    'contracts/opl-framework/source-module-map.json',
  );

  const groupIds = new Set(portfolio.display_groups.map((group) => group.group_id));
  const groupOrders = portfolio.display_groups.map((group) => group.order);
  const domainOrders = portfolio.domains.map((domain) => domain.display.order);

  assert.equal(new Set(groupOrders).size, portfolio.display_groups.length);
  assert.deepEqual(groupOrders, [...groupOrders].sort((left, right) => left - right));
  assert.equal(new Set(portfolio.domains.map((domain) => domain.domain_id)).size, portfolio.domains.length);
  assert.equal(new Set(portfolio.domains.map((domain) => domain.brand_name)).size, portfolio.domains.length);
  assert.equal(new Set(portfolio.domains.map((domain) => domain.display.short_name)).size, portfolio.domains.length);
  assert.equal(new Set(domainOrders).size, portfolio.domains.length);
  assert.deepEqual(domainOrders, [...domainOrders].sort((left, right) => left - right));
  assert.equal(
    portfolio.domains.every((domain) => groupIds.has(domain.display.group_id)),
    true,
  );
});

test('Framework brand module registry is an exact surface projection of the family portfolio', () => {
  const portfolio = readJson<FamilyCapabilityPortfolio>(
    'contracts/opl-framework/family-capability-domain-registry.json',
  );
  const projection = readJson<FrameworkBrandProjection>(
    'contracts/opl-framework/brand-module-registry.json',
  );
  const frameworkDomainIds = portfolio.domains
    .filter((domain) => domain.contributions.some(
      (contribution) => contribution.host === 'framework-host' && contribution.owner === 'opl-framework',
    ))
    .map((domain) => domain.domain_id)
    .sort();

  assert.equal(projection.version, 'brand-modules.v2');
  assert.equal(projection.scope, 'opl_framework_brand_surface_projection');
  assert.equal(
    projection.portfolio_ref,
    'contracts/opl-framework/family-capability-domain-registry.json',
  );
  assert.equal(
    portfolio.portfolio.framework_projection_ref,
    'contracts/opl-framework/brand-module-registry.json',
  );
  assert.equal(projection.projection_kind, 'framework_cli_l4_l5_surfaces');
  assert.deepEqual(
    projection.modules.map((module) => module.portfolio_domain_id).sort(),
    frameworkDomainIds,
  );

  const portfolioById = new Map(portfolio.domains.map((domain) => [domain.domain_id, domain]));
  for (const module of projection.modules) {
    assert.equal(module.brand_name, portfolioById.get(module.portfolio_domain_id)?.brand_name);
  }
});

test('brand module contracts and CLI expose the same current module set', async () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const list = (await runCliInProcess(['brand-modules', 'list'])).brand_modules;
  const validation = (await runCliInProcess(['brand-modules', 'validate'])).brand_module_validation;

  assert.deepEqual(contracts.brandModuleRegistry.modules.map((entry) => entry.module_id), expectedModuleIds);
  assert.deepEqual(list.modules.map((entry: { module_id: string }) => entry.module_id), expectedModuleIds);
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.authority_boundary_violations, []);
});

test('brand module inspect keeps OPL as refs-only framework authority', async () => {
  const module = (await runCliInProcess(['brand-modules', 'inspect', '--module', 'workspace'])).brand_module;

  assert.equal(module.module_id, 'workspace');
  assert.equal(module.maturity_level, 'L4_structural_baseline');
  assert.equal(module.authority_boundary.can_claim_domain_ready, false);
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_sign_owner_receipt, false);
});
