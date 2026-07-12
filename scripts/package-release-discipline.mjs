#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile } from './script-json-boundary.mjs';

import { parseRequiredValueOptions } from './required-value-options.mjs';

function parseCliOptions(argv) {
  const parsed = {
    manifest: null,
  };

  parseRequiredValueOptions(argv, {
    '--manifest': (value) => {
      parsed.manifest = path.resolve(value);
    },
  });

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

const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'release_gate_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'release_gate_or_manual_dispatch_publishes_ghcr_packages';
const PACKAGE_WORKFLOW_PATH = '.github/workflows/packages.yml';
const PACKAGE_RELEASE_CALLER_WORKFLOW_PATH = '.github/workflows/release-package-channel.yml';
const PACKAGE_DAILY_WORKFLOW_PATH = '.github/workflows/daily-package-channel.yml';

function validatePackageArtifact(moduleId, entry, failures) {
  assertCondition(entry.current_install_update_source === 'package_channel', `${moduleId}: current source must be package_channel for managed GHCR capability packages`, failures);
  assertCondition(entry.package_consumption_status === 'consumed_by_package_channel_installs', `${moduleId}: package consumption status drifted`, failures);
  assertCondition(entry.package_channel_status === 'active_release_channel', `${moduleId}: module package channel must be active`, failures);
  assertCondition(entry.package_lifecycle_status === 'active_release_channel', `${moduleId}: module package lifecycle must be active`, failures);
  assertCondition(typeof entry.package_lifecycle_reason === 'string' && entry.package_lifecycle_reason.includes('GHCR capability packages channel'), `${moduleId}: module package lifecycle reason must point to the GHCR capability packages channel`, failures);
  assertCondition(entry.remote_publish_status === 'published_to_ghcr_by_packages_workflow', `${moduleId}: remote publish status must claim workflow GHCR publication`, failures);
  assertCondition(typeof entry.artifact === 'string' && entry.artifact.includes(`one-person-lab-packages/${entry.package_id}:`), `${moduleId}: artifact must use canonical GHCR package namespace`, failures);
  assertCondition(entry.developer_git_checkout_override?.repo_url, `${moduleId}: missing developer git checkout override`, failures);
  assertCondition(entry.release_discipline?.package_channel_status === 'active_release_channel', `${moduleId}: release discipline must mark package channel active`, failures);
  assertCondition(entry.release_discipline?.package_lifecycle_status === 'active_release_channel', `${moduleId}: release discipline must mark package lifecycle active`, failures);
  assertCondition(entry.release_discipline?.workflow_trigger_policy === PACKAGE_WORKFLOW_TRIGGER_POLICY, `${moduleId}: release discipline must require release-gated workflow_call or manual dispatch`, failures);
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

function validateFrameworkCore(entry, failures) {
  assertCondition(entry?.package_channel_status === 'active_release_channel', 'framework_core: package channel must be active', failures);
  assertCondition(entry?.package_lifecycle_status === 'active_release_channel', 'framework_core: lifecycle must be active', failures);
  assertCondition(entry?.remote_publish_status === 'published_to_ghcr_by_packages_workflow', 'framework_core: GHCR publication status drifted', failures);
  assertCondition(entry?.package_consumption_status === 'consumed_by_runtime_substrate_updates', 'framework_core: must be consumed by runtime_substrate updates', failures);
  assertCondition(entry?.current_install_update_source === 'opl_release_channel_manifest', 'framework_core: current source must be the channel manifest', failures);
  assertCondition(typeof entry?.artifact === 'string' && entry.artifact.includes('one-person-lab-framework'), 'framework_core: artifact must point to one-person-lab-framework', failures);
  assertCondition(entry?.release_discipline?.required_gates?.includes('ghcr_framework_artifact_published'), 'framework_core: release gates must publish framework artifact', failures);
  assertCondition(entry?.release_discipline?.required_gates?.includes('runtime_substrate_apply_and_rollback_tested'), 'framework_core: release gates must require runtime_substrate apply/rollback test', failures); // reuse-first: allow contract verifier, not update execution.
  assertCondition(entry?.developer_git_checkout_override?.env === 'OPL_FRAMEWORK_UPDATE_SOURCE', 'framework_core: developer override must use existing framework self-update source env', failures);
  assertCondition(typeof entry?.source_archive?.file_name === 'string', 'framework_core: source archive missing file name', failures);
  assertCondition(Number.isFinite(entry?.source_archive?.size) && entry.source_archive.size > 0, 'framework_core: source archive size is invalid', failures);
  assertCondition(isSha256(entry?.source_archive?.sha256), 'framework_core: source archive sha256 is invalid', failures);
  assertCondition(entry?.checksum?.algorithm === 'sha256', 'framework_core: checksum algorithm must be sha256', failures);
  assertCondition(isSha256(entry?.checksum?.value), 'framework_core: checksum value is invalid', failures);
  assertCondition(isGitSha(entry?.source_git?.head_sha), 'framework_core: source git head sha is invalid', failures);
  assertCondition(entry?.homebrew_formula?.surface_kind === 'opl_homebrew_formula_projection.v1', 'framework_core: Homebrew projection surface kind is invalid', failures);
  assertCondition(entry?.homebrew_formula?.formula_name === 'opl', 'framework_core: Homebrew Formula name must be opl', failures);
  assertCondition(entry?.homebrew_formula?.package_name === 'opl', 'framework_core: Homebrew package name must be opl', failures);
  assertCondition(entry?.homebrew_formula?.approval_status === 'owner_approved', 'framework_core: Homebrew projection must be owner approved', failures);
  assertCondition(entry?.homebrew_formula?.carrier_scope === 'framework_core_only', 'framework_core: Homebrew projection must be Base-only', failures);
  assertCondition(entry?.homebrew_formula?.version === entry?.version, 'framework_core: Homebrew projection version must come from framework core version', failures);
  assertCondition(entry?.homebrew_formula?.source_head === entry?.source_git?.head_sha, 'framework_core: Homebrew projection source head must come from source_git', failures);
  assertCondition(entry?.homebrew_formula?.archive_url === `https://github.com/gaofeng21cn/one-person-lab/archive/${entry?.source_git?.head_sha}.tar.gz`, 'framework_core: Homebrew projection archive URL must be the immutable GitHub commit archive', failures);
  assertCondition(entry?.homebrew_formula?.archive_kind === 'immutable_github_commit_archive', 'framework_core: Homebrew projection archive kind is invalid', failures);
  assertCondition(entry?.homebrew_formula?.sha256_source === 'tap_sync_download_and_hash', 'framework_core: Homebrew projection sha256 ownership must stay with tap sync', failures);
  assertCondition(entry?.homebrew_formula?.tap_generator_role === 'consume_projection_without_inference', 'framework_core: Homebrew tap generator role is invalid', failures);
}

function validateManifest(manifest) {
  const failures = [];
  const automation = manifest.release_automation;

  assertCondition(manifest.module_install_update_source === 'package_channel', 'module install/update source must be package_channel', failures);
  assertCondition(manifest.package_consumption_status === 'ordinary_app_users_consume_managed_ghcr_capability_packages', 'package consumption status drifted', failures);
  assertCondition(manifest.developer_module_source_override?.env === 'OPL_MODULE_SOURCE_MODE=git_checkout', 'developer git checkout override must be explicit', failures);
  assertCondition(manifest.developer_module_source_override?.scope === 'developer_mode_checkout', 'developer git checkout override must be represented as Developer Mode checkout scope', failures);
  assertCondition(manifest.developer_module_source_override?.app_setting_surface === 'Developer Mode', 'developer checkout override must point to Developer Mode App settings surface', failures);
  assertCondition(automation?.status === 'active_managed_ghcr_capability_packages', 'release automation must be active managed GHCR capability packages', failures);
  assertCondition(automation?.package_lifecycle_status === 'active_release_channel', 'release automation must record active release channel lifecycle', failures);
  assertCondition(automation?.workflow_trigger_policy === PACKAGE_WORKFLOW_TRIGGER_POLICY, 'package workflow must be release-gated via workflow_call while keeping manual dispatch repair', failures);
  assertCondition(automation?.remote_publish_status === PACKAGE_REMOTE_PUBLISH_STATUS, 'package workflow must publish GHCR packages from release gate or manual dispatch', failures);
  assertCondition(automation?.release_manifest_publication_status === 'active_ghcr_channel_manifest', 'release manifest must be an active GHCR channel', failures);
  assertCondition(automation?.release_manifest_package?.package_channel_status === 'active_release_channel', 'release manifest package must be active', failures);
  assertCondition(automation?.release_manifest_package?.publication_status === 'published_to_ghcr_by_packages_workflow', 'release manifest package must claim GHCR publication', failures);
  assertCondition(automation?.release_manifest_package?.current_install_update_source === 'opl_release_channel_manifest', 'release manifest current source must be package channel', failures);
  assertCondition(automation?.channel_manifest?.manifest_kind === 'opl_release_channel_manifest.v1', 'missing channel manifest automation contract', failures);
  assertCondition(typeof automation?.channel_manifest?.ghcr_ref === 'string' && automation.channel_manifest.ghcr_ref.includes('one-person-lab-manifest'), 'missing channel manifest GHCR ref', failures);
  assertCondition(JSON.stringify(automation?.channel_manifest?.moving_tags) === JSON.stringify(['candidate', 'latest-stable']), 'channel manifest moving tags must be candidate and latest-stable only', failures);
  assertCondition(automation?.channel_manifest?.outputs?.channel_manifest === 'opl-channel-manifest.json', 'missing channel manifest output', failures);
  assertCondition(automation?.channel_manifest?.outputs?.checksums === 'SHA256SUMS', 'missing checksum output', failures);
  assertCondition(automation?.artifact_build?.workflow === PACKAGE_WORKFLOW_PATH, 'missing artifact build workflow contract', failures);
  assertCondition(automation?.artifact_build?.publication_mode === 'ghcr_package_channel_and_workflow_artifact', 'artifact build must publish GHCR package channel and workflow artifact', failures);
  assertCondition(automation?.checksum?.required_before_publish === true, 'checksum must be required before publish', failures);
  assertCondition(automation?.checksum?.required_before_prepared_artifact === true, 'checksum must be required before prepared artifact', failures);
  assertCondition(automation?.rollback?.strategy === 'previous_channel_manifest_target', 'rollback strategy must use previous channel manifest target', failures); // reuse-first: allow package-channel contract verifier, not package manager logic.
  assertCondition(automation?.cleanup?.strategy === 'retain_latest_n_versions_and_declared_rollbacks', 'cleanup strategy must retain latest versions and rollbacks', failures);
  assertCondition(Number.isFinite(automation?.cleanup?.retain_versions) && automation.cleanup.retain_versions >= 2, 'cleanup retain_versions must be >= 2', failures);
  assertCondition(automation?.cleanup?.protected_tags?.includes('latest-stable'), 'cleanup must protect moving latest-stable tag', failures);
  assertCondition(automation?.cleanup?.execution_mode === 'dry_run_first_explicit_execute_required', 'cleanup must be dry-run first with explicit execute', failures);
  assertCondition(automation?.cleanup?.destructive_action_requires === 'package_admin_with_delete_packages_scope', 'cleanup destructive action requirements drifted', failures);
  assertCondition(automation?.daily_package_channel?.status === 'active_change_detected_daily_publish', 'daily package channel must be active and change-detected', failures);
  assertCondition(automation?.daily_package_channel?.workflow === PACKAGE_DAILY_WORKFLOW_PATH, 'daily package channel workflow path drifted', failures);
  assertCondition(automation?.daily_package_channel?.version_template === '<utc_yy.m.d>', 'daily package channel version template drifted', failures);
  assertCondition(automation?.daily_package_channel?.change_detector === 'scripts/package-channel-daily-check.mjs', 'daily package channel detector drifted', failures);
  assertCondition(automation?.daily_package_channel?.comparison === 'package_source_fingerprint', 'daily package channel comparison must use package source fingerprints', failures);
  assertCondition(automation?.daily_package_channel?.no_change_behavior === 'skip_without_publish', 'daily package channel must skip without publish when unchanged', failures);
  assertCondition(automation?.daily_package_channel?.publish_gate === 'daily_package_channel_changed', 'daily package channel publish gate drifted', failures);
  assertCondition(automation?.daily_package_channel?.manual_repair_trigger === 'workflow_dispatch', 'daily package channel manual repair trigger drifted', failures);
  assertCondition(automation?.daily_package_channel?.force_publish_input === 'force_publish', 'daily package channel force publish input drifted', failures);

  const packageArtifacts = manifest.packages?.package_artifacts ?? {};
  for (const packageEntry of Object.values(packageArtifacts)) {
    assertCondition(packageEntry?.homebrew_formula === undefined, 'Agent, capability, and workflow packages must not declare Homebrew Formulae', failures);
    assertCondition(packageEntry?.homebrew_cask === undefined, 'Agent, capability, and workflow packages must not declare Homebrew Casks', failures);
  }
  for (const [moduleId, entry] of Object.entries(packageArtifacts)) {
    validatePackageArtifact(moduleId, entry, failures);
  }
  assertCondition(Object.hasOwn(packageArtifacts, 'mas-scholar-skills'), 'package channel must include MAS Scholar Skills as a managed capability package', failures);
  assertCondition(packageArtifacts['mas-scholar-skills']?.repo_name === 'mas-scholar-skills', 'mas-scholar-skills package repo name drifted', failures);
  assertCondition(packageArtifacts['mas-scholar-skills']?.scope === 'framework_capability_package', 'mas-scholar-skills must remain a framework capability package, not a domain package', failures);
  assertCondition(packageArtifacts['mas-scholar-skills']?.current_install_update_source === 'package_channel', 'mas-scholar-skills must use package channel for ordinary installs and updates', failures);
  validateFrameworkCore(manifest.packages?.framework_core, failures);

  assertCondition(!Object.hasOwn(manifest.packages ?? {}, 'webui_docker_image'), 'Framework package manifest must not carry App-owned WebUI image coordinates', failures);

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

function validateWorkflow(manifest, manifestPath, failures) {
  const workflow = manifest.release_automation?.artifact_build?.workflow;
  if (typeof workflow !== 'string' || workflow.length === 0) {
    failures.push('package workflow path missing from manifest release automation');
    return;
  }

  const packageRoot = path.dirname(manifestPath);
  const workflowPath = path.resolve(packageRoot, workflow);
  if (!fs.existsSync(workflowPath)) {
    failures.push(`package workflow file missing: ${workflow}`);
    return;
  }

  const source = fs.readFileSync(workflowPath, 'utf8');
  const releaseCallerWorkflowPath = path.resolve(packageRoot, PACKAGE_RELEASE_CALLER_WORKFLOW_PATH);
  const dailyWorkflowPath = path.resolve(packageRoot, PACKAGE_DAILY_WORKFLOW_PATH);
  const releaseCallerSource = fs.existsSync(releaseCallerWorkflowPath)
    ? fs.readFileSync(releaseCallerWorkflowPath, 'utf8')
    : '';
  const dailyWorkflowSource = fs.existsSync(dailyWorkflowPath)
    ? fs.readFileSync(dailyWorkflowPath, 'utf8')
    : '';
  assertCondition(/workflow_dispatch:/.test(source), 'package workflow must keep manual workflow_dispatch trigger', failures);
  assertCondition(/workflow_call:/.test(source), 'package workflow must expose release-gated workflow_call trigger', failures);
  assertCondition(/release_gate:\s*\n\s*description: Release gate or workflow that authorized package publication/.test(source), 'package workflow_call must require a release_gate input', failures);
  assertCondition(releaseCallerSource.length > 0, 'package release caller workflow must exist', failures);
  assertCondition(/release:\s*\n\s*types:\s*\n\s*-\s*published/.test(releaseCallerSource), 'package release caller must publish from GitHub Release published events', failures);
  assertCondition(/uses:\s+\.\/\.github\/workflows\/packages\.yml/.test(releaseCallerSource), 'package release caller must invoke the reusable packages workflow', failures);
  assertCondition(/release_gate:\s*github_release_published/.test(releaseCallerSource), 'package release caller must record the GitHub Release gate', failures);
  assertCondition(/promotion_target:\s*latest-stable/.test(releaseCallerSource), 'GitHub Release must explicitly promote latest-stable', failures);
  assertCondition(!/\n\s*push:\n/.test(source), 'package workflow must not restore tag-push publishing', failures);
  assertCondition(/oras\s+push/.test(source), 'package workflow must push package archives and release manifest to GHCR', failures);
  assertCondition(/one-person-lab-packages/.test(source), 'package workflow must publish canonical packages', failures);
  assertCondition(!/one-person-lab-modules/.test(source), 'package workflow must not publish retired module packages', failures);
  assertCondition(/one-person-lab-framework/.test(source), 'package workflow must publish OPL Framework runtime artifact', failures);
  assertCondition(/one-person-lab-manifest/.test(source), 'package workflow must publish release manifest package', failures);
  assertCondition(!/docker\/build-push-action/.test(source), 'package workflow must not publish WebUI image from Framework repo', failures);
  assertCondition(!/webui-image:/.test(source), 'package workflow must not restore Framework-owned WebUI image job', failures);
  assertCondition(!/one-person-lab-webui/.test(source), 'package workflow must not publish one-person-lab-webui', failures);
  assertCondition(/one-person-lab-manifest:\$\{OPL_RELEASE_VERSION\}/.test(source), 'package workflow must publish versioned release manifest GHCR channel', failures);
  assertCondition(/Fetch previous package channel manifest/.test(source), 'package workflow must fetch the previous package channel before building', failures);
  assertCondition(/one-person-lab-manifest:latest-stable/.test(source), 'package workflow must read the latest-stable package channel for retained versions', failures);
  assertCondition(/OPL_PREVIOUS_PACKAGE_MANIFEST/.test(source), 'package workflow must expose the previous channel manifest to the archive builder', failures);
  assertCondition(/args\+=\(--previous-manifest "\$OPL_PREVIOUS_PACKAGE_MANIFEST"\)/.test(source), 'package workflow must pass the previous channel manifest into the archive builder', failures);
  assertCondition(
    source.indexOf('Fetch previous package channel manifest') < source.indexOf('Build package archives and release manifest'),
    'package workflow must fetch the previous channel before building',
    failures,
  );
  assertCondition(/oras push --format json/.test(source), 'package workflow must capture immutable package OCI digests', failures);
  assertCondition(/finalize-package-channel-digests\.mjs/.test(source), 'package workflow must finalize package OCI digests before channel publication', failures);
  assertCondition(/Resolve changed package publication plan/.test(source) && /OPL_CHANGED_PACKAGES_JSON/.test(source), 'package workflow must publish only the computed changed package plan', failures);
  assertCondition(/OPL_PACKAGE_RELEASE_GATE" = github_release_published/.test(source), 'Framework artifact publication must remain behind the Base release gate', failures);
  assertCondition(/OPL_PACKAGE_PROMOTION_TARGET/.test(source), 'package workflow must require an explicit promotion target', failures);
  assertCondition(/oras tag .* candidate/.test(source), 'package workflow must always publish candidate after verification', failures);
  assertCondition(/if \[ "\$OPL_PACKAGE_PROMOTION_TARGET" = latest-stable \]/.test(source), 'package workflow must gate latest-stable promotion', failures);
  assertCondition(dailyWorkflowSource.length > 0, 'daily package channel workflow must exist', failures);
  assertCondition(/schedule:\s*\n\s*-\s*cron:/.test(dailyWorkflowSource), 'daily package channel workflow must run on schedule', failures);
  assertCondition(/base="\$\(date -u \+'%y\.%-m\.%-d'\)"/.test(dailyWorkflowSource), 'daily package channel workflow must default to current UTC date package tag', failures);
  assertCondition(/version="\$\{base#v\}"/.test(dailyWorkflowSource), 'daily package channel workflow must use immutable version tags without channel suffixes', failures);
  assertCondition(!/-nightly/.test(dailyWorkflowSource), 'daily package channel workflow must not generate or describe nightly tags', failures);
  assertCondition(/workflow_dispatch:/.test(dailyWorkflowSource), 'daily package channel workflow must keep manual repair dispatch', failures);
  assertCondition(/force_publish:/.test(dailyWorkflowSource), 'daily package channel workflow must keep force_publish repair input', failures);
  assertCondition(/npm run packages:manifest/.test(dailyWorkflowSource), 'daily package channel workflow must build a candidate package manifest', failures);
  assertCondition(/npm run packages:daily-check/.test(dailyWorkflowSource), 'daily package channel workflow must run package daily change detection', failures);
  assertCondition(/one-person-lab-manifest:latest-stable/.test(dailyWorkflowSource), 'daily package channel workflow must compare against latest-stable channel manifest', failures);
  assertCondition(/test -n "\$current"/.test(dailyWorkflowSource), 'daily package channel workflow must fail closed when latest channel manifest is missing', failures);
  assertCondition(/--previous-manifest "\$\{\{ steps\.current\.outputs\.current_manifest \}\}"/.test(dailyWorkflowSource), 'daily package channel workflow must retain catalog versions from the current channel', failures);
  assertCondition(
    dailyWorkflowSource.indexOf('Fetch current latest package channel manifest') < dailyWorkflowSource.indexOf('Build candidate package archives and manifest'),
    'daily package channel workflow must fetch the current channel before building the candidate',
    failures,
  );
  assertCondition(/args\+=\(--current-manifest "\$\{\{ steps\.current\.outputs\.current_manifest \}\}"\)/.test(dailyWorkflowSource), 'daily package channel workflow must pass the current latest manifest into change detection', failures);
  assertCondition(/uses:\s+\.\/\.github\/workflows\/packages\.yml/.test(dailyWorkflowSource), 'daily package channel workflow must invoke reusable packages workflow', failures);
  assertCondition(/release_gate:\s*daily_package_channel_changed/.test(dailyWorkflowSource), 'daily package channel workflow must record daily package publish gate', failures);
  assertCondition(/publish_required == 'true'/.test(dailyWorkflowSource), 'daily package channel workflow must skip publish when unchanged', failures);
  assertCondition(!/publish_required="true"/.test(dailyWorkflowSource), 'daily package channel workflow must not publish unchanged packages', failures);
  assertCondition(/changed_packages_json/.test(dailyWorkflowSource), 'daily package channel workflow must pass only changed package ids', failures);
  assertCondition(/promotion_target:\s*candidate/.test(dailyWorkflowSource), 'daily package channel workflow must only promote candidate', failures);
  assertCondition(!/\n\s*push:\n/.test(dailyWorkflowSource), 'daily package channel workflow must not restore push-trigger publishing', failures);
  assertCondition(!/one-person-lab-webui/.test(dailyWorkflowSource), 'daily package channel workflow must not publish WebUI', failures);
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const manifest = readJsonFile(options.manifest);
  const failures = validateManifest(manifest);
  validateWorkflow(manifest, options.manifest, failures);
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
