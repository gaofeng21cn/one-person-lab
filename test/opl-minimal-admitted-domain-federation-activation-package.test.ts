import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Json {
  return JSON.parse(read(relativePath)) as Json;
}

test('minimal admitted-domain federation activation package is frozen as an active contract-first tranche for admitted domains only', () => {
  const pkg = readJson('contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json');
  const surfaceIndex = readJson('contracts/opl-gateway/public-surface-index.json');
  const acceptanceMatrix = readJson('contracts/opl-gateway/acceptance-matrix.json');
  const doc = read('docs/references/opl-minimal-admitted-domain-federation-activation-package.md');
  const docZh = read('docs/references/opl-minimal-admitted-domain-federation-activation-package.zh-CN.md');

  assert.equal(pkg.package_id, 'opl_minimal_admitted_domain_federation_activation_package');
  assert.equal(pkg.phase, 'phase_2_minimal_admitted_domain_federation_activation');
  assert.equal(pkg.package_status, 'activated');
  assert.equal(pkg.formal_entry.entry_surface, 'TypeScript CLI-first / read-only gateway surface');
  assert.equal(pkg.formal_entry.runtime_owner, false);
  assert.equal(pkg.formal_entry.mutation_entry, false);
  assert.equal(pkg.formal_entry.run_launch, false);
  assert.equal(pkg.formal_entry.workspace_write, false);
  assert.equal(pkg.formal_entry.shared_execution_core, false);
  assert.equal(pkg.formal_entry.managed_web_runtime, false);

  assert.deepEqual(
    pkg.activated_domain_surfaces.map((entry: Json) => [entry.workstream_id, entry.domain_id]),
    [
      ['research_ops', 'medautoscience'],
      ['presentation_ops', 'redcube'],
    ],
  );

  assert.equal(pkg.activation_basis.previous_phase_exit.package_id, 'opl_phase_1_exit_activation_package');
  assert.equal(pkg.activation_basis.threshold_reassessment.two_admitted_domain_surfaces_stable_enough_for_stronger_federation.status, 'met');
  assert.ok(pkg.explicit_non_qualifiers.includes('Grant Ops remains signal-only / domain-direction evidence only'));
  assert.ok(pkg.explicit_non_qualifiers.includes('Review Ops remains under-definition and blocked below onboarding'));
  assert.ok(pkg.explicit_non_qualifiers.includes('Thesis Ops remains under-definition and blocked below onboarding'));

  assert.ok(pkg.scope.some((item: string) => /already admitted domains only/i.test(item)));
  assert.ok(pkg.scope.some((item: string) => /federation/i.test(item)));
  assert.ok(pkg.non_goals.some((item: string) => /no routed-action runtime/i.test(item)));
  assert.ok(pkg.non_goals.some((item: string) => /no Grant\/Review\/Thesis admission/i.test(item)));
  assert.ok(pkg.non_goals.some((item: string) => /no runtime-owner promotion/i.test(item)));
  assert.ok(pkg.verification_requirements.includes('npm test'));
  assert.ok(pkg.verification_requirements.includes('NODE_NO_WARNINGS=1 node --test tests/opl-readonly-gateway.cli.test.mjs'));

  for (const text of [doc, docZh]) {
    assert.match(text, /Minimal admitted-domain federation activation package/);
    assert.match(text, /MedAutoScience/);
    assert.match(text, /RedCube AI/);
    assert.match(text, /Grant Foundry -> Med Auto Grant/);
    assert.match(text, /Review Ops/);
    assert.match(text, /Thesis Ops/);
    assert.match(text, /runtime owner/i);
    assert.match(text, /shared execution core/i);
    assert.match(text, /managed web runtime/i);
  }

  assert.match(doc, /Phase 1 exit activation package/i);
  assert.match(doc, /activated now/i);
  assert.match(doc, /already admitted domains only/i);
  assert.match(doc, /research_ops/i);
  assert.match(doc, /presentation_ops/i);
  assert.match(docZh, /Phase 1 exit activation package/);
  assert.match(docZh, /当前已激活/);
  assert.match(docZh, /仅面向已 admitted domain/);
  assert.match(docZh, /research_ops/);
  assert.match(docZh, /presentation_ops/);

  const phaseExitSurface = surfaceIndex.surfaces.find(
    (entry: Json) => entry.surface_id === 'opl_phase_1_exit_activation_package',
  );
  const activationSurface = surfaceIndex.surfaces.find(
    (entry: Json) => entry.surface_id === 'opl_minimal_admitted_domain_federation_activation_package',
  );
  const contractHub = surfaceIndex.surfaces.find((entry: Json) => entry.surface_id === 'opl_gateway_contract_hub');
  const publicIndexDoc = surfaceIndex.surfaces.find((entry: Json) => entry.surface_id === 'opl_public_surface_index_doc');
  const p8Gate = acceptanceMatrix.gates.find((entry: Json) => entry.gate_id === 'p8_public_surface_index_integrity');

  assert.ok(phaseExitSurface);
  assert.ok(activationSurface);
  assert.ok(contractHub);
  assert.ok(publicIndexDoc);
  assert.ok(p8Gate);
  assert.equal(phaseExitSurface.surface_kind, 'activation_package');
  assert.equal(activationSurface.surface_kind, 'activation_package');
  assert.ok(
    activationSurface.refs.some(
      (entry: Json) => entry.ref === 'contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json',
    ),
  );
  assert.ok(activationSurface.routes_to.includes('opl_phase_1_exit_activation_package'));
  assert.ok(contractHub.routes_to.includes('opl_phase_1_exit_activation_package'));
  assert.ok(contractHub.routes_to.includes('opl_minimal_admitted_domain_federation_activation_package'));
  assert.ok(publicIndexDoc.routes_to.includes('opl_minimal_admitted_domain_federation_activation_package'));
  assert.ok(
    p8Gate.required_files.includes('contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json'),
  );
  assert.ok(
    p8Gate.contract_assertions.some((entry: string) =>
      /opl_phase_1_exit_activation_package.*opl_minimal_admitted_domain_federation_activation_package/i.test(entry),
    ),
  );
});
