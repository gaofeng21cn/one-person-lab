import { assert, runCli, runCliFailure, test } from '../../helpers.ts';

import { canonicalOwnerId } from '../../../../../src/kernel/owner-id.ts';
import { expectedModuleIds } from './shared.ts';

const expectedStandardDomainAgentIds = ['mas', 'mag', 'rca', 'oma', 'obf'];

test('agent-owned internal modules expose the same branding spine without becoming OPL platform modules', () => {
  const list = runCli(['agents', 'modules', 'list']).agent_internal_modules;

  assert.equal(list.surface_kind, 'opl_agent_internal_brand_module_list');
  assert.deepEqual(list.domain_ids, expectedStandardDomainAgentIds);
  assert.deepEqual(list.platform_module_ids, expectedModuleIds);
  assert.deepEqual(list.agent_module_ids, expectedModuleIds.map((moduleId) => `agent-${moduleId}`));
  assert.equal(list.domain_count, 5);
  assert.equal(list.module_count_per_domain, 10);
  assert.equal(list.canonical_command_surface, 'opl agents modules');
  assert.equal(list.authority_boundary.can_write_domain_truth, false);
  assert.equal(list.authority_boundary.can_replace_domain_owner, false);

  const inspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'oma',
    '--module',
    'agent-runway',
  ]).agent_internal_module;

  assert.equal(inspect.surface_kind, 'opl_agent_internal_brand_module_inspect');
  assert.equal(inspect.domain_id, 'oma');
  assert.equal(inspect.agent_module_id, 'agent-runway');
  assert.equal(inspect.platform_analogue_module_id, 'runway');
  assert.equal(inspect.canonical_command_surface, 'opl agents modules');
  assert.equal(inspect.module_command_surface, 'opl agents modules inspect --domain oma --module agent-runway');
  assert.equal(inspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(inspect.authority_boundary.can_claim_production_ready, false);

  const aliasInspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'medautoscience',
    '--module',
    'agent-runway',
  ]).agent_internal_module;
  assert.equal(aliasInspect.domain_id, 'mas');
  assert.equal(aliasInspect.module_command_surface, 'opl agents modules inspect --domain mas --module agent-runway');

  const interfaces = runCli(['agents', 'modules', 'interfaces']).agent_internal_module_interfaces;
  assert.equal(interfaces.surface_kind, 'opl_agent_internal_brand_module_interfaces');
  assert.equal(interfaces.cli.commands.includes('opl agents modules validate --json'), true);
  assert.equal(interfaces.descriptor.refs.includes('contracts/opl-framework/brand-cli-governance.json#agent_internal_modules'), true);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);

  const validation = runCli(['agents', 'modules', 'validate']).agent_internal_module_validation;
  assert.equal(validation.surface_kind, 'opl_agent_internal_brand_module_validation');
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.domain_ids, expectedStandardDomainAgentIds);
  assert.deepEqual(validation.missing_domain_module_sets, []);

  const doctor = runCli(['agents', 'modules', 'doctor']).agent_internal_module_doctor;
  assert.equal(doctor.surface_kind, 'opl_agent_internal_brand_module_doctor');
  assert.equal(doctor.status, 'pass');
});

test('Foundry exposes one bounded operator control surface without Agent-series command aliases', () => {
  const help = runCli(['help', 'foundry']).help;
  assert.deepEqual(
    help.subcommands.map((entry: { command: string }) => entry.command),
    [
      'foundry status',
      'foundry approve',
      'foundry reject',
      'foundry cancel',
      'foundry versions',
      'foundry rollback',
    ],
  );

  const retiredSeries = runCliFailure(['agents', 'foundry', 'status']);
  assert.equal(retiredSeries.status, 2);
  const retiredIndex = runCliFailure(['foundry', 'agents', 'list']);
  assert.equal(retiredIndex.status, 2);
});

test('standard owner aliases normalize to the repo owner ids used by evidence surfaces', () => {
  assert.equal(canonicalOwnerId('mas'), 'med-autoscience');
  assert.equal(canonicalOwnerId('mag'), 'med-autogrant');
  assert.equal(canonicalOwnerId('rca'), 'redcube-ai');
  assert.equal(canonicalOwnerId('oma'), 'opl-meta-agent');
  assert.equal(canonicalOwnerId('opl_meta_agent'), 'opl-meta-agent');
  assert.equal(canonicalOwnerId('obf'), 'opl-bookforge');
  assert.equal(canonicalOwnerId('opl_bookforge'), 'opl-bookforge');
  assert.equal(canonicalOwnerId('study'), 'study');
  assert.equal(canonicalOwnerId('agent'), 'agent');
  assert.equal(canonicalOwnerId('book'), 'book');
});
