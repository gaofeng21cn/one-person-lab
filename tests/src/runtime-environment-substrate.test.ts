import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildRuntimeEnvironmentBuildReadback,
  buildRuntimeEnvironmentPrepareReadback,
  buildRuntimeEnvironmentRunContextReadback,
} from '../../src/modules/runway/runtime-environment-substrate.ts';
import { installRPackagesIntoManagedLibrary } from '../../src/modules/runway/runtime-environment-substrate-parts/package-profile.ts';
import {
  inspectExternalSandboxProviderAdapterEnv,
} from '../../src/modules/runway/external-sandbox-provider-adapter.ts';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const modalLikeEnvSpecIds = [
  'chemistry_gpu',
  'esmfold2_gpu',
  'genomics_evo2_gpu',
  'proteomics_boltz_gpu',
  'proteomics_gpu',
  'proteomics_jax_gpu',
  'proteomics_openfold_gpu',
  'proteomics_rfd_diffdock_gpu',
  'singlecell_gpu',
];

const fastLocalEnvDefaultFields = (readback: Json) => {
  const defaultPath = (readback.default_current_path ?? {}) as Json;
  const handoff = (readback.standard_tool_handoff ?? {}) as Json;
  return {
    sandbox_provider: readback.sandbox_provider,
    default_strategy: defaultPath.strategy_id,
    default_path: defaultPath.path_id,
    renv_handoff: ((handoff.renv ?? {}) as Json).tool,
    uv_handoff: ((handoff.uv ?? {}) as Json).tool,
    host_environment_fallback_allowed: defaultPath.host_environment_fallback_allowed,
  };
};

function readJson(relativePath: string): Json {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

test('runtime environment substrate keeps shared helpers split behind a thin facade', () => {
  const facade = fs.readFileSync(
    path.join(repoRoot, 'src/modules/runway/runtime-environment-substrate-parts/shared.ts'),
    'utf8',
  );
  const partFiles = [
    'contract.ts',
    'target-state.ts',
    'package-profile.ts',
    'language-lock-handoff.ts',
    'sandbox-provider-plan.ts',
    'projection-cache.ts',
  ];

  assert.equal(facade.includes('export function '), false);
  assert.deepEqual(
    facade.trim().split(/\r?\n/),
    partFiles.map((fileName) => `export * from './${fileName}';`),
  );

  for (const fileName of partFiles) {
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/modules/runway/runtime-environment-substrate-parts', fileName),
      'utf8',
    );
    assert.ok(
      source.trim().split(/\r?\n/).length <= 420,
      `${fileName} should stay inside the runtime env source-boundary budget`,
    );
  }
});

test('runtime environment substrate contract defines OPL-owned false-ready boundary', () => {
  const contract = readJson('contracts/opl-framework/runtime-environment-substrate-contract.json');

  assert.equal(contract.contract_id, 'opl_runtime_environment_substrate_contract');
  assert.equal(contract.owner, 'OPL Framework');
  assert.equal(
    contract.implementation_status,
    'runtime_lock_materializer_cache_prune_run_context_guard_available',
  );
  assert.equal(contract.target_planned, true);

  const ordinaryPath = contract.ordinary_path as Json;
  assert.deepEqual(ordinaryPath.ordinary_user_commands, ['opl env doctor', 'opl env prepare', 'opl env run']);
  assert.equal(
    ordinaryPath.advanced_operator_surface,
    'opl runtime env inspect|lock|build|prepare|materialize|verify|cache|doctor|run-context|contract',
  );
  assert.equal(ordinaryPath.default_provider_kind, 'fast_local_env');
  assert.equal(
    ordinaryPath.ordinary_entrypoint_policy,
    'ordinary_users_use_opl_env_doctor_prepare_run_advanced_operators_may_use_opl_runtime_env',
  );

  const authority = contract.authority_boundary as Json;
  assert.equal(authority.opl_is_canonical_runtime_environment_owner, true);
  assert.equal(authority.app_consumes_runtime_environment_projection, true);
  assert.equal(authority.domain_agents_declare_dependency_intent_only, true);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_sign_owner_receipt, false);
  assert.equal(authority.can_claim_domain_ready, false);
  assert.equal(authority.can_claim_app_release_ready, false);
  assert.equal(authority.can_claim_runtime_materialized_ready, false);

  const lockPolicy = contract.lock_projection_policy as Json;
  assert.equal(lockPolicy.status, 'projection_and_persisted_lock_available');
  assert.equal(lockPolicy.deterministic_digest_required, true);
  assert.equal(lockPolicy.persisted_lock_required_for_runtime_ready, true);
  assert.equal(lockPolicy.writes_runtime_root, false);
  assert.equal(lockPolicy.can_claim_runtime_ready, false);

  const bundlePolicy = contract.bundle_manifest_projection_policy as Json;
  assert.equal(bundlePolicy.status, 'projection_and_persisted_manifest_available');
  assert.equal(bundlePolicy.layer_graph_required, true);
  assert.equal(bundlePolicy.dry_run_bundle_manifest_counts_as_runtime_ready, false);
  assert.equal(bundlePolicy.can_claim_runtime_ready, false);

  const producerPolicy = contract.runtime_bundle_producer_policy as Json;
  assert.equal(producerPolicy.status, 'build_command_exposes_manifest_lock_and_readback_refs');
  assert.equal(producerPolicy.producer_kind, 'opl-runtime-bundle');
  assert.equal(producerPolicy.producer_command_ref, 'opl-runtime-env-command:build');
  assert.equal(producerPolicy.manifest_schema_version, 'opl-runtime-bundle-manifest.v1');
  assert.equal(producerPolicy.lock_schema_version, 'opl-runtime-bundle-lock.v1');
  assert.equal(producerPolicy.readback_schema_version, 'opl-runtime-bundle-producer-readback.v1');
  assert.equal(producerPolicy.dry_run_bundle_manifest_counts_as_runtime_ready, false);
  assert.equal(producerPolicy.dry_run_bundle_manifest_counts_as_app_release_ready, false);
  assert.equal(producerPolicy.can_claim_runtime_ready, false);
  assert.equal(producerPolicy.can_claim_domain_ready, false);
  assert.equal(producerPolicy.can_claim_app_release_ready, false);
  assert.equal((producerPolicy.stable_ref_fields as string[]).includes('bundle_manifest.bundle_ref'), true);
  assert.equal((producerPolicy.stable_ref_fields as string[]).includes('bundle_lock.lock_ref'), true);
  assert.equal(
    (producerPolicy.consumer_false_ready_flags as string[]).includes(
      'bundle_lock_exists_counts_as_app_full_release_ready',
    ),
    true,
  );

  const sandboxPolicy = contract.external_sandbox_provider_policy as Json;
  assert.equal(sandboxPolicy.status, 'fast_local_env_default_with_local_and_remote_sandbox_providers_deferred');
  assert.deepEqual(sandboxPolicy.supported_provider_kinds, [
    'fast_local_env',
    'local_sandbox',
    'remote_sandbox',
  ]);
  assert.equal(sandboxPolicy.default_provider_kind, 'fast_local_env');
  assert.deepEqual(sandboxPolicy.local_provider_examples, ['docker', 'devcontainer']);
  assert.deepEqual(sandboxPolicy.external_provider_examples, ['e2b', 'daytona', 'modal']);
  assert.deepEqual(sandboxPolicy.required_external_sandbox_refs, [
    'OPL_EXTERNAL_SANDBOX_ENDPOINT',
    'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
    'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
  ]);
  assert.deepEqual(
    (sandboxPolicy.provider_family_catalog as Json[]).map((entry) => entry.substrate),
    ['e2b', 'daytona', 'modal'],
  );
  const modalCatalog = sandboxPolicy.modal_like_env_spec_catalog as Json;
  assert.equal(modalCatalog.source_ref, 'AcademicForge:skills/claude-science/remote-compute-modal/envs');
  assert.deepEqual(modalCatalog.env_ids, modalLikeEnvSpecIds);
  assert.equal(modalCatalog.env_id_counts_as_image_built, false);
  assert.equal(modalCatalog.env_id_counts_as_provider_ready, false);
  assert.equal(modalCatalog.env_id_counts_as_runtime_ready, false);
  assert.equal(sandboxPolicy.provider_role, 'post_default_execution_isolation_substrate');
  assert.equal(sandboxPolicy.e2b_default_dependency, false);
  assert.equal(sandboxPolicy.e2b_package_dependency_class, 'optional_dependency');
  assert.equal(sandboxPolicy.e2b_connect_configuration_assist_only, true);
  const localSandboxReadbackPolicy = sandboxPolicy.local_sandbox_provider_readback_policy as Json;
  assert.equal(localSandboxReadbackPolicy.local_docker_status, 'local_docker_preflight_required');
  assert.equal(localSandboxReadbackPolicy.local_devcontainer_status, 'local_devcontainer_preflight_required');
  assert.equal(localSandboxReadbackPolicy.required_cli, 'docker');
  assert.equal(localSandboxReadbackPolicy.required_receipt_kind, 'sandbox_execution_receipt');
  assert.equal(localSandboxReadbackPolicy.live_provider_receipt_required, true);
  assert.equal(
    localSandboxReadbackPolicy.false_ready_guard,
    'local_sandbox_preflight_is_not_provider_ready',
  );
  assert.equal(localSandboxReadbackPolicy.local_sandbox_preflight_counts_as_provider_ready, false);
  assert.equal(localSandboxReadbackPolicy.local_sandbox_execution_receipt_counts_as_domain_ready, false);
  const e2bCatalogEntry = (sandboxPolicy.provider_family_catalog as Json[]).find(
    (entry) => entry.substrate === 'e2b',
  ) as Json;
  assert.equal(e2bCatalogEntry.default_dependency, false);
  assert.equal(e2bCatalogEntry.package_dependency_class, 'optional_dependency');
  assert.equal(e2bCatalogEntry.connect_role, 'external_provider_configuration_assist');
  assert.equal((sandboxPolicy.adapter_owned_fields as string[]).includes('provider_receipt_ref'), true);
  assert.equal((sandboxPolicy.adapter_owned_fields as string[]).includes('sandbox_binding_ref'), true);
  assert.equal(sandboxPolicy.temporal_replacement, false);
  assert.equal(sandboxPolicy.requires_live_provider_receipt_for_ready, true);
  assert.equal(sandboxPolicy.credential_material_read, false);
  assert.equal(sandboxPolicy.external_api_called, false);
  assert.equal(sandboxPolicy.provider_lifecycle_managed, false);
  assert.equal(sandboxPolicy.creates_cloud_resource, false);
  assert.equal(sandboxPolicy.template_exists_counts_as_provider_ready, false);
  assert.equal(sandboxPolicy.local_template_exists_counts_as_provider_ready, false);
  assert.equal(sandboxPolicy.local_sandbox_receipt_counts_as_domain_ready, false);
  assert.equal(sandboxPolicy.local_sandbox_receipt_counts_as_app_release_ready, false);
  assert.equal(sandboxPolicy.local_sandbox_receipt_counts_as_production_ready, false);
  assert.equal(sandboxPolicy.snapshot_exists_counts_as_runtime_ready, false);
  assert.equal(sandboxPolicy.provider_receipt_counts_as_domain_ready, false);
  const fastLocalDoctorPolicy = sandboxPolicy.fast_local_env_doctor_policy as Json;
  assert.equal(fastLocalDoctorPolicy.checks_host_binaries, true);
  assert.equal(fastLocalDoctorPolicy.checks_language_packages, true);
  assert.equal(fastLocalDoctorPolicy.emits_system_hints, true);
  assert.equal(fastLocalDoctorPolicy.declares_runtime_ready, false);
  assert.equal(fastLocalDoctorPolicy.declares_domain_ready, false);
  assert.equal(fastLocalDoctorPolicy.declares_app_ready, false);
  assert.equal(fastLocalDoctorPolicy.declares_provider_ready, false);
  assert.equal(sandboxPolicy.can_claim_provider_ready_without_receipt, false);
  assert.equal(sandboxPolicy.can_claim_runtime_ready_without_receipt, false);

  const endpointPolicy = contract.model_endpoint_provider_policy as Json;
  assert.equal(endpointPolicy.status, 'invoke_readback_contract_only');
  assert.equal(endpointPolicy.source_ref, 'AcademicForge:skills/claude-science/using-model-endpoint/provider.py');
  assert.deepEqual(endpointPolicy.required_endpoint_refs, [
    'OPL_MODEL_ENDPOINT_URL_REF',
    'OPL_MODEL_ENDPOINT_CREDENTIAL_REF',
    'OPL_MODEL_ENDPOINT_PROVIDER_RECEIPT_REF',
  ]);
  assert.equal((endpointPolicy.invoke_contract as Json).credential_material_read, false);
  assert.equal((endpointPolicy.invoke_contract as Json).endpoint_api_called_by_readback, false);
  assert.equal(endpointPolicy.endpoint_lifecycle_managed, false);
  assert.equal(endpointPolicy.creates_endpoint, false);
  assert.equal(endpointPolicy.updates_endpoint, false);
  assert.equal(endpointPolicy.deletes_endpoint, false);
  assert.equal(endpointPolicy.submit_job_supported, false);
  assert.equal(endpointPolicy.harvest_job_supported, false);
  assert.equal(endpointPolicy.can_claim_endpoint_ready, false);
  assert.equal(endpointPolicy.can_claim_provider_ready, false);
  assert.equal(endpointPolicy.can_claim_runtime_ready, false);
  assert.equal(endpointPolicy.can_claim_domain_ready, false);

  const inventoryPolicy = contract.cache_inventory_policy as Json;
  assert.equal(inventoryPolicy.status, 'filesystem_inventory_and_prune_receipt_available');
  assert.equal(inventoryPolicy.cache_hit_counts_as_ready, false);
  assert.equal(inventoryPolicy.cache_miss_counts_as_readiness_failure, false);
  assert.equal(inventoryPolicy.prune_apply_requires_materialization_receipt, true);
  assert.equal(inventoryPolicy.protect_current_and_rollback_pointers, true);
  assert.equal(inventoryPolicy.deletes_domain_artifacts, false);

  const preparePolicy = contract.dependency_prepare_policy as Json;
  assert.equal(preparePolicy.status, 'local_dependency_check_and_opl_managed_package_prepare_available');
  assert.equal(preparePolicy.writes_dependency_lock, true);
  assert.equal(preparePolicy.writes_dependency_receipt, true);
  assert.equal(preparePolicy.writes_run_context_on_success, true);
  assert.equal(
    preparePolicy.run_context_consumer_preflight,
    'fail_closed_on_missing_run_context_or_target_mismatch',
  );
  assert.equal(preparePolicy.run_context_identity_required, true);
  assert.equal(preparePolicy.dependency_lock_counts_as_materialized_runtime_lock, false);
  assert.equal(preparePolicy.installs_packages, 'only_when_apply_into_opl_managed_r_library_or_python_uv_environment');
  assert.equal(preparePolicy.package_presence_verification, 'managed_r_library_or_managed_python_environment_only');
  assert.deepEqual((preparePolicy.r_standard_handoff as Json).lock_refs, ['renv.lock']);
  assert.equal((preparePolicy.r_standard_handoff as Json).managed_library_environment, 'R_LIBS_USER');
  assert.deepEqual((preparePolicy.python_standard_handoff as Json).lock_refs, ['uv.lock', 'pyproject.toml']);
  assert.equal((preparePolicy.python_standard_handoff as Json).managed_environment, 'UV_PROJECT_ENVIRONMENT');
  assert.equal(preparePolicy.r_package_environment, 'R_LIBS_USER');
  assert.deepEqual(preparePolicy.supported_r_package_sources, ['cran', 'github', 'bioconductor']);
  assert.equal(preparePolicy.bioconductor_installer, 'BiocManager');
  assert.equal(preparePolicy.python_package_environment, 'UV_PROJECT_ENVIRONMENT');
  assert.equal(preparePolicy.python_installer, 'uv');
  assert.equal(
    preparePolicy.requirement_profile_selection,
    'all_profiles_by_default_or_scoped_by_requirement_profile_id',
  );
  assert.equal(preparePolicy.host_environment_fallback_allowed, false);
  assert.equal(preparePolicy.writes_domain_truth, false);
  assert.equal(preparePolicy.writes_runtime_root, false);
  assert.equal(preparePolicy.missing_dependency_returns_runtime_failure, true);
  assert.equal(preparePolicy.can_claim_provider_ready, false);
  assert.equal(preparePolicy.can_claim_runtime_ready, false);

  const runContextPolicy = contract.run_context_consumer_policy as Json;
  assert.equal(runContextPolicy.status, 'fail_closed_consumer_preflight_available');
  assert.equal(runContextPolicy.requires_artifact_root_for_bound_readback, true);
  assert.equal(runContextPolicy.missing_run_context_status, 'missing_run_context');
  assert.equal(runContextPolicy.target_mismatch_status, 'target_mismatch');
  assert.equal(runContextPolicy.host_environment_fallback_allowed, false);
  assert.equal(runContextPolicy.run_context_exists_counts_as_provider_ready, false);
  assert.equal(runContextPolicy.run_context_exists_counts_as_domain_ready, false);
  assert.equal(runContextPolicy.can_schedule_domain_stage, false);
  assert.equal(runContextPolicy.can_claim_provider_ready, false);
  assert.equal(runContextPolicy.can_claim_runtime_ready, false);
  assert.equal(runContextPolicy.can_claim_domain_ready, false);

  assert.deepEqual(contract.required_readback_claim_fields, [
    'implementation_status',
    'target_planned',
    'dry_run',
    'can_claim_runtime_ready',
    'can_claim_domain_ready',
    'can_claim_app_release_ready',
  ]);

  const moduleMapping = contract.module_mapping as Record<string, Json>;
  assert.deepEqual(Object.keys(moduleMapping).sort(), [
    'atlas',
    'charter',
    'connect',
    'console',
    'foundry-lab',
    'ledger',
    'pack',
    'runway',
    'stagecraft',
    'workspace',
  ]);
  assert.equal(moduleMapping.runway.role, 'runtime_materialization_and_run_consumption');
  assert.equal(moduleMapping.pack.role, 'descriptor_lock_layer_manifest_and_distribution_refs');

  const forbiddenClaims = contract.forbidden_claims as string[];
  assert.equal(forbiddenClaims.includes('runtime_cache_hit_means_ready'), true);
  assert.equal(forbiddenClaims.includes('materialization_skeleton_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('runtime_environment_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('local_sandbox_template_exists_means_provider_ready'), true);
  assert.equal(forbiddenClaims.includes('local_sandbox_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('local_sandbox_receipt_means_app_release_ready'), true);
  assert.equal(forbiddenClaims.includes('local_sandbox_receipt_means_production_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_template_exists_means_provider_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_snapshot_exists_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('modal_env_spec_id_means_image_built'), true);
  assert.equal(forbiddenClaims.includes('modal_env_spec_id_means_provider_ready'), true);
  assert.equal(forbiddenClaims.includes('model_endpoint_ref_means_endpoint_ready'), true);
  assert.equal(forbiddenClaims.includes('model_endpoint_provider_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('model_endpoint_readback_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('missing_run_context_allows_host_environment_fallback'), true);
  assert.equal(forbiddenClaims.includes('run_context_target_mismatch_allows_consumer_execution'), true);

  const readbackCommands = contract.readback_commands as string[];
  assert.equal(readbackCommands.includes('opl env doctor'), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl env prepare')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl env run')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env build')), true);
  assert.equal(
    readbackCommands.includes(
      'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
    ),
    true,
  );
  assert.equal(
    readbackCommands.includes(
      'opl runtime env run-context --domain <domain> --profile <profile> [--artifact-root <path>]',
    ),
    true,
  );
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env materialize')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env verify')), true);
  assert.equal(readbackCommands.includes('opl runtime env cache inventory'), true);
  assert.equal(readbackCommands.includes('opl runtime env cache prune --dry-run'), true);
});

test('runtime env build readback exposes Full bundle producer manifest lock refs without App release authority', () => {
  const readback = buildRuntimeEnvironmentBuildReadback({
    domainId: 'mas',
    profileId: 'full',
    platformId: 'macos-arm64',
  }) as Json;

  assert.equal(readback.command, 'build');
  assert.equal(readback.dry_run, true);
  assert.equal(readback.can_claim_runtime_ready, false);
  assert.equal(readback.can_claim_domain_ready, false);
  assert.equal(readback.can_claim_app_release_ready, false);

  const bundleLock = readback.bundle_lock as Json;
  const bundleManifest = readback.bundle_manifest as Json;
  const producer = readback.runtime_bundle_producer as Json;
  const receipt = readback.producer_receipt as Json;

  assert.match(bundleLock.lock_ref as string, /^runtime-lock:mas\/full\/macos-arm64:sha256:/);
  assert.match(bundleManifest.bundle_ref as string, /^runtime-bundle:mas\/full\/macos-arm64:sha256:/);
  assert.equal(producer.producer_kind, 'opl-runtime-bundle');
  assert.equal(producer.producer_command_ref, 'opl-runtime-env-command:build');
  assert.equal(producer.manifest_schema_version, 'opl-runtime-bundle-manifest.v1');
  assert.equal(producer.lock_schema_version, 'opl-runtime-bundle-lock.v1');
  assert.equal((producer.target_profile as Json).profile_id, 'full');
  assert.equal(producer.target_platform_id, 'macos-arm64');
  assert.deepEqual(fastLocalEnvDefaultFields(readback), {
    sandbox_provider: 'fast_local_env',
    default_strategy: 'fast_local_env',
    default_path: 'default_current_path',
    renv_handoff: 'renv',
    uv_handoff: 'uv',
    host_environment_fallback_allowed: false,
  });
  const sandboxPlan = readback.sandbox_provider_plan as Json;
  assert.equal(sandboxPlan.selected_provider, 'fast_local_env');
  assert.equal(sandboxPlan.provider_role, 'fast_local_env_default_current_path');
  assert.deepEqual(sandboxPlan.later_sandbox_provider_kinds, ['local_docker', 'external_sandbox']);
  assert.deepEqual(sandboxPlan.later_external_sandbox_substrates, ['e2b', 'daytona', 'modal']);
  assert.equal(sandboxPlan.materialization_root_provider, 'local_managed_root');
  assert.equal(sandboxPlan.temporal_replacement, false);
  assert.equal(sandboxPlan.can_claim_provider_ready, false);
  assert.equal(sandboxPlan.local_template_exists_counts_as_provider_ready, false);
  assert.equal(sandboxPlan.local_sandbox_receipt_counts_as_domain_ready, false);
  assert.equal((producer.layer_taxonomy as unknown[]).length, 6);
  assert.equal((producer.false_ready_flags as Json).dry_run_projection_counts_as_app_release_ready, false);
  assert.equal((producer.false_ready_flags as Json).bundle_lock_exists_counts_as_app_full_release_ready, false);
  assert.equal((producer.false_ready_flags as Json).local_sandbox_template_exists_counts_as_provider_ready, false);
  assert.equal((producer.false_ready_flags as Json).local_sandbox_receipt_counts_as_domain_ready, false);
  assert.equal((producer.false_ready_flags as Json).modal_env_spec_id_counts_as_provider_ready, false);
  assert.equal((producer.false_ready_flags as Json).model_endpoint_ref_counts_as_endpoint_ready, false);
  assert.equal((producer.false_ready_flags as Json).model_endpoint_readback_counts_as_runtime_ready, false);
  assert.equal((producer.app_full_consumer_boundary as Json).app_owns_release_verdict, true);
  assert.equal((producer.app_full_consumer_boundary as Json).framework_can_claim_app_release_ready, false);
  assert.equal(receipt.bundle_manifest_ref, bundleManifest.bundle_ref);
  assert.equal(receipt.bundle_lock_ref, bundleLock.lock_ref);
  assert.equal(receipt.readback_ref, producer.producer_readback_ref);
  assert.equal(receipt.can_claim_runtime_ready, false);
  assert.equal(receipt.can_claim_domain_ready, false);
  assert.equal(receipt.can_claim_app_release_ready, false);
});

test('runtime env build readback exposes local sandbox provider as explicit preflight path', () => {
  const readback = buildRuntimeEnvironmentBuildReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'linux-x64',
    sandboxProvider: 'local_docker',
  }) as Json;

  assert.equal(readback.command, 'build');
  assert.equal(readback.sandbox_provider, 'local_docker');
  assert.equal(readback.can_claim_runtime_ready, false);
  const plan = readback.sandbox_provider_plan as Json;
  assert.equal(plan.status, 'local_docker_preflight_required');
  assert.equal(plan.provider_role, 'local_agent_sandbox_execution_substrate');
  assert.equal(plan.template_ref, 'local-sandbox-template:local_docker:mas/analysis/linux-x64');
  assert.equal(plan.sandbox_binding_ref, null);
  assert.equal(plan.required_receipt_kind, 'sandbox_execution_receipt');
  assert.equal(plan.live_provider_receipt_required, true);
  assert.equal(plan.false_ready_guard, 'local_sandbox_preflight_is_not_provider_ready');
  assert.equal(plan.can_claim_provider_ready, false);
  assert.equal(plan.can_claim_runtime_ready, false);
  assert.equal(plan.can_claim_domain_ready, false);
  assert.equal(plan.can_claim_app_release_ready, false);
  assert.equal(plan.local_template_exists_counts_as_provider_ready, false);
  assert.equal(plan.local_sandbox_receipt_counts_as_domain_ready, false);
  const preflight = plan.local_sandbox_preflight as Json;
  assert.equal(preflight.status, 'local_docker_preflight_required');
  assert.equal(preflight.required_cli, 'docker');
  assert.deepEqual(preflight.required_image_env, [
    'OPL_LOCAL_SANDBOX_IMAGE',
    'OPL_CODEX_STAGE_SANDBOX_IMAGE',
    'OPL_DEVCONTAINER_IMAGE',
  ]);
  assert.equal(preflight.required_receipt_kind, 'sandbox_execution_receipt');
  assert.equal(preflight.external_api_called, false);
  assert.equal(preflight.credential_material_read, false);
  assert.equal(preflight.provider_lifecycle_managed, false);
  assert.equal(preflight.creates_cloud_resource, false);
  assert.equal(preflight.can_claim_provider_ready, false);
});

test('runtime env build readback exposes external sandbox provider plan without provider authority', () => {
  const readback = buildRuntimeEnvironmentBuildReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'linux-x64',
    sandboxProvider: 'external_sandbox',
  }) as Json;

  assert.equal(readback.command, 'build');
  assert.equal(readback.sandbox_provider, 'external_sandbox');
  assert.equal(readback.can_claim_runtime_ready, false);
  const plan = readback.sandbox_provider_plan as Json;
  assert.equal(plan.status, 'external_sandbox_provider_adapter_unconfigured');
  assert.equal(plan.provider_role, 'agent_sandbox_execution_substrate');
  assert.deepEqual(plan.external_provider_examples, ['e2b', 'daytona', 'modal']);
  assert.equal(plan.e2b_default_dependency, false);
  assert.equal(plan.e2b_package_dependency_class, 'optional_dependency');
  assert.equal(plan.e2b_connect_configuration_assist_only, true);
  assert.deepEqual((plan.modal_like_env_spec_catalog as Json).env_ids, modalLikeEnvSpecIds);
  assert.equal((plan.modal_like_env_spec_catalog as Json).env_id_counts_as_provider_ready, false);
  assert.deepEqual((plan.model_endpoint_provider_family as Json).required_endpoint_refs, [
    'OPL_MODEL_ENDPOINT_URL_REF',
    'OPL_MODEL_ENDPOINT_CREDENTIAL_REF',
    'OPL_MODEL_ENDPOINT_PROVIDER_RECEIPT_REF',
  ]);
  assert.equal((plan.model_endpoint_provider_family as Json).endpoint_lifecycle_managed, false);
  assert.equal((plan.model_endpoint_provider_family as Json).creates_endpoint, false);
  assert.equal((plan.model_endpoint_provider_family as Json).credential_material_read, false);
  assert.equal((plan.model_endpoint_provider_family as Json).endpoint_api_called_by_readback, false);
  assert.equal((plan.model_endpoint_provider_family as Json).can_claim_endpoint_ready, false);
  assert.equal(plan.template_ref, 'sandbox-template:mas/analysis/linux-x64');
  assert.equal((plan.adapter as Json).adapter_id, 'opl.external_sandbox_provider_adapter.v1');
  assert.deepEqual((plan.adapter as Json).implemented_external_substrates, ['e2b']);
  assert.deepEqual((plan.adapter as Json).required_external_sandbox_refs, [
    'OPL_EXTERNAL_SANDBOX_ENDPOINT',
    'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
    'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
  ]);
  assert.equal((plan.adapter as Json).external_api_called, false);
  assert.equal((plan.adapter as Json).credential_material_read, false);
  assert.equal((plan.adapter as Json).provider_lifecycle_managed, false);
  assert.equal((plan.adapter as Json).creates_cloud_resource, false);
  assert.equal(plan.required_receipt_kind, 'external_sandbox_provider_receipt');
  assert.equal(plan.temporal_replacement, false);
  assert.equal(plan.live_provider_receipt_required, true);
  assert.equal(plan.can_claim_provider_ready, false);
  assert.equal(plan.can_claim_runtime_ready, false);
  assert.equal(plan.can_claim_domain_ready, false);

  const producer = readback.runtime_bundle_producer as Json;
  const flags = producer.false_ready_flags as Json;
  assert.equal(producer.sandbox_provider, 'external_sandbox');
  assert.equal(flags.external_sandbox_template_exists_counts_as_provider_ready, false);
  assert.equal(flags.external_sandbox_receipt_counts_as_domain_ready, false);
  assert.equal(flags.modal_env_spec_id_counts_as_image_built, false);
  assert.equal(flags.modal_env_spec_id_counts_as_provider_ready, false);
  assert.equal(flags.model_endpoint_provider_receipt_counts_as_domain_ready, false);
});

test('external sandbox adapter only recognizes implemented E2B execution', () => {
  const common = {
    OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.example.test',
    OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'secret-ref:test',
    OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'receipt-ref:test',
  };

  assert.equal(inspectExternalSandboxProviderAdapterEnv({
    ...common,
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
  }).substrate, 'e2b');
  assert.equal(inspectExternalSandboxProviderAdapterEnv({
    ...common,
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'daytona',
  }).substrate, 'generic_external_sandbox');
  assert.equal(inspectExternalSandboxProviderAdapterEnv({
    ...common,
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'modal',
  }).substrate, 'generic_external_sandbox');
});

test('runtime env prepare carries renv and uv lock refs into output, run-context, and identity', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-locks-'));
  const paperRoot = path.join(tempRoot, 'paper');
  const profilePath = path.join(tempRoot, 'requirements.json');
  const profile = {
    profiles: [
      {
        profile_id: 'analysis',
        runtime_binaries: [],
        language_packages: { r: [], python: [] },
        language_locks: {
          r: {
            lock_ref: 'renv.lock',
            source_ref: 'analysis/renv.lock',
            project_ref: 'analysis',
          },
          python: {
            lock_ref: 'uv.lock',
            source_ref: 'analysis/uv.lock',
            project_ref: 'analysis/pyproject.toml',
          },
        },
      },
    ],
  };
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

  const readback = buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    paperRoot,
  }) as Json;
  const prepare = readback.prepare as Json;
  const handoff = prepare.language_lock_handoff as Json;
  const rHandoff = handoff.r as Json;
  const pythonHandoff = handoff.python as Json;

  assert.equal(prepare.status, 'prepared');
  assert.equal(prepare.host_package_fallback_allowed, false);
  assert.deepEqual(rHandoff.lock_refs, ['renv.lock']);
  assert.deepEqual(pythonHandoff.lock_refs, ['uv.lock']);
  assert.equal(rHandoff.renv_backed_handoff, true);
  assert.equal(pythonHandoff.uv_backed_handoff, true);
  assert.deepEqual(prepare.requirement_lock_refs, ['renv.lock', 'uv.lock']);
  assert.equal((prepare.source_requirement_refs as string[]).includes('analysis/renv.lock'), true);
  assert.equal((prepare.source_requirement_refs as string[]).includes('analysis/uv.lock'), true);

  const runContext = readback.run_context as Json;
  assert.deepEqual(((runContext.language_lock_handoff as Json).r as Json).lock_refs, ['renv.lock']);
  assert.deepEqual(((runContext.language_lock_handoff as Json).python as Json).lock_refs, ['uv.lock']);
  const runContextReadback = buildRuntimeEnvironmentRunContextReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    paperRoot,
  }) as Json;
  const boundRunContext = runContextReadback.run_context as Json;
  assert.equal((boundRunContext.consumer_preflight as Json).status, 'bound');
  assert.deepEqual(((boundRunContext.language_lock_handoff as Json).python as Json).project_refs, [
    'analysis/pyproject.toml',
  ]);

  const firstIdentity = prepare.requirement_profile_identity as Json;
  const firstFingerprint = firstIdentity.profile_fingerprint;
  const firstRCacheKey = prepare.managed_r_library_path;
  const firstPythonCacheKey = prepare.managed_python_environment_path;
  fs.writeFileSync(
    profilePath,
    `${JSON.stringify({
      profiles: [
        {
          ...profile.profiles[0],
          language_locks: {
            r: { lock_ref: 'renv-v2.lock' },
            python: { lock_ref: 'uv-v2.lock' },
          },
        },
      ],
    }, null, 2)}\n`,
  );
  const changed = buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    paperRoot: path.join(tempRoot, 'paper-v2'),
  }) as Json;
  const changedPrepare = changed.prepare as Json;
  assert.notEqual((changedPrepare.requirement_profile_identity as Json).profile_fingerprint, firstFingerprint);
  assert.notEqual(changedPrepare.managed_r_library_path, firstRCacheKey);
  assert.notEqual(changedPrepare.managed_python_environment_path, firstPythonCacheKey);
});

test('runtime env prepare preserves Bioconductor package source intent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-bioconductor-'));
  const profilePath = path.join(tempRoot, 'requirements.json');
  fs.writeFileSync(
    profilePath,
    `${JSON.stringify({
      profiles: [{
        profile_id: 'analysis',
        runtime_binaries: [],
        language_packages: {
          r: [{
            name: 'ComplexHeatmap',
            required: true,
            source: { type: 'bioconductor' },
          }],
        },
      }],
    }, null, 2)}\n`,
  );

  const readback = buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    artifactRoot: path.join(tempRoot, 'artifacts'),
  }) as Json;

  assert.deepEqual((readback.prepare as Json).r_package_requirements, [{
    name: 'ComplexHeatmap',
    install_source: 'bioconductor',
  }]);
});

test('runtime env installs Bioconductor packages into the managed R library', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-bioc-install-'));
  const rscriptPath = path.join(tempRoot, 'Rscript');
  const commandLog = path.join(tempRoot, 'install-expression.txt');
  const libraryPath = path.join(tempRoot, 'library');
  fs.writeFileSync(
    rscriptPath,
    `#!/bin/sh\ncase "$2" in\n  *installed.packages*) printf 'ComplexHeatmap\\n' ;;\n  *) printf '%s\\n' "$2" > ${JSON.stringify(commandLog)} ;;\nesac\n`,
    { mode: 0o755 },
  );

  const receipt = installRPackagesIntoManagedLibrary(
    rscriptPath,
    libraryPath,
    [{ name: 'ComplexHeatmap', install_source: 'bioconductor' }],
    ['ComplexHeatmap'],
  );

  assert.equal(receipt.status, 'installed');
  assert.deepEqual(receipt.failed, []);
  const expression = fs.readFileSync(commandLog, 'utf8');
  assert.match(expression, /install\.packages\("BiocManager"/);
  assert.match(expression, /BiocManager::install\(c\("ComplexHeatmap"\)/);
  assert.equal(expression.includes('repos = "https://cloud.r-project.org"'), true);
  assert.equal(expression.includes(`lib = ${JSON.stringify(libraryPath)}`), true);
});
