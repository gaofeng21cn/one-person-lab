#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const parsed = {
    manifest: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--manifest') {
      parsed.manifest = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!parsed.manifest) {
    throw new Error('Usage: package-release-discipline.mjs --manifest <opl-release-manifest.json>');
  }

  return parsed;
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isGitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function validateModule(moduleId, entry, failures) {
  assertCondition(entry.current_install_update_source === 'package_channel', `${moduleId}: current source must be package_channel for stable package-channel installs`, failures);
  assertCondition(entry.package_consumption_status === 'consumed_by_package_channel_installs', `${moduleId}: package consumption status drifted`, failures);
  assertCondition(entry.package_channel_status === 'active_release_channel', `${moduleId}: module package channel must be active`, failures);
  assertCondition(entry.package_lifecycle_status === 'active_release_channel', `${moduleId}: module package lifecycle must be active`, failures);
  assertCondition(typeof entry.package_lifecycle_reason === 'string' && entry.package_lifecycle_reason.includes('GHCR channel manifest'), `${moduleId}: module package lifecycle reason must point to GHCR channel manifest`, failures);
  assertCondition(entry.remote_publish_status === 'published_to_ghcr_by_packages_workflow', `${moduleId}: remote publish status must claim workflow GHCR publication`, failures);
  assertCondition(entry.developer_git_checkout_override?.repo_url, `${moduleId}: missing developer git checkout override`, failures);
  assertCondition(entry.release_discipline?.package_channel_status === 'active_release_channel', `${moduleId}: release discipline must mark package channel active`, failures);
  assertCondition(entry.release_discipline?.package_lifecycle_status === 'active_release_channel', `${moduleId}: release discipline must mark package lifecycle active`, failures);
  assertCondition(entry.release_discipline?.workflow_trigger_policy === 'workflow_dispatch_only', `${moduleId}: release discipline must require manual workflow dispatch`, failures);
  assertCondition(entry.release_discipline?.current_latest_source === 'opl_release_channel_manifest', `${moduleId}: missing current package-channel source discipline`, failures);
  assertCondition(entry.release_discipline?.developer_override_source === 'git_checkout', `${moduleId}: missing developer override source discipline`, failures);
  assertCondition(Array.isArray(entry.release_discipline?.required_gates), `${moduleId}: missing required release gates`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('sha256_recorded'), `${moduleId}: release gates must require sha256`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('channel_manifest_written'), `${moduleId}: release gates must require channel manifest`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('ghcr_module_artifact_published'), `${moduleId}: release gates must publish module artifact to GHCR`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('release_manifest_published'), `${moduleId}: release gates must publish release manifest`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('developer_git_checkout_override_declared'), `${moduleId}: release gates must declare developer git checkout override`, failures);

  if (entry.source_archive) {
    assertCondition(typeof entry.source_archive.file_name === 'string', `${moduleId}: source archive missing file name`, failures);
    assertCondition(Number.isFinite(entry.source_archive.size) && entry.source_archive.size > 0, `${moduleId}: source archive size is invalid`, failures);
    assertCondition(isSha256(entry.source_archive.sha256), `${moduleId}: source archive sha256 is invalid`, failures);
  }

  if (entry.checksum) {
    assertCondition(entry.checksum.algorithm === 'sha256', `${moduleId}: checksum algorithm must be sha256`, failures);
    assertCondition(isSha256(entry.checksum.value), `${moduleId}: checksum value is invalid`, failures);
    assertCondition(entry.checksum.file === 'SHA256SUMS', `${moduleId}: checksum must be recorded in SHA256SUMS`, failures);
  }

  if (entry.source_git) {
    assertCondition(isGitSha(entry.source_git.head_sha), `${moduleId}: source git head sha is invalid`, failures);
    assertCondition(typeof entry.source_git.repo_url === 'string' && entry.source_git.repo_url.length > 0, `${moduleId}: source git repo url missing`, failures);
  }
}

function validateManifest(manifest) {
  const failures = [];
  const automation = manifest.release_automation;

  assertCondition(manifest.module_install_update_source === 'package_channel', 'module install/update source must be package_channel', failures);
  assertCondition(manifest.package_consumption_status === 'stable_app_release_consumes_package_channel', 'package consumption status drifted', failures);
  assertCondition(manifest.developer_module_source_override?.env === 'OPL_MODULE_SOURCE_MODE=git_checkout', 'developer git checkout override must be explicit', failures);
  assertCondition(automation?.status === 'active_stable_package_channel', 'release automation must be active stable package channel', failures);
  assertCondition(automation?.package_lifecycle_status === 'active_release_channel', 'release automation must record active release channel lifecycle', failures);
  assertCondition(automation?.workflow_trigger_policy === 'workflow_dispatch_only', 'package workflow must remain manual dispatch only', failures);
  assertCondition(automation?.remote_publish_status === 'workflow_dispatch_publishes_ghcr_packages', 'package workflow must publish GHCR packages from manual dispatch', failures);
  assertCondition(automation?.release_manifest_publication_status === 'active_ghcr_channel_manifest', 'release manifest must be an active GHCR channel', failures);
  assertCondition(automation?.release_manifest_package?.package_channel_status === 'active_release_channel', 'release manifest package must be active', failures);
  assertCondition(automation?.release_manifest_package?.publication_status === 'published_to_ghcr_by_packages_workflow', 'release manifest package must claim GHCR publication', failures);
  assertCondition(automation?.release_manifest_package?.current_install_update_source === 'opl_release_channel_manifest', 'release manifest current source must be package channel', failures);
  assertCondition(automation?.channel_manifest?.manifest_kind === 'opl_release_channel_manifest.v1', 'missing channel manifest automation contract', failures);
  assertCondition(typeof automation?.channel_manifest?.ghcr_ref === 'string' && automation.channel_manifest.ghcr_ref.includes('one-person-lab-manifest'), 'missing channel manifest GHCR ref', failures);
  assertCondition(automation?.channel_manifest?.moving_tags?.includes('stable'), 'channel manifest must declare stable moving tag', failures);
  assertCondition(automation?.channel_manifest?.outputs?.channel_manifest === 'opl-channel-manifest.json', 'missing channel manifest output', failures);
  assertCondition(automation?.channel_manifest?.outputs?.checksums === 'SHA256SUMS', 'missing checksum output', failures);
  assertCondition(automation?.artifact_build?.workflow === '.github/workflows/packages.yml', 'missing artifact build workflow contract', failures);
  assertCondition(automation?.artifact_build?.publication_mode === 'ghcr_package_channel_and_workflow_artifact', 'artifact build must publish GHCR package channel and workflow artifact', failures);
  assertCondition(automation?.checksum?.required_before_publish === true, 'checksum must be required before publish', failures);
  assertCondition(automation?.checksum?.required_before_prepared_artifact === true, 'checksum must be required before prepared artifact', failures);
  assertCondition(automation?.rollback?.strategy === 'previous_channel_manifest_target', 'rollback strategy must use previous channel manifest target', failures);
  assertCondition(automation?.cleanup?.strategy === 'retain_latest_n_versions_and_declared_rollbacks', 'cleanup strategy must retain latest versions and rollbacks', failures);
  assertCondition(Number.isFinite(automation?.cleanup?.retain_versions) && automation.cleanup.retain_versions >= 2, 'cleanup retain_versions must be >= 2', failures);
  assertCondition(automation?.cleanup?.protected_tags?.includes('latest'), 'cleanup must protect moving latest tag', failures);
  assertCondition(automation?.cleanup?.execution_mode === 'dry_run_first_explicit_execute_required', 'cleanup must be dry-run first with explicit execute', failures);
  assertCondition(automation?.cleanup?.destructive_action_requires === 'package_admin_with_delete_packages_scope', 'cleanup destructive action requirements drifted', failures);

  const modules = manifest.packages?.modules ?? {};
  for (const [moduleId, entry] of Object.entries(modules)) {
    validateModule(moduleId, entry, failures);
  }

  const webui = manifest.packages?.webui_docker_image;
  assertCondition(webui?.package_publish_owner === 'one-person-lab-app', 'WebUI package publish owner must remain one-person-lab-app', failures);
  assertCondition(webui?.framework_role === 'external_app_owned_package_reference', 'Framework WebUI role must remain external App-owned reference', failures);
  assertCondition(webui?.framework_workflow_publish_status === 'not_published_by_framework_packages_workflow', 'Framework package workflow must not publish WebUI', failures);

  const nativeHelper = manifest.packages?.native_helper;
  assertCondition(nativeHelper?.channel_status === 'active_ghcr_oci_prebuild', 'native helper must remain active GHCR OCI prebuild', failures);
  assertCondition(nativeHelper?.package_publish_owner === 'one-person-lab_framework_native_helper_prebuilds', 'native helper publish owner drifted', failures);
  assertCondition(nativeHelper?.publish_status_policy?.publication_mode === 'active_ghcr_oci_prebuild', 'native helper publish status policy drifted', failures);
  assertCondition(nativeHelper?.publish_status_policy?.workflow === '.github/workflows/native-helper-prebuilds.yml', 'native helper workflow policy drifted', failures);
  assertCondition(nativeHelper?.retention_policy?.strategy === 'retain_latest_n_versions_and_declared_rollbacks', 'native helper retention strategy drifted', failures);
  assertCondition(Number.isFinite(nativeHelper?.retention_policy?.retain_versions) && nativeHelper.retention_policy.retain_versions >= 2, 'native helper retain_versions must be >= 2', failures);
  assertCondition(nativeHelper?.retention_policy?.protected_tags?.includes('latest'), 'native helper retention must protect moving latest tag', failures);
  assertCondition(nativeHelper?.retention_policy?.execution_mode === 'dry_run_first_explicit_execute_required', 'native helper cleanup must be dry-run first', failures);
  assertCondition(Array.isArray(nativeHelper?.required_gates), 'native helper required gates missing', failures);
  assertCondition(nativeHelper?.required_gates?.includes('retention_policy_recorded'), 'native helper required gates must record retention policy', failures);
  assertCondition(nativeHelper?.required_gates?.includes('ghcr_oci_archive_pushed'), 'native helper required gates must include GHCR OCI push', failures);

  return failures;
}

function validateWorkflow(manifest, failures) {
  const workflow = manifest.release_automation?.artifact_build?.workflow;
  if (typeof workflow !== 'string' || workflow.length === 0) {
    failures.push('package workflow path missing from manifest release automation');
    return;
  }

  const workflowPath = path.resolve(process.cwd(), workflow);
  if (!fs.existsSync(workflowPath)) {
    failures.push(`package workflow file missing: ${workflow}`);
    return;
  }

  const source = fs.readFileSync(workflowPath, 'utf8');
  assertCondition(/workflow_dispatch:/.test(source), 'package workflow must keep manual workflow_dispatch trigger', failures);
  assertCondition(!/\n\s*push:\n/.test(source), 'package workflow must not restore tag-push publishing', failures);
  assertCondition(/oras\s+push/.test(source), 'package workflow must push module archives and release manifest to GHCR', failures);
  assertCondition(/one-person-lab-modules/.test(source), 'package workflow must publish module packages', failures);
  assertCondition(/one-person-lab-manifest/.test(source), 'package workflow must publish release manifest package', failures);
  assertCondition(!/docker\/build-push-action/.test(source), 'package workflow must not publish WebUI image from Framework repo', failures);
  assertCondition(!/webui-image:/.test(source), 'package workflow must not restore Framework-owned WebUI image job', failures);
  assertCondition(!/one-person-lab-webui/.test(source), 'package workflow must not publish one-person-lab-webui', failures);
  assertCondition(/one-person-lab-manifest:\$\{OPL_RELEASE_VERSION\}/.test(source), 'package workflow must publish versioned release manifest GHCR channel', failures);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  const failures = validateManifest(manifest);
  validateWorkflow(manifest, failures);
  if (failures.length > 0) {
    console.error(JSON.stringify({
      status: 'failed',
      manifest: options.manifest,
      failures,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: 'passed',
    manifest: options.manifest,
    modules: Object.keys(manifest.packages?.modules ?? {}),
    release_automation: manifest.release_automation,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
