import { assert, runCli, test } from '../../helpers.ts';

import { moduleSurfaceIds } from './shared.ts';

test('each standard non-workspace brand module exposes the generic executable module family', () => {
  const operations = ['status', 'inspect', 'interfaces', 'validate', 'doctor'] as const;

  for (const moduleId of moduleSurfaceIds) {
    const surfaceKindPrefix = `opl_${moduleId.replace(/-/g, '_')}`;

    for (const operation of operations) {
      const output = runCli([moduleId, operation]);
      const surface = output.brand_module_surface;

      assert.equal(surface.surface_kind, `${surfaceKindPrefix}_brand_module_${operation}`);
      assert.equal(surface.module_id, moduleId);
      assert.equal(surface.operation, operation);
      assert.equal(surface.canonical_command_surface, `opl ${moduleId}`);
      assert.equal(surface.status, operation === 'doctor' ? 'pass' : 'valid');
      assert.equal(surface.authority_boundary.can_claim_domain_ready, false);
      assert.equal(surface.authority_boundary.can_claim_quality_verdict, false);
      assert.equal(surface.authority_boundary.can_claim_artifact_authority, false);
      assert.equal(surface.authority_boundary.can_claim_production_ready, false);
      assert.equal(surface.authority_boundary.can_write_domain_truth, false);
      assert.equal(surface.authority_boundary.can_sign_owner_receipt, false);
    }

    const statusKey = `${surfaceKindPrefix}_status`;
    const validationKey = `${surfaceKindPrefix}_validation`;
    const doctorKey = `${surfaceKindPrefix}_doctor`;
    const interfacesKey = `${surfaceKindPrefix}_interfaces`;

    const status = runCli([moduleId, 'status'])[statusKey];
    assert.equal(status.module_id, moduleId);
    assert.equal(status.completion_level, 'L4_structural_baseline');
    assert.equal(status.status, 'valid');
    assert.equal(status.native_cli_family.status, `opl ${moduleId} status --json`);
    assert.equal(status.native_cli_family.inspect, `opl ${moduleId} inspect --json`);
    assert.equal(status.native_cli_family.interfaces, `opl ${moduleId} interfaces --json`);
    assert.equal(status.native_cli_family.validate, `opl ${moduleId} validate --json`);
    assert.equal(status.native_cli_family.doctor, `opl ${moduleId} doctor --json`);
    assert.equal(status.checks.every((entry: { status: string }) => entry.status === 'pass'), true);
    assert.equal(status.authority_boundary.can_claim_domain_ready, false);
    assert.equal(status.authority_boundary.can_sign_owner_receipt, false);

    const validation = runCli([moduleId, 'validate'])[validationKey];
    assert.equal(validation.status, 'valid');
    assert.equal(validation.contract_ref, `contracts/opl-framework/brand-module-surfaces.json#modules.${moduleId}`);
    assert.equal(validation.checks.every((entry: { status: string }) => entry.status === 'pass'), true);

    const doctor = runCli([moduleId, 'doctor'])[doctorKey];
    assert.equal(doctor.status, 'pass');
    assert.equal(doctor.next_safe_action, null);

    const interfaces = runCli([moduleId, 'interfaces'])[interfacesKey];
    assert.equal(interfaces.cli.commands.includes(`opl ${moduleId} status --json`), true);
    assert.equal(interfaces.cli.commands.includes(`opl ${moduleId} validate --json`), true);
    assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === `${moduleId.replace(/-/g, '_')}_status`), true);
    assert.equal(interfaces.descriptor.descriptor_refs.includes(`opl ${moduleId} interfaces --json`), true);
  }
});

test('workspace keeps its existing validate doctor and interfaces implementations while gaining status and inspect', () => {
  const statusOutput = runCli(['workspace', 'status']);
  const inspectOutput = runCli(['workspace', 'inspect']);
  const status = statusOutput.opl_workspace_status;
  const inspect = inspectOutput.opl_workspace_inspect;
  const interfaces = runCli(['workspace', 'interfaces']).workspace_interfaces;

  assert.equal(statusOutput.brand_module_surface.surface_kind, 'opl_workspace_brand_module_status');
  assert.equal(statusOutput.brand_module_surface.command_surface_collision_policy, 'preserve_workspace_operational_validate_doctor_interfaces');
  assert.equal(inspectOutput.brand_module_surface.surface_kind, 'opl_workspace_brand_module_inspect');
  assert.equal(inspectOutput.brand_module_surface.command_surface_collision_policy, 'preserve_workspace_operational_validate_doctor_interfaces');
  assert.equal(status.module_id, 'workspace');
  assert.equal(inspect.module_id, 'workspace');
  assert.equal(status.status, 'valid');
  assert.equal(inspect.status, 'valid');
  assert.equal(interfaces.surface_kind, 'opl_workspace_initialize_interfaces');
  assert.equal(interfaces.surfaces.cli.validator_command, 'opl workspace validate');
  assert.equal(interfaces.surfaces.cli.doctor_command, 'opl workspace doctor');
});
